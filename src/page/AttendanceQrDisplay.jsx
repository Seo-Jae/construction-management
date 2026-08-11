import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import QrCode from 'qrcode';
import { supabase } from '../supabaseClient';
import {
  buildAttendanceWorkerUrl,
  formatKoreaDateTime,
} from '../utils/attendance';

const DISPLAY_TOKEN_STORAGE_KEY = 'wooklim-attendance-qr-display-token';

const readDisplayToken = () => {
  const url = new URL(window.location.href);
  const queryToken = String(url.searchParams.get('displayToken') || '').trim();

  if (queryToken) {
    window.sessionStorage.setItem(DISPLAY_TOKEN_STORAGE_KEY, queryToken);
    url.searchParams.delete('displayToken');
    window.history.replaceState({}, '', url.toString());
    return queryToken;
  }

  return window.sessionStorage.getItem(DISPLAY_TOKEN_STORAGE_KEY) || '';
};

export default function AttendanceQrDisplay() {
  const [displayToken] = useState(readDisplayToken);
  const [qrImage, setQrImage] = useState('');
  const [installQrImage, setInstallQrImage] = useState('');
  const [installErrorMessage, setInstallErrorMessage] = useState('');
  const [viewMode, setViewMode] = useState('attendance');
  const [projectName, setProjectName] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [sessionExpiresAt, setSessionExpiresAt] = useState('');
  const [seconds, setSeconds] = useState(5);
  const [errorMessage, setErrorMessage] = useState(() => (
    displayToken ? '' : 'QR 표시 세션이 없습니다. 근태관리에서 다시 열어주세요.'
  ));
  const [clock, setClock] = useState(new Date());
  const issuingRef = useRef(false);

  const issueQr = useCallback(async () => {
    if (!displayToken || issuingRef.current) return;
    issuingRef.current = true;

    const { data, error } = await supabase.rpc(
      'attendance_issue_display_qr_v52_14_1',
      { p_display_token: displayToken },
    );

    if (error) {
      issuingRef.current = false;
      setQrImage('');
      setErrorMessage(error.message || '출·퇴근 QR을 발급하지 못했습니다.');
      return;
    }

    try {
      const workerUrl = buildAttendanceWorkerUrl({
        projectName: data?.project_name || '',
        qrToken: data?.qr_token || '',
      });
      const image = await QrCode.toDataURL(workerUrl, {
        width: 900,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#020617', light: '#ffffff' },
      });
      setQrImage(image);
      setProjectName(data?.project_name || '');
      setIssuedAt(data?.issued_at || '');
      setSessionExpiresAt(data?.session_expires_at || '');
      setSeconds(5);
      setErrorMessage('');
    } catch (error) {
      setQrImage('');
      setErrorMessage(error.message || 'QR 이미지를 만들지 못했습니다.');
    } finally {
      issuingRef.current = false;
    }
  }, [displayToken]);

  useEffect(() => {
    document.title = '욱림건설 근태 QR';
  }, []);

  useEffect(() => {
    if (!projectName) return undefined;
    let active = true;

    QrCode.toDataURL(buildAttendanceWorkerUrl({ projectName }), {
      width: 900,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then((image) => {
      if (active) {
        setInstallQrImage(image);
        setInstallErrorMessage('');
      }
    }).catch((error) => {
      if (active) setInstallErrorMessage(error.message || '설치 QR 이미지를 만들지 못했습니다.');
    });

    return () => { active = false; };
  }, [projectName]);

  useEffect(() => {
    if (!displayToken) return undefined;

    const firstTimer = window.setTimeout(issueQr, 0);
    const issueTimer = window.setInterval(issueQr, 5000);
    const secondTimer = window.setInterval(() => {
      setSeconds((previous) => (previous <= 1 ? 5 : previous - 1));
      setClock(new Date());
    }, 1000);

    return () => {
      window.clearTimeout(firstTimer);
      window.clearInterval(issueTimer);
      window.clearInterval(secondTimer);
    };
  }, [displayToken, issueQr]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#07111f',
        color: '#f8fafc',
        display: 'grid',
        placeItems: 'center',
        p: { xs: 2, md: 3 },
      }}
    >
      <Paper
        elevation={12}
        sx={{
          width: '100%',
          maxWidth: 780,
          p: { xs: 2.5, md: 4 },
          borderRadius: 4,
          textAlign: 'center',
          bgcolor: '#ffffff',
        }}
      >
        <Typography sx={{ color: '#0f4c81', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.16em' }}>
          WOOKLIM CONSTRUCTION
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 2, p: 0.6, bgcolor: '#e2e8f0', borderRadius: 2.5 }}>
          <Button
            fullWidth
            variant={viewMode === 'attendance' ? 'contained' : 'text'}
            onClick={() => setViewMode('attendance')}
            sx={{ minHeight: 48, borderRadius: 2, fontWeight: 900, bgcolor: viewMode === 'attendance' ? '#0f6fae' : 'transparent' }}
          >
            출·퇴근 QR
          </Button>
          <Button
            fullWidth
            variant={viewMode === 'install' ? 'contained' : 'text'}
            onClick={() => setViewMode('install')}
            sx={{ minHeight: 48, borderRadius: 2, fontWeight: 900, bgcolor: viewMode === 'install' ? '#03c75a' : 'transparent' }}
          >
            설치 QR
          </Button>
        </Stack>
        <Typography component="h1" sx={{ mt: 0.8, color: '#0f172a', fontSize: { xs: '1.45rem', md: '2rem' }, fontWeight: 900 }}>
          {viewMode === 'attendance' ? '출·퇴근 QR' : '근태 앱 설치 QR'}
        </Typography>
        <Typography sx={{ mt: 0.4, color: '#475569', fontSize: { xs: '0.82rem', md: '1rem' }, fontWeight: 700 }}>
          {projectName || '현장 확인 중'}
        </Typography>

        {viewMode === 'attendance' && errorMessage ? (
          <Alert severity="error" sx={{ mt: 4, textAlign: 'left' }}>
            {errorMessage}
          </Alert>
        ) : viewMode === 'attendance' ? (
          <>
            <Box sx={{ width: 'min(62vh, 610px)', maxWidth: '100%', mx: 'auto', mt: 2 }}>
              {qrImage ? (
                <Box component="img" src={qrImage} alt="5초 동적 출퇴근 QR" sx={{ display: 'block', width: '100%' }} />
              ) : (
                <Box sx={{ aspectRatio: '1', display: 'grid', placeItems: 'center', bgcolor: '#f8fafc' }}>
                  <CircularProgress />
                </Box>
              )}
            </Box>
            <Box sx={{ mt: 1.5, height: 10, bgcolor: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
              <Box sx={{ width: `${(seconds / 5) * 100}%`, height: '100%', bgcolor: '#0284c7', transition: 'width 1s linear' }} />
            </Box>
            <Typography sx={{ mt: 0.8, color: '#334155', fontSize: '0.84rem', fontWeight: 800 }}>
              {seconds}초 후 자동 변경 · 서버 유효시간 7초
            </Typography>
          </>
        ) : (
          <>
            {installErrorMessage ? (
              <Alert severity="error" sx={{ mt: 4, textAlign: 'left' }}>{installErrorMessage}</Alert>
            ) : (
              <Box sx={{ width: 'min(62vh, 610px)', maxWidth: '100%', mx: 'auto', mt: 2 }}>
                {installQrImage ? (
                  <Box component="img" src={installQrImage} alt="근태 앱 설치 QR" sx={{ display: 'block', width: '100%' }} />
                ) : (
                  <Box sx={{ aspectRatio: '1', display: 'grid', placeItems: 'center', bgcolor: '#f8fafc' }}>
                    <CircularProgress />
                  </Box>
                )}
              </Box>
            )}
            <Typography sx={{ mt: 1.2, color: '#334155', fontSize: '0.84rem', fontWeight: 800 }}>
              휴대폰 카메라로 촬영해 가입·로그인하세요.
            </Typography>
          </>
        )}

        <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ color: '#64748b', fontSize: '0.72rem' }}>
            현재시각 {formatKoreaDateTime(clock, { timeOnly: true, withSeconds: true })}
          </Typography>
          <Typography sx={{ color: '#64748b', fontSize: '0.72rem' }}>
            {issuedAt ? `최근 발급 ${formatKoreaDateTime(issuedAt, { timeOnly: true, withSeconds: true })}` : ''}
          </Typography>
        </Box>
        {sessionExpiresAt && (
          <Typography sx={{ mt: 0.8, color: '#94a3b8', fontSize: '0.68rem' }}>
            표시 세션 만료 {formatKoreaDateTime(sessionExpiresAt, { withSeconds: true })}
          </Typography>
        )}
        <Alert severity="info" sx={{ mt: 2, textAlign: 'left', fontSize: '0.76rem' }}>
          이 창은 출·퇴근 QR과 설치 QR만 표시하며 회원정보·근태기록·관리 메뉴에는 접근할 수 없습니다. 담당자 화면이 로그아웃되어도 표시 세션 만료 전까지 계속 작동합니다.
        </Alert>
      </Paper>
    </Box>
  );
}
