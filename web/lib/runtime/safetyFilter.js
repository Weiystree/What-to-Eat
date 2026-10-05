// 安全硬过滤（代码层，不依赖 LLM 自觉）：过敏/忌口命中的推荐卡直接剔除，不做评分降权。
// v2.md #34：Allergy / Taboo 必须 Hard Filter；聚餐时任一参与者的过敏/忌口都硬排除。
//
// 匹配口径：
//   - 过敏原（allergies）原文匹配：如「虾」命中 虾仁/基围虾/龙虾
//   - 忌口（taboos）先剥掉「不吃/不要/避免/少吃」等前缀再匹配：
//     「不吃动物内脏」→ 命中 动物内脏；剥不出前缀的（如「低钠」）按原文匹配

const TABOO_PREFIX = /^(不吃|不要|不喝|避免|忌口|忌|少吃|少喝|不吃或少吃)/

// 从画像/聚餐成员里收集硬排除项（去重）
export function collectHardExclusions(payload) {
  const out = []
  const seen = new Set()
  const push = v => {
    const s = String(v || '').trim()
    if (s && !seen.has(s)) { seen.add(s); out.push(s) }
  }
  const basic = payload && payload.profile && payload.profile.basic
  if (basic) {
    ;(Array.isArray(basic.allergies) ? basic.allergies : []).forEach(push)
    ;(Array.isArray(basic.taboos) ? basic.taboos : []).forEach(push)
  }
  // 聚餐：任一参与者（含我自己，members 里重复也无妨，Set 去重）
  if (Array.isArray(payload && payload.members)) {
    payload.members.forEach(m => {
      if (!m) return
      ;(Array.isArray(m.allergies) ? m.allergies : []).forEach(push)
      ;(Array.isArray(m.taboos) ? m.taboos : []).forEach(push)
    })
  }
  return out
}

// 泛称过敏原 → 具体食材词展开（宁可多杀，不可漏放）
const ALLERGEN_ALIASES = {
  '海鲜': ['虾', '蟹', '贝', '鲍', '鱿鱼', '章鱼', '海带', '紫菜', '鱼'],
  '坚果': ['花生', '腰果', '核桃', '杏仁', '开心果'],
  '乳制品': ['奶', '奶油', '芝士', '奶酪', '黄油'],
  '蛋类': ['蛋'],
  '大豆': ['豆', '豆浆', '酱油']
}

// 把排除项展开成匹配词：忌口剥前缀后取食材词，同时保留原文兜底；泛称按别名表展开
function buildTerms(exclusions) {
  const terms = []
  for (const raw of Array.isArray(exclusions) ? exclusions : []) {
    const s = String(raw || '').trim()
    if (!s) continue
    const stripped = s.replace(TABOO_PREFIX, '').trim()
    const words = stripped && stripped !== s ? [stripped, s] : [s]
    for (const w of words) {
      terms.push({ raw: s, term: w.toLowerCase() })
      const alias = ALLERGEN_ALIASES[w]
      if (alias) alias.forEach(a => terms.push({ raw: s, term: a.toLowerCase() }))
    }
  }
  return terms
}

// 一张推荐卡的全部可检文本
function pickText(pick) {
  return [
    pick.title, pick.dish, pick.reason, pick.howto, pick.notes,
    (Array.isArray(pick.allergens) ? pick.allergens : []).join(' '),
    (Array.isArray(pick.signatureDishes) ? pick.signatureDishes : []).join(' '),
    (Array.isArray(pick.swaps) ? pick.swaps : []).join(' ')
  ].map(x => String(x || '')).join(' · ')
}

// 过滤推荐卡：返回保留的卡 + 被剔除的记录（供 trace/UI 说明）
export function hardFilterPicks(picks, exclusions) {
  const terms = buildTerms(exclusions).map(t => ({ raw: t.raw, term: t.term.toLowerCase() }))
  const kept = []
  const excluded = []
  for (const p of Array.isArray(picks) ? picks : []) {
    if (!p) continue
    const text = pickText(p).toLowerCase()
    const hit = terms.find(t => text.includes(t.term))
    if (hit) excluded.push({ key: p.key, dish: p.dish || '', matched: hit.raw })
    else kept.push(p)
  }
  return { picks: kept, excluded }
}
