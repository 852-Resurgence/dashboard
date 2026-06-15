import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

import Login     from '@/pages/Login.vue'
import Dashboard from '@/pages/Dashboard.vue'
import Warnings  from '@/pages/Warnings.vue'
import Members   from '@/pages/Members.vue'
import Console   from '@/pages/Console.vue'
import BotLogs   from '@/pages/BotLogs.vue'
import Wiki      from '@/pages/Wiki.vue'

const routes = [
  { path: '/login', component: Login, meta: { public: true } },
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

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Fetch session on first navigation if not yet resolved
  if (auth.loading) await auth.fetchMe()

  if (!to.meta.public && !auth.isAuthenticated) {
    return { path: '/login' }
  }

  if (to.path === '/login' && auth.isAuthenticated) {
    return { path: '/' }
  }
})

export default router