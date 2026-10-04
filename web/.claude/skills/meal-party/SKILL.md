---
name: meal-party
description: 合并多位参与者的画像，为多人聚餐生成三张方案（最适合所有人/最有趣/最方便）。当需要"决定多人聚餐吃什么"时使用。
---

# 多人聚餐方案

合并所有参与者画像，生成三选一聚餐方案。

## 输入（payload）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `members` | array | 否 | 参与者列表，每位含 `profile`（basic + prefer） |
| `party.scene` | string | 否 | 聚餐场景 |
| `party.budget` | string | 否 | 聚餐预算（人均） |

## 输出（JSON Schema）

```json
{
  "picks": [
    {
      "key": "all",
      "title": "最适合所有人",
      "dish": "清汤 + 番茄双拼火锅",
      "reason": "避开辣度冲突，素食和荤食都能点。",
      "budget": "80~120 元/人",
      "notes": "锅底一半清汤照顾不吃辣的一位。"
    }
  ]
}
```

三张卡分工（`key` 枚举 `all`/`fun`/`easy`）：
- **最适合所有人 all**：合并画像，找共同可吃菜系
- **最有趣 fun**：氛围优先
- **最方便 easy**：出餐快、人均低

## 规则

1. **合并画像**：找出所有人共同可吃的菜系与口味交集。
2. **硬性排除**：任一人的 allergies / taboos 都要硬排除，绝不进入方案。
3. **预算取多人平均**（除非 `party.budget` 明确给出）。
4. **notes 写清楚照顾点**：谁不吃辣、谁素食、谁过敏，写明如何在方案里避开。

## 示例

输入：`{"members":[{"profile":{"basic":{"allergies":["花生"]}}},{"profile":{"prefer":{"spicy":0}}}], "party":{"budget":"人均 60 元"}}`

期望输出：三张方案均避开花生，其中 all 卡注明照顾不吃辣者，预算落在人均 60 元左右。
