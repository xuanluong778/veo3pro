import { useEffect, useState } from 'react';
import {
  loginRequest,
  registerRequest,
  fetchGoogleOAuthConfig,
  finishGoogleOAuth,
  requestOtpEmail,
  verifyOtpLogin,
} from '../authClient.js';

function mapOAuthErr(code) {
  switch (code) {
    case 'access_denied':
      return 'Bạn đã hủy đăng nhập Google.';
    case 'invalid_state':
      return 'Phiên OAuth không hợp lệ — thử đăng nhập Google lại.';
    default:
      return 'Đăng nhập Google thất bại. Thử lại hoặc dùng email/mật khẩu.';
  }
}

function replaceQuery(mutator) {
  const params = new URLSearchParams(window.location.search);
  mutator(params);
  const q = params.toString();
  window.history.replaceState({}, '', q ? `${window.location.pathname}?${q}` : window.location.pathname);
}

export default function AuthGate({ onLoggedIn }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** null = đang tải config, true/false = đã biết server có bật Google OAuth hay không */
  const [googleReady, setGoogleReady] = useState(null);
  const [otpHint, setOtpHint] = useState('');
  const [otpCode, setOtpCode] = useState('');
  /** Sau OTP đúng (chưa có tài khoản): ticket + email khớp để hoàn tất «Tạo tài khoản». */
  const [signupGate, setSignupGate] = useState(null);

  useEffect(() => {
    if (!signupGate) return;
    if (email.trim().toLowerCase() !== signupGate.email) setSignupGate(null);
  }, [email, signupGate]);

  useEffect(() => {
    fetchGoogleOAuthConfig()
      .then((c) => setGoogleReady(Boolean(c.googleOAuthEnabled)))
      .catch(() => setGoogleReady(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get('oauth_ticket');
    const authErr = params.get('auth_error');

    if (authErr) {
      setError(mapOAuthErr(authErr));
      replaceQuery((p) => p.delete('auth_error'));
    }

    if (!ticket) return undefined;

    setBusy(true);
    setError('');
    finishGoogleOAuth(ticket)
      .then(() => {
        replaceQuery((p) => p.delete('oauth_ticket'));
        onLoggedIn();
      })
      .catch((err) => {
        setError(err.message || 'Google OAuth failed');
        replaceQuery((p) => p.delete('oauth_ticket'));
      })
      .finally(() => setBusy(false));

    return undefined;
  }, [onLoggedIn]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await loginRequest(email.trim(), password);
      } else {
        await registerRequest(email.trim(), password, signupGate?.ticket);
      }
      setSignupGate(null);
      onLoggedIn();
    } catch (err) {
      setError(err.message || 'Lỗi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-gate-shell">
      <div className="panel" style={{ width: 'min(420px, 100%)', maxWidth: '100%' }}>
        <h2 style={{ marginTop: 0 }}>Đăng nhập Veo3 Pro</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Bạn cần tài khoản để gọi Flow và Veo. Cookie phiên đăng nhập được lưu an toàn (httpOnly).
        </p>

        <div className="panel-tabs" style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            className={`tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setOtpHint('');
              setOtpCode('');
              setSignupGate(null);
            }}
          >
            Đăng nhập
          </button>
          <button type="button" className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>
            Đăng ký
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Mật khẩu {mode === 'register' && '(tối thiểu 8 ký tự)'}</label>
            <input
              className="input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'register' ? 8 : undefined}
            />
          </div>
          {error && (
            <div className="hint" style={{ color: 'var(--danger, #c0392b)', marginBottom: '0.75rem' }}>
              {error}
            </div>
          )}

          <div className="auth-gate-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </button>

            {googleReady === null && (
              <button type="button" className="btn btn-secondary" disabled>
                Đang kiểm tra Google…
              </button>
            )}
            {googleReady === true && (
              <a href="/api/auth/google" className="btn btn-secondary">
                Đăng nhập với Google
              </a>
            )}
            {googleReady === false && (
              <button type="button" className="btn btn-secondary" style={{ opacity: 0.72 }} disabled title="Cấu hình GOOGLE_CLIENT_ID trong .env">
                Đăng nhập với Google
              </button>
            )}
          </div>

          {mode === 'register' && (
            <div className="auth-gate-otp-register">
              <div className="auth-gate-otp-row">
                <button
                  type="button"
                  className="auth-otp-link"
                  disabled={busy}
                  onClick={async () => {
                    setOtpHint('');
                    setSignupGate(null);
                    if (!email.trim()) {
                      setError('Nhập email ở trên trước khi nhận mã OTP.');
                      return;
                    }
                    setError('');
                    setBusy(true);
                    try {
                      const data = await requestOtpEmail(email.trim());
                      setOtpHint(data.message || 'Đã xử lý yêu cầu OTP.');
                    } catch (err) {
                      setError(err.message || 'Không gửi được mã OTP.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Bấm nhận mã OTP
                </button>
                {otpHint && (
                  <p className="hint" style={{ marginTop: '0.45rem', marginBottom: 0 }}>
                    {otpHint}
                  </p>
                )}
              </div>

              <div className="auth-gate-otp-field field">
                <label htmlFor="auth-otp-input">Mã OTP</label>
                <input
                  id="auth-otp-input"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6 chữ số"
                  maxLength={8}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: '0.6rem', width: '100%' }}
                  disabled={busy || otpCode.length !== 6}
                  onClick={async () => {
                    setError('');
                    if (!email.trim()) {
                      setError('Nhập email trước.');
                      return;
                    }
                    setBusy(true);
                    try {
                      const result = await verifyOtpLogin(email.trim(), otpCode);
                      setOtpCode('');
                      if (result.kind === 'login') {
                        setSignupGate(null);
                        onLoggedIn();
                      } else {
                        setSignupGate({ ticket: result.signupTicket, email: result.email.toLowerCase().trim() });
                        setOtpHint(result.message || 'Đã xác minh email. Đặt mật khẩu (tối thiểu 8 ký tự) và nhấn Tạo tài khoản.');
                      }
                    } catch (err) {
                      setError(err.message || 'OTP không hợp lệ.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Đăng nhập bằng OTP
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
