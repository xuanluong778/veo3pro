import { GEMINI_API_BASE } from '../config.js';
import { getProxyDispatcher } from './proxyService.js';

/**
 * Veo dùng mô tả trong prompt cho cả hình và âm thanh; nếu có thoại trích dẫn mà model hay ra clip câm,
 * thêm một dòng chỉ dẫn âm thanh rõ ràng (không áp dụng khi Dialogue = None / không thoại).
 * @param {string} prompt
 * @param {string} [language] vi | en | vi-en
 */
/**
 * Khi người dùng mô tả người thật / cảnh đời thường mà không xin hoạt hình, Veo đôi khi trả clip hoạt hình.
 * Thêm khóa ngắn để khóa kiểu live-action (chỉ khi không có từ khóa hoạt hình trong prompt).
 * @param {string} prompt
 */
export function appendPhotorealLiveActionWhenImplied(prompt) {
  const p = String(prompt || '').trim();
  if (!p) return p;
  if (/VEO_PHOTOREAL_LOCK/i.test(p)) return p;
  const wantsStylized =
    /hoạt hình|hình hoạ|anime|cartoon|pixar|disney|claymation|stop\s*motion|cel[-\s]?shad|vẽ tay|minh hoạ|minh họa|illustration|2d\s*animation|3d\s*animation|cgi\s*nhân\s*vật|phong\s*cách\s*hoạt\s*hình|cyberpunk|fantasy\s*thần|thần\s*thoại|khoa\s*học\s*viễn\s*tưởng|viễn\s*tưởng|voxel|low\s*poly|baroque|tranh\s*màu\s*nước|sơn\s*dầu\s*nghệ|đất\s*nặn|vhs|game\s*cinematic|anime\s*điện|điện\s*ảnh\s*anime|nghệ\s*thuật\s*siêu|timelapse|retro|siêu\s*thực/i.test(
      p,
    );
  if (wantsStylized) return p;
  const impliesLiveSubject =
    /cô\s*gái|chàng\s*trai|đàn\s*ông|phụ\s*nữ|con\s*người|người\s*(việt|viet|nam)|nhân\s*vật\s*thật|live[-\s]?action|photoreal|realistic|thực\s*tế|quay\s*ngoài\s*trời|đường\s*phố|mặc\s*(áo|váy|quần)|váy|quần|giày|bata|nhảy|vũ\s*đạo|khuôn\s*mặt/i.test(
      p,
    );
  if (!impliesLiveSubject) return p;
  return `${p}\n\nVEO_PHOTOREAL_LOCK: Live-action photorealistic cinematography — natural skin, hair, fabric, and shoe materials; real-world lighting, motion blur, and camera depth. Do NOT render as cartoon, anime, cel-shading, illustration, or stylized 3D character rigs unless the user explicitly asked for that look.`;
}

/**
 * Ultra (Gemini web): tránh chỉ trả JSON storyboard / chữ — yêu cầu tạo clip Veo thật có thể xem và tải.
 * @param {string} prompt
 */
export function appendUltraGeminiWebVideoHint(prompt) {
  const p = String(prompt || '').trim();
  if (!p) return p;
  if (/ULTRA_GEMINI_WEB_VIDEO_HINT/i.test(p)) return p;
  return `${p}\n\nULTRA_GEMINI_WEB_VIDEO_HINT: In this Gemini chat, use Google Veo / the in-chat video tool to generate an actual playable short video (not only a text or JSON storyboard). After generation finishes, the UI must show a real video preview with a player. If the UI asks to confirm, confirm generation. Prefer a single clear video output suitable for download as MP4.`;
}

export function appendVeoAudioDirective(prompt, language = 'vi') {
  const p = String(prompt || '').trim();
  if (!p || /AUDIO_REQUIREMENT_FOR_VEO/i.test(p)) return p;
  if (/Dialogue \(Voice:\s*None/i.test(p) || /No spoken line/i.test(p)) return p;
  const hasStructuredDialogue = /Dialogue\s*\([^)]*\):\s*"/i.test(p);
  const hasQuotedViet = /:\s*"[^"]{6,}"/i.test(p) && /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(p);
  if (!hasStructuredDialogue && !hasQuotedViet) return p;

  const langLine =
    language === 'en'
      ? 'Use English speech matching the quoted dialogue.'
      : language === 'vi-en'
        ? 'Use Vietnamese or English speech matching the quoted words.'
        : 'Use Vietnamese speech matching the quoted dialogue.';
  return `${p}\n\nAUDIO_REQUIREMENT_FOR_VEO: The output must include clearly audible, synchronized lip-sync speech — ${langLine} Light room tone / score under dialogue; do not output a silent / mute video.`;
}

async function parseJsonSafe(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

export function buildVeoInstance(body) {
  const {
    prompt,
    mode = 'text',
    image,
    lastFrame,
    referenceImages,
    language,
  } = body;

  function normalizeInline(imageObj) {
    const data = typeof imageObj?.data === 'string' ? imageObj.data.replace(/\s+/g, '') : '';
    const mimeTypeRaw = typeof imageObj?.mimeType === 'string' ? imageObj.mimeType.trim() : '';
    const mimeType = mimeTypeRaw || 'image/png';
    if (!data) throw new Error('Thiếu dữ liệu ảnh (base64).');
    return { data, mimeType };
  }

  if (!prompt || !String(prompt).trim()) {
    throw new Error('Prompt không được để trống.');
  }

  const withAudio = appendVeoAudioDirective(String(prompt).trim(), String(language || 'vi').trim());
  const instance = { prompt: appendPhotorealLiveActionWhenImplied(withAudio) };

  /**
   * Ảnh đầu vào Veo (REST `predictLongRunning`): protobuf `Image` → JSON camelCase,
   * dùng `bytesBase64Encoded` + `mimeType` (xem Vertex REST mẫu). Không dùng `inlineData` (Blob generateContent)
   * hay `imageBytes` — bị một số model/API trả về “isn't supported”.
   */
  function veoImageFromNorm(norm) {
    return { mimeType: norm.mimeType, bytesBase64Encoded: norm.data };
  }

  if (mode === 'image') {
    if (!image?.data || !image?.mimeType) {
      throw new Error('Chế độ ảnh → video cần ảnh khởi đầu (upload file).');
    }
    const norm = normalizeInline(image);
    instance.image = veoImageFromNorm(norm);
    if (lastFrame?.data && lastFrame?.mimeType) {
      const lf = normalizeInline(lastFrame);
      instance.lastFrame = veoImageFromNorm(lf);
    }
  }

  if (mode === 'ingredients') {
    if (!referenceImages?.length) {
      throw new Error('Ingredients cần ít nhất một ảnh tham chiếu.');
    }
    instance.referenceImages = referenceImages.slice(0, 3).map((ref) => ({
      image: veoImageFromNorm(
        normalizeInline({
          data: ref.data,
          mimeType: ref.mimeType || 'image/png',
        }),
      ),
      referenceType: ref.referenceType || 'asset',
    }));
  }

  return instance;
}

/**
 * @param {{ proxyUrl?: string }} [options] — cùng proxy với `geminiRest` / header `x-user-proxy-url` (credit theo IP nhà cung cấp).
 */
export async function veoPredictLongRunning(apiKey, model, instance, parameters = {}, options = {}) {
  const payload = { instances: [instance] };
  if (parameters && Object.keys(parameters).length) {
    payload.parameters = parameters;
  }
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:predictLongRunning`;
  const dispatcher = getProxyDispatcher(options.proxyUrl || '');
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    ...(dispatcher ? { dispatcher } : {}),
  });
  const data = await parseJsonSafe(r);
  if (!r.ok) {
    throw new Error(data.error?.message || data.message || data.raw || `Veo start failed (${r.status})`);
  }
  if (!data.name) throw new Error('Veo: missing operation name');
  return data.name;
}

/**
 * @param {{ proxyUrl?: string }} [options]
 */
export async function veoGetOperation(apiKey, operationName, options = {}) {
  let name = operationName;
  try {
    name = decodeURIComponent(name);
  } catch {
    /* ignore */
  }

  const candidates = [];
  if (name.startsWith('models/')) candidates.push(name);
  if (name.startsWith('operations/')) {
    candidates.push(name);
    const short = name.slice('operations/'.length);
    if (short) candidates.push(`models/veo-3.1-generate-preview/operations/${short}`);
  } else {
    candidates.push(`operations/${name}`);
    candidates.push(`models/veo-3.1-generate-preview/operations/${name}`);
  }

  const tried = new Set();
  let lastErr = null;
  const dispatcher = getProxyDispatcher(options.proxyUrl || '');
  const fetchOpts = dispatcher ? { dispatcher } : {};
  for (const path of candidates) {
    if (!path || tried.has(path)) continue;
    tried.add(path);
    const url = `${GEMINI_API_BASE}/${path}`;
    const r = await fetch(url, {
      headers: { 'x-goog-api-key': apiKey },
      ...fetchOpts,
    });
    const data = await parseJsonSafe(r);
    if (r.ok) return data;
    lastErr = data.error?.message || data.message || data.raw || `Veo status failed (${r.status})`;
    if (r.status !== 404) {
      throw new Error(lastErr);
    }
  }

  throw new Error(lastErr || 'Veo status failed (404)');
}

export function extractVideoUriFromOperation(operationJson) {
  const gvr = operationJson?.response?.generateVideoResponse;
  const sample = gvr?.generatedSamples?.[0];
  return sample?.video?.uri ?? null;
}

export async function pollVeoUntilVideoUri(apiKey, operationName, {
  intervalMs = 10000,
  maxWaitMs = 45 * 60 * 1000,
  proxyUrl = '',
} = {}) {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const status = await veoGetOperation(apiKey, operationName, { proxyUrl });
    if (status.done) {
      const err = status.error || status.response?.error;
      if (err) throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
      const uri = extractVideoUriFromOperation(status);
      if (!uri) throw new Error('Veo completed but no video URI');
      return { uri, raw: status };
    }
  }
  throw new Error('Veo polling timeout');
}
