// Agent 评估执行器（HTTP 版）：对已部署的 Vercel /api/agent 发 POST action='agent'，收集实际调用路径(trace)与回复。
// 与 run.mjs 判定规则一致，但走线上端点（线上才有真实 LLM_API_KEY）。
// 用法：
//   node eval/run-http.mjs --base https://xxx.vercel.app
//   node eval/run-http.mjs --base https://xxx.vercel.app --only c14   # 只跑某条

import { CASES, BASE_MEMORY } from './cases.mjs'

const argv = process.argv
const baseIdx = argv.indexOf('--base')
const BASE = baseIdx >= 0 ? argv[baseIdx + 1].replace(/\/+$/, '') : 'https://web-snowy-zeta-ri4qjp5kii.vercel.app'
const onlyIdx = argv.indexOf('--only')
const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null
const ENDPOINT = BASE + '/api/agent'

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

async function callAgent(userText, memory, imageDataUrl) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 90000)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'agent', payload: { userText, memory, imageDataUrl } }),
      signal: ctrl.signal
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { source: 'error', data: { reply: '', trace: [] }, _error: 'http_' + res.status }
    return json
  } catch (e) {
    return { source: 'error', data: { reply: '', trace: [] }, _error: e.name === 'AbortError' ? 'timeout' : e.message }
  } finally {
    clearTimeout(t)
  }
}

const rows = []
const failures = []

for (const c of CASES) {
  if (only && c.id !== only) continue
  const memory = mergeMemory(c.memoryOverride)
  const result = await callAgent(c.input, memory, c.image || null)

  const data = result.data || {}
  const trace = Array.isArray(data.trace) ? data.trace : []
  const reply = (data.reply || '').replace(/\s+/g, ' ').trim()
  const source = result.source || 'error'

  const missing = c.expected.filter(t => !trace.includes(t))
  const hitForbidden = c.forbidden.filter(t => trace.includes(t))
  const extra = trace.filter(t => !c.expected.includes(t) && !c.forbidden.includes(t))
  const allergenHit = (c.checkAllergen || []).filter(a => reply.includes(a))

  let verdict
  if (source === 'mock') verdict = '❌ INFRA'
  else if (source === 'error') verdict = '❌ ERR'
  else if (missing.length || hitForbidden.length) verdict = '❌'
  else if (extra.length) verdict = '⚠️'
  else verdict = '✅'

  const row = { c, trace, source, reply, missing, hitForbidden, extra, allergenHit, verdict }
  rows.push(row)
  if (verdict.startsWith('❌') || verdict.startsWith('⚠️') || allergenHit.length) failures.push(row)

  console.log(`[${c.id}] ${verdict}${allergenHit.length ? ' 🚫过敏' : ''}  trace=[${trace.join(',')}]  source=${source}${result._error ? ' err=' + result._error : ''}`)
}

// ---------- 结果表 ----------
console.log('\n\n## Agent 评估结果表（真实 LLM 工具选择，线上端点）\n')
console.log('| ID | 类别 | 输入 | 期望工具 | 实际调用 | 禁用命中 | 判定 |')
console.log('|---|---|---|---|---|---|---|')
for (const r of rows) {
  const exp = r.c.expected.join(',') || '（不调用，澄清/读上下文）'
  const trace = r.trace.join(',') || '（无）'
  const forbid = r.hitForbidden.join(',') || '—'
  console.log(`| ${r.c.id} | ${r.c.category} | ${r.c.input.slice(0, 16)} | ${exp} | ${trace} | ${forbid} | ${r.verdict}${r.allergenHit.length ? ' 🚫' : ''} |`)
}

// ---------- 逐条回复摘要 ----------
console.log('\n## 各条最终回复摘要\n')
for (const r of rows) {
  console.log(`### ${r.c.id} · ${r.c.category}（${r.verdict}${r.allergenHit.length ? ' 🚫过敏' : ''}）`)
  console.log(`> 输入：${r.c.input}`)
  console.log(`> 实际调用：[${r.trace.join(',') || '无'}]`)
  console.log(`> 回复：${r.reply.slice(0, 200) || '（空）'}`)
  if (r.missing.length) console.log(`> 缺失期望工具：${r.missing.join(',')}`)
  if (r.extra.length) console.log(`> 额外调用：${r.extra.join(',')}`)
  if (r.allergenHit.length) console.log(`> ⚠️ 回复中出现过敏原：${r.allergenHit.join(',')}`)
  console.log('')
}

// ---------- 汇总 ----------
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
  console.log('\n非通过案例：')
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
