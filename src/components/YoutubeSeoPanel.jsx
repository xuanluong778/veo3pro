import { useCallback, useRef, useState } from 'react';
import { useSEOGenerator } from '../hooks/useSEOGenerator.js';

const LANGUAGES = [
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
  { id: 'ja', label: '日本語' },
  { id: 'ko', label: '한국어' },
  { id: 'zh', label: '中文' },
  { id: 'pt', label: 'Português' },
  { id: 'id', label: 'Bahasa Indonesia' },
  { id: 'th', label: 'ไทย' },
];

const THUMB_STYLE_PILLS = [
  { id: 'realistic', label: 'Ảnh Thật' },
  { id: '3d', label: '3D Render' },
  { id: 'cinematic', label: 'Điện Ảnh' },
  { id: 'cartoon', label: 'Hoạt Hình' },
  { id: 'minimal', label: 'Tối Giản' },
];

/** Công cụ bên ngoài — mở tab mới (TubePilot, Rapidtags, MW Metadata). */
const YT_EXT_TOOLS = {
  category: 'https://tubepilot.ai/tools/youtube-category-checker/',
  tags: 'https://rapidtags.io/',
  metadata: 'https://mattw.io/youtube-metadata/',
};

const SEO_CANVA_THUMB_URL = 'https://canva.link/qzrdg54hzetu54m';
const SEO_BELL_ASSETS_URL = 'https://drive.google.com/drive/folders/1YB-ZVnEqa_pyljuAOWglhh2RbbUeWQME';

function SeoResourceDownloadLinks({ className = '' }) {
  return (
    <div className={`tw-flex tw-flex-wrap tw-items-center tw-justify-center tw-gap-2 ${className}`.trim()}>
      <a
        href={SEO_CANVA_THUMB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="youtube-seo-resource-link youtube-seo-resource-link--canva"
      >
        Tải Thumbnail mẫu Canva
      </a>
      <a
        href={SEO_BELL_ASSETS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="youtube-seo-resource-link youtube-seo-resource-link--drive"
      >
        Tải nút chuông
      </a>
    </div>
  );
}

function ToastHost({ toasts, onDismiss }) {
  return (
    <div
      className="tw-pointer-events-none tw-fixed tw-bottom-4 tw-right-4 tw-z-[100] tw-flex tw-max-w-sm tw-flex-col tw-gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tw-pointer-events-auto tw-rounded-lg tw-border tw-px-3 tw-py-2 tw-text-left tw-text-sm tw-shadow-lg tw-transition tw-duration-200 hover:tw-opacity-90 ${
            t.variant === 'err'
              ? 'tw-border-red-500/40 tw-bg-red-950/90 tw-text-red-100'
              : 'tw-border-emerald-500/40 tw-bg-slate-900/95 tw-text-emerald-100'
          }`}
          onClick={() => onDismiss(t.id)}
        >
          {t.msg}
        </button>
      ))}
    </div>
  );
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function SkeletonLines({ n = 4 }) {
  return (
    <div className="tw-animate-pulse tw-space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="tw-h-3 tw-rounded tw-bg-slate-700/60" style={{ width: `${68 + (i % 3) * 10}%` }} />
      ))}
    </div>
  );
}

function SectionCard({ title, right, children, className = '' }) {
  return (
    <section
      className={`tw-rounded-2xl tw-border tw-border-slate-700/70 tw-bg-slate-900/40 tw-p-5 tw-shadow-inner tw-shadow-black/20 tw-transition tw-duration-300 hover:tw-border-slate-600/80 ${className}`}
    >
      <div className="tw-mb-4 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
        <h3 className="tw-m-0 tw-text-base tw-font-semibold tw-tracking-tight tw-text-slate-100">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function CopyIconBtn({ label, onClick, disabled }) {
  return (
    <button
      type="button"
      className="tw-inline-flex tw-items-center tw-gap-1 tw-rounded-md tw-border tw-border-slate-600 tw-bg-slate-800/80 tw-px-2 tw-py-1 tw-text-xs tw-font-medium tw-text-slate-200 hover:tw-bg-slate-700 disabled:tw-opacity-40"
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      <span aria-hidden="true">⎘</span> {label}
    </button>
  );
}

export default function YoutubeSeoPanel({ hasGeminiKey, hasOpenAiKey }) {
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const pushToast = useCallback((msg, variant = 'ok') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg, variant }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const seo = useSEOGenerator({ onToast: pushToast });

  const onCopyTags = () => copyText(seo.result.tags.join(', ')).then(() => pushToast('Đã copy tags.', 'ok'));

  const downloadThumbnail = () => {
    if (!seo.thumbnail.dataUrl) return;
    const a = document.createElement('a');
    a.href = seo.thumbnail.dataUrl;
    a.download = `${seo.result.filename || 'thumbnail'}.png`;
    a.click();
  };

  return (
    <div className="panel youtube-seo-panel">
      <ToastHost toasts={toasts} onDismiss={dismissToast} />

      {!hasGeminiKey && (
        <div className="flow-error" style={{ marginBottom: '1rem' }}>
          Cần <strong>GEMINI_API_KEY</strong> để dùng SEO YouTube (phần text). Vào <strong>Cài đặt API</strong> và lưu key cho tài khoản này.
        </div>
      )}
      {hasGeminiKey && !hasOpenAiKey && (
        <div className="hint" style={{ marginBottom: '1rem' }}>
          SEO text đang dùng <strong>Gemini</strong>. Các nút tạo <strong>ảnh/logo</strong> sẽ cần OpenAI key (tuỳ chọn).
        </div>
      )}

      <div className="tw-mx-auto tw-max-w-5xl tw-space-y-6">
        <div className="tw-fixed tw-bottom-4 tw-right-4 tw-z-40 tw-flex tw-justify-end">
          <div className="tw-flex tw-flex-wrap tw-gap-2 tw-rounded-xl tw-border tw-border-slate-700/80 tw-bg-slate-900/90 tw-p-2 tw-shadow-lg tw-backdrop-blur">
            <button
              type="button"
              className="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-lg tw-border-0 tw-bg-emerald-600 tw-px-3 tw-py-2 tw-text-xs tw-font-semibold tw-text-white hover:tw-bg-emerald-500 disabled:tw-opacity-45"
              disabled={!seo.hasBody}
              onClick={() => seo.downloadTextBundle()}
              title={!seo.hasBody ? 'Cần tạo mô tả trước' : 'Tải gói ZIP'}
            >
              ⬇ Tải Folder ZIP
            </button>
            <button
              type="button"
              className="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-lg tw-border tw-border-slate-600 tw-bg-slate-800 tw-px-3 tw-py-2 tw-text-xs tw-font-semibold tw-text-slate-100 hover:tw-bg-slate-700 disabled:tw-opacity-45"
              disabled={!seo.hasBody}
              onClick={() => seo.downloadTxtOnly()}
              title={!seo.hasBody ? 'Cần tạo mô tả trước' : 'Tải TXT'}
            >
              📝 Tải file TXT
            </button>
            <button
              type="button"
              className="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-lg tw-border tw-border-slate-600 tw-bg-slate-800 tw-px-3 tw-py-2 tw-text-xs tw-font-semibold tw-text-slate-100 hover:tw-bg-slate-700 disabled:tw-opacity-45"
              disabled={!seo.hasBody}
              onClick={() => seo.copyAllBundle()}
              title={!seo.hasBody ? 'Cần tạo mô tả trước' : 'Copy tất cả nội dung'}
            >
              ⎘ Copy Tất Cả
            </button>
            <button
              type="button"
              className="tw-inline-flex tw-items-center tw-gap-2 tw-rounded-lg tw-border-0 tw-bg-rose-600 tw-px-3 tw-py-2 tw-text-xs tw-font-semibold tw-text-white hover:tw-bg-rose-500"
              onClick={() => seo.resetAll()}
              title="Xóa toàn bộ dữ liệu và làm lại"
            >
              ↻ Làm lại
            </button>
          </div>
        </div>

        <SeoResourceDownloadLinks className="tw-mb-4" />

        <SectionCard
          title="Đầu vào"
          right={
            <span className="tw-text-xs tw-font-medium tw-uppercase tw-tracking-wider tw-text-sky-400/90">YouTube SEO</span>
          }
        >
          <div className="tw-grid tw-gap-4 md:tw-grid-cols-2">
            <label className="field tw-m-0">
              <span>Ngôn ngữ đầu ra</span>
              <select className="input" value={seo.language} onChange={(e) => seo.setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field tw-m-0">
              <span>Từ khóa chính *</span>
              <input
                className="input"
                value={seo.keyword}
                onChange={(e) => seo.setKeyword(e.target.value)}
                placeholder="VD: kiếm tiền online AI"
                autoComplete="off"
              />
            </label>
          </div>
          <label className="field">
            <span>Chủ đề / mô tả video</span>
            <textarea
              className="input"
              rows={4}
              value={seo.topic}
              onChange={(e) => seo.setTopic(e.target.value)}
              placeholder="Mô tả ngắn nội dung video, góc nhìn, đối tượng khán giả…"
            />
          </label>
          <div className="tw-grid tw-gap-4 md:tw-grid-cols-2">
            <label className="field tw-m-0">
              <span>URL video đối thủ (tuỳ chọn)</span>
              <input
                className="input"
                value={seo.competitorUrl}
                onChange={(e) => seo.setCompetitorUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                autoComplete="off"
              />
            </label>
            <label className="field tw-m-0">
              <span>URL kênh của bạn (tuỳ chọn)</span>
              <input
                className="input"
                value={seo.channelUrl}
                onChange={(e) => seo.setChannelUrl(e.target.value)}
                placeholder="https://www.youtube.com/@handle"
                autoComplete="off"
              />
            </label>
          </div>
          <div className="tw-mt-4 tw-flex tw-w-full tw-justify-center">
            <button
              type="button"
              className="tw-inline-flex tw-min-w-[min(100%,280px)] tw-max-w-md tw-items-center tw-justify-center tw-rounded-2xl tw-border tw-border-cyan-800/50 tw-bg-cyan-700 tw-px-10 tw-py-3.5 tw-text-base tw-font-semibold tw-text-white tw-shadow-lg tw-shadow-cyan-950/25 tw-transition tw-duration-200 hover:tw-bg-cyan-600 hover:tw-shadow-xl disabled:tw-cursor-not-allowed disabled:tw-opacity-45"
              disabled={!hasGeminiKey || seo.loadingMain}
              onClick={() => seo.generate()}
            >
              {seo.loadingMain ? 'Đang tạo…' : 'Tạo nội dung'}
            </button>
          </div>
          {seo.error && <p className="hint tw-text-red-400">{seo.error}</p>}
        </SectionCard>

        {seo.loadingMain && (
          <SectionCard title="Đang sinh tiêu đề…">
            <SkeletonLines n={6} />
            <p className="tw-mt-3 tw-text-sm tw-text-slate-500">GPT đang tạo 10 tiêu đề theo từ khóa.</p>
          </SectionCard>
        )}

        {!seo.loadingMain && seo.hasTitles && (
          <section className="tw-rounded-2xl tw-border tw-border-amber-500/25 tw-bg-gradient-to-b tw-from-slate-900/90 tw-to-slate-950/95 tw-p-5 tw-shadow-lg">
            <h2 className="tw-mb-1 tw-text-center tw-text-lg tw-font-bold tw-tracking-tight tw-text-amber-200 md:tw-text-xl">
              KẾT QUẢ TỐI ƯU CHO TỪ KHÓA:{' '}
              <span className="tw-text-amber-100">{String(seo.keyword || '').trim().toUpperCase() || '—'}</span>
            </h2>
            <p className="tw-mb-4 tw-text-center tw-text-xs tw-font-semibold tw-uppercase tw-tracking-wide tw-text-slate-400">
              🚀 Công cụ phân tích đối thủ
            </p>
            <div className="tw-mb-3 tw-flex tw-flex-wrap tw-justify-center tw-gap-2">
              <a
                href={YT_EXT_TOOLS.category}
                target="_blank"
                rel="noopener noreferrer"
                className="tw-inline-flex tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-blue-600 tw-px-3 tw-py-2 tw-text-sm tw-font-semibold tw-text-white tw-no-underline hover:tw-bg-blue-500"
              >
                Kiểm tra danh mục video ↗
              </a>
              <a
                href={YT_EXT_TOOLS.tags}
                target="_blank"
                rel="noopener noreferrer"
                className="tw-inline-flex tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-emerald-600 tw-px-3 tw-py-2 tw-text-sm tw-font-semibold tw-text-white tw-no-underline hover:tw-bg-emerald-500"
              >
                Kiểm tra thẻ tag video ↗
              </a>
              <a
                href={YT_EXT_TOOLS.metadata}
                target="_blank"
                rel="noopener noreferrer"
                className="tw-inline-flex tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-violet-600 tw-px-3 tw-py-2 tw-text-sm tw-font-semibold tw-text-white tw-no-underline hover:tw-bg-violet-500"
              >
                Kiểm tra thông tin video ↗
              </a>
            </div>
            <p className="tw-mb-6 tw-text-center tw-text-xs tw-leading-relaxed tw-text-slate-500">
              Sao chép <span className="tw-font-semibold tw-text-slate-400">URL video đối thủ</span> từ biểu mẫu phía
              trên, mở từng công cụ và dán link vào trang tương ứng (
              <a
                className="tw-text-sky-400 tw-underline tw-decoration-sky-500/50 hover:tw-text-sky-300"
                href={YT_EXT_TOOLS.category}
                target="_blank"
                rel="noopener noreferrer"
              >
                TubePilot
              </a>
              ,{' '}
              <a
                className="tw-text-sky-400 tw-underline tw-decoration-sky-500/50 hover:tw-text-sky-300"
                href={YT_EXT_TOOLS.tags}
                target="_blank"
                rel="noopener noreferrer"
              >
                Rapidtags
              </a>
              ,{' '}
              <a
                className="tw-text-sky-400 tw-underline tw-decoration-sky-500/50 hover:tw-text-sky-300"
                href={YT_EXT_TOOLS.metadata}
                target="_blank"
                rel="noopener noreferrer"
              >
                MW Metadata
              </a>
              ).
            </p>

            <div className="tw-mb-3 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
              <h3 className="tw-m-0 tw-text-base tw-font-bold tw-text-amber-300">🏅 10 tiêu đề YouTube hấp dẫn</h3>
              <div className="tw-flex tw-flex-wrap tw-gap-2">
                <CopyIconBtn
                  label="Copy all"
                  disabled={!seo.result.titles?.length}
                  onClick={() =>
                    copyText(seo.result.titles.join('\n')).then(() => pushToast('Đã copy titles.', 'ok'))
                  }
                />
                <button
                  type="button"
                  className="tw-rounded-md tw-border tw-border-amber-500/50 tw-bg-amber-500/15 tw-px-2 tw-py-1 tw-text-xs tw-font-semibold tw-text-amber-200 hover:tw-bg-amber-500/25 disabled:tw-opacity-40"
                  disabled={seo.loadingKeys.titles}
                  onClick={() => seo.regenerate('titles')}
                >
                  {seo.loadingKeys.titles ? '…' : '↻ Tạo lại'}
                </button>
              </div>
            </div>
            <ul className="tw-m-0 tw-list-none tw-space-y-2 tw-p-0">
              {seo.result.titles.map((t, i) => (
                <li
                  key={i}
                  className="tw-rounded-xl tw-border tw-border-slate-600/80 tw-bg-slate-900/70 tw-px-4 tw-py-3 tw-text-sm tw-text-slate-100"
                >
                  <div className="tw-flex tw-flex-wrap tw-items-start tw-justify-between tw-gap-2">
                    <div>
                      <span className="tw-font-semibold tw-text-amber-400">Tiêu đề {i + 1}:</span>{' '}
                      <span>{t}</span>
                    </div>
                    <CopyIconBtn label="Copy" onClick={() => copyText(t).then(() => pushToast('Đã copy.', 'ok'))} />
                  </div>
                </li>
              ))}
            </ul>

            <div className="tw-mt-6 tw-border-t tw-border-slate-600/60 tw-pt-5">
              <p className="tw-mb-3 tw-text-center tw-text-sm tw-font-medium tw-text-slate-300">
                Bạn muốn viết mô tả YouTube chuẩn SEO cho tiêu đề nào?
              </p>
              <div className="tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row sm:tw-items-end">
                <label className="tw-min-w-0 tw-flex-1">
                  <span className="tw-mb-1.5 tw-block tw-text-sm tw-font-medium tw-text-slate-200">Chọn tiêu đề</span>
                  <select
                    className="input"
                    value={seo.selectedTitleIndex}
                    onChange={(e) => seo.setSelectedTitleIndex(Number(e.target.value))}
                  >
                    {seo.result.titles.map((t, i) => (
                      <option key={i} value={i}>
                        Tiêu đề {i + 1}: {t.length > 90 ? `${t.slice(0, 90)}…` : t}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn tw-h-[46px] tw-shrink-0 tw-border-0 tw-bg-emerald-600 tw-font-semibold tw-text-white hover:tw-bg-emerald-500 disabled:tw-opacity-45"
                  disabled={!hasGeminiKey || seo.loadingRest || !seo.result.titles?.length}
                  onClick={() => seo.generateRestFromSelectedTitle()}
                >
                  {seo.loadingRest ? 'Đang tạo…' : 'Tạo mô tả'}
                </button>
              </div>
            </div>
          </section>
        )}

        {seo.loadingRest && !seo.hasBody && (
          <SectionCard title="Đang sinh mô tả, tag, comment…">
            <SkeletonLines n={5} />
          </SectionCard>
        )}

        {seo.hasBody && (
          <>
            <div className="tw-flex tw-flex-wrap tw-gap-2">
              <button type="button" className="btn btn-primary" onClick={() => seo.downloadTextBundle()}>
                Download All Content
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => seo.downloadJsonBundle()}>
                Export JSON
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => seo.resetAll()}>
                Generate New Content
              </button>
            </div>

            <SectionCard
              title="Description (~250 words)"
              right={
                <div className="tw-flex tw-gap-2">
                  <CopyIconBtn
                    label="Copy"
                    disabled={!seo.result.description}
                    onClick={() => copyText(seo.result.description).then(() => pushToast('Đã copy mô tả.', 'ok'))}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.85rem', padding: '0.35rem 0.65rem' }}
                    disabled={seo.loadingKeys.description}
                    onClick={() => seo.regenerate('description')}
                  >
                    {seo.loadingKeys.description ? '…' : 'Regenerate'}
                  </button>
                </div>
              }
            >
              <div className="tw-whitespace-pre-wrap tw-rounded-lg tw-bg-black/25 tw-p-4 tw-text-sm tw-leading-relaxed tw-text-slate-200">
                {seo.result.description || '—'}
              </div>
            </SectionCard>

            <SectionCard
              title="Tags / keywords (25)"
              right={
                <div className="tw-flex tw-gap-2">
                  <CopyIconBtn label="Copy all" disabled={!seo.result.tags?.length} onClick={onCopyTags} />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.85rem', padding: '0.35rem 0.65rem' }}
                    disabled={seo.loadingKeys.tags}
                    onClick={() => seo.regenerate('tags')}
                  >
                    {seo.loadingKeys.tags ? '…' : 'Regenerate'}
                  </button>
                </div>
              }
            >
              <div className="tw-flex tw-flex-wrap tw-gap-2">
                {seo.result.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="tw-inline-flex tw-items-center tw-rounded-full tw-border tw-border-sky-500/30 tw-bg-sky-500/10 tw-px-3 tw-py-1 tw-text-xs tw-font-medium tw-text-sky-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Pinned comment"
              right={
                <div className="tw-flex tw-gap-2">
                  <CopyIconBtn
                    label="Copy"
                    disabled={!seo.result.comment}
                    onClick={() => copyText(seo.result.comment).then(() => pushToast('Đã copy comment.', 'ok'))}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.85rem', padding: '0.35rem 0.65rem' }}
                    disabled={seo.loadingKeys.comment}
                    onClick={() => seo.regenerate('comment')}
                  >
                    {seo.loadingKeys.comment ? '…' : 'Regenerate'}
                  </button>
                </div>
              }
            >
              <p className="tw-m-0 tw-whitespace-pre-wrap tw-text-sm tw-leading-relaxed tw-text-slate-200">{seo.result.comment}</p>
            </SectionCard>

            <SectionCard
              title="SEO file name"
              right={
                <div className="tw-flex tw-gap-2">
                  <CopyIconBtn
                    label="Copy"
                    disabled={!seo.result.filename}
                    onClick={() => copyText(seo.result.filename).then(() => pushToast('Đã copy slug.', 'ok'))}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.85rem', padding: '0.35rem 0.65rem' }}
                    disabled={seo.loadingKeys.filename}
                    onClick={() => seo.regenerate('filename')}
                  >
                    {seo.loadingKeys.filename ? '…' : 'Regenerate'}
                  </button>
                </div>
              }
            >
              <code className="tw-block tw-rounded-lg tw-bg-black/35 tw-px-3 tw-py-2 tw-text-sm tw-text-emerald-300">
                {seo.result.filename || '—'}
              </code>
            </SectionCard>

            <div className="tw-mb-2">
              <div className="tw-grid tw-gap-4 lg:tw-grid-cols-2">
                <div className="tw-rounded-2xl tw-border tw-border-slate-700/80 tw-bg-[#1a1d23] tw-p-5 tw-shadow-inner">
                  <h3 className="tw-mb-5 tw-text-center tw-text-base tw-font-bold tw-tracking-tight tw-text-white md:tw-text-lg">
                    🎨 CÔNG CỤ TẠO ẢNH MINH HỌA
                  </h3>

                  <SeoResourceDownloadLinks className="tw-mb-5" />

                  <label className="tw-mb-4 tw-block">
                    <div className="tw-mb-1.5 tw-flex tw-items-center tw-justify-between tw-gap-2">
                      <span className="tw-block tw-text-sm tw-font-medium tw-text-slate-200">Ý tưởng tạo Prompt (Tùy chọn)</span>
                      <button
                        type="button"
                        className="tw-inline-flex tw-items-center tw-gap-1 tw-rounded-lg tw-border tw-border-cyan-500/50 tw-bg-cyan-500/10 tw-px-2.5 tw-py-1 tw-text-xs tw-font-semibold tw-text-cyan-200 hover:tw-bg-cyan-500/20 disabled:tw-opacity-45"
                        onClick={() => seo.suggestThumbnailIdea()}
                        disabled={!hasGeminiKey || seo.loadingThumbPrompt}
                      >
                        ✨ {seo.loadingThumbPrompt ? 'AI đang gợi ý…' : 'Gợi ý AI'}
                      </button>
                    </div>
                    <textarea
                      className="tw-w-full tw-resize-y tw-rounded-xl tw-border tw-border-slate-600/90 tw-bg-[#2a2d33] tw-px-3 tw-py-2.5 tw-text-sm tw-text-slate-100 tw-outline-none tw-ring-0 placeholder:tw-text-slate-500 focus:tw-border-slate-500"
                      rows={4}
                      value={seo.thumbIdea}
                      onChange={(e) => seo.setThumbIdea(e.target.value)}
                      placeholder="Mô tả ý tưởng của bạn... Ví dụ: một người đang cầm điện thoại..."
                    />
                  </label>

                  <div className="tw-mb-4">
                    <span className="tw-mb-2 tw-block tw-text-sm tw-font-medium tw-text-slate-200">Tải ảnh tham khảo (Tối đa 2)</span>
                    <div className="tw-flex tw-flex-col tw-gap-2">
                      {[0, 1].map((idx) => (
                        <label
                          key={idx}
                          className="tw-relative tw-flex tw-min-h-[44px] tw-cursor-pointer tw-items-center tw-gap-3 tw-overflow-hidden tw-rounded-xl tw-border tw-border-slate-600/80 tw-bg-[#2a2d33] tw-px-3 tw-py-2"
                        >
                          <span className="tw-shrink-0 tw-rounded-lg tw-bg-rose-200 tw-px-3 tw-py-1.5 tw-text-xs tw-font-semibold tw-text-red-700">
                            Chọn tệp
                          </span>
                          <span className="tw-min-w-0 tw-truncate tw-text-xs tw-text-slate-400">
                            {seo.thumbRefs[idx]?.name || 'Chưa chọn file'}
                          </span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="tw-absolute tw-inset-0 tw-cursor-pointer tw-opacity-0"
                            onChange={(e) => seo.setThumbRef(idx, e.target.files?.[0] || null)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="tw-mb-4 tw-block">
                    <span className="tw-mb-1.5 tw-block tw-text-sm tw-font-medium tw-text-slate-200">
                      Văn bản trên Thumbnail (Tùy chọn)
                    </span>
                    <textarea
                      className="tw-w-full tw-resize-y tw-rounded-xl tw-border tw-border-slate-600/90 tw-bg-[#2a2d33] tw-px-3 tw-py-2.5 tw-text-sm tw-text-slate-100 placeholder:tw-text-slate-500 focus:tw-border-slate-500"
                      rows={2}
                      value={seo.thumbOverlay}
                      onChange={(e) => seo.setThumbOverlay(e.target.value)}
                      placeholder="ví dụ: BÍ MẬT ĐƯỢC TIẾT LỘ"
                    />
                  </label>

                  <p className="tw-mb-2 tw-text-sm tw-font-medium tw-text-slate-200">Chọn phong cách Thumbnail</p>
                  <div className="tw-mb-4 tw-flex tw-flex-wrap tw-gap-2">
                    {THUMB_STYLE_PILLS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => seo.setThumbnailStyle(s.id)}
                        className={`tw-rounded-full tw-border tw-px-3 tw-py-1.5 tw-text-xs tw-font-semibold tw-transition md:tw-text-sm ${
                          seo.thumbnailStyle === s.id
                            ? 'tw-border-[#e53935] tw-bg-[#e53935] tw-text-white'
                            : 'tw-border-slate-600 tw-bg-[#343a40] tw-text-slate-300 hover:tw-bg-slate-600/80'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <p className="tw-mb-2 tw-text-sm tw-font-medium tw-text-slate-200">Tỷ lệ khung hình</p>
                  <div className="tw-mb-5 tw-flex tw-w-full tw-rounded-xl tw-border tw-border-slate-600 tw-bg-[#2a2d33] tw-p-1">
                    <button
                      type="button"
                      className={`tw-flex-1 tw-rounded-lg tw-py-2.5 tw-text-center tw-text-xs tw-font-semibold tw-transition md:tw-text-sm ${
                        seo.thumbnailAspect === '16:9'
                          ? 'tw-bg-[#e53935] tw-text-white'
                          : 'tw-text-slate-400 hover:tw-text-slate-200'
                      }`}
                      onClick={() => seo.setThumbnailAspect('16:9')}
                    >
                      Thumbnail 16:9
                    </button>
                    <button
                      type="button"
                      className={`tw-flex-1 tw-rounded-lg tw-py-2.5 tw-text-center tw-text-xs tw-font-semibold tw-transition md:tw-text-sm ${
                        seo.thumbnailAspect === '9:16'
                          ? 'tw-bg-[#e53935] tw-text-white'
                          : 'tw-text-slate-400 hover:tw-text-slate-200'
                      }`}
                      onClick={() => seo.setThumbnailAspect('9:16')}
                    >
                      Short 9:16
                    </button>
                  </div>

                  <button
                    type="button"
                    className="tw-mb-3 tw-w-full tw-rounded-xl tw-border-0 tw-bg-[#e53935] tw-py-3.5 tw-text-center tw-text-sm tw-font-bold tw-text-white tw-shadow-md tw-transition hover:tw-bg-red-600 disabled:tw-opacity-45"
                    disabled={!hasOpenAiKey || seo.loadingThumb}
                    onClick={() => seo.runThumbnail()}
                  >
                    {seo.loadingThumb ? 'Đang tạo ảnh…' : 'Tạo Ảnh Ngay'}
                  </button>
                  <button
                    type="button"
                    className="tw-mb-5 tw-w-full tw-rounded-xl tw-border-0 tw-bg-[#f1b418] tw-py-3.5 tw-text-center tw-text-sm tw-font-bold tw-text-black tw-shadow-md tw-transition hover:tw-bg-amber-400 disabled:tw-opacity-45"
                    disabled={!hasGeminiKey || seo.loadingThumbPrompt}
                    onClick={() => seo.runThumbnailPromptOnly()}
                  >
                    {seo.loadingThumbPrompt ? 'Đang tạo prompt…' : 'Chỉ Tạo Prompt'}
                  </button>

                  {seo.imagePromptOnly ? (
                    <label className="tw-mb-4 tw-block">
                      <span className="tw-mb-1 tw-block tw-text-xs tw-font-medium tw-text-slate-400">Prompt ảnh (tiếng Anh)</span>
                      <textarea
                        readOnly
                        className="tw-w-full tw-resize-y tw-rounded-xl tw-border tw-border-slate-600 tw-bg-black/30 tw-px-3 tw-py-2 tw-font-mono tw-text-xs tw-leading-relaxed tw-text-slate-200"
                        rows={6}
                        value={seo.imagePromptOnly}
                        onFocus={(e) => e.target.select()}
                      />
                    </label>
                  ) : null}

                  <div className="tw-mt-4 tw-border-t tw-border-slate-700/80 tw-pt-4">
                    <p className="tw-mb-2 tw-text-sm tw-font-semibold tw-text-slate-100">🧩 TẠO LOGO</p>
                    <label className="tw-mb-3 tw-block">
                      <div className="tw-mb-1.5 tw-flex tw-items-center tw-justify-between tw-gap-2">
                        <span className="tw-block tw-text-sm tw-font-medium tw-text-slate-200">Prompt logo (Tùy chọn)</span>
                        <button
                          type="button"
                          className="tw-inline-flex tw-items-center tw-gap-1 tw-rounded-lg tw-border tw-border-cyan-500/50 tw-bg-cyan-500/10 tw-px-2.5 tw-py-1 tw-text-xs tw-font-semibold tw-text-cyan-200 hover:tw-bg-cyan-500/20 disabled:tw-opacity-45"
                          onClick={() => seo.suggestLogoIdea()}
                          disabled={!hasGeminiKey || seo.loadingLogoPrompt}
                        >
                          ✨ {seo.loadingLogoPrompt ? 'AI đang gợi ý…' : 'Gợi ý AI'}
                        </button>
                      </div>
                      <textarea
                        className="tw-w-full tw-resize-y tw-rounded-xl tw-border tw-border-slate-600/90 tw-bg-[#2a2d33] tw-px-3 tw-py-2.5 tw-text-sm tw-text-slate-100 placeholder:tw-text-slate-500 focus:tw-border-slate-500"
                        rows={3}
                        value={seo.logoIdea}
                        onChange={(e) => seo.setLogoIdea(e.target.value)}
                        placeholder="Ví dụ: logo tối giản chữ VEO, cảm giác AI hiện đại, nền trong suốt..."
                      />
                    </label>
                    <label className="tw-mb-3 tw-block">
                      <span className="tw-mb-1.5 tw-block tw-text-sm tw-font-medium tw-text-slate-200">Text trên logo (tùy chọn)</span>
                      <input
                        className="tw-w-full tw-rounded-xl tw-border tw-border-slate-600/90 tw-bg-[#2a2d33] tw-px-3 tw-py-2.5 tw-text-sm tw-text-slate-100 placeholder:tw-text-slate-500 focus:tw-border-slate-500"
                        value={seo.logoText}
                        onChange={(e) => seo.setLogoText(e.target.value)}
                        placeholder="VD: VEO3PRO"
                      />
                    </label>
                    <div className="tw-grid tw-gap-2 sm:tw-grid-cols-2">
                      <button
                        type="button"
                        className="tw-w-full tw-rounded-xl tw-border-0 tw-bg-indigo-600 tw-py-3 tw-text-center tw-text-sm tw-font-bold tw-text-white tw-shadow-md tw-transition hover:tw-bg-indigo-500 disabled:tw-opacity-45"
                        disabled={!hasOpenAiKey || seo.loadingLogo}
                        onClick={() => seo.runLogo()}
                      >
                        {seo.loadingLogo ? 'Đang tạo logo…' : 'Tạo Logo'}
                      </button>
                      <button
                        type="button"
                        className="tw-w-full tw-rounded-xl tw-border-0 tw-bg-amber-500 tw-py-3 tw-text-center tw-text-sm tw-font-bold tw-text-black tw-shadow-md tw-transition hover:tw-bg-amber-400 disabled:tw-opacity-45"
                        disabled={!hasGeminiKey || seo.loadingLogoPrompt}
                        onClick={() => seo.runLogoPromptOnly()}
                      >
                        {seo.loadingLogoPrompt ? 'Đang tạo prompt logo…' : 'Chỉ Tạo Prompt Logo'}
                      </button>
                    </div>
                    {seo.logoPromptOnly ? (
                      <label className="tw-mt-3 tw-block">
                        <span className="tw-mb-1 tw-block tw-text-xs tw-font-medium tw-text-slate-400">Prompt logo (tiếng Anh)</span>
                        <textarea
                          readOnly
                          className="tw-w-full tw-resize-y tw-rounded-xl tw-border tw-border-slate-600 tw-bg-black/30 tw-px-3 tw-py-2 tw-font-mono tw-text-xs tw-leading-relaxed tw-text-slate-200"
                          rows={5}
                          value={seo.logoPromptOnly}
                          onFocus={(e) => e.target.select()}
                        />
                      </label>
                    ) : null}
                    {seo.logo.revisedPrompt ? (
                      <p className="tw-mt-2 tw-text-xs tw-text-slate-500">
                        <span className="tw-font-semibold tw-text-slate-400">Gợi ý từ API logo:</span> {seo.logo.revisedPrompt}
                      </p>
                    ) : null}
                  </div>

                  <div className="tw-flex tw-flex-col tw-items-center tw-gap-2 tw-border-t tw-border-slate-700/80 tw-pt-4 sm:tw-flex-row sm:tw-justify-center">
                    <button
                      type="button"
                      className="tw-inline-flex tw-w-full tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-border-0 tw-bg-[#28a745] tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-white hover:tw-bg-green-600 disabled:tw-opacity-40 sm:tw-w-auto"
                      disabled={!seo.hasBody}
                      onClick={() => seo.downloadTextBundle()}
                      title={!seo.hasBody ? 'Cần tạo mô tả trước' : ''}
                    >
                      <span aria-hidden="true">⬇</span> Tải folder nội dung (ZIP)
                    </button>
                    <button
                      type="button"
                      className="tw-inline-flex tw-w-full tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-border tw-border-slate-500 tw-bg-slate-800 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-slate-100 hover:tw-bg-slate-700 disabled:tw-opacity-40 sm:tw-w-auto"
                      disabled={!seo.hasBody}
                      onClick={() => seo.downloadTxtOnly()}
                      title={!seo.hasBody ? 'Cần tạo mô tả trước' : ''}
                    >
                      <span aria-hidden="true">📝</span> Tải file TXT
                    </button>
                    <button
                      type="button"
                      className="tw-inline-flex tw-w-full tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-border-0 tw-bg-[#e53935] tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-white hover:tw-bg-red-600 sm:tw-w-auto"
                      onClick={() => seo.resetAll()}
                    >
                      <span aria-hidden="true">↻</span> Tạo nội dung mới
                    </button>
                  </div>

                  {seo.thumbnail.revisedPrompt && (
                    <p className="tw-mt-3 tw-text-xs tw-text-slate-500">
                      <span className="tw-font-semibold tw-text-slate-400">Gợi ý từ API ảnh:</span> {seo.thumbnail.revisedPrompt}
                    </p>
                  )}
                </div>

                <div className="tw-flex tw-min-h-[280px] tw-flex-col tw-items-center tw-justify-center tw-rounded-2xl tw-border tw-border-dashed tw-border-slate-600 tw-bg-[#14161c] tw-p-4">
                  {seo.loadingThumb ? (
                    <SkeletonLines n={5} />
                  ) : seo.thumbnail.dataUrl || seo.logo.dataUrl ? (
                    <>
                      {seo.thumbnail.dataUrl ? (
                        <>
                          <img
                            src={seo.thumbnail.dataUrl}
                            alt="Ảnh thumbnail"
                            className="tw-max-h-80 tw-w-auto tw-rounded-xl tw-object-contain tw-shadow-lg"
                          />
                          <button
                            type="button"
                            className="tw-mt-4 tw-rounded-xl tw-border tw-border-slate-500 tw-bg-slate-800 tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-slate-100 hover:tw-bg-slate-700"
                            onClick={downloadThumbnail}
                          >
                            Tải ảnh PNG
                          </button>
                        </>
                      ) : null}
                      {seo.logo.dataUrl ? (
                        <>
                          <img
                            src={seo.logo.dataUrl}
                            alt="Logo đã tạo"
                            className="tw-mt-5 tw-max-h-52 tw-w-auto tw-rounded-xl tw-object-contain tw-shadow-lg"
                          />
                          <button
                            type="button"
                            className="tw-mt-3 tw-rounded-xl tw-border tw-border-slate-500 tw-bg-slate-800 tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-slate-100 hover:tw-bg-slate-700"
                            onClick={() => {
                              if (!seo.logo.dataUrl) return;
                              const a = document.createElement('a');
                              a.href = seo.logo.dataUrl;
                              a.download = `${seo.result.filename || 'logo'}.png`;
                              a.click();
                            }}
                          >
                            Tải logo PNG
                          </button>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <p className="tw-text-center tw-text-sm tw-text-slate-500">Ảnh minh họa sẽ hiển thị ở đây.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
