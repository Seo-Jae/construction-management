import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import {
  buildFloorVisualCells,
  countUniqueUnits,
  getCellKey,
} from './utils/buildingUnits.js';

const CELL_WIDTH = 34;
const CELL_HEIGHT = 18;
const CELL_GAP = 2;
const ROW_GAP = 1;

const formatCompletionMonthDay = (dateValue) => {
  const value = String(dateValue || '').trim();

  if (!value) {
    return '';
  }

  /*
    completion_date는 보통 2026-07-15 형식으로 저장됩니다.
    날짜 객체로 변환하지 않고 문자열에서 월/일만 추출해
    브라우저 시간대에 따른 날짜 변경을 방지합니다.
  */
  const matched = value.match(
    /(?:\d{2,4})[.\/-](\d{1,2})[.\/-](\d{1,2})/,
  );

  if (!matched) {
    return '';
  }

  const month = String(matched[1]).padStart(2, '0');
  const day = String(matched[2]).padStart(2, '0');

  return `${month}.${day}`;
};

const getStatusStyle = (status, selected) => {
  if (selected) {
    return {
      bgcolor: '#fef3c7',
      borderColor: '#f59e0b',
      color: '#92400e',
      boxShadow: 'inset 0 0 0 1px #f59e0b',
    };
  }

  if (status === '작업완료') {
    return {
      bgcolor: '#0ea5e9',
      borderColor: '#0284c7',
      color: '#ffffff',
    };
  }

  if (status === '작업중') {
    return {
      bgcolor: '#10b981',
      borderColor: '#059669',
      color: '#ffffff',
    };
  }

  return {
    bgcolor: '#ffffff',
    borderColor: '#cbd5e1',
    color: '#334155',
  };
};

function PilotiCell({ span = 1 }) {
  const width = CELL_WIDTH * span + CELL_GAP * (span - 1);

  return (
    <Box
      sx={{
        position: 'relative',
        width,
        height: CELL_HEIGHT,
        flex: `0 0 ${width}px`,
        border: '1px solid #cbd5e1',
        bgcolor: '#f8fafc',
        boxSizing: 'border-box',
        overflow: 'hidden',
        userSelect: 'none',
        '&::before, &::after': {
          content: '""',
          position: 'absolute',
          left: '50%',
          top: '-12px',
          width: '1px',
          height: 48,
          bgcolor: '#94a3b8',
          transformOrigin: 'center',
        },
        '&::before': {
          transform: 'translateX(-50%) rotate(62deg)',
        },
        '&::after': {
          transform: 'translateX(-50%) rotate(-62deg)',
        },
      }}
    />
  );
}

export default function BuildingGrid({
  buildingName,
  config,
  selectedCells = new Set(),
  onCellClick,
  unitData = {},
  onFloorClick,
  protectCompleted = false,
  targetLines = [],
  targetEditMode = false,
  activeTargetId = '',
}) {
  const floors = Number(config?.floors) || 0;
  const totalUnits = useMemo(() => countUniqueUnits(config), [config]);
  const floorNumbers = useMemo(
    () => Array.from({ length: floors }, (_, index) => floors - index),
    [floors],
  );

  return (
    <Box
      sx={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${ROW_GAP}px`,
          bgcolor: 'transparent',
        }}
      >
          {floorNumbers.map((floor) => {
            const floorCells = buildFloorVisualCells(config, floor);

            const floorTargetLines =
              (targetLines || [])
                .filter(
                  (line) =>
                    Number(
                      line.floor,
                    ) === floor,
                );

            const activeFloorLine =
              floorTargetLines.find(
                (line) =>
                  line.id ===
                  activeTargetId,
              );

            return (
              <Box
                key={floor}
                sx={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: `${CELL_GAP}px`,
                  pt:
                    floorTargetLines.length >
                    0
                      ? `${Math.max(
                          7,
                          floorTargetLines.length *
                            7,
                        )}px`
                      : 0,
                }}
              >
                {floorTargetLines.map(
                  (line, index) => (
                    <Box
                      key={
                        line.id
                      }
                      sx={{
                        position:
                          'absolute',
                        top:
                          index *
                          7,
                        left: 23,
                        right: 0,
                        height: 0,
                        borderTop:
                          `2px ${line.active ? 'solid' : 'dashed'} ${line.color}`,
                        pointerEvents:
                          'none',
                        zIndex: 3,
                      }}
                    >
                      <Typography
                        component="span"
                        sx={{
                          position:
                            'absolute',
                          right: 0,
                          top: -9,
                          px: 0.35,
                          bgcolor:
                            line.color,
                          color:
                            '#ffffff',
                          borderRadius:
                            '3px 3px 0 0',
                          fontSize:
                            '0.48rem',
                          lineHeight:
                            '9px',
                          fontWeight:
                            900,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {line.label}
                      </Typography>
                    </Box>
                  ),
                )}

                <Typography
                  component="button"
                  type="button"
                  title={
                    targetEditMode
                      ? activeFloorLine
                        ? '같은 층을 다시 누르면 목표 라인이 해제됩니다.'
                        : '이 층까지 목표 범위로 설정합니다.'
                      : '층 전체 세대 선택'
                  }
                  onClick={() =>
                    onFloorClick?.(
                      buildingName,
                      floor,
                    )
                  }
                  sx={{
                    width: 21,
                    flex: '0 0 21px',
                    p: 0,
                    border:
                      targetEditMode
                        ? '1px solid #fbbf24'
                        : 0,
                    borderRadius:
                      targetEditMode
                        ? 0.5
                        : 0,
                    bgcolor:
                      activeFloorLine
                        ? activeFloorLine.color
                        : targetEditMode
                          ? '#fffbeb'
                          : 'transparent',
                    textAlign: 'right',
                    pr: 0.25,
                    color:
                      activeFloorLine
                        ? '#ffffff'
                        : targetEditMode
                          ? '#b45309'
                          : '#64748b',
                    fontSize: '0.55rem',
                    lineHeight: 1,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight:
                      targetEditMode
                        ? 900
                        : 400,
                    '&:hover': {
                      color:
                        activeFloorLine
                          ? '#ffffff'
                          : targetEditMode
                            ? '#92400e'
                            : '#0284c7',
                      bgcolor:
                        activeFloorLine
                          ? activeFloorLine.color
                          : targetEditMode
                            ? '#fef3c7'
                            : 'transparent',
                      fontWeight: 800,
                    },
                  }}
                >
                  {floor}F
                </Typography>

                {floorCells.map((cell) => {
                  const width =
                    CELL_WIDTH * cell.span + CELL_GAP * (cell.span - 1);
                  const visualKey = `${floor}-${cell.visualStart}-${cell.visualEnd}`;

                  if (cell.type === 'piloti') {
                    return (
                      <PilotiCell
                        key={visualKey}
                        span={cell.span}
                      />
                    );
                  }

                  if (cell.type === 'empty') {
                    return (
                      <Box
                        key={visualKey}
                        aria-hidden="true"
                        sx={{
                          width,
                          height: CELL_HEIGHT,
                          flex: `0 0 ${width}px`,
                          border: 'none',
                          bgcolor: 'transparent',
                          boxSizing: 'border-box',
                        }}
                      />
                    );
                  }

                  const cellKey = getCellKey(buildingName, cell.unitCode);
                  const progress =
                    unitData?.[
                      cellKey
                    ] || {};

                  const isCompleted =
                    progress?.status ===
                    '작업완료';

                  const isProtectedCompleted =
                    protectCompleted &&
                    isCompleted;

                  const selected =
                    !isProtectedCompleted &&
                    (
                      selectedCells?.has?.(
                        cellKey,
                      ) || false
                    );

                  const statusStyle = getStatusStyle(
                    progress?.status,
                    selected,
                  );
                  const completionDate =
                    progress?.status === '작업완료'
                      ? formatCompletionMonthDay(progress?.date)
                      : '';
                  const displayText =
                    completionDate || cell.unitCode;

                  return (
                    <Box
                      key={visualKey}
                      component="button"
                      type="button"
                      disabled={
                        targetEditMode ||
                        isProtectedCompleted
                      }
                      title={
                        targetEditMode
                          ? '목표 라인 설정 중에는 층 번호를 클릭하세요.'
                          : isProtectedCompleted
                            ? '완료 처리에서는 기존 완료 세대의 완료일을 유지합니다.'
                            : isCompleted
                              ? '작업전 또는 작업중으로 변경할 수 있습니다.'
                              : ''
                      }
                      onClick={() => {
                        if (
                          targetEditMode ||
                          isProtectedCompleted
                        ) {
                          return;
                        }

                        onCellClick?.(
                          cellKey,
                        );
                      }}
                      sx={{
                        width,
                        height: CELL_HEIGHT,
                        flex: `0 0 ${width}px`,
                        p: 0,
                        border: '1px solid',
                        boxSizing: 'border-box',
                        cursor:
                          targetEditMode ||
                          isProtectedCompleted
                            ? 'not-allowed'
                            : 'pointer',
                        fontFamily: 'inherit',
                        fontSize: completionDate
                          ? '0.53rem'
                          : '0.57rem',
                        letterSpacing: completionDate
                          ? '-0.02em'
                          : 'normal',
                        lineHeight: 1,
                        fontWeight: 800,
                        userSelect: 'none',
                        transition: 'filter 120ms ease, transform 120ms ease',
                        ...statusStyle,
                        '&:disabled': {
                          opacity:
                            targetEditMode
                              ? 0.72
                              : 1,
                          WebkitTextFillColor:
                            'currentColor',
                        },
                        '&:hover': {
                          filter:
                            isProtectedCompleted
                              ? 'none'
                              : 'brightness(0.96)',
                        },
                        '&:active': {
                          transform:
                            isProtectedCompleted
                              ? 'none'
                              : 'scale(0.98)',
                        },
                      }}
                    >
                      {displayText}
                    </Box>
                  );
                })}
              </Box>
            );
          })}
      </Box>

      <Typography
        sx={{
          mt: 0.45,
          fontSize: '0.72rem',
          fontWeight: 800,
          color: '#0f172a',
        }}
      >
        {buildingName}
      </Typography>
      <Typography
        sx={{
          mt: 0.05,
          fontSize: '0.6rem',
          fontWeight: 700,
          color: '#64748b',
        }}
      >
        총 {totalUnits.toLocaleString()}세대
      </Typography>
    </Box>
  );
}
