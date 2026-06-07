import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VBEE_VOICE_CATALOG, VOICE_FIELD_OPTIONS, VOICE_LANGUAGE_OPTIONS } from '../data/vbeeVoiceCatalog.js';
import {
  COMMUNITY_FEATURED,
  COMMUNITY_NEWEST,
  COMMUNITY_TRENDING,
  getAllCommunityVoices,
} from '../data/communityVoiceCatalog.js';
import { VoiceCloneTab } from './VoiceCloneTab.jsx';
import { vbeePreviewCache } from '../vbeeClient.js';

const SELECTED_VOICE = 'veo3pro_vbee_voice_code';
const SELECTED_NAME = 'veo3pro_vbee_voice_name';
const VEO3PRO_VOICE_CODE = 'veo3pro_voice_veo3pro_code';
const VEO3PRO_VOICE_NAME = 'veo3pro_voice_veo3pro_name';
const COMMUNITY_VOICE_CODE = 'veo3pro_voice_community_code';
const COMMUNITY_VOICE_NAME = 'veo3pro_voice_community_name';
const ACTIVE_VOICE_SOURCE = 'veo3pro_voice_active_source';
const LIB_PREVIEW_TEXT = 'Chào mừng bạn đến với tính năng chuyển đổi từ text sang audio của Veo3Pro.';

function initials(name) {
  const p = String(name || '')
    .split(/[\s—\-–]+/)
    .filter(Boolean);
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase().slice(0, 2);
  return String(name || '?')
    .slice(0, 2)
    .toUpperCase();
}

function filterVoiceList(list, q, field, language, region) {
  const qt = q.trim().toLowerCase();
  return list.filter((v) => {
    if (
      qt &&
      !(
        v.name.toLowerCase().includes(qt) ||
        v.description.toLowerCase().includes(qt) ||
        v.voiceCode.toLowerCase().includes(qt)
      )
    ) {
      return false;
    }
    if (field !== 'all' && v.field !== field) return false;
    if (language !== 'all' && v.language !== language) return false;
    if (region !== 'all' && v.region !== region) return false;
    return true;
  });
}

export function VoiceLibraryPanel({ embedded = false, initialTab = 'vbee', onClose } = {}) {
  const [tab, setTab] = useState(initialTab === 'community' || initialTab === 'clone' ? initialTab : 'vbee');
  const previewAudioRef = useRef(null);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem('veo3pro_voice_library_tab');
      if (t === 'community' || t === 'vbee' || t === 'clone') {
        setTab(t);
        sessionStorage.removeItem('veo3pro_voice_library_tab');
      }
    } catch {
      /* ignore */
    }
  }, []);
  const [search, setSearch] = useState('');
  const [field, setField] = useState('all');
  const [language, setLanguage] = useState('all');
  const [region, setRegion] = useState('all');
  const [sortDir, setSortDir] = useState('asc');
  const [toast, setToast] = useState('');

  const catalogForFilters = useMemo(() => {
    if (tab === 'community') return getAllCommunityVoices();
    return VBEE_VOICE_CATALOG;
  }, [tab]);

  const fields = useMemo(() => {
    const u = new Set([...VOICE_FIELD_OPTIONS, ...catalogForFilters.map((v) => v.field).filter(Boolean)]);
    return ['all', ...[...u].sort()];
  }, [catalogForFilters]);

  const languages = useMemo(() => {
    const u = new Set([...VOICE_LANGUAGE_OPTIONS, ...catalogForFilters.map((v) => v.language).filter(Boolean)]);
    return ['all', ...[...u].sort()];
  }, [catalogForFilters]);

  const regions = useMemo(() => {
    const u = new Set(catalogForFilters.map((v) => v.region));
    return ['all', ...[...u].sort()];
  }, [catalogForFilters]);

  const filtered = useMemo(() => {
    const list = [...VBEE_VOICE_CATALOG];
    return filterVoiceList(list, search, field, language, region).sort((a, b) => {
      const c = a.name.localeCompare(b.name, 'vi');
      return sortDir === 'asc' ? c : -c;
    });
  }, [search, field, language, region, sortDir]);

  const communityTrending = useMemo(
    () => filterVoiceList(COMMUNITY_TRENDING, search, field, language, region),
    [search, field, language, region],
  );

  const communityFeatured = useMemo(
    () => filterVoiceList(COMMUNITY_FEATURED, search, field, language, region),
    [search, field, language, region],
  );

  const communityNewest = useMemo(
    () => filterVoiceList(COMMUNITY_NEWEST, search, field, language, region),
    [search, field, language, region],
  );

  const useVoice = useCallback(
    (v) => {
      try {
        if (tab === 'community') {
          localStorage.setItem(COMMUNITY_VOICE_CODE, v.voiceCode);
          localStorage.setItem(COMMUNITY_VOICE_NAME, v.name);
          localStorage.setItem(ACTIVE_VOICE_SOURCE, 'community');
        } else if (tab === 'vbee') {
          localStorage.setItem(SELECTED_VOICE, v.voiceCode);
          localStorage.setItem(SELECTED_NAME, v.name);
          localStorage.setItem(VEO3PRO_VOICE_CODE, v.voiceCode);
          localStorage.setItem(VEO3PRO_VOICE_NAME, v.name);
          localStorage.setItem(ACTIVE_VOICE_SOURCE, 'vbee');
        }
      } catch {
        /* ignore */
      }
      void navigator.clipboard?.writeText?.(v.voiceCode);
      try {
        window.dispatchEvent(new Event('veo3pro-voice-pick'));
        window.dispatchEvent(new Event('veo3pro-vbee-voice'));
      } catch {
        /* ignore */
      }
      setToast(`Đã chọn "${v.name}" — voice_code đã sao chép. Dùng khi gọi API Vbee hoặc tab Text → Âm thanh.`);
      window.setTimeout(() => setToast(''), 4500);
      if (embedded && typeof onClose === 'function') {
        try {
          onClose();
        } catch {
          /* ignore */
        }
      }
    },
    [tab, embedded, onClose],
  );

  const cycleSort = () => setSortDir((s) => (s === 'asc' ? 'desc' : 'asc'));

  const playLibraryPreview = useCallback(async (v) => {
    if (!v?.voiceCode) return;
    try {
      const data = await vbeePreviewCache({
        inputText: LIB_PREVIEW_TEXT,
        voiceCode: v.voiceCode,
      });
      const url = String(data?.localUrl || '').trim();
      if (!url) throw new Error('Không có audio preview.');
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      const audio = new Audio(url.startsWith('http') ? url : `${window.location.origin}${url}`);
      previewAudioRef.current = audio;
      await audio.play();
    } catch {
      setToast('Không thể nghe thử giọng này lúc này.');
      window.setTimeout(() => setToast(''), 3000);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const resetFilters = useCallback(() => {
    setSearch('');
    setField('all');
    setLanguage('all');
    setRegion('all');
  }, []);

  const renderVoiceActions = (v) => (
    <div className="voice-library-actions voice-community-actions">
      <button
        type="button"
        className="btn btn-secondary voice-library-use"
        onClick={(e) => {
          e.stopPropagation();
          useVoice(v);
        }}
      >
        Sử dụng
      </button>
      <details className="voice-library-more" onClick={(e) => e.stopPropagation()}>
        <summary className="voice-library-more-trigger" aria-label="Thêm">
          ⋮
        </summary>
        <div className="voice-library-more-menu">
          <button
            type="button"
            className="voice-library-more-item"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard?.writeText?.(v.voiceCode);
            }}
          >
            Sao chép voice_code
          </button>
          <button
            type="button"
            className="voice-library-more-item"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard?.writeText?.(v.description);
            }}
          >
            Sao chép mô tả
          </button>
        </div>
      </details>
    </div>
  );

  return (
    <div className={embedded ? 'voice-library-panel' : 'panel voice-library-panel'}>
      {tab !== 'clone' ? (
        <div className="voice-library-header">
          <h3 className="voice-library-title">Thư viện giọng</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {embedded ? (
              <button type="button" className="btn btn-secondary" onClick={() => (typeof onClose === 'function' ? onClose() : null)}>
                Đóng
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary voice-library-create-btn" onClick={() => setTab('clone')}>
              + Tạo giọng đọc
            </button>
          </div>
        </div>
      ) : null}

      <div className="voice-library-main-tabs">
        <button type="button" className={`voice-library-pill ${tab === 'vbee' ? 'active' : ''}`} onClick={() => setTab('vbee')}>
          Giọng Veo3pro
        </button>
        <button
          type="button"
          className={`voice-library-pill ${tab === 'community' ? 'active' : ''}`}
          onClick={() => setTab('community')}
        >
          Giọng cộng đồng
        </button>
        <button type="button" className={`voice-library-pill ${tab === 'clone' ? 'active' : ''}`} onClick={() => setTab('clone')}>
          Nhân bản giọng
        </button>
      </div>

      {toast ? (
        <div className="voice-library-toast" role="status">
          {toast}
        </div>
      ) : null}

      {tab === 'clone' ? (
        <VoiceCloneTab />
      ) : tab === 'community' ? (
        <>
          <div className="voice-library-toolbar">
            <div className="voice-library-search-wrap">
              <span className="voice-library-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                type="search"
                className="input voice-library-search"
                placeholder="Tìm kiếm bằng từ khóa liên quan"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Tìm kiếm giọng"
              />
            </div>
            <div className="voice-library-filters">
              <select className="input voice-library-select" value={field} onChange={(e) => setField(e.target.value)} aria-label="Lĩnh vực">
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {f === 'all' ? 'Lĩnh vực' : f}
                  </option>
                ))}
              </select>
              <select className="input voice-library-select" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Ngôn ngữ">
                {languages.map((f) => (
                  <option key={f} value={f}>
                    {f === 'all' ? 'Ngôn ngữ' : f}
                  </option>
                ))}
              </select>
              <select className="input voice-library-select" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Vùng miền">
                {regions.map((f) => (
                  <option key={f} value={f}>
                    {f === 'all' ? 'Vùng miền' : f}
                  </option>
                ))}
              </select>
              <div className="voice-library-tool-icons">
                <button type="button" className="voice-library-icon-btn" title="Xóa bộ lọc & từ khóa" onClick={resetFilters}>
                  ↺
                </button>
                <button type="button" className="voice-library-icon-btn" title="Bố cục danh sách" aria-hidden="true">
                  ☰
                </button>
              </div>
            </div>
          </div>

          <section className="voice-community-section" aria-labelledby="community-trending-title">
            <h4 id="community-trending-title" className="voice-community-section-title">
              Thịnh hành
            </h4>
            <ul className="voice-community-trending-list">
              {communityTrending.map((v) => (
                <li key={`trend-${v.id}`} className="voice-community-trending-row" onClick={() => playLibraryPreview(v)}>
                  <div className="voice-library-avatar" aria-hidden="true">
                    {initials(v.name)}
                  </div>
                  <div className="voice-library-meta">
                    <div className="voice-library-name-row">
                      <span className="voice-library-name">{v.name}</span>
                      {v.badge ? (
                        <span className={`voice-library-badge ${v.badge === 'Nổi bật' ? 'voice-community-badge--hot' : ''}`}>{v.badge}</span>
                      ) : null}
                    </div>
                    <div className="voice-library-desc">{v.description}</div>
                  </div>
                  <div className="voice-library-locale voice-community-locale">
                    <span className="voice-library-flag" title="Tiếng Việt">
                      🇻🇳
                    </span>
                    <span>
                      {v.language} — {v.region}
                    </span>
                  </div>
                  <div className="voice-community-stats" aria-label="Thống kê">
                    <span className="voice-community-stat" title="Người dùng">
                      <span className="voice-community-stat-ic" aria-hidden="true">
                        👥
                      </span>
                      {v.stats.users}
                    </span>
                    <span className="voice-community-stat" title="Lượt ký tự / dùng">
                      <span className="voice-community-stat-ic" aria-hidden="true">
                        📊
                      </span>
                      {v.stats.volume}
                    </span>
                    <span className="voice-community-stat" title="Chu kỳ">
                      <span className="voice-community-stat-ic" aria-hidden="true">
                        📅
                      </span>
                      {v.stats.period}
                    </span>
                  </div>
                  {renderVoiceActions(v)}
                </li>
              ))}
            </ul>
          </section>

          <section className="voice-community-section voice-community-featured-wrap" aria-labelledby="community-featured-title">
            <h4 id="community-featured-title" className="voice-community-section-title">
              Nổi bật
            </h4>
            <div className="voice-community-featured-grid">
              {communityFeatured.map((v) => (
                <article key={`feat-${v.id}`} className="voice-community-card" onClick={() => playLibraryPreview(v)}>
                  <div className="voice-community-card-head">
                    <div className="voice-library-avatar voice-community-card-avatar" aria-hidden="true">
                      {initials(v.name)}
                    </div>
                    <div className="voice-community-card-head-text">
                      <div className="voice-community-card-name">{v.name}</div>
                      <div className="voice-community-card-cat">{v.cardCategory}</div>
                    </div>
                    <div className="voice-community-card-head-actions">
                      <details className="voice-library-more" onClick={(e) => e.stopPropagation()}>
                        <summary className="voice-library-more-trigger" aria-label="Thêm">
                          ⋮
                        </summary>
                        <div className="voice-library-more-menu">
                          <button
                            type="button"
                            className="voice-library-more-item"
                            onClick={(e) => {
                              e.stopPropagation();
                              void navigator.clipboard?.writeText?.(v.voiceCode);
                            }}
                          >
                            Sao chép voice_code
                          </button>
                        </div>
                      </details>
                    </div>
                  </div>
                  <p className="voice-community-card-desc">{v.description}</p>
                  <div className="voice-community-card-stats-mini">
                    <span>👥 {v.stats.users}</span>
                    <span>📊 {v.stats.volume}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary voice-community-card-use"
                    onClick={(e) => {
                      e.stopPropagation();
                      useVoice(v);
                    }}
                  >
                    Sử dụng
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="voice-community-section" aria-labelledby="community-newest-title">
            <h4 id="community-newest-title" className="voice-community-section-title">
              Mới nhất
            </h4>
            <ul className="voice-community-newest-list">
              {communityNewest.map((v) => (
                <li key={`new-${v.id}`} className="voice-community-newest-row" onClick={() => playLibraryPreview(v)}>
                  <div className="voice-library-avatar" aria-hidden="true">
                    {initials(v.name)}
                  </div>
                  <div className="voice-library-meta">
                    <div className="voice-library-name-row">
                      <span className="voice-library-name">{v.name}</span>
                    </div>
                    <div className="voice-library-desc">{v.description}</div>
                  </div>
                  <div className="voice-library-locale voice-community-locale">
                    <span className="voice-library-flag">🇻🇳</span>
                    <span>
                      {v.language} — {v.region}
                    </span>
                  </div>
                  <div className="voice-community-stats voice-community-stats--compact" aria-label="Thống kê">
                    <span className="voice-community-stat">
                      👥 {v.stats.users}
                    </span>
                    <span className="voice-community-stat">
                      📊 {v.stats.volume}
                    </span>
                    <span className="voice-community-stat">
                      📅 {v.stats.period}
                    </span>
                  </div>
                  {renderVoiceActions(v)}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <>
          <div className="voice-library-toolbar">
            <div className="voice-library-search-wrap">
              <span className="voice-library-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                type="search"
                className="input voice-library-search"
                placeholder="Tìm kiếm bằng từ khóa liên quan"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Tìm kiếm giọng"
              />
            </div>
            <div className="voice-library-filters">
              <select className="input voice-library-select" value={field} onChange={(e) => setField(e.target.value)} aria-label="Lĩnh vực">
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {f === 'all' ? 'Lĩnh vực' : f}
                  </option>
                ))}
              </select>
              <select className="input voice-library-select" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Ngôn ngữ">
                {languages.map((f) => (
                  <option key={f} value={f}>
                    {f === 'all' ? 'Ngôn ngữ' : f}
                  </option>
                ))}
              </select>
              <select className="input voice-library-select" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Vùng miền">
                {regions.map((f) => (
                  <option key={f} value={f}>
                    {f === 'all' ? 'Vùng miền' : f}
                  </option>
                ))}
              </select>
              <div className="voice-library-tool-icons">
                <button type="button" className="voice-library-icon-btn" title="Xóa bộ lọc & từ khóa" onClick={resetFilters}>
                  ↺
                </button>
                <button type="button" className="voice-library-icon-btn" title={`Sắp xếp tên: ${sortDir === 'asc' ? 'A→Z' : 'Z→A'}`} onClick={cycleSort}>
                  ☰
                </button>
              </div>
            </div>
          </div>

          <p className="voice-library-subheading">Giọng Veo3pro</p>

          <ul className="voice-library-list">
            {filtered.map((v) => (
              <li key={v.id} className="voice-library-row" onClick={() => playLibraryPreview(v)}>
                <div className="voice-library-avatar" aria-hidden="true">
                  {initials(v.name)}
                </div>
                <div className="voice-library-meta">
                  <div className="voice-library-name-row">
                    <span className="voice-library-name">{v.name}</span>
                    {v.badge ? <span className="voice-library-badge">{v.badge}</span> : null}
                  </div>
                  <div className="voice-library-desc">{v.description}</div>
                </div>
                <div className="voice-library-locale">
                  <span className="voice-library-flag" title="Tiếng Việt">
                    🇻🇳
                  </span>
                  <span>
                    {v.language}
                    <br />
                    <span className="voice-library-region">{v.region}</span>
                  </span>
                </div>
                {renderVoiceActions(v)}
              </li>
            ))}
          </ul>
        </>
      )}

    </div>
  );
}
