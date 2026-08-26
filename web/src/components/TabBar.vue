<template>
  <nav class="tabbar">
    <router-link v-for="t in tabs" :key="t.path" :to="t.path" class="tab" active-class="tab-active">
      <div class="lbl">{{ t.label }}</div>
    </router-link>
  </nav>
</template>

<script setup>
const tabs = [
  { path: '/today', label: '今日' },
  { path: '/diary', label: '日记' },
  { path: '/party', label: '聚餐' },
  { path: '/community', label: '社区' },
  { path: '/mine', label: '我的' }
]
</script>

<style scoped>
.tabbar {
  position: fixed; left: 0; right: 0; bottom: 0;
  height: 56px;
  background: #fbf7f0;
  border-top: 1px solid rgba(74,52,40,0.10);
  display: flex; z-index: 100;
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.tab {
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  color: #a89684; text-decoration: none;
  font-size: 13px;
  letter-spacing: 0.06em;
  font-weight: 400;
  transition: color .15s;
}
.tab-active { color: #c46a3a; font-weight: 500; }
.lbl { padding: 0 6px; }
</style>
