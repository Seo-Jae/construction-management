import { useMemo } from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import {
  buildFloorVisualCells,
  countUniqueUnits,
} from '../utils/buildingUnits.js';

const CELL_WIDTH = 48;
const CELL_HEIGHT = 25;
const CELL_GAP = 3;
const ROW_GAP = 2;

const toStringSet = (value) =>
  value instanceof Set
    ? value
    : new Set(Array.isArray(value) ? value.map(String) : []);

const normalizeBuildingLabel = (value) => {
  const building = String(value || '').trim();
  if (!building) return '-';
  return building.endsWith('동') ? building : `${building}동`;
};

function EmptyUnitCell({ type, span }) {
  const width = CELL_WIDTH * span + CELL_GAP * (span - 1);
  if (type === 'empty') {
    return <Box aria-hidden="true" sx={{ width, height: CELL_HEIGHT, flex: `0 0 ${width}px` }} />;
  }

  return (
    <Box
      aria-hidden="true"
      sx={{
        position: 'relative',
        width,
        height: CELL_HEIGHT,
        flex: `0 0 ${width}px`,
        border: '1px solid #cbd5e1',
        bgcolor: '#f8fafc',
        boxSizing: 'border-box',
        overflow: 'hidden',
        '&::before, &::after': {
          content: '""',
          position: 'absolute',
          left: '50%',
          top: '-18px',
          width: '1px',
          height: 62,
          bgcolor: '#94a3b8',
          transformOrigin: 'center',
        },
        '&::before': { transform: 'translateX(-50%) rotate(62deg)' },
        '&::after': { transform: 'translateX(-50%) rotate(-62deg)' },
      }}
    />
  );
}

export default function AttendanceProgressBuildingOverview({
  buildingName,
  config,
  submittedUnits,
  completedUnits,
  contributorCounts,
  contributorNames,
  submittedFloors,
}) {
  const floors = Math.max(0, Number(config?.floors || 0));
  const floorNumbers = useMemo(
    () => Array.from({ length: floors }, (_unused, index) => floors - index),
    [floors],
  );
  const submittedSet = toStringSet(submittedUnits);
  const completedSet = toStringSet(completedUnits);
  const submittedFloorSet = submittedFloors instanceof Set
    ? submittedFloors
    : new Set(Array.isArray(submittedFloors) ? submittedFloors.map(Number) : []);
  const totalUnits = useMemo(() => countUniqueUnits(config || {}), [config]);
  const overlapCount = Array.from(submittedSet).filter((unit) => completedSet.has(unit)).length;

  return (
    <Box
      sx={{
        minWidth: 0,
        p: 2,
        border: '1px solid #cbd5e1',
        borderRadius: 2.5,
        bgcolor: '#f8fafc',
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: '1rem', fontWeight: 950 }}>
            {normalizeBuildingLabel(buildingName)} 전체 골구도
          </Typography>
          <Typography sx={{ mt: 0.25, color: '#64748b', fontSize: '0.72rem' }}>
            총 {totalUnits.toLocaleString()}세대 · 금일 고유 제출 {submittedSet.size.toLocaleString()}세대
          </Typography>
        </Box>
        {overlapCount > 0 && (
          <Chip size="small" color="error" variant="outlined" label={`기존완료 중복 ${overlapCount}세대 자동 제외`} />
        )}
      </Stack>

      <Stack direction="row" spacing={1.5} sx={{ mb: 1.5, flexWrap: 'wrap', rowGap: 0.8 }}>
        <Stack direction="row" spacing={0.55} alignItems="center">
          <Box sx={{ width: 14, height: 14, bgcolor: '#03c75a', border: '1px solid #02a94d' }} />
          <Typography sx={{ color: '#475569', fontSize: '0.7rem' }}>금일 퇴근 제출</Typography>
        </Stack>
        <Stack direction="row" spacing={0.55} alignItems="center">
          <Box sx={{ width: 14, height: 14, bgcolor: '#cbd5e1', border: '1px solid #94a3b8' }} />
          <Typography sx={{ color: '#475569', fontSize: '0.7rem' }}>동일 공정 기존 완료</Typography>
        </Stack>
        <Stack direction="row" spacing={0.55} alignItems="center">
          <Box sx={{ width: 14, height: 14, bgcolor: '#03c75a', border: '2px solid #166534', position: 'relative' }} />
          <Typography sx={{ color: '#475569', fontSize: '0.7rem' }}>공동작업 제출</Typography>
        </Stack>
      </Stack>

      <Box sx={{ overflowX: 'auto', pb: 1, WebkitOverflowScrolling: 'touch' }}>
        <Box sx={{ width: 'max-content', minWidth: '100%', display: 'flex', justifyContent: 'center' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${ROW_GAP}px` }}>
            {floorNumbers.map((floor) => {
              const cells = buildFloorVisualCells(config || {}, floor);
              const activeFloor = submittedFloorSet.has(floor);

              return (
                <Box
                  key={floor}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${CELL_GAP}px`,
                    py: activeFloor ? 0.18 : 0,
                    px: activeFloor ? 0.35 : 0,
                    ml: activeFloor ? -0.35 : 0,
                    mr: activeFloor ? -0.35 : 0,
                    bgcolor: activeFloor ? '#ecfdf5' : 'transparent',
                    borderRadius: activeFloor ? 0.8 : 0,
                  }}
                >
                  <Typography
                    sx={{
                      width: 30,
                      flex: '0 0 30px',
                      pr: 0.35,
                      textAlign: 'right',
                      color: activeFloor ? '#047857' : '#64748b',
                      fontSize: '0.6rem',
                      fontWeight: activeFloor ? 900 : 500,
                    }}
                  >
                    {floor}F
                  </Typography>

                  {cells.map((cell) => {
                    const key = `${floor}-${cell.visualStart}-${cell.visualEnd}`;
                    if (cell.type !== 'valid') {
                      return <EmptyUnitCell key={key} type={cell.type} span={cell.span} />;
                    }

                    const unit = String(cell.unitCode);
                    const submitted = submittedSet.has(unit);
                    const completed = completedSet.has(unit);
                    const contributorCount = Number(contributorCounts?.[unit] || 0);
                    const names = Array.isArray(contributorNames?.[unit])
                      ? contributorNames[unit]
                      : [];
                    const width = CELL_WIDTH * cell.span + CELL_GAP * (cell.span - 1);
                    const shared = submitted && contributorCount > 1;
                    const statusStyle = completed
                      ? {
                          bgcolor: '#cbd5e1',
                          borderColor: submitted ? '#dc2626' : '#94a3b8',
                          color: '#334155',
                        }
                      : submitted
                        ? {
                            bgcolor: '#03c75a',
                            borderColor: shared ? '#166534' : '#02a94d',
                            color: '#ffffff',
                          }
                        : {
                            bgcolor: '#ffffff',
                            borderColor: '#cbd5e1',
                            color: '#334155',
                          };

                    return (
                      <Box
                        key={key}
                        title={completed && submitted
                          ? `${unit}호 · 기존 완료로 자동 제외`
                          : names.length > 0
                            ? `${unit}호 · 제출자 ${names.join(', ')}`
                            : `${unit}호`}
                        sx={{
                          position: 'relative',
                          width,
                          height: CELL_HEIGHT,
                          flex: `0 0 ${width}px`,
                          display: 'grid',
                          placeItems: 'center',
                          border: shared ? '2px solid' : '1px solid',
                          boxSizing: 'border-box',
                          fontSize: '0.64rem',
                          lineHeight: 1,
                          fontWeight: 900,
                          userSelect: 'none',
                          ...statusStyle,
                        }}
                      >
                        {unit}
                        {shared && (
                          <Box
                            component="span"
                            sx={{
                              position: 'absolute',
                              top: -6,
                              right: -6,
                              minWidth: 16,
                              height: 16,
                              px: 0.3,
                              display: 'grid',
                              placeItems: 'center',
                              borderRadius: 999,
                              bgcolor: '#166534',
                              color: '#ffffff',
                              border: '2px solid #ffffff',
                              fontSize: '0.52rem',
                              fontWeight: 950,
                              zIndex: 2,
                            }}
                          >
                            {contributorCount}
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>

      <Typography sx={{ mt: 0.7, textAlign: 'center', color: '#0f172a', fontSize: '0.82rem', fontWeight: 950 }}>
        {normalizeBuildingLabel(buildingName)}
      </Typography>
    </Box>
  );
}
