import fs from 'fs/promises';
import { getFlowJob, patchFlowJob } from './flowJobStore.js';
import { releaseGenerationSlots } from '../services/quotaService.js';
import * as metrics from '../services/metrics.js';
import { getProxyDispatcher } from '../services/proxyService.js';

export function composeSceneVeoPrompt(cinematicBrief, scene) {
  return [
    `Cinematic motion clip for a single story beat.`,
    `Overall vision: ${cinematicBrief}`,
    '',
    `Beat (${scene.id}): ${scene.description}`,
    `Camera intent: ${scene.camera}`,
    `Lighting: ${scene.lighting}`,
    '',
    'Maintain continuity with reference frames (wardrobe, faces, location).',
    'Include subtle ambient audio consistent with the mood.',
  ].join('\n');
}

export function legacyStepFromSubStep(subStep) {
  const map = {
    queued: 'queued',
    prompt_enhance: 'queued',
    storyboard: 'storyboard',
    image_generation: 'images',
    video_generation: 'video_poll',
    merging: 'video_poll',
    completed: 'completed',
  };
  return map[subStep] || 'queued';
}

export function lerpProgress(a, b, t) {
  return Math.round(a + (b - a) * Math.min(1, Math.max(0, t)));
}

export function safeFileSegment(id) {
  return String(id).replace(/[^\w\-]+/g, '_').slice(0, 96);
}

export async function appendLog(jobId, entry) {
  await patchFlowJob(jobId, (j) => ({
    logs: [...(j.logs || []), { ts: Date.now(), ...entry }],
  }));
}

export async function touch(jobId, partial) {
  const legacyStep =
    partial.step ??
    (partial.subStep ? legacyStepFromSubStep(partial.subStep) : undefined);
  await patchFlowJob(jobId, {
    ...partial,
    ...(legacyStep ? { step: legacyStep } : {}),
    updatedAt: Date.now(),
  });
}

/**
 * @param {{ proxyUrl?: string }} [opts]
 */
export async function downloadVeoToFile(apiKey, uri, destPath, opts = {}) {
  const dispatcher = getProxyDispatcher(opts.proxyUrl || '');
  const r = await fetch(uri, {
    headers: { 'x-goog-api-key': apiKey },
    redirect: 'follow',
    ...(dispatcher ? { dispatcher } : {}),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Video download failed ${r.status}: ${t.slice(0, 400)}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(destPath, buf);
}

export async function releaseQuotaIfNeeded(job) {
  if (!job?.quotaSlotsHeld || !job.options?.userKey) return;
  await releaseGenerationSlots(job.options.userKey);
  await patchFlowJob(job.id, { quotaSlotsHeld: false });
}

export async function failFlowJob(jobId, err) {
  const job = await getFlowJob(jobId);
  const msg = err?.message || String(err);
  await appendLog(jobId, { level: 'fatal', message: msg });
  await patchFlowJob(jobId, {
    status: 'failed',
    error: msg,
    subStep: job?.subStep || 'unknown',
  });
  if (job?.startedAt) {
    metrics.recordJobTerminal(jobId, 'failed', Date.now() - job.startedAt);
  }
  await releaseQuotaIfNeeded(job);
}
