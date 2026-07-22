import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { supabase } from './supabaseClient';

const DEFAULT_NOTICES = [
  {
    id: 1,
    updated_at: '2026-07-14T00:00:00+09:00',
    category: '공지',
    title: '공사관리 시스템 테스트운영을 시작합니다.',
    content:
      '현장별 공사일보, 공정 진척, 업무 보고 기능을 순차적으로 적용합니다.',
  },
  {
    id: 2,
    updated_at: '2026-07-14T00:00:00+09:00',
    category: '안내',
    title: '계정 및 권한 관련 안내',
    content:
      '회원가입 후 최고관리자의 승인이 완료되어야 시스템을 이용할 수 있습니다.',
  },
  {
    id: 3,
    updated_at: '2026-07-14T00:00:00+09:00',
    category: '업데이트',
    title: '관리자 전체 현장 Dashboard 적용',
    content:
      '관리자와 최고관리자는 전체 현장의 금일 출력과 공정 현황을 확인할 수 있습니다.',
  },
];

const EMPTY_SIGNUP_FORM = {
  email: '',
  password: '',
  passwordConfirm: '',
  managerName: '',
  organizationType: '현장',
  projectName: '',
  positionTitle: '',
};

const REMEMBERED_EMAIL_KEY = 'wooklim-remembered-login-email';

const formatNoticeDate = (value) => {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10).replace(/-/g, '.');
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replace(/\. /g, '.')
    .replace(/\.$/, '');
};

const normalizeSearchText = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '');

export default function Login({ loginNotice = '' }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState(() =>
    window.localStorage.getItem(REMEMBERED_EMAIL_KEY) || '',
  );
  const [password, setPassword] = useState('');
  const [rememberEmail, setRememberEmail] = useState(() =>
    Boolean(window.localStorage.getItem(REMEMBERED_EMAIL_KEY)),
  );
  const [signupForm, setSignupForm] = useState(EMPTY_SIGNUP_FORM);
  const [projectOptions, setProjectOptions] = useState([]);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(() =>
    loginNotice
      ? { severity: 'warning', text: loginNotice }
      : null,
  );
  const [logoError, setLogoError] = useState(false);
  const [notices, setNotices] = useState(DEFAULT_NOTICES);

  useEffect(() => {
    let active = true;

    const loadNotices = async () => {
      const { data, error } = await supabase
        .from('system_notices')
        .select('id, category, title, content, updated_at')
        .order('id', { ascending: true });

      if (error) {
        console.error('로그인 공지사항 조회 오류:', error);
        return;
      }

      if (active && Array.isArray(data) && data.length > 0) {
        setNotices(data);
      }
    };

    loadNotices();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'signup' || projectOptions.length > 0) return;

    let active = true;

    const loadProjectOptions = async () => {
      setProjectLoading(true);
      setProjectError('');

      const { data, error } = await supabase.rpc(
        'list_registration_projects',
      );

      if (!active) return;

      if (error) {
        console.error('회원가입 현장목록 조회 오류:', error);
        setProjectError(
          '현장목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
        );
        setProjectLoading(false);
        return;
      }

      setProjectOptions(
        (Array.isArray(data) ? data : [])
          .map((row) =>
            String(row?.project_name || row || '').trim(),
          )
          .filter(Boolean),
      );
      setProjectLoading(false);
    };

    loadProjectOptions();

    return () => {
      active = false;
    };
  }, [mode, projectOptions.length]);

  const visibleProjectOptions = useMemo(
    () =>
      [...new Set(projectOptions)].sort((first, second) =>
        first.localeCompare(second, 'ko', { numeric: true }),
      ),
    [projectOptions],
  );

  const changeMode = (nextMode) => {
    if (loading || !nextMode) return;
    setMode(nextMode);
    setMessage(null);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      if (rememberEmail) {
        window.localStorage.setItem(
          REMEMBERED_EMAIL_KEY,
          email.trim().toLowerCase(),
        );
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } catch (error) {
      console.error('로그인 오류:', error);
      const isBanned = String(error?.message || '')
        .toLowerCase()
        .includes('banned');

      setMessage({
        severity: 'error',
        text: isBanned
          ? '사용이 중지된 계정입니다. 최고관리자에게 문의해주세요.'
          : '로그인 실패: 이메일이나 비밀번호를 확인해주세요.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignupChange = (field, value) => {
    setSignupForm((previous) => ({
      ...previous,
      [field]: value,
      ...(field === 'organizationType'
        ? { projectName: value === '본사' ? '본사' : '' }
        : {}),
    }));
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    if (loading) return;

    const preparedEmail = signupForm.email.trim().toLowerCase();
    const preparedName = signupForm.managerName.trim();
    const preparedPosition = signupForm.positionTitle.trim();
    const preparedProject =
      signupForm.organizationType === '본사'
        ? '본사'
        : signupForm.projectName.trim();

    if (!preparedProject) {
      setMessage({
        severity: 'error',
        text: '근무할 현장을 검색해 선택해주세요.',
      });
      return;
    }

    if (!preparedName || !preparedPosition) {
      setMessage({
        severity: 'error',
        text: '이름과 직책을 모두 입력해주세요.',
      });
      return;
    }

    if (signupForm.password.length < 8) {
      setMessage({
        severity: 'error',
        text: '비밀번호는 8자 이상으로 입력해주세요.',
      });
      return;
    }

    if (signupForm.password !== signupForm.passwordConfirm) {
      setMessage({
        severity: 'error',
        text: '비밀번호 확인 값이 일치하지 않습니다.',
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: preparedEmail,
        password: signupForm.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            manager_name: preparedName,
            organization_type: signupForm.organizationType,
            requested_project_name: preparedProject,
            position_title: preparedPosition,
          },
        },
      });

      if (error) throw error;

      if (data?.session) {
        await supabase.auth.signOut();
      }

      setEmail(preparedEmail);
      setPassword('');
      setSignupForm(EMPTY_SIGNUP_FORM);
      setMode('login');
      setMessage({
        severity: 'success',
        text: data?.user?.identities?.length === 0
          ? '이미 가입된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해주세요.'
          : '가입 요청이 접수되었습니다. 최고관리자에게 회원 승인을 요청해주세요.',
      });
    } catch (error) {
      console.error('회원가입 오류:', error);
      setMessage({
        severity: 'error',
        text:
          error?.message ||
          '회원가입 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#eef3f8',
        background:
          'linear-gradient(135deg, #e9eff6 0%, #f8fafc 48%, #e7edf5 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: { xs: 2, md: 4, xl: 7 },
        py: { xs: 3, md: 5 },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: -180,
          left: -160,
          width: 520,
          height: 520,
          borderRadius: '50%',
          bgcolor: 'rgba(15, 83, 140, 0.07)',
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          right: -180,
          bottom: -240,
          width: 620,
          height: 620,
          borderRadius: '50%',
          bgcolor: 'rgba(30, 64, 175, 0.06)',
        }}
      />

      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 1220,
          minHeight: { xs: 'auto', md: 680 },
          borderRadius: { xs: 3, md: 4 },
          border: '1px solid rgba(148, 163, 184, 0.28)',
          boxShadow: '0 28px 75px rgba(15, 23, 42, 0.14)',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'minmax(440px, 0.9fr) minmax(500px, 1.1fr)',
          },
          position: 'relative',
          zIndex: 1,
          bgcolor: '#ffffff',
        }}
      >
        <Box
          sx={{
            px: { xs: 3, sm: 5, md: 6 },
            py: { xs: 4, md: 5 },
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            bgcolor: '#ffffff',
            position: 'relative',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 6,
              background:
                'linear-gradient(90deg, #0f4c81 0%, #1478bd 55%, #52a9d8 100%)',
            }}
          />

          <Box sx={{ mb: mode === 'login' ? 3.5 : 2.3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.6, mb: 1.5 }}>
              {!logoError ? (
                <Box
                  component="img"
                  src="/images/wooklim-logo.png"
                  alt="욱림건설 로고"
                  onError={() => setLogoError(true)}
                  sx={{ width: 58, height: 58, objectFit: 'contain' }}
                />
              ) : (
                <Box
                  sx={{
                    width: 58,
                    height: 58,
                    borderRadius: 2,
                    bgcolor: '#0f4c81',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.35rem',
                    fontWeight: 900,
                  }}
                >
                  욱림
                </Box>
              )}

              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    color: '#64748b',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    letterSpacing: '0.16em',
                  }}
                >
                  WOOKLIM CONSTRUCTION
                </Typography>
                <Typography
                  component="h1"
                  sx={{
                    mt: 0.25,
                    color: '#0f172a',
                    fontSize: { xs: '1.22rem', sm: '1.38rem' },
                    lineHeight: 1.35,
                    fontWeight: 900,
                    letterSpacing: '-0.035em',
                  }}
                >
                  (주)욱림건설 공사관리 시스템
                </Typography>
              </Box>
            </Box>

            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={mode}
              onChange={(_event, value) => changeMode(value)}
              sx={{
                mt: 1.3,
                '& .MuiToggleButton-root': {
                  py: 0.8,
                  fontWeight: 900,
                  borderColor: '#cbd5e1',
                },
                '& .Mui-selected': {
                  color: '#0f6fae !important',
                  bgcolor: '#eaf5fc !important',
                },
              }}
            >
              <ToggleButton value="login">로그인</ToggleButton>
              <ToggleButton value="signup">회원가입</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {message && (
            <Alert severity={message.severity} sx={{ mb: 2, fontSize: '0.76rem' }}>
              {message.text}
            </Alert>
          )}

          {mode === 'login' ? (
            <Box component="form" onSubmit={handleLogin} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="이메일"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                fullWidth
                autoComplete="email"
                disabled={loading}
              />
              <TextField
                label="비밀번호"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                fullWidth
                autoComplete="current-password"
                disabled={loading}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={rememberEmail}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setRememberEmail(checked);

                      if (!checked) {
                        window.localStorage.removeItem(
                          REMEMBERED_EMAIL_KEY,
                        );
                      }
                    }}
                    disabled={loading}
                  />
                }
                label="아이디 기억하기"
                sx={{
                  mt: -0.7,
                  mb: -0.6,
                  width: 'fit-content',
                  '& .MuiFormControlLabel-label': {
                    color: '#64748b',
                    fontSize: '0.76rem',
                  },
                }}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
                sx={{
                  mt: 0.7,
                  height: 54,
                  bgcolor: '#0f6fae',
                  fontWeight: 900,
                  boxShadow: 'none',
                  '&:hover': { bgcolor: '#0b5f98' },
                }}
              >
                {loading ? '로그인 중...' : '로그인'}
              </Button>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleSignup} sx={{ display: 'flex', flexDirection: 'column', gap: 1.35 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.2 }}>
                <TextField
                  label="이름"
                  value={signupForm.managerName}
                  onChange={(event) => handleSignupChange('managerName', event.target.value)}
                  required
                  fullWidth
                  disabled={loading}
                />
                <TextField
                  label="직책"
                  placeholder="예: 소장, 차장, 과장"
                  value={signupForm.positionTitle}
                  onChange={(event) => handleSignupChange('positionTitle', event.target.value)}
                  required
                  fullWidth
                  disabled={loading}
                />
              </Box>

              <TextField
                label="이메일 아이디"
                type="email"
                value={signupForm.email}
                onChange={(event) => handleSignupChange('email', event.target.value)}
                required
                fullWidth
                autoComplete="email"
                disabled={loading}
              />

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.2 }}>
                <TextField
                  label="비밀번호"
                  type="password"
                  value={signupForm.password}
                  onChange={(event) => handleSignupChange('password', event.target.value)}
                  helperText="8자 이상"
                  required
                  fullWidth
                  autoComplete="new-password"
                  disabled={loading}
                />
                <TextField
                  label="비밀번호 확인"
                  type="password"
                  value={signupForm.passwordConfirm}
                  onChange={(event) => handleSignupChange('passwordConfirm', event.target.value)}
                  required
                  fullWidth
                  autoComplete="new-password"
                  disabled={loading}
                />
              </Box>

              <TextField
                select
                label="구분"
                value={signupForm.organizationType}
                onChange={(event) =>
                  handleSignupChange('organizationType', event.target.value)
                }
                fullWidth
                disabled={loading}
              >
                <MenuItem value="본사">본사</MenuItem>
                <MenuItem value="현장">현장</MenuItem>
              </TextField>

              {signupForm.organizationType === '본사' ? (
                <TextField
                  label="근무처"
                  value="본사"
                  fullWidth
                  disabled
                  helperText="본사는 자동 입력되며 수정할 수 없습니다."
                />
              ) : (
                <Autocomplete
                  options={visibleProjectOptions}
                  value={signupForm.projectName || null}
                  onChange={(_event, value) =>
                    handleSignupChange('projectName', value || '')
                  }
                  loading={projectLoading}
                  disabled={loading}
                  filterOptions={(options, state) => {
                    const keyword = normalizeSearchText(state.inputValue);
                    if (!keyword) return options;
                    return options.filter((option) =>
                      normalizeSearchText(option).includes(keyword),
                    );
                  }}
                  noOptionsText="검색되는 현장이 없습니다."
                  loadingText="현장목록 불러오는 중..."
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="근무 현장 검색"
                      placeholder="예: 용인금어"
                      required
                      error={Boolean(projectError)}
                      helperText={
                        projectError ||
                        '현장명의 일부를 입력한 뒤 목록에서 선택해주세요.'
                      }
                    />
                  )}
                />
              )}

              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={loading || projectLoading}
                sx={{
                  mt: 0.35,
                  height: 50,
                  bgcolor: '#0f6fae',
                  fontWeight: 900,
                  boxShadow: 'none',
                  '&:hover': { bgcolor: '#0b5f98' },
                }}
              >
                {loading ? '가입 요청 중...' : '회원가입 요청'}
              </Button>
            </Box>
          )}

          <Box sx={{ mt: 2.5 }}>
            <Divider />
            <Typography sx={{ mt: 1.6, color: '#94a3b8', fontSize: '0.7rem', lineHeight: 1.65 }}>
              회원가입 후 최고관리자 승인이 완료되어야 이용할 수 있습니다.
              <br />
              인증메일이 발송된 경우 메일의 링크를 먼저 눌러주세요. 역할과 현장 접근 권한은 최고관리자가 최종 지정합니다.
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            px: { xs: 3, sm: 5, md: 6 },
            py: { xs: 4, md: 6 },
            background:
              'linear-gradient(145deg, #0d3f69 0%, #0f5588 55%, #0b6d9f 100%)',
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ position: 'absolute', width: 340, height: 340, borderRadius: '50%', right: -150, top: -120, bgcolor: 'rgba(255,255,255,0.06)' }} />
          <Box sx={{ position: 'absolute', width: 250, height: 250, borderRadius: '50%', left: -120, bottom: -110, bgcolor: 'rgba(255,255,255,0.045)' }} />

          <Box sx={{ position: 'relative', zIndex: 1 }}>
            <Typography sx={{ color: '#99d8ff', fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.2em' }}>
              NOTICE & UPDATE
            </Typography>
            <Typography sx={{ mt: 0.7, fontSize: { xs: '1.45rem', md: '1.7rem' }, fontWeight: 900, letterSpacing: '-0.035em' }}>
              공지사항
            </Typography>
            <Typography sx={{ mt: 0.8, color: 'rgba(255,255,255,0.72)', fontSize: '0.82rem', lineHeight: 1.7 }}>
              공사관리 시스템의 주요 안내와 업데이트 내용을 확인해주세요.
            </Typography>

            <Box sx={{ mt: 3.2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {notices.map((notice, index) => (
                <Box
                  key={notice.id}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: '1px solid rgba(255,255,255,0.13)',
                    bgcolor: index === 0 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.075)',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.65 }}>
                    <Box sx={{ px: 0.8, py: 0.25, borderRadius: 999, bgcolor: 'rgba(126, 211, 255, 0.16)', color: '#bceaff', fontSize: '0.65rem', fontWeight: 900 }}>
                      {notice.category}
                    </Box>
                    <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.66rem' }}>
                      {formatNoticeDate(notice.updated_at)}
                    </Typography>
                  </Box>
                  <Typography sx={{ color: '#ffffff', fontSize: '0.87rem', fontWeight: 900, lineHeight: 1.5 }}>
                    {notice.title}
                  </Typography>
                  <Typography sx={{ mt: 0.55, color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem', lineHeight: 1.65 }}>
                    {notice.content}
                  </Typography>
                </Box>
              ))}
            </Box>

            <Typography sx={{ mt: 3, color: 'rgba(255,255,255,0.47)', fontSize: '0.66rem' }}>
              © 2026 WOOKLIM CONSTRUCTION. All rights reserved.
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
