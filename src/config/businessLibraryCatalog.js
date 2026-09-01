// v52.48.5.44.89 업무자료실 공통 분류·파일 정책
export const BUSINESS_LIBRARY_BUCKET = 'business-library-files';
export const BUSINESS_LIBRARY_MAX_FILE_BYTES = 45 * 1024 * 1024;
export const BUSINESS_LIBRARY_STANDARD_UPLOAD_BYTES = 6 * 1024 * 1024;
export const BUSINESS_LIBRARY_FREE_STORAGE_BYTES = 1024 * 1024 * 1024;

export const BUSINESS_LIBRARY_CATEGORIES = [
  '회사양식',
  '시공계획서',
  '자재 카탈로그',
  '시방서',
  '기술검토서',
  '도면·상세도',
  '교육·참고자료',
  '기타',
];

export const BUSINESS_LIBRARY_SCOPES = [
  { value:'company', label:'회사 공통' },
  { value:'project', label:'현장 전용' },
];

export const BUSINESS_LIBRARY_PROVIDERS = [
  { value:'supabase', label:'파일 직접 등록' },
  { value:'external', label:'외부 링크 등록' },
];

export const formatBusinessLibraryBytes = (value) => {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

export const formatBusinessLibraryDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12:false,
  }).format(date);
};

export const getBusinessLibraryExtension = (fileName) => {
  const name = String(fileName || '').trim();
  const dotIndex = name.lastIndexOf('.');
  return dotIndex > -1 ? name.slice(dotIndex + 1).toLowerCase().slice(0, 20) : '';
};

export const sanitizeBusinessLibraryFileName = (fileName) => {
  const extension = getBusinessLibraryExtension(fileName);
  const base = String(fileName || 'file')
    .replace(/\.[^.]+$/, '')
    .normalize('NFKC')
    .replace(/[^0-9A-Za-z가-힣_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'file';
  return extension ? `${base}.${extension}` : base;
};
