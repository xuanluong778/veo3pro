/**
 * Structured usage log cho tạo video (console + trả về client qua job response).
 * Không log API key, cookie, mật khẩu.
 */
export function logVideoUsage(entry) {
  const row = {
    ts: new Date().toISOString(),
    ...entry,
  };
  try {
    console.info('[video-usage]', JSON.stringify(row));
  } catch {
    /* ignore */
  }
  return row;
}

/** @param {{ type?: string } | null | undefined} usedSource */
export function billingFromApiSource(usedSource) {
  const t = String(usedSource?.type || '').trim();
  const env_credit_used = t === 'env';
  const charged_credit = env_credit_used ? 1 : 0;
  return { charged_credit, env_credit_used, source: t || 'api_key' };
}
