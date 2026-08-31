// v52.48.5.44.86 상태 중심 제보관리 (버전정보는 조회/수정하지 않음)
export const FEEDBACK_BUCKET = 'feedback-attachments';

export const FEEDBACK_SELECT_COLUMNS = [
  'id', 'category', 'title', 'content', 'project_name', 'source_view',
  'source_label', 'created_by', 'created_by_name', 'created_by_role',
  'status', 'admin_reply', 'attachments', 'client_meta', 'handled_by',
  'handled_by_name', 'handled_at', 'created_at', 'updated_at',
].join(',');

export const FEEDBACK_CATEGORIES = [
  { value: 'bug', label: '오류/버그', color: '#dc2626', bgcolor: '#fee2e2' },
  { value: 'improvement', label: '기능개선', color: '#2563eb', bgcolor: '#dbeafe' },
  { value: 'question', label: '사용문의', color: '#7c3aed', bgcolor: '#ede9fe' },
  { value: 'other', label: '기타', color: '#475569', bgcolor: '#e2e8f0' },
];

export const FEEDBACK_STATUSES = [
  { value: 'received', label: '접수', color: '#2563eb', bgcolor: '#dbeafe' },
  { value: 'reviewing', label: '확인중', color: '#c2410c', bgcolor: '#ffedd5' },
  { value: 'planned', label: '반영예정', color: '#7c3aed', bgcolor: '#ede9fe' },
  { value: 'completed', label: '처리완료', color: '#15803d', bgcolor: '#dcfce7' },
  { value: 'rejected', label: '불가', color: '#475569', bgcolor: '#e2e8f0' },
];

export const FEEDBACK_ADMIN_STATUSES = FEEDBACK_STATUSES.filter(
  (item) => item.value !== 'received',
);

// 구버전 보류는 거절로 간주하지 않고 재검토 대상으로 표시합니다.
export const normalizeFeedbackStatus = (status) => status === 'held' ? 'reviewing' : status;
export const isFeedbackCompleted = (status) => status === 'completed';

export const resolveFeedbackAdminUpdate = (currentStatus, draft) => {
  if (isFeedbackCompleted(currentStatus)) {
    throw new Error('처리완료된 제보는 종결되어 수정할 수 없습니다. 재발한 문제는 새 제보로 등록해주세요.');
  }
  const reply = String(draft.admin_reply || '').trim();
  let status = draft.status;
  if (status === 'received') {
    if (currentStatus !== 'received') {
      throw new Error('검토를 시작한 제보는 접수 상태로 되돌릴 수 없습니다.');
    }
    if (!reply) throw new Error('관리자 답변을 입력하거나 처리상태를 선택해주세요.');
    status = 'reviewing';
  }
  if (!FEEDBACK_ADMIN_STATUSES.some((item) => item.value === status)) {
    throw new Error('올바른 처리상태를 선택해주세요.');
  }
  return { status, admin_reply: reply };
};

export const getFeedbackCategoryMeta = (value) =>
  FEEDBACK_CATEGORIES.find((item) => item.value === value)
  || FEEDBACK_CATEGORIES[FEEDBACK_CATEGORIES.length - 1];

export const getFeedbackStatusMeta = (value) =>
  FEEDBACK_STATUSES.find((item) => item.value === normalizeFeedbackStatus(value))
  || FEEDBACK_STATUSES[0];

export const formatFeedbackDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const sanitizeFeedbackFileName = (value) => {
  const original = String(value || 'file');
  const extensionIndex = original.lastIndexOf('.');
  const extension = extensionIndex > 0
    ? original.slice(extensionIndex).replace(/[^a-zA-Z0-9.]/g, '')
    : '';
  const base = (extensionIndex > 0 ? original.slice(0, extensionIndex) : original)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return `${base || 'file'}${extension}`;
};
