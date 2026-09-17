import { useEffect, useState } from 'react';
import { Alert, Badge, Box, Button, Dialog, DialogContent, DialogTitle, IconButton, List, ListItemButton, Tooltip, Typography } from '@mui/material';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';

import CloseIcon from '@mui/icons-material/Close';
import { fetchDashboardWork } from '../utils/dashboardWorkSummary.js';
import { buildMainNotifications } from '../utils/mainNotifications.js';
import { formatSystemNoticeDate } from '../utils/systemNotices.js';

const readIds = (key) => {
  try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []; }
  catch { return []; }
};

export default function MainToolbar({ userId, projectName, canApprove, onNotice, onNavigate, onReloadNotices }) {
  const storageKey = `main-read-notifications:${userId}`;
  const [read, setRead] = useState(() => readIds(storageKey));
  const [work, setWork] = useState(null);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');


  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = async () => {
      const current = ++request;
      const results = await Promise.allSettled([
        onReloadNotices({ force: true }),
        canApprove && userId && projectName ? fetchDashboardWork({ userId, projectName, reportTypes: [], canApprove: true }) : Promise.resolve(null),
      ]);
      if (!active || current !== request) return;
      setWork(results[1].status === 'fulfilled' ? results[1].value : null);
      setError(results[1].status === 'rejected' ? '알림을 불러오지 못했습니다. 잠시 후 다시 확인해주세요.' : '');
    };
    const syncRead = (event) => { if (event.key === storageKey || event.key === null) setRead(readIds(storageKey)); };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('approval-workflow-changed', refresh);
    window.addEventListener('storage', syncRead);
    return () => {
      active = false; window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('approval-workflow-changed', refresh);
      window.removeEventListener('storage', syncRead);
    };
  }, [userId, projectName, canApprove, storageKey, onReloadNotices]);
  const notifications = buildMainNotifications(work);
  const unread = notifications.filter((item) => !read.includes(item.id));
  const visible = unreadOnly ? unread : notifications;

  const markRead = (ids) => {
    try {
      const next = [...new Set([...readIds(storageKey), ...read, ...ids])];
      localStorage.setItem(storageKey, JSON.stringify(next)); setRead(next); setSaveError('');
      return true;
    } catch { setSaveError('읽음 상태를 저장하지 못했습니다. 브라우저 저장소 설정을 확인해주세요.'); return false; }
  };
  const openItem = (item, notification = false) => {
    if (notification && !markRead([item.id])) return;
    setNotificationsOpen(false);
    if (item.type === 'notice') onNotice(item.targetId);
    else onNavigate(item.type === 'menu' ? item.targetId : 'approval-inbox');
  };
  const titleStyle = { py: 1.5, pr: 6, borderBottom: '1px solid #e2e8f0', fontSize: '1.05rem', fontWeight: 900, color: '#0f172a' };
  return <Box className="main-toolbar">
    <Tooltip title="공지사항"><IconButton aria-label="공지사항 열기" onClick={() => onNotice()}><CampaignOutlinedIcon /></IconButton></Tooltip>
    <Tooltip title={error || `안 읽은 알림 ${unread.length}건`}><IconButton aria-label={`알림 열기, 안 읽은 알림 ${unread.length}건`} onClick={() => setNotificationsOpen(true)}>
      <Badge badgeContent={unread.length} color="error" max={99}><NotificationsNoneOutlinedIcon /></Badge>
    </IconButton></Tooltip>

    <Dialog open={notificationsOpen} onClose={() => setNotificationsOpen(false)} fullWidth maxWidth="md">
      <DialogTitle sx={{ ...titleStyle, fontSize: 22 }}>알림<IconButton aria-label="알림 닫기" onClick={() => setNotificationsOpen(false)} sx={{ position: 'absolute', top: 8, right: 8 }}><CloseIcon /></IconButton></DialogTitle>
      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, height: '65vh' }}>
        <Box sx={{ width: { sm: 180 }, flexShrink: 0, p: 2, bgcolor: '#f8fafc', borderRight: '1px solid #e2e8f0' }}>
          <ListItemButton selected={!unreadOnly} onClick={() => setUnreadOnly(false)}>전체 알림</ListItemButton>
          <ListItemButton selected={unreadOnly} onClick={() => setUnreadOnly(true)}>안 읽은 알림</ListItemButton>
        </Box>
        <Box sx={{ p: 2, flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{unreadOnly ? '안 읽은 알림' : '전체 알림'}</Typography>
            <Button disabled={!unread.length} onClick={() => markRead(unread.map((item) => item.id))}>모두 읽음</Button>
          </Box>
          {error && <Alert severity="warning">{error}</Alert>}
          {saveError && <Alert severity="error">{saveError}</Alert>}
          <List>{visible.map((item) => <ListItemButton key={item.id} onClick={() => openItem(item, true)} sx={{ mb: 1, p: 2, border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: read.includes(item.id) ? '#fff' : '#f0f9ff' }}>
            <Box sx={{ minWidth: 0 }}><Typography sx={{ fontSize: 12, color: '#0284c7', mb: 0.5 }}>{item.label}</Typography>
              <Typography sx={{ fontSize: 14, fontWeight: read.includes(item.id) ? 400 : 700, overflowWrap: 'anywhere' }}>{item.title}</Typography>
              <Typography sx={{ mt: 0.5, fontSize: 12, color: '#64748b' }}>{formatSystemNoticeDate(item.date, true)}</Typography></Box>
          </ListItemButton>)}</List>
          {!visible.length && <Typography sx={{ py: 5, textAlign: 'center', color: '#94a3b8' }}>{error ? '알림 조회 상태를 확인해주세요.' : '표시할 알림이 없습니다.'}</Typography>}
        </Box>
      </DialogContent>
    </Dialog>
  </Box>;
}
