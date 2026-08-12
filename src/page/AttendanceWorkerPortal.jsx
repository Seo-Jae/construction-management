import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Fade,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import AddToHomeScreenRoundedIcon from '@mui/icons-material/AddToHomeScreenRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CameraAltRoundedIcon from '@mui/icons-material/CameraAltRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import HowToRegRoundedIcon from '@mui/icons-material/HowToRegRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { BrowserQRCodeReader } from '@zxing/browser';
import { supabase } from '../supabaseClient';
import {
  ATTENDANCE_PROJECTS,
  ATTENDANCE_SESSION_STORAGE_KEY,
  extractAttendanceQrToken,
  formatKoreaDateTime,
  formatPhone,
  getAttendanceDeviceKey,
  normalizePhone,
} from '../utils/attendance';

const initialSignup = {
  projectName: '',
  nameKo: '',
  isForeigner: false,
  nameEn: '',
  isTestAccount: false,
  phone: '',
  tradeName: '',
  password: '',
  passwordConfirm: '',
  privacyAgreed: false,
};

const initialLogin = {
  phone: '',
  password: '',
};

const APP_BRAND_GREEN = '#03c75a';

function AttendanceToast({ message, onClose, appMode = false }) {
  return (
    <Snackbar
      key={message?.text || 'attendance-worker-toast'}
      open={Boolean(message)}
      autoHideDuration={3000}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      TransitionComponent={Fade}
      transitionDuration={{ enter: 220, exit: 500 }}
      onClose={(_event, reason) => {
        if (reason === 'clickaway') return;
        onClose();
      }}
      sx={{
        top: appMode ? 'calc(84px + env(safe-area-inset-top)) !important' : '72px !important',
        zIndex: (theme) => theme.zIndex.snackbar + 10,
        '& .MuiAlert-root': {
          width: 'max-content',
          minWidth: { xs: 280, sm: 420 },
          maxWidth: 'min(680px, calc(100vw - 32px))',
          boxShadow: '0 12px 30px rgba(15, 23, 42, 0.22)',
        },
        '& .MuiAlert-message': { whiteSpace: 'normal' },
      }}
    >
      <Alert severity={message?.severity || 'info'} variant="filled" onClose={onClose}>
        {message?.text || ''}
      </Alert>
    </Snackbar>
  );
}

const KOREA_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const getKoreaTodayKey = () => KOREA_DATE_FORMATTER.format(new Date());

const getCurrentMonthCalendar = () => {
  const todayKey = getKoreaTodayKey();
  const [year, month] = todayKey.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return {
    year,
    month,
    todayKey,
    cells,
    toDateKey: (day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
};

const buildAttendanceByDate = (monthEvents, todayEvents) => {
  const todayKey = getKoreaTodayKey();
  const grouped = {};
  const merged = [
    ...(Array.isArray(monthEvents) ? monthEvents : []),
    ...(Array.isArray(todayEvents)
      ? todayEvents.map((event) => ({ ...event, work_date: event.work_date || todayKey }))
      : []),
  ];

  merged.forEach((event) => {
    const dateKey = String(event?.work_date || '').slice(0, 10);
    if (!dateKey || !['check_in', 'check_out'].includes(event?.event_type)) return;
    if (!grouped[dateKey]) grouped[dateKey] = {};
    grouped[dateKey][event.event_type] = event;
  });
  return grouped;
};

function MonthlyAttendanceCalendar({ monthEvents, todayEvents, selectedDate, onSelectDate }) {
  const calendar = getCurrentMonthCalendar();
  const attendanceByDate = buildAttendanceByDate(monthEvents, todayEvents);
  const selectedEvents = attendanceByDate[selectedDate] || {};
  const selectedDay = Number(String(selectedDate || '').slice(-2));

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
        <Typography sx={{ fontSize: '0.84rem', fontWeight: 900 }}>금월 출결현황</Typography>
        <Typography sx={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 800 }}>
          {calendar.year}년 {String(calendar.month).padStart(2, '0')}월
        </Typography>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.4 }}>
        {['일', '월', '화', '수', '목', '금', '토'].map((weekday, index) => (
          <Typography
            key={weekday}
            sx={{
              py: 0.35,
              textAlign: 'center',
              fontSize: '0.64rem',
              fontWeight: 800,
              color: index === 0 ? '#dc2626' : index === 6 ? '#2563eb' : '#64748b',
            }}
          >
            {weekday}
          </Typography>
        ))}

        {calendar.cells.map((day, index) => {
          if (!day) return <Box key={`empty-${index}`} sx={{ minHeight: 43 }} />;
          const dateKey = calendar.toDateKey(day);
          const dayEvents = attendanceByDate[dateKey] || {};
          const hasCheckIn = Boolean(dayEvents.check_in);
          const hasCheckOut = Boolean(dayEvents.check_out);
          const isToday = dateKey === calendar.todayKey;
          const isSelected = dateKey === selectedDate;

          return (
            <Box
              component="button"
              type="button"
              key={dateKey}
              onClick={() => onSelectDate(dateKey)}
              aria-label={`${calendar.month}월 ${day}일 출결 확인`}
              sx={{
                minWidth: 0,
                minHeight: 43,
                p: 0.35,
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: isSelected ? APP_BRAND_GREEN : isToday ? '#86efac' : 'transparent',
                bgcolor: isSelected ? '#ecfdf5' : '#fff',
                color: '#0f172a',
                font: 'inherit',
                cursor: 'pointer',
              }}
            >
              <Typography sx={{ fontSize: '0.68rem', lineHeight: 1, fontWeight: isToday ? 900 : 700 }}>
                {day}
              </Typography>
              <Stack direction="row" spacing={0.25} justifyContent="center" sx={{ mt: 0.55, minHeight: 15 }}>
                {hasCheckIn && (
                  <Box sx={{ px: 0.45, py: 0.1, borderRadius: 2, bgcolor: '#d1fae5', color: '#047857', fontSize: '0.52rem', fontWeight: 900 }}>
                    출
                  </Box>
                )}
                {hasCheckOut && (
                  <Box sx={{ px: 0.45, py: 0.1, borderRadius: 2, bgcolor: '#dbeafe', color: '#1d4ed8', fontSize: '0.52rem', fontWeight: 900 }}>
                    퇴
                  </Box>
                )}
              </Stack>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ mt: 1.25, px: 1.25, py: 1, borderRadius: 1.75, bgcolor: '#f8fafc' }}>
        <Typography sx={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800 }}>
          {calendar.month}월 {selectedDay || Number(calendar.todayKey.slice(-2))}일 출결
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ mt: 0.45 }}>
          <Typography sx={{ fontSize: '0.74rem', fontWeight: 900, color: selectedEvents.check_in ? '#047857' : '#94a3b8' }}>
            출근 {selectedEvents.check_in ? formatKoreaDateTime(selectedEvents.check_in.event_at, { timeOnly: true }) : '미처리'}
          </Typography>
          <Typography sx={{ fontSize: '0.74rem', fontWeight: 900, color: selectedEvents.check_out ? '#1d4ed8' : '#94a3b8' }}>
            퇴근 {selectedEvents.check_out ? formatKoreaDateTime(selectedEvents.check_out.event_at, { timeOnly: true }) : '미처리'}
          </Typography>
        </Stack>
      </Box>
    </Paper>
  );
}

function RiskBroadcastPanel({ broadcasts }) {
  const activeBroadcasts = Array.isArray(broadcasts) ? broadcasts : [];

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3, borderColor: '#fecaca', bgcolor: '#fffafa' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Typography sx={{ fontSize: '0.86rem', fontWeight: 900, color: '#991b1b' }}>
          중점위험요인 전파
        </Typography>
        <Chip
          label={activeBroadcasts.length ? `${activeBroadcasts.length}건` : '등록 없음'}
          size="small"
          sx={{ height: 22, fontSize: '0.62rem', fontWeight: 800, bgcolor: '#fee2e2', color: '#991b1b' }}
        />
      </Stack>

      {activeBroadcasts.length === 0 ? (
        <Typography sx={{ mt: 1, fontSize: '0.74rem', color: '#64748b' }}>
          등록된 중점위험요인이 없습니다.
        </Typography>
      ) : (
        <Stack spacing={1.1} sx={{ mt: 1.25 }}>
          {activeBroadcasts.map((broadcast) => {
            const isCommon = broadcast.scope_type === 'common';
            const badgeColor = isCommon ? '#15803d' : '#1d4ed8';
            const badgeBackground = isCommon ? '#dcfce7' : '#dbeafe';
            return (
              <Box
                key={broadcast.id}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1.15,
                  p: 1.15,
                  borderRadius: 2,
                  bgcolor: '#fff',
                  border: '1px solid #fee2e2',
                }}
              >
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    flex: '0 0 42px',
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: badgeBackground,
                    color: badgeColor,
                    fontSize: '0.7rem',
                    fontWeight: 900,
                    border: `1px solid ${badgeColor}33`,
                  }}
                >
                  {isCommon ? '공통' : '담당'}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ whiteSpace: 'pre-wrap', color: '#1e293b', fontSize: '0.78rem', fontWeight: 800, lineHeight: 1.65 }}>
                    {broadcast.content}
                  </Typography>
                  <Typography sx={{ mt: 0.55, color: '#64748b', fontSize: '0.64rem', lineHeight: 1.5 }}>
                    {formatKoreaDateTime(broadcast.created_at)} · {broadcast.author_position || broadcast.author_role || '작성자'} {broadcast.author_name || ''}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}

const isInstalledApp = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  window.navigator.standalone === true;

const waitForVideoReady = (video, timeoutMs = 8000) => new Promise((resolve, reject) => {
  let timeoutId;
  let pollingId;

  const cleanup = () => {
    window.clearTimeout(timeoutId);
    window.clearInterval(pollingId);
    video.removeEventListener('loadedmetadata', handleReady);
    video.removeEventListener('loadeddata', handleReady);
    video.removeEventListener('canplay', handleReady);
    video.removeEventListener('playing', handleReady);
  };
  const handleReady = () => {
    if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return;
    cleanup();
    resolve();
  };

  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    resolve();
    return;
  }

  video.addEventListener('loadedmetadata', handleReady);
  video.addEventListener('loadeddata', handleReady);
  video.addEventListener('canplay', handleReady);
  video.addEventListener('playing', handleReady);
  pollingId = window.setInterval(handleReady, 100);
  timeoutId = window.setTimeout(() => {
    cleanup();
    reject(new Error('CameraPreviewTimeout'));
  }, timeoutMs);
});

const queryCameraPermissionState = async () => {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const permission = await navigator.permissions.query({
      name: 'camera',
    });
    return String(permission?.state || 'unknown');
  } catch {
    // iOS Safari 등 camera Permissions API를 지원하지 않는 브라우저
    return 'unknown';
  }
};

const getCameraErrorMessage = (error) => {
  const errorName = String(error?.name || '');
  const errorMessage = String(error?.message || '');

  if (!window.isSecureContext) {
    return '카메라는 보안 연결(HTTPS)에서만 사용할 수 있습니다. 운영 주소로 다시 접속해주세요.';
  }
  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return '카메라 권한이 차단되어 있습니다. Android는 Chrome 설정 → 사이트 설정 → 카메라에서 허용하고, 아이폰은 Safari 웹사이트 설정 → 카메라 → 허용으로 바꾼 뒤 다시 눌러주세요.';
  }
  if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
    return '사용할 수 있는 카메라를 찾지 못했습니다. 휴대폰 카메라 상태를 확인해주세요.';
  }
  if (errorName === 'NotReadableError' || errorName === 'TrackStartError' || errorName === 'AbortError') {
    return '다른 앱이 카메라를 사용 중이거나 카메라를 시작하지 못했습니다. 다른 카메라 앱을 닫고 다시 시도해주세요.';
  }
  if (errorName === 'OverconstrainedError' || errorName === 'ConstraintNotSatisfiedError') {
    return '휴대폰 카메라 설정을 적용하지 못했습니다. 다시 촬영을 눌러주세요.';
  }
  if (errorMessage.includes('CameraPreviewTimeout')) {
    return '카메라 권한은 확인됐지만 영상이 재생되지 않았습니다. 브라우저를 완전히 닫았다가 다시 열고 촬영해주세요.';
  }
  return '카메라를 시작하지 못했습니다. 브라우저의 카메라 권한을 허용한 뒤 다시 시도해주세요.';
};

const readInitialProject = () => {
  const requested = new URLSearchParams(window.location.search).get('project');
  return ATTENDANCE_PROJECTS.includes(requested) ? requested : '';
};

const statusMeta = {
  pending: {
    label: '승인 대기',
    color: 'warning',
    description: '현장담당자가 가입정보와 휴대폰을 확인하고 있습니다.',
  },
  active: {
    label: '사용 가능',
    color: 'success',
    description: '출·퇴근 QR을 촬영할 수 있습니다.',
  },
  rejected: {
    label: '승인 반려',
    color: 'error',
    description: '현장담당자에게 가입정보를 확인해주세요.',
  },
  disabled: {
    label: '사용 중지',
    color: 'error',
    description: '현장담당자에게 계정 상태를 확인해주세요.',
  },
};

function AttendanceNoticeTicker({ notices, appMode = false }) {
  const visibleNotices = Array.isArray(notices)
    ? notices
        .map((item, originalIndex) => ({
          key: String(item?.id || `notice-${originalIndex}`),
          content: String(item?.content || '').trim(),
          sortOrder: Number(item?.sort_order) || originalIndex + 1,
        }))
        .filter((item) => Boolean(item.content))
        .sort((first, second) =>
          first.sortOrder === second.sortOrder
            ? first.key.localeCompare(second.key)
            : first.sortOrder - second.sortOrder,
        )
    : [];

  if (visibleNotices.length === 0) return null;

  const ariaText = visibleNotices
    .map((notice, index) => `${index + 1}. ${notice.content}`)
    .join(' / ');
  const contentLength = visibleNotices.reduce(
    (total, notice) => total + notice.content.length,
    0,
  );
  const spacingWeight = Math.max(0, visibleNotices.length - 1) * 12;
  const durationSeconds = Math.max(
    14.3,
    Math.min(50, Math.round((contentLength + spacingWeight) * 0.30)),
  );

  return (
    <Box
      role="status"
      aria-label={`공지사항 ${ariaText}`}
      sx={{
        width: '100%',
        minHeight: appMode ? 56 : 42,
        display: 'flex',
        alignItems: 'stretch',
        bgcolor: '#ffeb3b',
        borderBottom: '1px solid #eab308',
        color: '#713f12',
        overflow: 'hidden',
        boxShadow: '0 3px 10px rgba(15,23,42,0.08)',
      }}
    >
      <Box
        sx={{
          flex: '0 0 auto',
          px: appMode ? 2 : 1.5,
          display: 'grid',
          placeItems: 'center',
          bgcolor: '#facc15',
          color: '#713f12',
          fontSize: appMode ? '1rem' : '0.78rem',
          fontWeight: 1000,
          letterSpacing: '0.04em',
          zIndex: 1,
        }}
      >
        공지
      </Box>

      <Box
        sx={{
          minWidth: 0,
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Box
          component="div"
          sx={{
            width: 'max-content',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            // 공지 간격: 앱에서는 약 64px, 일반 브라우저에서는 약 48px
            gap: appMode ? 8 : 6,
            whiteSpace: 'nowrap',
            pl: 1.5,
            fontSize: appMode ? '1.08rem' : '0.84rem',
            fontWeight: 900,
            lineHeight: 1,
            willChange: 'transform',
            animation: `attendanceNoticeTicker ${durationSeconds}s linear infinite`,
            '@keyframes attendanceNoticeTicker': {
              '0%': { transform: 'translateX(100vw)' },
              '100%': { transform: 'translateX(-100%)' },
            },
          }}
        >
          {visibleNotices.map((notice, index) => (
            <Box
              component="span"
              key={notice.key}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <Box
                component="span"
                sx={{
                  mr: 0.7,
                  fontWeight: 1000,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {index + 1}.
              </Box>
              <Box component="span">{notice.content}</Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function MobileShell({
  children,
  appMode = false,
  topBanner = null,
  headerAction = null,
}) {
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: appMode ? '#f5f7f6' : '#eef3f8' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: appMode ? APP_BRAND_GREEN : '#0f4c81',
          pt: appMode ? 'env(safe-area-inset-top)' : 0,
        }}
      >
        <Toolbar
          sx={{
            minHeight: appMode ? '72px !important' : '58px !important',
            px: appMode ? 0.75 : 2,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ minWidth: 0 }}
          >
            {appMode && (
              <Box
                aria-hidden="true"
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2.25,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: '#fff',
                  color: APP_BRAND_GREEN,
                  fontSize: '1.75rem',
                  lineHeight: 1,
                  fontWeight: 1000,
                  letterSpacing: '-0.12em',
                  pr: '0.12em',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                }}
              >
                W
              </Box>
            )}
            <Box>
            <Typography sx={{ fontSize: appMode ? '0.72rem' : '0.65rem', fontWeight: 900, letterSpacing: '0.12em', color: appMode ? 'rgba(255,255,255,0.86)' : '#bae6fd' }}>
              WOOKLIM CONSTRUCTION
            </Typography>
            <Typography sx={{ fontSize: appMode ? '1.18rem' : '1rem', fontWeight: 900 }}>
              욱림건설 근태시스템
            </Typography>
            </Box>
          </Stack>

          {headerAction && (
            <Box
              sx={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
              {headerAction}
            </Box>
          )}
        </Toolbar>
      </AppBar>
      {topBanner}
      <Box
        sx={{
          width: '100%',
          maxWidth: appMode ? 'none' : 520,
          mx: 'auto',
          px: appMode ? 0.75 : 2,
          pt: appMode ? 2.5 : 2,
          pb: appMode ? 'calc(24px + env(safe-area-inset-bottom))' : 2,
          ...(appMode && {
            '& .MuiInputBase-root': { minHeight: 56, fontSize: '1rem' },
            '& .MuiInputLabel-root': { fontSize: '1rem' },
            '& .MuiButton-root': { minHeight: 52, fontSize: '0.96rem' },
            '& .MuiFormControlLabel-label': { fontSize: '1rem' },
            '& .MuiAlert-message': { fontSize: '0.92rem', lineHeight: 1.65 },
            '& .MuiChip-label': { fontSize: '0.86rem' },
          }),
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export default function AttendanceWorkerPortal() {
  const [mode, setMode] = useState('login');
  const [signup, setSignup] = useState(() => ({
    ...initialSignup,
    projectName: readInitialProject(),
  }));
  const [login, setLogin] = useState(initialLogin);
  const [sessionToken, setSessionToken] = useState(() =>
    window.localStorage.getItem(ATTENDANCE_SESSION_STORAGE_KEY) || '',
  );
  const [worker, setWorker] = useState(null);
  const [todayEvents, setTodayEvents] = useState([]);
  const [monthEvents, setMonthEvents] = useState([]);
  const [riskBroadcasts, setRiskBroadcasts] = useState([]);
  const [attendanceNotices, setAttendanceNotices] = useState([]);
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState(getKoreaTodayKey);
  const [loading, setLoading] = useState(Boolean(sessionToken));
  const [message, setMessage] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStarting, setScannerStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraPermissionOpen, setCameraPermissionOpen] = useState(false);
  const [cameraPermissionState, setCameraPermissionState] = useState('unknown');
  const [scannerVideoElement, setScannerVideoElement] = useState(null);
  const [processingScan, setProcessingScan] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [appMode, setAppMode] = useState(isInstalledApp);
  const videoRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const cameraStreamRef = useRef(null);
  /*
    v52.27:
    worker state를 loadMe의 dependency로 사용하면
    loadMe -> setWorker -> loadMe 재생성 -> effect 재실행 루프가 생길 수 있습니다.
    최신 worker 값이 필요할 때는 ref를 사용해 함수 identity를 안정적으로 유지합니다.
  */
  const workerRef = useRef(null);
  const handledDeepLinkRef = useRef('');
  const deviceKey = useRef(getAttendanceDeviceKey()).current;
  const primaryActionColor = appMode ? APP_BRAND_GREEN : '#0f6fae';

  const handleScannerVideoRef = useCallback((node) => {
    videoRef.current = node;
    setScannerVideoElement(node);
  }, []);

  const saveSession = useCallback((token) => {
    const normalized = String(token || '');
    setSessionToken(normalized);
    if (normalized) {
      window.localStorage.setItem(
        ATTENDANCE_SESSION_STORAGE_KEY,
        normalized,
      );
    } else {
      window.localStorage.removeItem(ATTENDANCE_SESSION_STORAGE_KEY);
    }
  }, []);

  /*
    v52.20:
    작업자 앱의 로그인 토큰은 이미 localStorage에 저장됩니다.
    따라서 앱 종료/재실행 자체로는 로그아웃시키지 않습니다.

    세션을 실제로 버려야 하는 경우와 일시적인 통신 장애를 구분하여,
    네트워크/RPC 오류 한 번 때문에 작업자에게 다시 로그인을 요구하지 않습니다.
  */
  const isAttendanceSessionInvalidError = useCallback((error) => {
    const text = String(error?.message || '').trim();

    return [
      '로그인이 필요합니다.',
      '로그인 정보가 만료되었거나 등록된 휴대폰이 아닙니다.',
    ].some((messageText) => text.includes(messageText));
  }, []);

  const loadMe = useCallback(async (token = sessionToken, silent = false) => {
    if (!token) {
      workerRef.current = null;
      setWorker(null);
      setTodayEvents([]);
      setMonthEvents([]);
      setRiskBroadcasts([]);
      setAttendanceNotices([]);
      setLoading(false);
      return null;
    }

    if (!silent) setLoading(true);
    const { data, error } = await supabase.rpc('attendance_worker_me_v52_21', {
      p_session_token: token,
      p_device_key: deviceKey,
    });

    if (error) {
      console.warn('근로자 세션 확인 실패:', error);

      if (isAttendanceSessionInvalidError(error)) {
        /*
          명시적으로 세션 토큰/등록기기가 유효하지 않은 경우에만
          저장된 로그인 정보를 제거합니다.
        */
        saveSession('');
        workerRef.current = null;
        setWorker(null);
        setTodayEvents([]);
        setMonthEvents([]);
        setRiskBroadcasts([]);
        setAttendanceNotices([]);
        setMessage({
          severity: 'warning',
          text: error.message || '로그인 정보가 유효하지 않습니다. 다시 로그인해주세요.',
        });
      } else {
        /*
          인터넷 끊김, Supabase 일시 장애, 포커스 복귀 순간의 통신 실패 등은
          기존 로그인과 현재 화면을 그대로 유지합니다.
        */
        if (!silent) {
          setMessage({
            severity: 'warning',
            text: '서버 연결이 잠시 불안정합니다. 로그인 상태는 유지되며 자동으로 다시 연결합니다.',
          });
        }
      }

      setLoading(false);
      return workerRef.current;
    }

    const nextWorker = data?.worker || null;
    workerRef.current = nextWorker;
    setWorker(nextWorker);
    setTodayEvents(Array.isArray(data?.today_events) ? data.today_events : []);
    setMonthEvents(Array.isArray(data?.month_events) ? data.month_events : []);
    setRiskBroadcasts(Array.isArray(data?.risk_broadcasts) ? data.risk_broadcasts : []);
    setAttendanceNotices(Array.isArray(data?.announcements) ? data.announcements : []);
    setLoading(false);
    return nextWorker;
  }, [
    deviceKey,
    isAttendanceSessionInvalidError,
    saveSession,
    sessionToken,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadMe(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMe]);


  useEffect(() => {
    /*
      앱을 다시 열었을 때 첫 세션 확인이 일시적으로 실패해도
      localStorage의 토큰이 남아 있으면 계속 재연결을 시도합니다.
    */
    if (!sessionToken) return undefined;

    const refresh = () => {
      void loadMe(sessionToken, true);
    };

    const timer = window.setInterval(refresh, 60 * 1000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [loadMe, sessionToken]);

  useEffect(() => {
    const standaloneMedia = window.matchMedia('(display-mode: standalone)');
    const fullscreenMedia = window.matchMedia('(display-mode: fullscreen)');
    const updateAppMode = () => setAppMode(isInstalledApp());

    standaloneMedia.addEventListener?.('change', updateAppMode);
    fullscreenMedia.addEventListener?.('change', updateAppMode);
    window.addEventListener('appinstalled', updateAppMode);

    return () => {
      standaloneMedia.removeEventListener?.('change', updateAppMode);
      fullscreenMedia.removeEventListener?.('change', updateAppMode);
      window.removeEventListener('appinstalled', updateAppMode);
    };
  }, []);

  useEffect(() => {
    if (appMode) return undefined;

    const handleBeforeInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, [appMode]);

  const handleInstall = async () => {
    if (!installPrompt) {
      setInstallHelpOpen(true);
      return;
    }
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const handleSignup = async () => {
    setMessage(null);
    const phone = normalizePhone(signup.phone);
    const nameKo = signup.nameKo.trim();
    const nameEn = signup.nameEn.trim();

    if (!ATTENDANCE_PROJECTS.includes(signup.projectName)) {
      setMessage({ severity: 'warning', text: '근무할 현장을 선택해주세요.' });
      return;
    }
    if (!/^[가-힣]{2,10}$/.test(nameKo)) {
      setMessage({ severity: 'warning', text: '이름은 한글 2~10자로 입력해주세요.' });
      return;
    }
    if (signup.isForeigner && !/^[A-Za-z .'-]{2,60}$/.test(nameEn)) {
      setMessage({ severity: 'warning', text: '외국인 근로자는 영문명을 입력해주세요.' });
      return;
    }
    if (!/^01\d{8,9}$/.test(phone)) {
      setMessage({ severity: 'warning', text: '휴대폰번호를 정확히 입력해주세요.' });
      return;
    }
    if (signup.tradeName.trim().length < 1) {
      setMessage({ severity: 'warning', text: '직종·공종을 입력해주세요.' });
      return;
    }
    if (!signup.isTestAccount && (signup.password.length < 8 || !/[A-Za-z]/.test(signup.password) || !/\d/.test(signup.password))) {
      setMessage({ severity: 'warning', text: '비밀번호는 영문과 숫자를 포함해 8자 이상 입력해주세요.' });
      return;
    }
    if (signup.password !== signup.passwordConfirm) {
      setMessage({ severity: 'warning', text: '비밀번호 확인이 일치하지 않습니다.' });
      return;
    }
    if (!signup.privacyAgreed) {
      setMessage({ severity: 'warning', text: '필수 개인정보 수집에 동의해주세요.' });
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc('attendance_worker_signup_v52_14_1', {
      p_project_name: signup.projectName,
      p_name_ko: nameKo,
      p_is_foreigner: signup.isForeigner,
      p_name_en: signup.isForeigner ? nameEn : null,
      p_is_test_account: signup.isTestAccount,
      p_phone: phone,
      p_trade_name: signup.tradeName.trim(),
      p_password: signup.password,
      p_device_key: deviceKey,
      p_user_agent: navigator.userAgent || '',
    });

    if (error) {
      setLoading(false);
      setMessage({ severity: 'error', text: error.message || '가입 신청에 실패했습니다.' });
      return;
    }

    saveSession(data?.session_token || '');
    setSignup({ ...initialSignup, projectName: signup.projectName });
    setMessage({
      severity: 'success',
      text: signup.isTestAccount
        ? '테스트계정 가입 신청이 완료되었습니다. 로그인 비밀번호는 1입니다.'
        : '가입 신청이 완료되었습니다. 현장담당자의 승인을 기다려주세요.',
    });
    await loadMe(data?.session_token || '', true);
  };

  const handleLogin = async () => {
    setMessage(null);
    const phone = normalizePhone(login.phone);
    if (!/^01\d{8,9}$/.test(phone) || !login.password) {
      setMessage({ severity: 'warning', text: '휴대폰번호와 비밀번호를 입력해주세요.' });
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc('attendance_worker_login_v52_14', {
      p_phone: phone,
      p_password: login.password,
      p_device_key: deviceKey,
      p_user_agent: navigator.userAgent || '',
    });

    if (error) {
      setLoading(false);
      setMessage({ severity: 'error', text: error.message || '로그인에 실패했습니다.' });
      return;
    }

    if (data?.code === 'device_change_requested') {
      setLoading(false);
      setMessage({ severity: 'info', text: data.message || '기기 변경 승인을 요청했습니다.' });
      return;
    }

    saveSession(data?.session_token || '');
    setLogin(initialLogin);
    await loadMe(data?.session_token || '', true);
  };

  const handleLogout = async () => {
    if (sessionToken) {
      await supabase.rpc('attendance_worker_logout_v52_14', {
        p_session_token: sessionToken,
      });
    }
    saveSession('');
    workerRef.current = null;
    setWorker(null);
    setTodayEvents([]);
    setMonthEvents([]);
    setRiskBroadcasts([]);
    setAttendanceNotices([]);
    setMessage(null);
    setMode('login');
  };

  const stopScanner = useCallback(() => {
    try {
      scannerControlsRef.current?.stop();
    } catch (error) {
      console.warn('QR 판독기 종료 오류:', error);
    }
    scannerControlsRef.current = null;

    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const closeScanner = useCallback(() => {
    stopScanner();
    setScannerOpen(false);
    setScannerStarting(false);
    setCameraReady(false);
  }, [stopScanner]);

  const requestCameraAndOpenScanner = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMessage({
        severity: 'error',
        text: getCameraErrorMessage(
          new Error('MediaDevicesUnavailable'),
        ),
      });
      return;
    }

    stopScanner();
    setMessage(null);
    setCameraReady(false);
    setScannerStarting(true);
    setCameraPermissionOpen(false);

    try {
      /*
        getUserMedia()를 반드시 사용자 버튼 클릭 흐름에서 호출합니다.
        권한이 아직 결정되지 않았다면 이 시점에 Chrome/Safari의
        카메라 허용/차단 시스템 팝업이 표시됩니다.
      */
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      if (!stream.getVideoTracks().length) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException(
          'CameraNotFound',
          'NotFoundError',
        );
      }

      cameraStreamRef.current = stream;
      setCameraPermissionState('granted');
      setScannerOpen(true);
    } catch (error) {
      console.error('카메라 권한 요청 오류:', error);
      stopScanner();
      setScannerStarting(false);

      const nextPermissionState =
        await queryCameraPermissionState();

      if (
        String(error?.name || '') === 'NotAllowedError' ||
        String(error?.name || '') === 'SecurityError' ||
        nextPermissionState === 'denied'
      ) {
        /*
          이미 차단된 권한은 웹페이지가 브라우저 시스템 팝업을
          강제로 다시 띄울 수 없습니다.
          검은 카메라 화면 대신 복구 방법을 즉시 표시합니다.
        */
        setCameraPermissionState('denied');
        setCameraPermissionOpen(true);
        return;
      }

      setMessage({
        severity: 'error',
        text: getCameraErrorMessage(error),
      });
    }
  };

  const handleOpenScanner = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMessage({
        severity: 'error',
        text: getCameraErrorMessage(
          new Error('MediaDevicesUnavailable'),
        ),
      });
      return;
    }

    const permissionState =
      await queryCameraPermissionState();

    setCameraPermissionState(permissionState);

    if (permissionState === 'granted') {
      await requestCameraAndOpenScanner();
      return;
    }

    /*
      prompt / denied / unknown:
      검은 카메라 화면부터 열지 않고 먼저 권한 안내창을 표시합니다.
      사용자가 "카메라 사용 허용"을 누른 다음 getUserMedia()를 호출합니다.
    */
    setCameraPermissionOpen(true);
  };

  const processQrToken = useCallback(async (rawValue) => {
    const qrToken = extractAttendanceQrToken(rawValue);
    if (!qrToken || !sessionToken || processingScan) return;

    setProcessingScan(true);
    closeScanner();

    const exchange = await supabase.rpc('attendance_exchange_qr_v52_14', {
      p_session_token: sessionToken,
      p_device_key: deviceKey,
      p_qr_token: qrToken,
    });

    if (exchange.error) {
      setMessage({ severity: 'error', text: exchange.error.message || 'QR 확인에 실패했습니다.' });
      setProcessingScan(false);
      return;
    }

    const finalize = await supabase.rpc('attendance_finalize_scan_v52_14', {
      p_session_token: sessionToken,
      p_device_key: deviceKey,
      p_processing_token: exchange.data?.processing_token || '',
    });

    if (finalize.error) {
      setMessage({ severity: 'error', text: finalize.error.message || '출·퇴근 처리에 실패했습니다.' });
      setProcessingScan(false);
      return;
    }

    const label = finalize.data?.event_type === 'check_in' ? '출근' : '퇴근';
    setMessage({
      severity: 'success',
      text: `${label} 처리가 완료되었습니다. ${formatKoreaDateTime(finalize.data?.event_at, { timeOnly: true, withSeconds: true })}`,
    });
    setProcessingScan(false);
    await loadMe(sessionToken, true);

    const url = new URL(window.location.href);
    url.searchParams.delete('attendanceQr');
    window.history.replaceState({}, '', url.toString());
  }, [closeScanner, deviceKey, loadMe, processingScan, sessionToken]);

  useEffect(() => {
    if (!worker || worker.status !== 'active' || !sessionToken) return;
    const deepLinkToken = new URLSearchParams(window.location.search).get('attendanceQr') || '';
    if (!deepLinkToken || handledDeepLinkRef.current === deepLinkToken) return;
    handledDeepLinkRef.current = deepLinkToken;
    processQrToken(deepLinkToken);
  }, [processQrToken, sessionToken, worker]);

  useEffect(() => {
    if (!scannerOpen || !scannerVideoElement || !cameraStreamRef.current) return undefined;

    /*
      v52.27:
      이 effect cleanup은 실제 scanner dependency가 바뀔 때만 실행되어야 합니다.
      loadMe의 worker dependency를 제거했기 때문에
      60초 세션 갱신이나 setWorker 자체가 카메라 stream을 끊지 않습니다.
    */
    let cancelled = false;
    const stream = cameraStreamRef.current;
    const video = scannerVideoElement;
    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: 800,
    });

    const startScanner = async () => {
      try {
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('autoplay', 'true');
        video.setAttribute('muted', 'true');
        video.setAttribute('playsinline', 'true');
        video.srcObject = stream;

        const videoReadyPromise = waitForVideoReady(video);
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          await Promise.race([
            videoReadyPromise,
            playPromise.then(() => videoReadyPromise),
          ]);
        } else {
          await videoReadyPromise;
        }

        if (cancelled) return;
        setCameraReady(true);
        setScannerStarting(false);

        const canvas = document.createElement('canvas');
        let canvasContext;
        try {
          canvasContext = canvas.getContext('2d', { willReadFrequently: true });
        } catch {
          canvasContext = canvas.getContext('2d');
        }
        if (!canvasContext) throw new Error('CameraCanvasUnavailable');

        let stopped = false;
        let scanTimerId;
        const controls = {
          stop: () => {
            stopped = true;
            window.clearTimeout(scanTimerId);
          },
        };
        scannerControlsRef.current = controls;

        const scanFrame = () => {
          if (cancelled || stopped) return;
          if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }
            try {
              canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
              const result = reader.decodeFromCanvas(canvas);
              if (result) {
                controls.stop();
                processQrToken(result.getText());
                return;
              }
            } catch {
              // QR이 없는 프레임은 정상이며 다음 프레임에서 다시 판독합니다.
            }
          }
          scanTimerId = window.setTimeout(scanFrame, 140);
        };
        scanFrame();
      } catch (error) {
        if (cancelled) return;
        console.error('카메라 실행 오류:', error);
        stopScanner();
        setScannerOpen(false);
        setScannerStarting(false);
        setCameraReady(false);
        setMessage({ severity: 'error', text: getCameraErrorMessage(error) });
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [processQrToken, scannerOpen, scannerVideoElement, stopScanner]);

  if (loading && !worker) {
    return (
      <MobileShell appMode={appMode}>
        <Box sx={{ py: 12, textAlign: 'center' }}>
          <CircularProgress />
          <Typography sx={{ mt: 2, color: '#64748b', fontSize: appMode ? '1rem' : undefined }}>근태 계정을 확인하고 있습니다.</Typography>
        </Box>
      </MobileShell>
    );
  }

  if (worker) {
    const meta = statusMeta[worker.status] || statusMeta.pending;
    const checkIn = todayEvents.find((item) => item.event_type === 'check_in');
    const checkOut = todayEvents.find((item) => item.event_type === 'check_out');

    return (
      <MobileShell
        appMode={appMode}
        topBanner={<AttendanceNoticeTicker notices={attendanceNotices} appMode={appMode} />}
        headerAction={
          <IconButton
            aria-label="로그아웃"
            title="로그아웃"
            onClick={handleLogout}
            sx={{
              width: appMode ? 44 : 40,
              height: appMode ? 44 : 40,
              color: '#ffffff',
              bgcolor: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.28)',
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.2)',
              },
            }}
          >
            <LogoutRoundedIcon />
          </IconButton>
        }
      >
        <AttendanceToast message={message} onClose={() => setMessage(null)} appMode={appMode} />
        <RiskBroadcastPanel broadcasts={riskBroadcasts} />

        <Box sx={{ mb: 2 }}>
          <MonthlyAttendanceCalendar
            monthEvents={monthEvents}
            todayEvents={todayEvents}
            selectedDate={selectedAttendanceDate}
            onSelectDate={setSelectedAttendanceDate}
          />
        </Box>

        <Paper
          variant="outlined"
          sx={{
            p: appMode ? 3 : 2.25,
            borderRadius: appMode ? 3.5 : 3,
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
            <Box>
              <Typography sx={{ fontSize: appMode ? '1.4rem' : '1.15rem', fontWeight: 900 }}>{worker.name_ko}</Typography>
              <Typography sx={{ mt: 0.5, color: '#64748b', fontSize: appMode ? '0.98rem' : '0.78rem', lineHeight: 1.45 }}>{worker.project_name}</Typography>
              <Typography sx={{ mt: appMode ? 0.35 : 0, color: '#64748b', fontSize: appMode ? '0.92rem' : '0.74rem' }}>{worker.trade_name}</Typography>
            </Box>
            <Chip label={meta.label} color={meta.color} size="small" />
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Typography sx={{ color: '#64748b', fontSize: appMode ? '0.98rem' : '0.78rem', lineHeight: 1.7 }}>{meta.description}</Typography>
        </Paper>

        {worker.status === 'active' ? (
          <>
            <Card variant="outlined" sx={{ mt: 2, borderRadius: appMode ? 3.5 : 3 }}>
              <CardContent sx={{ p: appMode ? 3 : undefined, '&:last-child': { pb: appMode ? 3 : undefined } }}>
                <Typography sx={{ fontSize: appMode ? '1rem' : '0.78rem', color: '#64748b', fontWeight: 800 }}>오늘 출·퇴근</Typography>
                <Stack direction="row" spacing={appMode ? 2 : 1.5} sx={{ mt: appMode ? 2 : 1.5 }}>
                  <Paper variant="outlined" sx={{ flex: 1, p: appMode ? 2.25 : 1.5, textAlign: 'center', bgcolor: checkIn ? '#ecfdf5' : '#f8fafc', borderRadius: appMode ? 3 : undefined }}>
                    <Typography sx={{ fontSize: appMode ? '0.95rem' : '0.7rem', color: '#64748b' }}>출근</Typography>
                    <Typography sx={{ mt: 0.65, fontSize: appMode ? '1.35rem' : undefined, fontWeight: 900, color: checkIn ? '#047857' : '#94a3b8' }}>
                      {checkIn ? formatKoreaDateTime(checkIn.event_at, { timeOnly: true }) : '미처리'}
                    </Typography>
                  </Paper>
                  <Paper variant="outlined" sx={{ flex: 1, p: appMode ? 2.25 : 1.5, textAlign: 'center', bgcolor: checkOut ? '#ecfdf5' : '#f8fafc', borderRadius: appMode ? 3 : undefined }}>
                    <Typography sx={{ fontSize: appMode ? '0.95rem' : '0.7rem', color: '#64748b' }}>퇴근</Typography>
                    <Typography sx={{ mt: 0.65, fontSize: appMode ? '1.35rem' : undefined, fontWeight: 900, color: checkOut ? '#047857' : '#94a3b8' }}>
                      {checkOut ? formatKoreaDateTime(checkOut.event_at, { timeOnly: true }) : '미처리'}
                    </Typography>
                  </Paper>
                </Stack>
              </CardContent>
            </Card>

            <Button
              fullWidth
              variant="contained"
              size="large"
              startIcon={processingScan ? <CircularProgress size={20} color="inherit" /> : <CameraAltRoundedIcon />}
              onClick={handleOpenScanner}
              disabled={processingScan || scannerStarting || Boolean(checkIn && checkOut)}
              sx={{ mt: 2, minHeight: appMode ? 66 : 58, borderRadius: appMode ? 3 : 2.5, bgcolor: primaryActionColor, fontWeight: 900, fontSize: appMode ? '1.08rem' : '1rem', '&:hover': { bgcolor: primaryActionColor } }}
            >
              {checkIn && checkOut ? '오늘 근태 처리 완료' : processingScan ? '처리 중' : scannerStarting ? '카메라 준비 중' : '출·퇴근 QR 촬영'}
            </Button>
          </>
        ) : (
          <Button fullWidth variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={() => loadMe(sessionToken)} sx={{ mt: 2 }}>
            승인상태 다시 확인
          </Button>
        )}

        {!appMode && (
          <Button
            fullWidth
            variant="outlined"
            startIcon={<AddToHomeScreenRoundedIcon />}
            onClick={handleInstall}
            sx={{ mt: 2 }}
          >
            앱으로 설치
          </Button>
        )}
        <Dialog
          open={cameraPermissionOpen}
          onClose={() => {
            if (!scannerStarting) {
              setCameraPermissionOpen(false);
            }
          }}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle sx={{ fontWeight: 900 }}>
            카메라 권한 필요
          </DialogTitle>
          <DialogContent dividers>
            {cameraPermissionState === 'denied' ? (
              <Stack spacing={1.25}>
                <Alert severity="warning">
                  카메라 권한이 현재 차단되어 있습니다.
                  차단된 권한은 앱에서 시스템 허용창을 강제로
                  다시 띄울 수 없습니다.
                </Alert>
                <Typography
                  sx={{
                    fontSize: appMode ? '0.94rem' : '0.8rem',
                    lineHeight: 1.8,
                  }}
                >
                  Android Chrome에서는
                  <b> Chrome 설정 → 사이트 설정 → 카메라</b>에서
                  현재 욱림건설 근태시스템 사이트를 찾아
                  <b> 허용</b>으로 변경해주세요.
                </Typography>
                <Typography
                  sx={{
                    fontSize: appMode ? '0.88rem' : '0.74rem',
                    color: '#64748b',
                    lineHeight: 1.7,
                  }}
                >
                  Android 자체에서 Chrome의 카메라 권한이 꺼져
                  있다면 휴대폰 설정 → 앱 → Chrome → 권한 →
                  카메라도 허용해야 합니다.
                </Typography>
              </Stack>
            ) : (
              <Stack spacing={1.25}>
                <Alert severity="info">
                  출·퇴근 QR 촬영을 위해 후면 카메라 권한이
                  필요합니다.
                </Alert>
                <Typography
                  sx={{
                    fontSize: appMode ? '0.94rem' : '0.8rem',
                    lineHeight: 1.8,
                  }}
                >
                  아래 <b>카메라 사용 허용</b>을 누르면
                  Chrome/Safari의 카메라 권한창이 표시됩니다.
                  권한창에서 <b>허용</b>을 선택해주세요.
                </Typography>
              </Stack>
            )}
          </DialogContent>
          <Box
            sx={{
              px: 3,
              py: 2,
              display: 'flex',
              gap: 1,
              justifyContent: 'flex-end',
            }}
          >
            <Button
              color="inherit"
              disabled={scannerStarting}
              onClick={() => setCameraPermissionOpen(false)}
            >
              취소
            </Button>
            <Button
              variant="contained"
              startIcon={
                scannerStarting
                  ? <CircularProgress size={18} color="inherit" />
                  : <CameraAltRoundedIcon />
              }
              disabled={scannerStarting}
              onClick={requestCameraAndOpenScanner}
              sx={{
                bgcolor: primaryActionColor,
                fontWeight: 900,
                '&:hover': {
                  bgcolor: primaryActionColor,
                },
              }}
            >
              {scannerStarting
                ? '권한 확인 중'
                : cameraPermissionState === 'denied'
                  ? '카메라 권한 다시 확인'
                  : '카메라 사용 허용'}
            </Button>
          </Box>
        </Dialog>

        <Dialog open={scannerOpen} onClose={closeScanner} fullWidth maxWidth="xs">
          <DialogTitle sx={{ pr: 6, fontWeight: 900 }}>
            동적 QR 촬영
            <IconButton onClick={closeScanner} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseRoundedIcon /></IconButton>
          </DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 1.5, fontSize: '0.75rem' }}>화면의 QR을 네모 안에 맞춰주세요. 인식 즉시 서버에서 처리합니다.</Alert>
            <Box sx={{ position: 'relative', bgcolor: '#000', borderRadius: 2, overflow: 'hidden', aspectRatio: '1 / 1' }}>
              <Box component="video" ref={handleScannerVideoRef} autoPlay muted playsInline sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {!cameraReady && (
                <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ position: 'absolute', inset: 0, bgcolor: '#020617', color: '#fff', zIndex: 2 }}>
                  <CircularProgress size={34} color="inherit" />
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 800 }}>후면 카메라를 준비하고 있습니다.</Typography>
                </Stack>
              )}
              <Box sx={{ position: 'absolute', inset: '15%', border: '3px solid #38bdf8', borderRadius: 2, boxShadow: '0 0 0 999px rgba(0,0,0,0.28)' }} />
            </Box>
          </DialogContent>
        </Dialog>

        <Dialog open={!appMode && installHelpOpen} onClose={() => setInstallHelpOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle sx={{ fontWeight: 900 }}>근태앱 설치</DialogTitle>
          <DialogContent>
            <Stack spacing={1}>
              <Typography sx={{ fontSize: '0.84rem', lineHeight: 1.8 }}>
                아이폰은 Safari 하단의 공유 버튼을 누른 뒤 <b>홈 화면에 추가</b>를 선택하세요.
              </Typography>
              <Typography sx={{ fontSize: '0.84rem', lineHeight: 1.8 }}>
                안드로이드는 Chrome 메뉴의 <b>앱 설치</b>를 선택하세요. <b>홈 화면에 추가</b> 방식은 사용하지 않는 것을 권장합니다.
              </Typography>
              <Alert severity="info" sx={{ fontSize: '0.74rem' }}>
                기존에 홈 화면 바로가기 방식으로 설치한 경우 Chrome이 “이 앱의 URL 복사하기” 시스템 알림을 표시할 수 있습니다. 기존 아이콘을 제거한 뒤 Chrome의 “앱 설치” 방식으로 다시 설치해주세요.
              </Alert>
            </Stack>
          </DialogContent>
        </Dialog>
      </MobileShell>
    );
  }

  return (
    <MobileShell appMode={appMode}>
      <AttendanceToast message={message} onClose={() => setMessage(null)} appMode={appMode} />
      <Paper variant="outlined" sx={{ p: appMode ? 3 : 2.25, borderRadius: appMode ? 3.5 : 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          {mode === 'signup' && <IconButton size="small" onClick={() => setMode('login')}><ArrowBackRoundedIcon /></IconButton>}
          <Box>
            <Typography sx={{ fontSize: appMode ? '1.4rem' : '1.15rem', fontWeight: 900 }}>{mode === 'signup' ? '근로자 가입 신청' : '근로자 로그인'}</Typography>
            <Typography sx={{ mt: appMode ? 0.45 : 0, color: '#64748b', fontSize: appMode ? '0.92rem' : '0.74rem' }}>별도의 사내 ERP 계정 없이 이용합니다.</Typography>
          </Box>
        </Stack>

        {mode === 'login' ? (
          <Stack spacing={1.5}>
            <TextField label="휴대폰번호" value={formatPhone(login.phone)} onChange={(event) => setLogin((prev) => ({ ...prev, phone: normalizePhone(event.target.value) }))} inputMode="tel" autoComplete="tel" />
            <TextField label="비밀번호" type="password" value={login.password} onChange={(event) => setLogin((prev) => ({ ...prev, password: event.target.value }))} autoComplete="current-password" onKeyDown={(event) => { if (event.key === 'Enter') handleLogin(); }} />
            <Button variant="contained" size="large" startIcon={<LoginRoundedIcon />} onClick={handleLogin} disabled={loading} sx={{ minHeight: appMode ? 60 : 50, bgcolor: primaryActionColor, fontWeight: 900, '&:hover': { bgcolor: primaryActionColor } }}>로그인</Button>
            <Button variant="outlined" startIcon={<HowToRegRoundedIcon />} onClick={() => setMode('signup')}>처음 이용하시나요? 가입 신청</Button>
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <FormControl fullWidth>
              <InputLabel>근무 현장</InputLabel>
              <Select label="근무 현장" value={signup.projectName} onChange={(event) => setSignup((prev) => ({ ...prev, projectName: event.target.value }))}>
                {ATTENDANCE_PROJECTS.map((project) => <MenuItem key={project} value={project}>{project}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label="이름(한글)"
              value={signup.nameKo}
              onChange={(event) => setSignup((prev) => ({ ...prev, nameKo: event.target.value.slice(0, 10) }))}
              inputProps={{ maxLength: 10 }}
            />
            <FormControlLabel control={<Checkbox checked={signup.isForeigner} onChange={(event) => setSignup((prev) => ({ ...prev, isForeigner: event.target.checked, nameEn: event.target.checked ? prev.nameEn : '' }))} />} label="외국인 근로자입니다" />
            {signup.isForeigner && <TextField label="영문명" value={signup.nameEn} onChange={(event) => setSignup((prev) => ({ ...prev, nameEn: event.target.value }))} helperText="여권 또는 외국인등록증의 영문명" />}
            <FormControlLabel
              control={(
                <Checkbox
                  checked={signup.isTestAccount}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSignup((prev) => ({
                      ...prev,
                      isTestAccount: checked,
                      password: checked ? '1' : '',
                      passwordConfirm: checked ? '1' : '',
                    }));
                    setMessage(checked ? { severity: 'info', text: '테스트계정의 로그인 비밀번호는 자동으로 1로 설정됩니다.' } : null);
                  }}
                />
              )}
              label="테스트계정입니다"
            />
            {signup.isTestAccount && (
              <Alert severity="info" sx={{ fontSize: appMode ? '0.92rem' : '0.75rem' }}>
                테스트계정 비밀번호는 <b>1</b>입니다. 담당자 승인 후 휴대폰번호와 비밀번호 1로 로그인하세요.
              </Alert>
            )}
            <TextField label="휴대폰번호" value={formatPhone(signup.phone)} onChange={(event) => setSignup((prev) => ({ ...prev, phone: normalizePhone(event.target.value) }))} inputMode="tel" />
            <TextField label="직종·공종" value={signup.tradeName} onChange={(event) => setSignup((prev) => ({ ...prev, tradeName: event.target.value }))} placeholder="예: 경량, 합지, 몰딩" />
            {!signup.isTestAccount && (
              <>
                <TextField label="비밀번호" type="password" value={signup.password} onChange={(event) => setSignup((prev) => ({ ...prev, password: event.target.value }))} helperText="영문과 숫자를 포함해 8자 이상" autoComplete="new-password" />
                <TextField label="비밀번호 확인" type="password" value={signup.passwordConfirm} onChange={(event) => setSignup((prev) => ({ ...prev, passwordConfirm: event.target.value }))} autoComplete="new-password" />
              </>
            )}
            <FormControlLabel
              control={<Checkbox checked={signup.privacyAgreed} onChange={(event) => setSignup((prev) => ({ ...prev, privacyAgreed: event.target.checked }))} />}
              label={<Typography sx={{ fontSize: appMode ? '0.92rem' : '0.75rem', lineHeight: 1.6 }}>[필수] 가입 승인과 근태처리를 위한 이름·휴대폰·직종·등록기기 정보 수집에 동의합니다. 위치정보는 수집하지 않습니다.</Typography>}
            />
            <Button variant="contained" size="large" onClick={handleSignup} disabled={loading} sx={{ minHeight: appMode ? 60 : 50, bgcolor: primaryActionColor, fontWeight: 900, '&:hover': { bgcolor: primaryActionColor } }}>가입 신청</Button>
          </Stack>
        )}
      </Paper>
      {!appMode && <Button fullWidth variant="text" startIcon={<AddToHomeScreenRoundedIcon />} onClick={handleInstall} sx={{ mt: 1.5 }}>근태앱 설치</Button>}
    </MobileShell>
  );
}
