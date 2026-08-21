import {
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
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Popover,
  Select,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PostAddRoundedIcon from '@mui/icons-material/PostAddRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import TableViewRoundedIcon from '@mui/icons-material/TableViewRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import ExcelJS from 'exceljs';
import { supabase } from '../supabaseClient';
import {
  normalizeTechnicalAnnotations,
} from '../utils/technicalImageAnnotations';
import {
  DEFAULT_TECHNICAL_SHEET_LAYOUT,
  normalizeTechnicalSheetLayout,
  openTechnicalSheetEditorWindow,
  openTechnicalSheetViewerWindow,
} from '../utils/technicalImageSheetEditor';

const COST_TYPES = [
  { value: 'material', label: '재료비', color: '#0f766e' },
  { value: 'labor', label: '노무비', color: '#b45309' },
  { value: 'expense', label: '경비', color: '#7c3aed' },
];

const ROW_COST_TYPES = [
  ...COST_TYPES,
  { value: 'material_rounding', label: '재료비(단수정리)', color: '#0f766e' },
];

const EMPTY_DOCUMENT = {
  id: '',
  documentName: '',
  status: 'draft',
  versionNo: 0,
  latestVersionNo: 0,
  materialMarkup: 0,
  laborMarkup: 0,
  expenseMarkup: 0,
  notes: '',
};

const moneyFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 0,
});

const quantityFormatter = new Intl.NumberFormat('ko-KR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

const toNumber = (value) => {
  const parsed = Number(String(value ?? '').replaceAll(',', ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoney = (value) => moneyFormatter.format(Math.round(toNumber(value)));
const formatQuantity = (value) => quantityFormatter.format(toNumber(value));

const MATERIAL_SEARCH_ALIASES = [
  [/클립바/g, 'clipbar'],
  [/clipbar/g, 'clipbar'],
  [/(스터드|stud)/g, 'stud'],
  [/(런너|러너|runner)/g, 'runner'],
  [/(타일판)/g, 'altile'],
  [/(타일|tile)/g, 'tile'],
  [/(루바|루버|louver|lover)/g, 'louver'],
  [/(볼트|bolt)/g, 'bolt'],
  [/(찬넬|채널|channel)/g, 'channel'],
  [/(앵글|angle)/g, 'angle'],
  [/(조인트|joint|joiner)/g, 'joint'],
  [/(행거|hanger)/g, 'hanger'],
  [/(보드|board)/g, 'board'],
  [/(판넬|패널|panel)/g, 'panel'],
  [/(클립|clip)/g, 'clip'],
  [/(핀|pin)/g, 'pin'],
  [/(너트|nut)/g, 'nut'],
  [/(스프링|spring)/g, 'spring'],
  [/(몰딩|molding|moulding)/g, 'molding'],
  [/(메인|main)/g, 'main'],
  [/(마이너|minor)/g, 'minor'],
  [/(크로스|cross)/g, 'cross'],
  [/(캐링|캐리잉|carrying)/g, 'carrying'],
  [/(스크린|screen)/g, 'screen'],
  [/(티바|tbar)/g, 'tbar'],
  [/(엠바|mbar)/g, 'mbar'],
  [/(에이치바|hbar)/g, 'hbar'],
  [/(에스큐바|sqbar)/g, 'sqbar'],
];

const normalizeMaterialSearchText = (value) => {
  let normalized = String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, '');

  MATERIAL_SEARCH_ALIASES.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });

  return normalized;
};

const matchesMaterialSearch = (material, searchValue) => {
  const search = normalizeMaterialSearchText(searchValue);
  if (!search) return true;

  const searchableText = [
    material.item_code,
    material.item_name,
    material.specification,
    material.unit,
  ].map(normalizeMaterialSearchText).join('');

  return searchableText.includes(search);
};

const createClientId = () => (
  globalThis.crypto?.randomUUID?.() ||
  `row-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

const makeBlankRow = (sortOrder = 0) => ({
  clientId: createClientId(),
  sourceTemplateItemId: '',
  materialId: '',
  itemCode: '',
  costType: 'material',
  itemName: '',
  specification: '',
  unit: 'M',
  netQuantity: 0,
  laborAmountPerM2: '',
  unitPrice: 0,
  itemMarkupPercent: '',
  submittedQuantityOverride: '',
  isOwnerSupplied: false,
  remarks: '',
  sortOrder,
});

const getLegacyMarkupForType = (document, costType) => {
  if (costType === 'labor') return toNumber(document.laborMarkup);
  if (costType === 'expense') return toNumber(document.expenseMarkup);
  return toNumber(document.materialMarkup);
};

const mapStoredDocumentItems = (items, documentMeta) => (
  (items || []).map((item, index) => {
    const baseRow = {
      clientId: createClientId(),
      sourceTemplateItemId: item.source_template_item_id || '',
      materialId: item.material_id || '',
      itemCode: item.item_code || '',
      costType: item.cost_type === 'expense_rounding'
        ? 'material_rounding'
        : item.cost_type || 'material',
      itemName: item.cost_type === 'expense_rounding' && item.item_name === '경비 단수정리'
        ? ''
        : item.item_name || '',
      specification: item.cost_type === 'expense_rounding' && item.specification === '제출금액 100원 단위 정리'
        ? ''
        : item.specification || '',
      unit: item.unit || '',
      netQuantity: toNumber(item.net_quantity),
      laborAmountPerM2: item.cost_type === 'labor'
        ? toNumber(item.net_quantity) * toNumber(item.net_unit_price)
        : '',
      unitPrice: toNumber(item.net_unit_price),
      itemMarkupPercent:
        item.markup_override_percent === null ? '' : toNumber(item.markup_override_percent),
      submittedQuantityOverride: '',
      isOwnerSupplied: Boolean(item.is_owner_supplied),
      remarks: item.remarks || '',
      sortOrder: item.sort_order ?? index,
    };
    const storedSubmittedQuantity = toNumber(item.submitted_quantity);
    const netQuantity = toNumber(baseRow.netQuantity);
    const legacyMarkup = item.markup_override_percent === null
      ? getLegacyMarkupForType(documentMeta, baseRow.costType)
      : toNumber(item.markup_override_percent);
    const legacyAutoQuantity = netQuantity * (1 + legacyMarkup / 100);
    const isNewDefault = Math.abs(netQuantity - storedSubmittedQuantity) <= 0.000001;
    const isLegacyAutoQuantity = (
      Math.abs(legacyAutoQuantity - storedSubmittedQuantity) <= 0.000001
    );
    if (!isNewDefault && !isLegacyAutoQuantity) {
      baseRow.submittedQuantityOverride = storedSubmittedQuantity;
    }
    return baseRow;
  })
);

const getEffectiveMarkup = (row) => (
  row.itemMarkupPercent === '' || row.itemMarkupPercent === null
    ? 0
    : toNumber(row.itemMarkupPercent)
);

const isOwnerSuppliedMaterial = (row) => (
  row.costType === 'material' && Boolean(row.isOwnerSupplied)
);

const isRoundingMaterial = (row) => (
  row.costType === 'material_rounding' || row.costType === 'expense_rounding'
);

const getSummaryCostType = (row) => (
  isRoundingMaterial(row) ? 'material' : row.costType
);

const getSubmittedQuantity = (row) => {
  if (isRoundingMaterial(row)) return 1;
  if (
    row.submittedQuantityOverride !== '' &&
    row.submittedQuantityOverride !== null
  ) {
    return toNumber(row.submittedQuantityOverride);
  }

  return toNumber(row.netQuantity);
};

const getLaborAmountPerM2 = (row) => (
  row.laborAmountPerM2 === '' || row.laborAmountPerM2 === null
    ? toNumber(row.netQuantity) * toNumber(row.unitPrice)
    : toNumber(row.laborAmountPerM2)
);

const getSubmittedUnitPrice = (row, roundingAmount = 0) => (
  isRoundingMaterial(row)
    ? toNumber(roundingAmount)
    : isOwnerSuppliedMaterial(row)
    ? 0
    : toNumber(row.unitPrice) * (1 + getEffectiveMarkup(row) / 100)
);

const getNetAmount = (row) => {
  if (isOwnerSuppliedMaterial(row) || isRoundingMaterial(row)) return 0;
  if (row.costType === 'labor') return getLaborAmountPerM2(row);
  return toNumber(row.netQuantity) * toNumber(row.unitPrice);
};

const getSubmittedAmount = (row, roundingAmount = 0) => {
  if (isRoundingMaterial(row)) return toNumber(roundingAmount);
  if (isOwnerSuppliedMaterial(row)) return 0;

  const usesNetLaborQuantity = (
    row.costType === 'labor' &&
    (row.submittedQuantityOverride === '' || row.submittedQuantityOverride === null)
  );
  const baseAmount = usesNetLaborQuantity
    ? getLaborAmountPerM2(row)
    : getSubmittedQuantity(row) * toNumber(row.unitPrice);
  return baseAmount * (1 + getEffectiveMarkup(row) / 100);
};

const getRoundingAdjustment = (subtotal, baseAmount) => {
  const normalizedSubtotal = toNumber(subtotal);
  const remainder = ((normalizedSubtotal % 100) + 100) % 100;
  const tailAdjustment = remainder < 0.000001 ? 0 : 100 - remainder;
  return tailAdjustment + Math.max(0, toNumber(baseAmount));
};

const calculateRoundingAmounts = (rows) => {
  let runningTotal = rows
    .filter((row) => !isRoundingMaterial(row))
    .reduce((sum, row) => sum + getSubmittedAmount(row), 0);
  const amounts = new Map();

  rows.filter(isRoundingMaterial).forEach((row) => {
    const amount = getRoundingAdjustment(runningTotal, row.unitPrice);
    amounts.set(row.clientId, amount);
    runningTotal += amount;
  });

  return amounts;
};

const getToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
};

const saveBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

// v52.48.5.29 일위대가 기술자료 이미지
const UNIT_PRICE_TECHNICAL_IMAGE_BUCKET = 'unit-price-technical-images';
const UNIT_PRICE_TECHNICAL_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const UNIT_PRICE_TECHNICAL_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

// v52.48.5.34.2 Supabase Storage object key는 ASCII 안전 문자열만 사용합니다.
// image_key 자체(DB 연결키)는 기존 한글 값을 그대로 유지하고,
// Storage에 파일을 저장할 때의 경로만 UTF-8 HEX로 변환합니다.
const normalizeTechnicalImageStorageKey = (value) => {
  const normalized = String(value || '')
    .normalize('NFKC')
    .trim();

  if (!normalized) return 'technical-image';

  // 기존 영문/숫자/_/- 키는 경로를 바꾸지 않아 기존 Storage 파일과 호환합니다.
  if (/^[a-zA-Z0-9_-]+$/.test(normalized)) {
    return normalized;
  }

  // 한글 등 Storage key에서 허용되지 않는 문자가 하나라도 있으면
  // UTF-8 바이트를 HEX로 변환해 완전한 ASCII 경로로 만듭니다.
  const bytes = new TextEncoder().encode(normalized);
  const hex = Array.from(
    bytes,
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');

  return `key-${hex}`;
};

const getTechnicalImageStoragePath = (imageKey) => (
  `${normalizeTechnicalImageStorageKey(imageKey)}/technical-image`
);

// v52.48.5.35 상세 부속자재 공통 라이브러리
const getTechnicalAccessoryStoragePath = (accessoryId) => (
  `accessories/${String(accessoryId || '').trim()}/image`
);

const createTechnicalAccessoryId = () => (
  globalThis.crypto?.randomUUID?.()
  || `accessory-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

const isMissingTableError = (error) => (
  error?.code === '42P01' ||
  /unit_price_/i.test(String(error?.message || '')) &&
    /does not exist|schema cache|찾을 수/i.test(String(error?.message || ''))
);

const headerCellSx = {
  bgcolor: '#e2e8f0',
  color: '#334155',
  fontSize: '0.75rem',
  fontWeight: 900,
  whiteSpace: 'nowrap',
  border: '1px solid #cbd5e1',
  py: 0.8,
  px: 0.7,
};

const bodyCellSx = {
  border: '1px solid #dbe3ec',
  py: 0.45,
  px: 0.55,
  fontSize: '0.76rem',
};

const compactHeaderCellSx = {
  bgcolor: '#e2e8f0',
  color: '#334155',
  fontSize: '0.66rem',
  lineHeight: 1.1,
  fontWeight: 900,
  whiteSpace: 'nowrap',
  border: '1px solid #cbd5e1',
  py: 0.45,
  px: 0.45,
};

const compactBodyCellSx = {
  border: '1px solid #dbe3ec',
  py: 0.22,
  px: 0.32,
  fontSize: '0.67rem',
  lineHeight: 1.1,
};

const compactFilterFieldSx = {
  '& .MuiInputLabel-root': {
    fontSize: '0.68rem',
    transform: 'translate(10px, 7px) scale(1)',
  },
  '& .MuiInputLabel-shrink': {
    transform: 'translate(10px, -7px) scale(0.78)',
  },
  '& .MuiInputBase-root': {
    height: 32,
    minHeight: 32,
    fontSize: '0.72rem',
  },
  '& .MuiInputBase-input': {
    px: 1,
    py: 0.55,
    fontSize: '0.72rem',
  },
  '& .MuiSelect-select': {
    minWidth: '0 !important',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    px: '10px !important',
    py: '6px !important',
    fontSize: '0.72rem',
  },
  '& .MuiSelect-icon': {
    fontSize: '1rem',
  },
};

function CompactNumberField({ value, onChange, min, step = '0.0001', disabled = false }) {
  return (
    <TextField
      type="number"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      size="small"
      inputProps={{ min, step }}
      sx={{
        minWidth: 68,
        '& .MuiInputBase-root': {
          height: 28,
          minHeight: 28,
        },
        '& .MuiInputBase-input': {
          px: 0.55,
          py: 0.35,
          fontSize: '0.67rem',
          textAlign: 'right',
        },
      }}
    />
  );
}

function CompactMoneyField({
  value,
  onChange,
  disabled = false,
  helperText = '',
  onKeyDown,
  autoFocus = false,
}) {
  const displayValue = value === '' || value === null || value === undefined
    ? ''
    : formatMoney(value);

  return (
    <TextField
      type="text"
      fullWidth
      value={displayValue}
      disabled={disabled}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
      onChange={(event) => {
        const digits = event.target.value.replace(/[^0-9]/g, '');
        onChange(digits === '' ? '' : digits.replace(/^0+(?=\d)/, ''));
      }}
      helperText={helperText}
      size="small"
      inputProps={{ inputMode: 'numeric' }}
      sx={{
        minWidth: 68,
        '& .MuiInputBase-root': {
          height: 28,
          minHeight: 28,
        },
        '& .MuiInputBase-input': {
          px: 0.55,
          py: 0.35,
          fontSize: '0.67rem',
          textAlign: 'right',
        },
      }}
    />
  );
}

export default function UnitPriceAnalysis({
  projectName,
  projectOptions = [],
  canManage = false,
  canManageTechnicalImages = false,
}) {
  const [mainTab, setMainTab] = useState(0);
  const [managementTab, setManagementTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [specs, setSpecs] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedMajor, setSelectedMajor] = useState('');
  const [selectedMiddle, setSelectedMiddle] = useState('');
  const [selectedDetail, setSelectedDetail] = useState('');
  const [selectedSpec, setSelectedSpec] = useState(null);
  const [draftRows, setDraftRows] = useState([]);
  const [selectedRowIds, setSelectedRowIds] = useState(() => new Set());
  const [documentState, setDocumentState] = useState(EMPTY_DOCUMENT);
  const [printMode, setPrintMode] = useState('submitted');
  const [documentScope, setDocumentScope] = useState('current');
  const [documentSearch, setDocumentSearch] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedTemplateSpecId, setSelectedTemplateSpecId] = useState('');
  const [templateRows, setTemplateRows] = useState([]);
  const [copyDialog, setCopyDialog] = useState({
    open: false,
    document: null,
    targetProject: '',
    documentName: '',
  });
  const [nameGuideDialogOpen, setNameGuideDialogOpen] = useState(false);
  const [revisionDialog, setRevisionDialog] = useState({
    open: false,
    document: null,
    revisions: [],
    loading: false,
  });
  const [priceDialog, setPriceDialog] = useState({
    open: false,
    material: null,
    price: '',
    effectiveDate: getToday(),
    note: '',
    history: [],
    historyLoading: false,
  });
  const [newMaterialDialog, setNewMaterialDialog] = useState({
    open: false,
    itemName: '',
    specification: '',
    unit: 'M',
    price: 0,
    effectiveDate: getToday(),
  });
  const [materialPicker, setMaterialPicker] = useState({
    open: false,
    search: '',
  });
  const [laborCalculator, setLaborCalculator] = useState({
    anchorEl: null,
    rowId: '',
    target: 'draft',
    amount: '',
  });
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const priceUploadRef = useRef(null);
  const technicalImageInputRef = useRef(null);
  const [technicalImageBusy, setTechnicalImageBusy] = useState(false);
  const [technicalAnnotations, setTechnicalAnnotations] = useState([]);
  const [technicalSheetLayout, setTechnicalSheetLayout] = useState(
    DEFAULT_TECHNICAL_SHEET_LAYOUT,
  );
  const [technicalAnnotationBusy, setTechnicalAnnotationBusy] = useState(false);

  const [technicalAccessories, setTechnicalAccessories] = useState([]);
  const [technicalAnnotationAccessoryLinks, setTechnicalAnnotationAccessoryLinks] = useState([]);
  const [technicalAccessoryBusy, setTechnicalAccessoryBusy] = useState(false);


  const showToast = useCallback((message, severity = 'success') => {
    setToast({ open: true, message, severity });
  }, []);

  // v52.48.5.32 기술자료 편집기 v1
  // 원본 이미지는 수정하지 않고 image_key별 지시선/번호/명칭 좌표만 별도 저장합니다.
  const loadTechnicalAnnotations = useCallback(async (imageKey) => {
    const normalizedKey = String(imageKey || '').trim();
    if (!normalizedKey) {
      setTechnicalAnnotations([]);
      setTechnicalSheetLayout(DEFAULT_TECHNICAL_SHEET_LAYOUT);
      return [];
    }

    setTechnicalAnnotationBusy(true);
    try {
      const { data, error } = await supabase
        .from('unit_price_technical_annotations')
        .select('annotations, layout_settings')
        .eq('image_key', normalizedKey)
        .maybeSingle();
      if (error) throw error;
      const next = normalizeTechnicalAnnotations(data?.annotations || []);
      const nextLayout = normalizeTechnicalSheetLayout(data?.layout_settings);
      setTechnicalAnnotations(next);
      setTechnicalSheetLayout(nextLayout);
      return next;
    } catch (error) {
      const message = String(error?.message || '');
      if (error?.code === '42P01' || /unit_price_technical_annotations/i.test(message)) {
        console.warn('기술자료 지시선 DB가 아직 준비되지 않았습니다:', error);
        setTechnicalAnnotations([]);
        setTechnicalSheetLayout(DEFAULT_TECHNICAL_SHEET_LAYOUT);
        return [];
      }
      console.error('기술자료 지시선 조회 실패:', error);
      setTechnicalAnnotations([]);
      setTechnicalSheetLayout(DEFAULT_TECHNICAL_SHEET_LAYOUT);
      return [];
    } finally {
      setTechnicalAnnotationBusy(false);
    }
  }, []);

  useEffect(() => {
    const imageKey = String(selectedSpec?.image_key || '').trim();
    if (!imageKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTechnicalAnnotations([]);
      setTechnicalSheetLayout(DEFAULT_TECHNICAL_SHEET_LAYOUT);
      return;
    }
    loadTechnicalAnnotations(imageKey);
  }, [loadTechnicalAnnotations, selectedSpec?.image_key]);

  // v52.48.5.36 상세 부속자재는 공통 라이브러리에 한 번만 저장하고
  // 각 지시선/하단 명칭(annotation_id)별로 연결합니다.
  const loadTechnicalAccessories = useCallback(async (imageKey) => {
    const normalizedKey = String(imageKey || '').trim();
    if (!normalizedKey) {
      setTechnicalAccessories([]);
      setTechnicalAnnotationAccessoryLinks([]);
      return [];
    }

    try {
      const [libraryResult, linksResult] = await Promise.all([
        supabase
          .from('unit_price_technical_accessory_library')
          .select('id, name, image_url, storage_path, created_at, updated_at')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('unit_price_technical_annotation_accessories')
          .select('annotation_id, annotation_symbol, annotation_title, accessory_id, sort_order')
          .eq('image_key', normalizedKey)
          .order('annotation_id')
          .order('sort_order'),
      ]);

      if (libraryResult.error) throw libraryResult.error;
      if (linksResult.error) throw linksResult.error;

      const library = libraryResult.data || [];
      const links = linksResult.data || [];

      setTechnicalAccessories(library);
      setTechnicalAnnotationAccessoryLinks(links);
      return library;
    } catch (error) {
      const message = String(error?.message || '');
      if (
        error?.code === '42P01'
        || /unit_price_technical_(accessory|annotation_accessories)/i.test(message)
      ) {
        console.warn('상세 부속자재 DB가 아직 준비되지 않았습니다:', error);
        setTechnicalAccessories([]);
        setTechnicalAnnotationAccessoryLinks([]);
        return [];
      }

      console.error('상세 부속자재 조회 실패:', error);
      setTechnicalAccessories([]);
      setTechnicalAnnotationAccessoryLinks([]);
      return [];
    }
  }, []);

  useEffect(() => {
    const imageKey = String(selectedSpec?.image_key || '').trim();
    if (!imageKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTechnicalAccessories([]);
      setTechnicalAnnotationAccessoryLinks([]);
      return;
    }
    loadTechnicalAccessories(imageKey);
  }, [loadTechnicalAccessories, selectedSpec?.image_key]);

  const viewerTechnicalAccessories = useMemo(() => {
    const byId = new Map(
      technicalAccessories.map((item) => [item.id, item]),
    );

    return technicalAnnotationAccessoryLinks
      .map((link, index) => {
        const accessory = byId.get(link.accessory_id);
        if (!accessory) return null;

        return {
          ...accessory,
          annotation_id: link.annotation_id,
          annotation_symbol: link.annotation_symbol || '',
          annotation_title: link.annotation_title || '',
          sort_order: link.sort_order ?? index,
        };
      })
      .filter(Boolean);
  }, [technicalAccessories, technicalAnnotationAccessoryLinks]);

  const upsertTechnicalAccessoryFromEditor = useCallback(async ({
    file,
    name,
    accessory,
  }) => {
    if (!canManageTechnicalImages) {
      throw new Error('기술자료 이미지를 편집할 권한이 없습니다.');
    }

    const normalizedName = String(name || accessory?.name || '').trim();
    if (!normalizedName) {
      throw new Error('부속자재명을 입력해주세요.');
    }
    if (!file) {
      throw new Error('업로드할 부속자재 이미지를 선택해주세요.');
    }
    if (!UNIT_PRICE_TECHNICAL_IMAGE_TYPES.has(file.type)) {
      throw new Error('PNG, JPG(JPEG), WEBP 이미지만 업로드할 수 있습니다.');
    }
    if (file.size > UNIT_PRICE_TECHNICAL_IMAGE_MAX_BYTES) {
      throw new Error('부속자재 이미지는 10MB 이하만 업로드할 수 있습니다.');
    }

    const accessoryId = String(accessory?.id || '').trim()
      || createTechnicalAccessoryId();
    const storagePath = String(
      accessory?.storagePath
      || accessory?.storage_path
      || '',
    ).trim() || getTechnicalAccessoryStoragePath(accessoryId);

    setTechnicalAccessoryBusy(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from(UNIT_PRICE_TECHNICAL_IMAGE_BUCKET)
        .upload(storagePath, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: '3600',
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from(UNIT_PRICE_TECHNICAL_IMAGE_BUCKET)
        .getPublicUrl(storagePath);
      const publicUrl = String(publicUrlData?.publicUrl || '').trim();
      if (!publicUrl) {
        throw new Error('업로드된 부속자재 이미지 URL을 만들지 못했습니다.');
      }

      const versionedUrl = `${publicUrl}?v=${Date.now()}`;
      const { error: saveError } = await supabase.rpc(
        'save_unit_price_technical_accessory',
        {
          p_accessory_id: accessoryId,
          p_name: normalizedName,
          p_image_url: versionedUrl,
          p_storage_path: storagePath,
        },
      );
      if (saveError) throw saveError;

      const savedAccessory = {
        id: accessoryId,
        name: normalizedName,
        image_url: versionedUrl,
        storage_path: storagePath,
      };

      setTechnicalAccessories((previous) => {
        const withoutCurrent = previous.filter(
          (item) => item.id !== accessoryId,
        );
        return [...withoutCurrent, savedAccessory].sort(
          (first, second) => String(first.name || '').localeCompare(
            String(second.name || ''),
            'ko',
          ),
        );
      });

      return savedAccessory;
    } finally {
      setTechnicalAccessoryBusy(false);
    }
  }, [canManageTechnicalImages]);

  const deleteTechnicalAccessoryFromEditor = useCallback(async (accessory) => {
    if (!canManageTechnicalImages) {
      throw new Error('기술자료 이미지를 편집할 권한이 없습니다.');
    }

    const accessoryId = String(accessory?.id || '').trim();
    if (!accessoryId) {
      throw new Error('삭제할 부속자재 정보가 없습니다.');
    }

    setTechnicalAccessoryBusy(true);
    try {
      const { data: storagePath, error } = await supabase.rpc(
        'delete_unit_price_technical_accessory',
        { p_accessory_id: accessoryId },
      );
      if (error) throw error;

      if (storagePath) {
        const { error: storageError } = await supabase.storage
          .from(UNIT_PRICE_TECHNICAL_IMAGE_BUCKET)
          .remove([storagePath]);
        if (storageError) {
          console.warn('부속자재 Storage 파일 삭제 경고:', storageError);
        }
      }

      setTechnicalAccessories((previous) => previous.filter(
        (item) => item.id !== accessoryId,
      ));
      setTechnicalAnnotationAccessoryLinks((previous) => previous.filter(
        (link) => link.accessory_id !== accessoryId,
      ));
    } finally {
      setTechnicalAccessoryBusy(false);
    }
  }, [canManageTechnicalImages]);

  // v52.48.5.29 기술자료 이미지는 기존 image_key 그룹 단위로 관리합니다.
  const applyTechnicalImageUrlLocally = useCallback((imageKey, imageUrl) => {
    setSpecs((previous) => previous.map((spec) => (
      spec.image_key === imageKey
        ? { ...spec, image_url: imageUrl }
        : spec
    )));
    setSelectedSpec((previous) => (
      previous?.image_key === imageKey
        ? { ...previous, image_url: imageUrl }
        : previous
    ));
  }, []);

  const persistTechnicalImageUrl = useCallback(async (imageKey, imageUrl) => {
    const { error } = await supabase.rpc('set_unit_price_technical_image', {
      p_image_key: imageKey,
      p_image_url: imageUrl,
    });
    if (error) throw error;
    applyTechnicalImageUrlLocally(imageKey, imageUrl);
  }, [applyTechnicalImageUrlLocally]);

  const uploadTechnicalImage = useCallback(async (file) => {
    if (!file) return;
    if (!canManageTechnicalImages) {
      showToast('기술자료 이미지를 수정할 권한이 없습니다.', 'warning');
      return;
    }

    const imageKey = String(selectedSpec?.image_key || '').trim();
    if (!imageKey) {
      showToast('선택한 규격에 기술자료 이미지 키가 없습니다.', 'warning');
      return;
    }
    if (!UNIT_PRICE_TECHNICAL_IMAGE_TYPES.has(file.type)) {
      showToast('PNG, JPG(JPEG), WEBP 이미지만 업로드할 수 있습니다.', 'warning');
      return;
    }
    if (file.size > UNIT_PRICE_TECHNICAL_IMAGE_MAX_BYTES) {
      showToast('기술자료 이미지는 10MB 이하만 업로드할 수 있습니다.', 'warning');
      return;
    }

    setTechnicalImageBusy(true);
    try {
      const storagePath = getTechnicalImageStoragePath(imageKey);
      const { error: uploadError } = await supabase.storage
        .from(UNIT_PRICE_TECHNICAL_IMAGE_BUCKET)
        .upload(storagePath, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: '3600',
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from(UNIT_PRICE_TECHNICAL_IMAGE_BUCKET)
        .getPublicUrl(storagePath);
      const publicUrl = String(publicUrlData?.publicUrl || '').trim();
      if (!publicUrl) throw new Error('업로드된 기술자료 이미지 URL을 만들지 못했습니다.');

      const versionedUrl = `${publicUrl}?v=${Date.now()}`;
      await persistTechnicalImageUrl(imageKey, versionedUrl);
      showToast('기술자료 이미지를 저장했습니다.');
    } catch (error) {
      console.error('기술자료 이미지 업로드 실패:', error);
      showToast(error?.message || '기술자료 이미지를 업로드하지 못했습니다.', 'error');
    } finally {
      setTechnicalImageBusy(false);
      if (technicalImageInputRef.current) technicalImageInputRef.current.value = '';
    }
  }, [canManageTechnicalImages, persistTechnicalImageUrl, selectedSpec?.image_key, showToast]);

  const removeTechnicalImage = useCallback(async () => {
    if (!canManageTechnicalImages) {
      showToast('기술자료 이미지를 수정할 권한이 없습니다.', 'warning');
      return;
    }

    const imageKey = String(selectedSpec?.image_key || '').trim();
    if (!imageKey) return;
    if (!window.confirm('현재 기술자료 이미지를 삭제하시겠습니까?')) return;

    setTechnicalImageBusy(true);
    try {
      const storagePath = getTechnicalImageStoragePath(imageKey);
      const { error: removeError } = await supabase.storage
        .from(UNIT_PRICE_TECHNICAL_IMAGE_BUCKET)
        .remove([storagePath]);
      if (removeError) {
        console.warn('Storage 기존 이미지 삭제 경고:', removeError);
      }

      await persistTechnicalImageUrl(imageKey, '');
      showToast('기술자료 이미지를 삭제했습니다.', 'info');
    } catch (error) {
      console.error('기술자료 이미지 삭제 실패:', error);
      showToast(error?.message || '기술자료 이미지를 삭제하지 못했습니다.', 'error');
    } finally {
      setTechnicalImageBusy(false);
    }
  }, [canManageTechnicalImages, persistTechnicalImageUrl, selectedSpec?.image_key, showToast]);

  // v52.48.5.32 기술자료 편집기 v1
  // 조회 창은 일위대가 화면과 나란히 유지하며, 하단 항목 hover 시 해당 지시선/부재 위치가 강조됩니다.
  const openTechnicalImageWindow = useCallback(() => {
    const imageUrl = String(selectedSpec?.image_url || '').trim();
    if (!imageUrl) return;

    const imageTitle = [selectedMiddle, selectedDetail]
      .filter(Boolean)
      .join(' · ') || '기술자료';

    const previewWindow = openTechnicalSheetViewerWindow({
      imageUrl,
      title: imageTitle,
      annotations: technicalAnnotations,
      layout: technicalSheetLayout,
      accessories: viewerTechnicalAccessories,
    });

    if (!previewWindow) {
      showToast('기술자료 새 창이 차단되었습니다. 브라우저의 팝업 허용 후 다시 눌러주세요.', 'warning');
    }
  }, [
    selectedDetail,
    selectedMiddle,
    selectedSpec?.image_url,
    showToast,
    technicalAnnotations,
    technicalSheetLayout,
    viewerTechnicalAccessories,
  ]);

  const openTechnicalAnnotationEditor = useCallback(async () => {
    if (!canManageTechnicalImages) {
      showToast('기술자료 이미지를 편집할 권한이 없습니다.', 'warning');
      return;
    }

    const imageKey = String(selectedSpec?.image_key || '').trim();
    const imageUrl = String(selectedSpec?.image_url || '').trim();
    if (!imageKey || !imageUrl) {
      showToast('기술자료 이미지를 먼저 등록해주세요.', 'warning');
      return;
    }

    const imageTitle = [selectedMiddle, selectedDetail]
      .filter(Boolean)
      .join(' · ') || '기술자료';

    const result = await openTechnicalSheetEditorWindow({
      imageUrl,
      title: imageTitle,
      annotations: technicalAnnotations,
      layout: technicalSheetLayout,
      accessories: technicalAccessories,
      accessoryLinks: technicalAnnotationAccessoryLinks,
      onAccessoryUpload: upsertTechnicalAccessoryFromEditor,
      onAccessoryDelete: deleteTechnicalAccessoryFromEditor,
    });

    if (!result?.opened && result?.reason === 'blocked') {
      showToast('기술자료 편집 창이 차단되었습니다. 브라우저의 팝업 허용 후 다시 눌러주세요.', 'warning');
      return;
    }
    if (!result?.saved) return;

    const nextAnnotations = normalizeTechnicalAnnotations(result.annotations);
    const nextLayout = normalizeTechnicalSheetLayout(result.layout);
    const nextAccessoryLinks = (result.accessoryLinks || []).map((link, index) => ({
      annotation_id: String(link.annotationId || link.annotation_id || '').trim(),
      accessory_id: String(link.accessoryId || link.accessory_id || '').trim(),
      sort_order: Number.isFinite(Number(link.sortOrder ?? link.sort_order))
        ? Number(link.sortOrder ?? link.sort_order)
        : index,
    })).filter((link) => link.annotation_id && link.accessory_id);

    setTechnicalAnnotationBusy(true);
    try {
      const { error } = await supabase.rpc('save_unit_price_technical_sheet_v37', {
        p_image_key: imageKey,
        p_annotations: nextAnnotations,
        p_layout_settings: nextLayout,
        p_accessory_links: nextAccessoryLinks,
      });
      if (error) throw error;
      setTechnicalAnnotations(nextAnnotations);
      setTechnicalSheetLayout(nextLayout);
      setTechnicalAnnotationAccessoryLinks(nextAccessoryLinks);
      await loadTechnicalAccessories(imageKey);
      showToast(
        nextAnnotations.length > 0
          ? `기술자료 지시선 ${nextAnnotations.length}개를 저장했습니다.`
          : '기술자료 지시선을 모두 삭제했습니다.',
      );
      try {
        if (result.popup && !result.popup.closed) result.popup.close();
      } catch (_error) {
        // 팝업 닫기 실패는 저장 결과에 영향을 주지 않습니다.
      }
    } catch (error) {
      console.error('기술자료 지시선 저장 실패:', error);
      const message = String(error?.message || '');
      showToast(
        message.includes('save_unit_price_technical_sheet_v37')
          ? 'v52.48.5.37 Supabase SQL을 먼저 실행해주세요.'
          : message || '기술자료 지시선을 저장하지 못했습니다.',
        'error',
      );
    } finally {
      setTechnicalAnnotationBusy(false);
    }
  }, [
    canManageTechnicalImages,
    selectedDetail,
    selectedMiddle,
    selectedSpec?.image_key,
    selectedSpec?.image_url,
    showToast,
    technicalAnnotations,
    technicalSheetLayout,
    technicalAccessories,
    technicalAnnotationAccessoryLinks,
    loadTechnicalAccessories,
    upsertTechnicalAccessoryFromEditor,
    deleteTechnicalAccessoryFromEditor,
  ]);

  const accessibleProjects = useMemo(() => {
    const normalized = [projectName, ...projectOptions]
      .map((item) => String(item || '').trim())
      .filter((item) => item && item !== '전체현장' && item !== '본사');
    return [...new Set(normalized)];
  }, [projectName, projectOptions]);

  const loadDocuments = useCallback(async () => {
    const { data, error } = await supabase
      .from('unit_price_documents')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(500);

    if (error) throw error;
    setDocuments(data || []);
  }, []);

  const loadBaseData = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    try {
      const [specResult, materialResult] = await Promise.all([
        supabase
          .from('unit_price_specs')
          .select('*')
          .eq('is_active', true)
          .order('major_category')
          .order('sort_order')
          .order('middle_category')
          .order('detail_category'),
        supabase
          .from('unit_price_materials')
          .select('*')
          .eq('is_active', true)
          .order('item_name')
          .limit(2000),
      ]);

      if (specResult.error) throw specResult.error;
      if (materialResult.error) throw materialResult.error;

      setDatabaseReady(true);
      setSpecs(specResult.data || []);
      setMaterials(materialResult.data || []);
      await loadDocuments();

      const firstSpec = specResult.data?.[0];
      if (firstSpec && !selectedSpec) {
        setSelectedMajor(firstSpec.major_category);
        setSelectedMiddle(firstSpec.middle_category);
        setSelectedDetail(firstSpec.detail_category);
        setSelectedSpec(firstSpec);
        setSelectedTemplateSpecId(firstSpec.id);
      }
    } catch (error) {
      console.error('일위대가 기준정보 조회 실패:', error);
      if (isMissingTableError(error)) {
        setDatabaseReady(false);
        setLoadError('Supabase SQL이 아직 적용되지 않았습니다. 패키지의 SQL 파일을 먼저 실행해주세요.');
      } else {
        setLoadError(error?.message || '일위대가 기준정보를 불러오지 못했습니다.');
      }
    } finally {
      setLoading(false);
    }
  }, [loadDocuments, selectedSpec]);

  const loadTemplateRows = useCallback(async (specId, target = 'draft') => {
    if (!specId) return [];

    const { data, error } = await supabase
      .from('unit_price_spec_items')
      .select(`
        *,
        material:unit_price_materials (
          id,
          item_code,
          item_name,
          specification,
          unit,
          current_unit_price,
          effective_date
        )
      `)
      .eq('spec_id', specId)
      .order('sort_order');

    if (error) throw error;

    const nextRows = (data || []).map((item, index) => ({
      clientId: createClientId(),
      sourceTemplateItemId: item.id,
      materialId: item.material_id || item.material?.id || '',
      itemCode: item.material?.item_code || '',
      costType: item.cost_type === 'expense_rounding'
        ? 'material_rounding'
        : item.cost_type || 'material',
      itemName: item.cost_type === 'expense_rounding' && item.item_name === '경비 단수정리'
        ? ''
        : item.item_name || item.material?.item_name || '',
      specification: item.cost_type === 'expense_rounding' && item.specification === '제출금액 100원 단위 정리'
        ? ''
        : item.specification || item.material?.specification || '',
      unit: item.unit || item.material?.unit || '',
      netQuantity: toNumber(item.net_quantity),
      laborAmountPerM2: item.cost_type === 'labor'
        ? toNumber(item.net_quantity) * toNumber(item.unit_price_override ?? item.material?.current_unit_price)
        : '',
      unitPrice: toNumber(item.unit_price_override ?? item.material?.current_unit_price),
      itemMarkupPercent: '',
      submittedQuantityOverride: '',
      isOwnerSupplied: Boolean(item.is_owner_supplied),
      remarks: item.remarks || '',
      sortOrder: item.sort_order ?? index,
    }));

    if (target === 'template') setTemplateRows(nextRows);
    else {
      setDraftRows(nextRows);
      setSelectedRowIds(new Set());
    }
    return nextRows;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBaseData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedSpec?.id || documentState.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTemplateRows(selectedSpec.id).catch((error) => {
      console.error('규격 기본값 조회 실패:', error);
      showToast('규격 기본값을 불러오지 못했습니다.', 'error');
    });
  }, [selectedSpec?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedTemplateSpecId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTemplateRows(selectedTemplateSpecId, 'template').catch((error) => {
      console.error('규격 기준 조회 실패:', error);
      showToast('규격 기준을 불러오지 못했습니다.', 'error');
    });
  }, [selectedTemplateSpecId, loadTemplateRows, showToast]);

  const majorOptions = useMemo(
    () => [...new Set(specs.map((item) => item.major_category))],
    [specs],
  );

  const middleOptions = useMemo(
    () => [...new Set(
      specs
        .filter((item) => item.major_category === selectedMajor)
        .map((item) => item.middle_category),
    )],
    [selectedMajor, specs],
  );

  const detailOptions = useMemo(
    () => specs
      .filter(
        (item) =>
          item.major_category === selectedMajor &&
          item.middle_category === selectedMiddle,
      )
      .map((item) => item.detail_category),
    [selectedMajor, selectedMiddle, specs],
  );

  const guidedDocumentName = useMemo(
    () => `${selectedMiddle || '공정'} ${selectedDetail || '규격'} 일위대가`,
    [selectedDetail, selectedMiddle],
  );

  const updateDraftRow = (clientId, field, value) => {
    setDraftRows((previous) => previous.map((row) => {
      if (row.clientId !== clientId) return row;

      if (field === 'laborAmountPerM2') {
        const amount = value;
        const price = toNumber(row.unitPrice);
        return {
          ...row,
          laborAmountPerM2: amount,
          netQuantity: price > 0
            ? Number((toNumber(amount) / price).toFixed(6))
            : 0,
        };
      }

      if (field === 'unitPrice' && row.costType === 'labor') {
        const amount = getLaborAmountPerM2(row);
        const price = toNumber(value);
        return {
          ...row,
          unitPrice: value,
          netQuantity: price > 0
            ? Number((amount / price).toFixed(6))
            : 0,
        };
      }

      if (field === 'costType') {
        if (value === 'labor') {
          return {
            ...row,
            costType: value,
            unit: '인',
            laborAmountPerM2: toNumber(row.netQuantity) * toNumber(row.unitPrice) || '',
            isOwnerSupplied: false,
          };
        }
        if (value === 'material_rounding') {
          return {
            ...row,
            costType: value,
            itemName: '',
            specification: '',
            unit: '식',
            netQuantity: 0,
            laborAmountPerM2: '',
            unitPrice: 100,
            itemMarkupPercent: '',
            submittedQuantityOverride: '',
            isOwnerSupplied: false,
          };
        }
        return {
          ...row,
          costType: value,
          unit: value === 'material' && ['인', '식'].includes(row.unit) ? 'M' : row.unit,
          laborAmountPerM2: '',
          isOwnerSupplied: value === 'material' ? row.isOwnerSupplied : false,
        };
      }

      return { ...row, [field]: value };
    }));
  };

  const updateTemplateRow = (clientId, field, value) => {
    setTemplateRows((previous) => previous.map((row) => {
      if (row.clientId !== clientId) return row;

      if (field === 'laborAmountPerM2') {
        const price = toNumber(row.unitPrice);
        return {
          ...row,
          laborAmountPerM2: value,
          netQuantity: price > 0
            ? Number((toNumber(value) / price).toFixed(6))
            : 0,
        };
      }
      if (field === 'unitPrice' && row.costType === 'labor') {
        const amount = getLaborAmountPerM2(row);
        const price = toNumber(value);
        return {
          ...row,
          unitPrice: value,
          netQuantity: price > 0
            ? Number((amount / price).toFixed(6))
            : 0,
        };
      }
      if (field === 'costType') {
        if (value === 'labor') {
          return {
            ...row,
            costType: value,
            unit: '인',
            laborAmountPerM2: toNumber(row.netQuantity) * toNumber(row.unitPrice) || '',
            isOwnerSupplied: false,
          };
        }
        if (value === 'material_rounding') {
          return {
            ...row,
            costType: value,
            itemName: '',
            specification: '',
            unit: '식',
            netQuantity: 0,
            laborAmountPerM2: '',
            unitPrice: 100,
            isOwnerSupplied: false,
          };
        }
        return {
          ...row,
          costType: value,
          unit: value === 'material' && ['인', '식'].includes(row.unit) ? 'M' : row.unit,
          laborAmountPerM2: '',
          isOwnerSupplied: value === 'material' ? row.isOwnerSupplied : false,
        };
      }
      return { ...row, [field]: value };
    }));
  };

  const openLaborCalculator = (event, row, target = 'draft') => {
    setLaborCalculator({
      anchorEl: event.currentTarget,
      rowId: row.clientId,
      target,
      amount: getLaborAmountPerM2(row) || '',
    });
  };

  const closeLaborCalculator = () => {
    setLaborCalculator({ anchorEl: null, rowId: '', target: 'draft', amount: '' });
  };

  const applyLaborCalculator = () => {
    const rows = laborCalculator.target === 'template' ? templateRows : draftRows;
    const row = rows.find((item) => item.clientId === laborCalculator.rowId);
    if (!row) {
      closeLaborCalculator();
      return;
    }
    if (toNumber(row.unitPrice) <= 0) {
      showToast('노무 기준단가를 먼저 입력해주세요.', 'warning');
      return;
    }

    if (laborCalculator.target === 'template') {
      updateTemplateRow(row.clientId, 'laborAmountPerM2', laborCalculator.amount);
    } else {
      updateDraftRow(row.clientId, 'laborAmountPerM2', laborCalculator.amount);
    }
    closeLaborCalculator();
  };

  const addBlankDraftRow = () => {
    const nextRow = makeBlankRow(draftRows.length);
    setDraftRows((previous) => [...previous, nextRow]);
    setSelectedRowIds(new Set([nextRow.clientId]));
  };

  const removeSelectedDraftRows = () => {
    if (selectedRowIds.size === 0) {
      showToast('삭제할 항목을 체크해주세요.', 'warning');
      return;
    }

    setDraftRows((previous) => previous
      .filter((row) => !selectedRowIds.has(row.clientId))
      .map((row, index) => ({ ...row, sortOrder: index })));
    setSelectedRowIds(new Set());
  };

  const moveSelectedDraftRows = (direction) => {
    if (selectedRowIds.size === 0) {
      showToast('이동할 항목을 체크해주세요.', 'warning');
      return;
    }

    setDraftRows((previous) => {
      const next = [...previous];

      if (direction < 0) {
        for (let index = 1; index < next.length; index += 1) {
          if (
            selectedRowIds.has(next[index].clientId) &&
            !selectedRowIds.has(next[index - 1].clientId)
          ) {
            [next[index - 1], next[index]] = [next[index], next[index - 1]];
          }
        }
      } else {
        for (let index = next.length - 2; index >= 0; index -= 1) {
          if (
            selectedRowIds.has(next[index].clientId) &&
            !selectedRowIds.has(next[index + 1].clientId)
          ) {
            [next[index], next[index + 1]] = [next[index + 1], next[index]];
          }
        }
      }

      return next.map((row, rowIndex) => ({ ...row, sortOrder: rowIndex }));
    });
  };

  const toggleDraftRowSelection = (clientId) => {
    setSelectedRowIds((previous) => {
      const next = new Set(previous);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const toggleAllDraftRows = () => {
    setSelectedRowIds((previous) => (
      draftRows.length > 0 && previous.size === draftRows.length
        ? new Set()
        : new Set(draftRows.map((row) => row.clientId))
    ));
  };

  const roundingAmounts = useMemo(
    () => calculateRoundingAmounts(draftRows),
    [draftRows],
  );

  const totals = useMemo(() => {
    const initial = {
      material: { net: 0, submitted: 0 },
      labor: { net: 0, submitted: 0 },
      expense: { net: 0, submitted: 0 },
    };

    return draftRows.reduce((result, row) => {
      const summaryType = getSummaryCostType(row);
      const key = COST_TYPES.some((item) => item.value === summaryType)
        ? summaryType
        : 'material';
      result[key].net += getNetAmount(row);
      result[key].submitted += getSubmittedAmount(
        row,
        roundingAmounts.get(row.clientId),
      );
      return result;
    }, initial);
  }, [draftRows, roundingAmounts]);

  const grandNet = totals.material.net + totals.labor.net + totals.expense.net;
  const grandSubmitted = (
    totals.material.submitted + totals.labor.submitted + totals.expense.submitted
  );
  const grandDifference = grandSubmitted - grandNet;
  const grandMarkupRate = grandNet === 0
    ? 0
    : (grandDifference / grandNet) * 100;

  const resetDocument = async () => {
    const spec = selectedSpec || specs[0];
    setDocumentState(EMPTY_DOCUMENT);
    if (spec) await loadTemplateRows(spec.id);
    showToast('새 일위대가 작성 상태로 초기화했습니다.', 'info');
  };

  const handleSpecChange = async (
    detailCategory,
    majorCategory = selectedMajor,
    middleCategory = selectedMiddle,
  ) => {
    const spec = specs.find(
      (item) =>
        item.major_category === majorCategory &&
        item.middle_category === middleCategory &&
        item.detail_category === detailCategory,
    );
    setSelectedMajor(majorCategory);
    setSelectedMiddle(middleCategory);
    setSelectedDetail(detailCategory);
    setSelectedSpec(spec || null);
    setDocumentState(EMPTY_DOCUMENT);
    if (spec) await loadTemplateRows(spec.id);
  };

  const validateDocumentForSave = () => {
    if (!projectName) {
      showToast('현장을 먼저 선택해주세요.', 'warning');
      return false;
    }
    if (!selectedSpec) {
      showToast('벽체 또는 천정 규격을 선택해주세요.', 'warning');
      return false;
    }
    if (draftRows.length === 0 || draftRows.every((row) => !row.itemName.trim())) {
      showToast('일위대가 항목을 한 개 이상 입력해주세요.', 'warning');
      return false;
    }
    if (draftRows.filter(isRoundingMaterial).length > 1) {
      showToast('재료비(단수정리)는 문서당 한 개만 사용할 수 있습니다.', 'warning');
      return false;
    }
    return true;
  };

  const persistDocument = async (resolvedDocumentName) => {
    setSaving(true);
    try {
      const documentPayload = {
        id: documentState.id || null,
        project_name: projectName,
        document_name: resolvedDocumentName,
        status: documentState.status,
        spec_id: selectedSpec.id,
        major_category: selectedSpec.major_category,
        middle_category: selectedSpec.middle_category,
        detail_category: selectedSpec.detail_category,
        material_markup_percent: 0,
        labor_markup_percent: 0,
        expense_markup_percent: 0,
        image_url: selectedSpec.image_url || '',
        notes: '',
      };
      const itemPayload = draftRows
        .filter((row) => String(row.itemName || '').trim())
        .map((row, index) => ({
          source_template_item_id: row.sourceTemplateItemId || null,
          material_id: row.materialId || null,
          item_code: row.itemCode || '',
          cost_type: isRoundingMaterial(row) ? 'material_rounding' : row.costType,
          item_name: row.itemName.trim(),
          specification: row.specification || '',
          unit: row.unit || '',
          net_quantity: toNumber(row.netQuantity),
          net_unit_price: toNumber(row.unitPrice),
          markup_override_percent:
            isRoundingMaterial(row) || row.itemMarkupPercent === ''
              ? null
              : toNumber(row.itemMarkupPercent),
          submitted_quantity: getSubmittedQuantity(row),
          is_owner_supplied: isOwnerSuppliedMaterial(row),
          remarks: row.remarks || '',
          sort_order: index,
        }));

      const { data, error } = await supabase.rpc('save_unit_price_document', {
        p_document: documentPayload,
        p_items: itemPayload,
      });
      if (error) throw error;

      const nextId = data;
      const fallbackVersion = documentState.id
        ? Math.max(documentState.latestVersionNo, documentState.versionNo) + 1
        : 1;
      const { data: savedDocument } = await supabase
        .from('unit_price_documents')
        .select('version_no')
        .eq('id', nextId)
        .maybeSingle();
      const nextVersion = toNumber(savedDocument?.version_no) || fallbackVersion;
      setDocumentState((previous) => ({
        ...previous,
        id: nextId,
        documentName: resolvedDocumentName,
        versionNo: nextVersion,
        latestVersionNo: nextVersion,
      }));
      await loadDocuments();
      showToast(`일위대가가 ${nextVersion}차 버전으로 저장되었습니다.`);
    } catch (error) {
      console.error('일위대가 저장 실패:', error);
      showToast(error?.message || '일위대가 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDocument = () => {
    if (!validateDocumentForSave()) return;

    const enteredDocumentName = String(documentState.documentName || '').trim();
    if (!enteredDocumentName) {
      setNameGuideDialogOpen(true);
      return;
    }

    persistDocument(enteredDocumentName);
  };

  const saveWithGuidedDocumentName = () => {
    setNameGuideDialogOpen(false);
    setDocumentState((previous) => ({
      ...previous,
      documentName: guidedDocumentName,
    }));
    persistDocument(guidedDocumentName);
  };

  const loadDocument = async (document) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('unit_price_document_items')
        .select('*')
        .eq('document_id', document.id)
        .order('sort_order');
      if (error) throw error;

      const spec = specs.find((item) => item.id === document.spec_id) || {
        id: document.spec_id,
        major_category: document.major_category,
        middle_category: document.middle_category,
        detail_category: document.detail_category,
        image_url: document.image_url || '',
      };
      const nextDocument = {
        id: document.id,
        documentName: document.document_name,
        status: document.status || 'draft',
        versionNo: toNumber(document.version_no),
        latestVersionNo: toNumber(document.version_no),
        materialMarkup: toNumber(document.material_markup_percent),
        laborMarkup: toNumber(document.labor_markup_percent),
        expenseMarkup: toNumber(document.expense_markup_percent),
        notes: document.notes || '',
      };
      setSelectedMajor(spec.major_category);
      setSelectedMiddle(spec.middle_category);
      setSelectedDetail(spec.detail_category);
      setSelectedSpec(spec);
      setDocumentState(nextDocument);
      setSelectedRowIds(new Set());
      setDraftRows(mapStoredDocumentItems(data, nextDocument));
      setMainTab(0);
      showToast('저장된 일위대가를 불러왔습니다.', 'info');
    } catch (error) {
      console.error('일위대가 불러오기 실패:', error);
      showToast('저장된 일위대가를 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openRevisionHistory = async (document) => {
    setRevisionDialog({
      open: true,
      document,
      revisions: [],
      loading: true,
    });
    try {
      const { data, error } = await supabase
        .from('unit_price_document_revisions')
        .select('id, document_id, version_no, snapshot, created_at, created_by')
        .eq('document_id', document.id)
        .order('version_no', { ascending: false });
      if (error) throw error;
      setRevisionDialog((previous) => ({
        ...previous,
        revisions: data || [],
        loading: false,
      }));
    } catch (error) {
      console.error('일위대가 버전 이력 조회 실패:', error);
      setRevisionDialog((previous) => ({ ...previous, loading: false }));
      showToast('일위대가 버전 이력을 불러오지 못했습니다.', 'error');
    }
  };

  const loadDocumentRevision = (document, revision) => {
    const snapshot = revision.snapshot || {};
    const snapshotDocument = snapshot.document || {};
    const snapshotItems = Array.isArray(snapshot.items) ? snapshot.items : [];
    const specId = snapshotDocument.spec_id || document.spec_id;
    const spec = specs.find((item) => item.id === specId) || {
      id: specId,
      major_category: snapshotDocument.major_category || document.major_category,
      middle_category: snapshotDocument.middle_category || document.middle_category,
      detail_category: snapshotDocument.detail_category || document.detail_category,
      image_url: snapshotDocument.image_url || document.image_url || '',
    };
    const latestVersionNo = toNumber(document.version_no);
    const revisionVersionNo = toNumber(revision.version_no);
    const nextDocument = {
      id: document.id,
      documentName: snapshotDocument.document_name || document.document_name,
      status: snapshotDocument.status || document.status || 'draft',
      versionNo: revisionVersionNo,
      latestVersionNo,
      materialMarkup: toNumber(snapshotDocument.material_markup_percent),
      laborMarkup: toNumber(snapshotDocument.labor_markup_percent),
      expenseMarkup: toNumber(snapshotDocument.expense_markup_percent),
      notes: snapshotDocument.notes || '',
    };

    setSelectedMajor(spec.major_category);
    setSelectedMiddle(spec.middle_category);
    setSelectedDetail(spec.detail_category);
    setSelectedSpec(spec);
    setDocumentState(nextDocument);
    setSelectedRowIds(new Set());
    setDraftRows(mapStoredDocumentItems(snapshotItems, nextDocument));
    setRevisionDialog((previous) => ({ ...previous, open: false }));
    setMainTab(0);
    showToast(
      `v${revisionVersionNo}을 불러왔습니다. 저장하면 v${latestVersionNo + 1}로 새 버전이 추가됩니다.`,
      'info',
    );
  };

  const deleteDocument = async (document) => {
    if (!window.confirm(`“${document.document_name}” 문서를 삭제하시겠습니까?`)) return;
    const { error } = await supabase.from('unit_price_documents').delete().eq('id', document.id);
    if (error) {
      showToast(error.message || '문서를 삭제하지 못했습니다.', 'error');
      return;
    }
    if (documentState.id === document.id) setDocumentState(EMPTY_DOCUMENT);
    await loadDocuments();
    showToast('일위대가 문서를 삭제했습니다.');
  };

  const copyDocumentToProject = async () => {
    const source = copyDialog.document;
    if (!source || !copyDialog.targetProject) {
      showToast('복사할 대상 현장을 선택해주세요.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const { data: items, error: itemError } = await supabase
        .from('unit_price_document_items')
        .select('*')
        .eq('document_id', source.id)
        .order('sort_order');
      if (itemError) throw itemError;

      const { error } = await supabase.rpc('save_unit_price_document', {
        p_document: {
          id: null,
          project_name: copyDialog.targetProject,
          document_name: copyDialog.documentName || `${source.document_name} 복사본`,
          status: 'draft',
          spec_id: source.spec_id,
          major_category: source.major_category,
          middle_category: source.middle_category,
          detail_category: source.detail_category,
          material_markup_percent: source.material_markup_percent,
          labor_markup_percent: source.labor_markup_percent,
          expense_markup_percent: source.expense_markup_percent,
          image_url: source.image_url || '',
          notes: source.notes || '',
        },
        p_items: (items || []).map((item) => ({
          ...item,
          id: undefined,
          document_id: undefined,
        })),
      });
      if (error) throw error;
      await loadDocuments();
      setCopyDialog({ open: false, document: null, targetProject: '', documentName: '' });
      showToast(`${copyDialog.targetProject} 현장으로 일위대가를 복사했습니다.`);
    } catch (error) {
      console.error('일위대가 현장 복사 실패:', error);
      showToast(error?.message || '현장 복사에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredDocuments = useMemo(() => {
    const search = documentSearch.trim().toLowerCase();
    return documents.filter((item) => {
      if (documentScope === 'current' && item.project_name !== projectName) return false;
      if (!search) return true;
      return [
        item.document_name,
        item.project_name,
        item.major_category,
        item.middle_category,
        item.detail_category,
      ].some((value) => String(value || '').toLowerCase().includes(search));
    });
  }, [documentScope, documentSearch, documents, projectName]);

  const filteredMaterials = useMemo(() => {
    return materials.filter((item) => matchesMaterialSearch(item, materialSearch));
  }, [materialSearch, materials]);

  const pickerMaterials = useMemo(() => {
    return materials
      .filter((item) => matchesMaterialSearch(item, materialPicker.search))
      .slice(0, 120);
  }, [materialPicker.search, materials]);

  const addMaterialToDraft = (material) => {
    const nextRow = {
      ...makeBlankRow(draftRows.length),
      materialId: material.id,
      itemCode: material.item_code,
      itemName: material.item_name,
      specification: material.specification || '',
      unit: material.unit || '',
      netQuantity: 1,
      unitPrice: toNumber(material.current_unit_price),
    };
    setDraftRows((previous) => [
      ...previous,
      nextRow,
    ]);
    setSelectedRowIds(new Set([nextRow.clientId]));
    showToast(`${material.item_name} 항목을 추가했습니다.`, 'info');
  };

  const openPriceDialog = async (material) => {
    setPriceDialog({
      open: true,
      material,
      price: material.current_unit_price,
      effectiveDate: material.effective_date || getToday(),
      note: '',
      history: [],
      historyLoading: true,
    });
    const { data } = await supabase
      .from('unit_price_price_history')
      .select('*')
      .eq('material_id', material.id)
      .order('effective_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);
    setPriceDialog((previous) => ({
      ...previous,
      history: data || [],
      historyLoading: false,
    }));
  };

  const updatePrices = async (updates, successMessage) => {
    const { error } = await supabase.rpc('update_unit_price_prices', {
      p_updates: updates,
    });
    if (error) throw error;
    const { data, error: loadMaterialError } = await supabase
      .from('unit_price_materials')
      .select('*')
      .eq('is_active', true)
      .order('item_name')
      .limit(2000);
    if (loadMaterialError) throw loadMaterialError;
    setMaterials(data || []);
    showToast(successMessage);
  };

  const saveSinglePrice = async () => {
    if (!priceDialog.material) return;
    setSaving(true);
    try {
      await updatePrices([
        {
          material_id: priceDialog.material.id,
          unit_price: toNumber(priceDialog.price),
          effective_date: priceDialog.effectiveDate,
          note: priceDialog.note || '',
        },
      ], '자재 단가와 변경 이력을 저장했습니다.');
      setPriceDialog((previous) => ({ ...previous, open: false }));
    } catch (error) {
      showToast(error?.message || '자재 단가를 저장하지 못했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addNewMaterial = async () => {
    if (!newMaterialDialog.itemName.trim()) {
      showToast('자재명을 입력해주세요.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const nextCode = `UPM-${Date.now().toString().slice(-9)}`;
      const { data, error } = await supabase
        .from('unit_price_materials')
        .insert({
          item_code: nextCode,
          item_name: newMaterialDialog.itemName.trim(),
          specification: newMaterialDialog.specification || '',
          unit: newMaterialDialog.unit || '',
          current_unit_price: toNumber(newMaterialDialog.price),
          effective_date: newMaterialDialog.effectiveDate,
        })
        .select('*')
        .single();
      if (error) throw error;
      setMaterials((previous) => [...previous, data].sort((a, b) => (
        String(a.item_name).localeCompare(String(b.item_name), 'ko')
      )));
      setNewMaterialDialog({
        open: false,
        itemName: '',
        specification: '',
        unit: 'M',
        price: 0,
        effectiveDate: getToday(),
      });
      showToast('새 자재를 단가 마스터에 등록했습니다.');
    } catch (error) {
      showToast(error?.message || '새 자재를 등록하지 못했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const downloadPriceTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('자재단가');
    sheet.columns = [
      { header: '자재코드', key: 'code', width: 18 },
      { header: '품명', key: 'name', width: 32 },
      { header: '규격', key: 'spec', width: 28 },
      { header: '단위', key: 'unit', width: 10 },
      { header: '변경단가', key: 'price', width: 15 },
      { header: '적용일', key: 'date', width: 14 },
      { header: '변경사유', key: 'note', width: 28 },
    ];
    materials.forEach((item) => sheet.addRow({
      code: item.item_code,
      name: item.item_name,
      spec: item.specification,
      unit: item.unit,
      price: toNumber(item.current_unit_price),
      date: item.effective_date || getToday(),
      note: '',
    }));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const buffer = await workbook.xlsx.writeBuffer();
    saveBlob(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `자재단가_업데이트양식_${getToday()}.xlsx`,
    );
  };

  const uploadPriceWorkbook = async (file) => {
    if (!file) return;
    setSaving(true);
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error('엑셀 첫 번째 시트를 찾을 수 없습니다.');

      const updates = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const code = String(row.getCell(1).text || '').trim();
        const name = String(row.getCell(2).text || '').trim();
        const specification = String(row.getCell(3).text || '').trim();
        const unit = String(row.getCell(4).text || '').trim();
        const price = toNumber(row.getCell(5).value);
        const effectiveDate = String(row.getCell(6).text || getToday()).trim();
        const note = String(row.getCell(7).text || '').trim();
        if (!code && !name) return;
        const material = materials.find((item) => item.item_code === code) || materials.find(
          (item) =>
            item.item_name === name &&
            String(item.specification || '') === specification &&
            String(item.unit || '') === unit,
        );
        if (!material) return;
        updates.push({
          material_id: material.id,
          unit_price: price,
          effective_date: /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
            ? effectiveDate
            : getToday(),
          note,
        });
      });
      if (updates.length === 0) throw new Error('업데이트할 자재 단가를 찾지 못했습니다.');
      await updatePrices(updates, `${updates.length}개 자재의 단가를 일괄 반영했습니다.`);
    } catch (error) {
      console.error('자재 단가 엑셀 업로드 실패:', error);
      showToast(error?.message || '자재 단가 엑셀을 처리하지 못했습니다.', 'error');
    } finally {
      setSaving(false);
      if (priceUploadRef.current) priceUploadRef.current.value = '';
    }
  };

  const saveTemplateRows = async () => {
    if (!canManage || !selectedTemplateSpecId) return;
    if (templateRows.filter(isRoundingMaterial).length > 1) {
      showToast('재료비(단수정리)는 규격당 한 개만 저장할 수 있습니다.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('replace_unit_price_spec_items', {
        p_spec_id: selectedTemplateSpecId,
        p_items: templateRows
          .filter((row) => row.itemName.trim())
          .map((row, index) => ({
            material_id: row.materialId || null,
            cost_type: isRoundingMaterial(row) ? 'material_rounding' : row.costType,
            item_name: row.itemName,
            specification: row.specification || '',
            unit: row.unit || '',
            net_quantity: toNumber(row.netQuantity),
            unit_price_override: row.materialId ? null : toNumber(row.unitPrice),
            sort_order: index,
            is_owner_supplied: isOwnerSuppliedMaterial(row),
            remarks: row.remarks || '',
          })),
      });
      if (error) throw error;
      await loadTemplateRows(selectedTemplateSpecId, 'template');
      if (selectedSpec?.id === selectedTemplateSpecId && !documentState.id) {
        await loadTemplateRows(selectedTemplateSpecId, 'draft');
      }
      showToast('규격별 기본 구성값을 저장했습니다.');
    } catch (error) {
      showToast(error?.message || '규격 기본값을 저장하지 못했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // v52.48.5.39 사용자 제공 일위대가 엑셀 양식 적용
  // v52.48.5.39.1 Excel 복구경고 개선 + 품명 A열 직접 입력
  const exportDocumentExcel = async () => {
    const exportRows = draftRows.filter((row) => String(row.itemName || '').trim());
    if (exportRows.length === 0) {
      showToast('내보낼 일위대가 항목이 없습니다.', 'warning');
      return;
    }

    try {
      const templateResponse = await fetch('/templates/unit_price_template.xlsx', {
        cache: 'no-store',
      });
      if (!templateResponse.ok) {
        throw new Error(
          `일위대가 엑셀 양식을 불러오지 못했습니다. (${templateResponse.status})`,
        );
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await templateResponse.arrayBuffer());
      workbook.creator = '욱림건설 공사관리시스템';
      workbook.lastModifiedBy = '욱림건설 공사관리시스템';
      workbook.created = new Date();
      workbook.modified = new Date();

      if (workbook.calcProperties) {
        workbook.calcProperties.fullCalcOnLoad = true;
        workbook.calcProperties.forceFullCalc = true;
        workbook.calcProperties.calcMode = 'auto';
      }

      const netSheet = workbook.worksheets[0];
      if (!netSheet) {
        throw new Error('일위대가 엑셀 양식의 첫 번째 시트를 찾지 못했습니다.');
      }
      netSheet.name = '정미값';

      const templateMerges = [
        'A1:A3',
        'B1:B3',
        'C1:I3',
        'K1:N1',
        'K2:N2',
        'K3:N3',
        'A4:B5',
        'C4:C5',
        'D4:D5',
        'E4:E5',
        'F4:G4',
        'H4:I4',
        'J4:K4',
        'L4:M4',
        'N4:N5',
      ];

      const clonePlainObject = (value, fallback = {}) => {
        try {
          return JSON.parse(JSON.stringify(value ?? fallback));
        } catch (_error) {
          return fallback;
        }
      };

      const cloneTemplateSheet = (source, name) => {
        const target = workbook.addWorksheet(name);

        Object.assign(target.properties, clonePlainObject(source.properties));
        Object.assign(target.headerFooter, clonePlainObject(source.headerFooter));
        target.views = clonePlainObject(source.views, []);

        for (let columnNumber = 1; columnNumber <= 14; columnNumber += 1) {
          const sourceColumn = source.getColumn(columnNumber);
          const targetColumn = target.getColumn(columnNumber);
          targetColumn.width = sourceColumn.width;
          targetColumn.hidden = sourceColumn.hidden;
          targetColumn.outlineLevel = sourceColumn.outlineLevel;
          targetColumn.style = clonePlainObject(sourceColumn.style);
        }

        const copyRowCount = Math.max(source.rowCount, 32);
        for (let rowNumber = 1; rowNumber <= copyRowCount; rowNumber += 1) {
          const sourceRow = source.getRow(rowNumber);
          const targetRow = target.getRow(rowNumber);

          if (sourceRow.height) targetRow.height = sourceRow.height;
          targetRow.hidden = sourceRow.hidden;
          targetRow.outlineLevel = sourceRow.outlineLevel;

          for (let columnNumber = 1; columnNumber <= 14; columnNumber += 1) {
            const sourceCell = sourceRow.getCell(columnNumber);
            const targetCell = targetRow.getCell(columnNumber);

            const sourceValue = sourceCell.value;
            targetCell.value = (
              sourceValue && typeof sourceValue === 'object'
                ? clonePlainObject(sourceValue, sourceValue)
                : sourceValue
            );
            targetCell.style = clonePlainObject(sourceCell.style);
          }
        }

        templateMerges.forEach((range) => target.mergeCells(range));
        return target;
      };

      const submittedSheet = cloneTemplateSheet(netSheet, '제출용');

      const applyStablePageSetup = (sheet, printEndRow) => {
        sheet.pageSetup = {
          paperSize: 9,
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          margins: {
            left: 0.19685039370078741,
            right: 0.19685039370078741,
            top: 0.19685039370078741,
            bottom: 0.19685039370078741,
            header: 0.31496062992125984,
            footer: 0.31496062992125984,
          },
          printArea: `A1:N${printEndRow}`,
        };
      };

      const fillTemplateSheet = (sheet, mode) => {
        const isNet = mode === 'net';
        const baseCapacity = 20;
        const extraRows = Math.max(0, exportRows.length - baseCapacity);

        // 기본 양식은 6~25행 20칸입니다.
        // 20개를 초과할 때만 25행의 모양을 복제하여 합계/특이사항 행을 아래로 이동합니다.
        if (extraRows > 0) {
          sheet.duplicateRow(25, extraRows, true);
        }

        const bodyStartRow = 6;
        const bodyEndRow = 25 + extraRows;
        const totalRow = 26 + extraRows;
        const noteRow = 27 + extraRows;
        const printEndRow = 29 + extraRows;

        // 상단 양식: NO / 일위대가 / 품명·규격·단위
        sheet.getCell('A1').value = 'NO';
        sheet.getCell('B1').value = 1;
        sheet.getCell('C1').value = '일위대가';
        sheet.getCell('J1').value = '품    명';
        sheet.getCell('J2').value = '규    격';
        sheet.getCell('J3').value = '단    위';
        sheet.getCell('K1').value = (
          selectedMiddle
          || documentState.documentName
          || selectedDetail
          || ''
        );
        sheet.getCell('K2').value = selectedDetail || '';
        sheet.getCell('K3').value = 'M2';

        for (
          let rowNumber = bodyStartRow;
          rowNumber <= bodyEndRow;
          rowNumber += 1
        ) {
          const item = exportRows[rowNumber - bodyStartRow];

          if (item) {
            const ownerSupplied = isOwnerSuppliedMaterial(item);
            const roundingAmount = roundingAmounts.get(item.clientId);
            const summaryType = getSummaryCostType(item);
            const quantity = isNet
              ? toNumber(item.netQuantity)
              : getSubmittedQuantity(item);
            const unitPrice = isNet
              ? (
                ownerSupplied || isRoundingMaterial(item)
                  ? 0
                  : toNumber(item.unitPrice)
              )
              : getSubmittedUnitPrice(item, roundingAmount);

            // v52.48.5.39.1
            // A열은 구분(재료비/노무비/경비)이 아니라 실제 품명을 직접 표시합니다.
            // 기존 B열 품명 값은 A열로 이동하고 B열은 비웁니다.
            sheet.getCell(`A${rowNumber}`).value = item.itemName || '';
            sheet.getCell(`B${rowNumber}`).value = null;
            sheet.getCell(`C${rowNumber}`).value = item.specification || '';
            sheet.getCell(`D${rowNumber}`).value = item.unit || '';
            sheet.getCell(`E${rowNumber}`).value = quantity;

            sheet.getCell(`F${rowNumber}`).value = summaryType === 'material'
              ? unitPrice
              : 0;
            sheet.getCell(`H${rowNumber}`).value = summaryType === 'labor'
              ? unitPrice
              : 0;
            sheet.getCell(`J${rowNumber}`).value = summaryType === 'expense'
              ? unitPrice
              : 0;

            sheet.getCell(`N${rowNumber}`).value = [
              ownerSupplied ? '지급자재' : '',
              item.remarks || '',
            ].filter(Boolean).join(' · ');
          } else {
            ['A', 'B', 'C', 'D', 'E', 'F', 'H', 'J', 'N'].forEach((column) => {
              sheet.getCell(`${column}${rowNumber}`).value = null;
            });
          }

          // 금액 및 합계는 제공받은 양식의 계산구조를 그대로 유지합니다.
          sheet.getCell(`G${rowNumber}`).value = {
            formula: `E${rowNumber}*F${rowNumber}`,
          };
          sheet.getCell(`I${rowNumber}`).value = {
            formula: `E${rowNumber}*H${rowNumber}`,
          };
          sheet.getCell(`K${rowNumber}`).value = {
            formula: `E${rowNumber}*J${rowNumber}`,
          };
          sheet.getCell(`L${rowNumber}`).value = {
            formula: `F${rowNumber}+H${rowNumber}+J${rowNumber}`,
          };
          sheet.getCell(`M${rowNumber}`).value = {
            formula: `G${rowNumber}+I${rowNumber}+K${rowNumber}`,
          };
        }

        // 합계행도 양식의 열 구성을 그대로 사용합니다.
        sheet.getCell(`G${totalRow}`).value = {
          formula: `ROUND(SUM(G${bodyStartRow}:G${bodyEndRow}),0)`,
        };
        sheet.getCell(`I${totalRow}`).value = {
          formula: `SUM(I${bodyStartRow}:I${bodyEndRow})`,
        };
        sheet.getCell(`K${totalRow}`).value = {
          formula: `SUM(K${bodyStartRow}:K${bodyEndRow})`,
        };
        sheet.getCell(`M${totalRow}`).value = {
          formula: `SUM(M${bodyStartRow}:M${bodyEndRow})`,
        };

        sheet.getCell(`A${noteRow}`).value = '*특이사항';
        if (documentState.notes) {
          sheet.getCell(`B${noteRow}`).value = documentState.notes;
        }

        // 외부 프린터 설정을 복제하지 않고 ExcelJS가 안전하게 생성하는 표준 인쇄설정만 사용합니다.
        applyStablePageSetup(sheet, printEndRow);
      };

      fillTemplateSheet(netSheet, 'net');
      fillTemplateSheet(submittedSheet, 'submitted');

      const safeName = String(
        documentState.documentName
        || selectedDetail
        || '일위대가',
      ).replace(/[\\/:*?"<>|]/g, '_');

      const buffer = await workbook.xlsx.writeBuffer();
      saveBlob(
        new Blob(
          [buffer],
          {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        ),
        `일위대가_${safeName}_${getToday()}.xlsx`,
      );

      showToast('제공된 일위대가 양식으로 Excel을 다운로드했습니다.');
    } catch (error) {
      console.error('일위대가 양식 Excel 다운로드 실패:', error);
      showToast(
        error?.message || '일위대가 Excel을 생성하지 못했습니다.',
        'error',
      );
    }
  };


  const printDocument = () => {
    if (draftRows.length === 0) {
      showToast('출력할 일위대가 항목이 없습니다.', 'warning');
      return;
    }
    window.print();
  };

  const renderAuthoringTable = () => (
    <TableContainer sx={{ maxHeight: 'calc(100vh - 365px)', minHeight: 280 }}>
      <Table
        stickyHeader
        size="small"
        sx={{
          minWidth: 1250,
          '& .MuiTableRow-root': { height: 35 },
          '& .MuiInputBase-root': {
            minHeight: 28,
            height: 28,
            fontSize: '0.67rem',
          },
          '& .MuiInputBase-input': {
            px: '5px',
            py: '3px',
            fontSize: '0.67rem',
          },
          '& .MuiSelect-select': {
            px: '5px !important',
            py: '3px !important',
            fontSize: '0.67rem',
          },
          '& .MuiFormHelperText-root': {
            mx: 0,
            mt: '1px',
            fontSize: '0.52rem',
            lineHeight: 1,
          },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell align="center" sx={{ ...compactHeaderCellSx, width: 38, px: 0 }}>
              <Checkbox
                size="small"
                checked={draftRows.length > 0 && selectedRowIds.size === draftRows.length}
                indeterminate={selectedRowIds.size > 0 && selectedRowIds.size < draftRows.length}
                onChange={toggleAllDraftRows}
                sx={{ p: 0.25 }}
              />
            </TableCell>
            <TableCell align="center" sx={{ ...compactHeaderCellSx, width: 82 }}>구분</TableCell>
            <TableCell align="center" sx={{ ...compactHeaderCellSx, minWidth: 145 }}>품명</TableCell>
            <TableCell align="center" sx={{ ...compactHeaderCellSx, minWidth: 125 }}>규격</TableCell>
            <TableCell align="center" sx={{ ...compactHeaderCellSx, width: 56 }}>단위</TableCell>
            <TableCell align="center" sx={{ ...compactHeaderCellSx, width: 84 }}>정미수량</TableCell>
            <TableCell align="center" sx={{ ...compactHeaderCellSx, width: 84 }}>단가</TableCell>
            <TableCell align="center" sx={{ ...compactHeaderCellSx, width: 90 }}>정미금액</TableCell>
            <TableCell align="center" sx={{ ...compactHeaderCellSx, width: 92 }}>항목할증률</TableCell>
            <TableCell align="center" sx={{ ...compactHeaderCellSx, width: 94 }}>제출수량</TableCell>
            <TableCell align="center" sx={{ ...compactHeaderCellSx, width: 94 }}>제출금액</TableCell>
            <TableCell align="center" sx={{ ...compactHeaderCellSx, width: 90 }}>지급자재 여부</TableCell>
            <TableCell align="center" sx={{ ...compactHeaderCellSx, minWidth: 90 }}>비고</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {draftRows.map((row) => {
            const netAmount = getNetAmount(row);
            const submittedQuantity = getSubmittedQuantity(row);
            const roundingAmount = roundingAmounts.get(row.clientId);
            const submittedAmount = getSubmittedAmount(row, roundingAmount);
            const hasAnotherRoundingRow = draftRows.some((item) => (
              item.clientId !== row.clientId && isRoundingMaterial(item)
            ));
            return (
              <TableRow
                key={row.clientId}
                hover
                selected={selectedRowIds.has(row.clientId)}
                sx={{ '&.Mui-selected': { bgcolor: '#eff6ff' } }}
              >
                <TableCell align="center" sx={{ ...compactBodyCellSx, px: 0 }}>
                  <Checkbox
                    size="small"
                    checked={selectedRowIds.has(row.clientId)}
                    onChange={() => toggleDraftRowSelection(row.clientId)}
                    sx={{ p: 0.25 }}
                  />
                </TableCell>
                <TableCell sx={compactBodyCellSx}>
                  <Select
                    value={row.costType}
                    size="small"
                    fullWidth
                    onChange={(event) => updateDraftRow(row.clientId, 'costType', event.target.value)}
                  >
                    {ROW_COST_TYPES.map((item) => (
                      <MenuItem
                        key={item.value}
                        value={item.value}
                        disabled={item.value === 'material_rounding' && hasAnotherRoundingRow}
                      >
                        {item.label}
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell sx={compactBodyCellSx}>
                  <TextField value={row.itemName} onChange={(event) => updateDraftRow(row.clientId, 'itemName', event.target.value)} size="small" fullWidth />
                </TableCell>
                <TableCell sx={compactBodyCellSx}>
                  <TextField value={row.specification} onChange={(event) => updateDraftRow(row.clientId, 'specification', event.target.value)} size="small" fullWidth />
                </TableCell>
                <TableCell sx={compactBodyCellSx}>
                  <TextField value={row.unit} onChange={(event) => updateDraftRow(row.clientId, 'unit', event.target.value)} size="small" fullWidth sx={{ '& .MuiInputBase-input': { textAlign: 'center' } }} />
                </TableCell>
                <TableCell sx={compactBodyCellSx}>
                  {row.costType === 'labor' ? (
                    <Box
                      onClick={(event) => openLaborCalculator(event, row)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TextField
                        value={`${formatQuantity(row.netQuantity)}인`}
                        size="small"
                        helperText="클릭해 ㎡금액 입력"
                        inputProps={{ readOnly: true }}
                        sx={{ pointerEvents: 'none', '& .MuiInputBase-input': { textAlign: 'right' } }}
                      />
                    </Box>
                  ) : isRoundingMaterial(row) ? (
                    <TextField
                      value="자동"
                      disabled
                      size="small"
                      helperText="제출용만 반영"
                      sx={{ '& .MuiInputBase-input': { textAlign: 'center' } }}
                    />
                  ) : (
                    <CompactNumberField value={row.netQuantity} onChange={(value) => updateDraftRow(row.clientId, 'netQuantity', value)} min="0" />
                  )}
                </TableCell>
                <TableCell sx={compactBodyCellSx}>
                  <CompactMoneyField
                    value={row.unitPrice}
                    onChange={(value) => updateDraftRow(row.clientId, 'unitPrice', value)}
                    helperText={isRoundingMaterial(row) ? '기본 가산액' : ''}
                  />
                </TableCell>
                <TableCell align="right" sx={{ ...compactBodyCellSx, pr: 0.85, fontWeight: 700 }}>{formatMoney(netAmount)}</TableCell>
                <TableCell sx={compactBodyCellSx}>
                  <TextField
                    type="number"
                    value={row.itemMarkupPercent}
                    disabled={isRoundingMaterial(row)}
                    placeholder="0%"
                    onChange={(event) => updateDraftRow(row.clientId, 'itemMarkupPercent', event.target.value)}
                    size="small"
                    inputProps={{ min: 0, step: 0.1 }}
                    helperText={row.itemMarkupPercent === '' ? '할증 없음' : '금액에 적용'}
                    sx={{ '& .MuiInputBase-input': { textAlign: 'right' } }}
                  />
                </TableCell>
                <TableCell sx={compactBodyCellSx}>
                  <TextField
                    type="number"
                    value={row.submittedQuantityOverride}
                    disabled={isRoundingMaterial(row)}
                    placeholder={formatQuantity(submittedQuantity)}
                    onChange={(event) => updateDraftRow(row.clientId, 'submittedQuantityOverride', event.target.value)}
                    size="small"
                    inputProps={{ min: 0, step: 0.0001 }}
                    helperText={row.submittedQuantityOverride === '' ? '정미수량 적용' : '직접 수정'}
                    sx={{ '& .MuiInputBase-input': { textAlign: 'right' } }}
                  />
                </TableCell>
                <TableCell align="right" sx={{ ...compactBodyCellSx, pr: 0.85, color: '#b91c1c', fontWeight: 800 }}>{formatMoney(submittedAmount)}</TableCell>
                <TableCell align="center" sx={{ ...compactBodyCellSx, px: 0 }}>
                  <Tooltip title={row.costType === 'material' ? '체크하면 재료비 금액에서 제외됩니다.' : '재료비 항목에서만 선택할 수 있습니다.'} arrow>
                    <span>
                      <Checkbox
                        size="small"
                        checked={Boolean(row.isOwnerSupplied)}
                        disabled={row.costType !== 'material'}
                        onChange={(event) => updateDraftRow(row.clientId, 'isOwnerSupplied', event.target.checked)}
                        sx={{ p: 0.25 }}
                      />
                    </span>
                  </Tooltip>
                </TableCell>
                <TableCell sx={compactBodyCellSx}>
                  <TextField value={row.remarks} onChange={(event) => updateDraftRow(row.clientId, 'remarks', event.target.value)} size="small" fullWidth />
                </TableCell>
              </TableRow>
            );
          })}
          {draftRows.length === 0 && (
            <TableRow>
              <TableCell colSpan={13} align="center" sx={{ py: 6, color: '#64748b', fontSize: '0.7rem' }}>
                규격을 선택하거나 항목을 추가해주세요.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderPrintArea = () => {
    const isNet = printMode === 'net';
    return (
      <Box id="unit-price-print-area" sx={{ display: 'none' }}>
        <Typography className="print-title">일 위 대 가</Typography>
        <Table size="small" className="print-info-table">
          <TableBody>
            <TableRow><TableCell>현장명</TableCell><TableCell>{projectName}</TableCell><TableCell>구분</TableCell><TableCell>{isNet ? '정미값' : '제출용'}</TableCell></TableRow>
            <TableRow><TableCell>품명</TableCell><TableCell>{documentState.documentName || selectedMiddle}</TableCell><TableCell>규격</TableCell><TableCell>{selectedDetail}</TableCell></TableRow>
            <TableRow><TableCell>단위</TableCell><TableCell>M2</TableCell><TableCell>버전</TableCell><TableCell>{documentState.versionNo || 1}</TableCell></TableRow>
          </TableBody>
        </Table>
        <Table size="small" className="print-main-table">
          <TableHead>
            <TableRow>
              <TableCell rowSpan={2}>품명</TableCell><TableCell rowSpan={2}>규격</TableCell><TableCell rowSpan={2}>단위</TableCell><TableCell rowSpan={2}>수량</TableCell>
              <TableCell colSpan={2}>재료비</TableCell><TableCell colSpan={2}>노무비</TableCell><TableCell colSpan={2}>경비</TableCell><TableCell colSpan={2}>합계</TableCell><TableCell rowSpan={2}>비고</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>단가</TableCell><TableCell>금액</TableCell><TableCell>단가</TableCell><TableCell>금액</TableCell><TableCell>단가</TableCell><TableCell>금액</TableCell><TableCell>단가</TableCell><TableCell>금액</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {COST_TYPES.flatMap((type) => {
              const rows = draftRows.filter((row) => getSummaryCostType(row) === type.value);
              if (rows.length === 0) return [];
              return [
                <TableRow key={`${type.value}-title`} className="print-section-row"><TableCell colSpan={13}>■ {type.label}</TableCell></TableRow>,
                ...rows.map((row) => {
                  const quantity = isNet ? toNumber(row.netQuantity) : getSubmittedQuantity(row);
                  const ownerSupplied = isOwnerSuppliedMaterial(row);
                  const roundingAmount = roundingAmounts.get(row.clientId);
                  const amount = isNet
                    ? getNetAmount(row)
                    : getSubmittedAmount(row, roundingAmount);
                  const chargeablePrice = isNet
                    ? (ownerSupplied || isRoundingMaterial(row) ? 0 : toNumber(row.unitPrice))
                    : getSubmittedUnitPrice(row, roundingAmount);
                  const summaryType = getSummaryCostType(row);
                  return (
                    <TableRow key={row.clientId}>
                      <TableCell>{row.itemName}</TableCell><TableCell>{row.specification}</TableCell><TableCell>{row.unit}</TableCell><TableCell>{formatQuantity(quantity)}</TableCell>
                      <TableCell>{summaryType === 'material' ? formatMoney(chargeablePrice) : ''}</TableCell><TableCell>{summaryType === 'material' ? formatMoney(amount) : ''}</TableCell>
                      <TableCell>{summaryType === 'labor' ? formatMoney(chargeablePrice) : ''}</TableCell><TableCell>{summaryType === 'labor' ? formatMoney(amount) : ''}</TableCell>
                      <TableCell>{summaryType === 'expense' ? formatMoney(chargeablePrice) : ''}</TableCell><TableCell>{summaryType === 'expense' ? formatMoney(amount) : ''}</TableCell>
                      <TableCell>{formatMoney(chargeablePrice)}</TableCell><TableCell>{formatMoney(amount)}</TableCell><TableCell>{[ownerSupplied ? '지급자재' : '', row.remarks].filter(Boolean).join(' · ')}</TableCell>
                    </TableRow>
                  );
                }),
              ];
            })}
            <TableRow className="print-total-row">
              <TableCell colSpan={5}>합계</TableCell>
              <TableCell>{formatMoney(isNet ? totals.material.net : totals.material.submitted)}</TableCell><TableCell />
              <TableCell>{formatMoney(isNet ? totals.labor.net : totals.labor.submitted)}</TableCell><TableCell />
              <TableCell>{formatMoney(isNet ? totals.expense.net : totals.expense.submitted)}</TableCell><TableCell />
              <TableCell>{formatMoney(isNet ? grandNet : grandSubmitted)}</TableCell><TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </Box>
    );
  };

  if (loading && specs.length === 0) {
    return <Box sx={{ minHeight: 420, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  }

  if (!databaseReady) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 900, mb: 2 }}>일위대가작성</Typography>
        <Alert severity="warning" sx={{ mb: 2 }}>{loadError}</Alert>
        <Typography sx={{ color: '#475569', lineHeight: 1.8 }}>
          `v52.48.5.17_unit_price_analysis.sql`을 Supabase SQL Editor에서 전체 실행한 뒤 이 화면을 새로고침하면,
          엑셀에서 추출한 벽체·천정 기준정보가 자동으로 표시됩니다.
        </Typography>
        <Button sx={{ mt: 2 }} variant="contained" startIcon={<RefreshRoundedIcon />} onClick={loadBaseData}>다시 확인</Button>
      </Paper>
    );
  }

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #unit-price-print-area, #unit-price-print-area * { visibility: visible !important; }
          #unit-price-print-area { display: block !important; position: absolute; inset: 0; width: 100%; padding: 8mm; color: #000; background: #fff; }
          #unit-price-print-area .print-title { text-align: center; font-size: 22pt; font-weight: 900; letter-spacing: 10px; margin-bottom: 6mm; }
          #unit-price-print-area table { border-collapse: collapse; width: 100%; table-layout: fixed; }
          #unit-price-print-area th, #unit-price-print-area td { border: 1px solid #000; padding: 2.2mm 1.2mm; font-size: 7.5pt; line-height: 1.25; }
          #unit-price-print-area th { background: #e5e7eb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: 800; text-align: center; }
          #unit-price-print-area .print-info-table { margin-bottom: 4mm; }
          #unit-price-print-area .print-info-table td:nth-child(odd) { width: 12%; font-weight: 800; text-align: center; background: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #unit-price-print-area .print-section-row td { font-weight: 900; background: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #unit-price-print-area .print-total-row td { font-weight: 900; background: #e5e7eb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #unit-price-print-area .print-note { margin-top: 4mm; font-size: 8pt; }
          @page { size: A4 landscape; margin: 6mm; }
        }
      `}</style>

      <Paper sx={{ mb: 1.2, px: 2, py: 1.2, border: '1px solid #dbe3ec' }}>
        <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1, flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Typography sx={{ fontSize: '1.22rem', fontWeight: 950, color: '#0f172a', whiteSpace: 'nowrap' }}>일위대가작성</Typography>
            <Chip label={`현재 현장 · ${projectName || '미선택'}`} color="primary" variant="outlined" />
          </Stack>
          <Box sx={{ flex: 1, minWidth: 12 }} />
          <Stack direction="row" spacing={0.45} alignItems="center" justifyContent="flex-end" sx={{ ml: 'auto', flexShrink: 0 }}>
            <Tooltip title="새 일위대가 작성">
              <IconButton size="small" onClick={resetDocument} sx={{ border: '1px solid #cbd5e1', borderRadius: 1 }}>
                <PostAddRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="저장">
              <span>
                <IconButton size="small" color="primary" disabled={saving} onClick={handleSaveDocument} sx={{ border: '1px solid #93c5fd', borderRadius: 1 }}>
                  {saving ? <CircularProgress size={18} /> : <SaveRoundedIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={printMode === 'net' ? '정미 일위대가 출력/PDF' : '제출용 일위대가 출력/PDF'}>
              <IconButton size="small" onClick={printDocument} sx={{ border: '1px solid #cbd5e1', borderRadius: 1 }}>
                <PrintRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="정미값·제출용 Excel 다운로드">
              <IconButton size="small" onClick={exportDocumentExcel} sx={{ border: '1px solid #cbd5e1', borderRadius: 1 }}>
                <TableViewRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="기준정보와 저장목록 새로고침">
              <span>
                <IconButton size="small" onClick={loadBaseData} disabled={loading} sx={{ ml: 0.5, border: '1px solid #cbd5e1', borderRadius: 1 }}>
                  {loading ? <CircularProgress size={18} /> : <RefreshRoundedIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Box>
        {loadError && <Alert severity="error" sx={{ mt: 1.5 }}>{loadError}</Alert>}
      </Paper>

      <Paper sx={{ border: '1px solid #dbe3ec' }}>
        <Tabs value={mainTab} onChange={(_, value) => setMainTab(value)} sx={{ px: 1.5, borderBottom: '1px solid #e2e8f0' }}>
          <Tab label="일위대가 작성" />
          <Tab label={`저장·공유 (${documents.length})`} />
          <Tab label="기준정보·단가" />
        </Tabs>

        {mainTab === 0 && (
          <Box sx={{ p: 1.5 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 300px' }, gap: 1.5 }}>
              <Box sx={{ minWidth: 0 }}>
                <Paper variant="outlined" sx={{ px: 0.9, py: 0.75, mb: 1.3, bgcolor: '#f8fafc' }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '150px 190px 210px minmax(150px, 1fr) 105px' }, gap: 0.7 }}>
                    <TextField
                      select label="대분류" value={selectedMajor} size="small"
                      sx={compactFilterFieldSx}
                      onChange={(event) => {
                        const major = event.target.value;
                        const middle = specs.find((item) => item.major_category === major)?.middle_category || '';
                        const detail = specs.find((item) => item.major_category === major && item.middle_category === middle)?.detail_category || '';
                        handleSpecChange(detail, major, middle);
                      }}
                    >{majorOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>
                    <TextField
                      select label="중분류" value={selectedMiddle} size="small"
                      sx={compactFilterFieldSx}
                      onChange={(event) => {
                        const middle = event.target.value;
                        const detail = specs.find((item) => item.major_category === selectedMajor && item.middle_category === middle)?.detail_category || '';
                        handleSpecChange(detail, selectedMajor, middle);
                      }}
                    >{middleOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>
                    <TextField select label="세부규격" value={selectedDetail} size="small" sx={compactFilterFieldSx} onChange={(event) => handleSpecChange(event.target.value)}>
                      {detailOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
                    </TextField>
                    <TextField
                      label="문서명" size="small" value={documentState.documentName}
                      sx={compactFilterFieldSx}
                      placeholder={guidedDocumentName}
                      onChange={(event) => setDocumentState((previous) => ({ ...previous, documentName: event.target.value }))}
                    />
                    <TextField select label="저장상태" size="small" value={documentState.status} sx={compactFilterFieldSx} onChange={(event) => setDocumentState((previous) => ({ ...previous, status: event.target.value }))}>
                      <MenuItem value="draft">작성중</MenuItem><MenuItem value="submitted">제출본</MenuItem><MenuItem value="archived">보관</MenuItem>
                    </TextField>
                  </Box>
                </Paper>

                <Box sx={{ mb: 1.3 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      minHeight: 34,
                      px: 0.75,
                      py: 0.35,
                      mb: 0.8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.45,
                      borderColor: '#94a3b8',
                      boxShadow: 'none',
                    }}
                  >
                    <Tooltip title="빈 항목 추가" arrow>
                      <IconButton size="small" color="primary" aria-label="빈 항목 추가" onClick={addBlankDraftRow}>
                        <AddCircleOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="선택 항목 삭제" arrow>
                      <span>
                        <IconButton size="small" color="error" aria-label="선택 항목 삭제" disabled={selectedRowIds.size === 0} onClick={removeSelectedDraftRows}>
                          <RemoveCircleOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="선택 항목 위로 이동" arrow>
                      <span>
                        <IconButton size="small" aria-label="선택 항목 위로 이동" disabled={selectedRowIds.size === 0} onClick={() => moveSelectedDraftRows(-1)}>
                          <ArrowUpwardRoundedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="선택 항목 아래로 이동" arrow>
                      <span>
                        <IconButton size="small" aria-label="선택 항목 아래로 이동" disabled={selectedRowIds.size === 0} onClick={() => moveSelectedDraftRows(1)}>
                          <ArrowDownwardRoundedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Divider orientation="vertical" flexItem sx={{ mx: 0.35 }} />
                    <Typography sx={{ fontSize: '0.65rem', color: '#64748b' }}>
                      선택 {selectedRowIds.size.toLocaleString()}개
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <Button size="small" variant="outlined" onClick={() => setMaterialPicker({ open: true, search: '' })} sx={{ minHeight: 27, py: 0.2, fontSize: '0.66rem' }}>
                      자재 마스터에서 추가
                    </Button>
                  </Paper>
                  <Paper variant="outlined" sx={{ overflow: 'hidden', borderColor: '#cbd5e1', boxShadow: 'none' }}>
                    {renderAuthoringTable()}
                  </Paper>
                </Box>
              </Box>

              <Stack spacing={1.2}>
                <Paper variant="outlined" sx={{ p: 1.2 }}>
                  <Typography sx={{ fontSize: '0.88rem', fontWeight: 900, mb: 0.45 }}>금액 요약</Typography>
                  {COST_TYPES.map((type) => (
                    <Box key={type.value} sx={{ py: 0.65, borderBottom: '1px dashed #cbd5e1' }}>
                      <Typography sx={{ mb: 0.2, fontSize: '0.66rem', color: type.color, fontWeight: 900 }}>{type.label}</Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr)', columnGap: 1, alignItems: 'center' }}>
                        <Typography sx={{ fontSize: '0.68rem', color: '#475569' }}>정미</Typography>
                        <Typography sx={{ textAlign: 'right', fontSize: '0.76rem', fontWeight: 800 }}>{formatMoney(totals[type.value].net)}원</Typography>
                        <Typography sx={{ fontSize: '0.68rem', color: '#475569' }}>제출</Typography>
                        <Typography sx={{ textAlign: 'right', fontSize: '0.76rem', color: '#b91c1c', fontWeight: 900 }}>{formatMoney(totals[type.value].submitted)}원</Typography>
                      </Box>
                    </Box>
                  ))}
                  <Box sx={{ mt: 0.9, p: 1, borderRadius: 1, bgcolor: '#0f172a', color: '#fff' }}>
                    <Typography sx={{ mb: 0.35, fontSize: '0.65rem', opacity: 0.72 }}>1㎡당 총 일위대가</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr)', columnGap: 1, rowGap: 0.15, alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.68rem', opacity: 0.8 }}>정미</Typography>
                      <Typography sx={{ textAlign: 'right', fontSize: '0.78rem', fontWeight: 800 }}>{formatMoney(grandNet)}원</Typography>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 800 }}>제출</Typography>
                      <Typography sx={{ textAlign: 'right', fontSize: '0.92rem', fontWeight: 950 }}>{formatMoney(grandSubmitted)}원</Typography>
                      <Typography sx={{ mt: 0.2, pt: 0.45, borderTop: '1px solid rgba(255,255,255,0.18)', fontSize: '0.66rem', opacity: 0.8 }}>차액</Typography>
                      <Typography sx={{ mt: 0.2, pt: 0.45, borderTop: '1px solid rgba(255,255,255,0.18)', textAlign: 'right', fontSize: '0.76rem', fontWeight: 850, color: grandDifference > 0 ? '#fca5a5' : grandDifference < 0 ? '#93c5fd' : '#fff' }}>
                        {grandDifference > 0 ? '+' : ''}{formatMoney(grandDifference)}원
                      </Typography>
                      <Typography sx={{ fontSize: '0.66rem', opacity: 0.8 }}>할증률</Typography>
                      <Typography sx={{ textAlign: 'right', fontSize: '0.76rem', fontWeight: 850, color: grandMarkupRate > 0 ? '#fca5a5' : grandMarkupRate < 0 ? '#93c5fd' : '#fff' }}>
                        {grandMarkupRate > 0 ? '+' : ''}{grandMarkupRate.toFixed(2)}%
                      </Typography>
                    </Box>
                  </Box>
                </Paper>

                <Paper
                  variant="outlined"
                  sx={{ p: 1.15, minHeight: 180, bgcolor: '#f8fafc', borderColor: '#cbd5e1' }}
                >
                  <Stack spacing={0.8} sx={{ width: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 900, color: '#334155' }}>
                        기술자료
                      </Typography>
                      <Box sx={{ flex: 1 }} />
                      {technicalAnnotations.length > 0 && (
                        <Chip
                          size="small"
                          label={`지시선 ${technicalAnnotations.length}`}
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.58rem', bgcolor: '#ffffff' }}
                        />
                      )}
                      {canManageTechnicalImages && selectedSpec?.image_url && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={technicalAnnotationBusy ? <CircularProgress size={13} /> : <EditNoteRoundedIcon />}
                          disabled={technicalAnnotationBusy}
                          onClick={openTechnicalAnnotationEditor}
                          sx={{ minHeight: 24, py: 0.1, px: 0.75, fontSize: '0.6rem' }}
                        >
                          지시선 편집
                        </Button>
                      )}
                      {canManageTechnicalImages && (
                        <Chip
                          size="small"
                          label="이미지 관리"
                          variant="outlined"
                          color="primary"
                          sx={{ height: 20, fontSize: '0.58rem' }}
                        />
                      )}
                    </Box>

                    {selectedSpec?.image_url ? (
                      <>
                        <Box
                          sx={{
                            minHeight: 145,
                            display: 'grid',
                            placeItems: 'center',
                            overflow: 'hidden',
                            borderRadius: 1,
                            bgcolor: '#ffffff',
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <Tooltip title="새 창에서 크게 보기" arrow>
                            <Box
                              component="img"
                              src={selectedSpec.image_url}
                              alt={selectedSpec.detail_category || '기술자료'}
                              role="button"
                              tabIndex={0}
                              aria-label="기술자료 이미지를 새 창에서 보기"
                              onClick={openTechnicalImageWindow}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  openTechnicalImageWindow();
                                }
                              }}
                              sx={{
                                width: '100%',
                                maxHeight: 260,
                                objectFit: 'contain',
                                display: 'block',
                                cursor: 'pointer',
                                transition: 'opacity 0.15s ease, transform 0.15s ease',
                                '&:hover': {
                                  opacity: 0.92,
                                  transform: 'scale(1.01)',
                                },
                                '&:focus-visible': {
                                  outline: '2px solid #2563eb',
                                  outlineOffset: 2,
                                },
                              }}
                            />
                          </Tooltip>
                        </Box>
                        {canManageTechnicalImages && (
                          <Stack direction="row" spacing={0.6} justifyContent="flex-end">
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={technicalImageBusy ? <CircularProgress size={14} /> : <UploadFileRoundedIcon />}
                              disabled={technicalImageBusy}
                              onClick={() => technicalImageInputRef.current?.click()}
                              sx={{ fontSize: '0.64rem' }}
                            >
                              교체
                            </Button>
                            <Button
                              size="small"
                              color="error"
                              variant="outlined"
                              startIcon={<DeleteOutlineRoundedIcon />}
                              disabled={technicalImageBusy}
                              onClick={removeTechnicalImage}
                              sx={{ fontSize: '0.64rem' }}
                            >
                              삭제
                            </Button>
                          </Stack>
                        )}
                      </>
                    ) : canManageTechnicalImages ? (
                      <Button
                        variant="outlined"
                        disabled={technicalImageBusy || !selectedSpec?.image_key}
                        onClick={() => technicalImageInputRef.current?.click()}
                        sx={{
                          minHeight: 150,
                          borderStyle: 'dashed',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 0.6,
                          color: '#64748b',
                          bgcolor: '#ffffff',
                        }}
                      >
                        {technicalImageBusy ? <CircularProgress size={26} /> : <UploadFileRoundedIcon sx={{ fontSize: 34 }} />}
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 900 }}>기술자료 이미지 업로드</Typography>
                        <Typography sx={{ fontSize: '0.6rem', color: '#94a3b8' }}>PNG · JPG · WEBP / 최대 10MB</Typography>
                      </Button>
                    ) : (
                      <Stack
                        alignItems="center"
                        justifyContent="center"
                        spacing={0.55}
                        sx={{ minHeight: 150, color: '#94a3b8' }}
                      >
                        <ImageOutlinedIcon sx={{ fontSize: 38 }} />
                        <Typography sx={{ fontWeight: 800, fontSize: '0.72rem' }}>등록된 기술자료 이미지가 없습니다.</Typography>
                      </Stack>
                    )}

                    {canManageTechnicalImages && (
                      <input
                        ref={technicalImageInputRef}
                        type="file"
                        hidden
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => uploadTechnicalImage(event.target.files?.[0])}
                      />
                    )}
                  </Stack>
                </Paper>

                <FormControl size="small" fullWidth><InputLabel>출력 기준</InputLabel><Select value={printMode} label="출력 기준" onChange={(event) => setPrintMode(event.target.value)}><MenuItem value="net">정미 일위대가</MenuItem><MenuItem value="submitted">제출용 일위대가</MenuItem></Select></FormControl>
                {documentState.id && (
                  <Alert severity="info" icon={<EditNoteRoundedIcon />} sx={{ fontSize: '0.72rem' }}>
                    {documentState.latestVersionNo > documentState.versionNo
                      ? `과거 저장본 v${documentState.versionNo}을 편집 중입니다. 저장하면 v${documentState.latestVersionNo + 1}로 추가됩니다.`
                      : `최신 저장본 v${documentState.versionNo}을 편집 중입니다. 저장하면 v${documentState.versionNo + 1}로 추가됩니다.`}
                  </Alert>
                )}
              </Stack>
            </Box>
          </Box>
        )}

        {mainTab === 1 && (
          <Box sx={{ p: 1.5 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
              <TextField select size="small" label="조회범위" value={documentScope} onChange={(event) => setDocumentScope(event.target.value)} sx={{ minWidth: 170 }}>
                <MenuItem value="current">현재 현장</MenuItem><MenuItem value="all">전체 현장 공유본</MenuItem>
              </TextField>
              <TextField size="small" label="문서명·현장·규격 검색" value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} sx={{ minWidth: 300 }} />
              <Button startIcon={<RefreshRoundedIcon />} onClick={loadDocuments}>새로고침</Button>
            </Stack>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 290px)' }}>
              <Table stickyHeader size="small">
                <TableHead><TableRow>
                  {['현장', '문서명', '구분', '중분류', '세부규격', '버전', '상태', '최근 저장', '작업'].map((label) => <TableCell key={label} sx={headerCellSx}>{label}</TableCell>)}
                </TableRow></TableHead>
                <TableBody>
                  {filteredDocuments.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell sx={bodyCellSx}>{item.project_name}</TableCell><TableCell sx={{ ...bodyCellSx, fontWeight: 800 }}>{item.document_name}</TableCell><TableCell sx={bodyCellSx}>{item.major_category}</TableCell><TableCell sx={bodyCellSx}>{item.middle_category}</TableCell><TableCell sx={bodyCellSx}>{item.detail_category}</TableCell><TableCell sx={bodyCellSx}>v{item.version_no}</TableCell>
                      <TableCell sx={bodyCellSx}><Chip size="small" label={item.status === 'submitted' ? '제출본' : item.status === 'archived' ? '보관' : '작성중'} color={item.status === 'submitted' ? 'success' : 'default'} /></TableCell>
                      <TableCell sx={bodyCellSx}>{item.updated_at ? new Date(item.updated_at).toLocaleString('ko-KR') : '-'}</TableCell>
                      <TableCell sx={bodyCellSx}>
                        <Stack direction="row" spacing={0.3}>
                          <Tooltip title="불러와서 편집"><IconButton size="small" color="primary" onClick={() => loadDocument(item)}><EditNoteRoundedIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="버전 이력"><IconButton size="small" onClick={() => openRevisionHistory(item)}><HistoryRoundedIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="다른 현장으로 복사"><IconButton size="small" onClick={() => setCopyDialog({ open: true, document: item, targetProject: projectName || accessibleProjects[0] || '', documentName: `${item.document_name} 복사본` })}><ContentCopyRoundedIcon fontSize="small" /></IconButton></Tooltip>
                          {(canManage || item.project_name === projectName) && <Tooltip title="삭제"><IconButton size="small" color="error" onClick={() => deleteDocument(item)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton></Tooltip>}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredDocuments.length === 0 && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 7, color: '#64748b' }}>저장된 일위대가가 없습니다.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {mainTab === 2 && (
          <Box sx={{ p: 1.5 }}>
            {!canManage && <Alert severity="info" sx={{ mb: 1.5 }}>기준정보와 자재 단가는 조회할 수 있습니다. 수정은 자재관리 권한자 또는 최고관리자만 가능합니다.</Alert>}
            <Tabs value={managementTab} onChange={(_, value) => setManagementTab(value)} sx={{ mb: 1.5 }}>
              <Tab label={`자재 단가 (${materials.length})`} /><Tab label={`규격별 기본값 (${specs.length})`} />
            </Tabs>
            {managementTab === 0 && (
              <>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.2 }}>
                  <TextField size="small" label="자재코드·품명·규격 검색" value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} sx={{ minWidth: 320 }} />
                  <Box sx={{ flex: 1 }} />
                  {canManage && <>
                    <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => setNewMaterialDialog((previous) => ({ ...previous, open: true }))}>자재 추가</Button>
                    <Button variant="outlined" startIcon={<DownloadRoundedIcon />} onClick={downloadPriceTemplate}>단가양식</Button>
                    <Button variant="contained" startIcon={<UploadFileRoundedIcon />} onClick={() => priceUploadRef.current?.click()}>단가 일괄반영</Button>
                    <input ref={priceUploadRef} type="file" hidden accept=".xlsx,.xlsm" onChange={(event) => uploadPriceWorkbook(event.target.files?.[0])} />
                  </>}
                </Stack>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 350px)' }}>
                  <Table stickyHeader size="small"><TableHead><TableRow>
                    {['자재코드', '품명', '규격', '단위', '현재 단가', '적용일', '관리'].map((label) => <TableCell key={label} sx={headerCellSx}>{label}</TableCell>)}
                  </TableRow></TableHead><TableBody>
                    {filteredMaterials.map((item) => <TableRow key={item.id} hover><TableCell sx={bodyCellSx}>{item.item_code}</TableCell><TableCell sx={{ ...bodyCellSx, fontWeight: 700 }}>{item.item_name}</TableCell><TableCell sx={bodyCellSx}>{item.specification || '-'}</TableCell><TableCell sx={bodyCellSx}>{item.unit}</TableCell><TableCell align="right" sx={{ ...bodyCellSx, fontWeight: 900 }}>{formatMoney(item.current_unit_price)}원</TableCell><TableCell sx={bodyCellSx}>{item.effective_date || '-'}</TableCell><TableCell sx={bodyCellSx}><Button size="small" disabled={!canManage} onClick={() => openPriceDialog(item)}>단가변경·이력</Button></TableCell></TableRow>)}
                  </TableBody></Table>
                </TableContainer>
              </>
            )}
            {managementTab === 1 && (
              <>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 1.2 }}>
                  <TextField select size="small" label="기본값을 관리할 규격" value={selectedTemplateSpecId} onChange={(event) => setSelectedTemplateSpecId(event.target.value)} sx={{ minWidth: 430 }}>
                    {specs.map((item) => <MenuItem key={item.id} value={item.id}>{item.major_category} / {item.middle_category} / {item.detail_category}</MenuItem>)}
                  </TextField>
                  <Box sx={{ flex: 1 }} />
                  {canManage && <Button startIcon={<AddRoundedIcon />} onClick={() => setTemplateRows((previous) => [...previous, makeBlankRow(previous.length)])}>기본항목 추가</Button>}
                  {canManage && <Button variant="contained" startIcon={<SaveRoundedIcon />} disabled={saving} onClick={saveTemplateRows}>기본값 저장</Button>}
                </Stack>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 350px)' }}>
                  <Table stickyHeader size="small"><TableHead><TableRow>
                    {['구분', '품명', '규격', '단위', '기본 정미수량', '기준단가', '지급자재 여부', '비고', '관리'].map((label) => <TableCell key={label} align="center" sx={headerCellSx}>{label}</TableCell>)}
                  </TableRow></TableHead><TableBody>
                    {templateRows.map((row) => <TableRow key={row.clientId}>
                      <TableCell sx={bodyCellSx}><Select disabled={!canManage} size="small" value={row.costType} onChange={(event) => updateTemplateRow(row.clientId, 'costType', event.target.value)}>{ROW_COST_TYPES.map((type) => <MenuItem key={type.value} value={type.value} disabled={type.value === 'material_rounding' && templateRows.some((item) => item.clientId !== row.clientId && isRoundingMaterial(item))}>{type.label}</MenuItem>)}</Select></TableCell>
                      <TableCell sx={bodyCellSx}><TextField disabled={!canManage} size="small" value={row.itemName} onChange={(event) => updateTemplateRow(row.clientId, 'itemName', event.target.value)} /></TableCell>
                      <TableCell sx={bodyCellSx}><TextField disabled={!canManage} size="small" value={row.specification} onChange={(event) => updateTemplateRow(row.clientId, 'specification', event.target.value)} /></TableCell>
                      <TableCell sx={bodyCellSx}><TextField disabled={!canManage} size="small" value={row.unit} onChange={(event) => updateTemplateRow(row.clientId, 'unit', event.target.value)} sx={{ '& .MuiInputBase-input': { textAlign: 'center' } }} /></TableCell>
                      <TableCell sx={bodyCellSx}>{row.costType === 'labor' ? <Box onClick={(event) => canManage && openLaborCalculator(event, row, 'template')} sx={{ cursor: canManage ? 'pointer' : 'default' }}><TextField disabled={!canManage} size="small" value={`${formatQuantity(row.netQuantity)}인`} helperText="클릭해 ㎡금액 입력" inputProps={{ readOnly: true }} sx={{ pointerEvents: 'none', '& .MuiInputBase-input': { textAlign: 'right' } }} /></Box> : isRoundingMaterial(row) ? <TextField disabled size="small" value="자동" helperText="제출용만 반영" /> : <CompactNumberField disabled={!canManage} value={row.netQuantity} onChange={(value) => updateTemplateRow(row.clientId, 'netQuantity', value)} />}</TableCell>
                      <TableCell sx={bodyCellSx}><CompactMoneyField disabled={!canManage || Boolean(row.materialId)} value={row.unitPrice} onChange={(value) => updateTemplateRow(row.clientId, 'unitPrice', value)} helperText={isRoundingMaterial(row) ? '기본 가산액' : ''} /></TableCell>
                      <TableCell align="center" sx={bodyCellSx}><Checkbox disabled={!canManage || row.costType !== 'material'} size="small" checked={Boolean(row.isOwnerSupplied)} onChange={(event) => setTemplateRows((previous) => previous.map((item) => item.clientId === row.clientId ? { ...item, isOwnerSupplied: event.target.checked } : item))} /></TableCell>
                      <TableCell sx={bodyCellSx}><TextField disabled={!canManage} size="small" value={row.remarks} onChange={(event) => updateTemplateRow(row.clientId, 'remarks', event.target.value)} /></TableCell>
                      <TableCell sx={bodyCellSx}>{canManage && <IconButton color="error" size="small" onClick={() => setTemplateRows((previous) => previous.filter((item) => item.clientId !== row.clientId))}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>}</TableCell>
                    </TableRow>)}
                  </TableBody></Table>
                </TableContainer>
              </>
            )}
          </Box>
        )}
      </Paper>

      {renderPrintArea()}

      <Popover
        open={Boolean(laborCalculator.anchorEl)}
        anchorEl={laborCalculator.anchorEl}
        onClose={closeLaborCalculator}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 176, p: 0.75, mt: 0.35 } } }}
      >
        <Typography sx={{ mb: 0.45, fontSize: '0.66rem', fontWeight: 800 }}>
          1㎡당 노무비
        </Typography>
        <CompactMoneyField
          value={laborCalculator.amount}
          autoFocus
          onChange={(value) => setLaborCalculator((previous) => ({ ...previous, amount: value }))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              applyLaborCalculator();
            }
          }}
        />
        <Button
          fullWidth
          size="small"
          variant="contained"
          onClick={applyLaborCalculator}
          sx={{ minHeight: 24, mt: 0.55, py: 0.1, fontSize: '0.65rem' }}
        >
          적용
        </Button>
      </Popover>

      <Dialog
        open={nameGuideDialogOpen}
        onClose={() => setNameGuideDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>가이드 문서명으로 저장</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} sx={{ mt: 0.5 }}>
            <Typography sx={{ fontSize: '0.86rem' }}>
              문서명이 입력되지 않았습니다. 아래 가이드된 명칭으로 저장할까요?
            </Typography>
            <Alert severity="info" sx={{ fontWeight: 800 }}>
              {guidedDocumentName}
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNameGuideDialogOpen(false)}>아니오</Button>
          <Button variant="contained" disabled={saving} onClick={saveWithGuidedDocumentName}>예</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={revisionDialog.open}
        onClose={() => setRevisionDialog((previous) => ({ ...previous, open: false }))}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          일위대가 버전 이력
          {revisionDialog.document?.document_name ? ` · ${revisionDialog.document.document_name}` : ''}
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 1.2, mt: 0.5, fontSize: '0.76rem' }}>
            각 버전의 저장 당시 내용은 그대로 보존됩니다. 과거 버전을 불러와 저장해도 기존 버전은 바뀌지 않고 새로운 최신 버전으로 추가됩니다.
          </Alert>
          {revisionDialog.loading ? (
            <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
              <Table stickyHeader size="small">
                <TableHead><TableRow>
                  <TableCell align="center" sx={headerCellSx}>버전</TableCell>
                  <TableCell sx={headerCellSx}>저장 문서명</TableCell>
                  <TableCell sx={headerCellSx}>저장일시</TableCell>
                  <TableCell align="center" sx={headerCellSx}>구분</TableCell>
                  <TableCell align="center" sx={headerCellSx}>작업</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {revisionDialog.revisions.map((revision) => {
                    const isLatest = toNumber(revision.version_no) === toNumber(revisionDialog.document?.version_no);
                    return (
                      <TableRow key={revision.id} hover>
                        <TableCell align="center" sx={{ ...bodyCellSx, fontWeight: 900 }}>v{revision.version_no}</TableCell>
                        <TableCell sx={bodyCellSx}>{revision.snapshot?.document?.document_name || revisionDialog.document?.document_name || '-'}</TableCell>
                        <TableCell sx={bodyCellSx}>{revision.created_at ? new Date(revision.created_at).toLocaleString('ko-KR') : '-'}</TableCell>
                        <TableCell align="center" sx={bodyCellSx}>{isLatest ? <Chip size="small" color="primary" label="최신" /> : <Chip size="small" label="과거" />}</TableCell>
                        <TableCell align="center" sx={bodyCellSx}>
                          <Button size="small" variant={isLatest ? 'contained' : 'outlined'} onClick={() => loadDocumentRevision(revisionDialog.document, revision)}>불러오기</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {revisionDialog.revisions.length === 0 && (
                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6, color: '#64748b' }}>저장된 버전 이력이 없습니다.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setRevisionDialog((previous) => ({ ...previous, open: false }))}>닫기</Button></DialogActions>
      </Dialog>

      <Dialog open={copyDialog.open} onClose={() => setCopyDialog((previous) => ({ ...previous, open: false }))} fullWidth maxWidth="sm">
        <DialogTitle>일위대가를 다른 현장으로 복사</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select label="대상 현장" value={copyDialog.targetProject} onChange={(event) => setCopyDialog((previous) => ({ ...previous, targetProject: event.target.value }))}>{accessibleProjects.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>
          <TextField label="복사본 문서명" value={copyDialog.documentName} onChange={(event) => setCopyDialog((previous) => ({ ...previous, documentName: event.target.value }))} />
          <Alert severity="info">원본은 변경되지 않으며, 선택한 현장에 새 작성중 문서로 복사됩니다.</Alert>
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setCopyDialog((previous) => ({ ...previous, open: false }))}>취소</Button><Button variant="contained" disabled={saving} onClick={copyDocumentToProject}>복사</Button></DialogActions>
      </Dialog>

      <Dialog open={priceDialog.open} onClose={() => setPriceDialog((previous) => ({ ...previous, open: false }))} fullWidth maxWidth="md">
        <DialogTitle>자재 단가 변경 및 이력</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Alert severity="info">{priceDialog.material?.item_name} / {priceDialog.material?.specification || '규격 없음'} / {priceDialog.material?.unit}</Alert>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField type="number" fullWidth label="변경 단가" value={priceDialog.price} onChange={(event) => setPriceDialog((previous) => ({ ...previous, price: event.target.value }))} />
              <TextField type="date" fullWidth label="적용일" value={priceDialog.effectiveDate} InputLabelProps={{ shrink: true }} onChange={(event) => setPriceDialog((previous) => ({ ...previous, effectiveDate: event.target.value }))} />
              <TextField fullWidth label="변경 사유" value={priceDialog.note} onChange={(event) => setPriceDialog((previous) => ({ ...previous, note: event.target.value }))} />
            </Stack>
            <Divider />
            <Typography sx={{ fontWeight: 900 }}>최근 변경 이력</Typography>
            {priceDialog.historyLoading ? <CircularProgress size={22} /> : <Table size="small"><TableHead><TableRow><TableCell>적용일</TableCell><TableCell align="right">이전단가</TableCell><TableCell align="right">변경단가</TableCell><TableCell>사유</TableCell></TableRow></TableHead><TableBody>{priceDialog.history.map((item) => <TableRow key={item.id}><TableCell>{item.effective_date}</TableCell><TableCell align="right">{formatMoney(item.old_unit_price)}</TableCell><TableCell align="right">{formatMoney(item.new_unit_price)}</TableCell><TableCell>{item.note || '-'}</TableCell></TableRow>)}</TableBody></Table>}
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setPriceDialog((previous) => ({ ...previous, open: false }))}>취소</Button><Button variant="contained" disabled={saving} onClick={saveSinglePrice}>단가 저장</Button></DialogActions>
      </Dialog>

      <Dialog open={newMaterialDialog.open} onClose={() => setNewMaterialDialog((previous) => ({ ...previous, open: false }))} fullWidth maxWidth="sm">
        <DialogTitle>새 자재 등록</DialogTitle>
        <DialogContent><Stack spacing={1.5} sx={{ mt: 1 }}>
          <TextField label="품명" value={newMaterialDialog.itemName} onChange={(event) => setNewMaterialDialog((previous) => ({ ...previous, itemName: event.target.value }))} />
          <TextField label="규격" value={newMaterialDialog.specification} onChange={(event) => setNewMaterialDialog((previous) => ({ ...previous, specification: event.target.value }))} />
          <Stack direction="row" spacing={1}><TextField label="단위" value={newMaterialDialog.unit} onChange={(event) => setNewMaterialDialog((previous) => ({ ...previous, unit: event.target.value }))} /><TextField type="number" label="현재 단가" value={newMaterialDialog.price} onChange={(event) => setNewMaterialDialog((previous) => ({ ...previous, price: event.target.value }))} /><TextField type="date" label="적용일" value={newMaterialDialog.effectiveDate} InputLabelProps={{ shrink: true }} onChange={(event) => setNewMaterialDialog((previous) => ({ ...previous, effectiveDate: event.target.value }))} /></Stack>
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setNewMaterialDialog((previous) => ({ ...previous, open: false }))}>취소</Button><Button variant="contained" disabled={saving} onClick={addNewMaterial}>등록</Button></DialogActions>
      </Dialog>

      <Dialog open={materialPicker.open} onClose={() => setMaterialPicker((previous) => ({ ...previous, open: false }))} fullWidth maxWidth="md">
        <DialogTitle>자재 마스터에서 항목 추가</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="품명·규격·자재코드 검색"
            value={materialPicker.search}
            onChange={(event) => setMaterialPicker((previous) => ({ ...previous, search: event.target.value }))}
            sx={{ my: 1 }}
          />
          <TableContainer sx={{ height: 460, minHeight: 460, maxHeight: 460 }}>
            <Table stickyHeader size="small">
              <TableHead><TableRow><TableCell sx={headerCellSx}>품명</TableCell><TableCell sx={headerCellSx}>규격</TableCell><TableCell sx={headerCellSx}>단위</TableCell><TableCell sx={headerCellSx}>현재단가</TableCell><TableCell sx={headerCellSx} /></TableRow></TableHead>
              <TableBody>
                {pickerMaterials.map((item) => <TableRow key={item.id} hover><TableCell sx={bodyCellSx}>{item.item_name}</TableCell><TableCell sx={bodyCellSx}>{item.specification || '-'}</TableCell><TableCell sx={bodyCellSx}>{item.unit}</TableCell><TableCell align="right" sx={bodyCellSx}>{formatMoney(item.current_unit_price)}원</TableCell><TableCell sx={bodyCellSx}><Button size="small" onClick={() => addMaterialToDraft(item)}>추가</Button></TableCell></TableRow>)}
                {pickerMaterials.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ border: 0, py: 8, color: '#64748b', fontSize: '0.76rem' }}>
                      검색어가 포함된 자재가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions><Button onClick={() => setMaterialPicker((previous) => ({ ...previous, open: false }))}>닫기</Button></DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={4200} onClose={() => setToast((previous) => ({ ...previous, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast((previous) => ({ ...previous, open: false }))}>{toast.message}</Alert>
      </Snackbar>
    </Box>
  );
}
