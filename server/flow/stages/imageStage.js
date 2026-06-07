import fs from 'fs/promises';
import path from 'path';
import { asyncPool } from '../../lib/asyncPool.js';
import { generateImageWithRetryAndFallback } from '../../services/retryHandler.js';
import { validateImageWithGeminiVision } from '../../services/visionQC.js';
import {
  normalizeCheckpoint,
  patchCheckpoint,
  isImageDone,
  imageTaskKey,
  countExpectedImageTasks,
} from '../../services/checkpoint.js';
import * as metrics from '../../services/metrics.js';
import { appendLog, touch, lerpProgress, safeFileSegment } from '../flowShared.js';
import { getFlowJob, patchFlowJob, getJobDir } from '../flowJobStore.js';

function rebuildScenesFromCheckpoint(job, storyboard) {
  const ck = normalizeCheckpoint(job);
  return storyboard.scenes.map((sc, si) => {
    const imgs = [];
    let ii = 0;
    for (const ip of sc.imagePrompts || []) {
      const key = imageTaskKey(sc.id, ii);
      if (ck.imageKeysDone.includes(key)) {
        const relPath = path
          .join('images', `${safeFileSegment(sc.id)}_${ii}.png`)
          .replace(/\\/g, '/');
        imgs.push({
          prompt: ip,
          mimeType: 'image/png',
          relPath,
        });
      }
      ii += 1;
    }
    const prev = job.scenes?.[si] || {};
    return {
      sceneId: sc.id,
      description: sc.description,
      camera: sc.camera,
      lighting: sc.lighting,
      images: imgs,
      videoClipUri: prev.videoClipUri ?? null,
      videoClipRelPath: prev.videoClipRelPath ?? null,
    };
  });
}

export async function runImageStage(jobId, getApiKey) {
  const apiKey = getApiKey();
  let job = await getFlowJob(jobId);
  if (!job?.storyboard) return;

  const ck = normalizeCheckpoint(job);
  const expected = countExpectedImageTasks(job.storyboard);
  if (expected === 0) return;

  if (ck.imageKeysDone.length >= expected) {
    metrics.logStructured('flow_stage_skip', { stage: 'image', jobId });
    const merged = rebuildScenesFromCheckpoint(job, job.storyboard);
    await touch(jobId, { scenes: merged, subStep: 'image_generation', progressPercent: 58 });
    return;
  }

  const jobDir = getJobDir(jobId);
  const storyboard = job.storyboard;
  const cinematicBrief = job.enhancedPrompt || job.userPrompt;

  await touch(jobId, { subStep: 'image_generation', progressPercent: 24 });
  await appendLog(jobId, { level: 'info', message: 'image_generation:start' });

  const tasks = [];
  for (let si = 0; si < storyboard.scenes.length; si++) {
    const sc = storyboard.scenes[si];
    let ii = 0;
    for (const ip of sc.imagePrompts || []) {
      tasks.push({
        sceneIndex: si,
        sceneId: sc.id,
        sceneDescription: sc.description,
        prompt: ip,
        imgIdx: ii++,
      });
    }
  }

  const concurrency = job.options?.imageConcurrency ?? 3;
  const totalImg = tasks.length || 1;
  const imageErrors = [];

  await asyncPool(concurrency, tasks, async (t) => {
    const relPath = path
      .join('images', `${safeFileSegment(t.sceneId)}_${t.imgIdx}.png`)
      .replace(/\\/g, '/');
    const abs = path.join(jobDir, relPath);

    const jf = await getFlowJob(jobId);
    const ckf = normalizeCheckpoint(jf);
    try {
      await fs.access(abs);
      if (!isImageDone(ckf, t.sceneId, t.imgIdx)) {
        const key = imageTaskKey(t.sceneId, t.imgIdx);
        await patchCheckpoint(jobId, (c) => ({
          ...c,
          imageKeysDone: [...new Set([...(c.imageKeysDone || []), key])],
        }));
      }
      await patchFlowJob(jobId, (j) => {
        const c = (j._internalImgDone || 0) + 1;
        return {
          _internalImgDone: c,
          progressPercent: lerpProgress(24, 58, Math.min(c, totalImg) / totalImg),
          subStep: 'image_generation',
          step: 'images',
        };
      });
      return;
    } catch {
      /* generate */
    }

    try {
      const sceneIntent = `${cinematicBrief}\nScene: ${t.sceneDescription}`;
      const result = await generateImageWithRetryAndFallback(apiKey, {
        prompt: t.prompt,
        sceneContext: t.sceneDescription,
        log: (ev) =>
          appendLog(jobId, {
            level: ev.level || 'info',
            message: ev.message,
            meta: ev.meta,
          }).catch(() => {}),
        visionValidator: async (img) =>
          validateImageWithGeminiVision(apiKey, {
            mimeType: img.mimeType,
            dataBase64: img.data,
            intentPrompt: sceneIntent,
            sceneContext: t.sceneDescription,
          }),
      });

      await fs.writeFile(abs, Buffer.from(result.data, 'base64'));
      const key = imageTaskKey(t.sceneId, t.imgIdx);
      await patchCheckpoint(jobId, (c) => ({
        ...c,
        imageKeysDone: [...new Set([...(c.imageKeysDone || []), key])],
      }));

      await patchFlowJob(jobId, (j) => {
        const c = (j._internalImgDone || 0) + 1;
        return {
          _internalImgDone: c,
          progressPercent: lerpProgress(24, 58, Math.min(c, totalImg) / totalImg),
          subStep: 'image_generation',
          step: 'images',
        };
      });
    } catch (e) {
      imageErrors.push({
        sceneId: t.sceneId,
        prompt: t.prompt,
        error: e.message,
        attemptsLog: e.attemptsLog,
      });
      appendLog(jobId, {
        level: 'error',
        message: `image_generation:failed scene=${t.sceneId}`,
        meta: { error: e.message },
      }).catch(() => {});
    }
  });

  job = await getFlowJob(jobId);
  const mergedScenes = rebuildScenesFromCheckpoint(job, storyboard);

  await touch(jobId, {
    scenes: mergedScenes,
    imageErrors,
    subStep: 'image_generation',
    progressPercent: 58,
    _internalImgDone: undefined,
  });

  await appendLog(jobId, {
    level: 'info',
    message: 'image_generation:done',
    meta: { errors: imageErrors.length },
  });
}
