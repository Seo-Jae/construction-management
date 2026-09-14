import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { supabase } from '../supabaseClient';
import { filterScheduleHistory, scheduleHistoryYears } from '../utils/dashboardScheduleHistory.js';

const showDate = (value) => String(value || '').replace('T', ' ').slice(0, 16) || '-';

export default function DashboardScheduleHistoryDialog({ boardId, onClose }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error: loadError } = await supabase.from('admin_dashboard_site_history')
          .select('id, snapshot, archived_at').eq('board_id', boardId)
          .order('archived_at', { ascending: false }).order('id').range(offset, offset + 499);
        if (loadError) throw loadError;
        result.push(...(data || []));
        if (!data || data.length < 500) break;
      }
      if (active) setRows(result);
    };
    load().catch((e) => { if (active) setError(`과거 이력 조회 실패: ${e.message}`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [boardId]);
  const visible = filterScheduleHistory(rows, search, year);
  return <Dialog open onClose={onClose} fullWidth maxWidth="xl">
    <DialogTitle sx={{ fontWeight: 900 }}>현장설명·입찰 현황 — 과거 이력</DialogTitle>
    <DialogContent dividers>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
        <TextField size="small" label="건설사·현장·공종·참석자·비고 검색" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1 }} />
        <TextField select size="small" label="현설·입찰 연도" value={year} onChange={(e) => setYear(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="">전체 연도</MenuItem>{scheduleHistoryYears(rows).map((value) => <MenuItem key={value} value={value}>{value}년</MenuItem>)}
        </TextField>
        <Typography sx={{ alignSelf: 'center', whiteSpace: 'nowrap' }}>{visible.length}건</Typography>
      </Stack>
      <TableContainer sx={{ maxHeight: '65vh', overflow: 'auto' }}>
        <Table stickyHeader size="small" sx={{ minWidth: 1100 }}>
          <TableHead><TableRow>{['건설사명', '현장명', '공종', '현설일시', '입찰일시', '참석자', '비고', '보관일시'].map((label) => <TableCell key={label} sx={{ whiteSpace: 'nowrap', fontWeight: 800 }}>{label}</TableCell>)}</TableRow></TableHead>
          <TableBody>{loading ? <TableRow><TableCell colSpan={8} align="center">불러오는 중입니다.</TableCell></TableRow> : visible.length === 0 ? <TableRow><TableCell colSpan={8} align="center">{error ? '이력을 불러오지 못했습니다.' : '조회할 과거 이력이 없습니다.'}</TableCell></TableRow> : visible.map(({ id, snapshot: s, archived_at: archivedAt }) => <TableRow key={id}>
            {[s.constructionCompany, s.siteName || s.projectName, s.trade, showDate(s.briefingAt), showDate(s.bidAt), s.attendees, s.note,
              new Date(archivedAt).toLocaleString('ko-KR')].map((value, index) => <TableCell key={index} sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 260 }}>{value || '-'}</TableCell>)}
          </TableRow>)}</TableBody>
        </Table>
      </TableContainer>
    </DialogContent>
    <DialogActions><Button onClick={onClose}>닫기</Button></DialogActions>
  </Dialog>;
}
