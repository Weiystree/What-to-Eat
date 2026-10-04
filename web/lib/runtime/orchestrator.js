// Agent 编排层：Agent 的"大脑"。根据用户问题自主决定调用哪些工具，拿到结果后继续判断，最终输出结论。
// 由 api/agent.js 的 action==='agent' 消费。

import { callAgent } from './llm.js'
import { buildAgentTools, dispatchTool } from './skills.js'

const AGENT_SYSTEM_PROMPT = `你是 NextMeal 的饮食决策助手。用户用自然语言描述饮食需求，你自主判断需要调用哪些工具来获取结果，最终用自然语言给出结论。

你可以调用以下工具（按需调用，禁止为凑数调用无关工具）：
- meal_recommend：生成单人"三选一"餐食推荐（最合适/最想吃/最省事）。当用户需要"决定这餐吃什么"时调用。
- meal_nutrition：给今日营养建议（该补什么/减少什么）。当用户问"最近吃得怎么样/该补什么"时调用。
- meal_party：多人聚餐方案。当用户明确说"我们几个人一起聚餐"时调用。
- meal_recognize：识别用户吃过的饭菜（照片或文字描述）。当用户上传照片或描述吃过的食物时调用。
- meal_fridge：仅识别冰箱照片并推荐能做的家常菜。当用户上传冰箱照片时调用；没有照片不要调用。
- meal_ingredients：根据用户文字列出的现有食材，推荐能做的家常菜（含还缺什么）。当用户说"家里有X、Y、Z能做啥"时调用。
- meal_memory：按日期/餐次查询历史餐食记录。当用户问"昨天/前天某餐吃了什么"时调用（不要凭 recentDiary 猜）。
- meal_fridge_inventory：读取用户已保存的冰箱清单。当用户问"冰箱里有什么/还有没有X/能不能吃X"时调用。注意它读的是已保存清单，不是识别照片（识别照片用 meal_fridge）。
- meal_expiring_foods：读取冰箱里临期/已过期食材。当用户问"什么快过期/哪些要尽快吃"时调用。

决策规则：
1. 只调用与当前问题相关的工具，不同问题走不同路径；绝不要每次把所有工具都调一遍。
2. 上下文里已包含用户画像(profile)、近期饮食(recentDiary)、今日状态(todayContext)、常吃店铺(recentStores)、定位(location)、年龄模式(ageMode)、冰箱清单(fridge)、图片(imageDataUrl)。调用工具时只传工具要求的最小参数，不要重复携带这些数据。
3. 信息不足时先澄清，不要编造：例如用户想识别饭菜但既没上传照片也没文字描述，就问他；用户要推荐但连基本偏好都没有，可以给出通用建议并说明。
4. 安全硬约束：用户画像里的过敏(allergies)、忌口(taboos)必须硬性排除，任何推荐都不许踩线。
5. 拿到工具结果后，用自然、简洁的中文向用户说明并给结论；结果里已有的结构化数据直接引用，不要重新编造菜名。
6. 用户问历史某餐/某天吃了什么时，调用 meal_memory 查询，不要凭 recentDiary 里的条目直接猜日期；meal_memory 返回为空就如实说没查到。
7. 用户问冰箱里有什么、哪些快过期时，调用 meal_fridge_inventory / meal_expiring_foods，不要自己从上下文里的 fridge 字段心算新鲜度；已过期的食材不要建议食用。工具返回为空就如实说冰箱里没有记录。

最终回复：若需澄清，输出一句问题；否则给出简洁建议。可以纯文字，也可以引用工具返回的推荐卡。`

const MAX_STEPS = 3

export async function runAgent(userText, memory, imageDataUrl) {
  const tools = buildAgentTools()
  const context = { ...(memory || {}) }
  if (imageDataUrl) context.imageDataUrl = imageDataUrl

  const messages = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    { role: 'user', content: `用户说：${userText}\n\n已知上下文（可直接引用，无需再让工具重复携带）：\n${JSON.stringify(context)}` }
  ]

  const trace = []
  let lastData = null

  for (let step = 0; step < MAX_STEPS; step++) {
    let msg
    try {
      msg = await callAgent(messages, tools)
    } catch (e) {
      console.error('[agent] callAgent error:', e.message)
      return { ok: true, source: 'mock', data: { reply: '（暂时无法回答，请稍后再试）', trace } }
    }
    if (!msg) {
      return { ok: true, source: 'mock', data: { reply: '（Agent 未接入，请先配置 LLM_API_KEY）', trace } }
    }

    const toolCalls = (msg.tool_calls || []).filter(t => t && t.function && t.function.name)

    if (toolCalls.length) {
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: toolCalls })
      for (const tc of toolCalls) {
        const name = tc.function.name
        let args = {}
        try { args = JSON.parse(tc.function.arguments || '{}') } catch (e) { args = {} }
        trace.push(name)
        console.log('[agent] step=%d call=%s args=%s', step + 1, name, JSON.stringify(args))
        const result = await dispatchTool(name, args, context)
        if (result && result.ok && result.data) lastData = result.data
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
      }
      continue
    }

    const reply = (msg.content || '').trim() || '（未生成回答）'
    return { ok: true, source: 'llm', data: { ...(lastData || {}), reply, trace } }
  }

  return { ok: true, source: 'llm', data: { ...(lastData || {}), reply: '（已达最大处理步数，请换个问法）', trace } }
}
