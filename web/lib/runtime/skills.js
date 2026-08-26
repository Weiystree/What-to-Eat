// Agent 能力注册表：Agent 可选能力（对应 .claude/skills/* 的运行时映射）。
// 由 lib/runtime/orchestrator.js 消费；runner 来自 lib/runtime/runners.js。

import {
  runRecommend, runDailyNutrition, runParty, runRecognizeMeal, runFridgeToRecipe
} from './runners.js'

// 每个 skill 的 tool 输入（最小参数；重数据如 profile/recentDiary 由 orchestrator 注入 memory）
const AGENT_TOOL_INPUTS = {
  meal_recommend: {
    type: 'object',
    properties: {
      refineHint: { type: 'string', enum: ['healthier', 'tastier'], description: '可选：让推荐更健康或更合口味' },
      note: { type: 'string', description: '可选：用户本次额外诉求，如"家里有鸡蛋西兰花面条"' }
    }
  },
  meal_nutrition: {
    type: 'object',
    properties: {
      focus: { type: 'string', description: '可选：用户特别关心的方面，如"最近吃太重复"' }
    }
  },
  meal_party: {
    type: 'object',
    properties: {
      scene: { type: 'string', description: '可选：聚餐场景' },
      budget: { type: 'string', description: '可选：人均预算，如"人均 60 元"' }
    }
  },
  meal_recognize: {
    type: 'object',
    properties: {
      textDescription: { type: 'string', description: '用户用文字描述吃过的食物（仅在无照片时传）' }
    }
  },
  meal_fridge: {
    type: 'object',
    properties: {
      note: { type: 'string', description: '可选：用户对冰箱食材的补充说明' }
    }
  }
}

const SKILL_REGISTRY = [
  {
    name: 'meal_recommend',
    description: '生成单人"三选一"餐食推荐（最合适/最想吃/最省事），结合画像与今日状态。当用户需要"决定这餐吃什么"时调用。',
    input: AGENT_TOOL_INPUTS.meal_recommend,
    runner: runRecommend
  },
  {
    name: 'meal_nutrition',
    description: '基于用户画像和最近餐食，给出今天该补充或减少的营养/食物类别。当用户问"最近吃得怎么样/该补什么"时调用。',
    input: AGENT_TOOL_INPUTS.meal_nutrition,
    runner: runDailyNutrition
  },
  {
    name: 'meal_party',
    description: '合并多位参与者的画像，为多人聚餐生成三张方案（最适合所有人/最有趣/最方便）。当用户明确说"几个人聚餐"时调用。',
    input: AGENT_TOOL_INPUTS.meal_party,
    runner: runParty
  },
  {
    name: 'meal_recognize',
    description: '识别用户吃过的饭菜（照片或文字描述），输出菜名、份量、分类与粗略热量。当用户上传照片或描述吃过的食物时调用。',
    input: AGENT_TOOL_INPUTS.meal_recognize,
    runner: runRecognizeMeal
  },
  {
    name: 'meal_fridge',
    description: '识别冰箱照片中的食材并标注新鲜度，推荐能用现有食材做的家常菜。当用户上传冰箱照片时调用。',
    input: AGENT_TOOL_INPUTS.meal_fridge,
    runner: runFridgeToRecipe
  }
]

function buildAgentTools() {
  return SKILL_REGISTRY.map(s => ({
    type: 'function',
    function: { name: s.name, description: s.description, parameters: s.input }
  }))
}

async function dispatchTool(name, args, context) {
  const skill = SKILL_REGISTRY.find(s => s.name === name)
  if (!skill) return { ok: false, error: 'unknown_tool: ' + name }
  // 合并：memory（重数据）在下，args（模型传的最小参数）在上
  const merged = { ...(context || {}), ...(args || {}) }
  // note 是给 recommend 的额外诉求，折叠进 todayContext.personalNote
  if (args && typeof args.note === 'string' && args.note.trim()) {
    merged.todayContext = { ...(merged.todayContext || {}), personalNote: args.note.trim() }
  }
  try {
    return await skill.runner(merged)
  } catch (e) {
    console.error('[skills] dispatch error:', name, e && e.message)
    return { ok: false, error: String(e && e.message || e) }
  }
}

export { SKILL_REGISTRY, buildAgentTools, dispatchTool }
