import { useState } from 'react';
import { Alert, Box, Collapse, IconButton, InputAdornment, ListItemButton, ListItemText, TextField, Tooltip, Typography } from '@mui/material';
import { createPortal } from 'react-dom';
import useSidebarFolder from '../hooks/useSidebarFolder.js';
import { UI_FONT_FAMILY } from '../theme.js';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { saveFavoriteToggle } from '../utils/sidebarMenuPreferences.js';
import useMenuPreferences from '../hooks/useMenuPreferences.js';

export default function SidebarMyMenu({ userId, menus, currentView, onNavigate, drawerOpen, favoritesContainer }) {
  const storageKey = `sidebar-my-menu:${userId}`;
  const preferences = useMenuPreferences(storageKey);
  const [query, setQuery] = useState('');
  const [favoritesOpen, setFavoritesOpen] = useSidebarFolder(userId, 'favorites');
  const [saveError, setSaveError] = useState(false);

  const toggleFavorite = (value) => {
    try {
      saveFavoriteToggle(storageKey, value);
      setSaveError(false);
    } catch { setSaveError(true); }
  };
  const normalize = (value) => value.replace(/\s/g, '').toLocaleLowerCase();
  const matches = (menu, text) => normalize(`${menu.group || ''}${menu.label}`).includes(normalize(text));
  const findMenus = (ids) => ids.map((id) => menus.find((menu) => menu.value === id)).filter(Boolean);
  const favoriteMenus = findMenus(preferences.favorites);
  const renderRow = (menu, showGroup = false) => (
    <Box key={menu.value} sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
      <ListItemButton selected={currentView === menu.value}
        onClick={() => { onNavigate(menu.value); setQuery(''); }}
        sx={{ minWidth: 0, py: 0.25, px: 1, borderRadius: 1, '&.Mui-selected': { bgcolor: '#cce7ec' }, '&.Mui-selected:hover': { bgcolor: '#b9dce3' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Tooltip title={menu.label} placement="right"><ListItemText primary={menu.label} primaryTypographyProps={{ noWrap: true, fontSize: '11px', lineHeight: 1.2, fontWeight: currentView === menu.value ? 700 : 400 }} sx={{ color: '#000' }} /></Tooltip>
          {showGroup && <Typography noWrap sx={{ fontSize: 11, color: '#64748b' }}>{menu.group}</Typography>}
        </Box>
      </ListItemButton>
      <Tooltip title={preferences.favorites.includes(menu.value) ? '즐겨찾기 해제' : '즐겨찾기 추가'}>
        <IconButton size="small" disabled={!userId} aria-label={`${menu.label} 즐겨찾기 ${preferences.favorites.includes(menu.value) ? '해제' : '추가'}`}
          aria-pressed={preferences.favorites.includes(menu.value)} onClick={() => toggleFavorite(menu.value)}
          sx={{ color: preferences.favorites.includes(menu.value) ? '#b77900' : '#64748b' }}>
          {preferences.favorites.includes(menu.value) ? <StarIcon sx={{ fontSize: 17 }} /> : <StarBorderIcon sx={{ fontSize: 17 }} />}
        </IconButton>
      </Tooltip>
    </Box>
  );
  const sectionButton = (label, Icon, open, toggle) => (
    <ListItemButton onClick={toggle} aria-expanded={open} sx={{ px: 1, py: 0.25, gap: 0.75, borderRadius: 1 }}>
      <Icon sx={{ fontSize: 18, color: '#333' }} />
      <ListItemText primary={label} primaryTypographyProps={{ noWrap: true, fontSize: 13, fontWeight: 900 }} sx={{ color: '#000' }} />
      {open ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
    </ListItemButton>
  );
  return <Box sx={{ display: drawerOpen ? 'block' : 'none', mb: 1, fontFamily: UI_FONT_FAMILY, '& .MuiTypography-root, & .MuiInputBase-root, & .MuiButton-root': { fontFamily: UI_FONT_FAMILY } }}>
    <TextField size="small" fullWidth placeholder="메뉴 검색" value={query} onChange={(event) => setQuery(event.target.value)}
      slotProps={{ htmlInput: { 'aria-label': '메뉴 검색' }, input: {
        startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment>,
        endAdornment: query && <InputAdornment position="end"><IconButton size="small" aria-label="검색어 지우기" onClick={() => setQuery('')}><CloseIcon sx={{ fontSize: 16 }} /></IconButton></InputAdornment>,
      } }} sx={{ mb: 1, '& .MuiInputBase-root': { borderRadius: 1.5, fontSize: '0.72rem', fontWeight: 400 } }} />
    {query.trim() && <Box sx={{ maxHeight: 280, overflowY: 'auto', mb: 1, border: '1px solid #e2e8f0', borderRadius: 1 }}>
      {menus.filter((menu) => matches(menu, query)).map((menu) => renderRow(menu, true))}
      {!menus.some((menu) => matches(menu, query)) && <Typography sx={{ p: 1, fontSize: 12 }}>검색 결과가 없습니다.</Typography>}
    </Box>}
    {favoritesContainer && createPortal(<Box sx={{ display: drawerOpen ? 'block' : 'none' }}>
    {sectionButton('즐겨찾기', StarBorderIcon, favoritesOpen, () => setFavoritesOpen(!favoritesOpen))}
    <Collapse in={favoritesOpen} timeout={0}>
      <Box sx={{ ml: 2, pl: 0.5, maxHeight: 240, overflowY: 'auto', borderLeft: '1px solid #d5dde1' }}>
        {favoriteMenus.map((menu) => renderRow(menu))}
        {!favoriteMenus.length && <Typography sx={{ p: 1, fontSize: 12, color: '#64748b' }}>등록한 메뉴가 없습니다.</Typography>}
      </Box>
    </Collapse>
    </Box>, favoritesContainer)}
    {saveError && <Alert severity="error" sx={{ mt: 1, fontSize: 12 }}>메뉴 설정을 저장하지 못했습니다.</Alert>}

  </Box>;
}
