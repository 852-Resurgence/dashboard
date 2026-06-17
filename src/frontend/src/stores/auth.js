import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import client from '@/api/client'
import { reportDebug } from '@/api/debugReport'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)   // { userId, username, role }
  const loading = ref(true)

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isMod   = computed(() => ['admin', 'mod'].includes(user.value?.role))

  async function fetchMe() {
    try {
      const res = await client.get('/auth/me')
      user.value = res.data
      // #region agent log
      reportDebug('auth.js:fetchMe:ok', 'fetchMe succeeded', {
        role: res.data.role,
        path: window.location.pathname,
        query: window.location.search,
      }, 'H5')
      // #endregion
    } catch (err) {
      user.value = null
      // #region agent log
      reportDebug('auth.js:fetchMe:fail', 'fetchMe failed', {
        status: err.response?.status ?? null,
        path: window.location.pathname,
        query: window.location.search,
      }, 'H3')
      // #endregion
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    await client.post('/auth/logout')
    user.value = null
  }

  return { user, loading, isAuthenticated, isAdmin, isMod, fetchMe, logout }
})