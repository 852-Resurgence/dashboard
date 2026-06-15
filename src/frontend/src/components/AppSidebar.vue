<template>
  <aside class="sidebar">
    <div class="sidebar-logo">
      <div class="server-name">Staff portal</div>
      <div class="server-sub">852 Resurgence</div>
    </div>

    <div class="sidebar-user">
      <div class="user-avatar">{{ initials }}</div>
      <div>
        <div class="user-name">{{ auth.user?.username }}</div>
        <span class="role-badge" :class="auth.user?.role">{{ auth.user?.role }}</span>
      </div>
    </div>

    <nav>
      <div class="nav-section">Overview</div>
      <RouterLink class="nav-item" to="/" exact-active-class="active">
        <i class="ti ti-layout-dashboard" /> Dashboard
      </RouterLink>

      <div class="nav-section">Moderation</div>
      <RouterLink class="nav-item" to="/warnings" active-class="active">
        <i class="ti ti-alert-triangle" /> Warnings
      </RouterLink>

      <div class="nav-section">Members</div>
      <RouterLink class="nav-item" to="/members" active-class="active">
        <i class="ti ti-users" /> Member list
      </RouterLink>

      <div class="nav-section">Server</div>
      <RouterLink class="nav-item" to="/console" active-class="active">
        <i class="ti ti-terminal" /> Minecraft console
      </RouterLink>

      <div class="nav-section">Bot</div>
      <RouterLink class="nav-item" to="/logs" active-class="active">
        <i class="ti ti-brand-discord" /> Bot logs
      </RouterLink>

      <div class="nav-section">Wiki</div>
      <RouterLink class="nav-item" to="/wiki" active-class="active">
        <i class="ti ti-book" /> MediaWiki
      </RouterLink>
    </nav>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const initials = computed(() => {
  const name = auth.user?.username ?? ''
  return name.slice(0, 2).toUpperCase()
})
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.sidebar-logo {
  padding: 18px 16px 14px;
  border-bottom: 1px solid var(--border);
}
.server-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.server-sub  { font-size: 11px; color: var(--text-tertiary); margin-top: 2px; }

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}
.user-name { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.role-badge {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 10px;
  font-weight: 500;
  display: inline-block;
  margin-top: 2px;
}
.role-badge.admin { background: rgba(83,73,200,0.2); color: #a89dff; }
.role-badge.mod   { background: rgba(126,203,126,0.15); color: #7ecb7e; }

nav { flex: 1; padding: 10px 0; }

.nav-section {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 8px 16px 3px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  border-left: 2px solid transparent;
  transition: color 0.12s, background 0.12s;
}
.nav-item i { font-size: 15px; }
.nav-item:hover { color: var(--text-primary); background: var(--bg-hover); }
.nav-item.active {
  color: var(--text-primary);
  background: var(--bg-active);
  border-left-color: var(--accent);
  font-weight: 500;
}
</style>