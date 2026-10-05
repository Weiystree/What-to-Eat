import { describe, it, expect } from 'vitest'
import { collectHardExclusions, hardFilterPicks } from './safetyFilter.js'

const PICKS = [
  { key: 'balanced', title: '今天最合适', dish: '宫保鸡丁（花生辣椒）', reason: '下饭', allergens: ['花生'] },
  { key: 'crave', title: '今天最想吃', dish: '香菜拌牛肉', reason: '香菜提味' },
  { key: 'easy', title: '今天最省事', dish: '虾仁豆腐煲', reason: '快' },
  { key: 'x', title: '安全', dish: '番茄炒蛋 + 米饭', reason: '家常' }
]

describe('collectHardExclusions', () => {
  it('collects from my profile', () => {
    const p = { profile: { basic: { allergies: ['花生'], taboos: ['不吃动物内脏'] } } }
    expect(collectHardExclusions(p)).toEqual(['花生', '不吃动物内脏'])
  })

  it('merges every party member and dedupes', () => {
    const p = {
      profile: { basic: { allergies: ['虾'] } },
      members: [
        { name: '我', allergies: ['虾'], taboos: ['忌香菜'] },
        { name: 'Amy', allergies: ['花生'], taboos: ['不吃辣'] }
      ]
    }
    expect(collectHardExclusions(p)).toEqual(['虾', '忌香菜', '花生', '不吃辣'])
  })

  it('tolerates missing profile and members', () => {
    expect(collectHardExclusions(null)).toEqual([])
    expect(collectHardExclusions({})).toEqual([])
  })
})

describe('hardFilterPicks', () => {
  it('excludes picks whose text hits an allergy, keeping the rest', () => {
    const { picks, excluded } = hardFilterPicks(PICKS, ['花生'])
    expect(picks.map(p => p.key)).toEqual(['crave', 'easy', 'x'])
    expect(excluded).toEqual([{ key: 'balanced', dish: '宫保鸡丁（花生辣椒）', matched: '花生' }])
  })

  it('strips taboo prefixes before matching', () => {
    const { picks } = hardFilterPicks(PICKS, ['不吃香菜'])
    expect(picks.map(p => p.key)).toEqual(['balanced', 'easy', 'x'])
  })

  it('matches substrings like 虾 → 虾仁', () => {
    const { picks } = hardFilterPicks(PICKS, ['虾'])
    expect(picks.map(p => p.key)).toEqual(['balanced', 'crave', 'x'])
  })

  it('is case-insensitive for latin terms', () => {
    const { picks } = hardFilterPicks(PICKS, ['PIZZA'])
    const withPizza = [{ key: 'z', dish: 'Seafood PIZZA' }, PICKS[3]]
    const r = hardFilterPicks(withPizza, ['pizza'])
    expect(r.picks.map(p => p.key)).toEqual(['x'])
    expect(picks).toHaveLength(4) // 原数组未被「pizza」命中
  })

  it('returns everything when no exclusions', () => {
    expect(hardFilterPicks(PICKS, []).picks).toHaveLength(4)
    expect(hardFilterPicks(PICKS, undefined).picks).toHaveLength(4)
  })
})
