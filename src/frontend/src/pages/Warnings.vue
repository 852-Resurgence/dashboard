<template>
  <AppLayout title="Warnings" subtitle="Issue and manage member warnings">
    <div class="tabs">
      <div class="tab" :class="{ active: tab === 'issue' }"   @click="tab = 'issue'">Issue warning</div>
      <div class="tab" :class="{ active: tab === 'active' }"  @click="tab = 'active'; loadActive()">Active</div>
      <div class="tab" :class="{ active: tab === 'expired' }" @click="tab = 'expired'; loadExpired()">Expired</div>
    </div>

    <div v-if="tab === 'issue'" class="card">
      <div class="form-grid form-grid-2">
        <div class="form-group">
          <label class="form-label">Discord username</label>
          <input v-model="form.username" type="text" placeholder="e.g. coldxray" />
        </div>
        <div class="form-group">
          <label class="form-label">Discord ID</label>
          <input v-model="form.discord_id" type="text" placeholder="e.g. 123456789012345678" />
        </div>
      </div>
      <div class="form-grid form-grid-2">
        <div class="form-group">
          <label class="form-label">Warning level</label>
          <select v-model="form.level">
            <option value="">Select a level…</option>
            <option value="0">0 — Informal warning</option>
            <option value="1">1 — Formal warning</option>
            <option value="2A">2A — 14-day ban</option>
            <option value="2B">2B — 30-day ban</option>
            <option value="3">3 — Indefinite ban (appeal after 6 months)</option>
            <option value="4">4 — Permanent non-appealable ban</option>
          </select>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">Reason</label>
        <textarea v-model="form.reason" rows="3" placeholder="Describe the rule violation…" />
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <button class="btn btn-primary" :disabled="issuing" @click="issueWarning">
          <i class="ti ti-alert-triangle" />
          {{ issuing ? 'Issuing…' : 'Issue warning' }}
        </button>
        <span v-if="issueSuccess" class="text-success" style="font-size:12px">
          <i class="ti ti-check" /> Warning issued and logged to Sheets
        </span>
        <span v-if="issueError" class="text-danger" style="font-size:12px">{{ issueError }}</span>
      </div>
    </div>

    <div v-if="tab === 'active'" class="card">
      <div class="card-header">
        <div class="card-title"><i class="ti ti-list" /> Active warnings</div>
        <button class="btn btn-sm" @click="openSheets('warnings')">
          <i class="ti ti-external-link" /> View in Sheets
        </button>
      </div>
      <WarningsTable :rows="active" :loading="loadingActive" @escalate="escalate" @expire="expire" />
    </div>

    <div v-if="tab === 'expired'" class="card">
      <div class="card-header">
        <div class="card-title"><i class="ti ti-history" /> Expired warnings</div>
        <button class="btn btn-sm" @click="openSheets('warnings')">
          <i class="ti ti-external-link" /> View in Sheets
        </button>
      </div>
      <WarningsTable :rows="expired" :loading="loadingExpired" expired />
    </div>

    <WarningLevels @add="onAddLevel" @edit="onEditLevel" />
  </AppLayout>
</template>

<script setup>
import { ref, defineAsyncComponent, onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import WarnBadge from '@/components/WarnBadge.vue'
import WarningLevels from '@/components/WarningLevels.vue'
import client from '@/api/client'

const tab = ref('issue')
const sheetsUrl = ref('https://sheets.google.com')

onMounted(async () => {
  try {
    const res = await client.get('/api/config/sheets-urls')
    if (res.data.warnings) sheetsUrl.value = res.data.warnings
  } catch { /* use fallback */ }
})

// ── Issue form ────────────────────────────────────────────────
const form = ref({ discord_id: '', username: '', level: '', reason: '' })
const issuing      = ref(false)
const issueSuccess = ref(false)
const issueError   = ref('')

async function issueWarning() {
  issueError.value   = ''
  issueSuccess.value = false

  if (!form.value.discord_id || !form.value.username || !form.value.level || !form.value.reason) {
    issueError.value = 'All fields are required.'
    return
  }

  issuing.value = true
  try {
    await client.post('/api/warnings', form.value)
    issueSuccess.value = true
    form.value = { discord_id: '', username: '', level: '', reason: '' }
    setTimeout(() => { issueSuccess.value = false }, 4000)
  } catch (err) {
    issueError.value = err.response?.data?.error || 'Failed to issue warning.'
  } finally {
    issuing.value = false
  }
}

// ── Active/expired lists ──────────────────────────────────────
const active         = ref([])
const expired        = ref([])
const loadingActive  = ref(false)
const loadingExpired = ref(false)

async function loadActive() {
  if (active.value.length) return
  loadingActive.value = true
  try {
    const res = await client.get('/api/warnings?expired=false')
    active.value = res.data
  } finally {
    loadingActive.value = false
  }
}

async function loadExpired() {
  if (expired.value.length) return
  loadingExpired.value = true
  try {
    const res = await client.get('/api/warnings?expired=true')
    expired.value = res.data
  } finally {
    loadingExpired.value = false
  }
}

async function escalate(warning) {
  await client.post(`/api/warnings/${warning.id}/escalate`)
  active.value = []
  loadActive()
}

async function expire(warning) {
  await client.post(`/api/warnings/${warning.id}/expire`)
  active.value = active.value.filter(w => w.id !== warning.id)
}

function openSheets(type) {
  window.open(sheetsUrl.value, '_blank')
}

function onAddLevel()  {}
function onEditLevel() {}
</script>

<script>
import { h } from 'vue'
import WarnBadge from '@/components/WarnBadge.vue'

const WarningsTable = {
  props: {
    rows:    { type: Array,   default: () => [] },
    loading: { type: Boolean, default: false },
    expired: { type: Boolean, default: false },
  },
  emits: ['escalate', 'expire'],
  setup(props, { emit }) {
    function initials(name = '') { return name.slice(0,2).toUpperCase() }
    function fmt(iso) {
      return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
    }
    return { initials, fmt, emit, props }
  },
  template: `
    <div v-if="props.loading" style="font-size:12px;color:var(--text-tertiary);padding:12px 0">Loading…</div>
    <div v-else-if="!props.rows.length" style="font-size:12px;color:var(--text-tertiary);padding:12px 0">No warnings found.</div>
    <table v-else class="data-table">
      <thead>
        <tr>
          <th style="width:18%">Display name</th>
          <th style="width:12%">Discord tag</th>
          <th style="width:7%">Level</th>
          <th style="width:32%">Reason</th>
          <th style="width:16%">Issued by</th>
          <th style="width:11%">Date</th>
          <th v-if="!props.expired" style="width:10%"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="w in props.rows" :key="w.id">
          <td>
            <div class="member-chip">
              <div class="member-avatar">{{ initials(w.member_display_name || w.username) }}</div>
              <span class="member-display">{{ w.member_display_name?.trim() || '—' }}</span>
            </div>
          </td>
          <td class="member-handle text-tertiary">@{{ w.username || '—' }}</td>
          <td><WarnBadge :level="w.level" /></td>
          <td class="text-secondary" style="white-space:normal;line-height:1.4">{{ w.reason }}</td>
          <td class="text-tertiary">{{ w.issued_by_name }}</td>
          <td class="text-tertiary">{{ fmt(w.issued_at) }}</td>
          <td v-if="!props.expired">
            <div style="display:flex;gap:5px">
              <button class="btn btn-sm" @click="emit('escalate', w)">Escalate</button>
              <button class="btn btn-sm btn-danger" @click="emit('expire', w)">Expire</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  `,
}
</script>

<style scoped>
.member-handle {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-display {
  font-size: 13px;
}
</style>