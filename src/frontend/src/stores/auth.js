import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import client from '@/api/client'

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
    } catch {
      user.value = null
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