<template>
  <div>
    <!-- 头部问候 -->
    <div class="card head-card">
      <div class="greet">{{ greeting }}</div>
      <div class="status-line">{{ modeLabel }} · 下一餐：{{ nextMeal }} · 今天已记录 {{ diaryToday }} 餐</div>
    </div>

    <!-- 场景入口 -->
    <div class="card">
      <!-- 随手拍 - 大按钮 -->
      <div class="snap-btn" @click="onSnap">
        <div class="snap-icon">📷</div>
        <div class="snap-label">随手拍</div>
        <div class="snap-desc">拍照识别吃了什么</div>
      </div>
      <input ref="snapInput" type="file" accept="image/*" hidden @change="onSnapPhoto" />

      <!-- 两个半宽按钮 -->
      <div class="dual-row">
        <div class="dual-btn" @click="onHomeCook">
          <div class="dual-icon">🏠</div>
          <div class="dual-label">在家做</div>
          <div class="dual-desc">拍冰箱 · 推荐菜</div>
        </div>
        <input ref="fridgeInput" type="file" accept="image/*" hidden @change="onFridgePhoto" />

        <div class="dual-btn" @click="onSceneOut">
          <div class="dual-icon">🍽️</div>
          <div class="dual-label">出去吃</div>
          <div class="dual-desc">
            <template v-if="location">已定位 · 附近餐厅</template>
            <template v-else>地图 · 找餐厅</template>
          </div>
        </div>
      </div>

      <!-- 状态提示 -->
      <div v-if="capturing" class="inline-status">
        {{ snapMode === 'meal' ? '📷 识别菜品中…' : '🥬 识别冰箱食材中…' }}
      </div>
      <div v-if="showLocHint" class="loc-hint" @click="refreshLocation">
        {{ locating ? '📍 定位中…' : '📍 开启定位，推荐附近好评餐厅 →' }}
      </div>
    </div>

    <!-- 偏好设置（可折叠） -->
    <div class="card">
      <div class="pref-header" @click="showPrefs = !showPrefs">
        <span class="q-title" style="margin-bottom:0">偏好设置</span>
        <span class="pref-summary" v-if="!showPrefs">{{ prefSummary }}</span>
        <span class="chev-pref" :class="{ up: showPrefs }">›</span>
      </div>

      <transition
        name="accordion"
        @before-enter="beforeEnter"
        @enter="enter"
        @after-enter="afterEnter"
        @before-leave="beforeLeave"
        @leave="leave"
      >
        <div v-if="showPrefs" class="pref-body">
          <div class="section-label">你现在有多饿</div>
          <div class="row">
            <span v-for="o in hungerOptions" :key="o" class="tag"
                  :class="{active: ctx.hunger === o}" @click="set('hunger', o)">{{ o }}</span>
          </div>

          <div class="section-label">今天心情</div>
          <div class="row">
            <span v-for="o in moodOptions" :key="o" class="tag"
                  :class="{active: ctx.mood === o}" @click="set('mood', o)">{{ o }}</span>
          </div>

          <div class="section-label">这一餐有多少时间</div>
          <div class="row">
            <span v-for="o in timeOptions" :key="o" class="tag"
                  :class="{active: ctx.time === o}" @click="set('time', o)">{{ o }}</span>
          </div>

          <div class="section-label">单餐预算</div>
          <div class="row">
            <span v-for="o in budgetOptions" :key="o" class="tag"
                  :class="{active: budgetMode === 'preset' && ctx.budget === o}"
                  @click="setBudget(o)">{{ o }}</span>
            <span class="tag" :class="{active: budgetMode === 'custom'}" @click="budgetMode = 'custom'">自定义</span>
          </div>
          <div v-if="budgetMode === 'custom'" class="budget-custom">
            <input class="input budget-num" type="number" placeholder="下限" v-model="budgetMin" @change="saveBudgetCustom"/>
            <span class="budget-dash">—</span>
            <input class="input budget-num" type="number" placeholder="上限" v-model="budgetMax" @change="saveBudgetCustom"/>
            <span class="budget-unit">元</span>
          </div>

          <div class="section-label">此刻特别想吃</div>
          <div class="row">
            <span v-for="o in craveOptions" :key="o" class="tag"
                  :class="{active: ctx.crave === o}" @click="set('crave', o)">{{ o }}</span>
          </div>

          <div class="section-label">个性化补充（可选）</div>
          <textarea class="textarea"
                    placeholder="例如：今天不想吃米饭 / 想吃茄子 / 中午没吃菜"
                    v-model="personalNote"
                    @change="saveNote"></textarea>
        </div>
      </transition>
    </div>

    <!-- 今日营养建议 -->
    <div class="card">
      <div class="q-title">今日营养建议</div>
      <div v-if="nutritionLoading" class="subtitle">正在结合你最近几天的饮食生成建议…</div>
      <div v-else-if="nutrition && nutrition.items && nutrition.items.length">
        <div
          v-for="(n, idx) in nutrition.items"
          :key="n.name"
          class="nutri-row"
          :class="{ open: expanded === idx }"
          @click="toggleExpand(idx)"
        >
          <div class="nutri-head">
            <div class="nutri-name">
              {{ n.name }} <span class="nutri-portion">· {{ n.portion }}</span>
            </div>
            <span class="chev" :class="{ up: expanded === idx }">›</span>
          </div>
          <transition
            name="accordion"
            @before-enter="beforeEnter"
            @enter="enter"
            @after-enter="afterEnter"
            @before-leave="beforeLeave"
            @leave="leave"
          >
            <div v-if="expanded === idx" class="nutri-detail">
              <div class="nutri-why">{{ n.why }}</div>
            </div>
          </transition>
        </div>
        <div class="nutri-summary" v-if="nutrition.summary">{{ nutrition.summary }}</div>
      </div>
      <div v-else class="subtitle">再记录几餐就能看到个性化的营养建议。</div>
      <button class="btn-ghost slim" @click="loadNutrition">刷新建议</button>
    </div>

    <!-- 今日提醒 -->
    <div class="card">
      <div class="q-title">今日提醒</div>
      <p class="reminder">{{ reminder }}</p>
    </div>

    <!-- 在家做结果弹层 -->
    <div v-if="showFridgeResult" class="mask" @click.self="showFridgeResult = false">
      <div class="sheet fridge-sheet">
        <div class="sheet-head">
          <span>冰箱里的发现</span>
          <button class="close" @click="showFridgeResult = false">×</button>
        </div>

        <!-- 识别到的食材 -->
        <div class="fridge-section">
          <div class="fridge-section-title">🥬 识别到的食材</div>
          <div class="fridge-tags">
            <span v-for="ing in fridgeResult.ingredients" :key="ing.name"
                  class="fridge-tag" :class="freshClass(ing.freshness)">
              {{ ing.name }}<span class="fresh-dot">{{ freshDot(ing.freshness) }}</span>
            </span>
          </div>
        </div>

        <!-- 推荐菜品 -->
        <div class="fridge-section">
          <div class="fridge-section-title">🍳 推荐菜品</div>
          <div v-for="(d, i) in fridgeResult.dishes" :key="i" class="dish-card">
            <div class="dish-name">{{ d.name }}</div>
            <div class="dish-reason">{{ d.reason }}</div>
            <div class="dish-meta">
              <span class="dish-meta-item">⏱ {{ d.time }}</span>
              <span class="dish-meta-item" v-if="d.difficulty">{{ d.difficulty }}</span>
            </div>
            <div class="dish-ingredients">
              <span class="dish-use-label">用到的：</span>
              <span v-for="u in d.uses" :key="u" class="dish-use-tag">{{ u }}</span>
              <span v-if="d.missing && d.missing.length" class="dish-miss-label">还缺：</span>
              <span v-for="m in d.missing" :key="m" class="dish-miss-tag">{{ m }}</span>
            </div>
            <div v-if="d.howto" class="dish-howto">{{ d.howto }}</div>
            <div class="dish-actions">
              <a class="dish-bili-link"
                 :href="biliSearchUrl(d.name)"
                 target="_blank" rel="noopener noreferrer">📺 B站教程 →</a>
            </div>
          </div>
        </div>

        <div class="fridge-saved-note">🥬 识别到的食材已保存到本机冰箱清单</div>
      </div>
    </div>

    <!-- 手动记录弹层 -->
    <div v-if="showManualEntry" class="mask" @click.self="showManualEntry = false">
      <div class="sheet">
        <div class="sheet-head">
          <span>记录吃了什么</span>
          <button class="close" @click="showManualEntry = false">×</button>
        </div>
        <input class="input" v-model="manualText" placeholder="例如：一碗米饭、红烧鸡肉、炒青菜" />
        <div v-if="estimatingManual" class="subtitle" style="margin-top: 8px;">识别中，请稍候…</div>
        <button class="btn-primary" style="margin-top:16px;" :disabled="estimatingManual" @click="saveManualEntry">保存</button>
      </div>
    </div>

    <!-- Agent 入口悬浮按钮 -->
    <button class="agent-fab" @click="goAgent" aria-label="问问 NextMeal">✨ 问问 NextMeal</button>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  getProfile, getDiary, getTodayContext, setTodayContext,
  deriveAgeMode, setPending, getDeliveryStores,
  getSavedLocation, requestGeolocation, appendDiary,
  getCachedNutrition, setCachedNutrition,
  setFridgeInventory
} from '../services/store.js'
import { recognizeMeal, dailyNutrition, estimateMeal, fridgeToRecipe } from '../services/agent.js'

const router = useRouter()
const ctx = reactive({
  hunger: '一般', mood: '普通', time: '20 分钟',
  scene: '餐厅', crave: '无所谓'
})
const personalNote = ref('')
const showManualEntry = ref(false)
const manualText = ref('')
const greeting = ref('')
const modeLabel = ref('')
const nextMeal = ref('')
const diaryToday = ref(0)
const reminder = ref('')
const capturing = ref(false)
const estimatingManual = ref(false)
const showPrefs = ref(false)
const snapMode = ref('meal') // 'meal' | 'fridge'

// 冰箱识别结果
const showFridgeResult = ref(false)
const fridgeResult = ref({ ingredients: [], dishes: [] })

const nutrition = ref(null)
const nutritionLoading = ref(false)
const expanded = ref(-1)
const location = ref(null)
const locating = ref(false)
const budgetMode = ref('preset')
const budgetMin = ref('')
const budgetMax = ref('')
const budgetOptions = ['≤ 20 元', '20~40 元', '40~80 元', '≥ 80 元']
const snapInput = ref(null)
const fridgeInput = ref(null)

const showLocHint = computed(() => ctx.scene === '餐厅' && !location.value)

const prefSummary = computed(() => {
  const parts = []
  if (ctx.hunger !== '一般') parts.push(ctx.hunger)
  if (ctx.mood !== '普通') parts.push(ctx.mood)
  if (ctx.time !== '20 分钟') parts.push(ctx.time)
  if (ctx.budget && ctx.budget !== '20~40 元') parts.push(ctx.budget)
  if (ctx.crave !== '无所谓') parts.push(ctx.crave)
  return parts.length ? parts.join(' · ') : '默认偏好'
})

function freshClass(f) {
  if (!f) return ''
  if (f.includes('尽快')) return 'fresh-urgent'
  if (f.includes('一般')) return 'fresh-ok'
  return 'fresh-good'
}
function freshDot(f) {
  if (!f) return ''
  if (f.includes('尽快')) return '🔴'
  if (f.includes('一般')) return '🟡'
  return '🟢'
}
function biliSearchUrl(dishName) {
  const kw = (dishName || '') + ' 做法'
  return 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(kw)
}

async function refreshLocation() {
  if (locating.value) return
  locating.value = true
  const loc = await requestGeolocation()
  locating.value = false
  if (loc) location.value = loc
  else alert('无法获取当前位置，请在浏览器设置里允许定位权限。')
}

function toggleExpand(idx) {
  expanded.value = expanded.value === idx ? -1 : idx
}

// Vue transition JS hooks
function beforeEnter(el) {
  el.style.height = '0'
  el.style.opacity = '0'
}
function enter(el, done) {
  const target = el.scrollHeight
  requestAnimationFrame(() => {
    el.style.transition = 'height 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease'
    el.style.height = target + 'px'
    el.style.opacity = '1'
    el.addEventListener('transitionend', function handler(e) {
      if (e.propertyName !== 'height') return
      el.removeEventListener('transitionend', handler)
      done()
    })
  })
}
function afterEnter(el) {
  el.style.height = ''
  el.style.transition = ''
}
function beforeLeave(el) {
  el.style.height = el.scrollHeight + 'px'
  el.style.opacity = '1'
}
function leave(el, done) {
  requestAnimationFrame(() => {
    el.style.transition = 'height 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease'
    el.style.height = '0'
    el.style.opacity = '0'
    el.addEventListener('transitionend', function handler(e) {
      if (e.propertyName !== 'height') return
      el.removeEventListener('transitionend', handler)
      done()
    })
  })
}

const hungerOptions = ['不饿', '一般', '有点饿', '很饿']
const moodOptions = ['开心', '普通', '疲惫', '低落', '兴奋']
const timeOptions = ['10 分钟', '20 分钟', '30 分钟', '1 小时+']
const craveOptions = [
  '无所谓', '清淡', '辣', '重口', '热汤', '凉的', '甜的',
  '面食', '米饭', '肉', '海鲜', '蔬菜', '烧烤', '火锅', '轻食', '主食少一点'
]

// —— 场景动作 ——

// 随手拍：拍照识别吃了什么 → 跳 Confirm 页
function onSnap() {
  snapMode.value = 'meal'
  const el = snapInput.value
  if (el) el.click()
}

function onSnapPhoto(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  capturing.value = true
  compressToDataUrl(file).then(async (dataUrl) => {
    const r = await recognizeMeal({
      imageDataUrl: dataUrl,
      profile: getProfile(),
      recentStores: getDeliveryStores(5)
    })
    capturing.value = false
    const items = (r && r.ok && r.data && r.data.items) || []
    setPending('recognize', { items, imageSrc: dataUrl })
    router.push('/capture/confirm')
  }).catch(() => {
    capturing.value = false
    alert('图片读取失败，请重试')
  })
}

// 在家做：拍照识别冰箱食材 → 推荐菜品
function onHomeCook() {
  snapMode.value = 'fridge'
  ctx.scene = '在家做'
  saveCtx()
  const el = fridgeInput.value
  if (el) el.click()
}

async function onFridgePhoto(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  capturing.value = true
  try {
    const dataUrl = await compressToDataUrl(file)
    const r = await fridgeToRecipe({
      imageDataUrl: dataUrl,
      profile: getProfile()
    })
    capturing.value = false
    if (r && r.ok && r.data) {
      fridgeResult.value = r.data
      setFridgeInventory(r.data.ingredients || [])
      showFridgeResult.value = true
    }
  } catch (err) {
    capturing.value = false
    alert('图片读取失败，请重试')
  }
}

// 出去吃：跳推荐页
function onSceneOut() {
  ctx.scene = '餐厅'
  saveCtx()
  sessionStorage.setItem('meal_force_refresh', '1')
  router.push('/recommend')
}

function goAgent() {
  router.push('/agent')
}

function timeGreeting() {
  const h = new Date().getHours()
  if (h < 5) return '深夜好'
  if (h < 10) return '早上好'
  if (h < 13) return '中午好'
  if (h < 17) return '下午好'
  if (h < 21) return '晚上好'
  return '晚安'
}
function nextMealGuess() {
  const h = new Date().getHours()
  if (h < 10) return '早餐'
  if (h < 14) return '午餐'
  if (h < 17) return '下午加餐'
  if (h < 21) return '晚餐'
  return '夜宵'
}
function modeText(m) { return ({ growth: '成长模式', adult: '成人模式', senior: '活力模式' })[m] || '成人模式' }

onMounted(() => {
  const diary = getDiary()
  const today = new Date()
  const key = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
  diaryToday.value = diary.filter(d => {
    const t = new Date(d.createdAt)
    return `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}` === key
  }).length

  const saved = getTodayContext() || {}
  Object.assign(ctx, saved)
  if (ctx.scene === '外卖' || ctx.scene === '食堂') ctx.scene = '餐厅'
  personalNote.value = saved.personalNote || ''
  budgetMode.value = saved.budgetMode || 'preset'
  budgetMin.value = saved.budgetMin || ''
  budgetMax.value = saved.budgetMax || ''
  if (!ctx.budget && !budgetMode.value) ctx.budget = '20~40 元'

  greeting.value = timeGreeting()
  nextMeal.value = nextMealGuess()
  modeLabel.value = modeText(deriveAgeMode(getProfile()))

  if (diary.length === 0) {
    reminder.value = '记录一顿餐食，Agent 会根据你的最近饮食给出更贴合的推荐。'
  } else {
    const recent = diary.slice(0, 2)
    const hasVeg = recent.some(d => (d.items || []).some(i => /菜|菠菜|青菜|西兰花|蔬菜|沙拉/.test(i.name || '')))
    reminder.value = hasVeg
      ? '最近饮食结构还不错，保持食物多样性即可。'
      : '最近两餐蔬菜较少，下一餐可以优先补充一种深色蔬菜。'
  }

  const cached = getCachedNutrition()
  if (cached) { nutrition.value = cached }
  else loadNutrition()

  location.value = getSavedLocation()
})

function set(field, val) {
  ctx[field] = val
  saveCtx()
}
function setBudget(val) {
  budgetMode.value = 'preset'
  ctx.budget = val
  saveCtx()
}
function saveBudgetCustom() {
  const min = budgetMin.value.trim()
  const max = budgetMax.value.trim()
  ctx.budget = (min && max) ? `${min}~${max} 元` : (min ? `≥ ${min} 元` : (max ? `≤ ${max} 元` : ''))
  saveCtx()
}
function saveCtx() {
  setTodayContext({ ...ctx, personalNote: personalNote.value, budget: ctx.budget, budgetMode: budgetMode.value, budgetMin: budgetMin.value, budgetMax: budgetMax.value })
}
function saveNote() {
  saveCtx()
}
async function saveManualEntry() {
  const text = manualText.value.trim()
  if (!text) { alert('请输入吃了什么'); return }
  estimatingManual.value = true
  let items = [{ name: text, portion: '一份', method: '手动输入', category: 'other' }]
  try {
    const r = await estimateMeal({ textDescription: text, profile: getProfile() })
    if (r && r.ok && r.data && Array.isArray(r.data.items) && r.data.items.length) {
      items = r.data.items.map(it => ({ ...it, method: '手动输入' }))
    }
  } catch (e) {
    // 网络/识别失败：保留上面的兜底 items
  }
  estimatingManual.value = false
  appendDiary({
    items, meal: guessMeal(), confirmed: false, awaitingFeedback: false
  })
  manualText.value = ''
  showManualEntry.value = false
}
function guessMeal() {
  const h = new Date().getHours()
  if (h < 10) return '早餐'
  if (h < 14) return '午餐'
  if (h < 17) return '加餐'
  if (h < 21) return '晚餐'
  return '夜宵'
}

async function loadNutrition() {
  nutritionLoading.value = true
  const r = await dailyNutrition({
    profile: getProfile(),
    ageMode: deriveAgeMode(getProfile()),
    recentDiary: getDiary().slice(0, 10),
    todayContext: { ...ctx, personalNote: personalNote.value, budget: ctx.budget }
  })
  nutritionLoading.value = false
  if (r && r.ok && r.data) { nutrition.value = r.data; setCachedNutrition(r.data) }
}

function compressToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const MAX = 1024
        let { width, height } = img
        if (width > height && width > MAX) { height = height * MAX / width; width = MAX }
        else if (height > MAX) { width = width * MAX / height; height = MAX }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
</script>

<style scoped>
/* ===== 头部 ===== */
.head-card { padding: 8px 0 28px; border-bottom: 1px solid rgba(74,52,40,0.10); }
.greet {
  font-size: 34px; font-weight: 300;
  letter-spacing: -0.02em; margin-bottom: 6px;
  color: #2a1e17; line-height: 1.15;
}
.status-line { color: #a89684; font-size: 13px; letter-spacing: 0.01em; }

.q-title {
  font-size: 12px; font-weight: 400; color: #a89684;
  letter-spacing: 0.08em; text-transform: uppercase;
  margin-bottom: 16px;
}

/* ===== 随手拍大按钮 ===== */
.snap-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #c46a3a 0%, #d4895a 100%);
  border-radius: 18px;
  padding: 28px 16px;
  cursor: pointer;
  color: #fff;
  box-shadow: 0 3px 12px rgba(196,106,58,0.25);
  transition: transform 140ms ease, box-shadow 140ms ease;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.snap-btn:active {
  transform: scale(0.97);
  box-shadow: 0 1px 6px rgba(196,106,58,0.30);
}
.snap-icon { font-size: 36px; line-height: 1; margin-bottom: 8px; }
.snap-label { font-size: 18px; font-weight: 500; letter-spacing: 0.02em; margin-bottom: 4px; }
.snap-desc { font-size: 12px; opacity: 0.80; }

/* ===== 双按钮行 ===== */
.dual-row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}
.dual-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 16px;
  padding: 20px 8px 16px;
  cursor: pointer;
  border: 1.5px solid rgba(74,52,40,0.10);
  box-shadow: 0 1px 4px rgba(74,52,40,0.05);
  transition: transform 140ms ease, box-shadow 140ms ease;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.dual-btn:active {
  transform: scale(0.96);
  box-shadow: 0 2px 8px rgba(74,52,40,0.10);
}
.dual-icon { font-size: 28px; line-height: 1; margin-bottom: 6px; }
.dual-label { font-size: 14px; font-weight: 500; color: #2a1e17; margin-bottom: 3px; }
.dual-desc { font-size: 11px; color: #a89684; text-align: center; line-height: 1.4; }

/* 状态提示 */
.inline-status {
  margin-top: 12px; color: #a89684; font-size: 13px; text-align: center;
}
.loc-hint {
  margin-top: 10px; color: #c46a3a; font-size: 13px; cursor: pointer;
  padding: 10px 14px; border-radius: 10px; background: #f3ecdf;
  text-align: center; transition: opacity .15s;
}
.loc-hint:active { opacity: 0.7; }

/* ===== 偏好设置折叠 ===== */
.pref-header {
  display: flex; align-items: center; gap: 10px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent; user-select: none;
}
.pref-summary {
  flex: 1; font-size: 12px; color: #a89684;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.chev-pref {
  color: #a89684; font-size: 22px; line-height: 1;
  transform: rotate(90deg);
  transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
  display: inline-block; flex-shrink: 0;
}
.chev-pref.up { transform: rotate(-90deg); color: #c46a3a; }
.pref-body { overflow: hidden; will-change: height, opacity; padding-top: 16px; }

/* ===== 标签行 ===== */
.section-label {
  font-size: 13px; color: #5a4a3f;
  margin-top: 18px; margin-bottom: 10px;
  font-weight: 400; letter-spacing: 0.01em;
}
.section-label:first-child { margin-top: 0; }
.row { display: flex; flex-wrap: wrap; gap: 8px; }
.tag {
  display: inline-block; padding: 8px 14px; border-radius: 100px;
  background: #fff; color: #5a4a3f; font-size: 13px;
  cursor: pointer; border: 1px solid rgba(74,52,40,0.10);
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
  -webkit-tap-highlight-color: transparent; user-select: none;
}
.tag.active { background: #c46a3a; color: #fff; border-color: #c46a3a; }
.tag:active { opacity: 0.75; }
.textarea {
  display: block; width: 100%; margin-top: 10px; padding: 14px 16px;
  border-radius: 14px; border: 1px solid rgba(74,52,40,0.12);
  background: #fff; font-size: 14px; line-height: 1.6; resize: vertical;
  min-height: 72px; outline: none; box-sizing: border-box; font-family: inherit;
}
.textarea:focus { border-color: rgba(196,106,58,0.35); }

/* ===== 营养建议 ===== */
.nutri-row {
  padding: 14px 0; border-bottom: 1px solid rgba(74,52,40,0.08);
  cursor: pointer; transition: background 200ms ease;
}
.nutri-row:last-of-type { border-bottom: none; }
.nutri-row:active { background: rgba(74,52,40,0.03); }
.nutri-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.nutri-name { font-size: 16px; font-weight: 400; color: #2a1e17; }
.nutri-portion { color: #a89684; font-weight: 400; margin-left: 4px; }
.chev {
  color: #a89684; font-size: 22px; line-height: 1;
  transform: rotate(90deg);
  transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1), color 200ms ease;
  display: inline-block;
}
.chev.up { transform: rotate(-90deg); color: #c46a3a; }
.nutri-detail { overflow: hidden; will-change: height, opacity; }
.nutri-why { color: #5a4a3f; font-size: 13px; padding-top: 8px; line-height: 1.6; }
.nutri-summary {
  color: #5a4a3f; font-size: 13px; margin-top: 20px;
  line-height: 1.6; font-style: italic;
}
.btn-ghost.slim { padding: 10px 0; font-size: 13px; margin-top: 16px; }

/* ===== 今日提醒 ===== */
.reminder { color: #5a4a3f; font-size: 14px; line-height: 1.7; margin: 0; }

/* ===== 预算自定义 ===== */
.budget-custom { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.budget-num {
  width: 100px; text-align: center;
  -moz-appearance: textfield; appearance: textfield;
}
.budget-num::-webkit-outer-spin-button,
.budget-num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.budget-dash { color: #a89684; }
.budget-unit { color: #5a4a3f; font-size: 13px; }

/* ===== 弹层通用 ===== */
.mask {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.35);
  display: flex; align-items: flex-end;
}
.sheet {
  width: 100%; max-height: 85vh; overflow-y: auto;
  background: #fbf7f0;
  border-radius: 20px 20px 0 0;
  padding: 24px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0));
}
.sheet-head {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 18px; font-weight: 400; margin-bottom: 16px;
  letter-spacing: -0.01em;
}
.close {
  border: none; background: transparent;
  font-size: 24px; line-height: 1; color: #a89684; cursor: pointer;
}

/* ===== 冰箱结果弹层 ===== */
.fridge-sheet { max-height: 80vh; }
.fridge-section { margin-bottom: 20px; }
.fridge-section-title {
  font-size: 14px; font-weight: 500; color: #2a1e17;
  margin-bottom: 10px; letter-spacing: 0.01em;
}
.fridge-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.fridge-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 12px; border-radius: 100px;
  font-size: 13px; border: 1px solid rgba(74,52,40,0.10);
  background: #fff; color: #5a4a3f;
}
.fridge-tag.fresh-good { border-color: #8bbf8b; background: #f0f8f0; }
.fridge-tag.fresh-ok { border-color: #d4b86a; background: #fef9ee; }
.fridge-tag.fresh-urgent { border-color: #d4897a; background: #fef5f3; }
.fresh-dot { font-size: 10px; }

/* 菜品卡片 */
.dish-card {
  background: #fff; border-radius: 14px;
  padding: 16px; margin-bottom: 10px;
  border: 1px solid rgba(74,52,40,0.08);
}
.dish-name {
  font-size: 16px; font-weight: 500; color: #2a1e17; margin-bottom: 4px;
}
.dish-reason {
  font-size: 13px; color: #5a4a3f; line-height: 1.5; margin-bottom: 10px;
}
.dish-meta { display: flex; gap: 12px; margin-bottom: 10px; }
.dish-meta-item {
  font-size: 12px; color: #a89684;
}
.dish-ingredients { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 10px; }
.dish-use-label, .dish-miss-label { font-size: 12px; color: #a89684; }
.dish-use-tag {
  font-size: 12px; padding: 2px 8px; border-radius: 6px;
  background: #e8f0e8; color: #4a7a4a;
}
.dish-miss-tag {
  font-size: 12px; padding: 2px 8px; border-radius: 6px;
  background: #fef0e8; color: #a87050;
}
.dish-howto {
  font-size: 12px; color: #a89684; line-height: 1.5;
  padding-top: 8px; border-top: 1px dashed rgba(74,52,40,0.10);
}
.dish-actions {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px dashed rgba(74,52,40,0.10);
  text-align: right;
}
.dish-bili-link {
  font-size: 12px; color: #c46a3a; text-decoration: none;
  font-weight: 500;
}
.dish-bili-link:active { opacity: 0.7; }
.fridge-saved-note {
  margin-top: 4px; padding: 12px 14px;
  border-radius: 12px; background: #f0f8f0;
  color: #4a7a4a; font-size: 13px; text-align: center;
}

/* ===== Agent 入口悬浮按钮 ===== */
.agent-fab {
  position: fixed;
  right: 20px;
  bottom: calc(96px + env(safe-area-inset-bottom, 0));
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 18px;
  border-radius: 100px;
  border: none;
  background: linear-gradient(135deg, #c46a3a 0%, #d4895a 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.01em;
  box-shadow: 0 4px 16px rgba(196, 106, 58, 0.30);
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease;
  -webkit-tap-highlight-color: transparent;
}
.agent-fab:active {
  transform: scale(0.95);
  box-shadow: 0 2px 8px rgba(196, 106, 58, 0.32);
}
</style>
