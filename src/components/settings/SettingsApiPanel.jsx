import { useState } from 'react';
import {
  clearChromeProfileKeys,
  fetchChromeProfileKeyStatus,
  fetchChromePortableProfiles,
  patchChromeProfileKeys,
  saveChromeProfileApiFlags,
  saveChromeProfileKeys,
} from '../../toolsClient.js';
import { saveVideoPrefs } from '../../videoPrefsClient.js';
import { FALLBACK_OPTIONS, VIDEO_SOURCE_PRIORITY } from './settingsShared.js';

function KeyOneRow({
  rowId,
  profileTitle,
  apiTitle,
  rawValue,
  enabled,
  onToggleEnabled,
  flagPayload,
  deletePatch,
  keyShowById,
  setKeyShowById,
  apiFlagBusy,
  slugPick,
  onKeysChanged,
}) {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;
  const show = Boolean(keyShowById[rowId]);
  const busy = apiFlagBusy === rowId || apiFlagBusy === `del-${rowId}`;

  return (
    <div className="stg-key-row">
      <div className="stg-key-row-title">
        <span>{profileTitle}</span>
        <span className="hint" style={{ fontWeight: 600 }}>
          {' '}
          · {apiTitle}
        </span>
        {!enabled ? (
          <span className="hint" style={{ display: 'block', fontWeight: 500, marginTop: '0.15rem' }}>
            (API đang tắt)
          </span>
        ) : null}
      </div>
      <label className="stg-key-flag" title="Bật/tắt dùng key này khi gọi API">
        <input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => onToggleEnabled(e.target.checked, flagPayload)} />
        <span>API</span>
      </label>
      <input
        className="input"
        readOnly
        type={show ? 'text' : 'password'}
        value={raw}
        style={{ flex: '1 1 10rem', minWidth: '6rem', fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem' }}
        autoComplete="off"
      />
      <button type="button" className="btn secondary" style={{ whiteSpace: 'nowrap' }} disabled={busy} onClick={() => setKeyShowById((p) => ({ ...p, [rowId]: !p[rowId] }))}>
        {show ? 'Ẩn' : 'Show'}
      </button>
      <button
        type="button"
        className="btn btn-danger"
        style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(`Xóa ${apiTitle} khỏi profile này?`)) return;
          await patchChromeProfileKeys({ slug: slugPick, ...deletePatch });
          onKeysChanged(slugPick);
          setKeyShowById((p) => {
            const next = { ...p };
            delete next[rowId];
            return next;
          });
        }}
      >
        Xóa key
      </button>
    </div>
  );
}

/**
 * @param {object} props
 */
export default function SettingsApiPanel({
  videoPrefs,
  onVideoPrefsChange,
  onVideoPrefsSaved,
  videoPrefsBusy,
  setVideoPrefsBusy,
  chromeProfiles,
  chromeProfilesBusy,
  activeApiProfileSlug,
  setActiveApiProfileSlug,
  revealedChromeKeys,
  revealKeysLoading,
  bumpRevealKeys,
  bumpChromeProfilesList,
  setChromeProfiles,
  keyShowById,
  setKeyShowById,
  apiFlagBusy,
  setApiFlagBusy,
  profileKeyBusy,
  setProfileKeyBusy,
  profileKeyStatus,
  setProfileKeyStatus,
  profileKeyUi,
  setProfileKeyUi,
  effectiveHasGeminiKey,
  effectiveHasOpenAiKey,
  keyStatus,
  health,
  onHealthRefresh,
}) {
  const [prefsSaveBusy, setPrefsSaveBusy] = useState(false);
  const fallbackMode = String(videoPrefs?.creditFallbackMode || 'ask');

  const slugPick = String(activeApiProfileSlug || '').trim();
  const chromeNm = slugPick ? chromeProfiles.find((p) => p.slug === slugPick)?.displayName || slugPick : '';
  const rk = revealedChromeKeys;
  const profileAe = rk?.apiEnabled || { gemini: true, grok: true, openAi: true };
  const profileHasAnyKey =
    Boolean(rk?.geminiApiKey?.trim()) ||
    Boolean(rk?.openAiApiKey?.trim()) ||
    Boolean(rk?.grokApiKey?.trim()) ||
    Boolean(rk?.grokBaseUrl?.trim());

  async function handleFlagChrome(checked, { slug, kind }) {
    const id = `chrome-${slug}-${kind}`;
    setApiFlagBusy(id);
    try {
      const body =
        kind === 'gemini' ? { geminiEnabled: checked } : kind === 'openai' ? { openAiEnabled: checked } : { grokEnabled: checked };
      await saveChromeProfileApiFlags(slug, body);
      bumpRevealKeys();
      bumpChromeProfilesList();
      const st = await fetchChromeProfileKeyStatus(slug);
      setProfileKeyStatus(st);
    } catch (e) {
      window.alert(e.message || 'Không cập nhật được.');
    } finally {
      setApiFlagBusy('');
    }
  }

  async function onKeysChanged(slug) {
    bumpRevealKeys();
    bumpChromeProfilesList();
    const st = await fetchChromeProfileKeyStatus(slug);
    setProfileKeyStatus(st);
    onHealthRefresh();
  }

  async function saveUltraAndFallback() {
    setPrefsSaveBusy(true);
    try {
      setVideoPrefsBusy(true);
      const saved = await saveVideoPrefs(videoPrefs);
      onVideoPrefsSaved(saved);
      onHealthRefresh();
      window.alert('Đã lưu cấu hình nguồn tạo video.');
    } catch (e) {
      window.alert(e.message || 'Không lưu được.');
    } finally {
      setPrefsSaveBusy(false);
      setVideoPrefsBusy(false);
    }
  }

  return (
    <div className="stg-root">
      <div className="stg-head">
        <h3 style={{ margin: 0 }}>API &amp; Nguồn tạo video</h3>
        <p className="hint" style={{ marginTop: '0.35rem', marginBottom: 0 }}>
          Thứ tự ưu tiên khi tạo video và cấu hình API key. Profile Chrome quản lý tại tab{' '}
          <strong>Profile &amp; Gmail Ultra</strong>.
        </p>
      </div>

      <div className="stg-priority-block">
        <h4 className="pgu-section-title">Thứ tự ưu tiên nguồn tạo video</h4>
        <ol className="stg-priority-list">
          {VIDEO_SOURCE_PRIORITY.map((item) => (
            <li key={item.step}>
              <strong>
                {item.step}. {item.label}
              </strong>
              <span className="hint"> — {item.desc}</span>
            </li>
          ))}
        </ol>
        <div className="stg-note stg-note--success">
          Khi <strong>Gmail Ultra thành công</strong>: <code>charged_credit=0</code>, không dùng <code>GEMINI_API_KEY</code> /{' '}
          <code>OPENAI_API_KEY</code> trong <code>.env</code>.
        </div>
      </div>

      <div className="pgu-fallback-block">
        <h4 className="pgu-section-title">Ưu tiên Gmail Ultra khi tạo video</h4>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem', marginBottom: '0.65rem' }}>
          <input
            type="checkbox"
            checked={Boolean(videoPrefs.preferUltraProfile)}
            disabled={videoPrefsBusy || prefsSaveBusy}
            onChange={(e) => onVideoPrefsChange((p) => ({ ...p, preferUltraProfile: e.target.checked }))}
          />
          Bật ưu tiên Gmail Ultra (thử profile theo thứ tự ưu tiên #1 trong tab Profile)
        </label>
        <p className="hint" style={{ marginTop: 0 }}>
          Profile #1 đặt tại tab Profile &amp; Gmail Ultra. Hệ thống thử lần lượt các profile Ultra đang bật.
        </p>
      </div>

      <div className="pgu-fallback-block">
        <h4 className="pgu-section-title">Fallback credit hệ thống</h4>
        <p className="hint" style={{ marginTop: 0 }}>
          Áp dụng khi <strong>tất cả</strong> profile Gmail Ultra thất bại.
        </p>
        <div className="pgu-fallback-options">
          {FALLBACK_OPTIONS.map((opt) => (
            <label key={opt.id} className={`pgu-fallback-opt ${fallbackMode === opt.id ? 'active' : ''}`}>
              <input
                type="radio"
                name="credit-fallback-api"
                checked={fallbackMode === opt.id}
                disabled={videoPrefsBusy || prefsSaveBusy}
                onChange={() => onVideoPrefsChange((p) => ({ ...p, creditFallbackMode: opt.id }))}
              />
              <span className="pgu-fallback-opt-title">{opt.label}</span>
              <span className="pgu-fallback-opt-hint">{opt.hint}</span>
            </label>
          ))}
        </div>
        <div style={{ marginTop: '0.65rem' }}>
          <button type="button" className="btn btn-primary" disabled={prefsSaveBusy || videoPrefsBusy} onClick={saveUltraAndFallback}>
            {prefsSaveBusy ? 'Đang lưu…' : 'Lưu cấu hình nguồn & fallback'}
          </button>
        </div>
      </div>

      <div className="stg-panel-block">
        <h4 className="pgu-section-title">API key theo Chrome profile</h4>
        <p className="hint" style={{ marginTop: 0 }}>
          Key lưu mã hóa theo profile. Server ưu tiên profile đang chọn, rồi profile khác (API bật), sau đó key tài khoản và <code>.env</code>.
        </p>

        <div className="field" style={{ marginTop: '0.65rem' }}>
          <label>Profile đang dùng cho API key</label>
          <select
            className="input"
            style={{ maxWidth: 420 }}
            value={activeApiProfileSlug || ''}
            onChange={(e) => setActiveApiProfileSlug(e.target.value)}
            disabled={chromeProfilesBusy}
          >
            <option value="">(Không chọn — fallback tài khoản / .env)</option>
            {chromeProfiles.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.displayName || p.slug}
                {p?.keyStatus?.hasGemini || p?.keyStatus?.hasGrok || p?.keyStatus?.hasOpenAi ? '  ✓' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="stg-connected-box">
          <div style={{ fontWeight: 700 }}>Đã kết nối</div>
          {revealKeysLoading ? (
            <div className="hint" style={{ marginTop: '0.65rem' }}>
              Đang tải key đã lưu…
            </div>
          ) : null}
          {slugPick ? (
            profileHasAnyKey ? (
              <>
                <KeyOneRow
                  rowId={`chrome-${slugPick}-gemini`}
                  profileTitle={chromeNm}
                  apiTitle="Gemini (AI Studio / Veo)"
                  rawValue={rk?.geminiApiKey}
                  enabled={profileAe.gemini}
                  flagPayload={{ slug: slugPick, kind: 'gemini' }}
                  onToggleEnabled={handleFlagChrome}
                  deletePatch={{ geminiApiKey: '' }}
                  keyShowById={keyShowById}
                  setKeyShowById={setKeyShowById}
                  apiFlagBusy={apiFlagBusy}
                  slugPick={slugPick}
                  onKeysChanged={onKeysChanged}
                />
                <KeyOneRow
                  rowId={`chrome-${slugPick}-openai`}
                  profileTitle={chromeNm}
                  apiTitle="OpenAI"
                  rawValue={rk?.openAiApiKey}
                  enabled={profileAe.openAi}
                  flagPayload={{ slug: slugPick, kind: 'openai' }}
                  onToggleEnabled={handleFlagChrome}
                  deletePatch={{ openAiApiKey: '' }}
                  keyShowById={keyShowById}
                  setKeyShowById={setKeyShowById}
                  apiFlagBusy={apiFlagBusy}
                  slugPick={slugPick}
                  onKeysChanged={onKeysChanged}
                />
                <KeyOneRow
                  rowId={`chrome-${slugPick}-grok`}
                  profileTitle={chromeNm}
                  apiTitle="Grok (API key)"
                  rawValue={rk?.grokApiKey}
                  enabled={profileAe.grok}
                  flagPayload={{ slug: slugPick, kind: 'grok' }}
                  onToggleEnabled={handleFlagChrome}
                  deletePatch={{ grokApiKey: '' }}
                  keyShowById={keyShowById}
                  setKeyShowById={setKeyShowById}
                  apiFlagBusy={apiFlagBusy}
                  slugPick={slugPick}
                  onKeysChanged={onKeysChanged}
                />
                <KeyOneRow
                  rowId={`chrome-${slugPick}-grokurl`}
                  profileTitle={chromeNm}
                  apiTitle="Grok Base URL"
                  rawValue={rk?.grokBaseUrl}
                  enabled={profileAe.grok}
                  flagPayload={{ slug: slugPick, kind: 'grok' }}
                  onToggleEnabled={handleFlagChrome}
                  deletePatch={{ grokBaseUrl: '' }}
                  keyShowById={keyShowById}
                  setKeyShowById={setKeyShowById}
                  apiFlagBusy={apiFlagBusy}
                  slugPick={slugPick}
                  onKeysChanged={onKeysChanged}
                />
              </>
            ) : (
              <div className="hint" style={{ marginTop: '0.35rem' }}>
                Chưa có key — điền bên dưới rồi bấm «Lưu key (theo profile)».
              </div>
            )
          ) : (
            <div className="hint" style={{ marginTop: '0.65rem' }}>
              Chọn profile để xem / chỉnh key.
            </div>
          )}
          <div className="hint" style={{ marginTop: '0.65rem' }}>
            Trạng thái: Gemini {effectiveHasGeminiKey ? '✓' : '✗'} · Grok {keyStatus.hasGrok ? '✓' : '✗'} · OpenAI{' '}
            {effectiveHasOpenAiKey ? '✓' : '✗'}
            {health?.preferUltraWebGemini ? ' · Ultra web: bật' : ''}
          </div>
        </div>

        <div className="row" style={{ marginTop: '0.75rem' }}>
          <div className="field">
            <label>Gemini API Key</label>
            <input
              className="input"
              type="password"
              value={profileKeyUi.geminiApiKey}
              onChange={(e) => setProfileKeyUi((p) => ({ ...p, geminiApiKey: e.target.value }))}
              placeholder={profileKeyStatus.hasGemini ? 'Đã lưu (nhập mới để thay)' : 'AIza...'}
              autoComplete="off"
              disabled={!activeApiProfileSlug}
            />
          </div>
          <div className="field">
            <label>OpenAI API Key</label>
            <input
              className="input"
              type="password"
              value={profileKeyUi.openAiApiKey}
              onChange={(e) => setProfileKeyUi((p) => ({ ...p, openAiApiKey: e.target.value }))}
              placeholder={profileKeyStatus.hasOpenAi ? 'Đã lưu (nhập mới để thay)' : 'sk-...'}
              autoComplete="off"
              disabled={!activeApiProfileSlug}
            />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Grok API Key</label>
            <input
              className="input"
              type="password"
              value={profileKeyUi.grokApiKey}
              onChange={(e) => setProfileKeyUi((p) => ({ ...p, grokApiKey: e.target.value }))}
              placeholder={profileKeyStatus.hasGrok ? 'Đã lưu (nhập mới để thay)' : 'xai-...'}
              autoComplete="off"
              disabled={!activeApiProfileSlug}
            />
          </div>
          <div className="field">
            <label>Grok Base URL</label>
            <input
              className="input"
              value={profileKeyUi.grokBaseUrl}
              onChange={(e) => setProfileKeyUi((p) => ({ ...p, grokBaseUrl: e.target.value }))}
              placeholder="https://api.x.ai/v1"
              autoComplete="off"
              disabled={!activeApiProfileSlug}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={profileKeyBusy || !activeApiProfileSlug}
            onClick={async () => {
              if (!activeApiProfileSlug) return;
              setProfileKeyBusy(true);
              try {
                const status = await saveChromeProfileKeys({ slug: activeApiProfileSlug, ...profileKeyUi });
                setProfileKeyStatus(status);
                setProfileKeyUi({ geminiApiKey: '', grokApiKey: '', grokBaseUrl: profileKeyUi.grokBaseUrl, openAiApiKey: '' });
                window.alert('Đã lưu API key cho profile.');
                bumpRevealKeys();
                fetchChromePortableProfiles().then(setChromeProfiles).catch(() => {});
                onHealthRefresh();
              } catch (e) {
                window.alert(e.message || 'Lưu key thất bại');
              } finally {
                setProfileKeyBusy(false);
              }
            }}
          >
            {profileKeyBusy ? 'Đang lưu…' : 'Lưu key (theo profile)'}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={profileKeyBusy || !activeApiProfileSlug}
            onClick={async () => {
              if (!activeApiProfileSlug) return;
              setProfileKeyBusy(true);
              try {
                const status = await clearChromeProfileKeys(activeApiProfileSlug);
                setProfileKeyStatus(status);
                setProfileKeyUi({ geminiApiKey: '', grokApiKey: '', grokBaseUrl: '', openAiApiKey: '' });
                window.alert('Đã xoá API key của profile.');
                bumpRevealKeys();
                fetchChromePortableProfiles().then(setChromeProfiles).catch(() => {});
                onHealthRefresh();
              } catch (e) {
                window.alert(e.message || 'Xoá key thất bại');
              } finally {
                setProfileKeyBusy(false);
              }
            }}
          >
            Xóa key (theo profile)
          </button>
        </div>
      </div>
    </div>
  );
}
