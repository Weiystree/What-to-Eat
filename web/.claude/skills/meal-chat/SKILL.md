---
name: meal-chat
description: 对已有的餐食推荐做追问与微调（换主食/更辣/更便宜/教做法等），返回文字回复或微调后的新推荐卡。当需要"对推荐卡继续追问"时使用。
---

# 推荐追问 / 微调

基于对话历史 + 画像 + 今日状态，回答用户对推荐的追问，或在追问中给出微调后的新推荐卡。

## 输入（payload）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `userText` | string | 是 | 用户追问内容 |
| `history` | array | 否 | 最近消息（含上下文） |
| `profile` | object | 否 | 画像 |
| `todayContext` | object | 否 | 今日状态 |

## 输出（JSON Schema）

```json
{
  "reply": "可以把主食换成糙米饭，更顶饱。",
  "cards": [
    { "title": "今天最合适", "dish": "清蒸鲈鱼 + 糙米饭 + 青菜", "reason": "换成糙米更顶饱" }
  ],
  "note": "已按更健康方向微调"
}
```

- **纯文本回复**用 `reply` 字段。
- **追问要求微调推荐**时，用 `cards[]` + `note`，`cards[]` 每项含 title/dish/reason。

## 规则

1. 结合 `history` 与 `profile`，回答要落到当前推荐卡的具体调整。
2. 涉及换主食/更辣/更便宜/教做法等，给出可直接执行的建议。
3. 微调推荐卡时仍遵守安全规则（allergies/taboos 硬排除）。

## 示例

输入：`{"userText":"能不能更便宜一点","history":[...],"profile":{"basic":{"allergies":[]}}}`

期望输出：cards 给出预算更低的新推荐卡，note 说明降预算的调整点。
