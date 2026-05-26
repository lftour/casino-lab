const API_BASE = 'https://casino-worker.mt15abir2.workers.dev/api';

async function apiFetch(endpoint, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken();
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    ...options.headers
  };
  const res = await fetch(API_BASE + endpoint, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}
