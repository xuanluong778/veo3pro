/**
 * Giọng cộng đồng (mẫu UI — voice_code gợi ý; đối chiếu Studio Vbee khi tích hợp API).
 * Thịnh hành / Nổi bật / Mới nhất theo layout tham chiếu.
 */

/** @typedef {{ users: string, volume: string, period: string }} CommunityStats */

/** Hàng Thịnh hành — có badge Nổi bật + bộ chỉ số đầy đủ */
export const COMMUNITY_TRENDING = [
  {
    id: 'cm-thien-tam',
    voiceCode: 's_sg_male_thientam_ytstable_vc',
    name: 'Thiện Tâm',
    description: 'Đọc truyện • Nam • Thanh niên',
    language: 'Tiếng Việt',
    region: 'Miền Nam',
    field: 'Đọc truyện',
    badge: 'Nổi bật',
    stats: { users: '8,8 N', volume: '3,1 Tỷ', period: '60 ngày' },
  },
  {
    id: 'cm-nguyet-nga-podcast',
    voiceCode: 'n_hanoi_female_nguyetnga2_book_vc',
    name: 'Nguyệt Nga Podcast',
    description: 'Podcast • Nữ • Trưởng thành',
    language: 'Tiếng Việt',
    region: 'Miền Nam',
    field: 'Giải trí',
    badge: null,
    stats: { users: '5,2 N', volume: '1,8 Tỷ', period: '60 ngày' },
  },
  {
    id: 'cm-ngan-ke-chuyen',
    voiceCode: 'n_hn_male_ngankechuyen_ytstable_vc',
    name: 'Ngạn Kể Chuyện',
    description: 'Kể chuyện • Nam • Trung niên',
    language: 'Tiếng Việt',
    region: 'Miền Bắc',
    field: 'Giải trí',
    badge: null,
    stats: { users: '6,1 N', volume: '2,4 Tỷ', period: '60 ngày' },
  },
  {
    id: 'cm-phong-vien-nam',
    voiceCode: 'n_hanoi_male_nhabaohoangnam_news_vc',
    name: 'Phóng viên Nam',
    description: 'Tin tức • Nam • Người lớn',
    language: 'Tiếng Việt',
    region: 'Miền Bắc',
    field: 'Tin tức',
    badge: null,
    stats: { users: '4,3 N', volume: '980 Tr', period: '60 ngày' },
  },
  {
    id: 'cm-huisheng',
    voiceCode: 'n_thainguyen_male_huisheng_story_vc',
    name: 'HuiSheng',
    description: 'Song ngữ • Nam • Thanh niên',
    language: 'Tiếng Việt',
    region: 'Miền Nam',
    field: 'Giáo dục',
    badge: null,
    stats: { users: '3,0 N', volume: '720 Tr', period: '45 ngày' },
  },
];

/** Thẻ Nổi bật — lưới, có category + stats gọn */
export const COMMUNITY_FEATURED = [
  {
    id: 'cm-thien-tam',
    voiceCode: 's_sg_male_thientam_ytstable_vc',
    name: 'Thiện Tâm',
    description: 'Đọc truyện • Nam • Thanh niên',
    cardCategory: 'Sách nói',
    language: 'Tiếng Việt',
    region: 'Miền Nam',
    field: 'Đọc truyện',
    stats: { users: '8,8 N', volume: '3,1 Tỷ' },
  },
  {
    id: 'cm-ngan-ke-chuyen',
    voiceCode: 'n_hn_male_ngankechuyen_ytstable_vc',
    name: 'Ngạn Kể Chuyện',
    description: 'Kể chuyện • Nam • Trung niên',
    cardCategory: 'Giải trí',
    language: 'Tiếng Việt',
    region: 'Miền Bắc',
    field: 'Giải trí',
    stats: { users: '6,1 N', volume: '2,4 Tỷ' },
  },
  {
    id: 'cm-nguyet-nga-podcast',
    voiceCode: 'n_hanoi_female_nguyetnga2_book_vc',
    name: 'Nguyệt Nga Podcast',
    description: 'Podcast • Nữ • Trưởng thành',
    cardCategory: 'Podcast',
    language: 'Tiếng Việt',
    region: 'Miền Nam',
    field: 'Giải trí',
    stats: { users: '5,2 N', volume: '1,8 Tỷ' },
  },
  {
    id: 'cm-duy-onyx',
    voiceCode: 'community_duy_onyx_narrative_48k',
    name: 'Duy Onyx',
    description: 'Review • Nam • Thanh niên',
    cardCategory: 'Giải trí',
    language: 'Tiếng Việt',
    region: 'Miền Nam',
    field: 'Giải trí',
    stats: { users: '2,7 N', volume: '540 Tr' },
  },
  {
    id: 'cm-hn-bao-trung',
    voiceCode: 'community_hn_bao_trung_tintuc_48k',
    name: 'HN Bảo Trung',
    description: 'Tin tức • Nam • Trưởng thành',
    cardCategory: 'Tin tức',
    language: 'Tiếng Việt',
    region: 'Miền Bắc',
    field: 'Tin tức',
    stats: { users: '3,9 N', volume: '1,1 Tỷ' },
  },
  {
    id: 'cm-phong-vien-nam',
    voiceCode: 'n_hanoi_male_nhabaohoangnam_news_vc',
    name: 'Phóng viên Nam',
    description: 'Tin tức • Nam • Người lớn',
    cardCategory: 'Tin tức',
    language: 'Tiếng Việt',
    region: 'Miền Bắc',
    field: 'Tin tức',
    stats: { users: '4,3 N', volume: '980 Tr' },
  },
];

/** Mới nhất — stats compact */
export const COMMUNITY_NEWEST = [
  {
    id: 'cm-cuongphimx',
    voiceCode: 'community_cuongphimx_review_48k',
    name: 'Cuongphimx',
    description: 'Review phim • Nam • Trung niên',
    language: 'Tiếng Việt',
    region: 'Miền Bắc',
    field: 'Giải trí',
    stats: { users: '420', volume: '12 Tr', period: '30 ngày' },
  },
  {
    id: 'cm-tin-sg',
    voiceCode: 'community_tin_sg_sach_noi_48k',
    name: 'Tín SG',
    description: 'Sách nói • Nam • Thanh niên',
    language: 'Tiếng Việt',
    region: 'Miền Nam',
    field: 'Sách nói',
    stats: { users: '1,1 N', volume: '85 Tr', period: '30 ngày' },
  },
  {
    id: 'cm-abistintuc',
    voiceCode: 'community_abistintuc_ban_tin_48k',
    name: 'ABISTINTUC',
    description: 'Tin tức • Nam • Trung niên',
    language: 'Tiếng Việt',
    region: 'Miền Bắc',
    field: 'Tin tức',
    stats: { users: '890', volume: '24 Tr', period: '30 ngày' },
  },
  {
    id: 'cm-thu-huyen-tin-tuc',
    voiceCode: 'community_thu_huyen_tintuc_48k',
    name: 'Thu Huyền Tin Tức',
    description: 'Tin tức • Nữ • Thanh niên',
    language: 'Tiếng Việt',
    region: 'Miền Nam',
    field: 'Tin tức',
    stats: { users: '2,4 N', volume: '156 Tr', period: '30 ngày' },
  },
  {
    id: 'cm-hoang-hiep-audio',
    voiceCode: 'community_hoang_hiep_doc_truyen_48k',
    name: 'Hoàng Hiệp audio',
    description: 'Đọc truyện • Nam • Trung niên',
    language: 'Tiếng Việt',
    region: 'Miền Bắc',
    field: 'Đọc truyện',
    stats: { users: '670', volume: '18 Tr', period: '14 ngày' },
  },
];

export function getAllCommunityVoices() {
  const map = new Map();
  for (const v of COMMUNITY_TRENDING) map.set(v.id, v);
  for (const v of COMMUNITY_FEATURED) map.set(v.id, v);
  for (const v of COMMUNITY_NEWEST) map.set(v.id, v);
  return [...map.values()];
}
