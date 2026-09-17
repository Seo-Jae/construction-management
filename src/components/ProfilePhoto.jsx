import { useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import { supabase } from '../supabaseClient';

const BUCKET = 'profile-photos';
const MAX_SIZE = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function ProfilePhoto({ userId, userName }) {
  const [photoUrl, setPhotoUrl] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const inputRef = useRef(null);
  const path = `${userId}/avatar`;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const load = async () => {
      const storage = supabase.storage.from(BUCKET);
      const { data: files, error: listError } = await storage.list(userId, { search: 'avatar', limit: 10 });
      if (listError) throw listError;
      if (!files?.some((item) => item.name === 'avatar')) return;
      const { data, error: urlError } = await storage.createSignedUrl(path, 3600);
      if (urlError) throw urlError;
      if (active) { setPhotoUrl(`${data.signedUrl}&v=${Date.now()}`); setLoadError(''); }
    };
    const refresh = () => load().catch(() => {
      if (active) setLoadError('사진을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    });
    refresh();
    const timer = window.setInterval(refresh, 50 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [userId, path]);

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const selectPhoto = (event) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    setError('');
    if (!TYPES.includes(selected.type) || selected.size > MAX_SIZE || selected.size === 0) {
      setError('5MB 이하의 JPG, PNG, WebP 사진을 선택해주세요.');
      return;
    }
    setPreview(URL.createObjectURL(selected));
    setFile(selected);
    setOpen(true);
  };

  const close = () => {
    if (saving) return;
    setOpen(false); setFile(null); setPreview(''); setError('');
  };

  const save = async () => {
    if (!file || saving || !userId) return;
    setSaving(true); setError('');
    let uploaded = false;
    try {
      const { data: identity, error: authError } = await supabase.auth.getUser();
      if (authError || identity.user?.id !== userId) throw new Error('로그인 정보를 다시 확인해주세요.');
      const storage = supabase.storage.from(BUCKET);
      const { error: uploadError } = await storage.upload(path, file, { upsert: true, contentType: file.type, cacheControl: '0' });
      if (uploadError) throw uploadError;
      uploaded = true;
      const { data, error: urlError } = await storage.createSignedUrl(path, 3600);
      if (urlError) throw urlError;
      setPhotoUrl(`${data.signedUrl}&v=${Date.now()}`);
      setLoadError('');
      setOpen(false); setFile(null); setPreview('');
    } catch (e) {
      setError(uploaded ? '사진은 저장했지만 다시 불러오지 못했습니다. 화면을 새로고침해주세요.' : `사진 저장 실패: ${e.message}`);
    } finally { setSaving(false); }
  };

  return <Box sx={{ mb: 2.5, minHeight: 88, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    <input ref={inputRef} type="file" accept={TYPES.join(',')} hidden onChange={selectPhoto} />
    <IconButton aria-label="프로필 사진 변경" disabled={!userId || saving} onClick={() => inputRef.current?.click()}
      sx={{
        // Override the shared 30px IconButton rule only for this photo button.
        '&&&&': {
          width: '88px !important', height: '88px !important',
          borderRadius: '28px !important', p: '0 !important',
          flexShrink: 0, display: 'flex', position: 'relative',
        },
      }}>
      <Avatar src={photoUrl || undefined} alt={`${userName || '사용자'} 프로필 사진`}
        sx={{ width: 88, height: 88, borderRadius: '28px', bgcolor: '#e6f6f7', color: '#00a5b5' }}>
        <CameraAltOutlinedIcon sx={{ fontSize: 24 }} />
      </Avatar>
    </IconButton>
    {loadError && <Typography role="status" sx={{ mt: 1, fontSize: 12, color: '#b45309' }}>{loadError}</Typography>}
    {error && !open && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>프로필 사진 변경</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Avatar src={preview || undefined} alt="새 프로필 사진 미리보기" sx={{ width: 180, height: 180, mx: 'auto', borderRadius: '32px' }} />
        <Typography sx={{ mt: 2, textAlign: 'center', fontSize: 13, color: '#64748b' }}>JPG · PNG · WebP / 최대 5MB</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => inputRef.current?.click()} disabled={saving}>다른 사진 선택</Button>
        <Button onClick={close} disabled={saving}>취소</Button>
        <Button variant="contained" onClick={save} disabled={saving || !file} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}>저장</Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
