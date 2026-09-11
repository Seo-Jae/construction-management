import { useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { supabase } from '../supabaseClient';
import { isMaterialAliasSchemaMissing, loadMaterialAliasPages, normalizeMaterialAlias } from '../utils/materialAliases.js';

const statusLabels = { pending: '담당자 추천 후보', approved: '공통 검색어', rejected: '연결 해제' };

export default function MaterialAliasDialog({ projectName, proposal, review = false, onClose, onChanged }) {
  const [keyword, setKeyword] = useState(proposal?.keyword || '');
  const [sameMaterial, setSameMaterial] = useState(false);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(review);
  const [message, setMessage] = useState(null);
  const showError = (error) => setMessage({ severity: 'error', text: isMaterialAliasSchemaMissing(error)
    ? '공동 검색어 기능이 아직 준비되지 않았습니다. 관리자에게 문의해주세요.' : error.message });

  const loadReviews = async () => {
    setLoading(true);
    try {
      const data = await loadMaterialAliasPages(supabase, 'list_material_alias_reviews_v185', { p_project_name: projectName });
      setRows(data);
      setSelected([]);
    } catch (error) { showError(error); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!review) return undefined;
    let active = true;
    loadMaterialAliasPages(supabase, 'list_material_alias_reviews_v185', { p_project_name: projectName })
      .then((data) => { if (active) setRows(data); })
      .catch((error) => { if (active) showError(error); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectName, review]);

  const submit = async () => {
    if (busy || !sameMaterial || !normalizeMaterialAlias(keyword)) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('propose_material_alias_v185', {
        p_project_name: projectName, p_material_id: proposal.material.materialId || proposal.material.id,
        p_keyword: keyword.trim(),
      });
      if (error) throw error;
      onChanged('검색어를 추천 후보로 등록했습니다. 다른 담당자도 검색할 수 있습니다.');
      onClose();
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  };

  const reviewSelected = async (status) => {
    if (busy || !selected.length) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('review_material_aliases_v185', {
        p_project_name: projectName, p_ids: selected, p_status: status,
      });
      if (error) throw error;
      setMessage({ severity: 'success', text: `${data}개 검색어를 ${status === 'approved' ? '승인' : '해제'}했습니다.` });
      onChanged();
      await loadReviews();
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  };

  const report = async (id) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('report_material_alias_v185', { p_project_name: projectName, p_alias_id: id });
      if (error) throw error;
      setMessage({ severity: 'success', text: '잘못된 연결로 신고했습니다. 관리자가 검토합니다.' });
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  };

  const visibleRows = rows.filter((row) => (!filter || row.status === filter)
    && normalizeMaterialAlias(`${row.keyword} ${row.standard_name} ${row.specification} ${row.process_name}`)
      .includes(normalizeMaterialAlias(search)));
  return <Dialog open onClose={() => !busy && onClose()} fullWidth maxWidth={review ? 'md' : 'sm'}>
    <DialogTitle sx={{ fontWeight: 900 }}>{review ? `공동 검색어 검토 · ${projectName}` : '같은 자재의 다른 검색어 연결'}</DialogTitle>
    <DialogContent dividers>
      {message && <Alert severity={message.severity} sx={{ mb: 2 }}>{message.text}</Alert>}
      {review ? <Stack spacing={1.5}>
        <Alert severity="info">이 현장에서 등록한 검색어를 검토합니다. 승인하면 공통 검색어로 표시되며, 해제하면 추천에서 제외됩니다. 서로 다른 규격·용도의 자재를 같은 뜻으로 연결하지 않도록 확인해주세요.</Alert>
        <Stack direction="row" flexWrap="wrap" useFlexGap gap={1}>
          <TextField size="small" label="검색어·품명 검색" value={search} onChange={(e) => { setSearch(e.target.value); setSelected([]); }} />
          <TextField select size="small" label="상태" value={filter} onChange={(e) => { setFilter(e.target.value); setSelected([]); }} slotProps={{ select: { native: true } }}>
            <option value="">전체</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </TextField>
          <Button disabled={busy || loading} onClick={loadReviews}>새로고침</Button>
        </Stack>
        <FormControlLabel label={`전체 선택 (최대 500개) · ${selected.length}개 선택`} control={<Checkbox disabled={busy || loading || !visibleRows.length}
          checked={visibleRows.length > 0 && selected.length === Math.min(500, visibleRows.length)}
          onChange={(_, checked) => setSelected(checked ? visibleRows.slice(0, 500).map((row) => row.id) : [])} />} />
        <Box sx={{ maxHeight: 420, overflowY: 'auto' }}>
          {loading ? <Typography>검색어를 불러오는 중입니다.</Typography> : !visibleRows.length ? <Typography>해당 검색어가 없습니다.</Typography> : visibleRows.map((row) =>
            <Paper key={row.id} variant="outlined" sx={{ p: 1, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox disabled={busy || (!selected.includes(row.id) && selected.length >= 500)} checked={selected.includes(row.id)}
                onChange={(_, checked) => setSelected((current) => checked ? [...current, row.id] : current.filter((id) => id !== row.id))} />
              <Box sx={{ minWidth: 0, overflowWrap: 'anywhere', flex: 1 }}>
                <Typography sx={{ fontWeight: 800 }}>{row.keyword} → {row.standard_name}</Typography>
                <Typography variant="body2">{row.specification || '규격 없음'} · {row.process_name || '-'}</Typography>
                <Chip size="small" label={statusLabels[row.status]} />
                {Number(row.report_count) > 0 && <Chip size="small" color="warning" label={`잘못된 연결 신고 ${row.report_count}건`} sx={{ ml: 1 }} />}
              </Box>
            </Paper>)}
        </Box>
      </Stack> : <Stack spacing={2}>
        <Typography sx={{ fontWeight: 800 }}>{proposal.material.standard_name} · {proposal.material.specification || '규격 없음'} · {proposal.material.unit || '-'}</Typography>
        <Alert severity="info">약칭·현장 표현처럼 같은 자재를 뜻하는 단어를 연결해주세요. 단순히 함께 쓰는 자재나 대체품은 연결하지 않습니다. 검색어는 다른 현장에도 공유됩니다.</Alert>
        <TextField label="다른 검색어" value={keyword} disabled={busy} onChange={(e) => setKeyword(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} fullWidth />
        <FormControlLabel control={<Checkbox checked={sameMaterial} disabled={busy} onChange={(_, checked) => setSameMaterial(checked)} />} label="이 검색어가 선택한 자재를 뜻하는지 확인했습니다." />
        {!!proposal.material.sharedAliases?.length && <Box>
          <Typography variant="body2" sx={{ mb: 1 }}>이 자재에 연결된 공동 검색어</Typography>
          <Stack spacing={1} sx={{ maxHeight: 180, overflowY: 'auto' }}>{proposal.material.sharedAliases.map((alias) => <Paper key={alias.id} variant="outlined" sx={{ p: 1 }}>
            <Typography variant="body2">{alias.keyword} · {statusLabels[alias.status]}</Typography>
            <Button size="small" disabled={busy} onClick={() => report(alias.id)}>연결이 맞지 않아요</Button>
          </Paper>)}</Stack>
        </Box>}
      </Stack>}
    </DialogContent>
    <DialogActions>
      <Button disabled={busy} onClick={onClose}>{review ? '닫기' : '건너뛰기'}</Button>
      {review ? <>
        <Button disabled={busy || loading || !selected.length} onClick={() => reviewSelected('rejected')}>선택 연결 해제</Button>
        <Button variant="contained" disabled={busy || loading || !selected.length} onClick={() => reviewSelected('approved')}>선택 검색어 승인</Button>
      </> : <Button variant="contained" disabled={busy || !sameMaterial || !normalizeMaterialAlias(keyword)} onClick={submit}>검색어 연결</Button>}
    </DialogActions>
  </Dialog>;
}
