export function reportDebug(location, message, data = {}, hypothesisId = '') {
  fetch('/auth/debug-client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ location, message, data, hypothesisId }),
  }).catch(() => {})
}
