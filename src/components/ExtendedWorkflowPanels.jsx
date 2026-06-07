import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VBEE_VOICE_CATALOG, VOICE_FIELD_OPTIONS, VOICE_LANGUAGE_OPTIONS } from '../data/vbeeVoiceCatalog.js';
import { getAllCommunityVoices } from '../data/communityVoiceCatalog.js';
import { vbeeConfigStatus, vbeeListVoices, vbeePreviewCache, vbeeTextToSpeech, vbeeTextToSpeechCached } from '../vbeeClient.js';

const CHAR_STORAGE = 'veo3pro_characters_map_v1';

const defaultChars = () => [
  { id: '1', name: 'Tony', gender: 'Nam', note: '', file: null },
  { id: '2', name: 'Baby', gender: 'Nữ', note: '', file: null },
  { id: '3', name: '', gender: '', note: '', file: null },
];

export function CharactersMapPanel({ onGoIngredients }) {
  const [rows, setRows] = useState(defaultChars);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAR_STORAGE);
      if (!raw) return;
      const j = JSON.parse(raw);
      if (!Array.isArray(j) || !j.length) return;
      setRows((prev) =>
        prev.map((p, i) => ({
          ...p,
          name: i < j.length ? String(j[i]?.name ?? '') : p.name,
          gender: i < j.length ? String(j[i]?.gender ?? '') : p.gender,
          note: i < j.length ? String(j[i]?.note ?? '') : p.note,
          file: null,
        })),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((next) => {
    setRows(next);
    try {
      localStorage.setItem(
        CHAR_STORAGE,
        JSON.stringify(next.map(({ name, gender, note }) => ({ name, gender, note }))),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const scriptBlock = useMemo(() => {
    const parts = rows
      .filter((r) => r.name.trim())
      .map((r) => `- ${r.name.trim()} (${r.gender || 'chưa gán giới'}): ${r.note.trim() || '…'}`);
    if (!parts.length) return '';
    return `NHÂN VẬT (đồng bộ xuyên suốt):\n${parts.join('\n')}\n\nDùng ảnh tham chiếu Ingredients tương ứng từng nhân vật để giữ khuôn mặt.`;
  }, [rows]);

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Nhân vật → Ingredients → Video</h3>
      <p className="hint">
        Đặt tên, giới tính (map nhanh), ghi chú tính cách; ảnh mặt gán vào tối đa 3 slot Ingredients (Veo). Block dưới dùng dán vào Prompt / Prompt Studio.
      </p>
      <div className="classic-job-table" style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th>Tên</th>
              <th>Giới</th>
              <th>Ghi chú</th>
              <th>Ảnh mặt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id}>
                <td>
                  <input
                    className="input"
                    value={r.name}
                    onChange={(e) => {
                      const copy = [...rows];
                      copy[idx] = { ...copy[idx], name: e.target.value };
                      persist(copy);
                    }}
                    placeholder="VD: Tony"
                  />
                </td>
                <td style={{ maxWidth: 120 }}>
                  <select
                    className="input"
                    value={r.gender}
                    onChange={(e) => {
                      const copy = [...rows];
                      copy[idx] = { ...copy[idx], gender: e.target.value };
                      persist(copy);
                    }}
                  >
                    <option value="">—</option>
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                    <option value="Khác">Khác</option>
                  </select>
                </td>
                <td>
                  <input
                    className="input"
                    value={r.note}
                    onChange={(e) => {
                      const copy = [...rows];
                      copy[idx] = { ...copy[idx], note: e.target.value };
                      persist(copy);
                    }}
                    placeholder="Tính cách, vai trò…"
                  />
                </td>
                <td>
                  <input
                    type="file"
                    accept="image/*"
                    className="input"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      const copy = [...rows];
                      copy[idx] = { ...copy[idx], file: f };
                      setRows(copy);
                    }}
                  />
                  {r.file ? <span className="hint"> {r.file.name}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="field" style={{ marginTop: '1rem' }}>
        <label>Block gán kịch bản / Ingredients</label>
        <textarea className="input classic-prompt" style={{ minHeight: 120 }} readOnly value={scriptBlock || 'Nhập ít nhất một tên nhân vật.'} />
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (scriptBlock) void navigator.clipboard.writeText(scriptBlock);
          }}
          disabled={!scriptBlock}
        >
          Sao chép block
        </button>
        <button type="button" className="btn btn-primary" onClick={onGoIngredients}>
          Mở Ingredients → Video (ảnh tham chiếu)
        </button>
      </div>
    </div>
  );
}

const VBEE_SEL_CODE = 'veo3pro_vbee_voice_code';
const VBEE_SEL_NAME = 'veo3pro_vbee_voice_name';
const VEO3PRO_VOICE_CODE = 'veo3pro_voice_veo3pro_code';
const VEO3PRO_VOICE_NAME = 'veo3pro_voice_veo3pro_name';
const COMMUNITY_VOICE_CODE = 'veo3pro_voice_community_code';
const COMMUNITY_VOICE_NAME = 'veo3pro_voice_community_name';
const TTS_VOICE_TAB = 'veo3pro_tts_voice_tab';
const PREVIEW_TEXT_SAMPLE = 'Chào mừng bạn đến với tính năng chuyển đổi từ text sang audio của Veo3Pro.';

function buildVoiceCodeCandidates(rawCode) {
  const base = String(rawCode || '').trim();
  if (!base) return [];
  const out = new Set([base]);
  const variants = [
    base.replace(/-[a-z0-9]+$/i, ''),
    base.replace(/_48k(?:-[a-z0-9]+)?$/i, ''),
    base.replace(/_(full|vdts)_48k(?:-[a-z0-9]+)?$/i, '_$1'),
    base.replace(/_(full|vdts)_48k(?:-[a-z0-9]+)?$/i, ''),
    base.replace(/_vdts_/i, '_'),
  ];
  variants.forEach((v) => v && out.add(v));
  return Array.from(out);
}

function migrateLegacyVoiceKeys() {
  try {
    const legacyC = localStorage.getItem(VBEE_SEL_CODE);
    const legacyN = localStorage.getItem(VBEE_SEL_NAME);
    if (legacyC && !localStorage.getItem(VEO3PRO_VOICE_CODE)) {
      localStorage.setItem(VEO3PRO_VOICE_CODE, legacyC);
      localStorage.setItem(VEO3PRO_VOICE_NAME, legacyN || '');
    }
  } catch {
    /* ignore */
  }
}

function readPickPair(codeKey, nameKey) {
  try {
    migrateLegacyVoiceKeys();
    let code = localStorage.getItem(codeKey) || '';
    let name = localStorage.getItem(nameKey) || '';
    if (codeKey === VEO3PRO_VOICE_CODE && !code) {
      code = localStorage.getItem(VBEE_SEL_CODE) || '';
      name = localStorage.getItem(VBEE_SEL_NAME) || '';
    }
    return { code, name };
  } catch {
    return { code: '', name: '' };
  }
}

/** @param {'veo3pro'|'community'} category */
function persistVoicePick(category, v) {
  migrateLegacyVoiceKeys();
  try {
    if (category === 'community') {
      localStorage.setItem(COMMUNITY_VOICE_CODE, v.voiceCode);
      localStorage.setItem(COMMUNITY_VOICE_NAME, v.name);
    } else {
      localStorage.setItem(VBEE_SEL_CODE, v.voiceCode);
      localStorage.setItem(VBEE_SEL_NAME, v.name);
      localStorage.setItem(VEO3PRO_VOICE_CODE, v.voiceCode);
      localStorage.setItem(VEO3PRO_VOICE_NAME, v.name);
    }
    void navigator.clipboard?.writeText?.(v.voiceCode);
    window.dispatchEvent(new Event('veo3pro-voice-pick'));
    window.dispatchEvent(new Event('veo3pro-vbee-voice'));
  } catch {
    /* ignore */
  }
}

export function TextToAudioPanel({ onOpenVoiceLibrary, onCreateVideoFromText }) {
  const [text, setText] = useState('Xin chào, đây là thử nghiệm đọc văn bản miễn phí trên trình duyệt.');
  const [voiceTab, setVoiceTab] = useState(() => {
    try {
      const t = localStorage.getItem(TTS_VOICE_TAB);
      return t === 'community' ? 'community' : 'veo3pro';
    } catch {
      return 'veo3pro';
    }
  });
  const [pickVeo3, setPickVeo3] = useState(() => readPickPair(VEO3PRO_VOICE_CODE, VEO3PRO_VOICE_NAME));
  const [pickCommunity, setPickCommunity] = useState(() => readPickPair(COMMUNITY_VOICE_CODE, COMMUNITY_VOICE_NAME));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState('veo3pro');
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerField, setPickerField] = useState('all');
  const [pickerLanguage, setPickerLanguage] = useState('all');
  const [vbeeReady, setVbeeReady] = useState(false);
  const [vbeeLoading, setVbeeLoading] = useState(false);
  const [vbeeError, setVbeeError] = useState('');
  const [vbeeAudioUrl, setVbeeAudioUrl] = useState('');
  const [vbeeVoices, setVbeeVoices] = useState([]);
  const [vbeeVoicesLoading, setVbeeVoicesLoading] = useState(false);
  const [vbeeVoicesLoaded, setVbeeVoicesLoaded] = useState(false);
  const [previewLoadingId, setPreviewLoadingId] = useState('');
  const [previewPlayingId, setPreviewPlayingId] = useState('');
  const previewAudioRef = useRef(null);
  const generatedAudioRef = useRef(null);
  const [generatedPlaying, setGeneratedPlaying] = useState(false);
  const [generatedProgress, setGeneratedProgress] = useState(0);

  const refreshPicks = useCallback(() => {
    migrateLegacyVoiceKeys();
    try {
      let cV = localStorage.getItem(VEO3PRO_VOICE_CODE) || '';
      let nV = localStorage.getItem(VEO3PRO_VOICE_NAME) || '';
      if (!cV) {
        cV = localStorage.getItem(VBEE_SEL_CODE) || '';
        nV = localStorage.getItem(VBEE_SEL_NAME) || '';
      }
      setPickVeo3({ code: cV, name: nV });
      setPickCommunity({
        code: localStorage.getItem(COMMUNITY_VOICE_CODE) || '',
        name: localStorage.getItem(COMMUNITY_VOICE_NAME) || '',
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TTS_VOICE_TAB, voiceTab);
    } catch {
      /* ignore */
    }
  }, [voiceTab]);

  useEffect(() => {
    const keys = [
      VBEE_SEL_NAME,
      VBEE_SEL_CODE,
      VEO3PRO_VOICE_NAME,
      VEO3PRO_VOICE_CODE,
      COMMUNITY_VOICE_NAME,
      COMMUNITY_VOICE_CODE,
    ];
    const onStorage = (e) => {
      if (keys.includes(e.key)) refreshPicks();
    };
    const onPick = () => refreshPicks();
    window.addEventListener('storage', onStorage);
    window.addEventListener('veo3pro-vbee-voice', onPick);
    window.addEventListener('veo3pro-voice-pick', onPick);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('veo3pro-vbee-voice', onPick);
      window.removeEventListener('veo3pro-voice-pick', onPick);
    };
  }, [refreshPicks]);

  useEffect(() => {
    let active = true;
    vbeeConfigStatus()
      .then((cfg) => {
        if (!active) return;
        setVbeeReady(Boolean(cfg?.ok));
      })
      .catch(() => {
        if (!active) return;
        setVbeeReady(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!vbeeReady || vbeeVoicesLoaded || vbeeVoicesLoading) return;
    let active = true;
    setVbeeVoicesLoading(true);
    vbeeListVoices()
      .then((data) => {
        if (!active) return;
        const raw = Array.isArray(data?.voices) ? data.voices : [];
        const mapped = raw
          .map((v) => ({
            id: String(v?.id || v?.voice_code || Math.random()),
            voiceCode: String(v?.voice_code || v?.code || v?.caching_function || '').trim(),
            name: String(v?.name || v?.display_name || v?.voice_name || v?.voice_code || v?.code || 'Giọng Vbee'),
            description: [v?.gender, v?.age_group, v?.style].filter(Boolean).join(' · ') || 'Giọng từ Vbee API',
            region: String(v?.region || v?.locale || 'Vbee'),
            field: '',
            language: String(v?.language || v?.locale || ''),
            previewUrl: String(v?.demo || v?.sample?.audio_link || '').trim(),
          }))
          .map((v) => {
            const fallback = VBEE_VOICE_CATALOG.find((item) => item.voiceCode === v.voiceCode);
            return {
              ...v,
              field: fallback?.field || '',
              language: fallback?.language || v.language || '',
            };
          })
          .filter((v) => v.voiceCode);
        setVbeeVoices(mapped.length ? mapped : VBEE_VOICE_CATALOG);
        setVbeeVoicesLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setVbeeVoices(VBEE_VOICE_CATALOG);
        setVbeeVoicesLoaded(true);
      })
      .finally(() => {
        if (active) setVbeeVoicesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [vbeeReady, vbeeVoicesLoaded, vbeeVoicesLoading]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerOpen]);

  useEffect(() => {
    if (!vbeeVoicesLoaded) return;
    if (!vbeeVoices.length) return;
    const currentCode = String(pickVeo3.code || '').trim();
    const stillValid = currentCode && vbeeVoices.some((v) => v.voiceCode === currentCode);
    if (stillValid) return;
    const firstValid = vbeeVoices[0];
    if (!firstValid) return;
    // Auto-resync voice pick to a valid voice from current Vbee token.
    persistVoicePick('veo3pro', firstValid);
    refreshPicks();
  }, [vbeeVoicesLoaded, vbeeVoices, pickVeo3.code, refreshPicks]);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const openVoicePicker = useCallback((kind) => {
    setVoiceTab(kind);
    setPickerKind(kind);
    setPickerSearch('');
    setPickerField('all');
    setPickerLanguage('all');
    setPickerOpen(true);
  }, []);

  const pickerSourceList = useMemo(() => {
    if (pickerKind === 'community') return getAllCommunityVoices();
    return vbeeVoices.length ? vbeeVoices : VBEE_VOICE_CATALOG;
  }, [pickerKind, vbeeVoices]);

  const pickerFiltered = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return pickerSourceList.filter((v) => {
      if (pickerField !== 'all' && String(v?.field || '') !== pickerField) return false;
      if (pickerLanguage !== 'all' && String(v?.language || '') !== pickerLanguage) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        String(v.voiceCode || '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [pickerSourceList, pickerSearch, pickerField, pickerLanguage]);

  const currentPick = voiceTab === 'veo3pro' ? pickVeo3 : pickCommunity;
  const hasCurrentPick = Boolean(currentPick.code || currentPick.name);
  const resolveCurrentVbeeVoiceCode = useCallback(() => {
    if (voiceTab === 'community') {
      return String(currentPick.code || '').trim();
    }
    const byCode = vbeeVoices.find((v) => v.voiceCode === currentPick.code);
    if (byCode?.voiceCode) return byCode.voiceCode;
    const byName = vbeeVoices.find((v) => String(v.name || '').toLowerCase() === String(currentPick.name || '').toLowerCase());
    if (byName?.voiceCode) return byName.voiceCode;
    return String(currentPick.code || '').trim();
  }, [voiceTab, vbeeVoices, currentPick.code, currentPick.name, currentPick]);

  const convertTextToAudio = useCallback(async () => {
    setVbeeError('');
    setVbeeAudioUrl('');
    const selectedVoiceCode = resolveCurrentVbeeVoiceCode();
    if (!selectedVoiceCode) {
      setVbeeError('Bạn chưa chọn voice_code. Hãy chọn giọng trước khi convert.');
      return;
    }
    if (!text.trim()) {
      setVbeeError('Nhập văn bản cần chuyển đổi.');
      return;
    }
    setVbeeLoading(true);
    try {
      const tryVbeeTtsWithFallback = async (inputText, voiceCode) => {
        const candidates = buildVoiceCodeCandidates(voiceCode);
        let lastErr = null;
        for (const candidate of candidates) {
          try {
            // Use cached route for speed (instant on repeated requests).
            return await vbeeTextToSpeechCached({
              inputText,
              voiceCode: candidate,
              poll: true,
              // Faster responsiveness; Vbee processing time is the main factor.
              pollMaxMs: 120000,
              pollIntervalMs: 900,
            });
          } catch (e) {
            lastErr = e;
            const msg = String(e?.message || '').toLowerCase();
            const invalidVoice = msg.includes('invalid voice code') || msg.includes('voice code');
            if (!invalidVoice) throw e;
          }
        }
        throw lastErr || new Error('Không thể gọi Vbee với voice_code hiện tại.');
      };

      const data = await tryVbeeTtsWithFallback(text.trim(), selectedVoiceCode);
      const url = String(data?.localUrl || data?.audioUrl || data?.result?.audio_link || '').trim();
      if (!url) throw new Error('Vbee chưa trả về link audio.');
      setVbeeAudioUrl(url.startsWith('http') ? url : `${window.location.origin}${url}`);
      setGeneratedProgress(0);
      setGeneratedPlaying(false);
    } catch (e) {
      setVbeeError(e.message || 'Không thể convert text sang audio.');
    } finally {
      setVbeeLoading(false);
    }
  }, [resolveCurrentVbeeVoiceCode, text]);

  const previewVoice = useCallback(
    async (voice) => {
      if (!voice?.voiceCode) return;
      if (previewPlayingId === voice.id && previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
        setPreviewPlayingId('');
        return;
      }
      setVbeeError('');
      setPreviewLoadingId(voice.id);
      try {
        const data = await vbeePreviewCache({
          inputText: PREVIEW_TEXT_SAMPLE,
          voiceCode: voice.voiceCode,
        });
        const url = String(data?.localUrl || data?.audioUrl || data?.result?.audio_link || '').trim();
        if (!url) throw new Error('Không lấy được audio nghe thử.');
        if (previewAudioRef.current) {
          previewAudioRef.current.pause();
          previewAudioRef.current = null;
        }
        const audio = new Audio(url.startsWith('http') ? url : `${window.location.origin}${url}`);
        previewAudioRef.current = audio;
        setPreviewPlayingId(voice.id);
        audio.onended = () => {
          setPreviewPlayingId('');
          previewAudioRef.current = null;
        };
        await audio.play();
      } catch (e) {
        const baseMsg = String(e?.message || '').trim();
        const legacyUnavailable = baseMsg.includes('Giọng này không khả dụng cho API Vbee hiện tại');
        if (legacyUnavailable && voice?.voiceCode) {
          try {
            const data = await vbeeTextToSpeech({
              inputText: PREVIEW_TEXT_SAMPLE,
              voiceCode: voice.voiceCode,
              poll: true,
              pollMaxMs: 90000,
              pollIntervalMs: 1500,
            });
            const url = String(data?.audioUrl || data?.result?.audio_link || '').trim();
            if (url) {
              if (previewAudioRef.current) {
                previewAudioRef.current.pause();
                previewAudioRef.current = null;
              }
              const audio = new Audio(url);
              previewAudioRef.current = audio;
              setPreviewPlayingId(voice.id);
              audio.onended = () => {
                setPreviewPlayingId('');
                previewAudioRef.current = null;
              };
              await audio.play();
              return;
            }
          } catch {
            // keep default error flow below
          }
        }
        setPreviewPlayingId('');
        if (pickerKind === 'community') {
          setVbeeError(baseMsg || 'Giọng cộng đồng này chưa khả dụng trên Vbee API. Nếu có voice_code hợp lệ trên Vbee thì sẽ nghe thử được.');
        } else {
          setVbeeError(baseMsg || 'Không thể nghe thử giọng này.');
        }
      } finally {
        setPreviewLoadingId('');
      }
    },
    [pickerKind, previewPlayingId],
  );

  const toggleGeneratedAudio = useCallback(() => {
    const audio = generatedAudioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, []);

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Text → Âm thanh</h3>
      <p className="hint">Chuyển văn bản thành audio bằng giọng đọc Vbee theo giọng đã chọn.</p>

      {typeof onOpenVoiceLibrary === 'function' ? (
        <div className="text-audio-voice-toolbar">
          <div className="text-audio-voice-tabs" role="tablist" aria-label="Nguồn giọng đọc">
            <button
              type="button"
              role="tab"
              aria-selected={voiceTab === 'veo3pro'}
              className={`text-audio-voice-pill ${voiceTab === 'veo3pro' ? 'active' : ''}`}
              onClick={() => openVoicePicker('veo3pro')}
            >
              Giọng Veo3pro
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={voiceTab === 'community'}
              className={`text-audio-voice-pill ${voiceTab === 'community' ? 'active' : ''}`}
              onClick={() => openVoicePicker('community')}
            >
              Giọng cộng đồng
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary text-audio-library-btn" onClick={() => onOpenVoiceLibrary(voiceTab)}>
              Thư viện giọng
            </button>
            <button type="button" className="btn btn-secondary text-audio-library-btn" onClick={() => onOpenVoiceLibrary('clone')}>
              Tạo giọng đọc
            </button>
          </div>
        </div>
      ) : null}

      {typeof onOpenVoiceLibrary === 'function' && hasCurrentPick ? (
        <div className="text-audio-vbee-pick">
          <strong>{voiceTab === 'veo3pro' ? 'Giọng Veo3pro đã chọn' : 'Giọng cộng đồng đã chọn'}:</strong> {currentPick.name || '—'}{' '}
          {currentPick.code ? <code className="text-audio-vbee-code">{currentPick.code}</code> : null}
          <button type="button" className="btn btn-secondary text-audio-vbee-link" onClick={() => openVoicePicker(voiceTab)}>
            Đổi giọng
          </button>
        </div>
      ) : null}

      {typeof onOpenVoiceLibrary === 'function' && !hasCurrentPick ? (
        <p className="hint text-audio-voice-hint">
          Chưa chọn giọng cho tab <strong>{voiceTab === 'veo3pro' ? 'Veo3pro' : 'cộng đồng'}</strong> — bấm tab phía trên hoặc &quot;Thư viện giọng&quot; để chọn <code>voice_code</code>.
        </p>
      ) : null}
      {voiceTab === 'veo3pro' && !vbeeVoicesLoaded ? (
        <p className="hint text-audio-voice-hint">Đang đồng bộ danh sách giọng Vbee...</p>
      ) : null}
      {voiceTab === 'veo3pro' && vbeeVoicesLoaded && vbeeVoices.length === 0 ? (
        <p className="hint text-audio-voice-hint">
          Không tải được danh sách giọng từ Vbee API, đang dùng danh sách dự phòng.
        </p>
      ) : null}

      {pickerOpen ? (
        <div
          className="text-audio-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickerOpen(false);
          }}
        >
          <div
            className="text-audio-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tts-voice-picker-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-audio-modal-head">
              <h4 id="tts-voice-picker-title" className="text-audio-modal-title">
                {pickerKind === 'community' ? 'Chọn giọng cộng đồng' : 'Chọn giọng Veo3pro'}
              </h4>
              <button type="button" className="text-audio-modal-close" aria-label="Đóng" onClick={() => setPickerOpen(false)}>
                ×
              </button>
            </div>
            <input
              type="search"
              className="input text-audio-modal-search"
              placeholder="Tìm theo tên, mô tả, voice_code…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              autoFocus
            />
            <div className="text-audio-modal-filters">
              <select
                className="input text-audio-modal-field"
                value={pickerField}
                onChange={(e) => setPickerField(e.target.value)}
                aria-label="Lọc lĩnh vực"
              >
                <option value="all">Lĩnh vực</option>
                {VOICE_FIELD_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                className="input text-audio-modal-field"
                value={pickerLanguage}
                onChange={(e) => setPickerLanguage(e.target.value)}
                aria-label="Lọc ngôn ngữ"
              >
                <option value="all">Ngôn ngữ</option>
                {VOICE_LANGUAGE_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <ul className="text-audio-modal-list">
              {pickerFiltered.map((v) => (
                <li key={v.id}>
                  <div className="text-audio-modal-row">
                    <div className="text-audio-modal-row-main">
                      <span className="text-audio-modal-row-title">{v.name}</span>
                      <span className="text-audio-modal-row-desc">{v.description}</span>
                      <span className="text-audio-modal-row-meta">
                        {(v.field || 'Khác')} · {(v.language || 'Khác')} · {v.region} · <code>{v.voiceCode}</code>
                      </span>
                    </div>
                    <div className="text-audio-modal-row-actions">
                      <button
                        type="button"
                        className="btn btn-secondary text-audio-modal-mini-btn"
                        onClick={() => previewVoice(v)}
                        disabled={previewLoadingId === v.id}
                      >
                        {previewLoadingId === v.id ? 'Đang tải...' : previewPlayingId === v.id ? 'Dừng thử' : 'Nghe thử'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary text-audio-modal-mini-btn"
                        onClick={() => {
                          persistVoicePick(pickerKind, v);
                          refreshPicks();
                          setPickerOpen(false);
                        }}
                      >
                        Chọn
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {pickerKind === 'veo3pro' && vbeeVoicesLoaded && pickerSourceList.length === 0 ? (
              <p className="hint text-audio-modal-empty">Chưa lấy được danh sách giọng từ Vbee API. Vui lòng kiểm tra APP_ID/TOKEN.</p>
            ) : null}
            {pickerFiltered.length === 0 && !(pickerKind === 'veo3pro' && vbeeVoicesLoaded && pickerSourceList.length === 0) ? (
              <p className="hint text-audio-modal-empty">Không có giọng khớp từ khóa.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="field">
        <label>Văn bản</label>
        <textarea className="input classic-prompt" style={{ minHeight: 140 }} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={convertTextToAudio}
          disabled={vbeeLoading || !vbeeReady || !currentPick.code || !text.trim()}
          title={
            !vbeeReady
              ? 'Vbee chưa sẵn sàng hoặc chưa cấu hình APP_ID/TOKEN.'
              : ''
          }
        >
          {vbeeLoading ? 'Đang convert...' : 'Convert text -> Audio'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!text.trim()}
          onClick={() => {
            if (typeof onCreateVideoFromText === 'function') onCreateVideoFromText(text);
          }}
          title="Dùng văn bản hiện tại để tạo video"
        >
          Tạo video
        </button>
        {vbeeAudioUrl ? (
          <a href={vbeeAudioUrl} target="_blank" rel="noreferrer" className="btn btn-secondary" download>
            Tải Audio
          </a>
        ) : null}
      </div>
      {vbeeAudioUrl ? (
        <div className="field" style={{ marginTop: '0.75rem' }}>
          <label>Audio đã tạo</label>
          <audio
            ref={generatedAudioRef}
            src={vbeeAudioUrl}
            preload="metadata"
            onPlay={() => setGeneratedPlaying(true)}
            onPause={() => setGeneratedPlaying(false)}
            onTimeUpdate={(e) => {
              const a = e.currentTarget;
              const progress = a.duration ? (a.currentTime / a.duration) * 100 : 0;
              setGeneratedProgress(Number.isFinite(progress) ? progress : 0);
            }}
            onEnded={() => {
              setGeneratedPlaying(false);
              setGeneratedProgress(100);
            }}
            style={{ display: 'none' }}
          />
          <div className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
            <button type="button" className="btn btn-secondary" onClick={toggleGeneratedAudio}>
              {generatedPlaying ? 'Tạm dừng' : 'Play nghe thử'}
            </button>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ height: 8, borderRadius: 999, background: 'rgba(148,163,184,0.25)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${generatedProgress}%`, background: '#3b82f6' }} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {vbeeError ? <p className="hint" style={{ color: '#fca5a5', marginTop: '0.65rem' }}>{vbeeError}</p> : null}
      {!vbeeReady ? (
        <p className="hint" style={{ marginTop: '0.65rem' }}>
          Vbee chưa sẵn sàng. Kiểm tra đăng nhập và biến <code>VBEE_APP_ID</code> / <code>VBEE_TOKEN</code> trên server.
        </p>
      ) : null}
      {vbeeReady && voiceTab === 'veo3pro' && vbeeVoicesLoaded && vbeeVoices.length > 0 ? (
        <p className="hint" style={{ marginTop: '0.45rem' }}>
          Đã đồng bộ {vbeeVoices.length} giọng hợp lệ trực tiếp từ API Vbee.
        </p>
      ) : null}
      <p className="hint" style={{ marginTop: '1rem' }}>
        Xuất file WAV/MP3 tự động cần thêm bước ghi âm (MediaRecorder) hoặc API TTS trả phí — roadmap.
      </p>
    </div>
  );
}

export function VideoSplitMergePanel() {
  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Cắt &amp; ghép video</h3>
      <ul className="info-list">
        <li>
          <strong>Cắt một video thành nhiều clip ngắn</strong>: cần FFmpeg phía server + UI chọn mốc thời gian — chưa bật trong bản này.
        </li>
        <li>
          <strong>Ghép nhiều clip thành một</strong>: tương tự FFmpeg concat — roadmap.
        </li>
        <li>Tạm thời: dùng DaVinci / CapCut / ffmpeg CLI ngoài app, rồi đưa clip vào Text/Image → Video nếu cần.</li>
      </ul>
    </div>
  );
}
