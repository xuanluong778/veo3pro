export const FALLBACK_OPTIONS = [
  {
    id: 'ask',
    label: 'Hỏi trước khi dùng credit hệ thống',
    hint: 'Ultra thất bại → hỏi bạn trước khi dùng API key tài khoản hoặc .env.',
  },
  {
    id: 'auto',
    label: 'Tự động dùng credit hệ thống',
    hint: 'Ultra thất bại → tự chuyển sang API key / .env theo thứ tự ưu tiên.',
  },
  {
    id: 'never',
    label: 'Không bao giờ dùng credit hệ thống',
    hint: 'Ultra thất bại → dừng, không fallback API/.env.',
  },
];

export const VIDEO_SOURCE_PRIORITY = [
  { step: 1, label: 'Gmail Ultra bên ngoài', desc: 'Chrome profile đã đăng nhập — không trừ credit hệ thống khi thành công.' },
  { step: 2, label: 'API key theo Chrome profile', desc: 'Key Gemini/OpenAI/Grok lưu theo profile đang chọn.' },
  { step: 3, label: 'API key tài khoản app', desc: 'Key lưu theo user đăng nhập (user_api_keys).' },
  { step: 4, label: 'API key .env', desc: 'GEMINI_API_KEY / OPENAI_API_KEY trên server — dự phòng cuối.' },
];

/**
 * @param {{
 *   profiles: Array<Record<string, unknown>>,
 *   videoPrefs: { preferUltraProfile?: boolean, preferredProfileSlug?: string, creditFallbackMode?: string },
 *   profilesBusy?: boolean,
 *   hasEnvFallback?: boolean,
 *   hasAccountApiKey?: boolean,
 * }} input
 */
export function computeSettingsOverview(input) {
  const profiles = Array.isArray(input.profiles) ? input.profiles : [];
  const preferUltra = Boolean(input.videoPrefs?.preferUltraProfile);
  const preferredSlug = String(input.videoPrefs?.preferredProfileSlug || '').trim();
  const fallbackMode = String(input.videoPrefs?.creditFallbackMode || 'ask');

  const ultraReadyCount = profiles.filter((p) => p.ultraEnabled && p.ultraStatus === 'ready').length;

  let videoSource = 'API key (profile → tài khoản → .env)';
  if (preferUltra) {
    if (preferredSlug) {
      const p = profiles.find((x) => x.slug === preferredSlug);
      videoSource = `Gmail Ultra · ${p?.displayName || preferredSlug}`;
    } else {
      videoSource = 'Gmail Ultra (chưa chọn profile #1)';
    }
  }

  const apiFallbackParts = [];
  if (input.hasAccountApiKey) apiFallbackParts.push('key tài khoản');
  if (input.hasEnvFallback) apiFallbackParts.push('.env');
  let apiFallback =
    apiFallbackParts.length > 0 ? apiFallbackParts.join(' + ') : 'Chưa có key hệ thống dự phòng';
  if (!preferUltra) apiFallback = 'Đang dùng API trực tiếp (không ưu tiên Ultra)';

  const fallbackLabels = {
    ask: 'Hỏi trước khi dùng credit',
    auto: 'Tự động dùng credit',
    never: 'Không dùng credit hệ thống',
  };

  return {
    videoSource,
    ultraReadyLabel: input.profilesBusy ? '…' : `${ultraReadyCount} / ${profiles.length} sẵn sàng`,
    apiFallback,
    fallbackLabel: fallbackLabels[fallbackMode] || fallbackLabels.ask,
    preferUltra,
  };
}
