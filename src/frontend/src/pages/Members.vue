<template>
  <AppLayout title="Member list" subtitle="Manage and sync server members">

    <div class="card" style="padding:14px 18px;margin-bottom:14px">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px">
        <div>
          <div style="font-size:13px;font-weight:500">{{ totalCount }} members</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">
            Last synced {{ lastSynced }} · Weekly on Sundays
          </div>
        </div>
        <div style="display:flex;gap:7px;flex-shrink:0">
          <button class="btn btn-sm" @click="openSheets">
            <i class="ti ti-external-link" /> Open Sheets
          </button>
          <button class="btn btn-sm btn-primary" :disabled="syncing" @click="syncNow">
            <i class="ti ti-refresh" /> {{ syncing ? 'Syncing…' : 'Sync now' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="saveError" class="save-error">{{ saveError }}</div>

    <div class="edit-hint">
      <i class="ti ti-pencil" />
      Aliases and notes are editable below — scroll right if you don’t see those columns. Changes save when you click away.
    </div>

    <div class="card">
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="card-title"><i class="ti ti-users" /> Member list</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            <RankBadge v-for="r in RANKS" :key="r" :rank="r" />
          </div>
        </div>
        <input
          v-model="search"
          type="text"
          placeholder="Search…"
          style="width:160px"
          @input="debouncedSearch"
        />
      </div>

      <div v-if="loading" class="empty">Loading members…</div>
      <div v-else-if="!members.length" class="empty">No members found.</div>

      <div v-else class="table-scroll">
      <table class="data-table members-table">
        <thead>
          <tr>
            <th style="width:14%">Display name</th>
            <th style="width:12%">Discord tag</th>
            <th style="width:8%">Joined</th>
            <th style="width:11%">Rank / level</th>
            <th style="width:8%">Warning</th>
            <th style="width:14%">Prior warnings</th>
            <th style="width:11%">Restrictions</th>
            <th style="width:12%">
              <span class="editable-col"><i class="ti ti-pencil" /> Aliases</span>
            </th>
            <th style="width:10%">
              <span class="editable-col"><i class="ti ti-pencil" /> Notes</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in members"
            :key="m.discord_id"
            :style="rankRowStyle(m.rank)"
          >
            <td>
              <div class="member-chip">
                <div class="member-avatar" :style="rankAvatarStyle(m.rank)">
                  {{ avatarInitials(m) }}
                </div>
                <span class="member-display">{{ displayName(m) }}</span>
              </div>
            </td>
            <td class="member-handle text-tertiary">@{{ m.username || '—' }}</td>
            <td class="text-tertiary">{{ fmt(m.joined_at) }}</td>
            <td><RankBadge :rank="m.rank" :level="m.arcane_level" /></td>
            <td><WarnBadge :level="m.current_warning_level" /></td>
            <td>
              <div style="display:flex;gap:3px;flex-wrap:wrap">
                <WarnBadge
                  v-for="(lvl, i) in parsePriorWarnings(m.prior_warning_levels)"
                  :key="i"
                  :level="lvl"
                />
                <span v-if="!parsePriorWarnings(m.prior_warning_levels).length" class="text-tertiary">—</span>
              </div>
            </td>
            <td>
              <span v-if="m.active_restrictions" class="text-warning" style="font-size:11px">
                {{ parseRestrictions(m.active_restrictions) }}
              </span>
              <span v-else class="text-tertiary">—</span>
            </td>
            <td class="editable-cell">
              <input
                v-model="m.aliases"
                type="text"
                class="cell-input"
                placeholder="Add aliases…"
                :disabled="savingId === m.discord_id"
                @blur="saveMember(m)"
                @keydown.enter="$event.target.blur()"
              />
            </td>
            <td class="editable-cell">
              <textarea
                v-model="m.notes"
                class="cell-input cell-textarea"
                placeholder="Add notes…"
                rows="2"
                :disabled="savingId === m.discord_id"
                @blur="saveMember(m)"
              />
            </td>
          </tr>
        </tbody>
      </table>
      </div>

      <div style="font-size:10px;color:var(--text-tertiary);margin-top:12px">
        Rank inferred from Discord roles. Level sourced from Arcane level-up announcements.
        Click aliases or notes to edit — saves when you click away. Syncs to Google Sheets.
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import RankBadge from '@/components/RankBadge.vue'
import WarnBadge from '@/components/WarnBadge.vue'
import client from '@/api/client'

const RANKS = ['staff','luminary','prestige','vice','senator','dignitary','attache','citizen']

const RANK_COLOURS = {
  staff:     import.meta.env.VITE_COLOR_STAFF     || '#f4a9ff',
  luminary:  import.meta.env.VITE_COLOR_LUMINARY  || '#8fc7c8',
  prestige:  import.meta.env.VITE_COLOR_PRESTIGE  || '#ffd700',
  vice:      import.meta.env.VITE_COLOR_VICE      || '#eb22ff',
  senator:   import.meta.env.VITE_COLOR_SENATOR   || '#009e60',
  dignitary: import.meta.env.VITE_COLOR_DIGNITARY || '#fe0000',
  attache:   import.meta.env.VITE_COLOR_ATTACHE   || '#ff02a3',
  citizen:   import.meta.env.VITE_COLOR_CITIZEN   || '#ff8a00',
}

const members    = ref([])
const loading    = ref(true)
const syncing    = ref(false)
const savingId   = ref(null)
const saveError  = ref('')
const search     = ref('')
const totalCount = ref(0)
const lastSynced = ref('—')
const sheetsUrl  = ref('https://sheets.google.com')
const lastSaved  = ref({})

let searchTimer = null

onMounted(async () => {
  await Promise.all([loadMembers(), loadSyncStatus(), loadSheetsUrl()])
})

async function loadMembers(q = '') {
  loading.value = true
  try {
    const res = await client.get('/api/members', { params: q ? { search: q } : {} })
    members.value = res.data.map(row => ({
      ...row,
      aliases: row.aliases ?? '',
      notes: row.notes ?? '',
    }))
    for (const row of members.value) {
      lastSaved.value[row.discord_id] = {
        aliases: row.aliases ?? '',
        notes: row.notes ?? '',
      }
    }
    if (!q) totalCount.value = res.data.length
  } finally {
    loading.value = false
  }
}

async function loadSyncStatus() {
  const res = await client.get('/api/members/sync/status')
  totalCount.value = res.data.member_count ?? 0
  const d = new Date(res.data.last_synced_at)
  lastSynced.value = isNaN(d) ? 'Never' : d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
}

async function loadSheetsUrl() {
  try {
    const res = await client.get('/api/config/sheets-urls')
    if (res.data.members) sheetsUrl.value = res.data.members
  } catch { /* use fallback */ }
}

async function saveMember(member) {
  const saved = lastSaved.value[member.discord_id] ?? { aliases: '', notes: '' }
  const aliases = member.aliases ?? ''
  const notes = member.notes ?? ''
  if (aliases === saved.aliases && notes === saved.notes) return

  savingId.value = member.discord_id
  saveError.value = ''
  try {
    const res = await client.patch(`/api/members/${member.discord_id}`, { aliases, notes })
    member.aliases = res.data.aliases ?? ''
    member.notes = res.data.notes ?? ''
    lastSaved.value[member.discord_id] = { aliases: member.aliases, notes: member.notes }
    if (res.data.sheets_synced === false) {
      saveError.value = res.data.sheets_error
        ? `Saved in panel, but Google Sheets sync failed: ${res.data.sheets_error}`
        : 'Saved in panel, but Google Sheets sync failed.'
    }
  } catch (err) {
    member.aliases = saved.aliases
    member.notes = saved.notes
    saveError.value = err.response?.data?.error || 'Failed to save aliases/notes'
  } finally {
    savingId.value = null
  }
}

function debouncedSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadMembers(search.value), 300)
}

async function syncNow() {
  syncing.value = true
  try {
    await client.post('/api/members/sync')
    await loadSyncStatus()
    await loadMembers(search.value)
  } finally {
    syncing.value = false
  }
}

function openSheets() {
  window.open(sheetsUrl.value, '_blank')
}

function rankRowStyle(rank) {
  const colour = RANK_COLOURS[rank]
  if (!colour) return {}
  return { background: `${colour}09` }
}

function rankAvatarStyle(rank) {
  const colour = RANK_COLOURS[rank]
  if (!colour) return {}
  return { background: `${colour}20`, color: colour, borderColor: `${colour}40` }
}

function initials(name = '') { return name.slice(0, 2).toUpperCase() }

function displayName(member) {
  const name = member.display_name?.trim()
  return name || '—'
}

function avatarInitials(member) {
  const name = member.display_name?.trim() || member.username?.trim()
  return initials(name)
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
}

function parsePriorWarnings(str) {
  if (!str) return []
  return str.split(',').map(s => s.trim()).filter(Boolean)
}

function parseRestrictions(str) {
  if (!str) return ''
  try {
    const arr = JSON.parse(str)
    return arr.length > 1 ? `${arr.length} channels` : '1 channel'
  } catch {
    return str
  }
}
</script>

<style scoped>
.empty { font-size: 12px; color: var(--text-tertiary); padding: 12px 0; }

.edit-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(143, 199, 200, 0.08);
  border: 1px solid rgba(143, 199, 200, 0.22);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  margin-bottom: 12px;
}

.edit-hint i {
  color: var(--accent);
  margin-top: 1px;
  flex-shrink: 0;
}

.table-scroll {
  overflow-x: auto;
  margin: 0 -4px;
  padding: 0 4px 4px;
}

.members-table {
  min-width: 1100px;
}

.save-error {
  font-size: 12px;
  color: var(--text-danger);
  background: rgba(240, 149, 149, 0.1);
  border: 1px solid rgba(240, 149, 149, 0.25);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  margin-bottom: 12px;
}

.cell-input {
  width: 100%;
  padding: 6px 8px;
  font-size: 11px;
  min-width: 0;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.cell-input:focus {
  border-color: var(--accent);
  outline: none;
}

.cell-input:disabled {
  opacity: 0.6;
}

.cell-textarea {
  min-height: 44px;
  resize: vertical;
  line-height: 1.4;
}

.editable-col {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
}

.editable-col i {
  font-size: 11px;
  color: var(--accent);
}

.editable-cell {
  vertical-align: top;
  min-width: 100px;
}

.cell-readonly {
  font-size: 11px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-display {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-handle {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
