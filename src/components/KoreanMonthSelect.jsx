import { MenuItem, TextField } from '@mui/material';
import { useMemo } from 'react';

const MONTH_VALUE_PATTERN = /^(\d{4})-(\d{2})$/;

const parseYear = (value) => {
  const matched = MONTH_VALUE_PATTERN.exec(String(value || ''));
  return matched ? Number(matched[1]) : null;
};

const formatKoreanMonth = (value) => {
  const matched = MONTH_VALUE_PATTERN.exec(String(value || ''));

  if (!matched) return String(value || '');

  return `${matched[1]}년 ${Number(matched[2])}월`;
};

export default function KoreanMonthSelect({
  value,
  onChange,
  label,
  size = 'small',
  sx,
  disabled = false,
  ...textFieldProps
}) {
  const options = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const selectedYear = parseYear(value);
    const minimumYear = Math.min(currentYear - 15, selectedYear || currentYear);
    const maximumYear = Math.max(currentYear + 15, selectedYear || currentYear);
    const result = [];

    for (let year = maximumYear; year >= minimumYear; year -= 1) {
      for (let month = 12; month >= 1; month -= 1) {
        const monthValue = `${year}-${String(month).padStart(2, '0')}`;
        result.push({
          value: monthValue,
          label: formatKoreanMonth(monthValue),
        });
      }
    }

    return result;
  }, [value]);

  return (
    <TextField
      {...textFieldProps}
      select
      size={size}
      label={label}
      value={value || ''}
      onChange={onChange}
      disabled={disabled}
      sx={sx}
      SelectProps={{
        MenuProps: {
          PaperProps: {
            sx: { maxHeight: 360 },
          },
        },
      }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
