// 前端 Agent 入口：POST /api/agent
// 后端未配置 KEY 时会自动返回 mock，前端不需要感知

async function invoke(action, payload) {
  try {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, payload })
    })
    if (!res.ok) throw new Error('http_' + res.status)
    const data = await res.json()
    return data
  } catch (e) {
    console.warn('[agent] request failed, use local mock:', e)
    return localMock(action, payload)
  }
}

function localMock(action, payload) {
  if (action === 'recognizeMeal') {
    return {
      ok: true, source: 'local-mock',
      data: {
        items: [
          { name: '米饭', portion: '一碗', category: 'staple', calories: 260 },
          { name: '红烧鸡肉', portion: '一份', category: 'meat', calories: 320 },
          { name: '炒青菜', portion: '一小份', category: 'veg', calories: 80 }
        ]
      }
    }
  }
  if (action === 'recommend') {
    return {
      ok: true, source: 'local-mock',
      data: {
        picks: [
          { key: 'balanced', title: '今天最合适', dish: '番茄虾仁豆腐煲 + 一拳米饭 + 一份青菜', reason: '蛋白质与蔬菜平衡。', budget: '30~45 元', time: '25 分钟', allergens: ['虾', '大豆'], swaps: [], howto: '外卖搜"豆腐煲"。' },
          { key: 'crave', title: '今天最想吃', dish: '清汤麻辣烫', reason: '兼顾情绪与口味。', budget: '25~35 元', time: '15 分钟', allergens: [], swaps: [], howto: '附近店或外卖。' },
          { key: 'easy', title: '今天最省事', dish: '海南鸡饭', reason: '出餐快、附近好找。', budget: '22~28 元', time: '10 分钟', allergens: [], swaps: [], howto: '外卖直接下单。' }
        ]
      }
    }
  }
  if (action === 'dailyNutrition') {
    return {
      ok: true, source: 'local-mock',
      data: {
        items: [
          { name: '深色蔬菜', portion: '1~2 拳头', why: '连续两天蔬菜量偏少' },
          { name: '优质蛋白（鱼/鸡胸/豆制品）', portion: '一掌心', why: '最近以红肉为主，换个来源' },
          { name: '全谷或杂豆主食', portion: '一拳头', why: '把精米白面替换一半，稳定血糖' }
        ],
        summary: '整体口味偏重，今天可以清淡一点。'
      }
    }
  }
  if (action === 'party') {
    return {
      ok: true, source: 'local-mock',
      data: {
        picks: [
          { key: 'all', title: '最适合所有人', dish: '清汤 + 番茄双拼火锅', reason: '避开辣度冲突、素食和荤食都能点。', budget: '80~120 元/人', notes: '锅底一半清汤照顾不吃辣的一位；素食者以豆制品和菌菇为主。' },
          { key: 'fun', title: '最有趣', dish: '街头小吃拼盘', reason: '每人挑不同摊子，气氛轻松。', budget: '40~80 元/人', notes: '注意花生和海鲜过敏项。' },
          { key: 'easy', title: '最方便', dish: '连锁快餐 + 单点', reason: '出餐快，人均消费低。', budget: '35~55 元/人', notes: '各点各的，避开共享盘。' }
        ]
      }
    }
  }
  return { ok: true, source: 'local-mock', data: { reply: '（离线 Mock 回复）已按你的要求调整。' } }
}

export const recognizeMeal = (payload) => invoke('recognizeMeal', payload)
export const recommend = (payload) => invoke('recommend', payload)
export const chat = (payload) => invoke('chat', payload)
export const dailyNutrition = (payload) => invoke('dailyNutrition', payload)
export const party = (payload) => invoke('party', payload)
// 纯文字场景（手动记录/直接采纳推荐）估算 category/calories，底层复用 recognizeMeal
export const estimateMeal = (payload) => invoke('recognizeMeal', payload)
