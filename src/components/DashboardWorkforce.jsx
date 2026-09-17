import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import { supabase } from '../supabaseClient';
import { getDashboardReportPeriod } from '../utils/dashboardReportTasks.js';
import { summarizeWorkforce, workforceMonths } from '../utils/workforceSummary.js';

export default function DashboardWorkforce({ projectName, canView }) {
  const { today, month: currentMonth } = getDashboardReportPeriod();
  const [endMonth, setEndMonth] = useState(currentMonth);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  useEffect(() => {
    if (!canView || !projectName) return;
    let active = true;
    const load = async () => {
      try {
        const rows = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error: queryError } = await supabase.from('daily_reports')
            .select('project_name,date,workers').eq('project_name', projectName)
            .order('date').range(offset, offset + 499);
          if (!active) return;
          if (queryError) throw queryError;
          rows.push(...(data || []));
          if (!data || data.length < 500) break;
        }
        setResult({ endMonth, refresh, values: summarizeWorkforce(rows, projectName, workforceMonths(endMonth), today) });
        setError(false);
      } catch { if (active) setError(true); }
    };
    load();
    return () => { active = false; };
  }, [projectName, canView, endMonth, currentMonth, today, refresh]);
  useEffect(() => {
    const reload = () => setRefresh((value) => value + 1);
    window.addEventListener('daily-reports-changed', reload);
    window.addEventListener('focus', reload);
    return () => {
      window.removeEventListener('daily-reports-changed', reload);
      window.removeEventListener('focus', reload);
    };
  }, []);
  const values = result?.endMonth === endMonth && result?.refresh === refresh ? result.values : null;
  const move = (amount) => {
    const date = new Date(Date.UTC(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5)) - 1 + amount, 1));
    setEndMonth(date.toISOString().slice(0, 7)); setError(false);
  };
  const maximum = Math.max(4, ...(values || []).flatMap((row) => [row.total, row.added]));
  const step = Math.ceil(maximum / 4);
  const y = (value) => 220 - value / (step * 4) * 180;
  const x = (index) => 44 + index * 42;
  return <Paper variant="outlined" className="main-overview-placeholder main-overview-workforce">
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, pb: 1, borderBottom: '1px solid #e2e8f0' }}>
      <GroupsOutlinedIcon sx={{ color: '#00a5b5', fontSize: 20 }} />
      <Typography component="h2" sx={{ flex: 1, fontSize: 15, fontWeight: 700 }}>인력 현황</Typography>
      <IconButton size="small" aria-label="인력 현황 새로고침" disabled={!canView} onClick={() => { setError(false); setRefresh((value) => value + 1); }}><RefreshIcon sx={{ fontSize: 18 }} /></IconButton>
    </Box>
    {!canView ? <Typography sx={{ py: 3, fontSize: 12 }}>인력 현황 조회 권한이 없습니다.</Typography>
      : error ? <Alert severity="error">인력 현황을 불러오지 못했습니다. 새로고침해 주세요.</Alert>
      : !values ? <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>
      : <>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', pt: 2 }}>
          {[['투입 인원', '#34c98a'], ['신규 투입', '#4388ff']].map(([label, color]) => <Typography key={label} sx={{ fontSize: 11, color: '#64748b' }}><Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, mr: 0.4, borderRadius: 0.5, bgcolor: color }} />{label}</Typography>)}
        </Box>
        <Box sx={{ flex: 1, minHeight: 120, display: 'flex', alignItems: 'center' }}>
          <svg viewBox="0 0 286 252" width="100%" style={{ height: '100%', maxHeight: 230 }} role="img" aria-label={`${projectName} 월별 투입 인원 추이. 상세 보기에서 월별 수치를 확인할 수 있습니다.`}>
            {Array.from({ length: 5 }, (_, index) => <g key={index}><line x1="28" x2="276" y1={y(index * step)} y2={y(index * step)} stroke="#e2e8f0" /><text x="22" y={y(index * step) + 4} textAnchor="end" fontSize="10" fill="#64748b">{index * step}</text></g>)}
            {values.map((row, index) => <g key={row.month}><title>{`${row.month}: 투입 ${row.total}명, 신규 투입 ${row.added}명`}</title><rect x={x(index) - 4} y={y(row.added)} width="8" height={220 - y(row.added)} fill="#4388ff" /><text x={x(index)} y="241" textAnchor="middle" fontSize="9" fill="#64748b">{row.month.slice(2).replace('-', '.')}</text></g>)}
            <polyline fill="none" stroke="#34c98a" strokeWidth="2" points={values.map((row, index) => `${x(index)},${y(row.total)}`).join(' ')} />
            {values.map((row, index) => <circle key={row.month} cx={x(index)} cy={y(row.total)} r="3" fill="#fff" stroke="#34c98a"><title>{`${row.month}: ${row.total}명`}</title></circle>)}
          </svg>
        </Box>
        <Typography sx={{ fontSize: 11, color: '#64748b', mb: 1 }}>출력일보 기준 · 당월은 오늘까지 집계</Typography>
        <Button variant="outlined" fullWidth onClick={() => setDetailOpen(true)}>상세 보기</Button>
      </>}
    {canView && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 1 }}><IconButton aria-label="인력 현황 이전 6개월" onClick={() => move(-6)}><ChevronLeftIcon /></IconButton><Typography sx={{ fontSize: 11 }}>{endMonth}</Typography><IconButton aria-label="인력 현황 다음 6개월" disabled={endMonth >= currentMonth} onClick={() => move(6)}><ChevronRightIcon /></IconButton></Box>}
    <Dialog open={detailOpen && canView} onClose={() => setDetailOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontSize: 20, fontWeight: 800 }}>인력 현황 · {projectName}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ borderCollapse: 'collapse', '& .MuiTableCell-root': { border: '1px solid #cbd5e1', fontSize: '14px !important', py: 1.25, px: 1.5, whiteSpace: 'nowrap' }, '& .MuiTableCell-head': { bgcolor: '#f8fafc', fontWeight: 700 } }}>
            <TableHead><TableRow>{['월', '일평균 투입 인원', '총 투입 인원', '신규 투입 인원'].map((label) => <TableCell key={label} align="center">{label}</TableCell>)}</TableRow></TableHead>
            <TableBody>{values?.map((row) => <TableRow key={row.month}>
              <TableCell align="center">{row.month}</TableCell>
              <TableCell align="right">{row.average.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}명</TableCell>
              <TableCell align="right">{row.cumulative.toLocaleString()}명·일</TableCell>
              <TableCell align="right">{row.added.toLocaleString()}명</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </Box>
      </DialogContent><DialogActions><Button onClick={() => setDetailOpen(false)}>닫기</Button></DialogActions>
    </Dialog>
  </Paper>;
}
