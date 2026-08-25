export const ATTENDANCE_PROJECTS = [
  '한라건설 용인금어지구',
  '현대건설 용인마크밸리',
  '대우건설 용인현장',
];

export const ATTENDANCE_SESSION_STORAGE_KEY =
  'wooklim-attendance-worker-session';

export const ATTENDANCE_TRADE_OPTIONS = [
  '소장',
  '관리자',
  '직영',
  '먹매김',
  '단열',
  '합지',
  '경량벽체',
  '세대천정',
  '공용홀천정',
  '몰딩',
  '걸레받이',
  '수장',
  '외주',
  '기타',
  '용역',
];
export const ATTENDANCE_DEVICE_STORAGE_KEY =
  'wooklim-attendance-device-key';

export const getAttendanceDeviceKey = () => {
  const saved = window.localStorage.getItem(
    ATTENDANCE_DEVICE_STORAGE_KEY,
  );
  if (saved) return saved;

  const created =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
          .toString(36)
          .slice(2)}`;

  window.localStorage.setItem(
    ATTENDANCE_DEVICE_STORAGE_KEY,
    created,
  );
  return created;
};

export const normalizePhone = (value) =>
  String(value || '').replace(/\D/g, '').slice(0, 11);

export const formatPhone = (value) => {
  const digits = normalizePhone(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

export const formatKoreaDateTime = (value, options = {}) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat(options.locale || 'ko-KR', {
    timeZone: 'Asia/Seoul',
    year: options.timeOnly ? undefined : '2-digit',
    month: options.timeOnly ? undefined : '2-digit',
    day: options.timeOnly ? undefined : '2-digit',
    weekday: options.timeOnly ? undefined : 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: options.withSeconds ? '2-digit' : undefined,
    hourCycle: 'h23',
  }).format(date);
};

export const getKoreaDateValue = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

export const extractAttendanceQrToken = (rawValue) => {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  try {
    const url = new URL(value, window.location.origin);
    return String(url.searchParams.get('attendanceQr') || '').trim();
  } catch {
    return value;
  }
};

export const buildAttendanceWorkerUrl = ({
  projectName = '',
  qrToken = '',
} = {}) => {
  const url = new URL(window.location.origin);
  url.searchParams.set('view', 'attendance-worker');
  if (projectName) url.searchParams.set('project', projectName);
  if (qrToken) url.searchParams.set('attendanceQr', qrToken);
  return url.toString();
};

export const buildAttendanceQrDisplayUrl = ({ displayToken = '' } = {}) => {
  const url = new URL(window.location.origin);
  url.searchParams.set('view', 'attendance-qr-display');
  if (displayToken) url.searchParams.set('displayToken', displayToken);
  return url.toString();
};
