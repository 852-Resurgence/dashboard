import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import client from '@/api/client'
import { reportDebug } from '@/api/debugReport'

import Login     from '@/pages/Login.vue'
import Setup     from '@/pages/Setup.vue'
import Dashboard from '@/pages/Dashboard.vue'
import Warnings  from '@/pages/Warnings.vue'
import Members   from '@/pages/Members.vue'
import Console   from '@/pages/Console.vue'
import BotLogs   from '@/pages/BotLogs.vue'
import Wiki      from '@/pages/Wiki.vue'

const routes = [
  { path: '/login', component: Login, meta: { public: true } },
  { path: '/setup', component: Setup, meta: { title: 'Setup', adminOnly: true, skipSetupCheck: true } },
  { path: '/',         component: Dashboard, meta: { title: 'Dashboard' } },
  { path: '/warnings', component: Warnings,  meta: { title: 'Warnings' } },
  { path: '/members',  component: Members,   meta: { title: 'Member list' } },
  { path: '/console',  component: Console,   meta: { title: 'Minecraft console' } },
  { path: '/logs',     component: BotLogs,   meta: { title: 'Bot logs' } },
  { path: '/wiki',     component: Wiki,      meta: { title: 'MediaWiki' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

async function fetchSetupStatus() {
  try {
    const res = await client.get('/api/config/setup-status')
    return res.data
  } catch (err) {
    // Don't treat auth failures as "setup complete" — avoids redirect loops
    if (err.response?.status === 401) return { complete: false }
    return { complete: true }
  }
}

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (auth.loading) await auth.fetchMe()

  // #region agent log
  reportDebug('router:beforeEach', 'navigation guard', {
    to: to.path,
    query: to.fullPath.includes('?') ? to.fullPath.split('?')[1] : '',
    isAuthenticated: auth.isAuthenticated,
    isAdmin: auth.isAdmin,
    role: auth.user?.role ?? null,
  }, 'H5')
  // #endregion

  if (!to.meta.public && !auth.isAuthenticated) {
    // #region agent log
    reportDebug('router:redirect', 'unauthenticated -> login', { to: to.path }, 'H5')
    // #endregion
    return { path: '/login' }
  }

  if (to.meta.adminOnly && auth.isAuthenticated && !auth.isAdmin) {
    return { path: '/' }
  }

  const setup = auth.isAdmin ? await fetchSetupStatus() : { complete: true }

  if (auth.isAuthenticated && auth.isAdmin && !setup.complete && !to.meta.skipSetupCheck) {
    return { path: '/setup' }
  }

  if (to.path === '/setup' && setup.complete) {
    return { path: '/' }
  }

  if (to.path === '/login' && auth.isAuthenticated) {
    if (auth.isAdmin && !setup.complete) return { path: '/setup' }
    return { path: '/' }
  }
})

export default router
