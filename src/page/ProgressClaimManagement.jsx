import React, {
  useCallback,
  useDeferredValue,
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
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ExcelJS from 'exceljs';
import { supabase } from '../supabaseClient';

const DIRECT_SECTION_START = '[직접공사비]';
const GRAND_TOTAL_LABEL = '공사비합계';

const moneyFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 0,
});

const quantityFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 4,
});

const numberCellSx = {
  whiteSpace: 'nowrap',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

const headerCellSx = {
  bgcolor: '#e2e8f0',
  color: '#334155',
  fontSize: '0.68rem',
  fontWeight: 900,
  lineHeight: 1.25,
  whiteSpace: 'nowrap',
  borderRight: '1px solid #cbd5e1',
  py: 0.8,
};

const bodyCellSx = {
  color: '#334155',
  fontSize: '0.67rem',
  borderRight: '1px solid #e2e8f0',
  py: 0.55,
};


const DEFAULT_CONTRACT_VERSION = '최초계약';
const DEFAULT_SPLIT_PERCENT = 62;
const SPLIT_STORAGE_KEY = 'progressClaimSplitPercentV26';
const COLUMN_WIDTHS_STORAGE_KEY = 'progressClaimColumnWidthsV26';
const PROCESS_SEPARATOR = ' + ';
const MAIN_ROW_HEIGHT = 40;
const DIALOG_ROW_HEIGHT = 38;
const TABLE_OVERSCAN = 8;

const EXCLUDED_CLAIM_PROCESS_OPTIONS = new Set(['허리먹']);

const DEFAULT_CLAIM_PROCESS_OPTIONS = [
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

const CLAIM_TABLE_COLUMNS = [
  { key: 'selected', label: '선택', width: 40, min: 36, max: 50, align: 'center' },
  { key: 'row', label: '행', width: 44, min: 40, max: 70, align: 'left' },
  { key: 'classification', label: '타입·공구', width: 88, min: 72, max: 180, align: 'left' },
  { key: 'option', label: '옵션', width: 50, min: 46, max: 90, align: 'left' },
  { key: 'item', label: '품명', width: 145, min: 105, max: 360, align: 'left' },
  { key: 'specification', label: '규격', width: 200, min: 120, max: 420, align: 'left' },
  { key: 'unit', label: '단위', width: 46, min: 42, max: 90, align: 'left' },
  { key: 'process', label: '공정 연결', width: 120, min: 105, max: 240, align: 'left' },
  { key: 'contractQuantity', label: '계약수량', width: 70, min: 64, max: 120, align: 'right' },
  { key: 'contractMaterial', label: '계약 재료비', width: 84, min: 76, max: 150, align: 'right' },
  { key: 'contractLabor', label: '계약 노무비', width: 84, min: 76, max: 150, align: 'right' },
  { key: 'contractExpense', label: '계약 경비', width: 76, min: 70, max: 140, align: 'right' },
  { key: 'currentQuantity', label: '금회수량', width: 70, min: 64, max: 120, align: 'right' },
  { key: 'currentMaterial', label: '금회 재료비', width: 84, min: 76, max: 150, align: 'right' },
  { key: 'currentLabor', label: '금회 노무비', width: 84, min: 76, max: 150, align: 'right' },
  { key: 'currentExpense', label: '금회 경비', width: 76, min: 70, max: 140, align: 'right' },
  { key: 'cumulative', label: '누계금액', width: 92, min: 82, max: 160, align: 'right' },
  { key: 'rate', label: '누계율', width: 64, min: 58, max: 105, align: 'right' },
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getDefaultColumnWidths = () =>
  Object.fromEntries(CLAIM_TABLE_COLUMNS.map((column) => [column.key, column.width]));

const loadStoredColumnWidths = () => {
  const defaults = getDefaultColumnWidths();

  if (typeof window === 'undefined') return defaults;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY) || '{}');
    CLAIM_TABLE_COLUMNS.forEach((column) => {
      const storedValue = Number(parsed[column.key]);
      if (Number.isFinite(storedValue)) {
        defaults[column.key] = clamp(storedValue, column.min, column.max);
      }
    });
  } catch (error) {
    console.warn('기성내역 열 너비 설정을 불러오지 못했습니다:', error);
  }

  return defaults;
};

const loadStoredSplitPercent = () => {
  if (typeof window === 'undefined') return DEFAULT_SPLIT_PERCENT;

  const storedValue = Number(window.localStorage.getItem(SPLIT_STORAGE_KEY));
  return Number.isFinite(storedValue)
    ? clamp(storedValue, 38, 78)
    : DEFAULT_SPLIT_PERCENT;
};

const estimateTextWidth = (value) => {
  const text = String(value ?? '');
  const textWidth = Array.from(text).reduce(
    (total, character) => total + (character.charCodeAt(0) > 255 ? 11 : 7),
    0,
  );
  return textWidth + 28;
};

const normalizeText = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .trim();

const getItemTypeLabel = (item) =>
  String(item?.housing_type || item?.classification || '미분류').trim() || '미분류';

const normalizeClaimProcessOption = (process) => {
  if (process === '경량골조' || process === '경량석고') return '경량벽체';
  if (process === '1차몰딩' || process === '2차몰딩') return '몰딩';
  if (process === '1차 걸레받이' || process === '2차 걸레받이') return '걸레받이';
  return process;
};

const buildClaimProcessOptions = (processOptions = []) =>
  Array.from(
    new Set(
      [...DEFAULT_CLAIM_PROCESS_OPTIONS, ...processOptions.map(normalizeClaimProcessOption)]
        .map((process) => String(process || '').trim())
        .filter(
          (process) =>
            Boolean(process) && !EXCLUDED_CLAIM_PROCESS_OPTIONS.has(process),
        ),
    ),
  );

const decodeProcessTypes = (value) =>
  Array.from(
    new Set(
      String(value || '')
        .split(/\s*\+\s*|\s*,\s*/g)
        .map((process) => normalizeClaimProcessOption(process.trim()))
        .filter(Boolean),
    ),
  );

const encodeProcessTypes = (values) =>
  Array.from(new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean)))
    .join(PROCESS_SEPARATOR);

const getProcessDisplayLabel = (value) => {
  const processes = decodeProcessTypes(value);
  return processes.length > 0 ? processes.join(PROCESS_SEPARATOR) : '미연결';
};

const getVirtualRange = (itemCount, scrollTop, viewportHeight, rowHeight) => {
  const visibleCount = Math.ceil(Math.max(viewportHeight, rowHeight) / rowHeight);
  const rawStart = Math.max(0, Math.floor(scrollTop / rowHeight) - TABLE_OVERSCAN);
  const maxStart = Math.max(0, itemCount - visibleCount);
  const start = Math.min(rawStart, maxStart);
  const end = Math.min(itemCount, start + visibleCount + TABLE_OVERSCAN * 2);
  return { start, end };
};

const getKoreaMonthValue = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());

  const values = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') values[part.type] = part.value;
  });

  return `${values.year}-${values.month}`;
};

const unwrapCellValue = (cell) => {
  const value = cell?.value;

  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;

  /* ExcelJS 4.x는 수식 결과가 숫자 0이면 value.result를 생략하고 model.result에만 둡니다. */
  if (
    cell?.model &&
    Object.prototype.hasOwnProperty.call(cell.model, 'result')
  ) {
    return cell.model.result;
  }

  if (Object.prototype.hasOwnProperty.call(value, 'result')) {
    return value.result;
  }

  if (Array.isArray(value.richText)) {
    return value.richText
      .map((part) => part?.text || '')
      .join('');
  }

  if (Object.prototype.hasOwnProperty.call(value, 'text')) {
    return value.text;
  }

  return null;
};

const readText = (row, columnNumber) => {
  const value = unwrapCellValue(row.getCell(columnNumber));
  return String(value ?? '').trim();
};

const readNumber = (row, columnNumber) => {
  const value = unwrapCellValue(row.getCell(columnNumber));

  if (value === null || value === undefined || value === '') return 0;

  const numberValue = Number(
    typeof value === 'string'
      ? value.replace(/,/g, '').trim()
      : value,
  );

  return Number.isFinite(numberValue) ? numberValue : 0;
};

const hasExternalFormulaWithoutResult = (row, columnNumber) => {
  const cell = row.getCell(columnNumber);
  const value = cell?.value;

  if (!value || typeof value !== 'object') return false;

  const formula = String(value.formula || '');

  /*
    ExcelJS는 결과가 0인 내부 공유수식에 result를 넣지 않는 경우가 있습니다.
    그 행들을 오류로 처리하지 않고, 외부 통합문서([파일명.xlsx])를 참조하는
    수식인데 최종 결과가 없는 경우만 오류로 표시합니다.
  */
  if (!formula.includes('[')) return false;

  if (
    cell?.model &&
    Object.prototype.hasOwnProperty.call(cell.model, 'result')
  ) {
    return cell.model.result === null || cell.model.result === undefined;
  }

  return (
    !Object.prototype.hasOwnProperty.call(value, 'result') ||
    value.result === null ||
    value.result === undefined ||
    value.result === ''
  );
};

const toNumber = (value) => {
  const converted = Number(value);
  return Number.isFinite(converted) ? converted : 0;
};

const formatMoney = (value) => moneyFormatter.format(toNumber(value));
const formatQuantity = (value) => quantityFormatter.format(toNumber(value));


const getColumnDisplayValue = (item, columnKey) => {
  switch (columnKey) {
    case 'selected':
      return '';
    case 'row':
      return item.source_row_no;
    case 'classification':
      return `${item.housing_type || item.classification || ''} ${item.work_zone || ''}`;
    case 'option':
      return item.option_type;
    case 'item':
      return item.item_name;
    case 'specification':
      return item.specification;
    case 'unit':
      return item.unit;
    case 'process':
      return getProcessDisplayLabel(item.process_type);
    case 'contractQuantity':
      return formatQuantity(item.contract_quantity);
    case 'contractMaterial':
      return formatMoney(item.contract_material_amount);
    case 'contractLabor':
      return formatMoney(item.contract_labor_amount);
    case 'contractExpense':
      return formatMoney(item.contract_expense_amount);
    case 'currentQuantity':
      return formatQuantity(item.current_quantity);
    case 'currentMaterial':
      return formatMoney(item.current_material_amount);
    case 'currentLabor':
      return formatMoney(item.current_labor_amount);
    case 'currentExpense':
      return formatMoney(item.current_expense_amount);
    case 'cumulative':
      return formatMoney(getItemTotal(item, 'cumulative'));
    case 'rate':
      return `${(toNumber(item.cumulative_rate) * 100).toFixed(2)}%`;
    default:
      return '';
  }
};

const getItemTotal = (item, prefix) =>
  toNumber(item[`${prefix}_material_amount`]) +
  toNumber(item[`${prefix}_labor_amount`]) +
  toNumber(item[`${prefix}_expense_amount`]);

const summarizeItems = (items) =>
  items.reduce(
    (totals, item) => {
      totals.contractMaterial += toNumber(item.contract_material_amount);
      totals.contractLabor += toNumber(item.contract_labor_amount);
      totals.contractExpense += toNumber(item.contract_expense_amount);
      totals.currentMaterial += toNumber(item.current_material_amount);
      totals.currentLabor += toNumber(item.current_labor_amount);
      totals.currentExpense += toNumber(item.current_expense_amount);
      totals.cumulativeMaterial += toNumber(item.cumulative_material_amount);
      totals.cumulativeLabor += toNumber(item.cumulative_labor_amount);
      totals.cumulativeExpense += toNumber(item.cumulative_expense_amount);
      return totals;
    },
    {
      contractMaterial: 0,
      contractLabor: 0,
      contractExpense: 0,
      currentMaterial: 0,
      currentLabor: 0,
      currentExpense: 0,
      cumulativeMaterial: 0,
      cumulativeLabor: 0,
      cumulativeExpense: 0,
    },
  );

const parseClassification = (classification) => {
  const match = String(classification || '').match(/^(.+?)_(\d+공구)$/);

  if (!match) {
    return {
      housingType: String(classification || '').trim(),
      workZone: '',
    };
  }

  return {
    housingType: match[1].trim(),
    workZone: match[2].trim(),
  };
};

const buildSourceKey = ({
  classification,
  itemName,
  specification,
  unit,
  occurrence,
}) =>
  [classification, itemName, specification, unit]
    .map((value) => normalizeText(value).toLowerCase())
    .join('|') + `#${occurrence}`;

const parseDirectCostWorksheet = (worksheet) => {
  const parsedItems = [];
  const duplicateCounter = new Map();
  let directSectionStarted = false;
  let grandTotalReached = false;

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const itemLabel = readText(row, 2);
    const normalizedLabel = normalizeText(itemLabel);

    if (!directSectionStarted && normalizedLabel === normalizeText(DIRECT_SECTION_START)) {
      directSectionStarted = true;
      return;
    }

    if (directSectionStarted && normalizedLabel === GRAND_TOTAL_LABEL) {
      grandTotalReached = true;
      return;
    }

    if (!directSectionStarted || grandTotalReached) return;

    const classification = readText(row, 1);
    const specification = readText(row, 3);
    const unit = readText(row, 4);

    if (!classification || !itemLabel || !unit || classification === '간접비') {
      return;
    }

    const optionType = itemLabel.includes('<확장>') ? '확장' : '기본';
    const baseItemName = itemLabel.replace(/<확장>/g, '').trim();
    const { housingType, workZone } = parseClassification(classification);
    const duplicateBaseKey = [
      classification,
      itemLabel,
      specification,
      unit,
    ]
      .map((value) => normalizeText(value).toLowerCase())
      .join('|');
    const occurrence = (duplicateCounter.get(duplicateBaseKey) || 0) + 1;
    duplicateCounter.set(duplicateBaseKey, occurrence);

    const contractQuantity = readNumber(row, 5);
    const materialUnitPrice = readNumber(row, 6);
    const laborUnitPrice = readNumber(row, 7);
    const expenseUnitPrice = readNumber(row, 8);
    const contractMaterialAmount = readNumber(row, 10);
    const contractLaborAmount = readNumber(row, 11);
    const contractExpenseAmount = readNumber(row, 12);
    const contractTotalFromFile = readNumber(row, 13);
    const previousQuantity = readNumber(row, 14);
    const previousMaterialAmount = readNumber(row, 15);
    const previousLaborAmount = readNumber(row, 16);
    const previousExpenseAmount = readNumber(row, 17);
    const currentQuantity = readNumber(row, 19);
    const currentMaterialAmount = readNumber(row, 20);
    const currentLaborAmount = readNumber(row, 21);
    const currentExpenseAmount = readNumber(row, 22);
    const currentTotalFromFile = readNumber(row, 23);
    const cumulativeQuantity = readNumber(row, 24);
    const cumulativeMaterialAmount = readNumber(row, 25);
    const cumulativeLaborAmount = readNumber(row, 26);
    const cumulativeExpenseAmount = readNumber(row, 27);
    const cumulativeTotalFromFile = readNumber(row, 28);
    const cumulativeRate = readNumber(row, 29);

    const validationErrors = [];
    const contractTotal =
      contractMaterialAmount + contractLaborAmount + contractExpenseAmount;
    const currentTotal =
      currentMaterialAmount + currentLaborAmount + currentExpenseAmount;
    const cumulativeTotal =
      cumulativeMaterialAmount + cumulativeLaborAmount + cumulativeExpenseAmount;

    if (Math.abs(contractTotal - contractTotalFromFile) > 1) {
      validationErrors.push('계약금액 합계 불일치');
    }

    if (Math.abs(currentTotal - currentTotalFromFile) > 1) {
      validationErrors.push('금회기성 합계 불일치');
    }

    if (Math.abs(cumulativeTotal - cumulativeTotalFromFile) > 1) {
      validationErrors.push('누계기성 합계 불일치');
    }

    const formulaColumns = [19, 20, 21, 22, 24, 25, 26, 27];
    if (
      formulaColumns.some((columnNumber) =>
        hasExternalFormulaWithoutResult(row, columnNumber),
      )
    ) {
      validationErrors.push('수식 결과값 없음');
    }

    parsedItems.push({
      source_key: buildSourceKey({
        classification,
        itemName: itemLabel,
        specification,
        unit,
        occurrence,
      }),
      source_row_no: rowNumber,
      sort_order: parsedItems.length + 1,
      classification,
      housing_type: housingType,
      option_type: optionType,
      work_zone: workZone,
      item_name: itemLabel,
      base_item_name: baseItemName,
      specification,
      unit,
      process_type: '',
      contract_quantity: contractQuantity,
      material_unit_price: materialUnitPrice,
      labor_unit_price: laborUnitPrice,
      expense_unit_price: expenseUnitPrice,
      contract_material_amount: contractMaterialAmount,
      contract_labor_amount: contractLaborAmount,
      contract_expense_amount: contractExpenseAmount,
      previous_quantity: previousQuantity,
      previous_material_amount: previousMaterialAmount,
      previous_labor_amount: previousLaborAmount,
      previous_expense_amount: previousExpenseAmount,
      current_quantity: currentQuantity,
      current_material_amount: currentMaterialAmount,
      current_labor_amount: currentLaborAmount,
      current_expense_amount: currentExpenseAmount,
      cumulative_quantity: cumulativeQuantity,
      cumulative_material_amount: cumulativeMaterialAmount,
      cumulative_labor_amount: cumulativeLaborAmount,
      cumulative_expense_amount: cumulativeExpenseAmount,
      cumulative_rate: cumulativeRate,
      validation_errors: validationErrors,
    });
  });

  if (!directSectionStarted) {
    throw new Error('엑셀에서 [직접공사비] 구간을 찾지 못했습니다.');
  }

  if (!grandTotalReached) {
    throw new Error('엑셀에서 공사비 합계 행을 찾지 못했습니다.');
  }

  if (parsedItems.length === 0) {
    throw new Error('읽을 수 있는 직접비 상세품목이 없습니다.');
  }

  return parsedItems;
};

function SummaryCard({ label, value, subLabel, color = '#0f172a' }) {
  return (
    <Box
      sx={{
        minWidth: 148,
        px: 1.25,
        py: 0.85,
        border: '1px solid #dbe3ec',
        borderRadius: 1.2,
        bgcolor: '#ffffff',
      }}
    >
      <Typography sx={{ color: '#64748b', fontSize: '0.64rem', fontWeight: 800 }}>
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.15,
          color,
          fontSize: '0.9rem',
          fontWeight: 900,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatMoney(value)}원
      </Typography>
      {subLabel && (
        <Typography sx={{ mt: 0.1, color: '#94a3b8', fontSize: '0.58rem' }}>
          {subLabel}
        </Typography>
      )}
    </Box>
  );
}

export default function ProgressClaimManagement({
  projectName,
  userProfile,
  processOptions = [],
}) {
  const fileInputRef = useRef(null);
  const splitContainerRef = useRef(null);
  const mainTableContainerRef = useRef(null);
  const unmappedTableContainerRef = useRef(null);
  const mainScrollFrameRef = useRef(null);
  const unmappedScrollFrameRef = useRef(null);
  const [claimNo, setClaimNo] = useState(1);
  const [baseMonth, setBaseMonth] = useState(getKoreaMonthValue);
  const [contractVersionLabel, setContractVersionLabel] =
    useState(DEFAULT_CONTRACT_VERSION);
  const [sourceFileName, setSourceFileName] = useState('');
  const [sourceProjectLabel, setSourceProjectLabel] = useState('');
  const [items, setItems] = useState([]);
  const [claims, setClaims] = useState([]);
  const [activeClaimId, setActiveClaimId] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [mainTypeFilter, setMainTypeFilter] = useState('전체');
  const [optionFilter, setOptionFilter] = useState('전체');
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const [applySameItem, setApplySameItem] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [processPickerOpen, setProcessPickerOpen] = useState(false);
  const [processPickerMode, setProcessPickerMode] = useState('row');
  const [processPickerTarget, setProcessPickerTarget] = useState(null);
  const [processPickerValues, setProcessPickerValues] = useState([]);
  const [unmappedDialogOpen, setUnmappedDialogOpen] = useState(false);
  const [unmappedKeyword, setUnmappedKeyword] = useState('');
  const [unmappedTypeFilter, setUnmappedTypeFilter] = useState('전체');
  const [unmappedSelectedKeys, setUnmappedSelectedKeys] = useState(
    () => new Set(),
  );
  const [unmappedProcesses, setUnmappedProcesses] = useState([]);
  const [mainTableViewport, setMainTableViewport] = useState({ scrollTop: 0, height: 480 });
  const [unmappedTableViewport, setUnmappedTableViewport] = useState({ scrollTop: 0, height: 420 });
  const [splitPercent, setSplitPercent] = useState(loadStoredSplitPercent);
  const [columnWidths, setColumnWidths] = useState(loadStoredColumnWidths);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const claimProcessOptions = useMemo(
    () => buildClaimProcessOptions(processOptions),
    [processOptions],
  );
  const deferredKeyword = useDeferredValue(keyword);
  const deferredUnmappedKeyword = useDeferredValue(unmappedKeyword);

  const loadClaimList = useCallback(async () => {
    if (!projectName) {
      setClaims([]);
      return;
    }

    setListLoading(true);
    setErrorMessage('');

    try {
      const { data, error } = await supabase
        .from('progress_claims')
        .select(`
          id,
          claim_no,
          base_month,
          source_file_name,
          item_count,
          contract_material_amount,
          contract_labor_amount,
          contract_expense_amount,
          current_material_amount,
          current_labor_amount,
          current_expense_amount,
          cumulative_material_amount,
          cumulative_labor_amount,
          cumulative_expense_amount,
          status,
          created_by_name,
          updated_by_name,
          updated_at,
          contract_version:progress_contract_versions(version_label)
        `)
        .eq('project_name', projectName)
        .order('claim_no', { ascending: false });

      if (error) throw error;

      setClaims(data || []);
    } catch (error) {
      console.error('기성 회차 목록 조회 오류:', error);
      setClaims([]);
      setErrorMessage(
        error?.message?.includes('progress_claims')
          ? '기성관리 DB가 아직 설치되지 않았습니다. 제공된 Supabase SQL을 먼저 실행해주세요.'
          : `기성 회차 목록을 불러오지 못했습니다: ${error?.message || '알 수 없는 오류'}`,
      );
    } finally {
      setListLoading(false);
    }
  }, [projectName]);

  useEffect(() => {
    setItems([]);
    setActiveClaimId(null);
    setContractVersionLabel(DEFAULT_CONTRACT_VERSION);
    setSourceFileName('');
    setSourceProjectLabel('');
    setSelectedKeys(new Set());
    setUnmappedSelectedKeys(new Set());
    setMainTypeFilter('전체');
    setUnmappedTypeFilter('전체');
    setUnmappedDialogOpen(false);
    setProcessPickerOpen(false);
    setMessage(null);
    setErrorMessage('');
    loadClaimList();
  }, [projectName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(SPLIT_STORAGE_KEY, String(splitPercent));
    } catch (error) {
      console.warn('기성관리 영역 높이 설정을 저장하지 못했습니다:', error);
    }
  }, [splitPercent]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(
        COLUMN_WIDTHS_STORAGE_KEY,
        JSON.stringify(columnWidths),
      );
    } catch (error) {
      console.warn('기성내역 열 너비 설정을 저장하지 못했습니다:', error);
    }
  }, [columnWidths]);

  useEffect(() => {
    const observeContainer = (element, setter) => {
      if (!element) return undefined;
      const updateHeight = () =>
        setter((previous) => ({ ...previous, height: element.clientHeight || previous.height }));
      updateHeight();
      if (typeof ResizeObserver === 'undefined') return undefined;
      const observer = new ResizeObserver(updateHeight);
      observer.observe(element);
      return () => observer.disconnect();
    };

    const cleanupMain = observeContainer(
      mainTableContainerRef.current,
      setMainTableViewport,
    );
    const cleanupUnmapped = observeContainer(
      unmappedTableContainerRef.current,
      setUnmappedTableViewport,
    );

    return () => {
      cleanupMain?.();
      cleanupUnmapped?.();
    };
  }, [unmappedDialogOpen]);

  const handleMainTableScroll = useCallback((event) => {
    const target = event.currentTarget;
    if (mainScrollFrameRef.current) cancelAnimationFrame(mainScrollFrameRef.current);
    mainScrollFrameRef.current = requestAnimationFrame(() => {
      setMainTableViewport({
        scrollTop: target.scrollTop,
        height: target.clientHeight,
      });
    });
  }, []);

  const handleUnmappedTableScroll = useCallback((event) => {
    const target = event.currentTarget;
    if (unmappedScrollFrameRef.current) {
      cancelAnimationFrame(unmappedScrollFrameRef.current);
    }
    unmappedScrollFrameRef.current = requestAnimationFrame(() => {
      setUnmappedTableViewport({
        scrollTop: target.scrollTop,
        height: target.clientHeight,
      });
    });
  }, []);

  useEffect(() => {
    const availableKeys = new Set(items.map((item) => item.source_key));
    const availableUnmappedKeys = new Set(
      items
        .filter((item) => decodeProcessTypes(item.process_type).length === 0)
        .map((item) => item.source_key),
    );

    setSelectedKeys((previousKeys) =>
      new Set(Array.from(previousKeys).filter((key) => availableKeys.has(key))),
    );
    setUnmappedSelectedKeys((previousKeys) =>
      new Set(
        Array.from(previousKeys).filter((key) => availableUnmappedKeys.has(key)),
      ),
    );
  }, [items]);

  const validItems = useMemo(
    () => items.filter((item) => (item.validation_errors || []).length === 0),
    [items],
  );

  const summary = useMemo(() => summarizeItems(validItems), [validItems]);
  const contractTotal =
    summary.contractMaterial + summary.contractLabor + summary.contractExpense;
  const currentTotal =
    summary.currentMaterial + summary.currentLabor + summary.currentExpense;
  const cumulativeTotal =
    summary.cumulativeMaterial + summary.cumulativeLabor + summary.cumulativeExpense;
  const cumulativeRate = contractTotal > 0 ? cumulativeTotal / contractTotal : 0;
  const errorRowCount = items.length - validItems.length;
  const unmappedCount = useMemo(
    () => items.reduce((count, item) => count + (decodeProcessTypes(item.process_type).length === 0 ? 1 : 0), 0),
    [items],
  );

  const searchIndexByKey = useMemo(
    () =>
      new Map(
        items.map((item) => [
          item.source_key,
          normalizeText([
            item.classification,
            item.item_name,
            item.base_item_name,
            item.specification,
            item.process_type,
          ].join(' ')).toLowerCase(),
        ]),
      ),
    [items],
  );

  const mainTypeOptions = useMemo(() => {
    const counts = new Map();

    items.forEach((item) => {
      const typeLabel = getItemTypeLabel(item);
      counts.set(typeLabel, (counts.get(typeLabel) || 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((first, second) => first[0].localeCompare(second[0], 'ko'))
      .map(([label, count]) => ({ label, count }));
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedKeyword = normalizeText(deferredKeyword).toLowerCase();

    return items.filter((item) => {
      if (mainTypeFilter !== '전체' && getItemTypeLabel(item) !== mainTypeFilter) {
        return false;
      }
      if (optionFilter !== '전체' && item.option_type !== optionFilter) return false;
      if (onlyUnmapped && decodeProcessTypes(item.process_type).length > 0) return false;
      return !normalizedKeyword || searchIndexByKey.get(item.source_key)?.includes(normalizedKeyword);
    });
  }, [deferredKeyword, items, mainTypeFilter, onlyUnmapped, optionFilter, searchIndexByKey]);

  const unmappedTypeOptions = useMemo(() => {
    const counts = new Map();

    items.forEach((item) => {
      if (decodeProcessTypes(item.process_type).length > 0) return;
      const typeLabel = getItemTypeLabel(item);
      counts.set(typeLabel, (counts.get(typeLabel) || 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((first, second) => first[0].localeCompare(second[0], 'ko'))
      .map(([label, count]) => ({ label, count }));
  }, [items]);

  const unmappedDialogItems = useMemo(() => {
    const normalizedKeyword = normalizeText(deferredUnmappedKeyword).toLowerCase();

    return items.filter((item) => {
      if (decodeProcessTypes(item.process_type).length > 0) return false;
      if (unmappedTypeFilter !== '전체' && getItemTypeLabel(item) !== unmappedTypeFilter) {
        return false;
      }
      return !normalizedKeyword || searchIndexByKey.get(item.source_key)?.includes(normalizedKeyword);
    });
  }, [deferredUnmappedKeyword, items, searchIndexByKey, unmappedTypeFilter]);

  const filteredSourceKeys = useMemo(
    () => filteredItems.map((item) => item.source_key),
    [filteredItems],
  );
  const allFilteredSelected =
    filteredSourceKeys.length > 0 &&
    filteredSourceKeys.every((key) => selectedKeys.has(key));
  const someFilteredSelected =
    filteredSourceKeys.some((key) => selectedKeys.has(key)) &&
    !allFilteredSelected;

  const unmappedDialogSourceKeys = useMemo(
    () => unmappedDialogItems.map((item) => item.source_key),
    [unmappedDialogItems],
  );
  const allUnmappedDialogSelected =
    unmappedDialogSourceKeys.length > 0 &&
    unmappedDialogSourceKeys.every((key) => unmappedSelectedKeys.has(key));
  const someUnmappedDialogSelected =
    unmappedDialogSourceKeys.some((key) => unmappedSelectedKeys.has(key)) &&
    !allUnmappedDialogSelected;

  const mainVirtualRange = useMemo(
    () => getVirtualRange(
      filteredItems.length,
      mainTableViewport.scrollTop,
      mainTableViewport.height,
      MAIN_ROW_HEIGHT,
    ),
    [filteredItems.length, mainTableViewport],
  );
  const visibleFilteredItems = useMemo(
    () => filteredItems.slice(mainVirtualRange.start, mainVirtualRange.end),
    [filteredItems, mainVirtualRange],
  );
  const mainTopSpacerHeight = mainVirtualRange.start * MAIN_ROW_HEIGHT;
  const mainBottomSpacerHeight =
    Math.max(0, filteredItems.length - mainVirtualRange.end) * MAIN_ROW_HEIGHT;

  const unmappedVirtualRange = useMemo(
    () => getVirtualRange(
      unmappedDialogItems.length,
      unmappedTableViewport.scrollTop,
      unmappedTableViewport.height,
      DIALOG_ROW_HEIGHT,
    ),
    [unmappedDialogItems.length, unmappedTableViewport],
  );
  const visibleUnmappedDialogItems = useMemo(
    () => unmappedDialogItems.slice(unmappedVirtualRange.start, unmappedVirtualRange.end),
    [unmappedDialogItems, unmappedVirtualRange],
  );
  const unmappedTopSpacerHeight = unmappedVirtualRange.start * DIALOG_ROW_HEIGHT;
  const unmappedBottomSpacerHeight =
    Math.max(0, unmappedDialogItems.length - unmappedVirtualRange.end) * DIALOG_ROW_HEIGHT;

  const claimTableWidth = useMemo(
    () =>
      CLAIM_TABLE_COLUMNS.reduce(
        (total, column) => total + Number(columnWidths[column.key] || column.width),
        0,
      ),
    [columnWidths],
  );

  const handleExcelFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setLoading(true);
    setMessage(null);
    setErrorMessage('');

    try {
      const workbook = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await workbook.xlsx.load(buffer);

      const worksheet =
        workbook.worksheets.find((sheet) => sheet.name.includes('기성내역서')) ||
        workbook.worksheets[0];

      if (!worksheet) {
        throw new Error('엑셀 안에 읽을 수 있는 시트가 없습니다.');
      }

      const parsedItems = parseDirectCostWorksheet(worksheet);
      const projectLabel = readText(worksheet.getRow(2), 2)
        .replace(/^현장명\s*:\s*/, '')
        .trim();

      setItems(parsedItems);
      setSelectedKeys(new Set());
      setUnmappedSelectedKeys(new Set());
      setActiveClaimId(null);
      setSourceFileName(file.name);
      setSourceProjectLabel(projectLabel);
      const parsedErrorCount = parsedItems.filter(
        (item) => item.validation_errors.length > 0,
      ).length;
      setMessage({
        severity: parsedErrorCount > 0 ? 'warning' : 'success',
        text:
          `${file.name}에서 직접비 ${parsedItems.length.toLocaleString()}개 품목을 읽었습니다. 간접비는 제외했습니다.` +
          (parsedErrorCount > 0
            ? ` 검산 오류 ${parsedErrorCount.toLocaleString()}개 행은 저장에서 제외됩니다.`
            : ''),
      });
    } catch (error) {
      console.error('기성 엑셀 읽기 오류:', error);
      setItems([]);
      setSelectedKeys(new Set());
      setUnmappedSelectedKeys(new Set());
      setSourceFileName('');
      setSourceProjectLabel('');
      setErrorMessage(`엑셀을 읽지 못했습니다: ${error?.message || '알 수 없는 오류'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessChange = useCallback((targetItem, nextProcess) => {
    const sameItemCount = applySameItem
      ? items.filter(
          (item) => item.base_item_name === targetItem.base_item_name,
        ).length
      : 1;
    const nextLabel = getProcessDisplayLabel(nextProcess);

    if (
      applySameItem &&
      sameItemCount > 1 &&
      !window.confirm(
        `동일 품명 ${sameItemCount.toLocaleString()}개 행에 "${nextLabel}"을 적용하시겠습니까?`,
      )
    ) {
      return false;
    }

    setItems((previousItems) =>
      previousItems.map((item) => {
        const shouldChange = applySameItem
          ? item.base_item_name === targetItem.base_item_name
          : item.source_key === targetItem.source_key;

        return shouldChange
          ? {
              ...item,
              process_type: nextProcess,
            }
          : item;
      }),
    );
    return true;
  }, [applySameItem, items]);

  const handleOpenRowProcessPicker = useCallback((item) => {
    if (selectedKeys.size > 0) {
      const selectedItems = items.filter((candidate) =>
        selectedKeys.has(candidate.source_key),
      );
      const firstProcessValue = selectedItems[0]?.process_type || '';
      const allSelectedRowsHaveSameProcess = selectedItems.every(
        (candidate) =>
          encodeProcessTypes(decodeProcessTypes(candidate.process_type)) ===
          encodeProcessTypes(decodeProcessTypes(firstProcessValue)),
      );

      setProcessPickerMode('bulk');
      setProcessPickerTarget(null);
      setProcessPickerValues(
        allSelectedRowsHaveSameProcess
          ? decodeProcessTypes(firstProcessValue).filter(
              (process) => !EXCLUDED_CLAIM_PROCESS_OPTIONS.has(process),
            )
          : [],
      );
      setProcessPickerOpen(true);
      return;
    }

    setProcessPickerMode('row');
    setProcessPickerTarget(item);
    setProcessPickerValues(
      decodeProcessTypes(item.process_type).filter(
        (process) => !EXCLUDED_CLAIM_PROCESS_OPTIONS.has(process),
      ),
    );
    setProcessPickerOpen(true);
  }, [items, selectedKeys]);

  const handleOpenBulkProcessPicker = () => {
    if (selectedKeys.size === 0) {
      setErrorMessage('공정을 일괄 적용할 행을 먼저 선택해주세요.');
      return;
    }
    setProcessPickerMode('bulk');
    setProcessPickerTarget(null);
    setProcessPickerValues([]);
    setProcessPickerOpen(true);
  };

  const handleToggleProcessPickerValue = (process) => {
    setProcessPickerValues((previous) =>
      previous.includes(process)
        ? previous.filter((value) => value !== process)
        : [...previous, process],
    );
  };

  const handleApplyProcessPicker = () => {
    const encoded = encodeProcessTypes(processPickerValues);

    if (processPickerMode === 'row' && processPickerTarget) {
      const applied = handleProcessChange(processPickerTarget, encoded);
      if (!applied) return;
      setMessage({
        severity: 'success',
        text: `${processPickerTarget.item_name} 품목의 공정을 "${getProcessDisplayLabel(encoded)}"으로 변경했습니다.`,
      });
    } else if (processPickerMode === 'bulk') {
      setItems((previousItems) =>
        previousItems.map((item) =>
          selectedKeys.has(item.source_key)
            ? { ...item, process_type: encoded }
            : item,
        ),
      );
      setMessage({
        severity: 'success',
        text: `선택한 ${selectedKeys.size.toLocaleString()}개 행을 "${getProcessDisplayLabel(encoded)}" 상태로 변경했습니다.`,
      });
    }

    setErrorMessage('');
    setProcessPickerOpen(false);
  };

  const handleToggleSelectedKey = useCallback((sourceKey) => {
    setSelectedKeys((previousKeys) => {
      const nextKeys = new Set(previousKeys);
      if (nextKeys.has(sourceKey)) nextKeys.delete(sourceKey);
      else nextKeys.add(sourceKey);
      return nextKeys;
    });
  }, []);

  const handleToggleFilteredSelection = (checked) => {
    setSelectedKeys((previousKeys) => {
      const nextKeys = new Set(previousKeys);
      filteredSourceKeys.forEach((key) => {
        if (checked) nextKeys.add(key);
        else nextKeys.delete(key);
      });
      return nextKeys;
    });
  };

  const handleClearSelectedProcesses = () => {
    if (selectedKeys.size === 0) return;
    setItems((previousItems) =>
      previousItems.map((item) =>
        selectedKeys.has(item.source_key)
          ? { ...item, process_type: '' }
          : item,
      ),
    );
    setMessage({
      severity: 'success',
      text: `선택한 ${selectedKeys.size.toLocaleString()}개 행의 공정 연결을 해제했습니다.`,
    });
  };

  const handleOpenUnmappedDialog = () => {
    setUnmappedKeyword('');
    setUnmappedTypeFilter('전체');
    setUnmappedProcesses([]);
    setUnmappedSelectedKeys(new Set());
    setUnmappedDialogOpen(true);
  };

  const handleChangeUnmappedTypeFilter = (nextType) => {
    setUnmappedTypeFilter(nextType);
    setUnmappedSelectedKeys(new Set());

    if (unmappedTableContainerRef.current) {
      unmappedTableContainerRef.current.scrollTop = 0;
    }
    setUnmappedTableViewport((previous) => ({ ...previous, scrollTop: 0 }));
  };

  const handleToggleUnmappedKey = (sourceKey) => {
    setUnmappedSelectedKeys((previousKeys) => {
      const nextKeys = new Set(previousKeys);
      if (nextKeys.has(sourceKey)) nextKeys.delete(sourceKey);
      else nextKeys.add(sourceKey);
      return nextKeys;
    });
  };

  const handleToggleUnmappedDialogSelection = (checked) => {
    setUnmappedSelectedKeys((previousKeys) => {
      const nextKeys = new Set(previousKeys);
      unmappedDialogSourceKeys.forEach((key) => {
        if (checked) nextKeys.add(key);
        else nextKeys.delete(key);
      });
      return nextKeys;
    });
  };

  const handleApplyUnmappedProcess = () => {
    if (unmappedSelectedKeys.size === 0) {
      setErrorMessage('공정을 연결할 미연결 품목을 선택해주세요.');
      return;
    }

    if (unmappedProcesses.length === 0) {
      setErrorMessage('선택 품목에 연결할 공정을 선택해주세요.');
      return;
    }

    const encoded = encodeProcessTypes(unmappedProcesses);
    setItems((previousItems) =>
      previousItems.map((item) =>
        unmappedSelectedKeys.has(item.source_key)
          ? { ...item, process_type: encoded }
          : item,
      ),
    );
    setMessage({
      severity: 'success',
      text: `검색·선택한 ${unmappedSelectedKeys.size.toLocaleString()}개 품목에 "${getProcessDisplayLabel(encoded)}" 공정을 연결했습니다.`,
    });
    setErrorMessage('');
    setUnmappedDialogOpen(false);
    setUnmappedSelectedKeys(new Set());
  };

  const handleColumnResizeStart = (event, column) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = Number(columnWidths[column.key] || column.width);

    const handlePointerMove = (moveEvent) => {
      const nextWidth = clamp(
        startWidth + moveEvent.clientX - startX,
        column.min,
        column.max,
      );
      setColumnWidths((previousWidths) => ({
        ...previousWidths,
        [column.key]: nextWidth,
      }));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleAutoFitColumn = (event, column) => {
    event.preventDefault();
    event.stopPropagation();

    const sampleItems = filteredItems.length > 0 ? filteredItems : items;
    const measuredWidth = sampleItems.reduce(
      (largestWidth, item) =>
        Math.max(
          largestWidth,
          estimateTextWidth(getColumnDisplayValue(item, column.key)),
        ),
      estimateTextWidth(column.label),
    );

    setColumnWidths((previousWidths) => ({
      ...previousWidths,
      [column.key]: clamp(measuredWidth, column.min, column.max),
    }));
  };

  const handleResetColumnWidths = () => {
    setColumnWidths(getDefaultColumnWidths());
  };

  const handleSplitterPointerDown = (event) => {
    event.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const startY = event.clientY;
    const startPercent = splitPercent;

    const handlePointerMove = (moveEvent) => {
      const deltaPercent =
        ((moveEvent.clientY - startY) / containerRect.height) * 100;
      setSplitPercent(clamp(startPercent + deltaPercent, 38, 78));
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleSave = async () => {
    if (!projectName) {
      setErrorMessage('저장할 현장을 먼저 선택해주세요.');
      return;
    }

    if (!baseMonth || !contractVersionLabel.trim() || Number(claimNo) < 1) {
      setErrorMessage('회차, 기준월, 계약 버전을 모두 확인해주세요.');
      return;
    }

    if (validItems.length === 0) {
      setErrorMessage('저장할 수 있는 정상 직접비 품목이 없습니다.');
      return;
    }

    const confirmed = window.confirm(
      `${projectName} ${claimNo}회차 직접비 ${validItems.length.toLocaleString()}개 품목을 저장하시겠습니까?` +
        (errorRowCount > 0 ? `\n오류 ${errorRowCount}개 행은 저장에서 제외됩니다.` : '') +
        (unmappedCount > 0 ? `\n공정 미연결 ${unmappedCount}개 품목은 미연결 상태로 저장됩니다.` : ''),
    );

    if (!confirmed) return;

    setSaving(true);
    setMessage(null);
    setErrorMessage('');

    try {
      const payload = validItems.map(({ validation_errors, ...item }) => ({
        ...item,
        process_type: encodeProcessTypes(decodeProcessTypes(item.process_type)),
      }));
      const { data, error } = await supabase.rpc('save_progress_claim', {
        p_project_name: projectName,
        p_contract_version_label: contractVersionLabel.trim(),
        p_claim_no: Number(claimNo),
        p_base_month: `${baseMonth}-01`,
        p_source_file_name: sourceFileName || null,
        p_items: payload,
      });

      if (error) throw error;

      setActiveClaimId(data);
      setMessage({
        severity: 'success',
        text: `${claimNo}회차 직접비 기성자료를 저장했습니다.`,
      });
      await loadClaimList();
    } catch (error) {
      console.error('기성자료 저장 오류:', error);
      setErrorMessage(`저장하지 못했습니다: ${error?.message || '알 수 없는 오류'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadClaim = async (claimId) => {
    setLoading(true);
    setMessage(null);
    setErrorMessage('');

    try {
      const { data, error } = await supabase.rpc('get_progress_claim_detail', {
        p_claim_id: claimId,
      });

      if (error) throw error;

      const claim = data?.claim;
      const detailItems = (data?.items || []).map((item) => ({
        ...item,
        process_type: encodeProcessTypes(decodeProcessTypes(item.process_type)),
        validation_errors: [],
      }));

      setActiveClaimId(claimId);
      setClaimNo(Number(claim?.claim_no) || 1);
      setBaseMonth(String(claim?.base_month || '').slice(0, 7));
      setContractVersionLabel(
        claim?.contract_version_label || DEFAULT_CONTRACT_VERSION,
      );
      setSourceFileName(claim?.source_file_name || '');
      setSourceProjectLabel(projectName);
      setItems(detailItems);
      setSelectedKeys(new Set());
      setUnmappedSelectedKeys(new Set());
      setMessage({
        severity: 'info',
        text: `${claim?.claim_no || ''}회차 저장자료를 위쪽 작성영역에 불러왔습니다.`,
      });
    } catch (error) {
      console.error('기성 상세조회 오류:', error);
      setErrorMessage(`상세자료를 불러오지 못했습니다: ${error?.message || '알 수 없는 오류'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleNewClaim = () => {
    const nextClaimNo =
      claims.length > 0
        ? Math.max(...claims.map((row) => Number(row.claim_no) || 0)) + 1
        : 1;

    setActiveClaimId(null);
    setClaimNo(nextClaimNo);
    setBaseMonth(getKoreaMonthValue());
    setContractVersionLabel(DEFAULT_CONTRACT_VERSION);
    setSourceFileName('');
    setSourceProjectLabel('');
    setItems([]);
    setSelectedKeys(new Set());
    setUnmappedSelectedKeys(new Set());
    setKeyword('');
    setOptionFilter('전체');
    setOnlyUnmapped(false);
    setMessage({
      severity: 'info',
      text: `${nextClaimNo}회차 새 작성을 시작합니다. 기존 기성 엑셀을 선택해주세요.`,
    });
    setErrorMessage('');
  };

  return (
    <>
      <Box
        ref={splitContainerRef}
        sx={{
          height: '100%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            flex: `0 0 calc(${splitPercent}% - 4px)`,
            minHeight: 320,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderColor: '#cbd5e1',
          }}
        >
          <Box
            sx={{
              px: 1.5,
              pt: 1.15,
              pb: 0.8,
              borderBottom: '1px solid #cbd5e1',
              bgcolor: '#f8fafc',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                flexWrap: 'nowrap',
                minWidth: 0,
                minHeight: 48,
                overflowX: 'auto',
                pt: 0.45,
                pb: 0.2,
              }}
            >
              <Box sx={{ width: 235, minWidth: 235, flexShrink: 0 }}>
                <Typography
                  sx={{
                    color: '#0f172a',
                    fontSize: '0.9rem',
                    fontWeight: 900,
                    lineHeight: 1.2,
                  }}
                >
                  기성내역서 작성 · 직접비
                </Typography>
                <Typography noWrap sx={{ color: '#64748b', fontSize: '0.6rem' }}>
                  엑셀 최종값만 읽으며 직접비만 반영합니다.
                </Typography>
              </Box>

              <TextField
                label="회차"
                type="number"
                size="small"
                value={claimNo}
                onChange={(event) =>
                  setClaimNo(Math.max(1, Number(event.target.value) || 1))
                }
                inputProps={{ min: 1 }}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 84, flexShrink: 0 }}
              />

              <TextField
                label="기준월"
                type="month"
                size="small"
                value={baseMonth}
                onChange={(event) => setBaseMonth(event.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 145, flexShrink: 0 }}
              />

              <TextField
                label="계약 버전"
                size="small"
                value={contractVersionLabel}
                onChange={(event) => setContractVersionLabel(event.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 150, flexShrink: 0 }}
              />

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm"
                hidden
                onChange={handleExcelFile}
              />

              <Box
                sx={{
                  ml: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.65,
                  flexShrink: 0,
                }}
              >
                {sourceProjectLabel && (
                  <Chip
                    size="small"
                    label={sourceProjectLabel}
                    sx={{
                      maxWidth: 300,
                      '& .MuiChip-label': {
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      },
                    }}
                  />
                )}

                <Button
                  size="small"
                  variant="outlined"
                  startIcon={
                    loading ? <CircularProgress size={14} /> : <UploadFileRoundedIcon />
                  }
                  disabled={loading || saving}
                  onClick={() => fileInputRef.current?.click()}
                  sx={{
                    minWidth: 118,
                    height: 38,
                    px: 1.2,
                    whiteSpace: 'nowrap',
                    fontSize: '0.72rem',
                  }}
                >
                  기성 엑셀 선택
                </Button>

                <Button
                  size="small"
                  variant="contained"
                  startIcon={
                    saving ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <SaveRoundedIcon />
                    )
                  }
                  disabled={saving || loading || validItems.length === 0}
                  onClick={handleSave}
                  sx={{
                    minWidth: activeClaimId ? 132 : 94,
                    height: 38,
                    px: 1.2,
                    whiteSpace: 'nowrap',
                    fontSize: '0.72rem',
                    bgcolor: '#0f766e',
                    '&:hover': { bgcolor: '#115e59' },
                  }}
                >
                  {activeClaimId ? '현재 회차 다시 저장' : '회차 저장'}
                </Button>
              </Box>
            </Box>

            {(message || errorMessage) && (
              <Box sx={{ mt: 0.8 }}>
                {errorMessage ? (
                  <Alert severity="error" sx={{ py: 0, fontSize: '0.72rem' }}>
                    {errorMessage}
                  </Alert>
                ) : (
                  <Alert
                    severity={message.severity}
                    sx={{ py: 0, fontSize: '0.72rem' }}
                  >
                    {message.text}
                  </Alert>
                )}
              </Box>
            )}

            <Stack
              direction="row"
              spacing={0.8}
              sx={{ mt: 0.9, overflowX: 'auto', pb: 0.1 }}
            >
              <SummaryCard
                label="계약 직접비"
                value={contractTotal}
                subLabel={`재료 ${formatMoney(summary.contractMaterial)} · 노무 ${formatMoney(summary.contractLabor)} · 경비 ${formatMoney(summary.contractExpense)}`}
              />
              <SummaryCard
                label="금회 직접기성"
                value={currentTotal}
                color="#0369a1"
                subLabel={`재료 ${formatMoney(summary.currentMaterial)} · 노무 ${formatMoney(summary.currentLabor)} · 경비 ${formatMoney(summary.currentExpense)}`}
              />
              <SummaryCard
                label="누계 직접기성"
                value={cumulativeTotal}
                color="#0f766e"
                subLabel={`직접비 누계율 ${(cumulativeRate * 100).toFixed(2)}%`}
              />
              <SummaryCard
                label="잔여 직접기성"
                value={contractTotal - cumulativeTotal}
                color="#7c2d12"
                subLabel="계약 직접비 - 누계 직접기성"
              />
            </Stack>

            <Stack
              direction="row"
              spacing={0.7}
              useFlexGap
              alignItems="center"
              sx={{ mt: 0.85, flexWrap: 'wrap' }}
            >
              <TextField
                size="small"
                placeholder="타입·품명·규격·공정 검색"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                sx={{ width: 235 }}
              />
              <TextField
                select
                size="small"
                label="구분"
                value={mainTypeFilter}
                onChange={(event) => setMainTypeFilter(event.target.value)}
                sx={{ width: 145 }}
              >
                <MenuItem value="전체">전체</MenuItem>
                {mainTypeOptions.map((type) => (
                  <MenuItem key={type.label} value={type.label}>
                    {type.label} ({type.count.toLocaleString()})
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="옵션"
                value={optionFilter}
                onChange={(event) => setOptionFilter(event.target.value)}
                sx={{ width: 100 }}
              >
                {['전체', '기본', '확장'].map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={onlyUnmapped}
                    onChange={(event) => setOnlyUnmapped(event.target.checked)}
                  />
                }
                label={
                  <Typography sx={{ fontSize: '0.69rem' }}>
                    공정 미연결만
                  </Typography>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={applySameItem}
                    onChange={(event) => setApplySameItem(event.target.checked)}
                  />
                }
                label={
                  <Typography sx={{ fontSize: '0.69rem' }}>
                    동일 품명에 공정 함께 적용
                  </Typography>
                }
              />

              <Divider orientation="vertical" flexItem />

              <Button
                size="small"
                variant="outlined"
                disabled={selectedKeys.size === 0}
                onClick={handleOpenBulkProcessPicker}
                sx={{ whiteSpace: 'nowrap' }}
              >
                선택 행 공정 ({selectedKeys.size.toLocaleString()})
              </Button>
              <Button
                size="small"
                disabled={selectedKeys.size === 0}
                onClick={handleClearSelectedProcesses}
                sx={{ whiteSpace: 'nowrap' }}
              >
                공정 해제
              </Button>
              <Button
                size="small"
                disabled={selectedKeys.size === 0}
                onClick={() => setSelectedKeys(new Set())}
                sx={{ whiteSpace: 'nowrap' }}
              >
                선택 해제
              </Button>
              <Button
                size="small"
                onClick={handleResetColumnWidths}
                sx={{ whiteSpace: 'nowrap' }}
              >
                열 너비 초기화
              </Button>

              <Box sx={{ flexGrow: 1 }} />
              <Chip
                size="small"
                color="primary"
                variant="outlined"
                label={`표시 ${filteredItems.length.toLocaleString()} / 전체 ${items.length.toLocaleString()}`}
              />
              <Chip
                size="small"
                color={unmappedCount > 0 ? 'warning' : 'success'}
                variant="outlined"
                clickable={unmappedCount > 0}
                onClick={unmappedCount > 0 ? handleOpenUnmappedDialog : undefined}
                label={`공정 미연결 ${unmappedCount.toLocaleString()}`}
                sx={{ fontWeight: 800 }}
              />
              {errorRowCount > 0 && (
                <Chip
                  size="small"
                  color="error"
                  label={`오류 ${errorRowCount.toLocaleString()}`}
                />
              )}
            </Stack>
          </Box>

          <TableContainer
            ref={mainTableContainerRef}
            onScroll={handleMainTableScroll}
            sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}
          >
            <Table
              stickyHeader
              size="small"
              sx={{
                tableLayout: 'fixed',
                width: claimTableWidth,
                minWidth: claimTableWidth,
              }}
            >
              <colgroup>
                {CLAIM_TABLE_COLUMNS.map((column) => (
                  <col
                    key={column.key}
                    style={{ width: columnWidths[column.key] || column.width }}
                  />
                ))}
              </colgroup>
              <TableHead>
                <TableRow>
                  {CLAIM_TABLE_COLUMNS.map((column) => (
                    <TableCell
                      key={column.key}
                      align="center"
                      sx={{
                        ...headerCellSx,
                        textAlign: 'center',
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        bgcolor: '#e2e8f0',
                        width: columnWidths[column.key] || column.width,
                        minWidth: columnWidths[column.key] || column.width,
                        maxWidth: columnWidths[column.key] || column.width,
                        overflow: 'hidden',
                        px: column.key === 'selected' ? 0.2 : 1,
                      }}
                    >
                      {column.key === 'selected' ? (
                        <Checkbox
                          size="small"
                          checked={allFilteredSelected}
                          indeterminate={someFilteredSelected}
                          disabled={filteredItems.length === 0}
                          onChange={(event) =>
                            handleToggleFilteredSelection(event.target.checked)
                          }
                          inputProps={{ 'aria-label': '현재 표시 행 전체 선택' }}
                          sx={{ p: 0.4 }}
                        />
                      ) : (
                        column.label
                      )}
                      {column.key !== 'selected' && (
                        <Box
                          role="separator"
                          aria-label={`${column.label} 열 너비 조절`}
                          onPointerDown={(event) =>
                            handleColumnResizeStart(event, column)
                          }
                          onDoubleClick={(event) =>
                            handleAutoFitColumn(event, column)
                          }
                          sx={{
                            position: 'absolute',
                            top: 0,
                            right: -3,
                            width: 7,
                            height: '100%',
                            cursor: 'col-resize',
                            zIndex: 5,
                            '&:hover': { bgcolor: 'rgba(14,116,144,0.25)' },
                          }}
                        />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={CLAIM_TABLE_COLUMNS.length}
                      align="center"
                      sx={{ py: 6, color: '#94a3b8' }}
                    >
                      {items.length === 0
                        ? '상단의 기성 엑셀 선택 버튼으로 기존 기성내역서를 불러와주세요.'
                        : '현재 필터에 해당하는 품목이 없습니다.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {mainTopSpacerHeight > 0 && (
                      <TableRow aria-hidden="true" sx={{ height: mainTopSpacerHeight }}>
                        <TableCell colSpan={CLAIM_TABLE_COLUMNS.length} sx={{ p: 0, border: 0, height: mainTopSpacerHeight }} />
                      </TableRow>
                    )}
                    {visibleFilteredItems.map((item) => {
                    const hasError =
                      (item.validation_errors || []).length > 0;

                    return (
                      <TableRow
                        key={item.source_key}
                        hover
                        selected={selectedKeys.has(item.source_key)}
                        sx={{
                          height: MAIN_ROW_HEIGHT,
                          bgcolor: hasError
                            ? '#fff1f2'
                            : item.option_type === '확장'
                              ? '#fffdf5'
                              : '#ffffff',
                          '&.Mui-selected': {
                            bgcolor: '#e0f2fe',
                            '&:hover': { bgcolor: '#bae6fd' },
                          },
                        }}
                      >
                        <TableCell align="center" sx={{ ...bodyCellSx, p: 0.2 }}>
                          <Checkbox
                            size="small"
                            checked={selectedKeys.has(item.source_key)}
                            onChange={() => handleToggleSelectedKey(item.source_key)}
                            inputProps={{
                              'aria-label': `${item.source_row_no}행 선택`,
                            }}
                            sx={{ p: 0.4 }}
                          />
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, overflow: 'hidden' }}>
                          {item.source_row_no}
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, overflow: 'hidden' }}>
                          <Typography
                            noWrap
                            title={item.housing_type || item.classification}
                            sx={{ fontSize: '0.67rem', fontWeight: 800 }}
                          >
                            {item.housing_type || item.classification}
                          </Typography>
                          <Typography
                            noWrap
                            title={item.work_zone || '-'}
                            sx={{ color: '#64748b', fontSize: '0.6rem' }}
                          >
                            {item.work_zone || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, overflow: 'hidden', px: 0.35 }}>
                          <Chip
                            size="small"
                            label={item.option_type}
                            color={
                              item.option_type === '확장' ? 'warning' : 'default'
                            }
                            variant="outlined"
                            sx={{ height: 21, fontSize: '0.59rem' }}
                          />
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, overflow: 'hidden' }}>
                          <Typography
                            noWrap
                            title={item.item_name}
                            sx={{ fontSize: '0.67rem', fontWeight: 800 }}
                          >
                            {item.item_name}
                          </Typography>
                          {hasError && (
                            <Typography
                              noWrap
                              title={item.validation_errors.join(' · ')}
                              sx={{
                                mt: 0.2,
                                color: '#dc2626',
                                fontSize: '0.58rem',
                              }}
                            >
                              {item.validation_errors.join(' · ')}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, overflow: 'hidden' }}>
                          <Typography
                            noWrap
                            title={item.specification}
                            sx={{ fontSize: '0.64rem' }}
                          >
                            {item.specification || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, overflow: 'hidden' }}>
                          {item.unit}
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, p: 0.3, overflow: 'hidden' }}>
                          <Button
                            fullWidth
                            size="small"
                            variant={decodeProcessTypes(item.process_type).length > 0 ? 'outlined' : 'text'}
                            onClick={() => handleOpenRowProcessPicker(item)}
                            title={getProcessDisplayLabel(item.process_type)}
                            sx={{
                              minWidth: 0,
                              height: 28,
                              px: 0.6,
                              justifyContent: 'flex-start',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: '0.63rem',
                              color: decodeProcessTypes(item.process_type).length > 0 ? '#0f766e' : '#94a3b8',
                              borderColor: '#99f6e4',
                            }}
                          >
                            {getProcessDisplayLabel(item.process_type)}
                          </Button>
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, ...numberCellSx }}>
                          {formatQuantity(item.contract_quantity)}
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, ...numberCellSx }}>
                          {formatMoney(item.contract_material_amount)}
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, ...numberCellSx }}>
                          {formatMoney(item.contract_labor_amount)}
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, ...numberCellSx }}>
                          {formatMoney(item.contract_expense_amount)}
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, ...numberCellSx }}>
                          {formatQuantity(item.current_quantity)}
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, ...numberCellSx }}>
                          {formatMoney(item.current_material_amount)}
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, ...numberCellSx }}>
                          {formatMoney(item.current_labor_amount)}
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, ...numberCellSx }}>
                          {formatMoney(item.current_expense_amount)}
                        </TableCell>
                        <TableCell
                          sx={{
                            ...bodyCellSx,
                            ...numberCellSx,
                            fontWeight: 800,
                          }}
                        >
                          {formatMoney(getItemTotal(item, 'cumulative'))}
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, ...numberCellSx }}>
                          {(toNumber(item.cumulative_rate) * 100).toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    );
                    })}
                    {mainBottomSpacerHeight > 0 && (
                      <TableRow aria-hidden="true" sx={{ height: mainBottomSpacerHeight }}>
                        <TableCell colSpan={CLAIM_TABLE_COLUMNS.length} sx={{ p: 0, border: 0, height: mainBottomSpacerHeight }} />
                      </TableRow>
                    )}
                  </>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Box
          onPointerDown={handleSplitterPointerDown}
          onDoubleClick={() => setSplitPercent(DEFAULT_SPLIT_PERCENT)}
          title="위아래로 드래그해 영역 높이를 조절합니다. 더블클릭하면 기본 높이로 돌아갑니다."
          sx={{
            flex: '0 0 8px',
            height: 8,
            cursor: 'row-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            touchAction: 'none',
            '&::before': {
              content: '""',
              width: 72,
              height: 3,
              borderRadius: 99,
              bgcolor: '#94a3b8',
            },
            '&:hover': { bgcolor: '#e0f2fe' },
          }}
        />

        <Paper
          variant="outlined"
          sx={{
            flex: '1 1 0',
            minHeight: 170,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderColor: '#cbd5e1',
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.8}
            sx={{
              px: 1.4,
              py: 0.8,
              borderBottom: '1px solid #cbd5e1',
              bgcolor: '#f8fafc',
            }}
          >
            <Box sx={{ flexGrow: 1 }}>
              <Typography
                sx={{ color: '#0f172a', fontSize: '0.85rem', fontWeight: 900 }}
              >
                등록된 기성 회차
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: '0.61rem' }}>
                가운데 조절바를 드래그하면 목록 영역 높이를 자유롭게 바꿀 수 있습니다.
              </Typography>
            </Box>
            <Button
              size="small"
              startIcon={<AddRoundedIcon />}
              onClick={handleNewClaim}
            >
              새 회차
            </Button>
            <Button
              size="small"
              startIcon={
                listLoading ? (
                  <CircularProgress size={14} />
                ) : (
                  <RefreshRoundedIcon />
                )
              }
              disabled={listLoading}
              onClick={loadClaimList}
            >
              새로고침
            </Button>
          </Stack>

          <TableContainer sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
            <Table stickyHeader size="small" sx={{ minWidth: 1000 }}>
              <TableHead>
                <TableRow>
                  {[
                    '회차',
                    '기준월',
                    '계약 버전',
                    '금회 직접기성',
                    '누계 직접기성',
                    '누계율',
                    '품목수',
                    '등록·수정자',
                    '최종 수정일',
                    '상태',
                  ].map((label) => (
                    <TableCell
                      key={label}
                      sx={{ ...headerCellSx, textAlign: 'center' }}
                      align="center"
                    >
                      {label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {claims.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      align="center"
                      sx={{ py: 5, color: '#94a3b8' }}
                    >
                      {listLoading
                        ? '기성 회차를 불러오는 중입니다.'
                        : '아직 등록된 기성 회차가 없습니다.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  claims.map((claim) => {
                    const claimContractTotal =
                      toNumber(claim.contract_material_amount) +
                      toNumber(claim.contract_labor_amount) +
                      toNumber(claim.contract_expense_amount);
                    const claimCurrentTotal =
                      toNumber(claim.current_material_amount) +
                      toNumber(claim.current_labor_amount) +
                      toNumber(claim.current_expense_amount);
                    const claimCumulativeTotal =
                      toNumber(claim.cumulative_material_amount) +
                      toNumber(claim.cumulative_labor_amount) +
                      toNumber(claim.cumulative_expense_amount);
                    const claimRate =
                      claimContractTotal > 0
                        ? claimCumulativeTotal / claimContractTotal
                        : 0;

                    return (
                      <TableRow
                        key={claim.id}
                        hover
                        selected={activeClaimId === claim.id}
                        onClick={() => handleLoadClaim(claim.id)}
                        sx={{ cursor: 'pointer', height: DIALOG_ROW_HEIGHT }}
                      >
                        <TableCell sx={{ ...bodyCellSx, fontWeight: 900 }}>
                          {claim.claim_no}회차
                        </TableCell>
                        <TableCell sx={bodyCellSx}>
                          {String(claim.base_month || '').slice(0, 7)}
                        </TableCell>
                        <TableCell sx={bodyCellSx}>
                          {claim.contract_version?.version_label || '-'}
                        </TableCell>
                        <TableCell
                          sx={{
                            ...bodyCellSx,
                            ...numberCellSx,
                            color: '#0369a1',
                            fontWeight: 800,
                          }}
                        >
                          {formatMoney(claimCurrentTotal)}원
                        </TableCell>
                        <TableCell
                          sx={{
                            ...bodyCellSx,
                            ...numberCellSx,
                            color: '#0f766e',
                            fontWeight: 800,
                          }}
                        >
                          {formatMoney(claimCumulativeTotal)}원
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, ...numberCellSx }}>
                          {(claimRate * 100).toFixed(2)}%
                        </TableCell>
                        <TableCell sx={{ ...bodyCellSx, ...numberCellSx }}>
                          {Number(claim.item_count || 0).toLocaleString()}
                        </TableCell>
                        <TableCell sx={bodyCellSx}>
                          {claim.updated_by_name || claim.created_by_name || '-'}
                        </TableCell>
                        <TableCell sx={bodyCellSx}>
                          {claim.updated_at
                            ? new Date(claim.updated_at).toLocaleString('ko-KR')
                            : '-'}
                        </TableCell>
                        <TableCell sx={bodyCellSx}>
                          <Chip
                            size="small"
                            label={
                              claim.status === 'confirmed' ? '확정' : '작성중'
                            }
                            color={
                              claim.status === 'confirmed' ? 'success' : 'warning'
                            }
                            variant="outlined"
                            sx={{ height: 21, fontSize: '0.59rem' }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      <Dialog
        open={processPickerOpen}
        onClose={() => setProcessPickerOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ pb: 0.8 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 900 }}>
            {processPickerMode === 'bulk'
              ? `선택 행 공정 연결 (${selectedKeys.size.toLocaleString()}건)`
              : '공정 연결'}
          </Typography>
          {processPickerTarget && (
            <Typography noWrap sx={{ mt: 0.2, color: '#64748b', fontSize: '0.7rem' }}>
              {processPickerTarget.item_name} · {processPickerTarget.specification || '-'}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers sx={{ py: 1.2 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 0.5,
            }}
          >
            {claimProcessOptions.map((process) => (
              <Button
                key={process}
                variant={processPickerValues.includes(process) ? 'contained' : 'outlined'}
                onClick={() => handleToggleProcessPickerValue(process)}
                sx={{
                  minHeight: 38,
                  justifyContent: 'flex-start',
                  fontSize: '0.72rem',
                  bgcolor: processPickerValues.includes(process) ? '#0f766e' : undefined,
                  '&:hover': processPickerValues.includes(process)
                    ? { bgcolor: '#115e59' }
                    : undefined,
                }}
              >
                <Checkbox
                  size="small"
                  checked={processPickerValues.includes(process)}
                  sx={{ p: 0, mr: 0.6, color: 'inherit', '&.Mui-checked': { color: 'inherit' } }}
                />
                {process}
              </Button>
            ))}
          </Box>
          <Typography sx={{ mt: 1, color: '#64748b', fontSize: '0.66rem' }}>
            경량벽체는 경량골조·경량석고를 묶고, 몰딩과 걸레받이는 1·2차를 각각 하나로 묶어 관리합니다. 단열과 합지는 동시에 선택할 수 있습니다.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.1 }}>
          <Button onClick={() => setProcessPickerValues([])}>전체 해제</Button>
          <Button onClick={() => setProcessPickerOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleApplyProcessPicker}
            sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}
          >
            적용
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={unmappedDialogOpen}
        onClose={() => setUnmappedDialogOpen(false)}
        fullWidth
        maxWidth={false}
        PaperProps={{
          sx: {
            width: 'min(1180px, calc(100vw - 48px))',
            height: 'min(780px, calc(100vh - 64px))',
            maxWidth: 'none',
            maxHeight: 'none',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 900 }}>
            공정 미연결 품목 일괄 연결
          </Typography>
          <Typography sx={{ mt: 0.25, color: '#64748b', fontSize: '0.7rem' }}>
            타입을 먼저 고른 뒤 품명 또는 규격을 검색해 필요한 행을 한 번에 연결합니다.
          </Typography>
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            p: 1.5,
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box sx={{ mb: 1.1 }}>
            <Typography sx={{ mb: 0.55, color: '#475569', fontSize: '0.7rem', fontWeight: 900 }}>
              타입 구분
            </Typography>
            <Stack direction="row" spacing={0.55} useFlexGap flexWrap="wrap">
              <Chip
                size="small"
                clickable
                color={unmappedTypeFilter === '전체' ? 'primary' : 'default'}
                variant={unmappedTypeFilter === '전체' ? 'filled' : 'outlined'}
                label={`전체 ${unmappedCount.toLocaleString()}`}
                onClick={() => handleChangeUnmappedTypeFilter('전체')}
              />
              {unmappedTypeOptions.map((type) => (
                <Chip
                  key={type.label}
                  size="small"
                  clickable
                  color={unmappedTypeFilter === type.label ? 'primary' : 'default'}
                  variant={unmappedTypeFilter === type.label ? 'filled' : 'outlined'}
                  label={`${type.label} ${type.count.toLocaleString()}`}
                  onClick={() => handleChangeUnmappedTypeFilter(type.label)}
                />
              ))}
            </Stack>
          </Box>

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1}
            alignItems={{ xs: 'stretch', md: 'center' }}
          >
            <TextField
              autoFocus
              size="small"
              label="품명 또는 규격 검색"
              placeholder="예: 단열재붙이기"
              value={unmappedKeyword}
              onChange={(event) => setUnmappedKeyword(event.target.value)}
              sx={{ flex: 1, minWidth: 260 }}
            />
            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={`검색 ${unmappedDialogItems.length.toLocaleString()} / 전체 미연결 ${unmappedCount.toLocaleString()}`}
            />
            <Chip
              size="small"
              color="primary"
              label={`품목 선택 ${unmappedSelectedKeys.size.toLocaleString()}`}
            />
          </Stack>

          <Box
            sx={{
              mt: 1.2,
              p: 1,
              border: '1px solid #cbd5e1',
              borderRadius: 1,
              bgcolor: '#f8fafc',
            }}
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={0.8}
              alignItems={{ xs: 'stretch', sm: 'center' }}
            >
              <Autocomplete
                multiple
                disableCloseOnSelect
                fullWidth
                size="small"
                options={claimProcessOptions}
                value={unmappedProcesses}
                onChange={(_event, nextValues) => {
                  setUnmappedProcesses(Array.from(new Set(nextValues)));
                }}
                isOptionEqualToValue={(option, value) => option === value}
                getOptionLabel={(option) => option}
                renderTags={(selected) => (
                  <Typography
                    noWrap
                    sx={{
                      maxWidth: '100%',
                      color: '#334155',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    {selected.join(PROCESS_SEPARATOR)}
                  </Typography>
                )}
                renderOption={(props, option, { selected }) => {
                  const { key, ...optionProps } = props;
                  return (
                    <li key={key} {...optionProps}>
                      <Checkbox
                        size="small"
                        checked={selected}
                        sx={{ p: 0.4, mr: 0.5 }}
                      />
                      <Typography sx={{ fontSize: '0.75rem' }}>{option}</Typography>
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="연결할 공정 · 복수 선택"
                    placeholder={unmappedProcesses.length === 0 ? '공정을 선택하세요' : ''}
                  />
                )}
                slotProps={{
                  paper: { sx: { mt: 0.5 } },
                  listbox: { sx: { maxHeight: 280 } },
                }}
                sx={{ flex: 1, minWidth: 0 }}
              />
              <Button
                size="small"
                variant="outlined"
                disabled={unmappedProcesses.length === 0}
                onClick={() => setUnmappedProcesses([])}
                sx={{ whiteSpace: 'nowrap' }}
              >
                공정 전체 해제
              </Button>
              <Chip
                size="small"
                color="success"
                variant="outlined"
                label={`공정 선택 ${unmappedProcesses.length.toLocaleString()}`}
              />
            </Stack>
            <Typography sx={{ mt: 0.7, color: '#64748b', fontSize: '0.64rem' }}>
              드롭다운에서 필요한 공정을 두 개 이상 선택한 뒤 선택 품목에 한 번에 적용합니다.
            </Typography>
          </Box>

          <TableContainer
            ref={unmappedTableContainerRef}
            onScroll={handleUnmappedTableScroll}
            component={Paper}
            variant="outlined"
            sx={{
              mt: 1.2,
              flex: 1,
              minHeight: 0,
              height: '100%',
              overflow: 'auto',
            }}
          >
            <Table stickyHeader size="small" sx={{ minWidth: 780 }}>
              <TableHead>
                <TableRow>
                  <TableCell align="center" sx={{ ...headerCellSx, width: 48 }}>
                    <Checkbox
                      size="small"
                      checked={allUnmappedDialogSelected}
                      indeterminate={someUnmappedDialogSelected}
                      disabled={unmappedDialogItems.length === 0}
                      onChange={(event) =>
                        handleToggleUnmappedDialogSelection(event.target.checked)
                      }
                      inputProps={{ 'aria-label': '검색된 미연결 품목 전체 선택' }}
                      sx={{ p: 0.4 }}
                    />
                  </TableCell>
                  <TableCell sx={{ ...headerCellSx, width: 58 }}>행</TableCell>
                  <TableCell sx={{ ...headerCellSx, width: 130 }}>
                    타입·공구
                  </TableCell>
                  <TableCell sx={{ ...headerCellSx, minWidth: 210 }}>
                    품명
                  </TableCell>
                  <TableCell sx={{ ...headerCellSx, minWidth: 280 }}>
                    규격
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {unmappedDialogItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      align="center"
                      sx={{ py: 5, color: '#94a3b8' }}
                    >
                      {unmappedCount === 0
                        ? '모든 품목에 공정이 연결되어 있습니다.'
                        : '검색 조건에 해당하는 미연결 품목이 없습니다.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {unmappedTopSpacerHeight > 0 && (
                      <TableRow aria-hidden="true" sx={{ height: unmappedTopSpacerHeight }}>
                        <TableCell colSpan={5} sx={{ p: 0, border: 0, height: unmappedTopSpacerHeight }} />
                      </TableRow>
                    )}
                    {visibleUnmappedDialogItems.map((item) => (
                    <TableRow
                      key={item.source_key}
                      hover
                      selected={unmappedSelectedKeys.has(item.source_key)}
                      onClick={() => handleToggleUnmappedKey(item.source_key)}
                      sx={{ cursor: 'pointer', height: DIALOG_ROW_HEIGHT }}
                    >
                      <TableCell align="center" sx={{ ...bodyCellSx, p: 0.2 }}>
                        <Checkbox
                          size="small"
                          checked={unmappedSelectedKeys.has(item.source_key)}
                          onChange={() => handleToggleUnmappedKey(item.source_key)}
                          onClick={(event) => event.stopPropagation()}
                          sx={{ p: 0.4 }}
                        />
                      </TableCell>
                      <TableCell sx={bodyCellSx}>{item.source_row_no}</TableCell>
                      <TableCell sx={bodyCellSx}>
                        <Typography sx={{ fontSize: '0.67rem', fontWeight: 800 }}>
                          {item.housing_type || item.classification}
                        </Typography>
                        <Typography sx={{ color: '#64748b', fontSize: '0.6rem' }}>
                          {item.work_zone || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell sx={bodyCellSx}>
                        <Typography sx={{ fontSize: '0.67rem', fontWeight: 800 }}>
                          {item.item_name}
                        </Typography>
                      </TableCell>
                      <TableCell sx={bodyCellSx}>
                        {item.specification || '-'}
                      </TableCell>
                    </TableRow>
                    ))}
                    {unmappedBottomSpacerHeight > 0 && (
                      <TableRow aria-hidden="true" sx={{ height: unmappedBottomSpacerHeight }}>
                        <TableCell colSpan={5} sx={{ p: 0, border: 0, height: unmappedBottomSpacerHeight }} />
                      </TableRow>
                    )}
                  </>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.2 }}>
          <Button onClick={() => setUnmappedDialogOpen(false)}>취소</Button>
          <Button
            variant="contained"
            disabled={unmappedSelectedKeys.size === 0 || unmappedProcesses.length === 0}
            onClick={handleApplyUnmappedProcess}
            sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}
          >
            선택 품목에 적용
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
