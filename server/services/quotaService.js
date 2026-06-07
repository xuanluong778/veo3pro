import { Redis } from 'ioredis';
import { getFlowJob, patchFlowJob } from '../flow/flowJobStore.js';

let redisSingleton = null;

export function getQuotaRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redisSingleton) {
    redisSingleton = new Redis(url, { maxRetriesPerRequest: 2 });
  }
  return redisSingleton;
}

export function isQueueModeEnabled() {
  return Boolean(process.env.REDIS_URL) && process.env.FLOW_USE_QUEUE !== 'false';
}

function dayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Atomic daily reservation at job acceptance time. */
export async function reserveDailyJobSlot(userKey) {
  const r = getQuotaRedis();
  if (!r) return;

  const dailyMax = Number(process.env.FLOW_DAILY_JOBS_PER_USER || 200);
  const dKey = `flow:quota:user:${userKey}:day:${dayKey()}`;
  const v = await r.incr(dKey);
  if (v === 1) await r.expire(dKey, 172800);
  if (v > dailyMax) {
    await r.decr(dKey);
    const err = new Error(`Daily job quota exceeded (${dailyMax}/day)`);
    err.code = 'FLOW_DAILY_CAP';
    throw err;
  }
}

export async function refundDailyJobSlot(userKey) {
  const r = getQuotaRedis();
  if (!r) return;
  const dKey = `flow:quota:user:${userKey}:day:${dayKey()}`;
  await r.decr(dKey).catch(() => {});
}

export async function acquireGenerationSlots(userKey) {
  const r = getQuotaRedis();
  if (!r) return;

  const globalMax = Number(process.env.FLOW_MAX_GLOBAL_ACTIVE || 64);
  const userMax = Number(process.env.FLOW_MAX_USER_CONCURRENT || 3);
  const gKey = 'flow:quota:global:active';
  const uKey = `flow:quota:user:${userKey}:active`;

  const gv = await r.incr(gKey);
  if (gv > globalMax) {
    await r.decr(gKey);
    const err = new Error('Global concurrency saturated — retry shortly');
    err.code = 'FLOW_GLOBAL_THROTTLE';
    throw err;
  }

  const uv = await r.incr(uKey);
  if (uv > userMax) {
    await r.decr(gKey);
    await r.decr(uKey);
    const err = new Error(`Per-user concurrent jobs limit (${userMax})`);
    err.code = 'FLOW_USER_CONCURRENT';
    throw err;
  }
}

export async function releaseGenerationSlots(userKey) {
  const r = getQuotaRedis();
  if (!r) return;
  await r.decr('flow:quota:global:active').catch(() => {});
  await r.decr(`flow:quota:user:${userKey}:active`).catch(() => {});
}

/** Idempotent: acquire Redis slots + mark job generating (resume-safe when skipping prompt stage). */
export async function ensureGenerationQuotaForJob(jobId) {
  const job = await getFlowJob(jobId);
  if (!job || job.quotaSlotsHeld) return;
  const userKey = job.options?.userKey || 'anonymous';
  await acquireGenerationSlots(userKey);
  await patchFlowJob(jobId, {
    quotaSlotsHeld: true,
    status: 'generating',
    startedAt: job.startedAt || Date.now(),
  });
}
