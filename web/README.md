# 饮食决策 Agent · H5 Web 版

一个帮用户在 1 分钟内决定"下一餐吃什么"的 Web 应用。
Vue 3 + Vite 单页 + Vercel Serverless（`/api/agent`）+ OpenAI 兼容 LLM（智谱 BigModel）。

**在线体验：** 部署到 Vercel 后拿到的 `https://xxx.vercel.app` 就是可提交的作品链接，评委浏览器直接打开即可。

---

## 一、产品是什么

### 一句话
记住用户最近吃过什么、了解用户今天状态，并持续调整下一餐推荐的**饮食决策 Agent**。

### 核心主张
> 吃得开心，吃得放心，吃得省心。
> Enjoy Every Bite. Trust Every Choice. Skip the Stress.

不做严格节食、不粗暴地把食物分成"健康 / 不健康"，而是在 **安全、营养、口味、情绪、便利** 五个维度之间帮用户快速拍板。

### 核心闭环
```
基础问卷 → 每日状态（含个性化补充） → 拍照 → Agent 识别候选 → 用户确认/自填 →
Agent 结合画像+状态+近期饮食+外卖店铺 → 三选一推荐 →
用户「换一批（更健康/更符合口味）」精调 → 就吃这个 → 饭后反馈 → 更新日记
```

### 也支持
- **持久化冰箱**：冷藏 / 零度保鲜 / 冷冻三区食材清单，确定性保质期规则算新鲜度，拍照 / 手动 / 告诉 Agent 三种录入，「用它做点什么」→ 做完自动扣减库存
- **Food Agent**：自然语言入口（`/agent`），LLM 自主选工具（推荐 / 营养 / 聚餐 / 识别 / 冰箱 / 食材做菜 / 历史查询）
- **聚餐场景**：多人合并画像 → 生成三张聚餐方案（最适合所有人 / 最有趣 / 最方便）
- **饭搭子**：邀请码加好友 + 好友间晒饭动态（跨设备，走 Upstash Redis）
- **画像分享**：一键导出为 `MEAL1:` 编码文本，朋友粘贴即可用你的偏好

> 产品主线与 V2 重构目标见 [v2.md](./v2.md)；当前完成度见下方「十一、当前进度」。

### 明确不做（第一版）
- 家庭健康管理、疾病治疗菜单、医学诊断
- 精确到卡路里个位数的营养估算
- 自动减重计划

---

## 二、页面清单

底部五个 Tab：`今日 | 冰箱 | 日记 | 饭搭子 | 我的`。所有页面在 `web/src/views/` 下。

| 路由 | 文件 | 作用 |
| --- | --- | --- |
| `/onboarding/brand` | Brand.vue | 品牌介绍，正式建档 / 先体验 |
| `/onboarding/basic` | Basic.vue | 基础信息 + **可自定义添加**过敏原和忌口 |
| `/onboarding/prefer` | Prefer.vue | 口味场景：菜系、辣度、用餐方式、单餐预算 |
| `/today` | Today.vue | **今日 Tab**。两个入口：「下一餐想怎么吃」（在家做/出去吃）+「记录这一餐」（拍照/手动/告诉 Agent）+ 今日营养 + 临期提醒 |
| `/capture/confirm` | Confirm.vue | 拍照后确认：勾选正确候选或自填 + 餐次 + 外卖店铺 |
| `/recommend` | RecommendList.vue | 三张推荐卡 + "更健康/更符合口味/直接换一批"三档换 |
| `/recommend/detail` | RecommendDetail.vue | 单张卡详情 + 追问区 + "就吃这个" |
| `/recommend/feedback` | Feedback.vue | 饭后 4 项快评；"其他"选中时可写具体感受 |
| `/fridge` | Fridge.vue | **冰箱 Tab**。分区食材清单 + 新鲜度 + 拍/手动/告诉 Agent 录入 + 「用它做点什么」→ 完成扣减 |
| `/diary` | Diary.vue | **日记 Tab**。本周概览（种类数 + 每日热量柱状图）+ 每餐记录（编辑/删除） |
| `/partner` | Partner.vue | **饭搭子 Tab**。聚餐「帮我们决定」+ 好友邀请码/晒饭动态流 |
| `/mine` | Mine.vue | **我的 Tab**。画像 + 导出/导入 + 接入状态 + 清空 |
| `/agent` | Agent.vue | **Food Agent 对话页**（非 Tab）。从今日页悬浮按钮进入，调 `action: 'agent'` |

> `/party`、`/community` 旧路由已重定向到 `/partner`；旧的 `Party.vue` / `Community.vue` 已删除，功能并入 `Partner.vue`。

未 `onboarded` 的用户任何路径都会被 `router.beforeEach` 拦到 `/onboarding/brand`。

---

## 三、目录结构

```
web/
├─ index.html                      入口
├─ package.json                    vue 3 / vue-router / vite / @upstash/redis
├─ vite.config.js
├─ vercel.json                     SPA 回退：非 /api 都指向 index.html
├─ .env.example                    环境变量样板
├─ api/
│  └─ agent.js                     Vercel Serverless 入口：按 action 分发 + 社区(Redis)就地处理
├─ lib/runtime/                    后端运行时（被 api/agent.js 与 eval 共用）
│  ├─ runners.js                   各 action 的执行器（recommend / recognizeMeal / fridgeItems / ingredients / mealMemory …）
│  ├─ llm.js                       callLLM（Function Calling / JSON Mode）+ callAgent（多轮 tool calling）+ schema
│  ├─ orchestrator.js              Agent 编排：System Prompt + 最多 3 步 tool 循环，返回 reply + trace
│  ├─ skills.js                    Agent 工具注册表（7 个 skill ↔ runner）
│  └─ places.js                    Google Places 附近餐厅
├─ .claude/skills/                 meal-* 技能说明（recommend / nutrition / party / recognize / fridge / chat）
├─ eval/                           Agent 工具路由评估（见十二）
│  ├─ cases.mjs                    15 条用例 + 统一虚拟用户 BASE_MEMORY
│  ├─ run.mjs                      本地执行器（直接调 orchestrator）
│  └─ run-http.mjs                 线上执行器（POST 已部署 /api/agent）
├─ v2.md                           V2 产品重构规格
└─ src/
   ├─ main.js                      挂载 App、注册 router、引入全局样式
   ├─ App.vue                      顶层容器 + <TabBar>
   ├─ router.js                    hash 路由 + 未 onboarded 拦截
   ├─ components/TabBar.vue        今日/冰箱/日记/饭搭子/我的
   ├─ services/
   │  ├─ agent.js                  统一 fetch → /api/agent；失败降级本地 mock
   │  ├─ store.js                  localStorage 封装（key 单一登记 ALL_KEYS）+ formatDateKey + 画像导出/导入 + 店铺聚合
   │  ├─ shelfLife.js              冰箱保质期/新鲜度（确定性规则，无 LLM）+ deductInventory 扣减
   │  └─ mealTime.js               餐次推断 guessMeal / guessNextMeal（全站唯一实现）
   ├─ styles/global.css            设计系统
   └─ views/                       13 个页面文件（见上表）
```

---

## 四、系统架构

### 4.1 三层结构

```
┌─────────────────────────────────────────────────────┐
│  前端 (静态 SPA, 部署在 Vercel Edge Network)          │
│  Vue 3 + vue-router + localStorage                  │
│  ─ 只做 UI + 本地状态；一切"智能"都通过 fetch 请求后端│
└──────────────────┬──────────────────────────────────┘
                   │  POST /api/agent
                   │  { action, payload }
                   ▼
┌─────────────────────────────────────────────────────┐
│  Serverless Function (Node runtime, /api/agent.js)   │
│  ─ 唯一入口，按 action 路由                          │
│  ─ 持有 LLM_API_KEY（前端永远看不到）                 │
│  ─ OpenAI 兼容 /chat/completions（智谱 BigModel）    │
│  ─ 社区功能走 Upstash Redis（REST）                  │
│  ─ 所有 action 失败自动兜底 Mock，UI 永远不白屏       │
└──────────────┬──────────────────┬───────────────────┘
               │                  │
   POST /chat/completions   Upstash Redis (REST)
               ▼                  ▼
┌──────────────────────┐  ┌──────────────────────┐
│  智谱 BigModel        │  │  社区好友/动态存储      │
│  text: glm-4-flash    │  │  （可选，未配置降 Mock）│
│  vision: glm-4v-flash │  │                      │
└──────────────────────┘  └──────────────────────┘
```

### 4.2 LLM 调用策略（关键）

后端统一通过 OpenAI 兼容的 `/chat/completions` 调 LLM，按"是否有图片"切两种模式：

| 场景 | 模型 | 机制 |
| --- | --- | --- |
| 纯文本（recommend / dailyNutrition / party / chat） | `glm-4-flash` | **Function Calling**：把 schema 转成 tool，`tool_choice` 强制调用，严格保证 JSON 结构 |
| 含图片（recognizeMeal / fridgeToRecipe / fridgeItems） | `glm-4v-flash` | **JSON Mode**：`glm-4v-flash` 不支持 function calling，改用 `response_format: {type:"json_object"}` + 把 schema 写进 user message |

两种模式都走 `callLLM(userJson, schemaKey, opts)`，返回后统一 `extractJsonBlock` + `repairJson` 兜底解析。

### 4.3 全部 action

| action | 触发页面 | 说明 | 数据来源 |
| --- | --- | --- | --- |
| `recognizeMeal` | Today 拍照 | 识别菜品+份量，附 category/calories | llm（vision） |
| `fridgeToRecipe` | （旧流程，保留兼容） | 识别冰箱食材 + 推荐 2~3 道菜 | llm（vision） |
| `fridgeItems` | Fridge 拍冰箱/告诉 Agent | 照片或文字 → 结构化食材清单（name/category/quantity/unit/storageZone/freshness） | llm（vision 或 text） |
| `ingredients` | Fridge 用它做点什么 | 文字食材 → 可做的菜（含还缺什么） | llm（text） |
| `recommend` | RecommendList | 三选一推荐（可带 nearbyPlaces / refineHint） | llm（text） |
| `dailyNutrition` | Today 首屏 | 今日营养建议卡 | llm（text） |
| `party` | Partner 帮我们决定 | 多人合并画像 → 三选一 | llm（text） |
| `chat` | RecommendDetail | 追问 | llm（text） |
| `agent` | Agent.vue | 自然语言入口：LLM 自主选工具并汇总回复，返回 `{reply, trace, ...最后一个工具的结构化数据}` | llm（多轮 tool calling） |
| `communityRegister` | Partner | 创建身份，生成邀请码 | redis（未配置→mock） |
| `communityAddFriend` | Partner | 邀请码加好友（双向） | redis |
| `communityFriends` | Partner | 拉好友列表 | redis |
| `communityPost` | Partner | 发布晒饭动态 | redis |
| `communityFeed` | Partner | 拉取好友+自己的动态流 | redis |

### 4.3.1 Food Agent（`action: 'agent'`）

```
userText + memory(画像/近期日记/今日状态/常吃店铺/定位) + 可选图片
        │
        ▼  lib/runtime/orchestrator.js  runAgent()
   System Prompt + 工具列表 → callAgent()  ─┐  最多 MAX_STEPS = 3 轮
        ▲                                   │
        └── dispatchTool(name,args,context) ◄┘  tool_calls → skills.js 注册表 → runner
        │
        ▼  无 tool_calls 时输出最终 reply
{ ok, source: 'llm', data: { ...lastToolData, reply, trace } }
```

7 个工具（`lib/runtime/skills.js`）：`meal_recommend` / `meal_nutrition` / `meal_party` / `meal_recognize` / `meal_fridge` / `meal_ingredients` / `meal_memory`。
重数据（profile、recentDiary…）由 orchestrator 注入 context，模型只传最小参数；`trace` 记录实际调用的工具，供评估使用。

> 目前 Agent 工具**全是读/生成类**，没有写入类工具（记录一餐、增删冰箱食材），也没有确认流程。

### 4.4 响应 envelope

每个 action 统一返回 `{ ok, source, data, error? }`：

- `source: "llm"` → LLM 真接上
- `source: "redis"` → 社区数据真读写 Redis
- `source: "mock"` → 后端兜底假数据（LLM/Redis 不可用）
- `source: "local-mock"` → 请求根本没到后端，前端本地兜底

前端 `services/agent.js` 只判断 `r.ok && r.data`，不看 `source`，所以任何降级都无感。

### 4.5 为什么这样切

- **Key 只在后端**：H5 前端字节码人人可看，Key 必须放 Serverless 环境变量
- **前端无跨域压力**：浏览器只请求同源 `/api/agent`，永远不出 Vercel 域
- **Mock 兜底**：网络抖动、Key 用完、Redis 未配置都能降级，UI 不受影响
- **Serverless 无状态**：个人数据（画像、日记、今日状态）在浏览器 `localStorage`；社区跨设备数据在 Redis，服务器不存 PII

---

## 五、推荐是怎么算出来的

**关键决策：排序逻辑完全交给 LLM 处理，前端只做数据组装。** 好处是行为符合大模型的自然语言理解能力；风险是每次结果不完全可复现——这在饮食推荐里可以接受。

### 5.1 System Prompt（约束模型行为）

摘自 `api/agent.js` 顶部 `SYSTEM_PROMPT` 常量，核心规则：

1. **安全过滤优先**：过敏（allergies）、忌口（taboos）硬排除，绝不推荐。
2. **三种约束力度**：allergies/taboos 硬排除；healthPrefs（低钠/低糖/低脂/低嘌呤/高蛋白）软倾向。
3. **单人三卡**：最合适（balanced）/ 最想吃（crave）/ 最省事（easy）。
4. **聚餐三卡**：最适合所有人 / 最有趣 / 最方便，任一人的过敏/忌口都硬排除。
5. **食物三级**：优选（全谷物/蒸煮鱼虾/深色蔬菜）> 限量（精白米面/含糖酸奶）> 不宜（油炸主食/动物内脏/加工肉/高糖饮料）。
6. **烹饪优先级**：蒸 > 煮 > 炖 > 拌 > 快炒 > 煎 > 炸。
7. **情绪-食物关联**：疲惫→暖食热汤高蛋白；低落→温热柔和小甜；开心/兴奋→正常/可犒劳。
8. **季节性食材**：按月份轻微倾向时令食材。
9. **餐厅场景**：`nearbyPlaces` 存在时 dish 格式"店名 · 菜品"，三张必须从附近店选。
10. **预算硬约束**：三张卡必须严格在 budget 范围内。
11. **输出合法 JSON**，通过 tool_use 提交。

### 5.2 用户消息里的完整上下文

```jsonc
{
  "profile": {
    "basic": { "birthYear": 1998, "height": 170, "weight": 60,
      "allergies": ["虾", "花生"], "taboos": ["不吃动物内脏", "低钠"], "diet": "普通" },
    "prefer": { "cuisines": ["川菜", "本帮菜"], "spicy": 2,
      "scenes": ["餐厅"], "budget": "20~40 元", "favorites": "番茄鸡蛋", "dislikes": "香菜" }
  },
  "todayContext": { "hunger": "很饿", "mood": "疲惫", "time": "20 分钟",
    "scene": "餐厅", "crave": "热汤", "personalNote": "今天不想吃米饭" },
  "recentDiary": [ /* 最近 6 条 {meal, items, deliveryStore, feedback} */ ],
  "recentStores": [ /* 聚合的常吃外卖店铺 {name, count, last, dishes} */ ],
  "refineHint": "healthier",          // 'healthier' | 'tastier' | null
  "previousPicks": [ /* 上一批，避免推重 */ ],
  "ageMode": "adult"
}
```

### 5.3 输出 Schema（模型必须严格返回）

```jsonc
{
  "picks": [
    {
      "key": "balanced", "title": "今天最合适",
      "dish": "番茄虾仁豆腐煲 + 一拳米饭 + 一份青菜",
      "reason": "最近两餐蛋白质多为猪肉，这一餐换成虾和豆腐更丰富。",
      "budget": "30~45 元", "time": "25 分钟",
      "allergens": ["虾", "大豆"], "swaps": ["虾仁 ↔ 鸡胸肉"],
      "howto": "外卖搜'豆腐煲'……",
      "signatureDishes": ["番茄虾仁豆腐煲", "家常小炒"]
    },
    { "key": "crave", "title": "今天最想吃", /* ... */ },
    { "key": "easy",  "title": "今天最省事", /* ... */ }
  ]
}
```

### 5.4 排序维度（写进 System Prompt 供模型参考）

| 维度 | 权重 | 说明 |
| --- | --- | --- |
| **安全性** | 硬性规则 | 过敏、忌口、年龄模式违规 → 直接排除 |
| 偏好匹配 | 30% | 菜系、辣度、favorites/dislikes、历史选择 |
| 近期饮食平衡 | 25% | 蛋白质多样性、蔬菜频率、油炸/甜饮 |
| 场景可执行性 | 20% | 时间、预算、外卖/在家 |
| 当前状态 | 15% | 饥饿、心情、身体感受、当下想吃、personalNote |
| 食物多样性 | 10% | 避免与最近 3 天菜品重复；避免与 previousPicks 高度重复 |

### 5.5 三种年龄模式

`services/store.js` 的 `deriveAgeMode(profile)`：

- `10-17` → **growth 成长模式**：不推快速减重、不用 BMI 直接评价
- `18-59` → **adult 成人模式**：全功能
- `≥60` → **senior 活力模式**：偏软食、清淡不单调、蛋白质来源、操作简单

### 5.6 视觉识别（`recognizeMeal` / `fridgeToRecipe`）

- 前端 `<canvas>` 把图片压缩到长边 1024px、JPEG 82%，转 base64 dataURL 塞进 body
- 后端识别到 `data:image/xxx;base64,...`，切到 `glm-4v-flash` + JSON Mode
- **不返回可信度、不追问**：识别结果只输出结构化字段，用户在 `Confirm.vue` 里勾选/自填，永远不会自动把 Agent 猜测写进日记
- `glm-4v-flash` 的 `max_tokens` 上限 1024，`callLLM` 已做上限钳制
- Vercel 路由 `sizeLimit: 5mb, maxDuration: 60` 应对图片体积和识别延迟

### 5.7 外卖店铺记忆 & 附近餐厅（Google Places）

- `Confirm.vue` 可填"外卖店铺名"，写进日记 `deliveryStore`；`store.js` 的 `getDeliveryStores(limit)` 聚合出常吃店铺列表
- 用户场景为"餐厅"且授权定位时，后端 `fetchNearbyRestaurants` 调 Google Places（Places API New，FieldMask 精挑字段），过滤 `rating >= 3.8` 且 `userRatingCount >= 15` 的前 8 家，注入 `nearbyPlaces`
- Places 报错 / Key 缺失 / 拒定位都**静默跳过**，退化为普通推荐

### 5.8 换一批的三个方向

| 按钮 | refineHint | 含义 |
| --- | --- | --- |
| 🥗 想更健康的 | `'healthier'` | 降低油盐精制碳水，增加蔬菜全谷物 |
| 😋 更符合口味的 | `'tastier'` | 提升偏好匹配，允许更多 favorites |
| ↻ 直接换一批 | `null` | 只避免与 previousPicks 重复 |

### 5.9 追问（`chat`）

详情页四个快捷按钮：换主食 / 更辣 / 更便宜 / 教做法。Payload 带 `history`（最近 8 条）+ `profile` + `todayContext`，返回 `{reply}`。

---

## 六、社区功能（Upstash Redis）

社区是唯一需要跨设备持久化的模块，用 **Upstash Redis（REST 协议）** 实现，`@upstash/redis` 懒加载。

- **身份**：`communityRegister` 用 `ABCDEFGHJKMNPQRSTUVWXYZ23456789` 生成 6 位邀请码，`name` + `emoji` 存进 Redis
- **好友**：`communityAddFriend` 用 Set 存双向好友关系（`fKey(code)`），防止加自己、校验码存在
- **动态**：`communityPost` 用 List（LPUSH + LTRIM 保留最近 200 条）；`communityFeed` 只拉自己 + 好友的可见动态
- **降级**：未配置 Redis 时全部走 mock，单机演示可用，跨设备分享需配置 Redis

---

## 七、状态与数据存储

个人数据都在浏览器 `localStorage`（社区跨设备数据在 Redis，见上）：

| Key | 内容 | 写入点 |
| --- | --- | --- |
| `meal_profile` | 长期画像 `{basic, prefer, onboarded}` | Basic/Prefer 页；Mine 页导入 |
| `meal_diary` | 日记数组（倒序）`[{id, createdAt, date, meal, items[], imageSrc, deliveryStore, source, feedback, awaitingFeedback}]`；`date` 为 `YYYY-MM-DD` | Today / Confirm / Fridge / Detail + Feedback |
| `meal_nutrition` | 今日营养建议缓存 | Today |
| `meal_today_ctx` | 今日状态 `{hunger, mood, time, scene, crave, personalNote, savedAt}` | Today 页 |
| `meal_last_reco` | 上次推荐 `{picks, refineHint, at}` | RecommendList |
| `meal_pending` | 页面间临时数据（识别结果、当前卡片） | Today → Confirm、List → Detail |
| `meal_location` | 定位 `{lat, lng, accuracy}`（30 分钟有效） | Today 授权定位 |
| `meal_fridge_inventory` | 冰箱食材清单 `[{id, name, category, quantity, unit, storageZone, addedDate, expiryDate, expirySource, ...}]` | Fridge 录入/扣减 |
| `meal_community_me` | 社区身份 `{code, name, emoji}` | Partner |

**约定（避免回归）：**
- 所有 localStorage key 在 `store.js` 顶部声明并登记进 `ALL_KEYS`，`clearAll()` 只遍历它——新增 key 必须登记，否则「清空数据」会漏清。
- 按天分组 / 计数的日期键一律用 `formatDateKey(ts)`（`YYYY-MM-DD`，补零），不要在页面里再手写 `getMonth()`。
- 餐次推断一律用 `services/mealTime.js`：`guessMeal()`（日记餐次，14–17 点为「加餐」）/ `guessNextMeal()`（首页展示，同时段显示「下午加餐」）。

### 7.1 画像导出/导入格式

```
MEAL1:eyJ2IjoxLCJleHBvcnRlZEF0IjoxNzIwMDAwMDAwMDAwLCJwcm9maWxlIjp7ImJhc2ljIjp7...
```

- `MEAL1:` 版本前缀 + UTF-8 安全 Base64(JSON)，明文 `{v:1, exportedAt, profile}`
- 兼容直接粘 JSON 或 `{basic, prefer}` 片段
- 一段短文本可通过微信/短信/邮件发朋友；聚餐页粘贴即可读对方偏好

---

## 八、安全 & 隐私原则

- **过敏和明确忌口是硬性过滤**，绝不参与"评分加权"——安全优先于口味
- **不作医疗诊断**：遇到用户描述严重症状，引导专业医疗，不给"治病食谱"
- **未成年人保护**：`growth` 模式不推快速减重、不用 BMI 评价、涉及体重管理给谨慎提示
- **Key 只在服务端**：`LLM_API_KEY` / `GOOGLE_PLACES_API_KEY` / `UPSTASH_REDIS_*` 全部走 Vercel 环境变量，绝不进前端代码或 README
- **不用用户健康数据训练公共模型**：Prompt 里的画像只用于当次推荐，请求结束即抛弃

---

## 九、UI 风格与交互

极简 · 温暖：奶油底 + 咖啡色文字 + 陶土色强调色（`src/styles/global.css`）。颜色通过 CSS 变量集中管理：

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--ink` | `#2a1e17` 深咖 | 主文字、主按钮底 |
| `--ink-2` | `#5a4a3f` 中咖 | 次级文字、按钮文字 |
| `--ink-3` | `#a89684` 浅咖 | 说明文字、占位符 |
| `--paper` | `#fbf7f0` 奶油 | 页面底色 |
| `--paper-2` | `#f3ecdf` 米黄 | 输入框、次级面 |
| `--accent` | `#c46a3a` 陶土橙 | 主按钮、active 图标、pick title |
| `--accent-soft` | `#f0d9c5` 陶土浅 | active tag 底色 |
| `--danger` | `#a04a3a` 红棕 | 只用于删除/清空 |
| `--line` | `rgba(74,52,40,0.10)` | 极细分割线 |

- 字体栈：中文优先衬线（`PingFang SC` / `Noto Serif SC` / `Songti SC`）
- 卡片：无阴影、无圆角背景，靠 24~32px 垂直留白 + 1px 底部分割线区隔
- 按钮：pill 形（`border-radius: 999px`）；主按钮陶土实心，次要透明描边
- 页面切换：Tab 之间横向滑动 + 淡入淡出；进出详情页淡入 + 微上浮；缓动 `cubic-bezier(0.22,1,0.36,1)`

---

## 十、部署与运维

### 10.1 部署到 Vercel

```bash
# 根目录在 web/，直接从 web 目录部署
cd web
npx vercel --prod --scope lsojabibak-4294s-projects
```

> `--scope` 必需（Vercel 多账号/多团队环境），否则报 "Not authorized"。

### 10.2 环境变量

在 Vercel 项目 Settings → Environment Variables 配置，或命令行：

```bash
printf '%s' "你的密钥" | npx vercel env add LLM_API_KEY production --scope lsojabibak-4294s-projects
```

| Key | 是否必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `LLM_API_KEY` | 必填 | 无 | 智谱 BigModel（或任意 OpenAI 兼容平台）密钥；不填自动走 mock |
| `LLM_BASE_URL` | 可选 | `https://open.bigmodel.cn/api/paas/v4` | OpenAI 兼容 API 端点 |
| `LLM_TEXT_MODEL` | 可选 | `glm-4-flash` | 纯文本模型 |
| `LLM_VISION_MODEL` | 可选 | `glm-4v-flash` | 图片/视觉模型 |
| `GOOGLE_PLACES_API_KEY` | 可选 | 无 | 启用后场景=餐厅且授权定位时，推荐结合附近好评店家 |
| `UPSTASH_REDIS_REST_URL` | 可选 | 无 | 社区功能跨设备存储；形如 `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | 可选 | 无 | 社区功能密钥；未配置时社区降级为 mock |

**加完变量必须 Deployments → Redeploy（取消 Use existing Build Cache）**，旧部署不会自动读到新变量。

### 10.3 判断是否真接上

线上 → F12 Network → 找 `/api/agent` 请求 → Response 的 `source`：

- `"llm"` → LLM 真接上
- `"redis"` → 社区真读写 Redis
- `"mock"` → 后端兜底；去 Vercel → Logs 看 `xxx llm error:` / `[community] ...`
- `"local-mock"` / 请求 5xx → 请求没到后端

### 10.4 常见错误对应

| 日志 | 原因 | 修法 |
| --- | --- | --- |
| `llm_http_401` | 密钥错 / 前后空格 | 重新粘 `LLM_API_KEY` |
| `llm_http_400 model not found` | 模型名不可用 | 换 `LLM_TEXT_MODEL` / `LLM_VISION_MODEL` |
| `llm_http_429` | 限流 / 免费额度用完 | 等一会儿或升级模型 |
| `max_tokens参数非法`（智谱） | vision 模型超过 1024 | 已在 `callLLM` 钳制，无需处理 |
| `llm_no_json` / `llm_bad_json` | 模型返回无 JSON / JSON 坏 | 通常 schema 讲不清，改 System Prompt |
| `[community] redis init error` | Redis 配置错 | 检查 `UPSTASH_REDIS_REST_URL/TOKEN` |

### 10.5 换 AI 供应商

后端是 OpenAI 兼容协议，换成 DeepSeek / Moonshot / OpenAI 等只需改环境变量：

```bash
printf '%s' "新密钥" | npx vercel env add LLM_API_KEY production
printf '%s' "https://api.deepseek.com/v1" | npx vercel env add LLM_BASE_URL production
printf '%s' "deepseek-chat" | npx vercel env add LLM_TEXT_MODEL production
```

> 注意：视觉模型需支持图片输入且支持 JSON Mode（或 function calling）。智谱免费档 `glm-4v-flash` 不支持 function calling，所以视觉路径用的是 JSON Mode。

---

## 十一、当前进度（对照 [v2.md](./v2.md)，更新于 2026-10-03）

### 11.1 V2 五个阶段

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| Phase 1 · IA 重构 | ✅ 基本完成 | 五 Tab（今日/冰箱/日记/饭搭子/我的）；首页两大入口（在家做 / 出去吃 + 记录这一餐）；Party/Community 合并为 Partner |
| Phase 2 · 持久化冰箱 | ✅ 完成 | 三区库存、`shelfLife.js` 确定性新鲜度、拍/手动/告诉 Agent 录入、增删改；「用它做点什么」默认预选临期食材、排除已过期的（用户能否手动勾选过期食材未做硬限制） |
| Phase 3 · 决策分支 | 🟡 部分 | 「用它做点什么」走 `ingredients` 单独生成；**尚未**拆出 `recommendHome / recommendEatingOut / recommendGroup` 三个独立推荐；冰箱食材的临期优先级未传入 `recommend` |
| Phase 4 · 记录闭环 | 🟡 部分 | 在家做完成 → 写日记 + 扣减库存 ✅；拍照走 Confirm 确认 ✅；手动记录直接入日记，**无统一确认页**；**无「是否分享给好友」**一步 |
| Phase 5 · Global Agent | 🟡 雏形 | 已有 `/agent` 页 + 7 个只读/生成类工具 + 15 条评估用例；**不是**全局悬浮层（仅今日页有入口）；**无写操作工具与确认流程**；无朋友画像/冰箱读取工具 |

### 11.2 其他已完成
- 首次注册流（品牌 + 基础 + 口味）；三种年龄模式；过敏原/忌口自定义
- 今日状态（作为推荐 Context）+ 个性化补充 + 今日营养建议卡（带缓存）
- 拍照识别（菜品）；冰箱识别 → 结构化食材（`fridgeItems`）
- 外卖店铺跟踪 + 附近餐厅（Google Places）；出去吃推荐带定位
- 三选一推荐 + 换一批（refineHint）+ 详情追问 + 饭后反馈
- 饮食日记（本周种类数 + 每日热量柱状图 + 每餐编辑/删除）
- 画像导出/导入（`MEAL1:`）；聚餐方案；邀请码好友 + 晒饭动态（Upstash Redis）
- LLM 供应商切换（OpenAI 兼容，默认智谱 BigModel）
- Agent 评估框架（`eval/`，本地 + 线上两套执行器）
- 架构 P0 修复：`clearAll()` 补漏 `meal_nutrition` 并以 `ALL_KEYS` 集中登记；日期键统一 `YYYY-MM-DD`；`guessMeal` 抽成共享模块

### 11.3 已知缺口 / 下一步（按 v2.md 验收 Q1–Q7）
- **Q4 朋友画像**：好友之间尚未共享 Food Profile（过敏/忌口/菜系…），也没有「临时添加一起吃的人」→ 聚餐仍靠粘贴 `MEAL1:` 文本合并画像
- **Q6 Agent 全能**：需要写入类工具（`addMealLog` / `addFridgeItem` / `removeFridgeItem`）+ 写前确认；需要读取冰箱 / 好友画像 / 附近餐厅的工具
- **Q5 记录一次即三用**：补统一 Meal Confirmation + 可选分享到 Feed
- **Safety Hard Filter**：过敏/忌口/过期食材目前主要靠 System Prompt 约束，v2.md 要求在代码层二次硬过滤（尤其聚餐）
- 架构审计里的 P1/P2 项（组件拆分、统一状态层等）**尚未处理**，本轮只做了 P0

**未做，但预留了接入点**
- 菜品知识库（System Prompt 加"从库中选菜"约束即可）
- PWA（`public/manifest.json` + service worker）
- 社区点赞/评论（Redis 已有好友关系，扩展 feed 结构即可）

---

## 十二、本地开发

```bash
cd web
npm install
npm run dev              # http://localhost:5173，Agent 走本地 mock
# 想联调 Serverless：
npm i -g vercel
vercel dev               # 同时起前端 + /api，需要本地 .env.local
```

生产构建：`npm run build` → 输出到 `dist/`。目前没有前端单元测试，构建通过 + 下面的 Agent 评估是仅有的自动检查。

### Agent 评估（`eval/`）

```bash
# 线上（推荐：线上才有真实 LLM_API_KEY；Vercel 上该 Key 是只写的，本地读不到）
node eval/run-http.mjs --base https://xxx.vercel.app
node eval/run-http.mjs --base https://xxx.vercel.app --only c14   # 只跑一条

# 本地（需要 .env.local 里有可用的 LLM_API_KEY）
node --env-file=.env.local eval/run.mjs
```

判定规则：`expected` 里的工具没出现 → ❌；`forbidden` 里的工具出现 → ❌；调用了额外工具 → ⚠️；`source=mock` → ❌ INFRA（Key 没生效，评测无效）；`checkAllergen`（如 c14 的「花生」）出现在回复里 → 🚫 过敏安全失败。

---

## 十三、术语速查

- **闭环** = 拍照→识别→确认→推荐→选择→反馈
- **画像** = 长期不变的用户信息（`meal_profile`）
- **今日状态** = 当天动态问答收集的临时数据（`meal_today_ctx`）
- **personalNote** = 用户在 Today 页填的自由文本
- **年龄模式** = 由出生年份推导的推荐策略档位（growth / adult / senior）
- **三选一** = 每次推荐必须返回的三张卡（balanced / crave / easy；聚餐 all / fun / easy）
- **refineHint** = "更健康/更符合口味"的方向提示
- **recentStores** = 从日记聚合出的常吃外卖店铺列表
- **nearbyPlaces** = Google Places 拉取的附近好评店家
- **Mock 兜底** = LLM/Redis 不可用时后端返回的固定假数据，保证 UI 不白屏

---

_如果你是被交接进这个项目的下一位工程师或者一个刚被换上来的 AI Agent：先看这个 README 和 `v2.md`（产品目标），再看 `api/agent.js`（action 分发）→ `lib/runtime/orchestrator.js` + `skills.js`（Agent 大脑与工具）→ `lib/runtime/runners.js`（各能力实现），最后看 `src/views/Today.vue` + `Fridge.vue`（前端主线两页）和 `src/services/store.js`（本地数据）。理解这几处就能开始改。_
