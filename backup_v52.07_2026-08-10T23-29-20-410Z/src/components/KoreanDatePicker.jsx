import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  Popover,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import KeyboardDoubleArrowLeftRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowLeftRounded';
import KeyboardDoubleArrowRightRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowRightRounded';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEK_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

const pad2 = (value) => String(value).padStart(2, '0');

const toIsoDate = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

const parseIsoDate = (value) => {
  const matched = DATE_PATTERN.exec(String(value || '').slice(0, 10));
  if (!matched) return null;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

const getKoreaToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const values = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') values[part.type] = part.value;
  });

  return `${values.year}-${values.month}-${values.day}`;
};

const buildCalendarCells = (year, month) => {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const result = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  while (result.length % 7 !== 0) result.push(null);
  return result;
};

const formatDisplayValue = (value, displayMode) => {
  const parts = parseIsoDate(value);
  if (!parts) return '';

  if (displayMode === 'month-day') {
    return `${pad2(parts.month)}-${pad2(parts.day)}`;
  }

  return `${String(parts.year).slice(-2)}-${pad2(parts.month)}-${pad2(parts.day)}`;
};

export default function KoreanDatePicker({
  value,
  onChange,
  label,
  size = 'small',
  fullWidth = false,
  disabled = false,
  minDate = '',
  maxDate = '',
  displayMode = 'full',
  allowClear = false,
  variant = 'outlined',
  sx,
  inputSx,
  inputProps,
  InputLabelProps,
  inputRef,
  onFocus,
  onKeyDown,
  ariaLabel,
}) {
  const today = useMemo(() => getKoreaToday(), []);
  const selected = parseIsoDate(value);
  const initial = selected || parseIsoDate(today);
  const [anchorEl, setAnchorEl] = useState(null);
  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);
  const rootRef = useRef(null);

  useEffect(() => {
    const next = parseIsoDate(value);
    if (next) {
      setViewYear(next.year);
      setViewMonth(next.month);
    }
  }, [value]);

  const openPicker = (event) => {
    if (disabled) return;
    const next = parseIsoDate(value) || parseIsoDate(today);
    setViewYear(next.year);
    setViewMonth(next.month);
    setAnchorEl(rootRef.current || event.currentTarget);
  };

  const moveMonth = (amount) => {
    const moved = new Date(viewYear, viewMonth - 1 + amount, 1);
    setViewYear(moved.getFullYear());
    setViewMonth(moved.getMonth() + 1);
  };

  const cells = useMemo(
    () => buildCalendarCells(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const normalizedMin = parseIsoDate(minDate) ? String(minDate).slice(0, 10) : '';
  const normalizedMax = parseIsoDate(maxDate) ? String(maxDate).slice(0, 10) : '';
  const displayValue = formatDisplayValue(value, displayMode);
  const placeholder = displayMode === 'month-day' ? 'mm-dd' : 'yy-mm-dd';

  const emitChange = (nextValue) => {
    if (typeof onChange === 'function') onChange(nextValue);
  };

  const todaySelectable =
    (!normalizedMin || today >= normalizedMin) &&
    (!normalizedMax || today <= normalizedMax);

  return (
    <>
      <Box
        ref={rootRef}
        sx={{
          minWidth: 0,
          ...(fullWidth ? { width: '100%' } : {}),
          ...(sx || {}),
        }}
      >
        <TextField
          label={label}
          size={size}
          fullWidth
          disabled={disabled}
          variant={variant}
          value={displayValue}
          placeholder={placeholder}
          onClick={openPicker}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          inputRef={inputRef}
          InputLabelProps={{ shrink: true, ...(InputLabelProps || {}) }}
          inputProps={{
            readOnly: true,
            inputMode: 'none',
            'aria-label': ariaLabel || label || '날짜 선택',
            ...(inputProps || {}),
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                {allowClear && value && (
                  <IconButton
                    size="small"
                    tabIndex={-1}
                    aria-label="날짜 선택 해제"
                    disabled={disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      emitChange('');
                    }}
                  >
                    ×
                  </IconButton>
                )}
                <IconButton
                  size="small"
                  tabIndex={-1}
                  aria-label={`${label || '날짜'} 달력 열기`}
                  disabled={disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    openPicker(event);
                  }}
                >
                  <CalendarMonthRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{
            cursor: disabled ? 'default' : 'pointer',
            '& .MuiInputBase-input': {
              cursor: disabled ? 'default' : 'pointer',
              fontVariantNumeric: 'tabular-nums',
              ...(inputSx || {}),
            },
          }}
        />
      </Box>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.6,
              border: '1px solid #dbe3ee',
              borderRadius: 1.5,
              boxShadow: '0 12px 30px rgba(15, 23, 42, 0.16)',
            },
          },
        }}
      >
        <Box sx={{ width: 316, p: 1.2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.9 }}>
            <Stack direction="row" spacing={0.1}>
              <IconButton size="small" aria-label="이전 연도" onClick={() => setViewYear((year) => year - 1)}>
                <KeyboardDoubleArrowLeftRoundedIcon sx={{ fontSize: 19 }} />
              </IconButton>
              <IconButton size="small" aria-label="이전 달" onClick={() => moveMonth(-1)}>
                <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Stack>

            <Typography sx={{ color: '#1e293b', fontSize: '0.88rem', fontWeight: 900 }}>
              {viewYear}년 {viewMonth}월
            </Typography>

            <Stack direction="row" spacing={0.1}>
              <IconButton size="small" aria-label="다음 달" onClick={() => moveMonth(1)}>
                <ChevronRightRoundedIcon sx={{ fontSize: 20 }} />
              </IconButton>
              <IconButton size="small" aria-label="다음 연도" onClick={() => setViewYear((year) => year + 1)}>
                <KeyboardDoubleArrowRightRoundedIcon sx={{ fontSize: 19 }} />
              </IconButton>
            </Stack>
          </Stack>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.3 }}>
            {WEEK_NAMES.map((name, index) => (
              <Typography
                key={name}
                align="center"
                sx={{
                  py: 0.45,
                  color: index === 0 ? '#dc2626' : index === 6 ? '#2563eb' : '#64748b',
                  fontSize: '0.68rem',
                  fontWeight: 900,
                }}
              >
                {name}
              </Typography>
            ))}

            {cells.map((day, index) => {
              if (!day) return <Box key={`empty-${index}`} sx={{ height: 34 }} />;

              const isoDate = toIsoDate(viewYear, viewMonth, day);
              const isDisabled =
                (normalizedMin && isoDate < normalizedMin) ||
                (normalizedMax && isoDate > normalizedMax);
              const isSelected = String(value || '').slice(0, 10) === isoDate;
              const isToday = today === isoDate;
              const weekIndex = index % 7;

              return (
                <Button
                  key={isoDate}
                  type="button"
                  size="small"
                  variant={isSelected ? 'contained' : 'text'}
                  disabled={Boolean(isDisabled)}
                  onClick={() => {
                    emitChange(isoDate);
                    setAnchorEl(null);
                  }}
                  sx={{
                    minWidth: 0,
                    height: 34,
                    px: 0,
                    color: isSelected
                      ? undefined
                      : weekIndex === 0
                        ? '#dc2626'
                        : weekIndex === 6
                          ? '#2563eb'
                          : '#334155',
                    fontSize: '0.72rem',
                    fontWeight: isSelected || isToday ? 900 : 650,
                    border: isToday && !isSelected ? '1px solid #94a3b8' : '1px solid transparent',
                  }}
                >
                  {day}
                </Button>
              );
            })}
          </Box>

          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.8 }}>
            <Typography sx={{ color: '#94a3b8', fontSize: '0.62rem' }}>
              표시 형식 · {displayMode === 'month-day' ? 'mm-dd' : 'yy-mm-dd'}
            </Typography>
            <Button
              type="button"
              size="small"
              disabled={!todaySelectable}
              onClick={() => {
                emitChange(today);
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
