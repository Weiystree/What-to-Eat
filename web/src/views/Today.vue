<template>
  <div>
    <div class="card head-card">
      <div class="greet">{{ greeting }}</div>
      <div class="status-line">{{ modeLabel }} · 下一餐：{{ nextMeal }} · 今天已记录 {{ diaryToday }} 餐</div>
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

    <!-- 今日状态 -->
    <div class="card">
      <div class="q-title">今日状态</div>

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

      <div class="section-label">场景</div>
      <div class="row">
        <span v-for="o in sceneOptions" :key="o.value" class="tag"
              :class="{active: ctx.scene === o.value}"
              @click="set('scene', o.value)">{{ o.label }}</span>
      </div>

      <div v-if="ctx.scene === '餐厅'" class="place-row">
        <div v-if="location" class="place-ok">
          已使用当前位置 · 推荐会结合附近好评餐厅
          <span class="place-link" @click="refreshLocation">重新定位</span>
        </div>
        <div v-else class="place-hint" @click="refreshLocation">
          {{ locating ? '定位中…' : '开启定位，用附近好评餐厅优化推荐 →' }}
        </div>
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

    <!-- 快速入口 -->
    <div class="card">
      <div class="q-title">快速入口</div>
      <div class="grid">
        <label class="grid-item">
          <div class="ico">📷</div>拍照记录
          <input type="file" accept="image/*" capture="environment" hidden @change="onPickPhoto"/>
        </label>
        <div class="grid-item" @click="goRecommend">
          <div class="ico">🍽</div>帮我决定
        </div>
        <div class="grid-item" @click="showManualEntry = true">
          <div class="ico">📔</div>手动添加饮食日记
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
      <div v-if="capturing" class="subtitle" style="margin-top: 8px;">
        识别中，请稍候…
      </div>
    </div>

    <div class="card">
      <div class="q-title">今日提醒</div>
      <p class="reminder">{{ reminder }}</p>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  getProfile, getDiary, getTodayContext, setTodayContext,
  deriveAgeMode, setPending, getDeliveryStores,
  getSavedLocation, requestGeolocation, appendDiary,
  getCachedNutrition, setCachedNutrition
} from '../services/store.js'
import { recognizeMeal, dailyNutrition, estimateMeal } from '../services/agent.js'

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

const nutrition = ref(null)
const nutritionLoading = ref(false)
const expanded = ref(-1)   // 当前展开的营养项索引；-1 表示全部收起
const location = ref(null)
const locating = ref(false)
const budgetMode = ref('preset')
const budgetMin = ref('')
const budgetMax = ref('')
const budgetOptions = ['≤ 20 元', '20~40 元', '40~80 元', '≥ 80 元']

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

// Vue transition JS hooks：把 auto height 展开动画化
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
const sceneOptions = [
  { value: '在家做', label: '在家做' },
  { value: '餐厅',   label: '外卖/餐厅' }
]
const craveOptions = [
  '无所谓', '清淡', '辣', '重口', '热汤', '凉的', '甜的',
  '面食', '米饭', '肉', '海鲜', '蔬菜', '烧烤', '火锅', '轻食', '主食少一点'
]

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
  // 兼容旧数据：外卖/食堂 → 都并入 餐厅
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

  // 营养建议优先读缓存
  const cached = getCachedNutrition()
  if (cached) { nutrition.value = cached }
  else loadNutrition()

  // 若已授权过位置，读出缓存
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
function goRecommend() {
  saveCtx()
  sessionStorage.setItem('meal_force_refresh', '1')
  router.push('/recommend')
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

// 拍照 → 压缩 → 调 recognizeMeal → 进 Confirm 页
function onPickPhoto(e) {
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
.head-card { padding: 8px 0 32px; border-bottom: 1px solid rgba(74,52,40,0.10); }
.greet {
  font-size: 34px; font-weight: 300;
  letter-spacing: -0.02em; margin-bottom: 8px;
  color: #2a1e17; line-height: 1.15;
}
.status-line { color: #a89684; font-size: 13px; letter-spacing: 0.01em; }

.q-title {
  font-size: 12px; font-weight: 400; color: #a89684;
  letter-spacing: 0.08em; text-transform: uppercase;
  margin-bottom: 16px;
}

.nutri-row {
  padding: 14px 0;
  border-bottom: 1px solid rgba(74,52,40,0.08);
  cursor: pointer;
  transition: background 200ms ease;
}
.nutri-row:last-of-type { border-bottom: none; }
.nutri-row:active { background: rgba(74,52,40,0.03); }
.nutri-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
}
.nutri-name { font-size: 16px; font-weight: 400; color: #2a1e17; }
.nutri-portion { color: #a89684; font-weight: 400; margin-left: 4px; }
.chev {
  color: #a89684; font-size: 22px; line-height: 1;
  transform: rotate(90deg);
  transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1), color 200ms ease;
  display: inline-block;
}
.chev.up { transform: rotate(-90deg); color: #c46a3a; }
.nutri-detail {
  overflow: hidden;
  will-change: height, opacity;
}
.nutri-why {
  color: #5a4a3f; font-size: 13px;
  padding-top: 8px; line-height: 1.6;
}
.nutri-summary {
  color: #5a4a3f; font-size: 13px;
  margin-top: 20px; line-height: 1.6; font-style: italic;
}
.btn-ghost.slim { padding: 10px 0; font-size: 13px; margin-top: 16px; }

.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; }
.grid-item {
  padding: 24px 4px; text-align: center;
  font-size: 13px; color: #2a1e17;
  cursor: pointer; transition: opacity .15s;
  border-right: 1px solid rgba(74,52,40,0.08);
}
.grid-item:last-child { border-right: none; }
.grid-item:active { opacity: 0.5; }
.grid-item .ico { font-size: 20px; margin-bottom: 8px; display: block; opacity: 0.7; }
.reminder { color: #5a4a3f; font-size: 14px; line-height: 1.7; margin: 0; }

.place-row { margin-top: 14px; }
.place-hint {
  color: #c46a3a; font-size: 13px; cursor: pointer;
  padding: 10px 14px; border-radius: 10px;
  background: #f3ecdf; letter-spacing: 0.01em;
  transition: opacity .15s;
}
.place-hint:active { opacity: 0.7; }
.place-ok {
  color: #5a4a3f; font-size: 13px;
  padding: 10px 14px; border-radius: 10px;
  background: #f3ecdf;
}
.place-link {
  color: #c46a3a; margin-left: 8px;
  cursor: pointer; text-decoration: underline;
  text-underline-offset: 3px;
}
.mask {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.35);
  display: flex; align-items: flex-end;
}
.sheet {
  width: 100%; background: #fbf7f0;
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
.budget-custom {
  display: flex; align-items: center; gap: 8px; margin-top: 12px;
}
.budget-num {
  width: 100px; text-align: center; -moz-appearance: textfield; appearance: textfield;
}
.budget-num::-webkit-outer-spin-button,
.budget-num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.budget-dash { color: #a89684; }
.budget-unit { color: #5a4a3f; font-size: 13px; }
</style>
