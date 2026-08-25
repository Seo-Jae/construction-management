import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import NotificationsOffRoundedIcon from '@mui/icons-material/NotificationsOffRounded';
import Messenger from './Messenger.jsx';
import { supabase } from '../supabaseClient';

const FONT_STEPS = [0.85, 0.95, 1, 1.1, 1.2, 1.3];

const getNotificationPermission = () => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission || 'default';
};

const clampFontScale = (value) => {
  const numeric = Number(value || 1);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(1.3, Math.max(0.85, Math.round(numeric * 100) / 100));
};

export default function MessengerWindow({
  currentUserId,
  userProfile,
}) {
  const storageKey = useMemo(
    () => `wooklim-messenger-font-scale:${currentUserId || 'unknown'}`,
    [currentUserId],
  );
  const [fontScale, setFontScale] = useState(() => {
    try {
      return clampFontScale(window.localStorage.getItem(storageKey));
    } catch {
      return 1;
    }
  });
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(() =>
    getNotificationPermission(),
  );
  const [notificationMessage, setNotificationMessage] = useState('');

  useEffect(() => {
    let active = true;

    const loadPreference = async () => {
      try {
        const { data, error } = await supabase.rpc('messenger_get_preferences');
        if (error) throw error;
        const nextScale = clampFontScale(data?.font_scale ?? 1);
        if (!active) return;
        setFontScale(nextScale);
        window.localStorage.setItem(storageKey, String(nextScale));
      } catch (error) {
        console.warn('메신저 글자크기 설정 조회 실패:', error);
      } finally {
        if (active) setPreferenceLoaded(true);
      }
    };

    loadPreference();
    return () => {
      active = false;
    };
  }, [storageKey]);

  useEffect(() => {
    const previousSize = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = `${16 * fontScale}px`;
    return () => {
      document.documentElement.style.fontSize = previousSize;
    };
  }, [fontScale]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = '욱림건설 메신저';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    const refreshPermission = () => {
      setNotificationPermission(getNotificationPermission());
    };

    window.addEventListener('focus', refreshPermission);
    document.addEventListener('visibilitychange', refreshPermission);
    return () => {
      window.removeEventListener('focus', refreshPermission);
      document.removeEventListener('visibilitychange', refreshPermission);
    };
  }, []);

  const showNotificationTest = () => {
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      window.Notification.permission !== 'granted'
    ) {
      setNotificationMessage('먼저 알림 권한을 허용해주세요.');
      setNotificationPermission(getNotificationPermission());
      return;
    }

    try {
      const notification = new window.Notification('욱림건설 메신저', {
        body: 'Windows 새 메시지 알림이 정상적으로 설정되었습니다.',
        tag: `wooklim-messenger-permission-test-${Date.now()}`,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      setNotificationMessage(
        '테스트 알림을 전송했습니다. Windows 우측 하단에서 확인해주세요.',
      );
    } catch (error) {
      console.warn('메신저 테스트 알림 표시 실패:', error);
      setNotificationMessage(
        '브라우저 권한은 허용되어 있지만 시스템 알림을 표시하지 못했습니다. Windows 알림 설정을 확인해주세요.',
      );
    }
  };

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      setNotificationMessage('현재 브라우저에서는 시스템 알림을 지원하지 않습니다.');
      return;
    }

    if (window.Notification.permission === 'granted') {
      setNotificationPermission('granted');
      showNotificationTest();
      return;
    }

    if (window.Notification.permission === 'denied') {
      setNotificationPermission('denied');
      setNotificationMessage(
        '브라우저에서 알림이 차단되어 있어 자동 재요청할 수 없습니다. 주소창 왼쪽 사이트 정보 → 사이트 설정 → 알림을 허용으로 변경해주세요.',
      );
      return;
    }

    try {
      const result = await window.Notification.requestPermission();
      setNotificationPermission(result);
      if (result === 'granted') {
        setNotificationMessage('알림 권한이 허용되었습니다.');
        window.setTimeout(showNotificationTest, 100);
      } else if (result === 'denied') {
        setNotificationMessage(
          '알림이 차단되었습니다. 다시 사용하려면 주소창 왼쪽 사이트 정보 → 사이트 설정 → 알림을 허용으로 변경해주세요.',
        );
      } else {
        setNotificationMessage(
          '알림 권한 선택이 완료되지 않았습니다. 브라우저 상단의 알림 권한 표시를 확인해주세요.',
        );
      }
    } catch (error) {
      console.warn('메신저 알림 권한 요청 실패:', error);
      setNotificationPermission(getNotificationPermission());
      setNotificationMessage('알림 권한 요청에 실패했습니다. 브라우저 사이트 설정을 확인해주세요.');
    }
  };

  const saveFontScale = async (nextValue) => {
    const nextScale = clampFontScale(nextValue);
    setFontScale(nextScale);
    try {
      window.localStorage.setItem(storageKey, String(nextScale));
    } catch {
      // localStorage가 막힌 환경에서도 현재 창 설정은 유지합니다.
    }

    try {
      const { data, error } = await supabase.rpc('messenger_set_font_scale', {
        p_font_scale: nextScale,
      });
      if (error) throw error;
      const savedScale = clampFontScale(data ?? nextScale);
      setFontScale(savedScale);
      window.localStorage.setItem(storageKey, String(savedScale));
    } catch (error) {
      console.warn('메신저 글자크기 설정 저장 실패:', error);
    }
  };

  const moveFontStep = (direction) => {
    const currentIndex = FONT_STEPS.reduce((bestIndex, value, index) => {
      const bestValue = FONT_STEPS[bestIndex];
      return Math.abs(value - fontScale) < Math.abs(bestValue - fontScale)
        ? index
        : bestIndex;
    }, 0);
    const nextIndex = Math.min(
      FONT_STEPS.length - 1,
      Math.max(0, currentIndex + direction),
    );
    saveFontScale(FONT_STEPS[nextIndex]);
  };

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        minWidth: 720,
        minHeight: 520,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#eef3f8',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          height: 46,
          flexShrink: 0,
          px: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: '#1e293b',
          color: '#ffffff',
          boxShadow: '0 1px 3px rgba(15,23,42,0.24)',
        }}
      >
        <Typography sx={{ fontWeight: 900, fontSize: '0.86rem' }}>
          욱림건설 메신저
        </Typography>
        <Typography sx={{ color: '#94a3b8', fontSize: '0.64rem' }}>
          {userProfile?.manager_name || '사용자'}
          {userProfile?.position_title ? ` · ${userProfile.position_title}` : ''}
        </Typography>

        <Box sx={{ flexGrow: 1 }} />

        <Stack direction="row" spacing={0.35} alignItems="center">
          <Tooltip title="글자 작게">
            <span>
              <Button
                size="small"
                disabled={!preferenceLoaded || fontScale <= FONT_STEPS[0]}
                onClick={() => moveFontStep(-1)}
                sx={{
                  minWidth: 34,
                  px: 0.7,
                  color: '#e2e8f0',
                  fontSize: '0.66rem',
                  fontWeight: 900,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                A-
              </Button>
            </span>
          </Tooltip>
          <Button
            size="small"
            onClick={() => saveFontScale(1)}
            sx={{
              minWidth: 58,
              color: '#e2e8f0',
              fontSize: '0.66rem',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
            }}
          >
            {Math.round(fontScale * 100)}%
          </Button>
          <Tooltip title="글자 크게">
            <span>
              <Button
                size="small"
                disabled={!preferenceLoaded || fontScale >= FONT_STEPS[FONT_STEPS.length - 1]}
                onClick={() => moveFontStep(1)}
                sx={{
                  minWidth: 34,
                  px: 0.7,
                  color: '#e2e8f0',
                  fontSize: '0.66rem',
                  fontWeight: 900,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                A+
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="메신저 창 닫기">
            <IconButton
              size="small"
              onClick={() => window.close()}
              sx={{ ml: 0.4, color: '#e2e8f0' }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {notificationPermission !== 'granted' ? (
        <Alert
          severity={notificationPermission === 'denied' ? 'warning' : 'info'}
          icon={
            notificationPermission === 'denied' ? (
              <NotificationsOffRoundedIcon fontSize="small" />
            ) : (
              <NotificationsActiveRoundedIcon fontSize="small" />
            )
          }
          action={
            notificationPermission === 'default' ? (
              <Button
                size="small"
                variant="contained"
                onClick={requestNotificationPermission}
                sx={{ whiteSpace: 'nowrap', fontWeight: 900 }}
              >
                알림 사용
              </Button>
            ) : notificationPermission === 'denied' ? (
              <Button
                size="small"
                color="warning"
                onClick={() => {
                  setNotificationPermission(getNotificationPermission());
                  setNotificationMessage(
                    '주소창 왼쪽 사이트 정보 → 사이트 설정 → 알림 → 허용으로 변경한 뒤 이 창으로 돌아오세요.',
                  );
                }}
                sx={{ whiteSpace: 'nowrap', fontWeight: 900 }}
              >
                설정 방법
              </Button>
            ) : null
          }
          sx={{
            mx: 1.25,
            mt: 1,
            py: 0.15,
            alignItems: 'center',
            '& .MuiAlert-message': { py: 0.4, fontSize: '0.72rem' },
          }}
        >
          {notificationPermission === 'denied'
            ? 'Windows 새 메시지 알림이 브라우저에서 차단되어 있습니다.'
            : notificationPermission === 'unsupported'
              ? '현재 브라우저에서는 Windows 시스템 알림을 지원하지 않습니다.'
              : '새 메시지를 Windows 우측 하단 알림으로 받으려면 알림 권한을 허용해주세요.'}
          {notificationMessage ? ` ${notificationMessage}` : ''}
        </Alert>
      ) : (
        <Alert
          severity="success"
          icon={<NotificationsActiveRoundedIcon fontSize="small" />}
          action={
            <Button
              size="small"
              color="success"
              onClick={showNotificationTest}
              sx={{ whiteSpace: 'nowrap', fontWeight: 900 }}
            >
              테스트 알림
            </Button>
          }
          sx={{
            mx: 1.25,
            mt: 1,
            py: 0.15,
            alignItems: 'center',
            '& .MuiAlert-message': { py: 0.4, fontSize: '0.72rem' },
          }}
        >
          Windows 새 메시지 알림 사용 중입니다.
          {notificationMessage ? ` ${notificationMessage}` : ''}
        </Alert>
      )}

      <Box sx={{ flexGrow: 1, minHeight: 0, p: 1.25, pt: 1 }}>
        <Messenger currentUserId={currentUserId} standalone />
      </Box>
    </Box>
  );
}
