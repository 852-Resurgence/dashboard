<template>
  <div class="setup-wrap">
    <div class="setup-container">
      <header class="setup-header">
        <div class="setup-brand">
          <div class="setup-logo"><i class="ti ti-settings" /></div>
          <div>
            <h1>Initial setup</h1>
            <p>Configure warning levels, restriction channels, and panel role mappings.</p>
          </div>
        </div>

        <div v-if="!finished" class="step-bar">
          <button
            v-for="(label, i) in stepLabels"
            :key="label"
            class="step-item"
            :class="{ active: step === i + 1, done: step > i + 1 }"
            @click="goToStep(i + 1)"
          >
            <span class="step-num">{{ i + 1 }}</span>
            {{ label }}
          </button>
        </div>
      </header>

      <div v-if="loading" class="card setup-card">
        <div class="empty">Loading setup status…</div>
      </div>

      <div v-else-if="finished" class="card setup-card setup-done">
        <div class="done-icon"><i class="ti ti-circle-check" /></div>
        <h2>Setup complete</h2>
        <p>The panel is ready to use. Warning levels and role mappings are configured.</p>
        <button class="btn btn-primary" @click="goDashboard">
          <i class="ti ti-layout-dashboard" /> Go to dashboard
        </button>
      </div>

      <!-- Step 1: Warning levels -->
      <div v-else-if="step === 1" class="card setup-card">
        <div class="card-header">
          <div>
            <div class="card-title"><i class="ti ti-alert-triangle" /> Warning levels</div>
            <div class="card-desc">Define what happens at each warning level (0, 1, 2A, 2B, 3, 4).</div>
          </div>
          <button class="btn btn-sm" :disabled="seeding" @click="seedDefaults">
            <i class="ti ti-download" /> Load recommended defaults
          </button>
        </div>

        <div v-if="!levels.length" class="empty">
          No warning levels yet. Load the recommended defaults or add one manually.
        </div>

        <div v-else class="level-list">
          <div v-for="lvl in levels" :key="lvl.level" class="level-row">
            <div class="level-num" :class="`lvl-${lvl.level.replace(/[^a-z0-9]/gi,'')}`">{{ lvl.level }}</div>
            <div class="level-info">
              <div class="level-name">{{ lvl.name }}</div>
              <div class="level-desc">{{ lvl.description }}</div>
            </div>
            <button class="btn btn-sm btn-danger" @click="removeLevel(lvl.level)">
              <i class="ti ti-trash" />
            </button>
          </div>
        </div>

        <div class="inline-form">
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label">Level code</label>
              <select v-model="levelForm.level">
                <option value="">Select…</option>
                <option v-for="code in availableLevelCodes" :key="code" :value="code">{{ code }}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Display name</label>
              <input v-model="levelForm.name" type="text" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea v-model="levelForm.description" rows="2" />
          </div>
          <div class="checkbox-row">
            <label><input v-model="levelForm.send_dm" type="checkbox" /> Send DM</label>
            <label><input v-model="levelForm.post_mod_log" type="checkbox" /> Post to mod log</label>
            <label><input v-model="levelForm.restrict_channels" type="checkbox" /> Restrict channels</label>
            <label><input v-model="levelForm.indefinite_ban" type="checkbox" /> Indefinite ban</label>
            <label><input v-model="levelForm.permanent_ban" type="checkbox" /> Permanent ban</label>
          </div>
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label">Ban duration (days)</label>
              <input v-model.number="levelForm.ban_duration_days" type="number" min="0" />
            </div>
            <div class="form-group">
              <label class="form-label">Auto-expire (days)</label>
              <input v-model.number="levelForm.auto_expire_days" type="number" min="0" />
            </div>
          </div>
          <button class="btn btn-sm btn-primary" :disabled="savingLevel" @click="addLevel">
            <i class="ti ti-plus" /> Add level
          </button>
          <span v-if="levelError" class="text-danger form-error">{{ levelError }}</span>
        </div>
      </div>

      <!-- Step 2: Restriction channels -->
      <div v-else-if="step === 2" class="card setup-card">
        <div class="card-header">
          <div>
            <div class="card-title"><i class="ti ti-lock" /> Restriction channels</div>
            <div class="card-desc">Channels members lose access to when a level with channel restrictions is applied. Optional but recommended.</div>
          </div>
        </div>

        <div v-if="!channels.length" class="empty">No restriction channels configured yet.</div>
        <div v-else class="simple-list">
          <div v-for="ch in channels" :key="ch.channel_id" class="simple-row">
            <span><strong>#{{ ch.channel_name }}</strong> <span class="text-tertiary">{{ ch.channel_id }}</span></span>
            <button class="btn btn-sm btn-danger" @click="removeChannel(ch.channel_id)">
              <i class="ti ti-trash" />
            </button>
          </div>
        </div>

        <div class="inline-form">
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label">Channel name</label>
              <input v-model="channelForm.channel_name" type="text" placeholder="e.g. general" />
            </div>
            <div class="form-group">
              <label class="form-label">Channel ID</label>
              <input v-model="channelForm.channel_id" type="text" placeholder="Discord channel ID" />
            </div>
          </div>
          <button class="btn btn-sm btn-primary" :disabled="savingChannel" @click="addChannel">
            <i class="ti ti-plus" /> Add channel
          </button>
          <span v-if="channelError" class="text-danger form-error">{{ channelError }}</span>
        </div>
      </div>

      <!-- Step 3: Role mappings -->
      <div v-else-if="step === 3" class="card setup-card">
        <div class="card-header">
          <div>
            <div class="card-title"><i class="ti ti-shield" /> Panel role mappings</div>
            <div class="card-desc">Map Discord roles to panel permissions. At least one admin role is required.</div>
          </div>
        </div>

        <div v-if="!roles.length" class="empty">No role mappings yet. Add your admin and mod Discord roles.</div>
        <div v-else class="simple-list">
          <div v-for="role in roles" :key="role.role_id" class="simple-row">
            <span>
              <strong>{{ role.role_name }}</strong>
              <span class="role-badge" :class="role.permission">{{ role.permission }}</span>
              <span class="text-tertiary">{{ role.role_id }}</span>
            </span>
            <button class="btn btn-sm btn-danger" @click="removeRole(role.role_id)">
              <i class="ti ti-trash" />
            </button>
          </div>
        </div>

        <div class="inline-form">
          <div class="form-grid form-grid-2">
            <div class="form-group">
              <label class="form-label">Role name</label>
              <input v-model="roleForm.role_name" type="text" placeholder="e.g. Moderator" />
            </div>
            <div class="form-group">
              <label class="form-label">Role ID</label>
              <input v-model="roleForm.role_id" type="text" placeholder="Discord role ID" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Permission level</label>
            <select v-model="roleForm.permission">
              <option value="admin">Admin</option>
              <option value="mod">Moderator</option>
            </select>
          </div>
          <button class="btn btn-sm btn-primary" :disabled="savingRole" @click="addRole">
            <i class="ti ti-plus" /> Add role mapping
          </button>
          <span v-if="roleError" class="text-danger form-error">{{ roleError }}</span>
        </div>
      </div>

      <footer v-if="!loading && !finished" class="setup-footer">
        <button v-if="step > 1" class="btn" @click="step--">Back</button>
        <div class="setup-footer-right">
          <span class="setup-status text-tertiary">
            {{ status.warningLevels }} levels · {{ status.channelsSet }} channels · {{ status.rolesMapped }} roles
          </span>
          <button v-if="step < 3" class="btn btn-primary" @click="step++">Continue</button>
          <button v-else class="btn btn-primary" :disabled="!canFinish" @click="finishSetup">
            <i class="ti ti-check" /> Finish setup
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import client from '@/api/client'

const router = useRouter()

const stepLabels = ['Warning levels', 'Restriction channels', 'Role mappings']
const ALL_LEVEL_CODES = ['0', '1', '2A', '2B', '3', '4']

const DEFAULT_LEVELS = [
  { level: '0', name: 'Informal warning', description: 'Verbal or written notice with no further action.', send_dm: true, post_mod_log: false, restrict_channels: false, ban_duration_days: null, indefinite_ban: false, permanent_ban: false, auto_expire_days: 90 },
  { level: '1', name: 'Formal warning', description: 'Official record; may restrict channels.', send_dm: true, post_mod_log: true, restrict_channels: true, ban_duration_days: null, indefinite_ban: false, permanent_ban: false, auto_expire_days: 180 },
  { level: '2A', name: '14-day ban', description: 'Temporary ban for 14 days.', send_dm: true, post_mod_log: true, restrict_channels: false, ban_duration_days: 14, indefinite_ban: false, permanent_ban: false, auto_expire_days: null },
  { level: '2B', name: '30-day ban', description: 'Temporary ban for 30 days.', send_dm: true, post_mod_log: true, restrict_channels: false, ban_duration_days: 30, indefinite_ban: false, permanent_ban: false, auto_expire_days: null },
  { level: '3', name: 'Indefinite ban', description: 'Indefinite ban; appealable after 6 months.', send_dm: true, post_mod_log: true, restrict_channels: false, ban_duration_days: null, indefinite_ban: true, permanent_ban: false, appeal_after_days: 180, auto_expire_days: null },
  { level: '4', name: 'Permanent ban', description: 'Permanent non-appealable ban.', send_dm: true, post_mod_log: true, restrict_channels: false, ban_duration_days: null, indefinite_ban: false, permanent_ban: true, auto_expire_days: null },
]

const loading = ref(true)
const finished = ref(false)
const step = ref(1)
const status = ref({ complete: false, warningLevels: 0, rolesMapped: 0, channelsSet: 0 })

const levels = ref([])
const channels = ref([])
const roles = ref([])

const seeding = ref(false)
const savingLevel = ref(false)
const savingChannel = ref(false)
const savingRole = ref(false)
const levelError = ref('')
const channelError = ref('')
const roleError = ref('')

const levelForm = ref(emptyLevelForm())
const channelForm = ref({ channel_id: '', channel_name: '' })
const roleForm = ref({ role_id: '', role_name: '', permission: 'admin' })

const availableLevelCodes = computed(() =>
  ALL_LEVEL_CODES.filter(code => !levels.value.some(l => l.level === code))
)

const canFinish = computed(() =>
  status.value.warningLevels > 0 && status.value.rolesMapped > 0
)

function emptyLevelForm() {
  return {
    level: '',
    name: '',
    description: '',
    send_dm: true,
    post_mod_log: false,
    restrict_channels: false,
    ban_duration_days: null,
    indefinite_ban: false,
    permanent_ban: false,
    auto_expire_days: null,
  }
}

function boolToInt(obj) {
  return {
    ...obj,
    send_dm: obj.send_dm ? 1 : 0,
    post_mod_log: obj.post_mod_log ? 1 : 0,
    restrict_channels: obj.restrict_channels ? 1 : 0,
    indefinite_ban: obj.indefinite_ban ? 1 : 0,
    permanent_ban: obj.permanent_ban ? 1 : 0,
    ban_duration_days: obj.ban_duration_days || null,
    auto_expire_days: obj.auto_expire_days || null,
    appeal_after_days: obj.appeal_after_days || null,
  }
}

onMounted(async () => {
  await refreshAll()
  if (status.value.complete) finished.value = true
  loading.value = false
})

async function refreshAll() {
  const [statusRes, levelsRes, channelsRes, rolesRes] = await Promise.all([
    client.get('/api/config/setup-status'),
    client.get('/api/config/warning-levels'),
    client.get('/api/config/restriction-channels'),
    client.get('/api/config/roles'),
  ])
  status.value = statusRes.data
  levels.value = levelsRes.data
  channels.value = channelsRes.data
  roles.value = rolesRes.data
}

function goToStep(n) {
  if (n <= step.value || n === step.value + 1) step.value = n
}

async function seedDefaults() {
  seeding.value = true
  levelError.value = ''
  try {
    for (const preset of DEFAULT_LEVELS) {
      if (levels.value.some(l => l.level === preset.level)) continue
      await client.post('/api/config/warning-levels', boolToInt(preset))
    }
    await refreshAll()
  } catch (err) {
    levelError.value = err.response?.data?.error || 'Failed to load defaults.'
  } finally {
    seeding.value = false
  }
}

async function addLevel() {
  levelError.value = ''
  if (!levelForm.value.level || !levelForm.value.name || !levelForm.value.description) {
    levelError.value = 'Level code, name and description are required.'
    return
  }
  savingLevel.value = true
  try {
    await client.post('/api/config/warning-levels', boolToInt(levelForm.value))
    levelForm.value = emptyLevelForm()
    await refreshAll()
  } catch (err) {
    levelError.value = err.response?.data?.error || 'Failed to add level.'
  } finally {
    savingLevel.value = false
  }
}

async function removeLevel(level) {
  await client.delete(`/api/config/warning-levels/${level}`)
  await refreshAll()
}

async function addChannel() {
  channelError.value = ''
  if (!channelForm.value.channel_id || !channelForm.value.channel_name) {
    channelError.value = 'Channel ID and name are required.'
    return
  }
  savingChannel.value = true
  try {
    await client.post('/api/config/restriction-channels', channelForm.value)
    channelForm.value = { channel_id: '', channel_name: '' }
    await refreshAll()
  } catch (err) {
    channelError.value = err.response?.data?.error || 'Failed to add channel.'
  } finally {
    savingChannel.value = false
  }
}

async function removeChannel(channelId) {
  await client.delete(`/api/config/restriction-channels/${channelId}`)
  await refreshAll()
}

async function addRole() {
  roleError.value = ''
  if (!roleForm.value.role_id || !roleForm.value.role_name) {
    roleError.value = 'Role ID and name are required.'
    return
  }
  savingRole.value = true
  try {
    await client.post('/api/config/roles', roleForm.value)
    roleForm.value = { role_id: '', role_name: '', permission: 'admin' }
    await refreshAll()
  } catch (err) {
    roleError.value = err.response?.data?.error || 'Failed to add role.'
  } finally {
    savingRole.value = false
  }
}

async function removeRole(roleId) {
  await client.delete(`/api/config/roles/${roleId}`)
  await refreshAll()
}

async function finishSetup() {
  await refreshAll()
  if (!canFinish.value) return
  finished.value = true
}

function goDashboard() {
  router.push('/')
}
</script>

<style scoped>
.setup-wrap {
  min-height: 100vh;
  background: var(--bg-base);
  padding: 32px 20px 48px;
}

.setup-container {
  max-width: 760px;
  margin: 0 auto;
}

.setup-header {
  margin-bottom: 20px;
}

.setup-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}

.setup-logo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #fff;
}

.setup-header h1 {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.setup-header p {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.step-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.step-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  font-size: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
}

.step-item.active {
  border-color: var(--accent);
  color: var(--text-primary);
  background: var(--bg-active);
}

.step-item.done {
  color: var(--text-success);
}

.step-num {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--bg-raised);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
}

.setup-card {
  margin-bottom: 14px;
}

.card-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 3px;
}

.inline-form {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.checkbox-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.checkbox-row input {
  width: auto;
  margin-right: 5px;
}

.form-error {
  display: block;
  font-size: 11px;
  margin-top: 8px;
}

.level-list, .simple-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.level-row, .simple-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.level-row:last-child, .simple-row:last-child {
  border-bottom: none;
}

.level-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.lvl-0  { background: rgba(144,144,144,0.15); color: #909090; }
.lvl-1  { background: rgba(239,201,122,0.15); color: #efc97a; }
.lvl-2A { background: rgba(240,149,149,0.15); color: #f09595; }
.lvl-2B { background: rgba(226,75,74,0.15);  color: #e24b4a; }
.lvl-3  { background: rgba(163,45,45,0.2);   color: #e07070; }
.lvl-4  { background: rgba(30,30,30,0.6);    color: #888; }

.level-name { font-size: 13px; font-weight: 500; }
.level-desc { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
.level-info { flex: 1; }

.simple-row .role-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  margin: 0 6px;
}
.simple-row .role-badge.admin { background: rgba(83,73,200,0.2); color: #a89dff; }
.simple-row .role-badge.mod   { background: rgba(126,203,126,0.15); color: #7ecb7e; }

.setup-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.setup-footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.setup-status {
  font-size: 11px;
}

.setup-done {
  text-align: center;
  padding: 40px 24px;
}

.done-icon {
  font-size: 42px;
  color: var(--text-success);
  margin-bottom: 12px;
}

.setup-done h2 {
  font-size: 18px;
  margin-bottom: 8px;
}

.setup-done p {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 20px;
}

.empty {
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 8px 0;
}
</style>
