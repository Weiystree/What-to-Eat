// Agent 评估测试集：15 条符合 NextMeal 定位的真实用户自然语言问题。
// 每条定义：用户输入 / 真正想解决的问题 / 期望处理方式 / 允许(期望)工具 / 禁用工具 / 附加 memory 覆盖 / 图片。
//
// 注意：expected = 至少应调用的工具（空数组 = 期望"不调用任何工具，直接澄清或读上下文"）
//       forbidden = 绝不应调用的工具
// 判断在 run.mjs 里做：expected 缺失 → 失败；forbidden 命中 → 失败；额外工具 → 警告。

// 1x1 透明 PNG，仅用于验证"工具路由"是否走对（图片内容识别不在本次评估范围）
export const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

// 相对时间戳，供 meal_memory 按"昨天/前天"匹配
const NOW = Date.now()
const DAY = 86400000

// 统一用户画像：对花生过敏、忌香菜、控糖、中辣、爱川菜粤菜日料、讨厌苦瓜
export const BASE_MEMORY = {
  profile: {
    basic: {
      birthYear: 1998,
      diet: 'omnivore',
      allergies: ['花生'],
      taboos: ['香菜'],
      healthPrefs: ['控糖']
    },
    prefer: {
      cuisines: ['川菜', '粤菜', '日料'],
      spicy: '中辣',
      favorites: ['番茄炒蛋'],
      dislikes: ['苦瓜']
    }
  },
  ageMode: 'young',
  recentDiary: [
    { meal: '午餐', createdAt: NOW - DAY, date: '昨天', items: [{ name: '宫保鸡丁', portion: '一份' }, { name: '米饭', portion: '两拳' }], feedback: { score: 3 } },
    { meal: '晚餐', createdAt: NOW - DAY, date: '昨天', items: [{ name: '麻辣烫', portion: '一份' }, { name: '米饭', portion: '一拳' }] },
    { meal: '午餐', createdAt: NOW - 2 * DAY, date: '前天', items: [{ name: '红烧肉', portion: '一拳' }, { name: '米饭', portion: '两拳' }] },
    { meal: '晚餐', createdAt: NOW - 2 * DAY, date: '前天', items: [{ name: '炸鸡', portion: '两块' }, { name: '薯条', portion: '一份' }] }
  ],
  todayContext: {
    hunger: 4,
    mood: '一般',
    time: '晚餐',
    scene: '在家',
    crave: '清淡',
    budget: 50,
    personalNote: ''
  },
  recentStores: [
    { name: '老王盖饭', count: 3, dishes: ['宫保鸡丁', '鱼香肉丝', '番茄炒蛋'] }
  ],
  location: { lat: 39.9042, lng: 116.4074, label: '家' },
  // 客户端 getFridgeSnapshot() 的形状：新鲜度已在本地算好
  fridge: [
    { id: 'f1', name: '鸡胸肉', quantity: 300, unit: 'g', storageZone: 'zero_zone', status: 'urgent', daysLeft: 0 },
    { id: 'f2', name: '西兰花', quantity: 1, unit: '颗', storageZone: 'fridge', status: 'use_soon', daysLeft: 2 },
    { id: 'f3', name: '鸡蛋', quantity: 6, unit: '个', storageZone: 'fridge', status: 'fresh', daysLeft: 20 },
    { id: 'f4', name: '牛奶', quantity: 1, unit: '盒', storageZone: 'fridge', status: 'expired', daysLeft: -2 }
  ]
}

export const CASES = [
  {
    id: 'c1',
    category: '下一餐不知道吃什么',
    input: '今天晚餐完全没想法，帮我决定吃啥吧',
    problem: '选择困难，需要一个明确的、可执行的单人晚餐方案',
    expected: ['meal_recommend'],
    forbidden: ['meal_party', 'meal_recognize', 'meal_fridge']
  },
  {
    id: 'c2',
    category: '即时状态·疲惫不想做饭',
    input: '今天好累，实在不想做饭了，给我点最快能吃的',
    problem: '状态疲惫，要"最省事"的餐食，且不用自己动手',
    expected: ['meal_recommend'],
    forbidden: ['meal_party', 'meal_recognize', 'meal_fridge'],
    memoryOverride: { todayContext: { hunger: 5, mood: '累', time: '晚餐', scene: '在家', crave: '随便', budget: 60, personalNote: '很累不想做饭' } }
  },
  {
    id: 'c3',
    category: '想吃清淡健康',
    input: '最近上火，想吃点清淡健康又不难做的',
    problem: '需要"健康/清淡"方向的餐食建议',
    expected: ['meal_recommend'],
    forbidden: ['meal_party', 'meal_recognize', 'meal_fridge']
  },
  {
    id: 'c4',
    category: '近期饮食健康担忧',
    input: '我最近是不是吃得太油腻了？给我点建议',
    problem: '想了解近期饮食的营养/健康评估与调整建议',
    expected: ['meal_nutrition'],
    forbidden: ['meal_party', 'meal_recognize', 'meal_fridge']
  },
  {
    id: 'c5',
    category: '饮食重复',
    input: '我发现最近天天都吃差不多，是不是该换换了？',
    problem: '想识别饮食是否重复/单一，并获得多样化建议（潜在 gap：饮食模式分析）',
    expected: ['meal_nutrition'],
    forbidden: ['meal_party', 'meal_recognize', 'meal_fridge']
  },
  {
    id: 'c6',
    category: '饮食记忆查询',
    input: '我昨天中午吃了什么来着？',
    problem: '想查历史某餐的具体记录，应调用 meal_memory 按日期/餐次查询',
    expected: ['meal_memory'],
    forbidden: ['meal_recommend', 'meal_party', 'meal_recognize', 'meal_fridge', 'meal_nutrition', 'meal_ingredients']
  },
  {
    id: 'c7',
    category: '文字描述现有食材',
    input: '家里有鸡蛋、西兰花和面条，能做什么菜？',
    problem: '想基于手头食材得到可做的菜谱，应调用 meal_ingredients 输出可做的菜 + 还缺什么',
    expected: ['meal_ingredients'],
    forbidden: ['meal_party', 'meal_recognize', 'meal_fridge', 'meal_memory', 'meal_nutrition']
  },
  {
    id: 'c8',
    category: '文字描述吃过的一餐',
    input: '我中午吃了半碗米饭、一份西兰花炒虾仁，帮我记一下热量',
    problem: '估算并记录一顿已吃餐食的热量/分类',
    expected: ['meal_recognize'],
    forbidden: ['meal_party', 'meal_fridge']
  },
  {
    id: 'c9',
    category: '菜品图片识别',
    input: '我刚拍了一盘菜，帮我看看这是什么、多少热量',
    problem: '识别菜品照片的菜名/热量',
    expected: ['meal_recognize'],
    forbidden: ['meal_party', 'meal_fridge'],
    image: TINY_PNG
  },
  {
    id: 'c10',
    category: '冰箱图片识别',
    input: '拍了下冰箱，里面这些东西能做啥？',
    problem: '识别冰箱食材并推荐可做的家常菜',
    expected: ['meal_fridge'],
    forbidden: ['meal_party', 'meal_recognize'],
    image: TINY_PNG
  },
  {
    id: 'c11',
    category: '多人聚餐',
    input: '我们三个人今晚聚餐，帮我们定吃什么',
    problem: '为多人聚餐生成兼顾各人口味的方案',
    expected: ['meal_party'],
    forbidden: ['meal_recognize', 'meal_fridge', 'meal_nutrition']
  },
  {
    id: 'c12',
    category: '多人聚餐·预算+口味',
    input: '四个人聚餐，人均 60 左右，有人不吃辣，来个大家都行的方案',
    problem: '带预算约束和忌口约束的聚餐方案',
    expected: ['meal_party'],
    forbidden: ['meal_recognize', 'meal_fridge', 'meal_nutrition'],
    memoryOverride: { todayContext: { hunger: 4, mood: '期待', time: '晚餐', scene: '聚餐', crave: '', budget: 60, personalNote: '四个人，有人不吃辣' } }
  },
  {
    id: 'c13',
    category: '信息不足需澄清',
    input: '帮我识别一下我吃的东西',
    problem: '想识别食物但既没图也没描述，应澄清而不是编造',
    expected: [],
    forbidden: ['meal_recommend', 'meal_party', 'meal_nutrition', 'meal_recognize', 'meal_fridge']
  },
  {
    id: 'c14',
    category: '过敏硬排除',
    input: '随便推荐点下饭的，但提醒你我对花生过敏',
    problem: '推荐时必须硬性排除花生（安全硬约束）',
    expected: ['meal_recommend'],
    forbidden: ['meal_party', 'meal_recognize', 'meal_fridge'],
    checkAllergen: ['花生']
  },
  {
    id: 'c16',
    category: '冰箱·临期查询',
    input: '我冰箱里有什么快过期了？',
    problem: '想知道哪些已保存的食材要尽快吃，应读冰箱清单而不是识别照片',
    expected: ['meal_expiring_foods'],
    forbidden: ['meal_fridge', 'meal_recognize', 'meal_party']
  },
  {
    id: 'c17',
    category: '冰箱·库存查询',
    input: '我冰箱里现在还有鸡蛋吗？',
    problem: '查已保存清单里有没有某样食材，应读冰箱清单',
    expected: ['meal_fridge_inventory'],
    forbidden: ['meal_fridge', 'meal_recognize', 'meal_party']
  },
  {
    id: 'c18',
    category: '写入·加冰箱（待确认）',
    input: '我昨天买了500克鸡胸肉和三个番茄，帮我放冰箱里',
    problem: '应只生成待确认的加冰箱动作，不能直接说已加入',
    expected: ['meal_add_fridge_item'],
    forbidden: ['meal_fridge', 'meal_recognize', 'meal_party', 'meal_recommend'],
    expectPending: 'addFridgeItems',
    forbidReplyPhrases: ['已加入', '已添加', '已放入']
  },
  {
    id: 'c19',
    category: '写入·记录一餐（待确认）',
    input: '帮我记录一下，我刚吃了一份海南鸡饭',
    problem: '应只生成待确认的记录动作，不能直接说已记录',
    expected: ['meal_add_meal_log'],
    forbidden: ['meal_fridge', 'meal_party', 'meal_recommend'],
    expectPending: 'addMealLog',
    forbidReplyPhrases: ['已记录', '已为你记录', '已经记录']
  },
  {
    id: 'c20',
    category: '写入·删冰箱（多候选）',
    input: '帮我把冰箱里的鸡蛋删了',
    problem: '冰箱里有同名食材时应生成带候选的删除动作，由用户选择',
    expected: ['meal_remove_fridge_item'],
    forbidden: ['meal_fridge', 'meal_recognize', 'meal_party', 'meal_recommend'],
    expectPending: 'removeFridgeItem',
    memoryOverride: {
      fridge: [
        { id: 'f3', name: '鸡蛋', quantity: 6, unit: '个', storageZone: 'fridge', status: 'fresh', daysLeft: 20 },
        { id: 'f9', name: '鸡蛋', quantity: 2, unit: '个', storageZone: 'freezer', status: 'good', daysLeft: 5 }
      ]
    },
    forbidReplyPhrases: ['已删除', '已经删除', '已移除']
  },
  {
    id: 'c21',
    category: '写入·只是提问不该写',
    input: '冰箱里的鸡蛋还能放几天？',
    problem: '只是询问，不该生成任何写入动作',
    expected: ['meal_fridge_inventory'],
    forbidden: ['meal_add_fridge_item', 'meal_remove_fridge_item', 'meal_add_meal_log', 'meal_fridge'],
    expectNoPending: true
  },
  {
    id: 'c15',
    category: '闲聊兜底',
    input: '你好呀，今天天气不错',
    problem: '非饮食需求，应友好回应而非调用任何工具',
    expected: [],
    forbidden: ['meal_recommend', 'meal_party', 'meal_recognize', 'meal_fridge', 'meal_nutrition']
  }
]
