// 餐次推断（纯规则，无 LLM）：由当前小时推断餐次/下一餐标签。
// 供 Confirm / Today / Fridge / RecommendDetail 复用，避免各页重复实现。

function mealAtHour(h) {
  if (h < 10) return '早餐'
  if (h < 14) return '午餐'
  if (h < 17) return '加餐'
  if (h < 21) return '晚餐'
  return '夜宵'
}

// 记录日记时的餐次字段（「加餐」）
export function guessMeal(date = new Date()) {
  return mealAtHour(date.getHours())
}

// 首页「下一餐」的展示标签（下午时段「加餐」更友好地显示为「下午加餐」）
export function guessNextMeal(date = new Date()) {
  const meal = mealAtHour(date.getHours())
  return meal === '加餐' ? '下午加餐' : meal
}
