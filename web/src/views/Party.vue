<template>
  <div>
    <h1 class="title">聚餐决定</h1>
    <p class="subtitle">合并大家的口味，避开每个人的过敏和忌口。</p>

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
      <!-- 头部 -->
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

      <!-- 页 1: 菜系 -->
      <div class="swipe-body" v-show="pageIdx === 0">
        <div class="section-label">喜欢的菜系</div>
        <div class="row">
          <span v-for="c in cuisineOptions" :key="c" class="tag"
                :class="{active: active.cuisines.includes(c)}"
                @click="toggleCuisine(c)">{{ c }}</span>
        </div>
        <div class="page-hint">← 左右滑动切换 →</div>
      </div>

      <!-- 页 2: 辣度 + 过敏 -->
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

      <!-- 页 3: 忌口 + 导入 -->
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

      <!-- 底部导航箭头 -->
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

    <!-- 结果 -->
    <div class="card" v-for="p in picks" :key="p.key">
      <div class="pick-title">{{ p.title }}</div>
      <div class="pick-dish">{{ p.dish }}</div>
      <div class="row">
        <span class="tag active">{{ p.budget }}</span>
      </div>
      <p class="pick-reason">{{ p.reason }}</p>
      <p class="pick-notes" v-if="p.notes">备注：{{ p.notes }}</p>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, computed } from 'vue'
import { getProfile, decodeProfileText } from '../services/store.js'
import { party as callParty } from '../services/agent.js'

const USER_EMOJIS = ['😊', '😎', '🤗', '🫡', '😋', '🤓', '🥳', '😺', '🐱', '🐶', '🦊', '🐼']
const cuisineOptions = ['川菜', '粤菜', '湘菜', '本帮菜', '杭帮菜', '西北', '东北', '日料', '韩料', '东南亚', '西餐', '快餐']
const spicyOptions = [
  { v: 0, label: '不吃辣' }, { v: 1, label: '微辣' },
  { v: 2, label: '中辣' }, { v: 3, label: '重辣' }
]
const pages = ['菜系偏好', '辣度 & 过敏', '忌口 & 导入']

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

onMounted(() => {
  const my = getProfile() || {}
  const me = newMember({
    isMe: true, emoji: '😊', name: '我',
    cuisines: (my.prefer && my.prefer.cuisines) || [],
    spicy: (my.prefer && my.prefer.spicy) != null ? my.prefer.spicy : 1,
    allergies: (my.basic && my.basic.allergies) || [],
    taboos: (my.basic && my.basic.taboos) || [],
    healthPrefs: (my.basic && my.basic.healthPrefs) || []
  })
  members.value.push(me)
  addMember()
  activeIdx.value = 0
})

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

// 触摸滑动
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

async function generate() {
  running.value = true
  picks.value = []
  const payload = {
    members: members.value.map(m => ({
      name: m.name, isMe: m.isMe,
      cuisines: m.cuisines, spicy: m.spicy,
      allergies: m.allergies, taboos: m.taboos,
      healthPrefs: m.healthPrefs
    })),
    party: { ...party }
  }
  const r = await callParty(payload)
  running.value = false
  if (r && r.ok) picks.value = r.data.picks || []
  else alert('生成失败，请稍后再试')
}
</script>

<style scoped>
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

/* 页面圆点 */
.page-dots { display: flex; gap: 6px; }
.dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(74,52,40,0.15);
  transition: background 160ms ease, transform 160ms ease;
}
.dot.on { background: #c46a3a; transform: scale(1.3); }

/* 滑动内容 */
.swipe-body { min-height: 120px; }
.page-hint {
  text-align: center; color: #c89684; font-size: 11px;
  margin-top: 14px; opacity: 0.6;
}

/* 底部导航 */
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

/* ===== 共用标签 ===== */
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
  color: #2a1e17; font-size: 12px;
  padding: 0 14px; border-radius: 999px; cursor: pointer; white-space: nowrap;
}

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
</style>
