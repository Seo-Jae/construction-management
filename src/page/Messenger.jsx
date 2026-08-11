import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddCommentRoundedIcon from '@mui/icons-material/AddCommentRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import ManageAccountsRoundedIcon from '@mui/icons-material/ManageAccountsRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { supabase } from '../supabaseClient';
import {
  MESSENGER_MAX_FILE_BYTES,
  MESSENGER_STORAGE_BUCKET,
  buildMessengerStoragePath,
  formatMessengerDateTime,
  formatMessengerFileSize,
  formatMessengerRoomTime,
  prepareMessengerFile,
} from '../utils/messengerFiles';

const MESSAGE_PAGE_SIZE = 100;
const MAX_MULTI_UPLOAD_FILES = 5;
const ACTIVE_ROOM_STORAGE_PREFIX = 'wooklim-messenger-active-room:';

const normalizeText = (value) => String(value || '').trim();

const getInitial = (name) => {
  const text = normalizeText(name);
  return text ? text.slice(0, 1) : '?';
};

const getMessageDateLabel = (value) =>
  formatMessengerDateTime(value).slice(0, 8);

const createAttachmentMap = (rows = [], signedUrlMap = {}) => {
  const map = {};
  rows.forEach((row) => {
    map[row.message_id] = {
      ...row,
      signedUrl: signedUrlMap[row.storage_path] || '',
    };
  });
  return map;
};

function EmptyPane({ title, description }) {
  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: 3,
        textAlign: 'center',
        color: '#64748b',
      }}
    >
      <Box
        sx={{
          width: 54,
          height: 54,
          mb: 1.5,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: '#e2e8f0',
          color: '#64748b',
        }}
      >
        <AddCommentRoundedIcon />
      </Box>
      <Typography sx={{ color: '#334155', fontWeight: 900 }}>
        {title}
      </Typography>
      <Typography sx={{ mt: 0.6, fontSize: '0.74rem', lineHeight: 1.6 }}>
        {description}
      </Typography>
    </Box>
  );
}

function UserSecondaryText({ user }) {
  const firstLine = [user.position_title, user.role]
    .map(normalizeText)
    .filter((value) => value && value !== '-')
    .join(' · ');
  const secondLine = [user.company, user.project_name]
    .map(normalizeText)
    .filter((value) => value && value !== '-')
    .join(' · ');

  return (
    <Box component="span" sx={{ display: 'block' }}>
      {firstLine && (
        <Box component="span" sx={{ display: 'block', fontSize: '0.7rem' }}>
          {firstLine}
        </Box>
      )}
      {secondLine && (
        <Box
          component="span"
          sx={{ display: 'block', mt: 0.15, color: '#94a3b8', fontSize: '0.66rem' }}
        >
          {secondLine}
        </Box>
      )}
    </Box>
  );
}

export default function Messenger({ currentUserId, standalone = false }) {
  const theme = useTheme();
  const compactMode = useMediaQuery(theme.breakpoints.down('md'));
  const showInfoColumn = useMediaQuery(theme.breakpoints.up('lg'));

  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const selectedRoomIdRef = useRef('');

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [attachmentsByMessage, setAttachmentsByMessage] = useState({});
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');

  const [messageText, setMessageText] = useState('');
  const [pendingPasteFiles, setPendingPasteFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState('');

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatMode, setNewChatMode] = useState('direct');
  const [newChatSearch, setNewChatSearch] = useState('');
  const [newChatSelectedIds, setNewChatSelectedIds] = useState([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newChatCreating, setNewChatCreating] = useState(false);

  const [manageOpen, setManageOpen] = useState(false);
  const [manageRoomName, setManageRoomName] = useState('');
  const [manageSaving, setManageSaving] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addMemberIds, setAddMemberIds] = useState([]);
  const [addMemberSaving, setAddMemberSaving] = useState(false);
  const [roomInfoOpen, setRoomInfoOpen] = useState(false);
  const [leavingRoom, setLeavingRoom] = useState(false);
  const [leaveTransferOpen, setLeaveTransferOpen] = useState(false);
  const [leaveTransferUserId, setLeaveTransferUserId] = useState('');
  const [unreadMessageId, setUnreadMessageId] = useState('');

  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [toast, setToast] = useState(null);

  const messageScrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);
  const pendingPasteFilesRef = useRef([]);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.room_id === selectedRoomId) || null,
    [rooms, selectedRoomId],
  );

  const filteredRooms = useMemo(() => {
    const query = normalizeText(roomSearch).toLocaleLowerCase('ko');
    if (!query) return rooms;

    return rooms.filter((room) =>
      [room.display_name, room.last_message_preview]
        .map((value) => String(value || '').toLocaleLowerCase('ko'))
        .some((value) => value.includes(query)),
    );
  }, [roomSearch, rooms]);

  const filteredNewChatUsers = useMemo(() => {
    const query = normalizeText(newChatSearch).toLocaleLowerCase('ko');
    if (!query) return users;

    return users.filter((user) =>
      [
        user.manager_name,
        user.position_title,
        user.role,
        user.project_name,
        user.company,
      ]
        .map((value) => String(value || '').toLocaleLowerCase('ko'))
        .some((value) => value.includes(query)),
    );
  }, [newChatSearch, users]);

  const currentMemberIds = useMemo(
    () => new Set(members.map((member) => member.user_id)),
    [members],
  );

  const getUnreadMembersForMessage = useCallback(
    (message) => {
      if (!message?.created_at || message.sender_id !== currentUserId) {
        return [];
      }

      const messageTime = new Date(message.created_at).getTime();
      if (!Number.isFinite(messageTime)) return [];

      return members
        .filter((member) => !member.is_current_user)
        // 메시지가 생성된 뒤에 새로 들어온 참여자는 과거 메시지의 미확인 인원으로 잡지 않는다.
        .filter((member) => {
          if (!member.joined_at) return true;
          const joinedTime = new Date(member.joined_at).getTime();
          return !Number.isFinite(joinedTime) || joinedTime <= messageTime;
        })
        .filter((member) => {
          if (!member.last_read_at) return true;
          const readTime = new Date(member.last_read_at).getTime();
          return !Number.isFinite(readTime) || readTime < messageTime;
        });
    },
    [currentUserId, members],
  );

  const getOwnMessageReadStatus = useCallback(
    (message) => {
      if (!message?.created_at || message.sender_id !== currentUserId) {
        return '';
      }

      const peerMembers = members.filter((member) => !member.is_current_user);
      if (peerMembers.length === 0) return '안읽음';

      // 그룹방도 1명이라도 읽지 않았으면 안읽음으로 유지한다.
      return getUnreadMembersForMessage(message).length === 0 ? '읽음' : '안읽음';
    },
    [currentUserId, getUnreadMembersForMessage, members],
  );

  const availableAddMembers = useMemo(() => {
    const query = normalizeText(addMemberSearch).toLocaleLowerCase('ko');

    return users.filter((user) => {
      if (currentMemberIds.has(user.user_id)) return false;
      if (!query) return true;

      return [
        user.manager_name,
        user.position_title,
        user.role,
        user.project_name,
        user.company,
      ]
        .map((value) => String(value || '').toLocaleLowerCase('ko'))
        .some((value) => value.includes(query));
    });
  }, [addMemberSearch, currentMemberIds, users]);

  const showToast = useCallback((text, severity = 'info') => {
    setToast({ text, severity });
  }, []);

  const notifyUnreadRefresh = useCallback(() => {
    window.dispatchEvent(new Event('messenger:refresh-unread'));
  }, []);

  const scrollToBottom = useCallback((behavior = 'auto') => {
    window.requestAnimationFrame(() => {
      const element = messageScrollRef.current;
      if (!element) return;
      element.scrollTo({
        top: element.scrollHeight,
        behavior,
      });
    });
  }, []);

  const loadUsers = useCallback(async () => {
    if (!currentUserId) return;

    setUsersLoading(true);
    setUsersError('');

    try {
      const { data, error } = await supabase.rpc('messenger_list_users');
      if (error) throw error;
      const nextUsers = Array.isArray(data) ? [...data] : [];
      nextUsers.sort((first, second) =>
        String(first?.manager_name || '').localeCompare(
          String(second?.manager_name || ''),
          'ko',
        ),
      );
      setUsers(nextUsers);
    } catch (error) {
      console.error('메신저 사용자 목록 조회 오류:', error);
      setUsers([]);
      setUsersError(
        '사용자 목록을 불러오지 못했습니다. 메신저 SQL 적용 여부를 확인해주세요.',
      );
    } finally {
      setUsersLoading(false);
    }
  }, [currentUserId]);

  const loadRooms = useCallback(async () => {
    if (!currentUserId) {
      setRooms([]);
      setRoomsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('messenger_list_rooms');
      if (error) throw error;

      const nextRooms = Array.isArray(data) ? data : [];
      setRooms(nextRooms);
      setRoomsError('');

      setSelectedRoomId((previousRoomId) => {
        if (!previousRoomId) return '';
        return nextRooms.some((room) => room.room_id === previousRoomId)
          ? previousRoomId
          : '';
      });
    } catch (error) {
      console.error('메신저 대화방 목록 조회 오류:', error);
      setRoomsError(
        '메신저 데이터를 불러오지 못했습니다. Supabase에서 메신저 v1.2 SQL을 먼저 실행해주세요.',
      );
    } finally {
      setRoomsLoading(false);
      notifyUnreadRefresh();
    }
  }, [currentUserId, notifyUnreadRefresh]);

  const loadMembers = useCallback(async (roomId, options = {}) => {
    if (!roomId) {
      setMembers([]);
      return;
    }

    const silent = options.silent === true;
    if (!silent) setMembersLoading(true);
    try {
      const { data, error } = await supabase.rpc(
        'messenger_get_room_members',
        { p_room_id: roomId },
      );
      if (error) throw error;
      setMembers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('대화 참여자 조회 오류:', error);
      setMembers([]);
    } finally {
      if (!silent) setMembersLoading(false);
    }
  }, []);

  const createSignedUrlMap = useCallback(async (attachmentRows) => {
    const paths = Array.from(
      new Set(
        attachmentRows
          .map((attachment) => attachment.storage_path)
          .filter(Boolean),
      ),
    );

    if (paths.length === 0) return {};

    try {
      const { data, error } = await supabase.storage
        .from(MESSENGER_STORAGE_BUCKET)
        .createSignedUrls(paths, 60 * 60);

      if (error) throw error;

      const map = {};
      (data || []).forEach((row, index) => {
        const path = row.path || paths[index];
        if (path && row.signedUrl) {
          map[path] = row.signedUrl;
        }
      });
      return map;
    } catch (error) {
      console.warn('메신저 첨부파일 미리보기 URL 생성 실패:', error);
      return {};
    }
  }, []);

  const fetchMessagePage = useCallback(
    async ({ roomId, before = '', prepend = false, silent = false }) => {
      if (!roomId) return;

      if (prepend) setOlderLoading(true);
      else if (!silent) setMessagesLoading(true);

      try {
        let query = supabase
          .from('messenger_messages')
          .select(
            'id, room_id, sender_id, sender_name, sender_position, sender_project_name, message_type, body, created_at, edited_at, deleted_at',
          )
          .eq('room_id', roomId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(MESSAGE_PAGE_SIZE);

        if (before) {
          query = query.lt('created_at', before);
        }

        const { data, error } = await query;
        if (error) throw error;

        const descendingRows = Array.isArray(data) ? data : [];
        const pageRows = [...descendingRows].reverse();
        const messageIds = pageRows.map((row) => row.id);

        let attachmentRows = [];
        if (messageIds.length > 0) {
          const { data: attachmentData, error: attachmentError } = await supabase
            .from('messenger_attachments')
            .select(
              'id, message_id, room_id, storage_path, file_name, mime_type, file_size, image_width, image_height, created_at',
            )
            .in('message_id', messageIds);

          if (attachmentError) throw attachmentError;
          attachmentRows = Array.isArray(attachmentData) ? attachmentData : [];
        }

        const signedUrlMap = await createSignedUrlMap(attachmentRows);
        const pageAttachmentMap = createAttachmentMap(
          attachmentRows,
          signedUrlMap,
        );

        if (prepend) {
          setMessages((previous) => {
            const existingIds = new Set(previous.map((message) => message.id));
            return [
              ...pageRows.filter((message) => !existingIds.has(message.id)),
              ...previous,
            ];
          });
          setAttachmentsByMessage((previous) => ({
            ...pageAttachmentMap,
            ...previous,
          }));
        } else {
          setMessages(pageRows);
          setAttachmentsByMessage(pageAttachmentMap);
          scrollToBottom('auto');
        }

        setHasOlderMessages(descendingRows.length === MESSAGE_PAGE_SIZE);
      } catch (error) {
        console.error('메신저 메시지 조회 오류:', error);
        if (!prepend && !silent) {
          setMessages([]);
          setAttachmentsByMessage({});
          showToast('메시지를 불러오지 못했습니다.', 'error');
        }
      } finally {
        if (prepend) setOlderLoading(false);
        else if (!silent) setMessagesLoading(false);
      }
    },
    [createSignedUrlMap, scrollToBottom, showToast],
  );

  const markRoomRead = useCallback(
    async (roomId) => {
      if (!roomId || !currentUserId) return;

      try {
        const { error } = await supabase.rpc('messenger_mark_room_read', {
          p_room_id: roomId,
        });
        if (error) throw error;
        notifyUnreadRefresh();
      } catch (error) {
        console.warn('메신저 읽음 처리 실패:', error);
      }
    },
    [currentUserId, notifyUnreadRefresh],
  );

  const refreshSelectedRoom = useCallback(
    async (roomId, options = {}) => {
      if (!roomId) return;

      const shouldRead = options.markRead !== false;
      const silent = options.silent === true;
      await Promise.all([
        loadMembers(roomId),
        fetchMessagePage({ roomId, silent }),
      ]);

      if (shouldRead && document.visibilityState === 'visible') {
        await markRoomRead(roomId);
        await loadRooms();
      }
    },
    [fetchMessagePage, loadMembers, loadRooms, markRoomRead],
  );

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    const storageKey = `${ACTIVE_ROOM_STORAGE_PREFIX}${currentUserId}`;

    const publishActiveRoom = () => {
      try {
        if (
          selectedRoomId &&
          document.visibilityState === 'visible' &&
          document.hasFocus()
        ) {
          window.localStorage.setItem(
            storageKey,
            JSON.stringify({
              roomId: selectedRoomId,
              at: Date.now(),
            }),
          );
          return;
        }

        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!selectedRoomId || parsed?.roomId === selectedRoomId) {
          window.localStorage.removeItem(storageKey);
        }
      } catch {
        // 알림 억제용 보조정보이므로 저장 실패는 메신저 동작에 영향을 주지 않습니다.
      }
    };

    publishActiveRoom();
    const timer = window.setInterval(publishActiveRoom, 5000);
    window.addEventListener('focus', publishActiveRoom);
    window.addEventListener('blur', publishActiveRoom);
    document.addEventListener('visibilitychange', publishActiveRoom);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', publishActiveRoom);
      window.removeEventListener('blur', publishActiveRoom);
      document.removeEventListener('visibilitychange', publishActiveRoom);
      try {
        const raw = window.localStorage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!parsed || parsed.roomId === selectedRoomId) {
          window.localStorage.removeItem(storageKey);
        }
      } catch {
        // noop
      }
    };
  }, [currentUserId, selectedRoomId]);

  useEffect(() => {
    setRoomsLoading(true);
    loadRooms();
    loadUsers();
  }, [loadRooms, loadUsers]);

  useEffect(() => {
    if (!selectedRoomId) {
      setMembers([]);
      setMessages([]);
      setAttachmentsByMessage({});
      setHasOlderMessages(false);
      return;
    }

    refreshSelectedRoom(selectedRoomId);
  }, [refreshSelectedRoom, selectedRoomId]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    // v52.08.1 안정화:
    // last_read_at 갱신은 messenger_room_members UPDATE를 발생시킨다.
    // 이 UPDATE를 다시 감지해 markRoomRead()를 호출하면 Realtime 갱신 루프가 생기므로
    // 참여자 테이블은 실제 구성 변경(INSERT/DELETE)만 구독한다.
    const refreshForMessageChange = async (payload) => {
      const changedRoomId =
        payload?.new?.room_id || payload?.old?.room_id || '';

      await loadRooms();

      if (
        changedRoomId &&
        changedRoomId === selectedRoomIdRef.current
      ) {
        // 기존 메시지를 지우거나 로딩 화면으로 바꾸지 않고 조용히 최신화한다.
        await fetchMessagePage({ roomId: changedRoomId, silent: true });

        if (document.visibilityState === 'visible') {
          await markRoomRead(changedRoomId);
          await loadRooms();
        }
      }
    };

    const refreshForMembershipChange = async (payload) => {
      const changedRoomId =
        payload?.new?.room_id || payload?.old?.room_id || '';

      await loadRooms();

      if (
        changedRoomId &&
        changedRoomId === selectedRoomIdRef.current
      ) {
        await loadMembers(changedRoomId);
      }
    };

    const refreshForReadStateChange = async (payload) => {
      const changedRoomId =
        payload?.new?.room_id || payload?.old?.room_id || '';

      if (
        changedRoomId &&
        changedRoomId === selectedRoomIdRef.current
      ) {
        // 읽음 시간 UPDATE는 조회만 다시 하고 어떠한 쓰기 RPC도 호출하지 않는다.
        // 따라서 v52.08의 last_read_at Realtime 반복 루프가 다시 발생하지 않는다.
        // 우측 참여자 영역도 로딩 화면으로 바꾸지 않고 조용히 읽음 상태만 갱신한다.
        await loadMembers(changedRoomId, { silent: true });
      }
    };

    const refreshForRoomUpdate = async (payload) => {
      const changedRoomId =
        payload?.new?.id || payload?.old?.id || '';

      await loadRooms();

      if (
        changedRoomId &&
        changedRoomId === selectedRoomIdRef.current
      ) {
        await loadMembers(changedRoomId, { silent: true });
      }
    };

    const channel = supabase
      .channel(`messenger-page-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messenger_messages',
        },
        refreshForMessageChange,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messenger_room_members',
        },
        refreshForMembershipChange,
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messenger_room_members',
        },
        refreshForMembershipChange,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messenger_room_members',
        },
        refreshForReadStateChange,
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messenger_rooms',
        },
        refreshForRoomUpdate,
      )
      .subscribe();

    const timer = window.setInterval(() => {
      loadRooms();
    }, 60 * 1000);

    const handleFocus = async () => {
      await loadRooms();
      const roomId = selectedRoomIdRef.current;
      if (roomId) {
        await refreshSelectedRoom(roomId, { silent: true });
      }
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(channel);
    };
  }, [
    currentUserId,
    fetchMessagePage,
    loadMembers,
    loadRooms,
    markRoomRead,
    refreshSelectedRoom,
  ]);

  const handleSelectRoom = (roomId) => {
    if (roomId !== selectedRoomId) {
      setPendingPasteFiles((previous) => {
        previous.forEach((item) => {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
        return [];
      });
    }
    setSelectedRoomId(roomId);
    setRoomInfoOpen(false);
    setUnreadMessageId('');
  };

  const handleBackToRooms = () => {
    setPendingPasteFiles((previous) => {
      previous.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
    setSelectedRoomId('');
    setRoomInfoOpen(false);
    setUnreadMessageId('');
  };

  const focusComposer = useCallback(() => {
    window.requestAnimationFrame(() => {
      messageInputRef.current?.focus?.();
    });
  }, []);

  useEffect(() => {
    if (selectedRoomId) {
      focusComposer();
    }
  }, [focusComposer, selectedRoomId]);

  const clearPendingPasteFiles = useCallback(() => {
    setPendingPasteFiles((previous) => {
      previous.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
      return [];
    });
  }, []);

  useEffect(() => {
    pendingPasteFilesRef.current = pendingPasteFiles;
  }, [pendingPasteFiles]);

  useEffect(
    () => () => {
      pendingPasteFilesRef.current.forEach((item) => {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    },
    [],
  );

  const uploadFiles = useCallback(
    async (selectedFiles, { showSuccessToast = true } = {}) => {
      const files = Array.from(selectedFiles || []).filter(Boolean);
      if (!selectedRoomId || files.length === 0 || uploading) return 0;

      if (files.length > MAX_MULTI_UPLOAD_FILES) {
        showToast(
          `한 번에 최대 ${MAX_MULTI_UPLOAD_FILES}개 파일까지 전송할 수 있습니다.`,
          'warning',
        );
        return 0;
      }

      setUploading(true);
      let successCount = 0;

      try {
        for (let index = 0; index < files.length; index += 1) {
          const originalFile = files[index];
          setUploadLabel(
            `${index + 1}/${files.length} ${originalFile.name || '이미지'} 처리 중`,
          );

          const prepared = await prepareMessengerFile(originalFile);
          const file = prepared.file;

          if (file.size > MESSENGER_MAX_FILE_BYTES) {
            throw new Error(
              `${originalFile.name || '파일'}: 파일은 10MB 이하만 전송할 수 있습니다.`,
            );
          }

          const storagePath = buildMessengerStoragePath({
            roomId: selectedRoomId,
            userId: currentUserId,
            fileName: file.name,
          });

          const { error: uploadError } = await supabase.storage
            .from(MESSENGER_STORAGE_BUCKET)
            .upload(storagePath, file, {
              cacheControl: '3600',
              contentType: file.type || 'application/octet-stream',
              upsert: false,
            });

          if (uploadError) throw uploadError;

          const { error: messageError } = await supabase.rpc(
            'messenger_send_attachment_message',
            {
              p_room_id: selectedRoomId,
              p_message_type: prepared.messageType,
              p_storage_path: storagePath,
              p_file_name: file.name,
              p_mime_type: file.type || 'application/octet-stream',
              p_file_size: file.size,
              p_image_width: prepared.imageWidth,
              p_image_height: prepared.imageHeight,
            },
          );

          if (messageError) {
            await supabase.storage
              .from(MESSENGER_STORAGE_BUCKET)
              .remove([storagePath]);
            throw messageError;
          }

          successCount += 1;
        }

        await fetchMessagePage({ roomId: selectedRoomId, silent: true });
        await loadRooms();
        scrollToBottom('smooth');

        if (showSuccessToast && successCount > 0) {
          showToast(`${successCount}개 파일을 전송했습니다.`, 'success');
        }
        return successCount;
      } catch (error) {
        console.error('메신저 파일 전송 오류:', error);
        showToast(error?.message || '파일 전송에 실패했습니다.', 'error');
        return successCount;
      } finally {
        setUploading(false);
        setUploadLabel('');
        focusComposer();
      }
    },
    [
      currentUserId,
      fetchMessagePage,
      focusComposer,
      loadRooms,
      scrollToBottom,
      selectedRoomId,
      showToast,
      uploading,
    ],
  );

  const handleSendText = async () => {
    const body = normalizeText(messageText);
    const pastedFiles = pendingPasteFiles.map((item) => item.file);

    if (
      !selectedRoomId ||
      sending ||
      uploading ||
      (!body && pastedFiles.length === 0)
    ) {
      return;
    }

    if (body.length > 4000) {
      showToast('메시지는 4,000자 이하로 입력해주세요.', 'warning');
      focusComposer();
      return;
    }

    setSending(true);
    let textSent = false;

    try {
      if (body) {
        const { error } = await supabase.rpc('messenger_send_text_message', {
          p_room_id: selectedRoomId,
          p_body: body,
        });
        if (error) throw error;
        textSent = true;
        setMessageText('');
      }

      if (pastedFiles.length > 0) {
        const uploadedCount = await uploadFiles(pastedFiles, {
          showSuccessToast: false,
        });

        if (uploadedCount === pastedFiles.length) {
          clearPendingPasteFiles();
        }
      }

      if (textSent && pastedFiles.length === 0) {
        await fetchMessagePage({ roomId: selectedRoomId, silent: true });
        await loadRooms();
        scrollToBottom('smooth');
      }
    } catch (error) {
      console.error('메시지 전송 오류:', error);
      showToast(error?.message || '메시지 전송에 실패했습니다.', 'error');
    } finally {
      setSending(false);
      focusComposer();
    }
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendText();
    }
  };

  const handleComposerPaste = (event) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageFiles = items
      .filter(
        (item) =>
          item.kind === 'file' &&
          String(item.type || '').toLowerCase().startsWith('image/'),
      )
      .map((item, index) => {
        const source = item.getAsFile();
        if (!source) return null;
        const extension =
          String(source.type || '').toLowerCase() === 'image/jpeg'
            ? 'jpg'
            : String(source.type || '').toLowerCase() === 'image/webp'
              ? 'webp'
              : 'png';

        return new File(
          [source],
          `clipboard-${Date.now()}-${index + 1}.${extension}`,
          {
            type: source.type || `image/${extension}`,
            lastModified: Date.now(),
          },
        );
      })
      .filter(Boolean);

    if (imageFiles.length === 0) return;

    event.preventDefault();

    setPendingPasteFiles((previous) => {
      const available = Math.max(0, MAX_MULTI_UPLOAD_FILES - previous.length);
      const accepted = imageFiles.slice(0, available);

      if (accepted.length < imageFiles.length) {
        showToast(
          `붙여넣기 이미지는 한 번에 최대 ${MAX_MULTI_UPLOAD_FILES}개까지 준비할 수 있습니다.`,
          'warning',
        );
      }

      return [
        ...previous,
        ...accepted.map((file) => ({
          id:
            globalThis.crypto?.randomUUID?.() ||
            `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ];
    });
  };

  const handleRemovePendingPasteFile = (itemId) => {
    setPendingPasteFiles((previous) => {
      const target = previous.find((item) => item.id === itemId);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return previous.filter((item) => item.id !== itemId);
    });
    focusComposer();
  };

  const handleFilesSelected = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    await uploadFiles(selectedFiles);
  };

  const handleLoadOlder = async () => {
    if (!selectedRoomId || olderLoading || !hasOlderMessages || messages.length === 0) {
      return;
    }

    const scrollElement = messageScrollRef.current;
    const previousHeight = scrollElement?.scrollHeight || 0;
    const oldestCreatedAt = messages[0]?.created_at || '';

    await fetchMessagePage({
      roomId: selectedRoomId,
      before: oldestCreatedAt,
      prepend: true,
    });

    window.requestAnimationFrame(() => {
      const element = messageScrollRef.current;
      if (!element) return;
      const nextHeight = element.scrollHeight;
      element.scrollTop += Math.max(0, nextHeight - previousHeight);
    });
  };

  const handleDeleteMessage = async (message) => {
    if (!message?.id || message.sender_id !== currentUserId || message.deleted_at) {
      return;
    }

    if (!window.confirm('이 메시지를 삭제할까요?')) return;

    try {
      const { data, error } = await supabase.rpc('messenger_delete_message', {
        p_message_id: message.id,
      });
      if (error) throw error;

      const storagePaths = (data || [])
        .map((row) => row.storage_path)
        .filter(Boolean);

      if (storagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from(MESSENGER_STORAGE_BUCKET)
          .remove(storagePaths);
        if (storageError) {
          console.warn('삭제 메시지 첨부파일 Storage 정리 실패:', storageError);
        }
      }

      await fetchMessagePage({ roomId: selectedRoomId, silent: true });
      await loadRooms();
      showToast('메시지를 삭제했습니다.', 'success');
    } catch (error) {
      console.error('메시지 삭제 오류:', error);
      showToast(error?.message || '메시지 삭제에 실패했습니다.', 'error');
    }
  };

  const handleDownloadAttachment = async (attachment) => {
    if (!attachment?.storage_path) return;

    try {
      const { data, error } = await supabase.storage
        .from(MESSENGER_STORAGE_BUCKET)
        .download(attachment.storage_path);
      if (error) throw error;

      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.file_name || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('첨부파일 다운로드 오류:', error);
      showToast('파일 다운로드에 실패했습니다.', 'error');
    }
  };

  const handlePreviewImage = async (attachment) => {
    if (!attachment?.storage_path) return;

    let signedUrl = attachment.signedUrl || '';
    if (!signedUrl) {
      try {
        const { data, error } = await supabase.storage
          .from(MESSENGER_STORAGE_BUCKET)
          .createSignedUrl(attachment.storage_path, 60 * 30);
        if (error) throw error;
        signedUrl = data?.signedUrl || '';
      } catch (error) {
        console.error('이미지 미리보기 URL 생성 오류:', error);
      }
    }

    if (!signedUrl) {
      showToast('이미지를 열지 못했습니다.', 'error');
      return;
    }

    setPreviewAttachment({ ...attachment, signedUrl });
  };

  const resetNewChatDialog = () => {
    setNewChatMode('direct');
    setNewChatSearch('');
    setNewChatSelectedIds([]);
    setNewGroupName('');
  };

  const handleOpenNewChat = () => {
    resetNewChatDialog();
    setNewChatOpen(true);
    loadUsers();
  };

  const toggleNewChatUser = (userId) => {
    if (newChatMode === 'direct') {
      setNewChatSelectedIds([userId]);
      return;
    }

    setNewChatSelectedIds((previous) =>
      previous.includes(userId)
        ? previous.filter((id) => id !== userId)
        : [...previous, userId],
    );
  };

  const handleCreateConversation = async () => {
    if (newChatCreating) return;

    if (newChatMode === 'direct' && newChatSelectedIds.length !== 1) {
      showToast('1:1 대화 상대를 한 명 선택해주세요.', 'warning');
      return;
    }

    if (newChatMode === 'group') {
      if (!normalizeText(newGroupName)) {
        showToast('그룹방 이름을 입력해주세요.', 'warning');
        return;
      }
      if (newChatSelectedIds.length < 1) {
        showToast('그룹 참여자를 한 명 이상 선택해주세요.', 'warning');
        return;
      }
    }

    setNewChatCreating(true);
    try {
      let response;

      if (newChatMode === 'direct') {
        response = await supabase.rpc('messenger_create_direct_room', {
          p_peer_user_id: newChatSelectedIds[0],
        });
      } else {
        response = await supabase.rpc('messenger_create_group_room', {
          p_room_name: normalizeText(newGroupName),
          p_member_ids: newChatSelectedIds,
        });
      }

      if (response.error) throw response.error;

      const roomId = response.data;
      setNewChatOpen(false);
      resetNewChatDialog();
      await loadRooms();
      setSelectedRoomId(roomId || '');
      showToast('대화방을 열었습니다.', 'success');
    } catch (error) {
      console.error('대화방 생성 오류:', error);
      showToast(error?.message || '대화방 생성에 실패했습니다.', 'error');
    } finally {
      setNewChatCreating(false);
    }
  };

  const handleOpenManage = () => {
    if (!selectedRoom || selectedRoom.room_type !== 'group') return;
    setManageRoomName(selectedRoom.room_name || selectedRoom.display_name || '');
    setManageOpen(true);
  };

  const handleRenameGroup = async () => {
    if (!selectedRoom?.is_owner || manageSaving) return;

    const roomName = normalizeText(manageRoomName);
    if (!roomName) {
      showToast('그룹방 이름을 입력해주세요.', 'warning');
      return;
    }

    setManageSaving(true);
    try {
      const { data, error } = await supabase.rpc('messenger_rename_group_room', {
        p_room_id: selectedRoom.room_id,
        p_room_name: roomName,
      });
      if (error) throw error;
      if (!data) throw new Error('그룹방 이름을 변경할 권한이 없습니다.');

      await loadRooms();
      showToast('그룹방 이름을 변경했습니다.', 'success');
    } catch (error) {
      console.error('그룹방 이름 변경 오류:', error);
      showToast(error?.message || '그룹방 이름 변경에 실패했습니다.', 'error');
    } finally {
      setManageSaving(false);
    }
  };

  const handleRemoveMember = async (member) => {
    if (!selectedRoom?.is_owner || member?.is_owner || !member?.user_id) return;

    if (!window.confirm(`${member.manager_name}님을 그룹에서 제외할까요?`)) return;

    try {
      const { data, error } = await supabase.rpc('messenger_remove_group_member', {
        p_room_id: selectedRoom.room_id,
        p_member_user_id: member.user_id,
      });
      if (error) throw error;
      if (!data) throw new Error('참여자 제외 대상이 없습니다.');

      await Promise.all([
        loadMembers(selectedRoom.room_id),
        loadRooms(),
      ]);
      showToast('참여자를 그룹에서 제외했습니다.', 'success');
    } catch (error) {
      console.error('그룹 참여자 제외 오류:', error);
      showToast(error?.message || '참여자 제외에 실패했습니다.', 'error');
    }
  };

  const handleOpenAddMembers = () => {
    setAddMemberSearch('');
    setAddMemberIds([]);
    setAddMembersOpen(true);
    loadUsers();
  };

  const toggleAddMember = (userId) => {
    setAddMemberIds((previous) =>
      previous.includes(userId)
        ? previous.filter((id) => id !== userId)
        : [...previous, userId],
    );
  };

  const handleAddMembers = async () => {
    if (!selectedRoom?.is_owner || addMemberSaving) return;
    if (addMemberIds.length === 0) {
      showToast('추가할 참여자를 선택해주세요.', 'warning');
      return;
    }

    setAddMemberSaving(true);
    try {
      const { data, error } = await supabase.rpc('messenger_add_group_members', {
        p_room_id: selectedRoom.room_id,
        p_member_ids: addMemberIds,
      });
      if (error) throw error;

      setAddMembersOpen(false);
      setAddMemberIds([]);
      await Promise.all([
        loadMembers(selectedRoom.room_id),
        loadRooms(),
      ]);
      showToast(`${Number(data || 0)}명을 그룹에 추가했습니다.`, 'success');
    } catch (error) {
      console.error('그룹 참여자 추가 오류:', error);
      showToast(error?.message || '참여자 추가에 실패했습니다.', 'error');
    } finally {
      setAddMemberSaving(false);
    }
  };

  const handleTransferOwner = async (member) => {
    if (
      !selectedRoom?.is_owner ||
      selectedRoom.room_type !== 'group' ||
      !member?.user_id ||
      member.is_current_user
    ) {
      return;
    }

    if (
      !window.confirm(
        `${member.manager_name}님에게 방장 권한을 넘길까요?\n권한을 넘긴 뒤에도 대화방에는 계속 참여합니다.`,
      )
    ) {
      return;
    }

    try {
      const { data, error } = await supabase.rpc('messenger_transfer_owner', {
        p_room_id: selectedRoom.room_id,
        p_new_owner_id: member.user_id,
      });
      if (error) throw error;
      if (!data) throw new Error('방장 권한 변경이 완료되지 않았습니다.');

      await Promise.all([
        loadMembers(selectedRoom.room_id),
        loadRooms(),
      ]);
      showToast(`${member.manager_name}님에게 방장 권한을 넘겼습니다.`, 'success');
    } catch (error) {
      console.error('방장 권한 위임 오류:', error);
      showToast(error?.message || '방장 권한을 넘기지 못했습니다.', 'error');
    }
  };

  const resetAfterLeavingRoom = async () => {
    setSelectedRoomId('');
    selectedRoomIdRef.current = '';
    setMembers([]);
    setMessages([]);
    setAttachmentsByMessage({});
    setHasOlderMessages(false);
    setRoomInfoOpen(false);
    setUnreadMessageId('');
    setManageOpen(false);
    setAddMembersOpen(false);
    setLeaveTransferOpen(false);
    setLeaveTransferUserId('');
    clearPendingPasteFiles();

    await loadRooms();
    notifyUnreadRefresh();
  };

  const performLeaveRoom = async (transferOwnerId = null) => {
    if (!selectedRoomId || !selectedRoom || leavingRoom) return;

    setLeavingRoom(true);
    try {
      const { data, error } = await supabase.rpc('messenger_leave_room', {
        p_room_id: selectedRoomId,
        p_transfer_owner_id: transferOwnerId || null,
      });

      if (error) throw error;
      if (!data?.left) {
        throw new Error('대화방 나가기 처리가 완료되지 않았습니다.');
      }

      const transferredName = normalizeText(data?.transferred_to_name);
      await resetAfterLeavingRoom();

      showToast(
        transferredName
          ? `${transferredName}님에게 방장 권한을 넘기고 대화방에서 나갔습니다.`
          : '대화방에서 나갔습니다.',
        'success',
      );
    } catch (error) {
      console.error('대화방 나가기 오류:', error);
      showToast(error?.message || '대화방에서 나가지 못했습니다.', 'error');
    } finally {
      setLeavingRoom(false);
    }
  };

  const handleLeaveRoom = () => {
    if (!selectedRoomId || !selectedRoom || leavingRoom) return;

    if (
      selectedRoom.room_type === 'group' &&
      selectedRoom.is_owner &&
      members.filter((member) => !member.is_current_user).length > 0
    ) {
      setLeaveTransferUserId('');
      setLeaveTransferOpen(true);
      return;
    }

    if (
      !window.confirm(
        `“${selectedRoom.display_name || '대화방'}”에서 나갈까요?`,
      )
    ) {
      return;
    }

    performLeaveRoom(null);
  };

  const handleConfirmLeaveTransfer = () => {
    const target = members.find(
      (member) => member.user_id === leaveTransferUserId,
    );

    if (!target) {
      showToast('방장 권한을 넘길 참여자를 선택해주세요.', 'warning');
      return;
    }

    if (
      !window.confirm(
        `${target.manager_name}님에게 방장 권한을 넘기고 대화방에서 나갈까요?`,
      )
    ) {
      return;
    }

    performLeaveRoom(target.user_id);
  };

  const renderMemberList = ({ manageable = false } = {}) => (
    <List dense disablePadding sx={{ mt: 0.5 }}>
      {members.map((member) => (
        <ListItem
          key={member.user_id}
          disableGutters
          secondaryAction={
            manageable &&
            selectedRoom?.is_owner &&
            !member.is_owner ? (
              <Stack direction="row" spacing={0.35} alignItems="center">
                <Button
                  size="small"
                  variant="text"
                  onClick={() => handleTransferOwner(member)}
                  sx={{
                    minWidth: 0,
                    px: 0.7,
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  방장 위임
                </Button>
                <Tooltip title="그룹에서 제외">
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={() => handleRemoveMember(member)}
                  >
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ) : null
          }
          sx={{ pr: manageable && selectedRoom?.is_owner && !member.is_owner ? 13 : 0 }}
        >
          <ListItemAvatar sx={{ minWidth: 38 }}>
            <Avatar
              sx={{
                width: 30,
                height: 30,
                bgcolor: member.is_owner ? '#0f6fae' : '#64748b',
                fontSize: '0.72rem',
                fontWeight: 900,
              }}
            >
              {getInitial(member.manager_name)}
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={
              <Stack direction="row" spacing={0.6} alignItems="center">
                <Typography sx={{ fontSize: '0.76rem', fontWeight: 800 }}>
                  {member.manager_name}
                  {member.is_current_user ? ' (나)' : ''}
                </Typography>
                {member.is_owner && (
                  <Chip
                    label="방장"
                    size="small"
                    sx={{ height: 18, fontSize: '0.58rem' }}
                  />
                )}
              </Stack>
            }
            secondary={<UserSecondaryText user={member} />}
          />
        </ListItem>
      ))}
    </List>
  );

  const renderRoomInfoContent = ({ manageable = false } = {}) => (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ textAlign: 'center', px: 1, pt: 0.5, pb: 1.5 }}>
        <Avatar
          sx={{
            width: 54,
            height: 54,
            mx: 'auto',
            bgcolor: selectedRoom?.room_type === 'group' ? '#0f6fae' : '#475569',
            fontWeight: 900,
          }}
        >
          {selectedRoom?.room_type === 'group' ? (
            <GroupRoundedIcon />
          ) : (
            getInitial(selectedRoom?.display_name)
          )}
        </Avatar>
        <Typography sx={{ mt: 1, fontSize: '0.92rem', fontWeight: 900 }}>
          {selectedRoom?.display_name || '-'}
        </Typography>
        <Typography sx={{ mt: 0.25, color: '#64748b', fontSize: '0.68rem' }}>
          {selectedRoom?.room_type === 'group'
            ? `${members.length}명 참여 중`
            : '1:1 대화'}
        </Typography>
      </Box>

      {selectedRoom?.room_type === 'group' && selectedRoom?.is_owner && (
        <Button
          fullWidth
          size="small"
          variant="outlined"
          startIcon={<ManageAccountsRoundedIcon />}
          onClick={handleOpenManage}
          sx={{ mb: 1.5 }}
        >
          그룹 관리
        </Button>
      )}

      <Divider />
      <Typography sx={{ mt: 1.4, mb: 0.4, color: '#475569', fontSize: '0.7rem', fontWeight: 900 }}>
        참여자
      </Typography>
      {membersLoading ? (
        <Box sx={{ py: 2, textAlign: 'center' }}>
          <CircularProgress size={22} />
        </Box>
      ) : (
        renderMemberList({ manageable })
      )}

    </Box>
  );

  const roomListPane = (
    <Paper
      variant="outlined"
      square
      sx={{
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderColor: '#cbd5e1',
        borderRadius: { xs: 1.5, md: '10px 0 0 10px' },
        overflow: 'hidden',
      }}
    >
      <Box sx={{ px: 1.5, py: 1.35, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography sx={{ fontSize: '0.98rem', fontWeight: 900, color: '#0f172a' }}>
            메신저
          </Typography>
          <Typography sx={{ mt: 0.1, color: '#64748b', fontSize: '0.66rem' }}>
            사내 1:1 · 그룹 대화
          </Typography>
        </Box>
        <Tooltip title="새 대화">
          <IconButton
            size="small"
            onClick={handleOpenNewChat}
            sx={{ color: '#0f6fae', bgcolor: '#e0f2fe' }}
          >
            <AddCommentRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ px: 1.25, pb: 1.1 }}>
        <TextField
          fullWidth
          size="small"
          value={roomSearch}
          onChange={(event) => setRoomSearch(event.target.value)}
          placeholder="대화방 검색"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ fontSize: 18, color: '#94a3b8' }} />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      <Divider />

      {roomsError ? (
        <Box sx={{ p: 1.25 }}>
          <Alert severity="error" sx={{ fontSize: '0.72rem' }}>
            {roomsError}
          </Alert>
        </Box>
      ) : roomsLoading ? (
        <Box sx={{ flexGrow: 1, display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={26} />
        </Box>
      ) : filteredRooms.length === 0 ? (
        <EmptyPane
          title={rooms.length === 0 ? '아직 대화방이 없습니다.' : '검색 결과가 없습니다.'}
          description={
            rooms.length === 0
              ? '오른쪽 위 새 대화 버튼을 눌러 사내 사용자와 대화를 시작하세요.'
              : '다른 검색어를 입력해보세요.'
          }
        />
      ) : (
        <List disablePadding sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto' }}>
          {filteredRooms.map((room) => {
            const selected = room.room_id === selectedRoomId;
            const unread = Number(room.unread_count || 0);

            return (
              <ListItemButton
                key={room.room_id}
                selected={selected}
                onClick={() => handleSelectRoom(room.room_id)}
                sx={{
                  px: 1.25,
                  py: 1.1,
                  alignItems: 'flex-start',
                  borderBottom: '1px solid #f1f5f9',
                  '&.Mui-selected': {
                    bgcolor: '#e0f2fe',
                  },
                  '&.Mui-selected:hover': {
                    bgcolor: '#d7effc',
                  },
                }}
              >
                <ListItemAvatar sx={{ minWidth: 46, mt: 0.1 }}>
                  <Avatar
                    sx={{
                      width: 38,
                      height: 38,
                      bgcolor: room.room_type === 'group' ? '#0f6fae' : '#64748b',
                      fontSize: '0.78rem',
                      fontWeight: 900,
                    }}
                  >
                    {room.room_type === 'group' ? (
                      <GroupRoundedIcon fontSize="small" />
                    ) : (
                      getInitial(room.display_name)
                    )}
                  </Avatar>
                </ListItemAvatar>

                <ListItemText
                  sx={{ my: 0, minWidth: 0 }}
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
                      <Typography
                        noWrap
                        sx={{
                          minWidth: 0,
                          flexGrow: 1,
                          color: '#0f172a',
                          fontSize: '0.78rem',
                          fontWeight: unread > 0 ? 900 : 800,
                        }}
                      >
                        {room.display_name}
                      </Typography>
                      <Typography sx={{ flexShrink: 0, color: '#94a3b8', fontSize: '0.6rem' }}>
                        {formatMessengerRoomTime(room.last_message_at || room.updated_at)}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <Box sx={{ mt: 0.35, display: 'flex', alignItems: 'center', gap: 0.7 }}>
                      <Typography
                        noWrap
                        component="span"
                        sx={{
                          minWidth: 0,
                          flexGrow: 1,
                          color: unread > 0 ? '#475569' : '#94a3b8',
                          fontSize: '0.68rem',
                          fontWeight: unread > 0 ? 700 : 500,
                        }}
                      >
                        {room.last_message_preview || '새 대화방'}
                      </Typography>
                      {unread > 0 && (
                        <Box
                          component="span"
                          sx={{
                            minWidth: 20,
                            height: 20,
                            px: 0.55,
                            borderRadius: 10,
                            display: 'grid',
                            placeItems: 'center',
                            bgcolor: '#ef4444',
                            color: '#ffffff',
                            fontSize: '0.6rem',
                            fontWeight: 900,
                          }}
                        >
                          {unread > 99 ? '99+' : unread}
                        </Box>
                      )}
                    </Box>
                  }
                />
              </ListItemButton>
            );
          })}
        </List>
      )}
    </Paper>
  );

  const conversationPane = (
    <Paper
      variant="outlined"
      square
      sx={{
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderColor: '#cbd5e1',
        borderLeft: { xs: '1px solid #cbd5e1', md: 0 },
        borderRadius: {
          xs: 1.5,
          md: showInfoColumn ? 0 : '0 10px 10px 0',
        },
        overflow: 'hidden',
        bgcolor: '#f8fafc',
      }}
    >
      {!selectedRoom ? (
        <EmptyPane
          title="대화방을 선택해주세요."
          description="왼쪽 대화방 목록에서 기존 대화를 선택하거나 새 대화를 시작할 수 있습니다."
        />
      ) : (
        <>
          <Box
            sx={{
              minHeight: 58,
              px: 1.3,
              py: 0.9,
              display: 'flex',
              alignItems: 'center',
              gap: 0.8,
              bgcolor: '#ffffff',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            {compactMode && (
              <Tooltip title="대화방 목록">
                <IconButton size="small" onClick={handleBackToRooms}>
                  <ArrowBackRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Avatar
              sx={{
                width: 36,
                height: 36,
                bgcolor: selectedRoom.room_type === 'group' ? '#0f6fae' : '#64748b',
                fontSize: '0.75rem',
                fontWeight: 900,
              }}
            >
              {selectedRoom.room_type === 'group' ? (
                <GroupRoundedIcon fontSize="small" />
              ) : (
                getInitial(selectedRoom.display_name)
              )}
            </Avatar>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography noWrap sx={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 900 }}>
                {selectedRoom.display_name}
              </Typography>
              <Typography sx={{ mt: 0.05, color: '#64748b', fontSize: '0.64rem' }}>
                {selectedRoom.room_type === 'group'
                  ? `${members.length || selectedRoom.member_count || 0}명 참여`
                  : members
                      .filter((member) => !member.is_current_user)
                      .map((member) => [member.position_title, member.project_name].filter((value) => value && value !== '-').join(' · '))
                      .filter(Boolean)[0] || '1:1 대화'}
              </Typography>
            </Box>

            {!showInfoColumn && (
              <Tooltip title="대화 정보">
                <IconButton size="small" onClick={() => setRoomInfoOpen(true)}>
                  <InfoOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            {selectedRoom.room_type === 'group' && selectedRoom.is_owner && (
              <Tooltip title="그룹 관리">
                <IconButton size="small" onClick={handleOpenManage}>
                  <ManageAccountsRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            <Tooltip title="대화방 나가기">
              <span>
                <IconButton
                  size="small"
                  disabled={leavingRoom}
                  onClick={handleLeaveRoom}
                  sx={{
                    ml: 0.15,
                    width: 32,
                    height: 32,
                    border: '1px solid #fecaca',
                    color: '#ef4444',
                    bgcolor: '#ffffff',
                    '&:hover': {
                      borderColor: '#fca5a5',
                      bgcolor: '#fef2f2',
                    },
                  }}
                >
                  {leavingRoom ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <LogoutRoundedIcon sx={{ fontSize: 18 }} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          </Box>

          <Box
            ref={messageScrollRef}
            sx={{
              flexGrow: 1,
              minHeight: 0,
              overflowY: 'auto',
              px: { xs: 1.1, sm: 1.7 },
              py: 1.4,
              bgcolor: '#f1f5f9',
            }}
          >
            {messagesLoading ? (
              <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                <CircularProgress size={28} />
              </Box>
            ) : messages.length === 0 ? (
              <Box sx={{ py: 5, textAlign: 'center', color: '#94a3b8' }}>
                <Typography sx={{ fontSize: '0.76rem', fontWeight: 700 }}>
                  아직 메시지가 없습니다.
                </Typography>
                <Typography sx={{ mt: 0.4, fontSize: '0.66rem' }}>
                  첫 메시지를 보내 대화를 시작하세요.
                </Typography>
              </Box>
            ) : (
              <>
                {hasOlderMessages && (
                  <Box sx={{ pb: 1.3, textAlign: 'center' }}>
                    <Button
                      size="small"
                      variant="text"
                      disabled={olderLoading}
                      onClick={handleLoadOlder}
                      startIcon={olderLoading ? <CircularProgress size={13} /> : null}
                      sx={{ fontSize: '0.68rem' }}
                    >
                      이전 메시지 불러오기
                    </Button>
                  </Box>
                )}

                {messages.map((message, index) => {
                  const previousMessage = messages[index - 1];
                  const dateLabel = getMessageDateLabel(message.created_at);
                  const previousDateLabel = previousMessage
                    ? getMessageDateLabel(previousMessage.created_at)
                    : '';
                  const showDateDivider = dateLabel !== previousDateLabel;
                  const isMine = message.sender_id === currentUserId;
                  const attachment = attachmentsByMessage[message.id];
                  const deleted = Boolean(message.deleted_at);
                  const readStatus =
                    isMine && !deleted ? getOwnMessageReadStatus(message) : '';

                  return (
                    <React.Fragment key={message.id}>
                      {showDateDivider && (
                        <Box sx={{ my: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Divider sx={{ flexGrow: 1 }} />
                          <Typography sx={{ color: '#94a3b8', fontSize: '0.62rem', fontWeight: 700 }}>
                            {dateLabel}
                          </Typography>
                          <Divider sx={{ flexGrow: 1 }} />
                        </Box>
                      )}

                      <Box
                        sx={{
                          mb: 1,
                          display: 'flex',
                          justifyContent: isMine ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <Box sx={{ maxWidth: { xs: '88%', sm: '74%' }, minWidth: 0 }}>
                          {!isMine && selectedRoom.room_type === 'group' && (
                            <Typography
                              sx={{
                                ml: 0.4,
                                mb: 0.25,
                                color: '#475569',
                                fontSize: '0.62rem',
                                fontWeight: 800,
                              }}
                            >
                              {message.sender_name || '사용자'}
                              {message.sender_position && message.sender_position !== '-'
                                ? ` · ${message.sender_position}`
                                : ''}
                            </Typography>
                          )}

                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'flex-end',
                              flexDirection: isMine ? 'row-reverse' : 'row',
                              gap: 0.5,
                            }}
                          >
                            <Box
                              sx={{
                                minWidth: 0,
                                px: deleted ? 1.15 : message.message_type === 'text' ? 1.15 : 0.75,
                                py: deleted ? 0.8 : message.message_type === 'text' ? 0.85 : 0.75,
                                borderRadius: isMine ? '12px 3px 12px 12px' : '3px 12px 12px 12px',
                                bgcolor: deleted
                                  ? '#e2e8f0'
                                  : isMine
                                    ? '#0f6fae'
                                    : '#ffffff',
                                color: deleted || !isMine ? '#334155' : '#ffffff',
                                border: !isMine && !deleted ? '1px solid #e2e8f0' : 'none',
                                boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
                                overflow: 'hidden',
                              }}
                            >
                              {deleted ? (
                                <Typography sx={{ fontSize: '0.68rem', fontStyle: 'italic', color: '#64748b' }}>
                                  삭제된 메시지입니다.
                                </Typography>
                              ) : message.message_type === 'text' ? (
                                <Typography
                                  sx={{
                                    whiteSpace: 'pre-wrap',
                                    overflowWrap: 'anywhere',
                                    fontSize: '0.76rem',
                                    lineHeight: 1.55,
                                  }}
                                >
                                  {message.body}
                                </Typography>
                              ) : message.message_type === 'image' && attachment ? (
                                <Box sx={{ minWidth: 0 }}>
                                  {attachment.signedUrl ? (
                                    <Box
                                      component="img"
                                      src={attachment.signedUrl}
                                      alt={attachment.file_name || '메신저 이미지'}
                                      onClick={() => handlePreviewImage(attachment)}
                                      sx={{
                                        display: 'block',
                                        maxWidth: 'min(320px, 62vw)',
                                        maxHeight: 360,
                                        objectFit: 'contain',
                                        borderRadius: 1,
                                        cursor: 'zoom-in',
                                        bgcolor: '#ffffff',
                                      }}
                                    />
                                  ) : (
                                    <Button
                                      size="small"
                                      onClick={() => handlePreviewImage(attachment)}
                                      startIcon={<ImageRoundedIcon />}
                                      sx={{ color: isMine ? '#ffffff' : '#0f6fae' }}
                                    >
                                      이미지 열기
                                    </Button>
                                  )}
                                  <Box sx={{ mt: 0.55, px: 0.25, display: 'flex', alignItems: 'center', gap: 0.6 }}>
                                    <Typography
                                      noWrap
                                      sx={{
                                        minWidth: 0,
                                        flexGrow: 1,
                                        color: isMine ? '#dbeafe' : '#64748b',
                                        fontSize: '0.6rem',
                                      }}
                                    >
                                      {attachment.file_name} · {formatMessengerFileSize(attachment.file_size)}
                                    </Typography>
                                    <IconButton
                                      size="small"
                                      onClick={() => handleDownloadAttachment(attachment)}
                                      sx={{ color: isMine ? '#ffffff' : '#475569', p: 0.35 }}
                                    >
                                      <DownloadRoundedIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                  </Box>
                                </Box>
                              ) : attachment ? (
                                <Box
                                  sx={{
                                    minWidth: 210,
                                    maxWidth: 320,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.8,
                                  }}
                                >
                                  <Box
                                    sx={{
                                      width: 34,
                                      height: 34,
                                      flexShrink: 0,
                                      display: 'grid',
                                      placeItems: 'center',
                                      borderRadius: 1,
                                      bgcolor: isMine ? 'rgba(255,255,255,0.16)' : '#e2e8f0',
                                    }}
                                  >
                                    <InsertDriveFileRoundedIcon fontSize="small" />
                                  </Box>
                                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                    <Typography noWrap sx={{ fontSize: '0.7rem', fontWeight: 800 }}>
                                      {attachment.file_name}
                                    </Typography>
                                    <Typography sx={{ mt: 0.15, color: isMine ? '#dbeafe' : '#64748b', fontSize: '0.6rem' }}>
                                      {formatMessengerFileSize(attachment.file_size)}
                                    </Typography>
                                  </Box>
                                  <Tooltip title="다운로드">
                                    <IconButton
                                      size="small"
                                      onClick={() => handleDownloadAttachment(attachment)}
                                      sx={{ color: isMine ? '#ffffff' : '#475569' }}
                                    >
                                      <DownloadRoundedIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              ) : (
                                <Typography sx={{ fontSize: '0.68rem' }}>
                                  첨부파일 정보를 불러오는 중입니다.
                                </Typography>
                              )}
                            </Box>

                            <Box sx={{ flexShrink: 0, mb: 0.1, display: 'flex', alignItems: 'center' }}>
                              {isMine && !deleted && (
                                <Tooltip
                                  title={
                                    selectedRoom.room_type === 'group' && readStatus === '안읽음'
                                      ? '안 읽은 참여자 보기'
                                      : ''
                                  }
                                  disableHoverListener={!(selectedRoom.room_type === 'group' && readStatus === '안읽음')}
                                >
                                  <Typography
                                    component={
                                      selectedRoom.room_type === 'group' && readStatus === '안읽음'
                                        ? 'button'
                                        : 'span'
                                    }
                                    type={
                                      selectedRoom.room_type === 'group' && readStatus === '안읽음'
                                        ? 'button'
                                        : undefined
                                    }
                                    onClick={
                                      selectedRoom.room_type === 'group' && readStatus === '안읽음'
                                        ? () => setUnreadMessageId(message.id)
                                        : undefined
                                    }
                                    sx={{
                                      mr: 0.45,
                                      p: 0,
                                      border: 0,
                                      bgcolor: 'transparent',
                                      color:
                                        readStatus === '읽음'
                                          ? '#0f6fae'
                                          : '#94a3b8',
                                      fontFamily: 'inherit',
                                      fontSize: '0.56rem',
                                      fontWeight: 800,
                                      lineHeight: 'inherit',
                                      whiteSpace: 'nowrap',
                                      cursor:
                                        selectedRoom.room_type === 'group' && readStatus === '안읽음'
                                          ? 'pointer'
                                          : 'default',
                                      '&:hover':
                                        selectedRoom.room_type === 'group' && readStatus === '안읽음'
                                          ? { color: '#475569', textDecoration: 'underline' }
                                          : undefined,
                                    }}
                                  >
                                    {readStatus}
                                  </Typography>
                                </Tooltip>
                              )}
                              <Typography sx={{ color: '#94a3b8', fontSize: '0.56rem', whiteSpace: 'nowrap' }}>
                                {formatMessengerDateTime(message.created_at).slice(9)}
                              </Typography>
                              {isMine && !deleted && (
                                <Tooltip title="내 메시지 삭제">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleDeleteMessage(message)}
                                    sx={{
                                      ml: 0.1,
                                      p: 0.25,
                                      color: '#fca5a5',
                                      '&:hover': {
                                        color: '#ef4444',
                                        bgcolor: '#fef2f2',
                                      },
                                    }}
                                  >
                                    <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                          </Box>
                        </Box>
                      </Box>
                    </React.Fragment>
                  );
                })}
              </>
            )}
          </Box>

          <Box
            sx={{
              p: 1,
              bgcolor: '#ffffff',
              borderTop: '1px solid #e2e8f0',
            }}
          >
            {uploading && (
              <Box sx={{ pb: 0.65, display: 'flex', alignItems: 'center', gap: 0.7, color: '#64748b' }}>
                <CircularProgress size={14} />
                <Typography noWrap sx={{ fontSize: '0.64rem' }}>
                  {uploadLabel || '파일 전송 중...'}
                </Typography>
              </Box>
            )}

            {pendingPasteFiles.length > 0 && (
              <Box
                sx={{
                  mb: 0.8,
                  p: 0.75,
                  display: 'flex',
                  gap: 0.8,
                  flexWrap: 'wrap',
                  border: '1px solid #dbeafe',
                  borderRadius: 1.2,
                  bgcolor: '#f8fbff',
                }}
              >
                {pendingPasteFiles.map((item) => (
                  <Box
                    key={item.id}
                    sx={{
                      position: 'relative',
                      width: 92,
                      height: 76,
                      borderRadius: 1,
                      overflow: 'hidden',
                      border: '1px solid #cbd5e1',
                      bgcolor: '#ffffff',
                    }}
                  >
                    <Box
                      component="img"
                      src={item.previewUrl}
                      alt={item.file?.name || '붙여넣은 이미지'}
                      sx={{
                        width: '100%',
                        height: '100%',
                        display: 'block',
                        objectFit: 'cover',
                      }}
                    />
                    <IconButton
                      size="small"
                      aria-label="붙여넣은 이미지 제거"
                      onClick={() => handleRemovePendingPasteFile(item.id)}
                      sx={{
                        position: 'absolute',
                        top: 3,
                        right: 3,
                        width: 22,
                        height: 22,
                        color: '#ffffff',
                        bgcolor: 'rgba(15,23,42,0.72)',
                        '&:hover': {
                          bgcolor: 'rgba(220,38,38,0.82)',
                        },
                      }}
                    >
                      <CloseRoundedIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Box>
                ))}
                <Box
                  sx={{
                    minWidth: 150,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    color: '#64748b',
                  }}
                >
                  <Typography sx={{ fontSize: '0.68rem', fontWeight: 800 }}>
                    붙여넣은 이미지 {pendingPasteFiles.length}개
                  </Typography>
                  <Typography sx={{ mt: 0.2, fontSize: '0.6rem' }}>
                    전송 버튼을 누르면 대화방에 업로드됩니다.
                  </Typography>
                </Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.65 }}>
              <input
                ref={fileInputRef}
                hidden
                multiple
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx,.zip,.txt,.csv"
                onChange={handleFilesSelected}
              />
              <Tooltip title="사진·파일 첨부 (파일당 최대 10MB)">
                <span>
                  <IconButton
                    size="small"
                    disabled={uploading || sending}
                    onClick={() => fileInputRef.current?.click()}
                    sx={{ color: '#475569' }}
                  >
                    <AttachFileRoundedIcon />
                  </IconButton>
                </span>
              </Tooltip>

              <TextField
                fullWidth
                multiline
                minRows={1}
                maxRows={4}
                inputRef={messageInputRef}
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                onPaste={handleComposerPaste}
                placeholder="메시지를 입력하세요. (Shift+Enter 줄바꿈 · 캡처이미지 Ctrl+V)"
                inputProps={{ maxLength: 4000 }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    minHeight: 42,
                    py: 0.35,
                    bgcolor: '#f8fafc',
                    alignItems: 'center',
                  },
                  '& textarea': {
                    minHeight: '24px !important',
                    py: '4px !important',
                    fontSize: '0.76rem',
                    lineHeight: 1.5,
                  },
                }}
              />

              <Tooltip title="전송">
                <span>
                  <IconButton
                    color="primary"
                    disabled={
                      sending ||
                      uploading ||
                      (!normalizeText(messageText) && pendingPasteFiles.length === 0)
                    }
                    onClick={handleSendText}
                  >
                    {sending ? <CircularProgress size={20} /> : <SendRoundedIcon />}
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>
        </>
      )}
    </Paper>
  );

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          md: '290px minmax(0, 1fr)',
          lg: '300px minmax(0, 1fr) 250px',
        },
      }}
    >
      {(!compactMode || !selectedRoomId) && roomListPane}
      {(!compactMode || selectedRoomId) && conversationPane}

      {showInfoColumn && (
        <Paper
          variant="outlined"
          square
          sx={{
            minWidth: 0,
            minHeight: 0,
            height: '100%',
            p: 1.5,
            overflowY: 'auto',
            borderColor: '#cbd5e1',
            borderLeft: 0,
            borderRadius: '0 10px 10px 0',
          }}
        >
          {selectedRoom ? (
            renderRoomInfoContent()
          ) : (
            <EmptyPane title="대화 정보" description="대화방을 선택하면 참여자 정보를 확인할 수 있습니다." />
          )}
        </Paper>
      )}

      <Dialog
        open={newChatOpen}
        onClose={() => !newChatCreating && setNewChatOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 900 }}>새 대화</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Tabs
            value={newChatMode}
            onChange={(_event, value) => {
              setNewChatMode(value);
              setNewChatSelectedIds([]);
            }}
            variant="fullWidth"
          >
            <Tab value="direct" label="1:1 대화" icon={<PersonRoundedIcon />} iconPosition="start" />
            <Tab value="group" label="그룹 대화" icon={<GroupRoundedIcon />} iconPosition="start" />
          </Tabs>

          <Box sx={{ p: 1.5 }}>
            {newChatMode === 'group' && (
              <TextField
                fullWidth
                size="small"
                label="그룹방 이름"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                inputProps={{ maxLength: 80 }}
                sx={{ mb: 1.2 }}
              />
            )}

            <TextField
              fullWidth
              size="small"
              value={newChatSearch}
              onChange={(event) => setNewChatSearch(event.target.value)}
              placeholder="이름·직급·현장 검색"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ fontSize: 18 }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>

          {usersError ? (
            <Box sx={{ px: 1.5, pb: 1.5 }}>
              <Alert severity="error">{usersError}</Alert>
            </Box>
          ) : usersLoading ? (
            <Box sx={{ height: 260, display: 'grid', placeItems: 'center' }}>
              <CircularProgress />
            </Box>
          ) : (
            <List sx={{ maxHeight: 360, overflowY: 'auto', pt: 0 }}>
              {filteredNewChatUsers.map((user) => {
                const checked = newChatSelectedIds.includes(user.user_id);
                return (
                  <ListItemButton
                    key={user.user_id}
                    onClick={() => toggleNewChatUser(user.user_id)}
                  >
                    <Checkbox
                      edge="start"
                      checked={checked}
                      tabIndex={-1}
                      disableRipple
                      sx={{ mr: 0.5 }}
                    />
                    <ListItemAvatar sx={{ minWidth: 42 }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: '#64748b', fontSize: '0.72rem' }}>
                        {getInitial(user.manager_name)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 800 }}>
                          {user.manager_name}
                        </Typography>
                      }
                      secondary={<UserSecondaryText user={user} />}
                    />
                  </ListItemButton>
                );
              })}
              {filteredNewChatUsers.length === 0 && (
                <Box sx={{ py: 4, textAlign: 'center', color: '#94a3b8' }}>
                  <Typography sx={{ fontSize: '0.74rem' }}>선택 가능한 사용자가 없습니다.</Typography>
                </Box>
              )}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={newChatCreating} onClick={() => setNewChatOpen(false)}>
            취소
          </Button>
          <Button
            variant="contained"
            disabled={newChatCreating}
            onClick={handleCreateConversation}
            startIcon={newChatCreating ? <CircularProgress size={15} /> : null}
          >
            {newChatMode === 'direct' ? '대화 시작' : '그룹 만들기'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={manageOpen}
        onClose={() => !manageSaving && setManageOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>그룹 관리</DialogTitle>
        <DialogContent dividers>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              fullWidth
              size="small"
              label="그룹방 이름"
              value={manageRoomName}
              disabled={!selectedRoom?.is_owner}
              onChange={(event) => setManageRoomName(event.target.value)}
              inputProps={{ maxLength: 80 }}
            />
            {selectedRoom?.is_owner && (
              <Button
                variant="outlined"
                disabled={manageSaving}
                onClick={handleRenameGroup}
                sx={{ whiteSpace: 'nowrap' }}
              >
                이름 저장
              </Button>
            )}
          </Stack>

          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ color: '#334155', fontSize: '0.76rem', fontWeight: 900 }}>
              참여자 {members.length}명
            </Typography>
            {selectedRoom?.is_owner && (
              <Button size="small" onClick={handleOpenAddMembers}>
                참여자 추가
              </Button>
            )}
          </Box>

          {renderMemberList({ manageable: true })}

          {!selectedRoom?.is_owner && (
            <Alert severity="info" sx={{ mt: 1.5, fontSize: '0.7rem' }}>
              그룹방 이름과 참여자 변경은 현재 방장만 할 수 있습니다.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManageOpen(false)}>닫기</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={addMembersOpen}
        onClose={() => !addMemberSaving && setAddMembersOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>참여자 추가</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Box sx={{ p: 1.5 }}>
            <TextField
              fullWidth
              size="small"
              value={addMemberSearch}
              onChange={(event) => setAddMemberSearch(event.target.value)}
              placeholder="이름·직급·현장 검색"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ fontSize: 18 }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>
          <List sx={{ maxHeight: 360, overflowY: 'auto', pt: 0 }}>
            {availableAddMembers.map((user) => {
              const checked = addMemberIds.includes(user.user_id);
              return (
                <ListItemButton
                  key={user.user_id}
                  onClick={() => toggleAddMember(user.user_id)}
                >
                  <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple />
                  <ListItemAvatar sx={{ minWidth: 42 }}>
                    <Avatar sx={{ width: 32, height: 32, bgcolor: '#64748b', fontSize: '0.72rem' }}>
                      {getInitial(user.manager_name)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 800 }}>
                        {user.manager_name}
                      </Typography>
                    }
                    secondary={<UserSecondaryText user={user} />}
                  />
                </ListItemButton>
              );
            })}
            {availableAddMembers.length === 0 && (
              <Box sx={{ py: 4, textAlign: 'center', color: '#94a3b8' }}>
                <Typography sx={{ fontSize: '0.74rem' }}>추가할 수 있는 사용자가 없습니다.</Typography>
              </Box>
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button disabled={addMemberSaving} onClick={() => setAddMembersOpen(false)}>
            취소
          </Button>
          <Button
            variant="contained"
            disabled={addMemberSaving || addMemberIds.length === 0}
            onClick={handleAddMembers}
          >
            {addMemberSaving ? '추가 중...' : `${addMemberIds.length}명 추가`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={leaveTransferOpen}
        onClose={() => !leavingRoom && setLeaveTransferOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>방장 권한 위임 후 나가기</DialogTitle>
        <DialogContent dividers sx={{ px: 1.5, py: 1 }}>
          <Alert severity="info" sx={{ mb: 1.2, fontSize: '0.7rem' }}>
            방장이 대화방을 나가려면 남아 있는 참여자 한 명에게 방장 권한을 먼저 넘겨야 합니다.
          </Alert>
          <List dense disablePadding>
            {members
              .filter((member) => !member.is_current_user)
              .map((member) => (
                <ListItemButton
                  key={member.user_id}
                  selected={leaveTransferUserId === member.user_id}
                  onClick={() => setLeaveTransferUserId(member.user_id)}
                  sx={{ borderRadius: 1 }}
                >
                  <ListItemAvatar sx={{ minWidth: 40 }}>
                    <Avatar
                      sx={{
                        width: 30,
                        height: 30,
                        bgcolor: '#64748b',
                        fontSize: '0.72rem',
                        fontWeight: 900,
                      }}
                    >
                      {getInitial(member.manager_name)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Typography sx={{ fontSize: '0.76rem', fontWeight: 800 }}>
                        {member.manager_name}
                      </Typography>
                    }
                    secondary={<UserSecondaryText user={member} />}
                  />
                </ListItemButton>
              ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={leavingRoom}
            onClick={() => setLeaveTransferOpen(false)}
          >
            취소
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={leavingRoom || !leaveTransferUserId}
            onClick={handleConfirmLeaveTransfer}
            startIcon={leavingRoom ? <CircularProgress size={15} /> : null}
          >
            권한 넘기고 나가기
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(unreadMessageId)}
        onClose={() => setUnreadMessageId('')}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>안 읽은 참여자</DialogTitle>
        <DialogContent dividers sx={{ px: 1.5, py: 1 }}>
          {(() => {
            const targetMessage = messages.find(
              (message) => message.id === unreadMessageId,
            );
            const unreadMembers = getUnreadMembersForMessage(targetMessage);

            if (unreadMembers.length === 0) {
              return (
                <Box sx={{ py: 3, textAlign: 'center', color: '#64748b' }}>
                  <Typography sx={{ fontSize: '0.74rem', fontWeight: 700 }}>
                    현재 안 읽은 참여자가 없습니다.
                  </Typography>
                </Box>
              );
            }

            return (
              <>
                <Typography sx={{ px: 0.5, pb: 0.6, color: '#64748b', fontSize: '0.68rem' }}>
                  이 메시지를 아직 읽지 않은 참여자 {unreadMembers.length}명
                </Typography>
                <List dense disablePadding>
                  {unreadMembers.map((member) => (
                    <ListItem key={member.user_id} disableGutters>
                      <ListItemAvatar sx={{ minWidth: 40 }}>
                        <Avatar
                          sx={{
                            width: 30,
                            height: 30,
                            bgcolor: '#64748b',
                            fontSize: '0.72rem',
                            fontWeight: 900,
                          }}
                        >
                          {getInitial(member.manager_name)}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Typography sx={{ fontSize: '0.76rem', fontWeight: 800 }}>
                            {member.manager_name}
                          </Typography>
                        }
                        secondary={<UserSecondaryText user={member} />}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnreadMessageId('')}>닫기</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={roomInfoOpen}
        onClose={() => setRoomInfoOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>대화 정보</DialogTitle>
        <DialogContent dividers>
          {selectedRoom && renderRoomInfoContent()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoomInfoOpen(false)}>닫기</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(previewAttachment)}
        onClose={() => setPreviewAttachment(null)}
        maxWidth="lg"
      >
        <DialogTitle sx={{ py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography noWrap sx={{ minWidth: 0, flexGrow: 1, fontSize: '0.84rem', fontWeight: 900 }}>
            {previewAttachment?.file_name || '이미지'}
          </Typography>
          <IconButton size="small" onClick={() => setPreviewAttachment(null)}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 1, bgcolor: '#0f172a' }}>
          {previewAttachment?.signedUrl && (
            <Box
              component="img"
              src={previewAttachment.signedUrl}
              alt={previewAttachment.file_name || '메신저 이미지'}
              sx={{
                display: 'block',
                maxWidth: '90vw',
                maxHeight: '78vh',
                mx: 'auto',
                objectFit: 'contain',
              }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<DownloadRoundedIcon />}
            onClick={() => handleDownloadAttachment(previewAttachment)}
          >
            다운로드
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3200}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        onClose={() => setToast(null)}
      >
        <Alert
          severity={toast?.severity || 'info'}
          variant="filled"
          onClose={() => setToast(null)}
          sx={{ minWidth: 260 }}
        >
          {toast?.text || ''}
        </Alert>
      </Snackbar>
    </Box>
  );
}
