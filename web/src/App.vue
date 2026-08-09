<template>
  <div class="app">
    <router-view v-slot="{ Component, route }">
      <transition :name="transitionName" mode="out-in">
        <component :is="Component" :key="route.fullPath" class="page"/>
      </transition>
    </router-view>
    <TabBar v-if="showTab" />
    <button v-if="showHomeBtn" class="home-fab" @click="goHome" aria-label="返回主页">
      <span class="home-fab-icon">⌂</span>
    </button>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TabBar from './components/TabBar.vue'

const route = useRoute()
const router = useRouter()
const showTab = computed(() => !!route.meta?.tab)
const showHomeBtn = computed(() => !showTab.value && !route.path.startsWith('/onboarding'))

function goHome() {
  router.push('/today')
}

// 一级 Tab 之间使用横向切换感（fade + 微位移）；进入详情页略微上浮
const TAB_PATHS = ['/today', '/party', '/diary', '/mine']
const transitionName = ref('page-fade')

watch(() => route.path, (to, from) => {
  if (!from) { transitionName.value = 'page-fade'; return }
  const toTab = TAB_PATHS.indexOf(to)
  const fromTab = TAB_PATHS.indexOf(from)
  // 都是 Tab 就横向；否则默认淡入
  if (toTab >= 0 && fromTab >= 0) {
    transitionName.value = toTab > fromTab ? 'page-slide-l' : 'page-slide-r'
  } else {
    transitionName.value = 'page-fade'
  }
})
</script>

<style>
.app {
  min-height: 100vh;
  padding-bottom: 120px;
  background: #fbf7f0;
  overflow-x: hidden;
}
.page {
  padding: 40px 24px 32px;
  box-sizing: border-box;
  max-width: 640px;
  margin: 0 auto;
}

/* —— 页面过渡 —— */
/* 淡入淡出 + 轻微上浮 */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 240ms ease, transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}
.page-fade-enter-from { opacity: 0; transform: translateY(6px); }
.page-fade-leave-to   { opacity: 0; transform: translateY(-4px); }

/* Tab 之间横向切换：目标 index 更大 → 从右滑入 */
.page-slide-l-enter-active,
.page-slide-l-leave-active,
.page-slide-r-enter-active,
.page-slide-r-leave-active {
  transition: opacity 260ms ease, transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
}
.page-slide-l-enter-from { opacity: 0; transform: translateX(24px); }
.page-slide-l-leave-to   { opacity: 0; transform: translateX(-24px); }
.page-slide-r-enter-from { opacity: 0; transform: translateX(-24px); }
.page-slide-r-leave-to   { opacity: 0; transform: translateX(24px); }

/* 非 Tab 页面的常驻返回主页按钮 */
.home-fab {
  position: fixed;
  right: 20px;
  bottom: calc(24px + env(safe-area-inset-bottom, 0));
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #c46a3a;
  border: none;
  box-shadow: 0 4px 14px rgba(74,52,40,0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 100;
  transition: transform .12s ease, opacity .12s ease;
}
.home-fab:active {
  transform: scale(0.92);
  opacity: 0.9;
}
.home-fab-icon {
  color: #fff;
  font-size: 22px;
  line-height: 1;
}
</style>
