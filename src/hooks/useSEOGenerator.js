import { useCallback, useEffect, useState } from 'react';
import {
  generateYoutubeSeoTitles,
  generateYoutubeSeoRest,
  regenerateYoutubeSeoSection,
  generateYoutubeThumbnail,
  generateYoutubeThumbnailPrompt,
  generateYoutubeLogo,
  generateYoutubeLogoPrompt,
} from '../youtubeSeoClient.js';
import JSZip from 'jszip';

const emptyResult = () => ({
  titles: [],
  description: '',
  tags: [],
  comment: '',
  filename: '',
});

const SEO_DRAFT_STORAGE_KEY = 'veo3pro_youtube_seo_draft_v1';

function readDraft() {
  try {
    const fromLocal = localStorage.getItem(SEO_DRAFT_STORAGE_KEY);
    if (fromLocal) return JSON.parse(fromLocal);
  } catch {}
  try {
    const fromSession = sessionStorage.getItem(SEO_DRAFT_STORAGE_KEY);
    if (fromSession) return JSON.parse(fromSession);
  } catch {}
  return null;
}

function writeDraft(draft) {
  const payload = JSON.stringify(draft);
  let wrote = false;
  try {
    localStorage.setItem(SEO_DRAFT_STORAGE_KEY, payload);
    wrote = true;
  } catch {}
  try {
    sessionStorage.setItem(SEO_DRAFT_STORAGE_KEY, payload);
    wrote = true;
  } catch {}
  return wrote;
}

function clearDraft() {
  try {
    localStorage.removeItem(SEO_DRAFT_STORAGE_KEY);
  } catch {}
  try {
    sessionStorage.removeItem(SEO_DRAFT_STORAGE_KEY);
  } catch {}
}

function dataUrlToUint8(dataUrl) {
  const raw = String(dataUrl || '');
  const i = raw.indexOf('base64,');
  if (i < 0) return null;
  const b64 = raw.slice(i + 7);
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j += 1) bytes[j] = bin.charCodeAt(j);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * @param {{ onToast?: (msg: string, variant?: 'ok'|'err') => void }} opts
 */
export function useSEOGenerator(opts = {}) {
  const onToast = opts.onToast || (() => {});
  /** Khi false: chưa áp draft từ storage — không được ghi storage (tránh ghi đè bằng state rỗng). */
  const [storageReady, setStorageReady] = useState(false);

  const [language, setLanguage] = useState('vi');
  const [keyword, setKeyword] = useState('');
  const [topic, setTopic] = useState('');
  const [competitorUrl, setCompetitorUrl] = useState('');
  const [channelUrl, setChannelUrl] = useState('');

  const [result, setResult] = useState(emptyResult);
  /** Tiêu đề đã dùng để sinh mô tả (dùng cho regenerate / thumbnail) */
  const [appliedTitle, setAppliedTitle] = useState('');
  const [selectedTitleIndex, setSelectedTitleIndex] = useState(0);
  const [thumbnail, setThumbnail] = useState({ dataUrl: '', revisedPrompt: '' });
  const [logo, setLogo] = useState({ dataUrl: '', revisedPrompt: '' });
  const [thumbIdea, setThumbIdea] = useState('');
  const [logoIdea, setLogoIdea] = useState('');
  const [thumbOverlay, setThumbOverlay] = useState('');
  const [logoText, setLogoText] = useState('');
  const [thumbRefs, setThumbRefs] = useState([null, null]);
  const [imagePromptOnly, setImagePromptOnly] = useState('');
  const [logoPromptOnly, setLogoPromptOnly] = useState('');
  const [thumbnailStyle, setThumbnailStyle] = useState('realistic');
  const [thumbnailAspect, setThumbnailAspect] = useState('16:9');

  const [loadingMain, setLoadingMain] = useState(false);
  const [loadingRest, setLoadingRest] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState({});
  const [loadingThumb, setLoadingThumb] = useState(false);
  const [loadingThumbPrompt, setLoadingThumbPrompt] = useState(false);
  const [loadingLogo, setLoadingLogo] = useState(false);
  const [loadingLogoPrompt, setLoadingLogoPrompt] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const saved = readDraft();
      if (!saved || typeof saved !== 'object') {
        return;
      }
      if (typeof saved.language === 'string') setLanguage(saved.language);
      if (typeof saved.keyword === 'string') setKeyword(saved.keyword);
      if (typeof saved.topic === 'string') setTopic(saved.topic);
      if (typeof saved.competitorUrl === 'string') setCompetitorUrl(saved.competitorUrl);
      if (typeof saved.channelUrl === 'string') setChannelUrl(saved.channelUrl);
      if (saved.result && typeof saved.result === 'object') {
        setResult({
          titles: Array.isArray(saved.result.titles) ? saved.result.titles : [],
          description: typeof saved.result.description === 'string' ? saved.result.description : '',
          tags: Array.isArray(saved.result.tags) ? saved.result.tags : [],
          comment: typeof saved.result.comment === 'string' ? saved.result.comment : '',
          filename: typeof saved.result.filename === 'string' ? saved.result.filename : '',
        });
      }
      if (typeof saved.appliedTitle === 'string') setAppliedTitle(saved.appliedTitle);
      if (Number.isInteger(saved.selectedTitleIndex)) setSelectedTitleIndex(saved.selectedTitleIndex);
      if (saved.thumbnail && typeof saved.thumbnail === 'object') {
        setThumbnail({
          dataUrl: typeof saved.thumbnail.dataUrl === 'string' ? saved.thumbnail.dataUrl : '',
          revisedPrompt: typeof saved.thumbnail.revisedPrompt === 'string' ? saved.thumbnail.revisedPrompt : '',
        });
      }
      if (saved.logo && typeof saved.logo === 'object') {
        setLogo({
          dataUrl: typeof saved.logo.dataUrl === 'string' ? saved.logo.dataUrl : '',
          revisedPrompt: typeof saved.logo.revisedPrompt === 'string' ? saved.logo.revisedPrompt : '',
        });
      }
      if (typeof saved.thumbIdea === 'string') setThumbIdea(saved.thumbIdea);
      if (typeof saved.logoIdea === 'string') setLogoIdea(saved.logoIdea);
      if (typeof saved.thumbOverlay === 'string') setThumbOverlay(saved.thumbOverlay);
      if (typeof saved.logoText === 'string') setLogoText(saved.logoText);
      if (typeof saved.imagePromptOnly === 'string') setImagePromptOnly(saved.imagePromptOnly);
      if (typeof saved.logoPromptOnly === 'string') setLogoPromptOnly(saved.logoPromptOnly);
      if (typeof saved.thumbnailStyle === 'string') setThumbnailStyle(saved.thumbnailStyle);
      if (typeof saved.thumbnailAspect === 'string') setThumbnailAspect(saved.thumbnailAspect);
    } catch {}
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const draft = {
      language,
      keyword,
      topic,
      competitorUrl,
      channelUrl,
      result,
      appliedTitle,
      selectedTitleIndex,
      thumbnail,
      logo,
      thumbIdea,
      logoIdea,
      thumbOverlay,
      logoText,
      imagePromptOnly,
      logoPromptOnly,
      thumbnailStyle,
      thumbnailAspect,
    };
    const wrote = writeDraft(draft);
    if (!wrote) {
      // Fallback for quota errors: keep text-first state only.
      const liteDraft = {
        ...draft,
        thumbnail: { dataUrl: '', revisedPrompt: draft.thumbnail.revisedPrompt || '' },
        logo: { dataUrl: '', revisedPrompt: draft.logo.revisedPrompt || '' },
      };
      writeDraft(liteDraft);
    }
  }, [
    language,
    keyword,
    topic,
    competitorUrl,
    channelUrl,
    result,
    appliedTitle,
    selectedTitleIndex,
    thumbnail,
    logo,
    thumbIdea,
    logoIdea,
    thumbOverlay,
    logoText,
    imagePromptOnly,
    logoPromptOnly,
    thumbnailStyle,
    thumbnailAspect,
    storageReady,
  ]);

  useEffect(() => {
    const n = result.titles?.length || 0;
    if (n > 0 && selectedTitleIndex >= n) {
      setSelectedTitleIndex(0);
    }
  }, [result.titles, selectedTitleIndex]);

  const formPayload = useCallback(
    () => ({
      language,
      keyword: keyword.trim(),
      topic: topic.trim(),
      competitorUrl: competitorUrl.trim(),
      channelUrl: channelUrl.trim(),
    }),
    [language, keyword, topic, competitorUrl, channelUrl],
  );

  const currentTitleForApi = useCallback(() => {
    const list = result.titles || [];
    const i = Math.min(Math.max(0, selectedTitleIndex), Math.max(0, list.length - 1));
    return String(list[i] || appliedTitle || '').trim();
  }, [result.titles, selectedTitleIndex, appliedTitle]);

  /** Bước 1: chỉ sinh 10 tiêu đề */
  const generate = useCallback(async () => {
    setError('');
    const p = formPayload();
    if (!p.keyword) {
      setError('Nhập từ khóa chính.');
      onToast('Nhập từ khóa chính.', 'err');
      return;
    }
    setLoadingMain(true);
    try {
      const data = await generateYoutubeSeoTitles(p);
      setResult({
        titles: data.titles || [],
        description: '',
        tags: [],
        comment: '',
        filename: '',
      });
      setAppliedTitle('');
      setSelectedTitleIndex(0);
      setThumbnail({ dataUrl: '', revisedPrompt: '' });
      setLogo({ dataUrl: '', revisedPrompt: '' });
      setThumbIdea('');
      setLogoIdea('');
      setThumbOverlay('');
      setLogoText('');
      setThumbRefs([null, null]);
      setImagePromptOnly('');
      setLogoPromptOnly('');
      onToast('Đã tạo 10 tiêu đề — chọn một tiêu đề rồi bấm « Tạo mô tả ».', 'ok');
    } catch (e) {
      const msg = e.message || 'Lỗi';
      setError(msg);
      onToast(msg, 'err');
    } finally {
      setLoadingMain(false);
    }
  }, [formPayload, onToast]);

  /** Bước 2: mô tả, tag, comment, slug theo tiêu đề đã chọn */
  const generateRestFromSelectedTitle = useCallback(async () => {
    setError('');
    const p = formPayload();
    const title = currentTitleForApi();
    if (!p.keyword) {
      onToast('Nhập từ khóa chính.', 'err');
      return;
    }
    if (!title) {
      onToast('Chọn một tiêu đề trong danh sách.', 'err');
      return;
    }
    setLoadingRest(true);
    try {
      const data = await generateYoutubeSeoRest({ ...p, selectedTitle: title });
      setAppliedTitle(title);
      setResult((prev) => ({
        ...prev,
        description: data.description || '',
        tags: data.tags || [],
        comment: data.comment || '',
        filename: data.filename || '',
      }));
      onToast('Đã tạo mô tả, tag, comment và tên file.', 'ok');
    } catch (e) {
      onToast(e.message || 'Lỗi', 'err');
    } finally {
      setLoadingRest(false);
    }
  }, [formPayload, currentTitleForApi, onToast]);

  const regenerate = useCallback(
    async (section) => {
      setError('');
      const p = formPayload();
      if (!p.keyword) {
        onToast('Nhập từ khóa chính.', 'err');
        return;
      }
      const titleForBody =
        ['description', 'tags', 'comment', 'filename'].includes(section) ? appliedTitle || currentTitleForApi() : '';
      if (['description', 'tags', 'comment', 'filename'].includes(section) && !titleForBody) {
        onToast('Chưa có tiêu đề áp dụng — hãy bấm « Tạo mô tả » trước.', 'err');
        return;
      }
      setLoadingKeys((k) => ({ ...k, [section]: true }));
      try {
        const partial = await regenerateYoutubeSeoSection({
          ...p,
          section,
          selectedTitle: titleForBody || undefined,
        });
        setResult((prev) => {
          const next = { ...prev, ...partial };
          if (section === 'titles') {
            next.description = '';
            next.tags = [];
            next.comment = '';
            next.filename = '';
          }
          return next;
        });
        if (section === 'titles') {
          setAppliedTitle('');
          setSelectedTitleIndex(0);
        }
        onToast('Đã làm mới phần này.', 'ok');
      } catch (e) {
        onToast(e.message || 'Lỗi', 'err');
      } finally {
        setLoadingKeys((k) => ({ ...k, [section]: false }));
      }
    },
    [formPayload, appliedTitle, currentTitleForApi, onToast],
  );

  const runThumbnail = useCallback(async () => {
    setError('');
    const p = formPayload();
    if (!p.keyword) {
      onToast('Nhập từ khóa chính.', 'err');
      return;
    }
    const st = appliedTitle || currentTitleForApi();
    const refFiles = thumbRefs.filter(Boolean);
    setLoadingThumb(true);
    try {
      const out = await generateYoutubeThumbnail(
        {
          keyword: p.keyword,
          topic: p.topic,
          language: p.language,
          ideaPrompt: thumbIdea.trim(),
          overlayText: thumbOverlay.trim(),
          thumbnailPrompt: '',
          style: thumbnailStyle,
          aspectRatio: thumbnailAspect,
          selectedTitle: st || undefined,
        },
        refFiles.length ? refFiles : null,
      );
      const mime = out.mimeType || 'image/png';
      setThumbnail({
        dataUrl: `data:${mime};base64,${out.imageBase64}`,
        revisedPrompt: out.revisedPrompt || '',
      });
      onToast('Đã tạo thumbnail.', 'ok');
    } catch (e) {
      onToast(e.message || 'Lỗi thumbnail', 'err');
    } finally {
      setLoadingThumb(false);
    }
  }, [formPayload, appliedTitle, currentTitleForApi, thumbIdea, thumbOverlay, thumbRefs, thumbnailStyle, thumbnailAspect, onToast]);

  const runThumbnailPromptOnly = useCallback(async () => {
    setError('');
    const p = formPayload();
    if (!p.keyword) {
      onToast('Nhập từ khóa chính.', 'err');
      return;
    }
    const st = appliedTitle || currentTitleForApi();
    setLoadingThumbPrompt(true);
    try {
      const text = await generateYoutubeThumbnailPrompt({
        ...p,
        selectedTitle: st || undefined,
        ideaPrompt: thumbIdea.trim(),
        overlayText: thumbOverlay.trim(),
        style: thumbnailStyle,
        aspectRatio: thumbnailAspect,
      });
      setImagePromptOnly(text);
      onToast('Đã tạo prompt ảnh (chưa sinh file).', 'ok');
    } catch (e) {
      onToast(e.message || 'Lỗi', 'err');
    } finally {
      setLoadingThumbPrompt(false);
    }
  }, [formPayload, appliedTitle, currentTitleForApi, thumbIdea, thumbOverlay, thumbnailStyle, thumbnailAspect, onToast]);

  const suggestThumbnailIdea = useCallback(async () => {
    setError('');
    const p = formPayload();
    if (!p.keyword) {
      onToast('Nhập từ khóa chính.', 'err');
      return;
    }
    const st = appliedTitle || currentTitleForApi();
    setLoadingThumbPrompt(true);
    try {
      const text = await generateYoutubeThumbnailPrompt({
        ...p,
        selectedTitle: st || undefined,
        ideaPrompt: '',
        overlayText: thumbOverlay.trim(),
        style: thumbnailStyle,
        aspectRatio: thumbnailAspect,
      });
      setThumbIdea(text);
      onToast('AI đã gợi ý prompt ảnh.', 'ok');
    } catch (e) {
      onToast(e.message || 'Lỗi', 'err');
    } finally {
      setLoadingThumbPrompt(false);
    }
  }, [formPayload, appliedTitle, currentTitleForApi, thumbOverlay, thumbnailStyle, thumbnailAspect, onToast]);

  const runLogo = useCallback(async () => {
    setError('');
    const p = formPayload();
    if (!p.keyword) {
      onToast('Nhập từ khóa chính.', 'err');
      return;
    }
    setLoadingLogo(true);
    try {
      const st = appliedTitle || currentTitleForApi();
      const out = await generateYoutubeLogo({
        keyword: p.keyword,
        language: p.language,
        topic: p.topic,
        selectedTitle: st || undefined,
        // Do not inject text by default — only use logoText when user provided.
        brandName: '',
        logoIdea: logoIdea.trim(),
        logoText: logoText.trim(),
      });
      const mime = out.mimeType || 'image/png';
      setLogo({
        dataUrl: `data:${mime};base64,${out.imageBase64}`,
        revisedPrompt: out.revisedPrompt || '',
      });
      onToast('Đã tạo logo.', 'ok');
    } catch (e) {
      onToast(e.message || 'Lỗi logo', 'err');
    } finally {
      setLoadingLogo(false);
    }
  }, [formPayload, logoIdea, logoText, appliedTitle, currentTitleForApi, onToast]);

  const runLogoPromptOnly = useCallback(async () => {
    setError('');
    const p = formPayload();
    if (!p.keyword) {
      onToast('Nhập từ khóa chính.', 'err');
      return;
    }
    setLoadingLogoPrompt(true);
    try {
      const st = appliedTitle || currentTitleForApi();
      const text = await generateYoutubeLogoPrompt({
        keyword: p.keyword,
        language: p.language,
        topic: p.topic,
        selectedTitle: st || undefined,
        // Do not inject text by default — only use logoText when user provided.
        brandName: '',
        logoIdea: logoIdea.trim(),
        logoText: logoText.trim(),
      });
      setLogoPromptOnly(text);
      onToast('Đã tạo prompt logo (chưa sinh file).', 'ok');
    } catch (e) {
      onToast(e.message || 'Lỗi', 'err');
    } finally {
      setLoadingLogoPrompt(false);
    }
  }, [formPayload, logoIdea, logoText, appliedTitle, currentTitleForApi, onToast]);

  const suggestLogoIdea = useCallback(async () => {
    setError('');
    const p = formPayload();
    if (!p.keyword) {
      onToast('Nhập từ khóa chính.', 'err');
      return;
    }
    setLoadingLogoPrompt(true);
    try {
      const st = appliedTitle || currentTitleForApi();
      const text = await generateYoutubeLogoPrompt({
        keyword: p.keyword,
        language: p.language,
        topic: p.topic,
        selectedTitle: st || undefined,
        // Do not inject text by default — only use logoText when user provided.
        brandName: '',
        logoIdea: '',
        logoText: logoText.trim(),
      });
      setLogoIdea(text);
      onToast('AI đã gợi ý prompt logo.', 'ok');
    } catch (e) {
      onToast(e.message || 'Lỗi', 'err');
    } finally {
      setLoadingLogoPrompt(false);
    }
  }, [formPayload, logoText, appliedTitle, currentTitleForApi, onToast]);

  const setThumbRef = useCallback((index, file) => {
    setThumbRefs((prev) => {
      const next = [...prev];
      next[index] = file || null;
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setResult(emptyResult());
    setAppliedTitle('');
    setSelectedTitleIndex(0);
    setThumbnail({ dataUrl: '', revisedPrompt: '' });
    setLogo({ dataUrl: '', revisedPrompt: '' });
    setThumbIdea('');
    setLogoIdea('');
    setThumbOverlay('');
    setLogoText('');
    setThumbRefs([null, null]);
    setImagePromptOnly('');
    setLogoPromptOnly('');
    setError('');
    clearDraft();
    onToast('Đã xóa kết quả — nhập lại và tạo mới.', 'ok');
  }, [onToast]);

  const buildExportObject = useCallback(
    () => ({
      keyword: keyword.trim(),
      language,
      topic: topic.trim(),
      competitorUrl: competitorUrl.trim(),
      channelUrl: channelUrl.trim(),
      selectedTitle: appliedTitle || currentTitleForApi(),
      ...result,
      thumbnailRevisedPrompt: thumbnail.revisedPrompt,
      imagePromptOnly,
      logoRevisedPrompt: logo.revisedPrompt,
      logoPromptOnly,
    }),
    [
      keyword,
      language,
      topic,
      competitorUrl,
      channelUrl,
      appliedTitle,
      currentTitleForApi,
      result,
      thumbnail.revisedPrompt,
      imagePromptOnly,
      logo.revisedPrompt,
      logoPromptOnly,
    ],
  );

  const buildExportText = useCallback(() => {
    const o = buildExportObject();
    const lines = [
      `Keyword: ${o.keyword}`,
      `Tiêu đề chọn: ${o.selectedTitle || '—'}`,
      `Filename: ${o.filename}`,
      '',
      '--- TITLES ---',
      ...(o.titles || []).map((t, i) => `${i + 1}. ${t}`),
      '',
      '--- DESCRIPTION ---',
      o.description,
      '',
      '--- TAGS ---',
      (o.tags || []).join(', '),
      '',
      '--- PINNED COMMENT ---',
      o.comment,
      '',
      ...(o.imagePromptOnly ? ['--- PROMPT ẢNH (chỉ prompt) ---', o.imagePromptOnly] : []),
      ...(o.logoPromptOnly ? ['', '--- PROMPT LOGO (chỉ prompt) ---', o.logoPromptOnly] : []),
    ];
    return lines.join('\n');
  }, [buildExportObject]);

  const downloadTextBundle = useCallback(() => {
    const o = buildExportObject();
    const textContent = buildExportText();
    const safeName = String(o.filename || o.keyword || 'youtube-seo')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'youtube-seo';
    const zip = new JSZip();
    const folder = zip.folder(`youtube-seo-${safeName}`);
    if (!folder) return;
    folder.file('content.txt', textContent);
    folder.file('content.json', JSON.stringify(o, null, 2));
    const bannerBytes = dataUrlToUint8(thumbnail.dataUrl);
    if (bannerBytes) folder.file('banner.png', bannerBytes);
    const logoBytes = dataUrlToUint8(logo.dataUrl);
    if (logoBytes) folder.file('logo.png', logoBytes);

    zip
      .generateAsync({ type: 'blob' })
      .then((blob) => {
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `youtube-seo-${safeName}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        onToast('Đã tải gói ZIP (txt/json/banner/logo).', 'ok');
      })
      .catch(() => {
        onToast('Không thể tạo file ZIP.', 'err');
      });
  }, [buildExportObject, buildExportText, thumbnail.dataUrl, logo.dataUrl, onToast]);

  const downloadTxtOnly = useCallback(() => {
    const o = buildExportObject();
    const textContent = buildExportText();
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${o.filename || 'youtube-seo'}-bundle.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    onToast('Đã tải file TXT.', 'ok');
  }, [buildExportObject, buildExportText, onToast]);

  const copyAllBundle = useCallback(async () => {
    const textContent = buildExportText();
    if (!textContent.trim()) {
      onToast('Chưa có nội dung để copy.', 'err');
      return;
    }
    await navigator.clipboard.writeText(textContent);
    onToast('Đã copy toàn bộ nội dung.', 'ok');
  }, [buildExportText, onToast]);

  const downloadJsonBundle = useCallback(() => {
    const o = buildExportObject();
    const blob = new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${o.filename || 'youtube-seo'}-bundle.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    onToast('Đã tải file .json', 'ok');
  }, [buildExportObject, onToast]);

  const hasTitles = Boolean(result.titles?.length);
  const hasBody = Boolean(result.description);

  return {
    language,
    setLanguage,
    keyword,
    setKeyword,
    topic,
    setTopic,
    competitorUrl,
    setCompetitorUrl,
    channelUrl,
    setChannelUrl,
    result,
    appliedTitle,
    selectedTitleIndex,
    setSelectedTitleIndex,
    thumbnail,
    logo,
    thumbIdea,
    setThumbIdea,
    logoIdea,
    setLogoIdea,
    thumbOverlay,
    setThumbOverlay,
    logoText,
    setLogoText,
    thumbRefs,
    setThumbRef,
    imagePromptOnly,
    setImagePromptOnly,
    logoPromptOnly,
    setLogoPromptOnly,
    thumbnailStyle,
    setThumbnailStyle,
    thumbnailAspect,
    setThumbnailAspect,
    loadingMain,
    loadingRest,
    loadingKeys,
    loadingThumb,
    loadingThumbPrompt,
    loadingLogo,
    loadingLogoPrompt,
    error,
    generate,
    generateRestFromSelectedTitle,
    regenerate,
    runThumbnail,
    runThumbnailPromptOnly,
    suggestThumbnailIdea,
    runLogo,
    runLogoPromptOnly,
    suggestLogoIdea,
    resetAll,
    copyAllBundle,
    downloadTextBundle,
    downloadTxtOnly,
    downloadJsonBundle,
    hasTitles,
    hasBody,
    /** @deprecated dùng hasTitles / hasBody */
    hasResults: hasTitles || hasBody,
  };
}
