import { getFlowJob } from '../flowJobStore.js';
import { ensureGenerationQuotaForJob } from '../../services/quotaService.js';
import { generateStructuredStoryboard } from '../../services/storyboardService.js';
import { normalizeCheckpoint, patchCheckpoint } from '../../services/checkpoint.js';
import * as metrics from '../../services/metrics.js';
import { appendLog, touch } from '../flowShared.js';

export async function runStoryboardStage(jobId, getApiKey) {
  const apiKey = getApiKey();
  await ensureGenerationQuotaForJob(jobId);
  let job = await getFlowJob(jobId);
  if (!job) return;

  const ck = normalizeCheckpoint(job);
  if (ck.storyboardDone && job.storyboard) {
    metrics.logStructured('flow_stage_skip', { stage: 'storyboard', jobId });
    return;
  }

  const cinematicBrief = job.enhancedPrompt || job.userPrompt;

  await touch(jobId, { subStep: 'storyboard', progressPercent: 10 });
  await appendLog(jobId, { level: 'info', message: 'storyboard:start' });

  const storyboard = await generateStructuredStoryboard(apiKey, cinematicBrief);

  const scenesOut = storyboard.scenes.map((s) => ({
    sceneId: s.id,
    description: s.description,
    camera: s.camera,
    lighting: s.lighting,
    images: [],
    videoClipUri: null,
    videoClipRelPath: null,
  }));

  await touch(jobId, {
    storyboard,
    scenes: scenesOut,
    subStep: 'storyboard',
    progressPercent: 22,
  });

  await patchCheckpoint(jobId, (c) => ({ ...c, storyboardDone: true }));

  await appendLog(jobId, {
    level: 'info',
    message: 'storyboard:done',
    meta: { scenes: storyboard.scenes.length },
  });
}
