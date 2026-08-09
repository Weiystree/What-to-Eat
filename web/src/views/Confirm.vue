<template>
  <div>
    <h1 class="title">确认这一餐</h1>
    <p class="subtitle">识别只是初步猜测，请选出正确的项，或自己填写。</p>

    <div class="card" v-if="imageSrc">
      <img :src="imageSrc" style="width:100%; border-radius: 10px; display:block;" />
    </div>

    <div class="card" v-if="candidates.length">
      <div class="section-label">Agent 猜到的菜品（勾选正确的）</div>
      <div class="row">
        <span v-for="c in candidates" :key="c.name" class="tag"
              :class="{active: picked.includes(c.name)}"
              @click="togglePick(c)">
          {{ c.name }} · {{ c.portion || '一份' }}
        </span>
      </div>
      <div class="hint" v-if="!picked.length">如果都不对，直接在下方自己填即可。</div>
    </div>

    <div class="card">
      <div class="section-label">这一餐实际吃了</div>
      <div v-for="(it, idx) in items" :key="idx" class="item-row">
        <input class="input inline" placeholder="菜名" v-model="it.name"/>
        <input class="input inline" placeholder="份量" v-model="it.portion"/>
        <button class="act danger" @click="items.splice(idx, 1)">×</button>
      </div>
      <button class="btn-ghost" @click="addOne">＋ 加一项</button>
    </div>

    <div class="card">
      <div class="section-label">餐次</div>
      <div class="row">
        <span v-for="m in mealOptions" :key="m" class="tag"
              :class="{active: meal === m}" @click="meal = m">{{ m }}</span>
      </div>
    </div>

    <div class="card">
      <div class="section-label">这顿是外卖吗（可选，填了以后 Agent 会记住这家店）</div>
      <input class="input" placeholder="例如：xx轻食 / 兰州拉面" v-model="deliveryStore"/>
    </div>

    <button class="btn-primary" @click="save">保存到日记，去看推荐</button>
    <button class="btn-ghost" @click="saveOnly">只保存，不推荐</button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getPending, setPending, appendDiary } from '../services/store.js'

const router = useRouter()
const candidates = ref([])           // Agent 识别出来的原始候选
const picked = ref([])               // 用户勾选的菜名
const items = ref([])                // 最终写入日记的菜品数组
const imageSrc = ref('')
const meal = ref('午餐')
const deliveryStore = ref('')

const mealOptions = ['早餐', '午餐', '加餐', '晚餐', '夜宵']

function guessMeal() {
  const h = new Date().getHours()
  if (h < 10) return '早餐'
  if (h < 14) return '午餐'
  if (h < 17) return '加餐'
  if (h < 21) return '晚餐'
  return '夜宵'
}

onMounted(() => {
  const p = getPending('recognize') || {}
  candidates.value = (p.items || []).map(x => ({ name: x.name, portion: x.portion || '一份', method: x.method || '', category: x.category, calories: x.calories }))
  imageSrc.value = p.imageSrc || ''
  meal.value = guessMeal()
  // 默认不预选，让用户主动确认
  items.value = [{ name: '', portion: '一份' }]
})

function togglePick(c) {
  const idx = picked.value.indexOf(c.name)
  if (idx >= 0) {
    picked.value.splice(idx, 1)
    // 从 items 移除
    const j = items.value.findIndex(x => x.name === c.name)
    if (j >= 0) items.value.splice(j, 1)
  } else {
    picked.value.push(c.name)
    // 如果 items 里第一行是空的，用它；否则追加
    if (items.value.length && !items.value[0].name.trim()) items.value[0] = { ...c }
    else items.value.push({ ...c })
  }
}
function addOne() { items.value.push({ name: '', portion: '一份' }) }

function collect() {
  const valid = items.value
    .filter(x => (x.name || '').trim())
    .map(x => ({ ...x, category: x.category || 'other' }))
  if (!valid.length) { alert('至少填一项菜品'); return null }
  return {
    items: valid, imageSrc: imageSrc.value,
    confirmed: true, meal: meal.value,
    deliveryStore: (deliveryStore.value || '').trim()
  }
}
function saveOnly() {
  const e = collect(); if (!e) return
  appendDiary(e); setPending('recognize', null)
  router.replace('/diary')
}
function save() {
  const e = collect(); if (!e) return
  appendDiary(e); setPending('recognize', null)
  sessionStorage.setItem('meal_force_refresh', '1')
  router.replace('/recommend')
}
</script>

<style scoped>
.item-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0; border-bottom: 1px solid rgba(74,52,40,0.08);
}
.item-row:last-of-type { border-bottom: none; }
.input.inline { flex: 1; padding: 10px 12px; font-size: 14px; background: transparent; color: #2a1e17; }
.input.inline:focus { background: #f3ecdf; }
.act {
  background: transparent; border: 1px solid rgba(74,52,40,0.10);
  color: #5a4a3f; padding: 4px 10px; font-size: 13px;
  border-radius: 999px; cursor: pointer;
}
.act.danger { color: #a04a3a; border-color: rgba(160,74,58,0.2); }
.hint { color: #a89684; font-size: 12px; margin-top: 12px; font-style: italic; }
</style>
