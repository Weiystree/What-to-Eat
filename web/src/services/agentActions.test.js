import { describe, it, expect, vi } from 'vitest'
import { commitAction, describeAction } from './agentActions.js'

// 注入假的 store，不碰 localStorage；每个用例用独立的 ledger
function makeDeps(over = {}) {
  const fridge = [
    { id: 'a', name: '鸡蛋', quantity: 6 },
    { id: 'b', name: '西兰花', quantity: 1 }
  ]
  return {
    ledger: new Set(),
    getProfile: () => ({}),
    getFridgeInventory: vi.fn(() => fridge),
    addFridgeItem: vi.fn(),
    removeFridgeItem: vi.fn(),
    appendDiary: vi.fn(),
    mergeFoodEstimates: vi.fn((items, est) => items.map((it, i) => ({ ...it, category: est[i].category, calories: est[i].calories }))),
    estimateMeal: vi.fn(async () => ({ ok: true, data: { items: [{ name: '海南鸡饭', category: 'staple', calories: 600 }] } })),
    guessMeal: () => '晚餐',
    ...over
  }
}

const mealAction = { id: 'm1', type: 'addMealLog', meal: '午餐', items: [{ name: '海南鸡饭', portion: '一份' }] }

describe('commitAction addMealLog', () => {
  it('writes the diary with estimated category and calories', async () => {
    const d = makeDeps()
    const r = await commitAction(mealAction, {}, d)
    expect(r.ok).toBe(true)
    const entry = d.appendDiary.mock.calls[0][0]
    expect(entry).toMatchObject({ meal: '午餐', confirmed: true, awaitingFeedback: false, source: 'Agent' })
    expect(entry.items[0]).toMatchObject({ name: '海南鸡饭', category: 'staple', calories: 600 })
  })

  it('falls back to guessMeal when the action has no meal slot', async () => {
    const d = makeDeps()
    await commitAction({ ...mealAction, meal: null }, {}, d)
    expect(d.appendDiary.mock.calls[0][0].meal).toBe('晚餐')
  })

  it('still writes with category other when the estimate throws', async () => {
    const d = makeDeps({ estimateMeal: vi.fn(async () => { throw new Error('network') }) })
    const r = await commitAction(mealAction, {}, d)
    expect(r.ok).toBe(true)
    expect(d.appendDiary.mock.calls[0][0].items[0].category).toBe('other')
  })

  it('still writes when the estimate returns nothing usable', async () => {
    const d = makeDeps({ estimateMeal: vi.fn(async () => ({ ok: false })) })
    expect((await commitAction(mealAction, {}, d)).ok).toBe(true)
    expect(d.mergeFoodEstimates).not.toHaveBeenCalled()
  })
})

describe('commitAction addFridgeItems', () => {
  it('adds every item', async () => {
    const d = makeDeps()
    const action = { id: 'f1', type: 'addFridgeItems', items: [{ name: '鸡胸肉' }, { name: '番茄' }] }
    const r = await commitAction(action, {}, d)
    expect(r.ok).toBe(true)
    expect(d.addFridgeItem).toHaveBeenCalledTimes(2)
  })
})

describe('commitAction removeFridgeItem', () => {
  const one = { id: 'r1', type: 'removeFridgeItem', query: '西兰花', candidates: [{ id: 'b', name: '西兰花' }] }
  const many = {
    id: 'r2', type: 'removeFridgeItem', query: '鸡蛋',
    candidates: [{ id: 'a', name: '鸡蛋' }, { id: 'x', name: '鸡蛋' }]
  }

  it('removes the sole candidate without needing a selection', async () => {
    const d = makeDeps()
    const r = await commitAction(one, {}, d)
    expect(r.ok).toBe(true)
    expect(d.removeFridgeItem).toHaveBeenCalledWith('b')
  })

  it('requires the user to pick when there are several candidates', async () => {
    const d = makeDeps()
    const r = await commitAction(many, {}, d)
    expect(r.ok).toBe(false)
    expect(d.removeFridgeItem).not.toHaveBeenCalled()
  })

  it('removes the chosen candidate', async () => {
    const d = makeDeps()
    expect((await commitAction(many, { selectedId: 'a' }, d)).ok).toBe(true)
    expect(d.removeFridgeItem).toHaveBeenCalledWith('a')
  })

  it('refuses when the item no longer exists in the fridge', async () => {
    const d = makeDeps({ getFridgeInventory: () => [] })
    const r = await commitAction(one, {}, d)
    expect(r.ok).toBe(false)
    expect(d.removeFridgeItem).not.toHaveBeenCalled()
  })

  it('refuses when the id was reused by a different food', async () => {
    const d = makeDeps({ getFridgeInventory: () => [{ id: 'b', name: '牛奶' }] })
    expect((await commitAction(one, {}, d)).ok).toBe(false)
    expect(d.removeFridgeItem).not.toHaveBeenCalled()
  })

  it('refuses a selection that is not among the candidates', async () => {
    const d = makeDeps()
    expect((await commitAction(many, { selectedId: 'b' }, d)).ok).toBe(false)
  })
})

describe('commitAction safety', () => {
  it('is idempotent: a second commit of the same action writes nothing', async () => {
    const d = makeDeps()
    await commitAction(mealAction, {}, d)
    const second = await commitAction(mealAction, {}, d)
    expect(second.ok).toBe(false)
    expect(d.appendDiary).toHaveBeenCalledTimes(1)
  })

  it('does not burn the id on failure, so the user can retry', async () => {
    const d = makeDeps()
    const many = { id: 'r3', type: 'removeFridgeItem', candidates: [{ id: 'a', name: '鸡蛋' }, { id: 'x', name: '鸡蛋' }] }
    expect((await commitAction(many, {}, d)).ok).toBe(false)
    expect((await commitAction(many, { selectedId: 'a' }, d)).ok).toBe(true)
  })

  it('rejects malformed actions and unknown types', async () => {
    const d = makeDeps()
    expect((await commitAction(null, {}, d)).ok).toBe(false)
    expect((await commitAction({ type: 'addMealLog' }, {}, d)).ok).toBe(false)
    expect((await commitAction({ id: 'z', type: 'nuke' }, {}, d)).ok).toBe(false)
  })

  it('reports a store exception as a retryable failure', async () => {
    const d = makeDeps({ addFridgeItem: vi.fn(() => { throw new Error('quota') }) })
    const r = await commitAction({ id: 'f9', type: 'addFridgeItems', items: [{ name: '番茄' }] }, {}, d)
    expect(r.ok).toBe(false)
    expect(d.ledger.has('f9')).toBe(false)
  })
})

describe('describeAction', () => {
  it('gives each action type a card title', () => {
    expect(describeAction(mealAction)).toBe('记录午餐')
    expect(describeAction({ type: 'addMealLog', meal: null })).toBe('记录这一餐')
    expect(describeAction({ type: 'addFridgeItems' })).toBe('加入冰箱')
    expect(describeAction({ type: 'removeFridgeItem' })).toBe('从冰箱删除')
  })
})
