import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const ACCEPT_AUDIO = 'audio/*,.mp3,.wav,.m4a,.webm,.ogg';

function formatDuration(sec) {
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function initialsFromLabel(label) {
  const t = String(label || 'M').trim();
  return t
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function VoiceCloneTab() {
  const [workspace, setWorkspace] = useState(null);
  /** @type {'idle'|'recording'|'stopped'} */
  const [recPhase, setRecPhase] = useState('idle');
  const [recSec, setRecSec] = useState(0);
  const [fastFile, setFastFile] = useState(null);
  const [proFile, setProFile] = useState(null);
  const [fastRecordBlob, setFastRecordBlob] = useState(null);
  const [fastRecordUrl, setFastRecordUrl] = useState('');
  const [proRecordBlob, setProRecordBlob] = useState(null);
  const [proRecordUrl, setProRecordUrl] = useState('');
  const [error, setError] = useState('');
  const [proMenuOpen, setProMenuOpen] = useState(false);
  const [fastMenuOpen, setFastMenuOpen] = useState(false);
  const [fastPreviewUrl, setFastPreviewUrl] = useState('');
  const [proPreviewUrl, setProPreviewUrl] = useState('');

  const fastInputRef = useRef(null);
  const proInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const tickRef = useRef(null);
  const audioOriginalRef = useRef(null);
  const audioFastRef = useRef(null);
  const audioProRef = useRef(null);

  const revokeIfBlobUrl = useCallback((url) => {
    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    return () => {
      revokeIfBlobUrl(fastRecordUrl);
      revokeIfBlobUrl(proRecordUrl);
      if (tickRef.current) window.clearInterval(tickRef.current);
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
    };
  }, [fastRecordUrl, proRecordUrl, revokeIfBlobUrl]);

  useEffect(() => {
    if (!fastFile) {
      setFastPreviewUrl((p) => {
        if (p) URL.revokeObjectURL(p);
        return '';
      });
      return;
    }
    const u = URL.createObjectURL(fastFile);
    setFastPreviewUrl((p) => {
      if (p) URL.revokeObjectURL(p);
      return u;
    });
    return () => URL.revokeObjectURL(u);
  }, [fastFile]);

  useEffect(() => {
    if (!proFile) {
      setProPreviewUrl((p) => {
        if (p) URL.revokeObjectURL(p);
        return '';
      });
      return;
    }
    const u = URL.createObjectURL(proFile);
    setProPreviewUrl((p) => {
      if (p) URL.revokeObjectURL(p);
      return u;
    });
    return () => URL.revokeObjectURL(u);
  }, [proFile]);

  useEffect(() => {
    const close = (e) => {
      if (proMenuOpen) {
        const proEl = document.getElementById('voice-clone-pro-split');
        if (proEl && !proEl.contains(e.target)) setProMenuOpen(false);
      }
      if (fastMenuOpen) {
        const fastEl = document.getElementById('voice-clone-fast-split');
        if (fastEl && !fastEl.contains(e.target)) setFastMenuOpen(false);
      }
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [proMenuOpen, fastMenuOpen]);

  const profileLabel = 'Mẫu của bạn';

  const { originalAudioUrl, fastCloneAudioUrl, proCloneAudioUrl } = useMemo(() => {
    const original =
      fastPreviewUrl || fastRecordUrl || proPreviewUrl || proRecordUrl || '';
    const fastClone = fastRecordUrl || fastPreviewUrl || '';
    const proClone = proRecordUrl || proPreviewUrl || '';
    return {
      originalAudioUrl: original,
      fastCloneAudioUrl: fastClone,
      proCloneAudioUrl: proClone,
    };
  }, [fastPreviewUrl, fastRecordUrl, proPreviewUrl, proRecordUrl]);

  const showCompare = Boolean(originalAudioUrl || fastCloneAudioUrl || proCloneAudioUrl);

  const onPickFast = (e) => {
    const f = e.target.files?.[0];
    setFastFile(f || null);
    setError('');
    if (f) setWorkspace('fast-upload');
  };

  const onPickPro = (e) => {
    const f = e.target.files?.[0];
    setProFile(f || null);
    setError('');
    if (f) setWorkspace('pro-upload');
  };

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /** @param {'fast'|'pro'} mode */
  const startRecording = async (mode) => {
    setError('');
    if (mode === 'fast') {
      revokeIfBlobUrl(fastRecordUrl);
      setFastRecordBlob(null);
      setFastRecordUrl('');
    } else {
      revokeIfBlobUrl(proRecordUrl);
      setProRecordBlob(null);
      setProRecordUrl('');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data?.size) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const url = URL.createObjectURL(blob);
        if (mode === 'fast') {
          setFastRecordBlob(blob);
          setFastRecordUrl(url);
        } else {
          setProRecordBlob(blob);
          setProRecordUrl(url);
        }
        stopStream();
        setRecPhase('stopped');
      };
      mr.start(200);
      mediaRecorderRef.current = mr;
      setRecPhase('recording');
      setRecSec(0);
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = window.setInterval(() => setRecSec((n) => n + 1), 1000);
      setWorkspace(mode === 'fast' ? 'fast-record' : 'pro-record');
    } catch (err) {
      setError(err?.message || 'Không truy cập được micro. Kiểm tra quyền trình duyệt.');
    }
  };

  const stopRecording = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  };

  const downloadBlob = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const activePlaybackUrl = workspace === 'fast-record' ? fastRecordUrl : workspace === 'pro-record' ? proRecordUrl : '';
  const activePlaybackBlob = workspace === 'fast-record' ? fastRecordBlob : workspace === 'pro-record' ? proRecordBlob : null;

  const playCard = (which) => {
    const refs = { original: audioOriginalRef, fast: audioFastRef, pro: audioProRef };
    const others = ['original', 'fast', 'pro'].filter((k) => k !== which);
    others.forEach((k) => refs[k].current?.pause());
    refs[which].current?.play().catch(() => {});
  };

  return (
    <div className="voice-clone-root">
      <div className="voice-clone-hero">
        <div className="voice-clone-hero-text">
          <h3 className="voice-clone-title">Nhân bản giọng</h3>
          <p className="voice-clone-sub">
            Tạo bản sao giọng nói của bạn với chất lượng phòng thu. Chọn hình thức tạo giọng phù hợp để bắt đầu.
          </p>
        </div>
      </div>

      <input ref={fastInputRef} type="file" accept={ACCEPT_AUDIO} className="voice-clone-sr-only" onChange={onPickFast} />
      <input ref={proInputRef} type="file" accept={ACCEPT_AUDIO} className="voice-clone-sr-only" onChange={onPickPro} />

      <section className="voice-clone-flow" aria-label="Luồng nhân bản giọng">
        <article className="voice-clone-flow-card">
          <div className="voice-clone-flow-avatar-wrap">
            <div className="voice-clone-flow-avatar">{initialsFromLabel(profileLabel)}</div>
          </div>
          <h4 className="voice-clone-flow-title">Giọng gốc</h4>
          <p className="voice-clone-flow-name">{profileLabel}</p>
        </article>

        <span className="voice-clone-flow-arrow" aria-hidden="true">
          &raquo;
        </span>

        <article className="voice-clone-flow-card">
          <div className="voice-clone-flow-avatar-wrap">
            <div className="voice-clone-flow-avatar">{initialsFromLabel(profileLabel)}</div>
            <span className="voice-clone-flow-badge voice-clone-flow-badge--fast" title="Nhanh">
              ⚡
            </span>
          </div>
          <h4 className="voice-clone-flow-title">Giọng nhân bản nhanh</h4>
          <p className="voice-clone-flow-name">{profileLabel}</p>
        </article>

        <span className="voice-clone-flow-arrow" aria-hidden="true">
          &raquo;
        </span>

        <article className="voice-clone-flow-card">
          <div className="voice-clone-flow-avatar-wrap">
            <div className="voice-clone-flow-avatar">{initialsFromLabel(profileLabel)}</div>
            <span className="voice-clone-flow-badge voice-clone-flow-badge--pro" title="Chuyên nghiệp">
              ✨
            </span>
          </div>
          <h4 className="voice-clone-flow-title">Giọng nhân bản chuyên nghiệp</h4>
          <p className="voice-clone-flow-name">{profileLabel}</p>
        </article>
      </section>

      <div className="voice-clone-cards">
        <article className="voice-clone-card">
          <div className="voice-clone-card-top">
            <span className="voice-clone-card-ic" aria-hidden="true">
              ⚡
            </span>
            <span className="voice-clone-tag voice-clone-tag--muted">Nhanh và dễ</span>
          </div>
          <h4 className="voice-clone-card-title">Nhanh</h4>
          <p className="voice-clone-card-desc">Nhân bản giọng nói của bạn chỉ với ~10 giây audio.</p>
          <div className="voice-clone-split-wrap" id="voice-clone-fast-split">
            <button
              type="button"
              className="btn voice-clone-card-btn voice-clone-split-main"
              onClick={(e) => {
                e.stopPropagation();
                setFastMenuOpen((o) => !o);
              }}
            >
              Bắt đầu ngay
            </button>
            <button
              type="button"
              className="btn voice-clone-card-btn voice-clone-split-caret"
              aria-expanded={fastMenuOpen}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                setFastMenuOpen((o) => !o);
              }}
            >
              ▾
            </button>
            {fastMenuOpen ? (
              <div className="voice-clone-dropdown" role="menu">
                <button
                  type="button"
                  className="voice-clone-dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    setFastMenuOpen(false);
                    fastInputRef.current?.click();
                  }}
                >
                  Tải tệp lên
                </button>
                <button
                  type="button"
                  className="voice-clone-dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    setFastMenuOpen(false);
                    void startRecording('fast');
                  }}
                >
                  Ghi âm
                </button>
              </div>
            ) : null}
          </div>
        </article>

        <article className="voice-clone-card voice-clone-card--pro">
          <div className="voice-clone-card-top">
            <span className="voice-clone-card-ic voice-clone-card-ic--check" aria-hidden="true">
              ✓
            </span>
            <span className="voice-clone-tag voice-clone-tag--purple">Chất lượng cao</span>
          </div>
          <h4 className="voice-clone-card-title">
            Chuyên nghiệp <span className="voice-clone-new-pill">Mới</span>
          </h4>
          <p className="voice-clone-card-desc">
            Chất lượng giọng nhân bản chân thực nhất. Cần tối thiểu 5 phút ghi âm rõ ràng.
          </p>
          <div className="voice-clone-split-wrap" id="voice-clone-pro-split">
            <button
              type="button"
              className="btn voice-clone-card-btn voice-clone-split-main"
              onClick={(e) => {
                e.stopPropagation();
                setProMenuOpen((o) => !o);
              }}
            >
              Bắt đầu ngay
            </button>
            <button
              type="button"
              className="btn voice-clone-card-btn voice-clone-split-caret"
              aria-expanded={proMenuOpen}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                setProMenuOpen((o) => !o);
              }}
            >
              ▾
            </button>
            {proMenuOpen ? (
              <div className="voice-clone-dropdown" role="menu">
                <button
                  type="button"
                  className="voice-clone-dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    setProMenuOpen(false);
                    setWorkspace('pro-upload');
                    proInputRef.current?.click();
                  }}
                >
                  Tải tệp lên <span className="voice-clone-new-pill voice-clone-new-pill--sm">Mới</span>
                </button>
                <button
                  type="button"
                  className="voice-clone-dropdown-item"
                  role="menuitem"
                  onClick={() => {
                    setProMenuOpen(false);
                    void startRecording('pro');
                  }}
                >
                  Ghi âm
                </button>
              </div>
            ) : null}
          </div>
        </article>
      </div>

      {error ? <div className="voice-clone-error">{error}</div> : null}

      {workspace === 'fast-upload' && fastFile ? (
        <section className="voice-clone-workspace" aria-labelledby="ws-fast-title">
          <h4 id="ws-fast-title" className="voice-clone-ws-title">
            Chế độ Nhanh — đã chọn tệp
          </h4>
          <p className="hint voice-clone-ws-hint">
            {fastFile.name} ({Math.round(fastFile.size / 1024)} KB). Gợi ý: clip ngắn ~10s, ít nhiễu nền.
          </p>
          {fastPreviewUrl ? <audio className="voice-clone-audio" controls src={fastPreviewUrl} /> : null}
          <div className="voice-clone-ws-actions">
            <button type="button" className="btn btn-secondary" onClick={() => fastInputRef.current?.click()}>
              Chọn tệp khác
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => downloadBlob(fastFile, fastFile.name || 'audio-sample.webm')}
            >
              Tải xuống bản sao
            </button>
          </div>
          <p className="hint voice-clone-ws-note">
            Tích hợp API nhân bản giọng Vbee (Studio) sẽ gửi tệp này lên server — hiện chỉ xử lý cục bộ trong trình duyệt.
          </p>
        </section>
      ) : null}

      {workspace === 'pro-upload' && proFile ? (
        <section className="voice-clone-workspace" aria-labelledby="ws-pro-title">
          <h4 id="ws-pro-title" className="voice-clone-ws-title">
            Chuyên nghiệp — tải tệp lên
          </h4>
          <p className="hint voice-clone-ws-hint">
            {proFile.name} ({Math.round(proFile.size / 1024)} KB). Nên ≥ 5 phút, giọng rõ, ít vang.
          </p>
          {proPreviewUrl ? <audio className="voice-clone-audio" controls src={proPreviewUrl} /> : null}
          <div className="voice-clone-ws-actions">
            <button type="button" className="btn btn-secondary" onClick={() => proInputRef.current?.click()}>
              Chọn tệp khác
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => downloadBlob(proFile, proFile.name || 'voice-pro-sample.webm')}
            >
              Tải xuống bản sao
            </button>
          </div>
        </section>
      ) : null}

      {workspace === 'fast-record' || workspace === 'pro-record' ? (
        <section className="voice-clone-workspace" aria-labelledby="ws-rec-title">
          <h4 id="ws-rec-title" className="voice-clone-ws-title">
            {workspace === 'fast-record' ? 'Chế độ Nhanh — ghi âm' : 'Chuyên nghiệp — ghi âm'}
          </h4>
          {recPhase === 'recording' ? (
            <p className="voice-clone-rec-status">
              Đang ghi… <strong>{formatDuration(recSec)}</strong> —{' '}
              {workspace === 'fast-record'
                ? 'nhấn Dừng khi đủ ~10 giây (mẫu nhanh, ít nhiễu).'
                : 'nhấn Dừng khi đủ độ dài (gợi ý ≥ 5 phút cho chế độ chuyên nghiệp).'}
            </p>
          ) : null}
          {recPhase === 'stopped' && activePlaybackBlob ? (
            <p className="hint voice-clone-ws-hint">
              Đã ghi {Math.round(activePlaybackBlob.size / 1024)} KB · {formatDuration(recSec)}
            </p>
          ) : null}
          <div className="voice-clone-ws-actions">
            {recPhase === 'idle' || recPhase === 'stopped' ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void startRecording(workspace === 'fast-record' ? 'fast' : 'pro')}
              >
                {recPhase === 'stopped' ? 'Ghi lại' : 'Bắt đầu ghi'}
              </button>
            ) : null}
            {recPhase === 'recording' ? (
              <button type="button" className="btn btn-secondary" onClick={stopRecording}>
                Dừng ghi
              </button>
            ) : null}
          </div>
          {activePlaybackUrl ? <audio className="voice-clone-audio" controls src={activePlaybackUrl} /> : null}
          {activePlaybackBlob && recPhase === 'stopped' ? (
            <button
              type="button"
              className="btn btn-secondary voice-clone-dl-rec"
              onClick={() => downloadBlob(activePlaybackBlob, `ghi-am-${Date.now()}.webm`)}
            >
              Tải file ghi âm
            </button>
          ) : null}
        </section>
      ) : null}

      {showCompare ? (
        <section className="voice-clone-compare" aria-labelledby="voice-clone-compare-title">
          <h4 id="voice-clone-compare-title" className="voice-clone-compare-heading">
            Nghe thử và so sánh kết quả tạo giọng nhân bản
          </h4>
          <div className="voice-clone-compare-row">
            <button
              type="button"
              className={`voice-clone-compare-card ${!originalAudioUrl ? 'is-empty' : ''}`}
              onClick={() => originalAudioUrl && playCard('original')}
              disabled={!originalAudioUrl}
            >
              <div className="voice-clone-compare-avatar-wrap">
                <div className="voice-clone-compare-avatar">{initialsFromLabel(profileLabel)}</div>
              </div>
              <div className="voice-clone-compare-card-text">
                <strong>Giọng gốc</strong>
                <span className="voice-clone-compare-sub">{profileLabel}</span>
              </div>
              {originalAudioUrl ? (
                <audio
                  ref={audioOriginalRef}
                  className="voice-clone-compare-audio"
                  controls
                  src={originalAudioUrl}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <p className="voice-clone-compare-placeholder">Chưa có mẫu</p>
              )}
            </button>

            <span className="voice-clone-compare-arrow" aria-hidden="true">
              ≫
            </span>

            <button
              type="button"
              className={`voice-clone-compare-card ${!fastCloneAudioUrl ? 'is-empty' : ''}`}
              onClick={() => fastCloneAudioUrl && playCard('fast')}
              disabled={!fastCloneAudioUrl}
            >
              <div className="voice-clone-compare-avatar-wrap">
                <div className="voice-clone-compare-avatar">{initialsFromLabel(profileLabel)}</div>
                <span className="voice-clone-compare-badge voice-clone-compare-badge--fast" title="Nhanh">
                  ⚡
                </span>
              </div>
              <div className="voice-clone-compare-card-text">
                <strong>Giọng nhân bản nhanh</strong>
                <span className="voice-clone-compare-sub">{profileLabel}</span>
              </div>
              {fastCloneAudioUrl ? (
                <audio
                  ref={audioFastRef}
                  className="voice-clone-compare-audio"
                  controls
                  src={fastCloneAudioUrl}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <p className="voice-clone-compare-placeholder">Tải hoặc ghi âm (Nhanh)</p>
              )}
            </button>

            <span className="voice-clone-compare-arrow" aria-hidden="true">
              ≫
            </span>

            <button
              type="button"
              className={`voice-clone-compare-card ${!proCloneAudioUrl ? 'is-empty' : ''}`}
              onClick={() => proCloneAudioUrl && playCard('pro')}
              disabled={!proCloneAudioUrl}
            >
              <div className="voice-clone-compare-avatar-wrap">
                <div className="voice-clone-compare-avatar">{initialsFromLabel(profileLabel)}</div>
                <span className="voice-clone-compare-badge voice-clone-compare-badge--pro" title="Chuyên nghiệp">
                  ✓
                </span>
              </div>
              <div className="voice-clone-compare-card-text">
                <strong>Giọng nhân bản chuyên nghiệp</strong>
                <span className="voice-clone-compare-sub">{profileLabel}</span>
              </div>
              {proCloneAudioUrl ? (
                <audio
                  ref={audioProRef}
                  className="voice-clone-compare-audio"
                  controls
                  src={proCloneAudioUrl}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <p className="voice-clone-compare-placeholder">Tải hoặc ghi âm (Chuyên nghiệp)</p>
              )}
            </button>
          </div>
          <p className="hint voice-clone-compare-note">
            Demo cục bộ: &quot;Giọng gốc&quot; là mẫu tham chiếu đầu tiên (ưu tiên tệp/ghi âm Nhanh). Hai cột nhân bản phát mẫu tương ứng từng nhánh — khi có API Vbee sẽ là file đã xử lý.
          </p>
        </section>
      ) : (
        <p className="voice-clone-footer voice-clone-footer--muted">Nghe thử và so sánh kết quả tạo giọng nhân bản — xuất hiện sau khi có ít nhất một mẫu âm thanh.</p>
      )}
    </div>
  );
}
