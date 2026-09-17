import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogContent, DialogTitle, IconButton, Paper, Tab, Tabs, TextField, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import { supabase } from '../supabaseClient';
import { DOCUMENT_SELECT, REPORT_STATUS_META, fetchDocumentSteps, toApprovalRequest } from '../utils/reportDocuments.js';
import ReportSnapshot from './ApprovalReportSnapshot.jsx';
import { mainDialogTypography } from './mainDialogTypography.js';

const reportLabel = (type) => ({ weekly: '주간업무보고', proposal: '품의 보고', expense: '지출결의서' }[type] || '결재 문서');
const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('ko-KR') : '';
};

export default function DashboardApprovalDialog({ documents, error, userId, projectName, onClose, onNavigate, mode, tabs, onModeChange, loading, onReportNavigate }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [result, setResult] = useState(null);
  const isReports = mode === 'reports';
  const label = tabs.find((tab) => tab.id === mode)?.label || '';
  const statusLabel = (doc) => REPORT_STATUS_META[doc.status]?.label || doc.status;
  const categoryLabel = (doc) => isReports ? statusLabel(doc) : reportLabel(doc.report_type);
  const search = query.trim().toLocaleLowerCase();
  const visible = documents.filter((doc) => `${doc.title || ''} ${categoryLabel(doc)}`.toLocaleLowerCase().includes(search));
  const selected = visible.find((doc) => doc.id === selectedId) || visible[0];
  const documentId = selected?.id;
  const updatedAt = selected?.updated_at;
  const requestKey = JSON.stringify([mode, documentId, updatedAt, userId, projectName]);

  useEffect(() => {
    let active = true;
    if (isReports || !documentId || !userId || !projectName) return;
    const load = async () => {
      try {
        const { data, error: loadError } = await supabase.from('report_documents').select(DOCUMENT_SELECT)
          .eq('id', documentId).eq('project_name', projectName).maybeSingle();
        if (loadError) throw loadError;
        if (!data) throw new Error('문서를 찾을 수 없거나 조회 권한이 없습니다.');
        const steps = await fetchDocumentSteps([data]);
        const currentSteps = steps[data.id] || [];
        if (mode === 'approvals' && (data.status !== 'pending' || !currentSteps.some((step) => step.approver_user_id === userId && step.status === 'pending'))) {
          throw new Error('현재 결재할 문서가 아닙니다. 목록이 갱신된 후 다시 확인해 주세요.');
        }
        if (mode === 'received' && (data.author_user_id !== userId || !['approved', 'rejected'].includes(data.status))) {
          throw new Error('현재 결재 수신 문서가 아닙니다. 목록이 갱신된 후 다시 확인해 주세요.');
        }
        if (active) setResult({ key: requestKey, detail: toApprovalRequest(data, currentSteps) });
      } catch (cause) {
        if (active) setResult({ key: requestKey, error: cause?.message || '문서를 불러오지 못했습니다.' });
      }
    };
    load();
    return () => { active = false; };
  }, [documentId, requestKey, userId, projectName, mode, isReports]);

  const currentDetail = result?.key === requestKey ? result.detail : null;
  const detailError = result?.key === requestKey ? result.error : '';
  return <Dialog open onClose={onClose} fullWidth maxWidth="lg" sx={mainDialogTypography}
    aria-labelledby="dashboard-approval-title"
    slotProps={{ paper: { sx: { height: { xs: '92vh', md: '82vh' }, maxHeight: { xs: '92vh', md: '820px' } } } }}>
    <DialogTitle id="dashboard-approval-title" component="div" sx={{ pr: 6, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: { xs: 1, md: 4 }, flexWrap: 'wrap' }}>
      <Box component="span" sx={{ flexShrink: 0, display: 'inline-grid' }}>
        {tabs.map((tab) => <Box component="span" key={tab.id} aria-hidden={tab.id !== mode} sx={{ gridArea: '1 / 1', whiteSpace: 'nowrap', visibility: tab.id === mode ? 'visible' : 'hidden' }}>{tab.label}</Box>)}
      </Box>
      <Tabs value={mode} onChange={(_, value) => { setQuery(''); setSelectedId(null); onModeChange(value); }} variant="scrollable" scrollButtons="auto" aria-label="문서 목록 선택"
        sx={{ minHeight: 32, '& .MuiTab-root': { minHeight: 32, px: 1.5, py: 0.5, fontSize: '0.88rem', fontWeight: 700 } }}>
        {tabs.map((tab) => <Tab key={tab.id} value={tab.id} label={tab.label} disabled={tab.disabled} id={`work-tab-${tab.id}`} aria-controls="work-document-panel" />)}
      </Tabs>
      <IconButton aria-label={`${label} 닫기`} onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8 }}><CloseIcon /></IconButton>
    </DialogTitle>
    <DialogContent sx={{ p: 0, minHeight: 0, overflow: 'hidden' }}>
      <Box role="tabpanel" id="work-document-panel" aria-labelledby={`work-tab-${mode}`} sx={{ height: '100%', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px minmax(0, 1fr)' }, gridTemplateRows: { xs: '220px minmax(0, 1fr)', md: '1fr' } }}>
        <Box sx={{ minHeight: 0, overflowY: 'auto', p: 1.25, bgcolor: '#f8fafc', borderRight: { md: '1px solid #e2e8f0' }, borderBottom: { xs: '1px solid #e2e8f0', md: 'none' } }}>
          <Box sx={{ position: 'sticky', top: -10, zIndex: 1, pb: 1, bgcolor: '#f8fafc' }}>
            <TextField fullWidth size="small" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목·문서 종류 검색"
              inputProps={{ 'aria-label': `${label} 검색` }} InputProps={{ startAdornment: <SearchIcon sx={{ mr: 0.7, color: '#94a3b8', fontSize: 18 }} /> }} sx={{ bgcolor: '#fff' }} />
            <Typography sx={{ px: 0.5, pt: 0.8, color: '#64748b', fontSize: '0.68rem', fontWeight: 900 }}>
              {search ? '검색 결과' : label} {loading ? '불러오는 중...' : `${visible.length.toLocaleString()}건`}
            </Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          {visible.map((doc) => <Paper key={doc.id} component="button" type="button" variant="outlined" aria-pressed={doc.id === documentId} onClick={() => setSelectedId(doc.id)}
            sx={{ width: '100%', mb: 0.8, p: 1.15, display: 'block', textAlign: 'left', font: 'inherit', cursor: 'pointer', borderColor: doc.id === documentId ? '#60a5fa' : '#e2e8f0', bgcolor: doc.id === documentId ? '#eff6ff' : '#fff', '&:hover': { borderColor: '#93c5fd' } }}>
            <Chip label={categoryLabel(doc)} size="small" sx={{ height: 19, bgcolor: '#e0f2fe', color: '#0369a1', fontSize: '0.6rem', fontWeight: 900 }} />
            <Typography noWrap title={doc.title} sx={{ mt: 0.7, color: '#1e293b', fontSize: '0.78rem', fontWeight: 900 }}>{doc.title || '제목 없음'}</Typography>
            <Typography sx={{ mt: 0.4, color: '#94a3b8', fontSize: '0.63rem' }}>{isReports ? doc.detail : `${statusLabel(doc)} · ${formatDate(doc.updated_at)}`}</Typography>
          </Paper>)}
          {!error && !loading && visible.length === 0 && <Typography sx={{ py: 6, textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>{search ? '검색 결과가 없습니다.' : `${label}가 없습니다.`}</Typography>}
        </Box>
        <Box sx={{ minWidth: 0, minHeight: 0, overflowY: 'auto', p: { xs: 2, md: 3 } }}>
          {selected ? <Box sx={{ maxWidth: 900, mx: 'auto' }}>
            <Chip label={categoryLabel(selected)} size="small" sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 900 }} />
            <Typography sx={{ mt: 1.4, color: '#0f172a', fontSize: { xs: '1.15rem', md: '1.35rem' }, lineHeight: 1.4, fontWeight: 900, overflowWrap: 'anywhere' }}>{selected.title || '제목 없음'}</Typography>
            <Typography sx={{ mt: 0.7, color: '#64748b', fontSize: '0.72rem' }}>{projectName}{currentDetail?.requester_name ? ` · ${currentDetail.requester_name}` : ''}{!isReports && ` · ${formatDate(currentDetail?.submitted_at || selected.updated_at)}`}</Typography>
            <Box sx={{ my: 2.2, borderTop: '1px solid #e2e8f0' }} />
            {isReports ? <>
              <Typography sx={{ color: '#334155', fontSize: '0.88rem', lineHeight: 1.85 }}>{selected.detail}</Typography>
              <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                <Typography sx={{ fontSize: '0.88rem', color: '#64748b' }}>{statusLabel(selected)}</Typography>
                <Button variant="outlined" disabled={selected.canNavigate === false} endIcon={<ArrowForwardIcon />} onClick={() => onReportNavigate(selected)}>{selected.canNavigate === false ? '작성 화면 접근 권한 없음' : '작성 화면으로 이동'}</Button>
              </Box>
            </> : detailError ? <Alert severity="error">{detailError}</Alert> : currentDetail ? <>
              <Chip label={statusLabel(currentDetail)} size="small" sx={{ mb: 1, color: REPORT_STATUS_META[currentDetail.status]?.color, bgcolor: REPORT_STATUS_META[currentDetail.status]?.bgcolor }} />
              <ReportSnapshot request={currentDetail} />
              {!['weekly', 'proposal'].includes(currentDetail.report_type) && <Typography sx={{ color: '#64748b', fontSize: '0.88rem' }}>이 문서의 상세 내용은 결재함에서 확인할 수 있습니다.</Typography>}
              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}><Button variant="outlined" onClick={onNavigate}>{mode === 'received' ? '결재함에서 확인' : '결재함에서 처리'}</Button></Box>
            </> : <Typography role="status" sx={{ color: '#64748b', fontSize: '0.88rem' }}>문서를 불러오는 중입니다.</Typography>}
          </Box> : <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography role="status" sx={{ color: '#94a3b8', fontSize: '0.88rem' }}>{error ? '문서 목록을 불러오지 못했습니다.' : loading ? '목록을 불러오는 중입니다.' : search ? '검색 조건에 맞는 문서가 없습니다.' : `현재 ${label}가 없습니다.`}</Typography>
          </Box>}
        </Box>
      </Box>
    </DialogContent>
  </Dialog>;
}
