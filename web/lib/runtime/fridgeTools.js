// 冰箱读取工具（确定性，不调 LLM）。
// 服务端无状态、看不到 localStorage，所以冰箱清单由客户端放进 memory.fridge：
//   [{ id, name, quantity, unit, storageZone, status, daysLeft }]
// 其中 status/daysLeft 由客户端用 shelfLife.computeFreshness 算好；这里只做过滤与整形。

const MAX_ITEMS = 60
const EXPIRING_STATUSES = ['urgent', 'use_soon', 'expired']

function readFridge(payload) {
  const list = payload && Array.isArray(payload.fridge) ? payload.fridge : []
  return list
    .filter(it => it && typeof it.name === 'string' && it.name.trim())
    .slice(0, MAX_ITEMS)
    .map(it => ({
      id: it.id,
      name: it.name.trim(),
      quantity: it.quantity,
      unit: it.unit || '',
      storageZone: it.storageZone || 'fridge',
      status: it.status || 'fresh',
      daysLeft: typeof it.daysLeft === 'number' ? it.daysLeft : null
    }))
}

// 完整冰箱清单
export async function runFridgeInventory(payload) {
  const items = readFridge(payload)
  return { ok: true, source: 'memory', data: { count: items.length, items } }
}

// 临期 / 已过期食材，按剩余天数升序（最急的在前）
export async function runExpiringFoods(payload) {
  const items = readFridge(payload)
    .filter(it => EXPIRING_STATUSES.includes(it.status))
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
  return {
    ok: true,
    source: 'memory',
    data: {
      count: items.length,
      expiredCount: items.filter(it => it.status === 'expired').length,
      items
    }
  }
}
