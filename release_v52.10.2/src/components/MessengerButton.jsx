import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  IconButton,
  Tooltip,
} from '@mui/material';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import { supabase } from '../supabaseClient';

const ACTIVE_ROOM_STORAGE_PREFIX = 'wooklim-messenger-active-room:';
const OPEN_ROOM_STORAGE_PREFIX = 'wooklim-messenger-open-room:';

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

  const showIncomingNotice = useCallback(
    (row) => {
      if (!row || row.sender_id === userId) return;
      if (isRoomActivelyOpen(userId, row.room_id)) return;

      if (
        typeof window === 'undefined' ||
        !('Notification' in window) ||
        window.Notification.permission !== 'granted'
      ) {
        // v52.10: 사이트 내부 Snackbar는 사용하지 않는다.
        // 권한이 없는 경우에는 읽지않음 배지만 갱신하고,
        // 시스템 알림은 사용자가 브라우저 알림 권한을 허용한 뒤부터 표시한다.
        return;
      }

      const title = `${row.sender_name || '사용자'} · 새 메시지`;
      const body = getMessagePreview(row);

      try {
        const notification = new window.Notification(title, {
          body,
          tag: `wooklim-messenger-${row.room_id || row.id || Date.now()}`,
        });

        notification.onclick = () => {
          try {
            if (row.room_id && userId) {
              window.localStorage.setItem(
                `${OPEN_ROOM_STORAGE_PREFIX}${userId}`,
                JSON.stringify({
                  roomId: row.room_id,
                  at: Date.now(),
                }),
              );
            }
          } catch {
            // 보조 이동정보 저장 실패는 알림 동작을 막지 않는다.
          }

          window.focus();
          onOpen?.();
          notification.close();
        };
      } catch (error) {
        console.warn('브라우저 시스템 메신저 알림 표시 실패:', error);
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
    // v52.10.2: 알림 권한은 메신저 별도창의 명시적인 '알림 사용' 버튼에서 요청한다.
    // 메신저 아이콘 클릭에서는 창 열기만 수행해 브라우저의 조용한 권한 UI와 충돌하지 않도록 한다.
    onOpen?.();
  };

  return (
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
  );
}
