import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Popover,
  Snackbar,
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
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import { supabase } from '../supabaseClient';
import { downloadExpenseResolutionExcel } from '../utils/expenseResolutionExcel';
import { parseHiPlusReceiptPdf } from '../utils/highpassReceiptPdf';

import SystemPageTitle from '../components/SystemPageTitle.jsx';
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

function StatusToast({ message, onClose }) {
  return (
    <Snackbar
      key={message?.id || message?.text || 'expense-toast'}
      open={Boolean(message)}
      autoHideDuration={3000}
      onClose={(_, reason) => {
        if (reason !== 'clickaway') onClose();
      }}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      sx={{ mt: 7, zIndex: (theme) => theme.zIndex.modal + 20 }}
    >
      <Alert
        severity={message?.severity || 'info'}
        variant="filled"
        onClose={onClose}
        sx={{ minWidth: 300, boxShadow: 6 }}
      >
        {message?.text || ''}
      </Alert>
    </Snackbar>
  );
}

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
  fuel_amount: '',
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

const TOLL_META_PREFIX = '__TOLL_V2__:';

const parseRouteDescription = (value) => {
  const raw = String(value ?? '');
  if (!raw.startsWith(TOLL_META_PREFIX)) {
    return { distanceKm: raw, fuelAmount: '' };
  }
  try {
    const parsed = JSON.parse(raw.slice(TOLL_META_PREFIX.length));
    return {
      distanceKm: parsed?.distanceKm ?? '',
      fuelAmount: parsed?.fuelAmount ?? '',
    };
  } catch (error) {
    return { distanceKm: '', fuelAmount: '' };
  }
};

const normalizeItem = (item, index = 0) => {
  const routeMeta = parseRouteDescription(item?.description);
  return {
    clientId: item?.id || item?.clientId || createClientId(),
    expense_date: item?.expense_date || '',
    category: item?.category || 'other',
    origin: item?.origin || '',
    destination: item?.destination || '',
    destination_time: item?.destination_time ? String(item.destination_time).slice(0, 5) : '',
    description: routeMeta.distanceKm,
    fuel_amount: item?.fuel_amount ?? routeMeta.fuelAmount,
    amount: item?.amount ?? '',
    sort_order: item?.sort_order ?? index,
  };
};

const cleanRoutePlace = (value) =>
  String(value || '')
    .trim()
    .replace(/\s*영업소\s*$/u, '')
    .trim();

const sanitizeDistanceInput = (value) => {
  const cleaned = String(value ?? '')
    .replace(/,/g, '.')
    .replace(/[^0-9.]/g, '');
  const [whole = '', ...decimalParts] = cleaned.split('.');
  if (decimalParts.length === 0) return whole;
  const decimal = decimalParts.join('').slice(0, 1);
  return decimal ? `${whole || '0'}.${decimal}` : whole;
};

const getDistanceKm = (item) => sanitizeDistanceInput(item?.distance_km ?? item?.description);

const getFuelAmount = (item) => (
  item?.category === 'toll' ? Math.round(toNumber(item?.fuel_amount)) : 0
);

const getItemTotalAmount = (item) => Math.round(toNumber(item?.amount)) + getFuelAmount(item);

const serializeDescription = (item) => {
  if (item?.category !== 'toll') return String(item?.description || '').trim();
  const distanceKm = getDistanceKm(item);
  const fuelAmount = getFuelAmount(item);
  if (!fuelAmount) return distanceKm;
  return `${TOLL_META_PREFIX}${JSON.stringify({ distanceKm, fuelAmount })}`;
};

const getDistanceText = (item) => {
  const distance = getDistanceKm(item);
  return distance ? `${distance}km` : '';
};

const getRouteUsageText = (item, spaced = false) => {
  const origin = cleanRoutePlace(item?.origin);
  const destination = cleanRoutePlace(item?.destination);
  const route = [origin, destination].filter(Boolean).join(spaced ? ' → ' : '→');
  return [route, getDistanceText(item)].filter(Boolean).join(' ') || '-';
};

const getTollUsageText = (item) => {
  const destination = cleanRoutePlace(item?.destination);
  const time = String(item?.destination_time || '').slice(0, 5);
  return [destination, time].filter(Boolean).join(' ') || '-';
};

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
    return `${getRouteUsageText(item)}(유류비)`;
  }
  if (item.category === 'toll') {
    const fuelText = getFuelAmount(item) > 0 ? `${getRouteUsageText(item)}(유류비) / ` : '';
    return `${fuelText}${getTollUsageText(item)}(통행료)`;
  }
  return `${item.description || label}(${label})`;
};

const getItemDisplayDetail = (item) => {
  const isRouteItem = item.category === 'fuel' || item.category === 'toll';
  if (!isRouteItem) return item.description || '-';
  if (item.category === 'toll') {
    return `${getRouteUsageText(item, true)} · ${getTollUsageText(item)}`;
  }
  return getRouteUsageText(item, true);
};

const getTollDuplicateKey = (item) => {
  if (item.category !== 'toll') return '';
  return [
    item.expense_date || '',
    String(item.destination_time || '').slice(0, 5),
    String(item.destination || '').trim(),
    Math.round(toNumber(item.amount)),
  ].join('|');
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
  const displayValue = selected
    ? `${selected.year}년 ${selected.month}월`
    : '';

  return (
    <>
      <TextField
        label={label}
        size="small"
        value={displayValue}
        placeholder="연도와 월 선택"
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
            <Typography sx={{ fontSize: '0.88rem', fontWeight: 900 }}>{viewYear}년</Typography>
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
                  {monthNumber}월
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
      : String(value).slice(2, 10)
    : '';
  const weekNames = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <>
      <TextField
        label={label}
        size="small"
        value={displayValue}
        placeholder={displayMode === 'month-day' ? 'mm-dd' : 'yy-mm-dd'}
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
              {viewYear}년 {viewMonth}월
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
  const paperRef = useRef(null);
  const [paperWidth, setPaperWidth] = useState(920);
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
      if (item.category === 'toll') next.fuel += getFuelAmount(item);
    });
    return next;
  }, [rows]);

  const grandTotal = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const [year, monthNumber] = month.split('-');

  useEffect(() => {
    const node = paperRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;

    const updateWidth = () => setPaperWidth(node.getBoundingClientRect().width);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const usedCategories = useMemo(
    () => new Set(rows.map((item) => item.category)),
    [rows],
  );

  const coreColumns = useMemo(() => [
    {
      key: 'date',
      label: '날짜',
      width: 62,
      align: 'left',
      value: (item) => formatDate(item.expense_date),
      total: () => '계',
    },
    {
      key: 'fuelDetail',
      label: '유류대',
      width: 120,
      align: 'left',
      value: (item) => (item.category === 'fuel' || item.category === 'toll' ? getRouteUsageText(item) : ''),
      total: () => '',
    },
    {
      key: 'fuelAmount',
      label: '금액',
      width: 56,
      align: 'right',
      subLabel: '유류비',
      value: (item) => {
        if (item.category === 'fuel') return formatMoney(item.amount);
        if (item.category === 'toll' && getFuelAmount(item) > 0) return formatMoney(getFuelAmount(item));
        return '';
      },
      total: () => formatMoney(totals.fuel),
    },
    {
      key: 'tollDetail',
      label: '통행료',
      width: 72,
      align: 'left',
      value: (item) => (item.category === 'toll' ? getTollUsageText(item) : ''),
      total: () => '',
    },
    {
      key: 'tollAmount',
      label: '금액',
      width: 56,
      align: 'right',
      subLabel: '통행료',
      value: (item) => (item.category === 'toll' ? formatMoney(item.amount) : ''),
      total: () => formatMoney(totals.toll),
    },
  ], [totals.fuel, totals.toll]);

  const categoryColumns = useMemo(() => ({
    entertainment: {
      key: 'entertainment', label: '접대비', width: 62, align: 'right',
      value: (item) => (item.category === 'entertainment' ? formatMoney(item.amount) : ''),
      total: () => formatMoney(totals.entertainment),
    },
    lodging: {
      key: 'lodging', label: '숙박비', width: 60, align: 'right',
      value: (item) => (item.category === 'lodging' ? formatMoney(item.amount) : ''),
      total: () => formatMoney(totals.lodging),
    },
    materials: {
      key: 'materials', label: '잡자재', width: 58, align: 'right',
      value: (item) => (item.category === 'materials' ? formatMoney(item.amount) : ''),
      total: () => formatMoney(totals.materials),
    },
    shipping: {
      key: 'shipping', label: '우편/택배', width: 68, align: 'right',
      value: (item) => (item.category === 'shipping' ? formatMoney(item.amount) : ''),
      total: () => formatMoney(totals.shipping),
    },
    other: {
      key: 'other', label: '기타', width: 58, align: 'right',
      value: (item) => (item.category === 'other' ? formatMoney(item.amount) : ''),
      total: () => formatMoney(totals.other),
    },
  }), [totals.entertainment, totals.lodging, totals.materials, totals.other, totals.shipping]);

  const visibleColumns = useMemo(() => {
    const extraKeys = ['materials', 'shipping', 'other'].filter((key) => usedCategories.has(key));
    let optionalKeys = ['entertainment', 'lodging', ...extraKeys];
    const availableTableWidth = Math.max(0, paperWidth - 62);
    const getWidth = (keys) => [
      ...coreColumns,
      ...keys.map((key) => categoryColumns[key]),
    ].reduce((sum, column) => sum + column.width, 0);

    if (extraKeys.length > 0 && getWidth(optionalKeys) > availableTableWidth) {
      optionalKeys = optionalKeys.filter(
        (key) => !(['entertainment', 'lodging'].includes(key) && !usedCategories.has(key)),
      );
    }

    return [...coreColumns, ...optionalKeys.map((key) => categoryColumns[key])];
  }, [categoryColumns, coreColumns, paperWidth, usedCategories]);

  const tableMinWidth = visibleColumns.reduce((sum, column) => sum + column.width, 0);

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
      ref={paperRef}
      elevation={0}
      sx={{
        width: '100%',
        minWidth: 0,
        minHeight: 1180,
        mx: 'auto',
        p: '48px clamp(14px, 2.2vw, 30px) 40px',
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

      <TableContainer sx={{ borderTop: '1px solid #475569', borderLeft: '1px solid #475569', overflowX: 'auto' }}>
        <Table size="small" sx={{ tableLayout: 'fixed', minWidth: tableMinWidth }}>
          <TableHead>
            <TableRow>
              {visibleColumns.map((column) => (
                <TableCell
                  key={column.key}
                  align="center"
                  sx={{ ...cellSx, width: column.width, fontWeight: 900, whiteSpace: 'nowrap' }}
                >
                  {column.label}
                  {column.subLabel && (
                    <Typography component="span" sx={{ display: 'block', fontSize: '0.48rem', lineHeight: 1.05, fontWeight: 700 }}>
                      ({column.subLabel})
                    </Typography>
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} align="center" sx={{ ...cellSx, height: 120, color: '#94a3b8' }}>
                  좌측에서 사용내역을 입력하면 이곳에 실시간으로 표시됩니다.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((item) => (
                <TableRow key={item.clientId}>
                  {visibleColumns.map((column) => (
                    <TableCell key={column.key} align={column.align} sx={cellSx}>
                      {column.value(item)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
            <TableRow>
              {visibleColumns.map((column) => (
                <TableCell key={column.key} align={column.align} sx={{ ...cellSx, fontWeight: 900 }}>
                  {column.total()}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell align="center" sx={{ ...cellSx, fontWeight: 900 }}>합계</TableCell>
              <TableCell colSpan={Math.max(1, visibleColumns.length - 2)} sx={cellSx} />
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
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

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
          ~ {year}년 {Number(monthNumber)}월 ~
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
          2. 통행료 PDF 내역은 유류대에 출발지→도착지·km를 표시합니다.<br />
          3. 통행료에는 도착지와 도착시간을 표시합니다.<br />
          4. 그 외 항목은 사용내용과 발생 항목을 날짜별로 표시합니다.
        </Typography>
      </Box>
    </Paper>
  );
}

function ExpenseItemDialog({ open, month, initialItem, onClose, onSave }) {
  const [draft, setDraft] = useState(createEmptyItem(month));
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(initialItem ? { ...initialItem } : createEmptyItem(month));
    setErrorText('');
  }, [open, initialItem, month]);

  const isRouteItem = draft.category === 'fuel' || draft.category === 'toll';

  const changeDraft = (field, value) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
  };

  const confirm = () => {
    if (!draft.expense_date) {
      setErrorText('사용일을 선택해주세요.');
      return;
    }
    if (!draft.expense_date.startsWith(`${month}-`)) {
      setErrorText('사용일은 선택한 작성월 안에 있어야 합니다.');
      return;
    }
    if (toNumber(draft.amount) <= 0) {
      setErrorText('금액을 입력해주세요.');
      return;
    }
    if (isRouteItem && (!draft.origin.trim() || !draft.destination.trim())) {
      setErrorText(`${CATEGORY_LABELS[draft.category]}는 출발지와 도착지를 모두 입력해주세요.`);
      return;
    }
    if (isRouteItem && toNumber(getDistanceKm(draft)) <= 0) {
      setErrorText(`${CATEGORY_LABELS[draft.category]}의 이동거리(km)를 입력해주세요.`);
      return;
    }
    if (!isRouteItem && !draft.description.trim()) {
      setErrorText('사용내용을 입력해주세요.');
      return;
    }

    onSave({
      ...draft,
      clientId: draft.clientId || createClientId(),
      amount: String(Math.round(toNumber(draft.amount))),
      fuel_amount: draft.category === 'toll' ? String(getFuelAmount(draft) || '') : '',
      destination_time: draft.destination_time ? String(draft.destination_time).slice(0, 5) : '',
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 900 }}>
        {initialItem ? '사용내역 수정' : '새 사용내역 추가'}
      </DialogTitle>
      <DialogContent dividers>
        {errorText && (
          <Alert severity="warning" sx={{ mb: 1.2 }} onClose={() => setErrorText('')}>
            {errorText}
          </Alert>
        )}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '150px 190px minmax(180px, 1fr)' },
            gap: 1,
          }}
        >
          <NumericDateField
            label="사용일"
            value={draft.expense_date}
            displayMode="month-day"
            onChange={(value) => changeDraft('expense_date', value)}
          />
          <TextField
            select
            label="지출항목"
            size="small"
            value={draft.category}
            onChange={(event) => changeDraft('category', event.target.value)}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          {!isRouteItem && (
            <TextField
              label="금액"
              size="small"
              value={draft.amount}
              onChange={(event) => changeDraft('amount', event.target.value.replace(/[^0-9]/g, ''))}
              inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
              InputProps={{ endAdornment: <Typography sx={{ fontSize: '0.7rem' }}>원</Typography> }}
            />
          )}
        </Box>

        {isRouteItem ? (
          <>
            <Box
              sx={{
                mt: 1,
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: draft.category === 'toll'
                    ? 'minmax(100px, 0.9fr) minmax(100px, 0.9fr) minmax(90px, 0.7fr) minmax(90px, 0.7fr) minmax(105px, 0.8fr) minmax(95px, 0.7fr)'
                    : 'minmax(115px, 1fr) minmax(115px, 1fr) minmax(105px, 0.8fr) minmax(105px, 0.8fr) minmax(105px, 0.8fr)',
                },
                gap: 1,
              }}
            >
              <TextField
                label="출발지"
                size="small"
                value={draft.origin}
                onChange={(event) => changeDraft('origin', event.target.value)}
                placeholder="예: 서울"
              />
              <TextField
                label={draft.category === 'toll' ? '도착영업소' : '도착지'}
                size="small"
                value={draft.destination}
                onChange={(event) => changeDraft('destination', event.target.value)}
                placeholder={draft.category === 'toll' ? '예: 서서울영업소' : '예: 용인'}
              />
              {draft.category === 'toll' && (
                <TextField
                  label="유류비"
                  size="small"
                  value={draft.fuel_amount || ''}
                  onChange={(event) => changeDraft('fuel_amount', event.target.value.replace(/[^0-9]/g, ''))}
                  inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                  InputProps={{ endAdornment: <Typography sx={{ fontSize: '0.7rem' }}>원</Typography> }}
                />
              )}
              <TextField
                label={draft.category === 'toll' ? '통행료' : '금액'}
                size="small"
                value={draft.amount}
                onChange={(event) => changeDraft('amount', event.target.value.replace(/[^0-9]/g, ''))}
                inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                InputProps={{ endAdornment: <Typography sx={{ fontSize: '0.7rem' }}>원</Typography> }}
              />
              <TextField
                label="도착시간"
                type="time"
                size="small"
                value={draft.destination_time}
                onChange={(event) => changeDraft('destination_time', event.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 60 }}
                sx={{ '& input': { minWidth: 120 } }}
              />
              <TextField
                label="이동거리(km)"
                size="small"
                value={getDistanceKm(draft)}
                onChange={(event) => changeDraft('description', sanitizeDistanceInput(event.target.value))}
                inputProps={{ inputMode: 'decimal', style: { textAlign: 'right' } }}
                placeholder="예: 35"
              />
            </Box>
          </>
        ) : (
          <TextField
            label="사용내용"
            size="small"
            fullWidth
            value={draft.description}
            onChange={(event) => changeDraft('description', event.target.value)}
            placeholder="사용내용을 입력하세요"
            sx={{ mt: 1 }}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.2 }}>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" onClick={confirm} sx={{ bgcolor: '#0f766e' }}>
          {initialItem ? '수정 반영' : '내역 추가'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function TollPdfImportDialog({
  open,
  fileName,
  rows,
  warnings,
  currentMonth,
  canChangeMonth,
  useReceiptMonth,
  onUseReceiptMonthChange,
  onRowsChange,
  onClose,
  onConfirm,
}) {
  const [bulkOrigin, setBulkOrigin] = useState('');
  const [bulkDistanceKm, setBulkDistanceKm] = useState('');
  const [bulkFuelAmount, setBulkFuelAmount] = useState('');
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    if (!open) return;
    setBulkOrigin('');
    setBulkDistanceKm('');
    setBulkFuelAmount('');
    setErrorText('');
  }, [open]);

  const availableRows = rows.filter((row) => !row.isDuplicate);
  const selectedRows = availableRows.filter((row) => row.selected);
  const receiptMonths = [...new Set(rows.map((row) => row.expense_date?.slice(0, 7)).filter(Boolean))];
  const receiptMonth = receiptMonths.length === 1 ? receiptMonths[0] : '';
  const allSelected = availableRows.length > 0 && selectedRows.length === availableRows.length;
  const selectedFuelTotal = selectedRows.reduce((sum, row) => sum + toNumber(row.fuel_amount), 0);
  const selectedTollTotal = selectedRows.reduce((sum, row) => sum + toNumber(row.amount), 0);

  const updateRow = (receiptKey, field, value) => {
    onRowsChange(
      rows.map((row) => (row.receiptKey === receiptKey ? { ...row, [field]: value } : row)),
    );
  };

  const applyBulkValues = () => {
    const origin = bulkOrigin.trim();
    const distanceKm = sanitizeDistanceInput(bulkDistanceKm);
    const fuelAmount = bulkFuelAmount.replace(/[^0-9]/g, '');
    if (!origin && !distanceKm && !fuelAmount) {
      setErrorText('일괄 적용할 출발지, 이동거리(km), 유류비 중 하나를 입력해주세요.');
      return;
    }
    onRowsChange(rows.map((row) => (
      row.selected
        ? {
          ...row,
          ...(origin ? { origin } : {}),
          ...(distanceKm ? { distance_km: distanceKm } : {}),
          ...(fuelAmount ? { fuel_amount: fuelAmount } : {}),
        }
        : row
    )));
    setErrorText('');
  };

  const confirm = () => {
    if (selectedRows.length === 0) {
      setErrorText('추가할 통행료 내역을 선택해주세요.');
      return;
    }
    const missingOrigin = selectedRows.find((row) => !row.origin.trim());
    if (missingOrigin) {
      setErrorText(`${formatDate(missingOrigin.expense_date)} ${missingOrigin.destination} 내역의 출발지를 입력해주세요.`);
      return;
    }
    const missingDistance = selectedRows.find((row) => toNumber(row.distance_km) <= 0);
    if (missingDistance) {
      setErrorText(`${formatDate(missingDistance.expense_date)} ${cleanRoutePlace(missingDistance.destination)} 내역의 이동거리(km)를 입력해주세요.`);
      return;
    }
    onConfirm();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 900 }}>
        통행료 PDF 가져오기
      </DialogTitle>
      <DialogContent dividers sx={{ p: 1.5 }}>
        <Stack spacing={1.1}>
          <Alert severity="info">
            <strong>{fileName}</strong>에서 SM하이플러스 영수증 {rows.length}건을 읽었습니다. 자동 입력된 도착시간을 확인하고 출발지·이동거리(km)·유류비를 작성해주세요.
          </Alert>
          {warnings.length > 0 && (
            <Alert severity="warning">{warnings.join(' ')}</Alert>
          )}
          {canChangeMonth && receiptMonth && receiptMonth !== currentMonth && (
            <FormControlLabel
              control={(
                <Checkbox
                  checked={useReceiptMonth}
                  onChange={(event) => onUseReceiptMonthChange(event.target.checked)}
                />
              )}
              label={`작성월을 PDF 영수월 ${receiptMonth}로 변경`}
              sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: '0.78rem', fontWeight: 800 } }}
            />
          )}
          <Paper variant="outlined" sx={{ p: 1, bgcolor: '#f8fafc', boxShadow: 'none' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.8} alignItems={{ md: 'center' }}>
              <TextField
                label="출발지 일괄 입력"
                size="small"
                value={bulkOrigin}
                onChange={(event) => setBulkOrigin(event.target.value)}
                placeholder="예: 한라건설 용인금어지구"
                sx={{ flex: 1 }}
              />
              <TextField
                label="이동거리(km) 일괄 입력"
                size="small"
                value={bulkDistanceKm}
                onChange={(event) => setBulkDistanceKm(sanitizeDistanceInput(event.target.value))}
                placeholder="예: 35"
                inputProps={{ inputMode: 'decimal', style: { textAlign: 'right' } }}
                sx={{ width: { xs: '100%', md: 210 } }}
              />
              <TextField
                label="유류비 일괄 입력"
                size="small"
                value={bulkFuelAmount}
                onChange={(event) => setBulkFuelAmount(event.target.value.replace(/[^0-9]/g, ''))}
                placeholder="예: 50000"
                inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                InputProps={{ endAdornment: <Typography sx={{ fontSize: '0.68rem' }}>원</Typography> }}
                sx={{ width: { xs: '100%', md: 190 } }}
              />
              <Button variant="outlined" onClick={applyBulkValues} sx={{ whiteSpace: 'nowrap' }}>
                선택 항목에 적용
              </Button>
            </Stack>
          </Paper>
          {errorText && (
            <Alert severity="warning" onClose={() => setErrorText('')}>
              {errorText}
            </Alert>
          )}
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 430, boxShadow: 'none' }}>
            <Table size="small" stickyHeader sx={{ minWidth: 1160 }}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={allSelected}
                      indeterminate={selectedRows.length > 0 && !allSelected}
                      onChange={(event) => onRowsChange(rows.map((row) => (row.isDuplicate ? row : { ...row, selected: event.target.checked })))}
                    />
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 900, width: 80 }}>사용일</TableCell>
                  <TableCell sx={{ fontWeight: 900, minWidth: 190 }}>출발지</TableCell>
                  <TableCell sx={{ fontWeight: 900, minWidth: 150 }}>도착영업소</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 900, width: 130 }}>도착시간</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 900, width: 145 }}>이동거리(km)</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900, width: 140 }}>유류비</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900, width: 140 }}>통행료</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.receiptKey} hover selected={row.selected}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={row.selected}
                        disabled={row.isDuplicate}
                        onChange={(event) => updateRow(row.receiptKey, 'selected', event.target.checked)}
                      />
                    </TableCell>
                    <TableCell align="center">{formatDate(row.expense_date)}</TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={row.origin}
                        disabled={!row.selected || row.isDuplicate}
                        onChange={(event) => updateRow(row.receiptKey, 'origin', event.target.value)}
                        placeholder="출발지 입력"
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={row.destination}
                        disabled={!row.selected || row.isDuplicate}
                        onChange={(event) => updateRow(row.receiptKey, 'destination', event.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="time"
                        fullWidth
                        value={row.destination_time}
                        disabled={!row.selected || row.isDuplicate}
                        onChange={(event) => updateRow(row.receiptKey, 'destination_time', event.target.value)}
                        inputProps={{ step: 60 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={row.distance_km || ''}
                        disabled={!row.selected || row.isDuplicate}
                        onChange={(event) => updateRow(row.receiptKey, 'distance_km', sanitizeDistanceInput(event.target.value))}
                        inputProps={{ inputMode: 'decimal', style: { textAlign: 'right' } }}
                        InputProps={{ endAdornment: <Typography sx={{ fontSize: '0.68rem' }}>km</Typography> }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={row.fuel_amount || ''}
                        disabled={!row.selected || row.isDuplicate}
                        onChange={(event) => updateRow(row.receiptKey, 'fuel_amount', event.target.value.replace(/[^0-9]/g, ''))}
                        inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                        InputProps={{ endAdornment: <Typography sx={{ fontSize: '0.68rem' }}>원</Typography> }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={row.amount}
                        disabled={!row.selected || row.isDuplicate}
                        onChange={(event) => updateRow(row.receiptKey, 'amount', event.target.value.replace(/[^0-9]/g, ''))}
                        inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                        InputProps={{ endAdornment: <Typography sx={{ fontSize: '0.68rem' }}>원</Typography> }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography sx={{ fontSize: '0.74rem', color: '#64748b' }}>
              선택 {selectedRows.length}건 / 추가 가능 {availableRows.length}건
            </Typography>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 900 }}>
              유류비 {formatMoney(selectedFuelTotal)}원 · 통행료 {formatMoney(selectedTollTotal)}원 · 합계 {formatMoney(selectedFuelTotal + selectedTollTotal)}원
            </Typography>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.2 }}>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" onClick={confirm} sx={{ bgcolor: '#0f766e' }}>
          선택 내역 추가
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ExpenseEditor({ userProfile, editingDocument, onBack, onSaved }) {
  const initialMonth = editingDocument?.expense_month?.slice(0, 7) || getCurrentMonth();
  const [month, setMonth] = useState(initialMonth);
  const [claimDate, setClaimDate] = useState(editingDocument?.claim_date || getKoreaToday());
  const [claimantName, setClaimantName] = useState(
    editingDocument?.claimant_name || userProfile?.manager_name || userProfile?.name || '',
  );
  const [items, setItems] = useState([]);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [pdfInputKey, setPdfInputKey] = useState(0);
  const [parsingPdf, setParsingPdf] = useState(false);
  const [pdfImportOpen, setPdfImportOpen] = useState(false);
  const [pdfImportRows, setPdfImportRows] = useState([]);
  const [pdfImportFileName, setPdfImportFileName] = useState('');
  const [pdfImportWarnings, setPdfImportWarnings] = useState([]);
  const [useReceiptMonth, setUseReceiptMonth] = useState(false);
  const [previewTab, setPreviewTab] = useState(0);
  const [loading, setLoading] = useState(Boolean(editingDocument?.id));
  const [saving, setSaving] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [message, setMessage] = useState(null);
  const [splitPercent, setSplitPercent] = useState(46);
  const splitContainerRef = useRef(null);

  const projectName = userProfile?.project_name || '';

  const handleSplitPointerDown = (event) => {
    if (!splitContainerRef.current) return;
    event.preventDefault();

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const handlePointerMove = (moveEvent) => {
      const bounds = splitContainerRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0) return;
      const nextPercent = ((moveEvent.clientX - bounds.left) / bounds.width) * 100;
      setSplitPercent(Math.min(75, Math.max(25, nextPercent)));
    };

    const handlePointerUp = () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleSplitKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const amount = event.shiftKey ? 5 : 2;
    setSplitPercent((previous) => Math.min(
      75,
      Math.max(25, previous + (event.key === 'ArrowRight' ? amount : -amount)),
    ));
  };

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
        setItems([]);
      } else {
        const normalized = (data || []).map(normalizeItem);
        setItems(normalized);
      }
      setLoading(false);
    };

    loadItems();
    return () => {
      active = false;
    };
  }, [editingDocument?.id, initialMonth]);

  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + getItemTotalAmount(item), 0),
    [items],
  );

  const updateItemField = (clientId, field, value) => {
    setItems((previous) => previous.map((item) => {
      if (item.clientId !== clientId) return item;
      if (field === 'category') {
        return { ...item, category: value, fuel_amount: value === 'toll' ? item.fuel_amount : '' };
      }
      return { ...item, [field]: value };
    }));
  };

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

  const handleOpenAddItem = () => {
    setEditingItem(null);
    setItemDialogOpen(true);
  };

  const handleOpenEditItem = (item) => {
    setEditingItem(item);
    setItemDialogOpen(true);
  };

  const handleSaveItem = (nextItem) => {
    setItems((previous) => {
      const exists = previous.some((item) => item.clientId === nextItem.clientId);
      if (exists) {
        return previous.map((item) => (item.clientId === nextItem.clientId ? nextItem : item));
      }
      return [...previous, nextItem];
    });
    setItemDialogOpen(false);
    setEditingItem(null);
  };

  const handleDeleteItem = (clientId) => {
    if (!window.confirm('이 사용내역을 삭제하시겠습니까?')) return;
    setItems((previous) => previous.filter((item) => item.clientId !== clientId));
  };

  const handleTollPdfUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setMessage({ severity: 'warning', text: 'PDF 파일은 20MB 이하만 업로드할 수 있습니다.' });
      setPdfInputKey((previous) => previous + 1);
      return;
    }

    setParsingPdf(true);
    setMessage(null);
    try {
      const result = await parseHiPlusReceiptPdf(file);
      const existingKeys = new Set(items.map(getTollDuplicateKey).filter(Boolean));
      const parsedRows = result.receipts.map((receipt) => {
        const isDuplicate = existingKeys.has([
          receipt.expense_date,
          receipt.destination_time,
          receipt.destination,
          Math.round(toNumber(receipt.amount)),
        ].join('|'));
        return {
          ...receipt,
          selected: !isDuplicate,
          isDuplicate,
          origin: '',
          distance_km: '',
          fuel_amount: '',
          amount: String(receipt.amount),
        };
      });
      const duplicatedCount = parsedRows.filter((row) => !row.selected).length;
      const selectableCount = parsedRows.length - duplicatedCount;

      if (selectableCount === 0) {
        setMessage({ severity: 'info', text: `PDF에서 ${parsedRows.length}건을 읽었지만 모두 현재 목록과 중복됩니다.` });
        return;
      }

      const receiptMonths = [...new Set(parsedRows.map((row) => row.expense_date.slice(0, 7)))];
      setPdfImportRows(parsedRows);
      setPdfImportFileName(file.name);
      setPdfImportWarnings([
        ...(result.warnings || []),
        ...(duplicatedCount > 0 ? [`현재 목록과 중복되는 ${duplicatedCount}건은 선택 해제했습니다.`] : []),
      ]);
      setUseReceiptMonth(items.length === 0 && receiptMonths.length === 1 && receiptMonths[0] !== month);
      setPdfImportOpen(true);
    } catch (error) {
      console.error('통행료 PDF 분석 오류:', error);
      setMessage({ severity: 'error', text: `통행료 PDF를 읽지 못했습니다: ${error.message || error}` });
    } finally {
      setParsingPdf(false);
      setPdfInputKey((previous) => previous + 1);
    }
  };

  const handleConfirmPdfImport = () => {
    const selectedRows = pdfImportRows.filter((row) => row.selected);
    const receiptMonths = [...new Set(selectedRows.map((row) => row.expense_date.slice(0, 7)))];
    if (useReceiptMonth && items.length === 0 && receiptMonths.length === 1) {
      setMonth(receiptMonths[0]);
    }

    const importedItems = selectedRows.map((row, index) => ({
      clientId: createClientId(),
      expense_date: row.expense_date,
      category: 'toll',
      origin: row.origin.trim(),
      destination: row.destination.trim(),
      destination_time: String(row.destination_time || '').slice(0, 5),
      description: sanitizeDistanceInput(row.distance_km),
      fuel_amount: String(Math.round(toNumber(row.fuel_amount)) || ''),
      amount: String(Math.round(toNumber(row.amount))),
      sort_order: items.length + index,
    }));

    setItems((previous) => [...previous, ...importedItems]);
    setPdfImportOpen(false);
    setMessage({ severity: 'success', text: `통행료 ${importedItems.length}건을 도착시간·경로·이동거리(km)·유류비와 함께 사용내역에 추가했습니다.` });
  };

  const validate = () => {
    if (!projectName) return '현장이 선택되지 않았습니다.';
    if (!month) return '작성월을 선택해주세요.';
    if (!claimDate) return '청구일을 입력해주세요.';
    if (!claimantName.trim()) return '영수자 이름을 입력해주세요.';

    const validItems = items.filter((item) => getItemTotalAmount(item) > 0);
    if (validItems.length === 0) return '금액이 입력된 사용내역을 한 건 이상 작성해주세요.';

    for (const item of validItems) {
      if (!item.expense_date) return '사용일을 입력해주세요.';
      if (!item.expense_date.startsWith(`${month}-`)) return '모든 사용일은 선택한 작성월 안에 있어야 합니다.';
      if (!CATEGORY_LABELS[item.category]) return '지출항목을 선택해주세요.';
      if (toNumber(item.amount) <= 0) return `${CATEGORY_LABELS[item.category]} 금액을 입력해주세요.`;
      if ((item.category === 'fuel' || item.category === 'toll') && (!item.origin.trim() || !item.destination.trim())) {
        return `${CATEGORY_LABELS[item.category]}는 출발지와 도착지를 모두 입력해주세요.`;
      }
      if ((item.category === 'fuel' || item.category === 'toll') && toNumber(getDistanceKm(item)) <= 0) {
        return `${CATEGORY_LABELS[item.category]}의 이동거리(km)를 입력해주세요.`;
      }
      if (item.category !== 'fuel' && item.category !== 'toll' && !item.description.trim()) {
        return `${CATEGORY_LABELS[item.category]} 항목의 사용내용을 입력해주세요.`;
      }
    }
    return '';
  };

  const handleExcelDownload = async () => {
    const validationMessage = validate();
    if (validationMessage) {
      setMessage({ severity: 'warning', text: validationMessage });
      return;
    }

    setExportingExcel(true);
    setMessage(null);
    try {
      const fileName = await downloadExpenseResolutionExcel({
        month,
        claimDate,
        claimantName,
        projectName,
        items,
      });
      setMessage({ severity: 'success', text: `${fileName} 파일을 만들었습니다.` });
    } catch (error) {
      console.error('지출결의서 엑셀 생성 오류:', error);
      setMessage({ severity: 'error', text: `엑셀 파일을 만들지 못했습니다: ${error.message || error}` });
    } finally {
      setExportingExcel(false);
    }
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
        .filter((item) => getItemTotalAmount(item) > 0)
        .map((item, index) => ({
          expense_date: item.expense_date,
          category: item.category,
          origin: item.origin.trim(),
          destination: item.destination.trim(),
          destination_time: item.destination_time || null,
          description: serializeDescription(item),
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
      onSaved(data, { severity: 'success', text: '지출결의서가 저장되었습니다.' });
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
              좌측에서 사용내역을 작성하고 우측에서 미리보기를 확인합니다. 가운데 구분선을 드래그해 폭을 조절할 수 있습니다.
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography sx={{ fontSize: '0.76rem', fontWeight: 900, color: '#334155' }}>
            합계 {formatMoney(totalAmount)}원
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={exportingExcel ? <CircularProgress size={15} /> : <FileDownloadRoundedIcon />}
            disabled={exportingExcel || saving}
            onClick={handleExcelDownload}
            sx={{
              color: '#0f766e',
              borderColor: '#0f766e',
              '&:hover': { borderColor: '#115e59', bgcolor: '#f0fdfa' },
            }}
          >
            엑셀 다운로드
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={saving ? <CircularProgress size={15} color="inherit" /> : <SaveRoundedIcon />}
            disabled={saving || exportingExcel}
            onClick={handleSave}
            sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}
          >
            저장
          </Button>
        </Stack>
      </Paper>

      <StatusToast message={message} onClose={() => setMessage(null)} />

      <Box
        ref={splitContainerRef}
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: { xs: 'column', lg: 'row' },
          overflow: { xs: 'auto', lg: 'hidden' },
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            flex: { xs: '0 0 auto', lg: `0 0 calc(${splitPercent}% - 5px)` },
            minWidth: 0,
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
            subtitle={(
              <>
                등록된 내역은 목록으로 표시됩니다.<br />
                각 셀을 클릭해 바로 수정합니다. 신규 입력은 내역 추가, 하이패스는 통행료 PDF 업로드를 사용합니다.
              </>
            )}
            action={(
              <Stack direction="row" spacing={0.7}>
                <Button
                  component="label"
                  size="small"
                  variant="outlined"
                  disabled={parsingPdf}
                  sx={{
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                    px: 0.9,
                    py: 0.45,
                    fontSize: '0.68rem',
                    lineHeight: 1.25,
                  }}
                >
                  {parsingPdf ? 'PDF 읽는 중...' : '통행료 PDF 업로드'}
                  <input
                    key={pdfInputKey}
                    hidden
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleTollPdfUpload}
                  />
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleOpenAddItem}
                  sx={{
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                    px: 0.9,
                    py: 0.45,
                    fontSize: '0.68rem',
                    lineHeight: 1.25,
                  }}
                >
                  + 내역 추가
                </Button>
              </Stack>
            )}
          />

          <TableContainer
            component={Paper}
            variant="outlined"
            sx={{ borderColor: '#dbe3ec', boxShadow: 'none', overflowX: 'auto' }}
          >
            <Table size="small" sx={{ minWidth: 1000, tableLayout: 'fixed' }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                  <TableCell align="center" sx={{ width: 48, fontSize: '0.7rem', fontWeight: 900 }}>No.</TableCell>
                  <TableCell align="center" sx={{ width: 120, fontSize: '0.7rem', fontWeight: 900 }}>사용일</TableCell>
                  <TableCell align="center" sx={{ width: 138, fontSize: '0.7rem', fontWeight: 900 }}>항목</TableCell>
                  <TableCell sx={{ fontSize: '0.7rem', fontWeight: 900 }}>사용내용</TableCell>
                  <TableCell align="center" sx={{ width: 220, fontSize: '0.7rem', fontWeight: 900 }}>금액</TableCell>
                  <TableCell align="center" sx={{ width: 54, fontSize: '0.7rem', fontWeight: 900 }}>삭제</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 7, color: '#94a3b8', fontSize: '0.76rem' }}>
                      등록된 사용내역이 없습니다. 내역 추가 또는 통행료 PDF 업로드를 눌러주세요.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, index) => (
                    <TableRow
                      key={item.clientId}
                      hover
                      sx={{
                        '&:last-child td': { borderBottom: 0 },
                        '& td': { py: 0.55, px: 0.7 },
                        '& .MuiInputBase-root': { fontSize: '0.72rem' },
                      }}
                    >
                      <TableCell align="center" sx={{ fontSize: '0.72rem' }}>{index + 1}</TableCell>
                      <TableCell align="center">
                        <NumericDateField
                          label=""
                          value={item.expense_date}
                          displayMode="month-day"
                          onChange={(value) => updateItemField(item.clientId, 'expense_date', value)}
                          sx={{
                            width: '100%',
                            '& .MuiInputBase-root': { fontSize: '0.72rem' },
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          variant="standard"
                          fullWidth
                          value={item.category}
                          onChange={(event) => updateItemField(item.clientId, 'category', event.target.value)}
                          inputProps={{ 'aria-label': `${index + 1}번 항목` }}
                        >
                          {CATEGORY_OPTIONS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        {item.category === 'fuel' || item.category === 'toll' ? (
                          <Box sx={{ display: 'grid', gridTemplateColumns: item.category === 'toll' ? '1fr 1fr 72px 88px' : '1fr 1fr 72px', gap: 0.7 }}>
                            <TextField
                              size="small"
                              variant="standard"
                              value={item.origin}
                              placeholder="출발지"
                              title="출발지"
                              onChange={(event) => updateItemField(item.clientId, 'origin', event.target.value)}
                            />
                            <TextField
                              size="small"
                              variant="standard"
                              value={item.destination}
                              placeholder={item.category === 'toll' ? '도착영업소' : '도착지'}
                              title={item.category === 'toll' ? '도착영업소' : '도착지'}
                              onChange={(event) => updateItemField(item.clientId, 'destination', event.target.value)}
                            />
                            <TextField
                              size="small"
                              variant="standard"
                              value={getDistanceKm(item)}
                              placeholder="km"
                              title="이동거리(km)"
                              onChange={(event) => updateItemField(item.clientId, 'description', sanitizeDistanceInput(event.target.value))}
                              inputProps={{ inputMode: 'decimal', style: { textAlign: 'right' } }}
                              InputProps={{ endAdornment: <InputAdornment position="end">km</InputAdornment> }}
                            />
                            {item.category === 'toll' && (
                              <TextField
                                type="time"
                                size="small"
                                variant="standard"
                                value={item.destination_time || ''}
                                title="도착시간"
                                onChange={(event) => updateItemField(item.clientId, 'destination_time', event.target.value)}
                                inputProps={{ step: 60 }}
                              />
                            )}
                          </Box>
                        ) : (
                          <TextField
                            size="small"
                            variant="standard"
                            fullWidth
                            value={item.description}
                            placeholder="사용내용"
                            onChange={(event) => updateItemField(item.clientId, 'description', event.target.value)}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'grid', gridTemplateColumns: item.category === 'toll' ? '1fr 1fr' : '1fr', gap: 0.7 }}>
                          {item.category === 'toll' && (
                            <TextField
                              size="small"
                              variant="standard"
                              value={item.fuel_amount || ''}
                              placeholder="유류비"
                              title="유류비"
                              onChange={(event) => updateItemField(item.clientId, 'fuel_amount', event.target.value.replace(/[^0-9]/g, ''))}
                              inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                              InputProps={{ endAdornment: <InputAdornment position="end">원</InputAdornment> }}
                            />
                          )}
                          <TextField
                            size="small"
                            variant="standard"
                            value={item.amount}
                            placeholder={item.category === 'toll' ? '통행료' : '금액'}
                            title={item.category === 'toll' ? '통행료' : '금액'}
                            onChange={(event) => updateItemField(item.clientId, 'amount', event.target.value.replace(/[^0-9]/g, ''))}
                            inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                            InputProps={{ endAdornment: <InputAdornment position="end">원</InputAdornment> }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="삭제">
                          <IconButton size="small" color="error" onClick={() => handleDeleteItem(item.clientId)}>
                            <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {items.length > 0 && (
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell colSpan={4} align="right" sx={{ fontSize: '0.74rem', fontWeight: 900 }}>
                      사용내역 합계
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.78rem', fontWeight: 900, color: '#0f766e' }}>
                      {formatMoney(totalAmount)}원
                    </TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Box
          role="separator"
          aria-label="사용내역과 미리보기 폭 조절"
          aria-orientation="vertical"
          aria-valuemin={25}
          aria-valuemax={75}
          aria-valuenow={Math.round(splitPercent)}
          tabIndex={0}
          onPointerDown={handleSplitPointerDown}
          onKeyDown={handleSplitKeyDown}
          onDoubleClick={() => setSplitPercent(46)}
          sx={{
            display: { xs: 'none', lg: 'flex' },
            flex: '0 0 10px',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'col-resize',
            touchAction: 'none',
            outline: 'none',
            bgcolor: 'transparent',
            '&::after': {
              content: '""',
              width: 3,
              height: 54,
              borderRadius: 99,
              bgcolor: '#94a3b8',
              transition: 'background-color 0.15s, height 0.15s',
            },
            '&:hover::after, &:focus-visible::after': {
              bgcolor: '#0f766e',
              height: 82,
            },
          }}
        />

        <Paper
          variant="outlined"
          sx={{
            flex: { xs: '0 0 520px', lg: '1 1 0' },
            minWidth: 0,
            minHeight: { xs: 480, lg: 0 },
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
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              overflowX: previewTab === 0 ? 'hidden' : 'auto',
              overflowY: 'auto',
              bgcolor: '#e8edf3',
              p: 1.5,
            }}
          >
            <Box
              sx={{
                transformOrigin: 'top left',
                width: previewTab === 0 ? '100%' : 'max-content',
                minWidth: 0,
              }}
            >
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

      <ExpenseItemDialog
        open={itemDialogOpen}
        month={month}
        initialItem={editingItem}
        onClose={() => {
          setItemDialogOpen(false);
          setEditingItem(null);
        }}
        onSave={handleSaveItem}
      />

      <TollPdfImportDialog
        open={pdfImportOpen}
        fileName={pdfImportFileName}
        rows={pdfImportRows}
        warnings={pdfImportWarnings}
        currentMonth={month}
        canChangeMonth={items.length === 0}
        useReceiptMonth={useReceiptMonth}
        onUseReceiptMonthChange={setUseReceiptMonth}
        onRowsChange={setPdfImportRows}
        onClose={() => setPdfImportOpen(false)}
        onConfirm={handleConfirmPdfImport}
      />
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
      const loadedDocuments = data || [];
      if (loadedDocuments.length === 0) {
        setDocuments([]);
        return;
      }

      const resolutionIds = loadedDocuments.map((document) => document.id);
      const { data: loadedItems, error: itemError } = await supabase
        .from('expense_resolution_items')
        .select('resolution_id, category, description, amount')
        .in('resolution_id', resolutionIds);

      if (itemError) throw itemError;

      const totalsByResolution = new Map();
      (loadedItems || []).forEach((item, index) => {
        const previous = totalsByResolution.get(item.resolution_id) || 0;
        totalsByResolution.set(
          item.resolution_id,
          previous + getItemTotalAmount(normalizeItem(item, index)),
        );
      });

      setDocuments(loadedDocuments.map((document) => ({
        ...document,
        total_amount: totalsByResolution.has(document.id)
          ? totalsByResolution.get(document.id)
          : toNumber(document.total_amount),
      })));
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
          <SystemPageTitle
              title="지출결의서 작성"
              help="사용내역과 증빙자료를 입력하여 지출결의서를 작성하고 결재·출력 자료를 관리합니다."
            />
          
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

      <StatusToast message={message} onClose={() => setMessage(null)} />

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
  const [savedMessage, setSavedMessage] = useState(null);

  if (writing) {
    return (
      <>
        <ExpenseEditor
          userProfile={userProfile}
          editingDocument={editingDocument}
          onBack={() => {
            setWriting(false);
            setEditingDocument(null);
          }}
          onSaved={(_, nextMessage) => {
            setWriting(false);
            setEditingDocument(null);
            setListVersion((previous) => previous + 1);
            setSavedMessage({ ...nextMessage, id: Date.now() });
          }}
        />
        <StatusToast message={savedMessage} onClose={() => setSavedMessage(null)} />
      </>
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
      <StatusToast message={savedMessage} onClose={() => setSavedMessage(null)} />
    </Box>
  );
}
