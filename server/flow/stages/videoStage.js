import fs from 'fs/promises';
import path from 'path';
import {
  buildVeoInstance,
  veoPredictLongRunning,
  pollVeoUntilVideoUri,
} from '../../services/veoService.js';
import { normalizeVideoClip } from '../../services/videoNormalize.js';
import { normalizeCheckpoint, patchCheckpoint, isVideoDone } from '../../services/checkpoint.js';
import * as metrics from '../../services/metrics.js';
import {
  composeSceneVeoPrompt,
  appendLog,
  touch,
  lerpProgress,
  downloadVeoToFile,
  safeFileSegment,
} from '../flowShared.js';
import { getFlowJob, patchFlowJob, getJobDir } from '../flowJobStore.js';

const VEO_ATTEMPTS = 3;
const PROMPT_TWEAK = [
  '',
  ' Emphasize coherent motion and temporal consistency.',
  ' Reduce abstraction; maintain photoreal continuity across frames.',
];

export async function runVideoStage(jobId, getApiKey) {
  const apiKey = getApiKey();
  let job = await getFlowJob(jobId);
  if (!job?.storyboard?.scenes?.length) return;

  const storyboard = job.storyboard;
  const ck = normalizeCheckpoint(job);
  const nScenes = storyboard.scenes.length;
  if ((ck.videoSceneDone || []).length >= nScenes) {
    metrics.logStructured('flow_stage_skip', { stage: 'video', jobId });
    return;
  }

  const jobDir = getJobDir(jobId);
  const cinematicBrief = job.enhancedPrompt || job.userPrompt;
  const model = job.options?.veoModel || 'veo-3.1-generate-preview';
  const proxyUrl = String(job.options?.proxyUrl || '').trim();
  const parameters = {};
  if (job.options?.aspectRatio) parameters.aspectRatio = job.options.aspectRatio;
  if (job.options?.resolution) parameters.resolution = job.options.resolution;

  await touch(jobId, { subStep: 'video_generation', progressPercent: 60 });
  await appendLog(jobId, { level: 'info', message: 'video_generation:start' });

  for (let si = 0; si < nScenes; si++) {
    const scMeta = storyboard.scenes[si];
    const ckMid = normalizeCheckpoint(await getFlowJob(jobId));
    const finalRel = path.join('clips', `${safeFileSegment(scMeta.id)}.mp4`).replace(/\\/g, '/');
    const finalAbs = path.join(jobDir, finalRel);

    if (isVideoDone(ckMid, scMeta.id)) {
      try {
        await fs.access(finalAbs);
        continue;
      } catch {
        /* regenerate */
      }
    }

    let lastErr;
    let uri;
    let opName;

    for (let attempt = 0; attempt < VEO_ATTEMPTS; attempt++) {
      try {
        job = await getFlowJob(jobId);
        const scState = job.scenes?.[si] || { images: [] };
        const imgs = (scState.images || []).slice(0, 3);
        const refs = [];
        for (const im of imgs) {
          const p = path.join(jobDir, im.relPath);
          const buf = await fs.readFile(p);
          refs.push({
            data: buf.toString('base64'),
            mimeType: im.mimeType || 'image/png',
            referenceType: 'asset',
          });
        }

        const mode = refs.length >= 1 ? 'ingredients' : 'text';
        const veoPrompt =
          composeSceneVeoPrompt(cinematicBrief, scMeta) + (PROMPT_TWEAK[attempt] || '');
        const instance = buildVeoInstance({
          prompt: veoPrompt,
          mode,
          referenceImages: mode === 'ingredients' ? refs : undefined,
        });

        opName = await veoPredictLongRunning(apiKey, model, instance, parameters, { proxyUrl });
        await touch(jobId, { veoOperationName: opName });

        const polled = await pollVeoUntilVideoUri(apiKey, opName, { proxyUrl });
        uri = polled.uri;
        break;
      } catch (e) {
        lastErr = e;
        await appendLog(jobId, {
          level: 'warn',
          message: `video_generation:retry scene=${scMeta.id}`,
          meta: { attempt, error: e.message },
        }).catch(() => {});
      }
    }

    if (!uri) throw lastErr || new Error(`Video generation failed for scene ${scMeta.id}`);

    const rawAbs = path.join(jobDir, 'clips', `${safeFileSegment(scMeta.id)}.raw.mp4`);
    await fs.mkdir(path.dirname(rawAbs), { recursive: true });
    await downloadVeoToFile(apiKey, uri, rawAbs, { proxyUrl });
    await normalizeVideoClip(rawAbs, finalAbs, { resolution: job.options?.resolution || '720p' });
    await fs.unlink(rawAbs).catch(() => {});

    await patchCheckpoint(jobId, (c) => ({
      ...c,
      videoSceneDone: [...new Set([...(c.videoSceneDone || []), scMeta.id])],
    }));

    await patchFlowJob(jobId, (j) => {
      const ns = [...(j.scenes || [])];
      ns[si] = {
        ...(ns[si] || {}),
        videoClipUri: uri,
        videoClipRelPath: finalRel,
      };
      return {
        scenes: ns,
        progressPercent: lerpProgress(60, 88, (si + 1) / nScenes),
        subStep: 'video_generation',
        step: 'video_poll',
      };
    });

    await appendLog(jobId, {
      level: 'info',
      message: 'video_generation:scene_done',
      meta: { sceneId: scMeta.id },
    });
  }

}
