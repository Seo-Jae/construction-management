import { useEffect, useState } from 'react';
import { Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { fetchDashboardReportTasks, fetchDashboardWork } from '../utils/dashboardWorkSummary.js';
import { mainDialogTypography } from './mainDialogTypography.js';
import DashboardApprovalDialog from './DashboardApprovalDialog.jsx';

const ITEMS = [
  { id: 'reports', label: '작성할 보고' },
  { id: 'approvals', label: '결재할 문서', hint: '현재 결재 차례가 나에게 도착한 문서입니다.' },
  { id: 'received', label: '결재 수신 문서', hint: '내가 제출한 문서 중 승인·반려 결과를 받은 문서입니다. 미확인 건수가 아닌 전체 결과 건수입니다.' },
];
export default function DashboardWorkSummary({ userId, projectName, canWeekly, canDaily, canContract, canApprove, onNavigate }) {
  const [groups, setGroups] = useState(null);
  const [reports, setReports] = useState(null);
  const [reportError, setReportError] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [navigationTarget, setNavigationTarget] = useState(null);
  useEffect(() => {
    if (!userId || !projectName) return;
    let active = true;
    let request = 0;
    const refresh = async () => {
      const current = ++request;
      const [reportResult, approvalResult] = await Promise.allSettled([
        fetchDashboardReportTasks({ projectName, canDaily, canWeekly, canContract }),
        canApprove ? fetchDashboardWork({ userId, projectName, canApprove, reportTypes: [] })
          : Promise.resolve({ approvals: [], received: [] }),
      ]);
      if (!active || current !== request) return;
      setReports(reportResult.status === 'fulfilled' ? reportResult.value : null);
      setReportError(reportResult.status === 'fulfilled' ? '' : '작성할 보고를 불러오지 못했습니다.');
      setGroups(approvalResult.status === 'fulfilled' ? approvalResult.value : null);
      setError(approvalResult.status === 'fulfilled' ? '' : '결재 현황을 불러오지 못했습니다.');
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('approval-workflow-changed', refresh);
    window.addEventListener('weekly-report-completed', refresh);
    window.addEventListener('daily-reports-changed', refresh);
    return () => {
      active = false; window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('approval-workflow-changed', refresh);
      window.removeEventListener('weekly-report-completed', refresh);
      window.removeEventListener('daily-reports-changed', refresh);
    };
  }, [userId, projectName, canWeekly, canDaily, canContract, canApprove]);
  const enabled = (id) => id === 'reports' ? canWeekly || canDaily || canContract : canApprove;
  const rowsFor = (id) => id === 'reports' ? reports : groups?.[id];
  const item = ITEMS.find((row) => row.id === selected);
  const isReports = selected === 'reports';
  const documents = rowsFor(selected) || [];
  const selectedError = isReports ? reportError : error;
  return <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #eee9ec', textAlign: 'left' }}>
    {ITEMS.map((row) => <ButtonBase key={row.id} disabled={!enabled(row.id) || !rowsFor(row.id)} onClick={() => setSelected(row.id)}
      sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', py: 1, gap: 1, borderRadius: 1, '&:hover': { bgcolor: '#f0f9fa' } }}>
      <Typography sx={{ fontSize: 13, color: '#737780' }}>{row.label}</Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#00a5b5' }}>{!enabled(row.id) ? '권한 없음' : rowsFor(row.id) ? rowsFor(row.id).length.toLocaleString() : '—'}</Typography>
    </ButtonBase>)}
    {error && <Typography role="alert" sx={{ fontSize: 12, color: '#b45309', mt: 1 }}>{error}</Typography>}
    {reportError && <Typography role="alert" sx={{ fontSize: 12, color: '#b45309', mt: 1 }}>{reportError}</Typography>}
    {item && <DashboardApprovalDialog documents={documents} error={selectedError} userId={userId} projectName={projectName}
      mode={selected} tabs={ITEMS.map((row) => ({ ...row, disabled: !enabled(row.id) }))} onModeChange={setSelected}
      loading={enabled(selected) && !rowsFor(selected) && !selectedError} onReportNavigate={setNavigationTarget}
      onClose={() => setSelected('')} onNavigate={() => { setSelected(''); onNavigate?.('approval-inbox'); }} />}
    <Dialog open={Boolean(navigationTarget)} onClose={() => setNavigationTarget(null)} fullWidth maxWidth="xs"
      aria-labelledby="report-navigation-title" aria-describedby="report-navigation-description" sx={mainDialogTypography}>
      <DialogTitle id="report-navigation-title">작성 화면으로 이동</DialogTitle>
      <DialogContent dividers>
        <Typography id="report-navigation-description" sx={{ fontSize: '0.88rem', lineHeight: 1.85, color: '#334155' }}>
          {navigationTarget?.title} 작성을 위해 해당 메뉴로 이동하시겠습니까?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setNavigationTarget(null)}>아니오</Button>
        <Button variant="contained" onClick={() => {
          const view = navigationTarget?.view;
          if (!view) return;
          setNavigationTarget(null);
          setSelected('');
          onNavigate?.(view);
        }}>예</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
