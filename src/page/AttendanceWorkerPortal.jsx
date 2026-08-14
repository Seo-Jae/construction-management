import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CameraAltRoundedIcon from '@mui/icons-material/CameraAltRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import HowToRegRoundedIcon from '@mui/icons-material/HowToRegRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { BrowserQRCodeReader } from '@zxing/browser';
import AttendanceMobileAdminQr from '../components/AttendanceMobileAdminQr.jsx';
import AttendanceCheckoutProgressDialog from '../components/AttendanceCheckoutProgressDialog.jsx';
import AttendanceWorkAssignmentDialog from '../components/AttendanceWorkAssignmentDialog.jsx';
import { supabase } from '../supabaseClient';
import {
  ATTENDANCE_PROJECTS,
  ATTENDANCE_SESSION_STORAGE_KEY,
  ATTENDANCE_TRADE_OPTIONS,
  extractAttendanceQrToken,
  formatKoreaDateTime,
  formatPhone,
  getAttendanceDeviceKey,
  normalizePhone,
} from '../utils/attendance';
import {
  ATTENDANCE_LANGUAGES,
  createAttendanceTranslator,
  getAttendanceTradeLabel,
  getAttendanceLocale,
  readAttendanceLanguage,
  saveAttendanceLanguage,
} from '../utils/attendanceI18n';

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

const initialWorkAssignment = {
  locationMode: 'standard',
  building: '',
  floor: '',
  locationText: '',
  tradeName: '',
};

const initialCheckoutProgress = {
  completionState: '',
  progressProcessType: '',
  selectedUnits: new Set(),
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

function MonthlyAttendanceCalendar({ monthEvents, todayEvents, selectedDate, onSelectDate, appMode = false, t, locale }) {
  const calendar = getCurrentMonthCalendar();
  const attendanceByDate = buildAttendanceByDate(monthEvents, todayEvents);
  const selectedEvents = attendanceByDate[selectedDate] || {};
  const selectedDay = Number(String(selectedDate || '').slice(-2));

  return (
    <Paper variant="outlined" sx={{ p: appMode ? 3.5 : 2, borderRadius: appMode ? 4 : 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: appMode ? 2.2 : 1.25 }}>
        <Typography sx={{ fontSize: appMode ? '1.3rem' : '0.84rem', fontWeight: 900 }}>{t('monthlyAttendance')}</Typography>
        <Typography sx={{ fontSize: appMode ? '1.05rem' : '0.76rem', color: '#64748b', fontWeight: 800 }}>
          {t('yearMonth', { year: calendar.year, month: String(calendar.month).padStart(2, '0') })}
        </Typography>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.4 }}>
        {t('weekdays').map((weekday, index) => (
          <Typography
            key={weekday}
            sx={{
              py: appMode ? 0.65 : 0.35,
              textAlign: 'center',
              fontSize: appMode ? '0.94rem' : '0.64rem',
              fontWeight: 800,
              color: index === 0 ? '#dc2626' : index === 6 ? '#2563eb' : '#64748b',
            }}
          >
            {weekday}
          </Typography>
        ))}

        {calendar.cells.map((day, index) => {
          if (!day) return <Box key={`empty-${index}`} sx={{ minHeight: appMode ? 64 : 43 }} />;
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
              aria-label={t('dateAttendanceAria', { month: calendar.month, day })}
              sx={{
                minWidth: 0,
                minHeight: appMode ? 64 : 43,
                p: appMode ? 0.65 : 0.35,
                borderRadius: appMode ? 2.2 : 1.5,
                border: '1px solid',
                borderColor: isSelected ? APP_BRAND_GREEN : isToday ? '#86efac' : 'transparent',
                bgcolor: isSelected ? '#ecfdf5' : '#fff',
                color: '#0f172a',
                font: 'inherit',
                cursor: 'pointer',
              }}
            >
              <Typography sx={{ fontSize: appMode ? '1rem' : '0.68rem', lineHeight: 1, fontWeight: isToday ? 900 : 700 }}>
                {day}
              </Typography>
              <Stack direction="row" spacing={0.25} justifyContent="center" sx={{ mt: 0.55, minHeight: 15 }}>
                {hasCheckIn && (
                  <Box sx={{ px: appMode ? 0.65 : 0.45, py: 0.1, borderRadius: 2, bgcolor: '#d1fae5', color: '#047857', fontSize: appMode ? '0.7rem' : '0.52rem', fontWeight: 900 }}>
                    {t('checkInShort')}
                  </Box>
                )}
                {hasCheckOut && (
                  <Box sx={{ px: appMode ? 0.65 : 0.45, py: 0.1, borderRadius: 2, bgcolor: '#dbeafe', color: '#1d4ed8', fontSize: appMode ? '0.7rem' : '0.52rem', fontWeight: 900 }}>
                    {t('checkOutShort')}
                  </Box>
                )}
              </Stack>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ mt: appMode ? 2 : 1.25, px: appMode ? 2 : 1.25, py: appMode ? 1.6 : 1, borderRadius: appMode ? 2.5 : 1.75, bgcolor: '#f8fafc' }}>
        <Typography sx={{ fontSize: appMode ? '0.98rem' : '0.68rem', color: '#64748b', fontWeight: 800 }}>
          {t('dayAttendance', { month: calendar.month, day: selectedDay || Number(calendar.todayKey.slice(-2)) })}
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ mt: 0.45 }}>
          <Typography sx={{ fontSize: appMode ? '1.08rem' : '0.74rem', fontWeight: 900, color: selectedEvents.check_in ? '#047857' : '#94a3b8' }}>
            {t('checkIn')} {selectedEvents.check_in ? formatKoreaDateTime(selectedEvents.check_in.event_at, { timeOnly: true, locale }) : t('unprocessed')}
          </Typography>
          <Typography sx={{ fontSize: appMode ? '1.08rem' : '0.74rem', fontWeight: 900, color: selectedEvents.check_out ? '#1d4ed8' : '#94a3b8' }}>
            {t('checkOut')} {selectedEvents.check_out ? formatKoreaDateTime(selectedEvents.check_out.event_at, { timeOnly: true, locale }) : t('unprocessed')}
          </Typography>
        </Stack>
      </Box>
    </Paper>
  );
}

function RiskBroadcastPanel({ broadcasts, appMode = false, t, locale }) {
  const activeBroadcasts = Array.isArray(broadcasts) ? broadcasts : [];

  return (
    <Paper variant="outlined" sx={{ p: appMode ? 3.5 : 2, mb: appMode ? 3 : 2, borderRadius: appMode ? 4 : 3, borderColor: '#fecaca', bgcolor: '#fffafa' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Typography sx={{ fontSize: appMode ? '1.34rem' : '0.86rem', fontWeight: 900, color: '#991b1b' }}>
          {t('riskTitle')}
        </Typography>
        <Chip
          label={activeBroadcasts.length ? t('itemCount', { count: activeBroadcasts.length }) : t('noneRegistered')}
          size="small"
          sx={{ height: appMode ? 34 : 22, fontSize: appMode ? '0.9rem' : '0.62rem', fontWeight: 800, bgcolor: '#fee2e2', color: '#991b1b' }}
        />
      </Stack>

      {activeBroadcasts.length === 0 ? (
        <Typography sx={{ mt: 1, fontSize: appMode ? '1.08rem' : '0.74rem', color: '#64748b' }}>
          {t('noRisk')}
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
                  gap: appMode ? 1.7 : 1.15,
                  p: appMode ? 1.8 : 1.15,
                  borderRadius: appMode ? 2.8 : 2,
                  bgcolor: '#fff',
                  border: '1px solid #fee2e2',
                }}
              >
                <Box
                  sx={{
                    width: appMode ? 56 : 42,
                    height: appMode ? 56 : 42,
                    flex: appMode ? '0 0 56px' : '0 0 42px',
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: badgeBackground,
                    color: badgeColor,
                    fontSize: appMode ? '0.9rem' : '0.7rem',
                    fontWeight: 900,
                    border: `1px solid ${badgeColor}33`,
                  }}
                >
                  {isCommon ? t('common') : t('assigned')}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ whiteSpace: 'pre-wrap', color: '#1e293b', fontSize: appMode ? '1.08rem' : '0.78rem', fontWeight: 800, lineHeight: 1.65 }}>
                    {broadcast.content}
                  </Typography>
                  <Typography sx={{ mt: 0.55, color: '#64748b', fontSize: appMode ? '0.88rem' : '0.64rem', lineHeight: 1.5 }}>
                    {formatKoreaDateTime(broadcast.created_at, { locale })} · {broadcast.author_position || broadcast.author_role || t('author')} {broadcast.author_name || ''}
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

const getCameraErrorMessage = (error, t) => {
  const errorName = String(error?.name || '');
  const errorMessage = String(error?.message || '');

  if (!window.isSecureContext) {
    return t('cameraHttpsError');
  }
  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return t('cameraDeniedError');
  }
  if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
    return t('cameraNotFoundError');
  }
  if (errorName === 'NotReadableError' || errorName === 'TrackStartError' || errorName === 'AbortError') {
    return t('cameraBusyError');
  }
  if (errorName === 'OverconstrainedError' || errorName === 'ConstraintNotSatisfiedError') {
    return t('cameraConstraintError');
  }
  if (errorMessage.includes('CameraPreviewTimeout')) {
    return t('cameraTimeoutError');
  }
  return t('cameraStartError');
};

const readInitialProject = () => {
  const requested = new URLSearchParams(window.location.search).get('project');
  return ATTENDANCE_PROJECTS.includes(requested) ? requested : '';
};

const getStatusMeta = (t) => ({
  pending: {
    label: t('pending'),
    color: 'warning',
    description: t('pendingDescription'),
  },
  active: {
    label: t('active'),
    color: 'success',
    description: t('activeDescription'),
  },
  rejected: {
    label: t('rejected'),
    color: 'error',
    description: t('rejectedDescription'),
  },
  disabled: {
    label: t('disabled'),
    color: 'error',
    description: t('disabledDescription'),
  },
});

function AttendanceNoticeTicker({ notices, appMode = false, t }) {
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
      aria-label={t('noticeAria', { content: ariaText })}
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
        {t('notice')}
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
  contentMaxWidth = null,
  cleanLogin = false,
  appTitle = '욱림건설 근태시스템',
}) {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        bgcolor: cleanLogin
          ? '#ffffff'
          : appMode
            ? '#f5f7f6'
            : '#eef3f8',
      }}
    >
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          display: cleanLogin ? 'none' : 'flex',
          bgcolor: appMode ? APP_BRAND_GREEN : '#0f4c81',
          pt: appMode ? 'env(safe-area-inset-top)' : 0,
        }}
      >
        <Toolbar
          sx={{
            minHeight: appMode ? '72px !important' : '58px !important',
            px: appMode ? '5%' : 2,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ minWidth: 0, flex: '1 1 auto' }}
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
            <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: appMode ? '0.72rem' : '0.65rem', fontWeight: 900, letterSpacing: '0.12em', color: appMode ? 'rgba(255,255,255,0.86)' : '#bae6fd' }}>
              WOOKLIM CONSTRUCTION
            </Typography>
            <Typography noWrap sx={{ fontSize: appMode ? '1.18rem' : '1rem', fontWeight: 900 }}>
              {appTitle}
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
          maxWidth:
            contentMaxWidth ||
            (appMode ? 'none' : 520),
          mx: 'auto',
          px: cleanLogin
            ? 0
            : appMode
              ? 0.75
              : 2,
          pt: cleanLogin
            ? 0
            : appMode
              ? 2.5
              : 2,
          pb: cleanLogin
            ? 'calc(36px + env(safe-area-inset-bottom))'
            : appMode
              ? 'calc(24px + env(safe-area-inset-bottom))'
              : 2,
          ...(appMode && !cleanLogin && {
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
  const [language, setLanguage] = useState(readAttendanceLanguage);
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
  const [pendingCheckIn, setPendingCheckIn] = useState(null);
  const [workAssignment, setWorkAssignment] = useState(initialWorkAssignment);
  const [workAssignmentSubmitting, setWorkAssignmentSubmitting] = useState(false);
  const [pendingCheckOut, setPendingCheckOut] = useState(null);
  const [checkoutProgress, setCheckoutProgress] = useState(initialCheckoutProgress);
  const [checkoutProgressSubmitting, setCheckoutProgressSubmitting] = useState(false);
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
  const cleanAuthLayout = appMode && ['login', 'signup'].includes(mode);
  const t = useMemo(
    () => createAttendanceTranslator(language),
    [language],
  );
  const locale = getAttendanceLocale(language);

  const handleLanguageChange = (event) => {
    const nextLanguage = saveAttendanceLanguage(
      event.target.value,
    );
    setLanguage(nextLanguage);
    setMessage(null);
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) return undefined;

    const previousColor =
      metaTheme.getAttribute('content') ||
      APP_BRAND_GREEN;

    metaTheme.setAttribute(
      'content',
      appMode && ['login', 'signup', 'admin'].includes(mode)
        ? '#ffffff'
        : APP_BRAND_GREEN,
    );

    return () => {
      metaTheme.setAttribute(
        'content',
        previousColor,
      );
    };
  }, [appMode, mode]);

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
          text: t('sessionInvalid'),
        });
      } else {
        /*
          인터넷 끊김, Supabase 일시 장애, 포커스 복귀 순간의 통신 실패 등은
          기존 로그인과 현재 화면을 그대로 유지합니다.
        */
        if (!silent) {
          setMessage({
            severity: 'warning',
            text: t('connectionUnstable'),
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
    t,
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
      setMessage({ severity: 'warning', text: t('selectProject') });
      return;
    }
    if (!/^[가-힣]{2,10}$/.test(nameKo)) {
      setMessage({ severity: 'warning', text: t('invalidKoreanName') });
      return;
    }
    if (signup.isForeigner && !/^[A-Za-z .'-]{2,60}$/.test(nameEn)) {
      setMessage({ severity: 'warning', text: t('invalidEnglishName') });
      return;
    }
    if (!/^01\d{8,9}$/.test(phone)) {
      setMessage({ severity: 'warning', text: t('invalidPhone') });
      return;
    }
    if (signup.tradeName.trim().length < 1) {
      setMessage({ severity: 'warning', text: t('invalidTrade') });
      return;
    }
    if (!signup.isTestAccount && (signup.password.length < 8 || !/[A-Za-z]/.test(signup.password) || !/\d/.test(signup.password))) {
      setMessage({ severity: 'warning', text: t('invalidPassword') });
      return;
    }
    if (signup.password !== signup.passwordConfirm) {
      setMessage({ severity: 'warning', text: t('passwordMismatch') });
      return;
    }
    if (!signup.privacyAgreed) {
      setMessage({ severity: 'warning', text: t('privacyRequired') });
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.rpc('attendance_worker_signup_v52_48_5_5', {
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
      setMessage({ severity: 'error', text: t('signupFailed') });
      return;
    }

    saveSession(data?.session_token || '');
    setSignup({ ...initialSignup, projectName: signup.projectName });
    setMessage({
      severity: 'success',
      text: signup.isTestAccount
        ? t('testSignupSuccess')
        : t('signupSuccess'),
    });
    await loadMe(data?.session_token || '', true);
  };

  const handleLogin = async () => {
    setMessage(null);
    const phone = normalizePhone(login.phone);
    if (!/^01\d{8,9}$/.test(phone) || !login.password) {
      setMessage({ severity: 'warning', text: t('loginRequiredFields') });
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
      setMessage({ severity: 'error', text: t('loginFailed') });
      return;
    }

    if (data?.code === 'device_change_requested') {
      setLoading(false);
      setMessage({ severity: 'info', text: t('deviceChangeRequested') });
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
    setPendingCheckIn(null);
    setWorkAssignment(initialWorkAssignment);
    setWorkAssignmentSubmitting(false);
    setPendingCheckOut(null);
    setCheckoutProgress(initialCheckoutProgress);
    setCheckoutProgressSubmitting(false);
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
          t,
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
        text: getCameraErrorMessage(error, t),
      });
    }
  };

  const handleOpenScanner = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMessage({
        severity: 'error',
        text: getCameraErrorMessage(
          new Error('MediaDevicesUnavailable'),
          t,
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
      setMessage({ severity: 'error', text: t('qrCheckFailed') });
      setProcessingScan(false);
      return;
    }

    const processingToken = exchange.data?.processing_token || '';

    if (exchange.data?.event_type === 'check_in') {
      const prepared = await supabase.rpc(
        'attendance_prepare_work_context_v52_48_5_5',
        {
          p_session_token: sessionToken,
          p_device_key: deviceKey,
          p_processing_token: processingToken,
        },
      );

      if (prepared.error) {
        setMessage({ severity: 'error', text: t('workOptionsFailed') });
        setProcessingScan(false);
        return;
      }

      const defaultTrade = String(
        prepared.data?.default_trade_name || '',
      ).trim();

      setWorkAssignment({
        ...initialWorkAssignment,
        tradeName: ATTENDANCE_TRADE_OPTIONS.includes(defaultTrade)
          ? defaultTrade
          : '',
      });
      setPendingCheckIn({
        processingToken,
        buildings: Array.isArray(prepared.data?.buildings)
          ? prepared.data.buildings
          : [],
      });
      setProcessingScan(false);

      const url = new URL(window.location.href);
      url.searchParams.delete('attendanceQr');
      window.history.replaceState({}, '', url.toString());
      return;
    }

    const prepared = await supabase.rpc(
      'attendance_prepare_checkout_context_v52_48_5_9',
      {
        p_session_token: sessionToken,
        p_device_key: deviceKey,
        p_processing_token: processingToken,
      },
    );

    if (prepared.error) {
      setMessage({ severity: 'error', text: t('checkoutContextFailed') });
      setProcessingScan(false);
      return;
    }

    const processOptions = Array.isArray(
      prepared.data?.progress_process_options,
    )
      ? prepared.data.progress_process_options
      : [];
    const canSubmitProgress = Boolean(
      prepared.data?.can_submit_progress,
    );

    setCheckoutProgress({
      completionState: canSubmitProgress ? '' : 'none',
      progressProcessType: processOptions.length === 1
        ? processOptions[0]
        : '',
      selectedUnits: new Set(),
    });
    setPendingCheckOut({
      ...prepared.data,
      processingToken,
    });
    setProcessingScan(false);

    const url = new URL(window.location.href);
    url.searchParams.delete('attendanceQr');
    window.history.replaceState({}, '', url.toString());
  }, [closeScanner, deviceKey, processingScan, sessionToken, t]);

  const handleWorkAssignmentChange = useCallback((changes) => {
    setWorkAssignment((previous) => ({
      ...previous,
      ...changes,
    }));
  }, []);

  const handleCancelWorkAssignment = useCallback(() => {
    if (workAssignmentSubmitting) return;
    setPendingCheckIn(null);
    setWorkAssignment(initialWorkAssignment);
  }, [workAssignmentSubmitting]);

  const handleSubmitWorkAssignment = useCallback(async () => {
    if (!pendingCheckIn || workAssignmentSubmitting) return;

    if (
      workAssignment.locationMode === 'standard' &&
      (!workAssignment.building || !workAssignment.floor)
    ) {
      setMessage({ severity: 'warning', text: t('selectBuildingFloor') });
      return;
    }

    if (
      workAssignment.locationMode === 'other' &&
      workAssignment.locationText.trim().length < 2
    ) {
      setMessage({ severity: 'warning', text: t('enterOtherWorkLocation') });
      return;
    }

    if (!ATTENDANCE_TRADE_OPTIONS.includes(workAssignment.tradeName)) {
      setMessage({ severity: 'warning', text: t('selectWorkProcess') });
      return;
    }

    setWorkAssignmentSubmitting(true);
    const finalize = await supabase.rpc(
      'attendance_finalize_scan_v52_48_5_5',
      {
        p_session_token: sessionToken,
        p_device_key: deviceKey,
        p_processing_token: pendingCheckIn.processingToken,
        p_location_mode: workAssignment.locationMode,
        p_building: workAssignment.locationMode === 'standard'
          ? workAssignment.building
          : null,
        p_floor: workAssignment.locationMode === 'standard'
          ? Number(workAssignment.floor)
          : null,
        p_location_text: workAssignment.locationMode === 'other'
          ? workAssignment.locationText.trim()
          : null,
        p_trade_name: workAssignment.tradeName,
      },
    );

    setWorkAssignmentSubmitting(false);
    setPendingCheckIn(null);
    setWorkAssignment(initialWorkAssignment);

    if (finalize.error) {
      setMessage({ severity: 'error', text: t('attendanceFailed') });
      return;
    }

    setMessage({
      severity: 'success',
      text: t('attendanceSuccess', {
        type: t('checkIn'),
        time: formatKoreaDateTime(finalize.data?.event_at, {
          timeOnly: true,
          withSeconds: true,
          locale,
        }),
      }),
    });
    await loadMe(sessionToken, true);
  }, [
    deviceKey,
    loadMe,
    locale,
    pendingCheckIn,
    sessionToken,
    t,
    workAssignment,
    workAssignmentSubmitting,
  ]);

  const handleCheckoutProgressChange = useCallback((changes) => {
    setCheckoutProgress((previous) => ({
      ...previous,
      ...changes,
    }));
  }, []);

  const handleToggleCheckoutUnit = useCallback((unit) => {
    setCheckoutProgress((previous) => {
      const nextUnits = new Set(previous.selectedUnits);
      if (nextUnits.has(unit)) nextUnits.delete(unit);
      else nextUnits.add(unit);

      return {
        ...previous,
        selectedUnits: nextUnits,
      };
    });
  }, []);

  const handleCancelCheckoutProgress = useCallback(() => {
    if (checkoutProgressSubmitting) return;
    setPendingCheckOut(null);
    setCheckoutProgress(initialCheckoutProgress);
  }, [checkoutProgressSubmitting]);

  const handleSubmitCheckoutProgress = useCallback(async () => {
    if (!pendingCheckOut || checkoutProgressSubmitting) return;

    const canSubmitProgress = Boolean(
      pendingCheckOut.can_submit_progress,
    );
    const processOptions = Array.isArray(
      pendingCheckOut.progress_process_options,
    )
      ? pendingCheckOut.progress_process_options
      : [];
    const completionState = canSubmitProgress
      ? checkoutProgress.completionState
      : 'none';

    if (canSubmitProgress && !completionState) {
      setMessage({ severity: 'warning', text: t('selectCompletionAnswer') });
      return;
    }
    if (
      completionState === 'submitted' &&
      !processOptions.includes(checkoutProgress.progressProcessType)
    ) {
      setMessage({ severity: 'warning', text: t('selectProgressProcess') });
      return;
    }
    if (
      completionState === 'submitted' &&
      checkoutProgress.selectedUnits.size === 0
    ) {
      setMessage({ severity: 'warning', text: t('selectCompletedUnits') });
      return;
    }

    setCheckoutProgressSubmitting(true);
    const finalize = await supabase.rpc(
      'attendance_finalize_checkout_progress_v52_48_5_9',
      {
        p_session_token: sessionToken,
        p_device_key: deviceKey,
        p_processing_token: pendingCheckOut.processingToken,
        p_completion_state: completionState,
        p_progress_process_type: completionState === 'submitted'
          ? checkoutProgress.progressProcessType
          : null,
        p_units: completionState === 'submitted'
          ? Array.from(checkoutProgress.selectedUnits)
          : [],
      },
    );
    setCheckoutProgressSubmitting(false);

    if (finalize.error) {
      setMessage({ severity: 'error', text: t('attendanceFailed') });
      return;
    }

    setPendingCheckOut(null);
    setCheckoutProgress(initialCheckoutProgress);
    const completedAt = formatKoreaDateTime(
      finalize.data?.event_at,
      {
        timeOnly: true,
        withSeconds: true,
        locale,
      },
    );
    setMessage({
      severity: 'success',
      text: finalize.data?.review_status === 'pending'
        ? t('checkoutProgressPendingSuccess', { time: completedAt })
        : t('attendanceSuccess', {
            type: t('checkOut'),
            time: completedAt,
          }),
    });
    await loadMe(sessionToken, true);
  }, [
    checkoutProgress,
    checkoutProgressSubmitting,
    deviceKey,
    loadMe,
    locale,
    pendingCheckOut,
    sessionToken,
    t,
  ]);

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
        setMessage({ severity: 'error', text: getCameraErrorMessage(error, t) });
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [processQrToken, scannerOpen, scannerVideoElement, stopScanner, t]);

  if (loading && !worker) {
    return (
      <MobileShell appMode={appMode} appTitle={t('appTitle')}>
        <Box sx={{ py: 12, textAlign: 'center' }}>
          <CircularProgress />
          <Typography sx={{ mt: 2, color: '#64748b', fontSize: appMode ? '1rem' : undefined }}>{t('checkingAccount')}</Typography>
        </Box>
      </MobileShell>
    );
  }

  if (worker) {
    const statusMeta = getStatusMeta(t);
    const meta = statusMeta[worker.status] || statusMeta.pending;
    const checkIn = todayEvents.find((item) => item.event_type === 'check_in');
    const checkOut = todayEvents.find((item) => item.event_type === 'check_out');

    return (
      <MobileShell
        appMode={appMode}
        appTitle={t('appTitle')}
        contentMaxWidth={appMode ? '90%' : 520}
        topBanner={<AttendanceNoticeTicker notices={attendanceNotices} appMode={appMode} t={t} />}
        headerAction={
          <Stack
            direction="row"
            spacing={appMode ? 0.75 : 1}
            alignItems="center"
            data-attendance-worker-language="v52.48.5.8"
          >
            <FormControl
              size="small"
              sx={{
                width: appMode ? 116 : 150,
                flex: '0 0 auto',
                '& .MuiInputLabel-root': {
                  color: 'rgba(255,255,255,0.82)',
                  fontSize: appMode ? '0.78rem' : '0.8rem',
                  '&.Mui-focused': { color: '#ffffff' },
                },
                '& .MuiOutlinedInput-root': {
                  height: appMode ? 44 : 40,
                  color: '#ffffff',
                  bgcolor: 'rgba(255,255,255,0.12)',
                  borderRadius: 2,
                  fontSize: appMode ? '0.94rem' : '0.84rem',
                  fontWeight: 800,
                  '& fieldset': {
                    borderColor: 'rgba(255,255,255,0.4)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'rgba(255,255,255,0.72)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#ffffff',
                  },
                },
                '& .MuiSelect-icon': {
                  color: '#ffffff',
                },
              }}
            >
              <InputLabel id="attendance-worker-language-label">
                Language
              </InputLabel>
              <Select
                labelId="attendance-worker-language-label"
                label="Language"
                value={language}
                onChange={handleLanguageChange}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      '& .MuiMenuItem-root': {
                        minHeight: appMode ? 52 : 44,
                        fontSize: appMode ? '1rem' : '0.9rem',
                      },
                    },
                  },
                }}
              >
                {ATTENDANCE_LANGUAGES.map((item) => (
                  <MenuItem key={item.code} value={item.code}>
                    {item.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <IconButton
              aria-label={t('logout')}
              title={t('logout')}
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
          </Stack>
        }
      >
        <AttendanceToast message={message} onClose={() => setMessage(null)} appMode={appMode} />
        <RiskBroadcastPanel broadcasts={riskBroadcasts} appMode={appMode} t={t} locale={locale} />

        <Box sx={{ mb: 2 }}>
          <MonthlyAttendanceCalendar
            monthEvents={monthEvents}
            todayEvents={todayEvents}
            selectedDate={selectedAttendanceDate}
            onSelectDate={setSelectedAttendanceDate}
            appMode={appMode}
            t={t}
            locale={locale}
          />
        </Box>

        <Paper
          variant="outlined"
          sx={{
            p: appMode ? 4 : 2.25,
            borderRadius: appMode ? 4 : 3,
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
            <Box>
              <Typography sx={{ fontSize: appMode ? '2rem' : '1.15rem', fontWeight: 900 }}>{worker.name_ko}</Typography>
              <Typography sx={{ mt: 0.7, color: '#64748b', fontSize: appMode ? '1.28rem' : '0.78rem', lineHeight: 1.45 }}>{worker.project_name}</Typography>
              <Typography sx={{ mt: appMode ? 0.5 : 0, color: '#64748b', fontSize: appMode ? '1.18rem' : '0.74rem' }}>{getAttendanceTradeLabel(language, worker.trade_name)}</Typography>
            </Box>
            <Chip label={meta.label} color={meta.color} size="small" sx={{ height: appMode ? 40 : undefined, fontSize: appMode ? '1rem' : undefined, fontWeight: 900 }} />
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Typography sx={{ color: '#64748b', fontSize: appMode ? '1.2rem' : '0.78rem', lineHeight: 1.7 }}>{meta.description}</Typography>
        </Paper>

        {worker.status === 'active' ? (
          <>
            <Card variant="outlined" sx={{ mt: appMode ? 3 : 2, borderRadius: appMode ? 4 : 3 }}>
              <CardContent sx={{ p: appMode ? 4 : undefined, '&:last-child': { pb: appMode ? 4 : undefined } }}>
                <Typography sx={{ fontSize: appMode ? '1.3rem' : '0.78rem', color: '#64748b', fontWeight: 800 }}>{t('todayAttendance')}</Typography>
                <Stack direction="row" spacing={appMode ? 2 : 1.5} sx={{ mt: appMode ? 2 : 1.5 }}>
                  <Paper variant="outlined" sx={{ flex: 1, p: appMode ? 2.25 : 1.5, textAlign: 'center', bgcolor: checkIn ? '#ecfdf5' : '#f8fafc', borderRadius: appMode ? 3 : undefined }}>
                    <Typography sx={{ fontSize: appMode ? '1.2rem' : '0.7rem', color: '#64748b' }}>{t('checkIn')}</Typography>
                    <Typography sx={{ mt: 0.8, fontSize: appMode ? '1.72rem' : undefined, fontWeight: 900, color: checkIn ? '#047857' : '#94a3b8' }}>
                      {checkIn ? formatKoreaDateTime(checkIn.event_at, { timeOnly: true, locale }) : t('unprocessed')}
                    </Typography>
                  </Paper>
                  <Paper variant="outlined" sx={{ flex: 1, p: appMode ? 2.25 : 1.5, textAlign: 'center', bgcolor: checkOut ? '#ecfdf5' : '#f8fafc', borderRadius: appMode ? 3 : undefined }}>
                    <Typography sx={{ fontSize: appMode ? '1.2rem' : '0.7rem', color: '#64748b' }}>{t('checkOut')}</Typography>
                    <Typography sx={{ mt: 0.8, fontSize: appMode ? '1.72rem' : undefined, fontWeight: 900, color: checkOut ? '#047857' : '#94a3b8' }}>
                      {checkOut ? formatKoreaDateTime(checkOut.event_at, { timeOnly: true, locale }) : t('unprocessed')}
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
              sx={{ mt: appMode ? 3 : 2, minHeight: appMode ? 92 : 58, borderRadius: appMode ? 3 : 2.5, bgcolor: primaryActionColor, fontWeight: 900, fontSize: appMode ? '1.45rem' : '1rem', '&:hover': { bgcolor: primaryActionColor } }}
            >
              {checkIn && checkOut ? t('attendanceComplete') : processingScan ? t('processing') : scannerStarting ? t('cameraPreparing') : t('scanAttendanceQr')}
            </Button>
          </>
        ) : (
          <Button fullWidth variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={() => loadMe(sessionToken)} sx={{ mt: 2 }}>
            {t('recheckApproval')}
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
            {t('installAsApp')}
          </Button>
        )}
        <AttendanceWorkAssignmentDialog
          open={Boolean(pendingCheckIn)}
          appMode={appMode}
          language={language}
          buildings={pendingCheckIn?.buildings || []}
          draft={workAssignment}
          submitting={workAssignmentSubmitting}
          t={t}
          onChange={handleWorkAssignmentChange}
          onCancel={handleCancelWorkAssignment}
          onSubmit={handleSubmitWorkAssignment}
        />
        <AttendanceCheckoutProgressDialog
          open={Boolean(pendingCheckOut)}
          appMode={appMode}
          language={language}
          context={pendingCheckOut}
          draft={checkoutProgress}
          submitting={checkoutProgressSubmitting}
          t={t}
          onChange={handleCheckoutProgressChange}
          onToggleUnit={handleToggleCheckoutUnit}
          onCancel={handleCancelCheckoutProgress}
          onSubmit={handleSubmitCheckoutProgress}
        />
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
            {t('cameraPermissionNeeded')}
          </DialogTitle>
          <DialogContent dividers>
            {cameraPermissionState === 'denied' ? (
              <Stack spacing={1.25}>
                <Alert severity="warning">
                  {t('cameraBlocked')}
                </Alert>
                <Typography
                  sx={{
                    fontSize: appMode ? '0.94rem' : '0.8rem',
                    lineHeight: 1.8,
                  }}
                >
                  {t('androidCameraSettings')}
                </Typography>
                <Typography
                  sx={{
                    fontSize: appMode ? '0.88rem' : '0.74rem',
                    color: '#64748b',
                    lineHeight: 1.7,
                  }}
                >
                  {t('androidAppPermission')}
                </Typography>
              </Stack>
            ) : (
              <Stack spacing={1.25}>
                <Alert severity="info">
                  {t('rearCameraNeeded')}
                </Alert>
                <Typography
                  sx={{
                    fontSize: appMode ? '0.94rem' : '0.8rem',
                    lineHeight: 1.8,
                  }}
                >
                  {t('cameraPromptGuide')}
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
              {t('cancel')}
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
                ? t('checkingPermission')
                : cameraPermissionState === 'denied'
                  ? t('recheckCameraPermission')
                  : t('allowCamera')}
            </Button>
          </Box>
        </Dialog>

        <Dialog open={scannerOpen} onClose={closeScanner} fullWidth maxWidth="xs">
          <DialogTitle sx={{ pr: 6, fontWeight: 900 }}>
            {t('dynamicQrScan')}
            <IconButton onClick={closeScanner} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseRoundedIcon /></IconButton>
          </DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 1.5, fontSize: '0.75rem' }}>{t('qrFrameGuide')}</Alert>
            <Box sx={{ position: 'relative', bgcolor: '#000', borderRadius: 2, overflow: 'hidden', aspectRatio: '1 / 1' }}>
              <Box component="video" ref={handleScannerVideoRef} autoPlay muted playsInline sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {!cameraReady && (
                <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ position: 'absolute', inset: 0, bgcolor: '#020617', color: '#fff', zIndex: 2 }}>
                  <CircularProgress size={34} color="inherit" />
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 800 }}>{t('preparingRearCamera')}</Typography>
                </Stack>
              )}
              <Box sx={{ position: 'absolute', inset: '15%', border: '3px solid #38bdf8', borderRadius: 2, boxShadow: '0 0 0 999px rgba(0,0,0,0.28)' }} />
            </Box>
          </DialogContent>
        </Dialog>

        <Dialog open={!appMode && installHelpOpen} onClose={() => setInstallHelpOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle sx={{ fontWeight: 900 }}>{t('installAttendanceApp')}</DialogTitle>
          <DialogContent>
            <Stack spacing={1}>
              <Typography sx={{ fontSize: '0.84rem', lineHeight: 1.8 }}>
                {t('iosInstallGuide')}
              </Typography>
              <Typography sx={{ fontSize: '0.84rem', lineHeight: 1.8 }}>
                {t('androidInstallGuide')}
              </Typography>
              <Alert severity="info" sx={{ fontSize: '0.74rem' }}>
                {t('legacyInstallGuide')}
              </Alert>
            </Stack>
          </DialogContent>
        </Dialog>
      </MobileShell>
    );
  }

  if (mode === 'admin') {
    return (
      <MobileShell
        appMode={appMode}
        cleanLogin={appMode}
        appTitle={t('appTitle')}
        contentMaxWidth={
          appMode
            ? 'none'
            : 1040
        }
      >
        <AttendanceMobileAdminQr
          appMode={appMode}
          onBack={() => setMode('login')}
          t={t}
          locale={locale}
        />
      </MobileShell>
    );
  }

  return (
    <MobileShell
      appMode={appMode}
      cleanLogin={cleanAuthLayout}
      appTitle={t('appTitle')}
      contentMaxWidth={
        appMode
          ? 'none'
          : mode === 'login'
            ? 1040
            : 720
      }
    >
      <AttendanceToast message={message} onClose={() => setMessage(null)} appMode={appMode} />
      <Paper
        data-attendance-login-ui={
          mode === 'login'
            ? 'v52.48.1'
            : undefined
        }
        data-attendance-login-scale={
          mode === 'login'
            ? 'v52.48.2.1'
            : undefined
        }
        data-attendance-login-visual-scale={
          mode === 'login' && appMode
            ? 'v52.48.3'
            : undefined
        }
        data-attendance-login-layout-ratio={
          mode === 'login' && appMode
            ? 'v52.48.4'
            : undefined
        }
        data-attendance-login-reference-layout={
            mode === 'login' && appMode
            ? 'v52.48.5.6'
            : undefined
        }
        variant={
          cleanAuthLayout
            ? undefined
            : 'outlined'
        }
        elevation={0}
        sx={{
          p:
            cleanAuthLayout
              ? 0
              : appMode
                ? 3
                : 2.25,
          borderRadius:
            cleanAuthLayout
              ? 0
              : appMode
                ? 3.5
                : 3,
          border:
            cleanAuthLayout
              ? 'none'
              : undefined,
          bgcolor: '#ffffff',
          boxShadow: 'none',
          width:
            cleanAuthLayout
              ? '90%'
              : '100%',
          maxWidth:
            mode === 'login' && appMode
              ? 'none'
              : 'none',
          minHeight:
            cleanAuthLayout
              ? 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))'
              : 'auto',
          mx: 'auto',
          boxSizing: 'border-box',
          position: 'relative',
          transform: 'none',
          transformOrigin: 'top center',
        }}
      >
        {['login', 'signup'].includes(mode) ? (
          <FormControl
            size="small"
            sx={{
              position: 'absolute',
              top: appMode ? 3 : 0,
              right: 0,
              width: appMode ? 174 : 150,
              zIndex: 2,
              '& .MuiInputLabel-root': {
                fontSize: appMode ? '1rem' : '0.86rem',
              },
              '& .MuiInputBase-root': {
                minHeight: appMode ? 52 : 44,
                fontSize: appMode ? '1rem' : '0.86rem',
                bgcolor: '#ffffff',
                borderRadius: 2,
              },
            }}
          >
            <InputLabel id="attendance-language-label">
              Language
            </InputLabel>
            <Select
              labelId="attendance-language-label"
              label="Language"
              value={language}
              onChange={handleLanguageChange}
            >
              {ATTENDANCE_LANGUAGES.map((item) => (
                <MenuItem key={item.code} value={item.code}>
                  {item.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}

        {mode === 'login' ? (
          <Box>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1.35}
              sx={{
                mt: appMode ? 25 : 3,
                mb: appMode ? 15.5 : 4.2,
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  color: APP_BRAND_GREEN,
                  fontSize: appMode
                    ? '4.5rem'
                    : '3rem',
                  lineHeight: 1,
                  fontWeight: 1000,
                  letterSpacing: '-0.14em',
                  pr: '0.14em',
                }}
              >
                W
              </Box>

              <Typography
                sx={{
                  color: '#111827',
                  fontSize: appMode
                    ? '3.35rem'
                    : '2.2rem',
                  lineHeight: 1.05,
                  fontWeight: 1000,
                  letterSpacing: '-0.045em',
                }}
              >
                {t('loginTitle')}
              </Typography>
            </Stack>
          </Box>
        ) : (
          <Stack
            direction="row"
            alignItems="flex-start"
            spacing={appMode ? 2 : 1}
            sx={{ mt: appMode ? 14 : 2, mb: appMode ? 7 : 2 }}
          >
            <IconButton
              onClick={() => setMode('login')}
              aria-label={t('loginTitle')}
              sx={{
                width: appMode ? 58 : 40,
                height: appMode ? 58 : 40,
                mt: appMode ? 0.4 : 0,
                color: '#111827',
                '& .MuiSvgIcon-root': {
                  fontSize: appMode ? '2.35rem' : '1.5rem',
                },
              }}
            >
              <ArrowBackRoundedIcon />
            </IconButton>

            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={appMode ? 1.4 : 0.8}>
                <Box
                  aria-hidden="true"
                  sx={{
                    color: APP_BRAND_GREEN,
                    fontSize: appMode ? '3.75rem' : '2.5rem',
                    lineHeight: 1,
                    fontWeight: 1000,
                    letterSpacing: '-0.14em',
                    pr: '0.14em',
                  }}
                >
                  W
                </Box>

                <Typography
                  sx={{
                    fontSize: appMode
                      ? '2.7rem'
                      : '1.8rem',
                    lineHeight: 1.1,
                    fontWeight: 1000,
                    letterSpacing: '-0.045em',
                  }}
                >
                  {t('signupTitle')}
                </Typography>
              </Stack>

              <Typography
                sx={{
                  mt: appMode ? 1.1 : 0.35,
                  color: '#64748b',
                  fontSize: appMode
                    ? '1.22rem'
                    : '0.74rem',
                  lineHeight: 1.6,
                }}
              >
                {t('signupSubtitle')}
              </Typography>
            </Box>
          </Stack>
        )}

        {mode === 'login' ? (
          <Stack
            spacing={0}
            sx={{
              width: '100%',
            }}
          >
            <TextField
              fullWidth
              variant="standard"
              placeholder={t('phone')}
              value={formatPhone(login.phone)}
              onChange={(event) =>
                setLogin((prev) => ({
                  ...prev,
                  phone: normalizePhone(
                    event.target.value,
                  ),
                }))
              }
              inputMode="tel"
              autoComplete="tel"
              InputProps={{
                disableUnderline: false,
              }}
              inputProps={{
                'aria-label': t('phone'),
              }}
              sx={{
                '& .MuiInputBase-root': {
                  minHeight: appMode
                    ? 92
                    : 74,
                  px: appMode ? 1 : 0.5,
                  fontSize: appMode
                    ? '2rem'
                    : '1.2rem',
                },
                '& .MuiInputBase-input::placeholder': {
                  color: '#6b7280',
                  opacity: 1,
                },
                '& .MuiInput-underline:before': {
                  borderBottomColor: '#e5e7eb',
                },
                '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
                  borderBottomColor: '#cbd5e1',
                },
                '& .MuiInput-underline:after': {
                  borderBottomColor: APP_BRAND_GREEN,
                },
              }}
            />

            <TextField
              fullWidth
              variant="standard"
              type="password"
              placeholder={t('password')}
              value={login.password}
              onChange={(event) =>
                setLogin((prev) => ({
                  ...prev,
                  password:
                    event.target.value,
                }))
              }
              autoComplete="current-password"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleLogin();
                }
              }}
              InputProps={{
                disableUnderline: false,
              }}
              inputProps={{
                'aria-label': t('password'),
              }}
              sx={{
                mt: appMode ? 10 : 1.8,
                '& .MuiInputBase-root': {
                  minHeight: appMode
                    ? 92
                    : 74,
                  px: appMode ? 1 : 0.5,
                  fontSize: appMode
                    ? '2rem'
                    : '1.2rem',
                },
                '& .MuiInputBase-input::placeholder': {
                  color: '#6b7280',
                  opacity: 1,
                },
                '& .MuiInput-underline:before': {
                  borderBottomColor: '#e5e7eb',
                },
                '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
                  borderBottomColor: '#cbd5e1',
                },
                '& .MuiInput-underline:after': {
                  borderBottomColor: APP_BRAND_GREEN,
                },
              }}
            />

            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleLogin}
              disabled={loading}
              sx={{
                mt: appMode ? 14 : 4,
                minHeight: appMode
                  ? 110
                  : 68,
                borderRadius: appMode
                  ? 2.3
                  : 2.1,
                bgcolor: APP_BRAND_GREEN,
                color: '#ffffff',
                fontSize: appMode
                  ? '2rem'
                  : '1.16rem',
                fontWeight: 1000,
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: '#02b853',
                  boxShadow: 'none',
                },
              }}
            >
              {t('login')}
            </Button>

            <Button
              fullWidth
              variant="outlined"
              startIcon={<HowToRegRoundedIcon />}
              onClick={() =>
                setMode('signup')
              }
              sx={{
                mt: appMode ? 2.5 : 1.35,
                minHeight: appMode
                  ? 110
                  : 62,
                borderRadius: appMode
                  ? 2.3
                  : 2.1,
                borderColor: '#eeeeee',
                bgcolor: '#f7f7f7',
                color: '#1f2937',
                fontSize: appMode
                  ? '1.72rem'
                  : '1rem',
                fontWeight: 900,
                '&:hover': {
                  borderColor: '#d1d5db',
                  bgcolor: '#f3f4f6',
                },
              }}
            >
              {t('signupPrompt')}
            </Button>

            <Button
              fullWidth
              variant="text"
              startIcon={
                <AdminPanelSettingsRoundedIcon />
              }
              onClick={() =>
                setMode('admin')
              }
              sx={{
                mt: appMode ? 8.5 : 1,
                minHeight: appMode
                  ? 56
                  : 56,
                color: '#334155',
                fontSize: appMode
                  ? '1.65rem'
                  : '0.98rem',
                fontWeight: 900,
              }}
            >
              {t('adminMode')}
            </Button>
          </Stack>
        ) : (
          <Stack
            spacing={appMode ? 3 : 1.5}
            sx={appMode ? {
              pb: 4,
              '& .MuiInputBase-root': {
                minHeight: 82,
                fontSize: '1.35rem',
                borderRadius: 2.5,
              },
              '& .MuiInputLabel-root': {
                fontSize: '1.18rem',
              },
              '& .MuiFormHelperText-root': {
                mx: 0.5,
                fontSize: '1rem',
                lineHeight: 1.5,
              },
              '& .MuiFormControlLabel-label': {
                fontSize: '1.18rem',
                lineHeight: 1.55,
              },
              '& .MuiCheckbox-root .MuiSvgIcon-root': {
                fontSize: '2.2rem',
              },
            } : undefined}
          >
            <FormControl fullWidth>
              <InputLabel>{t('workSite')}</InputLabel>
              <Select label={t('workSite')} value={signup.projectName} onChange={(event) => setSignup((prev) => ({ ...prev, projectName: event.target.value }))}>
                {ATTENDANCE_PROJECTS.map((project) => <MenuItem key={project} value={project}>{project}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label={t('koreanName')}
              value={signup.nameKo}
              onChange={(event) => setSignup((prev) => ({ ...prev, nameKo: event.target.value.slice(0, 10) }))}
              inputProps={{ maxLength: 10 }}
            />
            <FormControlLabel control={<Checkbox checked={signup.isForeigner} onChange={(event) => setSignup((prev) => ({ ...prev, isForeigner: event.target.checked, nameEn: event.target.checked ? prev.nameEn : '' }))} />} label={t('foreignWorker')} />
            {signup.isForeigner && <TextField label={t('englishName')} value={signup.nameEn} onChange={(event) => setSignup((prev) => ({ ...prev, nameEn: event.target.value }))} helperText={t('englishNameHelp')} />}
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
                    setMessage(checked ? { severity: 'info', text: t('testPasswordToast') } : null);
                  }}
                />
              )}
              label={t('testAccount')}
            />
            {signup.isTestAccount && (
              <Alert severity="info" sx={{ fontSize: appMode ? '1.08rem' : '0.75rem', lineHeight: 1.65 }}>
                {t('testPasswordInfo')}
              </Alert>
            )}
            <TextField label={t('phone')} value={formatPhone(signup.phone)} onChange={(event) => setSignup((prev) => ({ ...prev, phone: normalizePhone(event.target.value) }))} inputMode="tel" />
            <FormControl fullWidth>
              <InputLabel>{t('trade')}</InputLabel>
              <Select
                label={t('trade')}
                value={signup.tradeName}
                onChange={(event) => setSignup((prev) => ({ ...prev, tradeName: event.target.value }))}
                displayEmpty={false}
              >
                {ATTENDANCE_TRADE_OPTIONS.map((trade) => (
                  <MenuItem key={trade} value={trade}>
                    {getAttendanceTradeLabel(language, trade)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {!signup.isTestAccount && (
              <>
                <TextField label={t('password')} type="password" value={signup.password} onChange={(event) => setSignup((prev) => ({ ...prev, password: event.target.value }))} helperText={t('passwordHelp')} autoComplete="new-password" />
                <TextField label={t('passwordConfirm')} type="password" value={signup.passwordConfirm} onChange={(event) => setSignup((prev) => ({ ...prev, passwordConfirm: event.target.value }))} autoComplete="new-password" />
              </>
            )}
            <FormControlLabel
              control={<Checkbox checked={signup.privacyAgreed} onChange={(event) => setSignup((prev) => ({ ...prev, privacyAgreed: event.target.checked }))} />}
              label={<Typography sx={{ fontSize: appMode ? '1.18rem' : '0.75rem', lineHeight: 1.6 }}>{t('privacyAgreement')}</Typography>}
            />
            <Button
              variant="contained"
              size="large"
              onClick={handleSignup}
              disabled={loading}
              sx={{
                minHeight: appMode ? 96 : 50,
                borderRadius: appMode ? 2.5 : 2,
                bgcolor: primaryActionColor,
                fontSize: appMode ? '1.55rem' : undefined,
                fontWeight: 1000,
                boxShadow: 'none',
                '&:hover': { bgcolor: primaryActionColor, boxShadow: 'none' },
              }}
            >
              {t('signup')}
            </Button>
          </Stack>
        )}
      </Paper>
      {!appMode && (
        <Button
          fullWidth
          variant="text"
          startIcon={<AddToHomeScreenRoundedIcon />}
          onClick={handleInstall}
          sx={{
            mt: mode === 'login'
              ? 3
              : 1.5,
            color: '#64748b',
          }}
        >
          {t('installAttendanceApp')}
        </Button>
      )}
    </MobileShell>
  );
}
