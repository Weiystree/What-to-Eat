<template>
  <div>
    <p class="subtitle" v-if="loading">Agent 正在读取你的画像和今日状态…</p>
    <p class="places-note" v-else-if="nearbyUsed > 0">
      · 结合了附近 {{ nearbyUsed }} 家好评餐厅
    </p>

    <div v-if="nearbyLinks.length" class="nearby-preview">
      <div class="section-label">附近高分餐厅</div>
      <a
        v-for="pl in nearbyLinks" :key="pl.mapsUrl"
        :href="pl.mapsUrl" target="_blank" class="nearby-row"
      >
        <div class="nearby-main">
          <span class="nearby-name">{{ pl.name }}</span>
          <span v-if="pl.rating" class="nearby-rating">★ {{ pl.rating }}</span>
          <span v-if="pl.priceLevel" class="nearby-price">{{ priceLevelLabel(pl.priceLevel) }}</span>
          <span v-if="pl.openNow" class="nearby-open">营业中</span>
        </div>
        <div class="nearby-sub">
          <span v-if="pl.distanceMeters != null">{{ pl.distanceMeters }}m</span>
          <span v-for="d in (pl.typicalDishes || []).slice(0, 3)" :key="d" class="nearby-dish">{{ d }}</span>
        </div>
      </a>
    </div>

    <div v-for="(p, idx) in picks" :key="p.key" class="card pick-card" @click="goDetail(idx)">
      <div class="pick-title">{{ p.title }}</div>
      <div class="pick-dish">{{ p.dish }}</div>
      <div class="row">
        <span class="tag active">{{ p.budget }}</span>
        <span class="tag">{{ p.time }}</span>
        <span v-for="a in (p.allergens || [])" :key="a" class="tag danger-tag">含 {{ a }}</span>
      </div>
      <p class="pick-reason">{{ p.reason }}</p>
      <div v-if="(p.signatureDishes || []).length" class="row signature-row">
        <span v-for="d in p.signatureDishes" :key="d" class="tag">🍽 {{ d }}</span>
      </div>
      <a v-if="p.mapsUrl" :href="p.mapsUrl" target="_blank" class="maps-link" @click.stop>Google Maps 查看 →</a>
    </div>

    <div v-if="!loading" class="card refine">
      <div class="q-title">换一批？告诉 Agent 想要什么方向</div>
      <button class="btn-ghost slim" @click="load('healthier')">🥗 想更健康的</button>
      <button class="btn-ghost slim" @click="load('tastier')">😋 更符合口味的</button>
      <button class="btn-ghost slim" @click="load(null)">↻ 直接换一批</button>
      <div class="refine-input-row">
        <input
          v-model="refineText"
          class="refine-input"
          placeholder="输入更多需求，回车发送…"
          maxlength="200"
          @keyup.enter="submitRefineText"
        />
        <button class="btn-send" @click="submitRefineText">发送</button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as agent from '../services/agent.js'
import {
  getProfile, getTodayContext, getDiary, setPending,
  setLastReco, getLastReco, deriveAgeMode, getDeliveryStores,
  getSavedLocation, requestGeolocation
} from '../services/store.js'

const router = useRouter()
const picks = ref([])
const loading = ref(true)
const nearbyUsed = ref(0)
const nearbyLinks = ref([])
const refineText = ref('')

const PRICE_LEVEL_LABELS = {
  PRICE_LEVEL_FREE: '免费',
  PRICE_LEVEL_INEXPENSIVE: '¥',
  PRICE_LEVEL_MODERATE: '¥¥',
  PRICE_LEVEL_EXPENSIVE: '¥¥¥',
  PRICE_LEVEL_VERY_EXPENSIVE: '¥¥¥¥'
}
function priceLevelLabel(level) {
  return PRICE_LEVEL_LABELS[level] || ''
}

async function load(refineHint) {
  loading.value = true
  const profile = getProfile()
  const last = getLastReco()
  const todayCtx = getTodayContext()
  const wantsPlaces = todayCtx && todayCtx.scene === '餐厅'
  let loc = wantsPlaces ? getSavedLocation() : null
  if (wantsPlaces && !loc) loc = await requestGeolocation()
  const r = await agent.recommend({
    profile,
    todayContext: todayCtx,
    recentDiary: getDiary().slice(0, 6),
    ageMode: deriveAgeMode(profile),
    recentStores: getDeliveryStores(3),
    location: loc,
    refineHint,
    previousPicks: last ? last.picks : null,
    seed: Math.floor(Math.random() * 100000)
  })
  loading.value = false
  if (r && r.ok) {
    picks.value = r.data.picks || []
    nearbyUsed.value = (r.meta && r.meta.nearbyPlacesCount) || 0
    nearbyLinks.value = (r.meta && r.meta.nearbyLinks) || []
    setLastReco({
      picks: picks.value, nearbyUsed: nearbyUsed.value,
      nearbyLinks: nearbyLinks.value, refineHint, at: Date.now()
    })
  } else {
    alert('推荐失败')
  }
}

function goDetail(idx) {
  setPending('pick', picks.value[idx])
  router.push('/recommend/detail')
}

function submitRefineText() {
  const val = refineText.value.trim()
  if (!val) return
  refineText.value = ''
  load(val)
}

onMounted(() => {
  if (picks.value.length) return
  const forceRefresh = sessionStorage.getItem('meal_force_refresh') === '1'
  if (forceRefresh) {
    sessionStorage.removeItem('meal_force_refresh')
    load(null)
    return
  }
  const last = getLastReco()
  if (last && last.picks && last.picks.length) {
    picks.value = last.picks
    nearbyUsed.value = last.nearbyUsed || 0
    nearbyLinks.value = last.nearbyLinks || []
    loading.value = false
  } else {
    load(null)
  }
})
</script>

<style scoped>
.pick-card {
  cursor: pointer;
  padding: 24px 20px;
  margin-bottom: 16px;
  background: #f7f2ea;
  border: 1px solid rgba(168,150,132,0.18);
  border-bottom: 1px solid rgba(168,150,132,0.18);
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(74,52,40,0.06);
  transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
}
.pick-card:hover {
  box-shadow: 0 4px 14px rgba(74,52,40,0.10);
}
.pick-card:active {
  transform: scale(0.98);
  background: #f0e9dd;
  box-shadow: 0 1px 4px rgba(74,52,40,0.08);
}
.signature-row { margin-top: 12px; }
.nearby-preview {
  margin-bottom: 24px;
  border: 1px solid rgba(168,150,132,0.18);
  border-radius: 16px;
  overflow: hidden;
  background: #fbf8f3;
}
.nearby-preview .section-label {
  padding: 14px 16px 8px;
  margin: 0;
}
.nearby-row {
  display: block;
  padding: 12px 16px;
  border-top: 1px solid rgba(168,150,132,0.14);
  text-decoration: none;
  color: inherit;
  transition: background .12s ease;
}
.nearby-row:hover, .nearby-row:active { background: rgba(196,106,58,0.06); }
.nearby-main {
  display: flex; align-items: center; gap: 8px;
  font-size: 14px; color: #2a1e17;
}
.nearby-name { font-weight: 500; }
.nearby-rating { color: #c46a3a; font-size: 13px; }
.nearby-price { color: #a89684; font-size: 12px; }
.nearby-open {
  font-size: 11px; color: #3f8f5c;
  background: rgba(63,143,92,0.1);
  padding: 2px 6px; border-radius: 6px;
}
.nearby-sub {
  display: flex; align-items: center; gap: 8px;
  margin-top: 4px; font-size: 12px; color: #a89684;
}
.nearby-dish {
  padding: 1px 6px; border-radius: 6px;
  background: rgba(168,150,132,0.12);
}
.pick-title {
  color: #c46a3a; font-size: 12px;
  font-weight: 400; letter-spacing: 0.1em;
  text-transform: uppercase; margin-bottom: 12px;
}
.pick-dish {
  font-size: 24px; font-weight: 300; color: #2a1e17;
  letter-spacing: -0.01em; line-height: 1.3;
  margin-bottom: 16px;
}
.pick-reason { color: #5a4a3f; font-size: 14px; line-height: 1.7; margin: 16px 0 0; }
.places-note {
  color: #a89684; font-size: 12px;
  letter-spacing: 0.06em; margin: 0 0 8px 0;
}
.danger-tag { border-color: rgba(160,74,58,0.2); color: #a04a3a; }
.maps-link {
  display: inline-block; margin-top: 12px;
  color: #4285F4; font-size: 13px; text-decoration: none;
  border-bottom: 1px solid rgba(66,133,244,0.3);
}
.maps-link:hover { color: #2a5bbf; border-color: rgba(42,91,191,0.5); }
.refine .q-title {
  font-size: 12px; color: #a89684;
  letter-spacing: 0.08em; text-transform: uppercase;
  margin-bottom: 16px; font-weight: 400;
}
.btn-ghost.slim { padding: 12px 0; font-size: 14px; }
.refine-input-row {
  display: flex; align-items: center; gap: 12px;
  margin-top: 16px; padding-top: 16px;
  border-top: 1px solid rgba(168,150,132,0.15);
}
.refine-input {
  flex: 1; padding: 10px 14px; font-size: 14px;
  border: 1px solid rgba(168,150,132,0.3); border-radius: 10px;
  background: rgba(245,241,238,0.6); color: #2a1e17;
  outline: none; font-family: inherit;
}
.refine-input::placeholder { color: #a89684; }
.refine-input:focus { border-color: #c46a3a; }
.btn-send {
  padding: 10px 20px; font-size: 13px; font-weight: 400;
  color: #fff; background: #c46a3a; border: none;
  border-radius: 10px; cursor: pointer; white-space: nowrap;
  font-family: inherit; letter-spacing: 0.04em;
}
.btn-send:hover { background: #a85530; }
</style>
