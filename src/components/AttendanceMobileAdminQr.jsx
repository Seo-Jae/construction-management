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
  t = (key) => key,
  locale = 'ko-KR',
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
        t('adminQrIssueFailed'),
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
    } catch {
      setQrImage('');
      setErrorMessage(
        t('adminQrImageFailed'),
      );
    } finally {
      issuingRef.current = false;
    }
  }, [displayToken, projectName, t]);

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
        t('adminMissingCredentials'),
      );
      return;
    }

    if (!ATTENDANCE_PROJECTS.includes(projectName)) {
      setErrorMessage(
        t('adminSelectProject'),
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
        t('adminInvalidCredentials'),
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
        t('adminInactiveAccount'),
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
        t('adminNoPermission'),
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
        t('adminSessionFailed'),
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
        variant={appMode ? undefined : 'outlined'}
        elevation={0}
        sx={{
          width: appMode ? '90%' : '100%',
          maxWidth: 'none',
          mx: 'auto',
          mt: appMode ? 6 : 0,
          p: appMode ? 0 : 3,
          border: appMode ? 'none' : undefined,
          borderRadius: appMode ? 0 : 3,
          boxShadow: 'none',
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
                    ? '2.1rem'
                    : '1.12rem',
                fontWeight: 900,
              }}
            >
              {t('adminQrTitle')}
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
            aria-label={t('exitAdmin')}
            title={t('exitAdmin')}
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
          {t('adminQrGuide')}
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
              alt={t('adminQrAlt')}
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
          {t('qrRefresh', { seconds })}
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
            {t('currentTime')}{' '}
            {formatKoreaDateTime(clock, {
              timeOnly: true,
              withSeconds: true,
              locale,
            })}
          </Typography>

          <Typography
            sx={{
              color: '#64748b',
              fontSize: '0.68rem',
            }}
          >
            {issuedAt
              ? t('recentlyIssued', {
                  time: formatKoreaDateTime(
                    issuedAt,
                    {
                      timeOnly: true,
                      withSeconds: true,
                      locale,
                    },
                  ),
                })
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
            {t('qrSessionExpires', {
              time: formatKoreaDateTime(expiresAt, {
                withSeconds: true,
                locale,
              }),
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
          {t('exitAdmin')}
        </Button>
      </Paper>
    );
  }

  return (
    <Paper
      variant={appMode ? undefined : 'outlined'}
      elevation={0}
      sx={{
        width: appMode ? '90%' : '100%',
        maxWidth: 'none',
        minHeight: appMode
          ? 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))'
          : 'auto',
        mx: 'auto',
        mt: appMode ? 10 : 0,
        p: appMode ? 0 : 3.5,
        border: appMode ? 'none' : undefined,
        borderRadius: appMode ? 0 : 3,
        boxShadow: 'none',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={appMode ? 2 : 1}
        sx={{ mb: appMode ? 6 : 2 }}
      >
        <IconButton
          size="small"
          onClick={() => onBack?.()}
          aria-label={t('backToWorkerLogin')}
          sx={{
            width: appMode ? 64 : undefined,
            height: appMode ? 64 : undefined,
          }}
        >
          <ArrowBackRoundedIcon
            sx={{ fontSize: appMode ? 42 : undefined }}
          />
        </IconButton>

        <Box>
          <Typography
            sx={{
              fontSize:
                appMode
                  ? '2.8rem'
                  : '1.22rem',
              fontWeight: 900,
            }}
          >
            {t('adminTitle')}
          </Typography>
          <Typography
            sx={{
              mt: 0.2,
              color: '#64748b',
              fontSize:
                appMode
                  ? '1.3rem'
                  : '0.78rem',
              lineHeight: 1.55,
            }}
          >
            {t('adminSubtitle')}
          </Typography>
        </Box>
      </Stack>

      <Alert
        severity="info"
        sx={{
          mb: appMode ? 5 : 1.5,
          fontSize: appMode ? '1.25rem' : undefined,
          lineHeight: 1.7,
        }}
      >
        {t('adminInfo')}
      </Alert>

      <Stack spacing={appMode ? 4 : 1.5}>
        <TextField
          label={t('adminEmail')}
          type="email"
          value={email}
          onChange={(event) =>
            setEmail(event.target.value)
          }
          autoComplete="username"
          autoCapitalize="none"
          sx={{
            '& .MuiInputBase-root': {
              minHeight: appMode ? 92 : undefined,
              fontSize: appMode ? '1.55rem' : undefined,
            },
            '& .MuiInputLabel-root': {
              fontSize: appMode ? '1.2rem' : undefined,
            },
          }}
        />

        <TextField
          label={t('password')}
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
          sx={{
            '& .MuiInputBase-root': {
              minHeight: appMode ? 92 : undefined,
              fontSize: appMode ? '1.55rem' : undefined,
            },
            '& .MuiInputLabel-root': {
              fontSize: appMode ? '1.2rem' : undefined,
            },
          }}
        />

        <FormControl
          fullWidth
          sx={{
            '& .MuiInputBase-root': {
              minHeight: appMode ? 92 : undefined,
              fontSize: appMode ? '1.4rem' : undefined,
            },
            '& .MuiInputLabel-root': {
              fontSize: appMode ? '1.2rem' : undefined,
            },
          }}
        >
          <InputLabel>{t('adminProject')}</InputLabel>
          <Select
            label={t('adminProject')}
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
            minHeight: appMode ? 110 : 54,
            bgcolor: '#0f6fae',
            fontSize: appMode ? '1.7rem' : undefined,
            fontWeight: 900,
            '&:hover': {
              bgcolor: '#0b5f96',
            },
          }}
        >
          {loading
            ? t('adminAuthenticating')
            : t('startAttendanceQr')}
        </Button>

        <Button
          variant="text"
          startIcon={
            <AdminPanelSettingsRoundedIcon />
          }
          onClick={() => onBack?.()}
          sx={{
            minHeight: appMode ? 72 : undefined,
            fontSize: appMode ? '1.3rem' : undefined,
          }}
        >
          {t('backToWorkerLogin')}
        </Button>
      </Stack>
    </Paper>
  );
}
