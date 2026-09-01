// v52.48.5.44.88 공지사항 목록·상세 팝업
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import SearchIcon from '@mui/icons-material/Search';
import {
  formatSystemNoticeDate,
  getSystemNoticeImageUrl,
  normalizeSystemNotice,
} from '../utils/systemNotices.js';

const noticeColor = (category) => {
  if (category === '공지') {
    return { color: '#1d4ed8', bgcolor: '#dbeafe' };
  }
  if (category === '업데이트') {
    return { color: '#047857', bgcolor: '#d1fae5' };
  }
  return { color: '#7c3aed', bgcolor: '#ede9fe' };
};

export default function SystemNoticeDetailDialog({
  open,
  notices,
  selectedId,
  onSelect,
  onClose,
}) {
  const [searchText, setSearchText] = useState('');
  const normalizedNotices = useMemo(
    () => (Array.isArray(notices) ? notices.map(normalizeSystemNotice) : []),
    [notices],
  );
  const selectedNotice = useMemo(
    () =>
      normalizedNotices.find(
        (notice) => String(notice.id) === String(selectedId),
      ) || normalizedNotices[0] || null,
    [normalizedNotices, selectedId],
  );
  const visibleNotices = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return normalizedNotices;

    return normalizedNotices.filter((notice) =>
      [notice.category, notice.title, notice.summary, notice.content]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
  }, [normalizedNotices, searchText]);

  useEffect(() => {
    if (
      open &&
      selectedNotice &&
      String(selectedNotice.id) !== String(selectedId)
    ) {
      onSelect?.(selectedNotice.id);
    }
  }, [onSelect, open, selectedId, selectedNotice]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      slotProps={{
        paper: {
          sx: {
            height: { xs: '92vh', md: '82vh' },
            maxHeight: { xs: '92vh', md: '820px' },
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          py: 1.5,
          pr: 6,
          borderBottom: '1px solid #e2e8f0',
          color: '#0f172a',
          fontSize: '1.05rem',
          fontWeight: 900,
        }}
      >
        공지사항
        <IconButton
          aria-label="공지사항 닫기"
          onClick={onClose}
          sx={{ position: 'absolute', top: 8, right: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, minHeight: 0, overflow: 'hidden' }}>
        <Box
          sx={{
            height: '100%',
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '320px minmax(0, 1fr)' },
            gridTemplateRows: { xs: '220px minmax(0, 1fr)', md: '1fr' },
          }}
        >
          <Box
            sx={{
              minHeight: 0,
              overflowY: 'auto',
              p: 1.25,
              bgcolor: '#f8fafc',
              borderRight: { md: '1px solid #e2e8f0' },
              borderBottom: { xs: '1px solid #e2e8f0', md: 'none' },
            }}
          >
            <Box sx={{ position: 'sticky', top: -10, zIndex: 1, pb: 1, bgcolor: '#f8fafc' }}>
              <TextField
                fullWidth
                size="small"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="제목·내용 검색"
                inputProps={{ 'aria-label': '공지사항 검색' }}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 0.7, color: '#94a3b8', fontSize: 18 }} />,
                }}
                sx={{ bgcolor: '#ffffff' }}
              />
              <Typography
                sx={{
                  px: 0.5,
                  pt: 0.8,
                  color: '#64748b',
                  fontSize: '0.68rem',
                  fontWeight: 900,
                }}
              >
                {searchText.trim()
                  ? `검색 결과 ${visibleNotices.length.toLocaleString()}건`
                  : `전체 공지 ${normalizedNotices.length.toLocaleString()}건`}
              </Typography>
            </Box>

            {visibleNotices.map((notice) => {
              const selected =
                String(notice.id) === String(selectedNotice?.id);
              return (
                <Paper
                  key={notice.id}
                  component="button"
                  type="button"
                  variant="outlined"
                  onClick={() => onSelect?.(notice.id)}
                  sx={{
                    width: '100%',
                    mb: 0.8,
                    p: 1.15,
                    display: 'block',
                    textAlign: 'left',
                    font: 'inherit',
                    cursor: 'pointer',
                    borderColor: selected ? '#60a5fa' : '#e2e8f0',
                    bgcolor: selected ? '#eff6ff' : '#ffffff',
                    boxShadow: selected
                      ? '0 2px 8px rgba(37, 99, 235, 0.1)'
                      : 'none',
                    '&:hover': {
                      borderColor: '#93c5fd',
                      bgcolor: selected ? '#eff6ff' : '#f8fbff',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
                    <Chip
                      label={notice.category}
                      size="small"
                      sx={{
                        height: 19,
                        ...noticeColor(notice.category),
                        fontSize: '0.6rem',
                        fontWeight: 900,
                      }}
                    />
                    {notice.image_paths.length > 0 && (
                      <ImageOutlinedIcon
                        sx={{ ml: 'auto', color: '#64748b', fontSize: 16 }}
                      />
                    )}
                  </Box>
                  <Typography
                    noWrap
                    sx={{
                      mt: 0.7,
                      color: '#1e293b',
                      fontSize: '0.78rem',
                      fontWeight: 900,
                    }}
                  >
                    {notice.title}
                  </Typography>
                  <Typography
                    sx={{ mt: 0.4, color: '#94a3b8', fontSize: '0.63rem' }}
                  >
                    {formatSystemNoticeDate(notice.published_at)}
                  </Typography>
                </Paper>
              );
            })}

            {visibleNotices.length === 0 && (
              <Box sx={{ py: 6, textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>
                검색 결과가 없습니다.
              </Box>
            )}
          </Box>

          <Box sx={{ minWidth: 0, minHeight: 0, overflowY: 'auto', p: { xs: 2, md: 3 } }}>
            {selectedNotice ? (
              <Box sx={{ maxWidth: 900, mx: 'auto' }}>
                <Chip
                  label={selectedNotice.category}
                  size="small"
                  sx={{
                    ...noticeColor(selectedNotice.category),
                    fontWeight: 900,
                  }}
                />
                <Typography
                  sx={{
                    mt: 1.4,
                    color: '#0f172a',
                    fontSize: { xs: '1.15rem', md: '1.35rem' },
                    lineHeight: 1.4,
                    fontWeight: 900,
                    wordBreak: 'keep-all',
                  }}
                >
                  {selectedNotice.title}
                </Typography>
                <Typography sx={{ mt: 0.7, color: '#94a3b8', fontSize: '0.72rem' }}>
                  {formatSystemNoticeDate(selectedNotice.published_at, true)}
                </Typography>

                <Box sx={{ mt: 2.2, borderTop: '1px solid #e2e8f0' }} />

                <Typography
                  sx={{
                    mt: 2.2,
                    color: '#334155',
                    fontSize: '0.88rem',
                    lineHeight: 1.85,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {selectedNotice.content}
                </Typography>

                {selectedNotice.image_paths.length > 0 && (
                  <Box
                    sx={{
                      mt: 2.5,
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        sm: 'repeat(2, minmax(0, 1fr))',
                      },
                      gap: 1.5,
                    }}
                  >
                    {selectedNotice.image_paths.map((path, index) => (
                      <Box
                        key={`${path}-${index}`}
                        component="a"
                        href={getSystemNoticeImageUrl(path)}
                        target="_blank"
                        rel="noreferrer"
                        sx={{
                          display: 'block',
                          overflow: 'hidden',
                          borderRadius: 1.5,
                          border: '1px solid #e2e8f0',
                          bgcolor: '#f8fafc',
                        }}
                      >
                        <Box
                          component="img"
                          src={getSystemNoticeImageUrl(path)}
                          alt={`${selectedNotice.title} 첨부 이미지 ${index + 1}`}
                          loading="lazy"
                          sx={{
                            display: 'block',
                            width: '100%',
                            maxHeight: 440,
                            objectFit: 'contain',
                          }}
                        />
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            ) : (
              <Box sx={{ py: 8, textAlign: 'center', color: '#94a3b8' }}>
                등록된 공지사항이 없습니다.
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
