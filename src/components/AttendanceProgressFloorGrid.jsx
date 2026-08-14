import { useMemo } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { buildFloorVisualCells } from '../utils/buildingUnits.js';

const toUnitSet = (value) =>
  value instanceof Set
    ? value
    : new Set(Array.isArray(value) ? value.map(String) : []);

export default function AttendanceProgressFloorGrid({
  building,
  floor,
  config,
  selectedUnits,
  completedUnits,
  plannedUnits,
  appMode = false,
  readOnly = false,
  selectedLabelKey = 'selectedForCompletion',
  t,
  onToggle,
  onSelectAll,
  onClear,
}) {
  const cells = useMemo(
    () => buildFloorVisualCells(config || {}, Number(floor) || 0),
    [config, floor],
  );
  const selectedSet = toUnitSet(selectedUnits);
  const completedSet = toUnitSet(completedUnits);
  const plannedSet = toUnitSet(plannedUnits);
  const selectableCount = cells.filter((cell) => cell.type === 'valid').length;
  const selectableUnits = cells
    .filter((cell) => cell.type === 'valid')
    .map((cell) => String(cell.unitCode))
    .filter((unit) => !completedSet.has(unit));

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Typography sx={{ fontSize: appMode ? '1.45rem' : '0.92rem', fontWeight: 950 }}>
          {t('progressFloorTitle', { building, floor })}
        </Typography>
        <Typography sx={{ color: '#047857', fontSize: appMode ? '1.15rem' : '0.78rem', fontWeight: 900 }}>
          {t('selectedUnitCount', { count: selectedSet.size })}
        </Typography>
      </Stack>

      <Stack direction="row" spacing={appMode ? 2 : 1.2} sx={{ mt: 1.2, flexWrap: 'wrap', rowGap: 0.8 }}>
        <Stack direction="row" spacing={0.55} alignItems="center">
          <Box sx={{ width: 14, height: 14, borderRadius: 0.6, bgcolor: '#03c75a' }} />
          <Typography sx={{ fontSize: appMode ? '1rem' : '0.7rem', color: '#475569' }}>{t(selectedLabelKey)}</Typography>
        </Stack>
        {plannedSet.size > 0 && (
          <Stack direction="row" spacing={0.55} alignItems="center">
            <Box sx={{ width: 14, height: 14, borderRadius: 0.6, bgcolor: '#fef3c7', border: '2px solid #f59e0b' }} />
            <Typography sx={{ fontSize: appMode ? '1rem' : '0.7rem', color: '#475569' }}>{t('plannedWorkUnit')}</Typography>
          </Stack>
        )}
        <Stack direction="row" spacing={0.55} alignItems="center">
          <Box sx={{ width: 14, height: 14, borderRadius: 0.6, bgcolor: '#0ea5e9' }} />
          <Typography sx={{ fontSize: appMode ? '1rem' : '0.7rem', color: '#475569' }}>{t('alreadyCompleted')}</Typography>
        </Stack>
      </Stack>

      {!readOnly && selectableUnits.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mt: appMode ? 1.7 : 1.1 }}>
          <Button
            size={appMode ? 'large' : 'small'}
            variant="outlined"
            color="success"
            onClick={() => onSelectAll?.(selectableUnits)}
            sx={{ fontWeight: 900, fontSize: appMode ? '1.05rem' : undefined }}
          >
            {t('selectWholeFloor')}
          </Button>
          <Button
            size={appMode ? 'large' : 'small'}
            variant="text"
            color="inherit"
            disabled={selectedSet.size === 0}
            onClick={() => onClear?.(selectableUnits)}
            sx={{ fontWeight: 850, fontSize: appMode ? '1.05rem' : undefined }}
          >
            {t('clearFloorSelection')}
          </Button>
        </Stack>
      )}

      <Box
        sx={{
          mt: appMode ? 2 : 1.25,
          overflowX: 'auto',
          pb: 1,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'stretch',
            gap: appMode ? 1.1 : 0.7,
            width: 'max-content',
            minWidth: '100%',
          }}
        >
          <Box
            sx={{
              width: appMode ? 72 : 52,
              minHeight: appMode ? 88 : 62,
              flex: appMode ? '0 0 72px' : '0 0 52px',
              display: 'grid',
              placeItems: 'center',
              borderRadius: 2,
              bgcolor: '#0f172a',
              color: '#ffffff',
              fontSize: appMode ? '1.25rem' : '0.82rem',
              fontWeight: 950,
            }}
          >
            {floor}F
          </Box>

          {cells.map((cell) => {
            const cellWidth = (appMode ? 96 : 72) * cell.span + (appMode ? 8 : 5) * (cell.span - 1);
            const key = `${cell.type}-${cell.visualStart}-${cell.visualEnd}`;

            if (cell.type !== 'valid') {
              return (
                <Box
                  key={key}
                  aria-hidden="true"
                  sx={{
                    position: 'relative',
                    width: cellWidth,
                    minHeight: appMode ? 88 : 62,
                    flex: `0 0 ${cellWidth}px`,
                    borderRadius: 2,
                    border: '1px solid #cbd5e1',
                    bgcolor: cell.type === 'piloti' ? '#f1f5f9' : 'transparent',
                    overflow: 'hidden',
                    '&::before': cell.type === 'piloti' ? {
                      content: '""',
                      position: 'absolute',
                      inset: '50% -15%',
                      height: 1,
                      bgcolor: '#94a3b8',
                      transform: 'rotate(-34deg)',
                    } : undefined,
                  }}
                />
              );
            }

            const unit = String(cell.unitCode);
            const selected = selectedSet.has(unit);
            const completed = completedSet.has(unit);
            const planned = plannedSet.has(unit);
            const disabled = readOnly || completed;

            return (
              <Box
                key={key}
                component="button"
                type="button"
                disabled={disabled}
                onClick={() => !disabled && onToggle?.(unit)}
                sx={{
                  width: cellWidth,
                  minHeight: appMode ? 88 : 62,
                  flex: `0 0 ${cellWidth}px`,
                  px: 1,
                  borderRadius: 2,
                  border: '2px solid',
                  borderColor: selected ? '#02a94d' : completed ? '#0284c7' : planned ? '#f59e0b' : '#cbd5e1',
                  bgcolor: selected ? '#03c75a' : completed ? '#0ea5e9' : '#ffffff',
                  color: selected || completed ? '#ffffff' : '#334155',
                  fontFamily: 'inherit',
                  fontSize: appMode ? '1.35rem' : '0.88rem',
                  fontWeight: 950,
                  cursor: disabled ? 'default' : 'pointer',
                  opacity: '1 !important',
                  boxShadow: selected ? '0 7px 16px rgba(3,199,90,0.2)' : 'none',
                }}
              >
                {unit}
              </Box>
            );
          })}
        </Box>
      </Box>

      {selectableCount === 0 && (
        <Typography sx={{ mt: 1, color: '#b45309', fontSize: appMode ? '1.05rem' : '0.76rem' }}>
          {t('noSelectableUnits')}
        </Typography>
      )}
    </Box>
  );
}
