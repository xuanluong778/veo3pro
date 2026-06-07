import { useEffect, useRef, useState } from 'react';
import { startAutoFlow, getFlowJob } from '../flowClient.js';
import { downloadVideoBlob } from '../veoClient.js';
// Ultra is now prioritized from Text → Video main button.

function FlowStep({ label, state }) {
  return (
    <div className={`flow-step flow-step--${state}`}>
      <span className="flow-step-dot" />
      <span className="flow-step-label">{label}</span>
    </div>
  );
}

function deriveStepStates(job) {
  if (!job) {
    return {
      storyboard: 'idle',
      images: 'idle',
      video: 'idle',
    };
  }

  const sub = job.subStep || '';

  if (job.status === 'failed') {
    const sb = job.storyboard ? 'done' : sub === 'prompt_enhance' || sub === 'storyboard' ? 'active' : 'idle';
    const im =
      ['video_generation', 'merging', 'completed'].includes(sub) || job.generatedImages?.length
        ? 'done'
        : sub === 'image_generation'
          ? 'active'
          : 'idle';
    const vd =
      job.finalVideo?.url || (job.videoUri && job.videoUri.startsWith('http'))
        ? 'done'
        : sub === 'video_generation' || sub === 'merging'
          ? 'active'
          : 'idle';
    return { storyboard: sb, images: im, video: vd };
  }

  const storyActive =
    job.status === 'generating' && ['queued', 'prompt_enhance', 'storyboard'].includes(sub);
  const storyDone =
    Boolean(job.storyboard) &&
    !['queued', 'prompt_enhance', 'storyboard'].includes(sub);

  const imgActive = sub === 'image_generation';
  const imgDone =
    ['video_generation', 'merging', 'completed'].includes(sub) || job.status === 'done';

  const vidActive = sub === 'video_generation' || sub === 'merging';
  const vidDone = job.status === 'done' || sub === 'completed';

  return {
    storyboard: storyActive ? 'active' : storyDone ? 'done' : 'idle',
    images: imgActive ? 'active' : imgDone ? 'done' : 'idle',
    video: vidActive ? 'active' : vidDone ? 'done' : 'idle',
  };
}

export default function AutoFlowPanel({ hasApiKey, embedded }) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [playbackSrc, setPlaybackSrc] = useState(null);
  const blobRef = useRef(null);
  const pollTimer = useRef(null);

  const stopPoll = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  useEffect(() => () => stopPoll(), []);

  useEffect(() => {
    return () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    };
  }, []);

  useEffect(() => {
    if (!jobId) return undefined;

    stopPoll();
    const poll = async () => {
      try {
        const j = await getFlowJob(jobId);
        setJob(j);
        if (j.status === 'done' || j.status === 'failed') stopPoll();
      } catch {
        stopPoll();
      }
    };

    poll();
    pollTimer.current = setInterval(poll, 2500);
    return () => stopPoll();
  }, [jobId]);

  // Ultra UI removed.

  useEffect(() => {
    if (job?.status !== 'done') {
      setPlaybackSrc(null);
      return undefined;
    }

    const u = job.finalVideo?.url || job.videoUri;
    if (!u) {
      setPlaybackSrc(null);
      return undefined;
    }

    if (u.startsWith('/')) {
      setPlaybackSrc(u);
      return undefined;
    }

    let cancelled = false;
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }

    (async () => {
      try {
        const blob = await downloadVideoBlob(u, { operation: job?.veoOperationName });
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        blobRef.current = url;
        setPlaybackSrc(url);
      } catch {
        if (!cancelled) setPlaybackSrc(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [job?.status, job?.finalVideo?.url, job?.videoUri]);

  const onGenerate = async () => {
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }
    setPlaybackSrc(null);
    setBusy(true);
    setJob(null);
    try {
      const res = await startAutoFlow({ prompt: prompt.trim() });
      setJobId(res.jobId);
    } catch (e) {
      setJob({ status: 'failed', error: e.message, step: 'queued', subStep: 'queued' });
    } finally {
      setBusy(false);
    }
  };

  // Ultra action removed: Ultra is now prioritized from the main Text → Video button.

  const steps = deriveStepStates(job);

  return (
    <div className={embedded ? 'auto-flow-embedded' : 'panel'}>
      <h3 className="flow-panel-title">Tạo Ảnh AI</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Pipeline Pro-grade: <strong>prompt cinematic</strong> → storyboard → ảnh (retry + QC) → <strong>Veo / scene</strong> →{' '}
        <strong>FFmpeg merge</strong>. Jobs persist disk/Redis; poll <code className="inline-code">GET /api/flow/job/:id</code> for{' '}
        <code className="inline-code">progressPercent</code> / <code className="inline-code">subStep</code>.{' '}
        <code className="inline-code">GET /api/veo/status</code> vẫn dùng được khi có <code className="inline-code">veoOperationName</code>.
      </p>

      <div className="flow-steps">
        <FlowStep label="Plan & storyboard" state={steps.storyboard} />
        <span className="flow-step-arrow">→</span>
        <FlowStep label="Images (QC)" state={steps.images} />
        <span className="flow-step-arrow">→</span>
        <FlowStep label="Video + merge" state={steps.video} />
      </div>

      {job && (
        <div className="flow-progress-wrap">
          <div className="flow-progress-track">
            <div className="flow-progress-bar" style={{ width: `${Math.min(100, job.progressPercent ?? 0)}%` }} />
          </div>
          <div className="flow-progress-meta">
            {job.progressPercent ?? 0}% · <code className="inline-code">{job.subStep || job.step}</code>
          </div>
        </div>
      )}

      <div className="field">
        <label>Prompt cảnh</label>
        <textarea
          className="input"
          placeholder='Ví dụ: "a cinematic scene of a girl walking in Tokyo at night"'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="actions">
        <button type="button" className="btn btn-primary" disabled={busy || !hasApiKey || !prompt.trim()} onClick={onGenerate}>
          {busy ? 'Đang gửi...' : 'Generate'}
        </button>
      </div>

      {jobId && (
        <p className="hint">
          Job ID: <strong>{jobId}</strong>
          {job?.veoOperationName && (
            <>
              {' '}
              · Last Veo op: <strong>{job.veoOperationName}</strong>
            </>
          )}
        </p>
      )}

      {job?.error && (
        <div className="flow-error" role="alert">
          {job.error}
        </div>
      )}

      {/* Ultra UI removed */}

      {job?.enhancedPrompt && (
        <div className="field">
          <label>Cinematic prompt (sau tầng intelligence)</label>
          <pre className="log-box flow-json">{job.enhancedPrompt}</pre>
        </div>
      )}

      {job?.storyboard && (
        <div className="field">
          <label>Storyboard JSON</label>
          <pre className="log-box flow-json">{JSON.stringify(job.storyboard, null, 2)}</pre>
        </div>
      )}

      {job?.scenes?.length > 0 && (
        <div className="field">
          <label>Scenes (images + clip / scene)</label>
          <div className="flow-scenes">
            {job.scenes.map((sc) => (
              <div key={sc.sceneId} className="flow-scene-card">
                <div className="flow-scene-head">
                  <strong>{sc.sceneId}</strong>
                  {sc.videoClipUrl && (
                    <a href={sc.videoClipUrl} className="flow-scene-link" target="_blank" rel="noreferrer">
                      Tải clip
                    </a>
                  )}
                </div>
                <div className="flow-image-grid">
                  {sc.images?.map((im, idx) => (
                    <figure key={`${sc.sceneId}-${idx}`} className="flow-image-cell">
                      {im.url ? <img src={im.url} alt="" /> : <div className="char-thumb">No URL</div>}
                      <figcaption>{im.prompt?.slice(0, 100)}{im.prompt?.length > 100 ? '…' : ''}</figcaption>
                    </figure>
                  ))}
                </div>
                {sc.videoClipUrl && (
                  <video className="flow-scene-video" src={sc.videoClipUrl} controls playsInline muted />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!job?.scenes?.length && job?.generatedImages?.length > 0 && (
        <div className="field">
          <label>Generated images ({job.generatedImages.length})</label>
          <div className="flow-image-grid">
            {job.generatedImages.map((img, idx) => (
              <figure key={`${img.sceneId}-${idx}`} className="flow-image-cell">
                <img src={img.dataUrl} alt={img.prompt} />
                <figcaption>
                  {img.prompt.slice(0, 120)}
                  {img.prompt.length > 120 ? '…' : ''}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {job?.imageErrors?.length > 0 && (
        <div className="field">
          <label>Image generation errors</label>
          <pre className="log-box">{JSON.stringify(job.imageErrors, null, 2)}</pre>
        </div>
      )}

      {job?.videoUri?.startsWith('http') && (
        <div className="field">
          <label>Final video URI (Google — proxy download)</label>
          <pre className="log-box flow-json-uri">{job.videoUri}</pre>
        </div>
      )}

      {job?.finalVideo?.url && (
        <div className="field">
          <label>Final merged video</label>
          <pre className="log-box flow-json-uri">{job.finalVideo.url}</pre>
        </div>
      )}

      {playbackSrc && (
        <div className="video-preview">
          <video src={playbackSrc} controls playsInline />
        </div>
      )}

      {job?.logs?.length > 0 && (
        <div className="field">
          <label>Logs ({job.logs.length})</label>
          <pre className="log-box flow-logs">
            {job.logs.map((l, i) => `${new Date(l.ts).toISOString()} [${l.level}] ${l.message}${l.meta ? ` ${JSON.stringify(l.meta)}` : ''}`).join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
}
