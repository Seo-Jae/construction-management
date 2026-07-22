import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  Paper,
  TextField,
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
      '로그인 계정과 현장 권한에 문제가 있는 경우 최고관리자에게 문의해주세요.',
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

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
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

  const handleLogin = async (event) => {
    event.preventDefault();

    if (loading) return;

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('로그인 오류:', error);
      alert('로그인 실패: 이메일이나 비밀번호를 확인해주세요.');
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
          pointerEvents: 'none',
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
          pointerEvents: 'none',
        }}
      />

      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 1220,
          minHeight: { xs: 'auto', md: 650 },
          borderRadius: { xs: 3, md: 4 },
          border: '1px solid rgba(148, 163, 184, 0.28)',
          boxShadow: '0 28px 75px rgba(15, 23, 42, 0.14)',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'minmax(420px, 0.88fr) minmax(500px, 1.12fr)',
          },
          position: 'relative',
          zIndex: 1,
          bgcolor: '#ffffff',
        }}
      >
        {/* 로그인 영역 */}
        <Box
          sx={{
            px: { xs: 3, sm: 5, md: 6 },
            py: { xs: 4, md: 6 },
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

          <Box sx={{ mb: 4 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.6,
                mb: 2.2,
              }}
            >
              {!logoError ? (
                <Box
                  component="img"
                  src="/images/wooklim-logo.png"
                  alt="욱림건설 로고"
                  onError={() => setLogoError(true)}
                  sx={{
                    width: 58,
                    height: 58,
                    objectFit: 'contain',
                    flexShrink: 0,
                  }}
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
                    letterSpacing: '-0.04em',
                    flexShrink: 0,
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
                    fontSize: {
                      xs: '1.22rem',
                      sm: '1.38rem',
                    },
                    lineHeight: 1.35,
                    fontWeight: 900,
                    letterSpacing: '-0.035em',
                  }}
                >
                  (주)욱림건설 공사관리 시스템
                </Typography>
              </Box>
            </Box>

            <Typography
              sx={{
                color: '#475569',
                fontSize: '0.88rem',
                lineHeight: 1.7,
              }}
            >
              관리자에게 발급받은 계정으로 로그인해주세요.
            </Typography>
          </Box>

          <Box
            component="form"
            onSubmit={handleLogin}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <TextField
              label="이메일"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              fullWidth
              autoComplete="email"
              disabled={loading}
              sx={{
                '& .MuiOutlinedInput-root': {
                  height: 56,
                  borderRadius: 1.8,
                  bgcolor: '#fbfdff',
                  '&:hover fieldset': {
                    borderColor: '#5696c8',
                  },
                  '&.Mui-focused fieldset': {
                    borderWidth: 1.5,
                    borderColor: '#0f6fae',
                  },
                },
              }}
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
              sx={{
                '& .MuiOutlinedInput-root': {
                  height: 56,
                  borderRadius: 1.8,
                  bgcolor: '#fbfdff',
                  '&:hover fieldset': {
                    borderColor: '#5696c8',
                  },
                  '&.Mui-focused fieldset': {
                    borderWidth: 1.5,
                    borderColor: '#0f6fae',
                  },
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
                borderRadius: 1.8,
                bgcolor: '#0f6fae',
                fontSize: '0.94rem',
                fontWeight: 900,
                letterSpacing: '0.02em',
                boxShadow: '0 10px 22px rgba(15, 111, 174, 0.22)',
                '&:hover': {
                  bgcolor: '#0b5f98',
                  boxShadow: '0 12px 26px rgba(15, 111, 174, 0.27)',
                },
              }}
            >
              {loading ? '로그인 중...' : '로그인'}
            </Button>
          </Box>

          <Box sx={{ mt: 3.2 }}>
            <Divider />
            <Typography
              sx={{
                mt: 2,
                color: '#94a3b8',
                fontSize: '0.7rem',
                lineHeight: 1.65,
              }}
            >
              본 시스템은 승인된 사용자만 이용할 수 있습니다.
              <br />
              계정 또는 접속 권한 문의는 최고관리자에게 연락해주세요.
            </Typography>
          </Box>
        </Box>

        {/* 공지사항 영역 */}
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
          <Box
            sx={{
              position: 'absolute',
              width: 340,
              height: 340,
              borderRadius: '50%',
              right: -150,
              top: -120,
              bgcolor: 'rgba(255,255,255,0.06)',
            }}
          />

          <Box
            sx={{
              position: 'absolute',
              width: 250,
              height: 250,
              borderRadius: '50%',
              left: -120,
              bottom: -110,
              bgcolor: 'rgba(255,255,255,0.045)',
            }}
          />

          <Box sx={{ position: 'relative', zIndex: 1 }}>
            <Typography
              sx={{
                color: '#99d8ff',
                fontSize: '0.72rem',
                fontWeight: 900,
                letterSpacing: '0.2em',
              }}
            >
              NOTICE & UPDATE
            </Typography>

            <Typography
              sx={{
                mt: 0.7,
                fontSize: { xs: '1.45rem', md: '1.7rem' },
                fontWeight: 900,
                letterSpacing: '-0.035em',
              }}
            >
              공지사항
            </Typography>

            <Typography
              sx={{
                mt: 0.8,
                color: 'rgba(255,255,255,0.72)',
                fontSize: '0.82rem',
                lineHeight: 1.7,
              }}
            >
              공사관리 시스템의 주요 안내와 업데이트 내용을 확인해주세요.
            </Typography>

            <Box
              sx={{
                mt: 3.2,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.25,
              }}
            >
              {notices.map((notice, index) => (
                <Box
                  key={notice.id}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: '1px solid rgba(255,255,255,0.13)',
                    bgcolor:
                      index === 0
                        ? 'rgba(255,255,255,0.13)'
                        : 'rgba(255,255,255,0.075)',
                    backdropFilter: 'blur(8px)',
                    transition: 'transform 0.15s ease, background 0.15s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      bgcolor: 'rgba(255,255,255,0.15)',
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      mb: 0.65,
                    }}
                  >
                    <Box
                      sx={{
                        px: 0.8,
                        py: 0.25,
                        borderRadius: 999,
                        bgcolor: 'rgba(126, 211, 255, 0.16)',
                        color: '#bceaff',
                        fontSize: '0.65rem',
                        fontWeight: 900,
                      }}
                    >
                      {notice.category}
                    </Box>

                    <Typography
                      sx={{
                        color: 'rgba(255,255,255,0.55)',
                        fontSize: '0.66rem',
                      }}
                    >
                      {formatNoticeDate(notice.updated_at)}
                    </Typography>
                  </Box>

                  <Typography
                    sx={{
                      color: '#ffffff',
                      fontSize: '0.87rem',
                      fontWeight: 900,
                      lineHeight: 1.5,
                    }}
                  >
                    {notice.title}
                  </Typography>

                  <Typography
                    sx={{
                      mt: 0.55,
                      color: 'rgba(255,255,255,0.7)',
                      fontSize: '0.72rem',
                      lineHeight: 1.65,
                    }}
                  >
                    {notice.content}
                  </Typography>
                </Box>
              ))}
            </Box>

            <Typography
              sx={{
                mt: 3,
                color: 'rgba(255,255,255,0.47)',
                fontSize: '0.66rem',
              }}
            >
              © 2026 WOOKLIM CONSTRUCTION. All rights reserved.
            </Typography>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
