import { useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, TextField, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export default function MainProcessSettingsDialog({ names, selected, onSave, onClose, axisStep }) {
  const [draft, setDraft] = useState(selected === null ? names : selected);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [stepDraft, setStepDraft] = useState(String(axisStep ?? 10));
  return <Dialog open onClose={onClose} fullWidth maxWidth="sm"
    sx={{ '& .MuiButton-root': { fontSize: 14, fontWeight: 700 }, '& .MuiInputBase-input, & .MuiInputLabel-root': { fontSize: 14 } }}>
    <DialogTitle sx={{ py: 1.5, pr: 6, borderBottom: '1px solid #e2e8f0', color: '#0f172a', fontSize: '1.15rem', fontWeight: 900 }}>
      주요공정 표시 설정
      <IconButton aria-label="공정 표시 설정 닫기" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8 }}><CloseIcon /></IconButton>
    </DialogTitle>
    <DialogContent sx={{ p: 0 }}>
      <Box sx={{ p: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        {axisStep !== undefined && <TextField
          fullWidth size="small" label="세로축 눈금 단위 (세대)" type="number" value={stepDraft}
          onChange={(event) => setStepDraft(event.target.value)}
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
          helperText="입력한 단위로 5칸 표시합니다. 예: 20 → 최대 100세대"
          sx={{ mb: 2, bgcolor: '#fff' }} />}
        <Typography sx={{ fontSize: '0.88rem', fontWeight: 500, lineHeight: 1.85, color: '#334155', mb: 1.5 }}>Main에 표시할 공정을 선택하세요. 선택은 이 브라우저에 계정·현장별로 저장됩니다.</Typography>
        <TextField fullWidth size="small" label="공정 검색" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ bgcolor: '#fff' }} />
        <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
          <Button onClick={() => setDraft(names)}>전체 선택</Button><Button onClick={() => setDraft([])}>전체 해제</Button>
        </Box>
      </Box>
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', maxHeight: '45vh', overflowY: 'auto' }}>
        {names.filter((name) => name.toLowerCase().includes(search.trim().toLowerCase())).map((name) => <FormControlLabel key={name}
          sx={{ m: 0, py: 0.75, '& .MuiFormControlLabel-label': { fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.6, color: '#334155', overflowWrap: 'anywhere' } }} label={name}
          control={<Checkbox checked={draft.includes(name)} onChange={(e) => setDraft((previous) => e.target.checked ? [...previous, name] : previous.filter((value) => value !== name))} />} />)}
        {names.length === 0 && <Typography sx={{ fontSize: '0.88rem', color: '#64748b' }}>등록된 공정이 없습니다.</Typography>}
        {error && <Alert severity="error">{error}</Alert>}
      </Box>
    </DialogContent>
    <DialogActions sx={{ borderTop: '1px solid #e2e8f0', px: 2, py: 1.5 }}>
      <Button onClick={onClose}>취소</Button>
      <Button variant="contained" onClick={() => {
        const step = Number(stepDraft);
        if (axisStep !== undefined && (!Number.isSafeInteger(step) || step < 1 || !Number.isSafeInteger(step * 5))) {
          setError('눈금 단위는 1 이상의 정수로 입력해주세요.'); return;
        }
        try { onSave(draft, step); } catch { setError('설정을 저장하지 못했습니다. 브라우저 저장소 설정을 확인해주세요.'); }
      }}>적용</Button>
    </DialogActions>
  </Dialog>;
}
