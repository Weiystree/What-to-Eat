// Vercel Serverless Function: /api/agent
// 环境变量：
//   ANTHROPIC_API_KEY        必填，Claude 密钥
//   ANTHROPIC_MODEL          可选，默认 claude-opus-4-7
//   ANTHROPIC_BASE_URL       可选，第三方代理（如 eazo）用这个替换官方地址
//   ANTHROPIC_AUTH_STYLE     可选，'x-api-key'（默认，官方）或 'bearer'（多数代理）
//   GOOGLE_PLACES_API_KEY    可选，启用后 recommend 会在场景=餐厅时拉附近店家
// 未配置 KEY 时自动降级为 Mock，前端行为不受影响

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-7'
const AUTH_STYLE = (process.env.ANTHROPIC_AUTH_STYLE || 'x-api-key').toLowerCase()

function buildUrl() {
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '')
  if (/\/v1$/.test(base)) return base + '/messages'
  if (/\/messages$/.test(base)) return base
  return base + '/v1/messages'
}
const ANTHROPIC_URL = buildUrl()

const SYSTEM_PROMPT = `你是饮食决策助手，帮用户 1 分钟内决定下一餐。

规则：
1. 过敏(allergies)和忌口(taboos)硬排除；健康偏好(healthPrefs)软倾向。
2. 单人三卡：最合适/最想吃/最省事。若 crave 非"无所谓"，三张必须贴合该方向。
3. 餐厅场景：dish 格式"店名 · 菜品"，三张必须从 nearbyPlaces 选店。reason 提评分和距离，placeId 填回对应店的 placeId。尽量不同店。signatureDishes 给 2~3 个该店推荐菜品建议（可参考 nearbyPlaces 里的 dishes 提示词发挥），这是建议不是该店真实菜单，非餐厅场景可不填。
4. budget 是单餐预算硬约束，三张必须严格在范围内。
5. refineHint 非空时向该方向靠拢。seed 用于变化选择避免重复。
6. 输出合法 JSON。
7. 识别/估算菜品（recognizeMeal）时，必须给每项 category（枚举：staple/veg/fruit/meat/seafood/egg/bean/dairy/other）和 calories（整数 kcal，粗略估算即可，不确定也给一个合理值而不是留空）。`

const MOCK = {
  recognizeMeal: {
    items: [
      { name: '米饭', portion: '一碗', category: 'staple', calories: 260 },
      { name: '红烧鸡肉', portion: '一份', category: 'meat', calories: 320 },
      { name: '炒青菜', portion: '一小份', category: 'veg', calories: 80 }
    ]
  },
  recommend: {
    picks: [
      { key: 'balanced', title: '今天最合适', dish: '番茄虾仁豆腐煲 + 一拳米饭 + 一份青菜', reason: '最近两餐蛋白质多为猪肉，这一餐换成虾和豆腐更丰富。', budget: '30~45 元', time: '25 分钟', allergens: ['虾', '大豆'], swaps: ['虾仁 ↔ 鸡胸肉'], howto: '外卖搜"豆腐煲"，或在家：热油下姜蒜，番茄炒软后加水、豆腐、虾仁煮 5 分钟。', signatureDishes: ['番茄虾仁豆腐煲', '家常小炒', '例汤'] },
      { key: 'crave', title: '今天最想吃', dish: '清汤麻辣烫（牛肉+豆腐+菌菇+粉）', reason: '照顾情绪与口味，保留辣味但少喝汤。', budget: '25~35 元', time: '15 分钟', allergens: ['大豆'], swaps: ['粉 ↔ 魔芋'], howto: '附近麻辣烫店或外卖任选，告知不要额外辣油。', signatureDishes: ['麻辣烫拼菜', '牛肉粉', '卤味拼盘'] },
      { key: 'easy', title: '今天最省事', dish: '海南鸡饭 + 一份青菜', reason: '出餐快、附近好找。', budget: '22~28 元', time: '10 分钟', allergens: [], swaps: ['青菜 ↔ 西兰花'], howto: '外卖直接下单，指定少油。', signatureDishes: ['海南鸡饭', '咖喱鸡饭'] }
    ]
  },
  dailyNutrition: {
    items: [
      { name: '深色蔬菜', portion: '1~2 拳头', why: '连续两天蔬菜量偏少' },
      { name: '优质蛋白', portion: '一掌心', why: '最近以红肉为主，换个来源' },
      { name: '全谷主食', portion: '一拳头', why: '把精米白面替换一半' }
    ],
    summary: '整体饮食偏重，今天可以清淡一点。'
  },
  party: {
    picks: [
      { key: 'all', title: '最适合所有人', dish: '清汤 + 番茄双拼火锅', reason: '避开辣度冲突，素食和荤食都能点。', budget: '80~120 元/人', notes: '锅底一半清汤照顾不吃辣的一位。' },
      { key: 'fun', title: '最有趣', dish: '街头小吃拼盘', reason: '每人挑不同摊子，氛围轻松。', budget: '40~80 元/人', notes: '花生和海鲜过敏项注意避开。' },
      { key: 'easy', title: '最方便', dish: '连锁快餐 + 单点', reason: '出餐快、人均消费低。', budget: '35~55 元/人', notes: '各点各的，避开共享盘。' }
    ]
  },
  chat: { reply: '（Mock 回复）已按你的要求调整。接入真实 Key 后会得到具体分析。' }
}

// 各 action 的 JSON Schema：通过 Anthropic tool_use 强制模型按 schema 输出
const SCHEMAS = {
  recognizeMeal: {
    name: 'submit_recognition',
    description: '提交照片中识别到的菜品列表（只列你相当确定的项）',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              portion: { type: 'string' },
              category: { type: 'string', enum: ['staple', 'veg', 'fruit', 'meat', 'seafood', 'egg', 'bean', 'dairy', 'other'] },
              calories: { type: 'number' }
            },
            required: ['name', 'portion', 'category', 'calories']
          }
        }
      },
      required: ['items']
    }
  },
  recommend: {
    name: 'submit_picks',
    description: '提交三张推荐卡片：balanced/crave/easy',
    input_schema: {
      type: 'object',
      properties: {
        picks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key:       { type: 'string', enum: ['balanced', 'crave', 'easy'] },
              title:     { type: 'string' },
              dish:      { type: 'string' },
              reason:    { type: 'string' },
              budget:    { type: 'string' },
              time:      { type: 'string' },
              allergens: { type: 'array', items: { type: 'string' } },
              swaps:     { type: 'array', items: { type: 'string' } },
              howto:     { type: 'string' },
              placeId:   { type: 'string' },
              signatureDishes: { type: 'array', items: { type: 'string' } }
            },
            required: ['key', 'title', 'dish', 'reason', 'budget', 'time']
          }
        }
      },
      required: ['picks']
    }
  },
  dailyNutrition: {
    name: 'submit_nutrition',
    description: '提交今日需要补充或减少的食物类别',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name:    { type: 'string' },
              portion: { type: 'string' },
              why:     { type: 'string' }
            },
            required: ['name', 'portion', 'why']
          }
        },
        summary: { type: 'string' }
      },
      required: ['items']
    }
  },
  party: {
    name: 'submit_party_picks',
    description: '提交三张聚餐方案：all/fun/easy',
    input_schema: {
      type: 'object',
      properties: {
        picks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key:    { type: 'string', enum: ['all', 'fun', 'easy'] },
              title:  { type: 'string' },
              dish:   { type: 'string' },
              reason: { type: 'string' },
              budget: { type: 'string' },
              notes:  { type: 'string' }
            },
            required: ['key', 'title', 'dish', 'reason', 'budget']
          }
        }
      },
      required: ['picks']
    }
  },
  chat: {
    name: 'submit_reply',
    description: '如果只是纯文本回复用 reply 字段；如果在追问我希望你给出微调后的新推荐卡，用 cards[] + note 字段',
    input_schema: {
      type: 'object',
      properties: {
        reply: { type: 'string' },
        cards: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title:  { type: 'string' },
              dish:   { type: 'string' },
              reason: { type: 'string' }
            },
            required: ['title', 'dish', 'reason']
          }
        },
        note: { type: 'string' }
      },
      required: []
    }
  }
}

// 各 action 的 token 上限：越大越慢，越小越可能被截断
const MAX_TOKENS = {
  recognizeMeal: 400,
  recommend:     250,
  dailyNutrition: 500,
  party:         900,
  chat:          400
}

async function callClaude(userJson, schemaKey, opts) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  const tool = SCHEMAS[schemaKey]
  if (!tool) throw new Error('unknown_schema: ' + schemaKey)

  const userContent = []
  if (opts && opts.imageDataUrl) {
    const m = String(opts.imageDataUrl).match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/)
    if (m) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: m[1], data: m[2] }
      })
    }
  }
  userContent.push({
    type: 'text',
    text: `提交结果。数据：${JSON.stringify(userJson)}`
  })

  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS[schemaKey] || 900,
    temperature: (opts && opts.temperature != null) ? opts.temperature : 0,
    system: SYSTEM_PROMPT,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: userContent }]
  }
  const headers = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01'
  }
  if (AUTH_STYLE === 'bearer') headers['authorization'] = 'Bearer ' + key
  else headers['x-api-key'] = key

  // 硬超时：留 2s 给 JSON 解析和 Vercel 网关响应（maxDuration=60s）
  const abort = new AbortController()
  const timeoutMs = (opts && opts.timeoutMs) || 58000
  const to = setTimeout(() => abort.abort('claude_timeout'), timeoutMs)

  const t0 = Date.now()
  let res
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST', headers, body: JSON.stringify(body),
      signal: abort.signal
    })
  } catch (e) {
    clearTimeout(to)
    const elapsed = Date.now() - t0
    if (e && (e.name === 'AbortError' || String(e).includes('claude_timeout'))) {
      throw new Error('claude_timeout (' + elapsed + 'ms, model=' + MODEL + ')')
    }
    throw new Error('claude_network (' + elapsed + 'ms) ' + (e && e.message || e))
  }
  clearTimeout(to)
  const elapsed = Date.now() - t0
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error('claude_http_' + res.status + ' (' + elapsed + 'ms) ' + text.slice(0, 200))
  }
  const rawBody = await res.text()
  let data
  try {
    data = JSON.parse(rawBody)
  } catch (e) {
    throw new Error('upstream_not_json (' + elapsed + 'ms) head=' + rawBody.slice(0, 200))
  }

  const stop = data && data.stop_reason
  const blocks = (data && data.content) || []
  const toolUse = blocks.find(b => b && b.type === 'tool_use')
  const textBlock = blocks.find(b => b && b.type === 'text')
  const textLen = (textBlock && textBlock.text && textBlock.text.length) || 0
  console.log('[claude] model=%s elapsed=%dms stop=%s tool=%s textLen=%d',
    MODEL, elapsed, stop, !!toolUse, textLen)

  if (toolUse && toolUse.input && typeof toolUse.input === 'object') {
    return toolUse.input
  }
  // 没有 tool_use（少数代理不支持 tools 时）→ 退回到抽 JSON 逻辑
  const text = (textBlock && textBlock.text) || ''
  const raw = extractJsonBlock(text)
  if (!raw) throw new Error('claude_no_tool_no_json (' + elapsed + 'ms, stop=' + stop + ') head=' + text.slice(0, 300))
  try {
    return JSON.parse(raw)
  } catch (e1) {
    const repaired = repairJson(raw)
    try { return JSON.parse(repaired) }
    catch (e2) {
      throw new Error('claude_bad_json: ' + e2.message + ' | head=' + raw.slice(0, 200))
    }
  }
}

// 从模型输出里抓 JSON：优先识别 ```json ... ``` 围栏；否则取第一个 { 到最后一个 } 之间
function extractJsonBlock(text) {
  if (!text) return null
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence && fence[1]) return fence[1].trim()
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first < 0 || last <= first) return null
  return text.slice(first, last + 1)
}

// 常见 LLM JSON 瑕疵：尾随逗号、中文引号、Python True/False/None
function repairJson(s) {
  return s
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method_not_allowed' }); return }

  try {
    const body = await readBody(req)
    const { action, payload } = body || {}

    if (action === 'recognizeMeal') {
      const { imageDataUrl, textDescription, ...ctx } = payload || {}
      if (!imageDataUrl && !textDescription) {
        return res.status(200).json({ ok: true, source: 'mock', data: MOCK.recognizeMeal })
      }
      try {
        const task = imageDataUrl
          ? '识别照片中的菜品，菜名尽量具体到食材种类（例如"西兰花""菠菜"而不是笼统的"青菜""时蔬"；"红烧排骨"而不是笼统的"肉"），输出菜名、大致份量、食物分类 category 和粗略热量 calories(kcal)。不要输出可信度、不要输出提问。若不确定具体品种，才退回用笼统名称，不确定的项宁可少列。'
          : `根据文字描述估算菜品列表，菜名尽量具体到食材种类（例如"西兰花"而不是笼统的"青菜"），输出菜名、大致份量、食物分类 category 和粗略热量 calories(kcal)。文字描述：${textDescription}`
        const data = await callClaude(
          Object.assign({ task }, ctx),
          'recognizeMeal',
          imageDataUrl ? { imageDataUrl } : {}
        )
        if (data && Array.isArray(data.items) && data.items.length) {
          return res.status(200).json({ ok: true, source: 'claude', data })
        }
      } catch (e) { console.error('recognizeMeal claude error:', e.message) }
      return res.status(200).json({ ok: true, source: 'mock', data: MOCK.recognizeMeal })
    }

    if (action === 'recommend') {
      const enriched = slimRecommendPayload(payload || {})
      const scene = enriched.todayContext && enriched.todayContext.scene
      const loc = (payload && payload.location) || null
      console.log('[recommend] scene=%s hasLoc=%s hasPlacesKey=%s',
        scene, !!(loc && loc.lat && loc.lng), !!process.env.GOOGLE_PLACES_API_KEY)
      const placesForMatching = []
      if (loc && loc.lat && loc.lng && scene === '餐厅') {
        try {
          const places = await fetchNearbyRestaurants(loc, scene)
          console.log('[recommend] nearby places returned:', places.length)
          if (places && places.length) {
            placesForMatching.push(...places)
            const shuffled = [...places].sort(() => Math.random() - 0.5)
            enriched.nearbyPlaces = shuffled.slice(0, 3).map(p => ({
              name: p.name,
              placeId: p.placeId,
              dishes: p.typicalDishes
            }))
          }
        } catch (e) {
          console.error('places api error:', e.message)
        }
      } else {
        console.log('[recommend] skipping places (scene not restaurant/canteen or no location)')
      }
      try {
        const data = await callClaude(enriched, 'recommend', { temperature: 0.5 })
        if (data && Array.isArray(data.picks)) {
          // 把每张推荐卡匹配到对应餐厅的 Google Maps 链接
          for (const pick of data.picks) {
            // 优先用 Claude 直接返回的 placeId
            if (pick.placeId && placesForMatching.some(p => p.placeId === pick.placeId)) {
              pick.mapsUrl = 'https://www.google.com/maps/place/?q=place_id:' + pick.placeId
              console.log('[maps] Claude returned placeId:', pick.placeId)
              continue
            }
            // fallback: 文本匹配
            const dish = pick.dish || ''
            const dishShop = dish.split(/[·・]/)[0].trim()
            console.log('[maps] matching dish:', dish.slice(0, 50), '| shopPart:', dishShop, '| places:', placesForMatching.map(p => p.name).join(' || '))
            for (const pl of placesForMatching) {
              if (!pl.name || !pl.placeId) continue
              const short = pl.name.replace(/[（(][^)）]*[)）]/g, '').replace(/[·・].*/, '').trim()
              const enMatch = pl.name.match(/[（(]([a-zA-Z][^)）]*)[)）]/)
              const enName = enMatch ? enMatch[1].trim() : ''
              // 双向包含 + 前 N 个字匹配
              const head2 = dishShop.slice(0, 2), head3 = dishShop.slice(0, 3)
              const matched = short.includes(dishShop) || dishShop.includes(short)
                || dish.includes(short) || dish.includes(pl.name)
                || (enName && dish.toLowerCase().includes(enName.toLowerCase()))
                || (dishShop && pl.name.includes(dishShop))
                || (head3 && short.includes(head3))
                || (head2 && short.includes(head2))
                || (head2 && pl.name.includes(head2))
              if (matched) {
                pick.mapsUrl = 'https://www.google.com/maps/place/?q=place_id:' + pl.placeId
                console.log('[maps] matched:', dishShop, '->', short, pl.name)
                break
              }
            }
            if (!pick.mapsUrl) {
              console.log('[maps] no match for dishShop:', dishShop)
            }
          }
          // 兜底：匹配失败的卡，从未被使用的 nearbyPlaces 里依次分配
          const usedIds = new Set(data.picks.map(p => p.placeId).filter(Boolean))
          for (const pick of data.picks) {
            if (pick.mapsUrl) continue
            const fallback = placesForMatching.find(p => p.placeId && !usedIds.has(p.placeId))
            if (fallback) {
              pick.mapsUrl = 'https://www.google.com/maps/place/?q=place_id:' + fallback.placeId
              usedIds.add(fallback.placeId)
              console.log('[maps] fallback assigned:', fallback.name)
            }
          }
          const nearbyLinks = placesForMatching.slice(0, 6).map(p => ({
            name: p.name,
            rating: p.rating,
            userRatingCount: p.userRatingCount,
            distanceMeters: p.distanceMeters,
            priceLevel: p.priceLevel,
            openNow: p.openNow,
            address: p.address,
            typicalDishes: p.typicalDishes,
            mapsUrl: p.placeId ? 'https://www.google.com/maps/place/?q=place_id:' + p.placeId : null
          })).filter(l => l.mapsUrl)
          return res.status(200).json({
            ok: true, source: 'claude', data,
            meta: { nearbyPlacesCount: (enriched.nearbyPlaces || []).length, nearbyLinks }
          })
        }
      } catch (e) { console.error('recommend claude error:', e.message) }
      return res.status(200).json({ ok: true, source: 'mock', data: MOCK.recommend })
    }

    if (action === 'dailyNutrition') {
      try {
        const data = await callClaude(
          Object.assign({
            task: '基于用户画像和最近餐食，指出今天需要补充或减少哪几类营养/食物，2~4 条即可，每条给出份量和一句原因。避免使用医疗诊断口吻。'
          }, payload || {}),
          'dailyNutrition'
        )
        if (data && Array.isArray(data.items)) {
          return res.status(200).json({ ok: true, source: 'claude', data })
        }
      } catch (e) { console.error('dailyNutrition claude error:', e.message) }
      return res.status(200).json({ ok: true, source: 'mock', data: MOCK.dailyNutrition })
    }

    if (action === 'party') {
      try {
        const data = await callClaude(
          Object.assign({
            task: '为多人聚餐生成三选一。先合并所有参与者画像：找出共同可吃的菜系；把任一人的过敏和忌口作为硬性排除；预算取多人平均。'
          }, payload || {}),
          'party'
        )
        if (data && Array.isArray(data.picks)) {
          return res.status(200).json({ ok: true, source: 'claude', data })
        }
      } catch (e) { console.error('party claude error:', e.message) }
      return res.status(200).json({ ok: true, source: 'mock', data: MOCK.party })
    }

    if (action === 'chat') {
      try {
        const data = await callClaude(payload || {}, 'chat')
        if (data && (data.reply || data.cards || data.note)) {
          return res.status(200).json({ ok: true, source: 'claude', data })
        }
      } catch (e) { console.error('chat claude error:', e.message) }
      return res.status(200).json({ ok: true, source: 'mock', data: MOCK.chat })
    }

    return res.status(400).json({ ok: false, error: 'unknown_action' })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message || e) })
  }
}

// 精简 recommend payload：只保留 Claude 真正需要的字段，缩短 tokens 和响应时间
function slimRecommendPayload(p) {
  const out = {}
  if (p.profile) {
    const b = p.profile.basic || {}
    const pr = p.profile.prefer || {}
    out.profile = {
      basic: {
        birthYear: b.birthYear,
        diet: b.diet,
        allergies: b.allergies || [],
        taboos: b.taboos || [],
        healthPrefs: b.healthPrefs || []
      },
      prefer: {
        cuisines: pr.cuisines || [],
        spicy: pr.spicy,
        favorites: pr.favorites,
        dislikes: pr.dislikes
      }
    }
  }
  if (p.todayContext) {
    const t = p.todayContext
    out.todayContext = {
      hunger: t.hunger, mood: t.mood, time: t.time,
      scene: t.scene, crave: t.crave, personalNote: t.personalNote,
      budget: t.budget
    }
  }
  if (Array.isArray(p.recentDiary)) {
    out.recentDiary = p.recentDiary.slice(0, 3).map(d => ({
      meal: d.meal,
      items: (d.items || []).map(i => ({ name: i.name, portion: i.portion })),
      deliveryStore: d.deliveryStore,
      feedback: d.feedback ? { score: d.feedback.score, feel: d.feedback.feel } : undefined
    }))
  }
  if (Array.isArray(p.recentStores)) {
    out.recentStores = p.recentStores.slice(0, 3).map(s => ({
      name: s.name, count: s.count, dishes: (s.dishes || []).slice(0, 3)
    }))
  }
  if (p.ageMode) out.ageMode = p.ageMode
  if (p.refineHint) out.refineHint = p.refineHint
  if (p.seed != null) out.seed = p.seed
  if (Array.isArray(p.previousPicks)) {
    out.previousPicks = p.previousPicks.slice(0, 3).map(x => ({ key: x.key, dish: x.dish }))
  }
  return out
}

function enrichPicksWithMapsUrl(picks, places) {
  if (!places || !places.length) return
  picks.forEach(pick => {
    // Claude 直接返回了 nearbyPlaces 里的 placeId
    if (pick.placeId) {
      pick.mapsUrl = 'https://www.google.com/maps/place/?q=place_id:' + pick.placeId
      console.log('[maps] pick has placeId:', pick.placeId)
      return
    }
    // fallback: 用店名模糊匹配
    const dish = pick.dish || ''
    const match = places.find(pl => {
      if (!pl.name) return false
      if (dish.includes(pl.name)) return true
      const shortName = pl.name.replace(/\(.*\)/g, '').replace(/（.*）/g, '').trim()
      return shortName && dish.includes(shortName)
    })
    if (match && match.placeId) {
      pick.mapsUrl = 'https://www.google.com/maps/place/?q=place_id:' + match.placeId
      console.log('[maps] matched by name:', match.name)
    } else {
      console.log('[maps] no match for dish:', dish.slice(0, 40))
    }
  })
}

// ---------------- Google Places (New) ----------------
// 文档：https://developers.google.com/maps/documentation/places/web-service/nearby-search
// 注意用的是 v1 endpoint（新版），FieldMask 精确挑字段控成本
async function fetchNearbyRestaurants(loc, scene) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return []

  // 场景=餐厅：涵盖堂食 + 外卖 + 快餐，3000m 半径（大陆 Google 数据稀疏）
  const radius = 3000
  const includedTypes = ['restaurant', 'meal_takeaway', 'fast_food_restaurant', 'cafe', 'bakery']
  const body = {
    includedTypes,
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: loc.lat, longitude: loc.lng },
        radius
      }
    },
    rankPreference: 'DISTANCE',
    languageCode: 'zh-CN'
  }
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.primaryType',
    'places.types',
    'places.rating',
    'places.userRatingCount',
    'places.priceLevel',
    'places.location',
    'places.formattedAddress',
    'places.currentOpeningHours.openNow'
  ].join(',')

  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fieldMask
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error('places_http_' + res.status + ' ' + text.slice(0, 200))
  }
  const data = await res.json()
  const rawPlaces = (data && data.places) || []
  console.log('[places] google raw count:', rawPlaces.length)

  return rawPlaces
    .filter(p => p && p.location && p.displayName)
    .map(p => {
      const dm = haversineMeters(loc.lat, loc.lng, p.location.latitude, p.location.longitude)
      return {
        placeId: p.id || '',
        name: (p.displayName && p.displayName.text) || '',
        primaryType: p.primaryType || (p.types && p.types[0]) || '',
        types: (p.types || []).slice(0, 4),
        rating: p.rating || null,
        userRatingCount: p.userRatingCount || 0,
        priceLevel: p.priceLevel || null,
        openNow: !!(p.currentOpeningHours && p.currentOpeningHours.openNow),
        address: p.formattedAddress || '',
        distanceMeters: Math.round(dm),
        typicalDishes: dishHintByType(p.primaryType || (p.types && p.types[0]) || '')
      }
    })
    // 大陆 Google Places 覆盖稀疏，放宽评级和评分数阈值
    .filter(p => (p.rating || 0) >= 3.0 && p.userRatingCount >= 3)
    // 排序：先按评分再按距离
    .sort((a, b) => (b.rating - a.rating) || (a.distanceMeters - b.distanceMeters))
    .slice(0, 8)
}

// primary type → 该店大概会有的菜品线索，帮 Claude 判断
function dishHintByType(type) {
  const t = (type || '').toLowerCase()
  const hints = {
    chinese_restaurant: ['家常菜', '面条', '盖饭'],
    japanese_restaurant: ['寿司', '拉面', '定食'],
    korean_restaurant: ['石锅拌饭', '烤肉', '部队锅'],
    italian_restaurant: ['意面', '披萨', '沙拉'],
    thai_restaurant: ['冬阴功', '咖喱', '芒果糯米饭'],
    indian_restaurant: ['咖喱', '烤饼', '香饭'],
    mexican_restaurant: ['塔可', '卷饼', '玉米片'],
    american_restaurant: ['汉堡', '牛排', '沙拉'],
    seafood_restaurant: ['海鲜', '鱼汤'],
    steak_house: ['牛排'],
    sushi_restaurant: ['寿司', '刺身'],
    ramen_restaurant: ['拉面'],
    fast_food_restaurant: ['汉堡', '炸鸡', '薯条'],
    hamburger_restaurant: ['汉堡'],
    pizza_restaurant: ['披萨'],
    cafe: ['咖啡', '三明治', '轻食'],
    bakery: ['面包', '甜点'],
    meal_takeaway: ['盖饭', '面条', '快餐'],
    vegetarian_restaurant: ['素菜', '沙拉']
  }
  return hints[t] || []
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
// ---------------- /Google Places ----------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body)
    let raw = ''
    req.on('data', c => raw += c)
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
  maxDuration: 60
}
