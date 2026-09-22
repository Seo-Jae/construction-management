import { useState } from 'react';
import { Alert, Box, IconButton, Snackbar, Tooltip, Typography } from '@mui/material';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import useMenuPreferences from '../hooks/useMenuPreferences.js';
import { saveFavoriteToggle } from '../utils/sidebarMenuPreferences.js';

export default function HeaderMenuTitle({ title, view, userId }) {
  const storageKey = `sidebar-my-menu:${userId}`;
  const preferences = useMenuPreferences(storageKey);
  const selected = preferences.favorites.includes(view);
  const [error, setError] = useState(false);
  return <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.75 }}>
    <Typography component="h1" noWrap sx={{ minWidth: 0, fontSize: { xs: 18, md: 22 }, fontWeight: 800, color: 'inherit' }}>{title}</Typography>
    {view && userId && <Tooltip title={selected ? '즐겨찾기 해제' : '즐겨찾기 추가'}>
      <IconButton size="small" aria-label={`${title} 즐겨찾기 ${selected ? '해제' : '추가'}`} aria-pressed={selected}
        onClick={() => {
          try { saveFavoriteToggle(storageKey, view); setError(false); }
          catch { setError(true); }
        }} sx={{ flexShrink: 0 }}>
        {selected ? <StarIcon sx={{ color: '#facc15', fontSize: 23 }} /> : <StarBorderIcon sx={{ fontSize: 23 }} />}
      </IconButton>
    </Tooltip>}
    <Snackbar open={error} autoHideDuration={4000} onClose={() => setError(false)}>
      <Alert severity="error" onClose={() => setError(false)}>즐겨찾기를 저장하지 못했습니다.</Alert>
    </Snackbar>
  </Box>;
}
