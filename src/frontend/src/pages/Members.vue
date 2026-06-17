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

    <div class="card members-card">
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

      <div class="members-layout">
        <div class="members-list">
          <div v-if="loading" class="empty">Loading members…</div>
          <div v-else-if="!members.length" class="empty">No members found.</div>

          <div v-else class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Display name</th>
                  <th>Discord tag</th>
                  <th>Joined</th>
                  <th>Rank / level</th>
                  <th>Warning</th>
                  <th>Prior warnings</th>
                  <th>Restrictions</th>
                  <th style="width:36px" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="m in members"
                  :key="m.discord_id"
                  class="member-row"
                  :class="{ selected: selectedId === m.discord_id }"
                  :style="rankRowStyle(m.rank)"
                  @click="selectMember(m)"
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
                  <td class="meta-cell">
                    <span v-if="m.has_aliases || m.has_notes" class="meta-dot" title="Has aliases or notes" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <aside class="member-detail">
          <div class="detail-panel-title">
            <i class="ti ti-pencil" /> Aliases &amp; notes
          </div>

          <div v-if="selected" class="detail-header">
            <div class="member-chip">
              <div class="member-avatar" :style="rankAvatarStyle(selected.rank)">
                {{ avatarInitials(selected) }}
              </div>
              <div>
                <div class="detail-name">{{ displayName(selected) }}</div>
                <div class="detail-tag text-tertiary">@{{ selected.username || '—' }}</div>
              </div>
            </div>
            <button class="btn btn-sm detail-close" title="Clear selection" @click="closeDetail">
              <i class="ti ti-x" />
            </button>
          </div>

          <p v-else class="detail-hint">Select a member from the list to edit their aliases and notes.</p>

          <div v-if="selected && detailLoading" class="detail-loading">Loading member…</div>

          <div v-if="selected" class="detail-meta">
            <RankBadge :rank="selected.rank" :level="selected.arcane_level" />
            <span class="text-tertiary">Joined {{ fmt(selected.joined_at) }}</span>
          </div>

          <div class="form-group">
            <label class="form-label">Aliases</label>
            <input
              v-model="draft.aliases"
              type="text"
              placeholder="Add aliases…"
              :disabled="!selectedId || saving || detailLoading"
              @keydown.enter="saveDraft"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea
              v-model="draft.notes"
              rows="6"
              placeholder="Add notes…"
              :disabled="!selectedId || saving || detailLoading"
            />
          </div>

          <div class="detail-actions">
            <button
              class="btn btn-primary btn-sm"
              :disabled="!selectedId || saving || detailLoading || !isDirty"
              @click="saveDraft"
            >
              <i class="ti ti-device-floppy" /> {{ saving ? 'Saving…' : 'Save' }}
            </button>
            <span v-if="saveOk" class="text-success detail-status">
              <i class="ti ti-check" /> Saved
            </span>
          </div>
        </aside>
      </div>

      <div class="footer-note">
        Rank inferred from Discord roles. Level sourced from Arcane level-up announcements.
        Click a row to load that member’s aliases and notes into the panel on the right.
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
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

const members       = ref([])
const loading       = ref(true)
const syncing       = ref(false)
const saving        = ref(false)
const saveError     = ref('')
const saveOk        = ref(false)
const search        = ref('')
const totalCount    = ref(0)
const lastSynced    = ref('—')
const sheetsUrl     = ref('https://sheets.google.com')
const selectedId    = ref(null)
const selected      = ref(null)
const detailLoading = ref(false)
const draft         = reactive({ aliases: '', notes: '' })
const savedDraft    = reactive({ aliases: '', notes: '' })

const isDirty = computed(() =>
  draft.aliases !== savedDraft.aliases || draft.notes !== savedDraft.notes
)

let searchTimer = null
let saveOkTimer = null

onMounted(async () => {
  await Promise.all([loadMembers(), loadSyncStatus(), loadSheetsUrl()])
})

async function loadMembers(q = '') {
  loading.value = true
  try {
    const params = { summary: 1 }
    if (q) params.search = q
    const res = await client.get('/api/members', { params })
    members.value = res.data
    if (!q) totalCount.value = res.data.length

    if (selectedId.value && !members.value.some(m => m.discord_id === selectedId.value)) {
      closeDetail()
    }
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

async function selectMember(member) {
  if (selectedId.value === member.discord_id) return

  if (selectedId.value && isDirty.value) {
    const ok = await saveDraft({ silent: true })
    if (!ok) return
  }

  saveError.value = ''
  saveOk.value = false
  selectedId.value = member.discord_id
  selected.value = member
  detailLoading.value = true
  draft.aliases = ''
  draft.notes = ''
  savedDraft.aliases = ''
  savedDraft.notes = ''

  try {
    const res = await client.get(`/api/members/${member.discord_id}`)
    selected.value = { ...member, ...res.data }
    draft.aliases = res.data.aliases ?? ''
    draft.notes = res.data.notes ?? ''
    savedDraft.aliases = draft.aliases
    savedDraft.notes = draft.notes
  } catch (err) {
    saveError.value = err.response?.data?.error || 'Failed to load member details'
    closeDetail()
  } finally {
    detailLoading.value = false
  }
}

async function closeDetail() {
  if (selectedId.value && isDirty.value) {
    await saveDraft({ silent: true })
  }
  selectedId.value = null
  selected.value = null
  draft.aliases = ''
  draft.notes = ''
  savedDraft.aliases = ''
  savedDraft.notes = ''
}

async function saveDraft({ silent = false } = {}) {
  if (!selectedId.value || !isDirty.value) return true

  saving.value = true
  if (!silent) saveError.value = ''
  saveOk.value = false

  try {
    const res = await client.patch(`/api/members/${selectedId.value}`, {
      aliases: draft.aliases,
      notes: draft.notes,
    })

    draft.aliases = res.data.aliases ?? ''
    draft.notes = res.data.notes ?? ''
    savedDraft.aliases = draft.aliases
    savedDraft.notes = draft.notes

    const row = members.value.find(m => m.discord_id === selectedId.value)
    if (row) {
      row.has_aliases = !!draft.aliases
      row.has_notes = !!draft.notes
    }

    if (res.data.sheets_synced === false) {
      saveError.value = res.data.sheets_error
        ? `Saved in panel, but Google Sheets sync failed: ${res.data.sheets_error}`
        : 'Saved in panel, but Google Sheets sync failed.'
    } else if (!silent) {
      saveOk.value = true
      clearTimeout(saveOkTimer)
      saveOkTimer = setTimeout(() => { saveOk.value = false }, 2500)
    }
    return true
  } catch (err) {
    if (!silent) {
      saveError.value = err.response?.data?.error || 'Failed to save aliases/notes'
    }
    return false
  } finally {
    saving.value = false
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
    if (selectedId.value) {
      const id = selectedId.value
      selectedId.value = null
      const row = members.value.find(m => m.discord_id === id)
      if (row) await selectMember(row)
    }
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
  if (!member) return '—'
  const name = member.display_name?.trim()
  return name || '—'
}

function avatarInitials(member) {
  if (!member) return '??'
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

.save-error {
  font-size: 12px;
  color: var(--text-danger);
  background: rgba(240, 149, 149, 0.1);
  border: 1px solid rgba(240, 149, 149, 0.25);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  margin-bottom: 12px;
}

.members-card {
  padding-bottom: 12px;
}

.members-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}

.members-list {
  min-width: 0;
}

.table-scroll {
  overflow-x: auto;
}

.member-row {
  cursor: pointer;
}

.member-row.selected {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.meta-cell {
  text-align: center;
  padding-left: 4px;
  padding-right: 4px;
}

.meta-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.75;
}

.member-detail {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-raised);
  padding: 14px;
  min-height: 280px;
  position: sticky;
  top: 0;
}

.detail-panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.detail-panel-title i {
  color: var(--accent);
}

.detail-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin: 0 0 12px;
  line-height: 1.45;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.detail-name {
  font-size: 14px;
  font-weight: 600;
}

.detail-tag {
  font-size: 11px;
  margin-top: 2px;
}

.detail-close {
  flex-shrink: 0;
}

.detail-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  font-size: 11px;
}

.detail-loading {
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 20px 0;
}

.form-group {
  margin-bottom: 12px;
}

.form-label {
  display: block;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 8px 10px;
  font-size: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.form-group input:focus,
.form-group textarea:focus {
  border-color: var(--accent);
  outline: none;
}

.form-group input:disabled,
.form-group textarea:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.detail-status {
  font-size: 11px;
}

.footer-note {
  font-size: 10px;
  color: var(--text-tertiary);
  margin-top: 12px;
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

@media (max-width: 960px) {
  .members-layout {
    grid-template-columns: 1fr;
  }

  .member-detail {
    position: static;
  }
}
</style>
