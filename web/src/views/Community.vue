<template>
  <div>
    <h1 class="title">饭友社区</h1>
    <p class="subtitle">加好友，看大家每天在吃什么。</p>

    <!-- 未创建身份 -->
    <div v-if="!me" class="card">
      <div class="section-label">先给自己取个昵称</div>
      <input class="input" v-model="nameDraft" placeholder="你的昵称" maxlength="20" />
      <div class="emoji-row">
        <span v-for="e in EMOJIS" :key="e" class="emoji-chip"
              :class="{ active: emojiDraft === e }" @click="emojiDraft = e">{{ e }}</span>
      </div>
      <button class="btn-primary" style="margin-top:16px;" :disabled="busy" @click="register">
        {{ busy ? '创建中…' : '创建我的邀请码' }}
      </button>
      <p class="hint">创建后得到一个 6 位邀请码，把它发给朋友，对方输入即可加你为好友。</p>
    </div>

    <template v-else>
      <!-- 我的邀请码 -->
      <div class="card">
        <div class="me-row">
          <div class="me-face">{{ me.emoji }}</div>
          <div class="me-info">
            <div class="me-name">{{ me.name }}</div>
            <div class="me-code">邀请码 <span class="code">{{ me.code }}</span></div>
          </div>
          <button class="act" @click="copyCode">复制</button>
        </div>
      </div>

      <!-- 添加好友 -->
      <div class="card">
        <div class="section-label">添加好友</div>
        <div class="add-row">
          <input class="input" v-model="friendCodeDraft" placeholder="输入朋友的邀请码" maxlength="6" />
          <button class="add-btn" :disabled="busy" @click="addFriend">添加</button>
        </div>
      </div>

      <!-- 好友列表 -->
      <div class="card" v-if="friends.length">
        <div class="section-label">好友 · {{ friends.length }}</div>
        <div class="friend-row">
          <div v-for="f in friends" :key="f.code" class="friend-chip">
            <div class="friend-face">{{ f.emoji }}</div>
            <div class="friend-name">{{ f.name }}</div>
          </div>
        </div>
      </div>

      <!-- 晒一晒 -->
      <div class="card">
        <div class="section-label">晒一晒今天吃了什么</div>
        <textarea class="textarea" v-model="mealDraft" placeholder="例如：午餐：番茄虾仁豆腐煲 + 一拳米饭"></textarea>
        <input class="input" style="margin-top:10px;" v-model="captionDraft" placeholder="说点什么（可选）" maxlength="200" />
        <button class="btn-primary" style="margin-top:14px;" :disabled="posting" @click="post">
          {{ posting ? '发布中…' : '发布动态' }}
        </button>
      </div>

      <!-- 动态 -->
      <div class="section-label">饭友动态</div>
      <div v-for="p in posts" :key="p.id" class="card post-card">
        <div class="post-head">
          <div class="post-face">{{ p.emoji }}</div>
          <div class="post-meta">
            <div class="post-name">{{ p.name }}<span v-if="p.code === me.code" class="me-badge">我</span></div>
            <div class="post-time">{{ fmtTime(p.createdAt) }}</div>
          </div>
        </div>
        <div class="post-meal">{{ p.mealText }}</div>
        <div v-if="p.caption" class="post-caption">{{ p.caption }}</div>
      </div>
      <p v-if="!posts.length" class="subtitle">还没有动态，去晒一晒吧。</p>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getCommunityMe, setCommunityMe, getDiary } from '../services/store.js'
import {
  communityRegister, communityAddFriend, communityFriends, communityPost, communityFeed
} from '../services/agent.js'

const EMOJIS = ['😊', '😎', '🤗', '😋', '🤓', '🥳', '😺', '🐱', '🐶', '🐼', '🦊', '🍚']

const me = ref(null)
const friends = ref([])
const posts = ref([])
const nameDraft = ref('')
const emojiDraft = ref('😊')
const friendCodeDraft = ref('')
const mealDraft = ref('')
const captionDraft = ref('')
const busy = ref(false)
const posting = ref(false)

onMounted(() => {
  me.value = getCommunityMe()
  if (me.value) {
    loadFriends()
    loadFeed()
    mealDraft.value = todaySummary()
  }
})

async function register() {
  busy.value = true
  const r = await communityRegister({ name: nameDraft.value, emoji: emojiDraft.value })
  busy.value = false
  if (r && r.ok && r.data && r.data.me) {
    me.value = r.data.me
    setCommunityMe(r.data.me)
    mealDraft.value = todaySummary()
    loadFriends()
    loadFeed()
  } else {
    alert('创建失败，请稍后再试')
  }
}

async function addFriend() {
  const code = friendCodeDraft.value.trim().toUpperCase()
  if (!code) return
  busy.value = true
  const r = await communityAddFriend({ meCode: me.value.code, friendCode: code })
  busy.value = false
  if (r && r.ok && r.data) {
    friends.value = r.data.friends || friends.value
    friendCodeDraft.value = ''
    loadFeed()
    if (r.data.friend) alert('已添加 ' + r.data.friend.name)
  } else {
    alert((r && r.error) || '添加失败')
  }
}

async function loadFriends() {
  const r = await communityFriends({ meCode: me.value.code })
  if (r && r.ok && r.data) friends.value = r.data.friends || []
}

async function loadFeed() {
  const r = await communityFeed({ meCode: me.value.code })
  if (r && r.ok && r.data) posts.value = r.data.posts || []
}

async function post() {
  const text = mealDraft.value.trim()
  if (!text) { alert('先写点什么再发布'); return }
  posting.value = true
  const r = await communityPost({ meCode: me.value.code, mealText: text, caption: captionDraft.value.trim() })
  posting.value = false
  if (r && r.ok && r.data && r.data.post) {
    posts.value = [r.data.post, ...posts.value.filter(p => p.id !== r.data.post.id)]
    captionDraft.value = ''
  } else {
    alert((r && r.error) || '发布失败')
  }
}

function copyCode() {
  const t = me.value.code
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(() => alert('已复制'), () => fallbackCopy(t))
  } else {
    fallbackCopy(t)
  }
}
function fallbackCopy(t) {
  const ta = document.createElement('textarea')
  ta.value = t; document.body.appendChild(ta); ta.select()
  try { document.execCommand('copy'); alert('已复制') } catch (e) { alert('复制失败，请长按选择') }
  document.body.removeChild(ta)
}

function todaySummary() {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const parts = []
  getDiary().forEach(d => {
    if ((d.createdAt || 0) < today.getTime()) return
    const names = (d.items || []).map(i => i.name).filter(Boolean).join('、')
    if (!names) return
    parts.push((d.meal ? d.meal + '：' : '') + names)
  })
  return parts.join(' · ')
}

function fmtTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return m + ' 分钟前'
  const h = Math.floor(m / 60)
  if (h < 24) return h + ' 小时前'
  const d = Math.floor(h / 24)
  if (d < 7) return d + ' 天前'
  const dt = new Date(ts)
  return (dt.getMonth() + 1) + '/' + dt.getDate()
}
</script>

<style scoped>
.hint { color: var(--ink-3); font-size: 12px; margin: 12px 0 0; line-height: 1.6; }

/* 头像选择 */
.emoji-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.emoji-chip {
  width: 42px; height: 42px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; cursor: pointer; user-select: none;
  border: 1px solid var(--line); background: #fff;
  transition: border-color .12s, box-shadow .12s;
}
.emoji-chip.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }

/* 我的身份 */
.me-row { display: flex; align-items: center; gap: 12px; }
.me-face {
  width: 52px; height: 52px; border-radius: 50%;
  background: var(--paper-2); display: flex; align-items: center;
  justify-content: center; font-size: 26px;
}
.me-info { flex: 1; min-width: 0; }
.me-name { font-size: 16px; font-weight: 500; color: var(--ink); }
.me-code { font-size: 12px; color: var(--ink-3); margin-top: 2px; }
.code { color: var(--accent); font-weight: 600; letter-spacing: 0.06em; }
.act {
  background: transparent; border: 1px solid var(--line);
  color: var(--ink-2); padding: 6px 14px; font-size: 12px;
  border-radius: 999px; cursor: pointer; white-space: nowrap;
}

/* 添加好友 */
.add-row { display: flex; gap: 8px; margin-top: 4px; }
.add-row .input { flex: 1; }
.add-btn {
  background: transparent; border: 1px solid var(--line);
  color: var(--ink); font-size: 13px; padding: 0 18px;
  border-radius: 999px; cursor: pointer; white-space: nowrap;
}
.add-btn:disabled { opacity: 0.4; }

/* 好友 */
.friend-row { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.friend-row::-webkit-scrollbar { display: none; }
.friend-chip { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 52px; }
.friend-face {
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--paper-2); display: flex; align-items: center;
  justify-content: center; font-size: 22px;
}
.friend-name { font-size: 11px; color: var(--ink-2); max-width: 56px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 动态 */
.post-card { padding: 18px 0 22px; }
.post-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.post-face {
  width: 38px; height: 38px; border-radius: 50%;
  background: var(--paper-2); display: flex; align-items: center;
  justify-content: center; font-size: 19px;
}
.post-meta { flex: 1; min-width: 0; }
.post-name { font-size: 14px; font-weight: 500; color: var(--ink); }
.me-badge {
  display: inline-block; font-size: 10px; background: var(--accent);
  color: #fff; padding: 0 6px; border-radius: 999px; margin-left: 6px; vertical-align: 1px;
}
.post-time { font-size: 11px; color: var(--ink-3); }
.post-meal { font-size: 15px; color: var(--ink); line-height: 1.6; }
.post-caption { font-size: 13px; color: var(--ink-2); margin-top: 6px; line-height: 1.6; }
</style>
