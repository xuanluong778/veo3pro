import { computeSettingsOverview } from './settingsShared.js';

/**
 * @param {{
 *   profiles: Array<Record<string, unknown>>,
 *   profilesBusy: boolean,
 *   videoPrefs: object,
 *   hasEnvFallback: boolean,
 *   hasAccountApiKey: boolean,
 *   generalSettings: object,
 *   onGeneralSettingsChange: (fn: (p: object) => object) => void,
 *   onSaveGeneral: () => void,
 *   onNavigateTab: (tab: string) => void,
 *   onLogout: () => void,
 * }} props
 */
export default function SettingsOverviewPanel({
  profiles,
  profilesBusy,
  videoPrefs,
  hasEnvFallback,
  hasAccountApiKey,
  generalSettings,
  onGeneralSettingsChange,
  onSaveGeneral,
  onNavigateTab,
  onLogout,
}) {
  const overview = computeSettingsOverview({
    profiles,
    videoPrefs,
    profilesBusy,
    hasEnvFallback,
    hasAccountApiKey,
  });

  return (
    <div className="stg-root">
      <div className="stg-head">
        <h3 style={{ margin: 0 }}>Tổng quan</h3>
        <p className="hint" style={{ marginTop: '0.35rem', marginBottom: 0 }}>
          Trạng thái nguồn tạo video và cấu hình chính. Chi tiết từng mục nằm ở các tab bên cạnh.
        </p>
      </div>

      <div className="pgu-overview">
        <button type="button" className="pgu-overview-card stg-overview-card-btn" onClick={() => onNavigateTab('api')}>
          <div className="pgu-overview-label">Nguồn tạo video đang dùng</div>
          <div className="pgu-overview-value">{overview.videoSource}</div>
        </button>
        <button type="button" className="pgu-overview-card stg-overview-card-btn" onClick={() => onNavigateTab('profile')}>
          <div className="pgu-overview-label">Gmail Ultra khả dụng</div>
          <div className="pgu-overview-value">{overview.ultraReadyLabel}</div>
        </button>
        <button type="button" className="pgu-overview-card stg-overview-card-btn" onClick={() => onNavigateTab('api')}>
          <div className="pgu-overview-label">API dự phòng</div>
          <div className="pgu-overview-value pgu-overview-value--sm">{overview.apiFallback}</div>
        </button>
        <button type="button" className="pgu-overview-card stg-overview-card-btn" onClick={() => onNavigateTab('api')}>
          <div className="pgu-overview-label">Fallback credit</div>
          <div className="pgu-overview-value pgu-overview-value--sm">{overview.fallbackLabel}</div>
        </button>
      </div>

      {overview.preferUltra ? (
        <div className="stg-note stg-note--success">
          Khi <strong>Gmail Ultra thành công</strong>: không trừ credit hệ thống, không dùng key <code>.env</code>.
        </div>
      ) : null}

      <details className="stg-details">
        <summary>Cài đặt chung (ngôn ngữ, tốc độ, phân trang)</summary>
        <div className="row" style={{ marginTop: '0.85rem' }}>
          <div className="field">
            <label>Ngôn ngữ</label>
            <select
              className="input"
              value={generalSettings.language}
              onChange={(e) => onGeneralSettingsChange((p) => ({ ...p, language: e.target.value }))}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="field">
            <label>Đợi video tiếp theo (giây)</label>
            <input
              className="input"
              type="number"
              value={generalSettings.waitNextVideoSec}
              onChange={(e) => onGeneralSettingsChange((p) => ({ ...p, waitNextVideoSec: Number(e.target.value) || 0 }))}
            />
          </div>
          <div className="field">
            <label>Đợi tải (giây)</label>
            <input
              className="input"
              type="number"
              value={generalSettings.waitUploadSec}
              onChange={(e) => onGeneralSettingsChange((p) => ({ ...p, waitUploadSec: Number(e.target.value) || 0 }))}
            />
          </div>
          <div className="field">
            <label>Đợi khi lỗi/hết hạn (giây)</label>
            <input
              className="input"
              type="number"
              value={generalSettings.waitOnErrorSec}
              onChange={(e) => onGeneralSettingsChange((p) => ({ ...p, waitOnErrorSec: Number(e.target.value) || 0 }))}
            />
          </div>
          <div className="field">
            <label>Chế độ tăng tốc</label>
            <select
              className="input"
              value={generalSettings.turboMode ? 'on' : 'off'}
              onChange={(e) => onGeneralSettingsChange((p) => ({ ...p, turboMode: e.target.value === 'on' }))}
            >
              <option value="on">Bật</option>
              <option value="off">Tắt</option>
            </select>
          </div>
          <div className="field">
            <label>Số mục mỗi trang</label>
            <select
              className="input"
              value={generalSettings.pageSize}
              onChange={(e) => onGeneralSettingsChange((p) => ({ ...p, pageSize: Number(e.target.value) || 10 }))}
            >
              {[5, 10, 20, 30, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-primary" onClick={onSaveGeneral}>
            Lưu cài đặt chung
          </button>
        </div>
      </details>

      <p style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onLogout}>
          Đăng xuất khỏi tài khoản
        </button>
      </p>
    </div>
  );
}
