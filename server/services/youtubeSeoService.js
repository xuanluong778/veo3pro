import OpenAI, { toFile } from 'openai';
import { getProxyDispatcher } from './proxyService.js';

function getClient(opts = {}) {
  const apiKey = String(opts.apiKey || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Chưa cấu hình OPENAI_API_KEY trong .env.');
  }
  const baseURL = typeof opts.baseURL === 'string' ? opts.baseURL.trim() : '';
  const dispatcher = getProxyDispatcher(opts.proxyUrl || '');
  const fetchWithProxy = dispatcher
    ? (url, init = {}) => fetch(url, { ...init, dispatcher })
    : undefined;
  return new OpenAI(baseURL ? { apiKey, baseURL, ...(fetchWithProxy ? { fetch: fetchWithProxy } : {}) } : { apiKey, ...(fetchWithProxy ? { fetch: fetchWithProxy } : {}) });
}

function chatModel() {
  return String(process.env.OPENAI_YT_SEO_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
}

function imageModel() {
  return String(process.env.OPENAI_YT_SEO_IMAGE_MODEL || 'dall-e-3').trim() || 'dall-e-3';
}

function parseJsonLoose(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('OpenAI trả về nội dung rỗng.');
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Không parse được JSON từ OpenAI.');
  }
}

function contextBlock({ languageLabel, keyword, topic, competitorUrl, channelUrl, selectedTitle }) {
  const lines = [
    `Output language for user-visible text: ${languageLabel}.`,
    `Main keyword: ${keyword}.`,
    selectedTitle ? `Selected YouTube title (use consistently across outputs):\n${selectedTitle}` : '',
    topic ? `Video topic / description:\n${topic}` : '',
    competitorUrl ? `Competitor video URL (for inference only; you cannot fetch it): ${competitorUrl}` : '',
    channelUrl ? `User channel URL (optional context): ${channelUrl}` : '',
  ].filter(Boolean);
  return lines.join('\n\n');
}

export async function generateTitlesBundle(ctx, clientOpts = {}) {
  const client = getClient(clientOpts);
  const model = chatModel();
  const userCtx = contextBlock(ctx);
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You return JSON only: {"titles": string[]} — exactly 10 distinct strings. No numbering prefixes in strings.',
      },
      {
        role: 'user',
        content: `${userCtx}\n\nGenerate 10 highly clickable YouTube titles optimized for SEO with the keyword. Make them engaging, emotional, and curiosity-driven.`,
      },
    ],
    temperature: 0.85,
    max_tokens: 1200,
  });
  const text = completion.choices[0]?.message?.content;
  const j = parseJsonLoose(text);
  const titles = Array.isArray(j.titles) ? j.titles.map((t) => String(t).trim()).filter(Boolean) : [];
  if (titles.length < 5) throw new Error('Model trả về ít title hơn mong đợi.');
  return titles.slice(0, 10);
}

export async function generateDescriptionBundle(ctx, clientOpts = {}) {
  const client = getClient(clientOpts);
  const model = chatModel();
  const userCtx = contextBlock(ctx);
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'You write YouTube descriptions. Plain text only — no JSON, no markdown fences. About 250 words unless slightly over is needed for flow.',
      },
      {
        role: 'user',
        content: `${userCtx}\n\nWrite a 250-word YouTube description optimized for SEO for the video using the exact title above. Include a strong hook, natural keyword usage, and a call-to-action (subscribe, like).`,
      },
    ],
    temperature: 0.65,
    max_tokens: 900,
  });
  const text = String(completion.choices[0]?.message?.content || '').trim();
  if (!text) throw new Error('Mô tả trả về rỗng.');
  return text;
}

export async function generateTagsBundle(ctx, clientOpts = {}) {
  const client = getClient(clientOpts);
  const model = chatModel();
  const userCtx = contextBlock(ctx);
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Return JSON only: {"tags": string[]} — exactly 25 short keyword phrases, no # symbol.',
      },
      {
        role: 'user',
        content: `${userCtx}\n\nGenerate 25 SEO keywords for this specific video title and topic. Focus on high search intent and YouTube discoverability.`,
      },
    ],
    temperature: 0.55,
    max_tokens: 900,
  });
  const text = completion.choices[0]?.message?.content;
  const j = parseJsonLoose(text);
  const tags = Array.isArray(j.tags) ? j.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  if (tags.length < 12) throw new Error('Model trả về ít tag hơn mong đợi.');
  return tags.slice(0, 25);
}

export async function generateCommentBundle(ctx, clientOpts = {}) {
  const client = getClient(clientOpts);
  const model = chatModel();
  const userCtx = contextBlock(ctx);
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: 'You write one pinned-comment style paragraph. Plain text only.',
      },
      {
        role: 'user',
        content: `${userCtx}\n\nWrite a pinned comment that encourages engagement, asks a question, and promotes subscribing for this video (use the title above).`,
      },
    ],
    temperature: 0.7,
    max_tokens: 400,
  });
  const text = String(completion.choices[0]?.message?.content || '').trim();
  if (!text) throw new Error('Comment trả về rỗng.');
  return text;
}

export async function generateFilenameSlug(ctx, clientOpts = {}) {
  const client = getClient(clientOpts);
  const model = chatModel();
  const userCtx = contextBlock(ctx);
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Return JSON only: {"filename":"..."}. The filename must be a single SEO slug: lowercase ASCII letters, digits, hyphens only; no spaces; 3–80 chars. Example: cach-kiem-tien-online-bang-ai-2024',
      },
      {
        role: 'user',
        content: `${userCtx}\n\nCreate one SEO-friendly file name slug (ASCII, hyphens) primarily from the selected video title; use keyword/topic if needed. Suitable for a video file.`,
      },
    ],
    temperature: 0.35,
    max_tokens: 120,
  });
  const text = completion.choices[0]?.message?.content;
  const j = parseJsonLoose(text);
  let slug = String(j.filename || j.slug || '').trim().toLowerCase();
  slug = slug.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug || slug.length < 3) {
    const fallback = String(ctx.selectedTitle || ctx.keyword || 'video')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    slug = fallback;
  }
  return slug.slice(0, 96);
}

/** Bước 1: chỉ tiêu đề */
export async function generateTitlesOnly(ctx, clientOpts = {}) {
  const titles = await generateTitlesBundle(ctx, clientOpts);
  return { titles };
}

/** Bước 2: mô tả, tag, comment, slug — cần `ctx.selectedTitle` */
export async function generateRestParallel(ctx, clientOpts = {}) {
  const t = String(ctx.selectedTitle || '').trim();
  if (!t) throw new Error('Thiếu tiêu đề đã chọn.');
  const [description, tags, comment, filename] = await Promise.all([
    generateDescriptionBundle({ ...ctx, selectedTitle: t }, clientOpts),
    generateTagsBundle({ ...ctx, selectedTitle: t }, clientOpts),
    generateCommentBundle({ ...ctx, selectedTitle: t }, clientOpts),
    generateFilenameSlug({ ...ctx, selectedTitle: t }, clientOpts),
  ]);
  return { description, tags, comment, filename };
}

const STYLE_MAP = {
  realistic: 'photorealistic, natural lighting, sharp detail, looks like a real photo',
  '3d': 'high-end 3D render, octane-style, soft global illumination',
  cinematic: 'cinematic film look, dramatic lighting, widescreen composition, shallow depth of field, color graded',
  cartoon: 'bold cartoon illustration, expressive characters, vibrant flat colors',
  minimal: 'minimalist graphic design, bold typography area, clean negative space',
};

export async function generateThumbnail({
  keyword,
  topic,
  languageLabel,
  userPrompt,
  styleId,
  aspectRatio,
  referenceBuffer,
  referenceMime,
  selectedTitle,
}, clientOpts = {}) {
  const client = getClient(clientOpts);
  const styleHint = STYLE_MAP[styleId] || STYLE_MAP.realistic;
  const size = aspectRatio === '9:16' ? '1024x1792' : aspectRatio === '1:1' ? '1024x1024' : '1792x1024';

  const basePrompt = [
    selectedTitle ? `YouTube thumbnail for video titled: "${String(selectedTitle).slice(0, 200)}".` : `YouTube thumbnail for video about: "${keyword}".`,
    topic ? `Context: ${topic.slice(0, 500)}` : '',
    `Language vibe: ${languageLabel}.`,
    `Visual style: ${styleHint}.`,
    'High contrast, readable at small size, eye-catching composition, no tiny text, max 3–4 short words if any text.',
    userPrompt ? `Extra direction: ${userPrompt}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (referenceBuffer?.length) {
    try {
      const ext = String(referenceMime || '').includes('jpeg') ? 'jpg' : 'png';
      const mime = referenceMime && /^image\//.test(referenceMime) ? referenceMime : 'image/png';
      const file = await toFile(referenceBuffer, `reference.${ext}`, { type: mime });
      const res = await client.images.edit({
        model: 'gpt-image-1',
        image: file,
        prompt: `${basePrompt}\n\nTransform into a bold YouTube thumbnail layout; keep subject continuity with the reference.`,
        size: aspectRatio === '9:16' ? '1024x1536' : aspectRatio === '1:1' ? '1024x1024' : '1536x1024',
        quality: 'high',
        input_fidelity: 'high',
      });
      const b64 = res.data?.[0]?.b64_json;
      if (b64) return { b64, revisedPrompt: res.data?.[0]?.revised_prompt };
    } catch (e) {
      console.warn('[youtube-seo] thumbnail edit fallback to generate:', e.message);
    }
  }

  const model = imageModel();
  const genModel =
    model === 'gpt-image-1' || model === 'gpt-image-1-mini' || model === 'gpt-image-1.5' ? 'dall-e-3' : model;

  const res = await client.images.generate({
    model: genModel,
    prompt: basePrompt.slice(0, 3900),
    size,
    quality: 'hd',
    response_format: 'b64_json',
    style: 'vivid',
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('Không nhận được ảnh từ OpenAI.');
  return { b64, revisedPrompt: res.data?.[0]?.revised_prompt };
}

/** Chỉ sinh prompt ảnh (không gọi Images API) */
export async function generateThumbnailPromptText({
  languageLabel,
  keyword,
  topic,
  selectedTitle,
  ideaPrompt,
  overlayText,
  styleId,
  aspectRatio,
}, clientOpts = {}) {
  const client = getClient(clientOpts);
  const model = chatModel();
  const styleHint = STYLE_MAP[styleId] || STYLE_MAP.realistic;
  const ratio =
    aspectRatio === '9:16' ? '9:16 vertical short' : aspectRatio === '1:1' ? '1:1 square logo/artwork' : '16:9 YouTube thumbnail';
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'You write ONE detailed image-generation prompt in English for DALL-E / OpenAI Images (YouTube thumbnail). Plain text only — no markdown, no quotes around the whole prompt. Max ~1200 characters, concrete visuals, lighting, composition, colors. If user wants on-image text, specify LARGE legible typography.',
      },
      {
        role: 'user',
        content: [
          `Output context language for tone: ${languageLabel}.`,
          `Keyword: ${keyword}.`,
          topic ? `Topic:\n${topic.slice(0, 800)}` : '',
          selectedTitle ? `Video title:\n${String(selectedTitle).slice(0, 300)}` : '',
          `Aspect: ${ratio}.`,
          `Style direction: ${styleHint}.`,
          ideaPrompt ? `Creator idea / brief:\n${String(ideaPrompt).slice(0, 1500)}` : '',
          overlayText ? `Must include readable on-thumbnail text (short): "${String(overlayText).slice(0, 80)}"` : '',
          '\nWrite the final English image prompt only.',
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
    temperature: 0.55,
    max_tokens: 900,
  });
  const text = String(completion.choices[0]?.message?.content || '').trim();
  if (!text) throw new Error('Không sinh được prompt ảnh.');
  return text;
}

export async function generateLogoPromptText(
  { languageLabel, keyword, brandName, logoIdea, logoText, topic, selectedTitle },
  clientOpts = {},
) {
  const client = getClient(clientOpts);
  const model = chatModel();
  const wantsText = Boolean(String(logoText || '').trim() || String(brandName || '').trim());
  const ctxLines = [
    `Brand language: ${languageLabel}.`,
    `Main niche keyword: ${keyword}.`,
    topic ? `Video topic / channel focus (symbols must reflect THIS, not generic stock imagery):\n${String(topic).slice(0, 900)}` : '',
    selectedTitle ? `Representative title (tone & positioning):\n${String(selectedTitle).slice(0, 320)}` : '',
    brandName ? `Brand / channel label: ${String(brandName).slice(0, 120)}` : '',
    logoText ? `Text to include IN the logo (wordmark style only): "${String(logoText).slice(0, 80)}"` : '',
    logoIdea ? `Designer brief / extra direction:\n${String(logoIdea).slice(0, 1500)}` : '',
  ].filter(Boolean);

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: [
          'You are a senior brand designer.',
          'Output exactly ONE English image prompt for a FLAT VECTOR LOGO ONLY: abstract mark, monogram, or simple pictogram.',
          wantsText
            ? 'Include a short clean wordmark ONLY because text was explicitly provided.'
            : 'CRITICAL: Do NOT include ANY text, letters, words, numbers, or typography. Icon/mark only.',
          'The prompt must describe ONLY the logo graphic (shapes, negative space, 1–3 colors, font mood if text).',
          'The niche + topic + title should inspire the SYMBOL (metaphor), never a literal scene or poster.',
          'Strictly forbid: photograph, realism, landscapes, interiors, laptops, phones, people, faces, hands, mascot in an environment, YouTube thumbnail, banner, flyer, collage, watermark, lens flare, textured photo background.',
          'Plain text — no markdown, no quotes wrapping the answer. Target under 900 characters.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          ...ctxLines,
          'Write the single final English image prompt for generating this logo on a square canvas.',
        ].join('\n\n'),
      },
    ],
    temperature: 0.45,
    max_tokens: 800,
  });
  const text = String(completion.choices[0]?.message?.content || '').trim();
  if (!text) throw new Error('Không sinh được prompt logo.');
  return text;
}

export async function generateLogoImage(
  { keyword, languageLabel, brandName, logoIdea, logoText, topic, selectedTitle },
  clientOpts = {},
) {
  const client = getClient(clientOpts);
  const model = imageModel();
  const genModel =
    model === 'gpt-image-1' || model === 'gpt-image-1-mini' || model === 'gpt-image-1.5' ? 'dall-e-3' : model;
  const wantsText = Boolean(String(logoText || '').trim() || String(brandName || '').trim());

  const briefPrompt = await generateLogoPromptText(
    { languageLabel, keyword, brandName, logoIdea, logoText, topic, selectedTitle },
    clientOpts,
  );

  const finalPrompt = [
    'LOGO OUTPUT ONLY — not an illustration, not a photo, not a scene.',
    wantsText
      ? 'Flat vector-style brand mark + short wordmark (because text was provided), centered in the square, generous padding.'
      : 'Flat vector-style brand mark only (NO TEXT), centered in the square, generous padding.',
    'No background story, no props, no devices, no people, no room, no mockup frame.',
    'Solid flat background (one color) or clean empty void; no busy textures.',
    '',
    briefPrompt,
  ]
    .join('\n')
    .slice(0, 3900);

  const req = {
    model: genModel,
    prompt: finalPrompt,
    size: '1024x1024',
    response_format: 'b64_json',
    n: 1,
  };
  if (genModel === 'dall-e-3') {
    req.quality = 'hd';
    req.style = 'natural';
  }

  const res = await client.images.generate(req);
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('Không nhận được logo từ OpenAI.');
  return { b64, revisedPrompt: res.data?.[0]?.revised_prompt };
}

export async function competitorAnalysis({ kind, competitorUrl, keyword, topic, languageLabel }, clientOpts = {}) {
  const client = getClient(clientOpts);
  const model = chatModel();
  const urlLine = competitorUrl?.trim() ? `Competitor URL: ${competitorUrl}` : 'No URL provided — infer generic YouTube best practices.';
  const base = `Keyword: ${keyword}\nTopic: ${topic || '(none)'}\n${urlLine}\nRespond in ${languageLabel}.`;

  const prompts = {
    category: `${base}\n\nAnalyze likely content category/niche for this competitor (infer from URL/title patterns if needed). Return JSON: {"summary": string, "likelyCategory": string, "recommendations": string[] }`,
    tags: `${base}\n\nSuggest tag strategy vs competitor. Return JSON: {"summary": string, "suggestedTags": string[], "notes": string}`,
    insights: `${base}\n\nGive strategic video insights (hook, pacing, differentiation). Return JSON: {"summary": string, "hookIdeas": string[], "differentiation": string, "risks": string }`,
  };

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You are a YouTube SEO strategist. JSON only, no markdown.' },
      { role: 'user', content: prompts[kind] || prompts.insights },
    ],
    temperature: 0.5,
    max_tokens: 1200,
  });
  const text = completion.choices[0]?.message?.content;
  return parseJsonLoose(text);
}
