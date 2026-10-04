import { createRouter, createWebHashHistory } from 'vue-router'
import { getProfile } from './services/store.js'

const routes = [
  { path: '/', redirect: '/today' },
  { path: '/onboarding/brand', component: () => import('./views/Brand.vue') },
  { path: '/onboarding/basic', component: () => import('./views/Basic.vue') },
  { path: '/onboarding/prefer', component: () => import('./views/Prefer.vue') },
  { path: '/today', component: () => import('./views/Today.vue'), meta: { tab: true } },
  { path: '/fridge', component: () => import('./views/Fridge.vue'), meta: { tab: true } },
  { path: '/capture/confirm', component: () => import('./views/Confirm.vue') },
  { path: '/recommend', component: () => import('./views/RecommendList.vue') },
  { path: '/recommend/detail', component: () => import('./views/RecommendDetail.vue') },
  { path: '/recommend/feedback', component: () => import('./views/Feedback.vue') },
  { path: '/agent', component: () => import('./views/Agent.vue') },
  { path: '/diary', component: () => import('./views/Diary.vue'), meta: { tab: true } },
  { path: '/partner', component: () => import('./views/Partner.vue'), meta: { tab: true } },
  { path: '/mine', component: () => import('./views/Mine.vue'), meta: { tab: true } },
  { path: '/party', redirect: '/partner' },
  { path: '/community', redirect: '/partner' }
]

const router = createRouter({ history: createWebHashHistory(), routes })

router.beforeEach((to) => {
  const p = getProfile()
  if (!p || !p.onboarded) {
    if (!to.path.startsWith('/onboarding')) return '/onboarding/brand'
  }
})

export default router
