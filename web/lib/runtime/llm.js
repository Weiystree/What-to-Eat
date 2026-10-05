// LLM 调用层：模型配置、System Prompt、Mock、Schema、token 上限、
// callLLM（单次强制 schema 输出）与 callAgent（多轮自动 tool 选择）。
// 由 lib/runtime/runners.js 与 lib/runtime/orchestrator.js 消费。

const TEXT_MODEL = process.env.LLM_TEXT_MODEL || 'glm-4-flash'
const VISION_MODEL = process.env.LLM_VISION_MODEL || 'glm-4v-flash'
const LLM_BASE_URL = (process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '')
const LLM_URL = /\/chat\/completions$/.test(LLM_BASE_URL) ? LLM_BASE_URL : LLM_BASE_URL + '/chat/completions'

const SYSTEM_PROMPT = `你是饮食决策助手，帮用户 1 分钟内决定下一餐。推荐依据《中国居民膳食指南》及卫健委食养指南。

=== 硬性安全规则 ===
1. 过敏(allergies)和忌口(taboos)硬排除，绝不推荐。
2. 健康偏好(healthPrefs)为软倾向，向该方向靠拢即可，不必完全避开：
   - "低脂/低饱和脂肪"：单餐脂肪供能比尽量≤25%，少推油炸、肥肉、动物内脏、奶油
   - "低钠/低盐"：少推腌制品、加工肉、高盐酱料，优先推荐清蒸/水煮做法
   - "低糖/控糖"：少推精白米面主食、含糖饮料、甜点，主食可选全谷物替代
   - "低嘌呤"：少推动物内脏、浓肉汤、部分海鲜（贝类/虾蟹）
   - "高蛋白"：适当增加鱼虾、去皮禽肉、豆制品、蛋奶的比例
3. budget 是单餐预算硬约束，三张必须严格在范围内。

=== 推荐结构 ===
4. 单人三卡：最合适(balanced)/最想吃(crave)/最省事(easy)。
5. 三张卡的分工：
   - 最合适(balanced)：优先营养均衡。宏量营养素参考碳水50~60%、脂肪20~30%、蛋白质15~20%。一餐应有主食+优质蛋白+蔬菜，蔬菜不少于一拳。
   - 最想吃(crave)：照顾情绪与口味，允许适度"放纵"但仍守安全线。心情低落/疲惫时偏向温热、暖感、易消化的食物；兴奋/开心时可推丰盛或值得犒劳的选项。若用户有crave明确指向，全部三张均应贴合该方向。
   - 最省事(easy)：优先时间短、获取方便、预算友好，但仍应有蔬菜和蛋白。

=== 食物分级（所有推荐均参考） ===
6. 食物三级参考：
   - 优选（优先推）：全谷物/杂粮饭/薯类、蒸煮类鱼虾、去皮禽肉、瘦肉、豆腐、新鲜蔬菜（尤其深色蔬菜≥一半）、新鲜水果、脱脂/低脂奶、原味坚果
   - 限量（可推但控制频次）：精白米面、带皮禽肉、肥瘦相间畜肉、含糖酸奶、根茎类淀粉蔬菜（土豆/山药）、含盐坚果
   - 不宜（基本不推）：油条/油饼等油炸主食、肥肉/五花肉、动物内脏、加工肉制品（培根/香肠/腊肉）、奶油蛋糕/含人造黄油食品、高糖饮料

=== 烹饪方式优先级 ===
7. 蒸 > 煮 > 炖 > 拌 > 快炒 > 煎 > 炸。reason 中可提及推荐做法。

=== 情绪-食物关联 ===
8. 用户情绪状态(mood)影响推荐方向，尤其体现在 crave 卡：
   - 疲惫：优先暖食、热汤、高蛋白、不油腻，不推油炸
   - 低落：优先温热、口感柔和、微甜可接受，可附一句简短鼓励
   - 开心：正常推荐即可，不需额外干预
   - 兴奋：可推较丰盛或值得犒劳的选项
   - 普通：不特别偏向情绪，按其他维度正常排序
   以上为指导方向，不做硬性匹配。具体仍结合用户画像、近期饮食、场景综合判断。

=== 季节性提示 ===
9. 若当前日期在以下范围内，可轻微倾向对应时令食材（不强求，仍以用户画像和场景为主）：
   - 春(3-5月)：芹菜、芦笋、韭菜、菠菜、春笋
   - 夏(6-8月)：冬瓜、苦瓜、黄瓜、绿豆、鸭肉
   - 秋(9-11月)：百合、银耳、梨、山药、莲藕
   - 冬(12-2月)：羊肉、白萝卜、大白菜、枸杞、红枣

=== 场景特殊规则 ===
10. 餐厅场景（scene为"餐厅"且提供了nearbyPlaces）：dish 格式"店名 · 菜品"，三张必须从 nearbyPlaces 选店。reason 提评分和距离，placeId 填回对应店的 placeId。尽量不同店。signatureDishes 给 2~3 个该店推荐菜品建议（可参考 nearbyPlaces 里的 dishes 提示词发挥），这是建议不是该店真实菜单，非餐厅场景可不填。

=== 在家做饭模式（mode=home 且提供 homeContext 时） ===
10a. 推荐必须优先消耗 homeContext.expiring 里的临期食材（urgent 最优先），reason 里说明"某食材最好今天处理"。
10b. 尽量提高已有食材覆盖率：用足 homeContext.available，少让用户额外买。uses 填这道菜用到的已有食材，missing 填还需要买的。
10c. time 按做饭总时长估（含备菜）；howto 写简要做法；预算按需补购（missing）部分估。
10d. 只能使用 homeContext 提供的食材做已有部分，绝不使用已过期食材（homeContext 里本就不含过期项）。

=== 输出格式 ===
11. refineHint 非空时向该方向靠拢：healthier→显著降低油盐精制碳水比例，增加蔬菜全谷物；tastier→提升偏好匹配度，允许更多用户喜欢的口味。
12. seed 用于变化选择避免与 previousPicks 重复。
13. 输出合法 JSON，通过 tool_use 提交，不要输出 JSON 以外的内容。
14. 识别/估算菜品（recognizeMeal）时，必须给每项 category（枚举：staple/veg/fruit/meat/seafood/egg/bean/dairy/other）和 calories（整数 kcal，粗略估算即可，不确定也给一个合理值而不是留空）。`

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
  chat: { reply: '（Mock 回复）已按你的要求调整。接入真实 Key 后会得到具体分析。' },
  fridgeToRecipe: {
    ingredients: [
      { name: '鸡蛋', freshness: '新鲜' },
      { name: '番茄', freshness: '需尽快用' },
      { name: '青椒', freshness: '一般' },
      { name: '猪肉末', freshness: '新鲜' }
    ],
    dishes: [
      {
        name: '番茄炒蛋',
        reason: '经典家常菜，番茄和鸡蛋搭配酸甜开胃，蛋白质和维生素均衡',
        uses: ['番茄', '鸡蛋'],
        missing: ['葱'],
        time: '10 分钟',
        difficulty: '简单',
        howto: '鸡蛋打散炒熟盛出，番茄切块炒软出汁，倒入鸡蛋翻炒，加盐调味即可'
      },
      {
        name: '青椒肉末',
        reason: '猪肉末和青椒是下饭绝配，操作简单速度快',
        uses: ['青椒', '猪肉末'],
        missing: ['蒜', '生抽'],
        time: '15 分钟',
        difficulty: '简单',
        howto: '热油下肉末炒变色，加料酒去腥，下青椒丝翻炒，加生抽调味出锅'
      },
      {
        name: '番茄肉末面',
        reason: '一锅出，番茄的酸甜和肉末的咸香融入汤汁，主食+蛋白+蔬菜一次搞定',
        uses: ['番茄', '猪肉末'],
        missing: ['面条', '姜'],
        time: '20 分钟',
        difficulty: '简单',
        howto: '肉末炒香盛出，番茄炒出汁加水煮开，下面条煮熟，倒回肉末调味'
      }
    ]
  },
  ingredients: {
    dishes: [
      {
        name: '西兰花鸡蛋面',
        reason: '鸡蛋+西兰花+面条一锅出，主食蛋白蔬菜一次配齐',
        uses: ['鸡蛋', '西兰花', '面条'],
        missing: ['蒜'],
        time: '15 分钟',
        difficulty: '简单',
        howto: '水开下面条，快熟时下西兰花焯一下，另起锅炒鸡蛋，捞出面和西兰花拌匀加盐调味'
      },
      {
        name: '蒜蓉西兰花 + 荷包蛋面',
        reason: '西兰花清炒配荷包蛋，简单营养又清爽',
        uses: ['鸡蛋', '西兰花', '面条'],
        missing: ['蒜'],
        time: '15 分钟',
        difficulty: '简单',
        howto: '面条煮熟，西兰花蒜蓉快炒，另煎荷包蛋，摆盘即可'
      },
      {
        name: '鸡蛋饼 + 清炒西兰花',
        reason: '鸡蛋摊饼当主食，配清炒西兰花，快手又饱腹',
        uses: ['鸡蛋', '西兰花'],
        missing: ['面粉', '葱'],
        time: '20 分钟',
        difficulty: '简单',
        howto: '鸡蛋加面粉调糊摊饼，西兰花快炒，搭配食用'
      }
    ]
  },
  fridgeItems: {
    items: [
      { name: '鸡蛋', category: 'egg', quantity: 6, unit: '个', storageZone: 'fridge', freshness: '新鲜' },
      { name: '西兰花', category: 'veg', quantity: 1, unit: '颗', storageZone: 'fridge', freshness: '需尽快用' },
      { name: '鸡胸肉', category: 'meat', quantity: 300, unit: 'g', storageZone: 'zero_zone', freshness: '一般' }
    ]
  }
}

// 各 action 的 JSON Schema：通过 tool_use 强制模型按 schema 输出
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
              uses:      { type: 'array', items: { type: 'string' }, description: '在家做饭模式：这道菜用到的用户已有食材' },
              missing:   { type: 'array', items: { type: 'string' }, description: '在家做饭模式：还需要买的食材' },
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
  },
  fridgeToRecipe: {
    name: 'submit_fridge_recipe',
    description: '识别冰箱照片中的食材，并推荐能用这些食材做的菜品',
    input_schema: {
      type: 'object',
      properties: {
        ingredients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              freshness: { type: 'string', description: '新鲜/一般/需尽快用' }
            },
            required: ['name', 'freshness']
          }
        },
        dishes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              reason: { type: 'string' },
              uses: { type: 'array', items: { type: 'string' } },
              missing: { type: 'array', items: { type: 'string' } },
              time: { type: 'string' },
              difficulty: { type: 'string' },
              howto: { type: 'string' }
            },
            required: ['name', 'reason', 'uses', 'time']
          }
        }
      },
      required: ['ingredients', 'dishes']
    }
  },
  ingredients: {
    name: 'submit_ingredient_dishes',
    description: '提交基于用户现有食材可做的家常菜（含还缺什么）',
    input_schema: {
      type: 'object',
      properties: {
        dishes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              reason: { type: 'string' },
              uses: { type: 'array', items: { type: 'string' } },
              missing: { type: 'array', items: { type: 'string' } },
              time: { type: 'string' },
              difficulty: { type: 'string' },
              howto: { type: 'string' }
            },
            required: ['name', 'reason', 'uses', 'time']
          }
        }
      },
      required: ['dishes']
    }
  },
  fridgeItems: {
    name: 'submit_fridge_items',
    description: '提交从照片或描述中识别到的食材清单（逐个列出：名称/分类/数量/单位/存放区/新鲜度）',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '食材名称，尽量具体到品种' },
              category: { type: 'string', enum: ['staple', 'veg', 'fruit', 'meat', 'seafood', 'egg', 'bean', 'dairy', 'other'] },
              quantity: { type: 'number' },
              unit: { type: 'string', enum: ['g', 'kg', '个', '盒', '颗', '份', '把', '袋'] },
              storageZone: { type: 'string', enum: ['fridge', 'zero_zone', 'freezer'] },
              freshness: { type: 'string', enum: ['新鲜', '一般', '需尽快用'] }
            },
            required: ['name', 'category']
          }
        }
      },
      required: ['items']
    }
  }
}

// 各 action 的 token 上限：越大越慢，越小越可能被截断
const MAX_TOKENS = {
  recognizeMeal: 400,
  recommend:     250,
  dailyNutrition: 500,
  party:         900,
  chat:           400,
  fridgeToRecipe: 800,
  ingredients:    800,
  fridgeItems:    800
}

async function callLLM(userJson, schemaKey, opts) {
  const key = process.env.LLM_API_KEY
  if (!key) return null
  const schema = SCHEMAS[schemaKey]
  if (!schema) throw new Error('unknown_schema: ' + schemaKey)

  const hasImage = !!(opts && opts.imageDataUrl)
  const model = hasImage ? VISION_MODEL : TEXT_MODEL
  const baseText = `提交结果。数据：${JSON.stringify(userJson)}`
  const maxTokens = hasImage
    ? Math.min((MAX_TOKENS[schemaKey] || 900) + 300, 1024)
    : (MAX_TOKENS[schemaKey] || 900)

  const body = {
    model,
    max_tokens: maxTokens,
    temperature: (opts && opts.temperature != null) ? opts.temperature : 0,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }]
  }

  if (hasImage) {
    // 视觉模型不支持 function calling → 用 JSON 模式 + 注入 schema
    body.response_format = { type: 'json_object' }
    body.messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: opts.imageDataUrl } },
        { type: 'text', text: baseText + '\n\n请严格输出一个符合以下 JSON Schema 的 JSON 对象（不要输出 JSON 以外的任何文字）：\n' + JSON.stringify(schema.input_schema) }
      ]
    })
  } else {
    // 文字模型用 function calling 强约束 schema
    body.tools = [{ type: 'function', function: { name: schema.name, description: schema.description, parameters: schema.input_schema } }]
    body.tool_choice = { type: 'function', function: { name: schema.name } }
    body.messages.push({ role: 'user', content: baseText })
  }

  const headers = {
    'content-type': 'application/json',
    'authorization': 'Bearer ' + key
  }

  // 硬超时：留 2s 给 JSON 解析和 Vercel 网关响应（maxDuration=60s）
  const abort = new AbortController()
  const timeoutMs = (opts && opts.timeoutMs) || 58000
  const to = setTimeout(() => abort.abort('llm_timeout'), timeoutMs)

  const t0 = Date.now()
  let res
  try {
    res = await fetch(LLM_URL, {
      method: 'POST', headers, body: JSON.stringify(body),
      signal: abort.signal
    })
  } catch (e) {
    clearTimeout(to)
    const elapsed = Date.now() - t0
    if (e && (e.name === 'AbortError' || String(e).includes('llm_timeout'))) {
      throw new Error('llm_timeout (' + elapsed + 'ms, model=' + model + ')')
    }
    throw new Error('llm_network (' + elapsed + 'ms) ' + (e && e.message || e))
  }
  clearTimeout(to)
  const elapsed = Date.now() - t0
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error('llm_http_' + res.status + ' (' + elapsed + 'ms) ' + errText.slice(0, 200))
  }
  const rawBody = await res.text()
  let data
  try {
    data = JSON.parse(rawBody)
  } catch (e) {
    throw new Error('upstream_not_json (' + elapsed + 'ms) head=' + rawBody.slice(0, 200))
  }

  const choice = (data && data.choices && data.choices[0]) || {}
  const stop = choice.finish_reason
  const msg = choice.message || {}
  const toolCall = (msg.tool_calls && msg.tool_calls[0]) || null
  const content = msg.content || ''
  const contentLen = typeof content === 'string' ? content.length : 0
  console.log('[llm] model=%s elapsed=%dms stop=%s tool=%s contentLen=%d',
    model, elapsed, stop, !!toolCall, contentLen)

  // 优先取 function calling 返回的 arguments
  if (toolCall && toolCall.function && toolCall.function.arguments) {
    const args = String(toolCall.function.arguments)
    try { return JSON.parse(args) } catch (e1) { /* 解析失败则走下面的 JSON 抽取 */ }
  }
  // 视觉模型 / JSON 模式：从文本里抽 JSON
  const raw = extractJsonBlock(typeof content === 'string' ? content : '')
  if (!raw) throw new Error('llm_no_json (' + elapsed + 'ms, stop=' + stop + ') head=' + String(content).slice(0, 300))
  try {
    return JSON.parse(raw)
  } catch (e1) {
    const repaired = repairJson(raw)
    try { return JSON.parse(repaired) }
    catch (e2) {
      throw new Error('llm_bad_json: ' + e2.message + ' | head=' + raw.slice(0, 200))
    }
  }
}

// 多轮 Agent 调用：messages 为完整对话（含 role:assistant/tool），tools 为可选工具列表，
// tool_choice 用 auto 让模型自主决定是否调用。返回 assistant message（含 content / tool_calls）。
async function callAgent(messages, tools) {
  const key = process.env.LLM_API_KEY
  if (!key) return null
  const body = {
    model: TEXT_MODEL,
    max_tokens: 1000,
    temperature: 0.3,
    messages,
    tools: (tools || []).map(t => ({ type: 'function', function: t.function })),
    tool_choice: 'auto'
  }
  const headers = {
    'content-type': 'application/json',
    'authorization': 'Bearer ' + key
  }
  const abort = new AbortController()
  const timeoutMs = 58000
  const to = setTimeout(() => abort.abort('agent_timeout'), timeoutMs)
  const t0 = Date.now()
  let res
  try {
    res = await fetch(LLM_URL, { method: 'POST', headers, body: JSON.stringify(body), signal: abort.signal })
  } catch (e) {
    clearTimeout(to)
    const elapsed = Date.now() - t0
    if (e && (e.name === 'AbortError' || String(e).includes('agent_timeout'))) {
      throw new Error('agent_timeout (' + elapsed + 'ms)')
    }
    throw new Error('agent_network (' + elapsed + 'ms) ' + (e && e.message || e))
  }
  clearTimeout(to)
  const elapsed = Date.now() - t0
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error('agent_http_' + res.status + ' (' + elapsed + 'ms) ' + errText.slice(0, 200))
  }
  const rawBody = await res.text()
  let data
  try { data = JSON.parse(rawBody) } catch (e) {
    throw new Error('agent_not_json (' + elapsed + 'ms) head=' + rawBody.slice(0, 200))
  }
  const choice = (data && data.choices && data.choices[0]) || {}
  return choice.message || { role: 'assistant', content: '' }
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

export { callLLM, callAgent, MOCK }
