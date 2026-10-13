import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, ButtonBase, Dialog, DialogContent, DialogTitle, IconButton,
  Checkbox, FormControlLabel, Snackbar, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import FittedBuildingPreview from './FittedBuildingPreview.jsx';
import { buildSetupConfig, newBuildingSetupDraft, newSetupLine } from '../utils/buildingSetupDraft.js';
import { countUniqueUnits } from '../utils/buildingUnits.js';
import { supabase } from '../supabaseClient';
import { createSetupSaveChanges, restoreSetupBuilding, stageSetupBuilding } from '../utils/buildingSetupPersistence.js';


export default function BuildingInitialSetupDialog({ open, onClose, projectName, onSaved }) {
  const [buildings, setBuildings] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(newBuildingSetupDraft);
  const [error, setError] = useState('');
  const [specialLine, setSpecialLine] = useState(null);
  const [selectedLine, setSelectedLine] = useState(null);
  const [showAllBuildings, setShowAllBuildings] = useState(false);
  const [saveNotice, setSaveNotice] = useState({ open: false, key: 0 });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data, error } = await supabase.from('building_settings').select('building_name,config_json').eq('project_name', projectName);
        if (error) throw error;
        if (!active) return;
        const loaded = data.map(restoreSetupBuilding).sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
        setBuildings(loaded);
        setSelectedId(loaded[0]?.id || null);
        setDraft(loaded[0] ? structuredClone(loaded[0]) : newBuildingSetupDraft());
      } catch (error) {
        if (active) { setError(`골구도를 불러오지 못했습니다. ${error.message}`); setLoadFailed(true); }
      } finally { if (active) setLoading(false); }
    };
    load();
    return () => { active = false; };
  }, [projectName]);
  const selectLine = (index) => {
    setSelectedLine(index);
    setSpecialLine((previous) => draft.lines[index].specialFloors.length > 0 || previous === index ? index : null);
  };
  let config = null;
  try { config = draft.unsupported ? draft.config : buildSetupConfig(draft); } catch { /* Invalid draft is reported when saving. */ }
  const currentPreview = config ? { id: selectedId || 'draft', name: draft.name.trim() || '동명 미입력', config } : null;
  const previewBuildings = showAllBuildings
    ? buildings.map(building => building.id === selectedId && currentPreview ? currentPreview : building)
    : currentPreview ? [currentPreview] : [];
  if (showAllBuildings && !selectedId && currentPreview) previewBuildings.push(currentPreview);
  const previewUnitCount = previewBuildings.reduce((total, building) => total + countUniqueUnits(building.config), 0);
  const updateLine = (index, field, value) => {
    const nextValue = field === 'type' ? value.toUpperCase() : value;
    setDraft((previous) => ({ ...previous, lines: previous.lines.map((line, i) => i === index ? { ...line, [field]: nextValue } : line) }));
    setError('');
  };
  const updateSpecial = (index, field, value) => {
    const nextValue = field === 'type' ? value.toUpperCase() : value;
    updateLine(specialLine, 'specialFloors', draft.lines[specialLine].specialFloors.map((special, i) => i === index ? { ...special, [field]: nextValue, ...(field === 'excluded' && value ? { mergeLines: '' } : {}) } : special));
  };
  const updateDraft = (field) => (event) => {
    setDraft((previous) => ({ ...previous, [field]: event.target.value }));
    setError('');
  };
  const startNew = () => {
    try { setBuildings(stageSetupBuilding(buildings, draft, selectedId)); }
    catch (error) { setError(error.message); return; }
    setSelectedId(null);
    setSelectedLine(null);
    setSpecialLine(null);
    setDraft(newBuildingSetupDraft());
    setError('');
  };
  const selectBuilding = building => {
    if (building.id === selectedId) return;
    try { setBuildings(stageSetupBuilding(buildings, draft, selectedId)); }
    catch (error) { setError(error.message); return; }
    setSelectedId(building.id);
    setDraft(structuredClone(building));
    setSelectedLine(null);
    setSpecialLine(null);
    setError('');
  };
  const saveBuildings = async (closeAfterSave = false) => {
    if (savingRef.current || loading || loadFailed) return;
    setSaveNotice((previous) => ({ ...previous, open: false }));
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const staged = stageSetupBuilding(buildings, draft, selectedId);
      if (!closeAfterSave && !staged.length) throw new Error('동명과 라인 정보를 입력해주세요.');
      const changes = createSetupSaveChanges(staged);
      let saved = staged;
      if (changes.length) {
        const { data, error } = await supabase.rpc('save_building_setup_v199', { p_project: projectName, p_changes: changes });
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error('저장 결과를 확인하지 못했습니다. 다시 열어 확인해주세요.');
        saved = data.map(restoreSetupBuilding).sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
        onSaved?.(projectName, Object.fromEntries(saved.map(building => [building.name, building.config])));
      }
      setBuildings(saved);
      const current = saved.find(building => building.name === draft.name.trim());
      if (current) { setSelectedId(current.id); setDraft(structuredClone(current)); }
      if (closeAfterSave) onClose();
      else setSaveNotice(previous => ({ open: true, key: previous.key + 1 }));
    } catch (error) {
      setError(error.code === 'PGRST202' ? '골구도 저장 기능의 DB 설정이 필요합니다. 입력 내용은 유지됩니다.' : `저장하지 못했습니다. ${error.message}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const handleClose = () => {
    if (savingRef.current) return;
    if (loading || loadFailed) onClose();
    else saveBuildings(true);
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={false}
      aria-labelledby="building-initial-setup-title"
      slotProps={{
        paper: {
          sx: {
            width: 'min(1880px, calc(100vw - 32px))',
            maxWidth: 'calc(100vw - 32px)',
            height: 'min(1066px, calc(100dvh - 32px))',
            maxHeight: 'calc(100dvh - 32px)',
            m: 2,
          },
        },
      }}
    >
      <DialogTitle
        id="building-initial-setup-title"
        sx={{ py: 1.5, pr: 6, borderBottom: '1px solid #e2e8f0', color: '#0f172a', fontSize: '1.05rem', fontWeight: 900 }}
      >
        {buildings.some(building => building.originalConfig) ? '골구도 설정' : '골구도 초기설정'}
        <Typography component="span" sx={{ ml: 2, color: '#64748b', fontSize: '0.8rem' }}>{projectName}</Typography>
        <IconButton aria-label="골구도 저장 후 닫기" disabled={saving} onClick={handleClose} sx={{ position: 'absolute', top: 8, right: 8 }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      {loading && <Alert severity="info">골구도를 불러오는 중입니다.</Alert>}
      {error && <Alert severity="error" action={<Button color="inherit" size="small" disabled={saving} onClick={() => {
        if (loadFailed || window.confirm('저장하지 못한 내용이 사라집니다. 저장하지 않고 닫으시겠습니까?')) onClose();
      }}>저장하지 않고 닫기</Button>}>{error}</Alert>}
      {draft.unsupported && <Alert severity="warning">이 동은 별도 골구도 형식으로 기존 현장관리에서 수정할 수 있습니다.</Alert>}
      <DialogContent sx={{ p: 0, minHeight: 0, overflow: 'auto' }}>
        <Box component="fieldset" disabled={loading || saving || loadFailed} sx={{ m: 0, p: 0, border: 0,
          height: { xs: 'auto', md: '100%' }, minWidth: 0, display: 'grid',
          gridTemplateAreas: { xs: '"buildings" "settings" "preview"', md: '"buildings settings" "buildings preview"', lg: '"buildings settings preview"' },
          gridTemplateColumns: { xs: '1fr', md: '210px minmax(0, 1fr)', lg: '230px minmax(420px, 1fr) minmax(0, 1.5fr)' },
          gridTemplateRows: { xs: '200px auto 420px', md: 'minmax(300px, 1fr) minmax(300px, 1fr)', lg: 'minmax(0, 1fr)' },
        }}>
          <Box component="aside" aria-label="설정한 동 목록" sx={{ gridArea: 'buildings', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: '#33414d', color: '#ffffff', borderRight: '1px solid #26343f', boxShadow: '3px 0 10px #0f172a14', zIndex: 1 }}>
            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #ffffff26', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 900 }}>동 목록</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#cbd5e1' }}>{buildings.length}개</Typography>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1 }}>
              {buildings.map(building => (
                <ButtonBase
                  key={building.id}
                  aria-pressed={building.id === selectedId}
                  onClick={() => selectBuilding(building)}
                  sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', textAlign: 'left', p: 1.5, mb: 1, borderRadius: 1, border: '1px solid', borderColor: building.id === selectedId ? '#cde7ec' : '#ffffff26', bgcolor: building.id === selectedId ? '#cde7ec' : '#ffffff08', color: building.id === selectedId ? '#143648' : '#ffffff', '&:hover': { bgcolor: building.id === selectedId ? '#cde7ec' : '#ffffff18' }, '&.Mui-focusVisible': { outline: '2px solid #38bdf8', outlineOffset: -2 } }}
                >
                  <Typography component="span" sx={{ fontWeight: 800, fontSize: '0.85rem', overflowWrap: 'anywhere' }}>{building.name}</Typography>
                  <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75, fontSize: '0.75rem', opacity: 0.85 }}>
                    <span>최고 {building.config.floors}층</span><span>· {building.lines.length}라인</span><span>· {countUniqueUnits(building.config)}세대</span>
                  </Box>
                </ButtonBase>
              ))}
              {buildings.length === 0 && <Typography sx={{ py: 4, textAlign: 'center', color: '#cbd5e1', fontSize: '0.8rem' }}>추가한 동이 없습니다.</Typography>}
            </Box>
          </Box>
          <Box sx={{ gridArea: 'preview', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, borderLeft: { md: '1px solid #e2e8f0' }, borderTop: { xs: '1px solid #e2e8f0', md: 0 } }}>
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Typography sx={{ fontWeight: 900, fontSize: '0.85rem' }}>골구도 미리보기</Typography>
              <FormControlLabel sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: '0.8rem' } }} control={<Checkbox size="small" checked={showAllBuildings} onChange={event => setShowAllBuildings(event.target.checked)} sx={{ p: 0.5 }} />} label="동 전체보기" />
              <Typography sx={{ ml: 'auto', color: '#64748b', fontSize: '0.75rem' }}>
                {previewBuildings.length > 0 ? `${showAllBuildings ? previewBuildings.length + '개 동 · ' : ''}${previewUnitCount}세대` : '라인 정보를 입력해주세요'}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, minHeight: 120, overflow: 'hidden', bgcolor: '#f8fafc' }}>
              {previewBuildings.length > 0 ? (
                <FittedBuildingPreview key={showAllBuildings ? 'all' : selectedId || 'draft'} buildings={previewBuildings} />
              ) : (
                <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <Typography sx={{ color: '#94a3b8', fontSize: '0.85rem' }}>동 설정에서 층과 호수를 입력하면 골구도가 표시됩니다.</Typography>
                </Box>
              )}
            </Box>
          </Box>
            <Box sx={{ gridArea: 'settings', minWidth: 0, minHeight: 0, height: { xs: 'min(560px, 70dvh)', md: '100%' }, bgcolor: '#ffffff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 900 }}>동 설정</Typography>
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={startNew}>동 추가</Button>
              </Box>
              <Box component="fieldset" disabled={Boolean(draft.unsupported)} sx={{ m: 0, border: 0, minWidth: 0, flex: 1, minHeight: 0, overflowY: 'auto', px: 2, pt: 1.5, pb: 2 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1.5 }}>
                <TextField size="small" label="동 명칭" placeholder="예: 101동" value={draft.name} onChange={updateDraft('name')} slotProps={{ input: { readOnly: Boolean(draft.originalConfig) } }} />
                <Button variant="contained" startIcon={<AddRoundedIcon />} disabled={draft.lines.length >= 30} onClick={() => {
                  setSelectedLine(draft.lines.length);
                  setSpecialLine(null);
                  setDraft((previous) => ({ ...previous, lines: [...previous.lines, newSetupLine()] }));
                }}>라인 추가</Button>
              </Box>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 560, '& td, & th': { px: 0.5, fontSize: '0.78rem', border: '1px solid #94a3b8' }, '& .MuiInputBase-input, & .MuiButton-root': { fontSize: '0.78rem' }, '& thead .MuiTableCell-root': { textAlign: 'center', bgcolor: '#002060', color: '#ffffff', fontWeight: 800 } }}>
                  <TableHead><TableRow><TableCell>라인</TableCell><TableCell>최고층</TableCell><TableCell>필로티 층</TableCell><TableCell>타입</TableCell><TableCell>특수층</TableCell></TableRow></TableHead>
                  <TableBody>{draft.lines.map((line, index) => (
                    <TableRow
                      key={index}
                      selected={selectedLine === index}
                      tabIndex={0}
                      onClick={() => selectLine(index)}
                      onFocusCapture={() => selectLine(index)}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          selectLine(index);
                        }
                      }}
                      sx={{ cursor: 'pointer', '&.Mui-selected, &.Mui-selected:hover': { bgcolor: '#dcfce7' } }}
                    >
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{index + 1}라인</TableCell>
                      <TableCell><TextField size="small" type="number" value={line.floors} onChange={(event) => updateLine(index, 'floors', event.target.value)} slotProps={{ htmlInput: { min: 1, max: 100, 'aria-label': (index + 1) + '라인 최고층' } }} sx={{ width: 85 }} /></TableCell>
                      <TableCell><TextField size="small" placeholder="예: 1,2" value={line.piloti} onChange={(event) => updateLine(index, 'piloti', event.target.value)} slotProps={{ htmlInput: { 'aria-label': (index + 1) + '라인 필로티 층' } }} sx={{ width: 100 }} /></TableCell>
                      <TableCell><TextField size="small" placeholder="예: 84A" value={line.type} onChange={(event) => updateLine(index, 'type', event.target.value)} slotProps={{ htmlInput: { 'aria-label': (index + 1) + '라인 타입' } }} sx={{ width: 100 }} /></TableCell>
                      <TableCell><Button size="small" onClick={(event) => { event.stopPropagation(); setSelectedLine(index); setSpecialLine(index); }}>특수층 설정 ({line.specialFloors.length})</Button></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </Box>
              {specialLine !== null && selectedLine === specialLine && draft.lines[specialLine] && (
                <Box sx={{ mt: 1.5, p: 1.25, border: '1px solid #e2e8f0', borderRadius: 1 }}>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 900 }}>{specialLine + 1}라인에 특수층이 있나요?</Typography>
                  <Typography sx={{ color: '#64748b', fontSize: '0.75rem', my: 0.75 }}>타입 변경, 세대 제외 또는 이웃한 라인 병합을 설정합니다. 병합은 한쪽 라인에서만 지정해도 됩니다.</Typography>
                  {draft.lines[specialLine].specialFloors.map((special, index) => (
                    <Box key={index} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
                      <TextField size="small" label="층" type="number" value={special.floor} onChange={(event) => updateSpecial(index, 'floor', event.target.value)} sx={{ width: 85 }} />
                      <TextField size="small" label="변경 타입" disabled={special.excluded} value={special.type} onChange={(event) => updateSpecial(index, 'type', event.target.value)} sx={{ width: 110 }} />
                      <TextField size="small" label="함께 합칠 라인" placeholder="예: 2 또는 2,3" disabled={special.excluded} value={special.mergeLines || ''} onChange={(event) => updateSpecial(index, 'mergeLines', event.target.value)} sx={{ width: 155 }} />
                      <FormControlLabel control={<Checkbox checked={special.excluded} onChange={(event) => updateSpecial(index, 'excluded', event.target.checked)} size="small" />} label="세대 제외" />
                      <Button size="small" onClick={() => updateLine(specialLine, 'specialFloors', draft.lines[specialLine].specialFloors.filter((_, i) => i !== index))}>삭제</Button>
                    </Box>
                  ))}
                  <Button size="small" onClick={() => updateLine(specialLine, 'specialFloors', [...draft.lines[specialLine].specialFloors, { floor: '', type: '', excluded: false }])}>특수층 추가</Button>
                  <Typography sx={{ color: '#64748b', fontSize: '0.75rem', mt: 0.75 }}>예: 20층 1라인에서 2라인을 지정하면 2001·2002호가 2001호 한 세대로 합쳐집니다. 같은 타입만 지정하면 각각의 세대로 유지됩니다.</Typography>
                </Box>
              )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 2, py: 1.5, flexWrap: 'wrap', flexShrink: 0, borderTop: '1px solid #e2e8f0', bgcolor: '#ffffff' }}>
                <Typography sx={{ color: '#64748b', fontSize: '0.75rem' }}>창을 닫으면 변경 내용이 현장에 저장됩니다.</Typography>
                <Button variant="contained" disabled={saving || loading || loadFailed || Boolean(draft.unsupported)} onClick={() => saveBuildings()}>{saving ? '저장 중…' : draft.originalConfig ? '수정' : '저장'}</Button>
              </Box>
            </Box>
        </Box>
      </DialogContent>
      <Snackbar
        key={saveNotice.key}
        open={open && saveNotice.open}
        autoHideDuration={2500}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setSaveNotice((previous) => ({ ...previous, open: false }));
        }}
      >
        <Alert severity="success" variant="filled">저장되었습니다.</Alert>
      </Snackbar>
    </Dialog>
  );
}
