import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, List, ListItemButton, ListItemText, Paper, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { supabase } from '../supabaseClient';
import ProgressInput from './ProgressInput.jsx';
import MultiProcessProgress from './MultiProcessProgress.jsx';
import { getFloorCellKeys, getProjectCellKeys } from '../utils/buildingUnits.js';

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// The parent keys this component by site and view so requests/selections never cross sites.
export default function TrialProgress({ projectName, buildingConfigs, comparison = false }) {
  const [processes, setProcesses] = useState([]);
  const [selectedProcess, setSelectedProcess] = useState('');
  const [newProcess, setNewProcess] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mutationLock = useRef(false);
  const [refresh, setRefresh] = useState(0);
  const [selectedCells, setSelectedCells] = useState(new Set());
  const [status, setStatus] = useState('작업완료');
  const [date, setDate] = useState(localToday);
  const [loaded, setLoaded] = useState({ process: '', rows: {}, ready: false });
  const processOptions = useMemo(() => processes.map((row) => row.process_type), [processes]);
  const validCells = useMemo(() => new Set(getProjectCellKeys(buildingConfigs)), [buildingConfigs]);
  const progress = loaded.process === selectedProcess ? loaded.rows : {};
  const ready = loaded.ready && loaded.process === selectedProcess;
  const completed = [...validCells].filter((key) => progress[key]?.status === '작업완료').length;

  useEffect(() => {
    let active = true;
    const load = async () => {
      setCatalogLoading(true);
      setCatalogError('');
      const { data, error: failure } = await supabase.from('project_processes_trial')
        .select('id, process_type').eq('project_name', projectName).order('id');
      if (!active) return;
      if (failure) setCatalogError(`임시 공종 목록을 불러오지 못했습니다. ${failure.message}`);
      else {
        setProcesses(data || []);
        setSelectedProcess((previous) => (data || []).some((row) => row.process_type === previous)
          ? previous : data?.[0]?.process_type || '');
      }
      setCatalogLoading(false);
    };
    load();
    return () => { active = false; };
  }, [projectName, refresh]);

  useEffect(() => {
    if (comparison || !selectedProcess) return undefined;
    let active = true;
    const load = async () => {
      setLoaded({ process: selectedProcess, rows: {}, ready: false });
      setError('');
      try {
        const rows = {};
        for (let from = 0; ; from += 1000) {
          const { data, error: failure } = await supabase.from('unit_progress_trial')
            .select('building, unit, status, completion_date')
            .eq('project_name', projectName).eq('process_type', selectedProcess)
            .order('building').order('unit').range(from, from + 999);
          if (failure) throw failure;
          for (const row of data || []) rows[`${row.building}-${row.unit}`] = row;
          if ((data || []).length < 1000) break;
        }
        if (active) setLoaded({ process: selectedProcess, rows, ready: true });
      } catch (failure) {
        if (active) setError(`실적을 불러오지 못했습니다. ${failure.message}`);
      }
    };
    load();
    return () => { active = false; };
  }, [projectName, selectedProcess, comparison, refresh]);

  const changeProcess = useCallback((value) => {
    setSelectedCells(new Set());
    setSelectedProcess(value);
  }, []);

  const addProcess = async (event) => {
    event.preventDefault();
    const name = newProcess.trim();
    if (!name || mutationLock.current) return;
    if (processOptions.includes(name)) { setError('이미 등록된 공종입니다.'); return; }
    mutationLock.current = true;
    setBusy(true);
    setError('');
    try {
      const { data, error: failure } = await supabase.from('project_processes_trial')
        .insert({ project_name: projectName, process_type: name }).select('id, process_type').single();
      if (failure) throw failure;
      setProcesses((previous) => [...previous, data]);
      changeProcess(name);
      setNewProcess('');
    } catch (failure) {
      setError(failure.code === '23505' ? '이미 등록된 공종입니다. 새로고침해 주세요.' : failure.message);
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  };

  const toggleCells = (keys) => {
    if (!ready || busy) return;
    const editable = keys.filter((key) => validCells.has(key) && !(status === '작업완료' && progress[key]?.status === '작업완료'));
    setSelectedCells((previous) => {
      const next = new Set(previous);
      const remove = editable.every((key) => next.has(key));
      for (const key of editable) { if (remove) next.delete(key); else next.add(key); }
      return next;
    });
  };

  const save = async () => {
    if (!ready || mutationLock.current || !selectedCells.size) return;
    if (!date || date > localToday()) { setError('오늘까지의 날짜를 선택해주세요.'); return; }
    const cells = [...selectedCells].filter((key) => validCells.has(key)).map((key) => {
      const index = key.lastIndexOf('-');
      return { building: key.slice(0, index), unit: key.slice(index + 1) };
    });
    mutationLock.current = true;
    setBusy(true);
    setError('');
    try {
      const { error: failure } = await supabase.rpc('save_trial_progress', {
        p_project: projectName, p_process: selectedProcess, p_status: status, p_date: date, p_cells: cells,
      });
      if (failure) throw failure;
      setSelectedCells(new Set());
      setRefresh((value) => value + 1);
    } catch (failure) { setError(`저장하지 못했습니다. ${failure.message}`); }
    finally { mutationLock.current = false; setBusy(false); }
  };

  if (catalogLoading && !processes.length) return <CircularProgress size={24} />;
  if (catalogError) return <Alert severity="error" action={<Button onClick={() => setRefresh((value) => value + 1)}>재시도</Button>}>{catalogError}</Alert>;
  if (comparison) return processOptions.length ? (
    <MultiProcessProgress projectName={projectName} buildingConfigs={buildingConfigs} processOptions={processOptions}
      progressTable="unit_progress_trial" targetTable="progress_targets_trial" />
  ) : <Alert severity="info">공종별 현황 입력(2)의 오른쪽 패널에서 공종을 먼저 추가해주세요.</Alert>;

  return <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 1 }}>
    {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
    <Box sx={{ display: 'flex', gap: 1, flex: 1, minHeight: 0, flexDirection: { xs: 'column', md: 'row' } }}>
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
        {selectedProcess && ready ? <ProgressInput
          projectName={projectName} progressTable="unit_progress_trial" targetTable="progress_targets_trial"
          preferenceScope={`trial:${projectName}`} buildingConfigs={buildingConfigs} processOptions={processOptions}
          selectedProcess={selectedProcess} setSelectedProcess={changeProcess}
          selectedCells={selectedCells} setSelectedCells={setSelectedCells}
          selectedStatusAction={status} setSelectedStatusAction={(value) => { setStatus(value); setSelectedCells(new Set()); }}
          actionName={status} protectCompleted={status === '작업완료'}
          progressDate={date} setProgressDate={setDate} handleSaveProgress={save}
          completedUnits={completed} totalUnits={validCells.size}
          progressPercentage={validCells.size ? (completed / validCells.size * 100).toFixed(1) : 0}
          unitProgressData={progress} unitProgressProjectName={projectName} unitProgressProcess={selectedProcess}
          handleGridCellClick={(key) => toggleCells([key])}
          handleFloorClick={(building, floor) => toggleCells(getFloorCellKeys(building, buildingConfigs[building], floor))}
        /> : selectedProcess ? <Box sx={{ p: 2 }}>{error ? <Button onClick={() => setRefresh((value) => value + 1)}>다시 불러오기</Button> : <CircularProgress size={24} />}</Box>
          : <Alert severity="info">오른쪽에서 사용할 공종을 추가해주세요.</Alert>}
        {busy && <Box sx={{ position: 'absolute', inset: 0, zIndex: 1500, bgcolor: '#ffffffaa', display: 'grid', placeItems: 'center' }}><CircularProgress size={24} /></Box>}
      </Box>
      <Paper variant="outlined" sx={{ width: { xs: '100%', md: 230 }, flexShrink: 0, p: 1.5, overflowY: 'auto' }}>
        <Typography fontWeight={700} sx={{ mb: 1 }}>공종 설정(2)</Typography>
        <Box component="form" onSubmit={addProcess} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField label="공종명" size="small" value={newProcess} onChange={(event) => setNewProcess(event.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} disabled={busy} />
          <Button type="submit" variant="outlined" startIcon={<AddIcon />} disabled={busy || !newProcess.trim()}>공종 추가</Button>
        </Box>
        <List dense>{processes.map((row) => <ListItemButton key={row.id} selected={selectedProcess === row.process_type} disabled={busy} onClick={() => changeProcess(row.process_type)}>
          <ListItemText primary={row.process_type} sx={{ overflowWrap: 'anywhere' }} />
        </ListItemButton>)}</List>
        <Button size="small" disabled={busy} onClick={() => { setSelectedCells(new Set()); setRefresh((value) => value + 1); }}>새로고침</Button>
      </Paper>
    </Box>
  </Box>;
}
