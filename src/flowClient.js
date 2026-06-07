const API = '/api';

const cred = { credentials: 'include' };

export async function startAutoFlow(body) {
  const r = await fetch(`${API}/flow/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...cred,
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Flow start failed');
  return data;
}

export async function getFlowJob(jobId) {
  const r = await fetch(`${API}/flow/job/${encodeURIComponent(jobId)}`, cred);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Job fetch failed');
  return data;
}
