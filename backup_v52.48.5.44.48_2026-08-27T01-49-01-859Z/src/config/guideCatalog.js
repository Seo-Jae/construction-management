// v52.48.5.44.47 시스템 가이드 공통 메뉴 카탈로그
export const GUIDE_IMAGE_BUCKET = 'system-guide-images';

export const GUIDE_GROUPS = [
  { id: 'admin-dashboard-group', label: 'Dashboard', direct: true, items: [{ id: 'admin-dashboard', label: 'Dashboard' }] },
  { id: 'project-management-group', label: '현장관리', direct: true, items: [{ id: 'project-management', label: '현장관리' }] },
  { id: 'user-management-group', label: '회원관리', direct: true, items: [{ id: 'user-management', label: '회원관리' }] },
  { id: 'attendance-group', label: '근태관리', direct: true, items: [{ id: 'attendance', label: '근태관리' }] },
  { id: 'approval-inbox-group', label: '결재함', direct: true, items: [{ id: 'approval-inbox', label: '결재함' }] },
  { id: 'weekly-overview-group', label: '주간업무총괄', items: [
    { id: 'weekly-overview', label: '주간업무작성' },
    { id: 'weekly-overview-archive', label: '주간업무보관' },
  ] },
  { id: 'main-group', label: 'Main', direct: true, items: [{ id: 'main', label: 'Main' }] },
  { id: 'organization-chart-group', label: '조직도', direct: true, items: [{ id: 'organization-chart', label: '조직도' }] },
  { id: 'daily-group', label: '공사일보관리', items: [
    { id: 'daily', label: '출력일보작성' },
    { id: 'daily-monthly-workers', label: '금월 투입현황' },
    { id: 'daily-cumulative-workers', label: '누계투입조회' },
  ] },
  { id: 'progress-group', label: '공정진척관리', items: [
    { id: 'progress-input', label: '공종별 현황 입력' },
    { id: 'progress-multi', label: '다중 공종 진척 현황' },
    { id: 'progress-daily', label: '일별 완료 집계' },
    { id: 'progress-weekly', label: '주별 완료 집계' },
    { id: 'progress-monthly', label: '월별 완료 집계' },
  ] },
  { id: 'option-group', label: '옵션관리', items: [
    { id: 'option-insulation-status', label: '옵션현황(단열)' },
    { id: 'option-selection-status', label: '옵션현황(선택)' },
    { id: 'option-comparison', label: '옵션별 비교' },
  ] },
  { id: 'household-quantity-group', label: '세대물량관리', direct: true, items: [{ id: 'household-quantity-management', label: '세대물량관리' }] },
  { id: 'drawing-quantity-group', label: '타입별 도면분석', direct: true, items: [{ id: 'drawing-quantity', label: '타입별 도면분석' }] },
  { id: 'material-group', label: '자재관리', items: [
    { id: 'material-unit-price', label: '일위대가작성' },
    { id: 'material-order', label: '자재발주작성', systemPreparing: true },
    { id: 'material-input-status', label: '자재투입현황' },
  ] },
  { id: 'payment-group', label: '기성관리', items: [
    { id: 'payment-claim', label: '기성내역서작성' },
    { id: 'payment-contract-mapping', label: '계약품목 공정연결' },
    { id: 'payment-sales-status', label: '매입매출현황', systemPreparing: true },
  ] },
  { id: 'labor-group', label: '노임관리', items: [
    { id: 'labor-monthly', label: '월별 노임작성' },
    { id: 'labor-worker-master', label: '근로자 정보관리' },
    { id: 'labor-contract', label: '근로계약서작성' },
    { id: 'labor-cost', label: '공정별 노임작성' },
    { id: 'labor-documents', label: '노임서류작성', systemPreparing: true },
  ] },
  { id: 'report-group', label: '업무 보고 관리', items: [
    { id: 'report-weekly', label: '주간 업무 보고' },
    { id: 'report-expense-resolution', label: '지출결의서 작성' },
    { id: 'report-approval', label: '품의 보고' },
    { id: 'report-outsourcing-approval', label: '외주 품의 보고', systemPreparing: true },
    { id: 'report-accident', label: '사고 경위 보고', systemPreparing: true },
  ] },
];

export const GUIDE_ITEMS = GUIDE_GROUPS.flatMap((group) => group.items.map((item) => ({
  ...item,
  groupId: group.id,
  groupLabel: group.direct ? '' : group.label,
  breadcrumb: group.direct ? item.label : `${group.label} > ${item.label}`,
})));

const GUIDE_ITEM_MAP = new Map(GUIDE_ITEMS.map((item) => [item.id, item]));

export const getGuideMeta = (menuKey) => GUIDE_ITEM_MAP.get(String(menuKey || '')) || null;

export const createGuideSection = (overrides = {}) => ({
  id: globalThis.crypto?.randomUUID?.() || `guide-step-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  title: '',
  content: '',
  imagePath: '',
  imageCaption: '',
  note: '',
  ...overrides,
});

export const normalizeGuideSections = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((section, index) => ({
    id: String(section?.id || '').trim() || `guide-step-${index + 1}`,
    title: String(section?.title || ''),
    content: String(section?.content || ''),
    imagePath: String(section?.imagePath || section?.image_path || ''),
    imageCaption: String(section?.imageCaption || section?.image_caption || ''),
    note: String(section?.note || ''),
  }));
};
