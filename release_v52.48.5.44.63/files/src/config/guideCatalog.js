// v52.48.5.44.63 시스템 가이드 공통 메뉴 카탈로그 + 번호 없는 설명박스 모델
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

const createId = (prefix) => (
  globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
);
const clamp = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
};
const size = (value, fallback = 12) => Math.max(2, Math.min(100, Number(value) || fallback));
const color = (value) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : '#ef4444';

export const createGuideAnnotation = (overrides = {}) => ({
  id: createId('guide-mark'),
  type: 'number',
  number: 1,
  title: '',
  description: '',
  color: '#ef4444',
  x: 50,
  y: 50,
  width: 14,
  height: 10,
  x2: 68,
  y2: 50,
  badgeX: 50,
  badgeY: 50,
  badgeAnchor: 'free',
  labelX: 56,
  labelY: 54,
  labelWidth: 24,
  showLabel: true,
  strokeWidth: 2.5,
  fromId: '',
  toId: '',
  sortOrder: 0,
  ...overrides,
});

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const stroke = (value, fallback = 2.5) => Math.max(1, Math.min(10, finite(value, fallback)));
const labelWidth = (value, fallback = 24) => Math.max(12, Math.min(55, finite(value, fallback)));

export const GUIDE_BADGE_ANCHORS = [
  'top-left', 'top-center', 'top-right',
  'right-center', 'bottom-right', 'bottom-center',
  'bottom-left', 'left-center', 'free',
];

const defaultGuideBadgeAnchor = (type) => (
  type === 'box' || type === 'circle' ? 'top-right' : 'free'
);

const normalizeGuideBadgeAnchor = (value, type, item, naturalX, naturalY) => {
  const raw = String(value || '').trim();
  if (GUIDE_BADGE_ANCHORS.includes(raw)) return raw;

  // .49 이전 데이터에서 번호 원을 직접 옮긴 경우는 위치를 보존한다.
  const rawX = Number(item?.badgeX);
  const rawY = Number(item?.badgeY);
  const hasLegacyFreePosition = Number.isFinite(rawX) && Number.isFinite(rawY)
    && (Math.abs(rawX - naturalX) > 0.35 || Math.abs(rawY - naturalY) > 0.35);
  if (hasLegacyFreePosition) return 'free';
  return defaultGuideBadgeAnchor(type);
};

const anchoredBadgePosition = (item, anchor) => {
  const x = clamp(item?.x, 50);
  const y = clamp(item?.y, 50);
  const width = size(item?.width, 14);
  const height = size(item?.height, 10);
  const left = x;
  const centerX = x + width / 2;
  const right = x + width;
  const top = y;
  const centerY = y + height / 2;
  const bottom = y + height;
  const positions = {
    'top-left': { x:left, y:top },
    'top-center': { x:centerX, y:top },
    'top-right': { x:right, y:top },
    'right-center': { x:right, y:centerY },
    'bottom-right': { x:right, y:bottom },
    'bottom-center': { x:centerX, y:bottom },
    'bottom-left': { x:left, y:bottom },
    'left-center': { x:left, y:centerY },
  };
  const pos = positions[anchor];
  return pos ? { x:clamp(pos.x, 50), y:clamp(pos.y, 50) } : null;
};

export const getGuideBadgePosition = (item) => {
  const type = String(item?.type || 'number');
  const fallbackX = type === 'number' ? clamp(item?.x, 50)
    : type === 'arrow' ? clamp(item?.x, 50)
      : Math.min(98, clamp(item?.x, 50) + size(item?.width, 14));
  const fallbackY = type === 'number' ? clamp(item?.y, 50)
    : type === 'arrow' ? clamp(item?.y, 50)
      : Math.max(2, clamp(item?.y, 50));
  const anchor = String(item?.badgeAnchor || defaultGuideBadgeAnchor(type));
  if (anchor !== 'free' && (type === 'box' || type === 'circle')) {
    const anchored = anchoredBadgePosition(item, anchor);
    if (anchored) return anchored;
  }
  return {
    x: clamp(item?.badgeX, fallbackX),
    y: clamp(item?.badgeY, fallbackY),
  };
};

export const getGuideConnectorPoints = (item, itemMap, sourceGap = 1.8, targetGap = 3.4) => {
  const lookup = (id) => itemMap?.get ? itemMap.get(id) : undefined;
  const from = lookup(item?.fromId);
  const to = lookup(item?.toId);
  const a = from ? getGuideBadgePosition(from) : { x:clamp(item?.x, 50), y:clamp(item?.y, 50) };
  const b = to ? getGuideBadgePosition(to) : { x:clamp(item?.x2, 50), y:clamp(item?.y2, 50) };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 0.5) return { x1:a.x, y1:a.y, x2:b.x, y2:b.y };
  const startGap = Math.min(Math.max(0, sourceGap), Math.max(0, distance * 0.22));
  const endGap = Math.min(Math.max(0, targetGap), Math.max(0, distance * 0.34));
  const totalGap = startGap + endGap;
  if (distance <= totalGap + 0.5) return { x1:a.x, y1:a.y, x2:b.x, y2:b.y };
  const ux = dx / distance;
  const uy = dy / distance;
  return {
    x1: clamp(a.x + ux * startGap, a.x),
    y1: clamp(a.y + uy * startGap, a.y),
    x2: clamp(b.x - ux * endGap, b.x),
    y2: clamp(b.y - uy * endGap, b.y),
  };
};

export const normalizeGuideAnnotations = (value) => {
  if (!Array.isArray(value)) return [];
  const normalized = value.slice(0, 120).map((item, index) => {
    const type = ['number', 'circle', 'box', 'arrow', 'connector', 'pointConnector', 'note'].includes(String(item?.type || ''))
      ? String(item.type)
      : 'number';
    const x = clamp(item?.x, 50);
    const y = clamp(item?.y, 50);
    const width = size(item?.width, 14);
    const height = size(item?.height, 10);
    const naturalBadgeX = type === 'number' ? x : type === 'arrow' ? x : Math.min(98, x + width);
    const naturalBadgeY = type === 'number' ? y : type === 'arrow' ? y : Math.max(2, y);
    const badgeAnchor = normalizeGuideBadgeAnchor(item?.badgeAnchor, type, item, naturalBadgeX, naturalBadgeY);
    const badgeX = clamp(item?.badgeX, naturalBadgeX);
    const badgeY = clamp(item?.badgeY, naturalBadgeY);
    return {
      id: String(item?.id || '').trim() || `guide-mark-${index + 1}`,
      type,
      number: ['connector', 'pointConnector', 'note'].includes(type)
        ? 0
        : Math.max(1, Math.min(999, Number(item?.number) || index + 1)),
      title: String(item?.title || '').trim(),
      description: String(item?.description || '').trim(),
      color: color(item?.color),
      x,
      y,
      width,
      height,
      x2: clamp(item?.x2, 68),
      y2: clamp(item?.y2, 50),
      badgeX,
      badgeY,
      badgeAnchor,
      labelX: clamp(item?.labelX, Math.min(96, badgeX + 6)),
      labelY: clamp(item?.labelY, Math.min(96, badgeY + 5)),
      labelWidth: labelWidth(item?.labelWidth, 24),
      showLabel: item?.showLabel !== false,
      strokeWidth: stroke(item?.strokeWidth, type === 'arrow' || type === 'connector' || type === 'pointConnector' ? 3 : 2.5),
      fromId: String(item?.fromId || '').trim(),
      toId: String(item?.toId || '').trim(),
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index,
    };
  });
  return normalized.sort((a, b) => a.sortOrder - b.sortOrder).map((item, index) => ({ ...item, sortOrder: index }));
};

export const createGuideSection = (overrides = {}) => ({
  id: createId('guide-screen'),
  title: '',
  content: '',
  imagePath: '',
  imageCaption: '',
  note: '',
  annotations: [],
  ...overrides,
});

export const normalizeGuideSections = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((section, index) => ({
    id: String(section?.id || '').trim() || `guide-screen-${index + 1}`,
    title: String(section?.title || ''),
    content: String(section?.content || ''),
    imagePath: String(section?.imagePath || section?.image_path || ''),
    imageCaption: String(section?.imageCaption || section?.image_caption || ''),
    note: String(section?.note || ''),
    annotations: normalizeGuideAnnotations(section?.annotations),
  }));
};
