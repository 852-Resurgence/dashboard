<template>
  <AppLayout title="MediaWiki" subtitle="User management and wiki logs">
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat-card">
        <div class="stat-label">Recent log entries</div>
        <div class="stat-value">{{ logs.length }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Users created</div>
        <div class="stat-value">{{ createdCount }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Rights changes</div>
        <div class="stat-value">{{ rightsCount }}</div>
      </div>
    </div>

    <!-- Create user -->
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="ti ti-user-plus" /> Create user</div>
      </div>
      <div class="form-grid form-grid-2">
        <div class="form-group">
          <label class="form-label">Username</label>
          <input v-model="createForm.username" type="text" placeholder="WikiUsername" />
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input v-model="createForm.email" type="email" placeholder="user@example.com" />
        </div>
      </div>
      <div class="form-grid form-grid-2" style="margin-bottom:14px">
        <div class="form-group">
          <label class="form-label">Temporary password</label>
          <input v-model="createForm.password" type="password" placeholder="Auto-generate if blank" />
        </div>
        <div class="form-group">
          <label class="form-label">Initial group</label>
          <select v-model="createForm.group">
            <option value="">User (default)</option>
            <option value="autoconfirmed">Autoconfirmed</option>
            <option value="editor">Editor</option>
            <option value="sysop">Sysop (admin)</option>
            <option value="bureaucrat">Bureaucrat</option>
          </select>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <button class="btn btn-primary" :disabled="creating" @click="createUser">
          <i class="ti ti-user-plus" />
          {{ creating ? 'Creating…' : 'Create user' }}
        </button>
        <span v-if="createSuccess" class="text-success" style="font-size:12px">
          <i class="ti ti-check" /> User created successfully
        </span>
        <span v-if="createError" class="text-danger" style="font-size:12px">{{ createError }}</span>
      </div>
    </div>

    <!-- Manage permissions -->
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="ti ti-shield" /> Manage permissions</div>
      </div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr auto;gap:11px;align-items:end">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Username</label>
          <input v-model="rightsForm.username" type="text" placeholder="WikiUsername" />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">Set group to</label>
          <select v-model="rightsForm.group">
            <option value="user">User</option>
            <option value="autoconfirmed">Autoconfirmed</option>
            <option value="editor">Editor</option>
            <option value="sysop">Sysop</option>
            <option value="bureaucrat">Bureaucrat</option>
          </select>
        </div>
        <button class="btn btn-primary" :disabled="applyingRights" @click="applyRights">
          {{ applyingRights ? 'Applying…' : 'Apply' }}
        </button>
      </div>
      <div v-if="rightsSuccess" class="text-success" style="font-size:12px;margin-top:10px">
        <i class="ti ti-check" /> Permissions updated
      </div>
      <div v-if="rightsError" class="text-danger" style="font-size:12px;margin-top:10px">{{ rightsError }}</div>
    </div>

    <!-- Recent logs -->
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="ti ti-file-text" /> Recent wiki logs</div>
        <button class="btn btn-sm" @click="loadLogs">
          <i class="ti ti-refresh" />
        </button>
      </div>
      <div class="wiki-log">
        <div v-if="loadingLogs" class="empty">Loading…</div>
        <div v-else-if="!logs.length" class="empty">No log entries.</div>
        <div
          v-else
          v-for="entry in logs"
          :key="entry.ts + entry.action"
          class="log-row"
          :class="entry.type === 'delete' ? 'log-delete' : entry.type === 'rights' ? 'log-rights' : ''"
        >
          <span class="log-ts">{{ fmtTs(entry.ts) }}</span>
          <span class="log-body">
            <strong>{{ entry.user }}</strong>
            {{ actionLabel(entry) }}
            <em v-if="entry.title">{{ entry.title }}</em>
          </span>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import client from '@/api/client'

// ── Create user ───────────────────────────────────────────────
const createForm    = ref({ username: '', email: '', password: '', group: '' })
const creating      = ref(false)
const createSuccess = ref(false)
const createError   = ref('')

async function createUser() {
  createError.value   = ''
  createSuccess.value = false
  if (!createForm.value.username) { createError.value = 'Username is required.'; return }

  creating.value = true
  try {
    await client.post('/api/wiki/users', createForm.value)
    // If an initial group is set, apply it immediately after creation
    if (createForm.value.group) {
      await client.patch(`/api/wiki/users/${createForm.value.username}/groups`, {
        addGroups: [createForm.value.group],
      })
    }
    createSuccess.value = true
    createForm.value = { username: '', email: '', password: '', group: '' }
    setTimeout(() => { createSuccess.value = false }, 4000)
    loadLogs()
  } catch (err) {
    createError.value = err.response?.data?.error || 'Failed to create user.'
  } finally {
    creating.value = false
  }
}

// ── Rights management ─────────────────────────────────────────
const rightsForm    = ref({ username: '', group: 'user' })
const applyingRights = ref(false)
const rightsSuccess  = ref(false)
const rightsError    = ref('')

const ALL_GROUPS = ['user', 'autoconfirmed', 'editor', 'sysop', 'bureaucrat']

async function applyRights() {
  rightsError.value   = ''
  rightsSuccess.value = false
  if (!rightsForm.value.username) { rightsError.value = 'Username is required.'; return }

  applyingRights.value = true
  try {
    const addGroups    = [rightsForm.value.group]
    const removeGroups = ALL_GROUPS.filter(g => g !== rightsForm.value.group)
    await client.patch(`/api/wiki/users/${rightsForm.value.username}/groups`, {
      addGroups, removeGroups,
    })
    rightsSuccess.value = true
    setTimeout(() => { rightsSuccess.value = false }, 4000)
    loadLogs()
  } catch (err) {
    rightsError.value = err.response?.data?.error || 'Failed to update permissions.'
  } finally {
    applyingRights.value = false
  }
}

// ── Logs ──────────────────────────────────────────────────────
const logs       = ref([])
const loadingLogs = ref(false)

const createdCount = computed(() => logs.value.filter(e => e.type === 'newusers').length)
const rightsCount  = computed(() => logs.value.filter(e => e.type === 'rights').length)

onMounted(loadLogs)

async function loadLogs() {
  loadingLogs.value = true
  try {
    const res = await client.get('/api/wiki/logs', { params: { limit: 50 } })
    logs.value = res.data
  } catch { /* wiki may be unreachable */ }
  finally { loadingLogs.value = false }
}

function fmtTs(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function actionLabel(entry) {
  const map = {
    'newusers/create':      ' created account',
    'newusers/create2':     ' created account',
    'rights/rights':        ' changed rights for ',
    'delete/delete':        ' deleted ',
    'protect/protect':      ' protected ',
    'upload/upload':        ' uploaded ',
    'move/move':            ' moved ',
  }
  return map[`${entry.type}/${entry.action}`] ?? ` ${entry.action} `
}
</script>

<style scoped>
.wiki-log {
  background: var(--bg-raised);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  max-height: 280px;
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: 11px;
}

.log-row {
  display: flex;
  gap: 10px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border-subtle);
  line-height: 1.5;
}
.log-row:last-child { border-bottom: none; }

.log-ts   { color: var(--text-tertiary); flex-shrink: 0; }
.log-body { color: var(--text-secondary); flex: 1; }
.log-body strong { color: var(--text-primary); }

.log-delete { color: var(--text-danger); }
.log-rights .log-body { color: #a89dff; }

.empty { font-size: 12px; color: var(--text-tertiary); padding: 8px 0; }
</style>