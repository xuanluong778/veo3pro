import { useCallback, useRef, useState } from 'react';
import { analyzeVideoByUrl, analyzeVideoUpload } from '../videoAnalysisClient.js';

const DOWNLOADS = [
  {
    id: 'tiktok',
    label: 'TIKTOK',
    href: 'https://tikdown.net/',
    ring: 'tw-ring-red-500/80',
    text: 'tw-text-red-400',
    bg: 'tw-bg-red-500/10',
  },
  {
    id: 'facebook',
    label: 'FACEBOOK',
    href: 'https://snapsave.vn/facebook',
    ring: 'tw-ring-blue-500/80',
    text: 'tw-text-blue-400',
    bg: 'tw-bg-blue-500/10',
  },
  {
    id: 'reels',
    label: 'REELS',
    href: 'https://publer.com/fr/tools/instagram-reel-downloader',
    ring: 'tw-ring-amber-400/90',
    text: 'tw-text-amber-300',
    bg: 'tw-bg-amber-500/10',
  },
];

const MAX_BYTES = 50 * 1024 * 1024;

function ResultBlock({ title, children }) {
  return (
    <div className="tw-rounded-xl tw-border tw-border-slate-700/80 tw-bg-slate-900/50 tw-p-4">
      <h4 className="tw-mb-2 tw-text-xs tw-font-bold tw-uppercase tw-tracking-wide tw-text-sky-400">{title}</h4>
      <div className="tw-text-sm tw-leading-relaxed tw-text-slate-200 tw-whitespace-pre-wrap">{children}</div>
    </div>
  );
}

export default function VideoAnalysisModule({ hasGeminiKey, onGoTopic, embedded = false }) {
  /** Mặc định: Phân tích Video. */
  const [mode, setMode] = useState('video');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef(null);

  const showVideoTools = mode === 'video';

  const resetError = () => setError('');

  const onAnalyzeUrl = useCallback(async () => {
    resetError();
    setResult(null);
    const u = url.trim();
    if (!u) {
      setError('Nhập URL video.');
      return;
    }
    setBusy(true);
    try {
      const r = await analyzeVideoByUrl(u, notes);
      setResult(r);
    } catch (e) {
      setError(e.message || 'Lỗi phân tích.');
    } finally {
      setBusy(false);
    }
  }, [url, notes]);

  const runUpload = useCallback(async (file) => {
    setBusy(true);
    try {
      const r = await analyzeVideoUpload(file, notes);
      setResult(r);
    } catch (e) {
      setError(e.message || 'Lỗi upload / phân tích.');
    } finally {
      setBusy(false);
    }
  }, [notes]);

  const pickFile = useCallback(
    (file) => {
      resetError();
      setResult(null);
      if (!file) {
        setFileName('');
        return;
      }
      const lower = file.name.toLowerCase();
      if (!lower.endsWith('.mp4') && !lower.endsWith('.mov')) {
        setError('Chỉ MP4 hoặc MOV.');
        setFileName('');
        return;
      }
      if (file.size > MAX_BYTES) {
        setError('Tối đa 50MB.');
        setFileName('');
        return;
      }
      setFileName(file.name);
      void runUpload(file);
    },
    [runUpload],
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) pickFile(f);
    },
    [pickFile],
  );

  const viral = Array.isArray(result?.viralPatterns) ? result.viralPatterns : [];

  const outerClass = embedded ? 'tw-w-full' : 'tw-mx-auto tw-max-w-4xl tw-px-4 tw-py-6';
  const innerClass = embedded
    ? 'tw-w-full tw-rounded-xl tw-border tw-border-slate-700/70 tw-bg-slate-950/50 tw-p-4'
    : 'tw-rounded-2xl tw-border tw-border-slate-700/90 tw-bg-va-panel tw-p-6 tw-shadow-xl tw-shadow-black/40';

  const toggleWrap = embedded ? 'tw-mb-4' : 'tw-mb-8';
  const tabBase =
    'tw-flex tw-flex-1 tw-items-center tw-justify-center tw-gap-2 tw-rounded-lg tw-py-2.5 tw-text-sm tw-font-semibold tw-outline-none tw-transition tw-duration-150 focus-visible:tw-ring-2 focus-visible:tw-ring-sky-400/80 focus-visible:tw-ring-offset-2 focus-visible:tw-ring-offset-slate-900';
  const topicActive = `${tabBase} tw-bg-sky-600 tw-text-white tw-shadow-md tw-shadow-sky-950/40 tw-ring-2 tw-ring-sky-400/70 hover:tw-bg-sky-500 hover:tw-ring-sky-300/90`;
  const topicIdle = `${tabBase} tw-bg-transparent tw-font-medium tw-text-slate-500 hover:tw-bg-slate-700/95 hover:tw-text-sky-100 hover:tw-ring-1 hover:tw-ring-slate-500/50`;
  const videoActive = `${tabBase} tw-bg-cyan-600 tw-text-white tw-shadow-md tw-shadow-cyan-950/40 tw-ring-2 tw-ring-cyan-300/70 hover:tw-bg-cyan-500 hover:tw-ring-cyan-200/90`;
  const videoIdle = `${tabBase} tw-bg-transparent tw-font-medium tw-text-slate-500 hover:tw-bg-slate-700/95 hover:tw-text-cyan-100 hover:tw-ring-1 hover:tw-ring-slate-500/50`;

  return (
    <div className={outerClass}>
      <div className={innerClass}>
        {!embedded && (
          <div className="tw-mb-6 tw-flex tw-items-center tw-gap-3">
            <div className="tw-flex tw-h-11 tw-w-11 tw-items-center tw-justify-center tw-rounded-xl tw-bg-sky-500/15 tw-ring-1 tw-ring-sky-500/40">
              <span className="tw-text-lg" aria-hidden>
                🎬
              </span>
            </div>
            <div>
              <h2 className="tw-text-lg tw-font-bold tw-tracking-wide tw-text-sky-400">CẤU HÌNH VIDEO</h2>
              <p className="tw-text-xs tw-text-slate-500">Phân tích hook · flow · CTA · viral — xuất prompt AI tái sử dụng (Gemini)</p>
            </div>
          </div>
        )}

        <div className={`${toggleWrap} tw-flex tw-rounded-xl tw-bg-slate-900/80 tw-p-1 tw-ring-1 tw-ring-slate-700/80`} role="tablist" aria-label="Chế độ cấu hình video">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'topic'}
            onClick={() => setMode('topic')}
            className={mode === 'topic' ? topicActive : topicIdle}
          >
            <span aria-hidden>📝</span>
            Từ chủ đề
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'video'}
            onClick={() => setMode('video')}
            className={mode === 'video' ? videoActive : videoIdle}
          >
            <span aria-hidden>🎥</span>
            Phân tích Video
          </button>
        </div>

        {!embedded && mode === 'topic' && (
          <div className="tw-mb-8 tw-rounded-xl tw-border tw-border-slate-600/80 tw-bg-slate-900/40 tw-p-5">
            <p className="tw-mb-4 tw-text-sm tw-leading-relaxed tw-text-slate-300">
              Soạn kịch bản và prompt theo chủ đề trong tab <strong className="tw-text-sky-300">Prompt Studio</strong> — lập kế hoạch chủ đề, preset và sinh cảnh tự động.
            </p>
            <button
              type="button"
              onClick={() => onGoTopic?.()}
              className="tw-rounded-lg tw-bg-sky-600 tw-px-5 tw-py-2.5 tw-text-sm tw-font-semibold tw-text-white tw-shadow tw-shadow-sky-900/25 tw-transition hover:tw-bg-sky-500"
            >
              Mở Prompt Studio
            </button>
          </div>
        )}

        {showVideoTools && (
          <>
            {embedded && (
              <p className="tw-mb-4 tw-text-xs tw-text-slate-400">
                Phân tích hook, viral và CTA. Phía dưới: chỉnh chủ đề, preset và phong cách clip.
              </p>
            )}

            {!hasGeminiKey && (
              <div className={`tw-rounded-xl tw-border tw-border-amber-500/40 tw-bg-amber-500/10 tw-px-4 tw-py-3 tw-text-sm tw-text-amber-100 ${embedded ? 'tw-mb-4' : 'tw-mb-6'}`}>
                Thiếu <code className="tw-rounded tw-bg-black/30 tw-px-1">GEMINI_API_KEY</code> — vào Cài đặt API và lưu key cho tài khoản này.
              </div>
            )}

            <h3 className={`tw-text-xs tw-font-bold tw-tracking-wider tw-text-sky-400 ${embedded ? 'tw-mb-2' : 'tw-mb-3'}`}>CÔNG CỤ TẢI VIDEO KHÔNG LOGO</h3>
        <div className={`tw-grid tw-grid-cols-1 tw-gap-3 sm:tw-grid-cols-3 ${embedded ? 'tw-mb-5' : 'tw-mb-8'}`}>
              {DOWNLOADS.map((d) => (
                <a
                  key={d.id}
                  href={d.href}
                  target="_blank"
                  rel="noreferrer"
                  className={`tw-group tw-flex tw-flex-col tw-items-center tw-justify-center tw-gap-2 tw-rounded-xl tw-border-0 tw-bg-slate-900/60 tw-py-6 tw-ring-2 ${d.ring} tw-transition hover:tw-bg-slate-800/80`}
                >
                  <span
                    className={`tw-flex tw-h-12 tw-w-12 tw-items-center tw-justify-center tw-rounded-full ${d.bg} tw-text-xl tw-ring-1 tw-ring-white/10`}
                    aria-hidden
                  >
                    {d.id === 'tiktok' && '⬇'}
                    {d.id === 'facebook' && 'f'}
                    {d.id === 'reels' && '◎'}
                  </span>
                  <span className={`tw-text-sm tw-font-bold ${d.text}`}>{d.label}</span>
                  <span className="tw-text-[10px] tw-text-slate-500 group-hover:tw-text-slate-400">Mở tab mới</span>
                </a>
              ))}
            </div>

        <h3 className="tw-mb-2 tw-text-xs tw-font-bold tw-tracking-wider tw-text-sky-400">PHÂN TÍCH THEO URL</h3>
        <div className="tw-mb-6 tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="tw-min-w-0 tw-flex-1 tw-rounded-xl tw-border tw-border-slate-600 tw-bg-slate-950/80 tw-px-4 tw-py-3 tw-text-sm tw-text-slate-100 tw-outline-none tw-ring-sky-500/0 tw-transition focus:tw-border-sky-500/60 focus:tw-ring-2"
              />
              <button
                type="button"
                disabled={busy || !hasGeminiKey}
                onClick={onAnalyzeUrl}
                className="tw-shrink-0 tw-rounded-xl tw-bg-sky-600 tw-px-6 tw-py-3 tw-text-sm tw-font-semibold tw-text-white tw-shadow-lg tw-shadow-sky-900/30 tw-transition hover:tw-bg-sky-500 disabled:tw-cursor-not-allowed disabled:tw-opacity-40"
              >
                {busy ? 'Đang phân tích…' : 'Phân tích'}
              </button>
            </div>

        <h3 className="tw-mb-2 tw-text-xs tw-font-bold tw-tracking-wider tw-text-sky-400">
          UPLOAD VIDEO MẪU <span className="tw-text-red-400">*</span>
        </h3>
        <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
          className={`tw-flex tw-cursor-pointer tw-flex-col tw-items-center tw-justify-center tw-gap-2 tw-rounded-2xl tw-border-2 tw-border-dashed tw-border-slate-600 tw-bg-slate-950/40 tw-transition hover:tw-border-sky-500/50 hover:tw-bg-slate-900/60 ${embedded ? 'tw-mb-4 tw-py-10' : 'tw-mb-6 tw-py-14'}`}
        >
          <span className="tw-text-3xl" aria-hidden>
            ☁
          </span>
          <p className="tw-text-sm tw-font-medium tw-text-slate-200">Chọn video phân tích</p>
          <p className="tw-text-xs tw-text-slate-500">MP4, MOV (tối đa 50MB)</p>
          {fileName ? <p className="tw-text-xs tw-text-sky-400">{fileName}</p> : null}
          <input
            ref={fileRef}
            type="file"
            accept=".mp4,.mov,video/mp4,video/quicktime"
            className="tw-hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              pickFile(f);
              e.target.value = '';
            }}
          />
        </div>

        <label className="tw-mb-6 tw-block">
          <span className="tw-mb-1 tw-block tw-text-xs tw-font-medium tw-text-slate-400">Ghi chú thêm (tuỳ chọn)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Đối tượng khán giả, ngách, tone thương hiệu…"
            className="tw-w-full tw-resize-none tw-rounded-xl tw-border tw-border-slate-600 tw-bg-slate-950/80 tw-px-4 tw-py-3 tw-text-sm tw-text-slate-100 tw-outline-none focus:tw-border-sky-500/60"
          />
        </label>

        {error ? (
          <div className="tw-mb-6 tw-rounded-xl tw-border tw-border-red-500/40 tw-bg-red-950/40 tw-px-4 tw-py-3 tw-text-sm tw-text-red-200">{error}</div>
        ) : null}

        {result && (
          <div className="tw-space-y-4 tw-border-t tw-border-slate-700/80 tw-pt-6">
            <h3 className="tw-text-sm tw-font-bold tw-text-slate-200">Kết quả &amp; prompt tái sử dụng</h3>
            <div className="tw-grid tw-gap-4 md:tw-grid-cols-2">
              <ResultBlock title="Hook">{result.hook || '—'}</ResultBlock>
              <ResultBlock title="CTA">{result.cta || '—'}</ResultBlock>
              <ResultBlock title="Cấu trúc nội dung">{result.contentStructure || '—'}</ResultBlock>
              <ResultBlock title="Phong cách hình ảnh">{result.visualStyle || '—'}</ResultBlock>
            </div>
            <ResultBlock title="Dàn ý / kịch bản">{result.scriptOutline || '—'}</ResultBlock>
            {viral.length > 0 && (
              <div className="tw-rounded-xl tw-border tw-border-slate-700/80 tw-bg-slate-900/50 tw-p-4">
                <h4 className="tw-mb-2 tw-text-xs tw-font-bold tw-uppercase tw-tracking-wide tw-text-sky-400">Viral patterns</h4>
                <ul className="tw-list-inside tw-list-disc tw-space-y-1 tw-text-sm tw-text-slate-200">
                  {viral.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.disclaimer ? <p className="tw-text-xs tw-text-slate-500">{result.disclaimer}</p> : null}
            <ResultBlock title="Prompt AI (copy)">{result.reusableAiPrompt || '—'}</ResultBlock>
            <button
              type="button"
              onClick={() => {
                const t = result.reusableAiPrompt || '';
                if (t) void navigator.clipboard.writeText(t);
              }}
              className="tw-rounded-lg tw-bg-slate-700 tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-slate-100 hover:tw-bg-slate-600"
            >
              Sao chép prompt tái sử dụng
            </button>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
