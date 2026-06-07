import { geminiGenerateContent, extractTextFromGenerateContent } from './geminiRest.js';

function model() {
  return String(process.env.GEMINI_YT_SEO_MODEL || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
}

function parseJsonLoose(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Gemini trả về nội dung rỗng.');
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Không parse được JSON từ Gemini.');
  }
}

function ctxBlock({ languageLabel, keyword, topic, competitorUrl, channelUrl, selectedTitle }) {
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

export async function generateTitlesBundleGemini(apiKey, ctx, opts = {}) {
  const prompt = [
    'Return JSON only: {"titles": string[]} — exactly 10 distinct strings. No numbering prefixes in strings.',
    ctxBlock(ctx),
    'Generate 10 highly clickable YouTube titles optimized for SEO with the keyword. Make them engaging, emotional, and curiosity-driven.',
  ].join('\n\n');
  const data = await geminiGenerateContent(apiKey, model(), { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.85 } }, { proxyUrl: opts.proxyUrl || '' });
  const j = parseJsonLoose(extractTextFromGenerateContent(data));
  const titles = Array.isArray(j.titles) ? j.titles.map((t) => String(t).trim()).filter(Boolean) : [];
  if (titles.length < 5) throw new Error('Model trả về ít title hơn mong đợi.');
  return titles.slice(0, 10);
}

export async function generateDescriptionBundleGemini(apiKey, ctx, opts = {}) {
  const prompt = [
    'You write YouTube descriptions. Plain text only — no JSON, no markdown fences. About 250 words unless slightly over is needed for flow.',
    ctxBlock(ctx),
    'Write a 250-word YouTube description optimized for SEO for the video using the exact title above. Include a strong hook, natural keyword usage, and a call-to-action (subscribe, like).',
  ].join('\n\n');
  const data = await geminiGenerateContent(apiKey, model(), { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.65 } }, { proxyUrl: opts.proxyUrl || '' });
  const text = String(extractTextFromGenerateContent(data) || '').trim();
  if (!text) throw new Error('Mô tả trả về rỗng.');
  return text;
}

export async function generateTagsBundleGemini(apiKey, ctx, opts = {}) {
  const prompt = [
    'Return JSON only: {"tags": string[]} — exactly 25 short keyword phrases, no # symbol.',
    ctxBlock(ctx),
    'Generate 25 SEO keywords for this specific video title and topic. Focus on high search intent and YouTube discoverability.',
  ].join('\n\n');
  const data = await geminiGenerateContent(apiKey, model(), { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.55 } }, { proxyUrl: opts.proxyUrl || '' });
  const j = parseJsonLoose(extractTextFromGenerateContent(data));
  const tags = Array.isArray(j.tags) ? j.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  if (tags.length < 12) throw new Error('Model trả về ít tag hơn mong đợi.');
  return tags.slice(0, 25);
}

export async function generateCommentBundleGemini(apiKey, ctx, opts = {}) {
  const prompt = [
    'You write one pinned-comment style paragraph. Plain text only.',
    ctxBlock(ctx),
    'Write a pinned comment that encourages engagement, asks a question, and promotes subscribing for this video (use the title above).',
  ].join('\n\n');
  const data = await geminiGenerateContent(apiKey, model(), { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } }, { proxyUrl: opts.proxyUrl || '' });
  const text = String(extractTextFromGenerateContent(data) || '').trim();
  if (!text) throw new Error('Comment trả về rỗng.');
  return text;
}

export async function generateFilenameSlugGemini(apiKey, ctx, opts = {}) {
  const prompt = [
    'Return JSON only: {"filename":"..."}. The filename must be a single SEO slug: lowercase ASCII letters, digits, hyphens only; no spaces; 3–80 chars.',
    ctxBlock(ctx),
    'Create one SEO-friendly file name slug (ASCII, hyphens) primarily from the selected video title; use keyword/topic if needed.',
  ].join('\n\n');
  const data = await geminiGenerateContent(apiKey, model(), { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.35 } }, { proxyUrl: opts.proxyUrl || '' });
  const j = parseJsonLoose(extractTextFromGenerateContent(data));
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

export async function competitorAnalysisGemini(apiKey, { kind, competitorUrl, keyword, topic, languageLabel }, opts = {}) {
  const urlLine = competitorUrl?.trim() ? `Competitor URL: ${competitorUrl}` : 'No URL provided — infer generic YouTube best practices.';
  const base = `Keyword: ${keyword}\nTopic: ${topic || '(none)'}\n${urlLine}\nRespond in ${languageLabel}.`;
  const prompts = {
    category: `${base}\n\nAnalyze likely content category/niche for this competitor (infer from URL/title patterns if needed). Return JSON: {"summary": string, "likelyCategory": string, "recommendations": string[] }`,
    tags: `${base}\n\nSuggest tag strategy vs competitor. Return JSON: {"summary": string, "suggestedTags": string[], "notes": string}`,
    insights: `${base}\n\nGive strategic video insights (hook, pacing, differentiation). Return JSON: {"summary": string, "hookIdeas": string[], "differentiation": string, "risks": string }`,
  };
  const prompt = ['You are a YouTube SEO strategist. JSON only, no markdown.', prompts[kind] || prompts.insights].join('\n\n');
  const data = await geminiGenerateContent(apiKey, model(), { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5 } }, { proxyUrl: opts.proxyUrl || '' });
  return parseJsonLoose(extractTextFromGenerateContent(data));
}

const STYLE_MAP = {
  realistic: 'photorealistic, natural lighting, sharp detail, looks like a real photo',
  '3d': 'high-end 3D render, octane-style, soft global illumination',
  cinematic: 'cinematic film look, dramatic lighting, widescreen composition, shallow depth of field, color graded',
  cartoon: 'bold cartoon illustration, expressive characters, vibrant flat colors',
  minimal: 'minimalist graphic design, bold typography area, clean negative space',
};

export async function generateThumbnailPromptTextGemini(apiKey, {
  languageLabel,
  keyword,
  topic,
  selectedTitle,
  ideaPrompt,
  overlayText,
  styleId,
  aspectRatio,
}, opts = {}) {
  const styleHint = STYLE_MAP[styleId] || STYLE_MAP.realistic;
  const ratio =
    aspectRatio === '9:16' ? '9:16 vertical short' : aspectRatio === '1:1' ? '1:1 square logo/artwork' : '16:9 YouTube thumbnail';
  const prompt = [
    'You write ONE detailed image-generation prompt in English for an image model (YouTube thumbnail).',
    'Plain text only — no markdown, no quotes around the whole prompt. Max ~1200 characters.',
    'Concrete visuals, lighting, composition, colors. High contrast, readable at small size.',
    ctxBlock({ languageLabel, keyword, topic, competitorUrl: '', channelUrl: '', selectedTitle }),
    `Aspect: ${ratio}.`,
    `Style direction: ${styleHint}.`,
    ideaPrompt ? `Creator idea / brief:\n${String(ideaPrompt).slice(0, 1500)}` : '',
    overlayText ? `Must include readable on-thumbnail text (short): "${String(overlayText).slice(0, 80)}"` : '',
    '\nWrite the final English image prompt only.',
  ].filter(Boolean).join('\n\n');
  const data = await geminiGenerateContent(apiKey, model(), { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.55 } }, { proxyUrl: opts.proxyUrl || '' });
  const text = String(extractTextFromGenerateContent(data) || '').trim();
  if (!text) throw new Error('Không sinh được prompt ảnh.');
  return text;
}

export async function generateLogoPromptTextGemini(apiKey, {
  languageLabel,
  keyword,
  brandName,
  logoIdea,
  logoText,
  topic,
  selectedTitle,
}, opts = {}) {
  const wantsText = Boolean(String(logoText || '').trim() || String(brandName || '').trim());
  const prompt = [
    'You are a senior brand designer.',
    'Output exactly ONE English image prompt for a FLAT VECTOR LOGO ONLY (symbol / monogram / simple pictogram).',
    wantsText
      ? 'Include a short clean wordmark ONLY because text was explicitly provided.'
      : 'CRITICAL: Do NOT include ANY text, letters, words, numbers, or typography. Icon/mark only.',
    'Describe only the logo: shapes, negative space, 1–3 colors, typography mood ONLY if text is included.',
    'Topic + keyword + title must inspire the MARK (metaphor), not a literal scene, poster, or stock photo.',
    'Forbidden: photograph, realism, landscapes, people, devices, YouTube thumbnail, banner, busy illustration, watermarks.',
    'Plain text only, no markdown. Max ~900 characters.',
    `Brand language: ${languageLabel}.`,
    `Main niche keyword: ${keyword}.`,
    topic ? `Video topic / channel focus:\n${String(topic).slice(0, 900)}` : '',
    selectedTitle ? `Representative title:\n${String(selectedTitle).slice(0, 320)}` : '',
    brandName ? `Brand / channel label: ${String(brandName).slice(0, 120)}` : '',
    logoText ? `Text in logo (wordmark): "${String(logoText).slice(0, 80)}"` : '',
    logoIdea ? `Designer brief:\n${String(logoIdea).slice(0, 1500)}` : '',
    'Write the single final English image prompt for this square logo.',
  ].filter(Boolean).join('\n\n');
  const data = await geminiGenerateContent(apiKey, model(), { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5 } }, { proxyUrl: opts.proxyUrl || '' });
  const text = String(extractTextFromGenerateContent(data) || '').trim();
  if (!text) throw new Error('Không sinh được prompt logo.');
  return text;
}

