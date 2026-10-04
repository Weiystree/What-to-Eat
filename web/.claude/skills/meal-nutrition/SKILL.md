---
name: meal-nutrition
description: 基于用户画像和最近餐食，给出今天该补充或减少的营养/食物类别（2~4 条，含份量与原因）。当需要"今日营养建议"时使用。
---

# 今日营养建议

基于用户画像 + 最近餐食，指出今天需要补充或减少的营养/食物类别。

## 输入（payload）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `profile` | object | 否 | 画像（basic + prefer），用于判断健康偏好 |
| `recentDiary` | array | 否 | 最近餐食记录，用于发现营养缺口 |
| `ageMode` | string | 否 | growth / adult / senior |
| `todayContext` | object | 否 | 今日状态 |

## 输出（JSON Schema）

```json
{
  "items": [
    {
      "name": "深色蔬菜",
      "portion": "1~2 拳头",
      "why": "连续两天蔬菜量偏少"
    }
  ],
  "summary": "整体饮食偏重，今天可以清淡一点。"
}
```

## 规则

1. **2~4 条即可**，每条给 `name`（食物类别）+ `portion`（份量）+ `why`（一句原因）。
2. **避免医疗诊断口吻**，用"补充/减少/替换"这类建议语气，不做疾病判断。
3. **份量用生活化单位**（拳头/掌心/一碟），不用克数精确值。
4. **结合 healthPrefs**：低钠→少腌制品；低糖→换全谷物；高蛋白→增加鱼虾豆蛋奶。
5. **结合 ageMode**：senior 偏软食清淡；growth 不做减重导向。

## 示例

输入：`{"recentDiary":[{"items":[{"name":"红烧肉饭"},{"name":"炸鸡"}]}], "healthPrefs":["低钠"]}`

期望输出：items 建议增加蔬菜、优质蛋白、全谷主食，summary 提示口味偏重宜清淡。
