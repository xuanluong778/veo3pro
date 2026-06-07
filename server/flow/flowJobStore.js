import {
  ensureJobWorkspace,
  createJobStorageFromEnv,
  getJobAbsoluteDir,
} from '../storage/jobStorage.js';

/** @typedef {'pending'|'generating'|'done'|'failed'} FlowStatus */

let storageSingleton = null;

export function getFlowJobStorage() {
  if (!storageSingleton) storageSingleton = createJobStorageFromEnv();
  return storageSingleton;
}

export function getJobDir(jobId) {
  return getJobAbsoluteDir(jobId);
}

export async function createFlowJob({ userPrompt, options }) {
  const id = crypto.randomUUID();
  await ensureJobWorkspace(id);

  const job = {
    id,
    status: /** @type {FlowStatus} */ ('pending'),
    step: /** @type {string} */ ('queued'),
    subStep: /** @type {string} */ ('queued'),
    progressPercent: 0,
    userPrompt,
    enhancedPrompt: null,
    promptEnhancementMeta: null,
    options,
    storyboard: null,
    scenes: [],
    generatedImages: [],
    imageErrors: [],
    logs: [],
    veoOperationName: null,
    videoUri: null,
    finalVideo: null,
    error: null,
    checkpoint: {
      promptDone: false,
      storyboardDone: false,
      imageKeysDone: [],
      videoSceneDone: [],
      mergeDone: false,
    },
    quotaSlotsHeld: false,
    startedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await getFlowJobStorage().save(job);
  return job;
}

export async function patchFlowJob(id, patchOrFn) {
  return getFlowJobStorage().patch(id, patchOrFn);
}

export async function getFlowJob(id) {
  return getFlowJobStorage().load(id);
}

export function serializeJobForClient(job) {
  if (!job) return null;
  const base = `/api/flow/jobs/${job.id}`;

  const scenes = (job.scenes || []).map((sc) => ({
    sceneId: sc.sceneId,
    description: sc.description,
    camera: sc.camera,
    lighting: sc.lighting,
    images: (sc.images || []).map((im) => ({
      prompt: im.prompt,
      mimeType: im.mimeType || 'image/png',
      modelUsed: im.modelUsed,
      url: im.relPath ? `${base}/assets/${im.relPath.replace(/\\/g, '/')}` : undefined,
    })),
    videoClipUri: sc.videoClipUri || null,
    videoClipUrl: sc.videoClipRelPath
      ? `${base}/assets/${sc.videoClipRelPath.replace(/\\/g, '/')}`
      : null,
    videoClip:
      (sc.videoClipRelPath && `${base}/assets/${sc.videoClipRelPath.replace(/\\/g, '/')}`) ||
      sc.videoClipUri ||
      null,
  }));

  const legacyFlat = [];
  for (const sc of scenes) {
    for (const im of sc.images) {
      if (im.url) {
        legacyFlat.push({
          sceneId: sc.sceneId,
          prompt: im.prompt,
          mimeType: im.mimeType,
          dataUrl: im.url,
        });
      }
    }
  }

  const finalUrl = job.finalVideo?.url || null;

  return {
    id: job.id,
    status: job.status,
    step: job.step,
    subStep: job.subStep,
    progressPercent: job.progressPercent ?? 0,
    userPrompt: job.userPrompt,
    enhancedPrompt: job.enhancedPrompt,
    promptEnhancementMeta: job.promptEnhancementMeta,
    options: job.options,
    storyboard: job.storyboard,
    scenes,
    generatedImages: legacyFlat,
    imageErrors: job.imageErrors,
    veoOperationName: job.veoOperationName,
    videoUri: finalUrl || job.videoUri,
    finalVideo: job.finalVideo,
    logs: job.logs || [],
    checkpoint: job.checkpoint || null,
    quotaSlotsHeld: job.quotaSlotsHeld ?? false,
    startedAt: job.startedAt ?? null,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
