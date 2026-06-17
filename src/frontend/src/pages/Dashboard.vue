<template>
  <AppLayout title="Dashboard" :subtitle="`Welcome back, ${auth.user?.username}`">
    <div class="stat-grid" style="grid-template-columns: repeat(2, 1fr)">
      <div class="stat-card">
        <div class="stat-label">Total members</div>
        <div class="stat-value">{{ memberCount ?? '—' }}</div>
        <div class="stat-sub">Last synced {{ lastSynced }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">MC server</div>
        <div class="stat-value" :class="server.online ? 'text-success' : 'text-danger'">
          {{ server.online ? 'Online' : 'Offline' }}
        </div>
        <div class="stat-sub">{{ server.players }} / {{ server.maxPlayers }} players</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="ti ti-clock" /> Recent actions</div>
      </div>
      <table class="data-table">
        <colgroup>
          <col style="width:28%">
          <col style="width:25%">
          <col style="width:22%">
          <col style="width:25%">
        </colgroup>
        <thead>
          <tr>
            <th>Member</th>
            <th>Action</th>
            <th>Moderator</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="action in recentActions" :key="action.id">
            <td>
              <div class="member-chip">
                <div class="member-avatar">{{ initials(action.username) }}</div>
                {{ action.username }}
              </div>
            </td>
            <td><WarnBadge :level="action.level" /></td>
            <td class="text-tertiary">{{ action.issued_by_name }}</td>
            <td class="text-tertiary">{{ timeAgo(action.issued_at) }}</td>
          </tr>
          <tr v-if="!recentActions.length">
            <td colspan="4" class="text-tertiary" style="text-align:center;padding:20px 0">
              No recent actions
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </AppLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import AppLayout from '@/components/AppLayout.vue'
import WarnBadge from '@/components/WarnBadge.vue'
import client from '@/api/client'

const auth = useAuthStore()

const memberCount   = ref(null)
const lastSynced    = ref('—')
const server        = ref({ online: false, players: 0, maxPlayers: 0 })
const recentActions = ref([])

onMounted(async () => {
  const [syncRes, serverRes, warningsRes] = await Promise.allSettled([
    client.get('/api/members/sync/status'),
    client.get('/api/console/status'),
    client.get('/api/warnings?expired=false'),
  ])

  if (syncRes.status === 'fulfilled') {
    memberCount.value = syncRes.value.data.member_count ?? null
    const d = new Date(syncRes.value.data.last_synced_at)
    lastSynced.value = isNaN(d) ? 'Never' : d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
  }

  if (serverRes.status === 'fulfilled') {
    server.value = serverRes.value.data
  }

  if (warningsRes.status === 'fulfilled') {
    recentActions.value = warningsRes.value.data.slice(0, 5)
  }
})

function initials(name = '') {
  return name.slice(0, 2).toUpperCase()
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (days > 0)  return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  return `${mins}m ago`
}
</script>