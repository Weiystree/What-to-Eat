<template>
  <div class="agent">
    <div class="topbar">
      <button class="back" @click="goBack" aria-label="返回">‹</button>
      <div>
        <div class="title">问问 NextMeal</div>
        <div class="subtitle">自主理解你的需求，决定这一餐</div>
      </div>
    </div>

    <div class="chat" ref="chatEl">
      <!-- 开场提示 -->
      <div v-if="messages.length === 0" class="empty">
        <div class="empty-title">不知道怎么决定这一餐？</div>
        <div class="empty-sub">说说你现在的情况，Agent 会自己判断该查什么、该推荐什么。</div>
        <div class="chips">
          <button v-for="s in suggestions" :key="s" class="chip" @click="send(s)">{{ s }}</button>
        </div>
      </div>

      <!-- 消息流 -->
      <div v-for="(m, i) in messages" :key="i" class="msg">
        <div class="bubble user">{{ m.text }}</div>
        <div v-if="m.loading" class="bubble agent dim">正在思考…</div>
        <template v-else-if="m.data">
          <div v-if="m.data.reply" class="bubble agent">{{ m.data.reply }}</div>

          <!-- 推荐卡（recommend / party） -->
          <div v-if="m.data.picks && m.data.picks.length" class="cards">
            <div v-for="p in m.data.picks" :key="p.key" class="pick">
              <div class="pick-title">{{ p.title }}</div>
              <div class="pick-dish">{{ p.dish }}</div>
              <div class="pick-reason">{{ p.reason }}</div>
              <div class="pick-meta">
                <span v-if="p.budget">💰 {{ p.budget }}</span>
                <span v-if="p.time">⏱ {{ p.time }}</span>
              </div>
              <div v-if="p.howto" class="pick-howto">{{ p.howto }}</div>
              <div v-if="p.notes" class="pick-howto">{{ p.notes }}</div>
            </div>
          </div>

          <!-- 营养建议 -->
          <div v-if="m.data.items && m.data.items.length" class="cards">
            <div v-for="(n, idx) in m.data.items" :key="idx" class="pick nutri">
              <div class="pick-dish">{{ n.name }} <span class="portion">· {{ n.portion }}</span></div>
              <div class="pick-reason">{{ n.why }}</div>
            </div>
            <div v-if="m.data.summary" class="pick-reason summary">{{ m.data.summary }}</div>
          </div>

          <div v-if="m.data.trace && m.data.trace.length" class="trace">已调用：{{ m.data.trace.join(' → ') }}</div>
        </template>
      </div>
    </div>

    <div class="inputbar">
      <input class="input" v-model="draft" placeholder="例如：今天不想做饭，附近有什么好吃的？"
             @keyup.enter="sendCurrent" />
      <button class="send" :disabled="sending" @click="sendCurrent">发送</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  getProfile, getDiary, getTodayContext, getDeliveryStores,
  getSavedLocation, deriveAgeMode, getFridgeSnapshot
} from '../services/store.js'
import { agent } from '../services/agent.js'

const router = useRouter()
const draft = ref('')
const sending = ref(false)
const messages = ref([])
const chatEl = ref(null)

const suggestions = [
  '今天不知道吃什么',
  '最近是不是吃太重复了',
  '家里有鸡蛋、西兰花和面条',
  '今天很累不想做饭',
  '我们三个人聚餐吃什么'
]

function buildMemory() {
  const profile = getProfile()
  return {
    profile,
    ageMode: deriveAgeMode(profile),
    recentDiary: getDiary().slice(0, 10),
    todayContext: getTodayContext(),
    recentStores: getDeliveryStores(5),
    location: getSavedLocation(),
    fridge: getFridgeSnapshot()
  }
}

async function sendCurrent() {
  const text = draft.value.trim()
  if (!text) return
  draft.value = ''
  await send(text)
}

async function send(text) {
  if (sending.value) return
  sending.value = true
  messages.value.push({ text, loading: true })
  scrollDown()
  const r = await agent({ userText: text, memory: buildMemory() })
  const data = (r && r.ok && r.data) ? r.data : { reply: '（回答失败，请重试）' }
  const last = messages.value[messages.value.length - 1]
  last.loading = false
  last.data = data
  sending.value = false
  scrollDown()
}

function scrollDown() {
  nextTick(() => {
    if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
  })
}

function goBack() {
  router.back()
}

onMounted(() => {
  // 开场由 empty 状态承担
})
</script>

<style scoped>
.agent {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding-bottom: calc(96px + env(safe-area-inset-bottom, 0));
  box-sizing: border-box;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 0 20px;
  border-bottom: 1px solid rgba(74, 52, 40, 0.10);
}
.back {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid rgba(74, 52, 40, 0.12);
  background: #fff;
  color: #2a1e17;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.title { font-size: 22px; font-weight: 500; color: #2a1e17; letter-spacing: -0.01em; }
.subtitle { font-size: 12px; color: #a89684; margin-top: 2px; }

.chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 0;
  overflow-y: auto;
}

.empty { text-align: center; padding: 40px 8px; }
.empty-title { font-size: 18px; font-weight: 500; color: #2a1e17; }
.empty-sub { font-size: 13px; color: #a89684; margin-top: 8px; line-height: 1.6; }
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 22px;
}
.chip {
  padding: 9px 15px;
  border-radius: 100px;
  border: 1px solid rgba(196, 106, 58, 0.25);
  background: #fff;
  color: #c46a3a;
  font-size: 13px;
  cursor: pointer;
  transition: background 120ms ease;
}
.chip:active { background: #f3ecdf; }

.msg { display: flex; flex-direction: column; gap: 8px; }
.bubble {
  max-width: 82%;
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.6;
}
.bubble.user {
  align-self: flex-end;
  background: #c46a3a;
  color: #fff;
  border-bottom-right-radius: 4px;
}
.bubble.agent {
  align-self: flex-start;
  background: #fff;
  color: #2a1e17;
  border: 1px solid rgba(74, 52, 40, 0.08);
  border-bottom-left-radius: 4px;
}
.bubble.dim { color: #a89684; }

.cards { display: flex; flex-direction: column; gap: 10px; align-self: stretch; }
.pick {
  background: #fff;
  border: 1px solid rgba(74, 52, 40, 0.08);
  border-radius: 16px;
  padding: 16px;
}
.pick-title { font-size: 12px; color: #c46a3a; font-weight: 500; letter-spacing: 0.04em; margin-bottom: 6px; }
.pick-dish { font-size: 16px; font-weight: 500; color: #2a1e17; line-height: 1.4; }
.pick-dish .portion { color: #a89684; font-weight: 400; }
.pick-reason { font-size: 13px; color: #5a4a3f; line-height: 1.6; margin-top: 6px; }
.pick-reason.summary { font-style: italic; color: #5a4a3f; }
.pick-meta { display: flex; gap: 14px; margin-top: 10px; font-size: 12px; color: #a89684; }
.pick-howto { font-size: 12px; color: #a89684; line-height: 1.5; margin-top: 10px; padding-top: 10px; border-top: 1px dashed rgba(74, 52, 40, 0.10); }
.pick.nutri .pick-dish { font-size: 15px; }

.trace { font-size: 11px; color: #c3b6a6; align-self: flex-start; padding-left: 4px; }

.inputbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 10px;
  padding: 12px 20px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0));
  background: #fbf7f0;
  border-top: 1px solid rgba(74, 52, 40, 0.08);
  box-sizing: border-box;
}
.input {
  flex: 1;
  padding: 12px 16px;
  border-radius: 100px;
  border: 1px solid rgba(74, 52, 40, 0.12);
  background: #fff;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}
.input:focus { border-color: rgba(196, 106, 58, 0.4); }
.send {
  padding: 0 22px;
  border-radius: 100px;
  border: none;
  background: #c46a3a;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 120ms ease;
}
.send:disabled { opacity: 0.5; }
</style>
