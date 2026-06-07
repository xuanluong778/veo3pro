import { useCallback, useEffect, useState } from 'react';
import {
  changePasswordRequest,
  requestOtpEmail,
  resetPasswordWithOtpRequest,
  updateProfileRequest,
} from '../authClient.js';

function IconUser() {
  return (
    <svg className="account-row-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
      />
    </svg>
  );
}

function IconMail() {
  return (
    <svg className="account-row-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
      />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg className="account-row-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
      />
    </svg>
  );
}

function IconKey() {
  return (
    <svg className="account-row-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.65 10A5.99 5.99 0 007 6c-3.31 0-6 2.69-6 6s2.69 6 6 6a6.06 6.06 0 003.86-1.39L20 21.39 22 19l-7.35-7.35A5.99 5.99 0 0017 10c0-3.31-2.69-6-6-6zm0 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z"
      />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg className="account-row-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
      />
    </svg>
  );
}

function IconPlan() {
  return (
    <svg className="account-row-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

/**
 * @param {{
 *   user: {
 *     id: string,
 *     email: string,
 *     plan: string,
 *     displayName?: string | null,
 *     phone?: string | null,
 *     hasPassword?: boolean,
 *     googleLinked?: boolean,
 *   },
 *   onUserUpdated: () => Promise<void>,
 * }} props
 */
export default function AccountPanel({ user, onUserUpdated }) {
  const [displayNameEdit, setDisplayNameEdit] = useState('');
  const [phoneEdit, setPhoneEdit] = useState('');
  const [contactEmailEdit, setContactEmailEdit] = useState('');
  const [avatarUrlEdit, setAvatarUrlEdit] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  const [changeOpen, setChangeOpen] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [changeErr, setChangeErr] = useState('');
  const [changeBusy, setChangeBusy] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [fgEmail, setFgEmail] = useState('');
  const [fgCode, setFgCode] = useState('');
  const [fgNew, setFgNew] = useState('');
  const [fgNew2, setFgNew2] = useState('');
  const [fgErr, setFgErr] = useState('');
  const [fgBusy, setFgBusy] = useState(false);
  const [fgOtpSent, setFgOtpSent] = useState(false);

  useEffect(() => {
    setDisplayNameEdit(user?.displayName || '');
    setPhoneEdit(user?.phone || '');
    setContactEmailEdit(user?.contactEmail || '');
    setAvatarUrlEdit(user?.avatarUrl || '');
    setFgEmail(user?.email || '');
  }, [user?.id, user?.displayName, user?.phone, user?.contactEmail, user?.avatarUrl, user?.email]);

  const derivedName =
    (user?.displayName && String(user.displayName).trim()) ||
    (user?.email && user.email.includes('@') ? user.email.split('@')[0] : '') ||
    'Thành viên';

  const planLabel = String(user?.plan || 'free').toLowerCase() === 'pro' ? 'Pro' : 'Free';
  const hasPw = Boolean(user?.hasPassword);

  const saveProfile = useCallback(async () => {
    setProfileMsg('');
    setProfileBusy(true);
    try {
      await updateProfileRequest({
        displayName: displayNameEdit.trim() || null,
        phone: phoneEdit.trim() || null,
        contactEmail: contactEmailEdit.trim() || null,
        avatarUrl: avatarUrlEdit.trim() || null,
      });
      setProfileMsg('Đã lưu hồ sơ.');
      await onUserUpdated();
    } catch (e) {
      setProfileMsg(e.message || 'Lỗi lưu hồ sơ');
    } finally {
      setProfileBusy(false);
    }
  }, [displayNameEdit, phoneEdit, contactEmailEdit, avatarUrlEdit, onUserUpdated]);

  const submitChangePw = async () => {
    setChangeErr('');
    if (newPw !== newPw2) {
      setChangeErr('Mật khẩu mới nhập lại không khớp.');
      return;
    }
    setChangeBusy(true);
    try {
      await changePasswordRequest(curPw, newPw);
      setChangeOpen(false);
      setCurPw('');
      setNewPw('');
      setNewPw2('');
      await onUserUpdated();
    } catch (e) {
      setChangeErr(e.message || 'Lỗi');
    } finally {
      setChangeBusy(false);
    }
  };

  const sendForgotOtp = async () => {
    setFgErr('');
    setFgBusy(true);
    try {
      await requestOtpEmail(fgEmail.trim());
      setFgOtpSent(true);
    } catch (e) {
      setFgErr(e.message || 'Không gửi được OTP');
    } finally {
      setFgBusy(false);
    }
  };

  const submitForgotReset = async () => {
    setFgErr('');
    if (fgNew !== fgNew2) {
      setFgErr('Mật khẩu mới nhập lại không khớp.');
      return;
    }
    setFgBusy(true);
    try {
      await resetPasswordWithOtpRequest(fgEmail.trim(), fgCode.replace(/\s/g, ''), fgNew);
      setForgotOpen(false);
      setFgCode('');
      setFgNew('');
      setFgNew2('');
      setFgOtpSent(false);
      await onUserUpdated();
    } catch (e) {
      setFgErr(e.message || 'Lỗi');
    } finally {
      setFgBusy(false);
    }
  };

  return (
    <div className="account-panel">
      <div className="account-card">
        <div className="account-avatar" aria-hidden="true">
          {user?.avatarUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img
              src={user.avatarUrl}
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
              onError={(e) => {
                try {
                  e.currentTarget.style.display = 'none';
                } catch {
                  /* ignore */
                }
              }}
            />
          ) : (
            <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>
              {derivedName?.trim()?.[0]?.toUpperCase?.() || 'U'}
            </span>
          )}
        </div>
        <h2 className="account-title">{derivedName}</h2>
        <span className="account-status-badge">
          <span aria-hidden="true">✓</span> Đã kích hoạt
        </span>

        <ul className="account-rows">
          <li className="account-row">
            <span className="account-row-icon" aria-hidden="true">
              <IconUser />
            </span>
            <div className="account-row-body">
              <span className="account-row-label">Username</span>
              <span className="account-row-value">{derivedName}</span>
            </div>
          </li>
          <li className="account-row">
            <span className="account-row-icon" aria-hidden="true">
              <IconMail />
            </span>
            <div className="account-row-body">
              <span className="account-row-label">Email</span>
              <span className="account-row-value">{user?.email}</span>
            </div>
          </li>
          <li className="account-row">
            <span className="account-row-icon" aria-hidden="true">
              <IconPhone />
            </span>
            <div className="account-row-body">
              <span className="account-row-label">SĐT</span>
              <span className="account-row-value">{user?.phone?.trim() ? user.phone : 'Chưa có số — thêm bên dưới'}</span>
            </div>
          </li>
          <li className="account-row">
            <span className="account-row-icon" aria-hidden="true">
              <IconPlan />
            </span>
            <div className="account-row-body">
              <span className="account-row-label">Gói dịch vụ</span>
              <span className={`account-row-value account-plan-inline ${planLabel === 'Pro' ? 'is-pro' : 'is-free'}`}>
                {planLabel}
              </span>
            </div>
          </li>
          <li className="account-row">
            <span className="account-row-icon" aria-hidden="true">
              <IconGlobe />
            </span>
            <div className="account-row-body">
              <span className="account-row-label">Ngôn ngữ</span>
              <span className="account-row-value">Tiếng Việt</span>
            </div>
          </li>
          <li className="account-row account-row--password">
            <span className="account-row-icon" aria-hidden="true">
              <IconKey />
            </span>
            <div className="account-row-body">
              <span className="account-row-label">Mật khẩu</span>
              <div className="account-password-row">
                <span className="account-row-value">{hasPw ? '••••••' : '— (Google / chưa đặt)'}</span>
                <div className="account-password-actions">
                  <button type="button" className="btn btn-secondary account-pw-btn" onClick={() => setForgotOpen(true)}>
                    Quên mật khẩu
                  </button>
                  {hasPw ? (
                    <button type="button" className="btn btn-primary account-pw-btn" onClick={() => setChangeOpen(true)}>
                      Đổi mật khẩu
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary account-pw-btn" onClick={() => setForgotOpen(true)}>
                      Đặt mật khẩu (OTP)
                    </button>
                  )}
                </div>
              </div>
              {user?.googleLinked && (
                <p className="account-row-hint">Tài khoản đã liên kết Google. Có thể đặt mật khẩu qua OTP để đăng nhập cả hai cách.</p>
              )}
            </div>
          </li>
        </ul>

        <div className="account-profile-edit">
          <h3 className="account-subheading">Cập nhật hồ sơ</h3>
          <div className="field">
            <label>Avatar (link ảnh)</label>
            <input
              className="input account-input-dark"
              value={avatarUrlEdit}
              onChange={(e) => setAvatarUrlEdit(e.target.value)}
              placeholder="Dán link ảnh (https://...)"
              autoComplete="off"
            />
            <div className="hint">Hỗ trợ link ảnh công khai. Nếu link lỗi sẽ tự ẩn.</div>
          </div>
          <div className="field">
            <label>Tên hiển thị</label>
            <input
              className="input account-input-dark"
              value={displayNameEdit}
              onChange={(e) => setDisplayNameEdit(e.target.value)}
              placeholder="VD: Lưu Xuân Lượng"
            />
          </div>
          <div className="field">
            <label>Số điện thoại</label>
            <input
              className="input account-input-dark"
              value={phoneEdit}
              onChange={(e) => setPhoneEdit(e.target.value)}
              placeholder="Thêm SĐT"
            />
          </div>
          <div className="field">
            <label>Gmail liên hệ</label>
            <input
              className="input account-input-dark"
              value={contactEmailEdit}
              onChange={(e) => setContactEmailEdit(e.target.value)}
              placeholder="VD: yourname@gmail.com"
              autoComplete="off"
            />
            <div className="hint">Email liên hệ (khác email đăng nhập nếu bạn muốn).</div>
          </div>
          <div className="account-profile-actions">
            <button type="button" className="btn btn-primary" disabled={profileBusy} onClick={saveProfile}>
              {profileBusy ? 'Đang lưu…' : 'Lưu hồ sơ'}
            </button>
            {profileMsg && <span className="account-inline-msg">{profileMsg}</span>}
          </div>
        </div>
      </div>

      {changeOpen && (
        <div className="account-modal-backdrop" role="presentation" onClick={() => !changeBusy && setChangeOpen(false)}>
          <div className="account-modal" role="dialog" aria-labelledby="chg-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="chg-title" className="account-modal-title">
              Đổi mật khẩu
            </h3>
            <div className="field">
              <label>Mật khẩu hiện tại</label>
              <input type="password" className="input account-input-dark" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="field">
              <label>Mật khẩu mới</label>
              <input type="password" className="input account-input-dark" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="field">
              <label>Nhập lại mật khẩu mới</label>
              <input type="password" className="input account-input-dark" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} autoComplete="new-password" />
            </div>
            {changeErr && <p className="flow-error">{changeErr}</p>}
            <div className="account-modal-actions">
              <button type="button" className="btn btn-secondary" disabled={changeBusy} onClick={() => setChangeOpen(false)}>
                Hủy
              </button>
              <button type="button" className="btn btn-primary" disabled={changeBusy} onClick={submitChangePw}>
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {forgotOpen && (
        <div className="account-modal-backdrop" role="presentation" onClick={() => !fgBusy && setForgotOpen(false)}>
          <div className="account-modal account-modal--wide" role="dialog" aria-labelledby="fg-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="fg-title" className="account-modal-title">
              Quên mật khẩu / đặt bằng OTP
            </h3>
            <p className="hint">Nhập email nhận mã (cần SMTP trên server). Sau đó nhập OTP và mật khẩu mới.</p>
            <div className="field">
              <label>Email</label>
              <input className="input account-input-dark" value={fgEmail} onChange={(e) => setFgEmail(e.target.value)} />
            </div>
            <div className="account-modal-actions">
              <button type="button" className="btn btn-secondary" disabled={fgBusy} onClick={sendForgotOtp}>
                Gửi mã OTP
              </button>
              {fgOtpSent && <span className="account-inline-msg">Đã gửi (kiểm tra hộp thư).</span>}
            </div>
            <div className="field">
              <label>Mã OTP (6 số)</label>
              <input className="input account-input-dark" value={fgCode} onChange={(e) => setFgCode(e.target.value)} inputMode="numeric" />
            </div>
            <div className="field">
              <label>Mật khẩu mới</label>
              <input type="password" className="input account-input-dark" value={fgNew} onChange={(e) => setFgNew(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="field">
              <label>Nhập lại mật khẩu mới</label>
              <input type="password" className="input account-input-dark" value={fgNew2} onChange={(e) => setFgNew2(e.target.value)} autoComplete="new-password" />
            </div>
            {fgErr && <p className="flow-error">{fgErr}</p>}
            <div className="account-modal-actions">
              <button type="button" className="btn btn-secondary" disabled={fgBusy} onClick={() => setForgotOpen(false)}>
                Đóng
              </button>
              <button type="button" className="btn btn-primary" disabled={fgBusy} onClick={submitForgotReset}>
                Đặt lại mật khẩu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
