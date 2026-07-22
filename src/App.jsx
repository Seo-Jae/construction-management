import React, {
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
  Paper,
  Typography,
} from '@mui/material';
import {
  supabase,
  SUPABASE_AUTH_STORAGE_KEY,
} from './supabaseClient';
import Dashboard from './Dashboard';
import Login from './Login';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_WRITE_INTERVAL_MS = 15 * 1000;
const LAST_ACTIVITY_STORAGE_KEY =
  'wooklim-construction-last-activity';
const AUTO_LOGOUT_MESSAGE =
  '30분 동안 사용 기록이 없어 보안을 위해 자동 로그아웃되었습니다.';

const STATUS_CONTENT = {
  pending: {
    title: '최고관리자 승인 대기 중입니다.',
    description:
      '가입 요청은 정상적으로 접수되었습니다. 최고관리자가 역할과 현장을 확인한 뒤 승인하면 사용할 수 있습니다.',
    severity: 'info',
  },
  disabled: {
    title: '사용이 중지된 계정입니다.',
    description:
      '퇴사 또는 권한 변경으로 계정 사용이 중지되었습니다. 다시 사용해야 한다면 최고관리자에게 문의해주세요.',
    severity: 'error',
  },
  rejected: {
    title: '가입 요청이 승인되지 않았습니다.',
    description:
      '입력한 소속 또는 현장 정보를 확인한 뒤 최고관리자에게 문의해주세요.',
    severity: 'warning',
  },
};

function LoadingScreen() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f1f5f9' }}>
      <Box sx={{ textAlign: 'center' }}>
        <CircularProgress size={34} />
        <Typography sx={{ mt: 1.5, color: '#64748b', fontSize: '0.82rem' }}>
          계정 권한을 확인하고 있습니다.
        </Typography>
      </Box>
    </Box>
  );
}

function AccountStatusScreen({
  email,
  status = 'pending',
  errorMessage = '',
  onRefresh,
  onLogout,
}) {
  const content = STATUS_CONTENT[status] || STATUS_CONTENT.pending;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        bgcolor: '#eef3f8',
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          width: '100%',
          maxWidth: 520,
          p: { xs: 3, sm: 4 },
          borderColor: '#cbd5e1',
          borderRadius: 3,
          boxShadow: '0 18px 45px rgba(15,23,42,0.1)',
        }}
      >
        <Typography sx={{ color: '#0f4c81', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.14em' }}>
          WOOKLIM CONSTRUCTION
        </Typography>
        <Typography component="h1" sx={{ mt: 1, color: '#0f172a', fontSize: '1.35rem', fontWeight: 900 }}>
          {content.title}
        </Typography>
        <Typography sx={{ mt: 1.2, color: '#64748b', fontSize: '0.82rem', lineHeight: 1.75 }}>
          {content.description}
        </Typography>

        <Alert severity={errorMessage ? 'error' : content.severity} sx={{ mt: 2.5, fontSize: '0.76rem' }}>
          {errorMessage || `로그인 계정: ${email || '-'}`}
        </Alert>

        <Box sx={{ mt: 2.5, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button variant="outlined" onClick={onLogout}>
            로그아웃
          </Button>
          {status === 'pending' && !errorMessage && (
            <Button variant="contained" onClick={onRefresh} sx={{ bgcolor: '#0f6fae' }}>
              승인상태 다시 확인
            </Button>
          )}
        </Box>
      </Paper>
    </Box>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const logoutInProgressRef = useRef(false);

  const fetchProfile = useCallback(async (user, options = {}) => {
    const silent = options.silent === true;

    if (!user?.email) {
      setUserProfile(null);
      setProfileError('');
      setProfileLoading(false);
      return;
    }

    if (!silent) setProfileLoading(true);
    setProfileError('');

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .ilike('email', user.email)
      .maybeSingle();

    if (error) {
      console.error('사용자 프로필 조회 오류:', error);
      setUserProfile(null);
      setProfileError(
        '계정 정보를 확인하지 못했습니다. SQL 적용 여부를 확인해주세요.',
      );
      setProfileLoading(false);
      return;
    }

    if (!data) {
      setUserProfile(null);
      setProfileError(
        '가입 정보가 생성되지 않았습니다. 최고관리자에게 문의해주세요.',
      );
      setProfileLoading(false);
      return;
    }

    setUserProfile(data);
    setProfileLoading(false);
  }, []);

  const resetLocalSessionState = useCallback(() => {
    window.sessionStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    window.sessionStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
    setSession(null);
    setUserProfile(null);
    setProfileError('');
    setProfileLoading(false);
  }, []);

  const performLogout = useCallback(async ({ automatic = false } = {}) => {
    if (logoutInProgressRef.current) return;

    logoutInProgressRef.current = true;
    setLoginNotice(automatic ? AUTO_LOGOUT_MESSAGE : '');

    try {
      const { error } = automatic
        ? await supabase.auth.signOut({ scope: 'local' })
        : await supabase.auth.signOut();

      if (error) throw error;
    } catch (error) {
      console.error('로그아웃 오류:', error);
    } finally {
      resetLocalSessionState();
      logoutInProgressRef.current = false;
    }
  }, [resetLocalSessionState]);

  const handleLogout = useCallback(() => {
    performLogout();
  }, [performLogout]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session: nextSession } }) => {
      if (!active) return;
      setSession(nextSession);

      if (nextSession) {
        fetchProfile(nextSession.user);
      } else {
        setProfileLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);

      if (nextSession) {
        window.setTimeout(() => fetchProfile(nextSession.user), 0);
      } else {
        setUserProfile(null);
        setProfileError('');
        setProfileLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  useEffect(() => {
    if (!session?.user) return undefined;

    let idleTimer = null;
    let lastRecordedAt = 0;

    const readLastActivity = () => {
      const storedValue = Number(
        window.sessionStorage.getItem(
          LAST_ACTIVITY_STORAGE_KEY,
        ),
      );

      return Number.isFinite(storedValue) && storedValue > 0
        ? storedValue
        : 0;
    };

    const scheduleLogout = () => {
      if (idleTimer) window.clearTimeout(idleTimer);

      const lastActivity = readLastActivity();
      const elapsed = lastActivity
        ? Date.now() - lastActivity
        : 0;
      const remaining = INACTIVITY_TIMEOUT_MS - elapsed;

      if (lastActivity && remaining <= 0) {
        performLogout({ automatic: true });
        return;
      }

      idleTimer = window.setTimeout(() => {
        const latestActivity = readLastActivity();

        if (
          latestActivity &&
          Date.now() - latestActivity >= INACTIVITY_TIMEOUT_MS
        ) {
          performLogout({ automatic: true });
        } else {
          scheduleLogout();
        }
      }, Math.max(remaining, 1000));
    };

    const recordActivity = () => {
      const now = Date.now();

      if (
        lastRecordedAt &&
        now - lastRecordedAt < ACTIVITY_WRITE_INTERVAL_MS
      ) {
        return;
      }

      lastRecordedAt = now;
      window.sessionStorage.setItem(
        LAST_ACTIVITY_STORAGE_KEY,
        String(now),
      );
      scheduleLogout();
    };

    const checkWhenReturning = () => {
      if (
        document.visibilityState === 'visible' ||
        document.hasFocus()
      ) {
        scheduleLogout();
      }
    };

    const previousActivity = readLastActivity();

    if (!previousActivity) {
      recordActivity();
    } else {
      lastRecordedAt = previousActivity;
      scheduleLogout();
    }

    const activityEvents = [
      'pointerdown',
      'pointermove',
      'keydown',
      'scroll',
      'touchstart',
    ];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, {
        passive: true,
      });
    });
    window.addEventListener('focus', checkWhenReturning);
    document.addEventListener(
      'visibilitychange',
      checkWhenReturning,
    );

    return () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      window.removeEventListener('focus', checkWhenReturning);
      document.removeEventListener(
        'visibilitychange',
        checkWhenReturning,
      );
    };
  }, [performLogout, session]);

  useEffect(() => {
    if (!session?.user) return undefined;

    const refreshSilently = () => {
      fetchProfile(session.user, { silent: true });
    };

    const timer = window.setInterval(refreshSilently, 30 * 1000);
    window.addEventListener('focus', refreshSilently);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshSilently);
    };
  }, [fetchProfile, session]);

  if (!session) {
    return profileLoading ? (
      <LoadingScreen />
    ) : (
      <Login loginNotice={loginNotice} />
    );
  }

  if (profileLoading) {
    return <LoadingScreen />;
  }

  if (profileError || !userProfile) {
    return (
      <AccountStatusScreen
        email={session.user.email}
        status="pending"
        errorMessage={profileError}
        onRefresh={() => fetchProfile(session.user)}
        onLogout={handleLogout}
      />
    );
  }

  const accountStatus = String(
    userProfile.account_status || 'active',
  ).toLowerCase();

  if (accountStatus !== 'active') {
    return (
      <AccountStatusScreen
        email={session.user.email}
        status={accountStatus}
        onRefresh={() => fetchProfile(session.user)}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <Dashboard
      user={session.user}
      userProfile={userProfile}
      onLogout={handleLogout}
    />
  );
}
