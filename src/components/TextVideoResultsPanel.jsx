import { useMemo, useState, useCallback, useEffect, useRef } from 'react';

const TABS = [
  { id: 'chars', label: 'Nhân vật & Bối cảnh', icon: '👤' },
  { id: 'scenes', label: 'Phân cảnh', icon: '🎬' },
  { id: 'prompts', label: 'Prompts', icon: '📄' },
  { id: 'videos', label: 'Videos', icon: '▶' },
  { id: 'apiLogs', label: 'Logs', icon: '📋' },
];

const LOG_ERROR_LINE_RE =
  /lỗi|thất bại|failed|error|quota|rate\s*limit|exceeded|429|403|401|400|500|502|503|504|timeout|abort|exception|không nhận|không tải|hết\s*credit|depleted|invalid|denied|forbidden|unauthorized/i;

/** Phân tách các prompt khi «Sửa toàn bộ» — tránh trùng với nội dung thường. */
const BULK_SCENE_DELIM = '\n___Veo3PRO_SCENE___\n';

function sceneJsonSnippet(scene) {
  const c = String(scene?.structuredScene?.content || '').trim();
  if (c) {
    const max = 2400;
    const truncated = c.length > max ? `${c.slice(0, max)}…` : c;
    return JSON.stringify({ scene_id: String(scene.structuredScene?.scene_id ?? scene.index), content: truncated }, null, 2);
  }
  const content = String(scene.promptFull || '').replace(/\s+/g, ' ').trim();
  const max = 420;
  const truncated = content.length > max ? `${content.slice(0, max)}…` : content;
  const obj = { scene_id: String(scene.index), visual_style: truncated };
  if (scene.total > 1) obj.duration_sec = '8';
  return JSON.stringify(obj, null, 2);
}

function sceneClipboardPayload(scene) {
  const c = String(scene?.structuredScene?.content || '').trim();
  if (c) {
    return JSON.stringify(
      { scene_id: String(scene.structuredScene?.scene_id ?? scene.index), content: c },
      null,
      2,
    );
  }
  return String(scene.promptFull || '');
}

function statusLabel(s) {
  if (s === 'completed') return 'Hoàn thành';
  if (s === 'error') return 'Lỗi';
  if (s === 'sent') return 'Đã gửi';
  return 'Chờ';
}

export default function TextVideoResultsPanel({
  run,
  savedVideos,
  busy,
  focusVideosKey = 0,
  generationLogs = '',
  runError = '',
  lastApiSourceLabel = '',
  onOpenPreview,
  onDownload,
  onDelete,
  onUpdateScenePrompt,
  onBulkReplacePrompts,
}) {
  const rootRef = useRef(null);
  const [tab, setTab] = useState('videos');
  const [videoView, setVideoView] = useState('grid');
  const [menuRow, setMenuRow] = useState(null);
  const [promptModal, setPromptModal] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const scenes = run?.scenes ?? [];
  const hasRun = scenes.length > 0;

  const sceneByVideoId = useMemo(() => {
    const m = new Map();
    for (const s of scenes) {
      if (s.videoId) m.set(s.videoId, s);
    }
    return m;
  }, [scenes]);

  const logErrorLines = useMemo(() => {
    const raw = String(generationLogs || '');
    const lines = raw.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const line of lines) {
      if (LOG_ERROR_LINE_RE.test(line) && !seen.has(line)) {
        seen.add(line);
        out.push(line);
      }
    }
    return out;
  }, [generationLogs]);

  const runSceneErrors = useMemo(
    () => scenes.filter((s) => s.status === 'error' && (s.error || s.promptFull)),
    [scenes],
  );

  useEffect(() => {
    if (!focusVideosKey) return;
    setTab('videos');
    window.requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [focusVideosKey]);

  useEffect(() => {
    if (!menuRow) return undefined;
    const onDoc = () => setMenuRow(null);
    const t = window.setTimeout(() => document.addEventListener('click', onDoc), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('click', onDoc);
    };
  }, [menuRow]);

  const stats = useMemo(() => {
    if (!scenes.length) {
      return { total: 0, sent: 0, done: 0, err: 0, pending: 0 };
    }
    const total = scenes.length;
    const sent = scenes.filter((s) => s.status === 'sent' || s.status === 'completed' || s.status === 'error').length;
    const done = scenes.filter((s) => s.status === 'completed').length;
    const err = scenes.filter((s) => s.status === 'error').length;
    const pending = scenes.filter((s) => s.status === 'pending').length;
    return { total, sent, done, err, pending };
  }, [scenes]);

  const charRows = useMemo(() => {
    if (!run) return [];
    const castRows = Array.isArray(run.castItems)
      ? run.castItems.map((row, idx) => ({
          key: String(row?.key || `cast-${idx}`),
          name: String(row?.name || '—').trim() || '—',
          category: String(row?.category || '—').trim() || '—',
          description: String(row?.description ?? '—'),
        }))
      : [];
    const tech = {
      model: run.model,
      resolution: run.resolution,
      aspectRatio: run.aspectRatio,
      language: run.language,
      scenes: run.scenes?.length || 0,
      viaUltra: Boolean(run.viaUltra),
    };
    const metaRows = [
      {
        key: 'style',
        name: run.styleLabel || '—',
        category: 'Phong cách (preset)',
        description: run.styleLabel || '—',
      },
      {
        key: 'idea',
        name: 'Ý tưởng chính',
        category: 'Nội dung',
        description: run.baseUserPrompt || '—',
      },
      {
        key: 'tech',
        name: 'Thiết lập Veo',
        category: 'Kỹ thuật',
        description: JSON.stringify(tech, null, 2),
      },
    ];
    if (castRows.length) return [...castRows, ...metaRows];
    return metaRows;
  }, [run]);

  const closePromptModal = useCallback(() => setPromptModal(null), []);

  const savePromptModal = useCallback(() => {
    if (!promptModal || !onUpdateScenePrompt) return;
    let text = String(promptModal.text ?? '');
    if (promptModal.splitByLine) {
      text = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n');
    }
    onUpdateScenePrompt(promptModal.index, text);
    closePromptModal();
  }, [promptModal, onUpdateScenePrompt, closePromptModal]);

  const openBulkEdit = useCallback(() => {
    if (!hasRun || !onBulkReplacePrompts) return;
    setBulkText(scenes.map((s) => s.promptFull).join(BULK_SCENE_DELIM));
    setBulkOpen(true);
  }, [hasRun, onBulkReplacePrompts, scenes]);

  const saveBulkEdit = useCallback(() => {
    if (!onBulkReplacePrompts || !hasRun) return;
    const parts = bulkText.split(BULK_SCENE_DELIM);
    if (parts.length !== scenes.length) {
      window.alert(
        `Cần đúng ${scenes.length} khúc prompt (đã tách bằng dòng ___Veo3PRO_SCENE___ đơn độc giữa các khúc). Hiện có ${parts.length} khúc.`,
      );
      return;
    }
    onBulkReplacePrompts(parts.map((p) => p.trim()));
    setBulkOpen(false);
  }, [bulkText, hasRun, onBulkReplacePrompts, scenes.length]);

  const tabIndex = TABS.findIndex((t) => t.id === tab);
  const progressPct = TABS.length > 1 ? Math.round((tabIndex / (TABS.length - 1)) * 100) : 100;

  return (
    <div
      ref={rootRef}
      id="text-video-ket-qua"
      className={`tv-results ${!hasRun ? 'tv-results--empty' : ''} tv-results--footer`}
    >
      <div className="tv-results-head">
        <span className="tv-results-title">Kết quả:</span>
        <div className="tv-results-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`tv-results-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="tv-results-tab-ic" aria-hidden="true">
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tv-results-progress" aria-hidden="true">
        <div className="tv-results-progress-line">
          <div className="tv-results-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="tv-results-progress-nodes">
          {TABS.map((t, i) => (
            <span key={t.id} className={`tv-results-progress-node ${i <= tabIndex ? 'on' : ''}`} />
          ))}
        </div>
      </div>

      <div className="tv-results-toolbar">
        <div className="tv-results-badges">
          <span className="tv-badge tv-badge--outline">Tổng số prompt: {stats.total}</span>
          <span className="tv-badge tv-badge--muted" title="Chưa gửi Veo">
            Chờ: {stats.pending}
          </span>
          <span className="tv-badge">Đã gửi: {stats.sent}</span>
          <span className="tv-badge">Hoàn thành: {stats.done}</span>
          <span className="tv-badge">Lỗi: {stats.err}</span>
          {tab === 'apiLogs' ? (
            <span className="tv-badge tv-badge--outline" title="Dòng nhật ký khớp bộ lọc lỗi">
              Log lỗi: {logErrorLines.length}
            </span>
          ) : null}
          {busy ? <span className="tv-badge tv-badge--pulse">Đang chạy…</span> : null}
        </div>
        <div className="tv-results-toolbar-end">
          {tab === 'apiLogs' && (
            <button
              type="button"
              className="btn btn-secondary tv-results-action-btn"
              disabled={!String(generationLogs || '').trim()}
              onClick={() => navigator.clipboard?.writeText(String(generationLogs || ''))}
            >
              Sao chép nhật ký
            </button>
          )}
          {tab === 'videos' && (
            <div className="tv-results-views" role="group" aria-label="Chế độ xem">
              <button
                type="button"
                className={`tv-view-btn ${videoView === 'list' ? 'active' : ''}`}
                title="Danh sách"
                aria-label="Danh sách"
                onClick={() => setVideoView('list')}
              >
                ≡
              </button>
              <button
                type="button"
                className={`tv-view-btn ${videoView === 'grid' ? 'active' : ''}`}
                title="Lưới"
                aria-label="Lưới"
                onClick={() => setVideoView('grid')}
              >
                ▦
              </button>
            </div>
          )}
          {tab === 'prompts' && (
            <>
              <button type="button" className="btn btn-secondary tv-results-action-btn" disabled={!hasRun} onClick={openBulkEdit}>
                Sửa toàn bộ prompt
              </button>
              <button
                type="button"
                className="btn btn-primary tv-results-action-btn"
                disabled
                title="Tăng số «Phân cảnh» ở trên rồi bấm Tạo video lại để thêm clip."
              >
                + Thêm prompt
              </button>
            </>
          )}
          {tab === 'scenes' && (
            <>
              <button type="button" className="btn btn-secondary tv-results-action-btn" disabled={!hasRun} onClick={openBulkEdit}>
                Sửa toàn bộ cảnh
              </button>
              <button
                type="button"
                className="btn btn-primary tv-results-action-btn"
                disabled
                title="Tăng số «Phân cảnh» ở trên rồi bấm Tạo video lại."
              >
                + Thêm cảnh
              </button>
            </>
          )}
        </div>
      </div>

      <div className="tv-results-body">
        {!hasRun && (
          <p className="tv-results-placeholder tv-results-placeholder--top">
            Chưa có lần tạo video nào. Nhập prompt và bấm «Tạo video» — dữ liệu từng tab sẽ cập nhật tại đây.
          </p>
        )}

        {tab === 'chars' && (
          <div className="tv-table-wrap">
            <table className="tv-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>#</th>
                  <th style={{ width: 200 }}>TÊN</th>
                  <th>MÔ TẢ</th>
                  <th style={{ width: 56 }}> </th>
                </tr>
              </thead>
              <tbody>
                {hasRun ? (
                  charRows.map((row, i) => (
                    <tr key={row.key}>
                      <td>{i + 1}</td>
                      <td>
                        <div className="tv-cell-name">{row.name}</div>
                        <div className="tv-cell-cat">({row.category})</div>
                      </td>
                      <td>
                        <pre className="tv-pre">{row.description}</pre>
                      </td>
                      <td>
                        <div className="tv-pop">
                          <button
                            type="button"
                            className="tv-kebab"
                            aria-label="Thao tác"
                            title="Sao chép mô tả"
                            onClick={() => navigator.clipboard?.writeText(row.description)}
                          >
                            ⋮
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="tv-table-empty">
                      Chưa có dữ liệu nhân vật &amp; bối cảnh có cấu trúc — sẽ hiện sau khi bạn tạo video (tóm tắt từ prompt / phong cách).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {hasRun ? (
              <p className="tv-results-hint">
                {run.castLoading
                  ? 'Đang gọi Gemini để sinh tên nhân vật & bối cảnh từ prompt của bạn…'
                  : run.castError && !(Array.isArray(run.castItems) && run.castItems.length)
                    ? `Không tải được danh sách nhân vật: ${run.castError}`
                    : Array.isArray(run.castItems) && run.castItems.length
                      ? 'Các hàng đầu do Gemini suy ra từ prompt (nhất quán giữa các cảnh). Phía dưới là preset phong cách, ý tưởng gốc và thiết lập kỹ thuật.'
                      : 'Sau khi bấm «Tạo video», hệ thống tự sinh nhân vật (có tên) và bối cảnh nếu có GEMINI_API_KEY / key hợp lệ.'}
              </p>
            ) : null}
          </div>
        )}

        {tab === 'scenes' && (
          <div className="tv-table-wrap">
            <table className="tv-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <span className="sr-only">Chọn</span>
                  </th>
                  <th style={{ width: 44 }}>#</th>
                  <th>CẢNH</th>
                  <th style={{ width: 100 }}>Trạng thái</th>
                  <th style={{ width: 56 }}> </th>
                </tr>
              </thead>
              <tbody>
                {hasRun ? (
                  scenes.map((scene) => (
                    <tr key={scene.index}>
                      <td>
                        <input type="checkbox" disabled className="tv-checkbox" title="Chọn dòng" aria-label={`Chọn cảnh ${scene.index}`} />
                      </td>
                      <td>{scene.index}</td>
                      <td>
                        <pre className="tv-pre tv-pre--sm">{sceneJsonSnippet(scene)}</pre>
                      </td>
                      <td>
                        <span className={`tv-pill tv-pill--${scene.status}`}>{statusLabel(scene.status)}</span>
                      </td>
                      <td>
                        <div className="tv-pop">
                          <button
                            type="button"
                            className="tv-kebab"
                            aria-haspopup="true"
                            aria-expanded={menuRow === `s-${scene.index}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuRow((v) => (v === `s-${scene.index}` ? null : `s-${scene.index}`));
                            }}
                          >
                            ⋮
                          </button>
                          {menuRow === `s-${scene.index}` && (
                            <ul className="tv-dropdown" onClick={(e) => e.stopPropagation()}>
                              <li>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPromptModal({ index: scene.index, text: scene.promptFull, splitByLine: false });
                                    setMenuRow(null);
                                  }}
                                >
                                  Xem / sửa prompt
                                </button>
                              </li>
                              <li>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard?.writeText(sceneClipboardPayload(scene));
                                    setMenuRow(null);
                                  }}
                                >
                                  Sao chép
                                </button>
                              </li>
                            </ul>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="tv-table-empty">
                      Chưa có bảng phân cảnh — bấm «Tạo video» để xem JSON từng cảnh (ưu tiên dạng scene_id + content với @CHAR và #BACKGROUND).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {hasRun && run?.structuredScenesError ? (
              <p className="tv-results-hint tv-results-hint--warn">
                Phân cảnh có cấu trúc (@CHAR / #BACKGROUND) chưa tải: {run.structuredScenesError}
              </p>
            ) : hasRun ? (
              <p className="tv-results-hint">
                Sau khi cast nhân vật &amp; bối cảnh xong, Gemini sinh JSON{' '}
                <code>scene_id</code> + <code>content</code> (dạng <code>@CHAR_1</code>, <code>#BACKGROUND_1</code>, mũi tên{' '}
                <code>-&gt;</code>). Nếu chưa thấy, kiểm tra key API hoặc tab Logs.
              </p>
            ) : null}
          </div>
        )}

        {tab === 'prompts' && (
          <div className="tv-table-wrap">
            <table className="tv-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <span className="sr-only">Chọn</span>
                  </th>
                  <th style={{ width: 44 }}>#</th>
                  <th>PROMPT</th>
                  <th style={{ width: 88 }}>THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {hasRun ? (
                  scenes.map((scene) => {
                    const openPromptDetail = () =>
                      setPromptModal({ index: scene.index, text: scene.promptFull, splitByLine: false });
                    return (
                    <tr key={scene.index}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" disabled className="tv-checkbox" aria-label={`Chọn prompt ${scene.index}`} />
                      </td>
                      <td className="tv-td--prompt-open" onClick={openPromptDetail} title="Xem chi tiết prompt">
                        {scene.index}
                      </td>
                      <td
                        className="tv-td--prompt-open"
                        tabIndex={0}
                        role="button"
                        title="Xem / sửa prompt đầy đủ"
                        aria-label={`Xem chi tiết prompt cảnh ${scene.index}`}
                        onClick={openPromptDetail}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openPromptDetail();
                          }
                        }}
                      >
                        <pre className="tv-pre tv-pre--sm">{sceneJsonSnippet(scene)}</pre>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="tv-pop">
                          <button
                            type="button"
                            className="tv-kebab"
                            aria-haspopup="true"
                            aria-expanded={menuRow === `p-${scene.index}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuRow((v) => (v === `p-${scene.index}` ? null : `p-${scene.index}`));
                            }}
                          >
                            ⋮
                          </button>
                          {menuRow === `p-${scene.index}` && (
                            <ul className="tv-dropdown" onClick={(e) => e.stopPropagation()}>
                              <li>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPromptModal({ index: scene.index, text: scene.promptFull, splitByLine: false });
                                    setMenuRow(null);
                                  }}
                                >
                                  Xem / sửa prompt
                                </button>
                              </li>
                              <li>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard?.writeText(sceneClipboardPayload(scene));
                                    setMenuRow(null);
                                  }}
                                >
                                  Sao chép
                                </button>
                              </li>
                            </ul>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="tv-table-empty">
                      Chưa có prompt theo từng cảnh — bấm «Tạo video» để xem đúng nội dung gửi Veo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {hasRun ? (
              <p className="tv-results-hint">
                Cột PROMPT hiển thị tóm tắt JSON (scene_id, visual_style hoặc content). Bấm vào một dòng hoặc menu ⋮ → «Xem / sửa prompt» để mở toàn bộ nội dung gửi Veo.
              </p>
            ) : null}
          </div>
        )}

        {tab === 'videos' && (
          <div className={videoView === 'grid' ? 'tv-video-grid' : 'tv-video-list'}>
            {savedVideos.length === 0 ? (
              <p className="tv-results-placeholder">Chưa có video.</p>
            ) : (
              savedVideos.map((vid, i) => {
                const scene = sceneByVideoId.get(vid.id);
                const idx = i + 1;
                const menuKey = `v-gallery-${vid.id}`;
                return (
                  <article key={vid.id} className="tv-video-card">
                    <div className="tv-video-thumb-wrap">
                      <span className="tv-video-idx">{idx}</span>
                      <span className="tv-video-res">{run?.resolution || '—'}</span>
                      <button type="button" className="tv-video-zoom" onClick={() => onOpenPreview?.(vid)}>
                        Phóng to
                      </button>
                      <button type="button" className="tv-video-play" onClick={() => onOpenPreview?.(vid)} aria-label={`Xem video ${idx}`}>
                        <span aria-hidden="true">▶</span>
                      </button>
                      <video className="tv-video-thumb" src={vid.src} muted playsInline preload="metadata" />
                    </div>
                    <div className="tv-video-meta">
                      <span>{vid.name || `Video ${idx}`}</span>
                      {scene ? (
                        <span className={`tv-pill tv-pill--${scene.status === 'error' ? 'error' : 'completed'}`}>{statusLabel(scene.status)}</span>
                      ) : (
                        <span className="tv-pill tv-pill--completed">Đã lưu</span>
                      )}
                      <div className="tv-pop tv-pop--inline">
                        <button
                          type="button"
                          className="tv-kebab tv-kebab--inline"
                          aria-expanded={menuRow === menuKey}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuRow((v) => (v === menuKey ? null : menuKey));
                          }}
                        >
                          ⋮
                        </button>
                        {menuRow === menuKey && (
                          <ul className="tv-dropdown tv-dropdown--right" onClick={(e) => e.stopPropagation()}>
                            <li>
                              <button type="button" onClick={() => { onDownload?.(vid.id); setMenuRow(null); }}>Tải về</button>
                            </li>
                            <li>
                              <button type="button" className="danger" onClick={() => { onDelete?.(vid.id); setMenuRow(null); }}>Xóa</button>
                            </li>
                          </ul>
                        )}
                      </div>
                    </div>
                    {scene ? (
                      <pre className="tv-pre tv-pre--caption">{sceneJsonSnippet(scene)}</pre>
                    ) : (
                      <p className="tv-video-caption-fallback">Clip đã lưu cục bộ — không gắn với lần chạy «Kết quả» gần nhất.</p>
                    )}
                  </article>
                );
              })
            )}
          </div>
        )}

        {tab === 'apiLogs' && (
          <div className="tv-logs-panel">
            {lastApiSourceLabel ? (
              <p className="tv-logs-meta">
                API / Profile gần nhất: <strong>{lastApiSourceLabel}</strong>
              </p>
            ) : null}

            {String(runError || '').trim() ? (
              <div className="tv-logs-run-error" role="alert">
                <span className="tv-logs-run-error-label">Lỗi giao diện</span>
                <p>{String(runError).trim()}</p>
              </div>
            ) : null}

            {runSceneErrors.length > 0 ? (
              <div className="tv-logs-scene-errors">
                <h4 className="tv-logs-subhead">Lỗi theo phân cảnh ({runSceneErrors.length})</h4>
                <ul className="tv-logs-error-list">
                  {runSceneErrors.map((s) => (
                    <li key={s.index}>
                      <span className="tv-logs-scene-idx">Cảnh {s.index}</span>
                      <pre className="tv-logs-line">{String(s.error || 'Lỗi không rõ').trim()}</pre>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <h4 className="tv-logs-subhead">Dòng lỗi / cảnh báo trong nhật ký ({logErrorLines.length})</h4>
            {logErrorLines.length > 0 ? (
              <ul className="tv-logs-error-list tv-logs-error-list--compact">
                {logErrorLines.map((line, i) => (
                  <li key={`${i}-${line.slice(0, 40)}`}>
                    <pre className="tv-logs-line">{line}</pre>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tv-results-hint">Chưa có dòng nào khớp bộ lọc (lỗi, thất bại, quota, HTTP 4xx/5xx, timeout…).</p>
            )}

            <h4 className="tv-logs-subhead">Toàn bộ nhật ký</h4>
            <pre className="tv-logs-full">{String(generationLogs || '').trim() || 'Chưa có nhật ký.'}</pre>
          </div>
        )}
      </div>

      {promptModal && (
        <div className="tv-modal-backdrop" role="presentation" onClick={closePromptModal}>
          <div className="tv-modal tv-modal--wide" role="dialog" aria-labelledby="tv-modal-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="tv-modal-title" className="tv-modal-title">Thêm / sửa prompt</h3>
            <p className="tv-modal-scene-hint">
              Cảnh <strong>{promptModal.index}</strong> — chỉnh sửa nội dung đầy đủ gửi Veo (khác phần tóm tắt trong bảng).
            </p>
            <label className="tv-modal-label" htmlFor="tv-modal-prompt">Prompt</label>
            <textarea
              id="tv-modal-prompt"
              className="tv-modal-textarea"
              value={promptModal.text}
              onChange={(e) => setPromptModal((m) => ({ ...m, text: e.target.value }))}
              rows={16}
            />
            <label className="tv-modal-check">
              <input
                type="checkbox"
                checked={Boolean(promptModal.splitByLine)}
                onChange={(e) => setPromptModal((m) => ({ ...m, splitByLine: e.target.checked }))}
              />
              <span>Tách theo xuống dòng (mỗi dòng 1 prompt)</span>
            </label>
            <p className="tv-results-hint tv-modal-split-hint">
              Khi bật và bấm Lưu: bỏ dòng trống, giữ mỗi dòng không trống (gộp thành một khối prompt cho cảnh này).
            </p>
            <div className="tv-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={closePromptModal}>
                Hủy
              </button>
              <button type="button" className="btn btn-primary" onClick={savePromptModal}>
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkOpen && (
        <div className="tv-modal-backdrop" role="presentation" onClick={() => setBulkOpen(false)}>
          <div className="tv-modal" role="dialog" aria-labelledby="tv-bulk-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="tv-bulk-title" className="tv-modal-title">Sửa toàn bộ prompt / cảnh</h3>
            <p className="tv-results-hint" style={{ marginTop: 0 }}>
              Mỗi phân cảnh là một khúc; giữ nguyên dòng phân cách <code>___Veo3PRO_SCENE___</code> (một dòng) giữa các khúc — đúng {scenes.length} khúc.
            </p>
            <label className="tv-modal-label" htmlFor="tv-bulk-text">Nội dung</label>
            <textarea id="tv-bulk-text" className="tv-modal-textarea" value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={16} />
            <div className="tv-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setBulkOpen(false)}>
                Hủy
              </button>
              <button type="button" className="btn btn-primary" onClick={saveBulkEdit}>
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
