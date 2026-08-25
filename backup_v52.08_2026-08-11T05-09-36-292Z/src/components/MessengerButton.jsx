import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, IconButton, Tooltip } from '@mui/material';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import { supabase } from '../supabaseClient';

const clampUnread = (value) => {
  const count = Number(value || 0);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(Math.trunc(count), 999);
};

export default function MessengerButton({
  userId,
  active = false,
  onOpen,
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const mountedRef = useRef(true);

  const refreshUnread = useCallback(async () => {
    if (!userId) {
      if (mountedRef.current) setUnreadCount(0);
      return;
    }

    try {
      const { data, error } = await supabase.rpc(
        'messenger_get_unread_total',
      );

      if (error) throw error;
      if (mountedRef.current) {
        setUnreadCount(clampUnread(data));
      }
    } catch (error) {
      console.warn('메신저 읽지않음 건수 조회 실패:', error);
    }
  }, [userId]);

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
          event: '*',
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
  }, [refreshUnread, userId]);

  return (
    <Tooltip title="메신저" arrow>
      <IconButton
        color="inherit"
        aria-label={
          unreadCount > 0
            ? `메신저 읽지않은 메시지 ${unreadCount}건`
            : '메신저'
        }
        onClick={onOpen}
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
