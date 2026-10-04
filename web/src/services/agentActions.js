// Agent 待确认动作的"提交端"：用户在确认卡点「确认」后才会走到这里，真正写入 localStorage。
// 服务端只产出 pendingAction（见 lib/runtime/agentActions.js），从不写数据。
//
//   确认卡 ─► commitAction(action, { selectedId }) ─► store.js
//
// 三道保护：
//   1. 幂等：同一个 action.id 只会成功提交一次（双击确认不会写两条）
//   2. 提交前校验：删除时 id 和名称都必须仍和当前冰箱一致，过期的卡片不会误删
//   3. 估算失败不整体失败：记录一餐时热量/分类估算失败，退化为 category:'other' 照常写入
import {
  getProfile, getFridgeInventory, addFridgeItem, removeFridgeItem, appendDiary, mergeFoodEstimates
} from './store.js'
import { estimateMeal } from './agent.js'
import { guessMeal } from './mealTime.js'

const defaultDeps = {
  getProfile, getFridgeInventory, addFridgeItem, removeFridgeItem, appendDiary, mergeFoodEstimates,
  estimateMeal, guessMeal,
  ledger: new Set()
}

const fail = message => ({ ok: false, message })
const ok = message => ({ ok: true, message })

async function commitAddMealLog(action, d) {
  const base = action.items.map(it => ({ name: it.name, portion: it.portion || '一份', category: 'other', method: 'Agent 记录' }))
  let items = base
  try {
    const r = await d.estimateMeal({
      textDescription: base.map(i => i.name).join('、'),
      profile: d.getProfile()
    })
    const est = r && r.ok && r.data && Array.isArray(r.data.items) ? r.data.items : []
    if (est.length) items = d.mergeFoodEstimates(base, est)
  } catch (e) {
    // 估算失败：保留 category:'other' 的兜底 items
  }
  d.appendDiary({
    items, meal: action.meal || d.guessMeal(),
    confirmed: true, awaitingFeedback: false, source: 'Agent'
  })
  return ok(`已记录：${items.map(i => i.name).join('、')}`)
}

function commitAddFridgeItems(action, d) {
  action.items.forEach(it => d.addFridgeItem(it))
  return ok(`已加入冰箱：${action.items.map(i => i.name).join('、')}`)
}

function commitRemoveFridgeItem(action, selectedId, d) {
  const candidates = action.candidates || []
  const id = selectedId || (candidates.length === 1 ? candidates[0].id : '')
  if (!id) return fail('请先选择要删除哪一个')
  const candidate = candidates.find(c => c.id === id)
  const current = d.getFridgeInventory().find(it => it.id === id)
  // id 与名称都要对得上：避免冰箱在确认前已变化（删了又加、id 复用）
  if (!candidate || !current || current.name !== candidate.name) {
    return fail('冰箱里这项已经变化了，请重新告诉我一次')
  }
  d.removeFridgeItem(id)
  return ok(`已从冰箱删除：${current.name}`)
}

export async function commitAction(action, opts = {}, deps = {}) {
  const d = { ...defaultDeps, ...deps }
  if (!action || !action.id) return fail('无效的操作')
  if (d.ledger.has(action.id)) return fail('这个操作已经执行过了')

  let result
  try {
    if (action.type === 'addMealLog') result = await commitAddMealLog(action, d)
    else if (action.type === 'addFridgeItems') result = commitAddFridgeItems(action, d)
    else if (action.type === 'removeFridgeItem') result = commitRemoveFridgeItem(action, opts.selectedId, d)
    else result = fail('不支持的操作类型')
  } catch (e) {
    return fail('写入失败，请重试')
  }
  if (result.ok) d.ledger.add(action.id)
  return result
}

// 确认卡标题
export function describeAction(action) {
  if (action.type === 'addMealLog') return `记录${action.meal || '这一餐'}`
  if (action.type === 'addFridgeItems') return '加入冰箱'
  if (action.type === 'removeFridgeItem') return '从冰箱删除'
  return '操作'
}
