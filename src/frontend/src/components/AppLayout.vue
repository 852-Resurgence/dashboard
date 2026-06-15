<template>
  <div class="layout">
    <AppSidebar />
    <div class="main">
      <header class="topbar">
        <div>
          <div class="topbar-title">{{ title }}</div>
          <div class="topbar-sub">{{ subtitle }}</div>
        </div>
        <div class="topbar-actions">
          <span class="bot-status">
            Bot <span :class="botOnline ? 'online' : 'offline'">{{ botOnline ? 'online' : 'offline' }}</span>
          </span>
          <button class="btn btn-sm" @click="handleLogout">
            <i class="ti ti-logout" /> Sign out
          </button>
        </div>
      </header>
      <main class="content">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppSidebar from './AppSidebar.vue'

defineProps({
  title:    { type: String, default: '' },
  subtitle: { type: String, default: '' },
})

const router = useRouter()
const auth   = useAuthStore()
const botOnline = ref(true) // TODO: poll /api/health or a dedicated bot status endpoint

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.topbar {
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  padding: 13px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.topbar-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.topbar-sub {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 1px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bot-status {
  font-size: 11px;
  color: var(--text-tertiary);
}

.bot-status .online  { color: var(--text-success); font-weight: 500; }
.bot-status .offline { color: var(--text-danger);  font-weight: 500; }

.content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 22px;
}
</style>