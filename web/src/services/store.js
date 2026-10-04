// localStorage 封装：画像、日记、今日状态、上次推荐
import { normalizeItem, computeFreshness } from './shelfLife.js'

const K_PROFILE = 'meal_profile'
const K_DIARY = 'meal_diary'
const K_TODAY = 'meal_today_ctx'
const K_LAST_RECO = 'meal_last_reco'
const K_PENDING = 'meal_pending'  // 页面间临时数据（识别结果、当前选中的推荐卡）
const K_COMMUNITY = 'meal_community_me'  // 我的社区身份 {code,name,emoji}
const K_FRIDGE = 'meal_fridge_inventory'  // 冰箱食材清单 [{name,freshness}]
const K_NUTRITION = 'meal_nutrition'  // 今日营养建议缓存
const K_LOCATION = 'meal_location'  // 地理位置（用于附近餐厅推荐）

// 所有 localStorage key 的单一登记处：新增 key 必须在此登记，clearAll 才会一并清理。
const ALL_KEYS = [
  K_PROFILE, K_DIARY, K_TODAY, K_LAST_RECO, K_PENDING,
  K_COMMUNITY, K_FRIDGE, K_NUTRITION, K_LOCATION
]

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch (e) { return fallback }
}
function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch (e) {}
}

export function getProfile() { return readJSON(K_PROFILE, null) }
export function setProfile(p) { writeJSON(K_PROFILE, p) }

export function getDiary() { return readJSON(K_DIARY, []) }
// 统一日期键 YYYY-MM-DD（月/日补零）。所有按天分组/计数的 key 都用它，避免各页各自生成。
export function formatDateKey(ts) {
  const d = ts instanceof Date ? ts : new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function appendDiary(entry) {
  const list = getDiary()
  const now = Date.now()
  const date = formatDateKey(now)
  list.unshift(Object.assign({ id: now, createdAt: now, date }, entry))
  writeJSON(K_DIARY, list)
  return list
}
export function updateDiary(id, patch) {
  const list = getDiary().map(x => x.id === id ? Object.assign({}, x, patch) : x)
  writeJSON(K_DIARY, list)
  return list
}
export function deleteDiary(id) {
  const list = getDiary().filter(x => x.id !== id)
  writeJSON(K_DIARY, list)
  return list
}

export function getTodayContext() { return readJSON(K_TODAY, null) }
export function setTodayContext(ctx) { writeJSON(K_TODAY, Object.assign({ savedAt: Date.now() }, ctx)) }

export function getLastReco() { return readJSON(K_LAST_RECO, null) }
export function setLastReco(r) { writeJSON(K_LAST_RECO, r) }

export function getCachedNutrition() { return readJSON(K_NUTRITION, null) }
export function setCachedNutrition(n) { writeJSON(K_NUTRITION, n) }

// —— 冰箱食材清单 ——
export function getFridgeInventory() {
  const list = readJSON(K_FRIDGE, [])
  if (!Array.isArray(list)) return []
  // 旧数据迁移：早期只存 [{name,freshness}]，补全为完整 FoodItem 并回写一次
  if (list.some(it => !it || !it.id)) {
    const migrated = list.map(it => normalizeItem(it))
    writeJSON(K_FRIDGE, migrated)
    return migrated
  }
  return list
}
export function setFridgeInventory(list) { writeJSON(K_FRIDGE, Array.isArray(list) ? list : []) }
export function clearFridgeInventory() { localStorage.removeItem(K_FRIDGE) }

export function addFridgeItem(item) {
  const list = getFridgeInventory()
  list.push(normalizeItem(item))
  setFridgeInventory(list)
  return list
}
export function updateFridgeItem(id, patch) {
  const list = getFridgeInventory().map(x => x.id === id ? Object.assign({}, x, patch, { updatedAt: Date.now() }) : x)
  setFridgeInventory(list)
  return list
}
export function removeFridgeItem(id) {
  const list = getFridgeInventory().filter(x => x.id !== id)
  setFridgeInventory(list)
  return list
}
// 给 Agent 用的冰箱精简快照：只保留必要字段，新鲜度在本地用确定性规则算好（服务端不重算）
export function getFridgeSnapshot() {
  const now = Date.now()
  return getFridgeInventory().map(it => {
    const f = computeFreshness(it, now)
    return {
      id: it.id, name: it.name, quantity: it.quantity, unit: it.unit,
      storageZone: it.storageZone, status: f.status, daysLeft: f.daysLeft
    }
  })
}
// 临期/已过期食材（urgent / use_soon / expired），按剩余天数升序
export function getExpiringFoods() {
  const now = Date.now()
  return getFridgeInventory()
    .map(it => Object.assign({}, it, computeFreshness(it, now)))
    .filter(it => it.status === 'urgent' || it.status === 'use_soon' || it.status === 'expired')
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

// —— 社区身份 ——
export function getCommunityMe() { return readJSON(K_COMMUNITY, null) }
export function setCommunityMe(me) { writeJSON(K_COMMUNITY, me) }

export function getPending(key) {
  const p = readJSON(K_PENDING, {})
  return p[key]
}
export function setPending(key, val) {
  const p = readJSON(K_PENDING, {})
  p[key] = val
  writeJSON(K_PENDING, p)
}

export function clearAll() {
  ALL_KEYS.forEach(k => localStorage.removeItem(k))
}

// —— 地理位置（用于附近餐厅推荐） ——
const LOCATION_MAX_AGE_MS = 30 * 60 * 1000 // 30 分钟

export function getSavedLocation() {
  const l = readJSON(K_LOCATION, null)
  if (!l || !l.lat || !l.lng) return null
  if (Date.now() - (l.savedAt || 0) > LOCATION_MAX_AGE_MS) return null
  return l
}
export function saveLocation(loc) {
  writeJSON(K_LOCATION, Object.assign({ savedAt: Date.now() }, loc))
}
export function clearLocation() {
  localStorage.removeItem(K_LOCATION)
}
// 请求浏览器定位，返回 Promise<{lat,lng,accuracy}|null>
export function requestGeolocation(timeoutMs) {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    const t = setTimeout(() => resolve(null), timeoutMs || 8000)
    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(t)
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }
        saveLocation(loc)
        resolve(loc)
      },
      () => { clearTimeout(t); resolve(null) },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: timeoutMs || 8000 }
    )
  })
}

// 收集最近使用过的外卖店铺，供推荐参考
export function getDeliveryStores(limit) {
  const map = {}
  getDiary().forEach(d => {
    const s = (d.deliveryStore || '').trim()
    if (!s) return
    if (!map[s]) map[s] = { name: s, count: 0, last: 0, dishes: [] }
    map[s].count += 1
    map[s].last = Math.max(map[s].last, d.createdAt || 0)
    ;(d.items || []).forEach(it => {
      if (it && it.name && !map[s].dishes.includes(it.name)) map[s].dishes.push(it.name)
    })
  })
  const arr = Object.values(map).sort((a, b) => b.count - a.count || b.last - a.last)
  return typeof limit === 'number' ? arr.slice(0, limit) : arr
}

// 画像导出为分享文本（Base64 JSON）
export function exportProfileText() {
  const payload = {
    v: 1,
    exportedAt: Date.now(),
    profile: getProfile()
  }
  const json = JSON.stringify(payload)
  // 使用 URL 安全 base64，方便通过短信/微信复制
  return 'MEAL1:' + btoa(unescape(encodeURIComponent(json)))
}

// 解码分享文本 → 画像对象；失败返回 null
export function decodeProfileText(text) {
  if (!text) return null
  const s = String(text).trim()
  const body = s.startsWith('MEAL1:') ? s.slice(6) : s
  try {
    const json = decodeURIComponent(escape(atob(body)))
    const obj = JSON.parse(json)
    if (obj && obj.profile) return obj.profile
    if (obj && obj.basic) return obj              // 兼容直接粘 JSON
  } catch (e) {
    try {
      const obj = JSON.parse(s)
      if (obj && (obj.basic || obj.prefer)) return obj
    } catch (e2) {}
  }
  return null
}

// 覆盖式导入本机画像
export function importProfile(profile) {
  if (!profile) return false
  setProfile(Object.assign({}, profile, { onboarded: true }))
  return true
}

export function deriveAgeMode(profile) {
  const by = (profile && profile.basic && profile.basic.birthYear) || (profile && profile.birthYear)
  if (!by) return 'adult'
  const age = new Date().getFullYear() - Number(by)
  if (age >= 10 && age <= 17) return 'growth'
  if (age >= 60) return 'senior'
  return 'adult'
}

// —— 食物分类（日记页图标 + 每周种类/热量统计的单一数据源） ——
export const FOOD_CATEGORIES = [
  { key: 'staple',  label: '主食',   icon: '🍚' },
  { key: 'veg',     label: '蔬菜',   icon: '🥦' },
  { key: 'fruit',   label: '水果',   icon: '🍎' },
  { key: 'meat',    label: '肉类',   icon: '🍗' },
  { key: 'seafood', label: '海鲜',   icon: '🍤' },
  { key: 'egg',     label: '蛋类',   icon: '🥚' },
  { key: 'bean',    label: '豆制品', icon: '🫘' },
  { key: 'dairy',   label: '奶制品', icon: '🥛' },
  { key: 'other',   label: '其他',   icon: '🍽' }
]
const CATEGORY_MAP = FOOD_CATEGORIES.reduce((m, c) => { m[c.key] = c; return m }, {})
export function getCategoryMeta(key) {
  return CATEGORY_MAP[key] || CATEGORY_MAP.other
}

// 把 AI 识别/估算结果（category/calories）合并回本地 items，返回新数组，不改原对象
export function mergeFoodEstimates(items, estimated) {
  const list = Array.isArray(items) ? items : []
  const est = Array.isArray(estimated) ? estimated : []
  return list.map((item, idx) => {
    const byName = est.find(e => e && e.name === item.name)
    const match = byName || (est.length === list.length ? est[idx] : null)
    if (!match) return { ...item, category: item.category || 'other' }
    return {
      ...item,
      category: match.category || item.category || 'other',
      calories: typeof match.calories === 'number' ? match.calories : item.calories
    }
  })
}

// 从一组日记条目里统计"吃了多少种食物"，按分类分组（按菜名去重）
export function summarizeFoodKinds(entries) {
  const seenNames = new Set()
  const countByCategory = {}
  ;(entries || []).forEach(d => {
    ;(d.items || []).forEach(it => {
      const name = (it.name || '').trim()
      if (!name || seenNames.has(name)) return
      seenNames.add(name)
      const cat = it.category || 'other'
      countByCategory[cat] = (countByCategory[cat] || 0) + 1
    })
  })
  const byCategory = FOOD_CATEGORIES.map(c => ({
    key: c.key, label: c.label, icon: c.icon, count: countByCategory[c.key] || 0
  }))
  return { totalKinds: seenNames.size, byCategory }
}

const WEEKLY_KIND_TARGET = 25

// 最近 7 天：吃了多少种食物 + 分类分布（对应膳食指南"每周 25 种+"）
export function getWeeklyFoodStats() {
  const entries = getDiary().filter(d => Date.now() - (d.createdAt || 0) <= 7 * 24 * 60 * 60 * 1000)
  const stats = summarizeFoodKinds(entries)
  return { ...stats, target: WEEKLY_KIND_TARGET }
}

// 最近 7 天每天的日期标签 + 当天卡路里合计，供柱状图使用
export function getWeeklyCalories() {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = []
  for (let i = 6; i >= 0; i--) {
    const start = today.getTime() - i * 24 * 60 * 60 * 1000
    days.push({ start, end: start + 24 * 60 * 60 * 1000, label: `${new Date(start).getMonth() + 1}/${new Date(start).getDate()}`, kcal: 0, hasUnknown: false })
  }
  getDiary().forEach(d => {
    const ts = d.createdAt || 0
    const day = days.find(x => ts >= x.start && ts < x.end)
    if (!day) return
    ;(d.items || []).forEach(it => {
      if (typeof it.calories === 'number') day.kcal += it.calories
      else day.hasUnknown = true
    })
  })
  const weekTotal = days.reduce((sum, d) => sum + d.kcal, 0)
  const maxKcal = Math.max(1, ...days.map(d => d.kcal))
  return { days, weekTotal, maxKcal }
}
