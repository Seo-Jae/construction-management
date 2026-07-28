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
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Fade,
  FormControlLabel,
  IconButton,
  InputBase,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteSweepRoundedIcon from '@mui/icons-material/DeleteSweepRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import { supabase } from '../supabaseClient';
import { getProjectCellKeys } from '../utils/buildingUnits.js';

const DEFAULT_UNIT = '㎡';
const DEFAULT_CHANGE_REASON = '실행 예산 기준 최초 등록';
const GUIDE_PROCESS_OPTIONS = [
  '바닥먹',
  '허리먹',
  '단열',
  '합지',
  '경량골조',
  '경량석고',
  '합지석고',
  '세대천정',
  '1차몰딩',
  '2차몰딩',
  '1차 걸레받이',
  '2차 걸레받이',
];
const UNIT_OPTIONS = ['세대', '㎡', 'm', 'EA', '식'];
const RATE_EDITABLE_FIELDS = [
  'sortOrder',
  'processType',
  'unit',
  'contractLaborAmount',
  'executionLaborTotal',
  'plannedQuantity',
  'confirmedUnitPrice',
  'effectiveFrom',
  'changeReason',
];
const SUPABASE_WRITE_CHUNK_SIZE = 500;
const SUPABASE_READ_PAGE_SIZE = 1000;

const moneyFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 0,
});

const quantityFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 4,
});

const getKoreaDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return parts.reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
};

const getKoreaDateKey = () => {
  const parts = getKoreaDateParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const getKoreaMonthKey = () => {
  const parts = getKoreaDateParts();
  return `${parts.year}-${parts.month}`;
};

const toNumber = (value) => {
  if (value === '' || value === null || value === undefined) return 0;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : 0;
};

const nullablePositiveNumber = (value) => {
  const number = toNumber(value);
  return number > 0 ? number : null;
};

const formatMoney = (value) => moneyFormatter.format(toNumber(value));
const formatQuantity = (value) => quantityFormatter.format(toNumber(value));

const normalizeNumericInput = (value, maximumFractionDigits = 4) => {
  const cleaned = String(value ?? '')
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '');

  if (!cleaned) return '';

  const [integerPart = '', ...fractionParts] = cleaned.split('.');
  const integerValue = integerPart.replace(/^0+(?=\d)/, '') || '0';

  if (fractionParts.length === 0) return integerValue;

  const fractionValue = fractionParts
    .join('')
    .slice(0, maximumFractionDigits);

  return `${integerValue}.${fractionValue}`;
};

const formatNumericInput = (value) => {
  const text = String(value ?? '');
  if (!text) return '';

  const [integerPart, fractionPart] = text.split('.');
  const formattedInteger = Number(integerPart || 0).toLocaleString('ko-KR');

  return fractionPart === undefined
    ? formattedInteger
    : `${formattedInteger}.${fractionPart}`;
};

const formatDate = (value) => {
  const text = String(value || '').slice(0, 10);
  return text || '-';
};

const splitCellKey = (cellKey) => {
  const separatorIndex = String(cellKey).lastIndexOf('-');

  if (separatorIndex === -1) {
    return {
      building: '',
      unit: String(cellKey),
    };
  }

  return {
    building: String(cellKey).slice(0, separatorIndex),
    unit: String(cellKey).slice(separatorIndex + 1),
  };
};

const resolveFloor = (unit) => {
  const text = String(unit || '');
  if (text.length <= 2) return 0;
  return Number(text.slice(0, -2)) || 0;
};

const normalizeBuildingLookupKey = (value) => {
  const text = String(value || '')
    .trim()
    .replace(/\s+/g, '');

  if (!text) return '';

  const withoutDong = text.replace(/동$/u, '');

  if (/^\d+$/.test(withoutDong)) {
    return String(Number(withoutDong));
  }

  return text;
};

const normalizeUnitLookupKey = (value) => {
  const text = String(value || '').trim();

  if (!text) return '';

  if (/^\d+$/.test(text)) {
    return String(Number(text));
  }

  return text;
};

const getUnitTypeLookupKey = (building, unit) =>
  `${normalizeBuildingLookupKey(building)}::${normalizeUnitLookupKey(
    unit,
  )}`;

const normalizeRole = (profile) =>
  [
    profile?.role,
    profile?.user_role,
    profile?.permission,
    profile?.authority,
    profile?.access_level,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[\s_\-()[\]{}<>]/g, '');

const canManageRates = (profile) => {
  if (profile?.is_super_admin === true || profile?.isSuperAdmin === true) {
    return true;
  }

  const role = normalizeRole(profile);

  return [
    '최고관리자',
    '관리자',
    'admin',
    'administrator',
    'superadmin',
    'masteradmin',
    'labormanager',
    'sitemanager',
  ].some((candidate) => role.includes(candidate));
};

const createEditor = (
  processType = '',
  setting = null,
  processCatalog = null,
) => ({
  sortOrder: processCatalog?.sort_order ?? '',
  processType,
  unit: setting?.unit || processCatalog?.unit || DEFAULT_UNIT,
  contractLaborAmount:
    processCatalog?.contract_labor_amount ?? '',
  executionLaborTotal:
    setting?.execution_labor_total ?? '',
  plannedQuantity:
    setting?.planned_quantity ?? '',
  confirmedUnitPrice:
    setting?.confirmed_unit_price ?? '',
  effectiveFrom:
    String(setting?.effective_from || '').slice(0, 10) ||
    getKoreaDateKey(),
  changeReason:
    setting?.change_reason || DEFAULT_CHANGE_REASON,
});

const splitIntoChunks = (items, chunkSize) => {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
};

const headerCellSx = {
  bgcolor: '#e2e8f0',
  color: '#334155',
  fontSize: '0.69rem',
  fontWeight: 900,
  whiteSpace: 'nowrap',
  borderRight: '1px solid #cbd5e1',
  py: 0.8,
};

const bodyCellSx = {
  color: '#334155',
  fontSize: '0.69rem',
  borderRight: '1px solid #e2e8f0',
  py: 0.65,
};

const numberCellSx = {
  ...bodyCellSx,
  textAlign: 'right',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
};

function SummaryCard({ label, value, helper, color = '#0f172a' }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        minWidth: 160,
        flex: '1 1 180px',
        p: 1.25,
        borderColor: '#cbd5e1',
        boxShadow: 'none',
      }}
    >
      <Typography
        sx={{
          fontSize: '0.68rem',
          fontWeight: 800,
          color: '#64748b',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.25,
          fontSize: '1.1rem',
          fontWeight: 900,
          color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Typography>
      {helper && (
        <Typography
          sx={{
            mt: 0.2,
            fontSize: '0.62rem',
            color: '#94a3b8',
          }}
        >
          {helper}
        </Typography>
      )}
    </Paper>
  );
}

export default function LaborCostManagement({
  projectName = '',
  userProfile = null,
  processOptions = [],
  buildingConfigs = {},
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [quantityLoading, setQuantityLoading] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const [settings, setSettings] = useState([]);
  const [rateHistory, setRateHistory] = useState([]);
  const [processCatalog, setProcessCatalog] = useState([]);
  const [unitTypes, setUnitTypes] = useState({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyProcess, setHistoryProcess] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProcesses, setSelectedProcesses] = useState(
    () => new Set(),
  );
  const [editingOriginalProcess, setEditingOriginalProcess] =
    useState('');
  const [isAddingProcess, setIsAddingProcess] = useState(false);
  const [, setActiveEditorField] = useState('');
  const [editor, setEditor] = useState(() => createEditor(''));
  const rateInputRefs = useRef({});

  const [quantityProcess, setQuantityProcess] = useState('');
  const [quantities, setQuantities] = useState({});
  const [selectedUnits, setSelectedUnits] = useState(() => new Set());
  const [buildingFilter, setBuildingFilter] = useState('전체');
  const [floorFilter, setFloorFilter] = useState('전체');
  const [typeFilter, setTypeFilter] = useState('전체');
  const [onlyUnassignedQuantity, setOnlyUnassignedQuantity] =
    useState(false);
  const [unitKeyword, setUnitKeyword] = useState('');
  const [bulkQuantity, setBulkQuantity] = useState('');
  const [quantityPage, setQuantityPage] = useState(0);
  const [quantityRowsPerPage, setQuantityRowsPerPage] = useState(100);
  const [quantityDeleteDialogOpen, setQuantityDeleteDialogOpen] =
    useState(false);

  const [baseMonth, setBaseMonth] = useState(getKoreaMonthKey());
  const [monthlySummary, setMonthlySummary] = useState([]);
  const [monthlyDetails, setMonthlyDetails] = useState([]);
  const [monthlyTotals, setMonthlyTotals] = useState({});
  const [detailProcess, setDetailProcess] = useState('');

  const rateEditable = canManageRates(userProfile);

  const settingByProcess = useMemo(
    () =>
      settings.reduce((result, setting) => {
        result[setting.process_type] = setting;
        return result;
      }, {}),
    [settings],
  );

  const catalogByProcess = useMemo(
    () =>
      processCatalog.reduce((result, processRow) => {
        result[processRow.process_type] = processRow;
        return result;
      }, {}),
    [processCatalog],
  );

  const allProcessOptions = useMemo(() => {
    if (!overviewLoaded) return [];

    return processCatalog
      .filter((row) => row.is_active !== false)
      .map((row) => row.process_type)
      .filter(Boolean);
  }, [overviewLoaded, processCatalog]);

  const guideProcessOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...GUIDE_PROCESS_OPTIONS,
          ...(processOptions || []).filter(Boolean),
        ]),
      ),
    [processOptions],
  );

  const validUnits = useMemo(() => {
    const rows = Array.from(getProjectCellKeys(buildingConfigs)).map(
      (cellKey) => {
        const { building, unit } = splitCellKey(cellKey);
        return {
          cellKey,
          building,
          unit,
          floor: resolveFloor(unit),
          unitType:
            unitTypes[getUnitTypeLookupKey(building, unit)] ||
            '미지정',
        };
      },
    );

    return rows.sort((first, second) => {
      const buildingCompare = String(first.building).localeCompare(
        String(second.building),
        'ko',
        { numeric: true },
      );

      if (buildingCompare !== 0) return buildingCompare;
      return Number(first.unit) - Number(second.unit);
    });
  }, [buildingConfigs, unitTypes]);

  const buildingOptions = useMemo(
    () =>
      Array.from(new Set(validUnits.map((row) => row.building))).sort(
        (first, second) =>
          String(first).localeCompare(String(second), 'ko', {
            numeric: true,
          }),
      ),
    [validUnits],
  );

  const floorOptions = useMemo(() => {
    const source =
      buildingFilter === '전체'
        ? validUnits
        : validUnits.filter((row) => row.building === buildingFilter);

    return Array.from(new Set(source.map((row) => row.floor)))
      .filter((floor) => floor > 0)
      .sort((first, second) => second - first);
  }, [buildingFilter, validUnits]);

  const typeOptions = useMemo(() => {
    const source = validUnits.filter((row) => {
      if (buildingFilter !== '전체' && row.building !== buildingFilter) {
        return false;
      }

      if (
        floorFilter !== '전체' &&
        row.floor !== Number(floorFilter)
      ) {
        return false;
      }

      return true;
    });

    return Array.from(new Set(source.map((row) => row.unitType)))
      .filter(Boolean)
      .sort((first, second) =>
        String(first).localeCompare(String(second), 'ko', {
          numeric: true,
        }),
      );
  }, [buildingFilter, floorFilter, validUnits]);

  const filteredUnits = useMemo(() => {
    const keyword = String(unitKeyword || '').trim().toLowerCase();

    return validUnits.filter((row) => {
      if (buildingFilter !== '전체' && row.building !== buildingFilter) {
        return false;
      }

      if (
        floorFilter !== '전체' &&
        row.floor !== Number(floorFilter)
      ) {
        return false;
      }

      if (typeFilter !== '전체' && row.unitType !== typeFilter) {
        return false;
      }

      if (
        onlyUnassignedQuantity &&
        toNumber(quantities[row.cellKey]) > 0
      ) {
        return false;
      }

      if (
        keyword &&
        !`${row.building} ${row.unit} ${row.unitType}`
          .toLowerCase()
          .includes(keyword)
      ) {
        return false;
      }

      return true;
    });
  }, [
    buildingFilter,
    floorFilter,
    onlyUnassignedQuantity,
    quantities,
    typeFilter,
    unitKeyword,
    validUnits,
  ]);

  const paginatedUnits = useMemo(
    () =>
      filteredUnits.slice(
        quantityPage * quantityRowsPerPage,
        quantityPage * quantityRowsPerPage + quantityRowsPerPage,
      ),
    [filteredUnits, quantityPage, quantityRowsPerPage],
  );

  const selectedSetting = settingByProcess[quantityProcess] || null;
  const selectedAppliedPrice = toNumber(
    selectedSetting?.applied_unit_price,
  );

  const calculatedExecutionUnitPrice = useMemo(() => {
    const total = toNumber(editor.executionLaborTotal);
    const quantity = toNumber(editor.plannedQuantity);
    return quantity > 0 ? total / quantity : 0;
  }, [
    editor.executionLaborTotal,
    editor.plannedQuantity,
  ]);

  const loadOverview = useCallback(async () => {
    if (!projectName) return;

    setOverviewLoading(true);
    setErrorMessage('');

    try {
      const { data, error } = await supabase.rpc(
        'get_labor_cost_overview',
        {
          p_project_name: projectName,
        },
      );

      if (error) throw error;

      const nextSettings = data?.settings || [];
      const nextHistory = data?.history || [];
      const nextCatalog = data?.processes || [];

      setSettings(nextSettings);
      setRateHistory(nextHistory);
      setProcessCatalog(nextCatalog);
      setOverviewLoaded(true);

      const activeProcessNames = nextCatalog
        .filter((row) => row.is_active !== false)
        .map((row) => row.process_type);
      const preferredProcess =
        (activeProcessNames.includes(quantityProcess)
          ? quantityProcess
          : '') ||
        activeProcessNames[0] ||
        '';

      setQuantityProcess(preferredProcess);
    } catch (error) {
      console.error('노임 기준 불러오기 오류:', error);
      setErrorMessage(
        `노임 기준을 불러오지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setOverviewLoading(false);
    }
  }, [projectName, quantityProcess]);

  const loadUnitTypes = useCallback(async () => {
    if (!projectName) {
      setUnitTypes({});
      return;
    }

    try {
      const rows = [];
      let offset = 0;

      while (true) {
        const { data, error } = await supabase
          .rpc('get_labor_unit_types', {
            p_project_name: projectName,
          })
          .range(
            offset,
            offset + SUPABASE_READ_PAGE_SIZE - 1,
          );

        if (error) throw error;

        const pageRows = data || [];
        rows.push(...pageRows);

        if (pageRows.length < SUPABASE_READ_PAGE_SIZE) {
          break;
        }

        offset += SUPABASE_READ_PAGE_SIZE;
      }

      const nextUnitTypes = rows.reduce((result, row) => {
        const lookupKey = getUnitTypeLookupKey(
          row.building,
          row.unit,
        );
        const unitType = String(row.unit_type || '').trim();

        if (lookupKey !== '::' && unitType) {
          result[lookupKey] = unitType;
        }

        return result;
      }, {});

      setUnitTypes(nextUnitTypes);
    } catch (error) {
      console.error('세대 타입 불러오기 오류:', error);
      setErrorMessage(
        `세대 타입을 불러오지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    }
  }, [projectName]);

  const loadQuantities = useCallback(async () => {
    if (!projectName || !quantityProcess) {
      setQuantities({});
      return;
    }

    setQuantityLoading(true);
    setErrorMessage('');

    try {
      const rows = [];
      let offset = 0;

      while (true) {
        const { data, error } = await supabase
          .rpc('get_labor_unit_quantities', {
            p_project_name: projectName,
            p_process_type: quantityProcess,
          })
          .range(
            offset,
            offset + SUPABASE_READ_PAGE_SIZE - 1,
          );

        if (error) throw error;

        const pageRows = data || [];
        rows.push(...pageRows);

        if (pageRows.length < SUPABASE_READ_PAGE_SIZE) {
          break;
        }

        offset += SUPABASE_READ_PAGE_SIZE;
      }

      const nextQuantities = rows.reduce((result, row) => {
        result[`${row.building}-${row.unit}`] = row.quantity;
        return result;
      }, {});

      setQuantities(nextQuantities);
      setSelectedUnits(new Set());
    } catch (error) {
      console.error('세대별 물량 불러오기 오류:', error);
      setErrorMessage(
        `세대별 물량을 불러오지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setQuantityLoading(false);
    }
  }, [projectName, quantityProcess]);

  const loadMonthly = useCallback(async () => {
    if (!projectName || !baseMonth) return;

    setMonthlyLoading(true);
    setErrorMessage('');

    try {
      const { data, error } = await supabase.rpc(
        'get_labor_monthly_status',
        {
          p_project_name: projectName,
          p_base_month: `${baseMonth}-01`,
        },
      );

      if (error) throw error;

      const nextSummary = data?.summary || [];
      setMonthlySummary(nextSummary);
      setMonthlyDetails(data?.details || []);
      setMonthlyTotals(data?.totals || {});
      setDetailProcess((previous) => {
        if (
          previous &&
          nextSummary.some((row) => row.process_type === previous)
        ) {
          return previous;
        }

        return nextSummary[0]?.process_type || '';
      });
    } catch (error) {
      console.error('월별 노임현황 불러오기 오류:', error);
      setErrorMessage(
        `월별 노임현황을 불러오지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setMonthlyLoading(false);
    }
  }, [baseMonth, projectName]);

  useEffect(() => {
    setSettings([]);
    setRateHistory([]);
    setProcessCatalog([]);
    setOverviewLoaded(false);
    setUnitTypes({});
    setQuantities({});
    setMonthlySummary([]);
    setMonthlyDetails([]);
    setMonthlyTotals({});
    setEditingOriginalProcess('');
    setIsAddingProcess(false);
    setActiveEditorField('');
    setEditor(createEditor(''));
    setMessage(null);
    setErrorMessage('');
    loadOverview();
    loadUnitTypes();
  }, [projectName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadQuantities();
  }, [loadQuantities]);

  useEffect(() => {
    loadMonthly();
  }, [loadMonthly]);

  useEffect(() => {
    if (
      allProcessOptions.length > 0 &&
      !allProcessOptions.includes(quantityProcess)
    ) {
      setQuantityProcess(allProcessOptions[0]);
    } else if (allProcessOptions.length === 0 && quantityProcess) {
      setQuantityProcess('');
    }
  }, [allProcessOptions, quantityProcess]);

  useEffect(() => {
    setSelectedProcesses((previous) => {
      const next = new Set(
        Array.from(previous).filter((processType) =>
          allProcessOptions.includes(processType),
        ),
      );

      return next.size === previous.size ? previous : next;
    });
  }, [allProcessOptions]);

  const focusRateField = (fieldName) => {
    setActiveEditorField(fieldName);
    window.setTimeout(() => {
      rateInputRefs.current[fieldName]?.focus?.();
      rateInputRefs.current[fieldName]?.select?.();
    }, 0);
  };

  const registerRateInput = (fieldName) => (node) => {
    if (node) rateInputRefs.current[fieldName] = node;
    else delete rateInputRefs.current[fieldName];
  };

  const beginInlineEdit = (
    processType,
    focusField = 'processType',
    force = false,
  ) => {
    if (!rateEditable || (saving && !force)) return;

    if (
      !force &&
      (isAddingProcess ||
        (editingOriginalProcess &&
          editingOriginalProcess !== processType))
    ) {
      setMessage({
        severity: 'warning',
        text: '현재 수정 중인 행을 먼저 저장하거나 취소해주세요.',
      });
      return;
    }

    setIsAddingProcess(false);
    setEditingOriginalProcess(processType);
    setEditor(
      createEditor(
        processType,
        settingByProcess[processType],
        catalogByProcess[processType],
      ),
    );
    setMessage(null);
    setErrorMessage('');
    focusRateField(focusField);
  };

  const handleAddInlineProcess = () => {
    if (!rateEditable || saving) return;

    if (isAddingProcess || editingOriginalProcess) {
      setMessage({
        severity: 'warning',
        text: '현재 수정 중인 행을 먼저 저장하거나 취소해주세요.',
      });
      return;
    }

    setEditingOriginalProcess('');
    setIsAddingProcess(true);
    setEditor({
      ...createEditor(''),
      sortOrder: allProcessOptions.length + 1,
    });
    setMessage(null);
    setErrorMessage('');
    focusRateField('processType');
  };

  const handleCancelInlineEdit = () => {
    setEditingOriginalProcess('');
    setIsAddingProcess(false);
    setActiveEditorField('');
    setEditor(createEditor(''));
    rateInputRefs.current = {};
  };

  const updateEditorField = (fieldName, value) => {
    setEditor((previous) => ({
      ...previous,
      [fieldName]: value,
    }));
  };

  const handleRateEditorKeyDown = (
    event,
    fieldName,
    isAutocomplete = false,
  ) => {
    const autocompleteOpen =
      isAutocomplete &&
      event.target.getAttribute('aria-expanded') === 'true';

    if (
      autocompleteOpen &&
      ['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)
    ) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelInlineEdit();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const currentIndex = RATE_EDITABLE_FIELDS.indexOf(fieldName);
      const nextIndex = event.shiftKey
        ? currentIndex - 1
        : currentIndex + 1;

      if (
        nextIndex >= 0 &&
        nextIndex < RATE_EDITABLE_FIELDS.length
      ) {
        focusRateField(RATE_EDITABLE_FIELDS[nextIndex]);
      } else {
        handleSaveInlineRow({
          moveDirection: event.shiftKey ? -1 : 1,
          focusField: event.shiftKey
            ? RATE_EDITABLE_FIELDS[RATE_EDITABLE_FIELDS.length - 1]
            : RATE_EDITABLE_FIELDS[0],
        });
      }
      return;
    }

    if (['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const moveDirection =
        event.key === 'ArrowUp'
          ? -1
          : event.key === 'ArrowDown' || event.key === 'Enter'
            ? 1
            : 0;
      handleSaveInlineRow({
        moveDirection,
        focusField: fieldName,
      });
    }
  };

  const handleSaveInlineRow = async ({
    moveDirection = 0,
    focusField = 'processType',
  } = {}) => {
    if (!rateEditable) {
      setErrorMessage('공정별 노임단가를 설정할 권한이 없습니다.');
      return;
    }

    const processName = editor.processType.trim();
    const unitName = editor.unit.trim();
    const sortOrder = Math.max(
      1,
      Math.round(toNumber(editor.sortOrder)),
    );
    const executionUnitPrice =
      toNumber(editor.plannedQuantity) > 0
        ? toNumber(editor.executionLaborTotal) /
          toNumber(editor.plannedQuantity)
        : 0;

    if (!processName || !unitName || !editor.effectiveFrom) {
      setErrorMessage('순서, 공정, 단위, 적용일을 모두 입력해주세요.');
      return;
    }

    if (
      allProcessOptions.some(
        (processType) =>
          processType === processName &&
          processType !== editingOriginalProcess,
      )
    ) {
      setErrorMessage('같은 이름의 공정이 이미 등록되어 있습니다.');
      return;
    }

    if (executionUnitPrice <= 0) {
      setErrorMessage(
        '실행 노임총액과 총 예정물량을 확인해주세요.',
      );
      return;
    }

    if (!editor.changeReason.trim()) {
      setErrorMessage('단가 등록 또는 변경 사유를 입력해주세요.');
      return;
    }

    setSaving(true);
    setMessage(null);
    setErrorMessage('');

    const currentIndex = isAddingProcess
      ? allProcessOptions.length
      : allProcessOptions.indexOf(editingOriginalProcess);
    const targetIndex = currentIndex + moveDirection;
    const targetProcess =
      moveDirection !== 0 &&
      targetIndex >= 0 &&
      targetIndex < allProcessOptions.length
        ? allProcessOptions[targetIndex]
        : '';
    const originalProcess = editingOriginalProcess;
    const followRenamedQuantityProcess =
      originalProcess &&
      originalProcess !== processName &&
      quantityProcess === originalProcess;

    try {
      const { error } = await supabase.rpc(
        'save_labor_process_inline',
        {
          p_project_name: projectName,
          p_original_process_type: originalProcess || null,
          p_process_type: processName,
          p_sort_order: sortOrder,
          p_unit: unitName,
          p_contract_labor_amount: toNumber(
            editor.contractLaborAmount,
          ),
          p_execution_labor_total: toNumber(
            editor.executionLaborTotal,
          ),
          p_planned_quantity: toNumber(editor.plannedQuantity),
          p_confirmed_unit_price: nullablePositiveNumber(
            editor.confirmedUnitPrice,
          ),
          p_effective_from: editor.effectiveFrom,
          p_change_reason: editor.changeReason.trim(),
        },
      );

      if (error) throw error;

      handleCancelInlineEdit();
      setMessage({
        severity: 'success',
        text: `${processName} 공정의 노임단가를 저장했습니다.`,
      });
      await loadOverview();
      await loadMonthly();

      if (followRenamedQuantityProcess) {
        setQuantityProcess(processName);
      }

      if (targetProcess && targetProcess !== originalProcess) {
        beginInlineEdit(targetProcess, focusField, true);
      }
    } catch (error) {
      console.error('노임단가 저장 오류:', error);
      setErrorMessage(
        `노임단가를 저장하지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleProcess = (processType) => {
    setSelectedProcesses((previous) => {
      const next = new Set(previous);

      if (next.has(processType)) next.delete(processType);
      else next.add(processType);

      return next;
    });
  };

  const handleToggleAllProcesses = () => {
    const allSelected =
      allProcessOptions.length > 0 &&
      allProcessOptions.every((processType) =>
        selectedProcesses.has(processType),
      );

    setSelectedProcesses(
      allSelected ? new Set() : new Set(allProcessOptions),
    );
  };

  const handleDeleteProcesses = async () => {
    const processTypes = allProcessOptions.filter((processType) =>
      selectedProcesses.has(processType),
    );

    if (!rateEditable || processTypes.length === 0) return;

    setSaving(true);
    setMessage(null);
    setErrorMessage('');

    try {
      const { error } = await supabase.rpc(
        'archive_labor_process_catalogs',
        {
          p_project_name: projectName,
          p_process_types: processTypes,
        },
      );

      if (error) throw error;

      setDeleteDialogOpen(false);
      setSelectedProcesses(new Set());
      setMessage({
        severity: 'success',
        text: `선택한 공정 ${processTypes.length.toLocaleString()}개를 목록에서 삭제했습니다. 기존 단가이력과 물량자료는 보존됩니다.`,
      });
      await loadOverview();
      await loadMonthly();
    } catch (error) {
      console.error('노임 공정 일괄삭제 오류:', error);
      setErrorMessage(
        `선택한 공정을 삭제하지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleMoveProcesses = async (direction) => {
    if (!rateEditable || selectedProcesses.size === 0 || saving) {
      return;
    }

    const nextOrder = [...allProcessOptions];
    let changed = false;

    if (direction === 'up') {
      for (let index = 1; index < nextOrder.length; index += 1) {
        const currentSelected = selectedProcesses.has(nextOrder[index]);
        const previousSelected = selectedProcesses.has(
          nextOrder[index - 1],
        );

        if (currentSelected && !previousSelected) {
          [nextOrder[index - 1], nextOrder[index]] = [
            nextOrder[index],
            nextOrder[index - 1],
          ];
          changed = true;
        }
      }
    } else {
      for (
        let index = nextOrder.length - 2;
        index >= 0;
        index -= 1
      ) {
        const currentSelected = selectedProcesses.has(nextOrder[index]);
        const nextSelected = selectedProcesses.has(
          nextOrder[index + 1],
        );

        if (currentSelected && !nextSelected) {
          [nextOrder[index], nextOrder[index + 1]] = [
            nextOrder[index + 1],
            nextOrder[index],
          ];
          changed = true;
        }
      }
    }

    if (!changed) {
      setMessage({
        severity: 'info',
        text:
          direction === 'up'
            ? '선택한 공정이 이미 가장 위에 있습니다.'
            : '선택한 공정이 이미 가장 아래에 있습니다.',
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    setErrorMessage('');

    try {
      const { error } = await supabase.rpc(
        'reorder_labor_process_catalog',
        {
          p_project_name: projectName,
          p_process_types: nextOrder,
        },
      );

      if (error) throw error;

      setMessage({
        severity: 'success',
        text:
          direction === 'up'
            ? '선택한 공정을 위로 이동했습니다.'
            : '선택한 공정을 아래로 이동했습니다.',
      });
      await loadOverview();
    } catch (error) {
      console.error('노임 공정 순서변경 오류:', error);
      setErrorMessage(
        `공정 순서를 변경하지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleUnit = (cellKey) => {
    setSelectedUnits((previous) => {
      const next = new Set(previous);
      if (next.has(cellKey)) next.delete(cellKey);
      else next.add(cellKey);
      return next;
    });
  };

  const handleToggleVisibleUnits = () => {
    const visibleKeys = filteredUnits.map((row) => row.cellKey);
    const allSelected =
      visibleKeys.length > 0 &&
      visibleKeys.every((cellKey) => selectedUnits.has(cellKey));

    setSelectedUnits((previous) => {
      const next = new Set(previous);
      visibleKeys.forEach((cellKey) => {
        if (allSelected) next.delete(cellKey);
        else next.add(cellKey);
      });
      return next;
    });
  };

  const handleApplyBulkQuantity = () => {
    if (selectedUnits.size === 0) {
      setErrorMessage('물량을 적용할 세대를 먼저 선택해주세요.');
      return;
    }

    const value = Math.max(0, toNumber(bulkQuantity));

    setQuantities((previous) => {
      const next = { ...previous };
      selectedUnits.forEach((cellKey) => {
        next[cellKey] = value;
      });
      return next;
    });

    setMessage({
      severity: 'info',
      text: `${selectedUnits.size.toLocaleString()}세대에 ${formatQuantity(
        value,
      )}${selectedSetting?.unit || ''}를 입력했습니다. 저장 버튼을 눌러 확정해주세요.`,
    });
    setErrorMessage('');
  };

  const handleSaveQuantities = async () => {
    if (!quantityProcess) {
      setErrorMessage('공정을 선택해주세요.');
      return;
    }

    const rows = Object.entries(quantities).map(([cellKey, quantity]) => {
      const { building, unit } = splitCellKey(cellKey);
      return {
        building,
        unit,
        quantity: Math.max(0, toNumber(quantity)),
      };
    });

    if (rows.length === 0) {
      setErrorMessage('저장할 세대별 물량이 없습니다.');
      return;
    }

    setSaving(true);
    setMessage(null);
    setErrorMessage('');

    try {
      const chunks = splitIntoChunks(rows, SUPABASE_WRITE_CHUNK_SIZE);

      for (const chunk of chunks) {
        const { error } = await supabase.rpc(
          'save_labor_unit_quantities',
          {
            p_project_name: projectName,
            p_process_type: quantityProcess,
            p_rows: chunk,
          },
        );

        if (error) throw error;
      }

      setMessage({
        severity: 'success',
        text: `${quantityProcess} 세대별 물량 ${rows.length.toLocaleString()}건을 저장했습니다.`,
      });
      await loadQuantities();
      await loadMonthly();
    } catch (error) {
      console.error('세대별 물량 저장 오류:', error);
      setErrorMessage(
        `세대별 물량을 저장하지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAllQuantities = async () => {
    if (!quantityProcess) {
      setErrorMessage('물량을 삭제할 공정을 선택해주세요.');
      return;
    }

    setSaving(true);
    setMessage(null);
    setErrorMessage('');

    try {
      const { data, error } = await supabase.rpc(
        'delete_labor_unit_quantities',
        {
          p_project_name: projectName,
          p_process_type: quantityProcess,
        },
      );

      if (error) throw error;

      setQuantityDeleteDialogOpen(false);
      setQuantities({});
      setSelectedUnits(new Set());
      setBulkQuantity('');
      setOnlyUnassignedQuantity(false);
      setMessage({
        severity: 'success',
        text: `${quantityProcess} 공정의 저장 물량 ${toNumber(
          data,
        ).toLocaleString()}건을 모두 삭제했습니다.`,
      });
      await loadMonthly();
    } catch (error) {
      console.error('현재 공정 세대물량 전체삭제 오류:', error);
      setErrorMessage(
        `현재 공정의 세대별 물량을 삭제하지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setSaving(false);
    }
  };

  const selectedProcessHistory = useMemo(
    () =>
      rateHistory.filter(
        (row) => row.process_type === historyProcess,
      ),
    [historyProcess, rateHistory],
  );

  const visibleMonthlyDetails = useMemo(
    () =>
      monthlyDetails.filter(
        (row) => row.process_type === detailProcess,
      ),
    [detailProcess, monthlyDetails],
  );

  const currentQuantityTotal = useMemo(
    () =>
      validUnits.reduce(
        (total, row) => total + toNumber(quantities[row.cellKey]),
        0,
      ),
    [quantities, validUnits],
  );

  const editorCellInputSx = {
    width: '100%',
    minWidth: 0,
    px: 0.6,
    py: 0.35,
    bgcolor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: 0.5,
    '& input': {
      p: 0,
      fontSize: '0.69rem',
    },
  };

  const renderRateEditorRow = (rowKey) => (
    <TableRow
      key={rowKey}
      sx={{
        bgcolor: '#fff7d6',
        '& td': {
          borderBottomColor: '#f59e0b',
        },
        '&:hover': {
          bgcolor: '#ffefbd',
        },
      }}
    >
      <TableCell padding="checkbox">
        <Checkbox size="small" disabled />
      </TableCell>
      <TableCell sx={{ ...bodyCellSx, minWidth: 62 }}>
        <InputBase
          value={editor.sortOrder}
          onChange={(event) =>
            updateEditorField(
              'sortOrder',
              normalizeNumericInput(event.target.value, 0),
            )
          }
          onFocus={() => setActiveEditorField('sortOrder')}
          onKeyDown={(event) =>
            handleRateEditorKeyDown(event, 'sortOrder')
          }
          inputRef={registerRateInput('sortOrder')}
          inputProps={{
            inputMode: 'numeric',
            'aria-label': '공정 순서',
            style: { textAlign: 'center' },
          }}
          sx={editorCellInputSx}
        />
      </TableCell>
      <TableCell sx={{ ...bodyCellSx, minWidth: 145, p: 0.45 }}>
        <Autocomplete
          freeSolo
          disablePortal
          options={guideProcessOptions}
          value={editor.processType}
          inputValue={editor.processType}
          onChange={(_event, value) =>
            updateEditorField('processType', value || '')
          }
          onInputChange={(_event, value) =>
            updateEditorField('processType', value || '')
          }
          filterOptions={(options, state) => {
            const keyword = state.inputValue.trim().toLowerCase();
            if (!keyword) return options;
            return options.filter((option) =>
              option.toLowerCase().startsWith(keyword),
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              variant="standard"
              placeholder="첫 글자 입력"
              inputRef={registerRateInput('processType')}
              onFocus={() => setActiveEditorField('processType')}
              onKeyDown={(event) =>
                handleRateEditorKeyDown(
                  event,
                  'processType',
                  true,
                )
              }
              InputProps={{
                ...params.InputProps,
                disableUnderline: true,
                sx: {
                  ...editorCellInputSx,
                  '& input': {
                    p: '0 !important',
                    fontSize: '0.69rem',
                    fontWeight: 900,
                  },
                },
              }}
            />
          )}
        />
      </TableCell>
      <TableCell sx={{ ...bodyCellSx, minWidth: 82, p: 0.45 }}>
        <Autocomplete
          freeSolo
          disablePortal
          options={UNIT_OPTIONS}
          value={editor.unit}
          inputValue={editor.unit}
          onChange={(_event, value) =>
            updateEditorField('unit', value || '')
          }
          onInputChange={(_event, value) =>
            updateEditorField('unit', value || '')
          }
          renderInput={(params) => (
            <TextField
              {...params}
              variant="standard"
              inputRef={registerRateInput('unit')}
              onFocus={() => setActiveEditorField('unit')}
              onKeyDown={(event) =>
                handleRateEditorKeyDown(event, 'unit', true)
              }
              InputProps={{
                ...params.InputProps,
                disableUnderline: true,
                sx: {
                  ...editorCellInputSx,
                  '& input': {
                    p: '0 !important',
                    fontSize: '0.69rem',
                    textAlign: 'center',
                  },
                },
              }}
            />
          )}
        />
      </TableCell>
      {[
        {
          field: 'contractLaborAmount',
          digits: 0,
          inputMode: 'numeric',
        },
        {
          field: 'executionLaborTotal',
          digits: 0,
          inputMode: 'numeric',
        },
        {
          field: 'plannedQuantity',
          digits: 4,
          inputMode: 'decimal',
        },
      ].map(({ field, digits, inputMode }) => (
        <TableCell
          key={field}
          sx={{ ...bodyCellSx, minWidth: 122, p: 0.45 }}
        >
          <InputBase
            value={formatNumericInput(editor[field])}
            onChange={(event) =>
              updateEditorField(
                field,
                normalizeNumericInput(event.target.value, digits),
              )
            }
            onFocus={() => setActiveEditorField(field)}
            onKeyDown={(event) =>
              handleRateEditorKeyDown(event, field)
            }
            inputRef={registerRateInput(field)}
            inputProps={{
              inputMode,
              style: { textAlign: 'right' },
            }}
            sx={editorCellInputSx}
          />
        </TableCell>
      ))}
      <TableCell
        sx={{
          ...numberCellSx,
          minWidth: 110,
          fontWeight: 900,
          bgcolor: '#fef3c7',
        }}
      >
        {calculatedExecutionUnitPrice > 0
          ? `${formatMoney(calculatedExecutionUnitPrice)}원`
          : '-'}
      </TableCell>
      <TableCell sx={{ ...bodyCellSx, minWidth: 112, p: 0.45 }}>
        <InputBase
          value={formatNumericInput(editor.confirmedUnitPrice)}
          onChange={(event) =>
            updateEditorField(
              'confirmedUnitPrice',
              normalizeNumericInput(event.target.value, 4),
            )
          }
          onFocus={() => setActiveEditorField('confirmedUnitPrice')}
          onKeyDown={(event) =>
            handleRateEditorKeyDown(event, 'confirmedUnitPrice')
          }
          inputRef={registerRateInput('confirmedUnitPrice')}
          placeholder="미확정"
          inputProps={{
            inputMode: 'decimal',
            style: { textAlign: 'right' },
          }}
          sx={editorCellInputSx}
        />
      </TableCell>
      <TableCell sx={{ ...bodyCellSx, minWidth: 132, p: 0.45 }}>
        <InputBase
          type="date"
          value={editor.effectiveFrom}
          onChange={(event) =>
            updateEditorField('effectiveFrom', event.target.value)
          }
          onFocus={() => setActiveEditorField('effectiveFrom')}
          onKeyDown={(event) =>
            handleRateEditorKeyDown(event, 'effectiveFrom')
          }
          inputRef={registerRateInput('effectiveFrom')}
          sx={editorCellInputSx}
        />
      </TableCell>
      <TableCell sx={{ ...bodyCellSx, minWidth: 235, p: 0.45 }}>
        <InputBase
          value={editor.changeReason}
          onChange={(event) =>
            updateEditorField('changeReason', event.target.value)
          }
          onFocus={() => setActiveEditorField('changeReason')}
          onKeyDown={(event) =>
            handleRateEditorKeyDown(event, 'changeReason')
          }
          inputRef={registerRateInput('changeReason')}
          sx={editorCellInputSx}
        />
      </TableCell>
      <TableCell sx={bodyCellSx} align="center">
        {!isAddingProcess &&
        settingByProcess[editingOriginalProcess] ? (
          <Button
            size="small"
            startIcon={<HistoryRoundedIcon />}
            onClick={() => {
              setHistoryProcess(editingOriginalProcess);
              setHistoryOpen(true);
            }}
          >
            보기
          </Button>
        ) : (
          '-'
        )}
      </TableCell>
      <TableCell
        sx={{ ...bodyCellSx, minWidth: 82 }}
        align="center"
      >
        <Tooltip title="저장" arrow>
          <span>
            <IconButton
              size="small"
              color="primary"
              onClick={() => handleSaveInlineRow()}
              disabled={saving}
            >
              {saving ? (
                <CircularProgress size={17} />
              ) : (
                <SaveRoundedIcon fontSize="small" />
              )}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="취소" arrow>
          <IconButton
            size="small"
            onClick={handleCancelInlineEdit}
            disabled={saving}
          >
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  );

  const renderRateTab = () => (
    <Box
      sx={{
        minHeight: 0,
        flex: 1,
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        gap: 0.8,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          minHeight: 34,
          px: 0.75,
          py: 0.35,
          display: 'flex',
          alignItems: 'center',
          gap: 0.45,
          borderColor: '#94a3b8',
          boxShadow: 'none',
        }}
      >
        <Tooltip title="공정 추가" arrow>
          <span>
            <IconButton
              size="small"
              color="primary"
              aria-label="공정 추가"
              onClick={handleAddInlineProcess}
              disabled={!rateEditable || saving}
            >
              <AddCircleOutlineRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="공정 삭제" arrow>
          <span>
            <IconButton
              size="small"
              color="error"
              aria-label="공정 삭제"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={
                !rateEditable ||
                saving ||
                isAddingProcess ||
                Boolean(editingOriginalProcess) ||
                selectedProcesses.size === 0
              }
            >
              <RemoveCircleOutlineRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="공정 위로 이동" arrow>
          <span>
            <IconButton
              size="small"
              aria-label="공정 위로 이동"
              onClick={() => handleMoveProcesses('up')}
              disabled={
                !rateEditable ||
                saving ||
                isAddingProcess ||
                Boolean(editingOriginalProcess) ||
                selectedProcesses.size === 0
              }
            >
              <ArrowUpwardRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="공정 아래로 이동" arrow>
          <span>
            <IconButton
              size="small"
              aria-label="공정 아래로 이동"
              onClick={() => handleMoveProcesses('down')}
              disabled={
                !rateEditable ||
                saving ||
                isAddingProcess ||
                Boolean(editingOriginalProcess) ||
                selectedProcesses.size === 0
              }
            >
              <ArrowDownwardRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.35 }} />
        <Typography sx={{ fontSize: '0.65rem', color: '#64748b' }}>
          선택 {selectedProcesses.size.toLocaleString()}개
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography
          sx={{
            display: { xs: 'none', lg: 'block' },
            fontSize: '0.63rem',
            color: '#64748b',
          }}
        >
          공정명 첫 글자 입력 시 12개 가이드 검색 · 가이드 외 직접 입력
          가능 · 기존 행 더블클릭 수정
        </Typography>
      </Paper>

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          minHeight: 0,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Table stickyHeader size="small" sx={{ minWidth: 1620 }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={headerCellSx}>
                <Checkbox
                  size="small"
                  checked={
                    allProcessOptions.length > 0 &&
                    allProcessOptions.every((processType) =>
                      selectedProcesses.has(processType),
                    )
                  }
                  indeterminate={
                    allProcessOptions.some((processType) =>
                      selectedProcesses.has(processType),
                    ) &&
                    !allProcessOptions.every((processType) =>
                      selectedProcesses.has(processType),
                    )
                  }
                  onChange={handleToggleAllProcesses}
                  inputProps={{ 'aria-label': '공정 전체 선택' }}
                />
              </TableCell>
              {[
                '순서',
                '공정',
                '단위',
                '계약 노무비',
                '실행 노임총액',
                '총 예정물량',
                '실행단가',
                '확정단가',
                '적용일',
                '등록·변경 사유',
                '변경이력',
                '편집',
              ].map((label) => (
                <TableCell key={label} sx={headerCellSx} align="center">
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {allProcessOptions.map((processType) => {
              if (editingOriginalProcess === processType) {
                return renderRateEditorRow(`edit-${processType}`);
              }

              const setting = settingByProcess[processType];
              const processRow = catalogByProcess[processType];

              return (
                <TableRow
                  key={processType}
                  hover
                  onDoubleClick={() => beginInlineEdit(processType)}
                  sx={{ cursor: rateEditable ? 'cell' : 'default' }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selectedProcesses.has(processType)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => handleToggleProcess(processType)}
                      inputProps={{
                        'aria-label': `${processType} 공정 선택`,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="center">
                    {processRow?.sort_order || '-'}
                  </TableCell>
                  <TableCell
                    sx={{ ...bodyCellSx, fontWeight: 900 }}
                    align="center"
                  >
                    {processType}
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="center">
                    {setting?.unit || processRow?.unit || '-'}
                  </TableCell>
                  <TableCell sx={numberCellSx}>
                    {processRow
                      ? `${formatMoney(
                          processRow.contract_labor_amount,
                        )}원`
                      : '-'}
                  </TableCell>
                  <TableCell sx={numberCellSx}>
                    {setting
                      ? `${formatMoney(setting.execution_labor_total)}원`
                      : '-'}
                  </TableCell>
                  <TableCell sx={numberCellSx}>
                    {setting
                      ? formatQuantity(setting.planned_quantity)
                      : '-'}
                  </TableCell>
                  <TableCell sx={numberCellSx}>
                    {setting
                      ? `${formatMoney(setting.execution_unit_price)}원`
                      : '-'}
                  </TableCell>
                  <TableCell sx={numberCellSx}>
                    {setting?.confirmed_unit_price
                      ? `${formatMoney(setting.confirmed_unit_price)}원`
                      : '미확정'}
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="center">
                    {formatDate(setting?.effective_from)}
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    {setting?.change_reason || '-'}
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="center">
                    <Button
                      size="small"
                      startIcon={<HistoryRoundedIcon />}
                      disabled={!setting}
                      onClick={(event) => {
                        event.stopPropagation();
                        setHistoryProcess(processType);
                        setHistoryOpen(true);
                      }}
                    >
                      보기
                    </Button>
                  </TableCell>
                  <TableCell
                    sx={{ ...bodyCellSx, color: '#94a3b8' }}
                    align="center"
                  >
                    더블클릭
                  </TableCell>
                </TableRow>
              );
            })}

            {isAddingProcess && renderRateEditorRow('new-process')}

            {allProcessOptions.length === 0 && !isAddingProcess && (
              <TableRow>
                <TableCell colSpan={13} align="center" sx={{ py: 6 }}>
                  <Typography
                    sx={{
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      color: '#475569',
                    }}
                  >
                    아직 등록된 공정이 없습니다.
                  </Typography>
                  <Typography
                    sx={{ mt: 0.35, fontSize: '0.68rem', color: '#94a3b8' }}
                  >
                    왼쪽 위 + 버튼을 눌러 첫 공정을 입력해주세요.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  const renderQuantityTab = () => (
    <Box
      sx={{
        minHeight: 0,
        flex: 1,
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        gap: 1.1,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          p: 1.15,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={0.8}
          alignItems={{ lg: 'center' }}
        >
          <TextField
            select
            size="small"
            label="공정"
            value={quantityProcess}
            onChange={(event) => {
              setQuantityProcess(event.target.value);
              setQuantities({});
              setSelectedUnits(new Set());
            }}
            sx={{ minWidth: 145 }}
          >
            {allProcessOptions.map((processType) => (
              <MenuItem key={processType} value={processType}>
                {processType}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="동"
            value={buildingFilter}
            onChange={(event) => {
              setBuildingFilter(event.target.value);
              setFloorFilter('전체');
              setTypeFilter('전체');
              setQuantityPage(0);
            }}
            sx={{ minWidth: 125 }}
          >
            <MenuItem value="전체">전체 동</MenuItem>
            {buildingOptions.map((building) => (
              <MenuItem key={building} value={building}>
                {building}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="층"
            value={floorFilter}
            onChange={(event) => {
              setFloorFilter(event.target.value);
              setTypeFilter('전체');
              setQuantityPage(0);
            }}
            sx={{ minWidth: 105 }}
          >
            <MenuItem value="전체">전체 층</MenuItem>
            {floorOptions.map((floor) => (
              <MenuItem key={floor} value={floor}>
                {floor}층
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="타입"
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              setQuantityPage(0);
            }}
            sx={{ minWidth: 115 }}
          >
            <MenuItem value="전체">전체 타입</MenuItem>
            {typeOptions.map((unitType) => (
              <MenuItem key={unitType} value={unitType}>
                {unitType}
              </MenuItem>
            ))}
          </TextField>

          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={onlyUnassignedQuantity}
                onChange={(event) => {
                  setOnlyUnassignedQuantity(event.target.checked);
                  setQuantityPage(0);
                }}
              />
            }
            label={
              <Typography sx={{ fontSize: '0.69rem' }}>
                공정 물량 미지정만
              </Typography>
            }
            sx={{
              mr: 0,
              whiteSpace: 'nowrap',
              '& .MuiFormControlLabel-label': {
                lineHeight: 1,
              },
            }}
          />

          <TextField
            size="small"
            label="동·세대·타입 검색"
            value={unitKeyword}
            onChange={(event) => {
              setUnitKeyword(event.target.value);
              setQuantityPage(0);
            }}
            sx={{ minWidth: 145 }}
          />

          <Divider
            orientation="vertical"
            flexItem
            sx={{ display: { xs: 'none', lg: 'block' }, mx: 0.25 }}
          />

          <TextField
            size="small"
            label={`일괄 물량 (${selectedSetting?.unit || '-'})`}
            value={formatNumericInput(bulkQuantity)}
            onChange={(event) =>
              setBulkQuantity(
                normalizeNumericInput(event.target.value, 4),
              )
            }
            inputProps={{
              inputMode: 'decimal',
              style: { textAlign: 'right' },
            }}
            sx={{ minWidth: 145 }}
          />

          <Button
            variant="outlined"
            onClick={handleApplyBulkQuantity}
            disabled={selectedUnits.size === 0}
            sx={{ whiteSpace: 'nowrap' }}
          >
            선택 세대 적용
          </Button>

          <Button
            variant="contained"
            startIcon={
              saving ? (
                <CircularProgress size={15} color="inherit" />
              ) : (
                <SaveRoundedIcon />
              )
            }
            onClick={handleSaveQuantities}
            disabled={saving || quantityLoading}
            sx={{ whiteSpace: 'nowrap' }}
          >
            물량 저장
          </Button>

          <Box sx={{ flex: 1 }} />

          <Chip
            size="small"
            color={selectedSetting ? 'primary' : 'warning'}
            variant="outlined"
            label={
              selectedSetting
                ? `${
                    selectedSetting.confirmed_unit_price
                      ? '확정단가'
                      : '실행단가'
                  } ${formatMoney(selectedAppliedPrice)}원/${
                    selectedSetting.unit
                  }`
                : '노임단가 미설정'
            }
          />
        </Stack>

        <Stack
          direction="row"
          spacing={1.5}
          sx={{ mt: 0.8, flexWrap: 'wrap' }}
        >
          <Typography sx={{ fontSize: '0.67rem', color: '#64748b' }}>
            실제 세대 {validUnits.length.toLocaleString()}개
          </Typography>
          <Typography sx={{ fontSize: '0.67rem', color: '#64748b' }}>
            선택 {selectedUnits.size.toLocaleString()}개
          </Typography>
          <Typography sx={{ fontSize: '0.67rem', color: '#64748b' }}>
            총 입력물량 {formatQuantity(currentQuantityTotal)}
            {selectedSetting?.unit || ''}
          </Typography>
          <Typography sx={{ fontSize: '0.67rem', color: '#64748b' }}>
            예상 노임 {formatMoney(
              currentQuantityTotal * selectedAppliedPrice,
            )}
            원
          </Typography>
        </Stack>
      </Paper>

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          minHeight: 0,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={headerCellSx}>
                <Checkbox
                  size="small"
                  checked={
                    filteredUnits.length > 0 &&
                    filteredUnits.every((row) =>
                      selectedUnits.has(row.cellKey),
                    )
                  }
                  indeterminate={
                    filteredUnits.some((row) =>
                      selectedUnits.has(row.cellKey),
                    ) &&
                    !filteredUnits.every((row) =>
                      selectedUnits.has(row.cellKey),
                    )
                  }
                  onChange={handleToggleVisibleUnits}
                />
              </TableCell>
              {[
                '동',
                '층',
                '타입',
                '세대',
                '물량',
                '단위',
                '적용단가',
                '예상 노임',
              ].map((label) => (
                <TableCell key={label} sx={headerCellSx} align="center">
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedUnits.map((row) => {
              const quantity = quantities[row.cellKey] ?? '';
              const amount = toNumber(quantity) * selectedAppliedPrice;

              return (
                <TableRow
                  key={row.cellKey}
                  hover
                  selected={selectedUnits.has(row.cellKey)}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selectedUnits.has(row.cellKey)}
                      onChange={() => handleToggleUnit(row.cellKey)}
                    />
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="center">
                    {row.building}
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="center">
                    {row.floor || '-'}
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="center">
                    {row.unitType || '미지정'}
                  </TableCell>
                  <TableCell
                    sx={{ ...bodyCellSx, fontWeight: 900 }}
                    align="center"
                  >
                    {row.unit}
                  </TableCell>
                  <TableCell sx={{ ...bodyCellSx, width: 155 }}>
                    <InputBase
                      value={formatNumericInput(quantity)}
                      onChange={(event) =>
                        setQuantities((previous) => ({
                          ...previous,
                          [row.cellKey]: normalizeNumericInput(
                            event.target.value,
                            4,
                          ),
                        }))
                      }
                      inputProps={{ inputMode: 'decimal' }}
                      sx={{
                        width: '100%',
                        px: 0.8,
                        py: 0.25,
                        border: '1px solid #cbd5e1',
                        borderRadius: 0.75,
                        bgcolor: '#fff',
                        '& input': {
                          textAlign: 'right',
                          fontSize: '0.7rem',
                          py: 0.3,
                        },
                      }}
                    />
                  </TableCell>
                  <TableCell sx={bodyCellSx} align="center">
                    {selectedSetting?.unit || '-'}
                  </TableCell>
                  <TableCell sx={numberCellSx}>
                    {selectedSetting
                      ? `${formatMoney(selectedAppliedPrice)}원`
                      : '-'}
                  </TableCell>
                  <TableCell
                    sx={{
                      ...numberCellSx,
                      fontWeight: 900,
                      color: amount > 0 ? '#0f766e' : '#94a3b8',
                    }}
                  >
                    {amount > 0 ? `${formatMoney(amount)}원` : '-'}
                  </TableCell>
                </TableRow>
              );
            })}

            {!quantityLoading && filteredUnits.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 5 }}>
                  조건에 맞는 실제 세대가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {quantityLoading && (
          <Box
            sx={{
              py: 5,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <CircularProgress size={24} />
          </Box>
        )}

        <TablePagination
          component="div"
          count={filteredUnits.length}
          page={Math.min(
            quantityPage,
            Math.max(
              0,
              Math.ceil(filteredUnits.length / quantityRowsPerPage) - 1,
            ),
          )}
          onPageChange={(_event, page) => setQuantityPage(page)}
          rowsPerPage={quantityRowsPerPage}
          onRowsPerPageChange={(event) => {
            setQuantityRowsPerPage(Number(event.target.value));
            setQuantityPage(0);
          }}
          rowsPerPageOptions={[50, 100, 200, 500]}
          labelRowsPerPage="페이지당"
          labelDisplayedRows={({ from, to, count }) =>
            `${from.toLocaleString()}–${to.toLocaleString()} / ${count.toLocaleString()}`
          }
          sx={{
            borderTop: '1px solid #e2e8f0',
            '& .MuiTablePagination-toolbar': { minHeight: 42 },
          }}
        />
      </TableContainer>
    </Box>
  );

  const renderMonthlyTab = () => (
    <Box
      sx={{
        minHeight: 0,
        flex: 1,
        display: 'grid',
        gridTemplateRows: 'auto auto minmax(220px, 1fr) minmax(170px, 0.72fr)',
        gap: 1,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          p: 1,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            type="month"
            label="기준월"
            value={baseMonth}
            onChange={(event) => setBaseMonth(event.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 165 }}
          />
          <Button
            variant="outlined"
            startIcon={<RefreshRoundedIcon />}
            onClick={loadMonthly}
            disabled={monthlyLoading}
          >
            조회
          </Button>
          <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
            `작업완료` 상태의 완료일을 기준으로 집계합니다.
          </Typography>
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
        <SummaryCard
          label={`${baseMonth} 완료 세대`}
          value={`${toNumber(
            monthlyTotals.current_completed_units,
          ).toLocaleString()}세대`}
          helper="공정별 완료세대 합계"
        />
        <SummaryCard
          label={`${baseMonth} 노임 예상`}
          value={`${formatMoney(monthlyTotals.current_amount)}원`}
          helper="세대물량 × 완료일 적용단가"
          color="#0f766e"
        />
        <SummaryCard
          label="누계 노임 예상"
          value={`${formatMoney(monthlyTotals.cumulative_amount)}원`}
          helper={`${baseMonth} 말일까지 누계`}
          color="#1d4ed8"
        />
        <SummaryCard
          label="계산 누락 세대"
          value={`${(
            toNumber(monthlyTotals.missing_quantity_units) +
            toNumber(monthlyTotals.missing_rate_units)
          ).toLocaleString()}건`}
          helper="물량 또는 단가가 없는 완료세대"
          color={
            toNumber(monthlyTotals.missing_quantity_units) +
              toNumber(monthlyTotals.missing_rate_units) >
            0
              ? '#b45309'
              : '#15803d'
          }
        />
      </Stack>

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          minHeight: 0,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {[
                '공정',
                '금월 완료세대',
                '금월 물량',
                '평균 적용단가',
                '금월 노임',
                '누계 물량',
                '누계 노임',
                '물량 미입력',
                '단가 미설정',
              ].map((label) => (
                <TableCell key={label} sx={headerCellSx} align="center">
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {monthlySummary.map((row) => (
              <TableRow
                key={row.process_type}
                hover
                selected={detailProcess === row.process_type}
                onClick={() => setDetailProcess(row.process_type)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell
                  sx={{ ...bodyCellSx, fontWeight: 900 }}
                  align="center"
                >
                  {row.process_type}
                </TableCell>
                <TableCell sx={numberCellSx}>
                  {toNumber(row.current_completed_units).toLocaleString()}
                </TableCell>
                <TableCell sx={numberCellSx}>
                  {formatQuantity(row.current_quantity)}
                </TableCell>
                <TableCell sx={numberCellSx}>
                  {toNumber(row.average_unit_price) > 0
                    ? `${formatMoney(row.average_unit_price)}원`
                    : '-'}
                </TableCell>
                <TableCell
                  sx={{
                    ...numberCellSx,
                    fontWeight: 900,
                    color: '#0f766e',
                  }}
                >
                  {formatMoney(row.current_amount)}원
                </TableCell>
                <TableCell sx={numberCellSx}>
                  {formatQuantity(row.cumulative_quantity)}
                </TableCell>
                <TableCell
                  sx={{
                    ...numberCellSx,
                    fontWeight: 900,
                    color: '#1d4ed8',
                  }}
                >
                  {formatMoney(row.cumulative_amount)}원
                </TableCell>
                <TableCell
                  sx={{
                    ...numberCellSx,
                    color:
                      toNumber(row.missing_quantity_units) > 0
                        ? '#b45309'
                        : '#64748b',
                  }}
                >
                  {toNumber(row.missing_quantity_units).toLocaleString()}
                </TableCell>
                <TableCell
                  sx={{
                    ...numberCellSx,
                    color:
                      toNumber(row.missing_rate_units) > 0
                        ? '#b91c1c'
                        : '#64748b',
                  }}
                >
                  {toNumber(row.missing_rate_units).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}

            {!monthlyLoading && monthlySummary.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 5 }}>
                  선택한 월의 완료 공정이 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          minHeight: 0,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Box
          sx={{
            px: 1.2,
            py: 0.65,
            borderBottom: '1px solid #e2e8f0',
            bgcolor: '#f8fafc',
          }}
        >
          <Typography sx={{ fontSize: '0.73rem', fontWeight: 900 }}>
            {detailProcess || '공정 선택'} 세대별 계산 근거
          </Typography>
        </Box>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {[
                '동',
                '세대',
                '완료일',
                '물량',
                '단위',
                '적용단가',
                '구분',
                '예상 노임',
              ].map((label) => (
                <TableCell key={label} sx={headerCellSx} align="center">
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleMonthlyDetails.map((row) => (
              <TableRow key={`${row.process_type}-${row.building}-${row.unit}`}>
                <TableCell sx={bodyCellSx} align="center">
                  {row.building}
                </TableCell>
                <TableCell sx={bodyCellSx} align="center">
                  {row.unit}
                </TableCell>
                <TableCell sx={bodyCellSx} align="center">
                  {formatDate(row.completion_date)}
                </TableCell>
                <TableCell sx={numberCellSx}>
                  {formatQuantity(row.quantity)}
                </TableCell>
                <TableCell sx={bodyCellSx} align="center">
                  {row.unit_name || '-'}
                </TableCell>
                <TableCell sx={numberCellSx}>
                  {toNumber(row.applied_unit_price) > 0
                    ? `${formatMoney(row.applied_unit_price)}원`
                    : '-'}
                </TableCell>
                <TableCell sx={bodyCellSx} align="center">
                  {row.price_source || '-'}
                </TableCell>
                <TableCell
                  sx={{
                    ...numberCellSx,
                    fontWeight: 900,
                  }}
                >
                  {formatMoney(row.amount)}원
                </TableCell>
              </TableRow>
            ))}

            {detailProcess && visibleMonthlyDetails.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                  표시할 세대별 계산자료가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          px: 1.25,
          pt: 0.7,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          alignItems={{ xs: 'stretch', md: 'center' }}
          spacing={1}
          sx={{ width: '100%' }}
        >
          <Box sx={{ flexShrink: 0 }}>
            <Typography
              sx={{
                fontSize: '0.9rem',
                fontWeight: 900,
                color: '#0f172a',
              }}
            >
              공정별 노임작성
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: '#64748b' }}>
              {projectName} · 실행/확정단가와 세대별 물량을 연결해 월별
              예상 노임을 계산합니다.
            </Typography>
          </Box>

          <Box sx={{ flex: 1 }} />

          <Stack
            direction="row"
            spacing={0.5}
            alignItems="center"
            justifyContent="flex-end"
            sx={{ flexWrap: 'wrap' }}
          >
            {activeTab === 1 && (
              <Tooltip title="현재 공정 물량 전체 삭제" arrow>
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    aria-label="현재 공정 물량 전체 삭제"
                    onClick={() => setQuantityDeleteDialogOpen(true)}
                    disabled={
                      saving ||
                      quantityLoading ||
                      !quantityProcess
                    }
                  >
                    <DeleteSweepRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            )}

            <Button
              size="small"
              startIcon={<RefreshRoundedIcon />}
              onClick={() => {
                loadOverview();
                loadUnitTypes();
                loadQuantities();
                loadMonthly();
              }}
              disabled={
                overviewLoading || quantityLoading || monthlyLoading
              }
              sx={{ whiteSpace: 'nowrap' }}
            >
              새로고침
            </Button>
          </Stack>
        </Stack>

        <Tabs
          value={activeTab}
          onChange={(_event, value) => {
            setActiveTab(value);
            setMessage(null);
            setErrorMessage('');
          }}
          sx={{
            mt: 0.35,
            minHeight: 34,
            '& .MuiTab-root': {
              minHeight: 34,
              py: 0.5,
              fontSize: '0.72rem',
              fontWeight: 800,
            },
          }}
        >
          <Tab label="1. 공정별 노임단가" />
          <Tab label="2. 세대별 물량 입력" />
          <Tab label="3. 월별 노임 예상현황" />
        </Tabs>
      </Paper>

      <Snackbar
        open={Boolean(errorMessage || message)}
        autoHideDuration={3000}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        TransitionComponent={Fade}
        transitionDuration={{ enter: 220, exit: 500 }}
        onClose={(_event, reason) => {
          if (reason === 'clickaway') return;
          setErrorMessage('');
          setMessage(null);
        }}
        sx={{
          top: '72px !important',
          zIndex: (theme) => theme.zIndex.snackbar + 10,
          '& .MuiAlert-root': {
            minWidth: { xs: 280, sm: 420 },
            maxWidth: 'min(680px, calc(100vw - 32px))',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.22)',
          },
        }}
      >
        <Alert
          severity={
            errorMessage ? 'error' : message?.severity || 'info'
          }
          variant="filled"
          onClose={() => {
            setErrorMessage('');
            setMessage(null);
          }}
          sx={{ width: '100%' }}
        >
          {errorMessage || message?.text || ''}
        </Alert>
      </Snackbar>

      {overviewLoading && settings.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderColor: '#cbd5e1',
          }}
        >
          <Stack alignItems="center" spacing={1}>
            <CircularProgress size={28} />
            <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>
              노임 기준을 불러오는 중입니다.
            </Typography>
          </Stack>
        </Paper>
      ) : (
        <>
          {activeTab === 0 && renderRateTab()}
          {activeTab === 1 && renderQuantityTab()}
          {activeTab === 2 && renderMonthlyTab()}
        </>
      )}

      <Dialog
        open={deleteDialogOpen}
        onClose={() => !saving && setDeleteDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          선택 공정 삭제
        </DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ fontSize: '0.82rem', lineHeight: 1.65 }}>
            선택한{' '}
            <strong>{selectedProcesses.size.toLocaleString()}개 공정</strong>
            을 노임작성 목록에서 삭제하시겠습니까?
          </Typography>
          <Stack
            direction="row"
            spacing={0.6}
            useFlexGap
            flexWrap="wrap"
            sx={{ mt: 1 }}
          >
            {allProcessOptions
              .filter((processType) =>
                selectedProcesses.has(processType),
              )
              .map((processType) => (
                <Chip
                  key={processType}
                  size="small"
                  label={processType}
                />
              ))}
          </Stack>
          <Typography
            sx={{ mt: 1, fontSize: '0.7rem', color: '#64748b' }}
          >
            기존 단가 변경이력과 저장된 세대별 물량은 삭제하지 않고
            보존합니다. 같은 이름으로 다시 추가하면 기존 자료를 이어서
            사용할 수 있습니다.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={saving}
          >
            취소
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDeleteProcesses}
            disabled={saving || selectedProcesses.size === 0}
          >
            선택 삭제
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={quantityDeleteDialogOpen}
        onClose={() =>
          !saving && setQuantityDeleteDialogOpen(false)
        }
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          현재 공정 물량 전체 삭제
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 1.2 }}>
            삭제 후에는 되돌릴 수 없습니다.
          </Alert>
          <Typography sx={{ fontSize: '0.82rem', lineHeight: 1.65 }}>
            <strong>{quantityProcess || '선택 공정'}</strong>에 저장된
            모든 세대별 물량을 삭제하시겠습니까?
          </Typography>
          <Typography
            sx={{ mt: 1, fontSize: '0.7rem', color: '#64748b' }}
          >
            현재 화면의 동·층·타입 필터와 관계없이 이 현장의 해당 공정
            물량 전체가 삭제됩니다. 공정과 단가 변경이력은 삭제되지
            않습니다.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setQuantityDeleteDialogOpen(false)}
            disabled={saving}
          >
            취소
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDeleteAllQuantities}
            disabled={saving || !quantityProcess}
          >
            전체 삭제
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          {historyProcess} 노임단가 변경이력
        </DialogTitle>
        <DialogContent dividers>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {[
                    '적용일',
                    '구분',
                    '실행단가',
                    '확정단가',
                    '적용단가',
                    '사유',
                    '등록자',
                  ].map((label) => (
                    <TableCell key={label} sx={headerCellSx} align="center">
                      {label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedProcessHistory.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell sx={bodyCellSx} align="center">
                      {formatDate(row.effective_from)}
                    </TableCell>
                    <TableCell sx={bodyCellSx} align="center">
                      {row.confirmed_unit_price ? '확정단가' : '실행단가'}
                    </TableCell>
                    <TableCell sx={numberCellSx}>
                      {formatMoney(row.execution_unit_price)}원
                    </TableCell>
                    <TableCell sx={numberCellSx}>
                      {row.confirmed_unit_price
                        ? `${formatMoney(row.confirmed_unit_price)}원`
                        : '-'}
                    </TableCell>
                    <TableCell sx={numberCellSx}>
                      {formatMoney(row.applied_unit_price)}원
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      {row.change_reason || '-'}
                    </TableCell>
                    <TableCell sx={bodyCellSx} align="center">
                      {row.created_by_name || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>닫기</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
