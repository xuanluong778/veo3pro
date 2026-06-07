/**
 * Dedicated BullMQ worker process: run with REDIS_URL set.
 * Usage: node server/worker.js
 */
import { loadEnv } from './bootstrap/loadEnv.js';

loadEnv();

function getApiKey() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY missing');
  return k;
}

const { isQueueModeEnabled } = await import('./services/quotaService.js');
if (!isQueueModeEnabled()) {
  console.error('worker.js requires REDIS_URL and FLOW_USE_QUEUE enabled');
  process.exit(1);
}

const { registerFlowWorkers } = await import('./queue/registerWorkers.js');
registerFlowWorkers({ getApiKey });
console.log('Flow workers listening (BullMQ)');
