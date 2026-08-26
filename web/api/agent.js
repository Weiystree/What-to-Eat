// Vercel Serverless Function: /api/agent
// 职责：接收请求、分发 action。
//   - 文本/视觉类 action 委托给 lib/runtime/runners.js（行为不变）
//   - Agent 类 action 委托给 lib/runtime/orchestrator.js（自主编排）
//   - community（好友/晒饭）就地处理
// 环境变量说明见 README（LLM_API_KEY / LLM_BASE_URL / LLM_TEXT_MODEL / LLM_VISION_MODEL /
//   GOOGLE_PLACES_API_KEY / UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN），
//   均只在 Vercel 环境变量配置，绝不硬编码。

import {
  runRecognizeMeal, runRecommend, runDailyNutrition, runParty, runFridgeToRecipe, runChat
} from '../lib/runtime/runners.js'
import { runAgent } from '../lib/runtime/orchestrator.js'

const RUNNERS = {
  recognizeMeal: runRecognizeMeal,
  recommend: runRecommend,
  dailyNutrition: runDailyNutrition,
  party: runParty,
  fridgeToRecipe: runFridgeToRecipe,
  chat: runChat
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method_not_allowed' }); return }

  try {
    const body = await readBody(req)
    const { action, payload } = body || {}

    if (RUNNERS[action]) {
      return res.status(200).json(await RUNNERS[action](payload || {}))
    }

    if (action === 'agent') {
      const { userText, memory, imageDataUrl } = payload || {}
      if (!userText) return res.status(200).json({ ok: false, error: 'missing_userText' })
      return res.status(200).json(await runAgent(userText, memory, imageDataUrl))
    }

    if (action === 'communityRegister') {
      const p = payload || {}
      const name = String(p.name || '').trim().slice(0, 20) || '我'
      const emoji = String(p.emoji || '').slice(0, 4) || '😊'
      const redis = await getRedis()
      if (!redis) return res.status(200).json({ ok: true, source: 'mock', data: { me: { code: 'ME0001', name, emoji } } })
      try {
        let code = genCommunityCode()
        for (let i = 0; i < 5; i++) {
          if (!(await redis.get(uKey(code)))) break
          code = genCommunityCode()
        }
        const me = { code, name, emoji, createdAt: Date.now() }
        await redis.set(uKey(code), JSON.stringify(me))
        return res.status(200).json({ ok: true, source: 'redis', data: { me } })
      } catch (e) {
        console.error('[community] register error:', e.message)
        return res.status(200).json({ ok: true, source: 'mock', data: { me: { code: 'ME0001', name, emoji } } })
      }
    }

    if (action === 'communityAddFriend') {
      const p = payload || {}
      const meCode = String(p.meCode || '').toUpperCase().trim()
      const friendCode = String(p.friendCode || '').toUpperCase().trim()
      const redis = await getRedis()
      if (!redis) return res.status(200).json({ ok: true, source: 'mock', data: { friend: MOCK_COMMUNITY.friend, friends: [MOCK_COMMUNITY.friend] } })
      try {
        if (!meCode || !friendCode) return res.status(200).json({ ok: false, error: '缺少邀请码' })
        if (meCode === friendCode) return res.status(200).json({ ok: false, error: '不能添加自己' })
        const raw = await redis.get(uKey(friendCode))
        if (!raw) return res.status(200).json({ ok: false, error: '邀请码不存在' })
        const friend = JSON.parse(raw)
        await redis.sadd(fKey(meCode), friendCode)
        await redis.sadd(fKey(friendCode), meCode)
        const friends = await listFriends(redis, meCode)
        return res.status(200).json({ ok: true, source: 'redis', data: { friend, friends } })
      } catch (e) {
        console.error('[community] addFriend error:', e.message)
        return res.status(200).json({ ok: false, error: '添加失败' })
      }
    }

    if (action === 'communityFriends') {
      const meCode = String((payload || {}).meCode || '').toUpperCase().trim()
      const redis = await getRedis()
      if (!redis) return res.status(200).json({ ok: true, source: 'mock', data: { friends: [MOCK_COMMUNITY.friend] } })
      try {
        const friends = await listFriends(redis, meCode)
        return res.status(200).json({ ok: true, source: 'redis', data: { friends } })
      } catch (e) {
        console.error('[community] friends error:', e.message)
        return res.status(200).json({ ok: true, source: 'mock', data: { friends: [MOCK_COMMUNITY.friend] } })
      }
    }

    if (action === 'communityPost') {
      const p = payload || {}
      const meCode = String(p.meCode || '').toUpperCase().trim()
      const redis = await getRedis()
      if (!redis) {
        const post = { id: 'local' + Date.now(), code: meCode || 'ME0001', name: '我', emoji: '😊', mealText: String(p.mealText || '').slice(0, 200), caption: String(p.caption || '').slice(0, 200), createdAt: Date.now() }
        return res.status(200).json({ ok: true, source: 'mock', data: { post } })
      }
      try {
        const raw = await redis.get(uKey(meCode))
        const me = raw ? JSON.parse(raw) : { code: meCode, name: '我', emoji: '😊' }
        const post = {
          id: 'p' + Date.now() + Math.floor(Math.random() * 1000),
          code: meCode, name: me.name, emoji: me.emoji,
          mealText: String(p.mealText || '').slice(0, 200),
          caption: String(p.caption || '').slice(0, 200),
          createdAt: Date.now()
        }
        await redis.lpush(FEED_KEY, JSON.stringify(post))
        await redis.ltrim(FEED_KEY, 0, 199)
        return res.status(200).json({ ok: true, source: 'redis', data: { post } })
      } catch (e) {
        console.error('[community] post error:', e.message)
        return res.status(200).json({ ok: false, error: '发布失败' })
      }
    }

    if (action === 'communityFeed') {
      const meCode = String((payload || {}).meCode || '').toUpperCase().trim()
      const redis = await getRedis()
      if (!redis) return res.status(200).json({ ok: true, source: 'mock', data: { posts: MOCK_COMMUNITY.feed } })
      try {
        const rawPosts = await redis.lrange(FEED_KEY, 0, 99)
        const friendCodes = await redis.smembers(fKey(meCode))
        const visible = new Set([meCode, ...friendCodes])
        const posts = rawPosts.map(s => { try { return JSON.parse(s) } catch (e) { return null } })
          .filter(Boolean)
          .filter(p => visible.has(p.code))
          .slice(0, 50)
        return res.status(200).json({ ok: true, source: 'redis', data: { posts } })
      } catch (e) {
        console.error('[community] feed error:', e.message)
        return res.status(200).json({ ok: true, source: 'mock', data: { posts: MOCK_COMMUNITY.feed } })
      }
    }

    return res.status(400).json({ ok: false, error: 'unknown_action' })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && e.message || e) })
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body)
    let raw = ''
    req.on('data', c => raw += c)
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

// ---------------- Community（好友 / 晒饭 · Upstash Redis） ----------------
// 环境变量：
//   UPSTASH_REDIS_REST_URL     必填，形如 https://xxx.upstash.io
//   UPSTASH_REDIS_REST_TOKEN   必填
// 未配置时降级为 Mock（单机演示可用，跨设备分享需配置 Redis）
let _redis = null
let _redisReady = false
async function getRedis() {
  if (_redisReady) return _redis
  _redisReady = true
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      console.log('[community] redis not configured, using mock')
      return null
    }
    const { Redis } = await import('@upstash/redis')
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    })
  } catch (e) {
    console.error('[community] redis init error:', e.message)
    _redis = null
  }
  return _redis
}

const COMMUNITY_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function genCommunityCode() {
  let s = ''
  for (let i = 0; i < 6; i++) s += COMMUNITY_CODE_CHARS[Math.floor(Math.random() * COMMUNITY_CODE_CHARS.length)]
  return s
}
const uKey = c => `meal:community:user:${c}`
const fKey = c => `meal:community:friends:${c}`
const FEED_KEY = 'meal:community:feed'

const MOCK_COMMUNITY = {
  friend: { code: 'FRIEND1', name: '小饭搭子', emoji: '😺' },
  feed: [
    { id: 'm1', code: 'FRIEND1', name: '小饭搭子', emoji: '😺', mealText: '午餐：番茄虾仁豆腐煲 + 一拳米饭', caption: '今天清淡一点～', createdAt: 1723700000000 },
    { id: 'm2', code: 'FRIEND1', name: '小饭搭子', emoji: '😺', mealText: '晚餐：清汤麻辣烫', caption: '没忍住吃辣了', createdAt: 1723650000000 }
  ]
}

async function listFriends(redis, meCode) {
  const codes = await redis.smembers(fKey(meCode))
  const out = []
  for (const c of codes) {
    const raw = await redis.get(uKey(c))
    if (raw) out.push(JSON.parse(raw))
  }
  return out
}

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
  maxDuration: 60
}
