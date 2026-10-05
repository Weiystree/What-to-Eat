<template>
  <div>
    <h1 class="title">饭后反馈</h1>
    <p class="subtitle">吃完再回来花 10 秒告诉我，下次推荐会更准。</p>

    <div class="card">
      <div class="section-label">满意度</div>
      <div class="row">
        <span v-for="n in [1,2,3,4,5]" :key="n" class="tag"
              :class="{active: fb.score === n}" @click="fb.score = n">{{ n }} 分</span>
      </div>

      <div class="section-label">饱腹感</div>
      <div class="row">
        <span v-for="o in ['不够','刚好','太多']" :key="o" class="tag"
              :class="{active: fb.fullness === o}" @click="fb.fullness = o">{{ o }}</span>
      </div>

      <div class="section-label">饭后感受</div>
      <div class="row">
        <span v-for="o in feelOptions" :key="o" class="tag"
              :class="{active: fb.feel === o}" @click="fb.feel = o">{{ o }}</span>
      </div>
      <textarea v-if="fb.feel === '其他'" class="textarea" style="margin-top:8px;"
                placeholder="说说饭后的具体感受，例如：喉咙有点干、胃有点反酸…"
                v-model="fb.customFeel"></textarea>

      <div class="section-label">下次还愿意吃吗</div>
      <div class="row">
        <span v-for="o in ['愿意','不确定','不愿意']" :key="o" class="tag"
              :class="{active: fb.willAgain === o}" @click="fb.willAgain = o">{{ o }}</span>
      </div>
    </div>

    <button class="btn-primary" @click="submit">提交</button>
    <button class="btn-ghost" @click="$router.replace('/today')">先跳过</button>

    <!-- 可选分享（v2.md #22：Share 是 Meal Log 的 optional action） -->
    <div v-if="showShare" class="mask" @click.self="skipShare">
      <div class="sheet">
        <div class="sheet-head">
          <span>已记录，谢谢反馈 ✓</span>
          <button class="close" @click="skipShare">×</button>
        </div>
        <p class="subtitle" style="margin-bottom:12px;">要顺便把这餐分享给饭搭子吗？</p>
        <div class="card" style="margin:0 0 14px;">{{ shareText }}</div>
        <button class="btn-primary" @click="doShare">分享给饭搭子</button>
        <button class="btn-ghost" @click="skipShare">不用了</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getDiary, updateDiary, getCommunityMe } from '../services/store.js'
import { communityPost } from '../services/agent.js'

const router = useRouter()
const feelOptions = ['舒服', '偏腻', '胀', '困', '其他']
const fb = reactive({ score: 4, fullness: '刚好', feel: '舒服', customFeel: '', willAgain: '愿意' })

const showShare = ref(false)
const shareText = ref('')

function submit() {
  const target = getDiary().find(d => d.awaitingFeedback)
  const payload = { ...fb }
  if (payload.feel !== '其他') payload.customFeel = ''
  if (target) updateDiary(target.id, { awaitingFeedback: false, feedback: payload })
  const me = getCommunityMe()
  const names = target && (target.items || []).map(i => i.name).filter(Boolean).join('、')
  if (me && me.code && names) {
    shareText.value = (target.meal ? target.meal + '：' : '') + names
    showShare.value = true
    return
  }
  alert('已记录，谢谢反馈')
  router.replace('/today')
}
async function doShare() {
  showShare.value = false
  const me = getCommunityMe()
  try {
    await communityPost({ meCode: me.code, mealText: shareText.value, caption: '记录于 NextMeal' })
  } catch (e) { /* 分享失败不阻塞导航 */ }
  router.replace('/today')
}
function skipShare() {
  showShare.value = false
  router.replace('/today')
}
</script>

<style scoped>
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
  box-sizing: border-box;
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
</style>
