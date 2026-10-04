// 冰箱保质期与新鲜度：确定性规则，无 LLM。
// 由 store.js（冰箱 CRUD）与 Fridge.vue（新鲜度展示/扣减）消费。

export const STORAGE_ZONES = [
  { key: 'fridge', label: '冷藏 4°C' },
  { key: 'zero_zone', label: '零度保鲜 0°C' },
  { key: 'freezer', label: '冷冻 -18°C' }
]

// 各食物分类在不同存储区的大致保质期（天）。仅用于估算，用户可覆盖到期日。
export const SHELF_LIFE = {
  meat:    { fridge: 3,  zero_zone: 5,  freezer: 90 },
  seafood: { fridge: 2,  zero_zone: 3,  freezer: 60 },
  egg:     { fridge: 30 },
  veg:     { fridge: 5,  zero_zone: 7 },
  fruit:   { fridge: 7,  zero_zone: 10 },
  dairy:   { fridge: 7 },
  staple:  { fridge: 30 },
  bean:    { fridge: 5,  zero_zone: 7 },
  other:   { fridge: 5 }
}

const DAY = 24 * 60 * 60 * 1000

// 某分类在某存储区的保质期天数（带兜底）
export function shelfDays(category, zone) {
  const cat = SHELF_LIFE[category] || SHELF_LIFE.other
  if (cat[zone] != null) return cat[zone]
  if (cat.fridge != null) return cat.fridge
  return SHELF_LIFE.other.fridge
}

// 生成完整 FoodItem，补全缺省字段（用于手动新增 + 旧数据迁移）
export function normalizeItem(raw, now) {
  const t = now || Date.now()
  const name = String((raw && raw.name) || '').trim()
  const category = (raw && raw.category) || 'other'
  return {
    id: (raw && raw.id) || ('f' + t + Math.floor(Math.random() * 1000)),
    name,
    category,
    quantity: typeof (raw && raw.quantity) === 'number' ? raw.quantity : ((raw && raw.quantity) || 1),
    unit: (raw && raw.unit) || '份',
    storageZone: (raw && raw.storageZone) || 'fridge',
    addedDate: (raw && raw.addedDate) || t,
    expiryDate: (raw && raw.expiryDate) || null,
    expirySource: (raw && raw.expirySource) || 'estimate',
    nutritionCategory: (raw && raw.nutritionCategory) || category,
    createdAt: (raw && raw.createdAt) || t,
    updatedAt: (raw && raw.updatedAt) || t
  }
}

// 计算新鲜度：status ∈ fresh/good/use_soon/urgent/expired；daysLeft 为整天数（<=0 表示今天内到期）
export function computeFreshness(item, now) {
  const t = now || Date.now()
  const expiryDate = (item.expirySource === 'user_defined' && item.expiryDate)
    ? item.expiryDate
    : (item.addedDate || t) + shelfDays(item.category, item.storageZone) * DAY
  const remain = expiryDate - t
  const daysLeft = Math.floor(remain / DAY)
  let status
  if (remain < 0) status = 'expired'
  else if (remain < DAY) status = 'urgent'
  else if (remain <= 3 * DAY) status = 'use_soon'
  else if (remain <= 7 * DAY) status = 'good'
  else status = 'fresh'
  return { status, daysLeft, expiryDate }
}

// 做完一顿在家做的饭 → 扣减食材数量，归零移出。返回新数组，不改原数组。
// uses 可以是 name 字符串数组，或 [{name, quantity?, unit?}]。
export function deductInventory(uses, inventory) {
  const next = (Array.isArray(inventory) ? inventory : []).map(it => ({ ...it }))
  const usesArr = Array.isArray(uses) ? uses : []
  for (const use of usesArr) {
    const name = typeof use === 'string' ? use : (use && use.name)
    if (!name) continue
    const qty = (use && typeof use.quantity === 'number') ? use.quantity : 1
    const target = next.find(it => it.name === name)
      || next.find(it => String(it.name).includes(String(name)) || String(name).includes(String(it.name)))
    if (!target) continue
    target.quantity = (target.quantity || 0) - qty
    target.updatedAt = Date.now()
  }
  return next.filter(it => (it.quantity || 0) > 0)
}
