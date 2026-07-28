import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Alert,
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
  InputBase,
  MenuItem,
  Paper,
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
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import { supabase } from '../supabaseClient';
import { getProjectCellKeys } from '../utils/buildingUnits.js';

const DEFAULT_UNIT = '㎡';
const DEFAULT_CHANGE_REASON = '실행 예산 기준 최초 등록';
const SUPABASE_WRITE_CHUNK_SIZE = 500;

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
  effectiveFrom: getKoreaDateKey(),
  changeReason: DEFAULT_CHANGE_REASON,
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
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newProcessName, setNewProcessName] = useState('');
  const [newProcessUnit, setNewProcessUnit] = useState(DEFAULT_UNIT);
  const [newProcessContractAmount, setNewProcessContractAmount] =
    useState('');
  const [editor, setEditor] = useState(() =>
    createEditor(processOptions[0] || ''),
  );

  const [quantityProcess, setQuantityProcess] = useState(
    processOptions[0] || '',
  );
  const [quantities, setQuantities] = useState({});
  const [selectedUnits, setSelectedUnits] = useState(() => new Set());
  const [buildingFilter, setBuildingFilter] = useState('전체');
  const [floorFilter, setFloorFilter] = useState('전체');
  const [typeFilter, setTypeFilter] = useState('전체');
  const [unitKeyword, setUnitKeyword] = useState('');
  const [bulkQuantity, setBulkQuantity] = useState('');
  const [quantityPage, setQuantityPage] = useState(0);
  const [quantityRowsPerPage, setQuantityRowsPerPage] = useState(100);

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
    const activeProcesses = processCatalog
      .filter((row) => row.is_active !== false)
      .map((row) => row.process_type)
      .filter(Boolean);

    if (activeProcesses.length > 0) return activeProcesses;

    return Array.from(
      new Set([
        ...(processOptions || []),
        ...settings.map((setting) => setting.process_type).filter(Boolean),
      ]),
    );
  }, [processCatalog, processOptions, settings]);

  const validUnits = useMemo(() => {
    const rows = Array.from(getProjectCellKeys(buildingConfigs)).map(
      (cellKey) => {
        const { building, unit } = splitCellKey(cellKey);
        return {
          cellKey,
          building,
          unit,
          floor: resolveFloor(unit),
          unitType: unitTypes[cellKey] || '미지정',
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
      const { error: initializeError } = await supabase.rpc(
        'initialize_labor_process_catalog',
        {
          p_project_name: projectName,
          p_process_types: processOptions || [],
        },
      );

      if (initializeError) throw initializeError;

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

      const preferredProcess =
        editor.processType ||
        quantityProcess ||
        nextCatalog.find((row) => row.is_active !== false)?.process_type ||
        nextSettings[0]?.process_type ||
        processOptions[0] ||
        '';

      if (preferredProcess) {
        const currentSetting = nextSettings.find(
          (row) => row.process_type === preferredProcess,
        );
        const currentCatalog = nextCatalog.find(
          (row) => row.process_type === preferredProcess,
        );

        setEditor(
          createEditor(
            preferredProcess,
            currentSetting,
            currentCatalog,
          ),
        );
        setQuantityProcess((previous) => previous || preferredProcess);
      }
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
  }, [projectName, processOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadUnitTypes = useCallback(async () => {
    if (!projectName) {
      setUnitTypes({});
      return;
    }

    try {
      const { data, error } = await supabase.rpc(
        'get_labor_unit_types',
        {
          p_project_name: projectName,
        },
      );

      if (error) throw error;

      const nextUnitTypes = (data || []).reduce((result, row) => {
        result[`${row.building}-${row.unit}`] =
          String(row.unit_type || '').trim() || '미지정';
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
      const { data, error } = await supabase.rpc(
        'get_labor_unit_quantities',
        {
          p_project_name: projectName,
          p_process_type: quantityProcess,
        },
      );

      if (error) throw error;

      const nextQuantities = (data || []).reduce((result, row) => {
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
    setUnitTypes({});
    setQuantities({});
    setMonthlySummary([]);
    setMonthlyDetails([]);
    setMonthlyTotals({});
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
    }
  }, [allProcessOptions, quantityProcess]);

  useEffect(() => {
    if (
      allProcessOptions.length > 0 &&
      !allProcessOptions.includes(editor.processType)
    ) {
      setEditor(
        createEditor(
          allProcessOptions[0],
          settingByProcess[allProcessOptions[0]],
          catalogByProcess[allProcessOptions[0]],
        ),
      );
    }
  }, [
    allProcessOptions,
    catalogByProcess,
    editor.processType,
    settingByProcess,
  ]);

  const handleEditorProcessChange = (processType) => {
    setEditor(
      createEditor(
        processType,
        settingByProcess[processType],
        catalogByProcess[processType],
      ),
    );
    setMessage(null);
    setErrorMessage('');
  };

  const handleSaveRate = async () => {
    if (!rateEditable) {
      setErrorMessage('공정별 노임단가를 설정할 권한이 없습니다.');
      return;
    }

    if (!editor.processType || !editor.unit || !editor.effectiveFrom) {
      setErrorMessage('공정, 단위, 적용일을 모두 입력해주세요.');
      return;
    }

    if (calculatedExecutionUnitPrice <= 0) {
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

    try {
      const { error } = await supabase.rpc(
        'save_labor_process_setup',
        {
          p_project_name: projectName,
          p_process_type: editor.processType,
          p_unit: editor.unit,
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

      setMessage({
        severity: 'success',
        text: `${editor.processType} 계약 노무비와 노임단가를 적용일 ${editor.effectiveFrom} 기준으로 저장했습니다.`,
      });
      await loadOverview();
      await loadMonthly();
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

  const handleAddProcess = async () => {
    const processName = newProcessName.trim();

    if (!rateEditable) {
      setErrorMessage('공정을 추가할 권한이 없습니다.');
      return;
    }

    if (!processName) {
      setErrorMessage('추가할 공정명을 입력해주세요.');
      return;
    }

    setSaving(true);
    setMessage(null);
    setErrorMessage('');

    try {
      const { error } = await supabase.rpc(
        'save_labor_process_catalog',
        {
          p_project_name: projectName,
          p_process_type: processName,
          p_unit: newProcessUnit,
          p_contract_labor_amount: toNumber(
            newProcessContractAmount,
          ),
        },
      );

      if (error) throw error;

      setProcessDialogOpen(false);
      setNewProcessName('');
      setNewProcessUnit(DEFAULT_UNIT);
      setNewProcessContractAmount('');
      setMessage({
        severity: 'success',
        text: `${processName} 공정을 추가했습니다. 실행예산과 예정물량을 입력해 단가를 설정해주세요.`,
      });
      await loadOverview();
      setEditor(
        createEditor(processName, null, {
          process_type: processName,
          unit: newProcessUnit,
          contract_labor_amount: toNumber(newProcessContractAmount),
        }),
      );
    } catch (error) {
      console.error('노임 공정 추가 오류:', error);
      setErrorMessage(
        `공정을 추가하지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProcess = async () => {
    if (!rateEditable || !editor.processType) return;

    setSaving(true);
    setMessage(null);
    setErrorMessage('');

    try {
      const deletedProcess = editor.processType;
      const { error } = await supabase.rpc(
        'archive_labor_process_catalog',
        {
          p_project_name: projectName,
          p_process_type: deletedProcess,
        },
      );

      if (error) throw error;

      setDeleteDialogOpen(false);
      setMessage({
        severity: 'success',
        text: `${deletedProcess} 공정을 목록에서 삭제했습니다. 기존 단가이력과 물량자료는 보존됩니다.`,
      });
      await loadOverview();
    } catch (error) {
      console.error('노임 공정 삭제 오류:', error);
      setErrorMessage(
        `공정을 삭제하지 못했습니다: ${
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

  const renderRateTab = () => (
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
          p: 1.25,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={1}
          alignItems={{ lg: 'center' }}
        >
          <TextField
            select
            size="small"
            label="공정"
            value={editor.processType}
            onChange={(event) =>
              handleEditorProcessChange(event.target.value)
            }
            sx={{ minWidth: 145 }}
          >
            {allProcessOptions.map((processType) => (
              <MenuItem key={processType} value={processType}>
                {processType}
              </MenuItem>
            ))}
          </TextField>

          <Button
            size="small"
            variant="outlined"
            startIcon={<AddRoundedIcon />}
            onClick={() => setProcessDialogOpen(true)}
            disabled={!rateEditable}
            sx={{ whiteSpace: 'nowrap' }}
          >
            공정 추가
          </Button>

          <Button
            size="small"
            color="error"
            variant="outlined"
            startIcon={<DeleteOutlineRoundedIcon />}
            onClick={() => setDeleteDialogOpen(true)}
            disabled={!rateEditable || !editor.processType}
            sx={{ whiteSpace: 'nowrap' }}
          >
            선택 공정 삭제
          </Button>

          <TextField
            select
            size="small"
            label="단위"
            value={editor.unit}
            onChange={(event) =>
              setEditor((previous) => ({
                ...previous,
                unit: event.target.value,
              }))
            }
            sx={{ width: 100 }}
            disabled={!rateEditable}
          >
            {['세대', '㎡', 'm', 'EA', '식'].map((unit) => (
              <MenuItem key={unit} value={unit}>
                {unit}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            size="small"
            label="계약 노무비"
            value={formatNumericInput(editor.contractLaborAmount)}
            onChange={(event) =>
              setEditor((previous) => ({
                ...previous,
                contractLaborAmount: normalizeNumericInput(
                  event.target.value,
                  0,
                ),
              }))
            }
            inputProps={{
              inputMode: 'numeric',
              style: { textAlign: 'right' },
            }}
            sx={{ minWidth: 145 }}
            disabled={!rateEditable}
          />

          <TextField
            size="small"
            label="실행 노임총액"
            value={formatNumericInput(editor.executionLaborTotal)}
            onChange={(event) =>
              setEditor((previous) => ({
                ...previous,
                executionLaborTotal: normalizeNumericInput(
                  event.target.value,
                  0,
                ),
              }))
            }
            inputProps={{
              inputMode: 'numeric',
              style: { textAlign: 'right' },
            }}
            sx={{ minWidth: 145 }}
            disabled={!rateEditable}
          />

          <TextField
            size="small"
            label="총 예정물량"
            value={formatNumericInput(editor.plannedQuantity)}
            onChange={(event) =>
              setEditor((previous) => ({
                ...previous,
                plannedQuantity: normalizeNumericInput(
                  event.target.value,
                  4,
                ),
              }))
            }
            inputProps={{
              inputMode: 'decimal',
              style: { textAlign: 'right' },
            }}
            sx={{ minWidth: 125 }}
            disabled={!rateEditable}
          />

          <TextField
            size="small"
            label="실행단가 (자동계산)"
            value={
              calculatedExecutionUnitPrice > 0
                ? formatMoney(calculatedExecutionUnitPrice)
                : ''
            }
            placeholder="총액 ÷ 예정물량"
            inputProps={{
              readOnly: true,
              style: { textAlign: 'right', fontWeight: 800 },
            }}
            sx={{ minWidth: 155 }}
          />

          <TextField
            size="small"
            label="확정단가"
            value={formatNumericInput(editor.confirmedUnitPrice)}
            onChange={(event) =>
              setEditor((previous) => ({
                ...previous,
                confirmedUnitPrice: normalizeNumericInput(
                  event.target.value,
                  4,
                ),
              }))
            }
            placeholder="미확정 시 비움"
            inputProps={{
              inputMode: 'decimal',
              style: { textAlign: 'right' },
            }}
            sx={{ minWidth: 125 }}
            disabled={!rateEditable}
          />

          <TextField
            size="small"
            label="적용일"
            type="date"
            value={editor.effectiveFrom}
            onChange={(event) =>
              setEditor((previous) => ({
                ...previous,
                effectiveFrom: event.target.value,
              }))
            }
            InputLabelProps={{ shrink: true }}
            sx={{ width: 145 }}
            disabled={!rateEditable}
          />
        </Stack>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1}
          alignItems={{ md: 'center' }}
          sx={{ mt: 1 }}
        >
          <TextField
            size="small"
            label="등록·변경 사유"
            value={editor.changeReason}
            onChange={(event) =>
              setEditor((previous) => ({
                ...previous,
                changeReason: event.target.value,
              }))
            }
            placeholder="예: 공사 시작 전 실행예산 기준 최초 등록"
            fullWidth
            disabled={!rateEditable}
          />

          <Button
            variant="contained"
            startIcon={
              saving ? (
                <CircularProgress size={15} color="inherit" />
              ) : (
                <SaveRoundedIcon />
              )
            }
            onClick={handleSaveRate}
            disabled={saving || !rateEditable}
            sx={{ minWidth: 120, whiteSpace: 'nowrap' }}
          >
            단가 저장
          </Button>
        </Stack>

        <Typography
          sx={{
            mt: 0.8,
            fontSize: '0.65rem',
            color: '#64748b',
          }}
        >
          실행단가는 실행 노임총액 ÷ 총 예정물량으로 자동 계산됩니다.
          확정단가를 입력하면 완료일 기준 계산에 우선 사용하며, 단가
          변경은 기존 값을 덮어쓰지 않고 적용일별 이력으로 보관합니다.
          {!rateEditable &&
            ' 현재 계정은 조회와 세대별 물량 입력만 가능합니다.'}
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
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {[
                '공정',
                '단위',
                '계약 노무비',
                '실행 노임총액',
                '예정물량',
                '실행단가',
                '확정단가',
                '적용일',
                '변경이력',
              ].map((label) => (
                <TableCell key={label} sx={headerCellSx} align="center">
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {allProcessOptions.map((processType) => {
              const setting = settingByProcess[processType];
              const processRow = catalogByProcess[processType];

              return (
                <TableRow
                  key={processType}
                  hover
                  onClick={() => handleEditorProcessChange(processType)}
                  sx={{ cursor: 'pointer' }}
                >
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
                </TableRow>
              );
            })}

            {allProcessOptions.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 5 }}>
                  공정 목록이 없습니다.
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
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
        >
          <Box>
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
          >
            새로고침
          </Button>
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

      {errorMessage && (
        <Alert
          severity="error"
          onClose={() => setErrorMessage('')}
          sx={{ py: 0.2 }}
        >
          {errorMessage}
        </Alert>
      )}

      {message && (
        <Alert
          severity={message.severity || 'info'}
          onClose={() => setMessage(null)}
          sx={{ py: 0.2 }}
        >
          {message.text}
        </Alert>
      )}

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
        open={processDialogOpen}
        onClose={() => !saving && setProcessDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>노임 공정 추가</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <Alert severity="info">
              복합 공정은 담당자가 실제 지급 기준에 맞게 나누어
              등록할 수 있습니다. 예: 합지에 포함된 단열과 합지를 각각
              별도 공정으로 추가
            </Alert>
            <TextField
              autoFocus
              size="small"
              label="공정명"
              value={newProcessName}
              onChange={(event) => setNewProcessName(event.target.value)}
              placeholder="예: 단열"
              fullWidth
            />
            <TextField
              select
              size="small"
              label="단위"
              value={newProcessUnit}
              onChange={(event) => setNewProcessUnit(event.target.value)}
              fullWidth
            >
              {['세대', '㎡', 'm', 'EA', '식'].map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="계약 노무비"
              value={formatNumericInput(newProcessContractAmount)}
              onChange={(event) =>
                setNewProcessContractAmount(
                  normalizeNumericInput(event.target.value, 0),
                )
              }
              inputProps={{
                inputMode: 'numeric',
                style: { textAlign: 'right' },
              }}
              placeholder="0"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setProcessDialogOpen(false)}
            disabled={saving}
          >
            취소
          </Button>
          <Button
            variant="contained"
            onClick={handleAddProcess}
            disabled={saving}
          >
            추가
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => !saving && setDeleteDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>공정 삭제</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ fontSize: '0.82rem', lineHeight: 1.65 }}>
            <strong>{editor.processType}</strong> 공정을 노임작성 목록에서
            삭제하시겠습니까?
          </Typography>
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
            onClick={handleDeleteProcess}
            disabled={saving}
          >
            삭제
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
