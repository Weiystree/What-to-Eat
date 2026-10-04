import { describe, it, expect } from 'vitest'
import { runFridgeInventory, runExpiringFoods } from './fridgeTools.js'

const item = (name, status, daysLeft, extra = {}) => ({
  id: 'f_' + name, name, quantity: 1, unit: '个', storageZone: 'fridge', status, daysLeft, ...extra
})

const FRIDGE = [
  item('西兰花', 'use_soon', 2),
  item('鸡蛋', 'fresh', 20),
  item('鸡胸肉', 'urgent', 0, { storageZone: 'zero_zone' }),
  item('牛奶', 'expired', -2),
  item('苹果', 'good', 6)
]

describe('runFridgeInventory', () => {
  it('returns every well-formed item with a count', async () => {
    const r = await runFridgeInventory({ fridge: FRIDGE })
    expect(r.ok).toBe(true)
    expect(r.data.count).toBe(5)
    expect(r.data.items.map(i => i.name)).toContain('鸡胸肉')
  })

  it('returns an empty list when fridge is missing or not an array', async () => {
    expect((await runFridgeInventory({})).data).toEqual({ count: 0, items: [] })
    expect((await runFridgeInventory({ fridge: 'oops' })).data.count).toBe(0)
    expect((await runFridgeInventory(undefined)).data.count).toBe(0)
  })

  it('drops null, nameless and blank-name entries', async () => {
    const r = await runFridgeInventory({ fridge: [null, {}, { name: '   ' }, item('番茄', 'fresh', 5)] })
    expect(r.data.items.map(i => i.name)).toEqual(['番茄'])
  })

  it('fills defaults for missing optional fields', async () => {
    const r = await runFridgeInventory({ fridge: [{ name: '豆腐' }] })
    expect(r.data.items[0]).toMatchObject({ unit: '', storageZone: 'fridge', status: 'fresh', daysLeft: null })
  })

  it('caps the list at 60 items', async () => {
    const many = Array.from({ length: 100 }, (_, i) => item('菜' + i, 'fresh', 10))
    const r = await runFridgeInventory({ fridge: many })
    expect(r.data.count).toBe(60)
  })
})

describe('runExpiringFoods', () => {
  it('keeps only urgent / use_soon / expired, most urgent first', async () => {
    const r = await runExpiringFoods({ fridge: FRIDGE })
    expect(r.data.items.map(i => i.name)).toEqual(['牛奶', '鸡胸肉', '西兰花'])
  })

  it('reports how many are already expired', async () => {
    const r = await runExpiringFoods({ fridge: FRIDGE })
    expect(r.data.count).toBe(3)
    expect(r.data.expiredCount).toBe(1)
  })

  it('returns zero when nothing is close to expiring', async () => {
    const r = await runExpiringFoods({ fridge: [item('鸡蛋', 'fresh', 20), item('苹果', 'good', 6)] })
    expect(r.data).toEqual({ count: 0, expiredCount: 0, items: [] })
  })

  it('returns zero for an empty or missing fridge', async () => {
    expect((await runExpiringFoods({})).data.count).toBe(0)
    expect((await runExpiringFoods({ fridge: [] })).data.count).toBe(0)
  })
})
