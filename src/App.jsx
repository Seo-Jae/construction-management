import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Typography,
} from '@mui/material';
import { supabase } from './supabaseClient';
import Dashboard from './Dashboard';
import Login from './Login';

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (!session) {
    return profileLoading ? <LoadingScreen /> : <Login />;
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
