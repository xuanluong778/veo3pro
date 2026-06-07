import { Router } from 'express';
import {
  clearUserApiKeys,
  getDecryptedUserKeys,
  getUserApiKeyStatus,
  getUserApiKeysRawRow,
  setUserApiKeys,
  setUserApiKeyApiFlags,
} from '../services/userApiKeysService.js';

export function createUserKeysRouter() {
  const r = Router();

  // GET /api/user-keys/reveal — chỉ chủ tài khoản JWT mới nhận plaintext (để hiển thị trong Cài đặt).
  r.get('/reveal', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const keys = getDecryptedUserKeys(userId);
      const raw = getUserApiKeysRawRow(userId);
      const apiEnabled = raw
        ? {
            gemini: Number(raw.gemini_api_enabled) !== 0,
            grok: Number(raw.grok_api_enabled) !== 0,
            openAi: Number(raw.openai_api_enabled) !== 0,
          }
        : { gemini: true, grok: true, openAi: true };
      res.json({
        ok: true,
        keys: {
          geminiApiKey: keys.geminiApiKey || '',
          grokApiKey: keys.grokApiKey || '',
          grokBaseUrl: keys.grokBaseUrl || '',
          openAiApiKey: keys.openAiApiKey || '',
        },
        apiEnabled,
      });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Reveal failed' });
    }
  });

  // POST /api/user-keys/api-flags { geminiEnabled?, grokEnabled?, openAiEnabled? }
  r.post('/api-flags', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      setUserApiKeyApiFlags(userId, {
        geminiEnabled: typeof req.body?.geminiEnabled === 'boolean' ? req.body.geminiEnabled : undefined,
        grokEnabled: typeof req.body?.grokEnabled === 'boolean' ? req.body.grokEnabled : undefined,
        openAiEnabled: typeof req.body?.openAiEnabled === 'boolean' ? req.body.openAiEnabled : undefined,
      });
      const raw = getUserApiKeysRawRow(userId);
      const apiEnabled = raw
        ? {
            gemini: Number(raw.gemini_api_enabled) !== 0,
            grok: Number(raw.grok_api_enabled) !== 0,
            openAi: Number(raw.openai_api_enabled) !== 0,
          }
        : { gemini: true, grok: true, openAi: true };
      res.json({ ok: true, apiEnabled });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Flags update failed' });
    }
  });

  r.get('/status', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const status = getUserApiKeyStatus(userId);
      res.json({ ok: true, status });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Status failed' });
    }
  });

  r.post('/set', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const geminiApiKey = typeof req.body?.geminiApiKey === 'string' ? req.body.geminiApiKey.trim() : '';
      const grokApiKey = typeof req.body?.grokApiKey === 'string' ? req.body.grokApiKey.trim() : '';
      const grokBaseUrl = typeof req.body?.grokBaseUrl === 'string' ? req.body.grokBaseUrl.trim() : '';
      const openAiApiKey = typeof req.body?.openAiApiKey === 'string' ? req.body.openAiApiKey.trim() : '';
      const status = setUserApiKeys(userId, { geminiApiKey, grokApiKey, grokBaseUrl, openAiApiKey });
      // Never return plaintext keys.
      res.json({ ok: true, status });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Set failed' });
    }
  });

  r.post('/clear', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const status = clearUserApiKeys(userId);
      res.json({ ok: true, status });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Clear failed' });
    }
  });

  return r;
}

