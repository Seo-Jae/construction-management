export const FEEDBACK_BUCKET = 'feedback-attachments';

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
  { value: 'held', label: '보류', color: '#475569', bgcolor: '#e2e8f0' },
];

export const getFeedbackCategoryMeta = (value) =>
  FEEDBACK_CATEGORIES.find((item) => item.value === value)
  || FEEDBACK_CATEGORIES[FEEDBACK_CATEGORIES.length - 1];

export const getFeedbackStatusMeta = (value) =>
  FEEDBACK_STATUSES.find((item) => item.value === value)
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
