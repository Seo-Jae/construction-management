import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Popover,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import KeyboardDoubleArrowLeftRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowLeftRounded';
import KeyboardDoubleArrowRightRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowRightRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import { supabase } from '../supabaseClient';

const CATEGORY_OPTIONS = [
  { value: 'fuel', label: '유류대' },
  { value: 'toll', label: '통행료' },
  { value: 'entertainment', label: '접대비(회식)' },
  { value: 'lodging', label: '숙박비' },
  { value: 'materials', label: '잡자재' },
  { value: 'shipping', label: '우편·택배비' },
  { value: 'other', label: '기타' },
];

const CATEGORY_LABELS = Object.fromEntries(
  CATEGORY_OPTIONS.map((item) => [item.value, item.label]),
);

const STATUS_LABELS = {
  draft: '작성중',
  submitted: '결재요청',
  approved: '완료',
  rejected: '반려',
};

const STATUS_COLORS = {
  draft: 'default',
  submitted: 'warning',
  approved: 'success',
  rejected: 'error',
};

const pad = (value) => String(value).padStart(2, '0');

const getKoreaToday = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
};

const getCurrentMonth = () => getKoreaToday().slice(0, 7);

const createClientId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `expense-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createEmptyItem = (month = getCurrentMonth()) => ({
  clientId: createClientId(),
  expense_date: `${month}-01`,
  category: 'fuel',
  origin: '',
  destination: '',
  destination_time: '',
  description: '',
  amount: '',
});

const toNumber = (value) => {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value) => `${Math.round(toNumber(value)).toLocaleString('ko-KR')}`;

const formatDate = (value) => {
  if (!value) return '-';
  const parts = String(value).split('-');
  if (parts.length !== 3) return value;
  return `${pad(parts[1])}-${pad(parts[2])}`;
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

const normalizeItem = (item, index = 0) => ({
  clientId: item?.id || item?.clientId || createClientId(),
  expense_date: item?.expense_date || '',
  category: item?.category || 'other',
  origin: item?.origin || '',
  destination: item?.destination || '',
  destination_time: item?.destination_time ? String(item.destination_time).slice(0, 5) : '',
  description: item?.description || '',
  amount: item?.amount ?? '',
  sort_order: item?.sort_order ?? index,
});

const getDaysInMonth = (month) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
};

const buildCalendarCells = (month) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length < 42) cells.push(null);
  return cells;
};

const getCalendarEntryText = (item) => {
  const label = CATEGORY_LABELS[item.category] || '기타';
  if (item.category === 'fuel') {
    const route = [item.origin, item.destination].filter(Boolean).join('→');
    return `${route || item.description || '이동'}(유류비)`;
  }
  if (item.category === 'toll') {
    const detail = item.description || [item.origin, item.destination].filter(Boolean).join('→');
    return `${detail || '통행료'}(통행료)`;
  }
  return `${item.description || label}(${label})`;
};

const getDateParts = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
};

const getMonthParts = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  return { year, month };
};

const buildIsoDate = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;

function NumericMonthField({ label, value, onChange, allowClear = false, sx }) {
  const current = getMonthParts(value) || getMonthParts(getCurrentMonth());
  const [anchorEl, setAnchorEl] = useState(null);
  const [viewYear, setViewYear] = useState(current.year);

  useEffect(() => {
    const next = getMonthParts(value);
    if (next) setViewYear(next.year);
  }, [value]);

  const openPicker = (event) => {
    const next = getMonthParts(value) || getMonthParts(getCurrentMonth());
    setViewYear(next.year);
    setAnchorEl(event.currentTarget);
  };

  const selected = getMonthParts(value);

  return (
    <>
      <TextField
        label={label}
        size="small"
        value={value || ''}
        placeholder="YYYY-MM"
        onClick={openPicker}
        InputLabelProps={{ shrink: true }}
        inputProps={{ readOnly: true, inputMode: 'none' }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              {allowClear && value && (
                <IconButton
                  size="small"
                  aria-label="작성월 선택 해제"
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange('');
                  }}
                >
                  <CloseRoundedIcon sx={{ fontSize: 17 }} />
                </IconButton>
              )}
              <IconButton size="small" aria-label="작성월 달력 열기" onClick={openPicker}>
                <CalendarMonthRoundedIcon sx={{ fontSize: 19 }} />
              </IconButton>
            </InputAdornment>
          ),
        }}
        sx={{ cursor: 'pointer', ...sx }}
      />
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ width: 286, p: 1.2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <IconButton size="small" onClick={() => setViewYear((year) => year - 1)}>
              <ChevronLeftRoundedIcon />
            </IconButton>
            <Typography sx={{ fontSize: '0.88rem', fontWeight: 900 }}>{viewYear}</Typography>
            <IconButton size="small" onClick={() => setViewYear((year) => year + 1)}>
              <ChevronRightRoundedIcon />
            </IconButton>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.65 }}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((monthNumber) => {
              const isSelected = selected?.year === viewYear && selected?.month === monthNumber;
              return (
                <Button
                  key={monthNumber}
                  size="small"
                  variant={isSelected ? 'contained' : 'outlined'}
                  onClick={() => {
                    onChange(`${viewYear}-${pad(monthNumber)}`);
                    setAnchorEl(null);
                  }}
                  sx={{ minWidth: 0, py: 0.7, fontSize: '0.74rem', fontWeight: 800 }}
                >
                  {pad(monthNumber)}
                </Button>
              );
            })}
          </Box>
        </Box>
      </Popover>
    </>
  );
}

function NumericDateField({ label, value, onChange, displayMode = 'full', sx }) {
  const todayParts = getDateParts(getKoreaToday());
  const selected = getDateParts(value);
  const initial = selected || todayParts;
  const [anchorEl, setAnchorEl] = useState(null);
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);

  useEffect(() => {
    const next = getDateParts(value);
    if (next) {
      setViewYear(next.year);
      setViewMonth(next.month);
    }
  }, [value]);

  const openPicker = (event) => {
    const next = getDateParts(value) || todayParts;
    setViewYear(next.year);
    setViewMonth(next.month);
    setAnchorEl(event.currentTarget);
  };

  const moveMonth = (amount) => {
    const moved = new Date(viewYear, viewMonth - 1 + amount, 1);
    setViewYear(moved.getFullYear());
    setViewMonth(moved.getMonth() + 1);
  };

  const days = buildCalendarCells(`${viewYear}-${pad(viewMonth)}`);
  const displayValue = value
    ? displayMode === 'month-day'
      ? String(value).slice(5, 10)
      : String(value).slice(0, 10)
    : '';
  const weekNames = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <>
      <TextField
        label={label}
        size="small"
        value={displayValue}
        placeholder={displayMode === 'month-day' ? 'MM-DD' : 'YYYY-MM-DD'}
        onClick={openPicker}
        InputLabelProps={{ shrink: true }}
        inputProps={{ readOnly: true, inputMode: 'none' }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" aria-label={`${label} 달력 열기`} onClick={openPicker}>
                <CalendarMonthRoundedIcon sx={{ fontSize: 19 }} />
              </IconButton>
            </InputAdornment>
          ),
        }}
        sx={{ cursor: 'pointer', ...sx }}
      />
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ width: 316, p: 1.2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.9 }}>
            <Stack direction="row" spacing={0.1}>
              <IconButton size="small" title="이전 연도" onClick={() => setViewYear((year) => year - 1)}>
                <KeyboardDoubleArrowLeftRoundedIcon sx={{ fontSize: 19 }} />
              </IconButton>
              <IconButton size="small" title="이전 달" onClick={() => moveMonth(-1)}>
                <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Stack>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 900 }}>
              {viewYear}-{pad(viewMonth)}
            </Typography>
            <Stack direction="row" spacing={0.1}>
              <IconButton size="small" title="다음 달" onClick={() => moveMonth(1)}>
                <ChevronRightRoundedIcon sx={{ fontSize: 20 }} />
              </IconButton>
              <IconButton size="small" title="다음 연도" onClick={() => setViewYear((year) => year + 1)}>
                <KeyboardDoubleArrowRightRoundedIcon sx={{ fontSize: 19 }} />
              </IconButton>
            </Stack>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.3 }}>
            {weekNames.map((name) => (
              <Typography
                key={name}
                align="center"
                sx={{ py: 0.45, fontSize: '0.68rem', fontWeight: 900, color: '#64748b' }}
              >
                {name}
              </Typography>
            ))}
            {days.map((day, index) => {
              if (!day) return <Box key={`empty-${index}`} sx={{ height: 34 }} />;
              const isoDate = buildIsoDate(viewYear, viewMonth, day);
              const isSelected = value === isoDate;
              const isToday = getKoreaToday() === isoDate;
              return (
                <Button
                  key={isoDate}
                  size="small"
                  variant={isSelected ? 'contained' : 'text'}
                  onClick={() => {
                    onChange(isoDate);
                    setAnchorEl(null);
                  }}
                  sx={{
                    minWidth: 0,
                    height: 34,
                    px: 0,
                    fontSize: '0.72rem',
                    fontWeight: isSelected || isToday ? 900 : 600,
                    border: isToday && !isSelected ? '1px solid #94a3b8' : '1px solid transparent',
                  }}
                >
                  {pad(day)}
                </Button>
              );
            })}
          </Box>
          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 0.8 }}>
            <Button
              size="small"
              onClick={() => {
                onChange(getKoreaToday());
                setAnchorEl(null);
              }}
              sx={{ fontSize: '0.7rem', fontWeight: 800 }}
            >
              오늘
            </Button>
          </Stack>
        </Box>
      </Popover>
    </>
  );
}

function SectionTitle({ title, subtitle, action }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1,
        mb: 1.2,
      }}
    >
      <Box>
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 900, color: '#1e293b' }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography sx={{ mt: 0.2, fontSize: '0.7rem', color: '#64748b' }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action}
    </Box>
  );
}

function CoverPreview({ month, claimDate, claimantName, items }) {
  const rows = useMemo(
    () =>
      [...items]
        .filter((item) => item.expense_date)
        .sort((first, second) => {
          const dateCompare = first.expense_date.localeCompare(second.expense_date);
          if (dateCompare !== 0) return dateCompare;
          return (first.sort_order || 0) - (second.sort_order || 0);
        }),
    [items],
  );

  const totals = useMemo(() => {
    const next = Object.fromEntries(CATEGORY_OPTIONS.map((item) => [item.value, 0]));
    rows.forEach((item) => {
      next[item.category] = (next[item.category] || 0) + toNumber(item.amount);
    });
    return next;
  }, [rows]);

  const grandTotal = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const [year, monthNumber] = month.split('-');

  const cellSx = {
    borderRight: '1px solid #475569',
    borderBottom: '1px solid #475569',
    px: 0.45,
    py: 0.35,
    fontSize: '0.56rem',
    lineHeight: 1.2,
    height: 26,
    color: '#0f172a',
  };

  return (
    <Paper
      elevation={0}
      sx={{
        width: 920,
        minHeight: 1180,
        mx: 'auto',
        p: '62px 34px 44px',
        bgcolor: '#ffffff',
        color: '#0f172a',
        border: '1px solid #cbd5e1',
        boxShadow: '0 12px 28px rgba(15,23,42,0.12)',
      }}
    >
      <Typography
        align="center"
        sx={{
          fontSize: '2rem',
          fontWeight: 900,
          letterSpacing: '0.25em',
          mb: 5,
        }}
      >
        지 출 결 의 서
      </Typography>

      <Typography align="right" sx={{ mb: 1, fontSize: '0.72rem', color: '#475569' }}>
        {year}년 {Number(monthNumber)}월
      </Typography>

      <TableContainer sx={{ borderTop: '1px solid #475569', borderLeft: '1px solid #475569' }}>
        <Table size="small" sx={{ tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              <TableCell align="center" sx={{ ...cellSx, width: 92, fontWeight: 900 }}>날짜</TableCell>
              <TableCell align="center" sx={{ ...cellSx, width: 150, fontWeight: 900 }}>유류대</TableCell>
              <TableCell align="center" sx={{ ...cellSx, width: 68, fontWeight: 900 }}>금액</TableCell>
              <TableCell align="center" sx={{ ...cellSx, width: 120, fontWeight: 900 }}>통행료</TableCell>
              <TableCell align="center" sx={{ ...cellSx, width: 68, fontWeight: 900 }}>금액</TableCell>
              <TableCell align="center" sx={{ ...cellSx, width: 74, fontWeight: 900 }}>접대비</TableCell>
              <TableCell align="center" sx={{ ...cellSx, width: 64, fontWeight: 900 }}>숙박비</TableCell>
              <TableCell align="center" sx={{ ...cellSx, width: 64, fontWeight: 900 }}>잡자재</TableCell>
              <TableCell align="center" sx={{ ...cellSx, width: 76, fontWeight: 900 }}>우편/택배</TableCell>
              <TableCell align="center" sx={{ ...cellSx, width: 64, fontWeight: 900 }}>기타</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ ...cellSx, height: 120, color: '#94a3b8' }}>
                  좌측에서 사용내역을 입력하면 이곳에 실시간으로 표시됩니다.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((item) => {
                const isFuel = item.category === 'fuel';
                const isToll = item.category === 'toll';
                const destinationWithTime = [item.destination, item.destination_time].filter(Boolean).join(' ');
                const route = [item.origin, destinationWithTime].filter(Boolean).join(' → ');
                const detail = isFuel ? route || item.description : item.description;
                return (
                  <TableRow key={item.clientId}>
                    <TableCell sx={cellSx}>{formatDate(item.expense_date)}</TableCell>
                    <TableCell sx={cellSx}>{isFuel ? detail : ''}</TableCell>
                    <TableCell align="right" sx={cellSx}>{isFuel ? formatMoney(item.amount) : ''}</TableCell>
                    <TableCell sx={cellSx}>{isToll ? item.description : ''}</TableCell>
                    <TableCell align="right" sx={cellSx}>{isToll ? formatMoney(item.amount) : ''}</TableCell>
                    <TableCell align="right" sx={cellSx}>{item.category === 'entertainment' ? formatMoney(item.amount) : ''}</TableCell>
                    <TableCell align="right" sx={cellSx}>{item.category === 'lodging' ? formatMoney(item.amount) : ''}</TableCell>
                    <TableCell align="right" sx={cellSx}>{item.category === 'materials' ? formatMoney(item.amount) : ''}</TableCell>
                    <TableCell align="right" sx={cellSx}>{item.category === 'shipping' ? formatMoney(item.amount) : ''}</TableCell>
                    <TableCell align="right" sx={cellSx}>{item.category === 'other' ? formatMoney(item.amount) : ''}</TableCell>
                  </TableRow>
                );
              })
            )}
            <TableRow>
              <TableCell align="center" sx={{ ...cellSx, fontWeight: 900 }}>계</TableCell>
              <TableCell sx={cellSx} />
              <TableCell align="right" sx={{ ...cellSx, fontWeight: 900 }}>{formatMoney(totals.fuel)}</TableCell>
              <TableCell sx={cellSx} />
              <TableCell align="right" sx={{ ...cellSx, fontWeight: 900 }}>{formatMoney(totals.toll)}</TableCell>
              <TableCell align="right" sx={{ ...cellSx, fontWeight: 900 }}>{formatMoney(totals.entertainment)}</TableCell>
              <TableCell align="right" sx={{ ...cellSx, fontWeight: 900 }}>{formatMoney(totals.lodging)}</TableCell>
              <TableCell align="right" sx={{ ...cellSx, fontWeight: 900 }}>{formatMoney(totals.materials)}</TableCell>
              <TableCell align="right" sx={{ ...cellSx, fontWeight: 900 }}>{formatMoney(totals.shipping)}</TableCell>
              <TableCell align="right" sx={{ ...cellSx, fontWeight: 900 }}>{formatMoney(totals.other)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell align="center" sx={{ ...cellSx, fontWeight: 900 }}>합계</TableCell>
              <TableCell colSpan={8} sx={cellSx} />
              <TableCell align="right" sx={{ ...cellSx, fontWeight: 900, fontSize: '0.66rem' }}>
                {formatMoney(grandTotal)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 6, textAlign: 'center' }}>
        <Typography sx={{ fontSize: '1.05rem', mb: 1.1 }}>
          위 금액을 영수(청구)합니다.
        </Typography>
        <Typography sx={{ fontSize: '0.9rem', mb: 1.1 }}>
          {claimDate ? `${claimDate.slice(0, 4)}년 ${Number(claimDate.slice(5, 7))}월 ${Number(claimDate.slice(8, 10))}일` : '-'}
        </Typography>
        <Typography sx={{ fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.3em' }}>
          영수자 {claimantName || '-'}
        </Typography>
      </Box>
    </Paper>
  );
}

function CalendarPreview({ month, items }) {
  const cells = useMemo(() => buildCalendarCells(month), [month]);
  const entriesByDay = useMemo(() => {
    const next = {};
    items.forEach((item) => {
      if (!item.expense_date || !item.expense_date.startsWith(`${month}-`)) return;
      const day = Number(item.expense_date.slice(8, 10));
      if (!next[day]) next[day] = [];
      next[day].push(getCalendarEntryText(item));
    });
    return next;
  }, [items, month]);

  const [year, monthNumber] = month.split('-');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <Paper
      elevation={0}
      sx={{
        width: 1020,
        minHeight: 760,
        mx: 'auto',
        p: 2.2,
        bgcolor: '#ffffff',
        border: '1px solid #cbd5e1',
        boxShadow: '0 12px 28px rgba(15,23,42,0.12)',
      }}
    >
      <Box sx={{ bgcolor: '#050505', color: '#ffffff', py: 0.8, textAlign: 'center' }}>
        <Typography sx={{ fontWeight: 900, fontSize: '1.05rem' }}>
          ~ {year}.{monthNumber} ~
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {dayNames.map((name) => (
          <Box
            key={name}
            sx={{
              bgcolor: '#050505',
              color: '#ffffff',
              py: 0.55,
              textAlign: 'center',
              borderRight: '1px solid #94a3b8',
              borderBottom: '1px solid #94a3b8',
              fontSize: '0.7rem',
              fontWeight: 800,
            }}
          >
            {name}
          </Box>
        ))}
        {cells.map((day, index) => {
          const entries = day ? entriesByDay[day] || [] : [];
          return (
            <Box
              key={`${day || 'empty'}-${index}`}
              sx={{
                minHeight: 112,
                p: 0.65,
                bgcolor: day ? '#ffffff' : '#252525',
                borderRight: '1px solid #94a3b8',
                borderBottom: '1px solid #94a3b8',
                overflow: 'hidden',
              }}
            >
              {day && (
                <>
                  <Typography sx={{ color: '#1636c9', fontSize: '0.72rem', fontWeight: 900, lineHeight: 1 }}>
                    {day}
                  </Typography>
                  <Stack spacing={0.15} sx={{ mt: 0.45 }}>
                    {entries.map((entry, entryIndex) => (
                      <Typography
                        key={`${entry}-${entryIndex}`}
                        sx={{
                          fontSize: '0.58rem',
                          color: '#334155',
                          lineHeight: 1.25,
                          wordBreak: 'break-word',
                        }}
                      >
                        {entry}
                      </Typography>
                    ))}
                  </Stack>
                </>
              )}
            </Box>
          );
        })}
      </Box>
      <Box sx={{ mt: 2, color: '#334155' }}>
        <Typography sx={{ fontSize: '0.68rem', fontWeight: 900, mb: 0.4 }}>* 작성방법</Typography>
        <Typography sx={{ fontSize: '0.64rem', lineHeight: 1.55 }}>
          1. 유류대는 출발지와 도착지를 기준으로 상세내역에 표시됩니다.<br />
          2. 상세내역에는 이동거리와 금액을 표시하지 않습니다.<br />
          3. 그 외 항목은 사용내용과 발생 항목을 날짜별로 표시합니다.
        </Typography>
      </Box>
    </Paper>
  );
}

function ExpenseEditor({ userProfile, editingDocument, onBack, onSaved }) {
  const initialMonth = editingDocument?.expense_month?.slice(0, 7) || getCurrentMonth();
  const [month, setMonth] = useState(initialMonth);
  const [claimDate, setClaimDate] = useState(editingDocument?.claim_date || getKoreaToday());
  const [claimantName, setClaimantName] = useState(
    editingDocument?.claimant_name || userProfile?.manager_name || userProfile?.name || '',
  );
  const [items, setItems] = useState([createEmptyItem(initialMonth)]);
  const [previewTab, setPreviewTab] = useState(0);
  const [loading, setLoading] = useState(Boolean(editingDocument?.id));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const projectName = userProfile?.project_name || '';

  useEffect(() => {
    let active = true;
    const loadItems = async () => {
      if (!editingDocument?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase
        .from('expense_resolution_items')
        .select('*')
        .eq('resolution_id', editingDocument.id)
        .order('expense_date', { ascending: true })
        .order('sort_order', { ascending: true });

      if (!active) return;
      if (error) {
        console.error('지출결의서 항목 조회 오류:', error);
        setMessage({ severity: 'error', text: `항목을 불러오지 못했습니다: ${error.message}` });
        setItems([createEmptyItem(initialMonth)]);
      } else {
        const normalized = (data || []).map(normalizeItem);
        setItems(normalized.length > 0 ? normalized : [createEmptyItem(initialMonth)]);
      }
      setLoading(false);
    };

    loadItems();
    return () => {
      active = false;
    };
  }, [editingDocument?.id, initialMonth]);

  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + toNumber(item.amount), 0),
    [items],
  );

  const handleMonthChange = (nextMonth) => {
    if (!nextMonth) return;
    const lastDay = getDaysInMonth(nextMonth);
    setMonth(nextMonth);
    setItems((previous) =>
      previous.map((item) => {
        const previousDay = Number(item.expense_date?.slice(8, 10)) || 1;
        const nextDay = Math.min(previousDay, lastDay);
        return {
          ...item,
          expense_date: `${nextMonth}-${pad(nextDay)}`,
        };
      }),
    );
  };

  const handleItemChange = (clientId, field, value) => {
    setItems((previous) =>
      previous.map((item) =>
        item.clientId === clientId ? { ...item, [field]: value } : item,
      ),
    );
  };

  const handleAddItem = () => {
    setItems((previous) => [...previous, createEmptyItem(month)]);
  };

  const handleDeleteItem = (clientId) => {
    setItems((previous) => {
      const next = previous.filter((item) => item.clientId !== clientId);
      return next.length > 0 ? next : [createEmptyItem(month)];
    });
  };

  const validate = () => {
    if (!projectName) return '현장이 선택되지 않았습니다.';
    if (!month) return '작성월을 선택해주세요.';
    if (!claimDate) return '청구일을 입력해주세요.';
    if (!claimantName.trim()) return '영수자 이름을 입력해주세요.';

    const validItems = items.filter((item) => toNumber(item.amount) > 0);
    if (validItems.length === 0) return '금액이 입력된 사용내역을 한 건 이상 작성해주세요.';

    for (const item of validItems) {
      if (!item.expense_date) return '사용일을 입력해주세요.';
      if (!item.expense_date.startsWith(`${month}-`)) return '모든 사용일은 선택한 작성월 안에 있어야 합니다.';
      if (!CATEGORY_LABELS[item.category]) return '지출항목을 선택해주세요.';
      if (item.category === 'fuel' && (!item.origin.trim() || !item.destination.trim())) {
        return '유류대는 출발지와 도착지를 모두 입력해주세요.';
      }
      if (item.category !== 'fuel' && !item.description.trim()) {
        return `${CATEGORY_LABELS[item.category]} 항목의 사용내용을 입력해주세요.`;
      }
    }
    return '';
  };

  const handleSave = async () => {
    const validationMessage = validate();
    if (validationMessage) {
      setMessage({ severity: 'warning', text: validationMessage });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const payloadItems = items
        .filter((item) => toNumber(item.amount) > 0)
        .map((item, index) => ({
          expense_date: item.expense_date,
          category: item.category,
          origin: item.origin.trim(),
          destination: item.destination.trim(),
          destination_time: item.destination_time || null,
          description: item.description.trim(),
          amount: Math.round(toNumber(item.amount)),
          sort_order: index,
        }));

      const { data, error } = await supabase.rpc('save_expense_resolution', {
        p_resolution_id: editingDocument?.id || null,
        p_project_name: projectName,
        p_expense_month: `${month}-01`,
        p_claim_date: claimDate,
        p_claimant_name: claimantName.trim(),
        p_items: payloadItems,
      });

      if (error) throw error;
      setMessage({ severity: 'success', text: '지출결의서가 저장되었습니다.' });
      window.setTimeout(() => onSaved(data), 500);
    } catch (error) {
      console.error('지출결의서 저장 오류:', error);
      setMessage({ severity: 'error', text: `저장하지 못했습니다: ${error.message || error}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Paper sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <Stack alignItems="center" spacing={1}>
          <CircularProgress size={28} />
          <Typography sx={{ fontSize: '0.78rem', color: '#64748b' }}>작성자료를 불러오는 중입니다.</Typography>
        </Stack>
      </Paper>
    );
  }

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1.2 }}>
      <Paper
        variant="outlined"
        sx={{
          px: 1.5,
          py: 1.1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ArrowBackRoundedIcon />}
            onClick={onBack}
          >
            목록
          </Button>
          <Box>
            <Typography sx={{ fontSize: '1rem', fontWeight: 900, color: '#1e293b' }}>
              {editingDocument?.id ? '지출결의서 수정' : '새 지출결의서 작성'}
            </Typography>
            <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
              좌측에서 입력하면 우측 갑지와 상세내역에 즉시 반영됩니다.
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography sx={{ fontSize: '0.76rem', fontWeight: 900, color: '#334155' }}>
            합계 {formatMoney(totalAmount)}원
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={saving ? <CircularProgress size={15} color="inherit" /> : <SaveRoundedIcon />}
            disabled={saving}
            onClick={handleSave}
            sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}
          >
            저장
          </Button>
        </Stack>
      </Paper>

      {message && (
        <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ py: 0.2 }}>
          {message.text}
        </Alert>
      )}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', xl: 'minmax(560px, 0.92fr) minmax(680px, 1.08fr)' },
          gap: 1.2,
          overflow: 'hidden',
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            minHeight: 0,
            overflow: 'auto',
            p: 1.5,
            borderColor: '#cbd5e1',
            boxShadow: 'none',
          }}
        >
          <SectionTitle title="기본정보" subtitle="작성월과 영수자 정보를 입력합니다." />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <NumericMonthField
              label="작성월"
              value={month}
              onChange={handleMonthChange}
            />
            <NumericDateField
              label="청구일"
              value={claimDate}
              onChange={setClaimDate}
            />
            <TextField label="현장명" size="small" value={projectName} disabled />
            <TextField
              label="영수자"
              size="small"
              value={claimantName}
              onChange={(event) => setClaimantName(event.target.value)}
            />
          </Box>

          <Divider sx={{ my: 1.6 }} />

          <SectionTitle
            title="사용내역"
            subtitle="유류대는 출발지·도착지와 하이패스 영수증의 도착시간을 입력합니다."
            action={(
              <Button size="small" variant="contained" startIcon={<AddRoundedIcon />} onClick={handleAddItem}>
                내역 추가
              </Button>
            )}
          />

          <Stack spacing={1}>
            {items.map((item, index) => {
              const isFuel = item.category === 'fuel';
              return (
                <Paper
                  key={item.clientId}
                  variant="outlined"
                  sx={{
                    p: 1.1,
                    borderColor: '#dbe3ec',
                    bgcolor: '#f8fafc',
                    boxShadow: 'none',
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.8 }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 900, color: '#334155' }}>
                      No. {index + 1}
                    </Typography>
                    <Tooltip title="이 내역 삭제">
                      <IconButton size="small" color="error" onClick={() => handleDeleteItem(item.clientId)}>
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '120px 150px minmax(130px, 1fr)' },
                      gap: 0.8,
                    }}
                  >
                    <NumericDateField
                      label="사용일"
                      value={item.expense_date}
                      displayMode="month-day"
                      onChange={(nextDate) => handleItemChange(item.clientId, 'expense_date', nextDate)}
                    />
                    <TextField
                      select
                      label="지출항목"
                      size="small"
                      value={item.category}
                      onChange={(event) => handleItemChange(item.clientId, 'category', event.target.value)}
                    >
                      {CATEGORY_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      label="금액"
                      size="small"
                      value={item.amount}
                      onChange={(event) => {
                        const onlyNumber = event.target.value.replace(/[^0-9]/g, '');
                        handleItemChange(item.clientId, 'amount', onlyNumber);
                      }}
                      inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                      InputProps={{ endAdornment: <Typography sx={{ fontSize: '0.7rem' }}>원</Typography> }}
                    />
                  </Box>
                  {isFuel ? (
                    <Box
                      sx={{
                        mt: 0.8,
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 112px' },
                        gap: 0.8,
                      }}
                    >
                      <TextField
                        label="출발지"
                        size="small"
                        value={item.origin}
                        onChange={(event) => handleItemChange(item.clientId, 'origin', event.target.value)}
                        placeholder="예: 서울"
                      />
                      <TextField
                        label="도착지"
                        size="small"
                        value={item.destination}
                        onChange={(event) => handleItemChange(item.clientId, 'destination', event.target.value)}
                        placeholder="예: 용인"
                      />
                      <TextField
                        label="도착시간"
                        type="time"
                        size="small"
                        value={item.destination_time}
                        onChange={(event) => handleItemChange(item.clientId, 'destination_time', event.target.value)}
                        InputLabelProps={{ shrink: true }}
                        inputProps={{ step: 60 }}
                      />
                    </Box>
                  ) : (
                    <TextField
                      label={item.category === 'toll' ? '영업소/시간 또는 사용내용' : '사용내용'}
                      size="small"
                      fullWidth
                      value={item.description}
                      onChange={(event) => handleItemChange(item.clientId, 'description', event.target.value)}
                      placeholder={item.category === 'toll' ? '예: 용인 07:33' : '사용내용을 입력하세요'}
                      sx={{ mt: 0.8 }}
                    />
                  )}
                  {isFuel && (
                    <TextField
                      label="추가 메모(선택)"
                      size="small"
                      fullWidth
                      value={item.description}
                      onChange={(event) => handleItemChange(item.clientId, 'description', event.target.value)}
                      sx={{ mt: 0.8 }}
                      placeholder="갑지에 별도로 남길 내용이 있을 때만 입력"
                    />
                  )}
                </Paper>
              );
            })}
          </Stack>
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            borderColor: '#cbd5e1',
            overflow: 'hidden',
            boxShadow: 'none',
          }}
        >
          <Tabs
            value={previewTab}
            onChange={(_, value) => setPreviewTab(value)}
            sx={{ px: 1, minHeight: 42, borderBottom: '1px solid #e2e8f0' }}
          >
            <Tab label="갑지 미리보기" sx={{ minHeight: 42, fontSize: '0.76rem', fontWeight: 800 }} />
            <Tab label="상세내역 미리보기" sx={{ minHeight: 42, fontSize: '0.76rem', fontWeight: 800 }} />
          </Tabs>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', bgcolor: '#e8edf3', p: 1.5 }}>
            <Box sx={{ transformOrigin: 'top left', width: 'max-content' }}>
              {previewTab === 0 ? (
                <CoverPreview
                  month={month}
                  claimDate={claimDate}
                  claimantName={claimantName}
                  items={items}
                />
              ) : (
                <CalendarPreview month={month} items={items} />
              )}
            </Box>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}

function ExpenseList({ userProfile, onCreate, onEdit }) {
  const projectName = userProfile?.project_name || '';
  const [monthFilter, setMonthFilter] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const loadDocuments = async () => {
    if (!projectName) {
      setDocuments([]);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      let query = supabase
        .from('expense_resolutions')
        .select('id, project_name, expense_month, claim_date, claimant_name, status, total_amount, created_by_name, created_at, updated_at')
        .eq('project_name', projectName)
        .order('expense_month', { ascending: false })
        .order('updated_at', { ascending: false });

      if (monthFilter) {
        query = query.eq('expense_month', `${monthFilter}-01`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('지출결의서 목록 조회 오류:', error);
      setDocuments([]);
      setMessage({ severity: 'error', text: `목록을 불러오지 못했습니다: ${error.message || error}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectName, monthFilter]);

  const handleDelete = async (document) => {
    if (!window.confirm(`${document.expense_month.slice(0, 7)} 지출결의서를 삭제하시겠습니까?`)) return;
    const { error } = await supabase.rpc('delete_expense_resolution', {
      p_resolution_id: document.id,
    });
    if (error) {
      setMessage({ severity: 'error', text: `삭제하지 못했습니다: ${error.message}` });
      return;
    }
    setMessage({ severity: 'success', text: '삭제되었습니다.' });
    loadDocuments();
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        borderColor: '#cbd5e1',
        boxShadow: 'none',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: 1.6,
          py: 1.3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <Box>
          <Typography sx={{ fontSize: '1.05rem', fontWeight: 900, color: '#1e293b' }}>
            지출결의서 작성
          </Typography>
          <Typography sx={{ mt: 0.15, fontSize: '0.7rem', color: '#64748b' }}>
            월별 지출결의서를 작성하고 기존 문서를 수정할 수 있습니다.
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.8} alignItems="center">
          <NumericMonthField
            label="작성월"
            value={monthFilter}
            onChange={setMonthFilter}
            allowClear
            sx={{ width: 150 }}
          />
          <Tooltip title="새로고침">
            <IconButton size="small" onClick={loadDocuments}>
              <RefreshRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button variant="contained" size="small" startIcon={<AddRoundedIcon />} onClick={onCreate}>
            새 지출결의서
          </Button>
        </Stack>
      </Box>

      {message && (
        <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ m: 1.2, mb: 0 }}>
          {message.text}
        </Alert>
      )}

      <TableContainer sx={{ flex: 1, minHeight: 0 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell align="center" sx={{ fontWeight: 900, width: 70 }}>No.</TableCell>
              <TableCell align="center" sx={{ fontWeight: 900 }}>작성월</TableCell>
              <TableCell align="center" sx={{ fontWeight: 900 }}>현장명</TableCell>
              <TableCell align="center" sx={{ fontWeight: 900 }}>영수자</TableCell>
              <TableCell align="right" sx={{ fontWeight: 900 }}>총금액</TableCell>
              <TableCell align="center" sx={{ fontWeight: 900 }}>상태</TableCell>
              <TableCell align="center" sx={{ fontWeight: 900 }}>최근 수정</TableCell>
              <TableCell align="center" sx={{ fontWeight: 900, width: 110 }}>관리</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            ) : documents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 10, color: '#94a3b8' }}>
                  작성된 지출결의서가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              documents.map((document, index) => (
                <TableRow
                  hover
                  key={document.id}
                  onClick={() => onEdit(document)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell align="center">{index + 1}</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 800 }}>
                    {document.expense_month?.slice(0, 7)}
                  </TableCell>
                  <TableCell>{document.project_name}</TableCell>
                  <TableCell align="center">{document.claimant_name || document.created_by_name || '-'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>
                    {formatMoney(document.total_amount)}원
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      label={STATUS_LABELS[document.status] || document.status || '작성중'}
                      color={STATUS_COLORS[document.status] || 'default'}
                      variant={document.status === 'draft' ? 'outlined' : 'filled'}
                      sx={{ fontSize: '0.66rem', height: 23 }}
                    />
                  </TableCell>
                  <TableCell align="center">{formatDateTime(document.updated_at)}</TableCell>
                  <TableCell align="center">
                    <Stack direction="row" justifyContent="center" spacing={0.2}>
                      <Tooltip title="수정">
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(document);
                          }}
                        >
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="삭제">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDelete(document);
                          }}
                        >
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

export default function ExpenseResolution({ userProfile }) {
  const [writing, setWriting] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [listVersion, setListVersion] = useState(0);

  if (writing) {
    return (
      <ExpenseEditor
        userProfile={userProfile}
        editingDocument={editingDocument}
        onBack={() => {
          setWriting(false);
          setEditingDocument(null);
        }}
        onSaved={() => {
          setWriting(false);
          setEditingDocument(null);
          setListVersion((previous) => previous + 1);
        }}
      />
    );
  }

  return (
    <Box key={listVersion} sx={{ height: '100%', minHeight: 0 }}>
      <ExpenseList
        userProfile={userProfile}
        onCreate={() => {
          setEditingDocument(null);
          setWriting(true);
        }}
        onEdit={(document) => {
          setEditingDocument(document);
          setWriting(true);
        }}
      />
    </Box>
  );
}
