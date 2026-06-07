import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  checkHealth,
  startGeneration,
  pollOperation,
  extractVideoUri,
  downloadVideoBlob,
  fileToBase64,
} from './veoClient.js';
import AutoFlowPanel from './components/AutoFlowPanel.jsx';
import AccountPanel from './components/AccountPanel.jsx';
import ServicePlansPanel from './components/ServicePlansPanel.jsx';
import AuthGate from './components/AuthGate.jsx';
import PromptStudioPanel from './components/PromptStudioPanel.jsx';
import VideoAnalysisModule from './components/VideoAnalysisModule.jsx';
import YoutubeSeoPanel from './components/YoutubeSeoPanel.jsx';
import { CharactersMapPanel, TextToAudioPanel, VideoSplitMergePanel } from './components/ExtendedWorkflowPanels.jsx';
import { VoiceLibraryPanel } from './components/VoiceLibraryPanel.jsx';
import VideoMarketingPanel from './components/VideoMarketingPanel.jsx';
import TextVideoResultsPanel from './components/TextVideoResultsPanel.jsx';
import { fetchSession, logoutRequest } from './authClient.js';
import { fetchUserKeyStatus } from './userKeysApi.js';
import {
  clearChromeProfileKeys,
  deleteChromePortableProfile,
  fetchChromePortableProfiles,
  fetchChromeProfileKeyStatus,
  fetchChromeProfileRevealKeys,
  openChromePortableProfile,
  proxyIpCheck,
  saveChromePortableProfile,
  saveChromeProfileKeys,
  saveChromeProfileApiFlags,
  patchChromeProfileKeys,
} from './toolsClient.js';
import { fetchVideoPrefs, saveVideoPrefs } from './videoPrefsClient.js';
import { fetchTextVideoCast, fetchTextVideoStructuredScenes } from './promptStudioClient.js';
import { ultraCreateVideo, ultraGetJob, ultraDownloadJobBlob } from './ultraVideoClient.js';
import { VBEE_VOICE_CATALOG } from './data/vbeeVoiceCatalog.js';
import { COMMUNITY_TRENDING, COMMUNITY_FEATURED, COMMUNITY_NEWEST } from './data/communityVoiceCatalog.js';

const MODELS = [
  { id: 'veo-3.1-generate-preview', label: 'Veo 3.1 — chất lượng cao' },
  { id: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast' },
  { id: 'veo-3.1-lite-generate-preview', label: 'Veo 3.1 Lite (rẻ hơn, không có 4K)' },
];

const RESOLUTIONS = [
  { id: '720p', label: '720p' },
  { id: '1080p', label: '1080p (Pro / điện ảnh)' },
  { id: '4k', label: '4K (không áp dụng Lite)' },
];

const ASPECTS = [
  { id: '16:9', label: 'Ngang 16:9 (điện ảnh)' },
  { id: '9:16', label: 'Dọc 9:16 (shorts)' },
];

const LANGUAGES = [
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'en', label: 'English' },
  { id: 'vi-en', label: 'Việt + Anh' },
];

const QUALITY_PRESETS = [
  { id: 'standard', label: 'Tiêu chuẩn (720p)', resolution: '720p' },
  { id: 'high', label: 'Cao (1080p)', resolution: '1080p' },
  { id: 'ultra', label: 'Ultra (4K)', resolution: '4k' },
];

/** Phong cách hình ảnh / thể loại video (Text → Video). */
const VIDEO_STYLE_PRESETS = [
  { id: 'tu-dong-nhan-dien', label: 'Tự động nhận diện' },
  { id: 'hoat-hinh-2d', label: 'Hoạt hình 2D' },
  { id: 'hoat-hinh-3d', label: 'Hoạt hình 3D' },
  { id: 'cgi-3d-chan-thuc', label: 'CGI 3D chân thực' },
  { id: 'hoat-hinh-pixar', label: 'Hoạt hình kiểu Pixar' },
  { id: 'phong-cach-co-dai', label: 'Phong cách cổ đại' },
  { id: 'anime-nhat-ban', label: 'Anime Nhật Bản' },
  { id: 'cctv-footage', label: 'Camera CCTV / footage tìm thấy' },
  { id: 'baroque-thien-the', label: 'Phong cách Baroque thiên thể' },
  { id: 'phim-tai-lieu', label: 'Phim tài liệu' },
  { id: 'nguoi-that-chan-thuc', label: 'Người thật chân thực' },
  { id: 'dien-anh-nguoi-that', label: 'Điện ảnh người thật' },
  { id: 'qc-thoi-trang', label: 'Quảng cáo thời trang' },
  { id: 'vlog-doi-thuc', label: 'Vlog đời thực' },
  { id: 'phong-su-tin-tuc', label: 'Phóng sự tin tức' },
  { id: 'video-dien-thoai', label: 'Video quay điện thoại' },
  { id: 'dien-anh-dslr', label: 'Điện ảnh DSLR' },
  { id: 'sieu-thuc', label: 'Siêu thực' },
  { id: 'qc-studio', label: 'Quảng cáo studio' },
  { id: 'video-phong-van', label: 'Video phỏng vấn' },
  { id: 'mv-ca-nhac-nguoi-that', label: 'MV ca nhạc người thật' },
  { id: 'du-lich-doi-thuc', label: 'Du lịch đời thực' },
  { id: 'cyberpunk-tuong-lai', label: 'Cyberpunk tương lai' },
  { id: 'fantasy-than-thoai', label: 'Fantasy thần thoại' },
  { id: 'khoa-hoc-vien-tuong', label: 'Khoa học viễn tưởng' },
  { id: 'hoat-hinh-dat-nan', label: 'Hoạt hình đất nặn' },
  { id: 'retro-vhs', label: 'Retro / VHS cổ điển' },
  { id: 'game-cinematic', label: 'Game cinematic' },
  { id: 'phong-cach-netflix', label: 'Phong cách Netflix' },
  { id: 'phim-hanh-dong-hollywood', label: 'Phim hành động Hollywood' },
  { id: 'anime-dien-anh', label: 'Anime điện ảnh' },
  { id: 'nghe-thuat-sieu-thuc', label: 'Nghệ thuật siêu thực' },
  { id: 'pov', label: 'Góc nhìn POV' },
  { id: 'video-drone', label: 'Video drone' },
  { id: 'slow-motion-dien-anh', label: 'Slow motion điện ảnh' },
  { id: 'timelapse', label: 'Timelapse' },
  { id: 'low-poly', label: 'Low poly' },
  { id: 'voxel-art', label: 'Voxel art' },
  { id: 'tranh-mau-nuoc', label: 'Tranh màu nước' },
  { id: 'son-dau-nghe-thuat', label: 'Sơn dầu nghệ thuật' },
];

/** Ghi chú phân cảnh nối vào prompt gửi Veo (đa cảnh). */
function textVideoSceneNote(countsAsMultiScene, sceneIdx, textSceneCount) {
  if (!countsAsMultiScene) return '';
  return `\n\n---\nPhân cảnh ${sceneIdx}/${textSceneCount} (clip ~8 giây; cùng một câu chuyện). Mô tả cụ thể chuyển động và hình ảnh chỉ cho đoạn này, thống nhất với prompt tổng ở trên.`;
}

function wrapPromptWithVideoStyle(textTrim, vStyle) {
  const t = String(textTrim || '').trim();
  if (!t) return '';
  if (vStyle.id === 'tu-dong-nhan-dien') return t;
  return `[Phong cách video: ${vStyle.label}]\n${t}`;
}

/** Kiểu giọng đọc (lựa chọn UI; có thể nối lại Web Speech sau). */
const TTS_VOICE_PRESETS = [
  { id: 'nu-tre-nang-luong', label: 'Nữ trẻ năng lượng' },
  { id: 'nam-tram-uy-tin', label: 'Nam trầm uy tín' },
  { id: 'ke-chuyen-cam-xuc', label: 'Kể chuyện cảm xúc' },
  { id: 'ban-hang-cta', label: 'Bán hàng / CTA' },
  { id: 'giai-tri-hai-huoc', label: 'Giải trí hài hước' },
  { id: 'podcast-chill', label: 'Podcast / chill' },
  { id: 'nu-truong-thanh', label: 'Nữ trưởng thành' },
  { id: 'nam-trung-tinh', label: 'Nam trung tính' },
];

const VEO3PRO_VOICE_CODE = 'veo3pro_voice_veo3pro_code';
const VEO3PRO_VOICE_NAME = 'veo3pro_voice_veo3pro_name';
const COMMUNITY_VOICE_CODE = 'veo3pro_voice_community_code';
const COMMUNITY_VOICE_NAME = 'veo3pro_voice_community_name';
const ACTIVE_VOICE_SOURCE = 'veo3pro_voice_active_source';
function readVoiceLibraryPick() {
  try {
    const active = String(localStorage.getItem(ACTIVE_VOICE_SOURCE) || '').trim();
    const vbeeCode = localStorage.getItem(VEO3PRO_VOICE_CODE) || '';
    const vbeeName = localStorage.getItem(VEO3PRO_VOICE_NAME) || '';
    const commCode = localStorage.getItem(COMMUNITY_VOICE_CODE) || '';
    const commName = localStorage.getItem(COMMUNITY_VOICE_NAME) || '';

    // Respect last-selected source so community picks aren't overridden by prior vbee picks.
    if (active === 'community' && commCode) return { source: 'community', code: commCode, name: commName || commCode };
    if (active === 'vbee' && vbeeCode) return { source: 'vbee', code: vbeeCode, name: vbeeName || vbeeCode };

    if (vbeeCode) return { source: 'vbee', code: vbeeCode, name: vbeeName || vbeeCode };
    if (commCode) return { source: 'community', code: commCode, name: commName || commCode };
  } catch {
    /* ignore */
  }
  return { source: '', code: '', name: '' };
}

function collectVoiceOptions(tab, q) {
  const qt = String(q || '').trim().toLowerCase();
  const base =
    tab === 'community'
      ? [...COMMUNITY_TRENDING, ...COMMUNITY_FEATURED, ...COMMUNITY_NEWEST]
      : [...VBEE_VOICE_CATALOG];
  const uniq = new Map();
  for (const v of base) {
    if (!v?.voiceCode) continue;
    const key = v.voiceCode;
    if (!uniq.has(key)) uniq.set(key, v);
  }
  let list = Array.from(uniq.values());
  if (qt) {
    list = list.filter((v) => {
      const name = String(v.name || '').toLowerCase();
      const code = String(v.voiceCode || '').toLowerCase();
      const desc = String(v.description || '').toLowerCase();
      return name.includes(qt) || code.includes(qt) || desc.includes(qt);
    });
  }
  list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
  return list;
}

const VIDEO_DB_NAME = 'veo3pro_media';
const VIDEO_DB_VERSION = 1;
const VIDEO_STORE = 'videos';

function openVideoDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VIDEO_DB_NAME, VIDEO_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        const store = db.createObjectStore(VIDEO_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPutVideo(record) {
  const db = await openVideoDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readwrite');
    tx.objectStore(VIDEO_STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetVideo(id) {
  const db = await openVideoDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readonly');
    const req = tx.objectStore(VIDEO_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAllVideos() {
  const db = await openVideoDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readonly');
    const req = tx.objectStore(VIDEO_STORE).getAll();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error);
  });
}

async function idbDeleteVideo(id) {
  const db = await openVideoDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, 'readwrite');
    tx.objectStore(VIDEO_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/** Nút <button> chỉ được chứa phrasing content — không dùng <div> bên trong. */
function normalizeSessionUser(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const emailRaw =
    (typeof raw.email === 'string' && raw.email) ||
    (typeof raw.userEmail === 'string' && raw.userEmail) ||
    (typeof raw.user_email === 'string' && raw.user_email) ||
    '';
  const planRaw =
    (typeof raw.plan === 'string' && raw.plan.trim()) ||
    (typeof raw.subscription_plan === 'string' && raw.subscription_plan.trim()) ||
    'free';
  return {
    id: raw.id,
    email: String(emailRaw).toLowerCase().trim(),
    plan: planRaw,
    createdAt: raw.createdAt ?? raw.created_at,
    displayName:
      typeof raw.displayName === 'string' && raw.displayName.trim()
        ? raw.displayName.trim()
        : typeof raw.display_name === 'string' && raw.display_name.trim()
          ? String(raw.display_name).trim()
          : null,
    phone:
      typeof raw.phone === 'string' && raw.phone.trim()
        ? raw.phone.trim()
        : typeof raw.phone_number === 'string' && raw.phone_number.trim()
          ? String(raw.phone_number).trim()
          : null,
    hasPassword: Boolean(raw.hasPassword ?? raw.has_password),
    googleLinked: Boolean(raw.googleLinked ?? raw.google_linked),
  };
}

const NAV_STORAGE_KEY = 'veo3pro_app_nav_v1';
/** Các màn dùng classic-bottom-bar: cần danh sách profile cho dropdown Profile API */
const CLASSIC_PANEL_SECTIONS = new Set(['text-video', 'image-video', 'ingredients', 'auto-flow', 'video-split-merge']);

/** Text → Video: số phân cảnh tối đa (gõ tay + mũi tên số). Mỗi cảnh ~8s. */
const TEXT_VIDEO_SCENE_COUNT_MAX = 30;

function normalizeStoredTab(section, tab) {
  const t = typeof tab === 'string' ? tab : 'form';
  if (section === 'text-video') {
    return t === 'logs' ? 'logs' : 'form';
  }
  return t === 'logs' ? 'logs' : 'form';
}
const VALID_SECTIONS = new Set([
  'prompt-studio',
  'text-video',
  'image-video',
  'ingredients',
  'auto-flow',
  'video-marketing',
  'video-analysis',
  'youtube-seo',
  'characters-map',
  'text-to-audio',
  'voice-library',
  'video-split-merge',
  'ecosystem',
  'service-plans',
  'account',
  'settings',
]);

function readHashNav() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) return null;
    const p = new URLSearchParams(raw);
    let s = p.get('s');
    const tRaw = p.get('t') ?? 'form';
    if (s === 'ai-image-prompts') s = 'auto-flow';
    if (s && VALID_SECTIONS.has(s)) {
      return { section: s, tab: normalizeStoredTab(s, tRaw) };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readStoredNav() {
  const fromHash = readHashNav();
  if (fromHash) return fromHash;

  let raw = null;
  try {
    raw = sessionStorage.getItem(NAV_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (!raw) {
    try {
      raw = localStorage.getItem(NAV_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  if (!raw) return { section: 'text-video', tab: 'form' };
  try {
    const j = JSON.parse(raw);
    let sec = j.section === 'ai-image-prompts' ? 'auto-flow' : j.section;
    const section = typeof sec === 'string' && VALID_SECTIONS.has(sec) ? sec : 'text-video';
    const tab = normalizeStoredTab(section, j.tab);
    return { section, tab };
  } catch {
    return { section: 'text-video', tab: 'form' };
  }
}

function writeNavState(section, tab) {
  const payload = JSON.stringify({ section, tab });
  try {
    sessionStorage.setItem(NAV_STORAGE_KEY, payload);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(NAV_STORAGE_KEY, payload);
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const p = new URLSearchParams();
      p.set('s', section);
      p.set('t', tab);
      const base = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, '', `${base}#${p.toString()}`);
    }
  } catch {
    /* ignore */
  }
}

export default function App() {
  const navBoot = useMemo(() => readStoredNav(), []);
  const [section, setSection] = useState(navBoot.section);
  const [tab, setTab] = useState(navBoot.tab);
  const navLiveRef = useRef({ section: navBoot.section, tab: navBoot.tab });
  navLiveRef.current = { section, tab };
  const [health, setHealth] = useState({ ok: false, hasApiKey: false });
  const [sessionUser, setSessionUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const u = await fetchSession();
      setSessionUser(u ? normalizeSessionUser(u) : null);
    } catch {
      setSessionUser(null);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await logoutRequest();
      setSessionUser(null);
    } catch (e) {
      window.alert(e.message || 'Đăng xuất thất bại');
    }
  }, []);

  const [model, setModel] = useState(MODELS[0].id);
  const [resolution, setResolution] = useState('1080p');
  const [qualityPreset, setQualityPreset] = useState('high');
  const [language, setLanguage] = useState('vi');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [prompt, setPrompt] = useState('');
  const [startFile, setStartFile] = useState(null);
  const [lastFile, setLastFile] = useState(null);

  const [refFiles, setRefFiles] = useState([null, null, null]);

  const [busy, setBusy] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [runError, setRunError] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [logs, setLogs] = useState('');
  const [videoUrl, setVideoUrl] = useState(null);
  const [lastOperation, setLastOperation] = useState('');
  const [lastApiSourceLabel, setLastApiSourceLabel] = useState('');
  const [outputDir, setOutputDir] = useState('C:\\Users\\Public\\Videos\\Veo3Output');
  const [imageOutputDir, setImageOutputDir] = useState('C:\\Users\\Public\\Pictures\\Veo3Output');
  const [savedVideos, setSavedVideos] = useState([]);
  const [activePreview, setActivePreview] = useState(null);
  const [sidebarAccountOpen, setSidebarAccountOpen] = useState(false);
  const [ttsStyleId, setTtsStyleId] = useState(TTS_VOICE_PRESETS[0].id);
  const [voiceLibraryPick, setVoiceLibraryPick] = useState(() => readVoiceLibraryPick());
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [voicePickerTab, setVoicePickerTab] = useState('vbee'); // vbee | community
  const [voicePickerQ, setVoicePickerQ] = useState('');
  const [videoStylePresetId, setVideoStylePresetId] = useState(VIDEO_STYLE_PRESETS[0].id);
  /** Text → Video: số phân cảnh (chuỗi; blur / tạo video chuẩn hoá 1…TEXT_VIDEO_SCENE_COUNT_MAX). */
  const [textVideoSceneInput, setTextVideoSceneInput] = useState('1');
  /** Text → Video: snapshot lần chạy gần nhất (tabs Kết quả). */
  const [textVideoResultRun, setTextVideoResultRun] = useState(null);
  /** Tăng khi cần cuộn tới Kết quả → tab Videos (nút «Xem video», Lịch sử…). */
  const [textVideoFocusVideosNonce, setTextVideoFocusVideosNonce] = useState(0);
  const savedUrlsRef = useRef(new Set());
  const cancelRef = useRef(false);
  const requestAbortRef = useRef(null);
  const sidebarAccountRef = useRef(null);
  const videoDirHandleRef = useRef(null);
  const imageDirHandleRef = useRef(null);

  const appendLog = useCallback((line) => {
    setLogs((prev) => `${prev}${new Date().toLocaleTimeString('vi-VN')} — ${line}\n`);
  }, []);

  useEffect(() => {
    if (section === 'text-video' && tab === 'logs') {
      setTab('form');
    }
  }, [section, tab]);

  const pickDirectoryPath = useCallback(async (setPath, handleRef) => {
    if (typeof window === 'undefined' || !window.showDirectoryPicker) {
      window.alert(
        'Trình duyệt không hỗ trợ chọn thư mục (thử Chrome hoặc Edge, trên HTTPS hoặc localhost). Bạn vẫn có thể gõ đường dẫn đầy đủ vào ô.',
      );
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      if (handleRef) handleRef.current = handle;
      try {
        const q = await handle.queryPermission({ mode: 'readwrite' });
        if (q === 'prompt') await handle.requestPermission({ mode: 'readwrite' });
      } catch {
        /* một số môi trường không có API quyền */
      }
      setPath(handle.name);
    } catch (e) {
      if (e?.name !== 'AbortError') console.warn(e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshSession();
      if (!cancelled) setAuthLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  useEffect(() => {
    checkHealth().then(setHealth).catch(() => setHealth({ ok: false, hasApiKey: false }));
  }, []);

  const voicePickerList = useMemo(
    () => collectVoiceOptions(voicePickerTab, voicePickerQ),
    [voicePickerTab, voicePickerQ],
  );

  const applyVoicePick = useCallback((v) => {
    if (!v?.voiceCode) return;
    try {
      if (voicePickerTab === 'community') {
        localStorage.setItem(COMMUNITY_VOICE_CODE, v.voiceCode);
        localStorage.setItem(COMMUNITY_VOICE_NAME, v.name || v.voiceCode);
      } else {
        localStorage.setItem(VEO3PRO_VOICE_CODE, v.voiceCode);
        localStorage.setItem(VEO3PRO_VOICE_NAME, v.name || v.voiceCode);
      }
      window.dispatchEvent(new Event('veo3pro-voice-pick'));
    } catch {
      /* ignore */
    }
    setVoicePickerOpen(false);
  }, [voicePickerTab]);

  const [keyStatus, setKeyStatus] = useState({ hasGemini: false, hasGrok: false, hasOpenAi: false, hasGrokBaseUrl: false });
  const [settingsTab, setSettingsTab] = useState(() => {
    try {
      const raw = sessionStorage.getItem('veo3pro_settings_tab_v1');
      return raw === 'profile' || raw === 'api' || raw === 'logs' ? raw : 'general';
    } catch {
      return 'general';
    }
  });

  const [generalSettings, setGeneralSettings] = useState(() => {
    const defaults = {
      language: 'vi',
      waitNextVideoSec: 10,
      waitUploadSec: 20,
      waitOnErrorSec: 60,
      turboMode: true,
      pageSize: 10,
      proxyUrl: '',
    };
    try {
      const raw = localStorage.getItem('veo3pro_general_settings_v1');
      if (!raw) return defaults;
      const j = JSON.parse(raw);
      return {
        language: typeof j?.language === 'string' ? j.language : defaults.language,
        waitNextVideoSec: Number(j?.waitNextVideoSec) > 0 ? Number(j.waitNextVideoSec) : defaults.waitNextVideoSec,
        waitUploadSec: Number(j?.waitUploadSec) > 0 ? Number(j.waitUploadSec) : defaults.waitUploadSec,
        waitOnErrorSec: Number(j?.waitOnErrorSec) > 0 ? Number(j.waitOnErrorSec) : defaults.waitOnErrorSec,
        turboMode: j?.turboMode === false ? false : defaults.turboMode,
        pageSize: Number(j?.pageSize) > 0 ? Number(j.pageSize) : defaults.pageSize,
        proxyUrl: typeof j?.proxyUrl === 'string' ? j.proxyUrl : defaults.proxyUrl,
      };
    } catch {
      return defaults;
    }
  });

  const [chromeProfileName, setChromeProfileName] = useState(() => {
    try {
      return localStorage.getItem('veo3pro_chrome_portable_profile_name_v1') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('veo3pro_chrome_portable_profile_name_v1', chromeProfileName);
    } catch {
      /* ignore */
    }
  }, [chromeProfileName]);

  const [activeApiProfileSlug, setActiveApiProfileSlug] = useState(() => {
    try {
      return localStorage.getItem('veo3pro_active_api_profile_slug_v1') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      if (activeApiProfileSlug) localStorage.setItem('veo3pro_active_api_profile_slug_v1', activeApiProfileSlug);
      else localStorage.removeItem('veo3pro_active_api_profile_slug_v1');
    } catch {
      /* ignore */
    }
  }, [activeApiProfileSlug]);

  const [chromeProfiles, setChromeProfiles] = useState([]);
  const [chromeProfilesBusy, setChromeProfilesBusy] = useState(false);
  const [chromeProfileProxyUrl, setChromeProfileProxyUrl] = useState('');
  const [chromeProfileAccountsText, setChromeProfileAccountsText] = useState('');
  const [chromeProfileOpenedSlug, setChromeProfileOpenedSlug] = useState('');
  const [addChromeProfileOpen, setAddChromeProfileOpen] = useState(false);
  const [addChromeProfileName, setAddChromeProfileName] = useState('');
  const [addChromeProfileProxy, setAddChromeProfileProxy] = useState('');
  const [addChromeProfileBusy, setAddChromeProfileBusy] = useState(false);
  const [addChromeProfileErr, setAddChromeProfileErr] = useState('');
  const [chromeProfilesRefreshKey, setChromeProfilesRefreshKey] = useState(0);
  const [videoPrefs, setVideoPrefs] = useState({ preferUltraProfile: false, preferredProfileSlug: '' });
  const [videoPrefsBusy, setVideoPrefsBusy] = useState(false);
  const [chromeProfileDropdownOpen, setChromeProfileDropdownOpen] = useState(false);
  const [chromeProfileHoverSlug, setChromeProfileHoverSlug] = useState('');
  const chromeProfileDropdownRef = useRef(null);

  useEffect(() => {
    if (!chromeProfileDropdownOpen) return;
    function onDocMouseDown(e) {
      const el = chromeProfileDropdownRef.current;
      if (el && !el.contains(e.target)) setChromeProfileDropdownOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [chromeProfileDropdownOpen]);

  useEffect(() => {
    if (settingsTab !== 'profile') setChromeProfileDropdownOpen(false);
  }, [settingsTab]);

  useEffect(() => {
    // Always keep Ultra prefs fresh after login.
    // Otherwise the Text → Video "Tạo video" button may fall back to API key quota path.
    if (!sessionUser?.id) return;
    let live = true;
    setVideoPrefsBusy(true);
    fetchVideoPrefs()
      .then((p) => {
        if (!live) return;
        setVideoPrefs({
          preferUltraProfile: Boolean(p?.preferUltraProfile),
          preferredProfileSlug: typeof p?.preferredProfileSlug === 'string' ? p.preferredProfileSlug : '',
        });
      })
      .catch(() => {
        if (!live) return;
        setVideoPrefs({ preferUltraProfile: false, preferredProfileSlug: '' });
      })
      .finally(() => {
        if (live) setVideoPrefsBusy(false);
      });
    return () => {
      live = false;
    };
  }, [sessionUser?.id]);

  useEffect(() => {
    try {
      sessionStorage.setItem('veo3pro_settings_tab_v1', settingsTab);
    } catch {
      /* ignore */
    }
  }, [settingsTab]);

  useEffect(() => {
    if (settingsTab !== 'profile' && settingsTab !== 'api' && !CLASSIC_PANEL_SECTIONS.has(section)) return;
    let live = true;
    setChromeProfilesBusy(true);
    fetchChromePortableProfiles()
      .then((items) => {
        if (!live) return;
        setChromeProfiles(items);
        // Mark "opened" as the most recently opened profile (best-effort).
        const opened = Array.isArray(items)
          ? items.find((x) => x?.lastOpenedAt)?.slug || (items[0]?.slug || '')
          : '';
        if (opened) setChromeProfileOpenedSlug(opened);
      })
      .catch(() => {
        if (!live) return;
        setChromeProfiles([]);
      })
      .finally(() => {
        if (live) setChromeProfilesBusy(false);
      });
    return () => {
      live = false;
    };
  }, [settingsTab, section, chromeProfilesRefreshKey]);

  const [revealKeysNonce, setRevealKeysNonce] = useState(0);
  const [revealedChromeKeys, setRevealedChromeKeys] = useState(null);
  const [revealKeysLoading, setRevealKeysLoading] = useState(false);
  const [keyShowById, setKeyShowById] = useState({});
  const [apiFlagBusy, setApiFlagBusy] = useState('');

  useEffect(() => {
    if (settingsTab !== 'api') return;
    let live = true;
    setRevealKeysLoading(true);
    (async () => {
      try {
        const slug = String(activeApiProfileSlug || '').trim();
        if (!slug) {
          if (live) setRevealedChromeKeys(null);
        } else {
          try {
            const pk = await fetchChromeProfileRevealKeys(slug);
            if (live) setRevealedChromeKeys(pk);
          } catch {
            if (live) setRevealedChromeKeys(null);
          }
        }
      } finally {
        if (live) setRevealKeysLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [settingsTab, activeApiProfileSlug, revealKeysNonce]);

  const bumpRevealKeys = () => setRevealKeysNonce((n) => n + 1);
  const bumpChromeProfilesList = () => setChromeProfilesRefreshKey((n) => n + 1);

  const [profileKeyBusy, setProfileKeyBusy] = useState(false);
  const [profileKeyStatus, setProfileKeyStatus] = useState({ hasGemini: false, hasGrok: false, hasOpenAi: false, hasGrokBaseUrl: false });
  const [profileKeyUi, setProfileKeyUi] = useState({ geminiApiKey: '', grokApiKey: '', grokBaseUrl: '', openAiApiKey: '' });

  useEffect(() => {
    if (settingsTab !== 'api') return;
    const slug = String(activeApiProfileSlug || '').trim();
    if (!slug) {
      setProfileKeyStatus({ hasGemini: false, hasGrok: false, hasOpenAi: false, hasGrokBaseUrl: false });
      return;
    }
    let live = true;
    fetchChromeProfileKeyStatus(slug)
      .then((s) => {
        if (!live) return;
        setProfileKeyStatus(s);
      })
      .catch(() => {
        if (!live) return;
        setProfileKeyStatus({ hasGemini: false, hasGrok: false, hasOpenAi: false, hasGrokBaseUrl: false });
      });
    return () => {
      live = false;
    };
  }, [settingsTab, activeApiProfileSlug]);

  const effectiveHasGeminiKey = Boolean(health.hasApiKey || keyStatus.hasGemini);
  const effectiveHasOpenAiKey = Boolean(health.hasOpenAiKey || keyStatus.hasOpenAi);

  useEffect(() => {
    // Load per-user key status (never loads plaintext).
    fetchUserKeyStatus()
      .then((s) => setKeyStatus(s))
      .catch(() => setKeyStatus({ hasGemini: false, hasOpenAi: false, hasBaseUrl: false }));
  }, [sessionUser?.id]);

  useEffect(() => {
    const sync = () => setVoiceLibraryPick(readVoiceLibraryPick());
    try {
      window.addEventListener('veo3pro-voice-pick', sync);
      window.addEventListener('storage', sync);
    } catch {
      /* ignore */
    }
    sync();
    return () => {
      try {
        window.removeEventListener('veo3pro-voice-pick', sync);
        window.removeEventListener('storage', sync);
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    writeNavState(section, tab);
  }, [section, tab]);

  useEffect(() => {
    const flush = () => writeNavState(navLiveRef.current.section, navLiveRef.current.tab);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const records = await idbGetAllVideos();
        if (cancelled) return;
        const mapped = records
          .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
          .map((item) => {
            const src = URL.createObjectURL(item.blob);
            savedUrlsRef.current.add(src);
            return {
              id: item.id,
              name: item.name || 'veo3pro-video.mp4',
              createdAt: Number(item.createdAt || Date.now()),
              src,
            };
          });
        setSavedVideos(mapped);
      } catch {
        appendLog('Không đọc được danh sách video đã lưu.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appendLog]);

  useEffect(() => {
    return () => {
      for (const url of savedUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      savedUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const onDocMouseDown = (ev) => {
      if (!sidebarAccountRef.current) return;
      if (!sidebarAccountRef.current.contains(ev.target)) {
        setSidebarAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const showMainHeaderClose = ['account', 'settings', 'service-plans', 'ecosystem', 'youtube-seo'].includes(section);

  const closePanelFromMenu = useCallback(() => {
    setSection('text-video');
    setTab('form');
  }, []);

  const mode = useMemo(() => {
    if (section === 'image-video') return 'image';
    if (section === 'ingredients') return 'ingredients';
    return 'text';
  }, [section]);

  const runGeneration = async (promptOverride) => {
    cancelRef.current = false;
    setCancelRequested(false);
    setRunError('');
    requestAbortRef.current = new AbortController();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setBusy(true);
    setProgressPct(1);

    try {
      const vStyle = VIDEO_STYLE_PRESETS.find((s) => s.id === videoStylePresetId) || VIDEO_STYLE_PRESETS[0];
      const promptTrim = String(promptOverride ?? prompt ?? '').trim();
      if (!promptTrim) {
        appendLog('Lỗi: nhập prompt.');
        setBusy(false);
        return;
      }
      const promptForApi =
        vStyle.id === 'tu-dong-nhan-dien'
          ? promptTrim
          : `[Phong cách video: ${vStyle.label}]\n${promptTrim}`;
      const canUseUltra = Boolean(videoPrefs?.preferUltraProfile && String(videoPrefs?.preferredProfileSlug || '').trim());
      const body = {
        model,
        prompt: promptForApi,
        aspectRatio,
        resolution,
        language,
        mode,
      };

      if (mode === 'image') {
        if (!startFile) {
          appendLog('Lỗi: chọn ảnh khởi đầu.');
          setBusy(false);
          return;
        }
        body.image = await fileToBase64(startFile);
        if (lastFile) body.lastFrame = await fileToBase64(lastFile);
      }

      if (mode === 'ingredients') {
        const refs = [];
        for (const f of refFiles) {
          if (f) refs.push(await fileToBase64(f));
        }
        if (refs.length === 0) {
          appendLog('Lỗi: thêm ít nhất một ảnh reference hoặc dùng bảng nhân vật.');
          setBusy(false);
          return;
        }
        body.referenceImages = refs.map((r) => ({
          data: r.data,
          mimeType: r.mimeType,
          referenceType: 'asset',
        }));
      }

      const textSceneCount =
        section === 'text-video' && mode === 'text'
          ? Math.min(
              TEXT_VIDEO_SCENE_COUNT_MAX,
              Math.max(1, Math.floor(Number.parseInt(String(textVideoSceneInput).trim(), 10)) || 1),
            )
          : 1;
      const countsAsMultiScene = section === 'text-video' && mode === 'text' && textSceneCount > 1;

      if (canUseUltra) {
        appendLog('Ưu tiên Gmail Ultra (profile) — đang tạo video nền (không mở tab Gemini)...');
        const ultraSceneHint =
          countsAsMultiScene
            ? `\n\n[Gợi ý: khoảng ${textSceneCount} phân cảnh liên tiếp, mỗi phân cảnh ~8 giây — giữ nhất quán nhân vật và không gian.]`
            : '';
        let ultraPromptArg = String(promptForApi).trim() + ultraSceneHint;

        if (section === 'text-video' && mode === 'text') {
          const textVideoRunId = crypto.randomUUID();
          setTextVideoResultRun({
            runId: textVideoRunId,
            updatedAt: Date.now(),
            baseUserPrompt: promptTrim,
            styleLabel: vStyle.label,
            model,
            resolution,
            aspectRatio,
            language,
            durationSecDefault: null,
            viaUltra: true,
            castLoading: true,
            castError: undefined,
            scenes: [
              {
                index: 1,
                total: 1,
                promptFull: ultraPromptArg,
                status: 'pending',
              },
            ],
          });
          try {
            appendLog('Đang sinh nhân vật & phân cảnh chi tiết (Gemini) trước khi gửi Ultra...');
            const castData = await fetchTextVideoCast({
              storyPrompt: promptTrim,
              styleLabel: vStyle.label,
              language,
            });
            const items = Array.isArray(castData.items) ? castData.items : [];
            let structured = { scenes: [], error: undefined };
            try {
              structured = await fetchTextVideoStructuredScenes({
                storyPrompt: promptTrim,
                styleLabel: vStyle.label,
                language,
                sceneCount: textSceneCount,
                castItems: items,
              });
            } catch (e) {
              structured = { scenes: [], error: e?.message || 'structured-scenes-failed' };
              appendLog(`Phân cảnh chi tiết: ${structured.error} — Ultra dùng prompt gốc.`);
            }
            const list = Array.isArray(structured.scenes) ? structured.scenes : [];
            const pick = list.find((s) => String(s.scene_id) === '1') || list[0];
            const firstContent = String(pick?.content || '').trim();
            if (firstContent) {
              ultraPromptArg = `${wrapPromptWithVideoStyle(firstContent, vStyle)}${ultraSceneHint}`;
            }
            setTextVideoResultRun((prev) => {
              if (!prev || prev.runId !== textVideoRunId || !prev.viaUltra) return prev;
              const scene0 = prev.scenes[0];
              return {
                ...prev,
                updatedAt: Date.now(),
                castLoading: false,
                castItems: items,
                castError: castData.error,
                structuredScenesError: structured.error || undefined,
                scenes: [
                  firstContent
                    ? {
                        ...scene0,
                        promptFull: ultraPromptArg,
                        structuredScene: { scene_id: String(pick?.scene_id ?? '1'), content: firstContent },
                      }
                    : { ...scene0, promptFull: ultraPromptArg },
                ],
              };
            });
            if (firstContent) {
              appendLog('Đã gắn prompt phân cảnh chi tiết cho Ultra (khớp tab Phân cảnh / Prompts).');
            }
          } catch (e) {
            appendLog(`Cast Gemini (Ultra): ${e.message} — gửi Ultra bằng prompt gốc.`);
            setTextVideoResultRun((prev) => {
              if (!prev || !prev.viaUltra || prev.runId !== textVideoRunId) return prev;
              return {
                ...prev,
                castLoading: false,
                castError: e?.message || 'cast-failed',
                scenes: [{ ...prev.scenes[0], promptFull: ultraPromptArg }],
              };
            });
          }
        }

        const res = await ultraCreateVideo(String(ultraPromptArg).trim());
        if (res?.mode !== 'ultra_profile' || !res?.jobId) {
          if (section === 'text-video' && mode === 'text') {
            setTextVideoResultRun((prev) =>
              prev?.viaUltra
                ? {
                    ...prev,
                    updatedAt: Date.now(),
                    scenes: [{ ...prev.scenes[0], status: 'error', error: 'Chưa bật Ultra hoặc chưa chọn profile Ultra.' }],
                  }
                : prev,
            );
          }
          throw new Error('Chưa bật Ultra hoặc chưa chọn profile Ultra ưu tiên. Vào Cài đặt → Kết nối API để bật Ultra.');
        }
        const jobId = String(res.jobId);
        if (section === 'text-video' && mode === 'text') {
          setTextVideoResultRun((prev) =>
            prev?.viaUltra ? { ...prev, updatedAt: Date.now(), scenes: [{ ...prev.scenes[0], status: 'sent' }] } : prev,
          );
        }
        setLastApiSourceLabel(`Ultra profile: ${String(videoPrefs.preferredProfileSlug || '').trim()}`);
        setLastOperation(jobId);
        appendLog(`Ultra Job: ${jobId}`);

        const maxWait = 75 * 60 * 1000;
        const started = Date.now();
        while (Date.now() - started < maxWait) {
          if (cancelRef.current) {
            appendLog('Đã hủy tiến trình tạo video.');
            setProgressPct(0);
            break;
          }
          await new Promise((r) => setTimeout(r, 2500));
          const elapsed = Date.now() - started;
          const estimated = Math.min(95, Math.max(3, Math.round((elapsed / maxWait) * 100)));
          setProgressPct(estimated);
          const job = await ultraGetJob(jobId);
          if (job?.status === 'failed') {
            const msg = String(job?.error || 'Ultra failed');
            const code = String(job?.code || '');
            if (section === 'text-video' && mode === 'text') {
              setTextVideoResultRun((prev) =>
                prev?.viaUltra
                  ? { ...prev, updatedAt: Date.now(), scenes: [{ ...prev.scenes[0], status: 'error', error: code ? `${msg} (${code})` : msg }] }
                  : prev,
              );
            }
            throw new Error(code ? `${msg} (${code})` : msg);
          }
          if (job?.status === 'completed') {
            setProgressPct(100);
            appendLog('Hoàn tất. Đang tải video Ultra...');
            const blob = await ultraDownloadJobBlob(jobId, { signal: requestAbortRef.current.signal });
            const url = URL.createObjectURL(blob);
            setVideoUrl(url);
            const now = new Date();
            const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(
              now.getHours(),
            ).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
            const saved = {
              id: crypto.randomUUID(),
              name: `veo3pro-ultra-${stamp}.mp4`,
              createdAt: Date.now(),
              mimeType: blob.type || 'video/mp4',
              blob,
            };
            await idbPutVideo(saved);
            const savedUrl = URL.createObjectURL(blob);
            savedUrlsRef.current.add(savedUrl);
            setSavedVideos((prev) => [{ id: saved.id, name: saved.name, createdAt: saved.createdAt, src: savedUrl }, ...prev]);
            if (section === 'text-video' && mode === 'text') {
              setTextVideoResultRun((prev) =>
                prev?.viaUltra
                  ? {
                      ...prev,
                      updatedAt: Date.now(),
                      scenes: [{ ...prev.scenes[0], status: 'completed', videoId: saved.id }],
                    }
                  : prev,
              );
            }
            appendLog('Đã tải video xong. Clip đã lưu cục bộ — mở tab Kết quả → Videos.');
            return;
          }
        }
        throw new Error('Ultra tạo video quá lâu — vui lòng thử lại.');
      }

      const logVeoStartMeta = (startedInfo) => {
        const attemptTrace = Array.isArray(startedInfo?.attemptTrace) ? startedInfo.attemptTrace : [];
        const usedSource = startedInfo?.usedSource || null;
        const debug = startedInfo?.debug || null;
        if (attemptTrace.length) {
          for (const a of attemptTrace) {
            const s = a?.source;
            const srcLabel =
              s?.type === 'profile'
                ? `Chrome profile: ${s.slug || '—'}`
                : s?.type === 'user'
                  ? 'Key tài khoản app'
                  : s?.type === 'env'
                    ? '.env (GEMINI_API_KEY)'
                    : s?.type === 'header'
                      ? 'Header one-off'
                      : '—';
            if (a?.quotaLike) appendLog(`Quota/rate-limit: ${srcLabel} → thử key khác...`);
          }
        }
        if (usedSource?.type) {
          const label =
            usedSource.type === 'profile'
              ? `Chrome profile: ${usedSource.slug || '—'}`
              : usedSource.type === 'user'
                ? 'Key tài khoản app'
                : usedSource.type === 'env'
                  ? '.env (GEMINI_API_KEY)'
                  : 'Header one-off';
          appendLog(`Nguồn Gemini API: ${label}`);
          setLastApiSourceLabel(label);
          if (usedSource.type === 'env' && debug) {
            const pref = String(debug?.preferredSlug || '').trim();
            const list = Array.isArray(debug?.candidateSources) ? debug.candidateSources : [];
            const summarize = (x) => {
              const s = x?.source;
              if (!s?.type) return '';
              if (s.type === 'profile') {
                const m = x?.meta;
                const extra =
                  m && m.hadCiphertext
                    ? m.decryptOk
                      ? ''
                      : ' (decrypt lỗi — cần re-save key / kiểm tra USER_KEYS_MASTER_KEY)'
                    : '';
                return `profile:${s.slug || '—'}${extra}`;
              }
              if (s.type === 'user') {
                const m = x?.meta;
                const extra =
                  m && m.hadCiphertext
                    ? m.decryptOk
                      ? ''
                      : ' (decrypt lỗi — cần re-save key / kiểm tra USER_KEYS_MASTER_KEY)'
                    : '';
                return `user${extra}`;
              }
              if (s.type === 'env') return 'env';
              if (s.type === 'header') return 'header';
              return s.type;
            };
            const parts = list.map(summarize).filter(Boolean);
            appendLog(`Debug nguồn key (slug=${pref || '—'}): ${parts.join(' → ') || '—'}`);
          }
        } else {
          setLastApiSourceLabel('');
        }
      };

      const pollOneVeoOperation = async (op) => {
        const maxWait = 45 * 60 * 1000;
        const startedPoll = Date.now();
        while (Date.now() - startedPoll < maxWait) {
          if (cancelRef.current) {
            appendLog('Đã hủy tiến trình tạo video.');
            setProgressPct(0);
            return null;
          }
          await new Promise((r) => setTimeout(r, 10000));
          if (cancelRef.current) {
            appendLog('Đã hủy tiến trình tạo video.');
            setProgressPct(0);
            return null;
          }
          const elapsed = Date.now() - startedPoll;
          const estimated = Math.min(95, Math.max(3, Math.round((elapsed / maxWait) * 100)));
          setProgressPct(estimated);
          appendLog('Đang chờ model xử lý...');
          const status = await pollOperation(op, { signal: requestAbortRef.current.signal });
          if (cancelRef.current) {
            appendLog('Đã hủy tiến trình tạo video.');
            setProgressPct(0);
            return null;
          }
          if (status.error && status.code) {
            appendLog(`Lỗi API: ${JSON.stringify(status)}`);
            return null;
          }
          if (status.done) {
            const err = status.error || status.response?.error;
            if (err) {
              appendLog(`Thất bại: ${JSON.stringify(err)}`);
              return null;
            }
            const uri = extractVideoUri(status);
            if (!uri) {
              appendLog(`Không tìm thấy URI video trong phản hồi: ${JSON.stringify(status.response || {}).slice(0, 800)}`);
              return null;
            }
            appendLog('Hoàn tất. Đang tải video...');
            const blob = await downloadVideoBlob(uri, {
              signal: requestAbortRef.current.signal,
              operation: op,
            });
            return blob;
          }
        }
        setProgressPct(0);
        appendLog('Hết thời gian chờ (45 phút). Kiểm tra lại trên Google AI Studio.');
        return null;
      };

      let structuredByIndex = new Map();

      if (countsAsMultiScene) {
        appendLog(`Phân cảnh: ${textSceneCount} (mỗi cảnh ~8 giây — gửi Veo lần lượt).`);
      }

      if (section === 'text-video' && mode === 'text') {
        const textVideoRunId = crypto.randomUUID();
        const scenes = [];
        for (let i = 1; i <= textSceneCount; i++) {
          const sceneNote = textVideoSceneNote(countsAsMultiScene, i, textSceneCount);
          scenes.push({
            index: i,
            total: textSceneCount,
            promptFull: promptForApi + sceneNote,
            status: 'pending',
          });
        }
        setTextVideoResultRun({
          runId: textVideoRunId,
          updatedAt: Date.now(),
          baseUserPrompt: promptTrim,
          styleLabel: vStyle.label,
          model,
          resolution,
          aspectRatio,
          language,
          durationSecDefault: countsAsMultiScene ? 8 : null,
          viaUltra: false,
          castLoading: true,
          castError: undefined,
          scenes,
        });

        try {
          appendLog('Đang sinh nhân vật & phân cảnh chi tiết (Gemini)...');
          const castData = await fetchTextVideoCast({
            storyPrompt: promptTrim,
            styleLabel: vStyle.label,
            language,
          });
          const items = Array.isArray(castData.items) ? castData.items : [];
          let structured = { scenes: [], error: undefined };
          try {
            structured = await fetchTextVideoStructuredScenes({
              storyPrompt: promptTrim,
              styleLabel: vStyle.label,
              language,
              sceneCount: textSceneCount,
              castItems: items,
            });
          } catch (e) {
            structured = { scenes: [], error: e?.message || 'structured-scenes-failed' };
            appendLog(`Phân cảnh chi tiết: ${structured.error} — Veo nhận prompt gốc.`);
          }
          const list = Array.isArray(structured.scenes) ? structured.scenes : [];
          structuredByIndex = new Map();
          for (const s of list) {
            const id = String(s.scene_id);
            const c = String(s.content || '').trim();
            if (c) structuredByIndex.set(id, c);
          }
          setTextVideoResultRun((prev) => {
            if (!prev || prev.runId !== textVideoRunId || !prev.scenes?.length) return prev;
            const bySceneId = new Map(list.map((x) => [String(x.scene_id), String(x.content || '').trim()]));
            const nextScenes = prev.scenes.map((sc) => {
              const content = bySceneId.get(String(sc.index)) || '';
              const sceneNote = textVideoSceneNote(countsAsMultiScene, sc.index, textSceneCount);
              const base = content.trim() ? wrapPromptWithVideoStyle(content, vStyle) : promptForApi;
              const promptFull = base + sceneNote;
              if (!content.trim()) return { ...sc, promptFull };
              return { ...sc, promptFull, structuredScene: { scene_id: String(sc.index), content } };
            });
            return {
              ...prev,
              castLoading: false,
              castItems: items,
              castError: castData.error,
              structuredScenesError: structured.error || undefined,
              scenes: nextScenes,
            };
          });
          if (structuredByIndex.size) {
            appendLog(`Đã gắn ${structuredByIndex.size} prompt phân cảnh chi tiết cho Veo (khớp tab Phân cảnh / Prompts).`);
          }
        } catch (e) {
          appendLog(`Cast Gemini: ${e.message} — tiếp tục với prompt gốc cho Veo.`);
          setTextVideoResultRun((prev) => {
            if (!prev || prev.runId !== textVideoRunId) return prev;
            return { ...prev, castLoading: false, castError: e?.message };
          });
        }
      }

      for (let sceneIdx = 1; sceneIdx <= textSceneCount; sceneIdx++) {
        if (cancelRef.current) {
          appendLog('Đã hủy yêu cầu tạo video.');
          setProgressPct(0);
          return;
        }

        const sceneNote = textVideoSceneNote(countsAsMultiScene, sceneIdx, textSceneCount);
        const structuredRaw =
          section === 'text-video' && mode === 'text' ? String(structuredByIndex.get(String(sceneIdx)) || '').trim() : '';
        const clipPrompt = structuredRaw
          ? wrapPromptWithVideoStyle(structuredRaw, vStyle) + sceneNote
          : promptForApi + sceneNote;
        const clipBody = {
          ...body,
          prompt: clipPrompt,
          ...(countsAsMultiScene ? { durationSeconds: 8 } : {}),
        };

        appendLog(
          countsAsMultiScene ? `Gửi Veo — phân cảnh ${sceneIdx}/${textSceneCount} (~8s)...` : 'Gửi yêu cầu tới Gemini API (Veo)...',
        );

        if (countsAsMultiScene) {
          setProgressPct(Math.min(90, Math.round(((sceneIdx - 1) / textSceneCount) * 85) + 5));
        }

        if (section === 'text-video' && mode === 'text') {
          setTextVideoResultRun((prev) => {
            if (!prev || prev.viaUltra) return prev;
            return {
              ...prev,
              updatedAt: Date.now(),
              scenes: prev.scenes.map((s) => (s.index === sceneIdx ? { ...s, status: 'sent' } : s)),
            };
          });
        }

        const startedInfo = await startGeneration(clipBody, { signal: requestAbortRef.current.signal });
        logVeoStartMeta(startedInfo);
        const op = startedInfo?.operationName;
        if (!op) {
          if (section === 'text-video' && mode === 'text') {
            setTextVideoResultRun((prev) => {
              if (!prev || prev.viaUltra) return prev;
              return {
                ...prev,
                updatedAt: Date.now(),
                scenes: prev.scenes.map((s) =>
                  s.index === sceneIdx ? { ...s, status: 'error', error: 'Không nhận được operation từ Veo.' } : s,
                ),
              };
            });
          }
          throw new Error('Không nhận được operation từ Veo.');
        }
        if (cancelRef.current) {
          appendLog('Đã hủy yêu cầu tạo video.');
          setProgressPct(0);
          return;
        }
        setLastOperation(op);
        appendLog(`Operation: ${op}`);

        const blob = await pollOneVeoOperation(op);
        if (!blob) {
          if (section === 'text-video' && mode === 'text') {
            setTextVideoResultRun((prev) => {
              if (!prev || prev.viaUltra) return prev;
              return {
                ...prev,
                updatedAt: Date.now(),
                scenes: prev.scenes.map((s) =>
                  s.index === sceneIdx
                    ? { ...s, status: 'error', error: 'Không tải được video (timeout hoặc lỗi API).' }
                    : s,
                ),
              };
            });
          }
          return;
        }

        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        const now = new Date();
        const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(
          now.getHours(),
        ).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        const baseName = countsAsMultiScene ? `veo3pro-${stamp}-c${sceneIdx}` : `veo3pro-${stamp}`;
        const saved = {
          id: crypto.randomUUID(),
          name: `${baseName}.mp4`,
          createdAt: Date.now(),
          mimeType: blob.type || 'video/mp4',
          blob,
        };
        await idbPutVideo(saved);
        const savedUrl = URL.createObjectURL(blob);
        savedUrlsRef.current.add(savedUrl);
        setSavedVideos((prev) => [{ id: saved.id, name: saved.name, createdAt: saved.createdAt, src: savedUrl }, ...prev]);
        if (section === 'text-video' && mode === 'text') {
          setTextVideoResultRun((prev) => {
            if (!prev || prev.viaUltra) return prev;
            return {
              ...prev,
              updatedAt: Date.now(),
              scenes: prev.scenes.map((s) =>
                s.index === sceneIdx ? { ...s, status: 'completed', videoId: saved.id } : s,
              ),
            };
          });
        }
        appendLog(
          countsAsMultiScene
            ? `Đã tải xong cảnh ${sceneIdx}/${textSceneCount} (~8s). Đã lưu vào tab Kết quả → Videos.`
            : 'Đã tải xong. Đã lưu vào tab Kết quả → Videos và khu vực xem trước.',
        );

        if (countsAsMultiScene) {
          setProgressPct(Math.round((sceneIdx / textSceneCount) * 100));
        } else {
          setProgressPct(100);
        }
      }
    } catch (e) {
      setProgressPct(0);
      if (e?.name === 'AbortError') {
        appendLog('Đã hủy yêu cầu tạo video.');
      } else {
        const raw = String(e.message || '');
        const lower = raw.toLowerCase();
        let friendly = raw || 'Tạo video thất bại.';
        if (
          lower.includes('quota') ||
          lower.includes('rate limit') ||
          lower.includes('exceeded your') ||
          lower.includes('gemini_quota_exhausted')
        ) {
          friendly =
            'Gemini báo hết quota hoặc vượt giới hạn tốc độ. Server đã thử các key theo profile → tài khoản → .env (nếu có). Nếu nhà cung cấp (Giabao/Google) gắn credit theo IP, hãy cấu hình proxy trùng với trình duyệt trong Cài đặt → Chrome profile. Kiểm tra billing tại Google AI Studio, đổi profile/key trong Cài đặt → Kết nối API hoặc thử sau.';
        } else if (lower.includes('prepayment credits are depleted')) {
          friendly = 'Tài khoản Gemini/Veo đã hết credit prepaid. Nạp thêm hoặc đổi API key.';
        }
        setRunError(friendly);
      }
      appendLog(`Lỗi: ${e.message}`);
    } finally {
      requestAbortRef.current = null;
      setCancelRequested(false);
      setBusy(false);
    }
  };

  const cancelGeneration = useCallback(() => {
    if (!busy) return;
    cancelRef.current = true;
    setCancelRequested(true);
    requestAbortRef.current?.abort();
    appendLog('Đang hủy... vui lòng đợi vòng kiểm tra tiếp theo.');
  }, [busy, appendLog]);

  const handleTextVideoScenePromptUpdate = useCallback((sceneIndex, nextFull) => {
    setTextVideoResultRun((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        updatedAt: Date.now(),
        scenes: prev.scenes.map((s) => (s.index === sceneIndex ? { ...s, promptFull: String(nextFull ?? '') } : s)),
      };
    });
  }, []);

  const handleTextVideoBulkPromptReplace = useCallback((parts) => {
    const list = Array.isArray(parts) ? parts : [];
    setTextVideoResultRun((prev) => {
      if (!prev?.scenes?.length || list.length !== prev.scenes.length) return prev;
      return {
        ...prev,
        updatedAt: Date.now(),
        scenes: prev.scenes.map((s, i) => ({ ...s, promptFull: String(list[i] ?? '').trim() })),
      };
    });
  }, []);

  const downloadSavedVideo = useCallback(async (id) => {
    const rec = await idbGetVideo(id);
    if (!rec?.blob) return;
    const href = URL.createObjectURL(rec.blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = rec.name || 'veo3pro-video.mp4';
    a.click();
    URL.revokeObjectURL(href);
  }, []);

  const deleteSavedVideo = useCallback(
    async (id) => {
      await idbDeleteVideo(id);
      setSavedVideos((prev) => {
        const target = prev.find((x) => x.id === id);
        if (target?.src) {
          URL.revokeObjectURL(target.src);
          savedUrlsRef.current.delete(target.src);
          if (activePreview?.id === id) setActivePreview(null);
        }
        return prev.filter((x) => x.id !== id);
      });
    },
    [activePreview],
  );

  const handleConvertPromptStudio = useCallback(
    (nextPrompt) => {
      const text = String(nextPrompt || '').trim();
      if (!text) return;
      setPrompt(text);
      setSection('text-video');
      setTab('form');
    },
    [setPrompt, setSection, setTab],
  );

  const openLogsVideoTab = useCallback(() => {
    setSection('text-video');
    setTab('form');
    setTextVideoFocusVideosNonce((n) => n + 1);
  }, []);

  const sectionTitle = {
    'prompt-studio': 'Prompt Studio',
    'text-video': 'Text → Video',
    'image-video': 'Ảnh → Video',
    ingredients: 'Ingredients / Nhân vật → Video',
    'auto-flow': 'Tạo Ảnh AI',
    'video-marketing': 'Video Marketing',
    'video-analysis': 'Phân tích video',
    'youtube-seo': 'SEO YouTube',
    'characters-map': 'Nhân vật → Ingredients',
    'text-to-audio': 'Text → Âm thanh',
    'voice-library': 'Thư viện giọng',
    'video-split-merge': 'Cắt & ghép video',
    ecosystem: 'Hệ sinh thái Google & Veo3 Pro',
    'service-plans': 'Gói dịch vụ',
    account: 'Tài khoản',
    settings: 'Cài đặt',
  }[section] ?? 'VEO3 PRO';

  const sectionHint = {
    'prompt-studio':
      'Lên ý chủ đề, preset và prompt theo từng cảnh: nhân vật, thoại, bối cảnh và negative — sẵn sàng đưa vào tạo video.',
    'text-video':
      'Tính năng cốt lõi: mô tả góc máy (drone, close-up), ánh sáng điện ảnh, slow motion... Veo sinh video có âm thanh gốc (thoại, nhạc nền theo prompt).',
    'image-video':
      'Một ảnh → video: khung đầu; tab Image/Start-End: tùy chọn ảnh cuối để nội suy cảnh. Clip ~8s tùy model.',
    ingredients:
      'Tối đa 3 ảnh tham chiếu (nhân vật / sản phẩm) + prompt đồng bộ — giữ khuôn mặt xuyên suốt clip.',
    'auto-flow':
      'Gemini storyboard + sinh ảnh AI từng cảnh + Veo Ingredients (tối đa 3 khung tham chiếu) — một luồng “tạo ảnh AI” rồi ghép video.',
    'video-marketing': 'Dán link sản phẩm (Shopee/TikTok) → lấy ảnh + mô tả → tạo video marketing 9:16 có CTA.',
    'video-analysis': 'Tải không logo, URL hoặc upload MP4/MOV — phân tích hook, viral, prompt tái sử dụng (Gemini).',
    'youtube-seo': '',
    'characters-map': 'Đặt tên nhân vật, giới, ảnh mặt; sinh block mô tả đồng bộ rồi gán vào Ingredients (3 slot).',
    'text-to-audio': 'Đọc văn bản miễn phí bằng giọng trình duyệt (Web Speech). Xuất file âm thanh chất lượng cao: roadmap.',
    'voice-library': 'Thư viện giọng Veo3 Pro & cộng đồng; tab Nhân bản giọng để tải file hoặc ghi âm mẫu (xử lý cục bộ trong trình duyệt).',
    'video-split-merge': 'Cắt nhiều clip ngắn & ghép video: cần FFmpeg server — roadmap.',
    ecosystem:
      'Flow: Gemini (prompt) → Imagen / Nano Banana (ảnh) → Veo (video). Độ phân giải, credit và hạn mức phụ thuộc gói Google AI / Workspace.',
    'service-plans': 'Chọn gói Unlimited — thanh toán chuyển khoản ACB (QR VietQR).',
    account: 'Thông tin đăng ký, gói Free/Pro, mật khẩu và hồ sơ cá nhân.',
    settings: '',
  }[section] ?? '';

  if (authLoading) {
    return (
      <div className="app-shell" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p className="hint">Đang kiểm tra phiên đăng nhập…</p>
      </div>
    );
  }

  if (!sessionUser) {
    return <AuthGate onLoggedIn={refreshSession} />;
  }

  const accountPlanKey = String(sessionUser.plan || 'free').toLowerCase();
  const accountPlanIsPro = accountPlanKey === 'pro';
  const accountPlanLabel = accountPlanIsPro ? 'Pro' : 'Free';
  const accountEmailDisplay = sessionUser.email?.trim() || '—';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>VEO3 PRO</h1>
        </div>

        <nav className="nav-section">
          <div className="nav-label">TEXT &amp; Ý TƯỞNG</div>
          <button type="button" className={`nav-btn ${section === 'prompt-studio' ? 'active' : ''}`} onClick={() => setSection('prompt-studio')}>
            Prompt Studio
          </button>
          <button type="button" className={`nav-btn ${section === 'video-analysis' ? 'active' : ''}`} onClick={() => setSection('video-analysis')}>
            Phân tích video
          </button>
          <button
            type="button"
            id="nav-youtube-seo"
            className={`nav-btn nav-btn-youtube-seo ${section === 'youtube-seo' ? 'active' : ''}`}
            onClick={() => setSection('youtube-seo')}
            title="SEO YouTube — title, mô tả, tag, thumbnail"
          >
            SEO YouTube
          </button>
        </nav>

        <nav className="nav-section">
          <div className="nav-label">SINH VIDEO</div>
          <button type="button" className={`nav-btn ${section === 'text-video' ? 'active' : ''}`} onClick={() => setSection('text-video')}>
            Text → Video
          </button>
          <button
            type="button"
            className={`nav-btn ${section === 'image-video' || section === 'auto-flow' ? 'active' : ''}`}
            onClick={() => {
              setSection('image-video');
              setTab('form');
            }}
          >
            Ảnh → Video
          </button>
          <button type="button" className={`nav-btn ${section === 'video-marketing' ? 'active' : ''}`} onClick={() => setSection('video-marketing')}>
            Video Marketing
          </button>
          <button type="button" className={`nav-btn ${section === 'characters-map' ? 'active' : ''}`} onClick={() => setSection('characters-map')}>
            Nhân vật → Ingredients
          </button>
        </nav>

        <nav className="nav-section">
          <div className="nav-label">ẢNH / ÂM THANH / HẬU KỲ</div>
          <button type="button" className={`nav-btn ${section === 'text-to-audio' ? 'active' : ''}`} onClick={() => setSection('text-to-audio')}>
            Text → Âm thanh
          </button>
          <button type="button" className={`nav-btn ${section === 'voice-library' ? 'active' : ''}`} onClick={() => setSection('voice-library')}>
            Thư viện giọng
          </button>
        </nav>

        <nav className="nav-section">
          <div className="nav-label">CÀI ĐẶT</div>
          <button type="button" className={`nav-btn ${section === 'settings' ? 'active' : ''}`} onClick={() => setSection('settings')}>
            Cài đặt
          </button>
        </nav>

        <div className="sidebar-account-wrap" ref={sidebarAccountRef}>
          <button
            type="button"
            className="sidebar-account-trigger"
            aria-label={`Tài khoản ${accountEmailDisplay}, gói ${accountPlanLabel}`}
            aria-expanded={sidebarAccountOpen}
            onClick={() => setSidebarAccountOpen((v) => !v)}
          >
            <span className="sidebar-account-trigger-main">
              <span className="sidebar-account-trigger-email">{accountEmailDisplay}</span>
              <span className={`sidebar-account-plan-badge ${accountPlanIsPro ? 'is-pro' : 'is-free'}`}>{accountPlanLabel}</span>
            </span>
            <span className={`sidebar-account-arrow ${sidebarAccountOpen ? 'open' : ''}`} aria-hidden="true">
              ▴
            </span>
          </button>
          {sidebarAccountOpen && (
            <div className="sidebar-account-popup">
              <div className="sidebar-popup-user" aria-hidden="true">
                <span className="sidebar-popup-user-email">{accountEmailDisplay}</span>
                <span className={`sidebar-account-plan-badge ${accountPlanIsPro ? 'is-pro' : 'is-free'}`}>{accountPlanLabel}</span>
              </div>
              <button type="button" className="sidebar-popup-item" onClick={() => { setSection('account'); setSidebarAccountOpen(false); }}>
                Tài khoản
              </button>
              <button
                type="button"
                className="sidebar-popup-item"
                onClick={() => {
                  setSection('text-video');
                  setTab('form');
                  setTextVideoFocusVideosNonce((n) => n + 1);
                  setSidebarAccountOpen(false);
                }}
              >
                Lịch sử
              </button>
              <button type="button" className="sidebar-popup-item" onClick={() => { setSection('service-plans'); setSidebarAccountOpen(false); }}>
                Gói dịch vụ
              </button>
              <button type="button" className="sidebar-popup-item danger" onClick={handleLogout}>
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="main-header">
          <div className="main-header-row">
            <span className="badge">VEO 3.1</span>
            {showMainHeaderClose && (
              <button type="button" className="btn btn-secondary main-header-close" onClick={closePanelFromMenu}>
                Đóng
              </button>
            )}
          </div>
          <h2 style={{ marginTop: '0.35rem' }}>{sectionTitle}</h2>
          <p>{sectionHint}</p>
        </header>

        <div className="workspace">
          {section === 'prompt-studio' && (
            <PromptStudioPanel
              hasApiKey={effectiveHasGeminiKey}
              hasOpenAiKey={effectiveHasOpenAiKey}
              onConvertToTextVideo={handleConvertPromptStudio}
            />
          )}

          {section === 'video-analysis' && (
            <VideoAnalysisModule hasGeminiKey={Boolean(effectiveHasGeminiKey)} onGoTopic={() => setSection('prompt-studio')} />
          )}

          {section === 'youtube-seo' && <YoutubeSeoPanel hasGeminiKey={Boolean(effectiveHasGeminiKey)} hasOpenAiKey={Boolean(effectiveHasOpenAiKey)} />}

          {section === 'characters-map' && (
            <CharactersMapPanel
              onGoIngredients={() => {
                setSection('ingredients');
                setTab('form');
              }}
            />
          )}
          {section === 'text-to-audio' && (
            <TextToAudioPanel
              onOpenVoiceLibrary={(voiceTab) => {
                try {
                  const map = { veo3pro: 'vbee', community: 'community', clone: 'clone' };
                  sessionStorage.setItem('veo3pro_voice_library_tab', map[voiceTab] || 'vbee');
                } catch {
                  /* ignore */
                }
                setSection('voice-library');
              }}
              onCreateVideoFromText={async (t) => {
                const p = String(t || '').trim();
                if (!p) return;
                setPrompt(p);
                setSection('text-video');
                setTab('form');
                // Use the passed prompt directly to avoid waiting for state flush.
                await runGeneration(p);
              }}
            />
          )}
          {section === 'voice-library' && <VoiceLibraryPanel />}
          {section === 'video-marketing' && <VideoMarketingPanel hasApiKey={health.hasApiKey} />}

          {(section === 'text-video' || section === 'image-video' || section === 'ingredients' || section === 'auto-flow' || section === 'video-split-merge') && (
            <div className="panel">
              {section !== 'text-video' && (
                <div className="panel-tabs">
                  <button type="button" className={`tab ${tab === 'form' ? 'active' : ''}`} onClick={() => setTab('form')}>
                    Biểu mẫu
                  </button>
                  <button type="button" className={`tab ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>
                    Nhật ký / Trạng thái
                  </button>
                </div>
              )}

              {(section === 'text-video' || tab === 'form') && (
                <>
                  <div className="classic-mode-tabs">
                    <button type="button" className={`tab ${section === 'text-video' ? 'active' : ''}`} onClick={() => setSection('text-video')}>
                      Text to Video
                    </button>
                    {section !== 'text-video' && (
                      <>
                        <button
                          type="button"
                          className={`tab ${section === 'image-video' || section === 'auto-flow' ? 'active' : ''}`}
                          onClick={() => setSection('image-video')}
                        >
                          Ảnh → Video
                        </button>
                        <button type="button" className={`tab ${section === 'ingredients' ? 'active' : ''}`} onClick={() => setSection('ingredients')}>
                          Đầu / cuối + Ingredients
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className={`tab ${section === 'video-split-merge' ? 'active' : ''}`}
                      onClick={() => {
                        setSection('video-split-merge');
                        setTab('form');
                      }}
                    >
                      Cắt &amp; ghép video
                    </button>
                  </div>

                  {(section === 'image-video' || section === 'auto-flow') && (
                    <div className="classic-image-subtabs" role="group" aria-label="Chế độ ảnh → video">
                      <button type="button" className={`tab ${section === 'image-video' ? 'active' : ''}`} onClick={() => setSection('image-video')}>
                        1 ảnh → Video
                      </button>
                      <button type="button" className={`tab ${section === 'auto-flow' ? 'active' : ''}`} onClick={() => setSection('auto-flow')}>
                        Tạo Ảnh AI
                      </button>
                    </div>
                  )}

                  {section === 'auto-flow' ? (
                    <AutoFlowPanel hasApiKey={health.hasApiKey} embedded />
                  ) : section === 'video-split-merge' ? (
                    <VideoSplitMergePanel />
                  ) : (
                    <>
                  <div className="classic-compose-grid">
                    <div className="classic-left">
                      <div className="field classic-prompt-field">
                        <div className="classic-prompt-head">
                          <label htmlFor="classic-main-prompt">Prompt</label>
                          <button
                            type="button"
                            className="btn btn-secondary classic-prompt-ai-btn"
                            onClick={() => setSection('prompt-studio')}
                          >
                            Tạo Prompt AI
                          </button>
                        </div>
                        <textarea
                          id="classic-main-prompt"
                          className="input classic-prompt"
                          placeholder="Mô tả người/cảnh thật (live-action): ngoại hình, trang phục, ánh sáng, góc máy, chuyển động. Muốn hoạt hình thì ghi rõ «hoạt hình / anime». Nếu không ghi, hệ thống ưu tiên quay phim thực tế."
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="classic-right">
                      <table className="classic-job-table">
                        <colgroup>
                          <col style={{ width: '72px' }} />
                          <col style={{ width: '128px' }} />
                          <col style={{ width: '180px' }} />
                          <col style={{ width: '250px' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>STT</th>
                            <th>Trạng thái</th>
                            <th>Prompt</th>
                            <th>Tiến độ</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>001</td>
                            <td>
                              <div>{cancelRequested ? 'Đang hủy...' : busy ? 'Đang xử lý' : lastOperation ? 'Đã submit' : 'Chưa submit'}</div>
                              {lastApiSourceLabel ? (
                                <div style={{ marginTop: '0.15rem', fontSize: '0.78rem', opacity: 0.85 }}>
                                  API/Profile: <strong>{lastApiSourceLabel}</strong>
                                </div>
                              ) : null}
                            </td>
                            <td className="classic-prompt-cell">{prompt ? `${prompt.slice(0, 18)}${prompt.length > 18 ? '…' : ''}` : '-'}</td>
                            <td className="classic-progress-cell">
                              <div className="classic-progress-wrap">
                                <div className="classic-progress-meta">
                                  <span>{videoUrl ? '100%' : busy ? `${progressPct}%` : '0%'}</span>
                                </div>
                                <div className="classic-progress-track">
                                  <div className="classic-progress-bar" style={{ width: `${videoUrl ? 100 : busy ? progressPct : 0}%` }} />
                                </div>
                              </div>
                              {(videoUrl || savedVideos.length > 0) && (
                                <button type="button" className="btn btn-secondary" onClick={openLogsVideoTab}>
                                  Xem video
                                </button>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="classic-bottom-bar classic-bottom-bar--single">
                    <div className="classic-bar-slot classic-bar-slot--fixed">
                      <span className="classic-bar-label classic-bar-label--spacer" aria-hidden="true">
                        {'\u00a0'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-danger classic-bar-control"
                        disabled={!busy}
                        onClick={cancelGeneration}
                        aria-label="Hủy tạo video"
                      >
                        {cancelRequested ? 'Đang hủy...' : 'HỦY'}
                      </button>
                    </div>
                    <label className="classic-bar-slot classic-bar-slot--grow">
                      <span className="classic-bar-label">Profile API</span>
                      <select
                        className="input classic-bar-select"
                        value={activeApiProfileSlug}
                        onChange={(e) => setActiveApiProfileSlug(e.target.value)}
                        title="Chrome profile — Gemini / OpenAI / Veo dùng key theo Cài đặt → Kết nối API"
                        disabled={chromeProfilesBusy}
                      >
                        <option value="">(Tự động / chưa chọn)</option>
                        {chromeProfiles.map((p) => (
                          <option key={p.slug} value={p.slug}>
                            {p.displayName || p.slug}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="classic-bar-slot classic-bar-slot--grow">
                      <span className="classic-bar-label">Ngôn ngữ</span>
                      <select className="input classic-bar-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                        {LANGUAGES.map((lang) => (
                          <option key={lang.id} value={lang.id}>
                            {lang.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="classic-bar-slot classic-bar-slot--grow">
                      <span className="classic-bar-label">Chất lượng</span>
                      <select
                        className="input classic-bar-select"
                        value={qualityPreset}
                        onChange={(e) => {
                          const next = e.target.value;
                          setQualityPreset(next);
                          const preset = QUALITY_PRESETS.find((q) => q.id === next);
                          if (preset) setResolution(preset.resolution);
                        }}
                      >
                        {QUALITY_PRESETS.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="classic-bar-slot classic-bar-slot--grow">
                      <span className="classic-bar-label">Model</span>
                      <select className="input classic-bar-select" value={model} onChange={(e) => setModel(e.target.value)}>
                        {MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="classic-bar-slot classic-bar-slot--grow">
                      <span className="classic-bar-label">Phong cách video</span>
                      <select
                        className="input classic-bar-select"
                        value={videoStylePresetId}
                        onChange={(e) => setVideoStylePresetId(e.target.value)}
                        title="Chọn thể loại / look camera — Tự động: chỉ theo mô tả của bạn + nhận diện người thật khi phù hợp"
                      >
                        {VIDEO_STYLE_PRESETS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="classic-bar-slot classic-bar-slot--grow">
                      <span className="classic-bar-label">Giọng đọc</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="input classic-bar-select"
                          style={{
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            background: '#000',
                            color: '#fff',
                            borderColor: 'rgba(255,255,255,0.22)',
                            height: 36.48,
                            paddingTop: 7,
                            paddingBottom: 7,
                            borderRadius: 8,
                          }}
                          onClick={() => {
                            setVoicePickerTab(voiceLibraryPick.source === 'community' ? 'community' : 'vbee');
                            setVoicePickerQ('');
                            setVoicePickerOpen(true);
                          }}
                          aria-label="Chọn giọng từ Thư viện giọng"
                          title="Chọn giọng từ Thư viện giọng"
                        >
                          <span style={{ opacity: voiceLibraryPick.code ? 1 : 0.8 }}>
                            {voiceLibraryPick.code ? `${voiceLibraryPick.name}` : 'Chọn trong Thư viện giọng…'}
                          </span>
                          <span aria-hidden="true" style={{ opacity: 0.9, color: '#fff' }}>
                            ▾
                          </span>
                        </button>
                      </div>
                    </label>
                    <div className="classic-bar-slot classic-bar-slot--fixed">
                      <span className="classic-bar-label classic-bar-label--spacer" aria-hidden="true">
                        {'\u00a0'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-primary classic-bar-control"
                        disabled={busy || (!effectiveHasGeminiKey && !(videoPrefs?.preferUltraProfile && videoPrefs?.preferredProfileSlug))}
                        onClick={runGeneration}
                      >
                        {busy ? 'Đang tạo video...' : 'Tạo video'}
                      </button>
                    </div>
                  </div>
                  {runError && <div className="flow-error">{runError}</div>}

                  {section === 'text-video' && (
                    <div
                      style={{
                        marginTop: '0.65rem',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'flex-end',
                        gap: '0.75rem',
                      }}
                    >
                      <div className="field text-video-scene-field" style={{ flex: '0 0 auto' }}>
                        <label htmlFor="text-video-scene-num">Phân cảnh (~8s/cảnh)</label>
                        <div className="text-video-scene-wrap">
                          <input
                            id="text-video-scene-num"
                            className="text-video-scene-num"
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            autoComplete="off"
                            title="Gõ số phân cảnh hoặc dùng mũi tên lên/xuống; rời ô sẽ chuẩn hoá 1–30 cảnh."
                            value={textVideoSceneInput}
                            onChange={(e) => setTextVideoSceneInput(e.target.value)}
                            onBlur={() => {
                              const x = Number.parseInt(String(textVideoSceneInput).trim(), 10);
                              if (!Number.isFinite(x) || x < 1) {
                                setTextVideoSceneInput('1');
                                return;
                              }
                              setTextVideoSceneInput(String(Math.min(TEXT_VIDEO_SCENE_COUNT_MAX, Math.max(1, x))));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {voicePickerOpen && (
                    <div
                      role="presentation"
                      style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.55)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 50,
                        padding: '1rem',
                      }}
                    >
                      <div
                        style={{
                          maxHeight: '90vh',
                          overflow: 'auto',
                          borderRadius: 14,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          boxShadow: '0 18px 60px rgba(0,0,0,0.35)',
                          padding: '1rem',
                        }}
                      >
                        <VoiceLibraryPanel
                          embedded
                          initialTab={voicePickerTab === 'community' ? 'community' : 'vbee'}
                          onClose={() => setVoicePickerOpen(false)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="row">
                    <div className="field">
                      <label>Tỷ lệ khung hình</label>
                      <select className="input" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                        {ASPECTS.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="path-output-video">Chọn thư mục lưu video</label>
                      <div className="path-input-wrap">
                        <input
                          id="path-output-video"
                          className="input path-input"
                          value={outputDir}
                          onChange={(e) => {
                            videoDirHandleRef.current = null;
                            setOutputDir(e.target.value);
                          }}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="btn btn-secondary path-input-folder"
                          title="Chọn thư mục"
                          aria-label="Chọn thư mục lưu video"
                          onClick={() => pickDirectoryPath(setOutputDir, videoDirHandleRef)}
                        >
                          <svg className="path-folder-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                            <path
                              fill="currentColor"
                              d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.89 2 1.99 2H20c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2zm0 2l1.83 2H20v11H4V6h6V4z"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {(section === 'image-video' || section === 'ingredients') && (
                      <div className="field">
                        <label htmlFor="path-output-image">Chọn thư mục lưu ảnh</label>
                        <div className="path-input-wrap">
                          <input
                            id="path-output-image"
                            className="input path-input"
                            value={imageOutputDir}
                            onChange={(e) => {
                              imageDirHandleRef.current = null;
                              setImageOutputDir(e.target.value);
                            }}
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            className="btn btn-secondary path-input-folder"
                            title="Chọn thư mục"
                            aria-label="Chọn thư mục lưu ảnh"
                            onClick={() => pickDirectoryPath(setImageOutputDir, imageDirHandleRef)}
                          >
                            <svg className="path-folder-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                              <path
                                fill="currentColor"
                                d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.89 2 1.99 2H20c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2zm0 2l1.83 2H20v11H4V6h6V4z"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="hint path-input-hint">
                    Nút thư mục: mở hộp thoại chọn thư mục của trình duyệt (thường chỉ cập nhật tên thư mục trên ô). Bạn có thể gõ hoặc dán đường dẫn Windows đầy đủ vào ô khi cần
                    {section === 'image-video' || section === 'ingredients' ? ' (video và ảnh).' : ' (lưu video).'}
                  </p>

                  {section === 'image-video' && (
                    <div className="row">
                      <div className="field">
                        <label>Ảnh khởi đầu (bắt buộc)</label>
                        <input className="input" type="file" accept="image/*" onChange={(e) => setStartFile(e.target.files?.[0] || null)} />
                      </div>
                      <div className="field">
                        <label>Ảnh khung cuối (tuỳ chọn)</label>
                        <input className="input" type="file" accept="image/*" onChange={(e) => setLastFile(e.target.files?.[0] || null)} />
                      </div>
                    </div>
                  )}

                  {section === 'ingredients' && (
                    <div className="field">
                      <label>Reference 1 — 3 (ảnh nhân vật / sản phẩm)</label>
                      <div className="row">
                        {[0, 1, 2].map((i) => (
                          <input
                            key={i}
                            className="input"
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const copy = [...refFiles];
                              copy[i] = e.target.files?.[0] || null;
                              setRefFiles(copy);
                            }}
                          />
                        ))}
                      </div>
                      <div className="hint">Upload tối đa 3 ảnh tham chiếu để giữ nhất quán nhân vật/cảnh.</div>
                    </div>
                  )}

                  {section === 'text-video' && (
                    <TextVideoResultsPanel
                      run={textVideoResultRun}
                      savedVideos={savedVideos}
                      busy={busy}
                      focusVideosKey={textVideoFocusVideosNonce}
                      generationLogs={logs}
                      runError={runError}
                      lastApiSourceLabel={lastApiSourceLabel}
                      onOpenPreview={(item) => setActivePreview({ id: item.id, src: item.src, name: item.name })}
                      onDownload={downloadSavedVideo}
                      onDelete={deleteSavedVideo}
                      onUpdateScenePrompt={handleTextVideoScenePromptUpdate}
                      onBulkReplacePrompts={handleTextVideoBulkPromptReplace}
                    />
                  )}
                    </>
                  )}
                </>
              )}

              {section !== 'text-video' && tab === 'logs' && (
                <>
                  {lastApiSourceLabel ? (
                    <div className="hint" style={{ marginBottom: '0.5rem' }}>
                      API/Profile lần submit gần nhất: <strong>{lastApiSourceLabel}</strong>
                    </div>
                  ) : null}
                  <div className="log-box">{logs || 'Chưa có nhật ký.'}</div>
                  {savedVideos.length > 0 && (
                    <div className="status-video-gallery">
                      {savedVideos.map((item) => (
                        <article key={item.id} className="status-video-card">
                          <div className="status-video-actions">
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => downloadSavedVideo(item.id)}
                            >
                              Tải về
                            </button>
                            <button type="button" className="btn btn-danger" onClick={() => deleteSavedVideo(item.id)}>
                              Xóa
                            </button>
                          </div>
                          <button
                            type="button"
                            className="status-video-preview-btn"
                            onClick={() => setActivePreview({ id: item.id, src: item.src, name: item.name })}
                          >
                            <video src={item.src} muted playsInline preload="metadata" />
                          </button>
                          <p className="status-video-name">{item.name}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {section === 'account' && <AccountPanel user={sessionUser} onUserUpdated={refreshSession} />}

          {section === 'service-plans' && <ServicePlansPanel />}

          {section === 'ecosystem' && (
            <div className="panel">
              <h3 style={{ marginTop: 0 }}>Tích hợp Google Flow / Workspace</h3>
              <ul className="info-list">
                <li>
                  <strong>Veo</strong>: sinh video từ prompt / ảnh / reference — có âm thanh gốc (thoại, hiệu ứng, nhạc theo mô tả).
                </li>
                <li>
                  <strong>Imagen / Nano Banana</strong>: sinh hoặc chỉnh ảnh trước khi đưa vào Veo (workflow text → ảnh → video).
                </li>
                <li>
                  <strong>Gemini</strong>: soạn prompt nâng cao, tách beat cảnh, storyboard — có thể làm ở{' '}
                  <a href="https://aistudio.google.com/" style={{ color: 'var(--blue)' }} target="_blank" rel="noreferrer">
                    Google AI Studio
                  </a>
                  .
                </li>
                <li>
                  Video dài hơn: API Veo hỗ trợ <strong>gia hạn</strong> clip đã tạo (mở rộng thêm ~7s mỗi lần, giới hạn theo tài liệu). Độ dài tối đa
                  thực tế phụ thuộc model và gói quota — không cố định “60s” trong code app.
                </li>
                <li>
                  Credit, dung lượng lớn (ví dụ 30TB), YouTube Premium… là <strong>đặc quyền theo gói trả phí của Google (Google AI / Workspace)</strong> — không do{' '}
                  <strong>Veo3 Pro</strong> (app này) cấp; xem pricing chính thức của Google.
                </li>
              </ul>
            </div>
          )}

          {section === 'settings' && (
            <div className="panel">
              <div className="panel-tabs" style={{ marginBottom: '0.75rem' }}>
                <button type="button" className={`tab ${settingsTab === 'general' ? 'active' : ''}`} onClick={() => setSettingsTab('general')}>
                  Cài đặt chung
                </button>
                <button type="button" className={`tab ${settingsTab === 'profile' ? 'active' : ''}`} onClick={() => setSettingsTab('profile')}>
                  Profile
                </button>
                <button type="button" className={`tab ${settingsTab === 'api' ? 'active' : ''}`} onClick={() => setSettingsTab('api')}>
                  Kết nối API
                </button>
                <button type="button" className={`tab ${settingsTab === 'logs' ? 'active' : ''}`} onClick={() => setSettingsTab('logs')}>
                  Logs
                </button>
              </div>

              {settingsTab === 'general' && (
                <>
                  <h3 style={{ marginTop: 0 }}>Cài đặt chung</h3>
                  <p className="hint" style={{ marginTop: '0.35rem' }}>
                    Lưu trên trình duyệt (nhanh, không lộ API). Các thông số này dùng để cá nhân hoá trải nghiệm.
                  </p>

                  <div className="row" style={{ marginTop: '1rem' }}>
                    <div className="field">
                      <label>Ngôn ngữ</label>
                      <select className="input" value={generalSettings.language} onChange={(e) => setGeneralSettings((p) => ({ ...p, language: e.target.value }))}>
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
                        onChange={(e) => setGeneralSettings((p) => ({ ...p, waitNextVideoSec: Number(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="field">
                      <label>Đợi tải (giây)</label>
                      <input
                        className="input"
                        type="number"
                        value={generalSettings.waitUploadSec}
                        onChange={(e) => setGeneralSettings((p) => ({ ...p, waitUploadSec: Number(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="field">
                      <label>Đợi khi lỗi/hết hạn (giây)</label>
                      <input
                        className="input"
                        type="number"
                        value={generalSettings.waitOnErrorSec}
                        onChange={(e) => setGeneralSettings((p) => ({ ...p, waitOnErrorSec: Number(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="field">
                      <label>Chế độ tăng tốc</label>
                      <select className="input" value={generalSettings.turboMode ? 'on' : 'off'} onChange={(e) => setGeneralSettings((p) => ({ ...p, turboMode: e.target.value === 'on' }))}>
                        <option value="on">Bật</option>
                        <option value="off">Tắt</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Số mục mỗi trang</label>
                      <select className="input" value={generalSettings.pageSize} onChange={(e) => setGeneralSettings((p) => ({ ...p, pageSize: Number(e.target.value) || 10 }))}>
                        {[5, 10, 20, 30, 50].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        try {
                          localStorage.setItem('veo3pro_general_settings_v1', JSON.stringify(generalSettings));
                        } catch {
                          /* ignore */
                        }
                        window.alert('Đã lưu cài đặt chung.');
                      }}
                    >
                      Lưu
                    </button>
                  </div>
                </>
              )}

              {settingsTab === 'profile' && (
                <>
                  <h3 style={{ marginTop: 0 }}>Profile</h3>
                  <p className="hint" style={{ marginTop: '0.35rem' }}>
                    Chrome portable: mỗi profile có thư mục Gmail/Cookie riêng. <strong>Kết nối API</strong> (Gemini / OpenAI / Grok, ưu tiên profile) cấu hình tại tab <strong>Kết nối API</strong>.
                  </p>

                  <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        setAddChromeProfileErr('');
                        setAddChromeProfileName('');
                        setAddChromeProfileProxy('');
                        setAddChromeProfileOpen(true);
                      }}
                    >
                      Thêm Profile
                    </button>
                  </div>

                  <div ref={chromeProfileDropdownRef} className="field" style={{ marginTop: '0.85rem', position: 'relative' }}>
                    <label htmlFor="chrome-profile-dropdown-trigger">Profile đã lưu</label>
                    <button
                      id="chrome-profile-dropdown-trigger"
                      type="button"
                      className="input"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        cursor:
                          chromeProfilesBusy || chromeProfiles.length === 0 ? 'not-allowed' : 'pointer',
                      }}
                      aria-expanded={chromeProfileDropdownOpen}
                      aria-haspopup="listbox"
                      disabled={chromeProfilesBusy || chromeProfiles.length === 0}
                      onClick={() => {
                        if (!chromeProfilesBusy && chromeProfiles.length > 0) {
                          setChromeProfileDropdownOpen((v) => !v);
                        }
                      }}
                    >
                      <span style={{ opacity: String(chromeProfileName || '').trim() ? 1 : 0.75 }}>
                        {chromeProfilesBusy
                          ? 'Đang tải…'
                          : chromeProfiles.length === 0
                            ? 'Chưa có profile'
                            : String(chromeProfileName || '').trim()
                              ? String(chromeProfileName).trim()
                              : 'Chọn profile…'}
                      </span>
                      <span aria-hidden="true" style={{ opacity: 0.75, flexShrink: 0 }}>
                        {chromeProfileDropdownOpen ? '▴' : '▾'}
                      </span>
                    </button>

                    {chromeProfileDropdownOpen && chromeProfiles.length > 0 && (
                      <div
                        role="listbox"
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: 'calc(100% + 4px)',
                          zIndex: 40,
                          maxHeight: 280,
                          overflowY: 'auto',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          background: 'var(--surface)',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                        }}
                      >
                        {chromeProfiles.map((p, idx) => (
                          <div
                            key={p.slug}
                            role="option"
                            aria-selected={String(chromeProfileName || '').trim() === String(p.displayName || p.slug).trim()}
                            onMouseEnter={() => setChromeProfileHoverSlug(p.slug)}
                            onMouseLeave={() => setChromeProfileHoverSlug('')}
                            style={{
                              display: 'flex',
                              alignItems: 'stretch',
                              borderTop: idx ? '1px solid rgba(42, 49, 68, 0.55)' : 'none',
                              background:
                                chromeProfileHoverSlug === p.slug
                                  ? 'rgba(148, 163, 184, 0.14)'
                                  : 'transparent',
                              transition: 'background 120ms ease',
                            }}
                          >
                            <button
                              type="button"
                              title="Chọn profile này (đưa xuống form bên dưới)"
                              onClick={() => {
                                setChromeProfileName(p.displayName || p.slug);
                                setChromeProfileProxyUrl(p.proxyUrl || '');
                                setChromeProfileAccountsText(p.accountsText || '');
                                setGeneralSettings((x) => ({ ...x, proxyUrl: p.proxyUrl || '' }));
                                setChromeProfileDropdownOpen(false);
                              }}
                              style={{
                                flex: '1 1 auto',
                                minWidth: 0,
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0.55rem 0.7rem',
                                border: 'none',
                                borderRadius: 0,
                                background: 'transparent',
                                color: 'inherit',
                                fontFamily: 'inherit',
                                fontSize: 'inherit',
                                textAlign: 'left',
                                cursor: 'pointer',
                              }}
                            >
                              <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{p.displayName || p.slug}</span>
                            </button>
                            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0.45rem 0.65rem 0.45rem 0' }}>
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.78rem' }}
                                disabled={chromeProfileOpenedSlug === p.slug}
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  try {
                                    const displayName = p.displayName || p.slug;
                                    const proxy = String(p.proxyUrl || '').trim();
                                    setChromeProfileName(displayName);
                                    setChromeProfileProxyUrl(proxy);
                                    setGeneralSettings((x) => ({ ...x, proxyUrl: proxy }));
                                    setChromeProfileDropdownOpen(false);
                                    const out = await openChromePortableProfile(displayName, proxy);
                                    setChromeProfileOpenedSlug(p.slug);
                                    window.alert(
                                      `Đã mở Chrome profile riêng.\nFolder dữ liệu: ${out?.profileDir || '—'}`,
                                    );
                                    const items = await fetchChromePortableProfiles().catch(() => null);
                                    if (items) setChromeProfiles(items);
                                  } catch (err) {
                                    window.alert(err.message || 'Không mở được Chrome profile.');
                                  }
                                }}
                                title="Mở Chrome với profile này"
                              >
                                {chromeProfileOpenedSlug === p.slug ? 'Đang mở' : 'Mở'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="row" style={{ marginTop: '0.85rem' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Tên profile</label>
                      <input
                        className="input"
                        value={chromeProfileName}
                        onChange={(e) => setChromeProfileName(e.target.value)}
                        placeholder="VD: gmail-phu-01"
                        autoComplete="off"
                      />
                      <div className="hint">Dùng để tạo thư mục riêng: `Veo3Pro-ChromeProfiles\\&lt;tên&gt;` trong user Windows.</div>
                    </div>
                  </div>

                  <div className="row" style={{ marginTop: '0.65rem' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Proxy cho profile này</label>
                      <input
                        className="input"
                        value={chromeProfileProxyUrl}
                        onChange={(e) => setChromeProfileProxyUrl(e.target.value)}
                        placeholder="VD: http://user:pass@ip:port"
                        autoComplete="off"
                      />
                      <div className="hint">Mỗi profile có proxy riêng. Khi mở profile, app sẽ dùng proxy này cho Gemini/OpenAI/Vbee.</div>
                    </div>
                  </div>

                  <div className="row" style={{ marginTop: '0.65rem' }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Danh sách tài khoản (mỗi dòng: user|pass|site)</label>
                      <textarea
                        className="input"
                        style={{ minHeight: 120, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
                        value={chromeProfileAccountsText}
                        onChange={(e) => setChromeProfileAccountsText(e.target.value)}
                        placeholder="vd:\nemail1@gmail.com|pass123|youtube\nemail2@gmail.com|pass456|gmail"
                        autoComplete="off"
                      />
                      <div className="hint">Dữ liệu này lưu theo từng profile và chỉ user của bạn xem được.</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={!String(chromeProfileProxyUrl || '').trim()}
                      onClick={async () => {
                        try {
                          const proxyRaw = String(chromeProfileProxyUrl || '').trim();

                          // 1) Browser-side IP (what the current Chrome profile sees).
                          let browserIp = '—';
                          try {
                            const r = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
                            const j = await r.json().catch(() => ({}));
                            if (r.ok && j?.ip) browserIp = String(j.ip).trim();
                          } catch {
                            // ignore
                          }

                          // 2) Server-side IP via the configured proxy (what Gemini/OpenAI/Vbee will use).
                          let serverIp = '—';
                          let serverErr = '';
                          try {
                            const out = await proxyIpCheck(proxyRaw);
                            if (out?.ip) serverIp = String(out.ip).trim();
                          } catch (e) {
                            serverErr = String(e?.message || 'fetch failed');
                          }

                          window.alert(
                            `IP (Chrome/profile): ${browserIp}\n` +
                              `IP (Server qua proxy): ${serverIp}${serverErr ? `\n\nLỗi server test: ${serverErr}` : ''}`
                          );
                        } catch (e) {
                          window.alert(e?.message || 'Không test được proxy.');
                        }
                      }}
                    >
                      Test IP proxy
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={async () => {
                        try {
                          const name = String(chromeProfileName || '').trim();
                          const proxy = String(chromeProfileProxyUrl || '').trim();
                          await saveChromePortableProfile(name, proxy, String(chromeProfileAccountsText || ''));
                          setGeneralSettings((p) => ({ ...p, proxyUrl: proxy }));
                          const items = await fetchChromePortableProfiles().catch(() => null);
                          if (items) setChromeProfiles(items);
                          window.alert('Đã lưu profile + proxy.');
                        } catch (e) {
                          window.alert(e.message || 'Không lưu được profile.');
                        }
                      }}
                      disabled={!String(chromeProfileName || '').trim()}
                    >
                      Lưu
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={async () => {
                        try {
                          // Lưu + mở profile, đồng thời cập nhật proxy theo profile.
                          const out = await openChromePortableProfile(
                            chromeProfileName,
                            chromeProfileProxyUrl,
                            String(chromeProfileAccountsText || ''),
                          );
                          // Best-effort mark this profile as opened in UI.
                          try {
                            const name = String(chromeProfileName || '').trim();
                            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
                            if (slug) setChromeProfileOpenedSlug(slug);
                          } catch {
                            /* ignore */
                          }
                          setGeneralSettings((p) => ({ ...p, proxyUrl: String(chromeProfileProxyUrl || '').trim() }));
                          window.alert(
                            `Đã mở Chrome profile riêng.\n\n` +
                              `Folder dữ liệu: ${out?.profileDir || '—'}\n` +
                              `Proxy mode: ${out?.proxyMode || '—'}\n` +
                              `Extension: ${out?.extDir || '—'}\n` +
                              `Bypass: ${out?.bypass ? 'OK' : '—'}`
                          );
                          const items = await fetchChromePortableProfiles().catch(() => null);
                          if (items) setChromeProfiles(items);
                        } catch (e) {
                          window.alert(e.message || 'Không mở được Chrome profile.');
                        }
                      }}
                      disabled={!String(chromeProfileName || '').trim()}
                    >
                      Mở Profile Chrome riêng
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={!String(chromeProfileName || '').trim()}
                      onClick={async () => {
                        const name = String(chromeProfileName || '').trim();
                        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
                        if (!slug) return;
                        if (!window.confirm(`Xóa profile khỏi danh sách?\\n\\n${name}`)) return;
                        try {
                          await deleteChromePortableProfile(slug);
                          const items = await fetchChromePortableProfiles().catch(() => []);
                          setChromeProfiles(items || []);
                          window.alert('Đã xóa khỏi danh sách.');
                        } catch (err) {
                          window.alert(err.message || 'Không xóa được profile.');
                        }
                      }}
                    >
                      Xóa khỏi danh sách
                    </button>
                  </div>

                  <p className="hint" style={{ marginTop: '0.65rem' }}>
                    Lưu ý: nút này sẽ mở Chrome profile riêng trên chính máy đang chạy server (Laragon). Nếu bạn deploy lên hosting, nó sẽ mở Chrome ở máy server (không dùng được cho client).
                  </p>

                  {addChromeProfileOpen && (
                    <div
                      role="presentation"
                      style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.55)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                        zIndex: 120,
                      }}
                    >
                      <div
                        role="dialog"
                        aria-label="Thêm profile"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: 'min(680px, 100%)',
                          borderRadius: 14,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          padding: '1rem',
                          boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                          <h3 style={{ margin: 0 }}>Thêm Profile</h3>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setAddChromeProfileOpen(false)}
                            disabled={addChromeProfileBusy}
                          >
                            Đóng
                          </button>
                        </div>

                        <div className="field" style={{ marginTop: '0.85rem' }}>
                          <label>Tên profile *</label>
                          <input
                            className="input"
                            value={addChromeProfileName}
                            onChange={(e) => setAddChromeProfileName(e.target.value)}
                            placeholder="VD: gmail-phu-01"
                            autoComplete="off"
                          />
                        </div>

                        <div className="field" style={{ marginTop: '0.65rem' }}>
                          <label>Proxy (tuỳ chọn)</label>
                          <input
                            className="input"
                            value={addChromeProfileProxy}
                            onChange={(e) => setAddChromeProfileProxy(e.target.value)}
                            placeholder="VD: http://user:pass@ip:port"
                            autoComplete="off"
                          />
                          <div className="hint">Không bắt buộc. Bỏ trống vẫn lưu được profile.</div>
                        </div>

                        {addChromeProfileErr ? <div className="flow-error">{addChromeProfileErr}</div> : null}

                        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={addChromeProfileBusy || !String(addChromeProfileName || '').trim()}
                            onClick={async () => {
                              setAddChromeProfileErr('');
                              setAddChromeProfileBusy(true);
                              try {
                                const name = String(addChromeProfileName || '').trim();
                                const proxy = String(addChromeProfileProxy || '').trim();
                                const saved = await saveChromePortableProfile(name, proxy);
                                const items = await fetchChromePortableProfiles().catch(() => null);
                                if (items) setChromeProfiles(items);
                                // Focus newly saved profile in the main fields
                                setChromeProfileName(saved?.displayName || name);
                                setChromeProfileProxyUrl(saved?.proxyUrl || proxy);
                                setGeneralSettings((p) => ({ ...p, proxyUrl: saved?.proxyUrl || proxy || '' }));
                                setAddChromeProfileOpen(false);
                                window.alert('Đã lưu profile thành công.');
                              } catch (e) {
                                setAddChromeProfileErr(e.message || 'Không lưu được profile.');
                              } finally {
                                setAddChromeProfileBusy(false);
                              }
                            }}
                          >
                            {addChromeProfileBusy ? 'Đang lưu…' : 'Lưu'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {settingsTab === 'logs' && (
                <>
                  <h3 style={{ marginTop: 0 }}>Logs</h3>
                  <p className="hint" style={{ marginTop: '0.35rem' }}>
                    Thông báo lỗi và tiến trình gần đây.
                  </p>
                  <div className="log-box" style={{ marginTop: '0.75rem' }}>
                    {logs || 'Chưa có nhật ký.'}
                  </div>
                </>
              )}

              {settingsTab === 'api' && (
                <>
                  <h3 style={{ marginTop: 0 }}>Kết nối API</h3>
                  <p className="hint" style={{ marginTop: '0.35rem' }}>
                    <strong>Thứ tự trừ quota / billing:</strong> (1) Nếu bật{' '}
                    <em>Gmail / Ultra web</em> bên dưới → tạo video qua trình duyệt Gemini (quota Google account đã đăng nhập trong Chrome portable).{' '}
                    (2) Các chức năng dùng API key: key trong <strong>Cài đặt</strong> theo Chrome profile và tài khoản — ưu tiên profile đang chọn và API đã bật.{' '}
                    (3) Chỉ khi <strong>không có</strong> key nào trong (2), server mới dùng{' '}
                    <code>GEMINI_API_KEY</code> / <code>OPENAI_API_KEY</code> trong file <code>.env</code>.
                  </p>

                  <div
                    style={{
                      marginTop: '0.95rem',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 12,
                      border: '1px solid rgba(148, 163, 184, 0.25)',
                      background: 'rgba(15, 23, 42, 0.35)',
                    }}
                  >
                    <h4 style={{ margin: 0 }}>Trừ quota qua Gmail (Gemini web / Ultra)</h4>
                    <p className="hint" style={{ marginTop: '0.35rem', lineHeight: 1.45 }}>
                      Áp cho luồng <strong>Tạo video (Ultra)</strong>: mở <code>gemini.google.com</code> trong Chrome portable — không tốn API Studio key. Profile phải đã đăng nhập Gmail/Ultra trong Chrome đó.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center', marginTop: '0.5rem' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(videoPrefs.preferUltraProfile)}
                          disabled={videoPrefsBusy}
                          onChange={(e) => setVideoPrefs((p) => ({ ...p, preferUltraProfile: e.target.checked }))}
                        />
                        Bật ưu tiên Ultra (Gmail web)
                      </label>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={videoPrefsBusy}
                        onClick={async () => {
                          try {
                            setVideoPrefsBusy(true);
                            const saved = await saveVideoPrefs(videoPrefs);
                            setVideoPrefs(saved);
                            window.alert('Đã lưu cấu hình Gmail Ultra.');
                            checkHealth().then(setHealth).catch(() => {});
                          } catch (e) {
                            window.alert(e.message || 'Không lưu được.');
                          } finally {
                            setVideoPrefsBusy(false);
                          }
                        }}
                      >
                        {videoPrefsBusy ? 'Đang lưu…' : 'Lưu Ultra'}
                      </button>
                    </div>
                    <div className="field" style={{ marginTop: '0.65rem', marginBottom: 0 }}>
                      <label style={{ marginBottom: '0.25rem', display: 'block' }}>Profile Chrome cho Ultra</label>
                      <select
                        className="input"
                        style={{ width: '100%', maxWidth: 420 }}
                        value={videoPrefs.preferredProfileSlug || ''}
                        disabled={videoPrefsBusy || chromeProfilesBusy}
                        onChange={(e) =>
                          setVideoPrefs((p) => ({ ...p, preferredProfileSlug: e.target.value }))
                        }
                      >
                        <option value="">(Chọn profile)</option>
                        {chromeProfiles.map((p) => (
                          <option key={p.slug} value={p.slug}>
                            {p.displayName || p.slug}
                          </option>
                        ))}
                      </select>
                      <div className="hint" style={{ marginTop: '0.35rem' }}>
                        Tạo trước profile ở tab <strong>Profile</strong>; API key Gemini REST cấu hình khối “Đã kết nối” bên dưới.
                      </div>
                    </div>
                  </div>

              <div style={{ marginTop: '1rem' }}>
                {(() => {
                  const slugPick = String(activeApiProfileSlug || '').trim();
                  const chromeNm = slugPick
                    ? chromeProfiles.find((p) => p.slug === slugPick)?.displayName || slugPick
                    : '';
                  const rk = revealedChromeKeys;
                  const profileAe = rk?.apiEnabled || { gemini: true, grok: true, openAi: true };
                  const profileHasAnyKey =
                    Boolean(rk?.geminiApiKey?.trim()) ||
                    Boolean(rk?.openAiApiKey?.trim()) ||
                    Boolean(rk?.grokApiKey?.trim()) ||
                    Boolean(rk?.grokBaseUrl?.trim());

                  function KeyOneRow({
                    rowId,
                    profileTitle,
                    apiTitle,
                    rawValue,
                    enabled,
                    onToggleEnabled,
                    flagPayload,
                    deletePatch,
                  }) {
                    const raw = String(rawValue || '').trim();
                    if (!raw) return null;
                    const show = Boolean(keyShowById[rowId]);
                    const busy = apiFlagBusy === rowId || apiFlagBusy === `del-${rowId}`;
                    return (
                      <div
                        style={{
                          marginTop: '0.65rem',
                          padding: '0.5rem 0',
                          borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: '0.86rem',
                            lineHeight: 1.3,
                            flex: '0 1 11rem',
                            minWidth: '8rem',
                          }}
                        >
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
                        <label
                          title="Bật: ưu tiên gọi API bằng key của profile đang chọn — credit/quota (Google AI Studio, OpenAI, xAI…) tính trên key đó. Tắt: không dùng key này, server thử profile khác rồi .env."
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontSize: '0.8rem',
                            cursor: busy ? 'wait' : 'pointer',
                            userSelect: 'none',
                            flex: '0 0 auto',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={busy}
                            onChange={(e) => onToggleEnabled(e.target.checked, flagPayload)}
                          />
                          <span>API</span>
                        </label>
                        <input
                          className="input"
                          readOnly
                          type={show ? 'text' : 'password'}
                          value={raw}
                          style={{
                            flex: '1 1 10rem',
                            minWidth: '6rem',
                            fontFamily: 'ui-monospace, monospace',
                            fontSize: '0.78rem',
                          }}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ whiteSpace: 'nowrap', flex: '0 0 auto' }}
                          disabled={busy}
                          onClick={() => setKeyShowById((p) => ({ ...p, [rowId]: !p[rowId] }))}
                        >
                          {show ? 'Ẩn' : 'Show'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ whiteSpace: 'nowrap', flex: '0 0 auto', fontSize: '0.82rem' }}
                          disabled={busy}
                          onClick={async () => {
                            if (!window.confirm(`Xóa ${apiTitle} khỏi profile này?`)) return;
                            setApiFlagBusy(`del-${rowId}`);
                            try {
                              await patchChromeProfileKeys({ slug: slugPick, ...deletePatch });
                              bumpRevealKeys();
                              bumpChromeProfilesList();
                              const st = await fetchChromeProfileKeyStatus(slugPick);
                              setProfileKeyStatus(st);
                              setKeyShowById((p) => {
                                const next = { ...p };
                                delete next[rowId];
                                return next;
                              });
                              checkHealth().then(setHealth).catch(() => {});
                            } catch (e) {
                              window.alert(e.message || 'Không xóa được key.');
                            } finally {
                              setApiFlagBusy('');
                            }
                          }}
                        >
                          Xóa key
                        </button>
                      </div>
                    );
                  }

                  async function handleFlagChrome(checked, { slug, kind }) {
                    const id = `chrome-${slug}-${kind}`;
                    setApiFlagBusy(id);
                    try {
                      const body =
                        kind === 'gemini'
                          ? { geminiEnabled: checked }
                          : kind === 'openai'
                            ? { openAiEnabled: checked }
                            : { grokEnabled: checked };
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

                  return (
                    <div
                      style={{
                        padding: '0.75rem 0.85rem',
                        borderRadius: 12,
                        border: '1px solid rgba(148, 163, 184, 0.25)',
                        background: 'rgba(15, 23, 42, 0.35)',
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>Đã kết nối</div>

                      {revealKeysLoading ? (
                        <div className="hint" style={{ marginTop: '0.65rem' }}>
                          Đang tải key đã lưu (chỉ bạn đăng nhập thấy)…
                        </div>
                      ) : null}

                      {slugPick ? (
                        <div style={{ marginTop: '0.85rem' }}>
                          {profileHasAnyKey ? (
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
                              />
                            </>
                          ) : (
                            <div className="hint" style={{ marginTop: '0.35rem' }}>
                              Chưa có key API nào lưu cho profile này — điền phía dưới rồi bấm “Lưu key (theo profile)”.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="hint" style={{ marginTop: '0.65rem' }}>
                          Chọn một Chrome profile ở mục dưới để xem / chỉnh key.
                        </div>
                      )}

                      <div className="hint" style={{ marginTop: '0.65rem' }}>
                        Trạng thái hiện tại: Gemini {effectiveHasGeminiKey ? '✓' : '✗'} · Grok {keyStatus.hasGrok ? '✓' : '✗'} · OpenAI{' '}
                        {effectiveHasOpenAiKey ? '✓' : '✗'}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div style={{ marginTop: '1.25rem' }}>
                <h4 style={{ margin: 0 }}>API theo Chrome Profile (Ultral)</h4>
                <p className="hint" style={{ marginTop: '0.35rem' }}>
                  Nếu bạn có nhiều Gmail (ví dụ Gmail Ultral), hãy chọn 1 Chrome profile và lưu key cho profile đó. Khi gọi API, server sẽ <strong>ưu tiên key của profile đang chọn</strong>, rồi các profile khác (đã bật API), sau đó key tài khoản nếu có, và cuối cùng <code>.env</code>.
                </p>

                <div className="row" style={{ marginTop: '0.75rem' }}>
                  <div className="field">
                    <label>Profile đang dùng cho API</label>
                    <select
                      className="input"
                      value={activeApiProfileSlug || ''}
                      onChange={(e) => setActiveApiProfileSlug(e.target.value)}
                      disabled={chromeProfilesBusy}
                    >
                      <option value="">(Không chọn profile — fallback tài khoản / .env)</option>
                      {chromeProfiles.map((p) => (
                        <option key={p.slug} value={p.slug}>
                          {p.displayName || p.slug}
                          {p?.keyStatus?.hasGemini || p?.keyStatus?.hasGrok || p?.keyStatus?.hasOpenAi ? '  ✓' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="hint">
                      Lưu ý: đây là “profile chọn để lấy API key”, không phải tài khoản đăng ký app.
                    </div>
                  </div>
                </div>

                <div className="row" style={{ marginTop: '0.65rem' }}>
                  <div className="field">
                    <label>Gemini API Key (theo profile)</label>
                    <input
                      className="input"
                      type="password"
                      value={profileKeyUi.geminiApiKey}
                      onChange={(e) => setProfileKeyUi((p) => ({ ...p, geminiApiKey: e.target.value }))}
                      placeholder={profileKeyStatus.hasGemini ? 'Đã lưu (nhập key mới để thay)' : 'AIza...'}
                      autoComplete="off"
                      disabled={!activeApiProfileSlug}
                    />
                  </div>
                  <div className="field">
                    <label>OpenAI API Key (theo profile)</label>
                    <input
                      className="input"
                      type="password"
                      value={profileKeyUi.openAiApiKey}
                      onChange={(e) => setProfileKeyUi((p) => ({ ...p, openAiApiKey: e.target.value }))}
                      placeholder={profileKeyStatus.hasOpenAi ? 'Đã lưu (nhập key mới để thay)' : 'sk-...'}
                      autoComplete="off"
                      disabled={!activeApiProfileSlug}
                    />
                  </div>
                </div>

                <div className="row">
                  <div className="field">
                    <label>Grok API Key (theo profile)</label>
                    <input
                      className="input"
                      type="password"
                      value={profileKeyUi.grokApiKey}
                      onChange={(e) => setProfileKeyUi((p) => ({ ...p, grokApiKey: e.target.value }))}
                      placeholder={profileKeyStatus.hasGrok ? 'Đã lưu (nhập key mới để thay)' : 'xai-...'}
                      autoComplete="off"
                      disabled={!activeApiProfileSlug}
                    />
                  </div>
                  <div className="field">
                    <label>Grok Base URL (theo profile)</label>
                    <input
                      className="input"
                      value={profileKeyUi.grokBaseUrl}
                      onChange={(e) => setProfileKeyUi((p) => ({ ...p, grokBaseUrl: e.target.value }))}
                      placeholder="VD: https://api.x.ai/v1"
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
                        window.alert('Đã lưu API key cho Chrome profile này.');
                        bumpRevealKeys();
                        fetchChromePortableProfiles().then(setChromeProfiles).catch(() => {});
                        checkHealth().then(setHealth).catch(() => {});
                      } catch (e) {
                        window.alert(e.message || 'Lưu key cho profile thất bại');
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
                        window.alert('Đã xoá API key của Chrome profile này.');
                        bumpRevealKeys();
                        fetchChromePortableProfiles().then(setChromeProfiles).catch(() => {});
                        checkHealth().then(setHealth).catch(() => {});
                      } catch (e) {
                        window.alert(e.message || 'Xoá key của profile thất bại');
                      } finally {
                        setProfileKeyBusy(false);
                      }
                    }}
                  >
                    Xóa key (theo profile)
                  </button>
                </div>

                <div className="hint" style={{ marginTop: '0.75rem' }}>
                  Trạng thái profile: Gemini {profileKeyStatus.hasGemini ? '✓' : '✗'} · Grok {profileKeyStatus.hasGrok ? '✓' : '✗'} · OpenAI {profileKeyStatus.hasOpenAi ? '✓' : '✗'}
                </div>
              </div>

              <p style={{ marginTop: '1.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={handleLogout}>
                  Đăng xuất khỏi tài khoản
                </button>
              </p>
                </>
              )}
            </div>
          )}
        </div>

        {activePreview && (
          <div className="video-modal-backdrop" onClick={() => setActivePreview(null)}>
            <div className="video-modal" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="btn btn-secondary video-modal-close" onClick={() => setActivePreview(null)}>
                Close
              </button>
              <video src={activePreview.src} controls autoPlay playsInline />
            </div>
          </div>
        )}

        <footer className="footer">© {new Date().getFullYear()} VEO3 PRO — Gemini API / Veo · Không liên kết chính thức với Google.</footer>
      </div>
    </div>
  );
}
