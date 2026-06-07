/**
 * Inline full pipeline (when FLOW_USE_QUEUE=false or no Redis).
 * Queue mode uses BullMQ workers per stage — see server/queue/registerWorkers.js
 */
import { failFlowJob } from './flowShared.js';
import { runPromptStage } from './stages/promptStage.js';
import { runStoryboardStage } from './stages/storyboardStage.js';
import { runImageStage } from './stages/imageStage.js';
import { runVideoStage } from './stages/videoStage.js';
import { runMergeStage } from './stages/mergeStage.js';
import * as metrics from '../services/metrics.js';

export { composeSceneVeoPrompt } from './flowShared.js';

const INLINE_STAGES = [
  ['prompt', runPromptStage],
  ['storyboard', runStoryboardStage],
  ['image', runImageStage],
  ['video', runVideoStage],
  ['merge', runMergeStage],
];

export async function executeFlowJob(jobId, getApiKey) {
  try {
    for (const [name, fn] of INLINE_STAGES) {
      const t0 = Date.now();
      try {
        await fn(jobId, getApiKey);
        metrics.recordStageComplete(name, true, Date.now() - t0, { jobId });
      } catch (err) {
        metrics.recordStageComplete(name, false, Date.now() - t0, { jobId });
        throw err;
      }
    }
  } catch (e) {
    await failFlowJob(jobId, e);
  }
}

export function runFlowJobAsync(jobId, getApiKey) {
  setImmediate(() => {
    executeFlowJob(jobId, getApiKey).catch(() => {});
  });
}
