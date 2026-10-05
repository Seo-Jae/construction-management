import { useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItemButton, ListItemText, TextField, Tooltip, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

export default function ProcessSettingsPanel({ catalog, selectedProcess, onSelect, onUpdate, ready, error, onRefresh, userId }) {
  const storageKey = `progress-settings-panel:${userId || 'user'}`;
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(storageKey) !== 'closed'; } catch { return true; } });
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState('');
  const selectedIndex = catalog.findIndex(row => row.process_type === selectedProcess);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const toggle = () => {
    setOpen(!open);
    try { localStorage.setItem(storageKey, open ? 'closed' : 'open'); } catch { /* Browser storage is optional. */ }
  };
  const apply = async (action) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await onUpdate(action); if (action.type === 'add' || action.type === 'rename') { setName(''); setAdding(false); setEditing(''); } }
    catch (failure) { setMessage(failure.message); }
    finally { setBusy(false); }
  };
  return <Box component="aside" sx={{ width: open ? 230 : 38, flexShrink: 0, minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: '#34424e', color: '#fff', borderRadius: 1, overflow: 'hidden' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: open ? 1 : 0, py: 0.5 }}>
      {open && <Typography fontWeight={700}>공종 설정</Typography>}
      <Tooltip title={open ? '공종 설정 접기' : '공종 설정 펼치기'}><IconButton onClick={toggle} aria-label={open ? '공종 설정 접기' : '공종 설정 펼치기'} aria-expanded={open} sx={{ color: 'inherit' }} size="small">{open ? <ChevronRightIcon /> : <ChevronLeftIcon />}</IconButton></Tooltip>
    </Box>
    {open ? <>
      <Box sx={{ p: 1, display: 'flex', gap: 0.5 }}>
        {[
          { label: '공종 추가', icon: <AddIcon />, disabled: false, action: () => { setMessage(''); setName(''); setEditing(''); setAdding(true); } },
          { label: '선택 공종 목록에서 제외 (실적 보존)', icon: <RemoveIcon />, disabled: selectedIndex < 0, action: () => apply({ type: 'archive', name: selectedProcess }) },
          { label: '위로 이동', icon: <ArrowUpwardIcon />, disabled: selectedIndex <= 0, action: () => apply({ type: 'move', name: selectedProcess, direction: -1 }) },
          { label: '아래로 이동', icon: <ArrowDownwardIcon />, disabled: selectedIndex < 0 || selectedIndex >= catalog.length - 1, action: () => apply({ type: 'move', name: selectedProcess, direction: 1 }) },
          { label: '공종명 수정', icon: <EditOutlinedIcon />, disabled: selectedIndex < 0, action: () => { setMessage(''); setName(catalog[selectedIndex].display_name || selectedProcess); setEditing(selectedProcess); } },
        ].map(button => <Tooltip key={button.label} title={button.label}><span><IconButton size="small" aria-label={button.label} disabled={busy || !ready || button.disabled} onClick={button.action}
          sx={{ color: '#fff', border: '1px solid #697987', '&.Mui-disabled': { color: '#8493a0' } }}>{button.icon}</IconButton></span></Tooltip>)}
      </Box>
      {(message || error) && <Alert severity="warning" sx={{ mx: 1 }}>{message || error}</Alert>}
      <List dense sx={{ overflowY: 'auto', flex: 1, minHeight: 0, px: 0.75 }}>
        {catalog.map(({ process_type: process, display_name, is_enabled }) => <ListItemButton key={process} selected={selectedProcess === process} onClick={() => onSelect(process)}
          sx={{ borderRadius: 0.5, mb: 0.25, '&.Mui-selected, &.Mui-selected:hover': { bgcolor: '#cce7ed', color: '#0f172a' } }}>
          <Checkbox size="small" checked={is_enabled} disabled={busy || !ready} onClick={event => event.stopPropagation()}
            onChange={event => apply({ type: 'toggle', name: process, enabled: event.target.checked })}
            slotProps={{ input: { 'aria-label': `${display_name || process} 연계 포함` } }} sx={{ p: 0.5, mr: 0.5, color: 'inherit', '&.Mui-checked': { color: '#38bdf8' } }} />
          <ListItemText primary={display_name || process} slotProps={{ primary: { sx: { fontSize: '0.8rem', overflowWrap: 'anywhere' } } }} />
        </ListItemButton>)}
      </List>
      <Button onClick={onRefresh} disabled={busy} sx={{ color: '#fff', m: 0.5 }}>새로고침</Button>
    </> : <Typography sx={{ writingMode: 'vertical-rl', alignSelf: 'center', mt: 1, fontSize: '0.8rem' }}>공종 설정</Typography>}
    <Dialog open={adding || Boolean(editing)} onClose={() => { if (!busy) { setAdding(false); setEditing(''); } }} fullWidth maxWidth="xs">
      <DialogTitle>{editing ? '공종명 수정' : '공종 추가'}</DialogTitle>
      <DialogContent><TextField autoFocus fullWidth size="small" label="공종명" value={name} onChange={event => setName(event.target.value)} sx={{ mt: 1 }} slotProps={{ htmlInput: { maxLength: 60 } }}
        helperText={editing ? '기존 작업 실적과 설정은 유지됩니다.' : '목록에서 제외한 공종은 같은 이름으로 복원할 수 있습니다.'} />
        {message && <Alert severity="error">{message}</Alert>}
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={() => { setAdding(false); setEditing(''); }}>취소</Button><Button disabled={busy || !name.trim()} onClick={() => apply(editing ? { type: 'rename', name: editing, displayName: name } : { type: 'add', name })}>{editing ? '저장' : '추가'}</Button></DialogActions>
    </Dialog>
  </Box>;
}
