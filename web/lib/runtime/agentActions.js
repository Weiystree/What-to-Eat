// Agent 写入类工具：只"提议"，绝不落库。
// 服务端无状态、数据在浏览器 localStorage，所以这里把用户意图整理成 pendingAction，
// 由前端渲染确认卡，用户点确认后才调用 store.js 真正写入。
//
//   模型 tool_call ─► build*() ─► { pending, data:{status:'pending_confirmation'} }
//   orchestrator 把 pending 收进 pendingActions[] ─► 前端确认卡 ─► 确认 ─► store.js
//
// pendingAction 形状：
//   { id, type:'addMealLog',      meal, items:[{name,portion}] }
//   { id, type:'addFridgeItems',  items:[{name,quantity,unit,storageZone,category}] }
//   { id, type:'removeFridgeItem', query, candidates:[{id,name,quantity,unit}] }

const MEALS = ['早餐', '午餐', '加餐', '晚餐', '夜宵']
const ZONES = ['fridge', 'zero_zone', 'freezer']
const CATEGORIES = ['staple', 'veg', 'fruit', 'meat', 'seafood', 'egg', 'bean', 'dairy', 'other']
const MAX_ITEMS = 20

let seq = 0
const nextId = () => `act_${Date.now().toString(36)}_${++seq}`

const clean = v => (typeof v === 'string' ? v.trim() : '')

function pending(action, summary) {
  return {
    ok: true,
    source: 'pending',
    pending: { id: nextId(), ...action },
    // 回给模型的内容：明确告诉它"还没执行"，避免它说"已记录"
    data: { status: 'pending_confirmation', note: '尚未执行，等待用户确认', summary }
  }
}

function rejected(reason) {
  return { ok: true, source: 'pending', data: { status: 'rejected', reason } }
}

// 记录一餐：items 至少一项有名字；meal 非法则留空，由前端按当前时间推断；
// date 支持"昨天/前天/大前天/YYYY-MM-DD"（v2.md 已知缺口：不支持指定日期 → 已修）
export async function buildAddMealLog(args) {
  const items = (Array.isArray(args && args.items) ? args.items : [])
    .map(it => ({ name: clean(it && it.name), portion: clean(it && it.portion) || '一份' }))
    .filter(it => it.name)
    .slice(0, MAX_ITEMS)
  if (!items.length) return rejected('没有可记录的菜品名称，请让用户说清楚吃了什么')
  const meal = MEALS.includes(args.meal) ? args.meal : null
  const { offset: dateOffset, label: dateLabel } = parseDateArg(args && args.date)
  const summary = `记录${dateLabel ? dateLabel + '的' : ''}${meal || '这一餐'}：${items.map(i => i.name).join('、')}`
  return pending({ type: 'addMealLog', meal, items, dateOffset }, summary)
}

// 解析模型的 date 参数：相对词 → 偏移天数；绝对日期 → 与今天的天数差（限近 30 天内）
export function parseDateArg(raw) {
  const s = clean(raw)
  if (!s) return { offset: 0, label: '' }
  if (/大前天/.test(s)) return { offset: -3, label: '大前天' }
  if (/昨天|昨儿/.test(s)) return { offset: -1, label: '昨天' }
  if (/前天/.test(s)) return { offset: -2, label: '前天' }
  const m = s.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/)
  if (m) {
    const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
    if (Number.isFinite(ts)) {
      const today0 = new Date(); today0.setHours(0, 0, 0, 0)
      const off = Math.round((ts - today0.getTime()) / 86400000)
      if (off <= -1 && off >= -30) return { offset: off, label: `${Number(m[2])}月${Number(m[3])}日` }
    }
  }
  return { offset: 0, label: '' }
}

// 加冰箱食材：数量非正数/非数字退回 1，存放区/分类非法退回默认
export async function buildAddFridgeItems(args) {
  const items = (Array.isArray(args && args.items) ? args.items : [])
    .map(it => {
      const qty = Number(it && it.quantity)
      return {
        name: clean(it && it.name),
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        unit: clean(it && it.unit) || '份',
        storageZone: ZONES.includes(it && it.storageZone) ? it.storageZone : 'fridge',
        category: CATEGORIES.includes(it && it.category) ? it.category : 'other'
      }
    })
    .filter(it => it.name)
    .slice(0, MAX_ITEMS)
  if (!items.length) return rejected('没有可添加的食材名称，请让用户说清楚买了什么')
  return pending({ type: 'addFridgeItems', items }, `加入冰箱：${items.map(i => i.name).join('、')}`)
}

// 从冰箱删除：先精确匹配，没有再包含匹配；解析成具体 id，多于 1 个时交给用户在卡里点选
export function resolveFridgeCandidates(query, fridge) {
  const q = clean(query)
  if (!q) return []
  const list = (Array.isArray(fridge) ? fridge : []).filter(it => it && it.id && clean(it.name))
  const exact = list.filter(it => it.name === q)
  const matched = exact.length ? exact : list.filter(it => it.name.includes(q) || q.includes(it.name))
  return matched.map(it => ({ id: it.id, name: it.name, quantity: it.quantity, unit: it.unit || '' }))
}

export async function buildRemoveFridgeItem(args, fridge) {
  const query = clean(args && args.name)
  if (!query) return rejected('没有说明要删除哪个食材')
  const candidates = resolveFridgeCandidates(query, fridge)
  if (!candidates.length) return rejected(`冰箱清单里没有找到「${query}」`)
  return pending(
    { type: 'removeFridgeItem', query, candidates },
    candidates.length === 1
      ? `从冰箱删除：${candidates[0].name}`
      : `从冰箱删除「${query}」：有 ${candidates.length} 个候选，需用户选择`
  )
}
