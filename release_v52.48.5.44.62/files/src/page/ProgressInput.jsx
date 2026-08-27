// v52.48.5.44.61 타입별 세대 현황 패널 우측 도킹·이동범위 복구
// v52.48.5.44.6.2 타입행 공통높이·색상 연동
// v52.48.5.44.5.2 타입현황 공정선택 뒤배치 + 폭 축소
// v52.48.5.44.5.1 타입현황 위치·최소화·닫기 동작 보정
// v52.48.5.44.5 공정별 현황 입력 타입별 세대현황 플로팅 패널
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import BuildingGrid from '../BuildingGrid';
import { supabase } from '../supabaseClient';
import KoreanDatePicker from '../components/KoreanDatePicker.jsx';
import {
  buildFloorVisualCells,
  getCanonicalUnitNumber,
  getCellKey,
  getFloorCellKeys,
  getProjectCellKeys,
  getUnitType,
} from '../utils/buildingUnits.js';

const STATUS_OPTIONS = ['작업전', '작업중', '작업완료'];

const TARGET_COLORS = [
  '#dc2626',
  '#2563eb',
  '#16a34a',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#be123c',
  '#4f46e5',
];

const TARGET_SELECT_COLUMNS = `
  id,
  project_name,
  process_type,
  sequence,
  target_name,
  target_date,
  building_floor_targets,
  created_by,
  updated_by,
  created_at,
  updated_at
`;

const UNIT_TYPE_PAGE_SIZE = 1000;

const getTargetPreferenceStorageKey = (
  projectName,
  preferenceName,
) =>
  `progress-input:${encodeURIComponent(
    String(projectName || 'default'),
  )}:${preferenceName}`;

const readStoredTargetPanelMinimized = (
  projectName,
) => {
  if (
    typeof window === 'undefined' ||
    !projectName
  ) {
    return false;
  }

  try {
    return (
      window.localStorage.getItem(
        getTargetPreferenceStorageKey(
          projectName,
          'target-panel-minimized',
        ),
      ) === 'true'
    );
  } catch (error) {
    console.warn(
      '방통구간 최소화 상태 조회 실패:',
      error,
    );
    return false;
  }
};

const readStoredHiddenTargetSequences = (
  projectName,
) => {
  if (
    typeof window === 'undefined' ||
    !projectName
  ) {
    return [];
  }

  try {
    const storedValue =
      window.localStorage.getItem(
        getTargetPreferenceStorageKey(
          projectName,
          'hidden-target-sequences',
        ),
      );

    const parsedValue =
      storedValue
        ? JSON.parse(storedValue)
        : [];

    return Array.from(
      new Set(
        (
          Array.isArray(parsedValue)
            ? parsedValue
            : []
        )
          .map((item) =>
            Number(item),
          )
          .filter(
            (item) =>
              Number.isInteger(
                item,
              ) &&
              item > 0,
          ),
      ),
    ).sort(
      (first, second) =>
        first - second,
    );
  } catch (error) {
    console.warn(
      '숨긴 방통구간 조회 실패:',
      error,
    );
    return [];
  }
};

const storeTargetPanelMinimized = (
  projectName,
  minimized,
) => {
  if (
    typeof window === 'undefined' ||
    !projectName
  ) {
    return;
  }

  try {
    window.localStorage.setItem(
      getTargetPreferenceStorageKey(
        projectName,
        'target-panel-minimized',
      ),
      minimized ? 'true' : 'false',
    );
  } catch (error) {
    console.warn(
      '방통구간 최소화 상태 저장 실패:',
      error,
    );
  }
};

const storeHiddenTargetSequences = (
  projectName,
  sequences,
) => {
  if (
    typeof window === 'undefined' ||
    !projectName
  ) {
    return;
  }

  try {
    window.localStorage.setItem(
      getTargetPreferenceStorageKey(
        projectName,
        'hidden-target-sequences',
      ),
      JSON.stringify(
        sequences,
      ),
    );
  } catch (error) {
    console.warn(
      '숨긴 방통구간 저장 실패:',
      error,
    );
  }
};

const TYPE_SUMMARY_COLORS = [
  '#2563eb',
  '#16a34a',
  '#ea580c',
  '#9333ea',
  '#0891b2',
  '#dc2626',
  '#4f46e5',
  '#0f766e',
  '#ca8a04',
  '#be123c',
  '#0284c7',
  '#65a30d',
];

// 328px에서 약 23% 축소합니다. 기존 가운데 여백은 약 1/3 수준만 남깁니다.
const TYPE_SUMMARY_PANEL_WIDTH = 252;
const TYPE_SUMMARY_PANEL_MIN_WIDTH = TYPE_SUMMARY_PANEL_WIDTH;

// Dashboard의 CSS zoom은 position: fixed의 left/top 좌표도 함께 축소합니다.
// window.innerWidth/clientX/getBoundingClientRect는 화면 좌표이므로,
// 패널의 left/top을 계산할 때 반드시 zoom 이전의 논리 좌표로 환산합니다.
const getDashboardLayoutScale = () => {
  if (typeof window === 'undefined') return 1;

  try {
    const root = document.documentElement;
    const cssScale = Number.parseFloat(
      window
        .getComputedStyle(root)
        .getPropertyValue(
          '--wooklim-dashboard-scale',
        ),
    );
    const inlineZoom = Number.parseFloat(
      root.style.zoom || '1',
    );
    const scale = Number.isFinite(cssScale)
      ? cssScale
      : inlineZoom;

    return Number.isFinite(scale) &&
      scale > 0
      ? scale
      : 1;
  } catch (error) {
    return 1;
  }
};

const getTypeSummaryLayoutViewport = () => {
  const scale = getDashboardLayoutScale();

  return {
    scale,
    width:
      typeof window !== 'undefined'
        ? window.innerWidth / scale
        : 1440,
    height:
      typeof window !== 'undefined'
        ? window.innerHeight / scale
        : 900,
  };
};

const getTypeSummaryPreferenceStorageKey = (projectName) =>
  `progress-input:${encodeURIComponent(
    String(projectName || 'default'),
  )}:type-summary-panel-v5`;

const getDefaultTypeSummaryPanelState = () => {
  const { width: viewportWidth } =
    getTypeSummaryLayoutViewport();

  return {
    minimized: false,
    docked: true,
    x: Math.max(
      4,
      viewportWidth -
        TYPE_SUMMARY_PANEL_WIDTH -
        4,
    ),
    // 실제 위치는 렌더링 후 우측 '펼치기/최소화' 버튼 하단에 다시 맞춥니다.
    y: 164,
  };
};

const readStoredTypeSummaryPanelState = (projectName) => {
  const fallback = getDefaultTypeSummaryPanelState();

  if (
    typeof window === 'undefined' ||
    !projectName
  ) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(
      getTypeSummaryPreferenceStorageKey(
        projectName,
      ),
    );

    if (!raw) return fallback;

    const parsed = JSON.parse(raw);

    return {
      minimized:
        parsed?.minimized === true,
      docked:
        parsed?.docked !== false,
      x: Number.isFinite(Number(parsed?.x))
        ? Number(parsed.x)
        : fallback.x,
      y: Number.isFinite(Number(parsed?.y))
        ? Number(parsed.y)
        : fallback.y,
    };
  } catch (error) {
    console.warn(
      '타입별 세대현황 창 상태 조회 실패:',
      error,
    );
    return fallback;
  }
};

const storeTypeSummaryPanelState = (
  projectName,
  panelState,
) => {
  if (
    typeof window === 'undefined' ||
    !projectName
  ) {
    return;
  }

  try {
    window.localStorage.setItem(
      getTypeSummaryPreferenceStorageKey(
        projectName,
      ),
      JSON.stringify({
        minimized:
          panelState?.minimized === true,
        docked:
          panelState?.docked !== false,
        x: Number(panelState?.x) || 0,
        y: Number(panelState?.y) || 0,
      }),
    );
  } catch (error) {
    console.warn(
      '타입별 세대현황 창 상태 저장 실패:',
      error,
    );
  }
};

const formatTypeSummaryPercentage = (
  completedCount,
  totalCount,
) => {
  if (!totalCount) return '0%';

  const percentage =
    (Number(completedCount || 0) /
      Number(totalCount)) *
    100;

  if (
    Math.abs(
      percentage -
        Math.round(percentage),
    ) < 0.05
  ) {
    return `${Math.round(
      percentage,
    )}%`;
  }

  return `${percentage.toFixed(1)}%`;
};

/*
  층별 타입 예외가 화면 하단에서 실제 몇 줄을 차지하는지 계산합니다.
  BuildingGrid의 예외타입 압축 규칙과 동일합니다.

  - 같은 층에서 인접한 동일 타입은 하나의 segment
  - 동일 패턴 반복층은 1회만 표시
  - 서로 차지하는 호 범위가 겹치지 않으면 같은 행에 배치
*/
const getPackedTypeExceptionRowCount = (config) => {
  const baseTypes = config?.unitTypes || {};
  const exceptionRows = [];
  const seenSignatures = new Set();

  Object.entries(config?.floorUnitTypes || {})
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

      buildFloorVisualCells(config, floor).forEach((cell) => {
        if (cell?.type !== 'valid') return;

        const canonicalUnitNumber =
          getCanonicalUnitNumber(
            config,
            floor,
            cell.visualStart,
          );

        const overrideType =
          floorMap?.[canonicalUnitNumber] ??
          floorMap?.[String(canonicalUnitNumber)] ??
          floorMap?.[cell.visualStart] ??
          floorMap?.[String(cell.visualStart)];

        const normalizedOverrideType =
          String(overrideType || '').trim();

        if (!normalizedOverrideType) return;

        const baseType =
          String(
            baseTypes?.[canonicalUnitNumber] ??
              baseTypes?.[String(canonicalUnitNumber)] ??
              baseTypes?.[cell.visualStart] ??
              baseTypes?.[String(cell.visualStart)] ??
              '',
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
          previous.end = segment.end;
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
        seenSignatures.has(signature)
      ) {
        return;
      }

      seenSignatures.add(signature);
      exceptionRows.push({
        segments: mergedSegments,
      });
    });

  const packedRows = [];

  exceptionRows.forEach((sourceRow) => {
    let targetRow = null;

    for (
      let rowIndex = 0;
      rowIndex < packedRows.length;
      rowIndex += 1
    ) {
      const candidate =
        packedRows[rowIndex];

      const overlaps =
        sourceRow.segments.some(
          (segment) =>
            candidate.segments.some(
              (existing) =>
                !(
                  segment.end <
                    existing.start ||
                  segment.start >
                    existing.end
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
        segments: [],
      };
      packedRows.push(targetRow);
    }

    targetRow.segments.push(
      ...sourceRow.segments,
    );
  });

  return packedRows.length;
};

const normalizeUnitTypeBuildingName = (value) => {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  if (/^\d+$/.test(text)) {
    return `${text}동`;
  }

  return text;
};

const normalizeUnitTypeUnitCode = (value) => {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  if (/^\d+$/.test(text)) {
    return String(Number(text));
  }

  return text;
};

const fetchAllProjectUnitTypes = async (projectName) => {
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('project_unit_types')
      .select('building, unit, unit_type')
      .eq('project_name', projectName)
      .order('building', { ascending: true })
      .order('unit', { ascending: true })
      .range(offset, offset + UNIT_TYPE_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const pageRows = data || [];
    rows.push(...pageRows);

    if (pageRows.length < UNIT_TYPE_PAGE_SIZE) {
      break;
    }

    offset += UNIT_TYPE_PAGE_SIZE;
  }

  return rows;
};

const getKoreaDateKey = (
  date = new Date(),
) => {
  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      },
    );

  const values = {};

  formatter
    .formatToParts(date)
    .forEach((part) => {
      if (part.type !== 'literal') {
        values[part.type] =
          part.value;
      }
    });

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );
};

const parseDateKeyToUtc = (
  dateKey,
) => {
  const match =
    String(dateKey || '')
      .match(
        /^(\d{4})-(\d{2})-(\d{2})$/,
      );

  if (!match) {
    return null;
  }

  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
};

const getDdayValue = (
  targetDate,
) => {
  const todayUtc =
    parseDateKeyToUtc(
      getKoreaDateKey(),
    );

  const targetUtc =
    parseDateKeyToUtc(
      targetDate,
    );

  if (
    todayUtc === null ||
    targetUtc === null
  ) {
    return null;
  }

  return Math.round(
    (
      targetUtc -
      todayUtc
    ) /
      86400000,
  );
};

const formatDday = (
  days,
) => {
  if (
    days === null ||
    Number.isNaN(days)
  ) {
    return '목표일 미설정';
  }

  if (days > 0) {
    return `D-${days}`;
  }

  if (days === 0) {
    return 'D-DAY';
  }

  return `D+${Math.abs(days)}`;
};

const normalizeFloorTargets = (
  value,
) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  return Object.entries(value)
    .reduce(
      (
        result,
        [buildingName, floor],
      ) => {
        const nextFloor =
          Number(floor);

        if (
          buildingName &&
          Number.isFinite(
            nextFloor,
          ) &&
          nextFloor > 0
        ) {
          result[buildingName] =
            nextFloor;
        }

        return result;
      },
      {},
    );
};

const getTargetCellKeys = ({
  buildingFloorTargets,
  buildingConfigs,
}) => {
  const cellKeys =
    new Set();

  Object.entries(
    normalizeFloorTargets(
      buildingFloorTargets,
    ),
  ).forEach(
    ([
      buildingName,
      targetFloor,
    ]) => {
      const config =
        buildingConfigs?.[
          buildingName
        ];

      if (!config) {
        return;
      }

      const maxFloor =
        Math.min(
          Number(
            config?.floors,
          ) || 0,
          Number(
            targetFloor,
          ) || 0,
        );

      for (
        let floor = 1;
        floor <= maxFloor;
        floor += 1
      ) {
        getFloorCellKeys(
          buildingName,
          config,
          floor,
        ).forEach(
          (cellKey) =>
            cellKeys.add(
              cellKey,
            ),
        );
      }
    },
  );

  return cellKeys;
};

const getTargetSummary = ({
  target,
  buildingConfigs,
  unitProgressData,
  targetCellKeys:
    providedTargetCellKeys,
}) => {
  const targetCellKeys =
    providedTargetCellKeys instanceof
    Set
      ? providedTargetCellKeys
      : getTargetCellKeys({
          buildingFloorTargets:
            target
              ?.building_floor_targets,
          buildingConfigs,
        });

  let completedCount = 0;

  targetCellKeys.forEach(
    (cellKey) => {
      if (
        unitProgressData?.[
          cellKey
        ]?.status ===
        '작업완료'
      ) {
        completedCount += 1;
      }
    },
  );

  const targetCount =
    targetCellKeys.size;

  const remainingCount =
    Math.max(
      targetCount -
        completedCount,
      0,
    );

  const dday =
    getDdayValue(
      target?.target_date,
    );

  const dailyRequired =
    remainingCount === 0
      ? 0
      : dday !== null &&
          dday > 0
        ? remainingCount /
          dday
        : null;

  const percentage =
    targetCount > 0
      ? Math.round(
          (
            completedCount /
            targetCount
          ) * 1000,
        ) / 10
      : 0;

  return {
    targetCount,
    completedCount,
    remainingCount,
    dday,
    ddayLabel:
      formatDday(dday),
    dailyRequired,
    percentage,
  };
};

const normalizeProcessTypes = (
  value,
  processOptions = [],
) => {
  const rawValues =
    Array.isArray(value)
      ? value
      : [];

  const uniqueValues =
    Array.from(
      new Set(
        rawValues
          .map((item) =>
            String(
              item || '',
            ).trim(),
          )
          .filter(Boolean),
      ),
    );

  if (
    !Array.isArray(
      processOptions,
    ) ||
    processOptions.length ===
      0
  ) {
    return uniqueValues;
  }

  const optionSet =
    new Set(
      processOptions,
    );

  return uniqueValues
    .filter((item) =>
      optionSet.has(item),
    )
    .sort(
      (first, second) =>
        processOptions.indexOf(
          first,
        ) -
        processOptions.indexOf(
          second,
        ),
    );
};

const groupProgressTargetRows = (
  rows,
  processOptions,
) => {
  const groupMap =
    new Map();

  (rows || []).forEach(
    (row) => {
      const sequence =
        Number(
          row?.sequence,
        ) || 1;

      if (
        !groupMap.has(
          sequence,
        )
      ) {
        groupMap.set(
          sequence,
          [],
        );
      }

      groupMap
        .get(sequence)
        .push(row);
    },
  );

  return Array.from(
    groupMap.entries(),
  )
    .sort(
      ([first], [second]) =>
        first - second,
    )
    .map(
      ([
        sequence,
        groupRows,
      ]) => {
        const representative =
          groupRows
            .slice()
            .sort(
              (
                first,
                second,
              ) =>
                String(
                  second.updated_at ||
                    '',
                ).localeCompare(
                  String(
                    first.updated_at ||
                      '',
                  ),
                ),
            )[0] ||
          groupRows[0];

        const processTypes =
          normalizeProcessTypes(
            groupRows.map(
              (row) =>
                row.process_type,
            ),
            processOptions,
          );

        const rowsByProcess =
          groupRows.reduce(
            (
              result,
              row,
            ) => {
              if (
                row.process_type
              ) {
                result[
                  row.process_type
                ] = row;
              }

              return result;
            },
            {},
          );

        return {
          id:
            `sequence:${sequence}`,
          sequence,
          target_name:
            representative
              ?.target_name ||
            `${sequence}차 방통`,
          target_date:
            representative
              ?.target_date ||
            '',
          building_floor_targets:
            normalizeFloorTargets(
              representative
                ?.building_floor_targets,
            ),
          process_types:
            processTypes,
          rows_by_process:
            rowsByProcess,
          updated_at:
            representative
              ?.updated_at ||
            '',
        };
      },
    );
};

const fetchAllTargetProgressRows =
  async ({
    projectName,
    processTypes,
  }) => {
    const normalizedTypes =
      Array.from(
        new Set(
          (processTypes || [])
            .map((item) =>
              String(
                item || '',
              ).trim(),
            )
            .filter(Boolean),
        ),
      );

    if (
      !projectName ||
      normalizedTypes.length ===
        0
    ) {
      return [];
    }

    const rows = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const {
        data,
        error,
      } = await supabase
        .from(
          'unit_progress',
        )
        .select(
          `
          building,
          unit,
          process_type,
          status,
          completion_date
        `,
        )
        .eq(
          'project_name',
          projectName,
        )
        .in(
          'process_type',
          normalizedTypes,
        )
        .order(
          'process_type',
          {
            ascending: true,
          },
        )
        .order(
          'building',
          {
            ascending: true,
          },
        )
        .order(
          'unit',
          {
            ascending: true,
          },
        )
        .range(
          from,
          from +
            pageSize -
            1,
        );

      if (error) {
        throw error;
      }

      const nextRows =
        data || [];

      rows.push(...nextRows);

      if (
        nextRows.length <
        pageSize
      ) {
        break;
      }

      from += pageSize;
    }

    return rows;
  };

const buildProgressDataByProcess =
  (rows) =>
    (rows || []).reduce(
      (
        result,
        row,
      ) => {
        const processType =
          String(
            row?.process_type ||
              '',
          ).trim();

        if (
          !processType ||
          !row?.building ||
          !row?.unit
        ) {
          return result;
        }

        if (
          !result[
            processType
          ]
        ) {
          result[
            processType
          ] = {};
        }

        result[
          processType
        ][
          `${row.building}-${row.unit}`
        ] = {
          status:
            row.status,
          date:
            row.completion_date,
        };

        return result;
      },
      {},
    );

const getStatusButtonStyle = (status, selectedStatusAction) => {
  const selected = selectedStatusAction === status;

  if (status === '작업중') {
    return {
      color: selected ? '#ffffff' : '#10b981',
      borderColor: '#6ee7b7',
      bgcolor: selected ? '#10b981' : '#ffffff',
      '&:hover': {
        bgcolor: selected ? '#059669' : '#ecfdf5',
        borderColor: '#10b981',
      },
    };
  }

  if (status === '작업완료') {
    return {
      color: selected ? '#ffffff' : '#0ea5e9',
      borderColor: '#7dd3fc',
      bgcolor: selected ? '#0ea5e9' : '#ffffff',
      '&:hover': {
        bgcolor: selected ? '#0284c7' : '#f0f9ff',
        borderColor: '#0ea5e9',
      },
    };
  }

  return {
    color: selected ? '#ffffff' : '#64748b',
    borderColor: '#cbd5e1',
    bgcolor: selected ? '#94a3b8' : '#ffffff',
    '&:hover': {
      bgcolor: selected ? '#64748b' : '#f8fafc',
      borderColor: '#94a3b8',
    },
  };
};

export default function ProgressInput({
  projectName = '',
  selectedCells = new Set(),
  actionName = '',
  progressDate = '',
  setProgressDate,
  handleSaveProgress,
  setSelectedCells,
  selectedStatusAction = '작업완료',
  setSelectedStatusAction,
  protectCompleted = false,
  completedUnits = 0,
  totalUnits = 0,
  progressPercentage = 0,
  setSelectedProcess,
  selectedProcess = '',
  processOptions = [],
  buildingConfigs = {},
  unitProgressData = {},
  unitProgressProjectName = '',
  unitProgressProcess = '',
  handleGridCellClick,
  handleFloorClick,
}) {
  const [
    progressTargets,
    setProgressTargets,
  ] = useState([]);

  const [
    activeTargetId,
    setActiveTargetId,
  ] = useState('');

  const [
    targetLineEditMode,
    setTargetLineEditMode,
  ] = useState(false);

  const [
    targetMenuAnchor,
    setTargetMenuAnchor,
  ] = useState(null);

  const [
    targetVisibilityMenuAnchor,
    setTargetVisibilityMenuAnchor,
  ] = useState(null);

  const [
    hiddenTargetSequences,
    setHiddenTargetSequences,
  ] = useState([]);

  const [
    targetPanelMinimized,
    setTargetPanelMinimized,
  ] = useState(false);

  const [
    targetDialogOpen,
    setTargetDialogOpen,
  ] = useState(false);

  const [
    targetDraft,
    setTargetDraft,
  ] = useState({
    id: '',
    sequence: 1,
    target_name:
      '1차 방통',
    target_date: '',
    process_types: [],
    building_floor_targets:
      {},
  });

  const [
    targetProcessProgressData,
    setTargetProcessProgressData,
  ] = useState({});

  const [
    targetLoading,
    setTargetLoading,
  ] = useState(false);

  const [
    targetSaving,
    setTargetSaving,
  ] = useState(false);

  const [
    targetError,
    setTargetError,
  ] = useState('');

  const [
    unitTypeData,
    setUnitTypeData,
  ] = useState({});

  const [
    unitTypeError,
    setUnitTypeError,
  ] = useState('');

  const [
    typeSummaryPanelState,
    setTypeSummaryPanelState,
  ] = useState(() =>
    readStoredTypeSummaryPanelState(
      projectName,
    ),
  );

  /*
    닫기(X)는 현재 공정별 현황 입력 화면을 떠날 때까지만 유지합니다.
    - 공정 변경: 다시 나타나지 않음
    - 다른 메뉴 이동 후 재진입: 다시 나타남
    - F5 새로고침: 다시 나타남
  */
  const [
    typeSummaryPanelClosed,
    setTypeSummaryPanelClosed,
  ] = useState(false);

  const typeSummaryDragRef =
    useRef(null);

  const typeSummaryPanelAnchorRef =
    useRef(null);

  const getDockedTypeSummaryPanelPosition =
    useCallback(
      (minimized = false) => {
        if (
          typeof window ===
          'undefined'
        ) {
          return {
            x: 12,
            y: 164,
          };
        }

        const width =
          minimized
            ? TYPE_SUMMARY_PANEL_MIN_WIDTH
            : TYPE_SUMMARY_PANEL_WIDTH;
        const {
          scale,
          width: viewportWidth,
          height: viewportHeight,
        } = getTypeSummaryLayoutViewport();
        const rightGap = 4;
        const maxX =
          Math.max(
            rightGap,
            viewportWidth -
              width -
              rightGap,
          );
        const maxY =
          Math.max(
            8,
            viewportHeight -
              48,
          );
        const anchorRect =
          typeSummaryPanelAnchorRef.current?.getBoundingClientRect?.();

        /*
          getBoundingClientRect는 CSS zoom이 적용된 화면 좌표를 반환하고,
          fixed의 left/top은 zoom 이전 레이아웃 좌표를 받습니다.
          따라서 anchor 좌표를 scale로 나눈 뒤 패널 폭을 빼야
          실제 화면에서도 펼치기/최소화 버튼의 오른쪽 끝과 정확히 맞습니다.
        */
        const desiredX =
          anchorRect
            ? anchorRect.right /
                scale -
              width
            : maxX;
        const desiredY =
          anchorRect
            ? anchorRect.bottom /
                scale +
              8
            : 164;

        return {
          x: Math.min(
            Math.max(
              rightGap,
              desiredX,
            ),
            maxX,
          ),
          y: Math.min(
            Math.max(
              8,
              desiredY,
            ),
            maxY,
          ),
        };
      },
      [],
    );

  const selectionCount =
    selectedCells?.size ?? 0;

  const todayDateKey =
    getKoreaDateKey();

  const protectedCompletedCount =
    Object.values(
      unitProgressData || {},
    ).filter(
      (progressItem) =>
        progressItem?.status ===
        '작업완료',
    ).length;

  const sortedBuildings = Object.entries(buildingConfigs || {}).sort(
    ([keyA], [keyB]) =>
      keyA.localeCompare(keyB, 'ko', {
        numeric: true,
      }),
  );

  const typeHouseholdSummary =
    useMemo(() => {
      const groupedByType =
        new Map();
      const allCellKeys =
        getProjectCellKeys(
          buildingConfigs,
        );

      Object.entries(
        buildingConfigs || {},
      ).forEach(
        ([
          buildingName,
          config,
        ]) => {
          const floors =
            Number(
              config?.floors,
            ) || 0;

          for (
            let floor = 1;
            floor <= floors;
            floor += 1
          ) {
            buildFloorVisualCells(
              config,
              floor,
            ).forEach(
              (cell) => {
                if (
                  cell?.type !==
                    'valid' ||
                  !cell?.unitCode
                ) {
                  return;
                }

                const cellKey =
                  getCellKey(
                    buildingName,
                    cell.unitCode,
                  );

                const configType =
                  getUnitType(
                    config,
                    floor,
                    cell.visualStart,
                  );

                const legacyType =
                  String(
                    unitTypeData?.[
                      cellKey
                    ] || '',
                  ).trim();

                const unitType =
                  String(
                    configType ||
                      legacyType ||
                      '미지정',
                  ).trim();

                if (
                  !groupedByType.has(
                    unitType,
                  )
                ) {
                  groupedByType.set(
                    unitType,
                    {
                      typeName:
                        unitType,
                      totalCount: 0,
                      completedCount:
                        0,
                    },
                  );
                }

                const summary =
                  groupedByType.get(
                    unitType,
                  );

                summary.totalCount +=
                  1;

                if (
                  unitProgressData?.[
                    cellKey
                  ]?.status ===
                  '작업완료'
                ) {
                  summary.completedCount +=
                    1;
                }
              },
            );
          }
        },
      );

      const rows = Array.from(
        groupedByType.values(),
      )
        .sort(
          (first, second) => {
            if (
              first.typeName ===
              '미지정'
            ) {
              return 1;
            }

            if (
              second.typeName ===
              '미지정'
            ) {
              return -1;
            }

            return first.typeName.localeCompare(
              second.typeName,
              'ko',
              {
                numeric: true,
                sensitivity:
                  'base',
              },
            );
          },
        )
        .map(
          (row, index) => ({
            ...row,
            color:
              TYPE_SUMMARY_COLORS[
                index %
                  TYPE_SUMMARY_COLORS.length
              ],
            percentageLabel:
              formatTypeSummaryPercentage(
                row.completedCount,
                row.totalCount,
              ),
          }),
        );

      let aggregateCompletedCount =
        0;

      allCellKeys.forEach(
        (cellKey) => {
          if (
            unitProgressData?.[
              cellKey
            ]?.status ===
            '작업완료'
          ) {
            aggregateCompletedCount +=
              1;
          }
        },
      );

      return {
        rows,
        totalCount:
          allCellKeys.size,
        completedCount:
          aggregateCompletedCount,
        percentageLabel:
          formatTypeSummaryPercentage(
            aggregateCompletedCount,
            allCellKeys.size,
          ),
      };
    }, [
      buildingConfigs,
      unitProgressData,
      unitTypeData,
    ]);

  /*
    우측 타입별 세대현황의 색상을 하단 타입 글자색에도 동일하게 사용합니다.
    색상은 배경/박스가 아니라 글자에만 적용합니다.
  */
  const typeColorMap = useMemo(
    () =>
      Object.fromEntries(
        typeHouseholdSummary.rows.map(
          (row) => [
            row.typeName,
            row.color,
          ],
        ),
      ),
    [typeHouseholdSummary.rows],
  );

  /*
    동별 타입표의 실제 표시행 수를 현장 전체에서 동일하게 맞춥니다.
    기본 타입 1행 + 가장 많은 예외타입 행수를 공통 슬롯으로 사용하므로
    어느 동이든 1층의 수직 위치가 동일하게 유지됩니다.
  */
  const typeFooterRowSlots = useMemo(() => {
    let maxRows = 1;

    Object.values(
      buildingConfigs || {},
    ).forEach((config) => {
      const rowCount =
        1 +
        getPackedTypeExceptionRowCount(
          config,
        );

      maxRows = Math.max(
        maxRows,
        rowCount,
      );
    });

    return maxRows;
  }, [buildingConfigs]);

  const loadProjectUnitTypes =
    useCallback(async () => {
      if (!projectName) {
        setUnitTypeData({});
        setUnitTypeError('');
        return;
      }

      setUnitTypeError('');

      try {
        const rows =
          await fetchAllProjectUnitTypes(
            projectName,
          );

        const mapped = {};

        rows.forEach((row) => {
          const buildingName =
            normalizeUnitTypeBuildingName(
              row?.building,
            );
          const unitCode =
            normalizeUnitTypeUnitCode(
              row?.unit,
            );
          const unitType =
            String(
              row?.unit_type || '',
            ).trim();

          if (
            !buildingName ||
            !unitCode ||
            !unitType
          ) {
            return;
          }

          mapped[
            `${buildingName}-${unitCode}`
          ] = unitType;
        });

        setUnitTypeData(mapped);
      } catch (error) {
        console.error(
          '세대 타입 조회 실패:',
          error,
        );

        setUnitTypeData({});
        setUnitTypeError(
          error?.code === '42P01'
            ? '세대 타입 테이블이 없습니다. 제공된 v47 SQL을 먼저 실행해주세요.'
            : error?.message ||
                '세대 타입 정보를 불러오지 못했습니다.',
        );
      }
    }, [projectName]);

  useEffect(() => {
    loadProjectUnitTypes();
  }, [loadProjectUnitTypes]);

  useEffect(() => {
    const storedState =
      readStoredTypeSummaryPanelState(
        projectName,
      );

    setTypeSummaryPanelState(
      storedState,
    );
    typeSummaryDragRef.current =
      null;

    /*
      신규 기본값(docked=true)은 실제 버튼 DOM 위치를 읽은 뒤 한 번 더 맞춥니다.
      사용자가 직접 드래그한 위치(docked=false)는 재진입 시 그대로 유지합니다.
    */
    const frameId =
      window.requestAnimationFrame(
        () => {
          setTypeSummaryPanelState(
            (previous) => {
              if (
                previous?.docked ===
                false
              ) {
                return previous;
              }

              const dockedPosition =
                getDockedTypeSummaryPanelPosition(
                  previous?.minimized ===
                    true,
                );
              const next = {
                ...previous,
                ...dockedPosition,
                docked: true,
              };

              storeTypeSummaryPanelState(
                projectName,
                next,
              );

              return next;
            },
          );
        },
      );

    return () => {
      window.cancelAnimationFrame(
        frameId,
      );
    };
  }, [
    projectName,
    getDockedTypeSummaryPanelPosition,
  ]);

  useEffect(() => {
    const handleResize = () => {
      setTypeSummaryPanelState(
        (previous) => {
          const width =
            previous.minimized
              ? TYPE_SUMMARY_PANEL_MIN_WIDTH
              : TYPE_SUMMARY_PANEL_WIDTH;
          const {
            width: viewportWidth,
            height: viewportHeight,
          } = getTypeSummaryLayoutViewport();
          const dockedPosition =
            previous?.docked !==
            false
              ? getDockedTypeSummaryPanelPosition(
                  previous.minimized,
                )
              : null;
          const next =
            dockedPosition
              ? {
                  ...previous,
                  ...dockedPosition,
                  docked: true,
                }
              : {
                  ...previous,
                  x: Math.min(
                    Math.max(
                      4,
                      Number(
                        previous.x,
                      ) || 4,
                    ),
                    Math.max(
                      4,
                      viewportWidth -
                        width -
                        4,
                    ),
                  ),
                  y: Math.min(
                    Math.max(
                      8,
                      Number(
                        previous.y,
                      ) || 8,
                    ),
                    Math.max(
                      8,
                      viewportHeight -
                        48,
                    ),
                  ),
                };

          storeTypeSummaryPanelState(
            projectName,
            next,
          );

          return next;
        },
      );
    };

    window.addEventListener(
      'resize',
      handleResize,
    );

    return () => {
      window.removeEventListener(
        'resize',
        handleResize,
      );
    };
  }, [
    projectName,
    getDockedTypeSummaryPanelPosition,
  ]);

  const loadProgressTargets =
    useCallback(async () => {
      if (!projectName) {
        setProgressTargets([]);
        setActiveTargetId('');
        setTargetProcessProgressData(
          {},
        );
        setTargetLineEditMode(
          false,
        );
        return;
      }

      setTargetLoading(true);
      setTargetError('');

      try {
        const {
          data,
          error,
        } = await supabase
          .from(
            'progress_targets',
          )
          .select(
            TARGET_SELECT_COLUMNS,
          )
          .eq(
            'project_name',
            projectName,
          )
          .order(
            'sequence',
            {
              ascending: true,
            },
          );

        if (error) {
          throw error;
        }

        const normalizedRows =
          (data || []).map(
            (row) => ({
              ...row,
              building_floor_targets:
                normalizeFloorTargets(
                  row
                    .building_floor_targets,
                ),
            }),
          );

        const groupedTargets =
          groupProgressTargetRows(
            normalizedRows,
            processOptions,
          );

        setProgressTargets(
          groupedTargets,
        );

        setActiveTargetId(
          (previous) =>
            groupedTargets.some(
              (target) =>
                target.id ===
                previous,
            )
              ? previous
              : groupedTargets[0]
                  ?.id ||
                '',
        );

        const targetProcessTypes =
          Array.from(
            new Set(
              groupedTargets.flatMap(
                (target) =>
                  target.process_types,
              ),
            ),
          );

        try {
          const progressRows =
            await fetchAllTargetProgressRows({
              projectName,
              processTypes:
                targetProcessTypes,
            });

          setTargetProcessProgressData(
            buildProgressDataByProcess(
              progressRows,
            ),
          );
        } catch (
          progressError
        ) {
          console.error(
            '차수별 공정 진척 조회 실패:',
            progressError,
          );

          setTargetProcessProgressData(
            {},
          );

          setTargetError(
            progressError?.message ||
              '차수별 공정 진척을 불러오지 못했습니다.',
          );
        }
      } catch (error) {
        console.error(
          '공정 목표 조회 실패:',
          error,
        );

        setProgressTargets([]);
        setActiveTargetId('');
        setTargetProcessProgressData(
          {},
        );

        setTargetError(
          error?.code ===
            '42P01'
            ? 'progress_targets 테이블이 없습니다. 제공된 SQL을 먼저 실행해주세요.'
            : error?.message ||
                '공정 목표를 불러오지 못했습니다.',
        );
      } finally {
        setTargetLoading(false);
      }
    }, [
      processOptions,
      projectName,
    ]);

  useEffect(() => {
    loadProgressTargets();
  }, [loadProgressTargets]);

  useEffect(() => {
    setTargetLineEditMode(
      false,
    );
  }, [projectName]);

  useEffect(() => {
    setTargetPanelMinimized(
      readStoredTargetPanelMinimized(
        projectName,
      ),
    );
    setHiddenTargetSequences(
      readStoredHiddenTargetSequences(
        projectName,
      ),
    );
    setTargetVisibilityMenuAnchor(
      null,
    );
  }, [projectName]);

  /*
    현재 화면에서 수정한 공정은 Dashboard의 최신 데이터를
    차수별 집계 데이터에도 즉시 반영합니다.
  */
  useEffect(() => {
    if (
      !selectedProcess ||
      unitProgressProjectName !==
        projectName ||
      unitProgressProcess !==
        selectedProcess
    ) {
      return;
    }

    setTargetProcessProgressData(
      (previous) => ({
        ...previous,
        [selectedProcess]:
          unitProgressData || {},
      }),
    );
  }, [
    projectName,
    selectedProcess,
    unitProgressData,
    unitProgressProjectName,
    unitProgressProcess,
  ]);

  const targetSummaries =
    useMemo(
      () => {
        /*
          progress_targets의 목표층은 1층부터 해당 차수 최종층까지의
          누적 범위로 저장됩니다.

          따라서 2차 이후의 실제 차수 물량은 현재 누적 범위에서
          이전 모든 차수의 누적 범위를 제외해야 합니다.
          이 방식은 3차, 4차 이후가 추가되어도 같은 규칙으로 동작합니다.
        */
        const previousTargetCellKeys =
          new Set();

        return progressTargets.map(
          (target, index) => {
            const cumulativeTargetCellKeys =
              getTargetCellKeys({
                buildingFloorTargets:
                  target
                    .building_floor_targets,
                buildingConfigs,
              });

            const currentTargetCellKeys =
              new Set(
                Array.from(
                  cumulativeTargetCellKeys,
                ).filter(
                  (cellKey) =>
                    !previousTargetCellKeys.has(
                      cellKey,
                    ),
                ),
              );

            cumulativeTargetCellKeys.forEach(
              (cellKey) =>
                previousTargetCellKeys.add(
                  cellKey,
                ),
            );

            const processSummaries =
              target.process_types.map(
                (
                  processType,
                ) => {
                  const currentProcessIsLoaded =
                    processType ===
                      selectedProcess &&
                    unitProgressProjectName ===
                      projectName &&
                    unitProgressProcess ===
                      selectedProcess;

                  const processData =
                    currentProcessIsLoaded
                      ? unitProgressData
                      : targetProcessProgressData[
                          processType
                        ] || {};

                  return {
                    processType,
                    summary:
                      getTargetSummary({
                        target,
                        buildingConfigs,
                        unitProgressData:
                          processData,
                        targetCellKeys:
                          currentTargetCellKeys,
                      }),
                  };
                },
              );

            return {
              target,
              color:
                TARGET_COLORS[
                  index %
                    TARGET_COLORS.length
                ],
              processSummaries,
              selectedProcessSummary:
                processSummaries.find(
                  (item) =>
                    item.processType ===
                    selectedProcess,
                ) || null,
            };
          },
        );
      },
      [
        buildingConfigs,
        progressTargets,
        projectName,
        selectedProcess,
        targetProcessProgressData,
        unitProgressData,
        unitProgressProjectName,
        unitProgressProcess,
      ],
    );

  const activeTargetItem =
    targetSummaries.find(
      (item) =>
        item.target.id ===
        activeTargetId,
    ) || null;

  const hiddenTargetSequenceSet =
    useMemo(
      () =>
        new Set(
          hiddenTargetSequences,
        ),
      [hiddenTargetSequences],
    );

  const hiddenTargetCount =
    progressTargets.filter(
      (target) =>
        hiddenTargetSequenceSet.has(
          Number(
            target.sequence,
          ),
        ),
    ).length;

  /*
    현재 선택한 방통 차수의 라인 안에 포함되는 실제 세대수입니다.
    차수에 연결된 공정은 같은 동·층 라인을 공유하므로,
    선택 공정 집계를 우선 사용하고 없으면 첫 공정 집계를 사용합니다.
  */
  const activeTargetHouseholdCount =
    activeTargetItem
      ?.selectedProcessSummary
      ?.summary
      ?.targetCount ??
    activeTargetItem
      ?.processSummaries?.[0]
      ?.summary
      ?.targetCount ??
    0;

  const openNewTargetDialog =
    () => {
      const nextSequence =
        progressTargets.reduce(
          (maximum, target) =>
            Math.max(
              maximum,
              Number(
                target.sequence,
              ) || 0,
            ),
          0,
        ) + 1;

      setTargetDraft({
        id: '',
        sequence:
          nextSequence,
        target_name:
          `${nextSequence}차 방통`,
        target_date:
          getKoreaDateKey(),
        process_types:
          selectedProcess
            ? [selectedProcess]
            : processOptions[0]
              ? [
                  processOptions[0],
                ]
              : [],
        building_floor_targets:
          {},
      });

      setTargetDialogOpen(
        true,
      );
    };

  const openEditTargetDialog =
    () => {
      if (!activeTargetItem) {
        return;
      }

      setTargetDraft({
        ...activeTargetItem
          .target,
        process_types:
          normalizeProcessTypes(
            activeTargetItem
              .target
              .process_types,
            processOptions,
          ),
        building_floor_targets:
          normalizeFloorTargets(
            activeTargetItem
              .target
              .building_floor_targets,
          ),
      });

      setTargetDialogOpen(
        true,
      );
    };

  const getCurrentUserEmail =
    async () => {
      const {
        data,
      } =
        await supabase.auth.getUser();

      return (
        data?.user?.email ||
        ''
      );
    };

  const saveTargetDraft =
    async () => {
      const targetName =
        String(
          targetDraft
            .target_name || '',
        ).trim();

      const selectedProcessTypes =
        normalizeProcessTypes(
          targetDraft
            .process_types,
          processOptions,
        );

      if (!targetName) {
        setTargetError(
          '차수명을 입력해주세요.',
        );
        return;
      }

      if (
        !targetDraft
          .target_date
      ) {
        setTargetError(
          '목표일을 선택해주세요.',
        );
        return;
      }

      if (
        selectedProcessTypes.length ===
        0
      ) {
        setTargetError(
          '적용할 공정을 한 개 이상 선택해주세요.',
        );
        return;
      }

      setTargetSaving(true);
      setTargetError('');

      try {
        const userEmail =
          await getCurrentUserEmail();

        const sequence =
          Number(
            targetDraft
              .sequence,
          ) || 1;

        const sharedFloorTargets =
          normalizeFloorTargets(
            targetDraft
              .building_floor_targets,
          );

        const upsertRows =
          selectedProcessTypes.map(
            (processType) => ({
              project_name:
                projectName,
              process_type:
                processType,
              sequence,
              target_name:
                targetName,
              target_date:
                targetDraft
                  .target_date,
              building_floor_targets:
                sharedFloorTargets,
              created_by:
                userEmail ||
                null,
              updated_by:
                userEmail ||
                null,
            }),
          );

        const {
          error: upsertError,
        } = await supabase
          .from(
            'progress_targets',
          )
          .upsert(
            upsertRows,
            {
              onConflict:
                'project_name,process_type,sequence',
            },
          );

        if (upsertError) {
          throw upsertError;
        }

        const existingProcessTypes =
          normalizeProcessTypes(
            activeTargetItem
              ?.target
              ?.process_types ||
              [],
            processOptions,
          );

        const removedProcessTypes =
          existingProcessTypes.filter(
            (processType) =>
              !selectedProcessTypes.includes(
                processType,
              ),
          );

        if (
          targetDraft.id &&
          removedProcessTypes.length >
            0
        ) {
          const {
            error:
              deleteRemovedError,
          } = await supabase
            .from(
              'progress_targets',
            )
            .delete()
            .eq(
              'project_name',
              projectName,
            )
            .eq(
              'sequence',
              sequence,
            )
            .in(
              'process_type',
              removedProcessTypes,
            );

          if (
            deleteRemovedError
          ) {
            throw deleteRemovedError;
          }
        }

        const nextTargetId =
          `sequence:${sequence}`;

        setActiveTargetId(
          nextTargetId,
        );

        setTargetDialogOpen(
          false,
        );

        await loadProgressTargets();

        setActiveTargetId(
          nextTargetId,
        );

        if (
          !targetDraft.id
        ) {
          setTargetLineEditMode(
            true,
          );
        }
      } catch (error) {
        console.error(
          '공정 목표 저장 실패:',
          error,
        );

        setTargetError(
          error?.message ||
            '공정 목표를 저장하지 못했습니다.',
        );
      } finally {
        setTargetSaving(false);
      }
    };

  const deleteActiveTarget =
    async () => {
      if (
        !targetDraft.id
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `${targetDraft.target_name} 설정과 적용 공정 전체를 삭제할까요?`,
        );

      if (!confirmed) {
        return;
      }

      setTargetSaving(true);
      setTargetError('');

      try {
        const {
          error,
        } = await supabase
          .from(
            'progress_targets',
          )
          .delete()
          .eq(
            'project_name',
            projectName,
          )
          .eq(
            'sequence',
            Number(
              targetDraft
                .sequence,
            ) || 1,
          );

        if (error) {
          throw error;
        }

        setTargetLineEditMode(
          false,
        );

        setTargetDialogOpen(
          false,
        );

        await loadProgressTargets();
      } catch (error) {
        console.error(
          '공정 목표 삭제 실패:',
          error,
        );

        setTargetError(
          error?.message ||
            '공정 목표를 삭제하지 못했습니다.',
        );
      } finally {
        setTargetSaving(false);
      }
    };

  const updateTargetFloor =
    async (
      buildingName,
      floor,
    ) => {
      if (
        !targetLineEditMode ||
        !activeTargetItem ||
        targetSaving
      ) {
        return;
      }

      const activeTarget =
        activeTargetItem
          .target;

      const currentTargets =
        normalizeFloorTargets(
          activeTarget
            .building_floor_targets,
        );

      const nextTargets = {
        ...currentTargets,
      };

      if (
        Number(
          currentTargets[
            buildingName
          ],
        ) === Number(floor)
      ) {
        delete nextTargets[
          buildingName
        ];
      } else {
        nextTargets[
          buildingName
        ] = Number(floor);
      }

      setTargetSaving(true);
      setTargetError('');

      try {
        const userEmail =
          await getCurrentUserEmail();

        const {
          error,
        } = await supabase
          .from(
            'progress_targets',
          )
          .update({
            building_floor_targets:
              nextTargets,
            updated_by:
              userEmail ||
              null,
          })
          .eq(
            'project_name',
            projectName,
          )
          .eq(
            'sequence',
            Number(
              activeTarget
                .sequence,
            ) || 1,
          );

        if (error) {
          throw error;
        }

        setProgressTargets(
          (previous) =>
            previous.map(
              (target) =>
                target.id ===
                activeTarget.id
                  ? {
                      ...target,
                      building_floor_targets:
                        nextTargets,
                    }
                  : target,
            ),
        );
      } catch (error) {
        console.error(
          '목표 라인 저장 실패:',
          error,
        );

        setTargetError(
          error?.message ||
            '목표 라인을 저장하지 못했습니다.',
        );
      } finally {
        setTargetSaving(false);
      }
    };

  const handleEffectiveFloorClick =
    (
      buildingName,
      floor,
    ) => {
      if (
        targetLineEditMode &&
        activeTargetItem
      ) {
        updateTargetFloor(
          buildingName,
          floor,
        );
        return;
      }

      handleFloorClick?.(
        buildingName,
        floor,
      );
    };

  const selectAllCells = () => {
    const allCellKeys =
      getProjectCellKeys(
        buildingConfigs,
      );

    const editableCellKeys =
      protectCompleted
        ? Array.from(
            allCellKeys,
          ).filter(
            (cellKey) =>
              unitProgressData?.[
                cellKey
              ]?.status !==
              '작업완료',
          )
        : Array.from(
            allCellKeys,
          );

    setSelectedCells?.(
      new Set(
        editableCellKeys,
      ),
    );
  };

  const clearSelectedCells = () => {
    setSelectedCells?.(new Set());
  };

  const updateTypeSummaryPanelState =
    (updater) => {
      setTypeSummaryPanelState(
        (previous) => {
          const next =
            typeof updater ===
            'function'
              ? updater(previous)
              : updater;

          storeTypeSummaryPanelState(
            projectName,
            next,
          );

          return next;
        },
      );
    };

  const handleTypeSummaryPointerDown =
    (event) => {
      if (
        event.button !== 0 ||
        event.target.closest(
          'button',
        )
      ) {
        return;
      }

      const panel =
        event.currentTarget.closest(
          '[data-type-summary-panel="true"]',
        );

      if (!panel) return;

      const rect =
        panel.getBoundingClientRect();

      typeSummaryDragRef.current = {
        pointerId:
          event.pointerId,
        offsetX:
          event.clientX -
          rect.left,
        offsetY:
          event.clientY -
          rect.top,
        width:
          rect.width,
        scale:
          getDashboardLayoutScale(),
      };

      event.currentTarget
        .setPointerCapture?.(
          event.pointerId,
        );

      event.preventDefault();
    };

  const handleTypeSummaryPointerMove =
    (event) => {
      const drag =
        typeSummaryDragRef.current;

      if (
        !drag ||
        drag.pointerId !==
          event.pointerId
      ) {
        return;
      }

      const scale =
        Number(drag.scale) > 0
          ? Number(drag.scale)
          : getDashboardLayoutScale();
      const panelWidth =
        drag.width / scale;
      const viewportWidth =
        window.innerWidth / scale;
      const viewportHeight =
        window.innerHeight / scale;
      const maxX =
        Math.max(
          4,
          viewportWidth -
            panelWidth -
            4,
        );
      const maxY =
        Math.max(
          8,
          viewportHeight -
            48,
        );

      updateTypeSummaryPanelState(
        (previous) => ({
          ...previous,
          x: Math.min(
            Math.max(
              4,
              (event.clientX -
                drag.offsetX) /
                scale,
            ),
            maxX,
          ),
          y: Math.min(
            Math.max(
              8,
              (event.clientY -
                drag.offsetY) /
                scale,
            ),
            maxY,
          ),
          // 직접 한 번이라도 끌면 자동 우측 도킹을 해제합니다.
          docked: false,
        }),
      );
    };

  const handleTypeSummaryPointerUp =
    (event) => {
      const drag =
        typeSummaryDragRef.current;

      if (
        !drag ||
        drag.pointerId !==
          event.pointerId
      ) {
        return;
      }

      typeSummaryDragRef.current =
        null;

      event.currentTarget
        .releasePointerCapture?.(
          event.pointerId,
        );
    };

  const toggleTypeSummaryMinimized =
    () => {
      updateTypeSummaryPanelState(
        (previous) => ({
          ...previous,
          minimized:
            !previous.minimized,
        }),
      );
    };

  const closeTypeSummaryPanel =
    () => {
      setTypeSummaryPanelClosed(
        true,
      );
      typeSummaryDragRef.current =
        null;
    };

  const toggleTargetPanelMinimized =
    () => {
      setTargetPanelMinimized(
        (previous) => {
          const next =
            !previous;

          storeTargetPanelMinimized(
            projectName,
            next,
          );

          return next;
        },
      );
    };

  const toggleTargetLineVisibility =
    (sequence) => {
      const normalizedSequence =
        Number(sequence);

      if (
        !Number.isInteger(
          normalizedSequence,
        ) ||
        normalizedSequence <= 0
      ) {
        return;
      }

      setHiddenTargetSequences(
        (previous) => {
          const next =
            previous.includes(
              normalizedSequence,
            )
              ? previous.filter(
                  (item) =>
                    item !==
                    normalizedSequence,
                )
              : [
                  ...previous,
                  normalizedSequence,
                ].sort(
                  (
                    first,
                    second,
                  ) =>
                    first -
                    second,
                );

          storeHiddenTargetSequences(
            projectName,
            next,
          );

          return next;
        },
      );
    };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* 진도율과 공정 선택을 항상 화면 최상단에 고정합니다. */}
      <Paper
        elevation={1}
        sx={{
          minHeight: 42,
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          columnGap: 1.5,
          px: 1.25,
          py: 0.35,
          bgcolor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 1,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-start',
            gap: 0.5,
            minWidth: 0,
          }}
        >
          {STATUS_OPTIONS.map((status) => (
            <Button
              key={status}
              size="small"
              variant={
                selectedStatusAction === status ? 'contained' : 'outlined'
              }
              onClick={() => setSelectedStatusAction?.(status)}
              sx={{
                minWidth: 68,
                py: 0.25,
                px: 1.1,
                fontSize: '0.75rem',
                boxShadow: 'none',
                ...getStatusButtonStyle(status, selectedStatusAction),
              }}
            >
              {status === '작업완료' ? '완료' : status}
            </Button>
          ))}

          <Box
            sx={{
              width: '1px',
              height: 22,
              mx: 0.25,
              bgcolor: '#cbd5e1',
              flexShrink: 0,
            }}
          />

          <Button
            size="small"
            variant="outlined"
            onClick={selectAllCells}
            disabled={sortedBuildings.length === 0}
            sx={{
              minWidth: 74,
              py: 0.25,
              px: 1,
              color: '#7c3aed',
              borderColor: '#c4b5fd',
              bgcolor: '#ffffff',
              fontSize: '0.72rem',
              boxShadow: 'none',
              '&:hover': {
                borderColor: '#8b5cf6',
                bgcolor: '#f5f3ff',
              },
            }}
          >
            전체선택
          </Button>

          <Button
            size="small"
            variant="outlined"
            onClick={clearSelectedCells}
            disabled={selectionCount === 0}
            sx={{
              minWidth: 88,
              py: 0.25,
              px: 1,
              color: '#64748b',
              borderColor: '#cbd5e1',
              bgcolor: '#ffffff',
              fontSize: '0.72rem',
              boxShadow: 'none',
              '&:hover': {
                borderColor: '#94a3b8',
                bgcolor: '#f8fafc',
              },
            }}
          >
            전체선택해제
          </Button>

          <Button
            size="small"
            variant="outlined"
            disabled={
              progressTargets.length ===
              0
            }
            onClick={(event) =>
              setTargetVisibilityMenuAnchor(
                event.currentTarget,
              )
            }
            sx={{
              minWidth: 126,
              py: 0.1,
              pl: 0.25,
              pr: 0.75,
              color: '#475569',
              borderColor: '#cbd5e1',
              bgcolor:
                hiddenTargetCount > 0
                  ? '#f8fafc'
                  : '#ffffff',
              fontSize: '0.68rem',
              fontWeight: 800,
              boxShadow: 'none',
              '&:hover': {
                borderColor: '#94a3b8',
                bgcolor: '#f8fafc',
              },
            }}
          >
            <Checkbox
              size="small"
              checked={
                hiddenTargetCount > 0
              }
              indeterminate={
                hiddenTargetCount > 0 &&
                hiddenTargetCount <
                  progressTargets.length
              }
              disableRipple
              tabIndex={-1}
              sx={{
                p: 0.3,
                mr: 0.2,
                pointerEvents: 'none',
                '& .MuiSvgIcon-root': {
                  fontSize: 17,
                },
              }}
            />
            방통구간 숨기기
            {hiddenTargetCount > 0
              ? ` (${hiddenTargetCount})`
              : ''}
          </Button>

          <Menu
            anchorEl={
              targetVisibilityMenuAnchor
            }
            open={Boolean(
              targetVisibilityMenuAnchor,
            )}
            onClose={() =>
              setTargetVisibilityMenuAnchor(
                null,
              )
            }
            MenuListProps={{
              dense: true,
            }}
            PaperProps={{
              sx: {
                minWidth: 190,
                maxHeight: 320,
                mt: 0.35,
                border:
                  '1px solid #cbd5e1',
                boxShadow:
                  '0 10px 24px rgba(15, 23, 42, 0.14)',
              },
            }}
          >
            {progressTargets.map(
              (target) => {
                const sequence =
                  Number(
                    target.sequence,
                  );
                const hidden =
                  hiddenTargetSequenceSet.has(
                    sequence,
                  );

                return (
                  <MenuItem
                    key={
                      target.id
                    }
                    onClick={() =>
                      toggleTargetLineVisibility(
                        sequence,
                      )
                    }
                    sx={{
                      minHeight: 34,
                      px: 0.75,
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={
                        hidden
                      }
                      sx={{
                        p: 0.35,
                        mr: 0.45,
                      }}
                    />
                    <Typography
                      sx={{
                        color:
                          '#334155',
                        fontSize:
                          '0.7rem',
                        fontWeight:
                          hidden
                            ? 900
                            : 700,
                      }}
                    >
                      {
                        target.target_name
                      }{' '}
                      숨기기
                    </Typography>
                  </MenuItem>
                );
              },
            )}
          </Menu>
        </Box>

        <Typography
          component="div"
          fontWeight={800}
          sx={{
            color: '#334155',
            fontSize: '0.9rem',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          진도율 : {completedUnits}/{totalUnits}{' '}
          <Box component="span" sx={{ color: '#ef4444' }}>
            {progressPercentage}%
          </Box>
        </Typography>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            minWidth: 0,
          }}
        >
          <Autocomplete
            options={processOptions}
            value={selectedProcess || null}
            onChange={(_, value) => {
              if (value) setSelectedProcess?.(value);
            }}
            disableClearable
            size="small"
            sx={{ width: 180 }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="공정 선택"
                sx={{
                  '& .MuiInputBase-root': {
                    minHeight: 34,
                    py: 0,
                    fontSize: '0.8rem',
                  },
                  '& .MuiInputLabel-root': {
                    fontSize: '0.75rem',
                  },
                }}
              />
            )}
          />
        </Box>
      </Paper>

      {!typeSummaryPanelClosed && (
        <Paper
          data-type-summary-panel="true"
          elevation={8}
          sx={{
            position: 'fixed',
            left:
              typeSummaryPanelState.x,
            top:
              typeSummaryPanelState.y,
            width:
              typeSummaryPanelState.minimized
                ? TYPE_SUMMARY_PANEL_MIN_WIDTH
                : TYPE_SUMMARY_PANEL_WIDTH,
            maxWidth:
              'calc(100vw - 16px)',
            /*
              MUI Autocomplete/Menu 팝업(기본 modal 계층)보다 아래에 둡니다.
              위치가 겹쳐도 공정 선택 드롭다운이 항상 타입현황 위로 표시됩니다.
            */
            zIndex: 1200,
            overflow: 'hidden',
            bgcolor: '#ffffff',
            border:
              '1px solid #cbd5e1',
            borderRadius: 1.5,
            boxShadow:
              '0 12px 30px rgba(15, 23, 42, 0.18)',
            userSelect: 'none',
          }}
        >
          <Box
            onPointerDown={
              handleTypeSummaryPointerDown
            }
            onPointerMove={
              handleTypeSummaryPointerMove
            }
            onPointerUp={
              handleTypeSummaryPointerUp
            }
            onPointerCancel={
              handleTypeSummaryPointerUp
            }
            sx={{
              minHeight: 36,
              px: 0.75,
              display: 'flex',
              alignItems: 'center',
              gap: 0.45,
              bgcolor: '#f8fafc',
              borderBottom:
                typeSummaryPanelState.minimized
                  ? 'none'
                  : '1px solid #e2e8f0',
              cursor: 'move',
              touchAction: 'none',
            }}
          >
            <DragIndicatorRoundedIcon
              sx={{
                color: '#94a3b8',
                fontSize: 18,
                flexShrink: 0,
              }}
            />

            <Box
              sx={{
                minWidth: 0,
                flex: 1,
              }}
            >
              <Typography
                noWrap
                sx={{
                  color: '#0f172a',
                  fontSize: '0.72rem',
                  lineHeight: 1.2,
                  fontWeight: 900,
                }}
              >
                타입별 세대 현황
              </Typography>
              <Typography
                noWrap
                sx={{
                  mt: 0.1,
                  color: '#64748b',
                  fontSize: '0.58rem',
                  lineHeight: 1.1,
                }}
              >
                {selectedProcess ||
                  '공정 미선택'}
              </Typography>
            </Box>

            <IconButton
              size="small"
              aria-label={
                typeSummaryPanelState.minimized
                  ? '타입별 세대 현황 펼치기'
                  : '타입별 세대 현황 최소화'
              }
              onClick={
                toggleTypeSummaryMinimized
              }
              sx={{
                width: 25,
                height: 25,
                color: '#475569',
              }}
            >
              <RemoveRoundedIcon
                sx={{
                  fontSize: 17,
                }}
              />
            </IconButton>

            <IconButton
              size="small"
              aria-label="타입별 세대 현황 닫기"
              onClick={
                closeTypeSummaryPanel
              }
              sx={{
                width: 25,
                height: 25,
                color: '#64748b',
                '&:hover': {
                  color: '#dc2626',
                  bgcolor: '#fef2f2',
                },
              }}
            >
              <CloseRoundedIcon
                sx={{
                  fontSize: 17,
                }}
              />
            </IconButton>
          </Box>

          {!typeSummaryPanelState.minimized && (
            <Box
              sx={{
                px: 0.75,
                py: 0.8,
                maxHeight:
                  'min(390px, calc(100vh - 190px))',
                overflowY: 'auto',
              }}
            >
              {typeHouseholdSummary.rows
                .length === 0 ? (
                <Typography
                  sx={{
                    py: 1.1,
                    textAlign:
                      'center',
                    color:
                      '#94a3b8',
                    fontSize:
                      '0.66rem',
                  }}
                >
                  등록된 세대 타입이
                  없습니다.
                </Typography>
              ) : (
                <Box
                  sx={{
                    display: 'grid',
                    gap: 0.35,
                  }}
                >
                  {typeHouseholdSummary.rows.map(
                    (row) => (
                      <Box
                        key={
                          row.typeName
                        }
                        sx={{
                          minHeight: 23,
                          display:
                            'grid',
                          gridTemplateColumns:
                            '12px minmax(46px, auto) minmax(108px, 1fr)',
                          alignItems:
                            'center',
                          columnGap:
                            0.35,
                        }}
                      >
                        <Box
                          sx={{
                            width: 9,
                            height: 9,
                            borderRadius:
                              '2px',
                            bgcolor:
                              row.color,
                            border:
                              '1px solid rgba(15,23,42,0.14)',
                          }}
                        />

                        <Typography
                          noWrap
                          sx={{
                            color:
                              '#334155',
                            fontSize:
                              '0.68rem',
                            fontWeight:
                              800,
                          }}
                        >
                          {
                            row.typeName
                          }
                        </Typography>

                        <Typography
                          noWrap
                          sx={{
                            color:
                              '#475569',
                            fontSize:
                              '0.66rem',
                            fontWeight:
                              700,
                            textAlign:
                              'right',
                            fontVariantNumeric:
                              'tabular-nums',
                          }}
                        >
                          {
                            row.completedCount
                          }
                          /
                          {
                            row.totalCount
                          }
                          세대 (
                          {
                            row.percentageLabel
                          }
                          )
                        </Typography>
                      </Box>
                    ),
                  )}
                </Box>
              )}

              <Box
                sx={{
                  mt: 0.7,
                  pt: 0.7,
                  borderTop:
                    '1px solid #cbd5e1',
                  display: 'flex',
                  justifyContent:
                    'space-between',
                  gap: 1,
                }}
              >
                <Typography
                  sx={{
                    color: '#0f172a',
                    fontSize:
                      '0.7rem',
                    fontWeight: 900,
                  }}
                >
                  합계
                </Typography>

                <Typography
                  noWrap
                  sx={{
                    color: '#0f172a',
                    fontSize:
                      '0.7rem',
                    fontWeight: 900,
                    fontVariantNumeric:
                      'tabular-nums',
                  }}
                >
                  {
                    typeHouseholdSummary.completedCount
                  }
                  /
                  {
                    typeHouseholdSummary.totalCount
                  }
                  세대 (
                  {
                    typeHouseholdSummary.percentageLabel
                  }
                  )
                </Typography>
              </Box>
            </Box>
          )}
        </Paper>
      )}

      <Paper
        elevation={1}
        sx={{
          mt: 0.5,
          minHeight:
            targetPanelMinimized
              ? 42
              : 58,
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns:
            'minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 0.7,
          px: 1,
          py:
            targetPanelMinimized
              ? 0.35
              : 0.6,
          bgcolor: '#ffffff',
          border: targetLineEditMode
            ? '1px solid #f59e0b'
            : '1px solid #e2e8f0',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            minWidth: 0,
            display: 'grid',
            gridTemplateColumns:
              'auto auto minmax(0, 1fr)',
            alignItems: 'center',
            gap: 0.45,
          }}
        >
          {targetLoading ? (
            <Box
              sx={{
                width: 126,
                px: 0.4,
              }}
            >
              <LinearProgress />
            </Box>
          ) : activeTargetItem ? (
            <>
              <Button
                size="small"
                variant="contained"
                onClick={(event) =>
                  setTargetMenuAnchor(
                    event.currentTarget,
                  )
                }
                sx={{
                  minWidth: 138,
                  maxWidth: 180,
                  px: 0.9,
                  py: 0.35,
                  display: 'grid',
                  gridTemplateColumns:
                    'minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 0.55,
                  bgcolor:
                    activeTargetItem.color,
                  color: '#ffffff',
                  borderColor:
                    activeTargetItem.color,
                  boxShadow: 'none',
                  '&:hover': {
                    bgcolor:
                      activeTargetItem.color,
                    boxShadow: 'none',
                    filter:
                      'brightness(0.94)',
                  },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    minWidth: 0,
                    display: 'flex',
                    flexDirection:
                      'column',
                    alignItems:
                      'flex-start',
                    overflow: 'hidden',
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      width: '100%',
                      overflow: 'hidden',
                      textOverflow:
                        'ellipsis',
                      whiteSpace:
                        'nowrap',
                      textAlign: 'left',
                      fontSize:
                        '0.69rem',
                      fontWeight: 900,
                    }}
                  >
                    {
                      activeTargetItem
                        .target
                        .target_name
                    }
                  </Typography>

                  <Typography
                    component="span"
                    sx={{
                      mt: 0.05,
                      width: '100%',
                      overflow: 'hidden',
                      textOverflow:
                        'ellipsis',
                      whiteSpace:
                        'nowrap',
                      textAlign: 'left',
                      fontSize:
                        '0.55rem',
                      fontWeight: 800,
                      opacity: 0.94,
                    }}
                  >
                    공정{' '}
                    {activeTargetItem
                      .target
                      .process_types
                      .length.toLocaleString()}
                    개
                  </Typography>
                </Box>

                <Typography
                  component="span"
                  sx={{
                    fontSize:
                      '0.62rem',
                    fontWeight: 900,
                  }}
                >
                  ▼
                </Typography>
              </Button>

              <Menu
                anchorEl={
                  targetMenuAnchor
                }
                open={Boolean(
                  targetMenuAnchor,
                )}
                onClose={() =>
                  setTargetMenuAnchor(
                    null,
                  )
                }
                MenuListProps={{
                  dense: true,
                }}
                PaperProps={{
                  sx: {
                    minWidth: 220,
                    maxWidth: 320,
                    mt: 0.4,
                    border:
                      '1px solid #cbd5e1',
                    boxShadow:
                      '0 12px 30px rgba(15, 23, 42, 0.16)',
                  },
                }}
              >
                {targetSummaries.map(
                  ({
                    target,
                    color,
                  }) => {
                    const selected =
                      target.id ===
                      activeTargetId;

                    return (
                      <MenuItem
                        key={target.id}
                        selected={
                          selected
                        }
                        onClick={() => {
                          setActiveTargetId(
                            target.id,
                          );
                          setTargetLineEditMode(
                            false,
                          );
                          setTargetMenuAnchor(
                            null,
                          );
                        }}
                        sx={{
                          minHeight: 44,
                          display: 'grid',
                          gridTemplateColumns:
                            '5px minmax(0, 1fr) auto',
                          gap: 0.7,
                          alignItems:
                            'center',
                        }}
                      >
                        <Box
                          sx={{
                            width: 5,
                            alignSelf:
                              'stretch',
                            borderRadius: 0.5,
                            bgcolor:
                              color,
                          }}
                        />

                        <Box
                          sx={{
                            minWidth: 0,
                          }}
                        >
                          <Typography
                            sx={{
                              overflow:
                                'hidden',
                              textOverflow:
                                'ellipsis',
                              whiteSpace:
                                'nowrap',
                              color:
                                '#0f172a',
                              fontSize:
                                '0.72rem',
                              fontWeight:
                                selected
                                  ? 900
                                  : 800,
                            }}
                          >
                            {
                              target.target_name
                            }
                          </Typography>

                          <Typography
                            sx={{
                              mt: 0.1,
                              color:
                                '#64748b',
                              fontSize:
                                '0.58rem',
                              fontWeight:
                                700,
                            }}
                          >
                            공정{' '}
                            {target.process_types.length.toLocaleString()}
                            개 ·{' '}
                            {formatDday(
                              getDdayValue(
                                target
                                  .target_date,
                              ),
                            )}
                          </Typography>
                        </Box>

                        <Typography
                          sx={{
                            color:
                              selected
                                ? color
                                : '#94a3b8',
                            fontSize:
                              '0.59rem',
                            fontWeight:
                              900,
                          }}
                        >
                          {selected
                            ? '선택됨'
                            : '선택'}
                        </Typography>
                      </MenuItem>
                    );
                  },
                )}
              </Menu>
            </>
          ) : null}

          <Button
            size="small"
            variant="outlined"
            onClick={
              openNewTargetDialog
            }
            disabled={
              !projectName ||
              !selectedProcess ||
              targetSaving
            }
            sx={{
              minWidth:
                progressTargets.length >
                0
                  ? 82
                  : 122,
              flexShrink: 0,
              px: 0.8,
              py: 0.35,
              color: '#7c3aed',
              borderColor: '#c4b5fd',
              bgcolor: '#faf5ff',
              fontSize: '0.65rem',
              fontWeight: 900,
              '&:hover': {
                borderColor:
                  '#8b5cf6',
                bgcolor: '#f3e8ff',
              },
            }}
          >
            {progressTargets.length >
            0
              ? '+ 차수 추가'
              : '1차 방통 설정'}
          </Button>

          <Box
            sx={{
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                'flex-end',
              gap: 0.6,
              overflow: 'hidden',
            }}
          >
            {activeTargetItem ? (
              <>
                <Typography
                  sx={{
                    color: '#334155',
                    fontSize:
                      '0.66rem',
                    fontWeight: 900,
                    whiteSpace:
                      'nowrap',
                  }}
                >
                  {formatDday(
                    getDdayValue(
                      activeTargetItem
                        .target
                        .target_date,
                    ),
                  )}
                </Typography>

                <Typography
                  sx={{
                    px: 0.65,
                    py: 0.12,
                    color:
                      activeTargetItem
                        .color,
                    bgcolor:
                      `${activeTargetItem.color}12`,
                    border:
                      `1px solid ${activeTargetItem.color}40`,
                    borderRadius: 0.75,
                    fontSize:
                      '0.59rem',
                    fontWeight: 900,
                    whiteSpace:
                      'nowrap',
                  }}
                >
                  대상{' '}
                  {activeTargetHouseholdCount.toLocaleString()}
                  세대
                </Typography>

                <Typography
                  sx={{
                    color: '#64748b',
                    fontSize:
                      '0.59rem',
                    fontWeight: 800,
                    whiteSpace:
                      'nowrap',
                  }}
                >
                  목표일{' '}
                  {
                    activeTargetItem
                      .target
                      .target_date
                  }
                </Typography>
              </>
            ) : (
              <Typography
                sx={{
                  color: '#94a3b8',
                  fontSize: '0.64rem',
                  fontWeight: 800,
                  whiteSpace:
                    'nowrap',
                }}
              >
                차수를 추가해주세요.
              </Typography>
            )}
          </Box>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'flex-end',
            gap: 0.4,
            whiteSpace: 'nowrap',
          }}
        >
          <Button
            size="small"
            variant={
              targetLineEditMode
                ? 'contained'
                : 'outlined'
            }
            disabled={
              !activeTargetItem ||
              targetSaving
            }
            onClick={() =>
              setTargetLineEditMode(
                (previous) =>
                  !previous,
              )
            }
            sx={{
              minWidth: 78,
              px: 0.65,
              fontSize: '0.63rem',
              fontWeight: 900,
              color: targetLineEditMode
                ? '#ffffff'
                : '#d97706',
              borderColor:
                '#fbbf24',
              bgcolor: targetLineEditMode
                ? '#f59e0b'
                : '#fffbeb',
              boxShadow: 'none',
              '&:hover': {
                bgcolor: targetLineEditMode
                  ? '#d97706'
                  : '#fef3c7',
                boxShadow: 'none',
              },
            }}
          >
            {targetLineEditMode
              ? '라인설정 종료'
              : '라인 설정'}
          </Button>

          <Button
            size="small"
            variant="outlined"
            disabled={
              !activeTargetItem ||
              targetSaving
            }
            onClick={
              openEditTargetDialog
            }
            sx={{
              minWidth: 66,
              px: 0.65,
              color: '#475569',
              borderColor: '#cbd5e1',
              fontSize: '0.63rem',
              fontWeight: 900,
            }}
          >
            설정수정
          </Button>

          <Button
            ref={
              typeSummaryPanelAnchorRef
            }
            size="small"
            variant="outlined"
            disabled={
              progressTargets.length ===
              0
            }
            onClick={
              toggleTargetPanelMinimized
            }
            sx={{
              minWidth: 58,
              px: 0.65,
              color: '#475569',
              borderColor: '#cbd5e1',
              fontSize: '0.63rem',
              fontWeight: 900,
            }}
          >
            {targetPanelMinimized
              ? '펼치기'
              : '최소화'}
          </Button>
        </Box>

        {activeTargetItem &&
          !targetPanelMinimized && (
          <Box
            sx={{
              gridColumn: '1 / -1',
              minWidth: 0,
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(112px, 1fr))',
              gap: 0.42,
              pt: 0.15,
            }}
          >
            {activeTargetItem
              .processSummaries
              .map(
                ({
                  processType,
                  summary,
                }) => {
                  const isCurrent =
                    processType ===
                    selectedProcess;

                  return (
                    <Button
                      key={
                        processType
                      }
                      size="small"
                      variant={
                        isCurrent
                          ? 'contained'
                          : 'outlined'
                      }
                      onClick={() =>
                        setSelectedProcess?.(
                          processType,
                        )
                      }
                      sx={{
                        minWidth: 0,
                        width: '100%',
                        px: 0.55,
                        py: 0.28,
                        display: 'grid',
                        gridTemplateColumns:
                          'minmax(0, 1fr) auto',
                        gap: 0.45,
                        alignItems:
                          'center',
                        borderColor:
                          activeTargetItem
                            .color,
                        bgcolor:
                          isCurrent
                            ? activeTargetItem
                                .color
                            : '#ffffff',
                        color:
                          isCurrent
                            ? '#ffffff'
                            : activeTargetItem
                                .color,
                        boxShadow: 'none',
                        '&:hover': {
                          borderColor:
                            activeTargetItem
                              .color,
                          bgcolor:
                            isCurrent
                              ? activeTargetItem
                                  .color
                              : `${activeTargetItem.color}12`,
                          boxShadow:
                            'none',
                        },
                      }}
                    >
                      <Typography
                        component="span"
                        sx={{
                          minWidth: 0,
                          overflow:
                            'hidden',
                          textOverflow:
                            'ellipsis',
                          whiteSpace:
                            'nowrap',
                          textAlign:
                            'left',
                          fontSize:
                            '0.61rem',
                          fontWeight: 900,
                        }}
                      >
                        {processType}
                      </Typography>

                      <Typography
                        component="span"
                        sx={{
                          fontSize:
                            '0.58rem',
                          fontWeight: 900,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        잔여{' '}
                        {summary.remainingCount.toLocaleString()}
                      </Typography>
                    </Button>
                  );
                },
              )}
          </Box>
        )}

        {((!targetPanelMinimized &&
          targetLineEditMode) ||
          targetError) && (
          <Box
            sx={{
              gridColumn: '1 / -1',
              minWidth: 0,
            }}
          >
            {!targetPanelMinimized &&
              targetLineEditMode && (
              <Alert
                severity="warning"
                sx={{
                  py: 0,
                  px: 0.8,
                  minHeight: 24,
                  alignItems:
                    'center',
                  '& .MuiAlert-message':
                    {
                      py: 0.25,
                      fontSize:
                        '0.61rem',
                      fontWeight: 800,
                    },
                }}
              >
                라인 설정 중입니다. 각 동의 목표 최종층을 클릭하세요. 같은 층을 다시 누르면 해제됩니다.
              </Alert>
            )}

            {targetError && (
              <Alert
                severity="error"
                sx={{
                  mt:
                    targetLineEditMode
                      ? 0.35
                      : 0,
                  py: 0,
                  px: 0.8,
                  minHeight: 24,
                  '& .MuiAlert-message':
                    {
                      py: 0.25,
                      fontSize:
                        '0.61rem',
                    },
                }}
              >
                {targetError}
              </Alert>
            )}
          </Box>
        )}
      </Paper>

      {/*
        날짜 선택창 전용 공간입니다.
        선택 전에도 같은 높이를 유지하므로 건물들이 아래로 움직이지 않습니다.
      */}
      <Box
        sx={{
          position: 'relative',
          height: 43,
          minHeight: 43,
          flexShrink: 0,
          mt: 0.5,
          mb: 0.5,
        }}
      >
        <Fade in={selectionCount > 0} timeout={180}>
          <Paper
            elevation={1}
            sx={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'fit-content',
              maxWidth: 'calc(100% - 16px)',
              minHeight: 38,
              px: 1.75,
              py: 0.4,
              bgcolor: '#e0f2fe',
              border: '1px solid #7dd3fc',
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              whiteSpace: 'nowrap',
              zIndex: 2,
            }}
          >
            <Typography
              fontWeight={800}
              sx={{ color: '#0369a1', fontSize: '0.8rem' }}
            >
              {actionName} {selectionCount}개 선택
            </Typography>

            <KoreanDatePicker
              size="small"
              value={progressDate}
              maxDate={todayDateKey}
              onChange={(nextDate) => {
                if (
                  !nextDate ||
                  nextDate <=
                    todayDateKey
                ) {
                  setProgressDate?.(
                    nextDate,
                  );
                }
              }}
              sx={{
                width: 145,
                bgcolor: '#ffffff',
              }}
              inputSx={{
                py: 0.5,
                px: 1,
                fontSize: '0.78rem',
              }}
              ariaLabel="공정 완료일"
            />

            <Button
              variant="contained"
              size="small"
              disabled={
                selectionCount ===
                  0 ||
                !progressDate ||
                progressDate >
                  todayDateKey
              }
              onClick={handleSaveProgress}
              sx={{
                minWidth: 62,
                px: 1.6,
                py: 0.4,
                bgcolor: '#0284c7',
                fontSize: '0.75rem',
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: '#0369a1',
                  boxShadow: 'none',
                },
              }}
            >
              저장
            </Button>

            <Button
              variant="outlined"
              size="small"
              onClick={clearSelectedCells}
              sx={{
                minWidth: 62,
                px: 1.6,
                py: 0.4,
                color: '#0369a1',
                borderColor: '#7dd3fc',
                bgcolor: '#ffffff',
                fontSize: '0.75rem',
              }}
            >
              취소
            </Button>
          </Paper>
        </Fade>
      </Box>

      {/* 동은 줄바꿈하지 않고 다중 공종 화면처럼 가로로 이어집니다. */}
      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
          bgcolor: '#f1f5f9',
          borderRadius: 1,
          scrollbarGutter: 'stable',
        }}
      >
        {unitTypeError && (
          <Alert
            severity="warning"
            sx={{
              mb: 0.75,
              py: 0,
              '& .MuiAlert-message': {
                py: 0.5,
                fontSize: '0.72rem',
              },
            }}
          >
            {unitTypeError}
          </Alert>
        )}

        {sortedBuildings.length === 0 ? (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography sx={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              등록된 동 정보가 없습니다.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'nowrap',
              alignItems: 'flex-end',
              gap: 3,
              width: 'max-content',
              minWidth: '100%',
              minHeight: '100%',
              height: 'max-content',
              px: 1,
              pt: 0.25,
              pb: 0.5,
            }}
          >
            {sortedBuildings.map(([name, config]) => (
              <Box
                key={name}
                sx={{
                  flex: '0 0 auto',
                }}
              >
                <BuildingGrid
                  buildingName={name}
                  config={config}
                  selectedCells={selectedCells}
                  onCellClick={
                    targetLineEditMode
                      ? undefined
                      : handleGridCellClick
                  }
                  unitData={unitProgressData}
                  unitTypeData={unitTypeData}
                  typeColorMap={typeColorMap}
                  typeFooterRowSlots={
                    typeFooterRowSlots
                  }
                  onFloorClick={
                    handleEffectiveFloorClick
                  }
                  protectCompleted={
                    protectCompleted
                  }
                  targetEditMode={
                    targetLineEditMode
                  }
                  activeTargetId={
                    activeTargetId
                  }
                  targetLines={
                    targetSummaries
                      .filter(
                        ({ target }) =>
                          targetLineEditMode
                            ? target.id ===
                              activeTargetId
                            : target.process_types.includes(
                                selectedProcess,
                              ) &&
                              !hiddenTargetSequenceSet.has(
                                Number(
                                  target.sequence,
                                ),
                              ),
                      )
                      .map(
                        ({
                          target,
                          color,
                        }) => ({
                          id:
                            target.id,
                          label:
                            target.target_name,
                          color,
                          floor:
                            Number(
                              target
                                .building_floor_targets?.[
                                name
                              ],
                            ) || 0,
                          active:
                            target.id ===
                            activeTargetId,
                        }),
                      )
                      .filter(
                        (line) =>
                          line.floor >
                          0,
                      )
                  }
                />
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Dialog
        open={targetDialogOpen}
        onClose={() => {
          if (!targetSaving) {
            setTargetDialogOpen(
              false,
            );
          }
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle
          sx={{
            pb: 0.75,
            fontSize: '1rem',
            fontWeight: 900,
          }}
        >
          {targetDraft.id
            ? '차수 설정 수정'
            : '차수 목표 추가'}
        </DialogTitle>

        <DialogContent
          dividers
          sx={{
            display: 'grid',
            gap: 1.2,
          }}
        >
          <TextField
            label="차수명"
            size="small"
            value={
              targetDraft
                .target_name
            }
            onChange={(event) =>
              setTargetDraft(
                (previous) => ({
                  ...previous,
                  target_name:
                    event.target
                      .value,
                }),
              )
            }
            placeholder="예: 1차 방통"
          />

          <Box
            sx={{
              p: 1,
              border:
                '1px solid #cbd5e1',
              borderRadius: 1,
              bgcolor: '#f8fafc',
            }}
          >
            <Box
              sx={{
                mb: 0.65,
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  'space-between',
                gap: 0.6,
              }}
            >
              <Typography
                sx={{
                  color: '#334155',
                  fontSize: '0.75rem',
                  fontWeight: 900,
                }}
              >
                적용 공정 선택
              </Typography>

              <Box
                sx={{
                  display: 'flex',
                  gap: 0.35,
                }}
              >
                <Button
                  size="small"
                  variant="text"
                  onClick={() =>
                    setTargetDraft(
                      (previous) => ({
                        ...previous,
                        process_types:
                          [
                            ...processOptions,
                          ],
                      }),
                    )
                  }
                  sx={{
                    minWidth: 48,
                    px: 0.45,
                    fontSize:
                      '0.59rem',
                    fontWeight: 900,
                  }}
                >
                  전체선택
                </Button>

                <Button
                  size="small"
                  variant="text"
                  color="inherit"
                  onClick={() =>
                    setTargetDraft(
                      (previous) => ({
                        ...previous,
                        process_types:
                          [],
                      }),
                    )
                  }
                  sx={{
                    minWidth: 48,
                    px: 0.45,
                    fontSize:
                      '0.59rem',
                    fontWeight: 900,
                  }}
                >
                  선택해제
                </Button>
              </Box>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(3, minmax(0, 1fr))',
                gap: 0.45,
              }}
            >
              {processOptions.map(
                (processType) => {
                  const selected =
                    targetDraft
                      .process_types
                      .includes(
                        processType,
                      );

                  return (
                    <Button
                      key={
                        processType
                      }
                      size="small"
                      variant={
                        selected
                          ? 'contained'
                          : 'outlined'
                      }
                      onClick={() =>
                        setTargetDraft(
                          (previous) => {
                            const current =
                              normalizeProcessTypes(
                                previous
                                  .process_types,
                                processOptions,
                              );

                            const next =
                              current.includes(
                                processType,
                              )
                                ? current.filter(
                                    (item) =>
                                      item !==
                                      processType,
                                  )
                                : [
                                    ...current,
                                    processType,
                                  ];

                            return {
                              ...previous,
                              process_types:
                                normalizeProcessTypes(
                                  next,
                                  processOptions,
                                ),
                            };
                          },
                        )
                      }
                      sx={{
                        minWidth: 0,
                        px: 0.45,
                        py: 0.4,
                        overflow: 'hidden',
                        fontSize: '0.65rem',
                        fontWeight: 900,
                        whiteSpace: 'nowrap',
                        textOverflow:
                          'ellipsis',
                        boxShadow: 'none',
                      }}
                    >
                      {processType}
                    </Button>
                  );
                },
              )}
            </Box>

            <Typography
              sx={{
                mt: 0.65,
                color: '#64748b',
                fontSize: '0.62rem',
                fontWeight: 700,
              }}
            >
              선택{' '}
              {targetDraft.process_types.length.toLocaleString()}
              개 공정 · 목표일과 목표라인은 선택 공정에 공통 적용됩니다.
            </Typography>
          </Box>

          <KoreanDatePicker
            label="목표일"
            size="small"
            value={
              targetDraft
                .target_date
            }
            onChange={(value) =>
              setTargetDraft(
                (previous) => ({
                  ...previous,
                  target_date: value,
                }),
              )
            }
          />

          <Alert
            severity="info"
            sx={{
              '& .MuiAlert-message':
                {
                  fontSize:
                    '0.69rem',
                  lineHeight: 1.55,
                },
            }}
          >
            선택한 모든 공정에 동일한 목표일과 목표라인이 적용됩니다. 저장 후 라인 설정을 누르고 각 동의 층 번호를 클릭하세요.
          </Alert>

          {targetDraft.id && (
            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.68rem',
                lineHeight: 1.55,
              }}
            >
              현재 라인 설정 동수:{' '}
              {Object.keys(
                normalizeFloorTargets(
                  targetDraft
                    .building_floor_targets,
                ),
              ).length.toLocaleString()}
              개 동
            </Typography>
          )}
        </DialogContent>

        <DialogActions
          sx={{
            justifyContent:
              targetDraft.id
                ? 'space-between'
                : 'flex-end',
            px: 2,
            py: 1,
          }}
        >
          {targetDraft.id && (
            <Button
              color="error"
              onClick={
                deleteActiveTarget
              }
              disabled={
                targetSaving
              }
              sx={{
                fontWeight: 900,
              }}
            >
              차수 삭제
            </Button>
          )}

          <Box
            sx={{
              display: 'flex',
              gap: 0.6,
            }}
          >
            <Button
              onClick={() =>
                setTargetDialogOpen(
                  false,
                )
              }
              disabled={
                targetSaving
              }
            >
              취소
            </Button>

            <Button
              variant="contained"
              onClick={
                saveTargetDraft
              }
              disabled={
                targetSaving
              }
              sx={{
                fontWeight: 900,
              }}
            >
              {targetSaving
                ? '저장중'
                : '저장'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
