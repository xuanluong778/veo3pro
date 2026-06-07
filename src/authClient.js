const API = '/api';

const creds = { credentials: 'include' };

export async function fetchSession() {
  const r = await fetch(`${API}/auth/me`, creds);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Session error');
  return data.user || null;
}

export async function loginRequest(email, password) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...creds,
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Đăng nhập thất bại');
  return data.user;
}

export async function registerRequest(email, password, signupTicket) {
  const r = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...creds,
    body: JSON.stringify({
      email,
      password,
      ...(signupTicket ? { signupTicket } : {}),
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Đăng ký thất bại');
  return data.user;
}

export async function logoutRequest() {
  const r = await fetch(`${API}/auth/logout`, { method: 'POST', ...creds });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Đăng xuất thất bại');
  return data;
}

export async function updateProfileRequest(payload) {
  const r = await fetch(`${API}/auth/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    ...creds,
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Cập nhật hồ sơ thất bại');
  return data.user;
}

export async function changePasswordRequest(currentPassword, newPassword) {
  const r = await fetch(`${API}/auth/password/change`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...creds,
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Đổi mật khẩu thất bại');
  return data.user;
}

export async function resetPasswordWithOtpRequest(email, code, newPassword) {
  const r = await fetch(`${API}/auth/password/reset-with-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...creds,
    body: JSON.stringify({ email, code, newPassword }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Đặt lại mật khẩu thất bại');
  return data.user;
}

export async function fetchGoogleOAuthConfig() {
  const r = await fetch(`${API}/auth/google/config`, creds);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { googleOAuthEnabled: false };
  return data;
}

export async function finishGoogleOAuth(ticket) {
  const r = await fetch(`${API}/auth/google/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...creds,
    body: JSON.stringify({ ticket }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Hoàn tất đăng nhập Google thất bại');
  return data.user;
}

export async function requestOtpEmail(email) {
  const r = await fetch(`${API}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...creds,
    body: JSON.stringify({ email }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const hint = data.error || (r.status ? `Lỗi máy chủ (${r.status}).` : '');
    throw new Error(hint || 'Không gửi được mã OTP');
  }
  return data;
}

/**
 * @returns {Promise<{ kind: 'login'; user: unknown } | { kind: 'needsSignup'; signupTicket: string; email: string; message?: string }>}
 */
export async function verifyOtpLogin(email, code) {
  const r = await fetch(`${API}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...creds,
    body: JSON.stringify({ email, code }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Xác nhận OTP thất bại');
  if (data.needsSignup && data.signupTicket) {
    return {
      kind: 'needsSignup',
      signupTicket: data.signupTicket,
      email: data.email,
      message: data.message,
    };
  }
  return { kind: 'login', user: data.user };
}
