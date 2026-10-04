---
name: meal-fridge
description: 识别冰箱照片中的食材并标注新鲜度，推荐 2~3 道能用现有食材做的家常菜。当需要"打开冰箱想想做什么菜"时使用。
---

# 冰箱食材 → 家常菜

拍一张冰箱照片，识别食材、标新鲜度，推荐能消耗现有食材的菜。

## 输入（payload）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `imageDataUrl` | string | 是 | `data:image/...;base64,...` 冰箱照片 |
| `profile` | object | 否 | 画像（结合健康偏好推荐） |

## 输出（JSON Schema）

```json
{
  "ingredients": [
    { "name": "番茄", "freshness": "需尽快用" }
  ],
  "dishes": [
    {
      "name": "番茄炒蛋",
      "reason": "经典家常菜，酸甜开胃，蛋白质和维生素均衡",
      "uses": ["番茄", "鸡蛋"],
      "missing": ["葱"],
      "time": "10 分钟",
      "difficulty": "简单",
      "howto": "鸡蛋炒熟盛出，番茄炒软出汁，倒入鸡蛋翻炒调味"
    }
  ]
}
```

## 规则

1. **新鲜度三档**：`新鲜` / `一般` / `需尽快用`。
2. **优先推荐能消耗"需尽快用"食材的菜**。
3. **2~3 道菜**，每道说明：为什么推荐（结合食材搭配 + 健康偏好）、用到哪些冰箱食材、还缺什么、大致时间、难度、简要做法。
4. **结合 healthPrefs**：低钠→清蒸水煮；高蛋白→增加豆蛋鱼。

## 视觉模式注意

- 使用视觉模型（如 `glm-4v-flash`）：**不支持 function calling**，用 JSON 模式 + 把 schema 写进 user message。
- `max_tokens` 上限 1024。

## 示例

输入：`{"imageDataUrl":"data:image/jpeg;base64,..."}`

期望输出：ingredients 列出可见食材及新鲜度，dishes 含 2~3 道菜，优先消耗"需尽快用"的食材。
