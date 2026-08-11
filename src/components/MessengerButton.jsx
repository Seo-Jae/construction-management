import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  IconButton,
  Snackbar,
  Tooltip,
} from '@mui/material';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import { supabase } from '../supabaseClient';

const ACTIVE_ROOM_STORAGE_PREFIX = 'wooklim-messenger-active-room:';

const clampUnread = (value) => {
  const count = Number(value || 0);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(Math.trunc(count), 999);
};

const getMessagePreview = (row) => {
  if (!row) return '새 메시지가 도착했습니다.';
  if (row.message_type === 'image') return '사진을 보냈습니다.';
  if (row.message_type === 'file') return '파일을 보냈습니다.';
  const text = String(row.body || '').trim();
  return text ? text.slice(0, 120) : '새 메시지가 도착했습니다.';
};

const isRoomActivelyOpen = (userId, roomId) => {
  if (!userId || !roomId) return false;
  try {
    const raw = window.localStorage.getItem(
      `${ACTIVE_ROOM_STORAGE_PREFIX}${userId}`,
    );
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const at = Number(parsed?.at || 0);
    return (
      parsed?.roomId === roomId &&
      Number.isFinite(at) &&
      Date.now() - at < 15000
    );
  } catch {
    return false;
  }
};

export default function MessengerButton({
  userId,
  active = false,
  onOpen,
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notice, setNotice] = useState(null);
  const mountedRef = useRef(true);
  const unreadRef = useRef(0);

  const refreshUnread = useCallback(async () => {
    if (!userId) {
      if (mountedRef.current) setUnreadCount(0);
      unreadRef.current = 0;
      return 0;
    }

    try {
      const { data, error } = await supabase.rpc(
        'messenger_get_unread_total',
      );

      if (error) throw error;
      const nextUnread = clampUnread(data);
      unreadRef.current = nextUnread;
      if (mountedRef.current) {
        setUnreadCount(nextUnread);
      }
      return nextUnread;
    } catch (error) {
      console.warn('메신저 읽지않음 건수 조회 실패:', error);
      return unreadRef.current;
    }
  }, [userId]);

  const requestNotificationPermission = useCallback(() => {
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      window.Notification.permission !== 'default'
    ) {
      return;
    }

    window.Notification.requestPermission().catch((error) => {
      console.warn('메신저 알림 권한 요청 실패:', error);
    });
  }, []);

  const showIncomingNotice = useCallback(
    (row) => {
      if (!row || row.sender_id === userId) return;
      if (isRoomActivelyOpen(userId, row.room_id)) return;

      const title = `${row.sender_name || '사용자'} · 새 메시지`;
      const body = getMessagePreview(row);

      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted' &&
        (document.visibilityState !== 'visible' || !document.hasFocus())
      ) {
        try {
          const notification = new window.Notification(title, {
            body,
            tag: `wooklim-messenger-${row.room_id || row.id || Date.now()}`,
          });
          notification.onclick = () => {
            window.focus();
            onOpen?.();
            notification.close();
          };
          return;
        } catch (error) {
          console.warn('브라우저 메신저 알림 표시 실패:', error);
        }
      }

      if (mountedRef.current) {
        setNotice({ title, body });
      }
    },
    [onOpen, userId],
  );

  useEffect(() => {
    mountedRef.current = true;
    refreshUnread();

    const handleRefresh = () => refreshUnread();
    const handleFocus = () => refreshUnread();

    window.addEventListener('messenger:refresh-unread', handleRefresh);
    window.addEventListener('focus', handleFocus);

    if (!userId) {
      return () => {
        mountedRef.current = false;
        window.removeEventListener('messenger:refresh-unread', handleRefresh);
        window.removeEventListener('focus', handleFocus);
      };
    }

    const channel = supabase
      .channel(`messenger-badge-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messenger_messages',
        },
        async (payload) => {
          const row = payload?.new || null;
          await refreshUnread();
          showIncomingNotice(row);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messenger_messages',
        },
        () => refreshUnread(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messenger_room_members',
          filter: `user_id=eq.${userId}`,
        },
        () => refreshUnread(),
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      window.removeEventListener('messenger:refresh-unread', handleRefresh);
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(channel);
    };
  }, [refreshUnread, showIncomingNotice, userId]);

  const handleClick = () => {
    requestNotificationPermission();
    onOpen?.();
  };

  return (
    <>
      <Tooltip title="메신저" arrow>
        <IconButton
          color="inherit"
          aria-label={
            unreadCount > 0
              ? `메신저 읽지않은 메시지 ${unreadCount}건`
              : '메신저'
          }
          onClick={handleClick}
          sx={{
            width: 38,
            height: 38,
            color: active ? '#ffffff' : '#cbd5e1',
            bgcolor: active ? 'rgba(14,165,233,0.28)' : 'transparent',
            border: active
              ? '1px solid rgba(125,211,252,0.65)'
              : '1px solid transparent',
            '&:hover': {
              color: '#ffffff',
              bgcolor: 'rgba(255,255,255,0.1)',
            },
          }}
        >
          <Badge
            color="error"
            badgeContent={unreadCount}
            max={99}
            overlap="circular"
            invisible={unreadCount <= 0}
            sx={{
              '& .MuiBadge-badge': {
                minWidth: 17,
                height: 17,
                px: 0.45,
                fontSize: '0.6rem',
                fontWeight: 900,
              },
            }}
          >
            <ChatBubbleOutlineRoundedIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={6000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{ maxWidth: 390 }}
      >
        <Alert
          severity="info"
          variant="filled"
          onClose={() => setNotice(null)}
          onClick={() => {
            setNotice(null);
            onOpen?.();
          }}
          sx={{
            width: '100%',
            cursor: 'pointer',
            alignItems: 'center',
            '& .MuiAlert-message': { minWidth: 0 },
          }}
        >
          <strong>{notice?.title || '새 메시지'}</strong>
          <div
            style={{
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {notice?.body || ''}
          </div>
        </Alert>
      </Snackbar>
    </>
  );
}
