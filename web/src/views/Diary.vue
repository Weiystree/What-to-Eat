<template>
  <div>
    <div class="tab-switch">
      <span class="tab-btn" :class="{ active: activeView === 'summary' }" @click="activeView = 'summary'">本周概览</span>
      <span class="tab-btn" :class="{ active: activeView === 'log' }" @click="activeView = 'log'">每餐记录</span>
    </div>

    <div v-if="activeView === 'summary'" class="card overview-card">
      <h2 class="title" style="font-size:16px;">本周概览</h2>
      <p v-if="isEmpty" class="subtitle" style="margin:0;">还没有记录，去上传第一顿饭吧。</p>
      <template v-else>
        <div class="overview-section">
          <div class="overview-row">
            <span class="overview-num">{{ weeklyFoodStats.totalKinds }}</span>
            <span class="overview-label">种食物 · 目标每周 {{ weeklyFoodStats.target }} 种+</span>
          </div>
          <div class="kind-bars">
            <div v-for="c in weeklyFoodStats.byCategory.filter(c => c.count)" :key="c.key" class="kind-bar-row">
              <span class="kind-bar-label">{{ c.icon }} {{ c.label }}</span>
              <div class="kind-bar-track">
                <div class="kind-bar-fill" :style="{ width: (c.count / maxKindCount * 100) + '%' }"></div>
              </div>
              <span class="kind-bar-num">{{ c.count }}</span>
            </div>
          </div>
        </div>
        <div class="overview-section">
          <div class="overview-row">
            <span class="overview-num">{{ weeklyCalories.weekTotal }}</span>
            <span class="overview-label">
              kcal · 本周合计{{ weeklyCalories.days.some(d => d.hasUnknown) ? '（部分未估算）' : '' }}
            </span>
          </div>
          <div class="bars">
            <div v-for="d in weeklyCalories.days" :key="d.label" class="bar-col">
              <div class="bar-track">
                <div class="bar-fill" :style="{ height: (d.kcal / weeklyCalories.maxKcal * 100) + '%' }"></div>
              </div>
              <div class="bar-label">{{ d.label }}</div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div v-if="activeView === 'log'">
      <p v-if="isEmpty" class="subtitle">还没有记录，去上传第一顿饭吧。</p>
      <template v-for="g in groups" :key="g.day">
        <div class="day-title-row">
          <div class="day-title">{{ g.day }}</div>
          <div class="day-kinds">
            今天吃了 {{ g.kindsStats.totalKinds }} 种
            <span v-for="c in g.kindsStats.byCategory.filter(c => c.count)" :key="c.key" class="mini-chip">{{ c.icon }}{{ c.count }}</span>
          </div>
        </div>
        <div v-for="e in g.entries" :key="e.id" class="card">
          <div class="head">
            <span class="meal">{{ e.meal || '一餐' }}</span>
            <span class="time">{{ e.timeLabel }}</span>
            <span class="actions">
              <button class="act" @click="startEdit(e)">编辑</button>
              <button class="act danger" @click="onDelete(e)">删除</button>
            </span>
          </div>
          <div class="entry-body">
            <div class="entry-img">
              <img v-if="e.imageSrc" :src="e.imageSrc" class="preview"/>
              <div v-else class="img-placeholder">🍽</div>
            </div>
            <div class="entry-nutri">
              <div v-for="it in e.items" :key="it.name + it.portion" class="nutri-chip">
                <span class="nutri-icon">{{ getCategoryMeta(it.category).icon }}</span>
                <span class="nutri-name">{{ it.name }}</span>
                <span class="nutri-portion">· {{ it.portion }}</span>
              </div>
              <div v-if="e.totalCalories" class="entry-kcal">合计约 {{ e.totalCalories }} kcal</div>
            </div>
          </div>
          <div v-if="e.feedback" class="fb">
            满意度 {{ e.feedback.score }} · 饱腹感 {{ e.feedback.fullness }} · {{ e.feedback.feel }}
          </div>
          <div v-else-if="e.awaitingFeedback" class="fb">等待你的饭后反馈…</div>
        </div>
      </template>
    </div>

    <!-- 编辑弹层 -->
    <div v-if="editing" class="mask" @click.self="cancelEdit">
      <div class="sheet">
        <div class="sheet-head">
          <span>编辑这一餐</span>
          <button class="close" @click="cancelEdit">×</button>
        </div>

        <div class="section-label">餐次</div>
        <div class="row">
          <span v-for="m in mealOptions" :key="m" class="tag"
                :class="{active: draft.meal === m}" @click="draft.meal = m">{{ m }}</span>
        </div>

        <div class="section-label">菜品</div>
        <div v-for="(it, idx) in draft.items" :key="idx" class="item-row">
          <input class="input inline" v-model="it.name" placeholder="菜名"/>
          <input class="input inline" v-model="it.portion" placeholder="份量"/>
          <button class="act danger" @click="draft.items.splice(idx, 1)">×</button>
        </div>
        <button class="btn-ghost small" @click="addItem">＋ 加一项</button>

        <div class="section-label">饭后感受 · 可选</div>
        <div class="row">
          <span v-for="o in feelOptions" :key="o" class="tag"
                :class="{active: draft.feedback && draft.feedback.feel === o}"
                @click="setFeel(o)">{{ o }}</span>
        </div>

        <div v-if="savingEdit" class="subtitle" style="margin-top: 8px;">识别中，请稍候…</div>
        <button class="btn-primary" :disabled="savingEdit" @click="saveEdit">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import {
  getDiary, updateDiary, deleteDiary, getProfile,
  getCategoryMeta, mergeFoodEstimates, summarizeFoodKinds,
  getWeeklyFoodStats, getWeeklyCalories, formatDateKey
} from '../services/store.js'
import { estimateMeal } from '../services/agent.js'

const activeView = ref('summary')
const groups = ref([])
const isEmpty = ref(true)
const weeklyFoodStats = ref({ totalKinds: 0, byCategory: [], target: 25 })
const weeklyCalories = ref({ days: [], weekTotal: 0, maxKcal: 1 })
const maxKindCount = computed(() => Math.max(1, ...weeklyFoodStats.value.byCategory.map(c => c.count)))
const editing = ref(false)
const savingEdit = ref(false)
const draft = reactive({ id: null, meal: '', items: [], feedback: null })

const mealOptions = ['早餐', '午餐', '加餐', '晚餐', '夜宵']
const feelOptions = ['舒服', '偏腻', '胀', '困', '其他']

function pad(n) { return n < 10 ? '0' + n : '' + n }
function fmtTime(ts) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function entryCalories(items) {
  const sum = (items || []).reduce((acc, it) => acc + (typeof it.calories === 'number' ? it.calories : 0), 0)
  return sum || null
}
function groupByDay(list) {
  const map = {}
  list.forEach(x => {
    const key = formatDateKey(x.createdAt)
    if (!map[key]) map[key] = { day: key, entries: [] }
    map[key].entries.push({ ...x, timeLabel: fmtTime(x.createdAt), totalCalories: entryCalories(x.items) })
  })
  return Object.values(map).map(g => ({ ...g, kindsStats: summarizeFoodKinds(g.entries) }))
}

function refresh() {
  const list = getDiary()
  groups.value = groupByDay(list)
  isEmpty.value = !list.length
  weeklyFoodStats.value = getWeeklyFoodStats()
  weeklyCalories.value = getWeeklyCalories()
}

onMounted(refresh)

function onDelete(e) {
  if (!confirm(`删除「${(e.items[0] && e.items[0].name) || '这条记录'}」？此操作不可撤销。`)) return
  deleteDiary(e.id)
  refresh()
}

function startEdit(e) {
  draft.id = e.id
  draft.meal = e.meal || '午餐'
  draft.items = (e.items || []).map(x => ({ ...x }))
  draft.feedback = e.feedback ? { ...e.feedback } : null
  editing.value = true
}
function cancelEdit() { editing.value = false }
function addItem() { draft.items.push({ name: '', portion: '一份' }) }
function setFeel(o) {
  if (!draft.feedback) draft.feedback = { score: 4, fullness: '刚好', feel: o, willAgain: '愿意' }
  else draft.feedback.feel = o
}
async function saveEdit() {
  let valid = draft.items.filter(x => (x.name || '').trim())
  if (!valid.length) { alert('至少保留一项菜品'); return }

  const missing = valid.filter(x => !x.category)
  if (missing.length) {
    savingEdit.value = true
    try {
      const r = await estimateMeal({
        textDescription: missing.map(x => x.name).join('、'),
        profile: getProfile()
      })
      if (r && r.ok && r.data && Array.isArray(r.data.items) && r.data.items.length) {
        const merged = mergeFoodEstimates(missing, r.data.items)
        valid = valid.map(x => {
          const idx = missing.indexOf(x)
          return idx >= 0 ? merged[idx] : x
        })
      }
    } catch (e) {
      // 估算失败：缺分类的项保持原样，下面兜底 other
    }
    savingEdit.value = false
    valid = valid.map(x => ({ ...x, category: x.category || 'other' }))
  }

  updateDiary(draft.id, { meal: draft.meal, items: valid, feedback: draft.feedback })
  editing.value = false
  refresh()
}
</script>

<style scoped>
.tab-switch {
  display: flex; gap: 8px; margin-bottom: 16px;
}
.tab-btn {
  flex: 1; text-align: center; padding: 10px 0;
  font-size: 14px; color: #a89684; background: #fff;
  border-radius: 999px; cursor: pointer;
  border: 1px solid rgba(74,52,40,0.10);
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  -webkit-tap-highlight-color: transparent; user-select: none;
}
.tab-btn.active { background: #c46a3a; color: #fff; border-color: #c46a3a; }

.overview-card { display: flex; flex-direction: column; gap: 20px; }
.overview-section + .overview-section { padding-top: 16px; border-top: 1px solid rgba(74,52,40,0.08); }
.overview-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
.overview-num { font-size: 26px; font-weight: 300; color: #2a1e17; letter-spacing: -0.01em; }
.overview-label { color: #a89684; font-size: 12px; }
.chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  background: #f3ecdf; color: #5a4a3f; font-size: 12px;
  padding: 5px 10px; border-radius: 999px;
}
.kind-bars { display: flex; flex-direction: column; gap: 8px; }
.kind-bar-row { display: flex; align-items: center; gap: 8px; }
.kind-bar-label { flex: 0 0 64px; font-size: 12px; color: #5a4a3f; }
.kind-bar-track {
  flex: 1; height: 8px; border-radius: 4px;
  background: rgba(74,52,40,0.06); overflow: hidden;
}
.kind-bar-fill { height: 100%; background: #c46a3a; border-radius: 4px; min-width: 3px; }
.kind-bar-num { flex: 0 0 18px; text-align: right; font-size: 12px; color: #a89684; }
.bars { display: flex; align-items: flex-end; gap: 8px; height: 72px; }
.bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; }
.bar-track {
  flex: 1; width: 100%; max-width: 22px;
  display: flex; align-items: flex-end;
  background: rgba(74,52,40,0.06); border-radius: 6px;
  overflow: hidden;
}
.bar-fill { width: 100%; background: #c46a3a; border-radius: 6px; min-height: 2px; }
.bar-label { color: #a89684; font-size: 10px; }

.day-title-row {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px; margin: 32px 0 12px; flex-wrap: wrap;
}
.day-title {
  color: #a89684; font-size: 11px;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.day-kinds { color: #a89684; font-size: 12px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.mini-chip {
  background: #f3ecdf; border-radius: 999px;
  padding: 2px 6px; font-size: 11px;
}
.entry-body { display: flex; gap: 14px; align-items: flex-start; }
.entry-img {
  flex: 0 0 84px; width: 84px; height: 84px;
  border-radius: 10px; overflow: hidden;
}
.entry-img .preview { width: 100%; height: 100%; object-fit: cover; margin: 0; border-radius: 10px; }
.img-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: #f3ecdf; font-size: 28px; opacity: 0.7;
  border-radius: 10px;
}
.entry-nutri { flex: 1; min-width: 0; }
.nutri-chip {
  display: flex; align-items: baseline; gap: 4px;
  font-size: 14px; color: #2a1e17; line-height: 1.7;
}
.nutri-icon { font-size: 14px; }
.nutri-portion { color: #a89684; font-size: 12px; }
.entry-kcal { color: #c46a3a; font-size: 12px; margin-top: 6px; }
.head {
  display: flex; align-items: center; margin-bottom: 10px; gap: 10px;
}
.meal {
  color: #c46a3a; font-weight: 500; font-size: 15px;
  letter-spacing: 0.02em;
}
.time { color: #a89684; font-size: 12px; }
.actions { margin-left: auto; display: flex; gap: 6px; }
.act {
  background: transparent; border: 1px solid rgba(74,52,40,0.10);
  color: #5a4a3f; padding: 4px 12px; font-size: 12px;
  border-radius: 999px; cursor: pointer;
}
.act.danger { color: #a04a3a; border-color: rgba(160,74,58,0.2); }
.fb { color: #a89684; font-size: 12px; margin-top: 10px; font-style: italic; }

.mask {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.35);
  display: flex; align-items: flex-end;
}
.sheet {
  width: 100%; background: #fbf7f0;
  border-radius: 20px 20px 0 0;
  padding: 24px;
  max-height: 84vh; overflow-y: auto;
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
.item-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 0; border-bottom: 1px solid rgba(74,52,40,0.08);
}
.input.inline { flex: 1; padding: 8px 10px; font-size: 14px; background: transparent; color: #2a1e17; }
.input.inline:focus { background: #f3ecdf; }
.btn-ghost.small {
  width: auto; padding: 8px 16px; font-size: 13px;
  margin: 10px 0 4px;
}
</style>
