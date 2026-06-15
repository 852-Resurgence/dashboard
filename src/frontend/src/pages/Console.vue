<template>
  <AppLayout title="Minecraft console" subtitle="Live server console via Crafty">
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="ti ti-terminal" /> Console</div>
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:12px;color:var(--text-secondary)">
            <span class="status-dot" :class="server.online ? 'online' : 'offline'" />
            {{ server.online ? `${server.players} / ${server.maxPlayers} players` : 'Offline' }}
          </span>
          <a :href="craftyUrl" target="_blank" class="btn btn-sm">
            <i class="ti ti-external-link" /> Open Crafty
          </a>
        </div>
      </div>

      <div class="console-box" ref="consoleBox">
        <div
          v-for="(line, i) in lines"
          :key="i"
          class="console-line"
          :class="lineClass(line)"
        >{{ line }}</div>
      </div>

      <div class="console-input-row">
        <input
          v-model="cmd"
          type="text"
          placeholder="Enter command… e.g. say Hello or ban buzzsaw99"
          @keydown.enter="sendCommand"
        />
        <button class="btn btn-primary" :disabled="sending" @click="sendCommand">
          <i class="ti ti-send" /> Send
        </button>
      </div>
    </div>
  </AppLayout>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import client from '@/api/client'

const craftyUrl = import.meta.env.VITE_CRAFTY_URL || 'http://localhost:8443'

const lines      = ref([])
const cmd        = ref('')
const sending    = ref(false)
const consoleBox = ref(null)
const server     = ref({ online: false, players: 0, maxPlayers: 0 })

let evtSource = null

onMounted(async () => {
  try {
    const res = await client.get('/api/console/status')
    server.value = res.data
  } catch { /* offline */ }

  // Open SSE stream for live console output
  evtSource = new EventSource('/api/console/stream', { withCredentials: true })
  evtSource.onmessage = (e) => {
    const { line } = JSON.parse(e.data)
    lines.value.push(line)
    // Keep buffer to last 500 lines
    if (lines.value.length > 500) lines.value.shift()
    scrollToBottom()
  }
  evtSource.onerror = () => {
    lines.value.push('[panel] Connection to console lost — reconnecting…')
  }
})

onUnmounted(() => {
  evtSource?.close()
})

async function sendCommand() {
  const command = cmd.value.trim()
  if (!command) return
  sending.value = true
  try {
    await client.post('/api/console/command', { command })
    lines.value.push(`> ${command}`)
    cmd.value = ''
    scrollToBottom()
  } catch (err) {
    lines.value.push(`[error] Failed to send command: ${err.response?.data?.error ?? err.message}`)
  } finally {
    sending.value = false
  }
}

async function scrollToBottom() {
  await nextTick()
  if (consoleBox.value) {
    consoleBox.value.scrollTop = consoleBox.value.scrollHeight
  }
}

function lineClass(line) {
  if (line.startsWith('[error]') || /ERROR/.test(line)) return 'line-error'
  if (/WARN/.test(line))  return 'line-warn'
  if (/INFO/.test(line))  return 'line-info'
  if (line.startsWith('>')) return 'line-cmd'
  return 'line-text'
}
</script>

<style scoped>
.console-box {
  background: #0a0c10;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  height: 360px;
  overflow-y: auto;
  margin-bottom: 10px;
}

.console-line {
  margin-bottom: 2px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.line-info  { color: #5dcaa5; }
.line-warn  { color: #ef9f27; }
.line-error { color: #f09595; }
.line-cmd   { color: #7f77dd; }
.line-text  { color: #aaa; }

.console-input-row {
  display: flex;
  gap: 8px;
}

.console-input-row input {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 12px;
}

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 5px;
}
.status-dot.online  { background: var(--text-success); }
.status-dot.offline { background: var(--text-danger); }
</style>