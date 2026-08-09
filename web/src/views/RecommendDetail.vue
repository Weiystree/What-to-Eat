<template>
  <div>
    <div class="card">
      <div class="pick-title">{{ pick.title }}</div>
      <div class="pick-dish">{{ pick.dish }}</div>
      <p class="pick-reason">{{ pick.reason }}</p>
      <a v-if="pick.mapsUrl" :href="pick.mapsUrl" target="_blank" class="maps-link">Google Maps 查看 →</a>

      <div class="section-label">预计</div>
      <div class="row">
        <span class="tag active">预算 {{ pick.budget }}</span>
        <span class="tag">用时 {{ pick.time }}</span>
      </div>

      <div v-if="pick.allergens && pick.allergens.length">
        <div class="section-label">过敏原提示</div>
        <div class="row">
          <span v-for="a in pick.allergens" :key="a" class="tag">{{ a }}</span>
        </div>
      </div>

      <div v-if="pick.swaps && pick.swaps.length">
        <div class="section-label">可替换</div>
        <div class="row">
          <span v-for="s in pick.swaps" :key="s" class="tag">{{ s }}</span>
        </div>
      </div>

      <div class="section-label">做法 / 点单方式</div>
      <p class="pick-reason">{{ pick.howto }}</p>
    </div>

    <div class="card">
      <div class="section-label">继续追问</div>
      <div class="row">
        <span class="tag" @click="quickAsk('我不想吃米饭，可以换什么？')">换掉主食</span>
        <span class="tag" @click="quickAsk('我想更辣一点。')">更辣一点</span>
        <span class="tag" @click="quickAsk('有没有更便宜的？')">更便宜</span>
        <span class="tag" @click="quickAsk('这个菜怎么做？')">教我做法</span>
      </div>
      <div v-if="loadingReply" class="loading">{{ loadingDots }}</div>
      <div v-if="replyData" class="reply">
        <!-- 纯文本回复 -->
        <div v-if="replyData.reply" class="reply-text">{{ replyData.reply }}</div>

        <!-- 结构化卡片追问结果 -->
        <template v-if="replyData.cards && replyData.cards.length">
          <div v-for="c in replyData.cards" :key="c.title + c.dish" class="mini-card">
            <div class="mini-title">{{ c.title }}</div>
            <div class="mini-dish">{{ c.dish }}</div>
            <div class="mini-reason" v-if="c.reason">{{ c.reason }}</div>
          </div>
        </template>

        <div v-if="replyData.note" class="reply-note">{{ replyData.note }}</div>
      </div>
    </div>

    <button class="btn-primary" @click="onPick">就吃这个</button>
    <button class="btn-ghost" @click="$router.back()">换一个</button>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as agent from '../services/agent.js'
import { getPending, getProfile, getTodayContext, appendDiary } from '../services/store.js'

const router = useRouter()
const pick = ref({ allergens: [], swaps: [] })
const replyData = ref(null)
const loadingReply = ref(false)
const loadingDots = ref('思考中')
let dotsTimer = null

onMounted(() => {
  pick.value = getPending('pick') || { allergens: [], swaps: [] }
})

async function quickAsk(q) {
  loadingReply.value = true
  replyData.value = null
  loadingDots.value = '思考中'
  let n = 0
  dotsTimer = setInterval(() => { n = (n + 1) % 4; loadingDots.value = '思考中' + '.'.repeat(n) }, 400)
  const r = await agent.chat({
    userText: q,
    profile: getProfile(),
    todayContext: getTodayContext(),
    history: [{ role: 'agent', text: pick.value.dish }]
  })
  clearInterval(dotsTimer)
  loadingReply.value = false
  const d = r && r.data
  if (!d) { replyData.value = { reply: '（无回复）' }; return }
  // 富格式：有 cards / note / reply 任一都渲染
  if (d.cards || d.reply || d.note) {
    replyData.value = d
  } else if (typeof d === 'object') {
    // 模型返回了不认识的 JSON → 无格式显示
    replyData.value = { reply: JSON.stringify(d, null, 2) }
  } else {
    replyData.value = { reply: String(d) }
  }
}

function guessMeal() {
  const h = new Date().getHours()
  if (h < 10) return '早餐'
  if (h < 14) return '午餐'
  if (h < 17) return '加餐'
  if (h < 21) return '晚餐'
  return '夜宵'
}

async function onPick() {
  let item = { name: pick.value.dish, portion: '一份', method: '推荐执行', category: 'other' }
  try {
    const r = await agent.estimateMeal({ textDescription: pick.value.dish, profile: getProfile() })
    if (r && r.ok && r.data && Array.isArray(r.data.items) && r.data.items.length) {
      item = { ...r.data.items[0], method: '推荐执行' }
    }
  } catch (e) {
    // 估算失败：保留上面的兜底 item
  }
  appendDiary({
    items: [item],
    pick: pick.value, meal: guessMeal(),
    confirmed: false, awaitingFeedback: true
  })
  router.replace('/recommend/feedback')
}
</script>

<style scoped>
.pick-title {
  color: #c46a3a; font-size: 12px;
  font-weight: 400; letter-spacing: 0.1em;
  text-transform: uppercase; margin-bottom: 12px;
}
.pick-dish {
  font-size: 26px; font-weight: 300; color: #2a1e17;
  letter-spacing: -0.01em; line-height: 1.3;
  margin-bottom: 16px;
}
.pick-reason { color: #5a4a3f; font-size: 14px; line-height: 1.7; margin: 0; }
.reply {
  margin-top: 16px;
}
.reply-text {
  padding: 14px 16px;
  background: #f3ecdf; border-radius: 12px;
  color: #2a1e17; font-size: 14px; line-height: 1.7;
  margin-bottom: 14px;
}
.mini-card {
  padding: 14px 0;
  border-bottom: 1px solid rgba(74,52,40,0.08);
}
.mini-card:last-of-type { border-bottom: none; }
.mini-title {
  color: #c46a3a; font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase; margin-bottom: 4px;
}
.mini-dish {
  font-size: 16px; font-weight: 400; color: #2a1e17;
  line-height: 1.4; margin-bottom: 4px;
}
.mini-reason { color: #5a4a3f; font-size: 13px; line-height: 1.6; }
.reply-note {
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid rgba(74,52,40,0.08);
  color: #a89684; font-size: 13px;
  line-height: 1.6; font-style: italic;
}
.loading {
  margin-top: 16px; padding: 14px 16px;
  background: #f3ecdf; border-radius: 12px;
  color: #a89684; font-size: 14px;
}
.maps-link {
  display: inline-block; margin-top: 12px;
  color: #4285F4; font-size: 13px; text-decoration: none;
  border-bottom: 1px solid rgba(66,133,244,0.3);
}
.maps-link:hover { color: #2a5bbf; border-color: rgba(42,91,191,0.5); }
</style>
