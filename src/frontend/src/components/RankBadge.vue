<template>
  <span class="rank-badge" :style="badgeStyle">{{ label }}</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  rank:  { type: String, default: null },  // e.g. 'citizen', 'senator'
  level: { type: Number, default: null },
})

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

const colour = computed(() => RANK_COLOURS[props.rank] ?? '#5a6070')

const label = computed(() => {
  if (!props.rank) return '—'
  const name = props.rank.charAt(0).toUpperCase() + props.rank.slice(1)
  return props.level != null ? `${name} · ${props.level}` : name
})

const badgeStyle = computed(() => ({
  background: `${colour.value}18`,
  color: colour.value,
  border: `1px solid ${colour.value}40`,
}))
</script>

<style scoped>
.rank-badge {
  font-size: 10px;
  padding: 2px 9px;
  border-radius: 10px;
  font-weight: 500;
  display: inline-block;
  white-space: nowrap;
}
</style>