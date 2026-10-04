<template>
  <div>
    <!-- 头部：库存概览 + 三种录入 -->
    <div class="card head-card">
      <h1 class="title">我的冰箱</h1>
      <p class="subtitle" style="margin-bottom: 12px;">{{ statsText }}</p>

      <div class="entry-row">
        <button class="entry-btn" @click="onSnapFridge">
          <span class="entry-icon">📷</span><span>拍冰箱</span>
        </button>
        <input ref="snapInput" type="file" accept="image/*" hidden @change="onFridgePhoto" />

        <button class="entry-btn" @click="openManual">
          <span class="entry-icon">✏️</span><span>手动添加</span>
        </button>

        <button class="entry-btn" @click="openAgentEntry">
          <span class="entry-icon">✨</span><span>告诉 Agent</span>
        </button>
      </div>

      <div v-if="capturing || analyzing" class="inline-status">
        {{ capturing ? '🥬 识别冰箱食材中…' : '✨ 整理食材清单中…' }}
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!inventory.length" class="card">
      <div class="empty">
        <div class="empty-icon">🧊</div>
        <div class="empty-title">冰箱还是空的</div>
        <p class="empty-desc">拍一张冰箱照片、手动添加，或直接告诉 Agent「我家里有鸡蛋、西兰花、鸡胸肉」，食材会按保质期提醒你什么时候该吃。</p>
      </div>
    </div>

    <!-- 三个分区 -->
    <template v-else>
      <div v-for="zone in zones" :key="zone.key" class="card">
        <div class="zone-head">
          <span class="zone-title">{{ zone.label }}</span>
          <span class="zone-count">{{ zoneItems(zone.key).length }} 种</span>
        </div>

        <div v-if="!zoneItems(zone.key).length" class="zone-empty">暂无食材</div>

        <div
          v-for="it in zoneItems(zone.key)"
          :key="it.id"
          class="food-row"
          @click="openDetail(it.id)"
        >
          <span class="food-icon">{{ it.meta.icon }}</span>
          <div class="food-main">
            <div class="food-name">{{ it.name }}</div>
            <div class="food-sub">{{ qtyText(it) }} · {{ it.meta.label }}</div>
          </div>
          <div class="food-right">
            <span class="food-days" :class="statusMeta(it.fresh.status).cls">{{ daysText(it.fresh) }}</span>
            <span class="food-dot">{{ statusMeta(it.fresh.status).dot }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 用它做点什么 -->
    <div class="card">
      <div class="q-title">用它做点什么</div>
      <p class="subtitle" style="margin-bottom: 12px;">选几种食材，看看能做啥，做完自动从冰箱扣减。</p>
      <button class="btn-ghost" @click="openCookPicker()">🍳 选食材生成菜谱</button>
    </div>

    <!-- ============ 详情弹层 ============ -->
    <div v-if="detailId" class="mask" @click.self="closeDetail">
      <div class="sheet">
        <div class="sheet-head">
          <span>{{ detailEditing ? '编辑食材' : '食材详情' }}</span>
          <button class="close" @click="closeDetail">×</button>
        </div>

        <template v-if="detail && !detailEditing">
          <div class="detail-hero">
            <span class="detail-icon">{{ detail.meta.icon }}</span>
            <div>
              <div class="detail-name">{{ detail.name }}</div>
              <div class="detail-sub">{{ qtyText(detail) }} · {{ detail.meta.label }} · {{ zoneLabel(detail.storageZone) }}</div>
              <div class="detail-fresh" :class="statusMeta(detail.fresh.status).cls">
                {{ statusMeta(detail.fresh.status).dot }} {{ daysText(detail.fresh) }}
              </div>
            </div>
          </div>

          <button class="btn-primary" @click="openCookPicker(detail.name)">🍳 用它做点什么</button>
          <button class="btn-ghost" @click="detailEditing = true">✏️ 修改</button>
          <button class="btn-ghost danger" @click="consumeItem(detail.id)">🗑 吃掉了 / 删除</button>
        </template>

        <template v-if="detail && detailEditing">
          <label class="form-label">名称</label>
          <input class="input" v-model="editForm.name" placeholder="例如：鸡胸肉" />

          <label class="form-label">分类</label>
          <div class="row">
            <span v-for="c in FOOD_CATEGORIES" :key="c.key" class="tag"
                  :class="{ active: editForm.category === c.key }" @click="editForm.category = c.key">{{ c.label }}</span>
          </div>

          <label class="form-label">数量 & 单位</label>
          <div class="qty-row">
            <input class="input qty-num" type="number" min="0" v-model="editForm.quantity" />
            <input class="input qty-unit" v-model="editForm.unit" placeholder="份/个/g" />
          </div>

          <label class="form-label">存放区</label>
          <div class="row">
            <span v-for="z in zones" :key="z.key" class="tag"
                  :class="{ active: editForm.storageZone === z.key }" @click="editForm.storageZone = z.key">{{ z.label }}</span>
          </div>

          <label class="form-label">到期日（可选，填了优先按它算）</label>
          <input class="input" type="date" v-model="editForm.expiryDate" />

          <button class="btn-primary" style="margin-top: 20px;" @click="saveDetail">保存</button>
          <button class="btn-ghost" @click="detailEditing = false">取消</button>
        </template>
      </div>
    </div>

    <!-- ============ 手动录入弹层 ============ -->
    <div v-if="showManual" class="mask" @click.self="showManual = false">
      <div class="sheet">
        <div class="sheet-head">
          <span>手动添加食材</span>
          <button class="close" @click="showManual = false">×</button>
        </div>

        <label class="form-label">名称</label>
        <input class="input" v-model="manualForm.name" placeholder="例如：西红柿" />

        <label class="form-label">分类</label>
        <div class="row">
          <span v-for="c in FOOD_CATEGORIES" :key="c.key" class="tag"
                :class="{ active: manualForm.category === c.key }" @click="manualForm.category = c.key">{{ c.label }}</span>
        </div>

        <label class="form-label">数量 & 单位</label>
        <div class="qty-row">
          <input class="input qty-num" type="number" min="0" v-model="manualForm.quantity" />
          <input class="input qty-unit" v-model="manualForm.unit" placeholder="份/个/g" />
        </div>

        <label class="form-label">存放区</label>
        <div class="row">
          <span v-for="z in zones" :key="z.key" class="tag"
                :class="{ active: manualForm.storageZone === z.key }" @click="manualForm.storageZone = z.key">{{ z.label }}</span>
        </div>

        <label class="form-label">到期日（可选）</label>
        <input class="input" type="date" v-model="manualForm.expiryDate" />

        <button class="btn-primary" style="margin-top: 20px;" @click="submitManual">加入冰箱</button>
      </div>
    </div>

    <!-- ============ 告诉 Agent 弹层 ============ -->
    <div v-if="showAgentEntry" class="mask" @click.self="showAgentEntry = false">
      <div class="sheet">
        <div class="sheet-head">
          <span>告诉 Agent 你有哪些食材</span>
          <button class="close" @click="showAgentEntry = false">×</button>
        </div>
        <textarea class="textarea" v-model="agentText"
                  placeholder="例如：我家里有鸡蛋 6 个、西兰花一颗、鸡胸肉半斤，还有一盒牛奶快过期了"></textarea>
        <button class="btn-primary" style="margin-top: 16px;" :disabled="analyzing" @click="submitAgentEntry">整理成清单</button>
      </div>
    </div>

    <!-- ============ 识别确认弹层 ============ -->
    <div v-if="showConfirm" class="mask">
      <div class="sheet">
        <div class="sheet-head">
          <span>确认加入冰箱</span>
          <button class="close" @click="showConfirm = false">×</button>
        </div>
        <p class="subtitle" style="margin-bottom: 12px;">勾掉不要的，点「加入冰箱」即可按保质期跟踪。</p>

        <div v-for="(it, i) in pendingItems" :key="i" class="confirm-row" @click="togglePending(i)">
          <span class="confirm-check" :class="{ on: it.selected }">{{ it.selected ? '✓' : '' }}</span>
          <div class="confirm-main">
            <div class="confirm-name">{{ it.name }}</div>
            <div class="confirm-sub">{{ it.category }} · {{ it.quantity || 1 }}{{ it.unit || '份' }} · {{ zoneLabel(it.storageZone) }}</div>
          </div>
          <span class="food-dot">{{ llmFreshDot(it.freshness) }}</span>
        </div>

        <button class="btn-primary" style="margin-top: 16px;" @click="confirmPending">加入冰箱（{{ pendingItems.filter(x => x.selected).length }} 种）</button>
      </div>
    </div>

    <!-- ============ 选食材生成菜谱 ============ -->
    <div v-if="showCookPicker" class="mask" @click.self="showCookPicker = false">
      <div class="sheet">
        <div class="sheet-head">
          <span>选食材 · 生成菜谱</span>
          <button class="close" @click="showCookPicker = false">×</button>
        </div>
        <p class="subtitle" style="margin-bottom: 12px;">已优先勾选临期食材，可再点选/取消。</p>

        <div class="row">
          <span v-for="it in enriched" :key="it.id" class="tag"
                :class="{ active: cookSelected.includes(it.name) }"
                @click="toggleCook(it.name)">
            {{ it.name }} <span class="tiny-dot">{{ statusMeta(it.fresh.status).dot }}</span>
          </span>
        </div>

        <label class="form-label">补充其它食材（可选）</label>
        <input class="input" v-model="cookExtra" placeholder="例如：再买点葱和蒜" />

        <button class="btn-primary" style="margin-top: 16px;" :disabled="generating" @click="generateCook">生成菜谱</button>
      </div>
    </div>

    <!-- ============ 菜谱结果弹层 ============ -->
    <div v-if="showCook" class="mask" @click.self="showCook = false">
      <div class="sheet">
        <div class="sheet-head">
          <span>可以这么做</span>
          <button class="close" @click="showCook = false">×</button>
        </div>
        <p class="subtitle" style="margin-bottom: 12px;">基于：{{ cookLabel }}</p>

        <div v-for="(d, i) in cookDishes" :key="i" class="dish-card">
          <div class="dish-name">{{ d.name }}</div>
          <div class="dish-reason">{{ d.reason }}</div>
          <div class="dish-meta">
            <span class="dish-meta-item">⏱ {{ d.time }}</span>
            <span class="dish-meta-item" v-if="d.difficulty">{{ d.difficulty }}</span>
          </div>
          <div class="dish-ingredients">
            <span class="dish-use-label">用到的：</span>
            <span v-for="u in d.uses" :key="u" class="dish-use-tag">{{ u }}</span>
            <template v-if="d.missing && d.missing.length">
              <span class="dish-miss-label">还缺：</span>
              <span v-for="m in d.missing" :key="m" class="dish-miss-tag">{{ m }}</span>
            </template>
          </div>
          <div v-if="d.howto" class="dish-howto">{{ d.howto }}</div>
          <a v-if="d.name" :href="biliSearchUrl(d.name)" target="_blank" class="bili-link">📺 看 B站教程 →</a>
          <button class="btn-primary slim-btn" @click="finishDish(d)">✓ 完成这餐（记录 + 扣减食材）</button>
        </div>

        <div v-if="cookDoneNote" class="done-note">{{ cookDoneNote }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import {
  getFridgeInventory, setFridgeInventory, addFridgeItem, updateFridgeItem, removeFridgeItem,
  getExpiringFoods, getCategoryMeta, FOOD_CATEGORIES, appendDiary
} from '../services/store.js'
import { STORAGE_ZONES, computeFreshness, deductInventory } from '../services/shelfLife.js'
import { fridgeItems as aiFridgeItems, ingredients as aiIngredients } from '../services/agent.js'
import { guessMeal } from '../services/mealTime.js'

const zones = STORAGE_ZONES

const inventory = ref([])
const enriched = computed(() => inventory.value.map(it => ({
  ...it,
  fresh: computeFreshness(it),
  meta: getCategoryMeta(it.category)
})))

const statsText = computed(() => {
  const total = inventory.value.length
  const soon = enriched.value.filter(it => it.fresh.status === 'use_soon' || it.fresh.status === 'urgent').length
  const expired = enriched.value.filter(it => it.fresh.status === 'expired').length
  let s = `${total} 种食材 · ${soon} 种建议尽快吃`
  if (expired) s += ` · ${expired} 种已过期`
  return s
})

// —— 状态 ——
const snapInput = ref(null)
const capturing = ref(false)
const analyzing = ref(false)
const generating = ref(false)

const detailId = ref(null)
const detailEditing = ref(false)
const editForm = reactive({ name: '', category: 'veg', quantity: 1, unit: '份', storageZone: 'fridge', expiryDate: '' })

const showManual = ref(false)
const manualForm = reactive({ name: '', category: 'veg', quantity: 1, unit: '份', storageZone: 'fridge', expiryDate: '' })

const showAgentEntry = ref(false)
const agentText = ref('')

const showConfirm = ref(false)
const pendingItems = ref([])

const showCookPicker = ref(false)
const showCook = ref(false)
const cookSelected = ref([])
const cookExtra = ref('')
const cookDishes = ref([])
const cookLabel = ref('')
const cookDoneNote = ref('')

const detail = computed(() => enriched.value.find(it => it.id === detailId.value))

// —— 展示辅助 ——
const STATUS_META = {
  fresh:    { dot: '🟢', cls: 'f-fresh' },
  good:     { dot: '🟢', cls: 'f-fresh' },
  use_soon: { dot: '🟡', cls: 'f-soon' },
  urgent:   { dot: '🔴', cls: 'f-urgent' },
  expired:  { dot: '⚫', cls: 'f-expired' }
}
function statusMeta(s) { return STATUS_META[s] || STATUS_META.good }

function daysText(fresh) {
  if (!fresh) return ''
  if (fresh.status === 'expired') return `已过期 ${Math.max(1, Math.abs(fresh.daysLeft))} 天`
  if (fresh.status === 'urgent') return '今天到期'
  return `剩 ${fresh.daysLeft} 天`
}

function qtyText(it) {
  const q = (typeof it.quantity === 'number') ? it.quantity : 1
  return `${q}${it.unit || '份'}`
}
function zoneLabel(key) {
  const z = zones.find(z => z.key === key)
  return z ? z.label : '冷藏 4°C'
}
function llmFreshDot(f) {
  if (!f) return '🟢'
  if (f.includes('尽快')) return '🔴'
  if (f.includes('一般')) return '🟡'
  return '🟢'
}

function zoneItems(zoneKey) {
  return enriched.value.filter(it => it.storageZone === zoneKey)
}

function refresh() {
  inventory.value = getFridgeInventory()
}

// —— 三种录入 ——
function onSnapFridge() {
  const el = snapInput.value
  if (el) el.click()
}

async function onFridgePhoto(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  capturing.value = true
  try {
    const dataUrl = await compressToDataUrl(file)
    const r = await aiFridgeItems({ imageDataUrl: dataUrl })
    capturing.value = false
    openConfirmResult(r)
  } catch (err) {
    capturing.value = false
    alert('图片读取失败，请重试')
  }
}

function openManual() {
  Object.assign(manualForm, { name: '', category: 'veg', quantity: 1, unit: '份', storageZone: 'fridge', expiryDate: '' })
  showManual.value = true
}

function submitManual() {
  const name = manualForm.name.trim()
  if (!name) { alert('请输入食材名称'); return }
  const qty = manualForm.quantity === '' || manualForm.quantity === null ? 1 : Number(manualForm.quantity)
  const expiry = parseDateStr(manualForm.expiryDate)
  addFridgeItem({
    name,
    category: manualForm.category,
    quantity: Number.isFinite(qty) ? qty : 1,
    unit: manualForm.unit || '份',
    storageZone: manualForm.storageZone,
    expiryDate: expiry,
    expirySource: expiry ? 'user_defined' : 'estimate'
  })
  refresh()
  showManual.value = false
}

function openAgentEntry() {
  agentText.value = ''
  showAgentEntry.value = true
}

async function submitAgentEntry() {
  const text = agentText.value.trim()
  if (!text) { alert('请描述一下你有哪些食材'); return }
  analyzing.value = true
  try {
    const r = await aiFridgeItems({ textDescription: text })
    analyzing.value = false
    showAgentEntry.value = false
    openConfirmResult(r)
  } catch (e) {
    analyzing.value = false
    alert('整理失败，请重试')
  }
}

function openConfirmResult(r) {
  const items = (r && r.ok && r.data && r.data.items) || []
  if (!items.length) { alert('没有识别到食材，试试换个角度或手动添加'); return }
  pendingItems.value = items.map(it => ({ ...it, selected: true }))
  showConfirm.value = true
}

function togglePending(i) {
  pendingItems.value[i].selected = !pendingItems.value[i].selected
}

function confirmPending() {
  const sel = pendingItems.value.filter(it => it.selected)
  sel.forEach(it => addFridgeItem(it))
  refresh()
  showConfirm.value = false
}

// —— 详情 ——
function openDetail(id) {
  detailId.value = id
  detailEditing.value = false
}
function closeDetail() {
  detailId.value = null
  detailEditing.value = false
}

function saveDetail() {
  const it = detail.value
  if (!it) return
  const name = editForm.name.trim()
  if (!name) { alert('请输入食材名称'); return }
  const qty = editForm.quantity === '' || editForm.quantity === null ? 1 : Number(editForm.quantity)
  const expiry = parseDateStr(editForm.expiryDate)
  updateFridgeItem(it.id, {
    name,
    category: editForm.category,
    quantity: Number.isFinite(qty) ? qty : 1,
    unit: editForm.unit || '份',
    storageZone: editForm.storageZone,
    expiryDate: expiry || null,
    expirySource: expiry ? 'user_defined' : 'estimate'
  })
  refresh()
  closeDetail()
}

function consumeItem(id) {
  removeFridgeItem(id)
  refresh()
  closeDetail()
}

// —— 用它做点什么 ——
function openCookPicker(name) {
  closeDetail()
  const pre = name ? [name] : getExpiringFoods().filter(it => it.status !== 'expired').map(it => it.name).filter(Boolean)
  cookSelected.value = [...new Set(pre)]
  cookExtra.value = ''
  showCookPicker.value = true
}

function toggleCook(name) {
  const i = cookSelected.value.indexOf(name)
  if (i >= 0) cookSelected.value.splice(i, 1)
  else cookSelected.value.push(name)
}

async function generateCook() {
  const names = [...cookSelected.value]
  const extra = cookExtra.value.trim()
  const joined = [...names, ...(extra ? [extra] : [])].join('、')
  if (!joined) { alert('先选至少一种食材'); return }
  generating.value = true
  try {
    const r = await aiIngredients({ ingredients: joined })
    generating.value = false
    const dishes = (r && r.ok && r.data && r.data.dishes) || []
    cookDishes.value = dishes
    cookLabel.value = joined
    cookDoneNote.value = ''
    showCookPicker.value = false
    showCook.value = true
  } catch (e) {
    generating.value = false
    alert('生成失败，请重试')
  }
}

function finishDish(dish) {
  const uses = (dish && dish.uses) || []
  const dishName = (dish && dish.name) || (uses[0] || '在家做的菜')
  // 写入日记：只记这一道菜（不再把蔬菜/肉拆成多条），食材明细仍用于扣减
  appendDiary({
    items: [{ name: dishName, portion: '一份', category: 'other', method: '在家做' }],
    meal: guessMeal(), confirmed: true, awaitingFeedback: false, source: '在家做'
  })
  // 扣减冰箱食材（归零移出），复用 shelfLife.deductInventory
  const next = deductInventory(uses, inventory.value)
  setFridgeInventory(next)
  refresh()
  cookDoneNote.value = `已记录「${dishName}」，冰箱食材已扣减 ✓`
}

function biliSearchUrl(name) {
  return 'https://search.bilibili.com/all?keyword=' + encodeURIComponent((name || '') + ' 做法')
}

function parseDateStr(s) {
  if (!s) return null
  const t = new Date(s + 'T00:00:00').getTime()
  return Number.isFinite(t) ? t : null
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

onMounted(refresh)
</script>

<style scoped>
.head-card { padding-top: 4px; }
.q-title {
  font-size: 12px; font-weight: 400; color: var(--ink-3);
  letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px;
}

/* 三种录入 */
.entry-row { display: flex; gap: 10px; }
.entry-btn {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 16px 8px 14px;
  background: #fff;
  border: 1.5px solid var(--line);
  border-radius: 14px;
  font-size: 13px; color: var(--ink-2);
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.entry-btn:active { transform: scale(0.96); box-shadow: 0 2px 8px rgba(74,52,40,0.10); }
.entry-icon { font-size: 24px; line-height: 1; }

.inline-status { margin-top: 12px; color: var(--ink-3); font-size: 13px; text-align: center; }

/* 空状态 */
.empty { text-align: center; padding: 28px 0; }
.empty-icon { font-size: 44px; line-height: 1; margin-bottom: 12px; }
.empty-title { font-size: 18px; font-weight: 500; color: var(--ink); margin-bottom: 8px; }
.empty-desc { color: var(--ink-3); font-size: 14px; line-height: 1.7; margin: 0; }

/* 分区 */
.zone-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.zone-title { font-size: 14px; font-weight: 500; color: var(--ink); letter-spacing: 0.01em; }
.zone-count { font-size: 12px; color: var(--ink-3); }
.zone-empty { color: var(--ink-3); font-size: 13px; padding: 4px 0 12px; }

/* 食材行 */
.food-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(74,52,40,0.06);
  cursor: pointer;
}
.food-row:last-child { border-bottom: none; }
.food-icon { font-size: 24px; line-height: 1; }
.food-main { flex: 1; min-width: 0; }
.food-name { font-size: 16px; color: var(--ink); }
.food-sub { font-size: 12px; color: var(--ink-3); margin-top: 2px; }
.food-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.food-days { font-size: 12px; color: var(--ink-3); }
.food-dot { font-size: 12px; line-height: 1; }

/* 新鲜度配色 */
.f-fresh { color: #4a7a4a; }
.f-soon { color: #a8822e; }
.f-urgent { color: #c0392b; }
.f-expired { color: #7a6a63; }

/* 详情 */
.detail-hero { display: flex; gap: 14px; align-items: center; margin-bottom: 20px; }
.detail-icon { font-size: 40px; line-height: 1; }
.detail-name { font-size: 20px; font-weight: 500; color: var(--ink); }
.detail-sub { font-size: 13px; color: var(--ink-3); margin-top: 4px; }
.detail-fresh { font-size: 13px; margin-top: 8px; font-weight: 500; }

/* 表单 */
.form-label {
  display: block; font-size: 12px; color: var(--ink-3);
  letter-spacing: 0.06em; text-transform: uppercase;
  margin: 16px 0 8px;
}
.qty-row { display: flex; gap: 10px; }
.qty-num { width: 110px; flex-shrink: 0; }
.qty-unit { flex: 1; }
.qty-num::-webkit-outer-spin-button,
.qty-num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.qty-num { -moz-appearance: textfield; appearance: textfield; }

/* 确认清单 */
.confirm-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(74,52,40,0.08);
  cursor: pointer;
}
.confirm-check {
  width: 22px; height: 22px; flex-shrink: 0;
  border-radius: 6px; border: 1.5px solid var(--line);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; color: #fff; background: transparent;
  transition: background .12s, border-color .12s;
}
.confirm-check.on { background: var(--accent); border-color: var(--accent); }
.confirm-main { flex: 1; min-width: 0; }
.confirm-name { font-size: 15px; color: var(--ink); }
.confirm-sub { font-size: 12px; color: var(--ink-3); margin-top: 2px; }

.tiny-dot { font-size: 9px; }

/* 菜谱卡片（复刻 Today 弹层视觉） */
.dish-card {
  background: #fff; border-radius: 14px;
  padding: 16px; margin-bottom: 10px;
  border: 1px solid rgba(74,52,40,0.08);
}
.dish-name { font-size: 16px; font-weight: 500; color: var(--ink); margin-bottom: 4px; }
.dish-reason { font-size: 13px; color: var(--ink-2); line-height: 1.5; margin-bottom: 10px; }
.dish-meta { display: flex; gap: 12px; margin-bottom: 10px; }
.dish-meta-item { font-size: 12px; color: var(--ink-3); }
.dish-ingredients { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 10px; }
.dish-use-label, .dish-miss-label { font-size: 12px; color: var(--ink-3); }
.dish-use-tag { font-size: 12px; padding: 2px 8px; border-radius: 6px; background: #e8f0e8; color: #4a7a4a; }
.dish-miss-tag { font-size: 12px; padding: 2px 8px; border-radius: 6px; background: #fef0e8; color: #a87050; }
.dish-howto { font-size: 12px; color: var(--ink-3); line-height: 1.5; padding: 8px 0 12px; border-top: 1px dashed rgba(74,52,40,0.10); }
.slim-btn { padding: 11px 0; font-size: 13px; }
.bili-link {
  display: inline-block; margin: 2px 0 12px;
  color: #fb7299; font-size: 13px; text-decoration: none;
  border-bottom: 1px solid rgba(251,114,153,0.4);
}
.bili-link:hover { color: #e05a80; border-color: rgba(224,90,128,0.6); }

.done-note {
  margin-top: 4px; padding: 12px 14px; border-radius: 12px;
  background: #f0f8f0; color: #4a7a4a; font-size: 13px; text-align: center;
}

/* 弹层（本组件 scoped，复刻 Today） */
.mask {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.35);
  display: flex; align-items: flex-end;
}
.sheet {
  width: 100%; max-height: 85vh; overflow-y: auto;
  background: var(--paper);
  border-radius: 20px 20px 0 0;
  padding: 24px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0));
}
.sheet-head {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 18px; font-weight: 400; margin-bottom: 16px; letter-spacing: -0.01em;
}
.close {
  border: none; background: transparent;
  font-size: 24px; line-height: 1; color: var(--ink-3); cursor: pointer;
}
</style>
