import { geminiGenerateContent, extractTextFromGenerateContent } from './geminiRest.js';
import { runScenePipeline } from '../promptEngine/orchestrator.mjs';
import { normalizeCharacterLabel } from '../promptEngine/pool.mjs';

const DEFAULT_PROMPT_STUDIO_MODEL = 'gemini-2.5-flash';

function linesFromGeminiText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•0-9.]+\s*/, ''))
    .filter(Boolean);
}

/** Bỏ tiền tố dạng "Tên lĩnh vực: …" / "Tên chủ đề: …" do model thêm nhầm. */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripLeadingScopedTitle(line, prefix) {
  const s = String(line || '').trim();
  const pre = String(prefix || '').trim();
  if (!s || !pre) return s;
  const re = new RegExp(`^${escapeRegExp(pre)}\\s*[:：]\\s*`, 'i');
  const out = s.replace(re, '').trim();
  return out || s;
}

function normalizePillarOutputLines(lines, industry) {
  const ind = String(industry || '').trim();
  return (Array.isArray(lines) ? lines : [])
    .map((x) => stripLeadingScopedTitle(String(x || '').trim(), ind))
    .filter(Boolean);
}

function normalizeVideoTopicOutputLines(lines, pillar) {
  const p = String(pillar || '').trim();
  return (Array.isArray(lines) ? lines : [])
    .map((x) => stripLeadingScopedTitle(String(x || '').trim(), p))
    .filter(Boolean);
}

function buildPillarsPrompt(industry, count) {
  const jitter = Math.floor(Math.random() * 1_000_000);
  return [
    'Bạn là chuyên gia chiến lược nội dung viral TikTok/Shorts tại Việt Nam.',
    `Lĩnh vực: "${industry}"`,
    `Tạo đúng ${count} chủ đề lớn (content pillars) liên quan trực tiếp lĩnh vực trên.`,
    'Ngôn ngữ: tiếng Việt.',
    'Mỗi chủ đề rõ ràng, không trùng ý, không quá 10 từ.',
    'Chỉ trả về danh sách dòng, không markdown, không đánh số.',
    'Định dạng mỗi dòng: CHỈ tên chủ đề đứng một mình (ví dụ "Review mỹ phẩm chân thực", "Giảm cân bền vững").',
    'TUYỆT ĐỐI KHÔNG thêm tên lĩnh vực đầu dòng, không dùng "Tên lĩnh vực:" hay "Lĩnh vực:" trước mỗi chủ đề — ngữ cảnh lĩnh vực đã nêu ở trên.',
    'Đa dạng giữa các lần gọi: mỗi phiên ưu tiên bộ góc khác (độ tuổi, bối cảnh nhà/văn phòng/phòng gym, mùa, myth vs khoa học, Q&A, checklist, cảnh báo) — không lặp lại cùng một “bộ mẫu” quen thuộc nếu có lựa chọn tốt hơn.',
    `(id phiên: ${jitter})`,
  ].join('\n');
}

function buildTopicsPrompt(pillar, count = 20) {
  return [
    'Bạn là chuyên gia content TikTok/Shorts/Reels tại Việt Nam (tiêu đề tiếng Việt).',
    `Chủ đề lớn (pillar): "${pillar}"`,
    `Tạo đúng ${count} dòng — mỗi dòng một tiêu đề video ngắn, riêng biệt.`,
    'Ngôn ngữ: tiếng Việt.',
    'Độ dài: ngắn gọn, khoảng 6–12 từ mỗi tiêu đề (tối đa ~14 từ); không câu dài hai vế trừ khi thật cần.',
    'Mỗi tiêu đề phải đủ ý: người xem đọc một dòng là biết clip về góc nào (vd: người mới, so sánh, checklist, sai lầm, FAQ, lộ trình ngắn…) — gói gọn trong ít chữ.',
    'Tránh khẩu hiệu rỗng kiểu chỉ "bí quyết đơn giản", "hiệu quả cao" mà không nói rõ nội dung clip.',
    'Đa dạng giữa các dòng (checklist, so sánh, myth, Q&A, cảnh báo, lộ trình…); không trùng ý.',
    'Chỉ trả về danh sách dòng, không markdown, không đánh số, không bullet.',
    'Không tiền tố "Chủ đề lớn:"; có thể nhắc pillar trong câu một cách gọn.',
    'Viết hoa chữ cái đầu tiêu đề.',
  ].join('\n');
}

function topicFallbacks(pillar, count = 20) {
  const p = String(pillar || 'Chủ đề').trim() || 'Chủ đề';
  const patterns = [
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
  const uniq = [];
  for (const t of patterns) {
    if (!uniq.includes(t)) uniq.push(t);
    if (uniq.length >= count) return uniq;
  }
  let i = 1;
  while (uniq.length < count) {
    uniq.push(`${p}: chủ đề video chuyên sâu #${i}`);
    i += 1;
  }
  return uniq;
}

function ensureCount(items, count, fallbackPrefix) {
  const want = Math.min(50, Math.max(1, Number(count) || 1));
  const cleaned = Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map((x) => String(x || '').trim())
        .filter(Boolean),
    ),
  );
  if (cleaned.length >= want) return cleaned.slice(0, want);
  let i = 1;
  while (cleaned.length < want) {
    cleaned.push(`${fallbackPrefix} ${i}`);
    i += 1;
  }
  return cleaned;
}

/** Xáo bài pool fallback để mỗi lần “Tạo” không luôn ra cùng N dòng đầu. */
function shuffleCopy(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pillarFallbacks(industry, count = 7) {
  const key = String(industry || '').toLowerCase();
  const map = [
    {
      keys: ['tình yêu', 'hẹn hò', 'crush', 'độc thân', 'mối quan hệ'],
      items: [
        'Tâm lý yêu và chữa lành',
        'Dấu hiệu đỏ/xanh trong tình yêu',
        'Bí kíp thả thính và hẹn hò',
        'Giao tiếp cảm xúc trong mối quan hệ',
        'Giữ lửa tình yêu dài lâu',
        'Câu chuyện tình yêu thực tế',
        'Phát triển bản thân sau chia tay',
        'Yêu xa và ranh giới lành mạnh',
        'Tiền và quyền lực trong đôi lứa',
        'Gia đình đối tác & ra mắt',
        'Công khai vs riêng tư trên mạng',
        'Độc thân vui vẻ & FOMO',
      ],
    },
    {
      keys: ['sức khỏe', 'dinh dưỡng', 'eat clean', 'giảm cân'],
      items: [
        'Thực đơn và dinh dưỡng khoa học',
        'Giảm cân bền vững',
        'Bài tập và phục hồi cơ thể',
        'Cảnh báo bệnh lý thường gặp',
        'Sức khỏe tinh thần & giấc ngủ',
        'Mẹo sống khỏe mỗi ngày',
        'Review thực phẩm chức năng',
        'Hydrate, điện giải & nắng nóng',
        'Meal prep & macro cho người bận',
        'Đường huyết dao động & ăn vặt',
        'Viêm nhiễm, dị ứng & hệ miễn dịch',
        'Vitamin hay thiếu (D, B12, sắt…)',
        'Microbiome & đường ruột',
        'Thai kỳ, con nhỏ & dinh dưỡng',
        'Người cao tuổi & té ngã, xương khớp',
        'Mắt, cột sống & công việc văn phòng',
        'Stress ăn uống & cảm xúc',
        'Chất lượng giấc ngủ sâu/REM',
        'Chế độ low-carb / plant-forward',
        'Hậu tập gym: ăn gì, nghỉ gì',
        'Làm đẹp da từ trong ra ngoài',
        'Tiêm chủng, sàng lọc định kỳ',
        'Khói thải, không khí & hô hấp',
      ],
    },
    {
      keys: ['bất động sản', 'nhà đất', 'chung cư'],
      items: [
        'Phân tích thị trường nhà đất',
        'Kinh nghiệm mua bán nhà',
        'Pháp lý bất động sản',
        'Đầu tư và quản lý dòng tiền',
        'Review dự án theo phân khúc',
        'Khai thác cho thuê hiệu quả',
        'Nội thất và tối ưu công năng',
        'Mua lần đầu vs đầu tư lướt sóng',
        'Lãi suất vay & trả nợ trước hạn',
        'Đất nền, chung cư, shophouse so sánh',
      ],
    },
    {
      keys: ['làm đẹp', 'skincare', 'mỹ phẩm', 'chăm da', 'dưỡng da'],
      items: [
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
        'Sản phẩm drugstore vs high-end',
        'Detox da sau makeup và peel',
      ],
    },
  ];

  const matched = map.find((g) => g.keys.some((k) => key.includes(k)));
  const base = matched?.items || [
    'Kiến thức nền tảng cho người mới',
    'Sai lầm phổ biến cần tránh',
    'Bí quyết thực hành nhanh',
    'Case study và kết quả thật',
    'Công cụ và phương pháp hiệu quả',
    'Cập nhật xu hướng mới nhất',
    'Lộ trình từ zero đến thành thạo',
    'Q&A giải đáp thắc mắc',
    'Checklist theo tuần',
    'Myth vs sự thật trong ngành',
  ];
  return ensureCount(shuffleCopy(base), count, 'Ý tưởng chủ đề');
}

/**
 * Production prompt engine: one low-temp Gemini call produces `centralThesis`; per-scene calls emit **subject + voice** only.
 * The server compiles each final prompt from a fixed template (GLOBAL_STYLE, CENTRAL_THESIS, CONSISTENCY_LOCK, INTENSITY, CHARACTER, SCENE, …).
 * Five-beat flow (Hook → Setup → Problem → Insight → Conclusion) cycles when `quantity > 5`; scene memory + intensity 1→N steer progression.
 * Each scene includes `render`: Runway/Kling/Sora-oriented strings from {@link ../promptEngine/renderPromptExtractor.mjs!buildRenderPromptBundle}.
 * With `debug: true`, the response includes `debug.rawThesis`, `debug.rawPartialOutputs`, `debug.parsedPartials`, and `debug.compiledPrompts`.
 * @param {string} apiKey
 * @param {{
 *   topic: string,
 *   style: string,
 *   duration: number,
 *   ratio: string,
 *   character: string,
 *   characterIds?: string[],
 *   characterMode?: string,
 *   humorLevel?: number,
 *   context?: string,
 *   negative?: string,
 *   voice?: string,
 *   language?: string,
 *   quantity?: number,
 *   promptDNA?: Record<string, string>,
 *   debug?: boolean,
 * }} input
 */
export async function generatePromptScenes(apiKey, input, opts = {}) {
  const model = process.env.PROMPT_STUDIO_MODEL || DEFAULT_PROMPT_STUDIO_MODEL;
  return runScenePipeline(apiKey, model, input, opts);
}

/*
 * Integration example — Prompt DNA overrides (merged with DEFAULT_PROMPT_DNA in `promptDNA.ts`):
 *
 *   await generatePromptScenes(apiKey, {
 *     topic: 'Review máy lọc không khí',
 *     style: 'cinematic',
 *     ratio: '9:16',
 *     duration: 8,
 *     character: 'Host trung tính',
 *     quantity: 5,
 *     promptDNA: {
 *       cameraBase: '24mm wide only; single focal length entire film.',
 *       lightingBase: 'High-key daylight studio; no tungsten mix.',
 *     },
 *   });
 */

export async function generateContentPillars(apiKey, industry, count = 7, opts = {}) {
  const qty = Math.min(20, Math.max(1, Number(count) || 7));
  const model = process.env.PROMPT_STUDIO_MODEL || DEFAULT_PROMPT_STUDIO_MODEL;
  try {
    const data = await geminiGenerateContent(apiKey, model, {
      generationConfig: { temperature: 0.92, topP: 0.95 },
      contents: [{ role: 'user', parts: [{ text: buildPillarsPrompt(industry, qty) }] }],
    }, { proxyUrl: opts.proxyUrl || '' });
    const text = extractTextFromGenerateContent(data);
    const parsed = linesFromGeminiText(text);
    const merged = parsed.length ? parsed : pillarFallbacks(industry, qty);
    const cleaned = normalizePillarOutputLines(merged, industry);
    return ensureCount(cleaned, qty, 'Ý tưởng chủ đề');
  } catch {
    return pillarFallbacks(industry, qty);
  }
}

export async function generateViralTopics(apiKey, pillar, count = 20, opts = {}) {
  const qty = Math.min(50, Math.max(1, Number(count) || 20));
  const model = process.env.PROMPT_STUDIO_MODEL || DEFAULT_PROMPT_STUDIO_MODEL;
  try {
    const data = await geminiGenerateContent(
      apiKey,
      model,
      {
        contents: [{ role: 'user', parts: [{ text: buildTopicsPrompt(pillar, qty) }] }],
      },
      { temperaturePurpose: 'topic', proxyUrl: opts.proxyUrl || '' },
    );
    const text = extractTextFromGenerateContent(data);
    const parsed = linesFromGeminiText(text);
    const merged = parsed.length ? parsed : topicFallbacks(pillar, qty);
    const cleaned = normalizeVideoTopicOutputLines(merged, pillar);
    return ensureCount(cleaned, qty, 'Tiêu đề clip');
  } catch {
    const fb = normalizeVideoTopicOutputLines(topicFallbacks(pillar, qty), pillar);
    return ensureCount(fb, qty, 'Tiêu đề clip');
  }
}

function cleanListLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•0-9.]+\s*/, ''))
    .filter(Boolean);
}

/** Nhãn từng dùng làm ví dụ / fallback tĩnh — model hay copy; luôn loại khỏi output. */
const STALE_CHARACTER_LABELS = new Set(
  [
    'Lốp xe dự phòng',
    'Cái móc câu',
    'Viên kẹo ngọt',
    'Chiếc phao cứu sinh',
    'Con rối gỗ',
    'Chiếc gương soi',
    'Thùng rác tái chế',
    'Mỏ neo rỉ sét',
    'Gấu bông cũ',
    'Chiếc điều khiển từ xa',
  ].map((s) => s.toLowerCase()),
);

function stripStaleCharacterLabels(items) {
  return (Array.isArray(items) ? items : [])
    .map((x) => normalizeCharacterLabel(x))
    .filter(Boolean)
    .filter((x) => !STALE_CHARACTER_LABELS.has(x.toLowerCase()));
}

function unwrapMarkdownFence(text) {
  let s = String(text || '').trim();
  if (!s.startsWith('```')) return s;
  s = s.replace(/^```[a-zA-Z0-9]*\s*\n?/, '');
  s = s.replace(/\n?```\s*$/, '');
  return s.trim();
}

/** Pool đồ vật / nhân hoá gắn ngành — dùng khi API lỗi hoặc cần ghép thêm dòng. */
const CHARACTER_POOL_BEAUTY_SKINCARE = [
  'Giọt nước',
  'Chai sữa rửa mặt',
  'Bông tẩy trang',
  'Sợi collagen',
  'Nếp nhăn',
  'Miếng mask giấy',
  'Ống serum',
  'Lớp bọt kem',
  'Cọ blend kem nền',
  'Gương đèn LED',
  'Lỗ chân lông (macro)',
  'Son tint lên môi',
  'Băng cuốn tóc spa',
  'Đá lạnh massage',
  'Mẫu tay swatch son',
];

const CHARACTER_POOL_HEALTH = [
  'Đĩa cân calorie',
  'Chai nước detox',
  'Nhịp tim đồ hoạ',
  'Đôi giày chạy bộ',
  'Tạ ấm',
  'Cơ bắp siết nhẹ',
  'Đồng hồ theo dõi giấc ngủ',
  'Meal prep hộp quân đội',
  'Viên vitamin trong lòng bàn tay',
  'Cân điện tử nhà bếp',
  'Quả táo nhắc uống nước',
  'Cây tre minh hoạ thẳng cột sống',
  'Chú ếch nhỏ mascot phục hồi',
];

/** Thực vật / động vật / đồ vật dễ nhân hoá — trộn vào mọi pool để fallback đa dạng. */
const CHARACTER_POOL_ANTHROPOMORPH = [
  'Quả dưa chuột hay than thở',
  'Quả cà chua má hồng',
  'Củ cà rốt thông thái',
  'Chú chó nhỏ hay hóng chuyện',
  'Cô mèo lông mềm khó ở',
  'Chú vịt cao su tươi cười',
  'Cây bàng già kể chuyện',
  'Cây xương rồng góc bàn',
  'Chiếc lá long lanh sương',
  'Hòn đá suối biết gật',
  'Bông hoa cúc biết cười',
  'Ốc sên chậm mà cầu toàn',
  'Con ong vàng siêng năng',
  'Que kem tan chậm trên lưỡi',
  'Ly sữa ấm có tâm trạng',
  'Muỗng canh hay drama',
  'Cặp đũa nhảy nhót',
  'Trái cam lầy vỏ dày',
  'Quả bí ngô mini đáng yêu',
  'Chú nhím nhỏ hay thắc mắc',
  'Con chim sẻ trên dây điện',
  'Cụm rêu xanh trong lọ thuỷ tinh',
  'Viên sỏi biết nháy mắt',
  'Bắp cải cuộn từng lớp bí mật',
];

const CHARACTER_POOL_REAL_ESTATE = [
  'Mô hình căn hộ mini',
  'Chùm chìa khoá',
  'Tờ sơ đồ mặt bằng',
  'Flycam ôm block',
  'Người môi giới đeo cravat',
  'Biển giá niêm yết',
  'Thước laser đo phòng',
  'Drone bay vòng dự án',
  'Hợp đồng cọc dày',
  'Mô hình shophouse',
];

const CHARACTER_POOL_FINANCE = [
  'Biểu đồ nến',
  'Thẻ ATM và POS',
  'Heo đất tiết kiệm',
  'Ứng dụng ví điện tử',
  'Bảng Excel dòng tiền',
  'Đồng xu xoay chậm',
  'Kính lúp lên báo cáo',
  'Robot tư vấn tài chính',
  'Cặp da đi họp',
];

const CHARACTER_POOL_TECH_AI = [
  'Chip bo mạch phóng đại',
  'Con trỏ chuột bay',
  'Cửa sổ terminal code',
  'Chatbot bong bóng thoại',
  'Kính VR',
  'Drone gắn camera 360',
  'Pin sạc không dây',
  'Ống kính macro pixel',
];

const CHARACTER_POOL_ENGLISH = [
  'Sổ từ vựng dán sticker',
  'App phát âm sóng âm',
  'Mic thu âm bàn',
  'Tai nghe luyện nghe',
  'Flashcard bay chậm',
  'Giáo viên online trong khung',
  'Bạn tây trong khung nhỏ',
];

const CHARACTER_POOL_PARENTING = [
  'Xe đẩy em bé',
  'Bình sữa',
  'Đồ chơi gỗ Montessori',
  'Bảng sticker hành vi tốt',
  'Sách tranh trước giờ ngủ',
  'Đồng hồ routine học',
];

const CHARACTER_POOL_FOOD_REVIEW = [
  'Hơi bốc từ nồi',
  'Thìa múc sợi phở',
  'Góc ASMR nhai giòn',
  'Đĩa topping đầy màu',
  'Camera cận cảnh sốt',
  'Ngón tay chấm nước chấm',
  'Quả dưa chuột thái lát mỏng',
  'Chú tôm sú nhún nhảy trên đĩa',
  'Củ hành tím hay rơi nước mắt',
];

const CHARACTER_POOL_LIFE_HACK = [
  'Cuộn băng keo trong suốt',
  'Chai giấm và baking soda',
  'Kẹp zip túi đông',
  'Dây rút nhựa',
  'Miếng dán nano',
  'Túi zip hút chân không',
];

const CHARACTER_POOL_DEFAULT = [
  'Host trung tính trong khung',
  'Bàn tay POV làm mẫu',
  'Người bạn phản ứng hài',
  'Khách hỏi đúng pain point',
  'Chữ lower third nhân hoá',
  'Quả dưa chuột mascot dễ thương',
  'Chú chó cỡ nhỏ làm khách mời',
  'Cây bàng mini trong chậu sứ',
];

function scoreKeywordHits(ctx, keys) {
  let n = 0;
  for (const k of keys) {
    if (ctx.includes(k)) n += 1;
  }
  return n;
}

/**
 * Chọn pool gợi ý nhân vật/đồ vật theo tiêu đề video + chủ đề lớn + lĩnh vực (không dùng template chung một kiểu).
 * @param {{ industry?: string, pillar?: string, topic?: string }} seed
 */
function pickContextualCharacterPool(seed) {
  const ctx = [seed.topic, seed.pillar, seed.industry]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const groups = [
    { keys: ['skincare', 'làm đẹp', 'mỹ phẩm', 'dưỡng da', 'tẩy trang', 'serum', 'makeup', 'son môi', 'hack', 'mask', 'spa'], items: CHARACTER_POOL_BEAUTY_SKINCARE },
    { keys: ['sức khỏe', 'dinh dưỡng', 'giảm cân', 'gym', 'tập', 'calo', 'protein', 'yoga', 'chạy bộ'], items: CHARACTER_POOL_HEALTH },
    { keys: ['bất động sản', 'nhà đất', 'căn hộ', 'đất nền', 'môi giới', 'dự án', 'cho thuê'], items: CHARACTER_POOL_REAL_ESTATE },
    { keys: ['tài chính', 'đầu tư', 'tiết kiệm', 'crypto', 'vay', 'lãi', 'ví điện tử'], items: CHARACTER_POOL_FINANCE },
    { keys: ['công nghệ', 'trí tuệ nhân tạo', 'chatgpt', 'openai', 'máy tính', 'phần mềm', 'developer', 'coding'], items: CHARACTER_POOL_TECH_AI },
    { keys: ['tiếng anh', 'english', 'ngoại ngữ', 'phát âm', 'từ vựng'], items: CHARACTER_POOL_ENGLISH },
    { keys: ['con cái', 'nuôi dạy', 'bé ', 'mẹ bỉm', 'montessori'], items: CHARACTER_POOL_PARENTING },
    { keys: ['review', 'ẩm thực', 'món ăn', 'nấu ăn', 'quán ', 'food'], items: CHARACTER_POOL_FOOD_REVIEW },
    { keys: ['mẹo vặt', 'life hack', 'vặt', 'tiện ích', 'tự làm', 'diy'], items: CHARACTER_POOL_LIFE_HACK },
    {
      keys: ['thú cưng', 'chó', 'mèo', 'động vật', 'vườn', 'cây', 'hoa', 'rau', 'trái cây', 'thiên nhiên', 'farm', 'thiếu nhi', 'cổ tích', 'mascot', 'nhân hoá'],
      items: shuffleCopy([...CHARACTER_POOL_ANTHROPOMORPH]),
    },
  ];

  let bestItems = null;
  let bestScore = 0;
  for (const g of groups) {
    const sc = scoreKeywordHits(ctx, g.keys);
    if (sc > bestScore) {
      bestScore = sc;
      bestItems = g.items;
    }
  }

  const primary = bestItems && bestScore > 0 ? [...bestItems] : [...CHARACTER_POOL_DEFAULT];
  const anthroExtra = shuffleCopy([...CHARACTER_POOL_ANTHROPOMORPH]).slice(0, 10);
  return shuffleCopy([...new Set([...primary, ...anthroExtra])]);
}

/** Gợi ý khi cần fallback: ưu tiên pool theo ngữ cảnh, có trộn thêm vai trò gắn tiêu đề video. */
function characterFallbacksFromSeed(seed, count) {
  const want = Math.min(16, Math.max(8, Number(count) || 12));
  const topic = String(seed.topic || '').trim();
  const pool = pickContextualCharacterPool(seed);
  const anchors = [];
  if (topic) {
    const clip = topic.length > 36 ? `${topic.slice(0, 33)}…` : topic;
    anchors.push(`Host mẹo — ${clip}`, `POV người thử — ${clip}`, `Nhân hoá mẹo trong clip — ${clip}`);
  }
  const merged = shuffleCopy([...pool, ...anchors, ...CHARACTER_POOL_DEFAULT]);
  return ensureCount(merged, want, 'Nhân vật clip');
}

export async function generateCharacterSuggestions(apiKey, { industry, pillar, topic, count = 12 }, opts = {}) {
  const qty = Math.min(16, Math.max(8, Number(count) || 12));
  const model = process.env.PROMPT_STUDIO_MODEL || DEFAULT_PROMPT_STUDIO_MODEL;
  const seed = { industry, pillar, topic };
  const themeLines = [
    `TIÊU ĐỀ VIDEO (ưu tiên tuyệt đối cho hình dung quay): "${topic || ''}"`,
    `Chủ đề lớn: "${pillar || ''}"`,
    `Lĩnh vực: "${industry || ''}"`,
  ].join('\n');
  const nonce = Math.floor(Math.random() * 1e9);
  const prompt = [
    'Bạn là chuyên gia gợi ý "nhân vật / đối tượng lên hình" cho video ngắn (TikTok, Shorts, Veo), tiếng Việt.',
    themeLines,
    `Nhiệm vụ: đúng ${qty} dòng — mỗi dòng MỘT thực thể quay được, KHÁC nhau về loại (đừng lặp cùng một kiểu liên tiếp).`,
    `CỐT TRUYỆN THỐNG NHẤT: cả ${qty} thực thể phải cùng MỘT mini-arc / một "đội" gắn TIÊU ĐỀ VIDEO (vd sức khỏe/giấc ngủ → đồng hồ, nhịp tim, giày tập, táo dinh dưỡng… cùng không gian buổi sáng/phòng ngủ; KHÔNG trộn ngẫu nhiên ngành khác).`,
    `BẮT BUỘC đa dạng trong cả list: có ít nhất 3 nhóm khác nhau trong tổng ${qty} dòng — gợi ý kiểu: (A) thực vật / trái / lá / cây nhân hoá dễ thương; (B) động vật nhỏ hoặc côn trùng mascot; (C) đồ vật đời thường / đạo cụ / macro; (D) host / tay POV / linh vật — luôn BÓ TRÍ theo TIÊU ĐỀ VIDEO + chủ đề lớn + lĩnh vực (vd chủ đề dinh dưỡng → trái, rau, bếp; chủ đề tập luyện → giày, tạ, nhịp tim hoạt hoạ; review đồ ăn → món, dụng cụ).`,
    'Phong cách có thể gần ví dụ sau (chỉ để hiểu format, KHÔNG sao chép nguyên xi nếu không khớp chủ đề): quả dưa chuột, con chó, con mèo, cây bàng, quả cam, củ cà rốt, chú ong, cây xương rồng… — mỗi dòng vẫn phải khớp ngữ cảnh chủ đề người dùng.',
    'Mỗi dòng: 2–9 từ tiếng Việt, không giải thích, không dấu hai chấm, không markdown, không đánh số.',
    'TUYỆT ĐỐI không đưa thực thể trái ngành hoặc trùng ý; không hai dòng chỉ đổi một từ đồng nghĩa.',
    `Chỉ trả về đúng ${qty} dòng text.`,
    `(phiên ${nonce})`,
  ].join('\n');

  const prefix = `${topic || pillar || industry || 'Chủ đề'} - nhân vật`;

  try {
    const data = await geminiGenerateContent(apiKey, model, {
      generationConfig: { temperature: 0.95, topP: 0.98 },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }, { proxyUrl: opts.proxyUrl || '' });
    const text = unwrapMarkdownFence(extractTextFromGenerateContent(data));
    const raw = cleanListLines(text).map((x) => normalizeCharacterLabel(x)).filter(Boolean);
    const stripped = stripStaleCharacterLabels(raw);
    if (stripped.length >= qty) {
      return ensureCount(stripped, qty, prefix);
    }
    if (stripped.length > 0) {
      const poolPad = shuffleCopy(pickContextualCharacterPool(seed));
      const merged = [...stripped, ...poolPad];
      return ensureCount(merged, qty, prefix);
    }
  } catch {
    /* fallback below */
  }

  return characterFallbacksFromSeed(seed, qty);
}

const STALE_CONTEXT_LINES = new Set(
  [
    'Bối cảnh studio tối giản, ánh sáng cinematic',
    'Bối cảnh đường phố năng động, chuyển động handheld',
    'Bối cảnh trong nhà ấm áp, gần gũi',
    'Bối cảnh cảm xúc mạnh, ánh sáng tương phản',
  ].map((s) => s.toLowerCase()),
);

const CONTEXT_POOL_BEAUTY = [
  'Vanity gương LED phòng tắm, hơi nước nhẹ và gạch trắng',
  'Bàn trang điểm nhà, daylight cửa sổ và macro sản phẩm',
  'Spa cabin liệu trình, ánh vàng ấm và khăn xếp tầng',
  'Kệ drugstore neon lạnh, handheld dạo quanh chai lọ',
  'Góc ASMR bồn rửa sứ, bọt kem và vòi nước chrome',
  'Phòng khách sofa sáng, swatch son tay người thật',
  'Sân thượng pool deck hoàng hôn, chủ đề chống nắng',
  'Phòng lab kệ hoạt chất, ánh neutral 5600K',
];

const CONTEXT_POOL_REAL_ESTATE = [
  'Sảnh sales gallery mô hình căn hộ, ánh trần trắng và sàn đá bóng',
  'Ban công penthouse nhìn skyline hoàng hôn, kính low-iron',
  'Căn mẫu full nội thất, dolly chậm qua phòng khách',
  'Hành lang thang máy kính block mới, đèn linear',
  'Công trường đổ bê tông xa, máy cẩu im lặng nền',
  'Flycam bãi đất nền ven đô, cọc ranh giới',
  'Phòng ký cọc văn phòng CĐT, bàn gỗ và spotlight',
  'Shophouse mặt tiền giờ cao điểm, xe máy luồng',
  'Rooftop tiện ích hồ bơi dự án resort, ghế lounger',
];

const CONTEXT_POOL_HEALTH = [
  'Phòng gym gương và tạ, neon xanh nhạt',
  'Công viên sáng sớm sương mờ, runner và giày',
  'Bếp đảo nhà, meal prep và cân điện tử',
  'Yoga mat sàn gỗ, cửa sổ mở ánh tự nhiên',
  'Phòng khám sạch trắng, thiết bị đo trên bàn',
];

const CONTEXT_POOL_FINANCE = [
  'Bàn làm việc tại nhà, hai màn hình biểu đồ nến',
  'Sảnh ngân hàng đá cẩm thạch, queue barrier xa',
  'Quán cafe coworking, laptop và ly takeaway',
  'Văn phòng startup glass wall, bảng OKR',
  'Đêm thành phố bokeh, điện thoại mở app ví',
];

const CONTEXT_POOL_TECH = [
  'Phòng server ánh xanh, rack và LED strip',
  'Bàn setup gaming RGB, màn hình cong',
  'Open office tầng cao, panorama city',
  'Bàn phím cơ macro, code editor full HD',
  'Drone bay demo công trình IoT ngoài trời',
];

const CONTEXT_POOL_FOOD = [
  'Gian bếp nhà, hơi nồi và thớt gỗ',
  'Quán phở vỉa hè, nồi nước dùng sôi',
  'Bàn ăn nhà hàng fine dining, nến thấp',
  'Xe food truck đêm, đèn string',
  'Overhead bàn topping màu, găng tay',
];

const CONTEXT_POOL_ENGLISH = [
  'Lớp học bảng trắng, marker và poster từ vựng',
  'Phòng đọc thư viện, chồng sách và cửa sổ dọc',
  'Góc học online laptop, tai nghe và mic',
  'Sân bay gate chờ, announcement mờ nền',
  'Cafe terrace nói chuyện với bạn tây',
];

const CONTEXT_POOL_PARENTING = [
  'Phòng chơi trẻ, thảm puzzle và đồ gỗ',
  'Cổng mầm non sắc màu, phụ huynh đứng chờ',
  'Ghế sau ô tô, em bé car seat',
  'Bàn ăn gia đình, chia khẩu phần nhỏ',
];

const CONTEXT_POOL_DEFAULT = [
  'Không gian thật gắn trực tiếp chủ đề, tránh studio generic',
  'POV tay người thật trong môi trường đời thường liên quan clip',
  'Góc quay ngoài trời ánh tự nhiên, handheld nhẹ',
  'Phông nền chất liệu (gỗ, vải, kim loại) cùng tông chủ đề',
];

function stripStaleContextLines(items) {
  return (Array.isArray(items) ? items : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .filter((x) => !STALE_CONTEXT_LINES.has(x.toLowerCase()));
}

function pickContextualContextPool(seed) {
  const ctx = [seed.topic, seed.pillar, seed.industry]
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const groups = [
    { keys: ['skincare', 'làm đẹp', 'mỹ phẩm', 'dưỡng da', 'tẩy trang', 'serum', 'makeup', 'spa', 'son ', 'review mỹ phẩm'], items: CONTEXT_POOL_BEAUTY },
    { keys: ['bất động sản', 'nhà đất', 'căn hộ', 'đất nền', 'môi giới', 'dự án', 'cho thuê', 'shophouse', 'penthouse'], items: CONTEXT_POOL_REAL_ESTATE },
    { keys: ['sức khỏe', 'dinh dưỡng', 'giảm cân', 'gym', 'yoga', 'chạy bộ', 'bệnh', 'phòng khám'], items: CONTEXT_POOL_HEALTH },
    { keys: ['tài chính', 'đầu tư', 'tiết kiệm', 'crypto', 'vay', 'lãi', 'ví điện tử', 'cổ phiếu'], items: CONTEXT_POOL_FINANCE },
    { keys: ['công nghệ', 'trí tuệ nhân tạo', 'chatgpt', 'openai', 'máy tính', 'phần mềm', 'developer', 'coding'], items: CONTEXT_POOL_TECH },
    { keys: ['ẩm thực', 'món ăn', 'nấu ăn', 'quán ', 'food', 'nhà hàng', 'phở '], items: CONTEXT_POOL_FOOD },
    { keys: ['tiếng anh', 'english', 'ngoại ngữ', 'phát âm', 'từ vựng'], items: CONTEXT_POOL_ENGLISH },
    { keys: ['con cái', 'nuôi dạy', 'bé ', 'mẹ bỉm', 'trẻ em'], items: CONTEXT_POOL_PARENTING },
  ];

  let bestItems = null;
  let bestScore = 0;
  for (const g of groups) {
    const sc = scoreKeywordHits(ctx, g.keys);
    if (sc > bestScore) {
      bestScore = sc;
      bestItems = g.items;
    }
  }
  if (bestItems && bestScore > 0) return [...bestItems];
  return [...CONTEXT_POOL_DEFAULT];
}

function contextFallbacksFromSeed(seed, count) {
  const want = Math.min(12, Math.max(3, Number(count) || 5));
  const topic = String(seed.topic || '').trim();
  const pool = pickContextualContextPool(seed);
  const anchor = topic
    ? [
        `Không gian thực tế khớp tiêu đề «${topic.length > 40 ? `${topic.slice(0, 37)}…` : topic}»`,
        `Một địa điểm cụ thể người xem hay gặp khi nói về «${topic.length > 34 ? `${topic.slice(0, 31)}…` : topic}»`,
      ]
    : [];
  return ensureCount(shuffleCopy([...pool, ...anchor]), want, `${topic || seed.pillar || seed.industry || 'Chủ đề'} - bối cảnh`);
}

export async function generateContextSuggestions(apiKey, { industry, pillar, topic, count = 5 }, opts = {}) {
  const qty = Math.min(12, Math.max(3, Number(count) || 5));
  const model = process.env.PROMPT_STUDIO_MODEL || DEFAULT_PROMPT_STUDIO_MODEL;
  const seed = { industry, pillar, topic };
  const nonce = Math.floor(Math.random() * 1e9);
  const themeLines = [
    `TIÊU ĐỀ VIDEO (bám sát bối cảnh): "${topic || ''}"`,
    `Chủ đề lớn: "${pillar || ''}"`,
    `Lĩnh vực: "${industry || ''}"`,
  ].join('\n');
  const prompt = [
    'Bạn là đạo diễn hình ảnh cho video ngắn TikTok/Shorts tại Việt Nam.',
    themeLines,
    `Tạo đúng ${qty} gợi ý BỐI CẢNH QUAY (địa điểm, không gian, ánh sáng, chất liệu môi trường) khớp ngành và tiêu đề trên.`,
    'Mỗi dòng một ý, tiếng Việt, tối đa 14 từ, không markdown, không đánh số.',
    'BẮT BUỘC: mỗi gợi ý phải là nơi/chất liệu/ánh sáng thật sự dùng được trong ngành đó (spa khác showroom BĐS khác bếp review đồ ăn…).',
    'KHÔNG trả về các bối cảnh “văn phòng mẫu” giống nhau cho mọi chủ đề (tránh lặp studio generic, đường phố generic, indoor generic nếu không khớp tiêu đề).',
    `(phiên ${nonce})`,
  ].join('\n');
  const prefix = `${topic || pillar || industry || 'Chủ đề'} - bối cảnh`;

  try {
    const data = await geminiGenerateContent(apiKey, model, {
      generationConfig: { temperature: 0.9, topP: 0.95 },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }, { proxyUrl: opts.proxyUrl || '' });
    const text = unwrapMarkdownFence(extractTextFromGenerateContent(data));
    const raw = cleanListLines(text).map((x) => String(x || '').trim()).filter(Boolean);
    const stripped = stripStaleContextLines(raw);
    if (stripped.length >= qty) {
      return ensureCount(stripped, qty, prefix);
    }
    if (stripped.length > 0) {
      const merged = [...stripped, ...shuffleCopy(pickContextualContextPool(seed))];
      return ensureCount(merged, qty, prefix);
    }
  } catch {
    /* fallback below */
  }

  return contextFallbacksFromSeed(seed, qty);
}

function tryParseJsonObjectFromLlmText(text) {
  const raw = unwrapMarkdownFence(String(text || '').trim());
  const attempt = (s) => {
    try {
      const o = JSON.parse(s);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
    } catch {
      return null;
    }
  };
  let o = attempt(raw);
  if (o) return o;
  const i = raw.indexOf('{');
  const j = raw.lastIndexOf('}');
  if (i >= 0 && j > i) o = attempt(raw.slice(i, j + 1));
  return o;
}

function slugCastKey(prefix, id, name) {
  const base = String(id || name || 'x')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${prefix}-${base || 'item'}`;
}

/**
 * Sinh nhân vật (có tên) + bối cảnh + visual_style từ mô tả story Text → Video (Gemini JSON).
 * @returns {{ items: Array<{ key: string, name: string, category: string, description: string }>, error?: string }}
 */
export async function generateTextVideoCast(apiKey, { storyPrompt, styleLabel = '', language = 'vi' }, opts = {}) {
  const model = process.env.TEXT_VIDEO_CAST_MODEL || process.env.PROMPT_STUDIO_MODEL || DEFAULT_PROMPT_STUDIO_MODEL;
  const sp = String(storyPrompt || '').trim();
  if (!sp) return { items: [] };
  const clipped = sp.length > 14_000 ? `${sp.slice(0, 14_000)}\n…` : sp;
  const langHint =
    String(language || 'vi').toLowerCase() === 'en'
      ? 'Use English for names and string fields in JSON when the story is English.'
      : 'Ưu tiên tiếng Việt cho name và các trường mô tả trong JSON nếu story là tiếng Việt.';

  const prompt = [
    'Bạn là đạo diễn storyboard cho video ngắn (Veo / Gemini).',
    'Nhiệm vụ: từ mô tả câu chuyện / prompt người dùng, suy ra danh sách NHÂN VẬT (có tên riêng) và BỐI CẢNH / địa điểm quan trọng, cùng một dòng visual_style.',
    langHint,
    `Gợi ý phong cách từ UI (có thể bổ sung, không copy nguyên nếu story khác): ${String(styleLabel || '—')}`,
    '',
    'Trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích ngoài JSON), đúng schema:',
    '{',
    '  "characters": [',
    '    { "id": "CHAR_1", "name": "Tên riêng", "speciesOrType": "", "gender": "", "ageOrLifeStage": "", "personality": "", "appearance": "", "roleInStory": "" }',
    '  ],',
    '  "backgrounds": [',
    '    { "id": "BACKGROUND_1", "name": "Tên địa điểm", "setting": "", "timeOfDay": "", "mood": "", "visualAnchors": "" }',
    '  ],',
    '  "visual_style": "Một đoạn văn ngắn (1–3 câu) mô tả phong cách hình ảnh thống nhất cho clip."',
    '}',
    '',
    'Ràng buộc:',
    '- Tối đa 8 nhân vật, tối đa 6 bối cảnh; nếu story đơn giản thì ít hơn.',
    '- id nhân vật bắt đầu bằng CHAR_, id bối cảnh bắt đầu bằng BACKGROUND_, đánh số tăng dần.',
    '- Mỗi nhân vật phải có "name" là tên gọi được (vd: Leo, Ms. Hoa), không chỉ loài vật chung nếu story có thể đặt tên.',
    '--- STORY / PROMPT ---',
    clipped,
  ].join('\n');

  try {
    const data = await geminiGenerateContent(
      apiKey,
      model,
      {
        generationConfig: { temperature: 0.55, topP: 0.9, maxOutputTokens: 8192 },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      },
      { proxyUrl: opts.proxyUrl || '' },
    );
    const text = extractTextFromGenerateContent(data);
    const json = tryParseJsonObjectFromLlmText(text);
    if (!json) {
      return { items: [], error: 'Model không trả JSON hợp lệ cho nhân vật & bối cảnh.' };
    }
    /** @type {Array<{ key: string, name: string, category: string, description: string }>} */
    const items = [];
    const chars = Array.isArray(json.characters) ? json.characters : [];
    const bgs = Array.isArray(json.backgrounds) ? json.backgrounds : [];
    for (const c of chars) {
      const name = String(c?.name || '').trim() || String(c?.id || 'Nhân vật').trim();
      const detail = { ...c };
      items.push({
        key: slugCastKey('char', c?.id, name),
        name,
        category: 'Nhân vật',
        description: JSON.stringify(detail, null, 2),
      });
    }
    for (const b of bgs) {
      const name = String(b?.name || '').trim() || String(b?.id || 'Bối cảnh').trim();
      const detail = { ...b };
      items.push({
        key: slugCastKey('bg', b?.id, name),
        name,
        category: 'Bối cảnh',
        description: JSON.stringify(detail, null, 2),
      });
    }
    const vs = String(json.visual_style || '').trim();
    if (vs) {
      items.push({
        key: 'visual-style',
        name: 'Phong cách hình ảnh',
        category: 'Phong cách hình ảnh',
        description: vs,
      });
    }
    return { items };
  } catch (e) {
    return { items: [], error: e?.message || String(e) };
  }
}

function normalizeStructuredScenesOutput(json, want) {
  const wantN = Math.min(32, Math.max(1, Math.floor(Number(want) || 1)));
  const arr = Array.isArray(json?.scenes) ? json.scenes : [];
  const out = [];
  for (let i = 1; i <= wantN; i++) {
    const found = arr.find((s) => String(s?.scene_id) === String(i));
    let content = String(found?.content || '').trim();
    if (!content && arr[i - 1]) {
      content = String(arr[i - 1]?.content || '').trim();
    }
    if (!content) {
      content = `Scene ${i}: continue the same story, characters, and locations — describe motion, framing, and lighting for this beat only.`;
    }
    out.push({ scene_id: String(i), content });
  }
  return { scenes: out };
}

/**
 * Phân cảnh Text → Video: JSON { scene_id, content } với @CHAR_k và #BACKGROUND_j (khớp cast nếu có).
 * @returns {{ scenes: Array<{ scene_id: string, content: string }>, error?: string }}
 */
export async function generateTextVideoStructuredScenes(
  apiKey,
  { storyPrompt, styleLabel = '', language = 'vi', sceneCount = 1, castItems = [] },
  opts = {},
) {
  const model =
    process.env.TEXT_VIDEO_SCENES_MODEL ||
    process.env.TEXT_VIDEO_CAST_MODEL ||
    process.env.PROMPT_STUDIO_MODEL ||
    DEFAULT_PROMPT_STUDIO_MODEL;
  const n = Math.min(32, Math.max(1, Math.floor(Number(sceneCount) || 1)));
  const sp = String(storyPrompt || '').trim();
  if (!sp) return { scenes: [], error: 'Thiếu storyPrompt.' };
  const clipped = sp.length > 12_000 ? `${sp.slice(0, 12_000)}\n…` : sp;

  const castPack = (Array.isArray(castItems) ? castItems : []).filter(
    (it) => it && (it.category === 'Nhân vật' || it.category === 'Bối cảnh'),
  );
  const castJson =
    castPack.length > 0
      ? JSON.stringify(
          castPack.map((it) => ({
            category: it.category,
            name: it.name,
            detail: typeof it.description === 'string' ? it.description.slice(0, 1600) : '',
          })),
          null,
          2,
        )
      : '[]';

  const langLine =
    String(language || 'vi').toLowerCase() === 'en'
      ? 'Write each "content" in clear English suitable for a cinematic video model.'
      : 'Viết "content" ưu tiên tiếng Anh (chuẩn Veo); nếu story hoàn toàn tiếng Việt thì có thể tiếng Việt.';

  const prompt = [
    'Bạn là đạo diễn storyboard cho chuỗi clip ngắn nối tiếp (Google Veo).',
    `Tạo đúng ${n} phân cảnh (scene) theo một câu chuyện liền mạch, mỗi cảnh ~8 giây tưởng tượng.`,
    langLine,
    `Preset phong cách UI (tham khảo): ${String(styleLabel || '—')}`,
    '',
    'Nếu CAST (JSON) không rỗng: trong mỗi "content" BẮT BUỘC dùng token @CHAR_k cho nhân vật và #BACKGROUND_j cho bối cảnh — chỉ các id có trong trường "detail" của CAST (ví dụ "id":"CHAR_1", "id":"BACKGROUND_2").',
    'Nếu CAST rỗng: tự đặt CHAR_1, CHAR_2, … và BACKGROUND_1, … phù hợp story.',
    '',
    'Định dạng mỗi "content":',
    '- Phần đầu: staging — liệt kê @CHAR_… (có thể nối bằng "and"), có thể kèm giới từ + #BACKGROUND_k (vd: "on #BACKGROUND_1", "inside #BACKGROUND_2").',
    '- Sau đó dùng đúng chuỗi " -> " (khoảng trắng quanh mũi tên).',
    '- Phần sau mũi tên: hành động, chuyển động, góc máy, ánh sáng cho riêng cảnh đó (1–4 câu, cụ thể).',
    '',
    'Trả về DUY NHẤT một JSON hợp lệ (không markdown, không text ngoài JSON):',
    '{"scenes":[{"scene_id":"1","content":"@CHAR_1, @CHAR_2 on #BACKGROUND_1 -> ..."}, ...]}',
    `- Đủ ${n} phần tử trong "scenes"; scene_id là chuỗi "1" đến "${n}".`,
    '',
    '--- CAST ---',
    castJson,
    '--- STORY ---',
    clipped,
  ].join('\n');

  try {
    const data = await geminiGenerateContent(
      apiKey,
      model,
      {
        generationConfig: { temperature: 0.48, topP: 0.88, maxOutputTokens: 8192 },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      },
      { proxyUrl: opts.proxyUrl || '' },
    );
    const text = extractTextFromGenerateContent(data);
    const json = tryParseJsonObjectFromLlmText(text);
    if (!json) return { scenes: [], error: 'Model không trả JSON phân cảnh.' };
    return normalizeStructuredScenesOutput(json, n);
  } catch (e) {
    return { scenes: [], error: e?.message || String(e) };
  }
}
