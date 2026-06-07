import { Router } from 'express';
import { clearPromptStudioDraft, getPromptStudioDraft, setPromptStudioDraft } from '../services/promptStudioDraftService.js';

export function createPromptStudioDraftRouter() {
  const r = Router();

  r.get('/', (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
      const out = getPromptStudioDraft(uid);
      res.json({ ok: true, draft: out?.draft ?? null, updatedAt: out?.updatedAt ?? null });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Không thể đọc draft.' });
    }
  });

  r.post('/set', (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
      const draft = req.body?.draft;
      setPromptStudioDraft(uid, draft);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Không thể lưu draft.' });
    }
  });

  r.post('/clear', (req, res) => {
    try {
      const uid = req?.user?.id;
      if (!uid) return res.status(401).json({ error: 'Chưa đăng nhập.' });
      clearPromptStudioDraft(uid);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Không thể xóa draft.' });
    }
  });

  return r;
}

