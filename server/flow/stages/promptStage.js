import { getFlowJob } from '../flowJobStore.js';
import { enhancePromptForCinema } from '../../services/promptEnhancer.js';
import { normalizeCheckpoint, patchCheckpoint } from '../../services/checkpoint.js';
import { ensureGenerationQuotaForJob } from '../../services/quotaService.js';
import * as metrics from '../../services/metrics.js';
import { appendLog, touch } from '../flowShared.js';

export async function runPromptStage(jobId, getApiKey) {
  const apiKey = getApiKey();
  let job = await getFlowJob(jobId);
  if (!job) return;

  await ensureGenerationQuotaForJob(jobId);
  job = await getFlowJob(jobId);

  const ck = normalizeCheckpoint(job);
  if (ck.promptDone && job.enhancedPrompt) {
    metrics.logStructured('flow_stage_skip', { stage: 'prompt', jobId });
    return;
  }

  await touch(jobId, { subStep: 'prompt_enhance', progressPercent: 2, status: 'generating' });
  await appendLog(jobId, { level: 'info', message: 'prompt_enhance:start' });

  const enhanced = await enhancePromptForCinema(apiKey, job.userPrompt);
  const cinematicBrief = enhanced.cinematicPrompt || job.userPrompt;

  await touch(jobId, {
    enhancedPrompt: cinematicBrief,
    promptEnhancementMeta: {
      styleKeywords: enhanced.styleKeywords,
      cameraMovement: enhanced.cameraMovement,
      lightingApproach: enhanced.lightingApproach,
      fallback: enhanced.fallback || false,
    },
    subStep: 'prompt_enhance',
    progressPercent: 8,
  });

  await patchCheckpoint(jobId, (c) => ({ ...c, promptDone: true }));

  await appendLog(jobId, {
    level: 'info',
    message: 'prompt_enhance:done',
    meta: { length: cinematicBrief.length },
  });
}
