import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';

const moneyFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 0,
});

const quantityFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 4,
});

const SUPABASE_RPC_PAGE_SIZE = 1000;

const SOURCE_PROGRESS_COLORS = [
  {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
    chipBackgroundColor: '#dbeafe',
    chipColor: '#1d4ed8',
  },
  {
    backgroundColor: '#dc2626',
    borderColor: '#b91c1c',
    chipBackgroundColor: '#fee2e2',
    chipColor: '#b91c1c',
  },
  {
    backgroundColor: '#7c3aed',
    borderColor: '#6d28d9',
    chipBackgroundColor: '#ede9fe',
    chipColor: '#6d28d9',
  },
  {
    backgroundColor: '#059669',
    borderColor: '#047857',
    chipBackgroundColor: '#d1fae5',
    chipColor: '#047857',
  },
];

const getSourceProgressColor = (sourceIndex) =>
  SOURCE_PROGRESS_COLORS[
    Math.max(0, sourceIndex) % SOURCE_PROGRESS_COLORS.length
  ];

const toNumber = (value) => {
  if (value === '' || value === null || value === undefined) return 0;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : 0;
};

const formatMoney = (value) => moneyFormatter.format(toNumber(value));
const formatQuantity = (value) => quantityFormatter.format(toNumber(value));

const createPhysicalCellKey = (building, unit) =>
  JSON.stringify([String(building || ''), String(unit || '')]);

const createProgressCellKey = (sourceProcessType, building, unit) =>
  JSON.stringify([
    String(sourceProcessType || ''),
    String(building || ''),
    String(unit || ''),
  ]);

const splitProgressCellKey = (cellKey) => {
  try {
    const [sourceProcessType, building, unit] = JSON.parse(
      String(cellKey || '[]'),
    );
    return {
      sourceProcessType: String(sourceProcessType || ''),
      building: String(building || ''),
      unit: String(unit || ''),
    };
  } catch (_error) {
    return { sourceProcessType: '', building: '', unit: '' };
  }
};

const resolveFloor = (unit) => {
  const text = String(unit || '');
  if (text.length <= 2) return 0;
  return Number(text.slice(0, -2)) || 0;
};

const resolveLine = (unit) => {
  const text = String(unit || '');
  if (text.length <= 2) return text;
  return text.slice(-2);
};

const normalizeStructureRow = (row) => ({
  building: String(row?.building || ''),
  unit: String(row?.unit || ''),
  sourceProcessType: String(row?.source_process_type || ''),
  sourceSortOrder: toNumber(row?.source_sort_order),
  isCostBasis:
    row?.is_cost_basis === true || toNumber(row?.source_sort_order) === 1,
  actualCompletionDate: row?.actual_completion_date
    ? String(row.actual_completion_date).slice(0, 10)
    : '',
  actualState: String(row?.actual_state || 'unworked'),
  forecastSelected: row?.forecast_selected === true,
  forecastEligible: row?.forecast_eligible !== false,
  quantity: toNumber(row?.quantity),
  confirmationRound: toNumber(row?.confirmation_round),
  unitName: String(row?.unit_name || ''),
  appliedUnitPrice: toNumber(row?.applied_unit_price),
  amount: toNumber(row?.amount),
  calculationMissing: row?.calculation_missing === true,
});

const getCellVisual = (row, isForecastSelected, sourceIndex) => {
  if (isForecastSelected && row.forecastEligible) {
    return {
      backgroundColor: '#f59e0b',
      color: '#ffffff',
      borderColor: '#d97706',
      label: '월말 예상세대',
    };
  }

  if (row.actualState === 'in_period') {
    const sourceColor = getSourceProgressColor(sourceIndex);
    return {
      backgroundColor: sourceColor.backgroundColor,
      color: '#ffffff',
      borderColor: sourceColor.borderColor,
      label: `조회기간 작업완료 · ${row.sourceProcessType}`,
    };
  }

  if (row.actualState === 'outside_period') {
    return {
      backgroundColor: '#64748b',
      color: '#ffffff',
      borderColor: '#475569',
      label: '조회기간 외 작업완료',
    };
  }

  return {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    borderColor: '#cbd5e1',
    label: '미작업',
  };
};

function SummaryBox({ label, value, helper, color = '#0f172a' }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        minWidth: 180,
        flex: '1 1 200px',
        px: 1.25,
        py: 0.9,
        borderColor: '#cbd5e1',
        boxShadow: 'none',
      }}
    >
      <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b' }}>
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.2,
          fontSize: '1.05rem',
          fontWeight: 900,
          color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Typography>
      <Typography sx={{ mt: 0.15, fontSize: '0.62rem', color: '#94a3b8' }}>
        {helper}
      </Typography>
    </Paper>
  );
}

function LegendItem({ backgroundColor, borderColor, label, color = '#ffffff' }) {
  return (
    <Stack direction="row" spacing={0.55} alignItems="center">
      <Box
        sx={{
          width: 18,
          height: 18,
          borderRadius: 0.7,
          bgcolor: backgroundColor,
          border: `1px solid ${borderColor}`,
          color,
        }}
      />
      <Typography sx={{ fontSize: '0.68rem', color: '#475569' }}>
        {label}
      </Typography>
    </Stack>
  );
}

function MultiColorLegendItem({ colors, label }) {
  const safeColors = colors.length > 0 ? colors : ['#2563eb'];
  const segmentSize = 100 / safeColors.length;
  const gradientStops = safeColors
    .flatMap((color, index) => [
      `${color} ${index * segmentSize}%`,
      `${color} ${(index + 1) * segmentSize}%`,
    ])
    .join(', ');

  return (
    <Stack direction="row" spacing={0.55} alignItems="center">
      <Box
        sx={{
          width: 18,
          height: 18,
          borderRadius: 0.7,
          background: `linear-gradient(90deg, ${gradientStops})`,
          border: '1px solid #94a3b8',
        }}
      />
      <Typography sx={{ fontSize: '0.68rem', color: '#475569' }}>
        {label}
      </Typography>
    </Stack>
  );
}

const fetchAllLaborPeriodStructureRows = async ({
  projectName,
  processType,
  startMonth,
  endMonth,
}) => {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .rpc('get_labor_period_structure', {
        p_project_name: projectName,
        p_process_type: processType,
        p_start_month: `${startMonth}-01`,
        p_end_month: `${endMonth}-01`,
      })
      .order('source_process_type', { ascending: true })
      .order('building', { ascending: true })
      .order('unit', { ascending: true })
      .range(from, from + SUPABASE_RPC_PAGE_SIZE - 1);

    if (error) throw error;

    const pageRows = data || [];
    rows.push(...pageRows);

    if (pageRows.length < SUPABASE_RPC_PAGE_SIZE) break;
    from += SUPABASE_RPC_PAGE_SIZE;
  }

  const uniqueRows = new Map();
  rows.forEach((row) => {
    const sourceProcessType = String(
      row?.source_process_type || '',
    ).trim();
    const building = String(row?.building || '').trim();
    const unit = String(row?.unit || '').trim();
    if (!sourceProcessType || !building || !unit) return;
    uniqueRows.set(
      createProgressCellKey(sourceProcessType, building, unit),
      row,
    );
  });

  return Array.from(uniqueRows.values());
};

export default function LaborPeriodStructureDialog({
  open,
  onClose,
  projectName = '',
  processOptions = [],
  progressProcessOptions = [],
  progressMappings = {},
  initialProcess = '',
  startMonth = '',
  endMonth = '',
  validUnits = [],
  buildingConfigs = {},
  onProcessChange,
  onSaved,
}) {
  const [processType, setProcessType] = useState('');
  const [structureRows, setStructureRows] = useState([]);
  const [persistedForecastCells, setPersistedForecastCells] = useState(
    () => new Set(),
  );
  const [forecastCells, setForecastCells] = useState(() => new Set());
  const [editingForecast, setEditingForecast] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const structureViewportRef = useRef(null);
  const [structureViewportHeight, setStructureViewportHeight] = useState(0);

  useEffect(() => {
    if (!open) return;

    const nextProcess =
      initialProcess && processOptions.includes(initialProcess)
        ? initialProcess
        : processOptions[0] || '';

    setProcessType(nextProcess);
    setEditingForecast(false);
    setDirty(false);
    setErrorMessage('');
    setSuccessMessage('');
  }, [initialProcess, open, processOptions]);

  const loadStructure = useCallback(async () => {
    if (!open || !projectName || !processType || !startMonth || !endMonth) {
      setStructureRows([]);
      setPersistedForecastCells(new Set());
      setForecastCells(new Set());
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const data = await fetchAllLaborPeriodStructureRows({
        projectName,
        processType,
        startMonth,
        endMonth,
      });

      const nextRows = data.map(normalizeStructureRow);
      const nextForecastCells = new Set(
        nextRows
          .filter((row) => row.forecastSelected && row.forecastEligible)
          .map((row) =>
            createProgressCellKey(
              row.sourceProcessType,
              row.building,
              row.unit,
            ),
          ),
      );

      setStructureRows(nextRows);
      setPersistedForecastCells(new Set(nextForecastCells));
      setForecastCells(new Set(nextForecastCells));
      setEditingForecast(false);
      setDirty(false);
    } catch (error) {
      console.error('노임 골구도 조회 오류:', error);
      setErrorMessage(
        `골구도를 불러오지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setLoading(false);
    }
  }, [endMonth, open, processType, projectName, startMonth]);

  useEffect(() => {
    loadStructure();
  }, [loadStructure]);

  const structureByCell = useMemo(
    () =>
      structureRows.reduce((result, row) => {
        result.set(
          createProgressCellKey(
            row.sourceProcessType,
            row.building,
            row.unit,
          ),
          row,
        );
        return result;
      }, new Map()),
    [structureRows],
  );

  const sourceProcessTypes = useMemo(() => {
    const loadedSources = Array.from(
      new Set(
        structureRows
          .map((row) => String(row.sourceProcessType || '').trim())
          .filter(Boolean),
      ),
    );

    if (loadedSources.length > 0) {
      const preferredSourceOrder =
        progressMappings?.[processType]?.length > 0
          ? progressMappings[processType]
          : progressProcessOptions;
      const optionOrder = new Map(
        (preferredSourceOrder || []).map((option, index) => [
          option,
          index,
        ]),
      );
      return loadedSources.sort((first, second) => {
        const firstOrder = optionOrder.has(first)
          ? optionOrder.get(first)
          : Number.MAX_SAFE_INTEGER;
        const secondOrder = optionOrder.has(second)
          ? optionOrder.get(second)
          : Number.MAX_SAFE_INTEGER;
        if (firstOrder !== secondOrder) return firstOrder - secondOrder;
        return first.localeCompare(second, 'ko', { numeric: true });
      });
    }

    const explicitMappings = progressMappings?.[processType] || [];
    if (explicitMappings.length > 0) return explicitMappings;

    return progressProcessOptions.includes(processType)
      ? [processType]
      : processType
        ? [processType]
        : [];
  }, [
    processType,
    progressMappings,
    progressProcessOptions,
    structureRows,
  ]);

  const visualRows = useMemo(() => {
    const knownKeys = new Set();
    const rows = [];

    sourceProcessTypes.forEach((sourceProcessType) => {
      (validUnits || []).forEach((unitRow) => {
        const cellKey = createProgressCellKey(
          sourceProcessType,
          unitRow.building,
          unitRow.unit,
        );
        const structureRow = structureByCell.get(cellKey);
        knownKeys.add(cellKey);

        rows.push({
          cellKey,
          physicalCellKey: createPhysicalCellKey(
            unitRow.building,
            unitRow.unit,
          ),
          building: String(unitRow.building || ''),
          unit: String(unitRow.unit || ''),
          floor: toNumber(unitRow.floor) || resolveFloor(unitRow.unit),
          unitType: String(unitRow.unitType || '미지정'),
          sourceProcessType,
          sourceSortOrder:
            structureRow?.sourceSortOrder ||
            sourceProcessTypes.indexOf(sourceProcessType) + 1,
          isCostBasis:
            structureRow?.sourceSortOrder > 0
              ? structureRow.isCostBasis
              : sourceProcessTypes.indexOf(sourceProcessType) === 0,
          actualCompletionDate: structureRow?.actualCompletionDate || '',
          actualState: structureRow?.actualState || 'unworked',
          forecastEligible: structureRow?.forecastEligible !== false,
          quantity: structureRow?.quantity || 0,
          confirmationRound: structureRow?.confirmationRound || 0,
          unitName: structureRow?.unitName || '',
          appliedUnitPrice: structureRow?.appliedUnitPrice || 0,
          amount: structureRow?.amount || 0,
          calculationMissing: structureRow
            ? structureRow.calculationMissing === true
            : true,
        });
      });
    });

    structureRows.forEach((row) => {
      const cellKey = createProgressCellKey(
        row.sourceProcessType,
        row.building,
        row.unit,
      );
      if (knownKeys.has(cellKey)) return;

      rows.push({
        cellKey,
        physicalCellKey: createPhysicalCellKey(row.building, row.unit),
        building: row.building,
        unit: row.unit,
        floor: resolveFloor(row.unit),
        unitType: '미지정',
        sourceProcessType: row.sourceProcessType,
        sourceSortOrder: row.sourceSortOrder,
        isCostBasis: row.isCostBasis,
        actualCompletionDate: row.actualCompletionDate,
        actualState: row.actualState,
        forecastEligible: row.forecastEligible,
        quantity: row.quantity,
        confirmationRound: row.confirmationRound,
        unitName: row.unitName,
        appliedUnitPrice: row.appliedUnitPrice,
        amount: row.amount,
        calculationMissing: row.calculationMissing,
      });
    });

    return rows.sort((first, second) => {
      const sourceCompare = sourceProcessTypes.indexOf(first.sourceProcessType) -
        sourceProcessTypes.indexOf(second.sourceProcessType);
      if (sourceCompare !== 0) return sourceCompare;
      const buildingCompare = first.building.localeCompare(
        second.building,
        'ko',
        { numeric: true },
      );
      if (buildingCompare !== 0) return buildingCompare;
      return Number(first.unit) - Number(second.unit);
    });
  }, [sourceProcessTypes, structureByCell, structureRows, validUnits]);

  const sharedFloorFrame = useMemo(() => {
    const configuredFloorCounts = Object.values(buildingConfigs || {})
      .map((config) => Math.max(0, Math.round(toNumber(config?.floors))))
      .filter((floorCount) => floorCount > 0);
    const rowFloors = visualRows
      .map((row) => Math.max(0, Math.round(toNumber(row?.floor))))
      .filter((floor) => floor > 0);
    const maximumFloor = Math.max(1, ...configuredFloorCounts, ...rowFloors);

    return {
      floors: Array.from(
        { length: maximumFloor },
        (_unused, index) => maximumFloor - index,
      ),
    };
  }, [buildingConfigs, visualRows]);

  useEffect(() => {
    if (!open) return undefined;

    const viewport = structureViewportRef.current;
    if (!viewport) return undefined;

    let animationFrame = 0;
    const updateViewportHeight = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const nextHeight = Math.max(0, viewport.clientHeight || 0);
        setStructureViewportHeight((previous) =>
          Math.abs(previous - nextHeight) >= 0.5 ? nextHeight : previous,
        );
      });
    };

    updateViewportHeight();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateViewportHeight)
        : null;

    resizeObserver?.observe(viewport);
    window.addEventListener('resize', updateViewportHeight);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateViewportHeight);
    };
  }, [open]);

  const sharedFloorCellHeight = useMemo(() => {
    const rowCount = Math.max(sharedFloorFrame.floors.length + 1, 1);

    if (structureViewportHeight <= 0) return 14;

    // 골구도 패널 안에서 동 제목, 안쪽 여백, 가로 스크롤바, 행 사이 간격을
    // 먼저 제외한 뒤 남는 높이를 전체 층 + 타입 행에 동일하게 배분한다.
    const outerPadding = 16;
    const buildingHeaderHeight = 31;
    const buildingBodyPadding = 10;
    const horizontalScrollbarSpace = 18;
    const safetySpace = 10;
    const rowGapTotal = Math.max(rowCount - 1, 0);
    const usableHeight =
      structureViewportHeight -
      outerPadding -
      buildingHeaderHeight -
      buildingBodyPadding -
      horizontalScrollbarSpace -
      safetySpace -
      rowGapTotal;

    const calculatedHeight = usableHeight / rowCount;
    const boundedHeight = Math.max(8.5, Math.min(18, calculatedHeight));

    return Math.floor(boundedHeight * 100) / 100;
  }, [sharedFloorFrame.floors.length, structureViewportHeight]);

  const buildingGroups = useMemo(() => {
    const rowsByBuilding = visualRows.reduce((result, row) => {
      if (!result.has(row.building)) result.set(row.building, []);
      result.get(row.building).push(row);
      return result;
    }, new Map());

    const buildingNames = Array.from(
      new Set([
        ...Object.keys(buildingConfigs || {}),
        ...Array.from(rowsByBuilding.keys()),
      ]),
    ).sort((first, second) =>
      String(first).localeCompare(String(second), 'ko', { numeric: true }),
    );

    return buildingNames.map((building) => {
      const rows = rowsByBuilding.get(building) || [];
      const config = buildingConfigs?.[building] || {};
      const configuredUnitsPerFloor = Math.max(
        0,
        Math.round(toNumber(config.unitsPerFloor)),
      );
      const configuredFloorCount = Math.max(
        0,
        Math.round(toNumber(config.floors)),
      );

      const lineKeys =
        configuredUnitsPerFloor > 0
          ? Array.from(
              { length: configuredUnitsPerFloor },
              (_, index) => String(index + 1).padStart(2, '0'),
            )
          : Array.from(
              new Set(rows.map((row) => resolveLine(row.unit))),
            ).sort((first, second) =>
              String(first).localeCompare(String(second), 'ko', {
                numeric: true,
              }),
            );

      const rowMaximumFloor = Math.max(
        0,
        ...rows.map((row) => Math.max(0, Math.round(toNumber(row.floor)))),
      );
      const buildingMaximumFloor =
        configuredFloorCount > 0 ? configuredFloorCount : rowMaximumFloor;
      const floors = sharedFloorFrame.floors;

      const rowByFloorLine = rows.reduce((result, row) => {
        result.set(`${row.floor}-${resolveLine(row.unit)}-${row.sourceProcessType}`, row);
        return result;
      }, new Map());

      const unitTypeByLine = lineKeys.reduce((result, lineKey) => {
        const types = Array.from(
          new Set(
            rows
              .filter((row) => resolveLine(row.unit) === lineKey)
              .map((row) => String(row.unitType || '미지정'))
              .filter((unitType) => unitType && unitType !== '미지정'),
          ),
        );
        result.set(lineKey, types.length > 0 ? types.join('/') : '-');
        return result;
      }, new Map());

      const periodCompletedUnits = rows.filter(
        (row) => row.actualState === 'in_period',
      ).length;
      const completedUnits = rows.filter(
        (row) => row.actualState !== 'unworked',
      ).length;
      const forecastUnits = rows.filter(
        (row) => forecastCells.has(row.cellKey),
      ).length;
      const physicalUnitCount = new Set(
        rows.map((row) => row.physicalCellKey),
      ).size;

      return {
        building,
        rows,
        lineKeys,
        floors,
        buildingMaximumFloor,
        rowByFloorLine,
        unitTypeByLine,
        totalUnits: physicalUnitCount * Math.max(sourceProcessTypes.length, 1),
        completedUnits,
        periodCompletedUnits,
        forecastUnits,
        cardWidth: 42 + Math.max(lineKeys.length, 1) * 42 + 16,
      };
    });
  }, [
    buildingConfigs,
    forecastCells,
    sharedFloorFrame.floors,
    sourceProcessTypes,
    visualRows,
  ]);

  const summary = useMemo(() => {
    const periodCompletedRows = visualRows.filter(
      (row) => row.isCostBasis && row.actualState === 'in_period',
    );
    const selectedForecastRows = visualRows.filter(
      (row) =>
        row.isCostBasis &&
        row.forecastEligible &&
        forecastCells.has(row.cellKey),
    );

    const actualAmount = periodCompletedRows.reduce(
      (total, row) => total + row.amount,
      0,
    );
    const forecastAmount = selectedForecastRows.reduce(
      (total, row) => total + row.amount,
      0,
    );
    const forecastQuantity = selectedForecastRows.reduce(
      (total, row) => total + row.quantity,
      0,
    );
    const missingCalculationUnits = [
      ...periodCompletedRows,
      ...selectedForecastRows,
    ].filter(
      (row, index, rows) =>
        row.calculationMissing &&
        rows.findIndex((candidate) => candidate.cellKey === row.cellKey) ===
          index,
    ).length;

    return {
      actualUnits: periodCompletedRows.length,
      actualAmount,
      forecastUnits: selectedForecastRows.length,
      forecastQuantity,
      forecastAmount,
      expectedAmount: actualAmount + forecastAmount,
      missingCalculationUnits,
    };
  }, [forecastCells, visualRows]);

  const handleProcessChange = (event) => {
    if (dirty || saving) return;

    const nextProcess = event.target.value;
    setProcessType(nextProcess);
    setEditingForecast(false);
    setErrorMessage('');
    setSuccessMessage('');
    onProcessChange?.(nextProcess);
  };

  const handleCellClick = (row) => {
    if (!editingForecast || saving || !row?.forecastEligible) return;

    setForecastCells((previous) => {
      const next = new Set(previous);
      if (next.has(row.cellKey)) next.delete(row.cellKey);
      else next.add(row.cellKey);
      return next;
    });
    setDirty(true);
    setSuccessMessage('');
  };

  const cancelForecastEditing = () => {
    setForecastCells(new Set(persistedForecastCells));
    setEditingForecast(false);
    setDirty(false);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const saveForecast = async () => {
    if (!projectName || !processType || !endMonth) return;

    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const rows = Array.from(forecastCells).map((cellKey) =>
        splitProgressCellKey(cellKey),
      );

      const { data, error } = await supabase.rpc(
        'save_labor_completion_forecasts',
        {
          p_project_name: projectName,
          p_process_type: processType,
          p_forecast_month: `${endMonth}-01`,
          p_rows: rows,
        },
      );

      if (error) throw error;

      const savedCount = toNumber(data?.saved_count ?? rows.length);
      const successText = `${endMonth} 월말 예상세대 ${savedCount.toLocaleString()}건을 저장했습니다.`;

      setPersistedForecastCells(new Set(forecastCells));
      setEditingForecast(false);
      setDirty(false);
      onSaved?.({
        processType,
        forecastMonth: endMonth,
        savedCount,
        forecastAmount: summary.forecastAmount,
        expectedAmount: summary.expectedAmount,
      });
      await loadStructure();
      setSuccessMessage(successText);
    } catch (error) {
      console.error('노임 예상세대 저장 오류:', error);
      setErrorMessage(
        `예상세대를 저장하지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (saving) return;

    if (dirty) {
      setErrorMessage(
        '저장하지 않은 예상세대 변경이 있습니다. 저장하거나 취소한 뒤 닫아주세요.',
      );
      return;
    }

    onClose?.();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          width: 'min(1500px, 97vw)',
          height: '92vh',
          maxHeight: '92vh',
          m: 1,
        },
      }}
    >
      <DialogTitle sx={{ px: 1.5, py: 1.05 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', md: 'center' }}
        >
          <Box>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 900 }}>
              예상노임조회
            </Typography>
            <Typography sx={{ mt: 0.15, fontSize: '0.66rem', color: '#64748b' }}>
              {projectName} · {startMonth} ~ {endMonth} 작업완료와 {endMonth} 월말 예상세대
              {sourceProcessTypes.length > 0
                ? ` · 연결 공정진척 ${sourceProcessTypes.join(', ')}`
                : ''}
            </Typography>
          </Box>

          <Box sx={{ flex: 1 }} />

          <TextField
            select
            size="small"
            label="공정"
            value={processType}
            onChange={handleProcessChange}
            disabled={loading || saving || dirty}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 180 }}
          >
            {processOptions.map((process) => (
              <MenuItem key={process} value={process}>
                {process}
              </MenuItem>
            ))}
          </TextField>

          {!editingForecast ? (
            <Button
              variant="contained"
              onClick={() => {
                setEditingForecast(true);
                setErrorMessage('');
                setSuccessMessage('');
              }}
              disabled={loading || saving || !processType}
              sx={{ whiteSpace: 'nowrap' }}
            >
              예상세대 조정
            </Button>
          ) : (
            <>
              <Button
                variant="outlined"
                color="warning"
                onClick={() => {
                  setForecastCells(new Set());
                  setDirty(true);
                  setSuccessMessage('');
                }}
                disabled={saving}
                sx={{ whiteSpace: 'nowrap' }}
              >
                예상세대 초기화
              </Button>
              <Button
                variant="outlined"
                onClick={cancelForecastEditing}
                disabled={saving}
              >
                취소
              </Button>
              <Button
                variant="contained"
                onClick={saveForecast}
                disabled={saving || !dirty}
              >
                {saving ? '저장 중...' : '예상세대 저장'}
              </Button>
            </>
          )}
        </Stack>
      </DialogTitle>

      <Divider />

      <DialogContent
        sx={{
          p: 1.2,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          minHeight: 0,
          bgcolor: '#f8fafc',
          overflow: 'hidden',
        }}
      >
        {(errorMessage || successMessage) && (
          <Alert severity={errorMessage ? 'error' : 'success'}>
            {errorMessage || successMessage}
          </Alert>
        )}

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <SummaryBox
            label={`${startMonth} ~ ${endMonth} 실제 완료`}
            value={`${summary.actualUnits.toLocaleString()}건 · ${formatMoney(
              summary.actualAmount,
            )}원`}
            helper="첫 번째 연결 공정진척 완료건만 금액 반영"
            color="#1d4ed8"
          />
          <SummaryBox
            label={`${endMonth} 월말 예상 추가`}
            value={`${summary.forecastUnits.toLocaleString()}건 · ${formatMoney(
              summary.forecastAmount,
            )}원`}
            helper={`첫 번째 공정 선택 물량 ${formatQuantity(
              summary.forecastQuantity,
            )}`}
            color="#b45309"
          />
          <SummaryBox
            label="기간 + 월말 예상 노임"
            value={`${formatMoney(summary.expectedAmount)}원`}
            helper="첫 번째 공정 실제 완료금액 + 예상세대 금액"
            color="#0f766e"
          />
          <SummaryBox
            label="계산 누락"
            value={`${summary.missingCalculationUnits.toLocaleString()}건`}
            helper="첫 번째 금액기준 공정의 물량 또는 단가 누락"
            color={summary.missingCalculationUnits > 0 ? '#b91c1c' : '#15803d'}
          />
        </Stack>

        <Paper
          variant="outlined"
          sx={{
            px: 1.1,
            py: 0.75,
            borderColor: '#cbd5e1',
            boxShadow: 'none',
          }}
        >
          <Stack direction="row" spacing={1.6} useFlexGap flexWrap="wrap">
            {sourceProcessTypes.map((sourceProcessType, index) => {
              const sourceColor = getSourceProgressColor(index);
              return (
                <Chip
                  key={sourceProcessType}
                  size="small"
                  label={`${index + 1}. ${sourceProcessType}${
                    index === 0 ? ' · 금액기준' : ' · 진척참고'
                  }`}
                  title={`세대박스 안에서 ${index + 1}번째 구간은 ${sourceProcessType} 공정진척입니다. ${
                    index === 0
                      ? '이 공정만 노임금액 계산에 적용됩니다.'
                      : '이 공정은 진척 확인용이며 노임금액에는 적용되지 않습니다.'
                  }`}
                  sx={{
                    height: 22,
                    fontSize: '0.62rem',
                    fontWeight: 900,
                    bgcolor: sourceColor.chipBackgroundColor,
                    color: sourceColor.chipColor,
                  }}
                />
              );
            })}
            <MultiColorLegendItem
              colors={sourceProcessTypes.map(
                (_sourceProcessType, index) =>
                  getSourceProgressColor(index).backgroundColor,
              )}
              label="해당기간 작업완료 · 공정별 색상"
            />
            <LegendItem
              backgroundColor="#64748b"
              borderColor="#475569"
              label="해당기간 외 작업완료"
            />
            <LegendItem
              backgroundColor="#f1f5f9"
              borderColor="#cbd5e1"
              color="#475569"
              label="미작업"
            />
            <LegendItem
              backgroundColor="#f59e0b"
              borderColor="#d97706"
              label={`${endMonth} 월말 예상세대`}
            />
            {sourceProcessTypes.length > 1 && (
              <Typography sx={{ fontSize: '0.66rem', color: '#475569' }}>
                세대박스는 왼쪽부터 위 번호 순서대로 나뉩니다. 첫 번째 공정은 파란색, 두 번째 공정은 빨간색으로 표시하며 두 공정이 모두 완료되면 한 박스에 두 색이 함께 표시됩니다.
              </Typography>
            )}
            <Typography sx={{ fontSize: '0.66rem', color: '#64748b' }}>
              {editingForecast
                ? '미작업 세대를 클릭해 월말 예상세대를 추가·해제합니다. 실제 공정진척 완료자료는 변경하지 않습니다.'
                : '예상세대 조정을 누르면 미작업 세대를 선택할 수 있습니다.'}
            </Typography>
          </Stack>
        </Paper>

        <Paper
          ref={structureViewportRef}
          variant="outlined"
          sx={{
            minHeight: 0,
            flex: 1,
            overflowX: 'auto',
            overflowY: 'hidden',
            borderColor: '#cbd5e1',
            boxShadow: 'none',
            bgcolor: '#ffffff',
          }}
        >
          {loading ? (
            <Stack
              spacing={1}
              alignItems="center"
              justifyContent="center"
              sx={{ minHeight: 320 }}
            >
              <CircularProgress size={30} />
              <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>
                공정진척과 세대별 물량을 연결하는 중입니다.
              </Typography>
            </Stack>
          ) : buildingGroups.length === 0 ? (
            <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 320 }}>
              <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>
                표시할 동·세대 설정이 없습니다.
              </Typography>
            </Stack>
          ) : (
            <Box sx={{ p: 1, minWidth: 'max-content' }}>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'nowrap',
                  gap: 1,
                  alignItems: 'flex-end',
                }}
              >
                {buildingGroups.map((group) => (
                  <Paper
                    key={group.building}
                    variant="outlined"
                    sx={{
                      width: group.cardWidth,
                      flex: '0 0 auto',
                      alignSelf: 'stretch',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      borderColor: '#94a3b8',
                      boxShadow: 'none',
                      bgcolor: '#ffffff',
                    }}
                  >
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      spacing={0.6}
                      sx={{
                        minHeight: 28,
                        px: 0.75,
                        py: 0.35,
                        bgcolor: '#f1f5f9',
                        borderBottom: '1px solid #cbd5e1',
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 900,
                          color: '#0f172a',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {group.building}
                      </Typography>
                      <Typography
                        title={`전체 작업완료 ${group.completedUnits}건 · 조회기간 ${group.periodCompletedUnits}건 · 월말 예상 ${group.forecastUnits}건`}
                        sx={{
                          fontSize: '0.53rem',
                          fontWeight: 800,
                          color: '#64748b',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        완료 {group.completedUnits}/{group.totalUnits}
                        {group.forecastUnits > 0
                          ? ` · 예상 ${group.forecastUnits}`
                          : ''}
                      </Typography>
                    </Stack>

                    <Box
                      sx={{
                        p: 0.55,
                        mt: 'auto',
                      }}
                    >
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: `34px repeat(${Math.max(
                            group.lineKeys.length,
                            1,
                          )}, 40px)`,
                          gap: '1px',
                          alignItems: 'stretch',
                          '& > *': {
                            boxSizing: 'border-box',
                          },
                        }}
                      >
                        {group.floors.flatMap((floor) => {
                          const isUpperSpacer =
                            floor > group.buildingMaximumFloor;
                          const items = [
                            <Box
                              key={`${group.building}-${floor}-floor`}
                              aria-hidden={isUpperSpacer}
                              sx={{
                                height: sharedFloorCellHeight,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: isUpperSpacer
                                  ? '1px solid transparent'
                                  : '1px solid #cbd5e1',
                                borderRadius: 0.3,
                                bgcolor: isUpperSpacer
                                  ? 'transparent'
                                  : '#e2e8f0',
                                color: '#334155',
                                fontSize: '0.5rem',
                                fontWeight: 900,
                                lineHeight: 1,
                              }}
                            >
                              {isUpperSpacer ? '' : `${floor}층`}
                            </Box>,
                          ];

                          group.lineKeys.forEach((lineKey) => {
                            if (isUpperSpacer) {
                              items.push(
                                <Box
                                  key={`${group.building}-${floor}-${lineKey}-spacer`}
                                  aria-hidden="true"
                                  sx={{
                                    height: sharedFloorCellHeight,
                                    border: '1px solid transparent',
                                  }}
                                />,
                              );
                              return;
                            }

                            const sourceRows = sourceProcessTypes
                              .map((sourceProcessType) =>
                                group.rowByFloorLine.get(
                                  `${floor}-${lineKey}-${sourceProcessType}`,
                                ),
                              )
                              .filter(Boolean);

                            if (sourceRows.length === 0) {
                              items.push(
                                <Box
                                  key={`${group.building}-${floor}-${lineKey}-empty`}
                                  title={`${group.building} ${floor}${lineKey}호 · 세대 없음/필로티`}
                                  sx={{
                                    height: sharedFloorCellHeight,
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 0.3,
                                    background:
                                      'repeating-linear-gradient(135deg, #f8fafc 0px, #f8fafc 4px, #e2e8f0 4px, #e2e8f0 5px)',
                                  }}
                                />,
                              );
                              return;
                            }

                            const unitLabel = sourceRows[0]?.unit || `${floor}${lineKey}`;
                            const allUnworked = sourceRows.every(
                              (row) =>
                                row.actualState === 'unworked' &&
                                !forecastCells.has(row.cellKey),
                            );

                            items.push(
                              <Box
                                key={`${group.building}-${floor}-${lineKey}-multi`}
                                sx={{
                                  position: 'relative',
                                  width: 40,
                                  height: sharedFloorCellHeight,
                                  minHeight: sharedFloorCellHeight,
                                  display: 'flex',
                                  overflow: 'hidden',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: 0.3,
                                  bgcolor: '#f8fafc',
                                }}
                              >
                                {sourceRows.map((row, sourceIndex) => {
                                  const globalSourceIndex = Math.max(
                                    0,
                                    sourceProcessTypes.indexOf(
                                      row.sourceProcessType,
                                    ),
                                  );
                                  const isForecastSelected = forecastCells.has(
                                    row.cellKey,
                                  );
                                  const visual = getCellVisual(
                                    row,
                                    isForecastSelected,
                                    globalSourceIndex,
                                  );
                                  const isClickable =
                                    editingForecast &&
                                    row.forecastEligible &&
                                    !saving;
                                  const missingCalculation =
                                    (row.actualState === 'in_period' ||
                                      isForecastSelected) &&
                                    row.calculationMissing;
                                  const tooltip = [
                                    `${group.building} ${row.unit}호`,
                                    `공정진척 공정: ${row.sourceProcessType}`,
                                    `적용구분: ${
                                      row.isCostBasis
                                        ? '1번 금액기준 공정'
                                        : '진척참고 공정 · 금액 미적용'
                                    }`,
                                    `상태: ${visual.label}`,
                                    row.actualCompletionDate
                                      ? `완료일: ${row.actualCompletionDate}`
                                      : '완료일: -',
                                    `타입: ${row.unitType || '미지정'}`,
                                    `물량: ${formatQuantity(row.quantity)} ${
                                      row.unitName || ''
                                    }`,
                                    row.confirmationRound > 0
                                      ? `적용차수: ${row.confirmationRound}차`
                                      : '적용차수: 미지정',
                                    row.isCostBasis
                                      ? row.appliedUnitPrice > 0
                                        ? `적용단가: ${formatMoney(
                                            row.appliedUnitPrice,
                                          )}원`
                                        : '적용단가: 미설정'
                                      : '적용단가: 금액 계산 제외',
                                    row.isCostBasis
                                      ? `계산금액: ${formatMoney(row.amount)}원`
                                      : '계산금액: 진척 참고용으로 미적용',
                                  ].join('\n');

                                  return (
                                    <Button
                                      key={row.cellKey}
                                      type="button"
                                      title={tooltip}
                                      onClick={() => handleCellClick(row)}
                                      disableRipple={!isClickable}
                                      sx={{
                                        minWidth: 0,
                                        width: `${100 / Math.max(sourceRows.length, 1)}%`,
                                        height: '100%',
                                        minHeight: 0,
                                        px: 0,
                                        py: 0,
                                        border: 0,
                                        borderRight:
                                          sourceIndex < sourceRows.length - 1
                                            ? '1px solid rgba(255,255,255,0.72)'
                                            : 0,
                                        borderRadius: 0,
                                        bgcolor: visual.backgroundColor,
                                        color: visual.color,
                                        cursor: isClickable
                                          ? 'pointer'
                                          : 'default',
                                        boxShadow: missingCalculation
                                          ? 'inset 0 0 0 1px #dc2626'
                                          : 'none',
                                        '&:hover': {
                                          bgcolor: visual.backgroundColor,
                                          filter: isClickable
                                            ? 'brightness(0.92)'
                                            : 'none',
                                        },
                                      }}
                                    />
                                  );
                                })}

                                <Typography
                                  component="span"
                                  sx={{
                                    position: 'absolute',
                                    inset: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    pointerEvents: 'none',
                                    color: allUnworked ? '#475569' : '#ffffff',
                                    fontSize: '0.47rem',
                                    fontWeight: 900,
                                    lineHeight: 1,
                                    textShadow: allUnworked
                                      ? '0 0 2px rgba(255,255,255,0.95)'
                                      : '0 1px 2px rgba(15,23,42,0.9)',
                                  }}
                                >
                                  {unitLabel}
                                </Typography>
                              </Box>,
                            );
                          });

                          return items;
                        })}

                        <Box
                          sx={{
                            height: sharedFloorCellHeight,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #cbd5e1',
                            borderRadius: 0.3,
                            bgcolor: '#334155',
                            color: '#ffffff',
                            fontSize: '0.48rem',
                            fontWeight: 900,
                          }}
                        >
                          타입
                        </Box>
                        {group.lineKeys.map((lineKey) => (
                          <Box
                            key={`${group.building}-${lineKey}-type`}
                            title={`${Number(lineKey) || lineKey}호 라인 타입: ${
                              group.unitTypeByLine.get(lineKey) || '-'
                            }`}
                            sx={{
                              height: sharedFloorCellHeight,
                              px: 0.2,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              border: '1px solid #cbd5e1',
                              borderRadius: 0.3,
                              bgcolor: '#ffffff',
                              color: '#334155',
                              fontSize: '0.46rem',
                              fontWeight: 800,
                              lineHeight: 1,
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {group.unitTypeByLine.get(lineKey) || '-'}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </Paper>
                ))}
              </Box>
            </Box>
          )}
        </Paper>
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 1.5, py: 0.9 }}>
        <Typography sx={{ mr: 'auto', fontSize: '0.65rem', color: '#64748b' }}>
          빨간 점선 세대는 물량 또는 확정차수·단가를 확인해야 합니다.
        </Typography>
        <Button onClick={loadStructure} disabled={loading || saving || dirty}>
          다시 불러오기
        </Button>
        <Button onClick={handleClose} disabled={saving}>
          닫기
        </Button>
      </DialogActions>
    </Dialog>
  );
}
