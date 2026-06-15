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

      <table v-else class="data-table">
        <thead>
          <tr>
            <th style="width:18%">Member</th>
            <th style="width:10%">Joined</th>
            <th style="width:14%">Rank / level</th>
            <th style="width:10%">Warning</th>
            <th style="width:18%">Prior warnings</th>
            <th style="width:14%">Restrictions</th>
            <th style="width:10%">Aliases</th>
            <th style="width:6%">Notes</th>
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
                  {{ initials(m.username) }}
                </div>
                {{ m.username }}
              </div>
            </td>
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
            <td class="text-secondary" style="font-size:11px">{{ m.aliases || '—' }}</td>
            <td>
              <button
                v-if="m.notes"
                class="btn btn-sm"
                :title="m.notes"
                style="font-size:11px"
              >
                <i class="ti ti-note" />
              </button>
              <span v-else class="text-tertiary">—</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div style="font-size:10px;color:var(--text-tertiary);margin-top:12px">
        Rank inferred from Discord roles. Level sourced from Arcane level-up announcements.
        Aliases and notes are managed directly in Google Sheets.
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
const search     = ref('')
const totalCount = ref(0)
const lastSynced = ref('—')

let searchTimer = null

onMounted(async () => {
  await Promise.all([loadMembers(), loadSyncStatus()])
})

async function loadMembers(q = '') {
  loading.value = true
  try {
    const res = await client.get('/api/members', { params: q ? { search: q } : {} })
    members.value  = res.data
    totalCount.value = res.data.length
  } finally {
    loading.value = false
  }
}

async function loadSyncStatus() {
  const res = await client.get('/api/members/sync/status')
  const d = new Date(res.data.last_synced_at)
  lastSynced.value = isNaN(d) ? 'Never' : d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
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
  window.open('https://sheets.google.com', '_blank')
  // TODO: actual link
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
</style>