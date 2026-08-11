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
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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

function MobileShell({ children }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#eef3f8' }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: '#0f4c81' }}>
        <Toolbar sx={{ minHeight: '58px !important', px: 2 }}>
          <Box>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.12em', color: '#bae6fd' }}>
              WOOKLIM CONSTRUCTION
            </Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 900 }}>
              모바일 근태관리
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>
      <Box sx={{ width: '100%', maxWidth: 520, mx: 'auto', p: 2 }}>
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
  const [loading, setLoading] = useState(Boolean(sessionToken));
  const [message, setMessage] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [processingScan, setProcessingScan] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const videoRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const handledDeepLinkRef = useRef('');
  const deviceKey = useRef(getAttendanceDeviceKey()).current;

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

  const loadMe = useCallback(async (token = sessionToken, silent = false) => {
    if (!token) {
      setWorker(null);
      setTodayEvents([]);
      setLoading(false);
      return null;
    }

    if (!silent) setLoading(true);
    const { data, error } = await supabase.rpc('attendance_worker_me_v52_14', {
      p_session_token: token,
      p_device_key: deviceKey,
    });

    if (error) {
      console.warn('근로자 세션 확인 실패:', error);
      saveSession('');
      setWorker(null);
      setTodayEvents([]);
      setMessage({ severity: 'warning', text: error.message || '다시 로그인해주세요.' });
      setLoading(false);
      return null;
    }

    const nextWorker = data?.worker || null;
    setWorker(nextWorker);
    setTodayEvents(Array.isArray(data?.today_events) ? data.today_events : []);
    setLoading(false);
    return nextWorker;
  }, [deviceKey, saveSession, sessionToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadMe(), 0);
    return () => window.clearTimeout(timer);
  }, [loadMe]);

  useEffect(() => {
    const handleBeforeInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

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
    setWorker(null);
    setTodayEvents([]);
    setMessage(null);
    setMode('login');
  };

  const processQrToken = useCallback(async (rawValue) => {
    const qrToken = extractAttendanceQrToken(rawValue);
    if (!qrToken || !sessionToken || processingScan) return;

    setProcessingScan(true);
    setScannerOpen(false);
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;

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
  }, [deviceKey, loadMe, processingScan, sessionToken]);

  useEffect(() => {
    if (!worker || worker.status !== 'active' || !sessionToken) return;
    const deepLinkToken = new URLSearchParams(window.location.search).get('attendanceQr') || '';
    if (!deepLinkToken || handledDeepLinkRef.current === deepLinkToken) return;
    handledDeepLinkRef.current = deepLinkToken;
    processQrToken(deepLinkToken);
  }, [processQrToken, sessionToken, worker]);

  useEffect(() => {
    if (!scannerOpen || !videoRef.current) return undefined;
    let cancelled = false;
    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 120,
      delayBetweenScanSuccess: 800,
    });

    reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
      if (!cancelled && result) {
        processQrToken(result.getText());
      }
    }).then((controls) => {
      if (cancelled) controls.stop();
      else scannerControlsRef.current = controls;
    }).catch((error) => {
      console.error('카메라 실행 오류:', error);
      setScannerOpen(false);
      setMessage({ severity: 'error', text: '카메라를 열 수 없습니다. 브라우저 카메라 권한을 허용해주세요.' });
    });

    return () => {
      cancelled = true;
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [processQrToken, scannerOpen]);

  if (loading && !worker) {
    return (
      <MobileShell>
        <Box sx={{ py: 12, textAlign: 'center' }}>
          <CircularProgress />
          <Typography sx={{ mt: 2, color: '#64748b' }}>근태 계정을 확인하고 있습니다.</Typography>
        </Box>
      </MobileShell>
    );
  }

  if (worker) {
    const meta = statusMeta[worker.status] || statusMeta.pending;
    const checkIn = todayEvents.find((item) => item.event_type === 'check_in');
    const checkOut = todayEvents.find((item) => item.event_type === 'check_out');

    return (
      <MobileShell>
        {message && <Alert severity={message.severity} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}
        <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
            <Box>
              <Typography sx={{ fontSize: '1.15rem', fontWeight: 900 }}>{worker.name_ko}</Typography>
              <Typography sx={{ mt: 0.25, color: '#64748b', fontSize: '0.78rem' }}>{worker.project_name}</Typography>
              <Typography sx={{ color: '#64748b', fontSize: '0.74rem' }}>{worker.trade_name}</Typography>
            </Box>
            <Chip label={meta.label} color={meta.color} size="small" />
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Typography sx={{ color: '#64748b', fontSize: '0.78rem', lineHeight: 1.65 }}>{meta.description}</Typography>
        </Paper>

        {worker.status === 'active' ? (
          <>
            <Card variant="outlined" sx={{ mt: 2, borderRadius: 3 }}>
              <CardContent>
                <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 800 }}>오늘 출·퇴근</Typography>
                <Stack direction="row" spacing={1.5} sx={{ mt: 1.5 }}>
                  <Paper variant="outlined" sx={{ flex: 1, p: 1.5, textAlign: 'center', bgcolor: checkIn ? '#ecfdf5' : '#f8fafc' }}>
                    <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>출근</Typography>
                    <Typography sx={{ mt: 0.5, fontWeight: 900, color: checkIn ? '#047857' : '#94a3b8' }}>
                      {checkIn ? formatKoreaDateTime(checkIn.event_at, { timeOnly: true }) : '미처리'}
                    </Typography>
                  </Paper>
                  <Paper variant="outlined" sx={{ flex: 1, p: 1.5, textAlign: 'center', bgcolor: checkOut ? '#eff6ff' : '#f8fafc' }}>
                    <Typography sx={{ fontSize: '0.7rem', color: '#64748b' }}>퇴근</Typography>
                    <Typography sx={{ mt: 0.5, fontWeight: 900, color: checkOut ? '#1d4ed8' : '#94a3b8' }}>
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
              onClick={() => setScannerOpen(true)}
              disabled={processingScan || Boolean(checkIn && checkOut)}
              sx={{ mt: 2, minHeight: 58, borderRadius: 2.5, bgcolor: '#0f6fae', fontWeight: 900, fontSize: '1rem' }}
            >
              {checkIn && checkOut ? '오늘 근태 처리 완료' : processingScan ? '처리 중' : '출·퇴근 QR 촬영'}
            </Button>
          </>
        ) : (
          <Button fullWidth variant="outlined" startIcon={<RefreshRoundedIcon />} onClick={() => loadMe(sessionToken)} sx={{ mt: 2 }}>
            승인상태 다시 확인
          </Button>
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button fullWidth variant="outlined" startIcon={<AddToHomeScreenRoundedIcon />} onClick={handleInstall}>앱으로 설치</Button>
          <Button fullWidth variant="text" color="inherit" startIcon={<LogoutRoundedIcon />} onClick={handleLogout}>로그아웃</Button>
        </Stack>

        <Dialog open={scannerOpen} onClose={() => setScannerOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle sx={{ pr: 6, fontWeight: 900 }}>
            동적 QR 촬영
            <IconButton onClick={() => setScannerOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseRoundedIcon /></IconButton>
          </DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 1.5, fontSize: '0.75rem' }}>화면의 QR을 네모 안에 맞춰주세요. 인식 즉시 서버에서 처리합니다.</Alert>
            <Box sx={{ position: 'relative', bgcolor: '#000', borderRadius: 2, overflow: 'hidden', aspectRatio: '1 / 1' }}>
              <Box component="video" ref={videoRef} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
              <Box sx={{ position: 'absolute', inset: '15%', border: '3px solid #38bdf8', borderRadius: 2, boxShadow: '0 0 0 999px rgba(0,0,0,0.28)' }} />
            </Box>
          </DialogContent>
        </Dialog>

        <Dialog open={installHelpOpen} onClose={() => setInstallHelpOpen(false)} fullWidth maxWidth="xs">
          <DialogTitle sx={{ fontWeight: 900 }}>휴대폰에 앱 추가</DialogTitle>
          <DialogContent>
            <Typography sx={{ fontSize: '0.84rem', lineHeight: 1.8 }}>
              아이폰은 Safari 하단의 공유 버튼을 누른 뒤 <b>홈 화면에 추가</b>를 선택하세요. 안드로이드는 브라우저 메뉴의 <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 선택하면 됩니다.
            </Typography>
          </DialogContent>
        </Dialog>
      </MobileShell>
    );
  }

  return (
    <MobileShell>
      {message && <Alert severity={message.severity} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}
      <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          {mode === 'signup' && <IconButton size="small" onClick={() => setMode('login')}><ArrowBackRoundedIcon /></IconButton>}
          <Box>
            <Typography sx={{ fontSize: '1.15rem', fontWeight: 900 }}>{mode === 'signup' ? '근로자 가입 신청' : '근로자 로그인'}</Typography>
            <Typography sx={{ color: '#64748b', fontSize: '0.74rem' }}>별도의 사내 ERP 계정 없이 이용합니다.</Typography>
          </Box>
        </Stack>

        {mode === 'login' ? (
          <Stack spacing={1.5}>
            <TextField label="휴대폰번호" value={formatPhone(login.phone)} onChange={(event) => setLogin((prev) => ({ ...prev, phone: normalizePhone(event.target.value) }))} inputMode="tel" autoComplete="tel" />
            <TextField label="비밀번호" type="password" value={login.password} onChange={(event) => setLogin((prev) => ({ ...prev, password: event.target.value }))} autoComplete="current-password" onKeyDown={(event) => { if (event.key === 'Enter') handleLogin(); }} />
            <Button variant="contained" size="large" startIcon={<LoginRoundedIcon />} onClick={handleLogin} disabled={loading} sx={{ minHeight: 50, bgcolor: '#0f6fae', fontWeight: 900 }}>로그인</Button>
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
              <Alert severity="info" sx={{ fontSize: '0.75rem' }}>
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
              label={<Typography sx={{ fontSize: '0.75rem', lineHeight: 1.5 }}>[필수] 가입 승인과 근태처리를 위한 이름·휴대폰·직종·등록기기 정보 수집에 동의합니다. 위치정보는 수집하지 않습니다.</Typography>}
            />
            <Button variant="contained" size="large" onClick={handleSignup} disabled={loading} sx={{ minHeight: 50, bgcolor: '#0f6fae', fontWeight: 900 }}>가입 신청</Button>
          </Stack>
        )}
      </Paper>
      <Button fullWidth variant="text" startIcon={<AddToHomeScreenRoundedIcon />} onClick={handleInstall} sx={{ mt: 1.5 }}>휴대폰 홈 화면에 앱 추가</Button>
    </MobileShell>
  );
}
