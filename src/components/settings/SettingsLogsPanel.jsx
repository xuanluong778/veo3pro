import { useCallback, useState } from 'react';
import { checkHealth } from '../../veoClient.js';
import { proxyIpCheck, testChromeProfileUltra } from '../../toolsClient.js';

/**
 * @param {{
 *   logs: string,
 *   health: object,
 *   onHealthRefresh: () => void,
 *   profiles: Array<Record<string, unknown>>,
 *   profilesBusy: boolean,
 *   onRefreshProfiles: () => void,
 * }} props
 */
export default function SettingsLogsPanel({ logs, health, onHealthRefresh, profiles, profilesBusy, onRefreshProfiles }) {
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthMsg, setHealthMsg] = useState('');
  const [testBusy, setTestBusy] = useState('');
  const [testPick, setTestPick] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');

  const runHealthCheck = useCallback(async () => {
    setHealthBusy(true);
    setHealthMsg('');
    try {
      const h = await checkHealth();
      onHealthRefresh();
      const parts = [];
      if (h?.ok) parts.push('Server OK');
      if (h?.hasApiKey) parts.push('Gemini: có key');
      else parts.push('Gemini: chưa có key');
      if (h?.preferUltraWebGemini) parts.push('Ultra web: bật');
      setHealthMsg(parts.join(' · '));
    } catch (e) {
      setHealthMsg(e?.message || 'Kiểm tra thất bại');
    } finally {
      setHealthBusy(false);
    }
  }, [onHealthRefresh]);

  const runProfileUltraTest = useCallback(async () => {
    const slug = String(testPick || '').trim();
    if (!slug) {
      window.alert('Chọn profile để test Ultra.');
      return;
    }
    setTestBusy(`ultra-${slug}`);
    try {
      const out = await testChromeProfileUltra(slug);
      onRefreshProfiles();
      window.alert(out.message || `Ultra: ${out.status || 'done'}`);
    } catch (e) {
      window.alert(e.message || 'Test Ultra thất bại.');
    } finally {
      setTestBusy('');
    }
  }, [testPick, onRefreshProfiles]);

  const runProxyTest = useCallback(async () => {
    setTestBusy('proxy');
    try {
      const out = await proxyIpCheck(String(proxyUrl || '').trim());
      window.alert(`IP qua proxy (server): ${out?.ip || '—'}`);
    } catch (e) {
      window.alert(e.message || 'Test proxy thất bại.');
    } finally {
      setTestBusy('');
    }
  }, [proxyUrl]);

  return (
    <div className="stg-root">
      <div className="stg-head">
        <h3 style={{ margin: 0 }}>Logs &amp; Kiểm tra hệ thống</h3>
        <p className="hint" style={{ marginTop: '0.35rem', marginBottom: 0 }}>
          Nhật ký phiên tạo video và công cụ kiểm tra kết nối (một nơi duy nhất — không lặp ở tab Profile).
        </p>
      </div>

      <div className="stg-panel-block">
        <h4 className="pgu-section-title">Kiểm tra hệ thống</h4>
        <div className="stg-health-grid">
          <div className="stg-health-item">
            <span className="hint">Server / API</span>
            <strong>{health?.ok ? 'Hoạt động' : 'Chưa xác nhận'}</strong>
          </div>
          <div className="stg-health-item">
            <span className="hint">Gemini key</span>
            <strong>{health?.hasApiKey ? 'Có' : 'Không'}</strong>
          </div>
          <div className="stg-health-item">
            <span className="hint">Ultra web</span>
            <strong>{health?.preferUltraWebGemini ? 'Ưu tiên bật' : 'Tắt / chưa cấu hình'}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.65rem', alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary" disabled={healthBusy} onClick={runHealthCheck}>
            {healthBusy ? 'Đang kiểm tra…' : 'Kiểm tra kết nối API'}
          </button>
          {healthMsg ? <span className="hint">{healthMsg}</span> : null}
        </div>
      </div>

      <div className="stg-panel-block">
        <h4 className="pgu-section-title">Test profile &amp; proxy</h4>
        <div className="row">
          <div className="field">
            <label>Profile (test Ultra)</label>
            <select className="input" value={testPick} disabled={profilesBusy} onChange={(e) => setTestPick(e.target.value)}>
              <option value="">— Chọn profile —</option>
              {(profiles || []).map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.displayName || p.slug}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ alignSelf: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!testPick || Boolean(testBusy)}
              onClick={runProfileUltraTest}
            >
              {testBusy.startsWith('ultra') ? 'Đang test…' : 'Test Ultra (profile)'}
            </button>
          </div>
        </div>
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <div className="field">
            <label>Proxy URL (test IP server)</label>
            <input
              className="input"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="http://user:pass@ip:port hoặc để trống = IP server"
              autoComplete="off"
            />
          </div>
          <div className="field" style={{ alignSelf: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" disabled={Boolean(testBusy)} onClick={runProxyTest}>
              {testBusy === 'proxy' ? 'Đang test…' : 'Test proxy (server)'}
            </button>
          </div>
        </div>
        <p className="hint" style={{ marginTop: '0.5rem' }}>
          Test Ultra / proxy tại đây dùng cho kiểm tra sâu. Trên tab Profile, «Test Ultra» là hành động nhanh trên từng dòng.
        </p>
      </div>

      <div className="stg-panel-block">
        <h4 className="pgu-section-title">Logs phiên (tạo video &amp; tiến trình)</h4>
        <div className="log-box" style={{ marginTop: '0.5rem', minHeight: 200 }}>
          {logs || 'Chưa có nhật ký trong phiên này.'}
        </div>
      </div>
    </div>
  );
}
