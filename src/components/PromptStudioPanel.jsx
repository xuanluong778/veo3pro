import { useEffect, useMemo, useRef, useState } from 'react';
import {
  generatePromptStudio,
  generatePromptPillars,
  generatePromptTopics,
  suggestPromptCharacters,
  suggestPromptContexts,
} from '../promptStudioClient.js';
import { exportPromptForVeo } from '../promptStudioExport.js';
import VideoAnalysisModule from './VideoAnalysisModule.jsx';
import { clearPromptStudioDraft, fetchPromptStudioDraft, savePromptStudioDraft } from '../promptStudioDraftApi.js';
import {
  PRESET_NONE_ID,
  getPromptStudioPreset,
  buildPresetContextBlock,
  PROMPT_STUDIO_PRESET_DROPDOWN,
} from '../promptStudioPresets';

const PROMPT_STUDIO_STORAGE_KEY = 'veo3pro_prompt_studio_state_v1';
const VALID_PRESET_IDS = new Set(PROMPT_STUDIO_PRESET_DROPDOWN.map((o) => o.id));
const storageRead = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return raw;
  } catch {
    /* ignore */
  }
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const storageWrite = (key, value) => {
  let wrote = false;
  try {
    localStorage.setItem(key, value);
    wrote = true;
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.setItem(key, value);
    wrote = true;
  } catch {
    /* ignore */
  }
  return wrote;
};

const storageRemove = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

const STYLE_OPTIONS = ['Châm biếm', 'Giáo dục', 'Triết lý', 'Hài hước', 'Cảm động', 'Kinh dị', 'Kịch tính', 'Bí ẩn'];
const RATIO_OPTIONS = ['9:16', '16:9', '1:1', '4:5'];
const CHARACTER_MODE_OPTIONS = [
  'Giữ nguyên hình mẫu (Gốc)',
  'Dạng người (Nhân hóa)',
  'Người thật (Realistic / Photoreal)',
  'Dạng thú (Động vật)',
  'Dạng Robot (Cơ khí)',
  'Hoạt hình (Dễ thương)',
  'Quái vật (Cute)',
];
const VOICE_OPTIONS = [
  'Không thoại (nhạc/SFX)',
  'Nam trẻ',
  'Nam trè',
  'Nữ trẻ',
  'Trung tính',
  'Nam già',
  'Nữ già',
  'Trè con',
  'Hài hước',
  'Kể chuyện',
  'Robot',
  'Quái vật',
  'Trầm ấm',
];
const LANGUAGE_OPTIONS = ['Tiếng Việt', 'Tiếng Anh', 'Tiếng trung', 'tiếng nhật', 'tiếng pháp', 'Tiếng Đức', 'Tiếng Tây Ban Nha'];
const INDUSTRY_OPTIONS = [
  'Sức khỏe & Dinh dưỡng',
  'Bất động sản',
  'Tiếng Anh giao tiếp',
  'Tài chính cá nhân',
  'Làm đẹp & Skincare',
  'Mẹo vặt cuộc sống',
  'Công nghệ & AI',
  'Kinh doanh Online',
  'Phong thủy & Tử vi',
  'Nuôi dạy con cái',
  'Review Ẩm thực',
  'Bán sách',
  'Review phim',
];

const TOPIC_TEMPLATES = {
  'Sức khỏe & Dinh dưỡng': [
    'Thực đơn Eat Clean và giảm cân',
    'Sự thật về các loại thực phẩm',
    'Review thực phẩm chức năng',
    'Bài tập cải thiện vóc dáng',
    'Cảnh báo dấu hiệu bệnh lý',
    'Sức khỏe tinh thần và giấc ngủ',
    'Mẹo vặt dinh dưỡng hằng ngày',
  ],
  'Bất động sản': [
    'Kinh nghiệm mua nhà lần đầu',
    'Phân tích xu hướng thị trường địa ốc',
    'Checklist pháp lý khi mua bán',
    'Review dự án theo tầm giá',
    'Sai lầm thường gặp khi đầu tư đất',
    'Thiết kế nội thất tối ưu công năng',
    'Chiến lược cho thuê sinh lời',
  ],
  'Tiếng Anh giao tiếp': [
    'Mẫu câu giao tiếp hằng ngày',
    'Phản xạ tiếng Anh trong 30 ngày',
    'Từ vựng theo chủ đề công việc',
    'Luyện nghe với tình huống thực tế',
    'Sửa lỗi phát âm phổ biến',
    'Mẹo nhớ từ vựng lâu quên',
    'Hội thoại tự tin khi du lịch',
  ],
  'Làm đẹp & Skincare': [
    'Review mỹ phẩm chân thực',
    'Quy trình dưỡng da hằng ngày',
    'Mẹo làm đẹp và skincare hacks',
    'Giải mã thành phần và hoạt chất',
    'Phác đồ điều trị vấn đề da',
    'So sánh mỹ phẩm và tìm bản dupe',
    'ASMR skincare và biến hình makeup',
    'Chống nắng và photo-aging',
    'Routine tối giản cho da nhạy cảm',
    'Lộ trình glass skin 30 ngày',
  ],
  'Bán sách': [
    'Câu chuyện 8s: “Một cuốn sách đổi đời” (hook → insight → CTA)',
    '3 lý do nên đọc cuốn này (tóm tắt 1 câu/ý, có payoff cuối)',
    'Trích đoạn “plot twist” không spoil: cảm giác sau khi đọc',
    'Review nhanh theo 3 tiêu chí: văn phong • bài học • ai nên đọc',
    'Nếu bạn đang mất phương hướng: cuốn sách này giúp gì?',
    'BookTok style: before/after mindset sau 1 chương',
    'Kể chuyện: “Tôi đã bỏ lỡ cuốn này 5 năm”',
  ],
  'Review phim': [
    'Review 8s không spoil: hook bằng 1 câu, chốt bằng 1 câu đáng xem',
    'Câu chuyện 8s: 1 cảnh “đinh” → cảm xúc → thông điệp',
    '3 điểm đáng xem: diễn xuất • nhịp phim • thông điệp (kết CTA)',
    'Nếu bạn thích (thể loại) thì phim này hợp vì sao?',
    'So sánh nhẹ: phim này giống/khác gì (không kể nội dung)',
    'Chấm điểm nhanh: 1 câu khen, 1 câu chê, 1 câu kết luận',
    'Review theo góc “đời thường”: bài học rút ra sau khi xem',
  ],
};

function buildMajorTopics(industry, quantity) {
  const q = Math.min(20, Math.max(1, Number(quantity) || 1));
  const keyRaw = String(industry || '').toLowerCase().trim();
  const key = INDUSTRY_OPTIONS.find((x) => x.toLowerCase() === keyRaw);
  let base = (key && TOPIC_TEMPLATES[key]) || [];
  if (!base.length) {
    if (keyRaw.includes('tình yêu') || keyRaw.includes('hẹn hò') || keyRaw.includes('crush') || keyRaw.includes('mối quan hệ')) {
      base = [
        'Tâm lý yêu và chữa lành sau chia tay',
        'Dấu hiệu cờ đỏ và cờ xanh trong mối quan hệ',
        'Tình huống hài hước và đời thường của cặp đôi',
        'Bí kíp thả thính và nghệ thuật hẹn hò',
        'Quotes tâm trạng và thông điệp tình yêu',
        'POV và kể chuyện ngôn tình thực tế',
        'Luật hấp dẫn và manifest người yêu lý tưởng',
      ];
    }
  }
  const out = [];
  for (const t of base) {
    if (!out.includes(t)) out.push(t);
    if (out.length >= q) return out;
  }
  let idx = 1;
  while (out.length < q) {
    out.push(`Góc nội dung ${idx}`);
    idx += 1;
  }
  return out;
}

function topicFallbacksForUi(pillar, count = 20) {
  const p = String(pillar || 'Chủ đề').trim() || 'Chủ đề';
  /** Giữ cùng tinh thần với `topicFallbacks` trong `server/services/promptService.js` (khi API lỗi). */
  const list = [
    `Tuần đầu với «${p}»: 3 việc nên và không nên`,
    `8 câu hỏi trước khi đầu tư vào «${p}»`,
    `Hai hướng làm «${p}» — ai chọn gì, vì sao`,
    `7 ngày với «${p}», 15 phút mỗi ngày`,
    `Dấu hiệu bạn đang làm «${p}» sai trọng tâm`,
    `Trước và sau: một nguyên tắc cốt lõi «${p}»`,
    `Tự học «${p}» tại nhà: 5 lỗi hay gặp`,
    `«${p}» khi bận: ưu tiên việc gì mỗi ngày`,
    `3 hiểu lầm khiến nản sớm với «${p}»`,
    `10 câu hỏi đầu tiên về «${p}» (gọn một clip)`,
    `«${p}»: khi nên dừng, khi nên tiếp tục`,
    `Làm «${p}» vội: rủi ro và cách tránh`,
    `So sánh nhanh 3 cách tiếp cận «${p}»`,
    `«${p}» từ cơ bản đến nâng cao: mốc chuyển`,
    `Giữ động lực «${p}» khi chưa thấy kết quả`,
    `5 tài nguyên hỗ trợ «${p}» nên biết`,
    `Đo tiến độ «${p}» không chỉ bằng cảm tính`,
    `Xu hướng mới về «${p}»: tin đến đâu`,
    `Đúng quy trình mà vẫn kẹt với «${p}»`,
    `Thử 1 tuần «${p}» có kiểm chứng`,
  ];
  const out = [];
  for (const t of list) {
    if (!out.includes(t)) out.push(t);
    if (out.length >= count) return out;
  }
  return out;
}

function parseCsvFirstColumn(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.split(',')[0]?.trim())
    .filter(Boolean);
}

function parseCsvLineSimple(line) {
  if (!line.includes('"')) return line.split(',').map((x) => x.trim());
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        q = !q;
      }
    } else if (ch === ',' && !q) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function sceneTextExport(scenes) {
  return scenes
    .map((s) => exportPromptForVeo(String(s.prompt || '')))
    .filter(Boolean)
    .join('\n\n');
}

function plannerCsvExport(industry, pillars, selectedPillar, topics) {
  const bom = '\uFEFF';
  const header = 'Lĩnh vực,Chủ đề lớn,Chủ đề đã chọn,20 chủ đề video\n';
  const maxRows = Math.max(pillars.length, topics.length, 1);
  let rows = '';
  for (let i = 0; i < maxRows; i += 1) {
    const col1 = i === 0 ? industry || '' : '';
    const col2 = pillars[i] || '';
    const col3 = i === 0 ? selectedPillar || '' : '';
    const col4 = topics[i] || '';
    const esc = (s) => `"${String(s || '').replace(/"/g, '""')}"`;
    rows += `${esc(col1)},${esc(col2)},${esc(col3)},${esc(col4)}\n`;
  }
  return bom + header + rows;
}

function inferSceneName(scene, idx) {
  const rawTitle = String(scene?.title || '').trim();
  if (rawTitle && !/^scene\s*\d+$/i.test(rawTitle)) return rawTitle;

  const prompt = String(scene?.prompt || '');
  const inlineChar = prompt.match(/Nhân vật \/ đối tượng chính:\s*(.+?)\s+Khi nhân hoá/i);
  if (inlineChar?.[1]) {
    const first = inlineChar[1].split(',')[0].trim();
    if (first && first.length <= 48) return first;
  }
  const stableChars = prompt.match(/^CHARACTERS:\s*(.+)$/im);
  if (stableChars?.[1]) {
    let rest = stableChars[1].replace(/^One main on-screen hero \(locked\):\s*/i, '').trim();
    rest = (rest.split(/\s+Background:/i)[0] || rest).trim();
    const hero = (rest.length > 48 ? rest.slice(0, 48) : rest).split(/[;,]/)[0]?.trim();
    if (hero) return hero;
  }
  const commercialChar = prompt.match(/^Character:\s*(.+)$/im);
  if (commercialChar?.[1]) {
    const first = commercialChar[1].split(',')[0].trim();
    if (first && first.length <= 48) return first;
  }
  const charMatch =
    prompt.match(/character\s*:\s*([^.,\n]+)/i) ||
    prompt.match(/nhân vật\s*:\s*([^.,\n]+)/i);
  const guessed = String(charMatch?.[1] || '').trim();
  if (guessed) return guessed;

  return `Scene ${idx + 1}`;
}

/** Server-built bundle: engine prompt → vendor-oriented strings (no extra LLM). */
function VendorRenderExtract({ render, onCopyText }) {
  if (!render || typeof render !== 'object' || !render.runway) return null;
  const { runway, kling, sora } = render;
  const row = (label, body, extra) => (
    <div className="prompt-vendor-block" key={label}>
      <div className="prompt-vendor-head">
        <strong>{label}</strong>
        <button type="button" className="btn btn-secondary mini-ai-btn" onClick={() => onCopyText(body)}>
          Copy prompt
        </button>
        {extra}
      </div>
      <pre className="prompt-vendor-pre">{body}</pre>
    </div>
  );
  return (
    <details className="prompt-render-extract" style={{ marginTop: '0.65rem' }}>
      <summary className="hint" style={{ cursor: 'pointer', fontWeight: 600 }}>
        Render prompt (Runway / Kling / Sora)
      </summary>
      <p className="hint" style={{ marginTop: '0.4rem', marginBottom: '0.5rem' }}>
        Trích từ prompt engine (thesis + scene + look + camera…). Runway/Kling: dùng <code>negativePrompt</code> riêng nếu API hỗ trợ.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {row(
          'Runway',
          runway.prompt,
          runway.negativePrompt ? (
            <button type="button" className="btn btn-secondary mini-ai-btn" onClick={() => onCopyText(runway.negativePrompt)}>
              Copy negative
            </button>
          ) : null,
        )}
        {row(
          'Kling',
          kling.prompt,
          kling.negativePrompt ? (
            <button type="button" className="btn btn-secondary mini-ai-btn" onClick={() => onCopyText(kling.negativePrompt)}>
              Copy negative
            </button>
          ) : null,
        )}
        {row('Sora', sora.prompt, null)}
      </div>
    </details>
  );
}

export default function PromptStudioPanel({ hasApiKey, hasOpenAiKey, onConvertToTextVideo }) {
  const [industry, setIndustry] = useState('');
  /** Số lượng cột chủ đề lớn khi bấm Tạo trong card Kế hoạch 365 */
  const [plannerQuantity, setPlannerQuantity] = useState(5);
  /** Số cảnh = số prompt trả về khi bấm «Tạo Prompt Ngay» */
  const [promptSceneCount, setPromptSceneCount] = useState(5);
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState('Châm biếm');
  const [ratio, setRatio] = useState('9:16');
  const [duration, setDuration] = useState(8);
  const [character, setCharacter] = useState('');
  const [characterMode, setCharacterMode] = useState('Giữ nguyên hình mẫu (Gốc)');
  const [voice, setVoice] = useState('Nam trẻ');
  const [language, setLanguage] = useState('Tiếng Việt');
  const [humorLevel, setHumorLevel] = useState(30);
  const [presetId, setPresetId] = useState(PRESET_NONE_ID);
  const [context, setContext] = useState('');
  const [negative, setNegative] = useState('');
  const [busy, setBusy] = useState(false);
  const [promptDebug, setPromptDebug] = useState(false);
  const [lastDebug, setLastDebug] = useState(null);
  /** Cảnh báo từ engine (dự phòng Gemini / quota / parse JSON) — xem meta.warnings API */
  const [engineWarnings, setEngineWarnings] = useState([]);
  const [error, setError] = useState('');
  const [csvRows, setCsvRows] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [majorTopics, setMajorTopics] = useState([]);
  const [selectedPillar, setSelectedPillar] = useState('');
  const [subTopics, setSubTopics] = useState([]);
  const [plannerStep, setPlannerStep] = useState(1);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [charSuggestBusy, setCharSuggestBusy] = useState(false);
  const [ctxSuggestBusy, setCtxSuggestBusy] = useState(false);
  const [characterSuggestions, setCharacterSuggestions] = useState([]);
  const [contextSuggestions, setContextSuggestions] = useState([]);
  const [industryMenuOpen, setIndustryMenuOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('');
  const industryRef = useRef(null);
  // When false: draft not hydrated yet; avoid overwriting saved state with empty initial state.
  const [storageReady, setStorageReady] = useState(false);
  const serverHydratedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const copyFeedbackTimerRef = useRef(null);

  const generatedCount = scenes.length;
  const industrySuggestions = useMemo(() => {
    const k = industry.trim().toLowerCase();
    if (!k) return INDUSTRY_OPTIONS;
    const isExactPreset = INDUSTRY_OPTIONS.some((x) => x.toLowerCase() === k);
    // Đã chọn đúng một lĩnh vực có sẵn: mở ô vẫn hiện toàn bộ để đổi nhanh, không bắt xóa chữ.
    if (isExactPreset) return INDUSTRY_OPTIONS;
    return INDUSTRY_OPTIONS.filter((x) => x.toLowerCase().includes(k));
  }, [industry]);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) {
        clearTimeout(copyFeedbackTimerRef.current);
        copyFeedbackTimerRef.current = null;
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    try {
      const raw = storageRead(PROMPT_STUDIO_STORAGE_KEY);
      if (!raw) {
        // fallthrough: try server draft (triệt để, không phụ thuộc quota localStorage)
      } else {
        const saved = JSON.parse(raw);
        if (typeof saved === 'object' && saved) {
          if (typeof saved.industry === 'string') setIndustry(saved.industry);
          const legacyQty = saved.quantity != null ? Math.min(20, Math.max(1, Number(saved.quantity) || 5)) : null;
          if (saved.plannerQuantity != null) {
            setPlannerQuantity(Math.min(20, Math.max(1, Number(saved.plannerQuantity) || 5)));
          } else if (legacyQty != null) {
            setPlannerQuantity(legacyQty);
          }
          if (saved.promptSceneCount != null) {
            setPromptSceneCount(Math.min(20, Math.max(1, Number(saved.promptSceneCount) || 5)));
          } else if (legacyQty != null) {
            setPromptSceneCount(legacyQty);
          }
          if (typeof saved.topic === 'string') setTopic(saved.topic);
          if (typeof saved.style === 'string') setStyle(saved.style);
          if (typeof saved.ratio === 'string') setRatio(saved.ratio);
          if (saved.duration != null) setDuration(Math.min(8, Math.max(3, Number(saved.duration) || 8)));
          if (typeof saved.character === 'string') setCharacter(saved.character);
          if (typeof saved.characterMode === 'string') setCharacterMode(saved.characterMode);
          if (typeof saved.voice === 'string') setVoice(saved.voice);
          if (typeof saved.language === 'string') setLanguage(saved.language);
          if (saved.humorLevel != null) setHumorLevel(Math.min(100, Math.max(0, Number(saved.humorLevel) || 0)));
          if (typeof saved.presetId === 'string' && VALID_PRESET_IDS.has(saved.presetId)) {
            setPresetId(saved.presetId);
          }
          if (typeof saved.context === 'string') setContext(saved.context);
          if (typeof saved.negative === 'string') setNegative(saved.negative);
          if (Array.isArray(saved.scenes)) setScenes(saved.scenes);
          if (Array.isArray(saved.majorTopics)) setMajorTopics(saved.majorTopics);
          if (typeof saved.selectedPillar === 'string') setSelectedPillar(saved.selectedPillar);
          if (Array.isArray(saved.subTopics)) setSubTopics(saved.subTopics);
          if (saved.plannerStep != null) setPlannerStep(Math.min(3, Math.max(1, Number(saved.plannerStep) || 1)));
          if (Array.isArray(saved.characterSuggestions)) setCharacterSuggestions(saved.characterSuggestions);
          if (Array.isArray(saved.contextSuggestions)) setContextSuggestions(saved.contextSuggestions);
          if (Array.isArray(saved.csvRows)) setCsvRows(saved.csvRows);
          if (typeof saved.promptDebug === 'boolean') setPromptDebug(saved.promptDebug);
          serverHydratedRef.current = true; // local wins if present
          setStorageReady(true);
          return;
        }
      }
    } catch {
      /* ignore invalid cache */
    }

    // No local draft (or invalid) → try server draft (per-account, encrypted session).
    fetchPromptStudioDraft()
      .then((saved) => {
        if (serverHydratedRef.current) return;
        if (!saved || typeof saved !== 'object') return;
        if (typeof saved.industry === 'string') setIndustry(saved.industry);
        const legacyQty = saved.quantity != null ? Math.min(20, Math.max(1, Number(saved.quantity) || 5)) : null;
        if (saved.plannerQuantity != null) {
          setPlannerQuantity(Math.min(20, Math.max(1, Number(saved.plannerQuantity) || 5)));
        } else if (legacyQty != null) {
          setPlannerQuantity(legacyQty);
        }
        if (saved.promptSceneCount != null) {
          setPromptSceneCount(Math.min(20, Math.max(1, Number(saved.promptSceneCount) || 5)));
        } else if (legacyQty != null) {
          setPromptSceneCount(legacyQty);
        }
        if (typeof saved.topic === 'string') setTopic(saved.topic);
        if (typeof saved.style === 'string') setStyle(saved.style);
        if (typeof saved.ratio === 'string') setRatio(saved.ratio);
        if (saved.duration != null) setDuration(Math.min(8, Math.max(3, Number(saved.duration) || 8)));
        if (typeof saved.character === 'string') setCharacter(saved.character);
        if (typeof saved.characterMode === 'string') setCharacterMode(saved.characterMode);
        if (typeof saved.voice === 'string') setVoice(saved.voice);
        if (typeof saved.language === 'string') setLanguage(saved.language);
        if (saved.humorLevel != null) setHumorLevel(Math.min(100, Math.max(0, Number(saved.humorLevel) || 0)));
        if (typeof saved.presetId === 'string' && VALID_PRESET_IDS.has(saved.presetId)) {
          setPresetId(saved.presetId);
        }
        if (typeof saved.context === 'string') setContext(saved.context);
        if (typeof saved.negative === 'string') setNegative(saved.negative);
        if (Array.isArray(saved.scenes)) setScenes(saved.scenes);
        if (Array.isArray(saved.majorTopics)) setMajorTopics(saved.majorTopics);
        if (typeof saved.selectedPillar === 'string') setSelectedPillar(saved.selectedPillar);
        if (Array.isArray(saved.subTopics)) setSubTopics(saved.subTopics);
        if (saved.plannerStep != null) setPlannerStep(Math.min(3, Math.max(1, Number(saved.plannerStep) || 1)));
        if (Array.isArray(saved.characterSuggestions)) setCharacterSuggestions(saved.characterSuggestions);
        if (Array.isArray(saved.contextSuggestions)) setContextSuggestions(saved.contextSuggestions);
        if (Array.isArray(saved.csvRows)) setCsvRows(saved.csvRows);
        if (typeof saved.promptDebug === 'boolean') setPromptDebug(saved.promptDebug);
      })
      .catch(() => {})
      .finally(() => {
        serverHydratedRef.current = true;
        setStorageReady(true);
      });
  }, []);

  function buildPersistedScenes(raw) {
    // localStorage quota is small (~5MB). Save only what we need to restore UI.
    if (!Array.isArray(raw)) return [];
    return raw
      .slice(0, 30)
      .map((s) => ({
        title: String(s?.title || '').trim(),
        prompt: String(s?.prompt || '').trim(),
        // keep render prompts if present but keep it small (avoid quota blowups)
        render:
          s?.render && typeof s.render === 'object'
            ? {
                runway:
                  s.render?.runway && typeof s.render.runway === 'object'
                    ? {
                        prompt: String(s.render.runway?.prompt || '').slice(0, 6000),
                        negativePrompt: String(s.render.runway?.negativePrompt || '').slice(0, 3000),
                      }
                    : undefined,
                kling:
                  s.render?.kling && typeof s.render.kling === 'object'
                    ? {
                        prompt: String(s.render.kling?.prompt || '').slice(0, 6000),
                        negativePrompt: String(s.render.kling?.negativePrompt || '').slice(0, 3000),
                      }
                    : undefined,
                sora:
                  s.render?.sora && typeof s.render.sora === 'object'
                    ? {
                        prompt: String(s.render.sora?.prompt || '').slice(0, 6000),
                      }
                    : undefined,
              }
            : undefined,
      }))
      .map((s) => ({
        ...s,
        prompt: s.prompt.length > 9000 ? `${s.prompt.slice(0, 8999)}…` : s.prompt,
      }));
  }

  function buildPersistedCsvRows(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 500);
  }

  useEffect(() => {
    if (!storageReady) return;
    const payload = {
      v: 2,
      savedAt: Date.now(),
      industry,
      plannerQuantity: Math.min(20, Math.max(1, Number(plannerQuantity) || 5)),
      promptSceneCount: Math.min(20, Math.max(1, Number(promptSceneCount) || 5)),
      topic,
      style,
      ratio,
      duration: Math.min(8, Math.max(3, Number(duration) || 8)),
      character,
      characterMode,
      voice,
      language,
      humorLevel: Number(humorLevel) || 0,
      presetId,
      context,
      negative,
      scenes: buildPersistedScenes(scenes),
      majorTopics,
      selectedPillar,
      subTopics,
      plannerStep,
      characterSuggestions,
      contextSuggestions,
      csvRows: buildPersistedCsvRows(csvRows),
      promptDebug,
      // Do NOT persist debug payload — it is huge and causes storage quota overflow → looks like "lost data" on refresh.
    };
    try {
      const raw = JSON.stringify(payload);
      const wrote = storageWrite(PROMPT_STUDIO_STORAGE_KEY, raw);
      if (wrote) return;
      // Quota fallback: store "lite" (drop render prompts first)
      const lite = {
        ...payload,
        scenes: (payload.scenes || []).map((s) => ({ title: s.title, prompt: s.prompt })),
      };
      storageWrite(PROMPT_STUDIO_STORAGE_KEY, JSON.stringify(lite));
    } catch {
      /* ignore quota/storage errors */
    }
  }, [
    industry,
    plannerQuantity,
    promptSceneCount,
    topic,
    style,
    ratio,
    duration,
    character,
    characterMode,
    voice,
    language,
    humorLevel,
    presetId,
    context,
    negative,
    scenes,
    majorTopics,
    selectedPillar,
    subTopics,
    plannerStep,
    characterSuggestions,
    contextSuggestions,
    csvRows,
    promptDebug,
    storageReady,
  ]);

  // Triệt để: đồng bộ draft lên server theo tài khoản (debounce).
  useEffect(() => {
    if (!storageReady) return;
    if (!serverHydratedRef.current) return;
    const draft = {
      v: 2,
      savedAt: Date.now(),
      industry,
      plannerQuantity: Math.min(20, Math.max(1, Number(plannerQuantity) || 5)),
      promptSceneCount: Math.min(20, Math.max(1, Number(promptSceneCount) || 5)),
      topic,
      style,
      ratio,
      duration: Math.min(8, Math.max(3, Number(duration) || 8)),
      character,
      characterMode,
      voice,
      language,
      humorLevel: Number(humorLevel) || 0,
      presetId,
      context,
      negative,
      scenes: buildPersistedScenes(scenes),
      majorTopics,
      selectedPillar,
      subTopics,
      plannerStep,
      characterSuggestions,
      contextSuggestions,
      csvRows: buildPersistedCsvRows(csvRows),
      promptDebug,
    };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      savePromptStudioDraft(draft).catch(() => {});
    }, 700);
  }, [
    industry,
    plannerQuantity,
    promptSceneCount,
    topic,
    style,
    ratio,
    duration,
    character,
    characterMode,
    voice,
    language,
    humorLevel,
    presetId,
    context,
    negative,
    scenes,
    majorTopics,
    selectedPillar,
    subTopics,
    plannerStep,
    characterSuggestions,
    contextSuggestions,
    csvRows,
    promptDebug,
    storageReady,
  ]);

  useEffect(() => {
    const onDocMouseDown = (ev) => {
      if (!industryRef.current) return;
      if (!industryRef.current.contains(ev.target)) {
        setIndustryMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const activePreset = useMemo(() => (presetId === PRESET_NONE_ID ? null : getPromptStudioPreset(presetId)), [presetId]);

  const onPresetChange = (e) => {
    const id = e.target.value;
    setPresetId(id);
    if (id === PRESET_NONE_ID) return;
    const preset = getPromptStudioPreset(id);
    if (!preset) return;
    setStyle(preset.style);
    setDuration(preset.pacing.duration);
    setRatio(preset.pacing.ratio);
    setHumorLevel(preset.humorLevel);
    setContext(buildPresetContextBlock(preset));
  };

  const canGenerate = useMemo(() => {
    return Boolean(hasApiKey && (topic.trim() || industry.trim()) && !busy);
  }, [hasApiKey, topic, industry, busy]);
  const canPlannerGenerate = useMemo(() => {
    return Boolean(industry.trim() || csvRows.length > 0);
  }, [industry, csvRows.length]);

  const buildTopic = () => {
    if (topic.trim()) return topic.trim();
    if (csvRows.length) return csvRows.slice(0, 3).join(' | ');
    return industry.trim();
  };

  const onGenerate = async () => {
    setError('');
    setEngineWarnings([]);
    setBusy(true);
    try {
      const payload = {
        topic: buildTopic(),
        style,
        duration: Math.min(8, Math.max(3, Number(duration) || 8)),
        ratio,
        character,
        characterMode,
        humorLevel,
        context,
        negative,
        voice,
        language,
        quantity: Math.min(20, Math.max(1, Number(promptSceneCount) || 1)),
      };
      if (promptDebug) {
        payload.debug = true;
      }
      const out = await generatePromptStudio(payload, { debug: promptDebug });
      setScenes(out.scenes || []);
      setLastDebug(out.debug && typeof out.debug === 'object' ? out.debug : null);
      const w = out.meta && Array.isArray(out.meta.warnings) ? out.meta.warnings.filter(Boolean) : [];
      setEngineWarnings(w);
    } catch (e) {
      setError(e.message || 'Tạo prompt thất bại');
    } finally {
      setBusy(false);
    }
  };

  const onPlannerGenerate = async () => {
    const fallback = () => {
      const list = buildMajorTopics(industry, plannerQuantity);
      setMajorTopics(list);
      setPlannerStep(2);
      setSelectedPillar('');
      setSubTopics([]);
      if (!topic.trim() && list[0]) setTopic(list[0]);
    };

    setPlannerLoading(true);
    try {
        const list = await generatePromptPillars(industry, plannerQuantity);
      if (!list.length) {
        fallback();
      } else {
        setMajorTopics(list);
        setPlannerStep(2);
        setSelectedPillar('');
        setSubTopics([]);
      }
    } catch {
      fallback();
    } finally {
      setPlannerLoading(false);
    }
  };

  const onCsvUpload = async (file) => {
    if (!file) return;
    const text = await file.text();
    const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim());
    const rows = lines.slice(1).map((line) => parseCsvLineSimple(line));
    const firstCol = rows.map((r) => r[0]).filter(Boolean);
    const pillars = [...new Set(rows.map((r) => r[1]).filter(Boolean))];
    const selected = rows.map((r) => r[2]).find(Boolean) || '';
    const topics = rows.map((r) => r[3]).filter(Boolean);

    const mergedRows = firstCol.length ? firstCol : parseCsvFirstColumn(text);
    setCsvRows(mergedRows);
    if (pillars.length > 0) {
      setMajorTopics(pillars);
      setPlannerStep(2);
    }
    if (selected) setSelectedPillar(selected);
    if (topics.length > 0) {
      setSubTopics(topics);
      setPlannerStep(3);
    }
    if (!topic.trim() && topics[0]) setTopic(topics[0]);
    if (!topic.trim() && mergedRows[0]) setTopic(mergedRows[0]);
  };

  const onSelectPillar = async (pillar) => {
    setSelectedPillar(pillar);
    setPlannerStep(3);
    setPlannerLoading(true);
    setSubTopics([]);
    try {
      const topics = await generatePromptTopics(pillar, 20);
      setSubTopics(topics);
      if (!topic.trim() && topics[0]) setTopic(topics[0]);
    } catch {
      const fallback = topicFallbacksForUi(pillar, 20);
      setSubTopics(fallback);
      if (!topic.trim()) setTopic(fallback[0]);
    } finally {
      setPlannerLoading(false);
    }
  };

  const flashCopySuccess = (message = 'Đã copy vào clipboard') => {
    if (copyFeedbackTimerRef.current) {
      clearTimeout(copyFeedbackTimerRef.current);
      copyFeedbackTimerRef.current = null;
    }
    setCopyFeedback(message);
    copyFeedbackTimerRef.current = setTimeout(() => {
      setCopyFeedback('');
      copyFeedbackTimerRef.current = null;
    }, 2200);
  };

  /**
   * Copy đồng bộ trong cùng stack với click — tránh mất user activation khi `await clipboard`.
   * Thứ tự: execCommand trước (ổn trên HTTP / nhiều trình duyệt), rồi thử clipboard API.
   */
  const copyPlainText = (rawText, successMessage) => {
    const content = String(rawText ?? '');
    if (!content.trim()) {
      setCopyFeedback('');
      setError('Không có nội dung để copy.');
      return false;
    }
    setError('');
    const okMsg = successMessage || 'Đã copy vào clipboard';
    const ta = document.createElement('textarea');
    ta.value = content;
    ta.setAttribute('readonly', 'readonly');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:min(100vw,640px)',
      'height:80px',
      'margin:0',
      'padding:8px',
      'border:1px solid transparent',
      'opacity:0',
      'pointer-events:none',
      'z-index:2147483646',
      'font:inherit',
    ].join(';');
    document.body.appendChild(ta);
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, content.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    if (ok) {
      flashCopySuccess(okMsg);
      return true;
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(content).then(
          () => flashCopySuccess(okMsg),
          () => {
            setCopyFeedback('');
            setError('Không copy được. Thử chọn thủ công trong ô prompt hoặc bật HTTPS.');
          },
        );
        return true;
      }
    } catch {
      /* ignore */
    }
    setCopyFeedback('');
    setError('Không copy được. Thử HTTPS/localhost, bật quyền clipboard, hoặc chọn thủ công trong ô prompt.');
    return false;
  };

  const onCopy = (text) => {
    copyPlainText(text, 'Đã copy prompt này');
  };

  const onCopyAllPrompts = () => {
    if (!scenes.length) return;
    const exported = sceneTextExport(scenes);
    const rawJoined = scenes
      .map((s) => String(s.prompt || '').trim())
      .filter(Boolean)
      .join('\n\n');
    copyPlainText(exported.trim() ? exported : rawJoined, 'Đã copy tất cả prompt');
  };

  const currentPlannerSeed = {
    industry: industry.trim(),
    pillar: selectedPillar || '',
    topic: topic.trim(),
    count: 16,
  };

  const onSuggestCharacter = async () => {
    setCharSuggestBusy(true);
    try {
      const arr = await suggestPromptCharacters(currentPlannerSeed);
      setCharacterSuggestions(arr);
      if (arr.length) setCharacter(arr.join('; '));
    } catch (e) {
      setError(e.message || 'Không lấy được gợi ý nhân vật');
    } finally {
      setCharSuggestBusy(false);
    }
  };

  const onSuggestContext = async () => {
    setCtxSuggestBusy(true);
    try {
      const arr = await suggestPromptContexts(currentPlannerSeed);
      setContextSuggestions(arr);
      if (!context.trim() && arr[0]) setContext(arr[0]);
    } catch (e) {
      setError(e.message || 'Không lấy được gợi ý bối cảnh');
    } finally {
      setCtxSuggestBusy(false);
    }
  };

  const onDownloadAll = () => {
    const txt = sceneTextExport(scenes);
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompt-studio-scenes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onConvertAllToTextVideo = () => {
    if (!scenes.length || typeof onConvertToTextVideo !== 'function') return;
    const content = scenes.map((scene) => exportPromptForVeo(String(scene.prompt || ''))).filter(Boolean).join('\n\n');
    onConvertToTextVideo(content);
  };

  const onConvertOneToTextVideo = (scene) => {
    if (typeof onConvertToTextVideo !== 'function') return;
    const content = exportPromptForVeo(String(scene.prompt || ''));
    onConvertToTextVideo(content);
  };

  const onDownloadPlannerCsv = () => {
    if (!subTopics.length) return;
    const content = plannerCsvExport(industry, majorTopics, selectedPillar, subTopics);
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KeHoachContent_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onResetAll = () => {
    setIndustry('');
    setPlannerQuantity(5);
    setPromptSceneCount(5);
    setTopic('');
    setStyle('Châm biếm');
    setRatio('9:16');
    setDuration(8);
    setCharacter('');
    setCharacterMode('Giữ nguyên hình mẫu (Gốc)');
    setVoice('Nam trẻ');
    setLanguage('Tiếng Việt');
    setHumorLevel(30);
    setContext('');
    setNegative('');
    setError('');
    setCsvRows([]);
    setScenes([]);
    setMajorTopics([]);
    setSelectedPillar('');
    setSubTopics([]);
    setPlannerStep(1);
    setCharacterSuggestions([]);
    setContextSuggestions([]);
    setPresetId(PRESET_NONE_ID);
    setPromptDebug(false);
    setLastDebug(null);
    setEngineWarnings([]);
    storageRemove(PROMPT_STUDIO_STORAGE_KEY);
    clearPromptStudioDraft().catch(() => {});
  };

  return (
    <div className="panel prompt-studio-wrap">
      <div className="prompt-studio-grid">
        <div className="prompt-left">
          <div className="prompt-card planner-card">
            <div className="planner-head">
              <span className="planner-icon" aria-hidden="true">
                📅
              </span>
              <h4>KẾ HOẠCH NỘI DUNG 365</h4>
            </div>
            <div className="planner-top-row">
              <div className="field planner-field-topic">
                <label>Lĩnh vực</label>
                <div className="planner-industry-select" ref={industryRef}>
                  <input
                    className="input planner-input"
                    value={industry}
                    onFocus={() => setIndustryMenuOpen(true)}
                    onChange={(e) => {
                      setIndustry(e.target.value);
                      setIndustryMenuOpen(true);
                    }}
                    placeholder="VD: Sức khỏe, Bất động sản..."
                  />
                  <button type="button" className="planner-industry-trigger" onClick={() => setIndustryMenuOpen((v) => !v)} aria-label="Mở danh sách lĩnh vực">
                    ▾
                  </button>

                  {industryMenuOpen && (
                    <div className="planner-industry-dropdown">
                      <div className="planner-industry-caption">Gợi ý phổ biến</div>
                      <div className="planner-industry-list">
                        {industrySuggestions.length === 0 && <div className="planner-industry-empty">Không có gợi ý phù hợp</div>}
                        {industrySuggestions.map((item) => (
                          <button
                            type="button"
                            key={item}
                            className={`planner-industry-item ${industry === item ? 'active' : ''}`}
                            onClick={() => {
                              setIndustry(item);
                              setIndustryMenuOpen(false);
                            }}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="field planner-field-qty">
                <label title="Số cột chủ đề lớn khi bấm Tạo trong kế hoạch 365 — không phải số prompt sinh ra">Số lượng</label>
                <div className="planner-qty-actions">
                  <input
                    className="input planner-input planner-qty-input"
                    type="number"
                    min={1}
                    max={20}
                    value={plannerQuantity}
                    onChange={(e) => setPlannerQuantity(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                  />
                  <button type="button" className="btn btn-primary planner-generate-btn" disabled={!canPlannerGenerate} onClick={onPlannerGenerate}>
                    {plannerLoading ? 'Đang tạo…' : '◎ Tạo'}
                  </button>
                </div>
              </div>
            </div>
            <label className="planner-upload-box" style={{ cursor: 'pointer' }}>
              <span className="planner-upload-icon" aria-hidden="true">
                ⤴
              </span>
              <span>UPLOAD FILE EXCEL (CSV)</span>
              <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => onCsvUpload(e.target.files?.[0])} />
            </label>
            {csvRows.length > 0 && <p className="hint">Đã nạp {csvRows.length} dòng từ CSV.</p>}
          </div>

          {majorTopics.length > 0 && (
            <div className="prompt-card planner-topics-card">
              <div className="planner-topics-head">
                <span className="planner-step-badge">1</span>
                <h4>Chọn Chủ đề lớn</h4>
              </div>
              <div className="planner-topics-grid">
                {majorTopics.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={`planner-topic-item ${selectedPillar === item ? 'active' : ''}`}
                    onClick={() => onSelectPillar(item)}
                  >
                    <span className="planner-topic-icon">◻</span>
                    <span>{item}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(plannerStep >= 3 || subTopics.length > 0) && (
            <div className="prompt-card planner-topics-card">
              <div className={`planner-topics-head planner-subtopic-head ${plannerLoading ? 'is-loading' : ''}`}>
                <span className="planner-step-badge">2</span>
                <h4>{plannerLoading ? 'Đang tạo chủ đề video...' : `${subTopics.length || 20} Chủ đề video`}</h4>
                {!plannerLoading && subTopics.length > 0 && (
                  <button type="button" className="btn btn-primary planner-download-btn" onClick={onDownloadPlannerCsv}>
                    Tải Excel
                  </button>
                )}
              </div>
              {!plannerLoading && selectedPillar && (
                <p className="hint planner-selected-pillar">
                  Chủ đề lớn: <strong>"{selectedPillar}"</strong>
                </p>
              )}
              {plannerLoading ? (
                <p className="hint">Đang tạo danh sách 20 chủ đề cho: {selectedPillar || industry}</p>
              ) : (
                <div className="planner-subtopics-list">
                  {subTopics.map((item, idx) => (
                    <button
                      type="button"
                      key={`${item}-${idx}`}
                      className={`planner-subtopic-item ${topic === item ? 'active' : ''}`}
                      onClick={() => setTopic(item)}
                    >
                      <span className="planner-subtopic-index">{String(idx + 1).padStart(2, '0')}</span>
                      <span>{item}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="prompt-card">
            <div className="planner-head" style={{ marginBottom: '0.85rem' }}>
              <span className="planner-icon" aria-hidden>
                🎬
              </span>
              <h4>Cấu hình video</h4>
            </div>
            <VideoAnalysisModule hasGeminiKey={Boolean(hasApiKey)} embedded />
            <div
              style={{
                marginTop: '1.25rem',
                paddingTop: '1.1rem',
                borderTop: '1px solid var(--border)',
              }}
            >
              <div className="field">
                <label>Chủ đề video</label>
                <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ví dụ: Trái cây tốt cho da" />
              </div>
              <div className="field">
                <label>Preset</label>
                <select
                  className="input"
                  value={presetId}
                  onChange={onPresetChange}
                  title={activePreset?.descriptionVi || 'Chọn bộ tham số có sẵn'}
                >
                  {PROMPT_STUDIO_PRESET_DROPDOWN.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.labelVi}
                    </option>
                  ))}
                </select>
                {activePreset ? (
                  <p className="hint" style={{ marginTop: '0.35rem', marginBottom: 0 }}>
                    {activePreset.descriptionVi} — Đã áp dụng: phong cách, tỷ lệ, độ dài, mức hài, bối cảnh.
                  </p>
                ) : (
                  <p className="hint" style={{ marginTop: '0.35rem', marginBottom: 0 }}>
                    Chọn preset để gán nhanh phong cách, nhịp (tỷ lệ + giây), tông và mức hài hước.
                  </p>
                )}
              </div>
              <div className="prompt-io-grid">
                <div className="field">
                  <label htmlFor="ps-style-select">Phong cách</label>
                  <select id="ps-style-select" className="input" value={style} onChange={(e) => setStyle(e.target.value)}>
                    {STYLE_OPTIONS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ps-prompt-out-qty" title="Số khối prompt / cảnh API trả về (1–20)">
                    Số prompt đầu ra
                  </label>
                  <input
                    id="ps-prompt-out-qty"
                    className="input"
                    type="number"
                    min={1}
                    max={20}
                    value={promptSceneCount}
                    onChange={(e) => setPromptSceneCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ps-ratio-select">Tỷ lệ</label>
                  <select id="ps-ratio-select" className="input" value={ratio} onChange={(e) => setRatio(e.target.value)}>
                    {RATIO_OPTIONS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ps-duration-input">Độ dài clip (3–8 giây)</label>
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: '0.5rem' }}>
                    <input
                      id="ps-duration-input"
                      className="input"
                      style={{ flex: 1, minWidth: 0 }}
                      type="number"
                      min={3}
                      max={8}
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      aria-label="Độ dài clip giây"
                    />
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '0 0.6rem',
                        fontSize: '0.82rem',
                        color: 'var(--muted)',
                        flexShrink: 0,
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg)',
                      }}
                      title="Đơn vị: giây"
                    >
                      giây
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="prompt-card">
            <h4>Cấu hình nhân vật & thoại</h4>
            <div className="field">
              <div className="field-label-inline">
                <label>Nhân vật / đối tượng</label>
                <button type="button" className="btn btn-secondary mini-ai-btn" onClick={onSuggestCharacter} disabled={charSuggestBusy}>
                  {charSuggestBusy ? 'Đang gợi ý...' : 'Gợi ý AI'}
                </button>
              </div>
              <input
                className="input"
                value={character}
                onChange={(e) => setCharacter(e.target.value)}
                placeholder="Ví dụ: Mascot hình phổi"
              />
              {characterSuggestions.length > 0 && (
                <div className="inline-suggest-list">
                  {characterSuggestions.map((item, idx) => (
                    <button type="button" key={`${item}-${idx}`} className="inline-suggest-item" onClick={() => setCharacter(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="row">
              <div className="field">
                <label>Phong cách nhân vật</label>
                <select className="input" value={characterMode} onChange={(e) => setCharacterMode(e.target.value)}>
                  {CHARACTER_MODE_OPTIONS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Giọng</label>
                <select className="input" value={voice} onChange={(e) => setVoice(e.target.value)}>
                  {VOICE_OPTIONS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Ngôn ngữ</label>
                <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {LANGUAGE_OPTIONS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Mức độ hài hước ({humorLevel})</label>
              <input type="range" min={0} max={100} value={humorLevel} onChange={(e) => setHumorLevel(Number(e.target.value))} className="prompt-range" />
            </div>
            <div className="field">
              <div className="field-label-inline">
                <label>Bối cảnh ưu tiên</label>
                <button type="button" className="btn btn-secondary mini-ai-btn" onClick={onSuggestContext} disabled={ctxSuggestBusy}>
                  {ctxSuggestBusy ? 'Đang gợi ý...' : 'Gợi ý AI'}
                </button>
              </div>
              <input className="input" value={context} onChange={(e) => setContext(e.target.value)} placeholder="Ví dụ: trong phòng tập, quán cafe..." />
              {contextSuggestions.length > 0 && (
                <div className="inline-suggest-list">
                  {contextSuggestions.map((item, idx) => (
                    <button type="button" key={`${item}-${idx}`} className="inline-suggest-item" onClick={() => setContext(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>Nội dung cấm (negative)</label>
              <input className="input" value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="Ví dụ: text watermark, blur, low quality..." />
            </div>
            <label className="prompt-studio-inline-check" style={{ marginBottom: '0.65rem' }}>
              <input
                type="checkbox"
                checked={promptDebug}
                onChange={(e) => {
                  const v = e.target.checked;
                  setPromptDebug(v);
                  if (!v) setLastDebug(null);
                }}
              />
              <span>Debug sinh prompt (raw LLM, partial đã parse, prompt cuối)</span>
            </label>
            <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={!canGenerate} onClick={onGenerate}>
              {busy ? 'Đang tạo prompt...' : 'Tạo Prompt Ngay'}
            </button>
            {error && <p className="flow-error" style={{ marginTop: '0.75rem', marginBottom: 0 }}>{error}</p>}
          </div>
        </div>

        <div className="prompt-right">
          <div className="prompt-result-head">
            <h4>Kết quả tạo Prompt <span className="prompt-count">{generatedCount}</span></h4>
            <div className="actions" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="btn btn-secondary prompt-convert-btn"
                onClick={onConvertAllToTextVideo}
                disabled={busy || scenes.length === 0 || typeof onConvertToTextVideo !== 'function'}
              >
                {'Convert -> Text -> Video'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={onResetAll} disabled={busy}>
                Làm mới
              </button>
              <button type="button" className="btn btn-secondary" onClick={onCopyAllPrompts} disabled={busy || scenes.length === 0}>
                Copy tất cả
              </button>
              <button type="button" className="btn btn-primary" onClick={onDownloadAll} disabled={busy || scenes.length === 0}>
                Tải .txt
              </button>
            </div>
          </div>
          {copyFeedback ? (
            <div className="prompt-copy-feedback" role="status" aria-live="polite">
              <span className="prompt-copy-feedback-icon" aria-hidden="true">
                ✓
              </span>
              <span>{copyFeedback}</span>
            </div>
          ) : null}
          {engineWarnings.length > 0 ? (
            <div
              className="prompt-engine-warnings"
              role="alert"
              style={{
                marginBottom: '0.85rem',
                padding: '0.65rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(251, 191, 36, 0.45)',
                background: 'rgba(251, 191, 36, 0.08)',
                fontSize: '0.88rem',
                lineHeight: 1.45,
              }}
            >
              <strong style={{ display: 'block', marginBottom: '0.35rem' }}>Engine Prompt Studio</strong>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {engineWarnings.map((w, wi) => (
                  <li key={`${wi}-${String(w).slice(0, 48)}`}>{w}</li>
                ))}
              </ul>
              {engineWarnings.some((x) => /quota|billing|api key|unauthenticated|permission|429|resource_exhausted/i.test(String(x || ''))) ? (
                <p className="hint" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
                  Ứng dụng không kiểm tra “còn tiền” Google — xem quota/billing tại Google AI Studio / Google Cloud.{' '}
                  <code>/api/health</code> chỉ báo có/không có <code>GEMINI_API_KEY</code>, không xác thực hạn mức.
                </p>
              ) : null}
            </div>
          ) : null}
          {lastDebug && (
            <details className="prompt-debug-panel" style={{ marginBottom: '1rem' }}>
              <summary className="hint" style={{ cursor: 'pointer', fontWeight: 600 }}>
                Chi tiết debug (lần chạy gần nhất)
              </summary>
              <pre
                className="prompt-debug-pre"
                style={{
                  marginTop: '0.5rem',
                  maxHeight: 'min(50vh, 420px)',
                  overflow: 'auto',
                  fontSize: '0.72rem',
                  padding: '0.65rem',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.35)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                }}
              >
                {JSON.stringify(lastDebug, null, 2)}
              </pre>
            </details>
          )}
          <div className="prompt-scenes-list">
            {scenes.length === 0 && <p className="hint">Chưa có scene nào. Điền thông tin bên trái và bấm Tạo Prompt.</p>}
            {scenes.map((scene, idx) => (
              <article key={`${scene.title}-${idx}`} className="prompt-scene-card">
                <div className="prompt-scene-head">
                  <div className="prompt-scene-title">
                    <span className="prompt-scene-index">{idx + 1}</span>
                    <strong>{inferSceneName(scene, idx)}</strong>
                  </div>
                  <div className="prompt-scene-actions">
                    <button
                      type="button"
                      className="btn btn-secondary prompt-convert-btn"
                      onClick={() => onConvertOneToTextVideo(scene)}
                      disabled={typeof onConvertToTextVideo !== 'function'}
                    >
                      {'Convert -> Text -> Video'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => onCopy(String(scene.prompt || ''))}>
                      Copy
                    </button>
                  </div>
                </div>
                <pre>{scene.prompt}</pre>
                <VendorRenderExtract render={scene.render} onCopyText={(t) => copyPlainText(t, 'Đã copy prompt vendor')} />
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
