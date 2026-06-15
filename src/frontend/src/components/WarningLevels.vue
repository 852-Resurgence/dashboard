<template>
  <div class="card">
    <div class="card-header">
      <div class="card-title"><i class="ti ti-adjustments" /> Warning level configuration</div>
      <button class="btn btn-sm btn-primary" @click="$emit('add')">
        <i class="ti ti-plus" /> Add level
      </button>
    </div>

    <div v-if="loading" class="empty">Loading configuration…</div>
    <div v-else-if="!levels.length" class="empty">
      No warning levels configured. Add one to get started.
    </div>

    <div v-else>
      <div v-for="lvl in levels" :key="lvl.level" class="level-row">
        <div class="level-num" :class="`lvl-${lvl.level.replace(/[^a-z0-9]/gi,'')}`">
          {{ lvl.level }}
        </div>
        <div class="level-info">
          <div class="level-name">{{ lvl.name }}</div>
          <div class="level-desc">{{ lvl.description }}</div>
          <div class="level-tags">
            <span v-if="lvl.send_dm"           class="tag">DM</span>
            <span v-if="lvl.post_mod_log"      class="tag">Mod log</span>
            <span v-if="lvl.restrict_channels" class="tag">Channel restrictions</span>
            <span v-if="lvl.ban_duration_days" class="tag">{{ lvl.ban_duration_days }}-day ban</span>
            <span v-if="lvl.indefinite_ban"    class="tag tag-warn">Indefinite ban</span>
            <span v-if="lvl.permanent_ban"     class="tag tag-danger">Permanent ban</span>
          </div>
        </div>
        <button class="btn btn-sm" style="margin-left:auto" @click="$emit('edit', lvl)">
          <i class="ti ti-edit" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import client from '@/api/client'

defineEmits(['add', 'edit'])

const levels  = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await client.get('/api/config/warning-levels')
    levels.value = res.data
  } catch {
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.level-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-subtle);
}
.level-row:last-child { border-bottom: none; }

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

.level-name { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.level-desc { font-size: 11px; color: var(--text-secondary); margin-top: 2px; line-height: 1.5; }
.level-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px; }
.tag {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 10px;
  background: var(--bg-raised);
  color: var(--text-secondary);
  border: 1px solid var(--border);
}
.tag-warn   { background: rgba(239,201,122,0.1); color: #efc97a; border-color: rgba(239,201,122,0.2); }
.tag-danger { background: rgba(226,75,74,0.1);   color: #e24b4a; border-color: rgba(226,75,74,0.2); }

.empty { font-size: 12px; color: var(--text-tertiary); padding: 8px 0; }
</style>