---
name: meal-recommend
description: 根据用户画像、今日状态、近期饮食与可选附近餐厅，为单人生成三张餐食推荐卡（最合适/最想吃/最省事）。当需要"帮用户决定下一餐吃什么"时使用。
---

# 单人餐食推荐

帮一个用户在 1 分钟内决定下一餐。基于画像 + 今日状态 + 近期饮食，输出三张推荐卡。

## 输入（payload）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `profile.basic.birthYear` | number | 否 | 出生年份，用于推导年龄模式 |
| `profile.basic.diet` | string | 否 | 饮食类型（普通/素食/…） |
| `profile.basic.allergies` | string[] | 否 | 过敏原，**硬性排除** |
| `profile.basic.taboos` | string[] | 否 | 忌口（不吃猪肉等），**硬性排除** |
| `profile.basic.healthPrefs` | string[] | 否 | 健康偏好，软性倾向（低钠/低糖/低脂/低嘌呤/高蛋白） |
| `profile.prefer.cuisines` | string[] | 否 | 偏好菜系 |
| `profile.prefer.spicy` | number | 否 | 辣度 |
| `profile.prefer.favorites` | string | 否 | 喜欢的食物 |
| `profile.prefer.dislikes` | string | 否 | 不喜欢的食物 |
| `todayContext` | object | 否 | 今日状态：hunger/mood/time/scene/crave/personalNote/budget |
| `recentDiary` | array | 否 | 最近餐食记录（饮食平衡与避重） |
| `recentStores` | array | 否 | 常吃外卖店铺（可直接推带店名的菜） |
| `ageMode` | string | 否 | `growth` / `adult` / `senior` |
| `refineHint` | string | 否 | `healthier` / `tastier` / null |
| `previousPicks` | array | 否 | 上一批推荐，避免推重 |
| `nearbyPlaces` | array | 否 | 附近餐厅（scene=餐厅 且授权定位时注入） |

## 输出（JSON Schema）

```json
{
  "picks": [
    {
      "key": "balanced",
      "title": "今天最合适",
      "dish": "番茄虾仁豆腐煲 + 一拳米饭 + 一份青菜",
      "reason": "最近两餐蛋白质多为猪肉，这一餐换成虾和豆腐更丰富。",
      "budget": "30~45 元",
      "time": "25 分钟",
      "allergens": ["虾", "大豆"],
      "swaps": ["虾仁 ↔ 鸡胸肉"],
      "howto": "外卖搜'豆腐煲'……",
      "placeId": "ChIJ…",
      "signatureDishes": ["番茄虾仁豆腐煲", "家常小炒"]
    }
  ]
}
```

三张卡分工（`key` 枚举 `balanced`/`crave`/`easy`）：
- **最合适 balanced**：优先营养均衡（碳水 50~60% / 脂肪 20~30% / 蛋白质 15~20%，主食+优质蛋白+蔬菜，蔬菜≥一拳）
- **最想吃 crave**：照顾情绪与口味，允许适度放纵但守安全线
- **最省事 easy**：优先时间短、获取方便、预算友好，仍含蔬菜和蛋白

## 规则

1. **安全过滤优先**：allergies / taboos 硬排除，绝不推荐；healthPrefs 软倾向即可，不必完全避开。
2. **budget 硬约束**：三张卡必须严格落在单餐预算范围内。
3. **食物分级**：优选（全谷物/蒸煮鱼虾/深色蔬菜）> 限量（精白米面/含糖酸奶）> 不宜（油炸主食/动物内脏/加工肉/高糖饮料）。
4. **烹饪优先级**：蒸 > 煮 > 炖 > 拌 > 快炒 > 煎 > 炸。
5. **情绪关联**：疲惫→暖食热汤高蛋白不油炸；低落→温热柔和小甜；开心→正常；兴奋→可犒劳。
6. **季节性**：按月份轻微倾向时令食材（不强求）。
7. **refineHint**：`healthier`→降低油盐精制碳水、增加蔬菜全谷物；`tastier`→提升偏好匹配、允许更多 favorites。
8. **餐厅场景**（有 nearbyPlaces）：dish 格式"店名 · 菜品"，三张从附近店选，reason 提评分和距离，placeId 回填对应店。
9. **避重**：避免与 recentDiary 最近 3 天、previousPicks 高度重复。

## 示例

输入：

```json
{
  "profile": {
    "basic": { "allergies": ["虾"], "taboos": ["不吃动物内脏"], "healthPrefs": ["低钠"] },
    "prefer": { "cuisines": ["川菜"], "spicy": 2 }
  },
  "todayContext": { "hunger": "很饿", "mood": "疲惫", "scene": "餐厅", "budget": "20~40 元" },
  "ageMode": "adult"
}
```

期望输出：三张卡，balanced 卡避开虾和内脏、做法偏清蒸/水煮（低钠）、预算落在 20~40 元内。
