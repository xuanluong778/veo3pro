import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import {
  createFlowJob,
  getFlowJob,
  serializeJobForClient,
  getJobDir,
} from '../flow/flowJobStore.js';
import { runFlowJobAsync } from '../flow/flowOrchestrator.js';
import {
  reserveDailyJobSlot,
  refundDailyJobSlot,
  isQueueModeEnabled,
} from '../services/quotaService.js';
import { getMetricsSnapshot } from '../services/metrics.js';
import { getEffectiveProxyUrlFromReq } from '../services/proxyService.js';

function safeBasename(name) {
  const b = path.basename(name);
  if (!b || b !== name || name.includes('..')) return null;
  return b;
}

export function createFlowRouter({ getApiKey }) {
  const router = Router();

  router.get('/metrics', (_req, res) => {
    if (process.env.FLOW_METRICS_PUBLIC !== 'true') {
      return res.status(404).end();
    }
    res.json(getMetricsSnapshot());
  });

  router.post('/generate', async (req, res) => {
    const userKey = req.flowUserKey || 'anonymous';

    try {
      const {
        prompt,
        veoModel,
        model,
        aspectRatio,
        resolution,
        imageConcurrency,
      } = req.body || {};

      if (!prompt || !String(prompt).trim()) {
        return res.status(400).json({ error: 'Missing prompt' });
      }

      try {
        getApiKey();
      } catch (e) {
        return res.status(503).json({ error: e.message });
      }

      try {
        await reserveDailyJobSlot(userKey);
      } catch (e) {
        const code = e.code || 'FLOW_QUOTA';
        const status = code === 'FLOW_DAILY_CAP' ? 429 : 503;
        return res.status(status).json({ error: e.message, code });
      }

      let job;
      try {
        job = await createFlowJob({
          userPrompt: String(prompt).trim(),
          options: {
            userKey,
            proxyUrl: getEffectiveProxyUrlFromReq(req),
            veoModel: veoModel || model || 'veo-3.1-generate-preview',
            aspectRatio: aspectRatio || '16:9',
            resolution: resolution || '1080p',
            imageConcurrency: Math.min(8, Math.max(1, Number(imageConcurrency) || 3)),
          },
        });

        if (isQueueModeEnabled()) {
          const { enqueueFlowPipeline } = await import('../queue/flowEnqueue.js');
          await enqueueFlowPipeline(job.id);
        } else {
          runFlowJobAsync(job.id, getApiKey);
        }
      } catch (e) {
        await refundDailyJobSlot(userKey);
        throw e;
      }

      res.status(202).json({
        jobId: job.id,
        pollUrl: `/api/flow/job/${job.id}`,
        queueMode: isQueueModeEnabled(),
        veoPollHint:
          'Poll GET /api/flow/job/:id for progressPercent & subStep. When generating video, GET /api/veo/status?operation=<veoOperationName> still works.',
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/job/:jobId', async (req, res) => {
    const job = await getFlowJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(serializeJobForClient(job));
  });

  router.get('/jobs/:jobId/assets/:category/:filename', async (req, res) => {
    const { jobId, category, filename } = req.params;
    const fn = safeBasename(filename);
    if (!fn || !['images', 'clips', 'final'].includes(category)) {
      return res.status(400).json({ error: 'Bad asset path' });
    }

    const job = await getFlowJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const base = path.resolve(getJobDir(jobId));
    const abs = path.resolve(base, category, fn);

    if (!abs.startsWith(base)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    if (!fs.existsSync(abs)) {
      return res.status(404).json({ error: 'Asset missing' });
    }

    if (category === 'clips' || category === 'final' || fn.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (fn.endsWith('.png')) res.type('image/png');
    else if (fn.endsWith('.webp')) res.type('image/webp');
    else if (fn.endsWith('.jpg') || fn.endsWith('.jpeg')) res.type('image/jpeg');

    res.sendFile(abs);
  });

  router.get('/jobs/:jobId/download/final', async (req, res) => {
    const job = await getFlowJob(req.params.jobId);
    if (!job?.finalVideo?.relativePath) {
      return res.status(404).json({ error: 'Final video not available' });
    }

    const base = path.resolve(getJobDir(job.id));
    const abs = path.resolve(base, job.finalVideo.relativePath);

    if (!abs.startsWith(base) || !fs.existsSync(abs)) {
      return res.status(404).json({ error: 'File missing' });
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'inline; filename="flow-final.mp4"');
    res.sendFile(abs);
  });

  return router;
}
