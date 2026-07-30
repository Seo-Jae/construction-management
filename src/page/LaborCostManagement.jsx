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
  IconButton,
  InputBase,
  Menu,
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
import ArrowDropDownRoundedIcon from '@mui/icons-material/ArrowDropDownRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DeleteSweepRoundedIcon from '@mui/icons-material/DeleteSweepRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import FilterAltOffRoundedIcon from '@mui/icons-material/FilterAltOffRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { supabase } from '../supabaseClient';
import LaborPeriodStructureDialog from '../components/LaborPeriodStructureDialog.jsx';
import { getProjectCellKeys } from '../utils/buildingUnits.js';
import {
  LABOR_QUANTITY_EXCEL_TEST_PROJECT,
  isLaborQuantityExcelTestProject,
  parseLaborQuantityWorkbookFile,
  saveLaborQuantityWorkbook,
} from '../utils/laborQuantityExcel.js';

const DEFAULT_UNIT = '㎡';
const DEFAULT_CHANGE_REASON = '실행 예산 기준 최초 등록';
const GUIDE_PROCESS_OPTIONS = [
  '바닥먹',
  '단열',
  '합지',
  '경량벽체',
  '세대천정',
  '공용홀천정',
  '몰딩',
  '걸레받이',
  '수장',
  '외주',
  '직영',
  '기타',
];
const UNIT_OPTIONS = ['㎡', 'm', 'EA', '식', '세대'];
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
const createEmptyQuantityColumnFilters = () => ({
  building: [],
  floor: [],
  unitType: [],
  unit: [],
  quantityStatus: [],
  unitName: [],
  confirmationRound: [],
  appliedRateStatus: [],
  amountStatus: [],
});

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

const getMonthKeysInRange = (startMonth, endMonth) => {
  const parseMonth = (value) => {
    const matched = /^(\d{4})-(\d{2})$/.exec(String(value || ''));

    if (!matched) return null;

    const year = Number(matched[1]);
    const month = Number(matched[2]);

    if (month < 1 || month > 12) return null;
    return { year, month };
  };

  const start = parseMonth(startMonth);
  const end = parseMonth(endMonth);

  if (!start || !end) return [];

  const startIndex = start.year * 12 + start.month - 1;
  const endIndex = end.year * 12 + end.month - 1;

  if (startIndex > endIndex) return [];

  return Array.from(
    { length: endIndex - startIndex + 1 },
    (_unused, offset) => {
      const monthIndex = startIndex + offset;
      const year = Math.floor(monthIndex / 12);
      const month = (monthIndex % 12) + 1;
      return `${year}-${String(month).padStart(2, '0')}`;
    },
  );
};

const getMonthRangeLabel = (startMonth, endMonth) => {
  if (!startMonth || !endMonth) return '조회 기간';
  return startMonth === endMonth
    ? startMonth
    : `${startMonth} ~ ${endMonth}`;
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

const mergeMonthlyStatusResults = (monthlyResults) => {
  const results = monthlyResults || [];
  const endResult = results[results.length - 1] || {};
  const details = results.flatMap((result) => result?.details || []);
  const periodByProcess = new Map();

  details.forEach((row) => {
    const processType = row.process_type;
    if (!processType) return;

    if (!periodByProcess.has(processType)) {
      periodByProcess.set(processType, {
        currentCompletedUnits: 0,
        currentQuantity: 0,
        currentAmount: 0,
        pricedQuantity: 0,
        missingQuantityUnits: 0,
        missingRateUnits: 0,
      });
    }

    const aggregate = periodByProcess.get(processType);
    const quantity = toNumber(row.quantity);
    const appliedUnitPrice = toNumber(row.applied_unit_price);

    aggregate.currentCompletedUnits += 1;
    aggregate.currentQuantity += quantity;
    aggregate.currentAmount += toNumber(row.amount);

    if (quantity <= 0) {
      aggregate.missingQuantityUnits += 1;
    } else if (appliedUnitPrice <= 0) {
      aggregate.missingRateUnits += 1;
    } else {
      aggregate.pricedQuantity += quantity;
    }
  });

  const summaryByProcess = new Map(
    (endResult?.summary || []).map((row) => [
      row.process_type,
      {
        ...row,
        current_completed_units: 0,
        current_quantity: 0,
        current_amount: 0,
        average_unit_price: 0,
        missing_quantity_units: 0,
        missing_rate_units: 0,
      },
    ]),
  );

  periodByProcess.forEach((aggregate, processType) => {
    const current = summaryByProcess.get(processType) || {
      process_type: processType,
      cumulative_quantity: 0,
      cumulative_amount: 0,
    };

    summaryByProcess.set(processType, {
      ...current,
      current_completed_units: aggregate.currentCompletedUnits,
      current_quantity: aggregate.currentQuantity,
      current_amount: aggregate.currentAmount,
      average_unit_price:
        aggregate.pricedQuantity > 0
          ? aggregate.currentAmount / aggregate.pricedQuantity
          : 0,
      missing_quantity_units: aggregate.missingQuantityUnits,
      missing_rate_units: aggregate.missingRateUnits,
    });
  });

  const summary = Array.from(summaryByProcess.values());

  return {
    summary,
    details,
    totals: {
      current_completed_units: summary.reduce(
        (total, row) =>
          total + toNumber(row.current_completed_units),
        0,
      ),
      current_amount: summary.reduce(
        (total, row) => total + toNumber(row.current_amount),
        0,
      ),
      cumulative_amount: toNumber(
        endResult?.totals?.cumulative_amount,
      ),
      missing_quantity_units: summary.reduce(
        (total, row) =>
          total + toNumber(row.missing_quantity_units),
        0,
      ),
      missing_rate_units: summary.reduce(
        (total, row) => total + toNumber(row.missing_rate_units),
        0,
      ),
    },
  };
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

const quantityBodyCellSx = {
  ...bodyCellSx,
  height: 30,
  py: 0.18,
};

function ExcelFilterHeaderCell({
  label,
  options = [],
  selectedValues = [],
  onChange,
  minWidth,
}) {
  const [anchorElement, setAnchorElement] = useState(null);
  const [searchText, setSearchText] = useState('');
  const selectedSet = useMemo(
    () => new Set(selectedValues.map(String)),
    [selectedValues],
  );
  const visibleOptions = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return options;

    return options.filter((option) =>
      String(option.label ?? option.value)
        .toLowerCase()
        .includes(keyword),
    );
  }, [options, searchText]);
  const isActive = selectedSet.size > 0;

  const closeMenu = () => {
    setAnchorElement(null);
    setSearchText('');
  };

  const toggleOption = (value) => {
    const next = new Set(selectedSet);
    const stringValue = String(value);

    if (next.has(stringValue)) next.delete(stringValue);
    else next.add(stringValue);

    onChange(Array.from(next));
  };

  return (
    <TableCell
      sx={{
        ...headerCellSx,
        minWidth,
        p: 0,
        bgcolor: isActive ? '#dbeafe' : headerCellSx.bgcolor,
      }}
      align="center"
    >
      <Button
        fullWidth
        size="small"
        color="inherit"
        endIcon={<ArrowDropDownRoundedIcon fontSize="small" />}
        onClick={(event) => setAnchorElement(event.currentTarget)}
        sx={{
          minWidth: 0,
          minHeight: 34,
          px: 0.65,
          borderRadius: 0,
          justifyContent: 'center',
          color: isActive ? '#1d4ed8' : '#334155',
          fontSize: '0.68rem',
          fontWeight: 900,
          whiteSpace: 'nowrap',
          '& .MuiButton-endIcon': {
            ml: 0.15,
          },
        }}
      >
        {label}
        {isActive ? ` (${selectedSet.size})` : ''}
      </Button>

      <Menu
        anchorEl={anchorElement}
        open={Boolean(anchorElement)}
        onClose={closeMenu}
        MenuListProps={{ dense: true }}
        slotProps={{
          paper: {
            sx: {
              width: 230,
              maxHeight: 390,
              border: '1px solid #cbd5e1',
              boxShadow: '0 12px 28px rgba(15, 23, 42, 0.18)',
            },
          },
        }}
      >
        <Box
          sx={{ px: 1, pt: 0.7, pb: 0.45 }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <InputBase
            autoFocus
            fullWidth
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={`${label} 검색`}
            sx={{
              height: 30,
              px: 0.9,
              border: '1px solid #cbd5e1',
              borderRadius: 1,
              bgcolor: '#fff',
              fontSize: '0.69rem',
            }}
          />
        </Box>
        <MenuItem
          onClick={() => {
            onChange([]);
            closeMenu();
          }}
          sx={{ fontSize: '0.69rem', fontWeight: 800 }}
        >
          <Checkbox size="small" checked={!isActive} sx={{ p: 0.45, mr: 0.5 }} />
          전체 표시
        </MenuItem>
        <Divider />
        {visibleOptions.map((option) => {
          const optionValue = String(option.value);
          return (
            <MenuItem
              key={optionValue}
              onClick={() => toggleOption(optionValue)}
              sx={{ minHeight: 30, fontSize: '0.68rem' }}
            >
              <Checkbox
                size="small"
                checked={selectedSet.has(optionValue)}
                sx={{ p: 0.45, mr: 0.5 }}
              />
              <Box
                component="span"
                sx={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {option.label ?? option.value}
              </Box>
            </MenuItem>
          );
        })}
        {visibleOptions.length === 0 && (
          <MenuItem disabled sx={{ fontSize: '0.68rem' }}>
            검색 결과가 없습니다.
          </MenuItem>
        )}
      </Menu>
    </TableCell>
  );
}

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
  const [showHiddenHistory, setShowHiddenHistory] = useState(false);
  const [historyActionId, setHistoryActionId] = useState('');
  const [historyDeleteTarget, setHistoryDeleteTarget] = useState(null);
  const [rateRoundSavingId, setRateRoundSavingId] = useState('');
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
  const [quantityRounds, setQuantityRounds] = useState({});
  const [selectedUnits, setSelectedUnits] = useState(() => new Set());
  const [quantityColumnFilters, setQuantityColumnFilters] = useState(
    createEmptyQuantityColumnFilters,
  );
  const [bulkQuantity, setBulkQuantity] = useState('');
  const [bulkRateRound, setBulkRateRound] = useState('');
  const [quantityPage, setQuantityPage] = useState(0);
  const [quantityRowsPerPage, setQuantityRowsPerPage] = useState(100);
  const [quantityDeleteDialogOpen, setQuantityDeleteDialogOpen] =
    useState(false);
  const [quantityExcelLoading, setQuantityExcelLoading] =
    useState(false);
  const [quantityExcelResult, setQuantityExcelResult] =
    useState(null);
  const [quantityHasPendingChanges, setQuantityHasPendingChanges] =
    useState(false);
  const quantityExcelFileInputRef = useRef(null);

  const [startMonth, setStartMonth] = useState(getKoreaMonthKey());
  const [endMonth, setEndMonth] = useState(getKoreaMonthKey());
  const [monthlySummary, setMonthlySummary] = useState([]);
  const [monthlyDetails, setMonthlyDetails] = useState([]);
  const [monthlyTotals, setMonthlyTotals] = useState({});
  const [detailProcess, setDetailProcess] = useState('');
  const [periodStructureOpen, setPeriodStructureOpen] = useState(false);
  const [progressMappings, setProgressMappings] = useState({});
  const [mappingDraft, setMappingDraft] = useState([]);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingDirty, setMappingDirty] = useState(false);
  const monthlyRangeLabel = getMonthRangeLabel(startMonth, endMonth);

  const rateEditable = canManageRates(userProfile);
  const quantityExcelTestEnabled =
    isLaborQuantityExcelTestProject(projectName);

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

  const progressProcessOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...(processOptions || []),
            ...Object.values(progressMappings || {}).flat(),
          ]
            .map((processType) => String(processType || '').trim())
            .filter(Boolean),
        ),
      ).sort((first, second) =>
        first.localeCompare(second, 'ko', { numeric: true }),
      ),
    [processOptions, progressMappings],
  );

  const rateProcessOrder = useMemo(() => {
    if (!overviewLoaded) return [];

    return processCatalog
      .map((row, index) => ({ ...row, originalIndex: index }))
      .filter(
        (row) =>
          row.is_active !== false &&
          Boolean(settingByProcess[row.process_type]),
      )
      .sort((first, second) => {
        const firstOrder = toNumber(first.sort_order);
        const secondOrder = toNumber(second.sort_order);

        if (firstOrder > 0 && secondOrder > 0) {
          return firstOrder - secondOrder;
        }
        if (firstOrder > 0) return -1;
        if (secondOrder > 0) return 1;
        return first.originalIndex - second.originalIndex;
      })
      .map((row) => row.process_type)
      .filter(Boolean);
  }, [overviewLoaded, processCatalog, settingByProcess]);

  const getEffectiveProgressProcesses = useCallback(
    (laborProcessType) => {
      const explicitMappings = progressMappings[laborProcessType] || [];
      if (explicitMappings.length > 0) return explicitMappings;

      return progressProcessOptions.includes(laborProcessType)
        ? [laborProcessType]
        : [];
    },
    [progressMappings, progressProcessOptions],
  );

  const detailProgressProcesses = useMemo(
    () => getEffectiveProgressProcesses(detailProcess),
    [detailProcess, getEffectiveProgressProcesses],
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

  const quantityFilterOptions = useMemo(() => {
    const toOptions = (values, labelFormatter = (value) => value) =>
      Array.from(new Set(values.map((value) => String(value))))
        .filter(Boolean)
        .sort((first, second) =>
          first.localeCompare(second, 'ko', { numeric: true }),
        )
        .map((value) => ({
          value,
          label: labelFormatter(value),
        }));

    const confirmationRounds = rateHistory
      .filter(
        (row) =>
          row.process_type === quantityProcess &&
          toNumber(row.confirmation_round) > 0 &&
          toNumber(row.confirmed_unit_price) > 0,
      )
      .map((row) => String(toNumber(row.confirmation_round)));
    const unitName =
      settingByProcess[quantityProcess]?.unit || '-';

    return {
      building: toOptions(validUnits.map((row) => row.building)),
      floor: toOptions(
        validUnits
          .map((row) => row.floor)
          .filter((floor) => floor > 0),
        (floor) => `${floor}층`,
      ),
      unitType: toOptions(validUnits.map((row) => row.unitType)),
      unit: toOptions(validUnits.map((row) => row.unit)),
      quantityStatus: [
        { value: '입력완료', label: '입력완료' },
        { value: '미입력', label: '미입력' },
      ],
      unitName: [{ value: unitName, label: unitName }],
      confirmationRound: [
        { value: '미지정', label: '미지정' },
        ...toOptions(
          confirmationRounds,
          (round) => `${round}차 확정`,
        ),
      ],
      appliedRateStatus: [
        { value: '설정됨', label: '설정됨' },
        { value: '미설정', label: '미설정' },
      ],
      amountStatus: [
        { value: '계산됨', label: '계산됨' },
        { value: '미계산', label: '미계산' },
      ],
    };
  }, [
    quantityProcess,
    rateHistory,
    settingByProcess,
    validUnits,
  ]);

  const filteredUnits = useMemo(() => {
    const matches = (filterName, value) => {
      const selected = quantityColumnFilters[filterName] || [];
      return (
        selected.length === 0 ||
        selected.includes(String(value))
      );
    };
    const unitName =
      settingByProcess[quantityProcess]?.unit || '-';

    return validUnits.filter((row) => {
      const quantity = toNumber(quantities[row.cellKey]);
      const confirmationRound = toNumber(
        quantityRounds[row.cellKey],
      );
      const quantityStatus =
        quantity > 0 ? '입력완료' : '미입력';
      const roundValue =
        confirmationRound > 0
          ? String(confirmationRound)
          : '미지정';
      const appliedRateStatus =
        confirmationRound > 0 ? '설정됨' : '미설정';
      const amountStatus =
        quantity > 0 && confirmationRound > 0
          ? '계산됨'
          : '미계산';

      return (
        matches('building', row.building) &&
        matches('floor', row.floor) &&
        matches('unitType', row.unitType) &&
        matches('unit', row.unit) &&
        matches('quantityStatus', quantityStatus) &&
        matches('unitName', unitName) &&
        matches('confirmationRound', roundValue) &&
        matches('appliedRateStatus', appliedRateStatus) &&
        matches('amountStatus', amountStatus)
      );
    });
  }, [
    quantityColumnFilters,
    quantityProcess,
    quantities,
    quantityRounds,
    settingByProcess,
    validUnits,
  ]);

  const activeQuantityFilterCount = useMemo(
    () =>
      Object.values(quantityColumnFilters).filter(
        (values) => values.length > 0,
      ).length,
    [quantityColumnFilters],
  );

  const paginatedUnits = useMemo(
    () =>
      filteredUnits.slice(
        quantityPage * quantityRowsPerPage,
        quantityPage * quantityRowsPerPage + quantityRowsPerPage,
      ),
    [filteredUnits, quantityPage, quantityRowsPerPage],
  );

  const selectedSetting = settingByProcess[quantityProcess] || null;
  const confirmedRatesByProcess = useMemo(
    () =>
      rateHistory.reduce((result, row) => {
        const confirmationRound = Math.round(
          toNumber(row.confirmation_round),
        );

        if (
          confirmationRound <= 0 ||
          toNumber(row.confirmed_unit_price) <= 0
        ) {
          return result;
        }

        const current = result[row.process_type];

        if (
          !current ||
          confirmationRound > toNumber(current.confirmation_round)
        ) {
          result[row.process_type] = row;
        }

        return result;
      }, {}),
    [rateHistory],
  );

  const quantityRateOptions = useMemo(
    () =>
      rateHistory
        .filter(
          (row) =>
            row.process_type === quantityProcess &&
            toNumber(row.confirmation_round) > 0 &&
            toNumber(row.confirmed_unit_price) > 0,
        )
        .sort(
          (first, second) =>
            toNumber(first.confirmation_round) -
            toNumber(second.confirmation_round),
        ),
    [quantityProcess, rateHistory],
  );

  const quantityRateByRound = useMemo(
    () =>
      quantityRateOptions.reduce((result, row) => {
        result[toNumber(row.confirmation_round)] = row;
        return result;
      }, {}),
    [quantityRateOptions],
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

      const rateRoundRows = [];
      let rateRoundOffset = 0;

      while (true) {
        const {
          data: rateRoundPage,
          error: rateRoundError,
        } = await supabase
          .from('labor_process_rate_versions')
          .select('id, confirmation_round, is_hidden')
          .eq('project_name', projectName)
          .range(
            rateRoundOffset,
            rateRoundOffset + SUPABASE_READ_PAGE_SIZE - 1,
          );

        if (rateRoundError) throw rateRoundError;

        const pageRows = rateRoundPage || [];
        rateRoundRows.push(...pageRows);

        if (pageRows.length < SUPABASE_READ_PAGE_SIZE) {
          break;
        }

        rateRoundOffset += SUPABASE_READ_PAGE_SIZE;
      }

      const roundByRateId = rateRoundRows.reduce((result, row) => {
        result[row.id] = row.confirmation_round;
        return result;
      }, {});
      const hiddenByRateId = rateRoundRows.reduce((result, row) => {
        result[row.id] = row.is_hidden === true;
        return result;
      }, {});

      const nextSettings = (data?.settings || []).map((row) => ({
        ...row,
        confirmation_round: roundByRateId[row.id] ?? null,
        is_hidden: hiddenByRateId[row.id] === true,
      }));
      const nextHistory = (data?.history || []).map((row) => ({
        ...row,
        confirmation_round: roundByRateId[row.id] ?? null,
        is_hidden: hiddenByRateId[row.id] === true,
      }));
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
      setQuantityRounds({});
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

      const quantityRoundRows = [];
      let quantityRoundOffset = 0;

      while (true) {
        const {
          data: quantityRoundPage,
          error: quantityRoundError,
        } = await supabase
          .from('labor_unit_quantities')
          .select('building, unit, confirmation_round')
          .eq('project_name', projectName)
          .eq('process_type', quantityProcess)
          .range(
            quantityRoundOffset,
            quantityRoundOffset + SUPABASE_READ_PAGE_SIZE - 1,
          );

        if (quantityRoundError) throw quantityRoundError;

        const pageRows = quantityRoundPage || [];
        quantityRoundRows.push(...pageRows);

        if (pageRows.length < SUPABASE_READ_PAGE_SIZE) {
          break;
        }

        quantityRoundOffset += SUPABASE_READ_PAGE_SIZE;
      }

      const nextQuantities = rows.reduce((result, row) => {
        result[`${row.building}-${row.unit}`] = row.quantity;
        return result;
      }, {});
      const nextQuantityRounds = quantityRoundRows.reduce(
        (result, row) => {
          result[`${row.building}-${row.unit}`] =
            row.confirmation_round || '';
          return result;
        },
        {},
      );

      setQuantities(nextQuantities);
      setQuantityRounds(nextQuantityRounds);
      setSelectedUnits(new Set());
      setQuantityHasPendingChanges(false);
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

  const loadProgressMappings = useCallback(async () => {
    if (!projectName) {
      setProgressMappings({});
      return;
    }

    setMappingLoading(true);

    try {
      const rows = [];
      let offset = 0;

      while (true) {
        const { data, error } = await supabase
          .from('labor_progress_process_mappings')
          .select(
            'labor_process_type, progress_process_type, sort_order',
          )
          .eq('project_name', projectName)
          .order('labor_process_type', { ascending: true })
          .order('sort_order', { ascending: true })
          .order('progress_process_type', { ascending: true })
          .range(
            offset,
            offset + SUPABASE_READ_PAGE_SIZE - 1,
          );

        if (error) throw error;

        const pageRows = data || [];
        rows.push(...pageRows);

        if (pageRows.length < SUPABASE_READ_PAGE_SIZE) break;
        offset += SUPABASE_READ_PAGE_SIZE;
      }

      const nextMappings = rows.reduce((result, row) => {
        const laborProcessType = String(
          row.labor_process_type || '',
        ).trim();
        const progressProcessType = String(
          row.progress_process_type || '',
        ).trim();

        if (!laborProcessType || !progressProcessType) return result;
        if (!result[laborProcessType]) result[laborProcessType] = [];
        if (!result[laborProcessType].includes(progressProcessType)) {
          result[laborProcessType].push(progressProcessType);
        }
        return result;
      }, {});

      setProgressMappings(nextMappings);
    } catch (error) {
      console.error('노임-공정진척 연결 불러오기 오류:', error);
      setErrorMessage(
        `공정진척 연결을 불러오지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setMappingLoading(false);
    }
  }, [projectName]);

  const saveProgressMappings = async () => {
    if (!projectName || !detailProcess || mappingSaving) return;

    setMappingSaving(true);
    setErrorMessage('');

    try {
      const normalizedMappings = Array.from(
        new Set(
          (mappingDraft || [])
            .map((processType) => String(processType || '').trim())
            .filter(Boolean),
        ),
      );

      const { data, error } = await supabase.rpc(
        'save_labor_progress_process_mappings',
        {
          p_project_name: projectName,
          p_labor_process_type: detailProcess,
          p_progress_process_types: normalizedMappings,
        },
      );

      if (error) throw error;

      await loadProgressMappings();
      setMappingDirty(false);
      setMessage({
        severity: 'success',
        text:
          normalizedMappings.length > 0
            ? `${detailProcess} 노임을 ${normalizedMappings.join(
                ', ',
              )} 공정진척과 연결했습니다.`
            : `${detailProcess}의 별도 연결을 초기화했습니다. 동일명 공정이 있으면 자동으로 연결됩니다.`,
      });
      await loadMonthly();

      return data;
    } catch (error) {
      console.error('노임-공정진척 연결 저장 오류:', error);
      setErrorMessage(
        `공정진척 연결을 저장하지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setMappingSaving(false);
    }
  };

  const loadMonthly = useCallback(async () => {
    if (!projectName || !startMonth || !endMonth) return;

    const monthKeys = getMonthKeysInRange(startMonth, endMonth);

    if (monthKeys.length === 0) {
      setErrorMessage(
        '시작월은 종료월보다 늦을 수 없습니다.',
      );
      return;
    }

    setMonthlyLoading(true);
    setErrorMessage('');

    try {
      const monthlyResults = await Promise.all(
        monthKeys.map(async (monthKey) => {
          const { data, error } = await supabase.rpc(
            'get_labor_monthly_status',
            {
              p_project_name: projectName,
              p_base_month: `${monthKey}-01`,
            },
          );

          if (error) throw error;
          return data || {};
        }),
      );

      const mergedResult =
        mergeMonthlyStatusResults(monthlyResults);

      const rawSummaryByProcess = new Map(
        mergedResult.summary.map((row) => [
          row.process_type,
          row,
        ]),
      );
      const allowedProcesses = new Set(rateProcessOrder);
      const nextSummary = rateProcessOrder.map(
        (processType) =>
          rawSummaryByProcess.get(processType) || {
            process_type: processType,
            current_completed_units: 0,
            current_quantity: 0,
            current_amount: 0,
            cumulative_quantity: 0,
            cumulative_amount: 0,
            average_unit_price: 0,
            missing_quantity_units: 0,
            missing_rate_units: 0,
          },
      );
      const nextDetails = mergedResult.details.filter((row) =>
        allowedProcesses.has(row.process_type),
      );
      const nextTotals = {
        current_completed_units: nextSummary.reduce(
          (total, row) =>
            total + toNumber(row.current_completed_units),
          0,
        ),
        current_amount: nextSummary.reduce(
          (total, row) => total + toNumber(row.current_amount),
          0,
        ),
        cumulative_amount: nextSummary.reduce(
          (total, row) => total + toNumber(row.cumulative_amount),
          0,
        ),
        missing_quantity_units: nextSummary.reduce(
          (total, row) =>
            total + toNumber(row.missing_quantity_units),
          0,
        ),
        missing_rate_units: nextSummary.reduce(
          (total, row) =>
            total + toNumber(row.missing_rate_units),
          0,
        ),
      };

      setMonthlySummary(nextSummary);
      setMonthlyDetails(nextDetails);
      setMonthlyTotals(nextTotals);
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
  }, [endMonth, projectName, rateProcessOrder, startMonth]);

  useEffect(() => {
    setSettings([]);
    setRateHistory([]);
    setProcessCatalog([]);
    setOverviewLoaded(false);
    setUnitTypes({});
    setQuantities({});
    setQuantityRounds({});
    setQuantityHasPendingChanges(false);
    setBulkQuantity('');
    setBulkRateRound('');
    setQuantityColumnFilters(createEmptyQuantityColumnFilters());
    setShowHiddenHistory(false);
    setHistoryActionId('');
    setHistoryDeleteTarget(null);
    setRateRoundSavingId('');
    setMonthlySummary([]);
    setMonthlyDetails([]);
    setMonthlyTotals({});
    setProgressMappings({});
    setMappingDraft([]);
    setMappingDirty(false);
    setEditingOriginalProcess('');
    setIsAddingProcess(false);
    setActiveEditorField('');
    setEditor(createEditor(''));
    setMessage(null);
    setErrorMessage('');
    loadOverview();
    loadUnitTypes();
    loadProgressMappings();
  }, [projectName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadQuantities();
  }, [loadQuantities]);

  useEffect(() => {
    loadMonthly();
  }, [loadMonthly]);

  useEffect(() => {
    setMappingDraft(getEffectiveProgressProcesses(detailProcess));
    setMappingDirty(false);
  }, [detailProcess, getEffectiveProgressProcesses]);

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

  const handleQuantityColumnFilterChange = (
    filterName,
    selectedValues,
  ) => {
    setQuantityColumnFilters((previous) => ({
      ...previous,
      [filterName]: selectedValues,
    }));
    setQuantityPage(0);
  };

  const resetQuantityColumnFilters = () => {
    setQuantityColumnFilters(createEmptyQuantityColumnFilters());
    setQuantityPage(0);
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

    const applyQuantity = String(bulkQuantity).trim() !== '';
    const applyRateRound = String(bulkRateRound) !== '';

    if (!applyQuantity && !applyRateRound) {
      setErrorMessage(
        '일괄 적용할 물량 또는 확정차수를 선택해주세요.',
      );
      return;
    }

    const value = Math.max(0, toNumber(bulkQuantity));
    const confirmationRound = Math.max(
      0,
      Math.round(toNumber(bulkRateRound)),
    );

    if (applyQuantity) {
      setQuantities((previous) => {
        const next = { ...previous };
        selectedUnits.forEach((cellKey) => {
          next[cellKey] = value;
        });
        return next;
      });
    }

    if (applyRateRound) {
      setQuantityRounds((previous) => {
        const next = { ...previous };
        selectedUnits.forEach((cellKey) => {
          next[cellKey] = confirmationRound || '';
        });
        return next;
      });
    }

    setQuantityHasPendingChanges(true);
    setMessage({
      severity: 'info',
      text: `${selectedUnits.size.toLocaleString()}세대에 ${
        applyQuantity
          ? `${formatQuantity(value)}${selectedSetting?.unit || ''}`
          : '기존 물량'
      }${
        applyRateRound
          ? ` · ${
              confirmationRound > 0
                ? `${confirmationRound}차 확정`
                : '확정차수 미지정'
            }`
          : ''
      }을 입력했습니다. 저장 버튼을 눌러 확정해주세요.`,
    });
    setErrorMessage('');
  };

  const handleDownloadQuantityExcel = async () => {
    if (!quantityExcelTestEnabled) {
      setErrorMessage(
        `현재 엑셀 물량 입력은 ${LABOR_QUANTITY_EXCEL_TEST_PROJECT}에서만 시험할 수 있습니다.`,
      );
      return;
    }
    if (!quantityProcess) {
      setErrorMessage('엑셀로 내려받을 공정을 선택해주세요.');
      return;
    }
    if (validUnits.length === 0) {
      setErrorMessage('엑셀로 내려받을 실제 세대정보가 없습니다.');
      return;
    }

    setQuantityExcelLoading(true);
    setMessage(null);
    setErrorMessage('');

    try {
      const rowCount = await saveLaborQuantityWorkbook({
        projectName,
        processType: quantityProcess,
        unitName: selectedSetting?.unit || '',
        units: validUnits,
        quantities,
        quantityRounds,
        rateOptions: quantityRateOptions,
      });

      setMessage({
        severity: 'success',
        text: `${quantityProcess} 세대별 물량 양식 ${rowCount.toLocaleString()}세대를 내려받았습니다.`,
      });
    } catch (error) {
      console.error('세대별 물량 엑셀 다운로드 오류:', error);
      setErrorMessage(
        `세대별 물량 엑셀을 만들지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setQuantityExcelLoading(false);
    }
  };

  const handleUploadQuantityExcel = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!quantityExcelTestEnabled) {
      setErrorMessage(
        `현재 엑셀 물량 입력은 ${LABOR_QUANTITY_EXCEL_TEST_PROJECT}에서만 시험할 수 있습니다.`,
      );
      event.target.value = '';
      return;
    }
    if (!quantityProcess) {
      setErrorMessage('엑셀을 불러올 공정을 선택해주세요.');
      event.target.value = '';
      return;
    }

    setQuantityExcelLoading(true);
    setQuantityExcelResult(null);
    setMessage(null);
    setErrorMessage('');

    try {
      const result = await parseLaborQuantityWorkbookFile({
        file,
        projectName,
        processType: quantityProcess,
        validUnits,
        allowedRounds: quantityRateOptions.map(
          (row) => row.confirmation_round,
        ),
        defaultConfirmationRound:
          quantityRateOptions.length === 1
            ? quantityRateOptions[0].confirmation_round
            : 0,
      });

      setQuantities((previous) => {
        const next = { ...previous };
        result.updates.forEach((row) => {
          if (row.quantity !== undefined) {
            next[row.cellKey] = row.quantity;
          }
        });
        return next;
      });
      setQuantityRounds((previous) => {
        const next = { ...previous };
        result.updates.forEach((row) => {
          if (row.confirmationRound !== undefined) {
            next[row.cellKey] = row.confirmationRound || '';
          }
        });
        return next;
      });
      setSelectedUnits(
        new Set(result.updates.map((row) => row.cellKey)),
      );
      setQuantityHasPendingChanges(true);
      setQuantityPage(0);
      setQuantityExcelResult({
        ...result,
        fileName: file.name,
        processType: quantityProcess,
      });

      const issueCount =
        result.unknownRows.length +
        result.invalidRows.length +
        result.duplicateRows.length;
      setMessage({
        severity: issueCount > 0 ? 'warning' : 'success',
        text: `${quantityProcess} ${result.matchedRows.toLocaleString()}세대의 작성값을 화면에 불러왔습니다.${
          result.autoAssignedRoundRows > 0
            ? ` 단일 확정차수를 ${result.autoAssignedRoundRows.toLocaleString()}세대에 자동 적용했습니다.`
            : ''
        } 검토 후 저장 버튼을 눌러주세요.`,
      });
    } catch (error) {
      console.error('세대별 물량 엑셀 업로드 오류:', error);
      setErrorMessage(
        `세대별 물량 엑셀을 불러오지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setQuantityExcelLoading(false);
      event.target.value = '';
    }
  };

  const handleSaveQuantities = async () => {
    if (!quantityProcess) {
      setErrorMessage('공정을 선택해주세요.');
      return;
    }

    const draftCellKeys = new Set([
      ...Object.keys(quantities),
      ...Object.keys(quantityRounds),
    ]);
    const rows = Array.from(draftCellKeys).map((cellKey) => {
      const { building, unit } = splitCellKey(cellKey);
      const quantity = quantities[cellKey];
      const hasQuantity = String(quantity ?? '').trim() !== '';

      return {
        building,
        unit,
        quantity: hasQuantity
          ? Math.max(0, toNumber(quantity))
          : null,
        confirmation_round:
          Math.round(toNumber(quantityRounds[cellKey])) || null,
      };
    });

    if (rows.length === 0) {
      setErrorMessage('저장할 작성 내용이 없습니다.');
      return;
    }

    setSaving(true);
    setMessage(null);
    setErrorMessage('');

    try {
      const chunks = splitIntoChunks(rows, SUPABASE_WRITE_CHUNK_SIZE);

      for (const chunk of chunks) {
        const { error } = await supabase.rpc(
          'save_labor_unit_quantity_drafts',
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
        text: `${quantityProcess} 현재 작성내용 ${rows.length.toLocaleString()}건을 저장했습니다.`,
      });
      setQuantityHasPendingChanges(false);
      await loadQuantities();
      await loadMonthly();
    } catch (error) {
      console.error('세대별 작성내용 저장 오류:', error);
      setErrorMessage(
        `세대별 작성내용을 저장하지 못했습니다: ${
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
      setQuantityRounds({});
      setQuantityHasPendingChanges(false);
      setSelectedUnits(new Set());
      setBulkQuantity('');
      setBulkRateRound('');
      setQuantityColumnFilters(createEmptyQuantityColumnFilters());
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

  const handleChangeRateConfirmationRound = async (
    rateRow,
    nextValue,
  ) => {
    if (!rateEditable || !rateRow?.id) return;

    const confirmationRound =
      String(nextValue) === ''
        ? null
        : Math.max(1, Math.round(toNumber(nextValue)));

    setRateRoundSavingId(rateRow.id);
    setMessage(null);
    setErrorMessage('');

    try {
      const { error } = await supabase.rpc(
        'set_labor_rate_confirmation_round',
        {
          p_project_name: projectName,
          p_rate_id: rateRow.id,
          p_confirmation_round: confirmationRound,
        },
      );

      if (error) throw error;

      setMessage({
        severity: 'success',
        text: confirmationRound
          ? `${rateRow.process_type} 단가이력을 ${confirmationRound}차 확정으로 지정했습니다.`
          : `${rateRow.process_type} 단가이력을 미확정(적용 제외)으로 변경했습니다.`,
      });
      await loadOverview();
      await loadMonthly();
    } catch (error) {
      console.error('노임단가 확정차수 변경 오류:', error);
      setErrorMessage(
        `확정차수를 변경하지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setRateRoundSavingId('');
    }
  };

  const handleToggleRateHistoryHidden = async (rateRow) => {
    if (!rateEditable || !rateRow?.id) return;

    const nextHidden = rateRow.is_hidden !== true;
    setHistoryActionId(rateRow.id);
    setMessage(null);
    setErrorMessage('');

    try {
      const { error } = await supabase.rpc(
        'set_labor_rate_history_hidden',
        {
          p_project_name: projectName,
          p_rate_id: rateRow.id,
          p_is_hidden: nextHidden,
        },
      );

      if (error) throw error;

      setMessage({
        severity: 'success',
        text: nextHidden
          ? '선택한 변경이력을 숨겼습니다.'
          : '숨긴 변경이력을 다시 표시했습니다.',
      });
      await loadOverview();
    } catch (error) {
      console.error('노임단가 변경이력 숨김 오류:', error);
      setErrorMessage(
        `변경이력 표시 상태를 바꾸지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setHistoryActionId('');
    }
  };

  const handleDeleteRateHistory = async () => {
    const rateRow = historyDeleteTarget;
    if (!rateEditable || !rateRow?.id) return;

    setHistoryActionId(rateRow.id);
    setMessage(null);
    setErrorMessage('');

    try {
      const { data, error } = await supabase.rpc(
        'delete_labor_rate_history',
        {
          p_project_name: projectName,
          p_rate_id: rateRow.id,
        },
      );

      if (error) throw error;

      const clearedQuantityCount = toNumber(
        data?.cleared_quantity_count,
      );
      setHistoryDeleteTarget(null);
      setMessage({
        severity: 'success',
        text:
          clearedQuantityCount > 0
            ? `변경이력을 삭제하고 연결된 ${clearedQuantityCount.toLocaleString()}세대의 확정차수를 미지정으로 변경했습니다.`
            : '선택한 변경이력을 삭제했습니다.',
      });
      await loadOverview();
      await loadQuantities();
      await loadMonthly();
    } catch (error) {
      console.error('노임단가 변경이력 삭제 오류:', error);
      setErrorMessage(
        `변경이력을 삭제하지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setHistoryActionId('');
    }
  };

  const allSelectedProcessHistory = useMemo(
    () =>
      rateHistory.filter(
        (row) => row.process_type === historyProcess,
      ),
    [historyProcess, rateHistory],
  );

  const selectedProcessHistory = useMemo(
    () =>
      allSelectedProcessHistory.filter(
        (row) => showHiddenHistory || row.is_hidden !== true,
      ),
    [allSelectedProcessHistory, showHiddenHistory],
  );

  const hiddenHistoryCount = useMemo(
    () =>
      allSelectedProcessHistory.filter(
        (row) => row.is_hidden === true,
      ).length,
    [allSelectedProcessHistory],
  );

  const historyRoundOptions = useMemo(() => {
    const highestRound = allSelectedProcessHistory.reduce(
      (highest, row) =>
        Math.max(highest, toNumber(row.confirmation_round)),
      0,
    );
    const optionCount = Math.max(
      1,
      allSelectedProcessHistory.length,
      highestRound + 1,
    );

    return Array.from(
      { length: optionCount },
      (_unused, index) => index + 1,
    );
  }, [allSelectedProcessHistory]);

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

  const currentQuantityAmount = useMemo(
    () =>
      validUnits.reduce((total, row) => {
        const confirmationRound = toNumber(
          quantityRounds[row.cellKey],
        );
        const rate = quantityRateByRound[confirmationRound];

        return (
          total +
          toNumber(quantities[row.cellKey]) *
            toNumber(rate?.confirmed_unit_price)
        );
      }, 0),
    [
      quantities,
      quantityRateByRound,
      quantityRounds,
      validUnits,
    ],
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
          options={GUIDE_PROCESS_OPTIONS}
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
                  '& .MuiAutocomplete-input': {
                    p: '0 !important',
                    fontSize: '0.69rem',
                    fontWeight: 900,
                    textAlign: 'center',
                  },
                },
              }}
              inputProps={{
                ...params.inputProps,
                style: {
                  ...params.inputProps?.style,
                  padding: 0,
                  fontSize: '0.69rem',
                  fontWeight: 900,
                  textAlign: 'center',
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
                  '& .MuiAutocomplete-input': {
                    p: '0 !important',
                    fontSize: '0.69rem',
                    fontWeight: 400,
                    textAlign: 'center',
                  },
                },
              }}
              inputProps={{
                ...params.inputProps,
                style: {
                  ...params.inputProps?.style,
                  padding: 0,
                  fontSize: '0.69rem',
                  fontWeight: 400,
                  textAlign: 'center',
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
              setShowHiddenHistory(false);
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
              const confirmedRate =
                confirmedRatesByProcess[processType] || null;

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
                    {confirmedRate
                      ? `${toNumber(
                          confirmedRate.confirmation_round,
                        )}차 · ${formatMoney(
                          confirmedRate.confirmed_unit_price,
                        )}원`
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
                        setShowHiddenHistory(false);
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
          useFlexGap
          alignItems={{ lg: 'center' }}
          sx={{ flexWrap: 'wrap' }}
        >
          <TextField
            select
            size="small"
            label="공정"
            value={quantityProcess}
            onChange={(event) => {
              setQuantityProcess(event.target.value);
              setQuantities({});
              setQuantityRounds({});
              setQuantityHasPendingChanges(false);
              setSelectedUnits(new Set());
              setBulkRateRound('');
              setQuantityExcelResult(null);
              setQuantityColumnFilters(
                createEmptyQuantityColumnFilters(),
              );
              setQuantityPage(0);
            }}
            sx={{ minWidth: 145 }}
          >
            {allProcessOptions.map((processType) => (
              <MenuItem key={processType} value={processType}>
                {processType}
              </MenuItem>
            ))}
          </TextField>

          <Divider
            orientation="vertical"
            flexItem
            sx={{ display: { xs: 'none', lg: 'block' }, mx: 0.25 }}
          />

          <input
            ref={quantityExcelFileInputRef}
            type="file"
            accept=".xlsx,.xlsm,.xls"
            hidden
            onChange={handleUploadQuantityExcel}
          />

          <Button
            variant="outlined"
            startIcon={
              quantityExcelLoading ? (
                <CircularProgress size={15} color="inherit" />
              ) : (
                <DownloadRoundedIcon />
              )
            }
            onClick={handleDownloadQuantityExcel}
            disabled={
              quantityExcelLoading ||
              quantityLoading ||
              !quantityProcess ||
              !quantityExcelTestEnabled
            }
            sx={{ whiteSpace: 'nowrap' }}
          >
            엑셀 다운로드
          </Button>

          <Button
            variant="outlined"
            color="success"
            startIcon={<UploadFileRoundedIcon />}
            onClick={() => quantityExcelFileInputRef.current?.click()}
            disabled={
              quantityExcelLoading ||
              quantityLoading ||
              !quantityProcess ||
              !quantityExcelTestEnabled
            }
            sx={{ whiteSpace: 'nowrap' }}
          >
            엑셀 업로드
          </Button>

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

          <TextField
            select
            size="small"
            label="적용 확정차수"
            value={bulkRateRound}
            onChange={(event) => setBulkRateRound(event.target.value)}
            sx={{ minWidth: 165 }}
          >
            <MenuItem value="">차수 변경 안 함</MenuItem>
            <MenuItem value="0">미지정(계산 제외)</MenuItem>
            {quantityRateOptions.map((rateRow) => (
              <MenuItem
                key={rateRow.id}
                value={String(rateRow.confirmation_round)}
              >
                {rateRow.confirmation_round}차 확정 ·{' '}
                {formatMoney(rateRow.confirmed_unit_price)}원
              </MenuItem>
            ))}
          </TextField>

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
            저장
          </Button>

          <Box sx={{ flex: 1 }} />

          <Chip
            size="small"
            color={quantityExcelTestEnabled ? 'success' : 'default'}
            variant="outlined"
            label={
              quantityExcelTestEnabled
                ? '용인금어지구 엑셀 시험'
                : '엑셀 시험 대상 현장 아님'
            }
          />

          <Chip
            size="small"
            color={quantityRateOptions.length > 0 ? 'primary' : 'warning'}
            variant="outlined"
            label={
              quantityRateOptions.length > 0
                ? `확정단가 ${quantityRateOptions.length.toLocaleString()}개 차수`
                : '확정차수 미설정'
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
            예상 노임 {formatMoney(currentQuantityAmount)}원
          </Typography>
          {activeQuantityFilterCount > 0 && (
            <Button
              size="small"
              color="inherit"
              startIcon={<FilterAltOffRoundedIcon />}
              onClick={resetQuantityColumnFilters}
              sx={{
                minHeight: 22,
                px: 0.7,
                py: 0,
                color: '#1d4ed8',
                fontSize: '0.65rem',
                fontWeight: 800,
              }}
            >
              필터 {activeQuantityFilterCount}개 해제
            </Button>
          )}
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
              <TableCell
                padding="checkbox"
                sx={{ ...headerCellSx, width: 42, py: 0 }}
              >
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
                  sx={{ p: 0.45 }}
                />
              </TableCell>
              <ExcelFilterHeaderCell
                label="동"
                options={quantityFilterOptions.building}
                selectedValues={quantityColumnFilters.building}
                onChange={(values) =>
                  handleQuantityColumnFilterChange('building', values)
                }
                minWidth={88}
              />
              <ExcelFilterHeaderCell
                label="층"
                options={quantityFilterOptions.floor}
                selectedValues={quantityColumnFilters.floor}
                onChange={(values) =>
                  handleQuantityColumnFilterChange('floor', values)
                }
                minWidth={72}
              />
              <ExcelFilterHeaderCell
                label="타입"
                options={quantityFilterOptions.unitType}
                selectedValues={quantityColumnFilters.unitType}
                onChange={(values) =>
                  handleQuantityColumnFilterChange('unitType', values)
                }
                minWidth={86}
              />
              <ExcelFilterHeaderCell
                label="세대"
                options={quantityFilterOptions.unit}
                selectedValues={quantityColumnFilters.unit}
                onChange={(values) =>
                  handleQuantityColumnFilterChange('unit', values)
                }
                minWidth={88}
              />
              <ExcelFilterHeaderCell
                label="물량"
                options={quantityFilterOptions.quantityStatus}
                selectedValues={quantityColumnFilters.quantityStatus}
                onChange={(values) =>
                  handleQuantityColumnFilterChange(
                    'quantityStatus',
                    values,
                  )
                }
                minWidth={112}
              />
              <ExcelFilterHeaderCell
                label="단위"
                options={quantityFilterOptions.unitName}
                selectedValues={quantityColumnFilters.unitName}
                onChange={(values) =>
                  handleQuantityColumnFilterChange('unitName', values)
                }
                minWidth={72}
              />
              <ExcelFilterHeaderCell
                label="확정차수"
                options={quantityFilterOptions.confirmationRound}
                selectedValues={quantityColumnFilters.confirmationRound}
                onChange={(values) =>
                  handleQuantityColumnFilterChange(
                    'confirmationRound',
                    values,
                  )
                }
                minWidth={145}
              />
              <ExcelFilterHeaderCell
                label="적용단가"
                options={quantityFilterOptions.appliedRateStatus}
                selectedValues={quantityColumnFilters.appliedRateStatus}
                onChange={(values) =>
                  handleQuantityColumnFilterChange(
                    'appliedRateStatus',
                    values,
                  )
                }
                minWidth={100}
              />
              <ExcelFilterHeaderCell
                label="예상 노임"
                options={quantityFilterOptions.amountStatus}
                selectedValues={quantityColumnFilters.amountStatus}
                onChange={(values) =>
                  handleQuantityColumnFilterChange('amountStatus', values)
                }
                minWidth={110}
              />
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedUnits.map((row) => {
              const quantity = quantities[row.cellKey] ?? '';
              const confirmationRound =
                quantityRounds[row.cellKey] || '';
              const appliedRate =
                quantityRateByRound[toNumber(confirmationRound)] || null;
              const appliedUnitPrice = toNumber(
                appliedRate?.confirmed_unit_price,
              );
              const amount = toNumber(quantity) * appliedUnitPrice;

              return (
                <TableRow
                  key={row.cellKey}
                  hover
                  selected={selectedUnits.has(row.cellKey)}
                  sx={{
                    height: 32,
                    '& .MuiTableCell-root': {
                      py: 0.18,
                    },
                  }}
                >
                  <TableCell padding="checkbox" sx={{ width: 42 }}>
                    <Checkbox
                      size="small"
                      checked={selectedUnits.has(row.cellKey)}
                      onChange={() => handleToggleUnit(row.cellKey)}
                      sx={{ p: 0.45 }}
                    />
                  </TableCell>
                  <TableCell sx={quantityBodyCellSx} align="center">
                    {row.building}
                  </TableCell>
                  <TableCell sx={quantityBodyCellSx} align="center">
                    {row.floor || '-'}
                  </TableCell>
                  <TableCell sx={quantityBodyCellSx} align="center">
                    {row.unitType || '미지정'}
                  </TableCell>
                  <TableCell
                    sx={{ ...quantityBodyCellSx, fontWeight: 900 }}
                    align="center"
                  >
                    {row.unit}
                  </TableCell>
                  <TableCell
                    sx={{ ...quantityBodyCellSx, width: 130 }}
                  >
                    <InputBase
                      value={formatNumericInput(quantity)}
                      onChange={(event) => {
                        setQuantities((previous) => ({
                          ...previous,
                          [row.cellKey]: normalizeNumericInput(
                            event.target.value,
                            4,
                          ),
                        }));
                        setQuantityHasPendingChanges(true);
                      }}
                      inputProps={{ inputMode: 'decimal' }}
                      sx={{
                        width: '100%',
                        height: 25,
                        px: 0.65,
                        py: 0,
                        border: '1px solid #cbd5e1',
                        borderRadius: 0.75,
                        bgcolor: '#fff',
                        '& input': {
                          textAlign: 'right',
                          fontSize: '0.68rem',
                          py: 0,
                        },
                      }}
                    />
                  </TableCell>
                  <TableCell sx={quantityBodyCellSx} align="center">
                    {selectedSetting?.unit || '-'}
                  </TableCell>
                  <TableCell
                    sx={{
                      ...quantityBodyCellSx,
                      minWidth: 145,
                      bgcolor:
                        toNumber(quantity) > 0 && !confirmationRound
                          ? '#fff7ed'
                          : undefined,
                    }}
                  >
                    <TextField
                      select
                      size="small"
                      fullWidth
                      value={String(confirmationRound)}
                      onChange={(event) => {
                        setQuantityRounds((previous) => ({
                          ...previous,
                          [row.cellKey]: event.target.value
                            ? Number(event.target.value)
                            : '',
                        }));
                        setQuantityHasPendingChanges(true);
                      }}
                      SelectProps={{
                        displayEmpty: true,
                      }}
                      sx={{
                        '& .MuiInputBase-root': {
                          minHeight: 27,
                          height: 27,
                          fontSize: '0.68rem',
                          bgcolor: '#fff',
                        },
                        '& .MuiSelect-select': {
                          py: 0.35,
                        },
                      }}
                    >
                      <MenuItem value="">미지정</MenuItem>
                      {quantityRateOptions.map((rateRow) => (
                        <MenuItem
                          key={rateRow.id}
                          value={String(rateRow.confirmation_round)}
                        >
                          {rateRow.confirmation_round}차 확정
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell
                    sx={{ ...numberCellSx, height: 30, py: 0.18 }}
                  >
                    {appliedRate
                      ? `${formatMoney(appliedUnitPrice)}원`
                      : '-'}
                  </TableCell>
                  <TableCell
                    sx={{
                      ...numberCellSx,
                      height: 30,
                      py: 0.18,
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
                <TableCell colSpan={10} align="center" sx={{ py: 5 }}>
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
        gridTemplateRows:
          'auto auto minmax(200px, 1fr) auto minmax(170px, 0.72fr)',
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
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ flexWrap: 'wrap' }}
        >
          <TextField
            size="small"
            type="month"
            label="시작월"
            value={startMonth}
            onChange={(event) => {
              const nextMonth = event.target.value;
              setStartMonth(nextMonth);

              if (nextMonth && endMonth && nextMonth > endMonth) {
                setEndMonth(nextMonth);
              }
            }}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 165 }}
          />
          <Typography
            aria-hidden="true"
            sx={{ fontSize: '0.8rem', fontWeight: 900, color: '#64748b' }}
          >
            ~
          </Typography>
          <TextField
            size="small"
            type="month"
            label="종료월"
            value={endMonth}
            onChange={(event) => {
              const nextMonth = event.target.value;
              setEndMonth(nextMonth);

              if (nextMonth && startMonth && nextMonth < startMonth) {
                setStartMonth(nextMonth);
              }
            }}
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
          <Button
            variant="contained"
            startIcon={<VisibilityRoundedIcon />}
            onClick={() => {
              const targetProcess =
                detailProcess || rateProcessOrder[0] || '';

              if (!targetProcess) {
                setMessage({
                  severity: 'warning',
                  text: '골구도로 확인할 노임 공정이 없습니다.',
                });
                return;
              }

              const linkedProgressProcesses =
                getEffectiveProgressProcesses(targetProcess);

              if (linkedProgressProcesses.length === 0) {
                setDetailProcess(targetProcess);
                setMessage({
                  severity: 'warning',
                  text: `${targetProcess}에 적용할 공정진척을 아래 공정진척 연결에서 먼저 선택해주세요.`,
                });
                return;
              }

              setDetailProcess(targetProcess);
              setPeriodStructureOpen(true);
            }}
            disabled={monthlyLoading || rateProcessOrder.length === 0}
            sx={{ whiteSpace: 'nowrap' }}
          >
            예상노임조회
          </Button>
          <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
            선택한 공정진척의 `작업완료` 완료일을 기준으로 집계하며, 예상노임조회에서 종료월 월말 예상세대를 별도로 조정할 수 있습니다.
          </Typography>
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
        <SummaryCard
          label={`${monthlyRangeLabel} 완료건`}
          value={`${toNumber(
            monthlyTotals.current_completed_units,
          ).toLocaleString()}건`}
          helper="공정별 완료건 합계"
        />
        <SummaryCard
          label={`${monthlyRangeLabel} 노임 예상`}
          value={`${formatMoney(monthlyTotals.current_amount)}원`}
          helper="연결 공정진척 완료건의 물량 × 적용 확정단가"
          color="#0f766e"
        />
        <SummaryCard
          label="누계 노임 예상"
          value={`${formatMoney(monthlyTotals.cumulative_amount)}원`}
          helper={`${endMonth} 말일까지 누계`}
          color="#1d4ed8"
        />
        <SummaryCard
          label="계산 누락 건"
          value={`${(
            toNumber(monthlyTotals.missing_quantity_units) +
            toNumber(monthlyTotals.missing_rate_units)
          ).toLocaleString()}건`}
          helper="물량 또는 확정차수·단가가 없는 공정·세대"
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
                '연결 공정진척',
                '기간 완료건',
                '기간 물량',
                '평균 적용단가',
                '기간 노임',
                '누계 물량',
                '누계 노임',
                '물량 미입력',
                '차수/단가 미설정',
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
                onClick={() => {
                  setDetailProcess(row.process_type);
                }}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell
                  sx={{ ...bodyCellSx, fontWeight: 900 }}
                  align="center"
                >
                  {row.process_type}
                </TableCell>
                <TableCell sx={bodyCellSx} align="center">
                  {getEffectiveProgressProcesses(row.process_type).length > 0
                    ? getEffectiveProgressProcesses(row.process_type).join(', ')
                    : '미연결'}
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
                <TableCell colSpan={10} align="center" sx={{ py: 5 }}>
                  선택한 기간의 완료 공정이 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Paper
        variant="outlined"
        sx={{
          px: 1.2,
          py: 0.85,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', lg: 'center' }}
        >
          <Box sx={{ minWidth: 170 }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 900 }}>
              공정진척 연결
            </Typography>
            <Typography sx={{ mt: 0.15, fontSize: '0.62rem', color: '#64748b' }}>
              {detailProcess || '공정 선택'} 노임의 완료 기준
            </Typography>
          </Box>

          <Autocomplete
            multiple
            size="small"
            options={progressProcessOptions}
            value={mappingDraft}
            onChange={(_event, nextValue) => {
              setMappingDraft(nextValue);
              setMappingDirty(true);
            }}
            disabled={
              !detailProcess ||
              mappingLoading ||
              mappingSaving ||
              monthlyLoading
            }
            disableCloseOnSelect
            filterSelectedOptions
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  {...getTagProps({ index })}
                  key={option}
                  size="small"
                  label={option}
                  sx={{ height: 22, fontSize: '0.64rem', fontWeight: 800 }}
                />
              ))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="적용할 공정진척 선택"
                placeholder={
                  detailProcess
                    ? '1개 이상 선택 가능'
                    : '먼저 위 공정을 선택하세요'
                }
                InputLabelProps={{ shrink: true }}
              />
            )}
            sx={{ flex: 1, minWidth: 280 }}
          />

          <Button
            variant="contained"
            startIcon={<SaveRoundedIcon />}
            onClick={saveProgressMappings}
            disabled={
              !detailProcess ||
              !mappingDirty ||
              mappingSaving ||
              mappingLoading ||
              monthlyLoading
            }
            sx={{ whiteSpace: 'nowrap' }}
          >
            {mappingSaving ? '적용 중...' : '연결 적용'}
          </Button>

          <Typography
            sx={{
              maxWidth: 420,
              fontSize: '0.62rem',
              lineHeight: 1.55,
              color: '#64748b',
            }}
          >
            선택한 공정진척의 작업완료 건을 각각 계산합니다. 복수선택 시
            같은 세대가 공정별로 각각 집계되며, 물량·확정차수·단가는{' '}
            <strong>{detailProcess || '선택한 노임 공정'}</strong>에 입력한 값을
            그대로 적용합니다.
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
        <Box
          sx={{
            px: 1.2,
            py: 0.65,
            borderBottom: '1px solid #e2e8f0',
            bgcolor: '#f8fafc',
          }}
        >
          <Typography sx={{ fontSize: '0.73rem', fontWeight: 900 }}>
            {detailProcess || '공정 선택'} · {monthlyRangeLabel} 세대별
            계산 근거
          </Typography>
        </Box>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {[
                '연결 공정진척',
                '동',
                '세대',
                '완료일',
                '물량',
                '단위',
                '적용단가',
                '단가 구분',
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
              <TableRow
                key={`${row.process_type}-${row.source_process_type || ''}-${row.building}-${row.unit}`}
              >
                <TableCell sx={{ ...bodyCellSx, fontWeight: 800 }} align="center">
                  {row.source_process_type || row.process_type || '-'}
                </TableCell>
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
                <TableCell colSpan={9} align="center" sx={{ py: 3 }}>
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
          variant="scrollable"
          scrollButtons={false}
          onChange={(_event, value) => {
            if (
              value === 2 &&
              activeTab === 1 &&
              quantityHasPendingChanges
            ) {
              setMessage({
                severity: 'warning',
                text: '세대별 물량에 저장하지 않은 변경내용이 있습니다. 저장 후 월별 노임 예상현황으로 이동해주세요.',
              });
              setErrorMessage('');
              return;
            }
            setActiveTab(value);
            setMessage(null);
            setErrorMessage('');
            if (value === 2) loadMonthly();
          }}
          sx={{
            mt: 0.55,
            mb: 0.7,
            minHeight: 36,
            width: 'fit-content',
            maxWidth: '100%',
            p: 0.35,
            border: '1px solid #cbd5e1',
            borderRadius: 999,
            bgcolor: '#f8fafc',
            '& .MuiTabs-indicator': {
              display: 'none',
            },
            '& .MuiTabs-flexContainer': {
              gap: 0.45,
            },
            '& .MuiTab-root': {
              minHeight: 29,
              minWidth: 0,
              px: 1.35,
              py: 0.35,
              border: '1px solid transparent',
              borderRadius: 999,
              fontSize: '0.72rem',
              fontWeight: 900,
              textTransform: 'none',
              transition: 'all 160ms ease',
            },
            '& .MuiTab-root:nth-of-type(1)': {
              color: '#1d4ed8',
              bgcolor: '#eff6ff',
              '&.Mui-selected': {
                color: '#fff',
                bgcolor: '#2563eb',
                boxShadow: '0 3px 9px rgba(37, 99, 235, 0.3)',
              },
            },
            '& .MuiTab-root:nth-of-type(2)': {
              color: '#0f766e',
              bgcolor: '#ecfdf5',
              '&.Mui-selected': {
                color: '#fff',
                bgcolor: '#0f766e',
                boxShadow: '0 3px 9px rgba(15, 118, 110, 0.28)',
              },
            },
            '& .MuiTab-root:nth-of-type(3)': {
              color: '#7e22ce',
              bgcolor: '#faf5ff',
              '&.Mui-selected': {
                color: '#fff',
                bgcolor: '#7e22ce',
                boxShadow: '0 3px 9px rgba(126, 34, 206, 0.28)',
              },
            },
          }}
        >
          <Tab disableRipple label="1. 공정별 노임단가" />
          <Tab disableRipple label="2. 세대별 물량 입력" />
          <Tab disableRipple label="3. 월별 노임 예상현황" />
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

      <LaborPeriodStructureDialog
        open={periodStructureOpen}
        onClose={() => setPeriodStructureOpen(false)}
        projectName={projectName}
        processOptions={rateProcessOrder}
        progressProcessOptions={progressProcessOptions}
        progressMappings={progressMappings}
        initialProcess={detailProcess || rateProcessOrder[0] || ''}
        startMonth={startMonth}
        endMonth={endMonth}
        validUnits={validUnits}
        buildingConfigs={buildingConfigs}
        onProcessChange={setDetailProcess}
        onSaved={({ processType, savedCount }) => {
          setDetailProcess(processType);
          setMessage({
            severity: 'success',
            text: `${endMonth} 월말 예상세대 ${savedCount.toLocaleString()}건을 저장했습니다.`,
          });
        }}
      />

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
        open={Boolean(quantityExcelResult)}
        onClose={() => setQuantityExcelResult(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          세대별 물량 엑셀 불러오기 결과
        </DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ fontSize: '0.78rem', color: '#475569' }}>
            {quantityExcelResult?.fileName || ''} ·{' '}
            {quantityExcelResult?.sourceSheet || ''} 시트 ·{' '}
            {quantityExcelResult?.processType || quantityProcess} 공정
          </Typography>

          <Stack
            direction="row"
            spacing={0.7}
            useFlexGap
            flexWrap="wrap"
            sx={{ mt: 1.2 }}
          >
            <Chip
              color="success"
              label={`정상 ${toNumber(
                quantityExcelResult?.matchedRows,
              ).toLocaleString()}세대`}
            />
            <Chip
              variant="outlined"
              label={`물량 ${toNumber(
                quantityExcelResult?.quantityRows,
              ).toLocaleString()}건`}
            />
            <Chip
              variant="outlined"
              label={`확정차수 ${toNumber(
                quantityExcelResult?.roundRows,
              ).toLocaleString()}건`}
            />
            <Chip
              variant="outlined"
              label={`빈 행 건너뜀 ${toNumber(
                quantityExcelResult?.blankRows,
              ).toLocaleString()}건`}
            />
          </Stack>

          <Alert severity="info" sx={{ mt: 1.2 }}>
            정상 행은 동호수 기준으로 화면에 반영했고 해당 세대가
            선택되어 있습니다. 내용을 확인한 뒤 기존 <strong>저장</strong>{' '}
            버튼을 눌러야 DB에 확정됩니다.
          </Alert>

          {[
            {
              label: '일치하지 않는 동호수',
              rows: quantityExcelResult?.unknownRows || [],
              formatter: (row) =>
                `${row.rowNumber}행 · ${row.identifier}`,
            },
            {
              label: '입력값 오류',
              rows: quantityExcelResult?.invalidRows || [],
              formatter: (row) =>
                `${row.rowNumber}행 · ${row.message}`,
            },
            {
              label: '중복 동호수',
              rows: quantityExcelResult?.duplicateRows || [],
              formatter: (row) =>
                `${row.rowNumber}행 · ${row.identifier}`,
            },
          ]
            .filter((section) => section.rows.length > 0)
            .map((section) => (
              <Box key={section.label} sx={{ mt: 1.3 }}>
                <Typography
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: 900,
                    color: '#b45309',
                  }}
                >
                  {section.label} {section.rows.length.toLocaleString()}건
                </Typography>
                <Box
                  component="ul"
                  sx={{
                    m: 0,
                    mt: 0.45,
                    pl: 2.3,
                    color: '#64748b',
                    fontSize: '0.7rem',
                    lineHeight: 1.65,
                  }}
                >
                  {section.rows.slice(0, 8).map((row, index) => (
                    <li key={`${section.label}-${row.rowNumber}-${index}`}>
                      {section.formatter(row)}
                    </li>
                  ))}
                  {section.rows.length > 8 && (
                    <li>
                      외 {(section.rows.length - 8).toLocaleString()}건
                    </li>
                  )}
                </Box>
              </Box>
            ))}
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => setQuantityExcelResult(null)}
          >
            확인
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          {historyProcess} 노임단가 변경이력
        </DialogTitle>
        <DialogContent dividers>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={0.8}
            alignItems={{ sm: 'center' }}
            sx={{ mb: 1.2 }}
          >
            <Alert severity="info" sx={{ flex: 1 }}>
              실제 적용할 확정단가만 1차·2차·3차로 지정하세요.
              숨기기는 목록 표시만 바꾸고 계산에는 영향을 주지 않습니다.
              삭제한 확정이력은 연결 세대도 확정차수 미지정으로 바뀝니다.
            </Alert>
            {hiddenHistoryCount > 0 && (
              <Button
                size="small"
                variant={showHiddenHistory ? 'contained' : 'outlined'}
                startIcon={
                  showHiddenHistory ? (
                    <VisibilityRoundedIcon />
                  ) : (
                    <VisibilityOffRoundedIcon />
                  )
                }
                onClick={() =>
                  setShowHiddenHistory((previous) => !previous)
                }
                sx={{ whiteSpace: 'nowrap' }}
              >
                숨김 {hiddenHistoryCount.toLocaleString()}건{' '}
                {showHiddenHistory ? '감추기' : '보기'}
              </Button>
            )}
          </Stack>
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
                    '확정차수',
                    '사유',
                    '등록자',
                    '관리',
                  ].map((label) => (
                    <TableCell key={label} sx={headerCellSx} align="center">
                      {label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedProcessHistory.map((row) => (
                  <TableRow
                    key={row.id}
                    sx={{
                      bgcolor:
                        row.is_hidden === true ? '#f8fafc' : '#fff',
                      opacity: row.is_hidden === true ? 0.72 : 1,
                    }}
                  >
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
                    <TableCell sx={{ ...bodyCellSx, minWidth: 175 }}>
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={
                          row.confirmation_round
                            ? String(row.confirmation_round)
                            : ''
                        }
                        onChange={(event) =>
                          handleChangeRateConfirmationRound(
                            row,
                            event.target.value,
                          )
                        }
                        disabled={
                          !rateEditable ||
                          rateRoundSavingId === row.id ||
                          toNumber(row.confirmed_unit_price) <= 0
                        }
                        SelectProps={{ displayEmpty: true }}
                        sx={{
                          '& .MuiInputBase-root': {
                            fontSize: '0.68rem',
                            bgcolor: row.confirmation_round
                              ? '#ecfdf5'
                              : '#fff',
                          },
                        }}
                      >
                        <MenuItem value="">
                          미확정(적용 제외)
                        </MenuItem>
                        {historyRoundOptions.map((round) => (
                          <MenuItem
                            key={round}
                            value={String(round)}
                          >
                            {round}차 확정
                          </MenuItem>
                        ))}
                      </TextField>
                      {toNumber(row.confirmed_unit_price) <= 0 && (
                        <Typography
                          sx={{
                            mt: 0.35,
                            fontSize: '0.58rem',
                            color: '#b45309',
                            textAlign: 'center',
                          }}
                        >
                          확정단가 입력 후 지정 가능
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      {row.change_reason || '-'}
                    </TableCell>
                    <TableCell sx={bodyCellSx} align="center">
                      {row.created_by_name || '-'}
                    </TableCell>
                    <TableCell
                      sx={{ ...bodyCellSx, minWidth: 92 }}
                      align="center"
                    >
                      <Stack
                        direction="row"
                        spacing={0.2}
                        justifyContent="center"
                      >
                        <Tooltip
                          title={
                            row.is_hidden === true
                              ? '변경이력 다시 표시'
                              : '변경이력 숨기기'
                          }
                          arrow
                        >
                          <span>
                            <IconButton
                              size="small"
                              onClick={() =>
                                handleToggleRateHistoryHidden(row)
                              }
                              disabled={
                                !rateEditable ||
                                historyActionId === row.id
                              }
                            >
                              {row.is_hidden === true ? (
                                <VisibilityRoundedIcon fontSize="small" />
                              ) : (
                                <VisibilityOffRoundedIcon fontSize="small" />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="변경이력 삭제" arrow>
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() =>
                                setHistoryDeleteTarget(row)
                              }
                              disabled={
                                !rateEditable ||
                                historyActionId === row.id
                              }
                            >
                              <DeleteOutlineRoundedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {selectedProcessHistory.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                      {hiddenHistoryCount > 0
                        ? '숨김 처리된 변경이력만 있습니다.'
                        : '등록된 변경이력이 없습니다.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>닫기</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(historyDeleteTarget)}
        onClose={() =>
          !historyActionId && setHistoryDeleteTarget(null)
        }
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          변경이력 삭제
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 1 }}>
            삭제한 변경이력은 되돌릴 수 없습니다.
          </Alert>
          <Typography sx={{ fontSize: '0.8rem', lineHeight: 1.65 }}>
            <strong>
              {historyDeleteTarget
                ? `${formatDate(
                    historyDeleteTarget.effective_from,
                  )} · ${formatMoney(
                    historyDeleteTarget.applied_unit_price,
                  )}원`
                : ''}
            </strong>
            의 변경이력을 삭제하시겠습니까?
          </Typography>
          <Typography
            sx={{ mt: 0.8, fontSize: '0.69rem', color: '#64748b' }}
          >
            이 이력에 확정차수가 지정되어 있다면 해당 차수를 사용하던
            세대는 자동으로 미지정 처리됩니다. 물량 자체는 삭제되지
            않습니다.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setHistoryDeleteTarget(null)}
            disabled={Boolean(historyActionId)}
          >
            취소
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDeleteRateHistory}
            disabled={Boolean(historyActionId)}
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
