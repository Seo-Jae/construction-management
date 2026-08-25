import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  Popover,
  TextField,
  Typography,
} from '@mui/material';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';

const MONTH_VALUE_PATTERN = /^(\d{4})-(\d{2})$/;
const pad2 = (value) => String(value).padStart(2, '0');

const parseMonth = (value) => {
  const matched = MONTH_VALUE_PATTERN.exec(String(value || ''));
  if (!matched) return null;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  if (!year || month < 1 || month > 12) return null;
  return { year, month };
};

const formatKoreanMonth = (value) => {
  const parsed = parseMonth(value);
  return parsed ? `${parsed.year}년 ${parsed.month}월` : '';
};

export default function KoreanMonthSelect({
  value,
  onChange,
  label,
  size = 'small',
  sx,
  disabled = false,
  fullWidth = false,
  allowClear = false,
  ...textFieldProps
}) {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const selected = parseMonth(value);
  const [anchorEl, setAnchorEl] = useState(null);
  const [viewYear, setViewYear] = useState(selected?.year || currentYear);
  const rootRef = useRef(null);

  useEffect(() => {
    const next = parseMonth(value);
    if (next) setViewYear(next.year);
  }, [value]);

  const openPicker = (event) => {
    if (disabled) return;
    setViewYear(parseMonth(value)?.year || currentYear);
    setAnchorEl(rootRef.current || event.currentTarget);
  };

  const emitChange = (nextValue) => {
    if (typeof onChange === 'function') {
      onChange({ target: { value: nextValue } });
    }
  };

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
          {...textFieldProps}
          size={size}
          label={label}
          fullWidth
          value={formatKoreanMonth(value)}
          placeholder="연도와 월 선택"
          disabled={disabled}
          onClick={openPicker}
          InputLabelProps={{ shrink: true, ...(textFieldProps.InputLabelProps || {}) }}
          inputProps={{
            readOnly: true,
            inputMode: 'none',
            'aria-label': label || '월 선택',
            ...(textFieldProps.inputProps || {}),
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                {allowClear && value && (
                  <IconButton
                    size="small"
                    tabIndex={-1}
                    aria-label="월 선택 해제"
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
                  aria-label={`${label || '월'} 달력 열기`}
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
        <Box sx={{ width: 292, p: 1.2 }}>
          <Box
            sx={{
              mb: 1,
              display: 'grid',
              gridTemplateColumns: '32px minmax(0, 1fr) 32px',
              alignItems: 'center',
            }}
          >
            <IconButton size="small" aria-label="이전 연도" onClick={() => setViewYear((year) => year - 1)}>
              <ChevronLeftRoundedIcon />
            </IconButton>
            <Typography align="center" sx={{ color: '#1e293b', fontSize: '0.88rem', fontWeight: 900 }}>
              {viewYear}년
            </Typography>
            <IconButton size="small" aria-label="다음 연도" onClick={() => setViewYear((year) => year + 1)}>
              <ChevronRightRoundedIcon />
            </IconButton>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.65 }}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
              const isSelected = selected?.year === viewYear && selected?.month === month;
              return (
                <Button
                  key={month}
                  type="button"
                  size="small"
                  variant={isSelected ? 'contained' : 'outlined'}
                  onClick={() => {
                    emitChange(`${viewYear}-${pad2(month)}`);
                    setAnchorEl(null);
                  }}
                  sx={{
                    minWidth: 0,
                    py: 0.7,
                    fontSize: '0.74rem',
                    fontWeight: 800,
                  }}
                >
                  {month}월
                </Button>
              );
            })}
          </Box>
        </Box>
      </Popover>
    </>
  );
}
