import path from 'path';
import { runUltraVeoAutomation } from './ultraVeoAutomation.js';
import { logVideoUsage } from './videoUsageLog.js';

function resolveUltraHeadless() {
  return ['1', 'true', 'yes'].includes(String(process.env.ULTRA_HEADLESS || '').trim().toLowerCase());
}

/**
 * Thử lần lượt từng profile Gmail Ultra theo priority.
 * Cập nhật job store theo tiến trình để UI poll được.
 */
export async function runUltraOrchestration({ jobStore, jobId, userId, candidates, prompt, outDir }) {
  const job = jobStore.get(jobId);
  if (!job) return;

  const headless = resolveUltraHeadless();
  const attempts = Array.isArray(job.profileAttempts) ? [...job.profileAttempts] : [];

  jobStore.update(jobId, {
    status: 'running',
    profileAttempts: attempts,
    source: null,
    charged_credit: null,
    env_credit_used: false,
  });

  for (const profile of candidates) {
    const slug = String(profile.slug || '').trim();
    const gmailLabel = String(profile.ultraGmailLabel || profile.gmailLabel || '').trim();
    const displayName = String(profile.displayName || slug).trim();

    jobStore.update(jobId, {
      currentProfileSlug: slug,
      currentGmailLabel: gmailLabel,
      currentProfileDisplayName: displayName,
    });

    logVideoUsage({
      userId,
      jobId,
      event: 'ultra_attempt_start',
      profileSlug: slug,
      gmailLabel: gmailLabel || null,
      displayName,
    });

    try {
      const { filePath } = await runUltraVeoAutomation({
        userId,
        profileSlug: slug,
        prompt: String(prompt || '').trim(),
        outDir,
        headless,
      });

      const usage = logVideoUsage({
        userId,
        jobId,
        event: 'ultra_success',
        source: 'external_gmail_ultra',
        profileSlug: slug,
        gmailLabel: gmailLabel || null,
        displayName,
        charged_credit: 0,
        env_credit_used: false,
      });

      jobStore.update(jobId, {
        status: 'completed',
        filePath,
        profileSlug: slug,
        profileGmailLabel: gmailLabel,
        profileDisplayName: displayName,
        source: 'external_gmail_ultra',
        charged_credit: 0,
        env_credit_used: false,
        profileAttempts: [...attempts, { slug, gmailLabel, displayName, ok: true }],
        usageLog: usage,
        currentProfileSlug: slug,
        currentGmailLabel: gmailLabel,
        error: '',
        code: '',
      });
      return;
    } catch (e) {
      const entry = {
        slug,
        gmailLabel,
        displayName,
        ok: false,
        error: e?.message || 'Automation failed',
        code: e?.code || '',
      };
      attempts.push(entry);

      logVideoUsage({
        userId,
        jobId,
        event: 'ultra_attempt_failed',
        profileSlug: slug,
        gmailLabel: gmailLabel || null,
        displayName,
        error: entry.error,
        code: entry.code,
      });

      jobStore.update(jobId, { profileAttempts: [...attempts] });
    }
  }

  const fallbackMode = String(job.fallbackMode || 'ask').trim().toLowerCase();

  logVideoUsage({
    userId,
    jobId,
    event: 'ultra_exhausted',
    profileAttempts: attempts,
    fallbackMode,
    charged_credit: 0,
    env_credit_used: false,
  });

  jobStore.update(jobId, {
    status: 'ultra_exhausted',
    error: 'Tất cả profile Gmail Ultra đã thử đều thất bại.',
    code: 'ULTRA_EXHAUSTED',
    profileAttempts: attempts,
    source: null,
    charged_credit: 0,
    env_credit_used: false,
    currentProfileSlug: null,
    currentGmailLabel: '',
    currentProfileDisplayName: '',
  });
}

export function defaultUltraOutDir() {
  return path.join(process.cwd(), 'data', 'ultra-downloads');
}
