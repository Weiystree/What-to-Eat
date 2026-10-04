// Agent 能力注册表：Agent 可选能力（对应 .claude/skills/* 的运行时映射）。
// 由 lib/runtime/orchestrator.js 消费；runner 来自 lib/runtime/runners.js。

import {
  runRecommend, runDailyNutrition, runParty, runRecognizeMeal, runFridgeToRecipe,
  runIngredients, runMealMemory
} from './runners.js'
import { runFridgeInventory, runExpiringFoods } from './fridgeTools.js'
import { buildAddMealLog, buildAddFridgeItems, buildRemoveFridgeItem } from './agentActions.js'

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
  },
  meal_ingredients: {
    type: 'object',
    properties: {
      ingredients: { type: 'string', description: '用户用文字列出的现有食材，逗号分隔，如"鸡蛋、西兰花、面条"' }
    },
    required: ['ingredients']
  },
  meal_memory: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '用户问的日期/餐次，如"昨天中午""今天晚餐"' }
    },
    required: ['query']
  },
  meal_fridge_inventory: { type: 'object', properties: {} },
  meal_expiring_foods: { type: 'object', properties: {} },
  meal_add_meal_log: {
    type: 'object',
    properties: {
      meal: { type: 'string', enum: ['早餐', '午餐', '加餐', '晚餐', '夜宵'], description: '可选：餐次；用户没说就不要传' },
      items: {
        type: 'array',
        description: '用户吃了的每一项菜品',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '菜名，如"海南鸡饭"' },
            portion: { type: 'string', description: '可选：份量，如"一碗""半份"' }
          },
          required: ['name']
        }
      }
    },
    required: ['items']
  },
  meal_add_fridge_item: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: '用户要放进冰箱的每一样食材',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '食材名，如"鸡胸肉"' },
            quantity: { type: 'number', description: '数量，如 500、3' },
            unit: { type: 'string', description: '单位，如 g、个、盒' },
            storageZone: { type: 'string', enum: ['fridge', 'zero_zone', 'freezer'], description: '存放区：冷藏/零度保鲜/冷冻；不确定就不传' },
            category: { type: 'string', enum: ['staple', 'veg', 'fruit', 'meat', 'seafood', 'egg', 'bean', 'dairy', 'other'], description: '食材分类' }
          },
          required: ['name']
        }
      }
    },
    required: ['items']
  },
  meal_remove_fridge_item: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '要从冰箱删除/标记吃完的食材名，如"鸡蛋"' }
    },
    required: ['name']
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
    description: '仅识别冰箱照片中的食材并标注新鲜度，推荐能用这些食材做的家常菜。当用户上传冰箱照片时调用；没有照片时不要调用。',
    input: AGENT_TOOL_INPUTS.meal_fridge,
    runner: runFridgeToRecipe
  },
  {
    name: 'meal_ingredients',
    description: '根据用户用文字列出的现有食材，推荐能做的家常菜（含还缺什么）。当用户说"家里有X、Y、Z能做啥"时调用。',
    input: AGENT_TOOL_INPUTS.meal_ingredients,
    runner: runIngredients
  },
  {
    name: 'meal_memory',
    description: '按日期/餐次查询用户的历史餐食记录。当用户问"昨天/前天某餐吃了什么"时调用（不要凭记忆猜）。',
    input: AGENT_TOOL_INPUTS.meal_memory,
    runner: runMealMemory
  },
  {
    name: 'meal_fridge_inventory',
    description: '读取用户冰箱里当前所有食材（名称/数量/存放区/新鲜度）。当用户问"冰箱里有什么/还有没有X/能不能吃X"时调用。这是读已保存的清单，不是识别照片。',
    input: AGENT_TOOL_INPUTS.meal_fridge_inventory,
    runner: runFridgeInventory
  },
  {
    name: 'meal_expiring_foods',
    description: '读取冰箱里临期或已过期的食材，按最急排序。当用户问"什么快过期/哪些要尽快吃"时调用。',
    input: AGENT_TOOL_INPUTS.meal_expiring_foods,
    runner: runExpiringFoods
  },
  {
    name: 'meal_add_meal_log',
    description: '帮用户记录一顿已吃的饭。只会生成"待确认"的记录，用户点确认后才会真正写入日记，所以调用后不能说"已记录"。当用户说"帮我记一下我吃了X"时调用；用户只是问问题时不要调用。',
    input: AGENT_TOOL_INPUTS.meal_add_meal_log,
    runner: buildAddMealLog
  },
  {
    name: 'meal_add_fridge_item',
    description: '帮用户把买回来的食材加进冰箱。只会生成"待确认"的动作，用户点确认后才会真正写入冰箱，所以调用后不能说"已加入"。当用户说"我买了X、Y，放冰箱里"时调用。',
    input: AGENT_TOOL_INPUTS.meal_add_fridge_item,
    runner: buildAddFridgeItems
  },
  {
    name: 'meal_remove_fridge_item',
    description: '帮用户把某样食材从冰箱删除。只会生成"待确认"的动作，用户点确认后才会真正删除，如有多个同名食材由用户在卡片里选择，所以调用后不能说"已删除"。当用户说"把X删了/X吃完了"时调用。',
    input: AGENT_TOOL_INPUTS.meal_remove_fridge_item,
    runner: p => buildRemoveFridgeItem(p, p && p.fridge)
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
