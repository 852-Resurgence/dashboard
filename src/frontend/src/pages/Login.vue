<template>
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-logo">
        <i class="ti ti-brand-discord" />
      </div>
      <h1>Staff login</h1>
      <a href="/auth/discord" class="btn-discord">
        <i class="ti ti-brand-discord" /> Continue with Discord
      </a>
      <div class="login-note">
        Role-based permissions are applied automatically on sign-in.
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-base);
}

.login-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 40px;
  width: 360px;
  text-align: center;
}

.login-logo {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #5865F2;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
  font-size: 22px;
  color: #fff;
}

h1 {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}

p {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 24px;
  line-height: 1.6;
}

.btn-discord {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 11px;
  font-size: 14px;
  font-weight: 500;
  background: #5865F2;
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: var(--font-sans);
  text-decoration: none;
  transition: background 0.12s;
}
.btn-discord:hover { background: #4752C4; }

.login-note {
  font-size: 10px;
  color: var(--text-tertiary);
  margin-top: 16px;
}
</style>