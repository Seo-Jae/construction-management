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
import AttendanceQrDisplay from './page/AttendanceQrDisplay.jsx';
import AttendanceWorkerPortal from './page/AttendanceWorkerPortal.jsx';
import MessengerWindow from './page/MessengerWindow.jsx';
import Login from './Login';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_WRITE_INTERVAL_MS = 15 * 1000;
const LAST_ACTIVITY_STORAGE_KEY =
  'wooklim-construction-last-activity';
const AUTO_LOGOUT_MESSAGE =
  '30분 동안 사용 기록이 없어 보안을 위해 자동 로그아웃되었습니다.';
const ACCESS_SESSION_KEY_STORAGE_KEY =
  'wooklim-construction-access-session-key';
const ACCESS_SESSION_ID_STORAGE_KEY =
  'wooklim-construction-access-session-id';
const ACCESS_HEARTBEAT_INTERVAL_MS = 15 * 1000;

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
  const accessSessionIdRef = useRef('');
  // v52.19: 이미 정상 로딩된 프로필이 있으면 인증 토큰 갱신이나
  // 포커스 복귀 중 프로필 재조회가 업무화면 전체를 내리지 않도록 보존합니다.
  const userProfileRef = useRef(null);
  const requestedPublicView = new URLSearchParams(
    window.location.search,
  ).get('view');

  const accountStatus = String(
    userProfile?.account_status || (userProfile ? 'active' : ''),
  ).toLowerCase();

  const fetchProfile = useCallback(async (user, options = {}) => {
    const hasExistingProfile = Boolean(userProfileRef.current);
    const silent = options.silent === true || hasExistingProfile;

    if (!user?.email) {
      userProfileRef.current = null;
      setUserProfile(null);
      setProfileError('');
      setProfileLoading(false);
      return;
    }

    /*
      최초 로그인/새로고침으로 아직 프로필이 없을 때만 전체 로딩 화면을 사용합니다.
      이미 정상 업무화면이 열린 뒤의 30초 갱신, 창 focus, TOKEN_REFRESHED 등은
      화면을 유지한 채 백그라운드에서 프로필만 교체합니다.
    */
    if (!silent) {
      setProfileLoading(true);
      setProfileError('');
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .ilike('email', user.email)
      .maybeSingle();

    if (error) {
      console.error('사용자 프로필 조회 오류:', error);

      // 일시적인 네트워크/포커스 복귀 오류 때문에 현재 업무화면을
      // 로그인/상태화면으로 바꾸지 않습니다. 기존 정상 프로필을 유지합니다.
      if (silent && userProfileRef.current) {
        return;
      }

      userProfileRef.current = null;
      setUserProfile(null);
      setProfileError(
        '계정 정보를 확인하지 못했습니다. SQL 적용 여부를 확인해주세요.',
      );
      setProfileLoading(false);
      return;
    }

    if (!data) {
      userProfileRef.current = null;
      setUserProfile(null);
      setProfileError(
        '가입 정보가 생성되지 않았습니다. 최고관리자에게 문의해주세요.',
      );
      setProfileLoading(false);
      return;
    }

    userProfileRef.current = data;
    setUserProfile(data);
    setProfileError('');
    setProfileLoading(false);
  }, []);

  const resetLocalSessionState = useCallback(() => {
    window.localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    window.sessionStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
    window.sessionStorage.removeItem(ACCESS_SESSION_KEY_STORAGE_KEY);
    window.sessionStorage.removeItem(ACCESS_SESSION_ID_STORAGE_KEY);
    window.sessionStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
    accessSessionIdRef.current = '';
    userProfileRef.current = null;
    setSession(null);
    setUserProfile(null);
    setProfileError('');
    setProfileLoading(false);
  }, []);

  const endCurrentAccessSession = useCallback(async (reason = 'logout') => {
    const storedSessionId =
      accessSessionIdRef.current ||
      window.sessionStorage.getItem(
        ACCESS_SESSION_ID_STORAGE_KEY,
      ) ||
      '';

    if (!storedSessionId) return;

    try {
      const { error } = await supabase.rpc(
        'end_user_access_session',
        {
          p_session_id: storedSessionId,
          p_end_reason: reason,
        },
      );

      if (error) throw error;
    } catch (error) {
      console.warn('접속종료 기록 실패:', error);
    }
  }, []);

  const performLogout = useCallback(async ({ automatic = false } = {}) => {
    if (logoutInProgressRef.current) return;

    logoutInProgressRef.current = true;
    setLoginNotice(automatic ? AUTO_LOGOUT_MESSAGE : '');

    try {
      await endCurrentAccessSession(
        automatic ? 'automatic_logout' : 'logout',
      );

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
  }, [endCurrentAccessSession, resetLocalSessionState]);

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
    } = supabase.auth.onAuthStateChange((authEvent, nextSession) => {
      if (!active) return;
      setSession(nextSession);

      if (nextSession) {
        const hasExistingProfile = Boolean(userProfileRef.current);

        /*
          Supabase는 토큰 자동갱신이나 탭/창 복귀 시 인증 이벤트를 다시 발생시킬 수 있습니다.
          기존 코드가 이때마다 profileLoading=true로 만들면서 Dashboard를 통째로
          LoadingScreen으로 교체했고, 그 결과 모든 하위 업무 state가 초기화됐습니다.

          TOKEN_REFRESHED는 권한 프로필과 무관하므로 기존 프로필이 있으면 재조회조차 하지 않고,
          다른 인증 이벤트도 기존 프로필이 있으면 silent 조회만 수행합니다.
        */
        if (authEvent === 'TOKEN_REFRESHED' && hasExistingProfile) {
          return;
        }

        window.setTimeout(
          () =>
            fetchProfile(nextSession.user, {
              silent: hasExistingProfile,
            }),
          0,
        );
      } else {
        userProfileRef.current = null;
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
    if (!session?.user?.id || accountStatus !== 'active') {
      return undefined;
    }

    let active = true;
    let heartbeatTimer = null;

    const ensureSessionKey = () => {
      const storedKey = window.sessionStorage.getItem(
        ACCESS_SESSION_KEY_STORAGE_KEY,
      );

      if (storedKey) return storedKey;

      const nextKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${session.user.id}-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2)}`;

      window.sessionStorage.setItem(
        ACCESS_SESSION_KEY_STORAGE_KEY,
        nextKey,
      );

      return nextKey;
    };

    const touchAccessSession = async () => {
      const sessionId =
        accessSessionIdRef.current ||
        window.sessionStorage.getItem(
          ACCESS_SESSION_ID_STORAGE_KEY,
        ) ||
        '';

      if (!sessionId) return;

      const { error } = await supabase.rpc(
        'touch_user_access_session',
        { p_session_id: sessionId },
      );

      if (error) {
        console.warn('접속상태 갱신 실패:', error);
      }
    };

    const startAccessSession = async () => {
      const { data, error } = await supabase.rpc(
        'start_user_access_session',
        {
          p_session_key: ensureSessionKey(),
          p_user_agent: navigator.userAgent || '',
        },
      );

      if (!active) return;

      if (error) {
        console.warn('접속기록 시작 실패:', error);
        return;
      }

      const sessionId = String(data || '');
      accessSessionIdRef.current = sessionId;
      window.sessionStorage.setItem(
        ACCESS_SESSION_ID_STORAGE_KEY,
        sessionId,
      );

      heartbeatTimer = window.setInterval(
        touchAccessSession,
        ACCESS_HEARTBEAT_INTERVAL_MS,
      );
    };

    const handlePageHide = () => {
      const sessionId =
        accessSessionIdRef.current ||
        window.sessionStorage.getItem(
          ACCESS_SESSION_ID_STORAGE_KEY,
        ) ||
        '';

      if (!sessionId) return;

      // 브라우저 종료·탭 닫기 상황의 최선 노력 기록입니다.
      // 전송이 중단되더라도 최근 heartbeat가 종료시각 대체값으로 사용됩니다.
      void supabase.rpc('end_user_access_session', {
        p_session_id: sessionId,
        p_end_reason: 'browser_close',
      });
    };

    startAccessSession();
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      active = false;
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [accountStatus, session?.user?.id]);

  useEffect(() => {
    if (!session?.user) return undefined;

    let idleTimer = null;
    let lastRecordedAt = 0;

    const readLastActivity = () => {
      const localValue = Number(
        window.localStorage.getItem(
          LAST_ACTIVITY_STORAGE_KEY,
        ),
      );
      if (Number.isFinite(localValue) && localValue > 0) {
        return localValue;
      }

      // v52.09 이전 버전에서 sessionStorage에 남아 있던 값을 1회 호환합니다.
      const legacyValue = Number(
        window.sessionStorage.getItem(
          LAST_ACTIVITY_STORAGE_KEY,
        ),
      );
      return Number.isFinite(legacyValue) && legacyValue > 0
        ? legacyValue
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
      window.localStorage.setItem(
        LAST_ACTIVITY_STORAGE_KEY,
        String(now),
      );
      // 같은 창에서는 storage 이벤트가 발생하지 않으므로 직접 재예약합니다.
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
    const handleSharedActivity = (event) => {
      if (event.key === LAST_ACTIVITY_STORAGE_KEY) {
        const sharedValue = Number(event.newValue || 0);
        if (Number.isFinite(sharedValue) && sharedValue > lastRecordedAt) {
          lastRecordedAt = sharedValue;
        }
        scheduleLogout();
      }
    };

    window.addEventListener('focus', checkWhenReturning);
    window.addEventListener('storage', handleSharedActivity);
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
      window.removeEventListener('storage', handleSharedActivity);
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

  if (requestedPublicView === 'attendance-worker') {
    return <AttendanceWorkerPortal />;
  }

  if (requestedPublicView === 'attendance-qr-display') {
    return <AttendanceQrDisplay />;
  }

  if (!session) {
    return profileLoading ? (
      <LoadingScreen />
    ) : (
      <Login loginNotice={loginNotice} />
    );
  }

  /*
    이미 정상 프로필이 있는 상태에서는 향후 어떤 백그라운드 갱신 코드가
    profileLoading을 잠시 true로 만들더라도 Dashboard를 unmount하지 않습니다.
    전체 LoadingScreen은 "아직 최초 프로필이 없는 경우"에만 사용합니다.
  */
  if (profileLoading && !userProfile) {
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

  const requestedView = new URLSearchParams(
    window.location.search,
  ).get('view');

  if (requestedView === 'messenger-window') {
    return (
      <MessengerWindow
        currentUserId={session.user.id || userProfile?.auth_user_id || ''}
        userProfile={userProfile}
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
