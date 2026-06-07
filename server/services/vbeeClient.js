/**
 * Client Vbee Text-to-Speech — https://api-docs.vbee.vn/
 * Xác thực: header Authorization: Bearer <token>, body có app_id.
 */

import { getProxyDispatcher } from './proxyService.js';

const DEFAULT_BASE = 'https://vbee.vn/api/v1';

function stripTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

/**
 * @param {{ appId: string, token: string, baseUrl?: string, proxyUrl?: string }} opts
 */
export function createVbeeClient({ appId, token, baseUrl = DEFAULT_BASE, proxyUrl = '' }) {
  const id = String(appId || '').trim();
  const tok = String(token || '').trim();
  if (!id || !tok) {
    throw new Error('Thiếu app_id hoặc token Vbee (VBEE_APP_ID / VBEE_TOKEN).');
  }

  const root = stripTrailingSlash(baseUrl || DEFAULT_BASE);
  const dispatcher = getProxyDispatcher(proxyUrl);

  function authHeaders() {
    return {
      Authorization: `Bearer ${tok}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  function assertApiEnvelope(data, ctx) {
    if (!data || typeof data !== 'object') {
      throw new Error(`${ctx}: phản hồi không phải JSON hợp lệ.`);
    }
    if (Number(data.status) !== 1) {
      const msg = data.error_message || data.error_code || 'API Vbee trả về lỗi.';
      throw new Error(`${ctx}: ${msg}`);
    }
    return data.result;
  }

  /**
   * POST /tts — tạo yêu cầu tổng hợp giọng (thường kèm callback).
   * @param {Record<string, unknown>} body Phần body (đã có app_id được gắn tự động)
   */
  async function createSpeech(body) {
    const url = `${root}/tts`;
    const res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ app_id: id, ...body }),
      ...(dispatcher ? { dispatcher } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error_message || data.message || res.statusText || `HTTP ${res.status}`;
      throw new Error(`Vbee createSpeech: ${msg}`);
    }
    return assertApiEnvelope(data, 'createSpeech');
  }

  /**
   * GET /tts/{request_id} — trạng thái & audio_link khi xử lý xong.
   */
  async function getRequest(requestId) {
    const rid = String(requestId || '').trim();
    if (!rid) throw new Error('Thiếu request_id.');
    const url = `${root}/tts/${encodeURIComponent(rid)}`;
    const res = await fetch(url, { headers: authHeaders(), ...(dispatcher ? { dispatcher } : {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error_message || data.message || res.statusText || `HTTP ${res.status}`;
      throw new Error(`Vbee getRequest: ${msg}`);
    }
    return assertApiEnvelope(data, 'getRequest');
  }

  /**
   * GET /tts/{request_id}/callback-result — chỉ khi dùng luồng callback.
   */
  async function getCallbackResult(requestId) {
    const rid = String(requestId || '').trim();
    if (!rid) throw new Error('Thiếu request_id.');
    const url = `${root}/tts/${encodeURIComponent(rid)}/callback-result`;
    const res = await fetch(url, { headers: authHeaders(), ...(dispatcher ? { dispatcher } : {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error_message || data.message || res.statusText || `HTTP ${res.status}`;
      throw new Error(`Vbee getCallbackResult: ${msg}`);
    }
    return assertApiEnvelope(data, 'getCallbackResult');
  }

  /**
   * GET /voices — danh sách giọng hợp lệ theo token/app.
   */
  async function listVoices() {
    const url = `${root}/voices`;
    const res = await fetch(url, { headers: authHeaders(), ...(dispatcher ? { dispatcher } : {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error_message || data.message || res.statusText || `HTTP ${res.status}`;
      throw new Error(`Vbee listVoices: ${msg}`);
    }
    return assertApiEnvelope(data, 'listVoices');
  }

  return {
    createSpeech,
    getRequest,
    getCallbackResult,
    listVoices,
    /** Base URL thực tế (sau chuẩn hoá) */
    baseUrl: root,
    appId: id,
  };
}

/**
 * Poll GET /tts/{id} cho đến khi có audio hoặc FAILURE.
 * @param {ReturnType<typeof createVbeeClient>} client
 * @param {string} requestId
 * @param {{ maxWaitMs?: number, intervalMs?: number }} [opts]
 */
export async function waitForTtsAudio(client, requestId, opts = {}) {
  const maxWaitMs = opts.maxWaitMs ?? 120_000;
  const intervalMs = opts.intervalMs ?? 1500;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const r = await client.getRequest(requestId);
    const status = r && typeof r.status === 'string' ? r.status : '';
    if (status === 'SUCCESS' && r.audio_link) {
      return r;
    }
    if (status === 'FAILURE') {
      throw new Error(r.error_message || 'Tổng hợp giọng thất bại (FAILURE).');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Hết thời gian chờ kết quả TTS từ Vbee.');
}
