/**
 * Prompt Studio — curated style / pacing / tone / humor bundles (UI presets).
 * `style` must match `STYLE_OPTIONS` in `PromptStudioPanel.jsx`.
 */

export const PRESET_NONE_ID = 'none' as const;

export type PromptStudioPresetId = 'tiktok_education' | 'cinematic_story' | 'viral_short' | 'book_sales_story' | 'movie_review_story';

export type PromptStudioPresetSelectableId = typeof PRESET_NONE_ID | PromptStudioPresetId;

export interface PromptStudioPresetPacing {
  /** Target clip length (seconds) */
  duration: number;
  /** Frame aspect */
  ratio: string;
  /** Short pacing note merged into “Bối cảnh ưu tiên” when preset is applied */
  hint: string;
}

export interface PromptStudioPreset {
  id: PromptStudioPresetId;
  /** Dropdown label */
  labelVi: string;
  /** One-line tooltip */
  descriptionVi: string;
  style: string;
  pacing: PromptStudioPresetPacing;
  /** Tone / delivery — merged into context with pacing hint */
  tone: string;
  humorLevel: number;
}

export const PROMPT_STUDIO_PRESETS: readonly PromptStudioPreset[] = [
  {
    id: 'tiktok_education',
    labelVi: 'TikTok — Giáo dục',
    descriptionVi: 'Dọc 9:16, nhịp dạy nhanh, ít hài',
    style: 'Giáo dục',
    pacing: {
      duration: 8,
      ratio: '9:16',
      hint: 'Clip ~8s: hook rõ ngay, một ý một nhịp, lặp từ khóa chốt ở cuối.',
    },
    tone: 'Rõ ràng, dễ hiểu, khuyến khích tư duy phản biện lành mạnh; tránh giọng sách giáo khô.',
    humorLevel: 15,
  },
  {
    id: 'cinematic_story',
    labelVi: 'Điện ảnh — Câu chuyện',
    descriptionVi: 'Ngang 16:9, nhịp phim, hài vừa phải',
    style: 'Kịch tính',
    pacing: {
      duration: 8,
      ratio: '16:9',
      hint: 'Clip ~8s: một beat hình rõ, ánh sáng có ý đồ; continuity với cảnh liền kề.',
    },
    tone: 'Điện ảnh, cảm xúc có chiều sâu, ưu tiên continuity và ánh sáng có ý đồ.',
    humorLevel: 22,
  },
  {
    id: 'viral_short',
    labelVi: 'Viral — Ngắn gọn',
    descriptionVi: 'Dọc 9:16, twist nhanh, hài cao',
    style: 'Hài hước',
    pacing: {
      duration: 8,
      ratio: '9:16',
      hint: 'Nhịp viral: twist sớm, tăng tốc về cuối, câu chốt dễ share.',
    },
    tone: 'Viral, kích thích tò mò, giọng gần gũi Gen Z; hook mạnh, không lan man.',
    humorLevel: 55,
  },
  {
    id: 'book_sales_story',
    labelVi: 'Bán sách — Câu chuyện',
    descriptionVi: 'Dọc 9:16, kể chuyện ngắn, CTA mua sách',
    style: 'Cảm động',
    pacing: {
      duration: 8,
      ratio: '9:16',
      hint: 'Kể chuyện 8s: hook 0–1s (vấn đề), 1–6s (tình huống/bài học), 6–8s (chốt + CTA). Đọc rõ tên sách/tác giả nếu có.',
    },
    tone: 'Giọng kể chuyện gần gũi, chân thật; tập trung cảm xúc và lợi ích đọc sách; tránh văn hoa dài dòng.',
    humorLevel: 10,
  },
  {
    id: 'movie_review_story',
    labelVi: 'Review phim — Câu chuyện',
    descriptionVi: 'Dọc 9:16, review không spoil, chốt đáng xem',
    style: 'Kịch tính',
    pacing: {
      duration: 8,
      ratio: '9:16',
      hint: 'Review 8s: 0–1s hook (thể loại/cảm xúc), 1–6s (3 điểm chính), 6–8s (kết luận + CTA “xem/không xem”). Không spoil tình tiết.',
    },
    tone: 'Review mạch lạc, có quan điểm, không spoil; nhấn diễn xuất/nhịp/điểm độc đáo; kết bằng verdict.',
    humorLevel: 15,
  },
];

export function getPromptStudioPreset(id: string): PromptStudioPreset | undefined {
  return PROMPT_STUDIO_PRESETS.find((p) => p.id === id);
}

/** Builds the “Bối cảnh ưu tiên” line from preset tone + pacing hint */
export function buildPresetContextBlock(preset: PromptStudioPreset): string {
  return [preset.tone, preset.pacing.hint].filter(Boolean).join(' | ');
}

export const PROMPT_STUDIO_PRESET_DROPDOWN: readonly { id: PromptStudioPresetSelectableId; labelVi: string }[] = [
  { id: PRESET_NONE_ID, labelVi: 'Tuỳ chỉnh (không preset)' },
  ...PROMPT_STUDIO_PRESETS.map((p) => ({ id: p.id, labelVi: p.labelVi })),
];
