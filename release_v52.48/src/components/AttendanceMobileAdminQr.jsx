import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import QrCode from 'qrcode';
import { supabase } from '../supabaseClient';
import {
  ATTENDANCE_PROJECTS,
  buildAttendanceWorkerUrl,
  formatKoreaDateTime,
} from '../utils/attendance';

const readInitialProject = () => {
  const requested = new URLSearchParams(
    window.location.search,
  ).get('project');

  return ATTENDANCE_PROJECTS.includes(requested)
    ? requested
    : '';
};

export default function AttendanceMobileAdminQr({
  appMode = false,
  onBack,
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [projectName, setProjectName] = useState(
    readInitialProject,
  );
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [displayToken, setDisplayToken] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [seconds, setSeconds] = useState(5);
  const [clock, setClock] = useState(new Date());
  const issuingRef = useRef(false);

  const resetQr = useCallback(() => {
    setDisplayToken('');
    setQrImage('');
    setIssuedAt('');
    setExpiresAt('');
    setSeconds(5);
    setErrorMessage('');
  }, []);

  const issueQr = useCallback(async () => {
    if (!displayToken || issuingRef.current) {
      return;
    }

    issuingRef.current = true;

    const { data, error } = await supabase.rpc(
      'attendance_issue_display_qr_v52_14_1',
      {
        p_display_token: displayToken,
      },
    );

    if (error) {
      issuingRef.current = false;
      setQrImage('');
      setErrorMessage(
        error.message ||
          '출·퇴근 QR을 발급하지 못했습니다.',
      );
      return;
    }

    try {
      const workerUrl = buildAttendanceWorkerUrl({
        projectName:
          data?.project_name ||
          projectName,
        qrToken:
          data?.qr_token || '',
      });

      const image = await QrCode.toDataURL(
        workerUrl,
        {
          width: 780,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: {
            dark: '#020617',
            light: '#ffffff',
          },
        },
      );

      setQrImage(image);
      setIssuedAt(data?.issued_at || '');
      setExpiresAt(
        data?.session_expires_at || '',
      );
      setSeconds(5);
      setErrorMessage('');
    } catch (error) {
      setQrImage('');
      setErrorMessage(
        error?.message ||
          'QR 이미지를 만들지 못했습니다.',
      );
    } finally {
      issuingRef.current = false;
    }
  }, [displayToken, projectName]);

  useEffect(() => {
    if (!displayToken) {
      return undefined;
    }

    const firstTimer = window.setTimeout(
      issueQr,
      0,
    );

    const issueTimer = window.setInterval(
      issueQr,
      5000,
    );

    const secondTimer = window.setInterval(
      () => {
        setSeconds((previous) =>
          previous <= 1
            ? 5
            : previous - 1,
        );
        setClock(new Date());
      },
      1000,
    );

    return () => {
      window.clearTimeout(firstTimer);
      window.clearInterval(issueTimer);
      window.clearInterval(secondTimer);
    };
  }, [displayToken, issueQr]);

  const startAdminQr = async () => {
    const normalizedEmail = String(
      email || '',
    ).trim();

    if (!normalizedEmail || !password) {
      setErrorMessage(
        '통합관리시스템 아이디와 비밀번호를 입력해주세요.',
      );
      return;
    }

    if (!ATTENDANCE_PROJECTS.includes(projectName)) {
      setErrorMessage(
        'QR을 표시할 현장을 선택해주세요.',
      );
      return;
    }

    setLoading(true);
    setErrorMessage('');

    const signIn =
      await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

    if (signIn.error) {
      setLoading(false);
      setErrorMessage(
        '통합관리시스템 아이디 또는 비밀번호를 확인해주세요.',
      );
      return;
    }

    const profileResult = await supabase
      .from('user_profiles')
      .select('email, account_status')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (
      profileResult.error ||
      !profileResult.data ||
      String(
        profileResult.data.account_status ||
          'active',
      ).toLowerCase() !== 'active'
    ) {
      await supabase.auth.signOut({
        scope: 'local',
      });
      setLoading(false);
      setErrorMessage(
        '사용 가능한 통합관리시스템 계정인지 확인해주세요.',
      );
      return;
    }

    const displaySession = await supabase.rpc(
      'attendance_start_qr_display_v52_14_1',
      {
        p_project_name: projectName,
      },
    );

    if (displaySession.error) {
      await supabase.auth.signOut({
        scope: 'local',
      });
      setLoading(false);
      setErrorMessage(
        displaySession.error.message ||
          '해당 현장의 QR 표시 권한을 확인해주세요.',
      );
      return;
    }

    const nextDisplayToken = String(
      displaySession.data?.display_token || '',
    ).trim();

    if (!nextDisplayToken) {
      await supabase.auth.signOut({
        scope: 'local',
      });
      setLoading(false);
      setErrorMessage(
        'QR 표시 세션을 발급하지 못했습니다.',
      );
      return;
    }

    // 기존 PC QR 표시와 같은 보안 방향:
    // QR 표시 세션 발급 후 관리자 인증은 현재 탭에서 제거합니다.
    // QR 표시는 별도 display token으로만 계속 동작합니다.
    await supabase.auth.signOut({
      scope: 'local',
    });

    setPassword('');
    setDisplayToken(nextDisplayToken);
    setLoading(false);
  };

  const leaveAdminMode = async () => {
    await supabase.auth.signOut({
      scope: 'local',
    });
    resetQr();
    onBack?.();
  };

  if (displayToken) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: appMode ? 2.5 : 3,
          borderRadius: appMode ? 3.5 : 3,
          textAlign: 'center',
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
        >
          <Box sx={{ textAlign: 'left' }}>
            <Typography
              sx={{
                fontSize:
                  appMode
                    ? '1.25rem'
                    : '1.12rem',
                fontWeight: 900,
              }}
            >
              관리자 출·퇴근 QR
            </Typography>
            <Typography
              sx={{
                mt: 0.3,
                color: '#64748b',
                fontSize:
                  appMode
                    ? '0.9rem'
                    : '0.75rem',
                fontWeight: 800,
              }}
            >
              {projectName}
            </Typography>
          </Box>

          <IconButton
            aria-label="관리자 모드 종료"
            title="관리자 모드 종료"
            onClick={leaveAdminMode}
            color="error"
          >
            <LogoutRoundedIcon />
          </IconButton>
        </Stack>

        <Alert
          severity="info"
          sx={{
            mt: 1.5,
            textAlign: 'left',
            fontSize:
              appMode
                ? '0.9rem'
                : '0.74rem',
          }}
        >
          근로자가 자신의 휴대폰으로 아래 QR을 촬영하면
          기존과 동일하게 출·퇴근 처리가 진행됩니다.
        </Alert>

        {errorMessage ? (
          <Alert
            severity="error"
            sx={{ mt: 1.5, textAlign: 'left' }}
          >
            {errorMessage}
          </Alert>
        ) : null}

        <Box
          sx={{
            width:
              appMode
                ? 'min(88vw, 680px)'
                : 'min(72vh, 680px)',
            maxWidth: '100%',
            mx: 'auto',
            mt: 1.5,
          }}
        >
          {qrImage ? (
            <Box
              component="img"
              src={qrImage}
              alt="관리자 휴대폰 출퇴근 QR"
              sx={{
                display: 'block',
                width: '100%',
                borderRadius: 2,
              }}
            />
          ) : (
            <Box
              sx={{
                aspectRatio: '1 / 1',
                display: 'grid',
                placeItems: 'center',
                bgcolor: '#f8fafc',
                borderRadius: 2,
              }}
            >
              <CircularProgress />
            </Box>
          )}
        </Box>

        <Box
          sx={{
            mt: 1.2,
            height: 9,
            bgcolor: '#e2e8f0',
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              width: `${(seconds / 5) * 100}%`,
              height: '100%',
              bgcolor: '#0284c7',
              transition: 'width 1s linear',
            }}
          />
        </Box>

        <Typography
          sx={{
            mt: 0.7,
            color: '#334155',
            fontSize:
              appMode
                ? '0.9rem'
                : '0.75rem',
            fontWeight: 900,
          }}
        >
          {seconds}초 후 자동 변경 · 서버 유효시간 7초
        </Typography>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          spacing={0.5}
          sx={{
            mt: 1.5,
            pt: 1.5,
            borderTop: '1px solid #e2e8f0',
          }}
        >
          <Typography
            sx={{
              color: '#64748b',
              fontSize: '0.68rem',
            }}
          >
            현재시각{' '}
            {formatKoreaDateTime(clock, {
              timeOnly: true,
              withSeconds: true,
            })}
          </Typography>

          <Typography
            sx={{
              color: '#64748b',
              fontSize: '0.68rem',
            }}
          >
            {issuedAt
              ? `최근 발급 ${formatKoreaDateTime(
                  issuedAt,
                  {
                    timeOnly: true,
                    withSeconds: true,
                  },
                )}`
              : ''}
          </Typography>
        </Stack>

        {expiresAt ? (
          <Typography
            sx={{
              mt: 0.6,
              color: '#94a3b8',
              fontSize: '0.65rem',
            }}
          >
            QR 표시 세션 만료{' '}
            {formatKoreaDateTime(expiresAt, {
              withSeconds: true,
            })}
          </Typography>
        ) : null}

        <Button
          fullWidth
          variant="outlined"
          color="error"
          startIcon={<LogoutRoundedIcon />}
          onClick={leaveAdminMode}
          sx={{ mt: 1.5, fontWeight: 900 }}
        >
          관리자 모드 종료
        </Button>
      </Paper>
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        p: appMode ? 3 : 3.5,
        borderRadius: appMode ? 3.5 : 3,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ mb: 2 }}
      >
        <IconButton
          size="small"
          onClick={() => onBack?.()}
          aria-label="근로자 로그인으로 돌아가기"
        >
          <ArrowBackRoundedIcon />
        </IconButton>

        <Box>
          <Typography
            sx={{
              fontSize:
                appMode
                  ? '1.4rem'
                  : '1.22rem',
              fontWeight: 900,
            }}
          >
            관리자 모드
          </Typography>
          <Typography
            sx={{
              mt: 0.2,
              color: '#64748b',
              fontSize:
                appMode
                  ? '0.92rem'
                  : '0.78rem',
            }}
          >
            통합관리시스템에 등록된 관리자 계정으로 인증합니다.
          </Typography>
        </Box>
      </Stack>

      <Alert
        severity="info"
        sx={{ mb: 1.5 }}
      >
        현장에서 근로자에게 보여줄 출·퇴근 QR만 실행합니다.
        QR 표시 세션 발급 후 관리자 로그인 세션은 현재 탭에서
        자동 종료됩니다.
      </Alert>

      <Stack spacing={1.5}>
        <TextField
          label="통합관리시스템 아이디(이메일)"
          type="email"
          value={email}
          onChange={(event) =>
            setEmail(event.target.value)
          }
          autoComplete="username"
          autoCapitalize="none"
        />

        <TextField
          label="비밀번호"
          type="password"
          value={password}
          onChange={(event) =>
            setPassword(event.target.value)
          }
          autoComplete="current-password"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void startAdminQr();
            }
          }}
        />

        <FormControl fullWidth>
          <InputLabel>QR 표시 현장</InputLabel>
          <Select
            label="QR 표시 현장"
            value={projectName}
            onChange={(event) =>
              setProjectName(event.target.value)
            }
          >
            {ATTENDANCE_PROJECTS.map(
              (project) => (
                <MenuItem
                  key={project}
                  value={project}
                >
                  {project}
                </MenuItem>
              ),
            )}
          </Select>
        </FormControl>

        {errorMessage ? (
          <Alert severity="error">
            {errorMessage}
          </Alert>
        ) : null}

        <Button
          variant="contained"
          size="large"
          startIcon={
            loading
              ? (
                <CircularProgress
                  size={19}
                  color="inherit"
                />
              )
              : <QrCode2RoundedIcon />
          }
          disabled={loading}
          onClick={() => void startAdminQr()}
          sx={{
            minHeight: appMode ? 62 : 54,
            bgcolor: '#0f6fae',
            fontWeight: 900,
            '&:hover': {
              bgcolor: '#0b5f96',
            },
          }}
        >
          {loading
            ? '관리자 인증 중'
            : '출·퇴근 QR 실행'}
        </Button>

        <Button
          variant="text"
          startIcon={
            <AdminPanelSettingsRoundedIcon />
          }
          onClick={() => onBack?.()}
        >
          근로자 로그인으로 돌아가기
        </Button>
      </Stack>
    </Paper>
  );
}
