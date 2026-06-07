import { getFlowJobStorage } from './flowJobStore.js';
import {
  isQueueModeEnabled,
} from '../services/quotaService.js';
import {
  normalizeCheckpoint,
  countExpectedImageTasks,
} from '../services/checkpoint.js';
import * as metrics from '../services/metrics.js';

function inferResumeStage(job) {
  const ck = normalizeCheckpoint(job);
  if (!ck.promptDone || !job.enhancedPrompt) return 'prompt';
  if (!ck.storyboardDone || !job.storyboard) return 'storyboard';
  const expected = countExpectedImageTasks(job.storyboard);
  if (expected > 0 && (ck.imageKeysDone || []).length < expected) return 'image';
  const n = job.storyboard?.scenes?.length || 0;
  if (n > 0 && (ck.videoSceneDone || []).length < n) return 'video';
  if (!ck.mergeDone) return 'merge';
  return null;
}

async function markStaleInlineGeneratingFailed() {
  const storage = getFlowJobStorage();
  const ids = await storage.listIds();
  for (const id of ids) {
    const job = await storage.load(id);
    if (!job || job.status !== 'generating') continue;
    await storage.patch(id, {
      status: 'failed',
      subStep: job.subStep || 'unknown',
      error:
        'Server restarted during execution (inline mode — enable Redis queue for resume)',
      progressPercent: job.progressPercent ?? 0,
    });
  }
}

async function resumeQueuedBullJobs() {
  const { enqueueStage } = await import('../queue/flowEnqueue.js');
  const storage = getFlowJobStorage();
  const ids = await storage.listIds();

  for (const id of ids) {
    const job = await storage.load(id);
    if (!job) continue;
    if (!['pending', 'generating'].includes(job.status)) continue;

    const stage = inferResumeStage(job);
    if (stage) {
      await enqueueStage(id, stage).catch(() => {});
      metrics.logStructured('flow_resume_enqueued', { jobId: id, stage });
    }
  }
}

/**
 * Queue mode: resume unfinished flows from checkpoint (BullMQ idempotent jobIds).
 * Inline mode: fail stale generating jobs (no safe resume without queue coordination).
 */
export async function recoverInterruptedJobsOnStartup() {
  try {
    if (isQueueModeEnabled()) {
      await resumeQueuedBullJobs();
      return;
    }
    await markStaleInlineGeneratingFailed();
  } catch (e) {
    console.warn('jobRecovery:', e.message);
  }
}
