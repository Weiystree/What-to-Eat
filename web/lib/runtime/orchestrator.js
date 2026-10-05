// Agent 编排层：Agent 的"大脑"。根据用户问题自主决定调用哪些工具，拿到结果后继续判断，最终输出结论。
// 由 api/agent.js 的 action==='agent' 消费。

import { callAgent } from './llm.js'
import { buildAgentTools, dispatchTool } from './skills.js'

const AGENT_SYSTEM_PROMPT = `你是 NextMeal 的饮食决策助手。用户用自然语言描述饮食需求，你自主判断需要调用哪些工具来获取结果，最终用自然语言给出结论。

你可以调用以下工具（按需调用，禁止为凑数调用无关工具）：
- meal_recommend：生成单人"三选一"餐食推荐（最合适/最想吃/最省事）。用户决定这餐吃什么（外出/一般场景）时调用。
- meal_recommend_home：在家做饭推荐，优先消耗冰箱临期食材，标明"已有/还缺"。冰箱清单已在上下文里，无需参数。用户想"在家做/用冰箱里的东西做饭"时调用。
- meal_recommend_group：和朋友一起吃的推荐（含附近餐厅）。必须先调 meal_friends 拿好友口味，再把所有成员（含我自己，isMe=true）传进 members。
- meal_friends：读取好友列表及他们共享的口味（过敏/忌口/菜系/辣度）。用户提到"和朋友一起吃"或"和某某吃"时先调用它。
- meal_nearby_restaurants：查询附近餐厅。用户想出去吃并关心"附近"时调用。
- meal_nutrition：给今日营养建议（该补什么/减少什么）。用户问"最近吃得怎么样/该补什么"时调用。
- meal_party：多人聚餐方案（在家做场景）。用户明确说"我们几个人聚餐"且不是出去吃时调用。
- meal_recognize：识别用户吃过的饭菜（照片或文字描述）。用户上传照片或描述吃过的食物时调用。
- meal_fridge：仅识别冰箱照片并推荐能做的家常菜。用户上传冰箱照片时调用；没有照片不要调用。
- meal_ingredients：根据用户文字列出的现有食材推荐家常菜（含还缺什么）。用户说"家里有X、Y、Z能做啥"时调用。
- meal_memory：按日期/餐次查询历史餐食记录。用户问"昨天/前天某餐吃了什么"时调用（不要凭 recentDiary 猜）。
- meal_fridge_inventory：读取已保存的冰箱清单。用户问"冰箱里有什么/还有没有X/能不能吃X"时调用。读清单用它，识别照片用 meal_fridge。
- meal_expiring_foods：读取临期/已过期食材。用户问"什么快过期/哪些要尽快吃"时调用。
- meal_add_meal_log：帮用户记录一顿已吃的饭。用户说"帮我记一下我吃了X"时调用；用户可用 date 说明"昨天/前天"吃的。
- meal_add_fridge_item：帮用户把买回来的食材加进冰箱。用户说"我买了X、Y，放冰箱里"时调用。
- meal_remove_fridge_item：帮用户把某样食材从冰箱删除。用户说"把X删了/X吃完了"时调用。

决策规则：
1. 只调用与当前问题相关的工具，不同问题走不同路径；绝不要每次把所有工具都调一遍。
2. 上下文里已包含用户画像(profile)、近期饮食(recentDiary)、今日状态(todayContext)、常吃店铺(recentStores)、定位(location)、年龄模式(ageMode)、冰箱清单(fridge)、好友口味(friends，可能为空)。调用工具时只传工具要求的最小参数，不要重复携带这些数据。
3. 对话历史里标了"（历史）"的是之前几轮，仅供理解指代（如"还是不行""换个方向"）；当前问题才是要处理的。
4. 信息不足时先澄清，不要编造：例如用户想识别饭菜但既没上传照片也没文字描述，就问他；用户要推荐但连基本偏好都没有，可以给出通用建议并说明。
5. 安全硬约束：用户画像和好友共享口味里的过敏(allergies)、忌口(taboos)必须硬性排除，任何推荐都不许踩线。
6. 拿到工具结果后，用自然、简洁的中文向用户说明并给结论；结果里已有的结构化数据直接引用，不要重新编造菜名。
7. 用户问历史某餐/某天吃了什么时，调用 meal_memory 查询，不要凭 recentDiary 里的条目直接猜日期；meal_memory 返回为空就如实说没查到。
8. 用户问冰箱里有什么、哪些快过期时，调用 meal_fridge_inventory / meal_expiring_foods，不要自己从上下文里的 fridge 字段心算新鲜度；已过期的食材不要建议食用。工具返回为空就如实说冰箱里没有记录。
9. 记录/加冰箱/删冰箱这三个写工具只会生成"待确认"的动作，用户在界面上点确认后才会真正写入。所以调用后必须说"我准备好了…，请确认"，绝不能说"已记录/已添加/已删除"。如果一句话包含多个动作，在同一步里一次性并行调用多个工具。工具返回 rejected 时，把原因转告用户并请他补充信息。

最终回复：若需澄清，输出一句问题；否则给出简洁建议。可以纯文字，也可以引用工具返回的推荐卡。`

const MAX_STEPS = 3

export async function runAgent(userText, memory, imageDataUrl, opts = {}) {
  const tools = buildAgentTools()
  const context = { ...(memory || {}) }
  if (imageDataUrl) context.imageDataUrl = imageDataUrl

  // 对话历史（Phase 5）：最近几轮供模型理解指代与追问，最多 8 条
  const history = (Array.isArray(opts.history) ? opts.history : [])
    .filter(h => h && typeof h.text === 'string' && h.text.trim())
    .slice(-8)
  const historyMsgs = []
  for (const h of history) {
    if (h.role === 'user') historyMsgs.push({ role: 'user', content: `（历史）用户说：${h.text.trim()}` })
    else if (h.role === 'assistant') historyMsgs.push({ role: 'assistant', content: h.text.trim() })
  }

  const messages = [
    { role: 'system', content: AGENT_SYSTEM_PROMPT },
    ...historyMsgs,
    { role: 'user', content: `用户说：${userText}\n\n已知上下文（可直接引用，无需再让工具重复携带）：\n${JSON.stringify(context)}` }
  ]

  const trace = []
  let lastData = null
  // 写工具只"提议"：待用户确认的动作单独收集，不走 lastData 单槽位（否则多个动作会互相覆盖）
  const pendingActions = []
  // 无论从哪个出口返回（正常结束 / 步数耗尽 / LLM 出错），已收集的待确认动作都不能丢
  const finish = (source, data) => ({
    ok: true,
    source,
    data: pendingActions.length ? { ...data, pendingActions } : data
  })

  for (let step = 0; step < MAX_STEPS; step++) {
    let msg
    try {
      msg = await callAgent(messages, tools)
    } catch (e) {
      console.error('[agent] callAgent error:', e.message)
      return finish('mock', { reply: '（暂时无法回答，请稍后再试）', trace })
    }
    if (!msg) {
      return finish('mock', { reply: '（Agent 未接入，请先配置 LLM_API_KEY）', trace })
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
        if (result && result.pending) pendingActions.push(result.pending)
        else if (result && result.ok && result.data && result.source !== 'pending') lastData = result.data
        // 回给模型的内容不带 pending 载荷，只带状态（pending_confirmation / rejected）
        const { pending: _omit, ...forModel } = result || {}
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(forModel) })
      }
      continue
    }

    const reply = (msg.content || '').trim() || '（未生成回答）'
    return finish('llm', { ...(lastData || {}), reply, trace })
  }

  return finish('llm', { ...(lastData || {}), reply: '（已达最大处理步数，请换个问法）', trace })
}
