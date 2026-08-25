// v52.48.5.44.6.3 타입윤곽선 복원 + 골구도 셀 1.2배
// v52.48.5.44.6.2 타입행 높이통일 + 박스제거 + 타입색상
// v52.48.5.44.6.1 예외타입 동일행 압축 + hover 설명 제거
// v52.48.5.44.6 층별 예외타입 하단 다단표시
// v52.48.5.44.3 현장관리 호별타입 공정진척 연동
import React, { useMemo } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import {
  buildFloorVisualCells,
  countUniqueUnits,
  getCanonicalUnitNumber,
  getCellKey,
  getUnitType,
} from './utils/buildingUnits.js';

const CELL_WIDTH = 41;
const CELL_HEIGHT = 22;
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
          top: '-15px',
          width: '1px',
          height: 58,
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
  unitTypeData = {},
  typeColorMap = {},
  typeFooterRowSlots = 1,
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

  const unitTypeSummary = useMemo(() => {
    const buildingPrefix = `${String(buildingName || '').trim()}-`;
    const configuredColumnCount = Math.max(
      0,
      Number(config?.unitsPerFloor) || 0,
    );
    const typeCountsByLine = new Map();
    let detectedMaxLine = 0;

    const addTypeCount = (lineNumber, rawUnitType) => {
      const normalizedLineNumber = Number(lineNumber);
      const unitType = String(rawUnitType || '').trim();

      if (!normalizedLineNumber || !unitType) {
        return;
      }

      detectedMaxLine = Math.max(
        detectedMaxLine,
        normalizedLineNumber,
      );

      if (!typeCountsByLine.has(normalizedLineNumber)) {
        typeCountsByLine.set(normalizedLineNumber, new Map());
      }

      const typeCounts = typeCountsByLine.get(normalizedLineNumber);
      typeCounts.set(
        unitType,
        (typeCounts.get(unitType) || 0) + 1,
      );
    };

    const hasBaseConfigTypes = Object.values(
      config?.unitTypes || {},
    ).some((value) =>
      Boolean(String(value || '').trim()),
    );

    const hasFloorConfigTypes = Object.values(
      config?.floorUnitTypes || {},
    ).some(
      (floorMap) =>
        floorMap &&
        typeof floorMap === 'object' &&
        Object.values(floorMap).some((value) =>
          Boolean(String(value || '').trim()),
        ),
    );

    const hasConfigUnitTypes =
      hasBaseConfigTypes ||
      hasFloorConfigTypes;

    /*
      기본 타입행은 기존 방식과 동일하게 각 호 라인의 대표 타입을 구합니다.
      다만 층별 예외타입은 별도 행으로 표시하므로, base unitTypes가 있으면
      하단 기본행은 unitTypes를 우선 사용합니다.
    */
    if (hasConfigUnitTypes) {
      for (let floor = 1; floor <= floors; floor += 1) {
        buildFloorVisualCells(config, floor).forEach((cell) => {
          if (cell.type !== 'valid') {
            return;
          }

          const canonicalUnitNumber =
            getCanonicalUnitNumber(
              config,
              floor,
              cell.visualStart,
            );

          const baseTypes =
            config?.unitTypes || {};

          const configuredBaseType =
            baseTypes?.[canonicalUnitNumber] ??
            baseTypes?.[String(canonicalUnitNumber)] ??
            baseTypes?.[cell.visualStart] ??
            baseTypes?.[String(cell.visualStart)];

          const unitType =
            String(configuredBaseType || '').trim() ||
            getUnitType(
              config,
              floor,
              cell.visualStart,
            );

          if (!unitType) {
            return;
          }

          for (
            let lineNumber = cell.visualStart;
            lineNumber <= cell.visualEnd;
            lineNumber += 1
          ) {
            addTypeCount(lineNumber, unitType);
          }
        });
      }
    } else {
      Object.entries(unitTypeData || {}).forEach(
        ([cellKey, rawUnitType]) => {
          const normalizedCellKey =
            String(cellKey || '').trim();

          if (
            !buildingPrefix ||
            !normalizedCellKey.startsWith(
              buildingPrefix,
            )
          ) {
            return;
          }

          const unitCode = normalizedCellKey
            .slice(buildingPrefix.length)
            .trim();
          const lineMatched =
            unitCode.match(/(\d{1,2})$/);
          const lineNumber =
            Number(lineMatched?.[1] || 0);

          addTypeCount(
            lineNumber,
            rawUnitType,
          );
        },
      );
    }

    const columnCount =
      configuredColumnCount ||
      detectedMaxLine;

    const baseLabels = Array.from(
      { length: columnCount },
      (_, index) => {
        const lineNumber = index + 1;
        const typeCounts =
          typeCountsByLine.get(
            lineNumber,
          );

        if (
          !typeCounts ||
          typeCounts.size === 0
        ) {
          return '';
        }

        return [...typeCounts.entries()].sort(
          (left, right) =>
            right[1] - left[1] ||
            left[0].localeCompare(
              right[0],
              'ko',
            ),
        )[0][0];
      },
    );

    /*
      층별 예외타입은 기본 타입을 덮어쓰지 않고 별도 행으로 표시합니다.

      예:
      기본  : 84A | 68A | 68B | 84B
      29층  :     | 120T(2~3호)    |

      같은 층에서 인접한 호가 같은 예외타입이면 하나의 셀로 병합해
      기존 현장의 특수타입 표기방식과 동일하게 보이도록 합니다.
    */
    const exceptionRows = [];
    const seenExceptionSignatures =
      new Set();

    Object.entries(
      config?.floorUnitTypes || {},
    )
      .map(([floorKey, floorMap]) => [
        Number(floorKey),
        floorMap,
      ])
      .filter(
        ([floor, floorMap]) =>
          Number.isInteger(floor) &&
          floor > 0 &&
          floorMap &&
          typeof floorMap === 'object',
      )
      .sort(
        ([firstFloor], [secondFloor]) =>
          secondFloor - firstFloor,
      )
      .forEach(([floor, floorMap]) => {
        const rawSegments = [];

        buildFloorVisualCells(
          config,
          floor,
        ).forEach((cell) => {
          if (cell.type !== 'valid') {
            return;
          }

          const canonicalUnitNumber =
            getCanonicalUnitNumber(
              config,
              floor,
              cell.visualStart,
            );

          const overrideType =
            floorMap?.[canonicalUnitNumber] ??
            floorMap?.[
              String(canonicalUnitNumber)
            ] ??
            floorMap?.[cell.visualStart] ??
            floorMap?.[
              String(cell.visualStart)
            ];

          const normalizedOverrideType =
            String(
              overrideType || '',
            ).trim();

          if (!normalizedOverrideType) {
            return;
          }

          const baseType =
            String(
              baseLabels[
                cell.visualStart - 1
              ] || '',
            ).trim();

          if (
            normalizedOverrideType ===
            baseType
          ) {
            return;
          }

          rawSegments.push({
            start: cell.visualStart,
            end: cell.visualEnd,
            typeName:
              normalizedOverrideType,
          });
        });

        if (rawSegments.length === 0) {
          return;
        }

        rawSegments.sort(
          (first, second) =>
            first.start - second.start,
        );

        const mergedSegments = [];

        rawSegments.forEach((segment) => {
          const previous =
            mergedSegments[
              mergedSegments.length - 1
            ];

          if (
            previous &&
            previous.typeName ===
              segment.typeName &&
            previous.end + 1 ===
              segment.start
          ) {
            previous.end =
              segment.end;
            return;
          }

          mergedSegments.push({
            ...segment,
          });
        });

        const signature =
          mergedSegments
            .map(
              (segment) =>
                `${segment.start}-${segment.end}:${segment.typeName}`,
            )
            .join('|');

        if (
          !signature ||
          seenExceptionSignatures.has(
            signature,
          )
        ) {
          return;
        }

        seenExceptionSignatures.add(
          signature,
        );

        exceptionRows.push({
          floor,
          segments:
            mergedSegments,
        });
      });

    /*
      서로 다른 층의 예외타입이라도 표시 호 범위가 겹치지 않으면
      같은 한 줄에 배치합니다.

      예:
      150PC = 1~2호
      150PA = 3~4호
      => [ 150PC ][ 150PA ] 한 줄

      반대로 표시 범위가 겹치면 별도 줄을 사용합니다.
      이렇게 하면 기존 현장 타입표처럼 불필요한 세로 공간을 만들지 않습니다.
    */
    const packedExceptionRows = [];

    exceptionRows.forEach((sourceRow) => {
      const segments =
        (sourceRow.segments || [])
          .map((segment) => ({
            ...segment,
            floor: sourceRow.floor,
          }))
          .sort(
            (first, second) =>
              first.start - second.start ||
              first.end - second.end,
          );

      let targetRow = null;

      for (
        let rowIndex = 0;
        rowIndex < packedExceptionRows.length;
        rowIndex += 1
      ) {
        const candidate =
          packedExceptionRows[rowIndex];

        const overlaps = segments.some(
          (segment) =>
            candidate.segments.some(
              (existing) =>
                !(
                  segment.end < existing.start ||
                  segment.start > existing.end
                ),
            ),
        );

        if (!overlaps) {
          targetRow = candidate;
          break;
        }
      }

      if (!targetRow) {
        targetRow = {
          floors: [],
          segments: [],
        };
        packedExceptionRows.push(
          targetRow,
        );
      }

      targetRow.floors.push(
        sourceRow.floor,
      );
      targetRow.segments.push(
        ...segments,
      );
      targetRow.segments.sort(
        (first, second) =>
          first.start - second.start ||
          first.end - second.end,
      );
    });

    return {
      columnCount,
      baseLabels,
      exceptionRows:
        packedExceptionRows,
      hasLabels:
        baseLabels.some(Boolean) ||
        packedExceptionRows.length > 0,
    };
  }, [
    buildingName,
    config,
    floors,
    unitTypeData,
  ]);

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
                  const completionWorkerNames = Array.from(
                    new Set(
                      (
                        Array.isArray(progress?.workerNames)
                          ? progress.workerNames
                          : Array.isArray(progress?.worker_names)
                            ? progress.worker_names
                            : []
                      )
                        .map((workerName) =>
                          String(workerName || '').trim(),
                        )
                        .filter(Boolean),
                    ),
                  );
                  const displayText =
                    completionDate || cell.unitCode;

                  return (
                    <Tooltip
                      key={visualKey}
                      arrow
                      placement="top"
                      enterTouchDelay={0}
                      leaveTouchDelay={4000}
                      disableInteractive
                      title={
                        isCompleted && completionWorkerNames.length > 0
                          ? (
                            <Box sx={{ py: 0.25 }}>
                              <Typography
                                sx={{
                                  color: 'inherit',
                                  fontSize: '0.72rem',
                                  fontWeight: 900,
                                  lineHeight: 1.35,
                                }}
                              >
                                {buildingName} {cell.unitCode}호
                              </Typography>
                              <Typography
                                sx={{
                                  mt: 0.25,
                                  color: 'inherit',
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  lineHeight: 1.4,
                                }}
                              >
                                작업자: {completionWorkerNames.join(', ')}
                              </Typography>
                            </Box>
                          )
                          : ''
                      }
                    >
                      <Box
                        component="span"
                        sx={{
                          width,
                          height: CELL_HEIGHT,
                          flex: `0 0 ${width}px`,
                          display: 'inline-flex',
                        }}
                      >
                        <Box
                          component="button"
                          type="button"
                          disabled={
                            targetEditMode ||
                            isProtectedCompleted
                          }
                          aria-label={
                            isCompleted && completionWorkerNames.length > 0
                              ? `${buildingName} ${cell.unitCode}호, 작업자 ${completionWorkerNames.join(', ')}`
                              : `${buildingName} ${cell.unitCode}호`
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
                            width: '100%',
                            height: '100%',
                            flex: '0 0 100%',
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
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            );
          })}
      </Box>

      <Box
        sx={{
          mt: 0.35,
          display: 'grid',
          gap: `${ROW_GAP}px`,
        }}
      >
        {/*
          현장 전체의 최대 타입행 수만큼 동일한 높이를 확보합니다.
          예외타입이 없는 동은 위쪽에 빈 행을 두므로
          모든 동의 1층 위치가 동일하게 정렬됩니다.
        */}
        {Array.from({
          length: Math.max(
            0,
            Number(typeFooterRowSlots || 1) -
              (
                unitTypeSummary.exceptionRows.length +
                1
              ),
          ),
        }).map((_, blankIndex) => (
          <Box
            key={`${buildingName}-unit-type-blank-${blankIndex}`}
            aria-hidden="true"
            sx={{
              height: 17,
            }}
          />
        ))}

        {/* 층별 특수/예외 타입 */}
        {unitTypeSummary.exceptionRows.map(
          (row, rowIndex) => (
            <Box
              key={`${buildingName}-unit-type-exception-row-${rowIndex}`}
              sx={{
                display: 'grid',
                gridTemplateColumns:
                  `21px repeat(${unitTypeSummary.columnCount}, ${CELL_WIDTH}px)`,
                columnGap:
                  `${CELL_GAP}px`,
                alignItems:
                  'center',
                minHeight: 17,
              }}
            >
              <Box aria-hidden="true" />

              {row.segments.map(
                (segment, segmentIndex) => (
                  <Typography
                    key={`${buildingName}-unit-type-exception-${segment.floor}-${segment.start}-${segmentIndex}`}
                    component="div"
                    sx={{
                      gridColumn:
                        `${segment.start + 1} / span ${segment.end - segment.start + 1}`,
                      height: 17,
                      display:
                        'flex',
                      alignItems:
                        'center',
                      justifyContent:
                        'center',
                      border:
                        '1px solid #cbd5e1',
                      bgcolor:
                        'transparent',
                      boxSizing:
                        'border-box',
                      color:
                        typeColorMap?.[
                          segment.typeName
                        ] ||
                        '#475569',
                      fontSize:
                        '0.54rem',
                      fontWeight: 900,
                      lineHeight: 1,
                      whiteSpace:
                        'nowrap',
                      overflow:
                        'hidden',
                      textOverflow:
                        'ellipsis',
                    }}
                  >
                    {segment.typeName}
                  </Typography>
                ),
              )}
            </Box>
          ),
        )}

        {/* 기본 호별 타입 */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns:
              `21px repeat(${unitTypeSummary.columnCount}, ${CELL_WIDTH}px)`,
            columnGap:
              `${CELL_GAP}px`,
            alignItems: 'center',
            minHeight: 17,
          }}
        >
          <Box aria-hidden="true" />

          {unitTypeSummary.baseLabels.map(
            (unitType, index) => (
              <Typography
                key={`${buildingName}-unit-type-${index + 1}`}
                component="div"
                sx={{
                  height: 17,
                  display: 'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'center',
                  border:
                    unitType
                      ? '1px solid #cbd5e1'
                      : '1px solid transparent',
                  bgcolor:
                    'transparent',
                  boxSizing:
                    'border-box',
                  color:
                    typeColorMap?.[
                      unitType
                    ] ||
                    '#475569',
                  fontSize:
                    '0.54rem',
                  fontWeight: 900,
                  lineHeight: 1,
                  whiteSpace:
                    'nowrap',
                  overflow:
                    'hidden',
                  textOverflow:
                    'ellipsis',
                }}
              >
                {unitType}
              </Typography>
            ),
          )}
        </Box>
      </Box>

      <Typography
        sx={{
          mt: unitTypeSummary.hasLabels ? 0.35 : 0.45,
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

// v48 deployment trigger
