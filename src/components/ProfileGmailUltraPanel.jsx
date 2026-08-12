import { useCallback, useMemo, useState } from 'react';
import {
  deleteChromePortableProfile,
  downloadChromePortableProfileBat,
  downloadVeo3Launcher,
  openChromeProfileViaHelper,
  patchChromeProfileUltraMeta,
  saveChromePortableProfile,
  testChromeProfileUltra,
} from '../toolsClient.js';
import { saveVideoPrefs } from '../videoPrefsClient.js';

const STATUS_META = {
  ready: { label: 'Sẵn sàng', cls: 'pgu-badge--ready' },
  needs_login: { label: 'Cần đăng nhập', cls: 'pgu-badge--warn' },
  proxy_error: { label: 'Proxy lỗi', cls: 'pgu-badge--danger' },
  quota_exceeded: { label: 'Hết quota', cls: 'pgu-badge--orange' },
  disabled: { label: 'Tạm tắt', cls: 'pgu-badge--muted' },
  unchecked: { label: 'Chưa kiểm tra', cls: 'pgu-badge--slate' },
};

function formatDt(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function proxySummary(url) {
  const u = String(url || '').trim();
  if (!u) return 'Không dùng';
  try {
    const parsed = new URL(u);
    const host = parsed.hostname || '—';
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${host}${port}`;
  } catch {
    return u.length > 28 ? `${u.slice(0, 28)}…` : u;
  }
}

function emptyForm() {
  return { displayName: '', ultraGmailLabel: '', proxyUrl: '', chromeNote: '' };
}

/**
 * @param {{
 *   profiles: Array<Record<string, unknown>>,
 *   profilesBusy: boolean,
 *   profilesError: string,
 *   onRefresh: () => void,
 *   videoPrefs: { preferUltraProfile?: boolean, preferredProfileSlug?: string },
 *   onVideoPrefsChange: (fn: (p: object) => object) => void,
 *   onVideoPrefsSaved: (prefs: object) => void,
 *   videoPrefsBusy: boolean,
 * }} props
 */
export default function ProfileGmailUltraPanel({
  profiles,
  profilesBusy,
  profilesError,
  onRefresh,
  videoPrefs,
  onVideoPrefsChange,
  onVideoPrefsSaved,
  videoPrefsBusy,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [formBusy, setFormBusy] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [rowBusy, setRowBusy] = useState('');
  const [menuOpen, setMenuOpen] = useState('');
  const [banner, setBanner] = useState('');
  const [toast, setToast] = useState('');
  const [launcherModal, setLauncherModal] = useState(null);
  const [launcherBusy, setLauncherBusy] = useState(false);

  const preferredSlug = String(videoPrefs?.preferredProfileSlug || '').trim();

  const sortedProfiles = useMemo(() => {
    const list = Array.isArray(profiles) ? [...profiles] : [];
    return list.sort((a, b) => {
      if (a.slug === preferredSlug) return -1;
      if (b.slug === preferredSlug) return 1;
      const ta = a.lastOpenedAt || a.createdAt || '';
      const tb = b.lastOpenedAt || b.createdAt || '';
      return String(tb).localeCompare(String(ta));
    });
  }, [profiles, preferredSlug]);

  const openCreate = useCallback(() => {
    setEditingSlug('');
    setForm(emptyForm());
    setFormErr('');
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((p) => {
    setEditingSlug(p.slug);
    setForm({
      displayName: p.displayName || p.slug || '',
      ultraGmailLabel: p.ultraGmailLabel || '',
      proxyUrl: p.proxyUrl || '',
      chromeNote: '',
    });
    setFormErr('');
    setFormOpen(true);
  }, []);

  const saveForm = useCallback(async () => {
    setFormErr('');
    const name = String(form.displayName || '').trim();
    if (!name) {
      setFormErr('Nhập tên profile.');
      return;
    }
    setFormBusy(true);
    try {
      await saveChromePortableProfile(name, String(form.proxyUrl || '').trim(), String(form.ultraGmailLabel || '').trim());
      setFormOpen(false);
      setBanner('Đã lưu profile.');
      onRefresh();
    } catch (e) {
      setFormErr(e.message || 'Không lưu được profile.');
    } finally {
      setFormBusy(false);
    }
  }, [form, onRefresh]);

  const setPriorityOne = useCallback(
    async (slug) => {
      setRowBusy(`prio-${slug}`);
      setMenuOpen('');
      try {
        const next = {
          ...videoPrefs,
          preferUltraProfile: true,
          preferredProfileSlug: slug,
        };
        onVideoPrefsChange(() => next);
        const saved = await saveVideoPrefs(next);
        onVideoPrefsSaved(saved);
        setBanner(`Đã đặt «${slug}» làm profile ưu tiên #1.`);
      } catch (e) {
        window.alert(e.message || 'Không lưu được ưu tiên.');
      } finally {
        setRowBusy('');
      }
    },
    [videoPrefs, onVideoPrefsChange, onVideoPrefsSaved],
  );

  const toggleUltraEnabled = useCallback(
    async (p) => {
      const slug = p.slug;
      setRowBusy(`toggle-${slug}`);
      try {
        await patchChromeProfileUltraMeta(slug, { ultraEnabled: !p.ultraEnabled });
        onRefresh();
        setBanner(!p.ultraEnabled ? 'Đã bật lại profile.' : 'Đã tạm tắt profile.');
      } catch (e) {
        window.alert(e.message || 'Không cập nhật được.');
      } finally {
        setRowBusy('');
      }
    },
    [onRefresh],
  );

  const runTestUltra = useCallback(
    async (slug) => {
      setRowBusy(`ultra-${slug}`);
      try {
        const out = await testChromeProfileUltra(slug);
        onRefresh();
        setBanner(out.message || 'Đã kiểm tra Ultra.');
      } catch (e) {
        window.alert(e.message || 'Test Ultra thất bại.');
      } finally {
        setRowBusy('');
      }
    },
    [onRefresh],
  );

  const runOpenChrome = useCallback(async (p) => {
    const profileId = p.slug || 'profile';
    const profileName = p.displayName || profileId;
    setRowBusy(`open-${profileId}`);
    setLauncherModal(null);
    setToast(`Đang mở Chrome profile ${profileName}...`);

    const { opened, popupBlocked } = await openChromeProfileViaHelper(profileId, profileName);

    if (popupBlocked) {
      setToast('');
      window.alert(
        'Trình duyệt chặn popup.\n\nVào cài đặt trình duyệt → Cho phép popup cho marketingautoaz.com → bấm Mở Chrome lại.',
      );
    } else if (opened) {
      setToast(`Đã gửi lệnh mở Chrome profile ${profileName}. Kiểm tra cửa sổ Chrome mới (gemini.google.com).`);
    } else {
      setToast('');
      setLauncherModal({ profileId, profileName });
    }

    setRowBusy('');
  }, []);

  const handleLauncherDownload = useCallback(async () => {
    setLauncherBusy(true);
    try {
      await downloadVeo3Launcher();
    } catch (e) {
      window.alert(e?.message || 'Không tải được VEO3 Launcher.');
    } finally {
      setLauncherBusy(false);
    }
  }, []);

  const handleLauncherRetry = useCallback(async () => {
    if (!launcherModal) return;
    const { profileId, profileName } = launcherModal;
    setLauncherBusy(true);
    setToast(`Đang mở Chrome profile ${profileName}...`);

    const { opened, popupBlocked } = await openChromeProfileViaHelper(profileId, profileName);

    if (popupBlocked) {
      setToast('Cho phép popup cho marketingautoaz.com rồi thử lại.');
    } else if (opened) {
      setLauncherModal(null);
      setToast(`Đã gửi lệnh mở Chrome profile ${profileName}.`);
    } else {
      setToast('Chưa nhận được launcher. Giải nén ZIP → chạy install.bat → thử lại.');
    }

    setLauncherBusy(false);
  }, [launcherModal]);

  const runDelete = useCallback(
    async (p) => {
      if (!window.confirm(`Xóa profile «${p.displayName || p.slug}» khỏi danh sách?`)) return;
      setRowBusy(`del-${p.slug}`);
      try {
        await deleteChromePortableProfile(p.slug);
        onRefresh();
        setBanner('Đã xóa profile.');
      } catch (e) {
        window.alert(e.message || 'Không xóa được.');
      } finally {
        setRowBusy('');
      }
    },
    [onRefresh],
  );

  const runDownloadBat = useCallback(async (p) => {
    setMenuOpen('');
    setRowBusy(`bat-${p.slug}`);
    try {
      await downloadChromePortableProfileBat(p.displayName || p.slug);
    } catch (e) {
      window.alert(e.message || 'Không tải được file .bat');
    } finally {
      setRowBusy('');
    }
  }, []);

  return (
    <div className="pgu-root">
      <div className="pgu-head">
        <h3 style={{ margin: 0 }}>Profile &amp; Gmail Ultra</h3>
        <p className="hint" style={{ marginTop: '0.35rem', marginBottom: 0, maxWidth: 720 }}>
          Quản lý Chrome profile, Gmail Ultra và proxy. Cấu hình ưu tiên nguồn tạo video &amp; fallback credit nằm ở tab{' '}
          <strong>API &amp; Nguồn tạo video</strong>.
        </p>
      </div>

      {banner ? (
        <div className="pgu-banner" role="status">
          {banner}
          <button type="button" className="pgu-banner-close" onClick={() => setBanner('')} aria-label="Đóng">
            ×
          </button>
        </div>
      ) : null}

      <div className="pgu-toolbar">
        <h4 className="pgu-section-title" style={{ margin: 0 }}>
          Danh sách profile
        </h4>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" disabled={profilesBusy} onClick={onRefresh}>
            {profilesBusy ? 'Đang tải…' : 'Làm mới'}
          </button>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + Thêm profile
          </button>
        </div>
      </div>

      {profilesBusy && !sortedProfiles.length ? (
        <div className="pgu-state pgu-state--loading">
          <div className="pgu-spinner" aria-hidden />
          <p>Đang tải danh sách profile…</p>
        </div>
      ) : null}

      {profilesError && !profilesBusy ? (
        <div className="pgu-state pgu-state--error">
          <p>{profilesError}</p>
          <button type="button" className="btn btn-secondary" onClick={onRefresh}>
            Thử lại
          </button>
        </div>
      ) : null}

      {!profilesBusy && !profilesError && !sortedProfiles.length ? (
        <div className="pgu-state pgu-state--empty">
          <div className="pgu-empty-icon" aria-hidden>
            📁
          </div>
          <h4>Chưa có profile Chrome</h4>
          <p className="hint">Thêm profile, mở Chrome và đăng nhập Gmail/Ultra một lần — lần sau dùng lại cookie.</p>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Thêm profile đầu tiên
          </button>
        </div>
      ) : null}

      {sortedProfiles.length > 0 ? (
        <div className="pgu-table-wrap">
          <table className="pgu-table">
            <thead>
              <tr>
                <th>Ưu tiên</th>
                <th>Profile</th>
                <th>Gmail Ultra</th>
                <th>Proxy</th>
                <th>Trạng thái</th>
                <th>Kiểm tra cuối</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {sortedProfiles.map((p) => {
                const st = STATUS_META[p.ultraStatus] || STATUS_META.unchecked;
                const isPrio = p.slug === preferredSlug;
                const busy = Boolean(rowBusy && rowBusy.includes(p.slug));
                const menuId = `menu-${p.slug}`;
                return (
                  <tr key={p.slug} className={isPrio ? 'pgu-row-prio' : ''}>
                    <td data-label="Ưu tiên">
                      {isPrio ? <span className="pgu-prio-badge">#1</span> : <span className="hint">—</span>}
                    </td>
                    <td data-label="Profile">
                      <div className="pgu-profile-name">{p.displayName || p.slug}</div>
                      <div className="pgu-profile-slug">{p.slug}</div>
                    </td>
                    <td data-label="Gmail Ultra">
                      {p.ultraGmailLabel ? (
                        <span className="pgu-gmail">{p.ultraGmailLabel}</span>
                      ) : (
                        <span className="hint">Chưa gắn nhãn</span>
                      )}
                    </td>
                    <td data-label="Proxy">
                      <span title={p.proxyUrl || ''}>{proxySummary(p.proxyUrl)}</span>
                    </td>
                    <td data-label="Trạng thái">
                      <span className={`pgu-badge ${st.cls}`}>{st.label}</span>
                    </td>
                    <td data-label="Kiểm tra cuối">{formatDt(p.ultraLastCheckedAt)}</td>
                    <td data-label="Hành động">
                      <div className="pgu-actions pgu-actions--compact">
                        <button type="button" className="pgu-act" disabled={busy} onClick={() => runTestUltra(p.slug)}>
                          Test Ultra
                        </button>
                        <button type="button" className="pgu-act" disabled={busy} onClick={() => runOpenChrome(p)}>
                          Mở Chrome
                        </button>
                        <button type="button" className="pgu-act" disabled={busy} onClick={() => openEdit(p)}>
                          Sửa
                        </button>
                        <button type="button" className="pgu-act" disabled={busy} onClick={() => toggleUltraEnabled(p)}>
                          {p.ultraEnabled ? 'Tạm tắt' : 'Bật lại'}
                        </button>
                        <button type="button" className="pgu-act pgu-act--danger" disabled={busy} onClick={() => runDelete(p)}>
                          Xóa
                        </button>
                        <div className="pgu-menu-wrap">
                          <button
                            type="button"
                            className="pgu-act pgu-act--menu"
                            disabled={busy}
                            aria-expanded={menuOpen === menuId}
                            onClick={() => setMenuOpen((cur) => (cur === menuId ? '' : menuId))}
                            title="Thêm thao tác"
                          >
                            ⋮
                          </button>
                          {menuOpen === menuId ? (
                            <div className="pgu-menu" role="menu">
                              {!isPrio ? (
                                <button type="button" role="menuitem" disabled={videoPrefsBusy} onClick={() => setPriorityOne(p.slug)}>
                                  Đặt ưu tiên #1
                                </button>
                              ) : null}
                              <button type="button" role="menuitem" onClick={() => runDownloadBat(p)}>
                                Tải file .bat (Windows)
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="hint" style={{ marginTop: '0.85rem' }}>
        <strong>Mở Chrome</strong> gọi <strong>VEO3 Launcher</strong> (<code>veo3pro://open-profile</code>) để mở Chrome profile
        riêng — đăng nhập Gmail Ultra trong profile đó. Cần cài launcher một lần trên Windows. File <code>.bat</code> chỉ có trong
        menu ⋮ nếu cần dự phòng.
      </p>

      {toast ? (
        <div className="pgu-toast" role="status">
          {toast}
        </div>
      ) : null}

      {launcherModal ? (
        <div className="pgu-modal-backdrop" role="presentation" onClick={() => !launcherBusy && setLauncherModal(null)}>
          <div
            className="pgu-modal pgu-modal--launcher"
            role="dialog"
            aria-label="Cài VEO3 Launcher"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pgu-modal-head">
              <h3 style={{ margin: 0 }}>VEO3 Launcher</h3>
              <button type="button" className="btn btn-secondary" disabled={launcherBusy} onClick={() => setLauncherModal(null)}>
                Đóng
              </button>
            </div>
            <p style={{ margin: '0.5rem 0 1rem', lineHeight: 1.55 }}>
              Bạn cần cài VEO3 Launcher một lần để mở Chrome trực tiếp.
              <br />
              <span className="hint">
                Giải nén ZIP → chạy <code>install.bat</code> (Run as administrator nếu bị chặn) → bấm «Tôi đã cài, thử lại».
                Có thể chạy <code>test_launch.bat</code> để kiểm tra launcher trước.
              </span>
            </p>
            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" disabled={launcherBusy} onClick={handleLauncherDownload}>
                {launcherBusy ? 'Đang xử lý…' : 'Tải VEO3 Launcher'}
              </button>
              <button type="button" className="btn btn-secondary" disabled={launcherBusy} onClick={handleLauncherRetry}>
                Tôi đã cài, thử lại
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <div className="pgu-modal-backdrop" role="presentation" onClick={() => !formBusy && setFormOpen(false)}>
          <div className="pgu-modal" role="dialog" aria-label={editingSlug ? 'Sửa profile' : 'Thêm profile'} onClick={(e) => e.stopPropagation()}>
            <div className="pgu-modal-head">
              <h3 style={{ margin: 0 }}>{editingSlug ? 'Sửa profile' : 'Thêm profile Gmail Ultra'}</h3>
              <button type="button" className="btn btn-secondary" disabled={formBusy} onClick={() => setFormOpen(false)}>
                Đóng
              </button>
            </div>

            <div className="pgu-form-section">
              <h4>Thông tin Profile</h4>
              <div className="field">
                <label>Tên profile *</label>
                <input
                  className="input"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="VD: gmail-ultra-01"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label>Nhãn Gmail Ultra (tuỳ chọn)</label>
                <input
                  className="input"
                  type="email"
                  value={form.ultraGmailLabel}
                  onChange={(e) => setForm((f) => ({ ...f, ultraGmailLabel: e.target.value }))}
                  placeholder="email@gmail.com"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="pgu-form-section">
              <h4>Cấu hình Chrome</h4>
              <p className="hint" style={{ marginTop: 0 }}>
                Sau khi lưu, bấm <strong>Mở Chrome</strong> → đăng nhập gemini.google.com một lần trong profile đó.
              </p>
              <div className="field">
                <label>Ghi chú (chỉ trên form)</label>
                <input
                  className="input"
                  value={form.chromeNote}
                  onChange={(e) => setForm((f) => ({ ...f, chromeNote: e.target.value }))}
                  placeholder="VD: Gmail Ultra chính"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="pgu-form-section">
              <h4>Proxy riêng</h4>
              <div className="field">
                <label>Proxy URL</label>
                <input
                  className="input"
                  value={form.proxyUrl}
                  onChange={(e) => setForm((f) => ({ ...f, proxyUrl: e.target.value }))}
                  placeholder="http://user:pass@ip:port (tuỳ chọn)"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="pgu-form-section">
              <h4>Quyền sử dụng</h4>
              <p className="hint" style={{ marginTop: 0 }}>
                API key theo profile cấu hình tại tab <strong>API &amp; Nguồn tạo video</strong>. Ultra web dùng quota Gmail trong Chrome.
              </p>
            </div>

            {formErr ? <div className="flow-error">{formErr}</div> : null}

            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
              <button type="button" className="btn btn-primary" disabled={formBusy} onClick={saveForm}>
                {formBusy ? 'Đang lưu…' : 'Lưu profile'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
