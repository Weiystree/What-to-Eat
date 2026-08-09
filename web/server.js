// 本地开发用服务器：直接跑 api/agent.js 的逻辑，不经过 vercel dev。
// 目的：避免 vercel dev 把项目关联到云端项目后，优先读云端环境变量（而不是本地 .env.local）的坑。
// 用法：node --env-file=.env.local server.js
// 配合 vite.config.js 里的 proxy（/api -> http://localhost:3000），前端 npm run dev 时会自动转发到这里。

import http from 'node:http'
import handler from './api/agent.js'

const PORT = process.env.PORT || 3001

// api/agent.js 是按 Vercel serverless 的 req/res 风格写的（res.status().json()）
// 原生 http.ServerResponse 没有这两个方法，这里补上，其余（setHeader/end 等）原生就有
function adaptResponse(res) {
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (obj) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(obj))
  }
  return res
}

const server = http.createServer((req, res) => {
  adaptResponse(res)

  if (!req.url || !req.url.startsWith('/api/agent')) {
    res.status(404).json({ ok: false, error: 'not_found' })
    return
  }

  handler(req, res).catch((err) => {
    console.error('[server] handler error:', err)
    if (!res.writableEnded) {
      res.status(500).json({ ok: false, error: String((err && err.message) || err) })
    }
  })
})

server.listen(PORT, () => {
  console.log(`[server] api/agent.js 本地运行中：http://localhost:${PORT}/api/agent`)
  console.log(`[server] ANTHROPIC_API_KEY 已加载: ${process.env.ANTHROPIC_API_KEY ? '是' : '否（会走 mock）'}`)
})
