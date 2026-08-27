// 能力执行层：每个 action 对应一个 runner，返回统一信封 { ok, source, data, meta? }。
// 由 api/agent.js（路由）与 lib/runtime/skills.js（Agent 工具分发）消费。

import { callLLM, MOCK } from './llm.js'
import { fetchNearbyRestaurants } from './places.js'

export async function runRecognizeMeal(payload) {
  const { imageDataUrl, textDescription, ...ctx } = payload || {}
  if (!imageDataUrl && !textDescription) {
    return { ok: true, source: 'mock', data: MOCK.recognizeMeal }
  }
  try {
    const task = imageDataUrl
      ? '识别照片中的菜品，菜名尽量具体到食材种类（例如"西兰花""菠菜"而不是笼统的"青菜""时蔬"；"红烧排骨"而不是笼统的"肉"），输出菜名、大致份量、食物分类 category 和粗略热量 calories(kcal)。不要输出可信度、不要输出提问。若不确定具体品种，才退回用笼统名称，不确定的项宁可少列。'
      : `根据文字描述估算菜品列表，菜名尽量具体到食材种类（例如"西兰花"而不是笼统的"青菜"），输出菜名、大致份量、食物分类 category 和粗略热量 calories(kcal)。文字描述：${textDescription}`
    const data = await callLLM(
      Object.assign({ task }, ctx),
      'recognizeMeal',
      imageDataUrl ? { imageDataUrl } : {}
    )
    if (data && Array.isArray(data.items) && data.items.length) {
      return { ok: true, source: 'llm', data }
    }
  } catch (e) { console.error('recognizeMeal llm error:', e.message) }
  return { ok: true, source: 'mock', data: MOCK.recognizeMeal }
}

export async function runRecommend(payload) {
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
    const data = await callLLM(enriched, 'recommend', { temperature: 0.5 })
    if (data && Array.isArray(data.picks)) {
      // 把每张推荐卡匹配到对应餐厅的 Google Maps 链接
      for (const pick of data.picks) {
        // 优先用模型直接返回的 placeId
        if (pick.placeId && placesForMatching.some(p => p.placeId === pick.placeId)) {
          pick.mapsUrl = 'https://www.google.com/maps/place/?q=place_id:' + pick.placeId
          console.log('[maps] model returned placeId:', pick.placeId)
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
      return {
        ok: true, source: 'llm', data,
        meta: { nearbyPlacesCount: (enriched.nearbyPlaces || []).length, nearbyLinks }
      }
    }
  } catch (e) { console.error('recommend llm error:', e.message) }
  return { ok: true, source: 'mock', data: MOCK.recommend }
}

export async function runDailyNutrition(payload) {
  try {
    const data = await callLLM(
      Object.assign({
        task: '基于用户画像和最近餐食，指出今天需要补充或减少哪几类营养/食物，2~4 条即可，每条给出份量和一句原因。避免使用医疗诊断口吻。'
      }, payload || {}),
      'dailyNutrition'
    )
    if (data && Array.isArray(data.items)) {
      return { ok: true, source: 'llm', data }
    }
  } catch (e) { console.error('dailyNutrition llm error:', e.message) }
  return { ok: true, source: 'mock', data: MOCK.dailyNutrition }
}

export async function runParty(payload) {
  try {
    const data = await callLLM(
      Object.assign({
        task: '为多人聚餐生成三选一。先合并所有参与者画像：找出共同可吃的菜系；把任一人的过敏和忌口作为硬性排除；预算取多人平均。'
      }, payload || {}),
      'party'
    )
    if (data && Array.isArray(data.picks)) {
      return { ok: true, source: 'llm', data }
    }
  } catch (e) { console.error('party llm error:', e.message) }
  return { ok: true, source: 'mock', data: MOCK.party }
}

export async function runFridgeToRecipe(payload) {
  const { imageDataUrl, ...ctx } = payload || {}
  if (!imageDataUrl) {
    return { ok: true, source: 'mock', data: MOCK.fridgeToRecipe }
  }
  try {
    const data = await callLLM(
      Object.assign({
        task: '识别冰箱照片中可见的食材，逐个列出名称和新鲜度（新鲜/一般/需尽快用）。然后基于这些食材推荐 2~3 道可以做的家常菜。每道菜说明：为什么推荐（结合食材搭配和用户健康偏好）、用到了哪些冰箱食材、还缺什么（可去买）、大致时间、难度和简要做法。优先推荐能消耗"需尽快用"食材的菜。'
      }, ctx),
      'fridgeToRecipe',
      { imageDataUrl, temperature: 0.4 }
    )
    if (data && Array.isArray(data.ingredients) && Array.isArray(data.dishes)) {
      return { ok: true, source: 'llm', data }
    }
  } catch (e) { console.error('fridgeToRecipe llm error:', e.message) }
  return { ok: true, source: 'mock', data: MOCK.fridgeToRecipe }
}

export async function runChat(payload) {
  try {
    const data = await callLLM(payload || {}, 'chat')
    if (data && (data.reply || data.cards || data.note)) {
      return { ok: true, source: 'llm', data }
    }
  } catch (e) { console.error('chat llm error:', e.message) }
  return { ok: true, source: 'mock', data: MOCK.chat }
}

// 文字食材 → 可做的菜（含还缺什么）。用户说"家里有X、Y、Z能做啥"时走这里。
export async function runIngredients(payload) {
  const ingredients = (payload && typeof payload.ingredients === 'string' && payload.ingredients.trim()) || ''
  if (!ingredients) return { ok: true, source: 'mock', data: MOCK.ingredients }
  try {
    const data = await callLLM(
      Object.assign({
        task: `用户现有食材：${ingredients}。请基于这些食材推荐 2~3 道可做的家常菜（可少量补充常见调料或配菜），每道说明：为什么推荐、用到哪些现有食材、还缺什么（可去买）、大致时间和简要做法。优先推荐能尽量多消耗现有食材、步骤简单的菜。`
      }, payload || {}),
      'ingredients'
    )
    if (data && Array.isArray(data.dishes)) return { ok: true, source: 'llm', data }
  } catch (e) { console.error('ingredients llm error:', e.message) }
  return { ok: true, source: 'mock', data: MOCK.ingredients }
}

// 饮食记忆查询：按日期（今天/昨天/前天/大前天）+ 餐次过滤 recentDiary。确定性、不调 LLM。
export async function runMealMemory(payload) {
  const diary = (payload && Array.isArray(payload.recentDiary)) ? payload.recentDiary : []
  const query = (payload && typeof payload.query === 'string' && payload.query.trim()) || ''
  if (!diary.length || !query) {
    return { ok: true, source: 'memory', data: { query, dayLabel: '', meal: '', count: 0, entries: [] } }
  }
  return { ok: true, source: 'memory', data: matchDiary(diary, query) }
}

function matchDiary(diary, query) {
  const q = String(query)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const t0 = today.getTime()
  const DAY = 24 * 60 * 60 * 1000
  let start = t0, end = t0 + DAY, dayLabel = '今天'
  if (/昨天|昨儿/.test(q)) { start = t0 - DAY; end = t0; dayLabel = '昨天' }
  else if (/前天/.test(q)) { start = t0 - 2 * DAY; end = t0 - DAY; dayLabel = '前天' }
  else if (/大前天/.test(q)) { start = t0 - 3 * DAY; end = t0 - 2 * DAY; dayLabel = '大前天' }

  let meal = ''
  if (/早餐|早饭/.test(q)) meal = '早餐'
  else if (/午餐|午饭|中饭|中午/.test(q)) meal = '午餐'
  else if (/晚餐|晚饭/.test(q)) meal = '晚餐'
  else if (/加餐|夜宵|宵夜|零食/.test(q)) meal = '加餐'

  const entries = diary.filter(d => {
    if (!d) return false
    const ts = Number(d.createdAt || d.ts || 0)
    if (!ts || ts < start || ts >= end) return false
    if (meal && d.meal && !String(d.meal).includes(meal)) return false
    return true
  }).map(d => ({
    meal: d.meal,
    date: d.date || '',
    items: (d.items || []).map(i => ({ name: i.name, portion: i.portion, calories: i.calories })),
    deliveryStore: d.deliveryStore || ''
  }))

  return { query: q, dayLabel, meal, count: entries.length, entries }
}

// 精简 recommend payload：只保留模型真正需要的字段，缩短 tokens 和响应时间
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
