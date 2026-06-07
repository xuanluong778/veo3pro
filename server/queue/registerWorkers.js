import { Worker } from 'bullmq';
import { duplicateConnection } from './bullConnection.js';
import { enqueueStage, nextStageKey } from './flowEnqueue.js';
import * as metrics from '../services/metrics.js';
import { failFlowJob } from '../flow/flowShared.js';
import { runPromptStage } from '../flow/stages/promptStage.js';
import { runStoryboardStage } from '../flow/stages/storyboardStage.js';
import { runImageStage } from '../flow/stages/imageStage.js';
import { runVideoStage } from '../flow/stages/videoStage.js';
import { runMergeStage } from '../flow/stages/mergeStage.js';

function conc(envKey, fallback) {
  return Math.max(1, parseInt(process.env[envKey] || String(fallback), 10));
}

function wrap(stageKey, runner, getApiKey) {
  return async (job) => {
    const flowJobId = job.data.flowJobId;
    const t0 = Date.now();
    try {
      await runner(flowJobId, getApiKey);
      metrics.recordStageComplete(stageKey, true, Date.now() - t0, { flowJobId });
      const next = nextStageKey(stageKey);
      if (next) await enqueueStage(flowJobId, next);
    } catch (e) {
      metrics.recordStageComplete(stageKey, false, Date.now() - t0, {
        flowJobId,
        error: e.message,
      });
      await failFlowJob(flowJobId, e);
    }
  };
}

export function registerFlowWorkers({ getApiKey }) {
  const runners = [
    { name: 'flow:prompt', stage: 'prompt', fn: runPromptStage, env: 'FLOW_CONCURRENCY_PROMPT', def: 16 },
    {
      name: 'flow:storyboard',
      stage: 'storyboard',
      fn: runStoryboardStage,
      env: 'FLOW_CONCURRENCY_STORYBOARD',
      def: 12,
    },
    { name: 'flow:image', stage: 'image', fn: runImageStage, env: 'FLOW_CONCURRENCY_IMAGE', def: 8 },
    { name: 'flow:video', stage: 'video', fn: runVideoStage, env: 'FLOW_CONCURRENCY_VIDEO', def: 4 },
    { name: 'flow:merge', stage: 'merge', fn: runMergeStage, env: 'FLOW_CONCURRENCY_MERGE', def: 4 },
  ];

  const workers = runners.map((r) =>
    new Worker(r.name, wrap(r.stage, r.fn, getApiKey), {
      connection: duplicateConnection(),
      concurrency: conc(r.env, r.def),
    }),
  );

  metrics.logStructured('flow_workers_registered', {
    queues: runners.map((x) => x.name),
  });

  return workers;
}
