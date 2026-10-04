import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./llm.js', async (importOriginal) => ({
  ...(await importOriginal()),
  callAgent: vi.fn()
}))

const { callAgent } = await import('./llm.js')
const { runAgent } = await import('./orchestrator.js')

const call = (name, args, id = name) => ({
  id, type: 'function', function: { name, arguments: JSON.stringify(args) }
})
const toolMsg = (...calls) => ({ content: '', tool_calls: calls })
const finalMsg = text => ({ content: text })

const FRIDGE = [{ id: 'a', name: '鸡蛋', quantity: 6, unit: '个' }]

beforeEach(() => callAgent.mockReset())

describe('runAgent pendingActions', () => {
  it('collects a write proposal and returns it with the final reply', async () => {
    callAgent
      .mockResolvedValueOnce(toolMsg(call('meal_add_fridge_item', { items: [{ name: '鸡胸肉', quantity: 500, unit: 'g' }] })))
      .mockResolvedValueOnce(finalMsg('我准备好了，请确认'))
    const r = await runAgent('我买了鸡胸肉', { fridge: FRIDGE })
    expect(r.source).toBe('llm')
    expect(r.data.pendingActions).toHaveLength(1)
    expect(r.data.pendingActions[0]).toMatchObject({ type: 'addFridgeItems' })
    expect(r.data.trace).toEqual(['meal_add_fridge_item'])
  })

  it('keeps every action when one step issues several write calls', async () => {
    callAgent
      .mockResolvedValueOnce(toolMsg(
        call('meal_add_meal_log', { items: [{ name: '海南鸡饭' }] }, 't1'),
        call('meal_remove_fridge_item', { name: '鸡蛋' }, 't2')
      ))
      .mockResolvedValueOnce(finalMsg('请确认'))
    const r = await runAgent('记一下海南鸡饭，并删掉鸡蛋', { fridge: FRIDGE })
    expect(r.data.pendingActions.map(a => a.type)).toEqual(['addMealLog', 'removeFridgeItem'])
  })

  it('does not leak the write result into the response body (lastData untouched)', async () => {
    callAgent
      .mockResolvedValueOnce(toolMsg(call('meal_add_meal_log', { items: [{ name: '面' }] })))
      .mockResolvedValueOnce(finalMsg('请确认'))
    const r = await runAgent('记一下面', {})
    expect(r.data.status).toBeUndefined()
    expect(r.data.reply).toBe('请确认')
  })

  it('tells the model the action is pending and does not send it the payload', async () => {
    callAgent
      .mockResolvedValueOnce(toolMsg(call('meal_add_meal_log', { items: [{ name: '面' }] })))
      .mockResolvedValueOnce(finalMsg('请确认'))
    await runAgent('记一下面', {})
    const secondCallMessages = callAgent.mock.calls[1][0]
    const toolResult = JSON.parse(secondCallMessages.find(m => m.role === 'tool').content)
    expect(toolResult.data.status).toBe('pending_confirmation')
    expect(toolResult.pending).toBeUndefined()
  })

  it('still returns collected actions when the step limit is exhausted', async () => {
    callAgent.mockResolvedValue(toolMsg(call('meal_add_meal_log', { items: [{ name: '面' }] })))
    const r = await runAgent('记一下面', {})
    expect(r.data.reply).toContain('最大处理步数')
    expect(r.data.pendingActions.length).toBeGreaterThan(0)
  })

  it('still returns collected actions when the LLM fails mid-way', async () => {
    callAgent
      .mockResolvedValueOnce(toolMsg(call('meal_add_meal_log', { items: [{ name: '面' }] })))
      .mockRejectedValueOnce(new Error('boom'))
    const r = await runAgent('记一下面', {})
    expect(r.source).toBe('mock')
    expect(r.data.pendingActions).toHaveLength(1)
  })

  it('omits pendingActions entirely when no write tool was used', async () => {
    callAgent
      .mockResolvedValueOnce(toolMsg(call('meal_expiring_foods', {})))
      .mockResolvedValueOnce(finalMsg('鸡蛋还行'))
    const r = await runAgent('什么快过期', { fridge: FRIDGE })
    expect(r.data.pendingActions).toBeUndefined()
    expect(r.data.count).toBe(0)
  })

  it('does not create an action when the write tool rejects bad input', async () => {
    callAgent
      .mockResolvedValueOnce(toolMsg(call('meal_remove_fridge_item', { name: '榴莲' })))
      .mockResolvedValueOnce(finalMsg('冰箱里没有榴莲'))
    const r = await runAgent('删掉榴莲', { fridge: FRIDGE })
    expect(r.data.pendingActions).toBeUndefined()
  })
})
