import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from '@mui/material';
import { supabase } from '../supabaseClient';

export default function MultiProcessPresets({ projectName, selectedProcesses, processOptions, onApply }) {
  const [presets, setPresets] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(Boolean(projectName));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    async function load() {
      try {
        const rows = [];
        for (let start = 0; ; start += 1000) {
          const { data, error: loadError } = await supabase.from('multi_process_presets')
            .select('id,name,processes').eq('project_name', projectName).order('id').range(start, start + 999);
          if (loadError) throw loadError;
          rows.push(...data);
          if (data.length < 1000) break;
        }
        if (!cancelled) setPresets(rows);
      } catch (err) {
        if (!cancelled) setError(`저장 설정을 불러오지 못했습니다: ${err.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (projectName) load();
    return () => { cancelled = true; mounted.current = false; };
  }, [projectName]);

  const activePreset = presets.find(preset => String(preset.id) === selectedId);
  const matches = activePreset && activePreset.processes.length === selectedProcesses.length
    && activePreset.processes.every(process => selectedProcesses.includes(process));

  function apply(id) {
    const preset = presets.find(item => String(item.id) === id);
    if (!preset) return;
    const available = processOptions.filter(process => preset.processes.includes(process));
    const missing = preset.processes.filter(process => !processOptions.includes(process));
    setSelectedId(id);
    setNotice(missing.length ? `현재 사용할 수 없는 공종은 제외했습니다: ${missing.join(', ')}` : '');
    onApply(available);
  }

  async function save() {
    if (saving || !selectedProcesses.length) return;
    setSaving(true);
    setError('');
    try {
      const { data, error: saveError } = await supabase.rpc('save_multi_process_preset_v194', {
        p_project: projectName, p_name: name.trim(), p_processes: selectedProcesses,
      });
      if (saveError) throw saveError;
      if (!mounted.current) return;
      const preset = Array.isArray(data) ? data[0] : data;
      setPresets(previous => [...previous, preset]);
      setSelectedId(String(preset.id));
      setNotice(`‘${preset.name}’ 설정을 저장했습니다.`);
      setOpen(false);
    } catch (err) {
      if (mounted.current) setError(`저장하지 못했습니다: ${err.message}`);
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  return <Box sx={{ flex: '0 1 390px', minWidth: 260 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Button variant="outlined" size="small" disabled={!projectName || !selectedProcesses.length || loading}
        onClick={() => { setName(''); setError(''); setOpen(true); }} sx={{ flexShrink: 0 }}>저장</Button>
      <TextField select fullWidth size="small" label="공정 저장 및 설정" value={matches ? selectedId : ''}
        disabled={loading} onChange={event => apply(event.target.value)}>
        <MenuItem value="" disabled>{loading ? '불러오는 중…' : '저장한 설정 선택'}</MenuItem>
        {presets.map(preset => <MenuItem key={preset.id} value={String(preset.id)}>{preset.name}</MenuItem>)}
      </TextField>
    </Box>
    {notice && <Typography role="status" variant="caption" color="text.secondary">{notice}</Typography>}
    {error && !open && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    <Dialog open={open} onClose={() => { if (!saving) setOpen(false); }} maxWidth="xs" fullWidth>
      <DialogTitle>공정 설정 저장</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>{selectedProcesses.join(', ')}</Typography>
        <TextField autoFocus fullWidth size="small" label="설정 이름" value={name} disabled={saving}
          onChange={event => setName(event.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }}
          helperText="이름을 비우면 설정1, 설정2 순서로 자동 지정합니다." />
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={() => setOpen(false)}>취소</Button>
        <Button variant="contained" disabled={saving} onClick={save}>{saving ? '저장 중…' : '저장'}</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
