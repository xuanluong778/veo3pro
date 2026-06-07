import { patchFlowJob } from '../flow/flowJobStore.js';

export function initCheckpoint() {
  return {
    promptDone: false,
    storyboardDone: false,
    imageKeysDone: [],
    videoSceneDone: [],
    mergeDone: false,
  };
}

export function imageTaskKey(sceneId, imgIdx) {
  return `${sceneId}:${imgIdx}`;
}

export function normalizeCheckpoint(job) {
  const ck = job.checkpoint || initCheckpoint();
  return {
    ...initCheckpoint(),
    ...ck,
    imageKeysDone: [...(ck.imageKeysDone || [])],
    videoSceneDone: [...(ck.videoSceneDone || [])],
  };
}

export function isImageDone(checkpoint, sceneId, imgIdx) {
  const k = imageTaskKey(sceneId, imgIdx);
  return (checkpoint.imageKeysDone || []).includes(k);
}

export function isVideoDone(checkpoint, sceneId) {
  return (checkpoint.videoSceneDone || []).includes(sceneId);
}

export function countExpectedImageTasks(storyboard) {
  if (!storyboard?.scenes) return 0;
  return storyboard.scenes.reduce((acc, s) => acc + (s.imagePrompts?.length || 0), 0);
}

export async function patchCheckpoint(jobId, mutator) {
  await patchFlowJob(jobId, (j) => {
    const ck = normalizeCheckpoint(j);
    return { checkpoint: mutator(ck) };
  });
}
