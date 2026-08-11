import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Fade,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DevicesRoundedIcon from '@mui/icons-material/DevicesRounded';
import EditCalendarRoundedIcon from '@mui/icons-material/EditCalendarRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import LaunchRoundedIcon from '@mui/icons-material/LaunchRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import QrCode from 'qrcode';
import { supabase } from '../supabaseClient';
import {
  buildAttendanceQrDisplayUrl,
  buildAttendanceWorkerUrl,
  formatKoreaDateTime,
  formatPhone,
  getKoreaDateValue,
} from '../utils/attendance';

const tabItems = [
  { value: 'approval', label: '가입 승인', icon: <FactCheckRoundedIcon fontSize="small" /> },
  { value: 'records', label: '근태 기록', icon: <EditCalendarRoundedIcon fontSize="small" /> },
  { value: 'devices', label: '기기 변경', icon: <DevicesRoundedIcon fontSize="small" /> },
  { value: 'audit', label: '변경 이력', icon: <HistoryRoundedIcon fontSize="small" /> },
  { value: 'qr', label: '출·퇴근 QR', icon: <QrCode2RoundedIcon fontSize="small" /> },
];

const eventLabel = (type) => (type === 'check_in' ? '출근' : '퇴근');
const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const minuteOptions = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

export default function AttendanceManagement({ projectName, canManage = false, onLogout }) {
  const [tab, setTab] = useState('approval');
  const [workDate, setWorkDate] = useState(getKoreaDateValue());
  const [dashboard, setDashboard] = useState({
    pending_workers: [],
    daily_records: [],
    device_requests: [],
    recent_audit: [],
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [staticQrImage, setStaticQrImage] = useState('');
  const [openingQrWindow, setOpeningQrWindow] = useState(false);
  const [correction, setCorrection] = useState(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionTime, setCorrectionTime] = useState('');
  const [timeEditorOpen, setTimeEditorOpen] = useState(false);
  const [timeDraft, setTimeDraft] = useState({ hour: '07', minute: '00' });
  const openingQrRef = useRef(false);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!projectName) return;
    if (!silent) setLoading(true);
    const { data, error } = await supabase.rpc('attendance_manager_dashboard_v52_14', {
      p_project_name: projectName,
      p_work_date: workDate,
    });

    if (error) {
      setMessage({ severity: 'error', text: error.message || '근태정보를 불러오지 못했습니다.' });
      setLoading(false);
      return;
    }

    setDashboard({
      pending_workers: Array.isArray(data?.pending_workers) ? data.pending_workers : [],
      daily_records: Array.isArray(data?.daily_records) ? data.daily_records : [],
      device_requests: Array.isArray(data?.device_requests) ? data.device_requests : [],
      recent_audit: Array.isArray(data?.recent_audit) ? data.recent_audit : [],
    });
    setLoading(false);
  }, [projectName, workDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadDashboard(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  useEffect(() => {
    let active = true;
    QrCode.toDataURL(buildAttendanceWorkerUrl({ projectName }), {
      width: 520,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then((value) => {
      if (active) setStaticQrImage(value);
    });
    return () => { active = false; };
  }, [projectName]);

  const openDynamicQrWindow = useCallback(async () => {
    if (!projectName || !canManage || openingQrRef.current) return;

    const confirmed = window.confirm(
      '출·퇴근 QR 전용 창을 열면 보안을 위해 담당자 화면은 자동 로그아웃됩니다. 계속할까요?',
    );
    if (!confirmed) return;

    const displayWindow = window.open(
      'about:blank',
      'wooklim-attendance-qr-display',
      'width=920,height=980,resizable=yes,scrollbars=yes',
    );

    if (!displayWindow) {
      setMessage({ severity: 'warning', text: '팝업 차단을 해제한 뒤 출·퇴근 QR을 다시 눌러주세요.' });
      return;
    }

    openingQrRef.current = true;
    setOpeningQrWindow(true);
    displayWindow.document.title = '출·퇴근 QR 준비 중';
    displayWindow.document.body.style.cssText = 'margin:0;display:grid;place-items:center;min-height:100vh;font-family:Arial,sans-serif;background:#07111f;color:#fff';
    displayWindow.document.body.textContent = '보안 QR 표시 세션을 준비하고 있습니다.';

    const { data, error } = await supabase.rpc(
      'attendance_start_qr_display_v52_14_1',
      { p_project_name: projectName },
    );

    openingQrRef.current = false;
    setOpeningQrWindow(false);

    if (error) {
      displayWindow.close();
      setMessage({ severity: 'error', text: error.message || 'QR 표시 세션을 시작하지 못했습니다.' });
      return;
    }

    const displayUrl = buildAttendanceQrDisplayUrl({
      displayToken: data?.display_token || '',
    });
    displayWindow.opener = null;
    displayWindow.location.replace(displayUrl);
    window.setTimeout(() => onLogout?.(), 300);
  }, [canManage, onLogout, projectName]);

  const handleTabChange = (_event, value) => {
    setTab(value);
    if (value === 'qr' && canManage) void openDynamicQrWindow();
  };

  const handleWorkerDecision = async (workerId, approved) => {
    if (!canManage) return;
    const reason = approved
      ? '현장담당자 대면 확인 후 승인'
      : window.prompt('반려 사유를 입력해주세요.')?.trim();
    if (!approved && !reason) return;

    const { error } = await supabase.rpc('attendance_manager_decide_worker_v52_14', {
      p_worker_id: workerId,
      p_approved: approved,
      p_reason: reason,
    });
    if (error) {
      setMessage({ severity: 'error', text: error.message });
      return;
    }
    setMessage({ severity: 'success', text: approved ? '근로자 가입을 승인했습니다.' : '가입 신청을 반려했습니다.' });
    await loadDashboard(true);
  };

  const handleDeviceDecision = async (requestId, approved) => {
    if (!canManage) return;
    const reason = approved
      ? '본인 확인 후 기기 변경 승인'
      : window.prompt('반려 사유를 입력해주세요.')?.trim();
    if (!approved && !reason) return;

    const { error } = await supabase.rpc('attendance_manager_decide_device_v52_14', {
      p_request_id: requestId,
      p_approved: approved,
      p_reason: reason,
    });
    if (error) {
      setMessage({ severity: 'error', text: error.message });
      return;
    }
    setMessage({ severity: 'success', text: approved ? '새 휴대폰 사용을 승인했습니다.' : '기기 변경 요청을 반려했습니다.' });
    await loadDashboard(true);
  };

  const openCorrection = (record, type) => {
    const current = type === 'check_in' ? record.check_in_at : record.check_out_at;
    const defaultValue = current
      ? new Date(new Date(current).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16)
      : type === 'check_in' ? '07:00' : '17:00';
    setCorrection({ workerId: record.worker_id, workerName: record.name_ko, type });
    setCorrectionTime(defaultValue);
    setCorrectionReason('');
    setTimeEditorOpen(false);
  };

  const openTimeEditor = () => {
    const [hour = '07', minute = '00'] = String(correctionTime || '').split(':');
    setTimeDraft({
      hour: hourOptions.includes(hour) ? hour : '07',
      minute: minuteOptions.includes(minute) ? minute : '00',
    });
    setTimeEditorOpen(true);
  };

  const applyCorrectionTime = () => {
    setCorrectionTime(`${timeDraft.hour}:${timeDraft.minute}`);
    setTimeEditorOpen(false);
  };

  const closeCorrection = () => {
    setTimeEditorOpen(false);
    setCorrection(null);
  };

  const saveCorrection = async () => {
    if (!correction || !correctionTime || correctionReason.trim().length < 2) {
      setMessage({ severity: 'warning', text: '변경 시간과 수정 사유를 입력해주세요.' });
      return;
    }
    const koreaLocal = `${workDate}T${correctionTime}:00+09:00`;
    const { error } = await supabase.rpc('attendance_manager_correct_event_v52_14', {
      p_worker_id: correction.workerId,
      p_work_date: workDate,
      p_event_type: correction.type,
      p_event_at: koreaLocal,
      p_reason: correctionReason.trim(),
    });
    if (error) {
      setMessage({ severity: 'error', text: error.message });
      return;
    }
    closeCorrection();
    setMessage({ severity: 'success', text: '근태 기록을 수정하고 변경이력을 남겼습니다.' });
    await loadDashboard(true);
  };

  const printStaticQr = () => {
    if (!staticQrImage) return;
    const printWindow = window.open('', '_blank', 'width=760,height=900');
    if (!printWindow) {
      setMessage({ severity: 'warning', text: '팝업 차단을 해제한 뒤 다시 시도해주세요.' });
      return;
    }
    printWindow.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>근태 앱 설치 QR</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:48px;color:#0f172a}h1{font-size:28px;margin:0 0 12px}p{font-size:16px;color:#475569}.qr{width:440px;max-width:90vw;margin:24px auto}.box{border:3px solid #0f4c81;border-radius:24px;padding:34px;display:inline-block}.foot{margin-top:22px;font-size:14px}</style></head><body><div class="box"><h1>욱림건설 근태관리 앱</h1><p>${projectName}</p><img class="qr" src="${staticQrImage}"/><div class="foot">휴대폰 카메라로 QR을 촬영해 가입·로그인하세요.<br/>GPS 위치정보는 수집하지 않습니다.</div></div><script>window.onload=()=>window.print();</script></body></html>`);
    printWindow.document.close();
  };

  const pendingCount = dashboard.pending_workers.length;
  const deviceCount = dashboard.device_requests.length;

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Snackbar
        key={message?.text || 'attendance-toast'}
        open={Boolean(message)}
        autoHideDuration={3000}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        TransitionComponent={Fade}
        transitionDuration={{ enter: 220, exit: 500 }}
        onClose={(_event, reason) => {
          if (reason === 'clickaway') return;
          setMessage(null);
        }}
        sx={{
          top: '72px !important',
          zIndex: (theme) => theme.zIndex.snackbar + 10,
          '& .MuiAlert-root': {
            width: 'max-content',
            minWidth: { xs: 280, sm: 420 },
            maxWidth: 'min(920px, calc(100vw - 32px))',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.22)',
          },
          '& .MuiAlert-message': { whiteSpace: 'normal' },
        }}
      >
        <Alert severity={message?.severity || 'info'} variant="filled" onClose={() => setMessage(null)}>
          {message?.text || ''}
        </Alert>
      </Snackbar>
      <Paper variant="outlined" sx={{ px: 1.5, borderColor: '#cbd5e1' }}>
        <Tabs value={tab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto">
          {tabItems.map((item) => (
            <Tab
              key={item.value}
              value={item.value}
              icon={item.icon}
              iconPosition="start"
              label={`${item.label}${item.value === 'approval' && pendingCount ? ` ${pendingCount}` : item.value === 'devices' && deviceCount ? ` ${deviceCount}` : ''}`}
              sx={{ minHeight: 52, fontWeight: 800 }}
            />
          ))}
        </Tabs>
      </Paper>

      {!canManage && (
        <Alert severity="info">조회 권한으로 접속했습니다. QR 발급, 가입 승인, 기기 변경, 근태 수정은 할 수 없습니다.</Alert>
      )}

      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
        {tab === 'qr' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(420px, 1fr) minmax(360px, 0.8fr)' }, gap: 2 }}>
            <Paper variant="outlined" sx={{ p: 2.5, textAlign: 'center', borderColor: '#cbd5e1' }}>
              <Typography sx={{ fontSize: '1.05rem', fontWeight: 900 }}>보안 출·퇴근 QR 전용 창</Typography>
              <Typography sx={{ mt: 0.5, color: '#64748b', fontSize: '0.76rem' }}>{projectName}</Typography>
              {!canManage ? (
                <Alert severity="warning" sx={{ mt: 3, textAlign: 'left' }}>
                  동적 QR 발급은 근태관리 수정 권한이 있는 담당자만 가능합니다.
                </Alert>
              ) : (
                <Stack spacing={2} sx={{ mt: 3 }}>
                  <Alert severity="success" sx={{ textAlign: 'left', fontSize: '0.76rem' }}>
                    관리 화면과 분리된 새 창에서 QR만 표시합니다. 전용 창이 열리면 원래 담당자 화면은 자동 로그아웃되며, QR 창은 표시 세션 만료 전까지 계속 작동합니다.
                  </Alert>
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={openingQrWindow ? <CircularProgress size={18} color="inherit" /> : <LaunchRoundedIcon />}
                    onClick={openDynamicQrWindow}
                    disabled={openingQrWindow}
                    sx={{ minHeight: 54, bgcolor: '#0f6fae', fontWeight: 900 }}
                  >
                    {openingQrWindow ? 'QR 전용 창 준비 중' : '출·퇴근 QR 전용 창 열기'}
                  </Button>
                  <Typography sx={{ color: '#64748b', fontSize: '0.72rem', lineHeight: 1.65 }}>
                    이 탭을 선택할 때 자동으로 새 창이 열립니다. 팝업이 차단됐거나 창을 다시 열어야 할 때 위 버튼을 누르세요.
                  </Typography>
                </Stack>
              )}
            </Paper>

            <Paper variant="outlined" sx={{ p: 2.5, borderColor: '#cbd5e1' }}>
              <Typography sx={{ fontSize: '1.05rem', fontWeight: 900 }}>앱 설치용 정적 QR</Typography>
              <Typography sx={{ mt: 0.7, color: '#64748b', fontSize: '0.76rem', lineHeight: 1.65 }}>이 QR은 바뀌지 않습니다. 출력해 현장사무실 책상에 부착하세요.</Typography>
              <Box component="img" src={staticQrImage} alt="근태 앱 설치 QR" sx={{ width: '100%', maxWidth: 330, display: 'block', mx: 'auto', my: 2 }} />
              <Button fullWidth variant="contained" startIcon={<PrintRoundedIcon />} onClick={printStaticQr} sx={{ bgcolor: '#0f6fae' }}>정적 QR 인쇄</Button>
              <Alert severity="info" sx={{ mt: 2, fontSize: '0.72rem' }}>정적 QR은 가입·로그인용이며 출·퇴근 처리에는 사용할 수 없습니다.</Alert>
            </Paper>
          </Box>
        )}

        {tab === 'approval' && (
          <Paper variant="outlined" sx={{ borderColor: '#cbd5e1' }}>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box><Typography sx={{ fontWeight: 900 }}>가입 승인 대기</Typography><Typography sx={{ color: '#64748b', fontSize: '0.72rem' }}>현장에서 본인과 휴대폰을 확인한 뒤 승인하세요.</Typography></Box>
              <IconButton onClick={() => loadDashboard()}><RefreshRoundedIcon /></IconButton>
            </Box>
            <Divider />
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>신청일시</TableCell><TableCell>성명</TableCell><TableCell>구분</TableCell><TableCell>휴대폰</TableCell><TableCell>직종</TableCell><TableCell align="right">처리</TableCell></TableRow></TableHead>
                <TableBody>
                  {dashboard.pending_workers.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>{formatKoreaDateTime(row.created_at)}</TableCell>
                      <TableCell><b>{row.name_ko}</b>{row.name_en ? <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>{row.name_en}</Typography> : null}</TableCell>
                      <TableCell><Stack direction="row" spacing={0.5} alignItems="center"><span>{row.is_foreigner ? '외국인' : '내국인'}</span>{row.is_test_account && <Chip label="테스트" size="small" color="info" />}</Stack></TableCell>
                      <TableCell>{formatPhone(row.phone)}</TableCell><TableCell>{row.trade_name}</TableCell>
                      <TableCell align="right"><Stack direction="row" spacing={0.7} justifyContent="flex-end"><Button size="small" variant="contained" color="success" disabled={!canManage} onClick={() => handleWorkerDecision(row.id, true)}>승인</Button><Button size="small" variant="outlined" color="error" disabled={!canManage} onClick={() => handleWorkerDecision(row.id, false)}>반려</Button></Stack></TableCell>
                    </TableRow>
                  ))}
                  {pendingCount === 0 && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 8, color: '#94a3b8' }}>승인 대기 중인 근로자가 없습니다.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {tab === 'records' && (
          <Paper variant="outlined" sx={{ borderColor: '#cbd5e1' }}>
            <Box sx={{ p: 2, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', justifyContent: 'space-between' }}>
              <Box><Typography sx={{ fontWeight: 900 }}>일자별 근태 기록</Typography><Typography sx={{ color: '#64748b', fontSize: '0.72rem' }}>모든 시간은 서버가 기록한 한국시간 기준입니다.</Typography></Box>
              <TextField type="date" size="small" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />
            </Box>
            <Divider />
            {loading ? <Box sx={{ py: 10, textAlign: 'center' }}><CircularProgress /></Box> : (
              <TableContainer>
                <Table size="small">
                  <TableHead><TableRow><TableCell>성명</TableCell><TableCell>직종</TableCell><TableCell>출근</TableCell><TableCell>퇴근</TableCell><TableCell>상태</TableCell></TableRow></TableHead>
                  <TableBody>
                    {dashboard.daily_records.map((row) => (
                      <TableRow key={row.worker_id} hover>
                        <TableCell><b>{row.name_ko}</b></TableCell><TableCell>{row.trade_name}</TableCell>
                        <TableCell><Stack direction="row" alignItems="center" spacing={0.5}><span>{formatKoreaDateTime(row.check_in_at, { timeOnly: true })}</span>{canManage && <Tooltip title="출근 수정"><IconButton size="small" onClick={() => openCorrection(row, 'check_in')}><EditCalendarRoundedIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>}</Stack></TableCell>
                        <TableCell><Stack direction="row" alignItems="center" spacing={0.5}><span>{formatKoreaDateTime(row.check_out_at, { timeOnly: true })}</span>{canManage && <Tooltip title="퇴근 수정"><IconButton size="small" onClick={() => openCorrection(row, 'check_out')}><EditCalendarRoundedIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>}</Stack></TableCell>
                        <TableCell><Chip size="small" color={row.check_in_at && row.check_out_at ? 'success' : row.check_in_at ? 'warning' : 'default'} label={row.check_in_at && row.check_out_at ? '완료' : row.check_in_at ? '근무중' : '미출근'} /></TableCell>
                      </TableRow>
                    ))}
                    {dashboard.daily_records.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 8, color: '#94a3b8' }}>승인된 근로자가 없습니다.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        )}

        {tab === 'devices' && (
          <Paper variant="outlined" sx={{ borderColor: '#cbd5e1' }}>
            <Box sx={{ p: 2 }}><Typography sx={{ fontWeight: 900 }}>기기 변경 승인</Typography><Typography sx={{ color: '#64748b', fontSize: '0.72rem' }}>휴대폰 교체·분실 시 새 기기 요청을 대면 확인합니다.</Typography></Box><Divider />
            <TableContainer><Table size="small"><TableHead><TableRow><TableCell>요청일시</TableCell><TableCell>성명</TableCell><TableCell>휴대폰</TableCell><TableCell>직종</TableCell><TableCell align="right">처리</TableCell></TableRow></TableHead><TableBody>
              {dashboard.device_requests.map((row) => <TableRow key={row.id}><TableCell>{formatKoreaDateTime(row.requested_at)}</TableCell><TableCell><b>{row.name_ko}</b></TableCell><TableCell>{formatPhone(row.phone)}</TableCell><TableCell>{row.trade_name}</TableCell><TableCell align="right"><Stack direction="row" spacing={0.7} justifyContent="flex-end"><Button size="small" variant="contained" color="success" disabled={!canManage} onClick={() => handleDeviceDecision(row.id, true)}>승인</Button><Button size="small" variant="outlined" color="error" disabled={!canManage} onClick={() => handleDeviceDecision(row.id, false)}>반려</Button></Stack></TableCell></TableRow>)}
              {deviceCount === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 8, color: '#94a3b8' }}>기기 변경 요청이 없습니다.</TableCell></TableRow>}
            </TableBody></Table></TableContainer>
          </Paper>
        )}

        {tab === 'audit' && (
          <Paper variant="outlined" sx={{ borderColor: '#cbd5e1' }}>
            <Box sx={{ p: 2 }}><Typography sx={{ fontWeight: 900 }}>최근 변경 이력</Typography><Typography sx={{ color: '#64748b', fontSize: '0.72rem' }}>승인·반려·기기변경·수동수정 기록을 보존합니다.</Typography></Box><Divider />
            <TableContainer><Table size="small"><TableHead><TableRow><TableCell>일시</TableCell><TableCell>처리내용</TableCell><TableCell>대상</TableCell><TableCell>처리자</TableCell><TableCell>사유</TableCell></TableRow></TableHead><TableBody>
              {dashboard.recent_audit.map((row) => <TableRow key={row.id}><TableCell>{formatKoreaDateTime(row.created_at)}</TableCell><TableCell>{row.action_label}</TableCell><TableCell>{row.worker_name || '-'}</TableCell><TableCell>{row.actor_name || '-'}</TableCell><TableCell>{row.reason || '-'}</TableCell></TableRow>)}
              {dashboard.recent_audit.length === 0 && <TableRow><TableCell colSpan={5} align="center" sx={{ py: 8, color: '#94a3b8' }}>변경 이력이 없습니다.</TableCell></TableRow>}
            </TableBody></Table></TableContainer>
          </Paper>
        )}
      </Box>

      <Dialog
        open={Boolean(correction)}
        onClose={(_event, reason) => {
          if (reason === 'backdropClick' || timeEditorOpen) return;
          closeCorrection();
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>{correction?.workerName} {eventLabel(correction?.type)} 수정<IconButton onClick={closeCorrection} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseRoundedIcon /></IconButton></DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<ScheduleRoundedIcon />}
              onClick={openTimeEditor}
              sx={{ minHeight: 56, justifyContent: 'space-between', px: 2, borderColor: '#cbd5e1' }}
            >
              <Box component="span" sx={{ color: '#64748b', fontSize: '0.78rem' }}>변경 시간</Box>
              <Box component="strong" sx={{ color: '#0f172a', fontSize: '1rem' }}>{correctionTime || '시간 설정'}</Box>
            </Button>
            <TextField label="수정 사유" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} multiline minRows={3} placeholder="수동수정 사유를 반드시 입력해주세요." />
            <Alert severity="warning" sx={{ fontSize: '0.72rem' }}>원본 값과 수정자·수정시각·사유가 변경이력에 저장됩니다.</Alert>
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={closeCorrection}>취소</Button><Button variant="contained" startIcon={<CheckCircleRoundedIcon />} onClick={saveCorrection}>저장</Button></DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(correction) && timeEditorOpen}
        onClose={(_event, reason) => {
          if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
        }}
        disableEscapeKeyDown
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>시간 설정</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1 }}>
            <TextField
              select
              fullWidth
              label="시"
              value={timeDraft.hour}
              onChange={(event) => setTimeDraft((previous) => ({ ...previous, hour: event.target.value }))}
            >
              {hourOptions.map((hour) => <MenuItem key={hour} value={hour}>{hour}시</MenuItem>)}
            </TextField>
            <Typography sx={{ fontSize: '1.35rem', fontWeight: 900 }}>:</Typography>
            <TextField
              select
              fullWidth
              label="분"
              value={timeDraft.minute}
              onChange={(event) => setTimeDraft((previous) => ({ ...previous, minute: event.target.value }))}
            >
              {minuteOptions.map((minute) => <MenuItem key={minute} value={minute}>{minute}분</MenuItem>)}
            </TextField>
          </Stack>
          <Typography sx={{ mt: 1.5, color: '#64748b', fontSize: '0.74rem', lineHeight: 1.6 }}>
            일자는 현재 조회 중인 근태기록 일자로 고정되며 시간만 변경됩니다.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTimeEditorOpen(false)}>취소</Button>
          <Button variant="contained" onClick={applyCorrectionTime}>적용</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
