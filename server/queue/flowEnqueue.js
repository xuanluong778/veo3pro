import { getFlowQueues } from './flowQueues.js';

const order = ['prompt', 'storyboard', 'image', 'video', 'merge'];

export async function safeAddJob(queue, flowJobId, stageKey) {
  const jobId = `${flowJobId}:${stageKey}`;
  try {
    await queue.add(
      'run',
      { flowJobId },
      {
        jobId,
      },
    );
    return true;
  } catch (e) {
    const m = String(e?.message || e);
    if (/already exists|duplicate job/i.test(m)) return false;
    throw e;
  }
}

export async function enqueueFlowPipeline(flowJobId) {
  const q = getFlowQueues().prompt;
  await safeAddJob(q, flowJobId, 'prompt');
}

export async function enqueueStage(flowJobId, stageKey) {
  const queues = getFlowQueues();
  const q = queues[stageKey];
  if (!q) throw new Error(`Unknown stage ${stageKey}`);
  return safeAddJob(q, flowJobId, stageKey);
}

export function nextStageKey(current) {
  const i = order.indexOf(current);
  if (i < 0 || i >= order.length - 1) return null;
  return order[i + 1];
}

export { order as stageOrder };
