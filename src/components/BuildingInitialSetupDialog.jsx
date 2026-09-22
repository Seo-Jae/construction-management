import { useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogContent, DialogTitle, IconButton,
  Checkbox, FormControlLabel, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import FittedBuildingPreview from './FittedBuildingPreview.jsx';
import { buildSetupConfig, newBuildingSetupDraft, newSetupLine } from '../utils/buildingSetupDraft.js';
import { countUniqueUnits } from '../utils/buildingUnits.js';


export default function BuildingInitialSetupDialog({ open, onClose, projectName }) {
  const [buildings, setBuildings] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(newBuildingSetupDraft);
  const [error, setError] = useState('');
  const [specialLine, setSpecialLine] = useState(null);
  let config = null;
  let configError = '';
  try { config = buildSetupConfig(draft); } catch (error) { configError = error.message; }
  const updateLine = (index, field, value) => {
    setDraft((previous) => ({ ...previous, lines: previous.lines.map((line, i) => i === index ? { ...line, [field]: value } : line) }));
    setError('');
  };
  const updateSpecial = (index, field, value) => {
    updateLine(specialLine, 'specialFloors', draft.lines[specialLine].specialFloors.map((special, i) => i === index ? { ...special, [field]: value } : special));
  };
  const updateDraft = (field) => (event) => {
    setDraft((previous) => ({ ...previous, [field]: event.target.value }));
    setError('');
  };
  const startNew = () => {
    setSelectedId(null);
    setSpecialLine(null);
    setDraft(newBuildingSetupDraft());
    setError('');
  };
  const applyDraft = () => {
    const name = draft.name.trim();
    if (!name) return setError('동명을 입력해주세요.');
    if (!config) return setError(configError);
    if (buildings.some((building) => building.id !== selectedId && building.name.replace(/동$/, '') === name.replace(/동$/, ''))) {
      return setError('같은 동명이 이미 목록에 있습니다.');
    }
    const id = selectedId || crypto.randomUUID();
    const next = { ...structuredClone(draft), name, id, config };
    setBuildings((previous) => selectedId
      ? previous.map((building) => building.id === selectedId ? next : building)
      : [...previous, next]);
    setSelectedId(id);
    setDraft(next);
    setError('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      aria-labelledby="building-initial-setup-title"
      slotProps={{
        paper: {
          sx: {
            width: 'min(1560px, calc(100vw - 32px))',
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
        골구도 초기설정
        <Typography component="span" sx={{ ml: 2, color: '#64748b', fontSize: '0.8rem' }}>{projectName}</Typography>
        <IconButton aria-label="초기설정 닫기" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8 }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0, minHeight: 0, overflow: 'auto' }}>
        <Box sx={{
          height: '100%', minWidth: 0, display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 3fr) minmax(300px, 2fr)' },
          gridTemplateRows: { xs: 'minmax(520px, 1fr) 280px', md: 'minmax(0, 1fr)' },
        }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, borderRight: { md: '1px solid #e2e8f0' } }}>
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 1 }}>
              <Typography sx={{ fontWeight: 900, fontSize: '0.85rem' }}>골구도 미리보기</Typography>
              <Typography sx={{ color: '#64748b', fontSize: '0.75rem' }}>
                {config ? countUniqueUnits(config) + '세대' : '라인 정보를 입력해주세요'}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, minHeight: 120, overflow: 'hidden', bgcolor: '#f8fafc' }}>
              {config ? (
                <FittedBuildingPreview name={draft.name.trim() || '동명 미입력'} config={config} />
              ) : (
                <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <Typography sx={{ color: '#94a3b8', fontSize: '0.85rem' }}>하단에서 층과 호수를 설정하면 골구도가 표시됩니다.</Typography>
                </Box>
              )}
            </Box>
            <Box sx={{ p: 2, borderTop: '1px solid #e2e8f0', bgcolor: '#ffffff', maxHeight: '50%', overflowY: 'auto' }}>
              <Typography sx={{ mb: 1.5, fontSize: '0.85rem', fontWeight: 900 }}>{selectedId ? '동 설정 수정' : '새 동 설정'}</Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1.5 }}>
                <TextField size="small" label="동 명칭" placeholder="예: 101동" value={draft.name} onChange={updateDraft('name')} />
                <Button startIcon={<AddRoundedIcon />} disabled={draft.lines.length >= 30} onClick={() => setDraft((previous) => ({ ...previous, lines: [...previous.lines, newSetupLine()] }))}>라인 추가</Button>
              </Box>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 560, '& td, & th': { px: 0.5, fontSize: '0.78rem' } }}>
                  <TableHead><TableRow><TableCell>라인</TableCell><TableCell>최고층</TableCell><TableCell>필로티 층</TableCell><TableCell>타입</TableCell><TableCell>특수층</TableCell></TableRow></TableHead>
                  <TableBody>{draft.lines.map((line, index) => (
                    <TableRow key={index}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{index + 1}라인</TableCell>
                      <TableCell><TextField size="small" type="number" value={line.floors} onChange={(event) => updateLine(index, 'floors', event.target.value)} slotProps={{ htmlInput: { min: 1, max: 100, 'aria-label': (index + 1) + '라인 최고층' } }} sx={{ width: 85 }} /></TableCell>
                      <TableCell><TextField size="small" placeholder="예: 1,2" value={line.piloti} onChange={(event) => updateLine(index, 'piloti', event.target.value)} slotProps={{ htmlInput: { 'aria-label': (index + 1) + '라인 필로티 층' } }} sx={{ width: 100 }} /></TableCell>
                      <TableCell><TextField size="small" placeholder="예: 84A" value={line.type} onChange={(event) => updateLine(index, 'type', event.target.value)} slotProps={{ htmlInput: { 'aria-label': (index + 1) + '라인 타입' } }} sx={{ width: 100 }} /></TableCell>
                      <TableCell><Button size="small" onClick={() => setSpecialLine(specialLine === index ? null : index)}>특수층 설정 ({line.specialFloors.length})</Button></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </Box>
              {specialLine !== null && draft.lines[specialLine] && (
                <Box sx={{ mt: 1.5, p: 1.25, border: '1px solid #e2e8f0', borderRadius: 1 }}>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 900 }}>{specialLine + 1}라인에 특수층이 있나요?</Typography>
                  <Typography sx={{ color: '#64748b', fontSize: '0.75rem', my: 0.75 }}>특정 층의 타입 변경 또는 세대 제외를 설정합니다.</Typography>
                  {draft.lines[specialLine].specialFloors.map((special, index) => (
                    <Box key={index} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
                      <TextField size="small" label="층" type="number" value={special.floor} onChange={(event) => updateSpecial(index, 'floor', event.target.value)} sx={{ width: 85 }} />
                      <TextField size="small" label="변경 타입" disabled={special.excluded} value={special.type} onChange={(event) => updateSpecial(index, 'type', event.target.value)} sx={{ width: 110 }} />
                      <FormControlLabel control={<Checkbox checked={special.excluded} onChange={(event) => updateSpecial(index, 'excluded', event.target.checked)} size="small" />} label="세대 제외" />
                      <Button size="small" onClick={() => updateLine(specialLine, 'specialFloors', draft.lines[specialLine].specialFloors.filter((_, i) => i !== index))}>삭제</Button>
                    </Box>
                  ))}
                  <Button size="small" onClick={() => updateLine(specialLine, 'specialFloors', [...draft.lines[specialLine].specialFloors, { floor: '', type: '', excluded: false }])}>특수층 추가</Button>
                </Box>
              )}
              {error && <Alert severity="warning" sx={{ mt: 1 }}>{error}</Alert>}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                <Typography sx={{ color: '#64748b', fontSize: '0.75rem' }}>미리보기 단계이며 현장에는 아직 저장되지 않습니다.</Typography>
                <Button variant="contained" onClick={applyDraft}>{selectedId ? '수정 반영' : '동 추가'}</Button>
              </Box>
            </Box>
          </Box>
          <Box sx={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', borderTop: { xs: '1px solid #e2e8f0', md: 'none' } }}>
            <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0' }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 900 }}>동 목록 · {buildings.length}개</Typography>
              <Button size="small" startIcon={<AddRoundedIcon />} onClick={startNew}>새 동</Button>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <Table size="small" stickyHeader aria-label="설정한 동 목록" sx={{ '& th, & td': { fontSize: '0.8rem', whiteSpace: 'nowrap' } }}>
                <TableHead><TableRow>
                  <TableCell>동명</TableCell><TableCell align="right">최고층</TableCell><TableCell align="right">라인 수</TableCell><TableCell align="right">세대수</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {buildings.map((building) => (
                    <TableRow key={building.id} selected={building.id === selectedId} sx={{ '&.Mui-selected': { bgcolor: '#eff6ff' } }}>
                      <TableCell>
                        <Button size="small" aria-pressed={building.id === selectedId} onClick={() => { setSelectedId(building.id); setDraft(structuredClone(building)); setSpecialLine(null); setError(''); }} sx={{ justifyContent: 'flex-start', minWidth: 0, textAlign: 'left' }}>
                          {building.name}
                        </Button>
                      </TableCell>
                      <TableCell align="right">{building.config.floors}층</TableCell>
                      <TableCell align="right">{building.lines.length}개</TableCell>
                      <TableCell align="right">{countUniqueUnits(building.config)}</TableCell>
                    </TableRow>
                  ))}
                  {buildings.length === 0 && <TableRow><TableCell colSpan={4} align="center" sx={{ py: 5, color: '#94a3b8' }}>추가한 동이 없습니다.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Box>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
