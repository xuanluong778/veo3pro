import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { resolveProduct, fetchProductImageBlob } from '../productClient.js';
import { fileToBase64, startGeneration, pollOperation, extractVideoUri, downloadVideoBlob } from '../veoClient.js';

const MODELS = [
  { id: 'veo-3.1-generate-preview', label: 'Veo 3.1 — chất lượng cao' },
  { id: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast' },
];

const ASPECTS = [
  { id: '9:16', label: 'Dọc 9:16 (shorts)' },
  { id: '16:9', label: 'Ngang 16:9' },
];

const RESOLUTIONS = [
  { id: '720p', label: '720p' },
  { id: '1080p', label: '1080p' },
  { id: '4k', label: '4K' },
];

const LANGUAGES = [
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'en', label: 'English' },
  { id: 'vi-en', label: 'Việt + Anh' },
];

const STYLE_PRESETS = [
  { id: 'cta', label: 'Bán hàng / CTA' },
  { id: 'premium', label: 'Cao cấp / sang trọng' },
  { id: 'review', label: 'Review / trải nghiệm' },
  { id: 'short_hook', label: 'Hook mạnh 0–2s' },
];

const PROCESSING_MODES = [
  { id: 'info', label: 'Chỉ lấy thông tin sản phẩm' },
  { id: 'prompt_video', label: 'Prompt + Video' },
  { id: 'prompt_ai_video', label: 'Prompt + Ảnh AI + Video' },
  { id: 'full', label: 'TT + Prompt + Video + Ảnh AI' },
];

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `vm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function clipPromptText(s, max) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function isPlatformOrNoiseBullet(b) {
  const s = String(b || '').trim().toLowerCase();
  if (!s) return true;
  if (s.startsWith('nền tảng:')) return true;
  if (s.startsWith('canonical:')) return true;
  if (s.startsWith('shop:')) return false; // keep shop name if available
  if (s.includes('shopee') && (s.includes('nền tảng') || s.includes('welcome') || s.includes('chào mừng'))) return true;
  return false;
}

/** @param {object} opts */
function buildMarketingPrompt({
  title,
  description,
  styleLabel,
  language,
  productUrl = '',
  detailBullets = [],
  brandHint = '',
  aspectRatio = '9:16',
}) {
  const titleTrim = String(title || '').trim();
  const descTrim = clipPromptText(description, 2800);
  const langHint =
    language === 'en'
      ? 'Write voiceover and on-screen text in English.'
      : language === 'vi-en'
        ? 'Write voiceover in Vietnamese, add short English keywords on-screen.'
        : 'Viết voiceover và chữ trên màn hình bằng tiếng Việt.';

  const bulletsRaw = Array.isArray(detailBullets)
    ? detailBullets.map((x) => String(x || '').trim()).filter(Boolean).filter((b) => !isPlatformOrNoiseBullet(b))
    : [];
  const bulletLines = bulletsRaw.slice(0, 18).map((b) => `  • ${b}`);
  const brandLine = String(brandHint || '').trim();

  /** Gợi ý kịch bản theo timeline để mô hình không “đi xa” chủ đề ảnh + text */
  const storyboardVi = [
    'Gợi ý nhịp 8 giây (ám chỉ thoại/on-screen — đồng bộ với những ý trong MÔ TẢ + bullet):',
    '  • 0–2s: Mở bằng HERO shot — căn chỉnh với khung đầu; có thể slow push-in nhẹ vào đúng sản phẩm trong ảnh.',
    '  • 2–5s: 2–3 cắt cận tay cầm / chi tiết bao bì / góc 45° LUÔN vẫn là CÙNG món trong ảnh; minh họa các ý trong mô tả/bullet (lợi ích).',
    '  • 5–7s: Cảnh dùng thử trong bối cảnh ĐÚNG LOẠI HÀNG — phù hợp mô tả; không đổi sang sản phẩm khác.',
    '  • 7–8s: CTA đậm — chữ nổi + voiceover theo preset phong cách.',
  ].join('\n');

  const aspectVi =
    aspectRatio === '16:9'
      ? 'Tỉ lệ mục tiêu: ngang 16:9.'
      : 'Tỉ lệ mục tiêu: dọc 9:16 (shorts).';

  return [
    `[Video Marketing | image-to-video | ${styleLabel}]`,
    aspectVi,
    productUrl ? `Trang sản phẩm (chỉ tham chiếu nội dung, không phải quay lại web): ${productUrl}` : '',
    '',
    '=== NỘI DUNG TỪ TRANG (bắt buộc dùng cho thoại & chữ phụ đề) ===',
    `Tên sản phẩm: ${titleTrim || '(chưa có — mô tả theo hình ảnh khung đầu)'}`,
    brandLine ? `Thương hiệu (nếu có): ${brandLine}` : '',
    '',
    'Mô tả & điểm bán (nguồn chính cho kịch bản):',
    descTrim || '(Mô tả trống — kể ngắn dựa trên HÌNH SP trong khung đầu, không bịa tên thương hiệu nếu không đọc được.)',
    bulletLines.length
      ? ['', 'Danh sách thông tin bổ sung (Shop/JSON-LD — dùng cho lợi ích, giá, rating nếu có):', ...bulletLines].join('\n')
      : '',
    '',
    '=== RÀNG BUỘC HÌNH ẢNH (ưu tiên cao hơn mọi sáng tạo) ===',
    '- Khung đầu là ảnh sản phẩm THẬT: giữ ĐÚNG món hàng, bao bì, màu sắc, logo/chữ trên vỏ, kích thước tương đối và góc chính; KHÔNG thay bằng vật khác, KHÔNG “reimagine” thành sản phẩm cùng loại nhưng khác mẫu.',
    '- Chỉ thêm: chuyển động camera (pan/tilt/dolly ORBIT nhẹ), ánh sáng studio, tay người mẫu cầm sản phẩm đúng như trong ảnh; tay/người không che logo hoặc thông tin quan trọng trên bao bì.',
    '- Phông nền: phù hợp NGỮ CẢNH dùng hàng được mô tả (spa/bàn trang điểm/bếp/bàn học…) nhưng mờ và thứ yếu; trọng tâm luôn là đúng sản phẩm từ ảnh.',
    '- Tuyệt đối KHÔNG nói kiểu “Chào mừng bạn đến với Shopee/TikTok/…”. Không giới thiệu nền tảng; chỉ giới thiệu sản phẩm.',
    '- KHÔNG thêm mascot/celebrity; không watermark giả;',
    '- Nếu mô tả nhắc nhiều tính năng → minh họa bằng góc quay và lời thoại/on-screen CHỈ KHI vẫn nhận ra đúng sản phẩm trong ảnh.',
    '',
    storyboardVi,
    '',
    'Yêu cầu khác:',
    '- Voiceover: mở đầu đọc RÕ tên sản phẩm (1 câu), sau đó nêu 2–3 công dụng/chức năng nổi bật (ngắn, dễ nhớ), kết bằng CTA.',
    `- Video ngắn 8 giây, pacing nhanh, cinematic, không giật.`,
    `- On-screen title tối đa ~6–10 chữ/lần, đọc được; không chèn quá đậm.`,
    `- Kết CTA đúng tone ${styleLabel} (ưu đãi / uy tín / review / hook mạnh tùy preset).`,
    `- ${langHint}`,
    '',
    'Âm thanh:',
    '- Voiceover khớp mô tả sản phẩm và bullet; nhạc nền nhẹ không lấn thoại;',
  ]
    .filter(Boolean)
    .join('\n');
}

async function blobToPngBase64(blob) {
  const b = blob instanceof Blob ? blob : new Blob([blob], { type: 'application/octet-stream' });
  const bitmap = await createImageBitmap(b);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.drawImage(bitmap, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = String(dataUrl).replace(/^data:[^;]+;base64,/, '');
    return { data: base64, mimeType: 'image/png' };
  } finally {
    try {
      bitmap.close?.();
    } catch {
      /* ignore */
    }
  }
}

async function ensureSupportedImageBase64(fileOrBlob) {
  const mime = String(fileOrBlob?.type || '').toLowerCase();
  if (mime === 'image/png' || mime === 'image/jpeg') {
    return await fileToBase64(fileOrBlob);
  }
  return await blobToPngBase64(fileOrBlob);
}

function emptyRow(partial = {}) {
  const base = {
    id: newId(),
    selected: false,
    url: '',
    title: '',
    description: '',
    resolved: null,
    imageUrl: '',
    /** @type {File[]} */
    uploadFiles: [],
    /** @type {string[]} object URLs for thumbnails */
    uploadThumbUrls: [],
    /** index into uploadFiles for “primary” image */
    primaryUploadIndex: 0,
    /** @type {string[]} direct image URLs user pasted */
    imageLinkUrls: [],
    /** index into imageLinkUrls for “primary” image */
    primaryImageLinkIndex: 0,
    mode: 'full',
    step: 0,
    totalSteps: 3,
    status: 'waiting', // waiting | running | success | error
    message: 'Chờ xử lý',
    hasText: false,
    hasImg: false,
    hasAi: false,
    videoUrl: null,
    logs: '',
    ...partial,
  };

  const mode = base.mode ?? 'full';
  const totalSteps =
    typeof base.totalSteps === 'number' && Number.isFinite(base.totalSteps)
      ? base.totalSteps
      : mode === 'info'
        ? 1
        : mode === 'prompt_video'
          ? 2
          : mode === 'prompt_ai_video'
            ? 3
            : 3;

  return {
    ...base,
    mode,
    totalSteps,
  };
}

function Pill({ kind, ok, label }) {
  const cls =
    kind === 'text' ? 'vm-pill vm-pill--text' : kind === 'img' ? 'vm-pill vm-pill--img' : 'vm-pill vm-pill--ai';
  return (
    <span className={`${cls} ${ok ? 'is-ok' : 'is-bad'}`} title={label}>
      {label} {ok ? '✓' : '✕'}
    </span>
  );
}

function StatusPill({ status }) {
  const map = {
    waiting: { cls: 'vm-status vm-status--wait', text: 'ĐANG CHỜ' },
    running: { cls: 'vm-status vm-status--run', text: 'ĐANG CHẠY' },
    success: { cls: 'vm-status vm-status--ok', text: 'DONE' },
    error: { cls: 'vm-status vm-status--err', text: 'LỖI' },
  };
  const m = map[status] || map.waiting;
  return <span className={m.cls}>{m.text}</span>;
}

export default function VideoMarketingPanel({ hasApiKey }) {
  const [tasks, setTasks] = useState(() => [
    emptyRow({ url: '', status: 'waiting' }),
    emptyRow({ url: '', status: 'waiting' }),
  ]);
  const [filter, setFilter] = useState('all'); // all | running | success | error | waiting
  const [model, setModel] = useState(MODELS[0].id);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [resolution, setResolution] = useState('1080p');
  const [language, setLanguage] = useState('vi');
  const [styleId, setStyleId] = useState(STYLE_PRESETS[0].id);

  const [runningRowId, setRunningRowId] = useState(null);
  const [modalRowId, setModalRowId] = useState(null);
  const [modalTab, setModalTab] = useState('video'); // video | details
  const [imageLinkRowId, setImageLinkRowId] = useState(null);
  const [imageLinkDraft, setImageLinkDraft] = useState('');
  const abortRef = useRef(null);
  const cancelRef = useRef(false);
  const runningRowIdRef = useRef(null);
  const tasksRef = useRef(tasks);

  const commitTasks = useCallback((updater) => {
    setTasks((prev) => {
      const next = updater(prev);
      tasksRef.current = next;
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const styleLabel = useMemo(() => (STYLE_PRESETS.find((s) => s.id === styleId) || STYLE_PRESETS[0]).label, [styleId]);

  const appendRowLog = useCallback((rowId, line) => {
    const stamp = new Date().toLocaleTimeString('vi-VN');
    commitTasks((prev) =>
      prev.map((t) => (t.id === rowId ? { ...t, logs: `${t.logs || ''}${stamp} — ${line}\n` } : t)),
    );
  }, [commitTasks]);

  const updateRow = useCallback((rowId, patch) => {
    commitTasks((prev) => prev.map((t) => (t.id === rowId ? { ...t, ...patch } : t)));
  }, [commitTasks]);

  const revokeRowUploadThumbs = useCallback((row) => {
    const urls = row?.uploadThumbUrls;
    if (Array.isArray(urls)) {
      for (const u of urls) {
        if (!u) continue;
        try {
          URL.revokeObjectURL(u);
        } catch {
          /* ignore */
        }
      }
    }
  }, []);

  const revokeRowVideo = useCallback((row) => {
    if (row?.videoUrl) {
      try {
        URL.revokeObjectURL(row.videoUrl);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const stopRun = useCallback(() => {
    cancelRef.current = true;
    abortRef.current?.abort();
    const id = runningRowIdRef.current;
    if (id) appendRowLog(id, 'Đang hủy...');
  }, [appendRowLog]);

  const openVideoModal = useCallback((rowId) => {
    setModalRowId(rowId);
    setModalTab('video');
  }, []);

  const openImageLinkModal = useCallback((rowId) => {
    const row = tasksRef.current.find((t) => t.id === rowId);
    const first = Array.isArray(row?.imageLinkUrls) && row.imageLinkUrls[0] ? row.imageLinkUrls[0] : '';
    setImageLinkRowId(rowId);
    setImageLinkDraft(first);
  }, []);

  const totalStepsForMode = useCallback((mode) => {
    if (mode === 'info') return 1;
    // Các mode có “Ảnh AI” hiện tại vẫn map về cùng pipeline video (placeholder AI = bước đánh dấu).
    if (mode === 'prompt_video') return 2;
    if (mode === 'prompt_ai_video') return 3;
    return 3; // full
  }, []);

  const runVeoReferenceVideo = useCallback(
    async ({
      rowId,
      imgUrl,
      imageFile,
      title,
      description,
      productUrl = '',
      detailBullets = [],
      brandHint = '',
    }) => {
      if (!hasApiKey) {
        window.alert('Chưa có GEMINI_API_KEY. Vào “Cài đặt & API” để cấu hình.');
        throw new Error('Thiếu GEMINI_API_KEY');
      }

      const prompt = buildMarketingPrompt({
        title,
        description,
        styleLabel,
        language,
        productUrl,
        detailBullets,
        brandHint,
        aspectRatio,
      });
      cancelRef.current = false;
      abortRef.current = new AbortController();

      let image64;
      if (imageFile) {
        appendRowLog(rowId, 'Đang đọc ảnh upload...');
        image64 = await ensureSupportedImageBase64(imageFile);
      } else {
        const imageToUse = String(imgUrl || '').trim();
        if (!imageToUse) throw new Error('Thiếu ảnh sản phẩm để tạo video.');
        appendRowLog(rowId, 'Đang tải ảnh sản phẩm...');
        const blob = await fetchProductImageBlob(imageToUse);
        image64 = await ensureSupportedImageBase64(blob);
      }

      appendRowLog(rowId, 'Gửi yêu cầu tạo video (Ảnh khung đầu → Video)...');
      const startedInfo = await startGeneration(
        {
          model,
          prompt,
          aspectRatio,
          resolution,
          language,
          mode: 'image',
          image: image64,
          durationSeconds: 8,
          personGeneration: 'allow_adult',
        },
        { signal: abortRef.current.signal },
      );
      const op = startedInfo?.operationName;

      appendRowLog(rowId, `Operation: ${op}`);

      const maxWait = 45 * 60 * 1000;
      const started = Date.now();
      while (Date.now() - started < maxWait) {
        if (cancelRef.current) throw new Error('Đã hủy.');
        await new Promise((r) => setTimeout(r, 10000));
        appendRowLog(rowId, 'Đang chờ model xử lý...');
        const status = await pollOperation(op, { signal: abortRef.current.signal });
        if (status?.done) {
          const err = status.error || status.response?.error;
          if (err) throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
          const uri = extractVideoUri(status);
          if (!uri) throw new Error('Không tìm thấy URI video trong phản hồi.');
          appendRowLog(rowId, 'Hoàn tất. Đang tải video...');
          const out = await downloadVideoBlob(uri, { signal: abortRef.current.signal, operation: op });
          return URL.createObjectURL(out);
        }
      }
      throw new Error('Hết thời gian chờ.');
    },
    [appendRowLog, aspectRatio, hasApiKey, language, model, resolution, styleLabel],
  );

  const processRow = useCallback(
    async (rowId) => {
      if (runningRowIdRef.current && runningRowIdRef.current !== rowId) {
        window.alert('Đang có job khác chạy. Bấm Dừng hoặc đợi xong.');
        return;
      }

      const row = tasksRef.current.find((t) => t.id === rowId);
      if (!row) return;
      const urlTrim = String(row.url || '').trim();
      if (!urlTrim) {
        window.alert('Nhập link sản phẩm.');
        return;
      }

      runningRowIdRef.current = rowId;
      setRunningRowId(rowId);
      cancelRef.current = false;

      const mode = row.mode || 'full';
      const total = totalStepsForMode(mode);

      revokeRowVideo(row);
      updateRow(rowId, {
        status: 'running',
        message: 'Đang chạy...',
        step: 0,
        totalSteps: total,
        logs: '',
        videoUrl: null,
      });

      try {
        // Step 1: resolve product info
        appendRowLog(rowId, 'Đang lấy thông tin sản phẩm...');
        updateRow(rowId, { step: 1 });
        const data = await resolveProduct(urlTrim);

        const nextTitle = String(data.title || '').trim();
        const nextDescription = String(data.description || '').trim();
        const firstImg = Array.isArray(data.images) && data.images[0] ? String(data.images[0]) : '';

        updateRow(rowId, {
          resolved: data,
          title: nextTitle,
          description: nextDescription,
          imageUrl: firstImg,
          hasText: Boolean(nextTitle || nextDescription),
          hasImg: Boolean(firstImg || (tasksRef.current.find((x) => x.id === rowId)?.uploadFiles || []).length),
          message: mode === 'info' ? 'Đã lấy thông tin' : 'Đã lấy thông tin, đang tạo nội dung...',
        });

        const jpBrand = data.details?.jsonLdProduct?.brand;
        const brandHint =
          typeof jpBrand === 'string' ? jpBrand : typeof jpBrand?.name === 'string' ? jpBrand.name : '';
        const detailBulletsForVideo = Array.isArray(data.details?.bullets) ? data.details.bullets : [];

        if (mode === 'info') {
          updateRow(rowId, { status: 'success', message: 'Xong: chỉ lấy thông tin', step: total });
          return;
        }

        // Optional “AI image” stages (placeholder): mark badge + bump progress
        if (mode === 'prompt_ai_video' || mode === 'full') {
          updateRow(rowId, { step: Math.min(total, 2), hasAi: true, message: 'Đang chuẩn bị ảnh AI (placeholder)...' });
          // NOTE: Pipeline ảnh AI riêng chưa có trong app → giữ UX giống tool mẫu bằng bước đánh dấu.
          await new Promise((r) => setTimeout(r, 250));
        }

        updateRow(rowId, { step: Math.min(total, total - 1), message: 'Đang tạo video...' });
        const fresh = tasksRef.current.find((x) => x.id === rowId);
        const files = Array.isArray(fresh?.uploadFiles) ? fresh.uploadFiles : [];
        const primaryIndex = Number.isFinite(fresh?.primaryUploadIndex) ? fresh.primaryUploadIndex : 0;
        const fileSource = files[primaryIndex] || files[0] || null;
        const linkUrls = Array.isArray(fresh?.imageLinkUrls) ? fresh.imageLinkUrls : [];
        const linkIdx = Number.isFinite(fresh?.primaryImageLinkIndex) ? fresh.primaryImageLinkIndex : 0;
        const linkedImg = String(linkUrls[linkIdx] || linkUrls[0] || '').trim();
        const imgSource = fileSource ? null : String(linkedImg || firstImg || '').trim();

        if (!imgSource && !fileSource) {
          throw new Error('Không có ảnh sản phẩm — hãy upload ảnh trong dòng.');
        }

        const vUrl = await runVeoReferenceVideo({
          rowId,
          imgUrl: imgSource,
          imageFile: fileSource,
          title: nextTitle,
          description: nextDescription,
          productUrl: urlTrim,
          detailBullets: detailBulletsForVideo,
          brandHint,
        });

        updateRow(rowId, {
          videoUrl: vUrl,
          status: 'success',
          step: total,
          message: 'Hoàn thiện video',
        });
      } catch (e) {
        const msg = e?.name === 'AbortError' ? 'Đã hủy.' : e?.message || 'Lỗi';
        appendRowLog(rowId, msg);
        updateRow(rowId, { status: 'error', message: msg, step: 0 });
      } finally {
        abortRef.current = null;
        runningRowIdRef.current = null;
        setRunningRowId(null);
      }
    },
    [appendRowLog, revokeRowVideo, runVeoReferenceVideo, totalStepsForMode, updateRow],
  );

  const counts = useMemo(() => {
    const c = { all: tasks.length, running: 0, success: 0, error: 0, waiting: 0 };
    for (const t of tasks) {
      if (t.status === 'running') c.running += 1;
      if (t.status === 'success') c.success += 1;
      if (t.status === 'error') c.error += 1;
      if (t.status === 'waiting') c.waiting += 1;
    }
    return c;
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((t) => t.status === filter);
  }, [tasks, filter]);

  const modalRow = useMemo(() => tasks.find((t) => t.id === modalRowId) || null, [modalRowId, tasks]);

  return (
    <div className="vm-shell">
      <div className="vm-card">
        <div className="vm-topbar">
          <div className="vm-title">
            <h3>Danh sách Task</h3>
            <span className="vm-count-pill">{counts.all}</span>
          </div>

          <div className="vm-top-actions">
            <button type="button" className="vm-btn vm-btn--blue" onClick={() => commitTasks((p) => [emptyRow({}), ...p])}>
              + Thêm Task
            </button>
            <button type="button" className="vm-btn vm-btn--dark" disabled>
              + Tuỳ Chỉnh
            </button>
            <button
              type="button"
              className="vm-btn vm-btn--outline"
              onClick={() => stopRun()}
              disabled={!runningRowId}
            >
              Dừng
            </button>
          </div>
        </div>

        <div className="vm-filter-row" role="tablist" aria-label="Lọc trạng thái">
          <button type="button" className={`vm-filter ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            Tất cả ({counts.all})
          </button>
          <button type="button" className={`vm-filter ${filter === 'running' ? 'active' : ''}`} onClick={() => setFilter('running')}>
            Đang chạy ({counts.running})
          </button>
          <button type="button" className={`vm-filter ${filter === 'success' ? 'active' : ''}`} onClick={() => setFilter('success')}>
            Thành công ({counts.success})
          </button>
          <button type="button" className={`vm-filter ${filter === 'error' ? 'active' : ''}`} onClick={() => setFilter('error')}>
            Lỗi ({counts.error})
          </button>
          <button type="button" className={`vm-filter ${filter === 'waiting' ? 'active' : ''}`} onClick={() => setFilter('waiting')}>
            Đang chờ ({counts.waiting})
          </button>
        </div>

        <div className="vm-toolbar">
          <div className="vm-toolbar-left">
            <span className="vm-toolbar-label">Cấu hình nhanh</span>
          </div>
          <div className="vm-toolbar-right">
            <label className="vm-mini-field">
              <span>Model</span>
              <select className="vm-input" value={model} onChange={(e) => setModel(e.target.value)}>
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="vm-mini-field">
              <span>Tỷ lệ</span>
              <select className="vm-input" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                {ASPECTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="vm-mini-field">
              <span>Độ phân giải</span>
              <select className="vm-input" value={resolution} onChange={(e) => setResolution(e.target.value)}>
                {RESOLUTIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="vm-mini-field">
              <span>Phong cách</span>
              <select className="vm-input" value={styleId} onChange={(e) => setStyleId(e.target.value)}>
                {STYLE_PRESETS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="vm-mini-field">
              <span>Ngôn ngữ</span>
              <select className="vm-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="vm-table-wrap">
          <table className="vm-table">
            <thead>
              <tr>
                <th className="vm-col-check">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả"
                    checked={visibleTasks.length > 0 && visibleTasks.every((t) => t.selected)}
                    onChange={(e) => {
                      const on = e.target.checked;
                      const vis = new Set(visibleTasks.map((t) => t.id));
                      commitTasks((prev) => prev.map((t) => (vis.has(t.id) ? { ...t, selected: on } : t)));
                    }}
                  />
                </th>
                <th className="vm-col-stt">STT</th>
                <th>LINK SẢN PHẨM</th>
                <th>TÊN SP</th>
                <th>MÔ TẢ / ẢNH SP / ẢNH AI</th>
                <th>CHẾ ĐỘ XỬ LÝ</th>
                <th>TIẾN ĐỘ</th>
                <th>TRẠNG THÁI</th>
                <th>THÔNG BÁO</th>
                <th className="vm-col-actions">THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map((t) => (
                <tr key={t.id}>
                  <td className="vm-col-check">
                    <input
                      type="checkbox"
                      checked={Boolean(t.selected)}
                      onChange={(e) => updateRow(t.id, { selected: e.target.checked })}
                    />
                  </td>
                  <td className="vm-col-stt">{tasks.findIndex((x) => x.id === t.id) + 1}</td>
                  <td>
                    <input
                      className="vm-input vm-input--table"
                      value={t.url}
                      placeholder="https://shopee.vn/..."
                      onChange={(e) => {
                        updateRow(t.id, { url: e.target.value, status: 'waiting', message: 'Chờ xử lý' });
                      }}
                    />
                    <div className="vm-mini-actions">
                      <label className="vm-upload">
                        Upload ảnh
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []).filter(Boolean);
                            // Allow re-selecting the same file(s).
                            e.target.value = '';

                            // Revoke existing thumbs to avoid leaks.
                            const current = tasksRef.current.find((x) => x.id === t.id);
                            if (current) revokeRowUploadThumbs(current);

                            const thumbs = files.slice(0, 6).map((f) => URL.createObjectURL(f));
                            updateRow(t.id, {
                              uploadFiles: files,
                              uploadThumbUrls: thumbs,
                              primaryUploadIndex: 0,
                              hasImg: Boolean(files.length || t.imageUrl),
                              status: 'waiting',
                              message: 'Đã upload ảnh',
                            });
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="vm-btn vm-btn--outline"
                        style={{ padding: '6px 10px' }}
                        onClick={() => openImageLinkModal(t.id)}
                        title="Dán link ảnh sản phẩm (ưu tiên dùng làm ảnh khung đầu)"
                      >
                        + Link ảnh
                      </button>
                      {Array.isArray(t.uploadThumbUrls) && t.uploadThumbUrls.length > 0 ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {t.uploadThumbUrls.slice(0, 4).map((u, idx) => (
                            <button
                              key={u}
                              type="button"
                              title={idx === (t.primaryUploadIndex || 0) ? 'Ảnh chính' : 'Chọn làm ảnh chính'}
                              onClick={() => updateRow(t.id, { primaryUploadIndex: idx })}
                              style={{
                                border: idx === (t.primaryUploadIndex || 0) ? '2px solid #3b82f6' : '1px solid #2a2d3a',
                                padding: 0,
                                borderRadius: 6,
                                background: 'transparent',
                                cursor: 'pointer',
                                width: 34,
                                height: 34,
                                overflow: 'hidden',
                              }}
                            >
                              <img src={u} alt="thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </button>
                          ))}
                          {t.uploadThumbUrls.length > 4 ? (
                            <span style={{ color: '#94a3b8', fontSize: 12 }}>+{t.uploadThumbUrls.length - 4}</span>
                          ) : null}
                        </div>
                      ) : null}
                      {Array.isArray(t.imageLinkUrls) && t.imageLinkUrls.length > 0 ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {t.imageLinkUrls.slice(0, 2).map((u, idx) => (
                            <button
                              key={`${u}-${idx}`}
                              type="button"
                              title={idx === (t.primaryImageLinkIndex || 0) ? 'Ảnh link (chính)' : 'Chọn ảnh link (chính)'}
                              onClick={() => updateRow(t.id, { primaryImageLinkIndex: idx })}
                              style={{
                                border: idx === (t.primaryImageLinkIndex || 0) ? '2px solid #22c55e' : '1px solid #2a2d3a',
                                padding: 0,
                                borderRadius: 6,
                                background: 'transparent',
                                cursor: 'pointer',
                                width: 34,
                                height: 34,
                                overflow: 'hidden',
                              }}
                            >
                              <img src={u} alt="link-thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <input className="vm-input vm-input--table" value={t.title} readOnly placeholder="Trống" />
                  </td>
                  <td>
                    <div className="vm-pill-row">
                      <Pill kind="text" ok={Boolean(t.hasText)} label="Text" />
                      <Pill kind="img" ok={Boolean(t.hasImg)} label="IMG" />
                      <Pill kind="ai" ok={Boolean(t.hasAi)} label="AI" />
                    </div>
                  </td>
                  <td>
                    <select
                      className="vm-input vm-input--table"
                      value={t.mode}
                      onChange={(e) => {
                        const nextMode = e.target.value;
                        const nextTotal =
                          nextMode === 'info'
                            ? 1
                            : nextMode === 'prompt_video'
                              ? 2
                              : nextMode === 'prompt_ai_video'
                                ? 3
                                : 3;
                        updateRow(t.id, { mode: nextMode, totalSteps: nextTotal, step: 0 });
                      }}
                    >
                      {PROCESSING_MODES.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="vm-progress-pill">
                      {t.step}/{t.totalSteps}
                    </span>
                  </td>
                  <td>
                    <StatusPill status={t.status} />
                  </td>
                  <td>
                    <div className="vm-msg">{t.message}</div>
                  </td>
                  <td className="vm-col-actions">
                    <div className="vm-actions">
                      <button
                        type="button"
                        className="vm-icon-btn"
                        title={t.videoUrl ? 'Xem video' : 'Xem video (chưa có — bấm Play để tạo)'}
                        aria-label="Xem video"
                        onClick={() => openVideoModal(t.id)}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <path
                            fill="currentColor"
                            d="M4 7.5C4 6.12 5.12 5 6.5 5h7C14.88 5 16 6.12 16 7.5v9c0 1.38-1.12 2.5-2.5 2.5h-7A2.5 2.5 0 0 1 4 16.5v-9ZM18 9.2l4-2.4v10.4l-4-2.4V9.2Z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="vm-icon-btn vm-icon-btn--play"
                        title="Chạy"
                        aria-label="Chạy"
                        disabled={!hasApiKey || Boolean(runningRowId && runningRowId !== t.id)}
                        onClick={() => processRow(t.id)}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <path fill="currentColor" d="M8 5v14l11-7L8 5z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleTasks.length === 0 && (
                <tr>
                  <td colSpan={10} className="vm-empty">
                    Không có task trong bộ lọc này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!hasApiKey && <div className="vm-banner">Chưa có GEMINI_API_KEY — tính năng Video sẽ không chạy.</div>}
      </div>

      {modalRow && (
        <div
          className="vm-modal-backdrop"
          onClick={() => {
            setModalRowId(null);
            setModalTab('video');
          }}
        >
          <div className="vm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vm-modal-head">
              <h4>Xem video</h4>
              <button
                type="button"
                className="vm-btn vm-btn--outline"
                onClick={() => {
                  setModalRowId(null);
                  setModalTab('video');
                }}
              >
                Đóng
              </button>
            </div>

            <div className="vm-modal-body">
              <div className="vm-modal-tabs" role="tablist" aria-label="Nội dung kết quả">
                <button
                  type="button"
                  className={`vm-modal-tab ${modalTab === 'video' ? 'active' : ''}`}
                  role="tab"
                  aria-selected={modalTab === 'video'}
                  onClick={() => setModalTab('video')}
                >
                  Video
                </button>
                <button
                  type="button"
                  className={`vm-modal-tab ${modalTab === 'details' ? 'active' : ''}`}
                  role="tab"
                  aria-selected={modalTab === 'details'}
                  onClick={() => setModalTab('details')}
                >
                  Chi tiết SP
                </button>
              </div>

              {modalTab === 'video' ? (
                <div className="vm-modal-video-pane">
                  {modalRow.videoUrl ? (
                    <div className={`vm-video-frame ${aspectRatio === '9:16' ? 'is-9x16' : 'is-16x9'}`}>
                      <video className="vm-video vm-video--hero" controls autoPlay playsInline src={modalRow.videoUrl} />
                    </div>
                  ) : (
                    <div className="vm-video-empty">
                      <div className="vm-video-empty-title">Chưa có video</div>
                      <div className="vm-video-empty-sub">
                        Bấm nút Play (hình tam giác xanh) ở cột THAO TÁC để chạy tạo video cho dòng này.
                      </div>
                    </div>
                  )}
                  <div className="vm-modal-section-title" style={{ marginTop: '0.85rem' }}>
                    Nhật ký
                  </div>
                  <pre className="vm-log">{modalRow.logs || '—'}</pre>
                </div>
              ) : (
                <div className="vm-modal-grid vm-modal-grid--single">
                  <div>
                    <div className="vm-modal-section-title">Chi tiết sản phẩm</div>
                    <div className="vm-kv">
                      <div className="vm-k">Tên SP</div>
                      <div className="vm-v">{modalRow.title || '—'}</div>
                      <div className="vm-k">Link</div>
                      <div className="vm-v">
                        {modalRow.url ? (
                          <a href={modalRow.url} target="_blank" rel="noreferrer">
                            {modalRow.url}
                          </a>
                        ) : (
                          '—'
                        )}
                      </div>
                      <div className="vm-k">Mô tả / thông tin bóc được</div>
                      <div className="vm-v vm-pre">{modalRow.description || '—'}</div>
                    </div>

                    {Array.isArray(modalRow.resolved?.details?.bullets) && modalRow.resolved.details.bullets.length > 0 && (
                      <ul className="vm-bullet-list">
                        {modalRow.resolved.details.bullets.slice(0, 24).map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    )}

                    {modalRow.imageUrl && (
                      <div className="vm-thumb-wrap">
                        <img
                          className="vm-thumb"
                          alt="thumbnail"
                          src={`/api/product/image?${new URLSearchParams({ url: modalRow.imageUrl }).toString()}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {imageLinkRowId && (
        <div
          className="vm-modal-backdrop"
          onClick={() => {
            setImageLinkRowId(null);
            setImageLinkDraft('');
          }}
        >
          <div className="vm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vm-modal-head">
              <h4>Thêm link ảnh sản phẩm</h4>
              <button
                type="button"
                className="vm-btn vm-btn--outline"
                onClick={() => {
                  setImageLinkRowId(null);
                  setImageLinkDraft('');
                }}
              >
                Đóng
              </button>
            </div>

            <div className="vm-modal-body">
              <div className="vm-modal-section-title">Dán 1 hoặc nhiều link ảnh (mỗi dòng 1 link)</div>
              <textarea
                className="vm-input"
                style={{ minHeight: 120, width: '100%', marginTop: 8 }}
                value={imageLinkDraft}
                placeholder="https://...\nhttps://..."
                onChange={(e) => setImageLinkDraft(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="vm-btn vm-btn--outline"
                  onClick={() => {
                    setImageLinkRowId(null);
                    setImageLinkDraft('');
                  }}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="vm-btn vm-btn--blue"
                  onClick={() => {
                    const rowId = imageLinkRowId;
                    const urls = String(imageLinkDraft || '')
                      .split(/\r?\n|,|\s+/g)
                      .map((x) => x.trim())
                      .filter(Boolean)
                      .filter((u) => /^https?:\/\//i.test(u));

                    if (!urls.length) {
                      window.alert('Nhập ít nhất 1 link ảnh hợp lệ (http/https).');
                      return;
                    }

                    updateRow(rowId, {
                      imageLinkUrls: urls.slice(0, 6),
                      primaryImageLinkIndex: 0,
                      hasImg: true,
                      status: 'waiting',
                      message: 'Đã lưu link ảnh',
                    });
                    setImageLinkRowId(null);
                    setImageLinkDraft('');
                  }}
                >
                  Lưu link
                </button>
              </div>
              <div style={{ marginTop: 10, color: '#94a3b8', fontSize: 12 }}>
                Ảnh link sẽ được ưu tiên làm ảnh khung đầu khi tạo video (trước ảnh Shopee). Nếu bạn upload ảnh file thì upload vẫn ưu tiên cao nhất.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
