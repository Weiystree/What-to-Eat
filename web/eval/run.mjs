// Agent 评估执行器：逐条跑 runAgent，收集实际调用路径(trace)与最终回复，判定是否满足期望。
// 用法：
//   node --env-file=.env.local eval/run.mjs            # 跑全部
//   node --env-file=.env.local eval/run.mjs --only c14  # 只跑某条（冒烟）
//
// 判定规则：
//   - source === 'mock'          → ❌ INFRA（key 缺失/失效，没真调到 LLM）
//   - expected 里的工具没出现     → ❌
//   - forbidden 里的工具出现       → ❌
//   - 额外调用了不在 expected/forbidden 里的工具 → ⚠️
//   - 否则                        → ✅
//   - checkAllergen 命中了回复     → 额外标记 🚫过敏（即使路由对也算安全失败）

import { runAgent } from '../lib/runtime/orchestrator.js'
import { CASES, BASE_MEMORY, TINY_PNG } from './cases.mjs'

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

function mergeMemory(override) {
  if (!override) return structuredClone(BASE_MEMORY)
  const base = structuredClone(BASE_MEMORY)
  for (const key of Object.keys(override)) {
    if (base[key] && typeof base[key] === 'object' && !Array.isArray(base[key]) && override[key] && typeof override[key] === 'object') {
      base[key] = { ...base[key], ...override[key] }
    } else {
      base[key] = override[key]
    }
  }
  return base
}

const withTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms))
])

const rows = []
const failures = []

for (const c of CASES) {
  if (only && c.id !== only) continue

  const memory = mergeMemory(c.memoryOverride)
  let result
  try {
    result = await withTimeout(
      runAgent(c.input, memory, c.image || null),
      120000,
      c.id
    )
  } catch (e) {
    result = { ok: false, source: 'error', data: { reply: '', trace: [] } }
    result._error = e.message
  }

  const data = result.data || {}
  const trace = Array.isArray(data.trace) ? data.trace : []
  const reply = (data.reply || '').replace(/\s+/g, ' ').trim()
  const source = result.source || 'error'

  const missing = c.expected.filter(t => !trace.includes(t))
  const hitForbidden = c.forbidden.filter(t => trace.includes(t))
  const extra = trace.filter(t => !c.expected.includes(t) && !c.forbidden.includes(t))
  const allergenHit = (c.checkAllergen || []).filter(a => reply.includes(a))
  // 写工具只应"提议"：检查待确认动作是否产出、不该写时是否没写、模型回复是否谎称已完成
  const pendingTypes = (Array.isArray(data.pendingActions) ? data.pendingActions : []).map(p => p.type)
  const missingPending = !!c.expectPending && !pendingTypes.includes(c.expectPending)
  const unexpectedPending = !!c.expectNoPending && pendingTypes.length > 0
  const claimedDone = (c.forbidReplyPhrases || []).filter(p => reply.includes(p))

  let verdict
  if (source === 'mock') verdict = '❌ INFRA'
  else if (source === 'error') verdict = '❌ ERR'
  else if (missing.length || hitForbidden.length || missingPending || unexpectedPending) verdict = '❌'
  else if (extra.length || claimedDone.length) verdict = '⚠️'
  else verdict = '✅'

  const row = { c, trace, source, reply, missing, hitForbidden, extra, allergenHit, missingPending, unexpectedPending, claimedDone, verdict }
  rows.push(row)

  if (verdict.startsWith('❌') || verdict.startsWith('⚠️') || allergenHit.length) {
    failures.push(row)
  }

  console.log(`[${c.id}] ${verdict}${allergenHit.length ? ' 🚫过敏' : ''}  trace=[${trace.join(',')}]  source=${source}`)
  if (result._error) console.log(`        err=${result._error}`)
}

// ---------- 结果表 ----------
console.log('\n\n## Agent 评估结果表（真实 LLM 工具选择）\n')
console.log('| ID | 类别 | 输入 | 期望工具 | 实际调用 | 禁用命中 | 判定 |')
console.log('|---|---|---|---|---|---|---|')
for (const r of rows) {
  const exp = r.c.expected.join(',') || '（不调用，澄清/读上下文）'
  const trace = r.trace.join(',') || '（无）'
  const forbid = r.hitForbidden.join(',') || '—'
  const cell = `${r.verdict}${r.allergenHit.length ? ' 🚫' : ''}`
  console.log(`| ${r.c.id} | ${r.c.category} | ${r.c.input.slice(0, 16)} | ${exp} | ${trace} | ${forbid} | ${cell} |`)
}

// ---------- 逐条回复摘要 ----------
console.log('\n## 各条最终回复摘要\n')
for (const r of rows) {
  console.log(`### ${r.c.id} · ${r.c.category}（${r.verdict}${r.allergenHit.length ? ' 🚫过敏' : ''}）`)
  console.log(`> 输入：${r.c.input}`)
  console.log(`> 实际调用：[${r.trace.join(',') || '无'}]`)
  console.log(`> 回复：${r.reply.slice(0, 180) || '（空）'}`)
  if (r.missing.length) console.log(`> 缺失期望工具：${r.missing.join(',')}`)
  if (r.extra.length) console.log(`> 额外调用：${r.extra.join(',')}`)
  if (r.allergenHit.length) console.log(`> ⚠️ 回复中出现过敏原：${r.allergenHit.join(',')}`)
  console.log('')
}

// ---------- 失败/风险汇总 ----------
console.log('\n## 失败与风险案例汇总\n')
const stats = {
  total: rows.length,
  pass: rows.filter(r => r.verdict === '✅').length,
  warn: rows.filter(r => r.verdict === '⚠️').length,
  fail: rows.filter(r => r.verdict.startsWith('❌')).length,
  allergen: rows.filter(r => r.allergenHit.length).length
}
console.log(`共 ${stats.total} 条：✅ ${stats.pass} · ⚠️ ${stats.warn} · ❌ ${stats.fail} · 🚫过敏 ${stats.allergen}`)

if (failures.length) {
  console.log('\n以下为需要关注的非通过案例：')
  for (const r of failures) {
    console.log(`- ${r.c.id} ${r.c.category}：${r.verdict}${r.allergenHit.length ? ' 🚫' : ''} ` +
      `(期望[${r.c.expected.join(',') || '无'}] 实际[${r.trace.join(',') || '无'}]` +
      `${r.missing.length ? ' 缺[' + r.missing.join(',') + ']' : ''}` +
      `${r.hitForbidden.length ? ' 禁[' + r.hitForbidden.join(',') + ']' : ''}` +
      `${r.extra.length ? ' 额外[' + r.extra.join(',') + ']' : ''}` +
      `${r.allergenHit.length ? ' 过敏[' + r.allergenHit.join(',') + ']' : ''})`)
  }
} else {
  console.log('\n全部通过 ✅')
}
