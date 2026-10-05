import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock 掉真实 LLM：callLLM 原样回显用例里给的 data
vi.mock('./llm.js', async (importOriginal) => ({
  ...(await importOriginal()),
  callLLM: vi.fn()
}))
// mock 掉 Places：默认返回一家店（可按用例覆盖）
vi.mock('./places.js', () => ({
  fetchNearbyRestaurants: vi.fn(async () => [{
    name: '附近鸡饭店', placeId: 'P1', rating: 4.5, distanceMeters: 300,
    typicalDishes: ['海南鸡饭'], address: 'x'
  }])
}))

const { callLLM } = await import('./llm.js')
const { runRecommend, runRecommendHome, runRecommendGroup, runParty, runFriendsList, runNearbyRestaurants } = await import('./runners.js')

const PICK_OK = { key: 'easy', title: '最省事', dish: '番茄炒蛋 + 米饭', reason: '快', budget: '20 元', time: '15 分钟' }
const before = () => callLLM.mockReset()

describe('safety hard filter in runners', () => {
  beforeEach(before)

  it('runRecommend drops picks that hit allergies', async () => {
    callLLM.mockResolvedValueOnce({
      picks: [PICK_OK, { ...PICK_OK, key: 'balanced', dish: '宫保鸡丁（花生）' }]
    })
    const r = await runRecommend({
      profile: { basic: { allergies: ['花生'], taboos: [] } },
      todayContext: { scene: '在家' }
    })
    expect(r.source).toBe('llm')
    expect(r.data.picks.map(p => p.key)).toEqual(['easy'])
    expect(r.meta.excludedBySafety[0].matched).toBe('花生')
  })

  it('runParty drops picks hitting any member allergy (v2.md #34 group rule)', async () => {
    callLLM.mockResolvedValueOnce({
      picks: [PICK_OK, { ...PICK_OK, key: 'all', dish: '虾仁火锅' }]
    })
    const r = await runParty({
      members: [
        { name: '我', allergies: [] },
        { name: 'Amy', allergies: ['海鲜'] }
      ]
    })
    expect(r.data.picks.map(p => p.key)).toEqual(['easy'])
    expect(r.meta.excludedBySafety[0].matched).toBe('海鲜')
  })
})

describe('runRecommendHome (Phase 3)', () => {
  beforeEach(before)

  it('strips expired foods and only keeps expiring urgent/use_soon items', async () => {
    callLLM.mockResolvedValueOnce({ picks: [PICK_OK] })
    await runRecommendHome({
      profile: { basic: {} },
      homeContext: {
        available: [
          { name: '鸡胸肉', quantity: 300, unit: 'g', status: 'urgent', daysLeft: 0 },
          { name: '牛奶', status: 'expired', daysLeft: -2 },
          { name: '鸡蛋', status: 'fresh', daysLeft: 20 }
        ],
        expiring: [
          { name: '鸡胸肉', status: 'urgent', daysLeft: 0 },
          { name: '牛奶', status: 'expired', daysLeft: -2 }
        ]
      }
    })
    const sent = callLLM.mock.calls[0][0]
    expect(sent.mode).toBe('home')
    expect(sent.homeContext.available.map(i => i.name)).toEqual(['鸡胸肉', '鸡蛋'])
    expect(sent.homeContext.expiring.map(i => i.name)).toEqual(['鸡胸肉'])
  })

  it('returns mock with a note when the fridge is empty', async () => {
    const r = await runRecommendHome({ homeContext: { available: [], expiring: [] } })
    expect(r.source).toBe('mock')
    expect(r.meta.note).toContain('冰箱')
    expect(callLLM).not.toHaveBeenCalled()
  })
})

describe('runRecommendGroup (Phase 3 / Q4)', () => {
  beforeEach(before)

  it('merges member allergies into the hard filter and sends members to the LLM', async () => {
    callLLM.mockResolvedValueOnce({ picks: [PICK_OK, { ...PICK_OK, key: 'all', dish: '香菜牛肉面' }] })
    const r = await runRecommendGroup({
      profile: { basic: {}, prefer: {} },
      members: [
        { name: '我', isMe: true, allergies: [], taboos: [] },
        { name: 'Amy', allergies: [], taboos: ['不吃香菜'] }
      ]
    })
    const sent = callLLM.mock.calls[0][0]
    expect(sent.members).toHaveLength(2)
    expect(sent.members[1].name).toBe('Amy')
    expect(r.data.picks.map(p => p.key)).toEqual(['easy'])
  })

  it('falls back to profile+friends when the model passes no members', async () => {
    callLLM.mockResolvedValueOnce({ picks: [PICK_OK] })
    await runRecommendGroup({
      profile: { basic: { allergies: ['虾'] }, prefer: { cuisines: ['川菜'] } },
      friends: [{ code: 'F1', name: 'Amy', allergies: ['花生'] }]
    })
    const sent = callLLM.mock.calls[0][0]
    expect(sent.members.map(m => m.name)).toEqual(['我', 'Amy'])
    expect(sent.members[0].allergies).toEqual(['虾'])
  })
})

describe('new read tools (Phase 5 / Q4)', () => {
  it('runFriendsList shapes friend profiles from memory', async () => {
    const r = await runFriendsList({
      friends: [{ code: 'F1', name: 'Amy', allergies: ['花生'], cuisines: ['日料'] }, null, { name: '' }]
    })
    expect(r.source).toBe('memory')
    expect(r.data.count).toBe(1)
    expect(r.data.friends[0]).toMatchObject({ name: 'Amy', allergies: ['花生'] })
  })

  it('runNearbyRestaurants degrades silently without location', async () => {
    const r = await runNearbyRestaurants({})
    expect(r.data.count).toBe(0)
    expect(r.data.note).toContain('定位')
  })
})
