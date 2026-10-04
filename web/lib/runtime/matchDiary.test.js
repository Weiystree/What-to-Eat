import { describe, it, expect } from 'vitest'
import { matchDiary } from './runners.js'

// 固定「现在」= 2026-10-04 12:00，避免依赖真实时钟
const NOW = new Date(2026, 9, 4, 12, 0, 0)
const DAY = 24 * 60 * 60 * 1000
const at = (daysAgo, hour) => {
  const d = new Date(NOW); d.setHours(hour, 0, 0, 0)
  return d.getTime() - daysAgo * DAY
}
const entry = (daysAgo, hour, meal, name) => ({
  meal, createdAt: at(daysAgo, hour), items: [{ name, portion: '一份' }]
})

const DIARY = [
  entry(0, 8, '早餐', '豆浆'),
  entry(1, 12, '午餐', '宫保鸡丁'),
  entry(1, 22, '夜宵', '泡面'),
  entry(2, 12, '午餐', '红烧肉'),
  entry(3, 12, '午餐', '炸鸡'),
  entry(3, 15, '加餐', '酸奶')
]
const names = r => r.entries.flatMap(e => e.items.map(i => i.name))

describe('matchDiary', () => {
  it('defaults to today when no day word is given', () => {
    const r = matchDiary(DIARY, '早餐吃了什么', NOW)
    expect(r.dayLabel).toBe('今天')
    expect(names(r)).toEqual(['豆浆'])
  })

  it('matches 昨天 + 中午 to yesterday lunch only', () => {
    const r = matchDiary(DIARY, '我昨天中午吃了什么', NOW)
    expect(r.dayLabel).toBe('昨天')
    expect(r.meal).toBe('午餐')
    expect(names(r)).toEqual(['宫保鸡丁'])
  })

  it('matches 前天 to two days ago', () => {
    const r = matchDiary(DIARY, '前天中午吃了什么', NOW)
    expect(r.dayLabel).toBe('前天')
    expect(names(r)).toEqual(['红烧肉'])
  })

  it('regression: 大前天 is three days ago, not 前天', () => {
    const r = matchDiary(DIARY, '大前天中午吃了什么', NOW)
    expect(r.dayLabel).toBe('大前天')
    expect(names(r)).toEqual(['炸鸡'])
  })

  it('regression: 夜宵 finds 夜宵 entries, not 加餐', () => {
    const r = matchDiary(DIARY, '昨天夜宵吃了什么', NOW)
    expect(r.meal).toBe('夜宵')
    expect(names(r)).toEqual(['泡面'])
  })

  it('keeps 加餐 as its own meal slot', () => {
    const r = matchDiary(DIARY, '大前天加餐吃了什么', NOW)
    expect(r.meal).toBe('加餐')
    expect(names(r)).toEqual(['酸奶'])
  })

  it('returns an empty result when nothing matches', () => {
    const r = matchDiary(DIARY, '昨天早餐吃了什么', NOW)
    expect(r.count).toBe(0)
    expect(r.entries).toEqual([])
  })

  it('ignores null entries and entries without a timestamp', () => {
    const r = matchDiary([null, { meal: '午餐', items: [] }, ...DIARY], '昨天中午', NOW)
    expect(names(r)).toEqual(['宫保鸡丁'])
  })
})
