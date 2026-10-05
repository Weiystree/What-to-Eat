<template>
  <div>
    <h1 class="title">饭搭子</h1>
    <p class="subtitle">和朋友一起决定吃什么，也看看大家在吃啥。</p>

    <!-- ===== 一起决定吃什么（聚餐） ===== -->
    <div class="card cta-card">
      <div class="cta-copy">
        <div class="cta-title">和朋友一起吃？</div>
        <div class="cta-desc">合并大家的口味、过敏和忌口，一键出方案</div>
      </div>
      <button class="btn-primary cta-btn" @click="showParty = !showParty">
        {{ showParty ? '收起' : '帮我们决定' }}
      </button>
    </div>

    <template v-if="showParty">
      <!-- 人物头像行 -->
      <div class="card avatar-card">
        <div class="avatar-row">
          <div v-for="(m, idx) in members" :key="m.id" class="avatar-chip"
               :class="{ active: activeIdx === idx }"
               @click="activeIdx = idx">
            <div class="avatar-face">{{ m.emoji }}</div>
            <div class="avatar-name">{{ m.name || '未命名' }}</div>
            <div v-if="m.isMe" class="avatar-me">我</div>
          </div>
          <div class="avatar-chip add-chip" @click="addMember">
            <div class="avatar-face add-face">＋</div>
            <div class="avatar-name">添加</div>
          </div>
        </div>
      </div>

      <!-- 当前用户的滑动卡片 -->
      <div class="card swipe-card"
           @touchstart="onTouchStart"
           @touchend="onTouchEnd">
        <div class="swipe-head">
          <div class="swipe-user">
            <span class="swipe-emoji">{{ active.emoji }}</span>
            <input class="input inline" v-model="active.name" placeholder="参与者昵称" />
            <button v-if="!active.isMe" class="act danger" @click="removeActive">删除</button>
          </div>
          <div class="page-dots">
            <span v-for="(_, i) in pages" :key="i" class="dot" :class="{ on: pageIdx === i }"></span>
          </div>
        </div>

        <div class="swipe-body" v-show="pageIdx === 0">
          <div class="section-label">喜欢的菜系</div>
          <div class="row">
            <span v-for="c in cuisineOptions" :key="c" class="tag"
                  :class="{active: active.cuisines.includes(c)}"
                  @click="toggleCuisine(c)">{{ c }}</span>
          </div>
          <div class="page-hint">← 左右滑动切换 →</div>
        </div>

        <div class="swipe-body" v-show="pageIdx === 1">
          <div class="section-label">辣度</div>
          <div class="row">
            <span v-for="s in spicyOptions" :key="s.v" class="tag"
                  :class="{active: active.spicy === s.v}"
                  @click="active.spicy = s.v">{{ s.label }}</span>
          </div>

          <div class="section-label">过敏</div>
          <div class="row">
            <span v-for="a in active.allergies" :key="a" class="tag active danger-tag"
                  @click="removeTag(active, 'allergies', a)">{{ a }} ×</span>
          </div>
          <div class="add-row">
            <input class="input" placeholder="例如：花生，回车添加" v-model="allergyDraft"
                   @keyup.enter="pushAllergy"/>
            <button class="add-btn" @click="pushAllergy">添加</button>
          </div>
          <div class="page-hint">← 左右滑动切换 →</div>
        </div>

        <div class="swipe-body" v-show="pageIdx === 2">
          <div class="section-label">忌口</div>
          <div class="row">
            <span v-for="a in active.taboos" :key="a" class="tag active"
                  @click="removeTag(active, 'taboos', a)">{{ a }} ×</span>
          </div>
          <div class="add-row">
            <input class="input" placeholder="例如：不吃牛肉，回车添加" v-model="tabooDraft"
                   @keyup.enter="pushTaboo"/>
            <button class="add-btn" @click="pushTaboo">添加</button>
          </div>

          <div class="section-label">导入朋友分享的画像</div>
          <div class="add-row">
            <input class="input" placeholder="粘贴 MEAL1:... 或 JSON" v-model="importDraft"/>
            <button class="add-btn" @click="doImport">导入</button>
          </div>
        </div>

        <div class="swipe-nav">
          <span class="nav-arrow" :class="{ dim: pageIdx === 0 }" @click="prevPage">‹</span>
          <span class="nav-label">{{ pageIdx + 1 }} / {{ pages.length }}</span>
          <span class="nav-arrow" :class="{ dim: pageIdx === pages.length - 1 }" @click="nextPage">›</span>
        </div>
      </div>

      <!-- 聚餐设置 -->
      <div class="card">
        <div class="section-label">聚餐场景</div>
        <div class="row">
          <span v-for="o in [{v:'餐厅',l:'外卖/餐厅'},{v:'家里做',l:'家里做'}]" :key="o.v" class="tag"
                :class="{active: party.scene === o.v}" @click="party.scene = o.v">{{ o.l }}</span>
        </div>
        <div class="section-label">人均预算</div>
        <div class="row">
          <span v-for="o in ['≤ 40 元','40~80 元','80~150 元','≥ 150 元']" :key="o" class="tag"
                :class="{active: party.budget === o}" @click="party.budget = o">{{ o }}</span>
        </div>
      </div>

      <button class="btn-primary" :disabled="running" @click="generate">
        {{ running ? '正在生成…' : '生成聚餐方案' }}
      </button>

      <div class="card" v-for="p in picks" :key="p.key">
        <div class="pick-title">{{ p.title }}</div>
        <div class="pick-dish">{{ p.dish }}</div>
        <div class="row">
          <span class="tag active">{{ p.budget }}</span>
        </div>
        <p class="pick-reason">{{ p.reason }}</p>
        <p class="pick-notes" v-if="p.notes">备注：{{ p.notes }}</p>
      </div>
    </template>

    <!-- ===== 我的饭搭子（好友 / 邀请码） ===== -->
    <div class="section-gap"></div>

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

      <!-- Q4 · Food Profile Sharing：口味共享给好友（不含生日/体重/日记） -->
      <div class="card">
        <div class="section-label">口味共享</div>
        <p class="hint" style="margin:0 0 12px;">开启后，好友聚餐时能参考你的菜系偏好与过敏/忌口（不会共享生日、体重、日记）。</p>
        <button class="add-btn" :class="{ on: shareOn }" @click="toggleShare">{{ shareOn ? '已共享 ✓ 点击关闭' : '共享我的口味' }}</button>
      </div>

      <div class="card">
        <div class="section-label">添加好友</div>
        <div class="add-row">
          <input class="input" v-model="friendCodeDraft" placeholder="输入朋友的邀请码" maxlength="6" />
          <button class="add-btn" :disabled="busy" @click="addFriend">添加</button>
        </div>
      </div>

      <div class="card" v-if="friendRows.length">
        <div class="section-label">好友 · {{ friendRows.length }}</div>
        <div v-for="f in friendRows" :key="f.code" class="friend-line">
          <div class="friend-face">{{ f.emoji }}</div>
          <div class="friend-main">
            <div class="friend-name2">{{ f.name }}</div>
            <div class="friend-share">{{ shareSummary(f) }}</div>
          </div>
          <button v-if="f.share" class="add-btn" @click="addFriendMember(f)">加入聚餐</button>
        </div>
      </div>

      <div class="card">
        <div class="section-label">晒一晒今天吃了什么</div>
        <textarea class="textarea" v-model="mealDraft" placeholder="例如：午餐：番茄虾仁豆腐煲 + 一拳米饭"></textarea>
        <input class="input" style="margin-top:10px;" v-model="captionDraft" placeholder="说点什么（可选）" maxlength="200" />
        <button class="btn-primary" style="margin-top:14px;" :disabled="posting" @click="post">
          {{ posting ? '发布中…' : '发布动态' }}
        </button>
      </div>

      <div class="section-label">饭搭子动态</div>
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
import { reactive, ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  getProfile, decodeProfileText, getCommunityMe, setCommunityMe, getDiary,
  getSavedLocation, requestGeolocation
} from '../services/store.js'
import {
  party as callParty,
  recommendGroup as callRecommendGroup,
  communityRegister, communityAddFriend, communityFriends, communityPost, communityFeed,
  communityShareProfile, communityGetProfiles
} from '../services/agent.js'

const route = useRoute()

// —— 聚餐决定（原 Party） ——
const USER_EMOJIS = ['😊', '😎', '🤗', '🫡', '😋', '🤓', '🥳', '😺', '🐱', '🐶', '🦊', '🐼']
const cuisineOptions = ['川菜', '粤菜', '湘菜', '本帮菜', '杭帮菜', '西北', '东北', '日料', '韩料', '东南亚', '西餐', '快餐']
const spicyOptions = [
  { v: 0, label: '不吃辣' }, { v: 1, label: '微辣' },
  { v: 2, label: '中辣' }, { v: 3, label: '重辣' }
]
const pages = ['菜系偏好', '辣度 & 过敏', '忌口 & 导入']

const showParty = ref(false)
const members = ref([])
const activeIdx = ref(0)
const pageIdx = ref(0)
const party = reactive({ scene: '餐厅', budget: '40~80 元' })
const picks = ref([])
const running = ref(false)

const allergyDraft = ref('')
const tabooDraft = ref('')
const importDraft = ref('')

let idSeq = 0
let emojiIdx = 0

const active = computed(() => members.value[activeIdx.value] || members.value[0])

function newMember(base) {
  const emoji = USER_EMOJIS[emojiIdx % USER_EMOJIS.length]
  emojiIdx++
  return reactive({
    id: ++idSeq,
    isMe: !!(base && base.isMe),
    emoji: (base && base.emoji) || emoji,
    name: (base && base.name) || '',
    cuisines: (base && base.cuisines) || [],
    spicy: (base && base.spicy) != null ? base.spicy : 1,
    allergies: (base && base.allergies) || [],
    taboos: (base && base.taboos) || [],
    healthPrefs: (base && base.healthPrefs) || []
  })
}
function nextFriendName() {
  return '朋友 ' + (members.value.filter(m => !m.isMe).length + 1)
}

function addMember() {
  members.value.push(newMember({ name: nextFriendName() }))
  activeIdx.value = members.value.length - 1
  pageIdx.value = 0
}
function removeActive() {
  if (active.value.isMe) return
  const idx = activeIdx.value
  members.value.splice(idx, 1)
  if (activeIdx.value >= members.value.length) activeIdx.value = members.value.length - 1
}
function toggleCuisine(c) {
  const arr = active.value.cuisines
  const i = arr.indexOf(c)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(c)
}
function removeTag(m, field, v) {
  const i = m[field].indexOf(v); if (i >= 0) m[field].splice(i, 1)
}
function pushAllergy() {
  const v = allergyDraft.value.trim(); if (!v) return
  if (!active.value.allergies.includes(v)) active.value.allergies.push(v)
  allergyDraft.value = ''
}
function pushTaboo() {
  const v = tabooDraft.value.trim(); if (!v) return
  if (!active.value.taboos.includes(v)) active.value.taboos.push(v)
  tabooDraft.value = ''
}
function doImport() {
  const p = decodeProfileText(importDraft.value || '')
  if (!p) { alert('无法识别画像文本'); return }
  const basic = p.basic || {}
  const prefer = p.prefer || {}
  active.value.cuisines = prefer.cuisines || []
  active.value.spicy = prefer.spicy != null ? prefer.spicy : 1
  active.value.allergies = basic.allergies || []
  active.value.taboos = basic.taboos || []
  active.value.healthPrefs = basic.healthPrefs || []
  importDraft.value = ''
  alert('已导入。核对信息后再生成方案。')
}

function prevPage() {
  if (pageIdx.value > 0) pageIdx.value--
}
function nextPage() {
  if (pageIdx.value < pages.length - 1) pageIdx.value++
}

let touchStartX = 0
function onTouchStart(e) {
  touchStartX = e.touches[0].clientX
}
function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - touchStartX
  if (Math.abs(dx) > 60) {
    if (dx > 0) prevPage()
    else nextPage()
  }
}

// 餐厅场景走 recommendGroup（v2.md #19：好友画像 + 定位附近餐厅）；家里做走 runParty
async function generate() {
  running.value = true
  picks.value = []
  const list = members.value.map(m => ({
    name: m.name, isMe: m.isMe,
    cuisines: m.cuisines, spicy: m.spicy,
    allergies: m.allergies, taboos: m.taboos,
    healthPrefs: m.healthPrefs
  }))
  const payload = { members: list, party: { ...party } }
  let r
  if (party.scene === '餐厅') {
    let loc = getSavedLocation()
    if (!loc) loc = await requestGeolocation(8000)
    payload.location = loc
    r = await callRecommendGroup(payload)
  } else {
    r = await callParty(payload)
  }
  running.value = false
  if (r && r.ok) picks.value = r.data.picks || []
  else alert('生成失败，请稍后再试')
}

// —— Q4 · Food Profile Sharing ——
const shareOn = ref(false)
const friendProfiles = ref([])
// 好友展示行：优先用带共享画像的数据，拿不到就退化为基本信息
const friendRows = computed(() => {
  if (friendProfiles.value.length) return friendProfiles.value
  return friends.value.map(f => ({ ...f, share: null }))
})

function shareSummary(f) {
  if (!f.share) return '未共享口味'
  const s = f.share
  const parts = []
  if ((s.cuisines || []).length) parts.push('喜欢 ' + s.cuisines.join('/'))
  if ((s.allergies || []).length) parts.push('过敏：' + s.allergies.join('、'))
  if ((s.taboos || []).length) parts.push('忌口：' + s.taboos.join('、'))
  if (s.dislikes) parts.push('讨厌 ' + s.dislikes)
  return parts.length ? parts.join(' · ') : '共享了画像（无特殊限制）'
}

async function loadFriendProfiles() {
  const r = await communityGetProfiles({ meCode: me.value.code })
  if (r && r.ok && r.data) {
    friendProfiles.value = r.data.friends || []
    shareOn.value = !!(r.data.me && r.data.me.share)
  }
}

async function toggleShare() {
  const next = !shareOn.value
  const p = getProfile() || {}
  const share = next ? {
    allergies: (p.basic && p.basic.allergies) || [],
    taboos: (p.basic && p.basic.taboos) || [],
    cuisines: (p.prefer && p.prefer.cuisines) || [],
    spicy: p.prefer && p.prefer.spicy,
    dislikes: (p.prefer && p.prefer.dislikes) || '',
    healthPrefs: (p.basic && p.basic.healthPrefs) || []
  } : null
  const r = await communityShareProfile({ meCode: me.value.code, share })
  if (r && r.ok) {
    shareOn.value = next
    loadFriendProfiles()
  } else {
    alert('操作失败，请稍后再试')
  }
}

// 把共享了口味的好友一键加入聚餐参与者（画像预填，可再编辑）
function addFriendMember(f) {
  if (members.value.some(m => m.friendCode === f.code)) { alert(f.name + ' 已经在参与者里'); return }
  const s = f.share || {}
  const m = newMember({
    name: f.name,
    cuisines: s.cuisines || [],
    spicy: s.spicy != null ? s.spicy : 1,
    allergies: s.allergies || [],
    taboos: s.taboos || []
  })
  m.friendCode = f.code
  members.value.push(m)
  activeIdx.value = members.value.length - 1
  pageIdx.value = 0
  showParty.value = true
}

// —— 饭搭子（原 Community） ——
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
    loadFriendProfiles()
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

onMounted(() => {
  // 聚餐成员初始化
  const my = getProfile() || {}
  const me0 = newMember({
    isMe: true, emoji: '😊', name: '我',
    cuisines: (my.prefer && my.prefer.cuisines) || [],
    spicy: (my.prefer && my.prefer.spicy) != null ? my.prefer.spicy : 1,
    allergies: (my.basic && my.basic.allergies) || [],
    taboos: (my.basic && my.basic.taboos) || [],
    healthPrefs: (my.basic && my.basic.healthPrefs) || []
  })
  members.value.push(me0)
  addMember()
  activeIdx.value = 0
  // 从今日页「出去吃 → 和朋友」进来时直接展开聚餐面板
  if (route.query.party) showParty.value = true

  // 饭搭子身份初始化
  me.value = getCommunityMe()
  if (me.value) {
    loadFriends()
    loadFeed()
    loadFriendProfiles()
    mealDraft.value = todaySummary()
  }
})
</script>

<style scoped>
/* ===== CTA ===== */
.cta-card { display: flex; align-items: center; gap: 12px; }
.cta-copy { flex: 1; min-width: 0; }
.cta-title { font-size: 17px; font-weight: 500; color: var(--ink); margin-bottom: 3px; }
.cta-desc { font-size: 12px; color: var(--ink-3); line-height: 1.5; }
.cta-btn { width: auto; padding: 11px 20px; flex-shrink: 0; }

.section-gap { height: 8px; }

.section-label {
  font-size: 13px; color: #5a4a3f;
  margin-top: 14px; margin-bottom: 8px;
  font-weight: 400; letter-spacing: 0.01em;
}
.section-label:first-child { margin-top: 0; }
.row { display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
  display: inline-block; padding: 6px 12px; border-radius: 100px;
  background: #fff; color: #5a4a3f; font-size: 12px;
  cursor: pointer; border: 1px solid rgba(74,52,40,0.10);
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
  -webkit-tap-highlight-color: transparent; user-select: none;
}
.tag.active { background: #c46a3a; color: #fff; border-color: #c46a3a; }
.tag:active { opacity: 0.75; }
.danger-tag { border-color: rgba(160,74,58,0.2); color: #a04a3a; }
.add-row { display: flex; gap: 8px; margin-top: 10px; }
.add-row .input { flex: 1; }
.add-btn {
  background: transparent; border: 1px solid rgba(74,52,40,0.10);
  color: #2a1e17; font-size: 13px;
  padding: 0 16px; border-radius: 999px; cursor: pointer; white-space: nowrap;
}
.add-btn:disabled { opacity: 0.4; }

/* ===== 头像行 ===== */
.avatar-card { padding: 12px 0 8px; overflow: visible; }
.avatar-row {
  display: flex; gap: 10px; overflow-x: auto;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.avatar-row::-webkit-scrollbar { display: none; }
.avatar-chip {
  display: flex; flex-direction: column; align-items: center;
  gap: 4px; min-width: 56px; cursor: pointer;
  padding: 6px; border-radius: 12px;
  transition: background 120ms ease;
  -webkit-tap-highlight-color: transparent; user-select: none;
}
.avatar-chip.active { background: rgba(196,106,58,0.08); }
.avatar-face {
  width: 44px; height: 44px; border-radius: 50%;
  background: #f3ecdf; display: flex; align-items: center;
  justify-content: center; font-size: 22px;
  transition: box-shadow 120ms ease;
}
.avatar-chip.active .avatar-face { box-shadow: 0 0 0 2px #c46a3a; }
.add-face { color: #a89684; font-size: 18px; font-weight: 300; }
.avatar-name {
  font-size: 11px; color: #5a4a3f; max-width: 56px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-align: center;
}
.avatar-me {
  font-size: 9px; background: #c46a3a; color: #fff;
  padding: 1px 6px; border-radius: 999px;
}

/* ===== 滑动卡片 ===== */
.swipe-card {
  padding: 16px 16px 12px;
  -webkit-tap-highlight-color: transparent; user-select: none;
}
.swipe-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 14px; gap: 10px;
}
.swipe-user { display: flex; align-items: center; gap: 8px; flex: 1; }
.swipe-emoji { font-size: 24px; line-height: 1; }
.input.inline {
  flex: 1; padding: 8px 10px; font-size: 14px;
  background: transparent; color: #2a1e17; border: none; outline: none;
  min-width: 0;
}
.act {
  background: transparent; border: 1px solid rgba(74,52,40,0.10);
  color: #5a4a3f; padding: 4px 12px; font-size: 12px;
  border-radius: 999px; cursor: pointer; white-space: nowrap;
}
.act.danger { color: #a04a3a; border-color: rgba(160,74,58,0.2); }

.page-dots { display: flex; gap: 6px; }
.dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(74,52,40,0.15);
  transition: background 160ms ease, transform 160ms ease;
}
.dot.on { background: #c46a3a; transform: scale(1.3); }

.swipe-body { min-height: 120px; }
.page-hint {
  text-align: center; color: #c89684; font-size: 11px;
  margin-top: 14px; opacity: 0.6;
}

.swipe-nav {
  display: flex; align-items: center; justify-content: center;
  gap: 12px; margin-top: 10px;
}
.nav-arrow {
  font-size: 22px; color: #c46a3a; cursor: pointer;
  padding: 4px 10px; line-height: 1;
  transition: opacity 120ms ease;
  -webkit-tap-highlight-color: transparent;
}
.nav-arrow.dim { opacity: 0.25; pointer-events: none; }
.nav-label { font-size: 12px; color: #a89684; }

/* ===== 结果 ===== */
.pick-title {
  color: #c46a3a; font-size: 12px;
  font-weight: 400; letter-spacing: 0.1em;
  text-transform: uppercase; margin-bottom: 12px;
}
.pick-dish {
  font-size: 24px; font-weight: 300; color: #2a1e17;
  letter-spacing: -0.01em; line-height: 1.3; margin-bottom: 16px;
}
.pick-reason { color: #5a4a3f; font-size: 14px; line-height: 1.7; margin: 10px 0; }
.pick-notes { color: #a89684; font-size: 13px; margin: 10px 0 0; font-style: italic; }

/* ===== 社区 ===== */
.hint { color: var(--ink-3); font-size: 12px; margin: 12px 0 0; line-height: 1.6; }

.emoji-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.emoji-chip {
  width: 42px; height: 42px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; cursor: pointer; user-select: none;
  border: 1px solid var(--line); background: #fff;
  transition: border-color .12s, box-shadow .12s;
}
.emoji-chip.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }

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

.friend-row { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.friend-row::-webkit-scrollbar { display: none; }
.friend-chip { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 52px; }
.friend-face {
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--paper-2); display: flex; align-items: center;
  justify-content: center; font-size: 22px;
}
.friend-name { font-size: 11px; color: var(--ink-2); max-width: 56px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 好友行（含共享画像） */
.friend-line {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0; border-bottom: 1px solid rgba(74,52,40,0.06);
}
.friend-line:last-child { border-bottom: none; }
.friend-main { flex: 1; min-width: 0; }
.friend-name2 { font-size: 15px; color: var(--ink); }
.friend-share { font-size: 12px; color: var(--ink-3); margin-top: 2px; line-height: 1.5; }
.add-btn.on { background: var(--accent); color: #fff; border-color: var(--accent); }

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
