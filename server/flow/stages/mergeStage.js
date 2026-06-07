import fs from 'fs/promises';
import path from 'path';
import { mergeVideoClipsWithFFmpeg, assertFfmpegAvailable } from '../../services/videoComposer.js';
import { normalizeCheckpoint, patchCheckpoint } from '../../services/checkpoint.js';
import * as metrics from '../../services/metrics.js';
import { appendLog, touch, safeFileSegment, releaseQuotaIfNeeded } from '../flowShared.js';
import { getFlowJob, patchFlowJob, getJobDir } from '../flowJobStore.js';

export async function runMergeStage(jobId, getApiKey) {
  void getApiKey;
  let job = await getFlowJob(jobId);
  if (!job?.storyboard?.scenes?.length) return;

  const ck = normalizeCheckpoint(job);
  const finalRel = path.join('final', 'output.mp4').replace(/\\/g, '/');
  const jobDir = getJobDir(jobId);
  const finalAbs = path.join(jobDir, finalRel);

  if (ck.mergeDone) {
    try {
      await fs.access(finalAbs);
      metrics.logStructured('flow_stage_skip', { stage: 'merge', jobId });
      return;
    } catch {
      /* rebuild */
    }
  }

  await touch(jobId, { subStep: 'merging', progressPercent: 90 });
  await appendLog(jobId, { level: 'info', message: 'merging:start' });

  const ffmpegOk = await assertFfmpegAvailable();
  if (!ffmpegOk) {
    throw new Error('ffmpeg not found in PATH — install FFmpeg to merge scene clips');
  }

  const clips = [];
  for (const sc of job.storyboard.scenes) {
    const rel = path.join('clips', `${safeFileSegment(sc.id)}.mp4`).replace(/\\/g, '/');
    clips.push(path.join(jobDir, rel));
  }

  for (const c of clips) {
    try {
      await fs.access(c);
    } catch {
      throw new Error(`Missing clip before merge: ${c}`);
    }
  }

  await fs.mkdir(path.dirname(finalAbs), { recursive: true });
  await mergeVideoClipsWithFFmpeg(clips, finalAbs);

  const finalVideo = {
    relativePath: finalRel,
    url: `/api/flow/jobs/${jobId}/download/final`,
  };

  await patchCheckpoint(jobId, (c) => ({ ...c, mergeDone: true }));

  await patchFlowJob(jobId, {
    finalVideo,
    videoUri: finalVideo.url,
    status: 'done',
    subStep: 'completed',
    step: 'completed',
    progressPercent: 100,
  });

  await appendLog(jobId, {
    level: 'info',
    message: 'merging:done',
    meta: { clips: clips.length },
  });

  job = await getFlowJob(jobId);
  if (job?.startedAt) {
    metrics.recordJobTerminal(jobId, 'done', Date.now() - job.startedAt);
  }

  await releaseQuotaIfNeeded(job);
}
