import { describe, it, expect } from 'vitest'
import {
  buildAddMealLog, buildAddFridgeItems, buildRemoveFridgeItem, resolveFridgeCandidates
} from './agentActions.js'

const FRIDGE = [
  { id: 'a', name: '鸡蛋', quantity: 6, unit: '个' },
  { id: 'b', name: '鸡蛋面', quantity: 1, unit: '包' },
  { id: 'c', name: '西兰花', quantity: 1, unit: '颗' },
  { id: 'd', name: '鸡蛋', quantity: 2, unit: '个' }
]

describe('buildAddMealLog', () => {
  it('builds a pending action and never claims it was executed', async () => {
    const r = await buildAddMealLog({ meal: '午餐', items: [{ name: ' 海南鸡饭 ', portion: '一份' }] })
    expect(r.pending).toMatchObject({ type: 'addMealLog', meal: '午餐', items: [{ name: '海南鸡饭', portion: '一份' }] })
    expect(r.data.status).toBe('pending_confirmation')
    expect(r.pending.id).toMatch(/^act_/)
  })

  it('leaves meal null when the model gives an invalid slot', async () => {
    const r = await buildAddMealLog({ meal: '下午茶', items: [{ name: '蛋糕' }] })
    expect(r.pending.meal).toBeNull()
    expect(r.pending.items[0].portion).toBe('一份')
  })

  it('rejects when no item has a name', async () => {
    for (const args of [undefined, {}, { items: [] }, { items: [{ name: '  ' }, null] }]) {
      const r = await buildAddMealLog(args)
      expect(r.pending).toBeUndefined()
      expect(r.data.status).toBe('rejected')
    }
  })

  it('caps the number of items', async () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ name: '菜' + i }))
    expect((await buildAddMealLog({ items })).pending.items).toHaveLength(20)
  })

  it('gives every pending action a unique id', async () => {
    const a = await buildAddMealLog({ items: [{ name: '饭' }] })
    const b = await buildAddMealLog({ items: [{ name: '饭' }] })
    expect(a.pending.id).not.toBe(b.pending.id)
  })
})

describe('buildAddFridgeItems', () => {
  it('normalizes quantity, zone and category', async () => {
    const r = await buildAddFridgeItems({
      items: [
        { name: '鸡胸肉', quantity: 500, unit: 'g', storageZone: 'zero_zone', category: 'meat' },
        { name: '番茄', quantity: 'three', storageZone: 'attic', category: 'fruit-ish' },
        { name: '牛奶', quantity: -2 }
      ]
    })
    const [a, b, c] = r.pending.items
    expect(a).toEqual({ name: '鸡胸肉', quantity: 500, unit: 'g', storageZone: 'zero_zone', category: 'meat' })
    expect(b).toMatchObject({ quantity: 1, unit: '份', storageZone: 'fridge', category: 'other' })
    expect(c.quantity).toBe(1)
  })

  it('rejects when nothing usable is given', async () => {
    expect((await buildAddFridgeItems({ items: [{ quantity: 2 }] })).data.status).toBe('rejected')
    expect((await buildAddFridgeItems(null)).data.status).toBe('rejected')
  })
})

describe('resolveFridgeCandidates', () => {
  it('prefers exact matches over substring matches', () => {
    expect(resolveFridgeCandidates('鸡蛋', FRIDGE).map(c => c.id)).toEqual(['a', 'd'])
  })

  it('falls back to substring matching when there is no exact match', () => {
    expect(resolveFridgeCandidates('西兰', FRIDGE).map(c => c.id)).toEqual(['c'])
  })

  it('returns nothing for blank queries or a bad fridge', () => {
    expect(resolveFridgeCandidates('', FRIDGE)).toEqual([])
    expect(resolveFridgeCandidates('鸡蛋', undefined)).toEqual([])
    expect(resolveFridgeCandidates('鸡蛋', [null, { name: '鸡蛋' }])).toEqual([])
  })
})

describe('buildRemoveFridgeItem', () => {
  it('returns a single candidate when the match is unique', async () => {
    const r = await buildRemoveFridgeItem({ name: '西兰花' }, FRIDGE)
    expect(r.pending.type).toBe('removeFridgeItem')
    expect(r.pending.candidates).toEqual([{ id: 'c', name: '西兰花', quantity: 1, unit: '颗' }])
  })

  it('returns every candidate when ambiguous so the user can choose', async () => {
    const r = await buildRemoveFridgeItem({ name: '鸡蛋' }, FRIDGE)
    expect(r.pending.candidates.map(c => c.id)).toEqual(['a', 'd'])
  })

  it('rejects when nothing matches', async () => {
    const r = await buildRemoveFridgeItem({ name: '榴莲' }, FRIDGE)
    expect(r.pending).toBeUndefined()
    expect(r.data.status).toBe('rejected')
  })

  it('rejects when no name is given or the fridge is empty', async () => {
    expect((await buildRemoveFridgeItem({}, FRIDGE)).data.status).toBe('rejected')
    expect((await buildRemoveFridgeItem({ name: '鸡蛋' }, [])).data.status).toBe('rejected')
  })
})
