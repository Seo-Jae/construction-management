import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import Messenger from './Messenger.jsx';
import { supabase } from '../supabaseClient';

const FONT_STEPS = [0.85, 0.95, 1, 1.1, 1.2, 1.3];

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

      <Box sx={{ flexGrow: 1, minHeight: 0, p: 1.25 }}>
        <Messenger currentUserId={currentUserId} standalone />
      </Box>
    </Box>
  );
}
