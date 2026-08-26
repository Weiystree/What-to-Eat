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
  if (action === 'fridgeToRecipe') {
    return {
      ok: true, source: 'local-mock',
      data: {
        ingredients: [
          { name: '鸡蛋', freshness: '新鲜' },
          { name: '番茄', freshness: '需尽快用' },
          { name: '青椒', freshness: '一般' },
          { name: '猪肉末', freshness: '新鲜' }
        ],
        dishes: [
          { name: '番茄炒蛋', reason: '经典家常菜，番茄和鸡蛋搭配酸甜开胃，蛋白质和维生素均衡', uses: ['番茄', '鸡蛋'], missing: ['葱'], time: '10 分钟', difficulty: '简单', howto: '鸡蛋打散炒熟盛出，番茄切块炒软出汁，倒入鸡蛋翻炒，加盐调味即可' },
          { name: '青椒肉末', reason: '猪肉末和青椒是下饭绝配，操作简单速度快', uses: ['青椒', '猪肉末'], missing: ['蒜', '生抽'], time: '15 分钟', difficulty: '简单', howto: '热油下肉末炒变色，加料酒去腥，下青椒丝翻炒，加生抽调味出锅' },
          { name: '番茄肉末面', reason: '一锅出，番茄的酸甜和肉末的咸香融入汤汁，主食蛋白蔬菜一次搞定', uses: ['番茄', '猪肉末'], missing: ['面条', '姜'], time: '20 分钟', difficulty: '简单', howto: '肉末炒香盛出，番茄炒出汁加水煮开，下面条煮熟，倒回肉末调味' }
        ]
      }
    }
  }
  if (action === 'communityRegister') {
    return { ok: true, source: 'local-mock', data: { me: { code: 'ME0001', name: (payload && payload.name) || '我', emoji: (payload && payload.emoji) || '😊' } } }
  }
  if (action === 'communityAddFriend') {
    const friend = { code: String((payload && payload.friendCode) || 'FRIEND1').toUpperCase(), name: '小饭搭子', emoji: '😺' }
    return { ok: true, source: 'local-mock', data: { friend, friends: [friend] } }
  }
  if (action === 'communityFriends') {
    return { ok: true, source: 'local-mock', data: { friends: [{ code: 'FRIEND1', name: '小饭搭子', emoji: '😺' }] } }
  }
  if (action === 'communityPost') {
    return { ok: true, source: 'local-mock', data: { post: { id: 'local' + Date.now(), code: (payload && payload.meCode) || 'ME0001', name: '我', emoji: '😊', mealText: (payload && payload.mealText) || '', caption: (payload && payload.caption) || '', createdAt: Date.now() } } }
  }
  if (action === 'communityFeed') {
    return { ok: true, source: 'local-mock', data: { posts: [
      { id: 'm1', code: 'FRIEND1', name: '小饭搭子', emoji: '😺', mealText: '午餐：番茄虾仁豆腐煲 + 一拳米饭', caption: '今天清淡一点～', createdAt: Date.now() - 3600000 },
      { id: 'm2', code: 'FRIEND1', name: '小饭搭子', emoji: '😺', mealText: '晚餐：清汤麻辣烫', caption: '没忍住吃辣了', createdAt: Date.now() - 86400000 }
    ] } }
  }
  return { ok: true, source: 'local-mock', data: { reply: '（离线 Mock 回复）已按你的要求调整。' } }
}

export const recognizeMeal = (payload) => invoke('recognizeMeal', payload)
export const recommend = (payload) => invoke('recommend', payload)
export const chat = (payload) => invoke('chat', payload)
export const dailyNutrition = (payload) => invoke('dailyNutrition', payload)
export const party = (payload) => invoke('party', payload)
export const fridgeToRecipe = (payload) => invoke('fridgeToRecipe', payload)
export const communityRegister = (payload) => invoke('communityRegister', payload)
export const communityAddFriend = (payload) => invoke('communityAddFriend', payload)
export const communityFriends = (payload) => invoke('communityFriends', payload)
export const communityPost = (payload) => invoke('communityPost', payload)
export const communityFeed = (payload) => invoke('communityFeed', payload)
// 纯文字场景（手动记录/直接采纳推荐）估算 category/calories，底层复用 recognizeMeal
export const estimateMeal = (payload) => invoke('recognizeMeal', payload)
// Agent 运行时入口：自主编排（后端 action='agent'，由 orchestrator 决定调用哪些 Skill）
export const agent = (payload) => invoke('agent', payload)
