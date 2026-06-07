/**
 * Lightweight structured metrics + in-memory aggregates for ops/debugging.
 * For multi-instance scale, export logs to your collector or Redis counters later.
 */

const stageFailures = {};
const stageSuccess = {};
const stageDurations = [];

export function logStructured(event, payload = {}) {
  const row = {
    ts: new Date().toISOString(),
    event,
    ...payload,
  };
  console.log(JSON.stringify(row));
}

export function recordStageComplete(stage, ok, durationMs, meta = {}) {
  const bucket = ok ? stageSuccess : stageFailures;
  bucket[stage] = (bucket[stage] || 0) + 1;
  stageDurations.push({ stage, durationMs, ok, ...meta, ts: Date.now() });
  if (stageDurations.length > 5000) stageDurations.splice(0, stageDurations.length - 5000);
  logStructured('flow_stage_complete', { stage, ok, durationMs, ...meta });
}

export function recordJobTerminal(jobId, status, totalMs) {
  logStructured('flow_job_terminal', { jobId, status, totalMs });
}

export function getMetricsSnapshot() {
  const sumFail = Object.values(stageFailures).reduce((a, b) => a + b, 0);
  const sumOk = Object.values(stageSuccess).reduce((a, b) => a + b, 0);
  return {
    stageFailures,
    stageSuccess,
    failRateApprox: sumFail + sumOk ? sumFail / (sumFail + sumOk) : 0,
    recentStageSamples: stageDurations.slice(-50),
  };
}
