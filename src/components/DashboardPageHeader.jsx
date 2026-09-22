import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Alert, Snackbar } from '@mui/material';
import HeaderMenuTitle from './HeaderMenuTitle.jsx';
import MainToolbar from './MainToolbar.jsx';
import SystemNoticeDetailDialog from './SystemNoticeDialog.jsx';
import { fetchSystemNotices } from '../utils/systemNotices.js';

export default function DashboardPageHeader({ container, title, view, userId, projectName, canApprove, onNavigate }) {
  const [notices, setNotices] = useState([]);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [noticeError, setNoticeError] = useState(false);
  const active = useRef(true);
  const request = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const reloadNotices = useCallback(async () => {
    const current = ++request.current;
    try {
      const rows = await fetchSystemNotices();
      if (active.current && current === request.current) {
        setNotices(rows);
        setNoticeError(false);
      }
    } catch (error) {
      if (active.current && current === request.current) setNoticeError(true);
      throw error;
    }
  }, []);
  if (!container) return null;
  return <>
    {createPortal(<>
      <HeaderMenuTitle title={title} view={view} userId={userId} />
      <MainToolbar userId={userId} projectName={projectName}
        canApprove={canApprove} onNavigate={onNavigate} onReloadNotices={reloadNotices}
        onNotice={(id) => { setSelectedNotice(id); setNoticeOpen(true); }} />
    </>, container)}
    <SystemNoticeDetailDialog open={noticeOpen} notices={notices} selectedId={selectedNotice}
      onSelect={setSelectedNotice} onClose={() => setNoticeOpen(false)} />
    <Snackbar open={noticeError} onClose={() => setNoticeError(false)}>
      <Alert severity="error" onClose={() => setNoticeError(false)}>공지사항을 불러오지 못했습니다. 잠시 후 다시 확인해주세요.</Alert>
    </Snackbar>
  </>;
}
