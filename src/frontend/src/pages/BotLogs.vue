<template>
  <AppLayout title="Bot logs" subtitle="Discord bot activity and error log">
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat-card">
        <div class="stat-label">Uptime</div>
        <div class="stat-value">{{ uptime }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Entries shown</div>
        <div class="stat-value">{{ filtered.length }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Errors</div>
        <div class="stat-value" :class="errorCount > 0 ? 'text-danger' : ''">
          {{ errorCount }}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="ti ti-file-text" /> Live log</div>
        <div style="display:flex;gap:8px;align-items:center">
          <select v-model="levelFilter" style="width:130px;padding:5px 8px">
            <option value="all">All levels</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
          <button class="btn btn-sm" @click="logs = []">
            <i class="ti ti-trash" /> Clear
          </button>
        </div>
      </div>

      <div class="log-box" ref="logBox">
        <div
          v-for="(entry, i) in filtered"
          :key="i"
          class="log-line"
          :class="`level-${entry.level}`"
        >
          <span class="log-ts">{{ entry.ts }}</span>
          <span class="log-level">[{{ entry.level.toUpperCase().padEnd(5) }}]</span>
          <span class="log-msg">{{ entry.message }}</span>
        </div>
        <div v-if="!filtered.length" class="empty">No log entries.</div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import client from '@/api/client'

const logs        = ref([])
const levelFilter = ref('all')
const logBox      = ref(null)
const uptime      = ref('—')

const filtered = computed(() =>
  levelFilter.value === 'all'
    ? logs.value
    : logs.value.filter(e => e.level === levelFilter.value)
)

const errorCount = computed(() => logs.value.filter(e => e.level === 'error').length)

let pollTimer = null
let healthTimer = null

onMounted(async () => {
  await Promise.all([fetchLogs(), fetchHealth()])
  pollTimer = setInterval(fetchLogs, 5000)
  healthTimer = setInterval(fetchHealth, 15000)
})

onUnmounted(() => {
  clearInterval(pollTimer)
  clearInterval(healthTimer)
})

function formatUptime(ms) {
  if (!ms) return '—'
  const mins = Math.floor(ms / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${mins % 60}m`
  return `${mins}m`
}

async function fetchHealth() {
  try {
    const res = await fetch('/health', { credentials: 'include' })
    const data = await res.json()
    uptime.value = formatUptime(data.bot?.uptime)
  } catch {
    uptime.value = '—'
  }
}

async function fetchLogs() {
  try {
    const res = await client.get('/api/logs', { params: { limit: 500 } })
    logs.value = res.data
  } catch { /* silent */ }
}
</script>

<style scoped>
.log-box {
  background: #0a0c10;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  height: 360px;
  overflow-y: auto;
}

.log-line {
  display: flex;
  gap: 8px;
  margin-bottom: 2px;
  line-height: 1.6;
}

.log-ts    { color: #444; flex-shrink: 0; }
.log-level { flex-shrink: 0; }
.log-msg   { color: #bbb; flex: 1; word-break: break-all; }

.level-info  .log-level { color: #5dcaa5; }
.level-warn  .log-level { color: #ef9f27; }
.level-error .log-level { color: #f09595; }
.level-debug .log-level { color: #7f77dd; }

.empty { font-size: 12px; color: var(--text-tertiary); padding: 8px 0; }
</style>