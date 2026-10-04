---
name: meal-recognize
description: 识别一张饭菜照片（或一段文字描述）中的菜品，输出菜名、份量、食物分类与粗略热量。当需要"识别吃了什么"时使用。
---

# 菜品识别（视觉 / 文字）

把照片或文字描述转成结构化的菜品列表。支持图片（视觉模型）或纯文字两种输入。

## 输入（payload）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `imageDataUrl` | string | 二选一 | `data:image/...;base64,...` 照片 |
| `textDescription` | string | 二选一 | 纯文字描述（手动记录场景） |

## 输出（JSON Schema）

```json
{
  "items": [
    {
      "name": "红烧鸡肉",
      "portion": "一份",
      "category": "meat",
      "calories": 320
    }
  ]
}
```

`category` 枚举：`staple` / `veg` / `fruit` / `meat` / `seafood` / `egg` / `bean` / `dairy` / `other`。

## 规则

1. **菜名具体到食材**："西兰花"而非"青菜"，"红烧排骨"而非"肉"；不确定品种才退回笼统名。
2. **不给可信度、不提问**，只输出结构化结果。
3. **不确定的项宁可少列**，不要乱猜。
4. **calories 必须给整数**（粗略估算即可，不确定也填合理值，不留空）。
5. **category 必须填**，从枚举里选。

## 视觉模式注意

- 使用视觉模型（如 `glm-4v-flash`）：**不支持 function calling**，用 JSON 模式 + 把 schema 写进 user message。
- `max_tokens` 上限 1024。

## 示例

输入：`{"imageDataUrl":"data:image/jpeg;base64,..."}`

期望输出：items 含 2~4 项，每项带 name/portion/category/calories。
