<template>
  <span class="warn-badge" :class="`level-${safeLevel}`">{{ level ?? '—' }}</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  level: { type: String, default: null }, // '0', '1', '2A', '2B', '3', '4'
})

const safeLevel = computed(() => props.level?.replace(/[^a-z0-9]/gi, '') ?? 'none')
</script>

<style scoped>
.warn-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
  display: inline-block;
  white-space: nowrap;
}
.level-none { background: var(--bg-raised); color: var(--text-tertiary); }
.level-0  { background: rgba(144,144,144,0.15); color: #909090; }
.level-1  { background: rgba(239,201,122,0.15); color: #efc97a; }
.level-2A { background: rgba(240,149,149,0.15); color: #f09595; }
.level-2B { background: rgba(226,75,74,0.15);  color: #e24b4a; }
.level-3  { background: rgba(163,45,45,0.2);   color: #e07070; }
.level-4  { background: rgba(30,30,30,0.6);    color: #888; border: 1px solid #333; }
</style>