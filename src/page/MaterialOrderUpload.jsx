// v52.48.5.44.153 발주 품명 표시순서 연동·Enter 품목행 추가
// v52.48.5.44.152 현장 자재 ID 자동연결·직접입력 누계·발주확정
// v52.48.5.44.151 자재발주서 Excel 다운로드·결재요청 대기 처리
// v52.48.5.44.145 상단 발주탭 제거·새 발주서 버튼 이동
// v52.48.5.44.144 발주 기본정보 영역 회색배경·입력칸 높이 축소
// v52.48.5.44.143 발주작성·목록 위치교체 및 입력상태 배경 구분
// v52.48.5.44.142 공정 선택상자 크기·목록 동작 통일
// v52.48.5.44.141 발주 기본정보 라벨·선택목록 위치 통일
// v52.48.5.44.140 발주 기본설정 단순화·배율별 품목목록 위치 보정
// v52.48.5.44.139 발주서 장부형 배치·자재마스터 관리영역 분리
// v52.48.5.44.138 발주 품목 표 눈금선·수량 천 단위 쉼표
// v52.48.5.44.137 자재 품명 검색 시 현장 기본·주요자재 우선정렬
// v52.48.5.44.136 자재 품명 검색결과 숫자 자연정렬
// v52.48.5.44.135 발주 품목 체크박스 정렬·기본 주요자재 우선목록
// v52.48.5.44.134 자재마스터 명시적 삭제·표시순서 변경
// v52.48.5.44.133 자재마스터 Excel 다운로드·갱신 업로드
// v52.48.5.44.132 발주 품목 행도구 위치 조정·빈 행 추가 오류 수정
// v52.48.5.44.131 엑셀형 발주 품목 직접입력·자재마스터 힌트·키보드 이동
// v52.48.5.44.129 기본설정 닫기 복원·주기적 입력폼 재조회 방지
// v52.48.5.44.128 자재마스터 연속등록 보호·기본설정 표시순서 안내
// v52.48.5.44.127 자재발주 테스트 초기화 (발주서·기본설정)
// v52.48.5.44.126 자재발주 상단 탭 밑줄 화면배율 독립 정렬
// v52.48.5.44.125 기본설정 탭 밑줄 화면배율 독립 정렬
// v52.48.5.44.124 기본설정 탭 이중 하단선 제거
// v52.48.5.44.123 기본설정 탭 밑줄 정렬
// v52.48.5.44.122 자재발주 기본설정·주요자재 실행물량·변경이력
// v52.48.5.44.121 납품희망일 라벨 상단 고정
// v52.48.5.44.120 자재발주작성 1차 - 사급자재 표준화·자재마스터·발주작성
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
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import CategoryRoundedIcon from '@mui/icons-material/CategoryRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import PlaylistAddRoundedIcon from '@mui/icons-material/PlaylistAddRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { supabase } from '../supabaseClient';
import {
  parseMaterialMasterWorkbookFile,
  saveMaterialMasterWorkbook,
} from '../utils/materialMasterExcel.js';
import { saveMaterialOrderWorkbook } from '../utils/materialOrderExcel.js';
import ScaleAwareAutocompletePopper from '../components/ScaleAwareAutocompletePopper.jsx';

const PROCESS_OPTIONS = [
  '경량벽체',
  '단열',
  '합지',
  '세대천정',
  '공용부천정',
  '몰딩',
  '걸레받이',
  '수장',
  '안전',
  '가설',
  '기타',
];
const PROCESS_FOLDER_CATEGORY_NAME = '각 공정자재';
const REMOVED_CATEGORY_NAMES = new Set(['각 공정 잡자재']);
const PROCESS_FOLDER_OPTIONS = PROCESS_OPTIONS.filter(
  (processName) => !['안전', '가설', '기타'].includes(processName),
);

const ORDER_STATUS_LABELS = {
  draft: '작성중',
  ordered: '발주확정',
  confirmed: '결재요청',
  cancelled: '취소',
};

const EMPTY_ORDER = {
  id: '',
  orderNo: '',
  orderDate: '',
  requesterName: '',
  deliveryDate: '',
  deliveryLocation: '',
  receiverName: '',
  receiverPhone: '',
  categoryId: '',
  processName: '',
  note: '',
  status: 'draft',
};

const EMPTY_MASTER = {
  id: '',
  categoryId: '',
  processName: '',
  standardName: '',
  specification: '',
  unit: '',
  manufacturer: '',
  aliasesText: '',
  note: '',
  isActive: true,
  isMainMaterial: false,
  mainSortOrder: 100,
};

const EMPTY_PROJECT_SETTINGS = {
  requesterName: '',
  receiverName: '',
  receiverPhone: '',
  deliveryLocation: '',
};

const ORDER_GRID_FIELDS = [
  'standardName',
  'specification',
  'unit',
  'currentQuantity',
  'note',
];

const createOrderItemKey = () =>
  `order-item-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createBlankOrderItem = (clientKey = createOrderItemKey()) => ({
  id: '',
  clientKey,
  projectMaterialId: '',
  materialId: '',
  masterStandardName: '',
  categoryId: '',
  processName: '',
  standardName: '',
  specification: '',
  unit: '',
  executionQuantity: 0,
  previousQuantity: 0,
  currentQuantity: '',
  cumulativeQuantity: 0,
  executionRatio: 0,
  note: '',
});

const normalizeText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const normalizeMaterialIdentityPart = (value) =>
  normalizeText(value).toLocaleLowerCase('ko-KR');
const buildProjectMaterialIdentityKey = ({
  category_id: categoryId,
  categoryId: camelCategoryId,
  process_name: processName,
  processName: camelProcessName,
  standard_name: standardName,
  standardName: camelStandardName,
  specification,
  unit,
}) => [
  categoryId || camelCategoryId || '',
  normalizeMaterialIdentityPart(processName || camelProcessName),
  normalizeMaterialIdentityPart(standardName || camelStandardName),
  normalizeMaterialIdentityPart(specification),
  normalizeMaterialIdentityPart(unit),
].join('|');
const entryFieldSx = (value, required = true) => ({
  '& .MuiOutlinedInput-root': {
    bgcolor: !required || normalizeText(value) ? '#ffffff' : '#fff8d6',
  },
  '& .MuiInputBase-input': {
    fontSize: '0.68rem',
  },
});
const compactEntryFieldSx = (value, required = true) => ({
  '& .MuiOutlinedInput-root': {
    minHeight: 28,
    height: 28,
    bgcolor: !required || normalizeText(value) ? '#ffffff' : '#fff8d6',
  },
  '& .MuiInputBase-input, & .MuiSelect-select': {
    py: '3px !important',
    fontSize: '0.72rem',
  },
  '& .MuiInputLabel-root': {
    fontSize: '0.68rem',
  },
});
const compactSelectFieldSx = (value, disabled = false) => ({
  position: 'relative',
  minWidth: 0,
  height: 28,
  border: '1px solid rgba(0, 0, 0, 0.23)',
  borderRadius: 1,
  bgcolor: normalizeText(value) ? '#ffffff' : '#fff8d6',
  opacity: disabled ? 0.6 : 1,
  '&:hover': disabled ? {} : { borderColor: 'rgba(0, 0, 0, 0.87)' },
  '&:focus-within': disabled
    ? {}
    : { borderColor: '#1976d2', boxShadow: '0 0 0 1px #1976d2' },
  '& > label': {
    position: 'absolute',
    zIndex: 1,
    top: -7,
    left: 9,
    px: 0.35,
    bgcolor: '#eef1f4',
    color: 'rgba(0, 0, 0, 0.6)',
    fontSize: '0.58rem',
    lineHeight: 1.2,
    pointerEvents: 'none',
  },
  '& > select': {
    width: '100%',
    height: '100%',
    border: 0,
    outline: 0,
    bgcolor: 'transparent',
    color: 'inherit',
    px: 1.1,
    font: 'inherit',
    fontSize: '0.72rem',
    cursor: disabled ? 'default' : 'pointer',
  },
});
const numberValue = (value) => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const recalculateOrderItemBalances = (items) => {
  const linkedGroups = new Map();

  (items || []).forEach((row) => {
    const groupKey = row.projectMaterialId || (row.materialId ? `master:${row.materialId}` : '');
    if (!groupKey) return;
    const current = linkedGroups.get(groupKey) || {
      execution: 0,
      previous: 0,
      current: 0,
    };
    current.execution = Math.max(
      current.execution,
      numberValue(row.executionQuantity),
    );
    current.previous = Math.max(
      current.previous,
      numberValue(row.previousQuantity),
    );
    current.current += numberValue(row.currentQuantity);
    linkedGroups.set(groupKey, current);
  });

  return (items || []).map((row) => {
    const groupKey = row.projectMaterialId || (row.materialId ? `master:${row.materialId}` : '');
    if (!groupKey) {
      return {
        ...row,
        cumulativeQuantity: numberValue(row.currentQuantity),
        executionRatio: 0,
      };
    }

    const group = linkedGroups.get(groupKey);
    const cumulative = group.previous + group.current;
    return {
      ...row,
      executionQuantity: group.execution,
      previousQuantity: group.previous,
      cumulativeQuantity: cumulative,
      executionRatio:
        group.execution > 0 ? (cumulative / group.execution) * 100 : 0,
    };
  });
};
const isProjectSettingsComplete = (form) =>
  [
    form?.requesterName,
    form?.receiverName,
    form?.receiverPhone,
    form?.deliveryLocation,
  ].every((value) => normalizeText(value));
const formatNumber = (value, digits = 2) => {
  const number = Number(value || 0);
  return number.toLocaleString('ko-KR', {
    maximumFractionDigits: digits,
  });
};
const getKoreaToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const getProfileName = (profile) =>
  normalizeText(
    profile?.name ||
      profile?.full_name ||
      profile?.display_name ||
      profile?.user_name ||
      '',
  );

const getProfileId = (profile) =>
  normalizeText(profile?.id || profile?.user_id || profile?.auth_id || '');

const isSuperAdminProfile = (profile) => {
  if (profile?.is_super_admin === true || profile?.isSuperAdmin === true) {
    return true;
  }

  return [
    profile?.role,
    profile?.user_role,
    profile?.userRole,
    profile?.permission,
    profile?.authority,
    profile?.access_level,
  ].some((value) => {
    const normalized = normalizeText(value).replace(/\s+/g, '').toLowerCase();
    return (
      normalized.includes('최고관리자') ||
      normalized.includes('superadmin') ||
      normalized.includes('masteradmin')
    );
  });
};

const buildSearchText = (master) =>
  [
    master.standardName,
    master.specification,
    master.manufacturer,
    master.processName,
    master.aliasesText,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');

const buildOrderMaterialSearchText = (material) =>
  [
    material?.standard_name,
    material?.specification,
    material?.unit,
    material?.manufacturer,
    material?.process_name,
    ...(Array.isArray(material?.aliases) ? material.aliases : []),
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ko-KR');

const materialNameCollator = new Intl.Collator('ko-KR', {
  numeric: true,
  sensitivity: 'base',
});

const filterOrderMaterialOptions = (options, state) => {
  const compareDisplayOrder = (first, second) =>
    (Number(first.display_order) || 1000) -
    (Number(second.display_order) || 1000);
  const keyword = normalizeText(state.inputValue).toLocaleLowerCase('ko-KR');
  if (!keyword) {
    return options
      .filter((option) => option.is_main_material === true)
      .sort(
        (first, second) =>
          (Number(first.main_sort_order) || 100) -
            (Number(second.main_sort_order) || 100) ||
          compareDisplayOrder(first, second) ||
          materialNameCollator.compare(
            normalizeText(first.standard_name),
            normalizeText(second.standard_name),
          ),
      );
  }

  const keywords = keyword.split(' ').filter(Boolean);
  return options
    .filter((option) => {
      const searchText = option.orderSearchText || buildOrderMaterialSearchText(option);
      return keywords.every((word) => searchText.includes(word));
    })
    .sort((first, second) => {
      const firstName = normalizeText(first.standard_name).toLocaleLowerCase('ko-KR');
      const secondName = normalizeText(second.standard_name).toLocaleLowerCase('ko-KR');
      const score = (name) =>
        name === keyword ? 0 : name.startsWith(keyword) ? 1 : name.includes(keyword) ? 2 : 3;
      return (
        score(firstName) - score(secondName) ||
        Number(second.isProjectMaterial === true) -
          Number(first.isProjectMaterial === true) ||
        Number(second.is_main_material === true) -
          Number(first.is_main_material === true) ||
        (Number(first.main_sort_order) || 100) -
          (Number(second.main_sort_order) || 100) ||
        compareDisplayOrder(first, second) ||
        materialNameCollator.compare(firstName, secondName)
      );
    });
};

const categoryNameById = (categories, id) =>
  categories.find((row) => row.id === id)?.name || '-';

const buildDefaultCategoryFolders = (categories) => {
  const processCategory = categories.find(
    (row) => row.name === PROCESS_FOLDER_CATEGORY_NAME,
  );
  if (!processCategory) return [];
  return PROCESS_FOLDER_OPTIONS.map((name, index) => ({
    id: `default-${processCategory.id}-${name}`,
    category_id: processCategory.id,
    name,
    sort_order: (index + 1) * 10,
    is_active: true,
  }));
};

export default function MaterialOrderUpload({
  projectName,
  userProfile,
  canManageMaster = false,
  pageMode = 'order',
}) {
  const [mainTab, setMainTab] = useState(
    pageMode === 'master' ? 'master' : 'order',
  );
  const [supplyTab, setSupplyTab] = useState('private');
  const [categories, setCategories] = useState([]);
  const [categoryFolders, setCategoryFolders] = useState([]);
  const [categoryFolderSchemaMissing, setCategoryFolderSchemaMissing] = useState(false);
  const [selectedOrderFolderId, setSelectedOrderFolderId] = useState('');
  const [selectedOrderFolderProcess, setSelectedOrderFolderProcess] = useState('');
  const [processFoldersOpen, setProcessFoldersOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [masterRows, setMasterRows] = useState([]);
  const [masterSearch, setMasterSearch] = useState('');
  const [masterCategoryId, setMasterCategoryId] = useState('');
  const [loading, setLoading] = useState(false);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterExcelBusy, setMasterExcelBusy] = useState(false);
  const [orderExcelBusy, setOrderExcelBusy] = useState(false);
  const [masterActionBusy, setMasterActionBusy] = useState(false);
  const [selectedMasterIds, setSelectedMasterIds] = useState(
    () => new Set(),
  );
  const [saving, setSaving] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [toast, setToast] = useState(null);
  const [order, setOrder] = useState({
    ...EMPTY_ORDER,
    orderDate: getKoreaToday(),
    requesterName: getProfileName(userProfile),
  });
  const [orderItems, setOrderItems] = useState([]);
  const [selectedOrderItemKeys, setSelectedOrderItemKeys] = useState(
    () => new Set(),
  );
  const [orderMaterialOptions, setOrderMaterialOptions] = useState([]);
  const [orderMaterialOptionsLoading, setOrderMaterialOptionsLoading] = useState(false);
  const [openMaterialHintKey, setOpenMaterialHintKey] = useState('');
  const orderItemInputRefs = useRef(new Map());
  const masterExcelInputRef = useRef(null);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [materialPickerSearch, setMaterialPickerSearch] = useState('');
  const [materialPickerRows, setMaterialPickerRows] = useState([]);
  const [materialPickerLoading, setMaterialPickerLoading] = useState(false);
  const [masterDialogOpen, setMasterDialogOpen] = useState(false);
  const [masterForm, setMasterForm] = useState(EMPTY_MASTER);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderParentCategoryId, setFolderParentCategoryId] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [folderDeletingId, setFolderDeletingId] = useState('');
  const [materialPickerPurpose, setMaterialPickerPurpose] = useState('order');
  const [projectSettings, setProjectSettings] = useState(null);
  const [settingsForm, setSettingsForm] = useState({
    ...EMPTY_PROJECT_SETTINGS,
    requesterName: getProfileName(userProfile),
  });
  const [settingsMaterials, setSettingsMaterials] = useState([]);
  const [settingsHistory, setSettingsHistory] = useState([]);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('basic');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsRequired, setSettingsRequired] = useState(true);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  const currentUserId = getProfileId(userProfile);
  const currentUserName = getProfileName(userProfile);
  const isSuperAdmin = isSuperAdminProfile(userProfile);
  const isLocked = ['ordered', 'confirmed', 'cancelled'].includes(order.status);

  const notify = useCallback((severity, text) => {
    setToast({ severity, text });
  }, []);

  const handleSchemaError = useCallback(
    (error) => {
      if (error?.code === '42P01' || String(error?.message || '').includes('does not exist')) {
        setSchemaMissing(true);
        notify('error', '자재발주 DB 구조가 아직 적용되지 않았습니다. 제공된 Supabase SQL을 먼저 실행해주세요.');
        return true;
      }
      return false;
    },
    [notify],
  );

  const loadCategories = useCallback(async () => {
    if (!projectName) return;
    const { data, error } = await supabase
      .from('material_supply_categories')
      .select('id, name, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      if (!handleSchemaError(error)) notify('error', `자재분류 조회 실패: ${error.message}`);
      return;
    }

    const nextCategories = (data || []).filter(
      (row) => !REMOVED_CATEGORY_NAMES.has(row.name),
    );
    const firstCategoryId = nextCategories[0]?.id || '';
    setCategories(nextCategories);

    const { data: folderData, error: folderError } = await supabase
      .from('material_supply_category_folders')
      .select('id, category_id, name, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (folderError) {
      const folderErrorMessage = String(folderError.message || '');
      const folderTableMissing =
        folderError.code === '42P01' ||
        folderError.code === 'PGRST205' ||
        folderErrorMessage.includes('does not exist') ||
        folderErrorMessage.includes('Could not find the table') ||
        folderErrorMessage.includes('schema cache');
      setCategoryFolderSchemaMissing(folderTableMissing);
      setCategoryFolders(buildDefaultCategoryFolders(nextCategories));
      if (!folderTableMissing) {
        notify('error', `하위 폴더 조회 실패: ${folderError.message}`);
      }
    } else {
      setCategoryFolderSchemaMissing(false);
      setCategoryFolders(folderData || []);
    }

    setSelectedOrderFolderId((current) => (
      nextCategories.some((row) => row.id === current) ? current : firstCategoryId
    ));
    if (pageMode === 'order' && firstCategoryId) {
      setOrder((current) => (
        current.categoryId
          ? current
          : {
              ...current,
              categoryId: firstCategoryId,
              processName: current.processName,
            }
      ));
    }
  }, [handleSchemaError, notify, pageMode, projectName]);

  const loadOrders = useCallback(async () => {
    if (!projectName) return;
    const { data, error } = await supabase
      .from('material_supply_orders')
      .select('*')
      .eq('project_name', projectName)
      .order('order_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(150);

    if (error) {
      if (!handleSchemaError(error)) notify('error', `발주서 목록 조회 실패: ${error.message}`);
      return;
    }

    setOrders(data || []);
  }, [handleSchemaError, notify, projectName]);


  const loadProjectSettings = useCallback(async ({ openWhenIncomplete = true } = {}) => {
    if (!projectName) return;
    setSettingsLoading(true);

    try {
      const [
        settingsResult,
        defaultMaterialsResult,
        projectMaterialsResult,
        historyResult,
      ] = await Promise.all([
        supabase
          .from('material_order_project_settings')
          .select('*')
          .eq('project_name', projectName)
          .maybeSingle(),
        supabase
          .from('material_master_items')
          .select('id, category_id, process_name, standard_name, specification, unit, manufacturer, aliases, is_main_material, main_sort_order')
          .eq('is_active', true)
          .eq('is_main_material', true)
          .order('process_name', { ascending: true })
          .order('main_sort_order', { ascending: true })
          .order('standard_name', { ascending: true }),
        supabase
          .from('material_project_materials')
          .select('material_id, execution_quantity, note, is_main_material, is_excluded, sort_order')
          .eq('project_name', projectName)
          .eq('is_main_material', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('material_order_setting_history')
          .select('id, basic_defaults, material_snapshot, changed_by, changed_at, change_note')
          .eq('project_name', projectName)
          .order('changed_at', { ascending: false })
          .limit(50),
      ]);

      for (const result of [
        settingsResult,
        defaultMaterialsResult,
        projectMaterialsResult,
        historyResult,
      ]) {
        if (result.error) throw result.error;
      }

      const settingsRow = settingsResult.data || null;
      const defaultMaterials = defaultMaterialsResult.data || [];
      const projectRows = projectMaterialsResult.data || [];
      const projectRowMap = new Map(
        projectRows.map((row) => [row.material_id, row]),
      );
      const defaultMap = new Map(
        defaultMaterials.map((row) => [row.id, row]),
      );

      const manualIds = projectRows
        .map((row) => row.material_id)
        .filter((id) => id && !defaultMap.has(id));

      let manualMaterials = [];
      if (manualIds.length > 0) {
        const { data, error } = await supabase
          .from('material_master_items')
          .select('id, category_id, process_name, standard_name, specification, unit, manufacturer, aliases, is_main_material, main_sort_order')
          .in('id', manualIds)
          .eq('is_active', true);
        if (error) throw error;
        manualMaterials = data || [];
      }

      const mergedMaterials = [
        ...defaultMaterials.map((material) => {
          const projectRow = projectRowMap.get(material.id);
          return {
            materialId: material.id,
            categoryId: material.category_id || '',
            processName: material.process_name || '',
            standardName: material.standard_name,
            specification: material.specification || '',
            unit: material.unit || '',
            manufacturer: material.manufacturer || '',
            aliases: material.aliases || [],
            included: projectRow ? projectRow.is_excluded !== true : true,
            executionQuantity: numberValue(projectRow?.execution_quantity),
            note: projectRow?.note || '',
            sortOrder:
              Number(projectRow?.sort_order) ||
              Number(material.main_sort_order) ||
              100,
            source: 'default',
          };
        }),
        ...manualMaterials.map((material) => {
          const projectRow = projectRowMap.get(material.id);
          return {
            materialId: material.id,
            categoryId: material.category_id || '',
            processName: material.process_name || '',
            standardName: material.standard_name,
            specification: material.specification || '',
            unit: material.unit || '',
            manufacturer: material.manufacturer || '',
            aliases: material.aliases || [],
            included: projectRow?.is_excluded !== true,
            executionQuantity: numberValue(projectRow?.execution_quantity),
            note: projectRow?.note || '',
            sortOrder:
              Number(projectRow?.sort_order) ||
              Number(material.main_sort_order) ||
              100,
            source: 'manual',
          };
        }),
      ].sort((a, b) => {
        const processCompare = String(a.processName || '').localeCompare(
          String(b.processName || ''),
          'ko',
        );
        if (processCompare !== 0) return processCompare;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return String(a.standardName || '').localeCompare(
          String(b.standardName || ''),
          'ko',
        );
      });

      const nextForm = {
        requesterName:
          settingsRow?.default_requester_name ||
          currentUserName,
        receiverName: settingsRow?.default_receiver_name || '',
        receiverPhone: settingsRow?.default_receiver_phone || '',
        deliveryLocation: settingsRow?.default_delivery_location || '',
      };

      const complete = isProjectSettingsComplete(nextForm);

      setProjectSettings(settingsRow);
      setSettingsForm(nextForm);
      setSettingsMaterials(mergedMaterials);
      setSettingsHistory(historyResult.data || []);
      setSettingsRequired(!complete);

      if (!complete && openWhenIncomplete) {
        setSettingsTab('basic');
        setSettingsDialogOpen(true);
      }

      setOrder((current) => {
        if (current.id) return current;
        return {
          ...current,
          requesterName:
            current.requesterName ||
            nextForm.requesterName ||
            currentUserName,
          receiverName: current.receiverName || nextForm.receiverName,
          receiverPhone: current.receiverPhone || nextForm.receiverPhone,
          deliveryLocation:
            current.deliveryLocation || nextForm.deliveryLocation,
        };
      });
    } catch (error) {
      if (!handleSchemaError(error)) {
        notify(
          'error',
          `자재발주 기본설정 조회 실패: ${error.message}`,
        );
      }
    } finally {
      setSettingsLoading(false);
    }
  }, [
    handleSchemaError,
    currentUserName,
    notify,
    projectName,
  ]);

  const loadMasterRows = useCallback(async () => {
    if (!projectName) return;
    setMasterLoading(true);
    try {
      const keyword = normalizeText(masterSearch);
      const pageSize = 500;
      const rows = [];

      for (let start = 0; ; start += pageSize) {
        let query = supabase
          .from('material_master_items')
          .select('id, category_id, process_name, standard_name, specification, unit, manufacturer, aliases, note, is_active, is_main_material, main_sort_order, display_order, updated_at')
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .order('standard_name', { ascending: true })
          .range(start, start + pageSize - 1);

        if (masterCategoryId) {
          query = query.eq('category_id', masterCategoryId);
        }
        if (keyword) {
          query = query.ilike('search_text', `%${keyword}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        const page = data || [];
        rows.push(...page);
        if (page.length < pageSize) break;
      }

      setMasterRows(rows);
      setSelectedMasterIds(new Set());
    } catch (error) {
      if (!handleSchemaError(error)) {
        notify(
          'error',
          error.code === '42703'
            ? 'v134 Supabase SQL을 먼저 실행해주세요.'
            : `자재 마스터 조회 실패: ${error.message}`,
        );
      }
    } finally {
      setMasterLoading(false);
    }
  }, [
    handleSchemaError,
    masterCategoryId,
    masterSearch,
    notify,
    projectName,
  ]);

  const loadAllMasterRowsForExcel = useCallback(async () => {
    const pageSize = 500;
    const rows = [];

    for (let start = 0; ; start += pageSize) {
      const { data, error } = await supabase
        .from('material_master_items')
        .select('id, category_id, process_name, standard_name, specification, unit, manufacturer, aliases, note, is_active, is_main_material, main_sort_order, display_order, updated_at')
        .order('display_order', { ascending: true })
        .order('standard_name', { ascending: true })
        .range(start, start + pageSize - 1);

      if (error) throw error;
      const page = data || [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }

    return rows;
  }, []);

  const downloadMaterialMasterExcel = async () => {
    if (!canManageMaster) {
      notify('warning', '자재 마스터 관리 권한이 없습니다.');
      return;
    }
    if (categories.length === 0) {
      notify('warning', '자재분류를 먼저 등록해주세요.');
      return;
    }

    setMasterExcelBusy(true);
    try {
      const materials = await loadAllMasterRowsForExcel();
      await saveMaterialMasterWorkbook({ materials, categories });
      notify(
        'success',
        materials.length > 0
          ? `자재마스터 ${materials.length.toLocaleString()}건을 Excel로 내려받았습니다.`
          : '빈 자재마스터 Excel 양식을 내려받았습니다.',
      );
    } catch (error) {
      if (!handleSchemaError(error)) {
        notify('error', `자재마스터 Excel 다운로드 실패: ${error.message}`);
      }
    } finally {
      setMasterExcelBusy(false);
    }
  };

  const uploadMaterialMasterExcel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!canManageMaster) {
      notify('warning', '자재 마스터 관리 권한이 없습니다.');
      return;
    }

    setMasterExcelBusy(true);
    try {
      const parsed = await parseMaterialMasterWorkbookFile({ file, categories });
      const existingIds = parsed.rows.map((row) => row.id).filter(Boolean);
      const knownIds = new Set();

      for (let start = 0; start < existingIds.length; start += 200) {
        const ids = existingIds.slice(start, start + 200);
        const { data, error } = await supabase
          .from('material_master_items')
          .select('id')
          .in('id', ids);
        if (error) throw error;
        (data || []).forEach((row) => knownIds.add(row.id));
      }

      const unknownRow = parsed.rows.find((row) => row.id && !knownIds.has(row.id));
      if (unknownRow) {
        throw new Error(
          `${unknownRow.rowNumber}행 관리ID는 현재 자재마스터에 없습니다. 신규 자재라면 관리ID를 지워주세요.`,
        );
      }

      const confirmed = window.confirm(
        `자재마스터 ${parsed.rows.length.toLocaleString()}건을 반영할까요?\n\n`
        + `기존 자료 수정: ${parsed.updateCount.toLocaleString()}건\n`
        + `신규 자료 등록: ${parsed.insertCount.toLocaleString()}건\n`
        + `사용중지 설정: ${parsed.inactiveCount.toLocaleString()}건\n\n`
        + 'Excel에 없는 기존 자재는 삭제되지 않습니다.',
      );
      if (!confirmed) return;

      const importRows = parsed.rows.map((row) => ({
        id: row.id || null,
        category_id: row.categoryId,
        process_name: normalizeText(row.processName) || null,
        standard_name: normalizeText(row.standardName),
        specification: normalizeText(row.specification) || null,
        unit: normalizeText(row.unit) || null,
        manufacturer: normalizeText(row.manufacturer) || null,
        aliases: row.aliases,
        note: normalizeText(row.note) || null,
        is_active: row.isActive,
        is_main_material: row.isMainMaterial,
        main_sort_order: row.mainSortOrder,
      }));
      const { data: importResult, error: importError } = await supabase.rpc(
        'import_material_master_excel_v52_48_5_44_133',
        {
          p_rows: importRows,
          p_updated_by: currentUserId || null,
        },
      );
      if (importError) {
        if (
          importError.code === 'PGRST202' ||
          String(importError.message || '').includes(
            'import_material_master_excel_v52_48_5_44_133',
          )
        ) {
          throw new Error('v133 Supabase SQL을 먼저 실행해주세요.');
        }
        throw importError;
      }

      notify(
        'success',
        `자재마스터를 갱신했습니다. 수정 ${Number(importResult?.updated ?? parsed.updateCount).toLocaleString()}건 · 신규 ${Number(importResult?.inserted ?? parsed.insertCount).toLocaleString()}건`,
      );
      await loadMasterRows();
      await loadProjectSettings({ openWhenIncomplete: false });
    } catch (error) {
      if (!handleSchemaError(error)) {
        notify('error', `자재마스터 Excel 업로드 실패: ${error.message}`);
      }
    } finally {
      setMasterExcelBusy(false);
    }
  };

  const toggleMasterSelection = (materialId) => {
    setSelectedMasterIds((current) => {
      const next = new Set(current);
      if (next.has(materialId)) next.delete(materialId);
      else next.add(materialId);
      return next;
    });
  };

  const toggleAllMasterSelection = () => {
    setSelectedMasterIds((current) => {
      const allSelected =
        masterRows.length > 0 &&
        masterRows.every((row) => current.has(row.id));
      return allSelected
        ? new Set()
        : new Set(masterRows.map((row) => row.id));
    });
  };

  const moveSelectedMasterRows = async (direction) => {
    if (!canManageMaster) {
      notify('warning', '자재 마스터 관리 권한이 없습니다.');
      return;
    }
    if (selectedMasterIds.size === 0) {
      notify('warning', '순서를 변경할 자재를 선택해주세요.');
      return;
    }
    if (masterCategoryId || normalizeText(masterSearch)) {
      notify(
        'warning',
        '전체 자재 순서를 정확히 저장하려면 검색어와 자재분류를 초기화한 뒤 순서를 변경해주세요.',
      );
      return;
    }

    const nextRows = [...masterRows];
    if (direction === 'up') {
      for (let index = 1; index < nextRows.length; index += 1) {
        if (
          selectedMasterIds.has(nextRows[index].id) &&
          !selectedMasterIds.has(nextRows[index - 1].id)
        ) {
          [nextRows[index - 1], nextRows[index]] = [
            nextRows[index],
            nextRows[index - 1],
          ];
        }
      }
    } else {
      for (let index = nextRows.length - 2; index >= 0; index -= 1) {
        if (
          selectedMasterIds.has(nextRows[index].id) &&
          !selectedMasterIds.has(nextRows[index + 1].id)
        ) {
          [nextRows[index], nextRows[index + 1]] = [
            nextRows[index + 1],
            nextRows[index],
          ];
        }
      }
    }

    const unchanged = nextRows.every(
      (row, index) => row.id === masterRows[index]?.id,
    );
    if (unchanged) return;

    setMasterActionBusy(true);
    try {
      const { error } = await supabase.rpc(
        'save_material_master_order_v52_48_5_44_134',
        {
          p_ordered_ids: nextRows.map((row) => row.id),
          p_updated_by: currentUserId || null,
        },
      );
      if (error) {
        if (
          error.code === 'PGRST202' ||
          String(error.message || '').includes(
            'save_material_master_order_v52_48_5_44_134',
          )
        ) {
          throw new Error('v134 Supabase SQL을 먼저 실행해주세요.');
        }
        throw error;
      }

      setMasterRows(
        nextRows.map((row, index) => ({
          ...row,
          display_order: (index + 1) * 10,
        })),
      );
      notify('success', '자재마스터 표시순서를 저장했습니다.');
    } catch (error) {
      notify('error', `자재마스터 순서 저장 실패: ${error.message}`);
    } finally {
      setMasterActionBusy(false);
    }
  };

  const deleteSelectedMasterRows = async () => {
    if (!canManageMaster) {
      notify('warning', '자재 마스터 관리 권한이 없습니다.');
      return;
    }
    if (selectedMasterIds.size === 0) {
      notify('warning', '삭제할 자재를 선택해주세요.');
      return;
    }

    const selectedCount = selectedMasterIds.size;
    const confirmed = window.confirm(
      `선택한 자재 ${selectedCount.toLocaleString()}건을 삭제할까요?\n\n`
      + '발주서나 현장 기본설정에 사용된 자재는 과거 기록을 보호하기 위해 사용중지 처리되며, 자재마스터 목록과 새 발주 선택지에서는 제외됩니다.',
    );
    if (!confirmed) return;

    setMasterActionBusy(true);
    try {
      const { data, error } = await supabase.rpc(
        'delete_material_master_items_v52_48_5_44_134',
        {
          p_ids: Array.from(selectedMasterIds),
          p_updated_by: currentUserId || null,
        },
      );
      if (error) {
        if (
          error.code === 'PGRST202' ||
          String(error.message || '').includes(
            'delete_material_master_items_v52_48_5_44_134',
          )
        ) {
          throw new Error('v134 Supabase SQL을 먼저 실행해주세요.');
        }
        throw error;
      }

      const deleted = Number(data?.deleted || 0);
      const deactivated = Number(data?.deactivated || 0);
      setSelectedMasterIds(new Set());
      notify(
        'success',
        `자재마스터 ${selectedCount.toLocaleString()}건을 정리했습니다. 완전 삭제 ${deleted.toLocaleString()}건 · 사용중지 ${deactivated.toLocaleString()}건`,
      );
      await loadMasterRows();
      await loadProjectSettings({ openWhenIncomplete: false });
    } catch (error) {
      notify('error', `자재마스터 삭제 실패: ${error.message}`);
    } finally {
      setMasterActionBusy(false);
    }
  };

  useEffect(() => {
    setSchemaMissing(false);
    loadCategories();
    loadOrders();
    // 자재 마스터 등록 중 기본항목이 추가되더라도 기본설정 팝업으로
    // 작업을 가로채지 않는다. 설정 필요 상태만 갱신하고, 실제 발주
    // 작업을 시작하거나 기본설정 버튼을 눌렀을 때만 팝업을 연다.
    loadProjectSettings({ openWhenIncomplete: false });
  }, [
    loadCategories,
    loadOrders,
    loadProjectSettings,
    projectName,
  ]);

  useEffect(() => {
    if (mainTab === 'master') loadMasterRows();
  }, [loadMasterRows, mainTab]);

  const createNewOrder = useCallback(() => {
    if (settingsRequired) {
      setSettingsTab('basic');
      setSettingsDialogOpen(true);
      notify(
        'warning',
        '발주서 작성 전에 기본정보를 먼저 완료해주세요.',
      );
      return;
    }

    const nextCategoryId = selectedOrderFolderId || categories[0]?.id || '';
    const nextCategoryFolders = categoryFolders.filter(
      (row) => row.category_id === nextCategoryId,
    );
    const selectedFolderIsAvailable = categoryFolders.some((row) => (
      row.category_id === nextCategoryId && row.name === selectedOrderFolderProcess
    ));
    setOrder({
      ...EMPTY_ORDER,
      orderDate: getKoreaToday(),
      categoryId: nextCategoryId,
      processName: selectedFolderIsAvailable ? selectedOrderFolderProcess : '',
      requesterName:
        projectSettings?.default_requester_name ||
        getProfileName(userProfile),
      receiverName: projectSettings?.default_receiver_name || '',
      receiverPhone: projectSettings?.default_receiver_phone || '',
      deliveryLocation:
        projectSettings?.default_delivery_location || '',
    });
    setOrderItems([]);
    setSelectedOrderItemKeys(new Set());
    setMainTab('order');
    if (nextCategoryFolders.length > 0 && !selectedFolderIsAvailable) {
      setProcessFoldersOpen(true);
      notify('warning', '이 자재분류는 하위폴더를 선택한 뒤 발주서를 작성해야 합니다.');
    }
  }, [
    categories,
    categoryFolders,
    notify,
    projectSettings,
    selectedOrderFolderId,
    selectedOrderFolderProcess,
    settingsRequired,
    userProfile,
  ]);

  const clearOrderEditorForFolder = useCallback(
    (categoryId, processName = '') => {
      setOrder({
        ...EMPTY_ORDER,
        orderDate: getKoreaToday(),
        categoryId,
        processName,
        requesterName:
          projectSettings?.default_requester_name ||
          getProfileName(userProfile),
        receiverName: projectSettings?.default_receiver_name || '',
        receiverPhone: projectSettings?.default_receiver_phone || '',
        deliveryLocation:
          projectSettings?.default_delivery_location || '',
      });
      setOrderItems([]);
      setSelectedOrderItemKeys(new Set());
      setOpenMaterialHintKey('');
    },
    [projectSettings, userProfile],
  );

  const refreshBalances = useCallback(
    async (items) => {
      if (!projectName || items.length === 0) return items;
      const projectMaterialIds = [
        ...new Set(items.map((row) => row.projectMaterialId).filter(Boolean)),
      ];
      const unresolvedMasterIds = [
        ...new Set(
          items
            .filter((row) => !row.projectMaterialId)
            .map((row) => row.materialId)
            .filter(Boolean),
        ),
      ];
      if (projectMaterialIds.length === 0 && unresolvedMasterIds.length === 0) return items;

      const [projectResult, masterResult] = await Promise.all([
        projectMaterialIds.length > 0
          ? supabase
            .from('material_supply_cumulative')
            .select('project_material_id, cumulative_order_quantity')
            .eq('project_name', projectName)
            .in('project_material_id', projectMaterialIds)
          : Promise.resolve({ data: [], error: null }),
        unresolvedMasterIds.length > 0
          ? supabase
            .from('material_supply_cumulative')
            .select('material_id, cumulative_order_quantity')
            .eq('project_name', projectName)
            .in('material_id', unresolvedMasterIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (projectResult.error) throw projectResult.error;
      if (masterResult.error) throw masterResult.error;
      const projectCumulativeMap = new Map(
        (projectResult.data || []).map((row) => [
          row.project_material_id,
          numberValue(row.cumulative_order_quantity),
        ]),
      );
      const masterCumulativeMap = new Map();
      (masterResult.data || []).forEach((row) => {
        masterCumulativeMap.set(
          row.material_id,
          (masterCumulativeMap.get(row.material_id) || 0) +
            numberValue(row.cumulative_order_quantity),
        );
      });

      return recalculateOrderItemBalances(items.map((row) => {
        const previous = row.projectMaterialId
          ? projectCumulativeMap.get(row.projectMaterialId) || 0
          : masterCumulativeMap.get(row.materialId) || 0;
        const current = numberValue(row.currentQuantity);
        const cumulative = previous + current;
        const execution = numberValue(row.executionQuantity);
        return {
          ...row,
          previousQuantity: previous,
          cumulativeQuantity: cumulative,
          executionRatio: execution > 0 ? (cumulative / execution) * 100 : 0,
        };
      }));
    },
    [projectName],
  );

  const openOrder = useCallback(
    async (row) => {
      setLoading(true);
      try {
        const { data: items, error } = await supabase
          .from('material_supply_order_items')
          .select('*')
          .eq('order_id', row.id)
          .order('sort_order', { ascending: true });
        if (error) throw error;

        let mapped = (items || []).map((item) => ({
          id: item.id,
          clientKey: item.id || createOrderItemKey(),
          projectMaterialId: item.project_material_id || '',
          materialId: item.material_id,
          masterStandardName: item.material_id ? item.standard_name : '',
          categoryId: item.category_id || '',
          processName: item.process_name || '',
          standardName: item.standard_name,
          specification: item.specification || '',
          unit: item.unit || '',
          executionQuantity: numberValue(item.execution_quantity),
          previousQuantity: numberValue(item.previous_order_quantity),
          currentQuantity: numberValue(item.current_order_quantity),
          cumulativeQuantity: numberValue(item.cumulative_order_quantity),
          executionRatio: numberValue(item.execution_ratio),
          note: item.note || '',
        }));

        if (row.status === 'draft') mapped = await refreshBalances(mapped);
        else mapped = recalculateOrderItemBalances(mapped);

        const nextCategoryId = row.category_id || categories[0]?.id || '';
        const nextProcessName = row.process_name || '';
        const nextFolderNames = categoryFolders
          .filter((folder) => folder.category_id === nextCategoryId)
          .map((folder) => folder.name);
        setOrder({
          id: row.id,
          orderNo: row.order_no || '',
          orderDate: row.order_date || getKoreaToday(),
          requesterName: row.requester_name || '',
          deliveryDate: row.delivery_date || '',
          deliveryLocation: row.delivery_location || '',
          receiverName: row.receiver_name || '',
          receiverPhone: row.receiver_phone || '',
          categoryId: nextCategoryId,
          processName: nextProcessName,
          note: row.note || '',
          status: row.status || 'draft',
        });
        setSelectedOrderFolderId(nextCategoryId);
        setSelectedOrderFolderProcess((current) => (
          nextFolderNames.includes(current) ? current : ''
        ));
        setOrderItems(mapped);
        setSelectedOrderItemKeys(new Set());
        setMainTab('order');
      } catch (error) {
        notify('error', `발주서 불러오기 실패: ${error.message}`);
      } finally {
        setLoading(false);
      }
    },
    [categories, categoryFolders, notify, refreshBalances],
  );

  const loadMaterialPicker = useCallback(async () => {
    if (!projectName) return;
    setMaterialPickerLoading(true);
    try {
      let query = supabase
        .from('material_master_items')
        .select('id, category_id, process_name, standard_name, specification, unit, manufacturer, aliases, search_text')
        .eq('is_active', true)
        .order('standard_name', { ascending: true })
        .limit(200);

      if (materialPickerPurpose === 'order' && order.categoryId) {
        query = query.eq('category_id', order.categoryId);
      }
      if (materialPickerPurpose === 'order' && order.processName) {
        query = query.eq('process_name', order.processName);
      }
      const keyword = normalizeText(materialPickerSearch);
      if (keyword) query = query.ilike('search_text', `%${keyword}%`);

      const { data: materials, error } = await query;
      if (error) throw error;

      const ids = (materials || []).map((row) => row.id);
      let quantities = [];
      let cumulative = [];

      if (ids.length > 0) {
        const [quantityResult, cumulativeResult] = await Promise.all([
          supabase
            .from('material_project_materials')
            .select('material_id, execution_quantity')
            .eq('project_name', projectName)
            .in('material_id', ids),
          supabase
            .from('material_supply_cumulative')
            .select('material_id, cumulative_order_quantity')
            .eq('project_name', projectName)
            .in('material_id', ids),
        ]);
        if (quantityResult.error) throw quantityResult.error;
        if (cumulativeResult.error) throw cumulativeResult.error;
        quantities = quantityResult.data || [];
        cumulative = cumulativeResult.data || [];
      }

      const quantityMap = new Map(quantities.map((row) => [row.material_id, numberValue(row.execution_quantity)]));
      const cumulativeMap = new Map();
      cumulative.forEach((row) => {
        cumulativeMap.set(
          row.material_id,
          (cumulativeMap.get(row.material_id) || 0) +
            numberValue(row.cumulative_order_quantity),
        );
      });

      setMaterialPickerRows(
        (materials || []).map((row) => ({
          ...row,
          executionQuantity: quantityMap.get(row.id) || 0,
          previousQuantity: cumulativeMap.get(row.id) || 0,
        })),
      );
    } catch (error) {
      notify('error', `자재 검색 실패: ${error.message}`);
    } finally {
      setMaterialPickerLoading(false);
    }
  }, [
    materialPickerPurpose,
    materialPickerSearch,
    notify,
    order.categoryId,
    order.processName,
    projectName,
  ]);

  const loadOrderMaterialOptions = useCallback(async () => {
    if (!projectName) {
      setOrderMaterialOptions([]);
      return;
    }

    setOrderMaterialOptionsLoading(true);
    try {
      let query = supabase
        .from('material_master_items')
        .select(
          'id, category_id, process_name, standard_name, specification, unit, manufacturer, aliases, search_text, is_main_material, main_sort_order, display_order',
        )
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('standard_name', { ascending: true })
        .limit(500);

      if (order.categoryId) {
        query = query.eq('category_id', order.categoryId);
      }
      if (order.processName) {
        query = query.eq('process_name', order.processName);
      }

      let projectItemQuery = supabase
        .from('material_supply_project_items')
        .select(
          'id, material_id, category_id, process_name, standard_name, specification, unit, identity_key, search_text',
        )
        .eq('project_name', projectName)
        .eq('is_active', true)
        .order('standard_name', { ascending: true })
        .limit(500);

      if (order.categoryId) {
        projectItemQuery = projectItemQuery.eq('category_id', order.categoryId);
      }
      if (order.processName) {
        projectItemQuery = projectItemQuery.eq('process_name', order.processName);
      }

      const [masterResult, projectItemResult] = await Promise.all([
        query,
        projectItemQuery,
      ]);
      if (masterResult.error) throw masterResult.error;

      const materials = masterResult.data || [];
      const projectCatalogReady = !projectItemResult.error;
      const projectItems = projectCatalogReady ? projectItemResult.data || [] : [];

      const ids = materials.map((row) => row.id);
      let quantities = [];
      let cumulative = [];

      if (ids.length > 0 || projectItems.length > 0) {
        const [quantityResult, cumulativeResult] = await Promise.all([
          ids.length > 0
            ? supabase
            .from('material_project_materials')
            .select('material_id, execution_quantity')
            .eq('project_name', projectName)
            .in('material_id', ids)
            : Promise.resolve({ data: [], error: null }),
          projectCatalogReady && projectItems.length > 0
            ? supabase
              .from('material_supply_cumulative')
              .select('project_material_id, cumulative_order_quantity')
              .eq('project_name', projectName)
              .in('project_material_id', projectItems.map((row) => row.id))
            : ids.length > 0
              ? supabase
                .from('material_supply_cumulative')
                .select('material_id, cumulative_order_quantity')
                .eq('project_name', projectName)
                .in('material_id', ids)
              : Promise.resolve({ data: [], error: null }),
        ]);
        if (quantityResult.error) throw quantityResult.error;
        if (cumulativeResult.error) throw cumulativeResult.error;
        quantities = quantityResult.data || [];
        cumulative = cumulativeResult.data || [];
      }

      const quantityMap = new Map(
        quantities.map((row) => [
          row.material_id,
          numberValue(row.execution_quantity),
        ]),
      );
      const cumulativeMap = new Map();
      cumulative.forEach((row) => {
        const key = projectCatalogReady ? row.project_material_id : row.material_id;
        cumulativeMap.set(
          key,
          (cumulativeMap.get(key) || 0) + numberValue(row.cumulative_order_quantity),
        );
      });
      const masterMap = new Map(materials.map((row) => [row.id, row]));
      const projectIdentityKeys = new Set(
        projectItems.map((row) => row.identity_key || buildProjectMaterialIdentityKey(row)),
      );
      const projectOptions = projectItems.map((row) => {
        const master = masterMap.get(row.material_id) || null;
        const option = {
          ...row,
          id: `project:${row.id}`,
          projectMaterialId: row.id,
          materialId: row.material_id || '',
          manufacturer: master?.manufacturer || '',
          aliases: master?.aliases || [],
          is_main_material: master?.is_main_material === true,
          main_sort_order: master?.main_sort_order || 100,
          display_order: master?.display_order || 1000,
          isProjectMaterial: true,
          executionQuantity: quantityMap.get(row.material_id) || 0,
          previousQuantity: cumulativeMap.get(row.id) || 0,
        };
        return { ...option, orderSearchText: buildOrderMaterialSearchText(option) };
      });
      const masterOptions = materials
        .filter((row) => !projectIdentityKeys.has(buildProjectMaterialIdentityKey(row)))
        .map((row) => ({
          ...row,
          projectMaterialId: '',
          materialId: row.id,
          isProjectMaterial: quantityMap.has(row.id),
          executionQuantity: quantityMap.get(row.id) || 0,
          previousQuantity: projectCatalogReady ? 0 : cumulativeMap.get(row.id) || 0,
          orderSearchText: buildOrderMaterialSearchText(row),
        }));

      setOrderMaterialOptions(
        [...projectOptions, ...masterOptions],
      );
    } catch (error) {
      if (!handleSchemaError(error)) {
        notify('error', `자재 힌트 불러오기 실패: ${error.message}`);
      }
      setOrderMaterialOptions([]);
    } finally {
      setOrderMaterialOptionsLoading(false);
    }
  }, [
    handleSchemaError,
    notify,
    order.categoryId,
    order.processName,
    projectName,
  ]);

  useEffect(() => {
    if (mainTab !== 'order') return undefined;
    const timer = window.setTimeout(loadOrderMaterialOptions, 180);
    return () => window.clearTimeout(timer);
  }, [loadOrderMaterialOptions, mainTab]);

  useEffect(() => {
    if (!materialPickerOpen) return;
    const timer = window.setTimeout(loadMaterialPicker, 180);
    return () => window.clearTimeout(timer);
  }, [loadMaterialPicker, materialPickerOpen]);

  const addMaterialToOrder = (material) => {
    const previous = numberValue(material.previousQuantity);
    const execution = numberValue(material.executionQuantity);
    setOrderItems((current) =>
      recalculateOrderItemBalances([
        ...current,
        {
        id: '',
        clientKey: createOrderItemKey(),
        projectMaterialId: material.projectMaterialId || '',
        materialId: material.id,
        masterStandardName: material.standard_name,
        categoryId: material.category_id || '',
        processName: material.process_name || '',
        standardName: material.standard_name,
        specification: material.specification || '',
        unit: material.unit || '',
        executionQuantity: execution,
        previousQuantity: previous,
        currentQuantity: 0,
        cumulativeQuantity: previous,
        executionRatio: execution > 0 ? (previous / execution) * 100 : 0,
          note: '',
        },
      ]),
    );
  };


  const addMaterialToSettings = (material) => {
    if (
      settingsMaterials.some(
        (row) => row.materialId === material.id,
      )
    ) {
      notify('warning', '이미 주요자재 설정에 포함된 자재입니다.');
      return;
    }

    setSettingsMaterials((current) => [
      ...current,
      {
        materialId: material.id,
        categoryId: material.category_id || '',
        processName: material.process_name || '',
        standardName: material.standard_name,
        specification: material.specification || '',
        unit: material.unit || '',
        manufacturer: material.manufacturer || '',
        aliases: material.aliases || [],
        included: true,
        executionQuantity: numberValue(material.executionQuantity),
        note: '',
        sortOrder: current.length + 100,
        source: 'manual',
      },
    ]);
    notify('success', `"${material.standard_name}"을 주요자재에 추가했습니다.`);
  };

  const addMaterialFromPicker = (material) => {
    if (materialPickerPurpose === 'settings') {
      addMaterialToSettings(material);
      return;
    }
    addMaterialToOrder(material);
  };

  const updateSettingsMaterial = (materialId, field, value) => {
    setSettingsMaterials((current) =>
      current.map((row) =>
        row.materialId === materialId
          ? {
              ...row,
              [field]:
                field === 'executionQuantity'
                  ? value
                  : value,
            }
          : row,
      ),
    );
  };

  const saveProjectSettings = async () => {
    if (!projectName) return;

    const nextForm = {
      requesterName: normalizeText(settingsForm.requesterName),
      receiverName: normalizeText(settingsForm.receiverName),
      receiverPhone: normalizeText(settingsForm.receiverPhone),
      deliveryLocation: normalizeText(settingsForm.deliveryLocation),
    };

    if (!nextForm.requesterName) {
      notify('warning', '작성자(요청자)를 입력해주세요.');
      setSettingsTab('basic');
      return;
    }
    if (!nextForm.receiverName) {
      notify('warning', '수령자를 입력해주세요.');
      setSettingsTab('basic');
      return;
    }
    if (!nextForm.receiverPhone) {
      notify('warning', '연락처를 입력해주세요.');
      setSettingsTab('basic');
      return;
    }
    if (!nextForm.deliveryLocation) {
      notify('warning', '납품장소를 입력해주세요.');
      setSettingsTab('basic');
      return;
    }

    setSettingsSaving(true);
    try {
      const now = new Date().toISOString();

      const settingsPayload = {
        project_name: projectName,
        default_requester_name: nextForm.requesterName,
        default_receiver_name: nextForm.receiverName,
        default_receiver_phone: nextForm.receiverPhone,
        default_delivery_location: nextForm.deliveryLocation,
        is_configured: true,
        updated_by: currentUserId || null,
        updated_at: now,
      };

      if (!projectSettings) {
        settingsPayload.created_by = currentUserId || null;
        settingsPayload.created_at = now;
      }

      const { error: settingsError } = await supabase
        .from('material_order_project_settings')
        .upsert(settingsPayload, { onConflict: 'project_name' });

      if (settingsError) throw settingsError;

      const materialPayloads = settingsMaterials.map((row, index) => ({
        project_name: projectName,
        material_id: row.materialId,
        execution_quantity: numberValue(row.executionQuantity),
        note: normalizeText(row.note) || null,
        is_main_material: true,
        is_excluded: row.included === false,
        sort_order: Number(row.sortOrder) || index + 1,
        updated_by: currentUserId || null,
        updated_at: now,
      }));

      if (materialPayloads.length > 0) {
        const { error: materialError } = await supabase
          .from('material_project_materials')
          .upsert(materialPayloads, {
            onConflict: 'project_name,material_id',
          });
        if (materialError) throw materialError;
      }

      const historyPayload = {
        project_name: projectName,
        basic_defaults: {
          requesterName: nextForm.requesterName,
          receiverName: nextForm.receiverName,
          receiverPhone: nextForm.receiverPhone,
          deliveryLocation: nextForm.deliveryLocation,
        },
        material_snapshot: settingsMaterials.map((row, index) => ({
          materialId: row.materialId,
          processName: row.processName,
          standardName: row.standardName,
          specification: row.specification,
          unit: row.unit,
          included: row.included !== false,
          executionQuantity: numberValue(row.executionQuantity),
          note: normalizeText(row.note),
          source: row.source,
          sortOrder: Number(row.sortOrder) || index + 1,
        })),
        changed_by:
          getProfileName(userProfile) ||
          nextForm.requesterName ||
          currentUserId,
        changed_at: now,
        change_note: projectSettings ? '기본설정 수정' : '최초 기본설정',
      };

      const { error: historyError } = await supabase
        .from('material_order_setting_history')
        .insert(historyPayload);
      if (historyError) throw historyError;

      setProjectSettings({
        ...settingsPayload,
      });
      setSettingsForm(nextForm);
      setSettingsRequired(false);
      setSettingsDialogOpen(false);

      setOrder((current) => {
        if (current.id) return current;
        return {
          ...current,
          requesterName: nextForm.requesterName,
          receiverName: nextForm.receiverName,
          receiverPhone: nextForm.receiverPhone,
          deliveryLocation: nextForm.deliveryLocation,
        };
      });

      notify(
        'success',
        projectSettings
          ? '자재발주 기본설정을 변경했습니다.'
          : '자재발주 최초 기본설정을 완료했습니다.',
      );

      await loadProjectSettings({ openWhenIncomplete: false });
    } catch (error) {
      if (!handleSchemaError(error)) {
        notify(
          'error',
          `자재발주 기본설정 저장 실패: ${error.message}`,
        );
      }
    } finally {
      setSettingsSaving(false);
    }
  };

  const updateOrderItem = (index, field, value) => {
    setOrderItems((current) =>
      recalculateOrderItemBalances(current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const nextRow = { ...row, [field]: value };
        if (['standardName', 'specification', 'unit'].includes(field)) {
          nextRow.projectMaterialId = '';
          nextRow.previousQuantity = 0;
          nextRow.cumulativeQuantity = numberValue(nextRow.currentQuantity);
          nextRow.executionRatio = nextRow.executionQuantity > 0
            ? (nextRow.cumulativeQuantity / nextRow.executionQuantity) * 100
            : 0;
        }
        if (
          field === 'standardName' &&
          nextRow.materialId &&
          normalizeText(value) !== normalizeText(nextRow.masterStandardName)
        ) {
          nextRow.materialId = '';
          nextRow.masterStandardName = '';
          nextRow.executionQuantity = 0;
          nextRow.previousQuantity = 0;
          nextRow.cumulativeQuantity = numberValue(nextRow.currentQuantity);
          nextRow.executionRatio = 0;
        }
        if (field === 'currentQuantity') {
          const currentQuantity = numberValue(value);
          const previous = numberValue(nextRow.previousQuantity);
          const execution = numberValue(nextRow.executionQuantity);
          nextRow.currentQuantity = currentQuantity;
          nextRow.cumulativeQuantity = previous + currentQuantity;
          nextRow.executionRatio = execution > 0 ? (nextRow.cumulativeQuantity / execution) * 100 : 0;
        }
        return nextRow;
      })),
    );
  };

  const getOrderItemKey = (row, index) =>
    row.clientKey || row.id || `${row.materialId || 'free'}-${index}`;

  const setOrderItemInputRef = (itemKey, field, node) => {
    const inputKey = `${itemKey}:${field}`;
    if (node) {
      orderItemInputRefs.current.set(inputKey, node);
    } else {
      orderItemInputRefs.current.delete(inputKey);
    }
  };

  const focusOrderItemCell = (rowIndex, fieldIndex) => {
    if (rowIndex < 0 || rowIndex >= orderItems.length) return;
    if (fieldIndex < 0 || fieldIndex >= ORDER_GRID_FIELDS.length) return;

    const row = orderItems[rowIndex];
    const itemKey = getOrderItemKey(row, rowIndex);
    const field = ORDER_GRID_FIELDS[fieldIndex];
    const input = orderItemInputRefs.current.get(`${itemKey}:${field}`);
    input?.focus();
    if (typeof input?.select === 'function') input.select();
  };

  const addBlankOrderItem = () => {
    const requiresFolderSelection = categoryFolders.some(
      (row) => row.category_id === order.categoryId,
    ) && !normalizeText(order.processName);
    if (requiresFolderSelection) {
      setProcessFoldersOpen(true);
      notify('warning', '먼저 발주서를 작성할 하위폴더를 선택해주세요.');
      return;
    }
    const nextItem = {
      ...createBlankOrderItem(),
      categoryId: order.categoryId,
      processName: order.processName,
    };
    setOrderItems((current) => [...current, nextItem]);
    setSelectedOrderItemKeys(new Set([nextItem.clientKey]));

    window.requestAnimationFrame(() => {
      const input = orderItemInputRefs.current.get(
        `${nextItem.clientKey}:standardName`,
      );
      input?.focus();
    });
  };

  const deleteSelectedOrderItems = () => {
    if (selectedOrderItemKeys.size === 0) {
      notify('warning', '삭제할 발주 품목 행을 선택해주세요.');
      return;
    }

    setOrderItems((current) =>
      current.filter(
        (row, index) =>
          !selectedOrderItemKeys.has(getOrderItemKey(row, index)),
      ),
    );
    setSelectedOrderItemKeys(new Set());
  };

  const moveSelectedOrderItems = (direction) => {
    if (selectedOrderItemKeys.size === 0) {
      notify('warning', '이동할 발주 품목 행을 선택해주세요.');
      return;
    }

    setOrderItems((current) => {
      const next = [...current];
      const isSelected = (row, index) =>
        selectedOrderItemKeys.has(getOrderItemKey(row, index));

      if (direction < 0) {
        for (let index = 1; index < next.length; index += 1) {
          if (isSelected(next[index], index) && !isSelected(next[index - 1], index - 1)) {
            [next[index - 1], next[index]] = [next[index], next[index - 1]];
          }
        }
      } else {
        for (let index = next.length - 2; index >= 0; index -= 1) {
          if (isSelected(next[index], index) && !isSelected(next[index + 1], index + 1)) {
            [next[index], next[index + 1]] = [next[index + 1], next[index]];
          }
        }
      }

      return next;
    });
  };

  const toggleOrderItemSelection = (itemKey) => {
    setSelectedOrderItemKeys((current) => {
      const next = new Set(current);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  };

  const toggleAllOrderItems = (checked) => {
    setSelectedOrderItemKeys(
      checked
        ? new Set(orderItems.map((row, index) => getOrderItemKey(row, index)))
        : new Set(),
    );
  };

  const applyMaterialHint = (index, material) => {
    if (!material || typeof material !== 'object') return;

    setOrderItems((current) =>
      recalculateOrderItemBalances(current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;

        const execution = numberValue(material.executionQuantity);
        const previous = numberValue(material.previousQuantity);
        const currentQuantity = numberValue(row.currentQuantity);
        const cumulative = previous + currentQuantity;

        return {
          ...row,
          projectMaterialId: material.projectMaterialId || '',
          materialId: material.materialId || material.material_id || '',
          masterStandardName: material.standard_name || '',
          categoryId: material.category_id || '',
          processName: material.process_name || '',
          standardName: material.standard_name || '',
          specification: material.specification || '',
          unit: material.unit || '',
          executionQuantity: execution,
          previousQuantity: previous,
          cumulativeQuantity: cumulative,
          executionRatio: execution > 0 ? (cumulative / execution) * 100 : 0,
        };
      })),
    );
  };

  const handleOrderGridKeyDown = (event, rowIndex, field) => {
    const fieldIndex = ORDER_GRID_FIELDS.indexOf(field);
    if (fieldIndex < 0 || event.key === 'Tab') return;

    const row = orderItems[rowIndex];
    const itemKey = getOrderItemKey(row, rowIndex);
    const hintIsOpen = field === 'standardName' && openMaterialHintKey === itemKey;
    const hintOptionsAvailable =
      hintIsOpen &&
      filterOrderMaterialOptions(orderMaterialOptions, {
        inputValue: row.standardName,
      }).length > 0;

    if (
      hintIsOpen &&
      (
        ['ArrowUp', 'ArrowDown'].includes(event.key) ||
        (event.key === 'Enter' && hintOptionsAvailable)
      )
    ) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      addBlankOrderItem();
      return;
    }

    let nextRowIndex = rowIndex;
    let nextFieldIndex = fieldIndex;

    if (event.key === 'ArrowDown') {
      nextRowIndex += 1;
    } else if (event.key === 'ArrowUp') {
      nextRowIndex -= 1;
    } else if (event.key === 'ArrowLeft') {
      const input = event.target;
      if (
        typeof input.selectionStart === 'number' &&
        (input.selectionStart > 0 || input.selectionEnd > 0)
      ) {
        return;
      }
      nextFieldIndex -= 1;
      if (nextFieldIndex < 0) {
        nextRowIndex -= 1;
        nextFieldIndex = ORDER_GRID_FIELDS.length - 1;
      }
    } else if (event.key === 'ArrowRight') {
      const input = event.target;
      const inputLength = String(input.value || '').length;
      if (
        typeof input.selectionEnd === 'number' &&
        input.selectionEnd < inputLength
      ) {
        return;
      }
      nextFieldIndex += 1;
      if (nextFieldIndex >= ORDER_GRID_FIELDS.length) {
        nextRowIndex += 1;
        nextFieldIndex = 0;
      }
    } else {
      return;
    }

    if (
      nextRowIndex < 0 ||
      nextRowIndex >= orderItems.length ||
      nextFieldIndex < 0 ||
      nextFieldIndex >= ORDER_GRID_FIELDS.length
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    focusOrderItemCell(nextRowIndex, nextFieldIndex);
  };

  const downloadOrderExcel = async () => {
    if (!projectName || orderExcelBusy) return;

    const exportItems = orderItems.filter((row) =>
      [
        row.standardName,
        row.specification,
        row.unit,
        row.currentQuantity,
        row.note,
      ].some((value) => normalizeText(value)),
    );

    if (!order.orderDate) {
      notify('warning', '발주일을 입력해주세요.');
      return;
    }
    if (!order.categoryId) {
      notify('warning', '자재분류를 선택해주세요.');
      return;
    }
    if (
      categoryFolders.some((row) => row.category_id === order.categoryId) &&
      !normalizeText(order.processName)
    ) {
      setProcessFoldersOpen(true);
      notify('warning', '엑셀 다운로드 전에 발주서의 하위폴더를 선택해주세요.');
      return;
    }
    if (exportItems.length === 0) {
      notify('warning', '엑셀에 작성할 발주 품목을 하나 이상 추가해주세요.');
      return;
    }
    if (exportItems.some((row) => !normalizeText(row.standardName))) {
      notify('warning', '품명이 비어 있는 발주 품목 행을 확인해주세요.');
      return;
    }

    setOrderExcelBusy(true);
    try {
      const result = await saveMaterialOrderWorkbook({
        projectName,
        order,
        items: exportItems,
      });
      notify('success', `${result.source}에 현재 작성 내용을 넣어 다운로드했습니다.`);
    } catch (error) {
      notify('error', `자재발주서 Excel 다운로드 실패: ${error.message}`);
    } finally {
      setOrderExcelBusy(false);
    }
  };

  const saveOrder = async (status = 'draft') => {
    if (!projectName || isLocked) return;

    const savableItems = orderItems.filter((row) =>
      [
        row.standardName,
        row.specification,
        row.unit,
        row.currentQuantity,
        row.note,
      ].some((value) => normalizeText(value)),
    );

    if (settingsRequired) {
      setSettingsTab('basic');
      setSettingsDialogOpen(true);
      notify(
        'warning',
        '발주 기본정보를 먼저 완료해주세요.',
      );
      return;
    }

    if (!order.orderDate) {
      notify('warning', '발주일을 입력해주세요.');
      return;
    }
    if (!order.categoryId) {
      notify('warning', '자재분류를 선택해주세요.');
      return;
    }
    if (
      categoryFolders.some((row) => row.category_id === order.categoryId) &&
      !normalizeText(order.processName)
    ) {
      setProcessFoldersOpen(true);
      notify('warning', '발주서를 저장할 하위폴더를 먼저 선택해주세요.');
      return;
    }
    if (savableItems.length === 0) {
      notify('warning', '발주 자재를 하나 이상 추가해주세요.');
      return;
    }

    const missingNameIndex = savableItems.findIndex(
      (row) => !normalizeText(row.standardName),
    );
    if (missingNameIndex >= 0) {
      notify('warning', '품명이 비어 있는 발주 품목 행을 확인해주세요.');
      return;
    }

    if (['ordered', 'confirmed'].includes(status) && savableItems.every((row) => numberValue(row.currentQuantity) <= 0)) {
      notify('warning', '금회발주량을 입력해주세요.');
      return;
    }

    const linkedMaterialIds = savableItems
      .map((row) => row.materialId)
      .filter(Boolean);
    const requiresFreeRowSchema =
      savableItems.some((row) => !row.materialId) ||
      new Set(linkedMaterialIds).size !== linkedMaterialIds.length;

    if (requiresFreeRowSchema) {
      const { data: freeRowReady, error: freeRowReadyError } = await supabase.rpc(
        'material_order_free_rows_ready_v52_48_5_44_131',
      );

      if (freeRowReadyError || freeRowReady !== true) {
        notify(
          'error',
          '직접입력 또는 같은 자재의 다중 행을 저장하려면 v131 Supabase SQL을 먼저 실행해주세요.',
        );
        return;
      }
    }

    const { data: projectCatalogReadyResult, error: projectCatalogReadyError } = await supabase.rpc(
      'material_supply_project_catalog_ready_v52_48_5_44_152',
    );
    const projectCatalogReady = !projectCatalogReadyError && projectCatalogReadyResult === true;
    if (!projectCatalogReady && status === 'ordered') {
      notify(
        'error',
        '발주확정과 현장 자재 누계를 사용하려면 v52.48.5.44.152 SQL을 먼저 실행해주세요.',
      );
      return;
    }
    if (
      status === 'ordered' &&
      !window.confirm('발주확정하면 금회발주량이 누계에 반영되고 발주서는 수정할 수 없습니다. 확정할까요?')
    ) {
      return;
    }

    setSaving(true);
    try {
      const resolvedItems = projectCatalogReady
        ? await Promise.all(
          savableItems.map(async (row) => {
            if (row.projectMaterialId) return row;
            const { data: projectMaterialId, error } = await supabase.rpc(
              'resolve_material_supply_project_item',
              {
                p_project_name: projectName,
                p_material_id: row.materialId || null,
                p_category_id: row.categoryId || order.categoryId || null,
                p_process_name: row.processName || order.processName || null,
                p_standard_name: normalizeText(row.standardName),
                p_specification: normalizeText(row.specification) || null,
                p_unit: normalizeText(row.unit) || null,
                p_updated_by: currentUserId || null,
              },
            );
            if (error) throw error;
            return { ...row, projectMaterialId };
          }),
        )
        : savableItems;
      let orderId = order.id;
      let orderNo = order.orderNo;

      if (!orderId) {
        const { data: nextNo, error: numberError } = await supabase.rpc(
          'next_material_supply_order_no',
          { p_project_name: projectName, p_order_date: order.orderDate },
        );
        if (numberError) throw numberError;
        orderNo = nextNo;
      }

      const headerPayload = {
        project_name: projectName,
        order_no: orderNo,
        order_date: order.orderDate,
        requester_name: normalizeText(order.requesterName) || null,
        delivery_date: order.deliveryDate || null,
        delivery_location: normalizeText(order.deliveryLocation) || null,
        receiver_name: normalizeText(order.receiverName) || null,
        receiver_phone: normalizeText(order.receiverPhone) || null,
        category_id: order.categoryId || null,
        process_name: normalizeText(order.processName) || null,
        note: normalizeText(order.note) || null,
        status,
        updated_by: currentUserId || null,
        updated_at: new Date().toISOString(),
        ...(status === 'ordered' ? { ordered_at: new Date().toISOString() } : {}),
        ...(status === 'confirmed' ? { confirmed_at: new Date().toISOString() } : {}),
      };

      if (!orderId) {
        const { data: inserted, error } = await supabase
          .from('material_supply_orders')
          .insert({ ...headerPayload, created_by: currentUserId || null })
          .select('id')
          .single();
        if (error) throw error;
        orderId = inserted.id;
      } else {
        const { error } = await supabase
          .from('material_supply_orders')
          .update(headerPayload)
          .eq('id', orderId)
          .eq('status', 'draft');
        if (error) throw error;
        const { error: deleteError } = await supabase
          .from('material_supply_order_items')
          .delete()
          .eq('order_id', orderId);
        if (deleteError) throw deleteError;
      }

      const refreshedItems = await refreshBalances(resolvedItems);
      const itemPayloads = refreshedItems.map((row, index) => ({
        order_id: orderId,
        ...(projectCatalogReady
          ? { project_material_id: row.projectMaterialId }
          : {}),
        material_id: row.materialId || null,
        sort_order: index + 1,
        category_id: row.categoryId || order.categoryId || null,
        process_name: row.processName || order.processName || null,
        standard_name: normalizeText(row.standardName),
        specification: normalizeText(row.specification) || null,
        unit: normalizeText(row.unit) || null,
        execution_quantity: numberValue(row.executionQuantity),
        previous_order_quantity: numberValue(row.previousQuantity),
        current_order_quantity: numberValue(row.currentQuantity),
        cumulative_order_quantity: numberValue(row.cumulativeQuantity),
        execution_ratio: numberValue(row.executionRatio),
        note: normalizeText(row.note) || null,
      }));

      const { error: itemError } = await supabase
        .from('material_supply_order_items')
        .insert(itemPayloads);
      if (itemError) throw itemError;

      notify(
        'success',
        status === 'ordered' ? '발주서를 확정하고 누계에 반영했습니다.' : '발주서를 저장했습니다.',
      );
      await loadOrders();
      const savedRow = {
        ...order,
        id: orderId,
        order_no: orderNo,
        order_date: order.orderDate,
        requester_name: order.requesterName,
        delivery_date: order.deliveryDate,
        delivery_location: order.deliveryLocation,
        receiver_name: order.receiverName,
        receiver_phone: order.receiverPhone,
        category_id: order.categoryId,
        process_name: order.processName,
        note: order.note,
        status,
      };
      await openOrder(savedRow);
      await loadOrderMaterialOptions();
    } catch (error) {
      if (!handleSchemaError(error)) notify('error', `발주서 저장 실패: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteOrder = async () => {
    if (!order.id) return;
    const isFinalized = ['ordered', 'confirmed'].includes(order.status);
    const warning = isFinalized
      ? '\n발주 품목과 누계발주량에서도 함께 제외되며 복구할 수 없습니다.'
      : '';
    if (!window.confirm(`${order.orderNo || '현재 발주서'}를 삭제할까요?${warning}`)) return;
    const { data: deletedOrder, error } = await supabase
      .from('material_supply_orders')
      .delete()
      .eq('id', order.id)
      .eq('project_name', projectName)
      .select('id')
      .maybeSingle();
    if (error) {
      notify('error', `발주서 삭제 실패: ${error.message}`);
      return;
    }
    if (!deletedOrder) {
      notify('error', '발주서를 삭제하지 못했습니다. 삭제 권한을 확인해주세요.');
      return;
    }
    notify('success', isFinalized ? '확정된 발주서를 삭제하고 누계에서 제외했습니다.' : '작성중 발주서를 삭제했습니다.');
    createNewOrder();
    await loadOrders();
  };

  const resetMaterialOrderTestData = async () => {
    if (!projectName || !isSuperAdmin || resetting) return;
    if (resetConfirmText.trim() !== projectName.trim()) {
      notify('warning', '초기화할 현장명을 정확히 입력해주세요.');
      return;
    }

    setResetting(true);
    try {
      const { data, error } = await supabase.rpc(
        'admin_reset_material_order_test_v1',
        { p_project_name: projectName },
      );
      if (error) throw error;

      setResetDialogOpen(false);
      setResetConfirmText('');
      setOrders([]);
      setProjectSettings(null);
      setSettingsHistory([]);
      setSettingsRequired(true);
      setSettingsTab('basic');
      setOrder({
        ...EMPTY_ORDER,
        orderDate: getKoreaToday(),
        requesterName: getProfileName(userProfile),
      });
      setOrderItems([]);
      setMainTab('order');

      await Promise.all([
        loadOrders(),
        loadProjectSettings({ openWhenIncomplete: false }),
      ]);

      const deletedOrders = Number(data?.deleted_orders || 0);
      notify(
        'success',
        `발주서 ${deletedOrders}건과 발주 기본설정을 초기화했습니다. 자재 마스터는 유지됩니다.`,
      );
    } catch (error) {
      if (!handleSchemaError(error)) {
        notify('error', `자재발주 초기화 실패: ${error.message}`);
      }
    } finally {
      setResetting(false);
    }
  };

  const openNewMaster = () => {
    if (!canManageMaster) {
      notify('warning', '자재 마스터 관리 권한이 없습니다.');
      return;
    }
    setMasterForm({
      ...EMPTY_MASTER,
      categoryId: masterCategoryId || categories[0]?.id || '',
    });
    setMasterDialogOpen(true);
  };

  const openEditMaster = (row) => {
    if (!canManageMaster) {
      notify('warning', '자재 마스터 관리 권한이 없습니다.');
      return;
    }
    setMasterForm({
      id: row.id,
      categoryId: row.category_id || '',
      processName: row.process_name || '',
      standardName: row.standard_name || '',
      specification: row.specification || '',
      unit: row.unit || '',
      manufacturer: row.manufacturer || '',
      aliasesText: Array.isArray(row.aliases) ? row.aliases.join(', ') : '',
      note: row.note || '',
      isActive: row.is_active !== false,
      isMainMaterial: row.is_main_material === true,
      mainSortOrder: Number(row.main_sort_order) || 100,
    });
    setMasterDialogOpen(true);
  };

  const saveMaster = async () => {
    if (!canManageMaster) {
      notify('warning', '자재 마스터 관리 권한이 없습니다.');
      return;
    }
    const standardName = normalizeText(masterForm.standardName);
    if (!standardName) {
      notify('warning', '표준 품명을 입력해주세요.');
      return;
    }
    if (!masterForm.categoryId) {
      notify('warning', '자재분류를 선택해주세요.');
      return;
    }

    setSaving(true);
    try {
      const aliases = masterForm.aliasesText
        .split(',')
        .map(normalizeText)
        .filter(Boolean);
      const payload = {
        category_id: masterForm.categoryId,
        process_name: normalizeText(masterForm.processName) || null,
        standard_name: standardName,
        specification: normalizeText(masterForm.specification) || null,
        unit: normalizeText(masterForm.unit) || null,
        manufacturer: normalizeText(masterForm.manufacturer) || null,
        aliases,
        search_text: buildSearchText(masterForm),
        note: normalizeText(masterForm.note) || null,
        is_active: masterForm.isActive !== false,
        is_main_material: masterForm.isMainMaterial === true,
        main_sort_order: Number(masterForm.mainSortOrder) || 100,
        updated_by: currentUserId || null,
        updated_at: new Date().toISOString(),
      };

      let materialId = masterForm.id;
      if (materialId) {
        const { error } = await supabase.from('material_master_items').update(payload).eq('id', materialId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('material_master_items')
          .insert({ ...payload, created_by: currentUserId || null })
          .select('id')
          .single();
        if (error) throw error;
        materialId = data.id;
      }

      notify('success', masterForm.id ? '자재 마스터를 수정했습니다.' : '자재 마스터를 등록했습니다.');
      setMasterDialogOpen(false);
      await loadMasterRows();
      await loadProjectSettings({ openWhenIncomplete: false });
    } catch (error) {
      notify('error', `자재 마스터 저장 실패: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async () => {
    if (pageMode !== 'order' && !canManageMaster) {
      notify('warning', '자재분류 관리 권한이 없습니다.');
      return;
    }
    const name = normalizeText(newCategoryName);
    if (!name) return;
    if (REMOVED_CATEGORY_NAMES.has(name)) {
      notify('warning', '사용하지 않는 자재분류 이름입니다. 다른 이름을 입력해주세요.');
      return;
    }
    const nextSort = categories.reduce((max, row) => Math.max(max, Number(row.sort_order || 0)), 0) + 10;
    const { data: addedCategory, error } = await supabase
      .from('material_supply_categories')
      .insert({
        name,
        sort_order: nextSort,
        is_active: true,
        created_by: currentUserId || null,
        updated_by: currentUserId || null,
      })
      .select('id, name, sort_order, is_active')
      .single();
    if (error) {
      notify('error', error.code === '23505' ? '이미 등록된 자재분류입니다.' : `분류 추가 실패: ${error.message}`);
      return;
    }
    setNewCategoryName('');
    notify('success', `자재분류 "${name}"을 추가했습니다.`);
    await loadCategories();
    if (addedCategory?.id) {
      setSelectedOrderFolderId(addedCategory.id);
      setSelectedOrderFolderProcess('');
      setProcessFoldersOpen(false);
      if (!isLocked) {
        setOrder((current) => ({
          ...current,
          categoryId: addedCategory.id,
          processName: '',
        }));
      }
    }
  };

  const openFolderDialog = (categoryId = selectedOrderFolderId) => {
    setFolderParentCategoryId(categoryId || categories[0]?.id || '');
    setNewFolderName('');
    setFolderDialogOpen(true);
  };

  const addCategoryFolder = async () => {
    if (pageMode !== 'order' && !canManageMaster) {
      notify('warning', '하위 폴더 관리 권한이 없습니다.');
      return;
    }
    if (categoryFolderSchemaMissing) {
      notify('warning', '하위 폴더 저장용 Supabase SQL을 먼저 실행해주세요.');
      return;
    }

    const categoryId = folderParentCategoryId || selectedOrderFolderId;
    const name = normalizeText(newFolderName);
    if (!categoryId) {
      notify('warning', '상위 자재분류를 선택해주세요.');
      return;
    }
    if (!name) {
      notify('warning', '하위 폴더 이름을 입력해주세요.');
      return;
    }
    if (categoryFolders.some((row) => (
      row.category_id === categoryId &&
      normalizeText(row.name).toLocaleLowerCase('ko-KR') === name.toLocaleLowerCase('ko-KR')
    ))) {
      notify('warning', '해당 분류에 같은 이름의 하위 폴더가 있습니다.');
      return;
    }

    const nextSort = categoryFolders
      .filter((row) => row.category_id === categoryId)
      .reduce((max, row) => Math.max(max, Number(row.sort_order || 0)), 0) + 10;
    const { data: inactiveFolders, error: inactiveFolderError } = await supabase
      .from('material_supply_category_folders')
      .select('id, category_id, name, sort_order, is_active')
      .eq('category_id', categoryId)
      .eq('is_active', false);
    if (inactiveFolderError) {
      notify('error', `하위 폴더 확인 실패: ${inactiveFolderError.message}`);
      return;
    }

    const reusableFolder = (inactiveFolders || []).find((row) => (
      normalizeText(row.name).toLocaleLowerCase('ko-KR') === name.toLocaleLowerCase('ko-KR')
    ));
    const folderQuery = reusableFolder
      ? supabase
          .from('material_supply_category_folders')
          .update({
            name,
            sort_order: nextSort,
            is_active: true,
            updated_by: currentUserId || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', reusableFolder.id)
      : supabase
          .from('material_supply_category_folders')
          .insert({
            category_id: categoryId,
            name,
            sort_order: nextSort,
            is_active: true,
            created_by: currentUserId || null,
            updated_by: currentUserId || null,
          });
    const { data: addedFolder, error } = await folderQuery
      .select('id, category_id, name, sort_order, is_active')
      .single();

    if (error) {
      notify('error', error.code === '23505' ? '이미 등록된 하위 폴더입니다.' : `하위 폴더 추가 실패: ${error.message}`);
      return;
    }

    setCategoryFolders((current) => [...current, addedFolder].sort((a, b) => (
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'ko-KR')
    )));
    setSelectedOrderFolderId(categoryId);
    setSelectedOrderFolderProcess(name);
    setProcessFoldersOpen(true);
    if (!isLocked) {
      setOrder((current) => ({
        ...current,
        categoryId,
        processName: name,
      }));
    }
    setNewFolderName('');
    setFolderDialogOpen(false);
    notify('success', `하위 폴더 "${name}"을 추가했습니다.`);
  };

  const deleteCategoryFolder = async (folder) => {
    if (pageMode !== 'order' && !canManageMaster) {
      notify('warning', '하위 폴더 관리 권한이 없습니다.');
      return;
    }
    if (categoryFolderSchemaMissing || String(folder.id || '').startsWith('default-')) {
      notify('warning', '하위 폴더 저장용 Supabase SQL을 먼저 실행해주세요.');
      return;
    }

    const linkedOrderCount = orders.filter((row) => (
      row.category_id === folder.category_id && row.process_name === folder.name
    )).length;
    const selectedFolderWillClose =
      selectedOrderFolderId === folder.category_id &&
      selectedOrderFolderProcess === folder.name;
    const warningLines = [
      `하위 폴더 "${folder.name}"을 삭제할까요?`,
      linkedOrderCount > 0
        ? `연결된 발주서 ${linkedOrderCount}건은 삭제되지 않고 상위 분류에서 계속 확인할 수 있습니다.`
        : '기존 발주 데이터는 삭제되지 않습니다.',
      ...(selectedFolderWillClose ? ['현재 작성 화면은 선택한 상위 분류의 빈 발주서로 초기화됩니다.'] : []),
    ];
    if (!window.confirm(warningLines.join('\n'))) return;

    setFolderDeletingId(folder.id);
    try {
      const { error } = await supabase
        .from('material_supply_category_folders')
        .update({
          is_active: false,
          updated_by: currentUserId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', folder.id);
      if (error) throw error;

      const remainingFolders = categoryFolders.filter((row) => row.id !== folder.id);
      setCategoryFolders(remainingFolders);
      if (selectedFolderWillClose) {
        setSelectedOrderFolderProcess('');
        setProcessFoldersOpen(
          remainingFolders.some((row) => row.category_id === folder.category_id),
        );
        clearOrderEditorForFolder(folder.category_id);
      }
      notify('success', `하위 폴더 "${folder.name}"을 삭제했습니다.`);
    } catch (error) {
      notify('error', `하위 폴더 삭제 실패: ${error.message}`);
    } finally {
      setFolderDeletingId('');
    }
  };

  const visibleOrders = useMemo(
    () => orders.filter((row) => (mainTab === 'history' ? row.status !== 'draft' : true)),
    [mainTab, orders],
  );
  const categoryFoldersByCategory = useMemo(() => {
    const nextMap = new Map();
    categoryFolders.forEach((folder) => {
      const current = nextMap.get(folder.category_id) || [];
      current.push(folder);
      nextMap.set(folder.category_id, current);
    });
    return nextMap;
  }, [categoryFolders]);
  const folderOrders = useMemo(
    () => {
      return visibleOrders.filter((row) => {
        if ((row.category_id || categories[0]?.id || '') !== selectedOrderFolderId) return false;
        if (!selectedOrderFolderProcess) return true;
        return row.process_name === selectedOrderFolderProcess;
      });
    },
    [categories, selectedOrderFolderId, selectedOrderFolderProcess, visibleOrders],
  );
  const selectedOrderFolderCategory = categories.find(
    (row) => row.id === selectedOrderFolderId,
  );
  const selectedCategoryFolders =
    categoryFoldersByCategory.get(selectedOrderFolderId) || [];
  const showProcessFolderTabs =
    selectedCategoryFolders.length > 0 &&
    processFoldersOpen;
  const requiresOrderFolderSelection =
    (categoryFoldersByCategory.get(order.categoryId) || []).length > 0 &&
    !normalizeText(order.processName);
  const masterProcessOptions = [
    ...new Set([
      ...(categoryFoldersByCategory.get(masterForm.categoryId) || []).map((folder) => folder.name),
      ...PROCESS_OPTIONS,
    ]),
  ];

  const selectedOrderItemCount = orderItems.filter((row, index) =>
    selectedOrderItemKeys.has(getOrderItemKey(row, index)),
  ).length;
  const allOrderItemsSelected =
    orderItems.length > 0 && selectedOrderItemCount === orderItems.length;
  const orderQuantityTotals = orderItems.reduce(
    (totals, row) => ({
      execution: totals.execution + numberValue(row.executionQuantity),
      previous: totals.previous + numberValue(row.previousQuantity),
      current: totals.current + numberValue(row.currentQuantity),
      cumulative: totals.cumulative + numberValue(row.cumulativeQuantity),
    }),
    { execution: 0, previous: 0, current: 0, cumulative: 0 },
  );

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0.8, p: 1 }}>
      <Paper variant="outlined" sx={{ position: 'relative', px: 1.25, py: 0.8, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 210 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>
            {pageMode === 'master' ? '자재 마스터 관리' : '자재발주작성'}
          </Typography>
          {pageMode === 'master' && (
            <Typography sx={{ mt: 0.1, fontSize: '0.64rem', color: '#64748b', fontWeight: 700 }}>
              전 현장에서 공통으로 사용하는 품명·규격·단위·검색 별칭을 관리합니다.
            </Typography>
          )}
        </Box>

        {pageMode === 'order' && (
        <Stack direction="row" spacing={0.5} sx={{ ml: 1 }}>
          <Button
            size="small"
            variant={supplyTab === 'private' ? 'contained' : 'outlined'}
            onClick={() => setSupplyTab('private')}
            sx={{ fontWeight: 800 }}
          >
            사급자재
          </Button>
          <Button size="small" variant="outlined" disabled sx={{ fontWeight: 800 }}>
            지급자재 · 2차 개발
          </Button>
        </Stack>
        )}

        {pageMode === 'order' && supplyTab === 'private' && mainTab === 'order' && (
          <Stack
            direction="row"
            spacing={0.5}
            sx={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1,
            }}
          >
            {!isLocked && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => saveOrder('draft')}
                disabled={saving || orderExcelBusy}
                startIcon={<SaveRoundedIcon />}
                sx={{ fontWeight: 850, whiteSpace: 'nowrap' }}
              >
                저장
              </Button>
            )}
            <Button
              size="small"
              variant="outlined"
              onClick={downloadOrderExcel}
              disabled={saving || orderExcelBusy}
              startIcon={orderExcelBusy ? <CircularProgress size={14} /> : <FileDownloadRoundedIcon />}
              sx={{ fontWeight: 850, whiteSpace: 'nowrap' }}
            >
              엑셀 다운로드
            </Button>
            {!isLocked && (
              <Button
                size="small"
                variant="contained"
                color="success"
                onClick={() => saveOrder('ordered')}
                disabled={saving || orderExcelBusy}
                startIcon={<CheckCircleRoundedIcon />}
                sx={{ fontWeight: 850, whiteSpace: 'nowrap' }}
              >
                발주확정
              </Button>
            )}
            {!isLocked && (
              <Tooltip title="결재라인 설정 후 사용할 수 있습니다.">
                <span>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    disabled
                    sx={{ fontWeight: 850, whiteSpace: 'nowrap' }}
                  >
                    결재요청
                  </Button>
                </span>
              </Tooltip>
            )}
          </Stack>
        )}

        {pageMode === 'order' && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddRoundedIcon fontSize="small" />}
            onClick={createNewOrder}
            sx={{ ml: 'auto', fontWeight: 850, whiteSpace: 'nowrap' }}
          >
            새 발주서
          </Button>
        )}

        {pageMode === 'order' && (
        <Button
          size="small"
          variant={settingsRequired ? 'contained' : 'outlined'}
          color={settingsRequired ? 'warning' : 'primary'}
          startIcon={<SettingsRoundedIcon fontSize="small" />}
          onClick={() => {
            setSettingsTab('basic');
            loadProjectSettings({ openWhenIncomplete: false });
            setSettingsDialogOpen(true);
          }}
          sx={{ fontWeight: 850, whiteSpace: 'nowrap' }}
        >
          기본설정
        </Button>
        )}

        {pageMode === 'order' && settingsRequired && (
          <Chip
            size="small"
            color="warning"
            label="설정 필요"
            sx={{ fontWeight: 850 }}
          />
        )}

        <Tooltip title="새로고침" arrow>
          <IconButton
            size="small"
            onClick={() => {
              loadCategories();
              loadOrders();
              loadProjectSettings({ openWhenIncomplete: false });
              if (mainTab === 'master') loadMasterRows();
            }}
          >
            <RefreshRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Paper>

      {schemaMissing && (
        <Alert severity="warning" sx={{ py: 0.25 }}>
          자재발주 DB 구조가 적용되지 않았습니다. v120 1차 SQL과 이번 패키지의 <b>supabase_v52.48.5.44.122_material_order_settings.sql</b>을 Supabase SQL Editor에서 순서대로 실행해주세요.
        </Alert>
      )}

      {supplyTab !== 'private' ? (
        <Paper variant="outlined" sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <Typography sx={{ color: '#94a3b8', fontWeight: 800 }}>지급자재 신청은 타입별 소요량 + 골구도 회차 연동 방식으로 2차 개발 예정입니다.</Typography>
        </Paper>
      ) : mainTab === 'master' ? (
        <Paper variant="outlined" sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" spacing={0.7} alignItems="center" sx={{ p: 0.8, borderBottom: '1px solid #e2e8f0' }}>
            <TextField
              size="small"
              value={masterSearch}
              onChange={(event) => setMasterSearch(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && loadMasterRows()}
              placeholder="표준품명 · 규격 · 별칭 검색"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment>
                ),
              }}
              sx={{ width: 320 }}
            />
            <TextField select size="small" label="자재분류" value={masterCategoryId} onChange={(event) => setMasterCategoryId(event.target.value)} sx={{ width: 170 }}>
              <MenuItem value="">전체 분류</MenuItem>
              {categories.map((row) => <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}
            </TextField>
            <Button variant="outlined" onClick={loadMasterRows} startIcon={<SearchRoundedIcon />} disabled={masterLoading}>조회</Button>
            {canManageMaster && (
              <Button variant="outlined" onClick={() => setCategoryDialogOpen(true)} startIcon={<CategoryRoundedIcon />}>분류 관리</Button>
            )}
            {canManageMaster && (
              <>
                <Stack
                  direction="row"
                  spacing={0.25}
                  alignItems="center"
                  sx={{ ml: 'auto !important' }}
                >
                  {selectedMasterIds.size > 0 && (
                    <Chip
                      size="small"
                      color="primary"
                      variant="outlined"
                      label={`${selectedMasterIds.size.toLocaleString()}개 선택`}
                      sx={{ mr: 0.35, fontWeight: 850 }}
                    />
                  )}
                  <Tooltip title="선택 자재 삭제">
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={deleteSelectedMasterRows}
                        disabled={masterActionBusy || selectedMasterIds.size === 0}
                      >
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Divider orientation="vertical" flexItem sx={{ mx: 0.3 }} />
                  <Tooltip title="선택 자재 위로 이동">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => moveSelectedMasterRows('up')}
                        disabled={masterActionBusy || selectedMasterIds.size === 0}
                      >
                        <ArrowUpwardRoundedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="선택 자재 아래로 이동">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => moveSelectedMasterRows('down')}
                        disabled={masterActionBusy || selectedMasterIds.size === 0}
                      >
                        <ArrowDownwardRoundedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
                <Button
                  variant="outlined"
                  onClick={downloadMaterialMasterExcel}
                  startIcon={<FileDownloadRoundedIcon />}
                  disabled={masterExcelBusy || masterActionBusy}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Excel 다운로드
                </Button>
                <input
                  ref={masterExcelInputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  hidden
                  onChange={uploadMaterialMasterExcel}
                />
                <Button
                  variant="outlined"
                  onClick={() => masterExcelInputRef.current?.click()}
                  startIcon={masterExcelBusy ? <CircularProgress size={14} /> : <FileUploadRoundedIcon />}
                  disabled={masterExcelBusy || masterActionBusy}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Excel 업로드
                </Button>
                <Button
                  variant="contained"
                  onClick={openNewMaster}
                  startIcon={<AddRoundedIcon />}
                  disabled={masterExcelBusy || masterActionBusy}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  자재 등록
                </Button>
              </>
            )}
            {!canManageMaster && (
              <Chip label="조회 전용" size="small" variant="outlined" sx={{ ml: 'auto !important', fontWeight: 800 }} />
            )}
          </Stack>

          <TableContainer sx={{ flex: 1, minHeight: 0 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell
                    padding="checkbox"
                    align="center"
                    sx={{ width: 44, bgcolor: '#f8fafc' }}
                  >
                    <Checkbox
                      size="small"
                      checked={
                        masterRows.length > 0 &&
                        masterRows.every((row) => selectedMasterIds.has(row.id))
                      }
                      indeterminate={
                        masterRows.some((row) => selectedMasterIds.has(row.id)) &&
                        !masterRows.every((row) => selectedMasterIds.has(row.id))
                      }
                      onChange={toggleAllMasterSelection}
                      disabled={masterRows.length === 0 || masterActionBusy}
                      inputProps={{ 'aria-label': '전체 자재 선택' }}
                    />
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ width: 58, fontWeight: 900, bgcolor: '#f8fafc', whiteSpace: 'nowrap' }}
                  >
                    순서
                  </TableCell>
                  {['분류', '공정', '표준 품명', '표준 규격', '단위', '제조사', '주요자재', '별칭', '수정'].map((label) => (
                    <TableCell key={label} align={['주요자재', '수정'].includes(label) ? 'center' : 'left'} sx={{ fontWeight: 900, bgcolor: '#f8fafc', whiteSpace: 'nowrap' }}>{label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {masterLoading ? (
                  <TableRow><TableCell colSpan={11} align="center" sx={{ py: 6 }}><CircularProgress size={24} /></TableCell></TableRow>
                ) : masterRows.length === 0 ? (
                  <TableRow><TableCell colSpan={11} align="center" sx={{ py: 8, color: '#94a3b8' }}>등록된 자재가 없거나 검색 결과가 없습니다.</TableCell></TableRow>
                ) : masterRows.map((row, index) => (
                  <TableRow key={row.id} hover selected={selectedMasterIds.has(row.id)}>
                    <TableCell padding="checkbox" align="center">
                      <Checkbox
                        size="small"
                        checked={selectedMasterIds.has(row.id)}
                        onChange={() => toggleMasterSelection(row.id)}
                        disabled={masterActionBusy}
                        inputProps={{ 'aria-label': `${row.standard_name} 선택` }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ color: '#64748b', fontWeight: 750 }}>
                      {(index + 1).toLocaleString()}
                    </TableCell>
                    <TableCell>{categoryNameById(categories, row.category_id)}</TableCell>
                    <TableCell>{row.process_name || '-'}</TableCell>
                    <TableCell sx={{ fontWeight: 850 }}>{row.standard_name}</TableCell>
                    <TableCell>{row.specification || '-'}</TableCell>
                    <TableCell>{row.unit || '-'}</TableCell>
                    <TableCell>{row.manufacturer || '-'}</TableCell>
                    <TableCell align="center">
                      {row.is_main_material ? (
                        <Chip size="small" color="primary" variant="outlined" label="기본" sx={{ fontWeight: 850 }} />
                      ) : (
                        <Typography sx={{ fontSize: '0.68rem', color: '#cbd5e1' }}>-</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 260 }}>
                      <Stack direction="row" spacing={0.35} useFlexGap flexWrap="wrap">
                        {(row.aliases || []).slice(0, 4).map((alias) => <Chip key={alias} label={alias} size="small" variant="outlined" />)}
                        {(row.aliases || []).length > 4 && <Chip label={`+${row.aliases.length - 4}`} size="small" />}
                      </Stack>
                    </TableCell>
                    <TableCell align="center">
                      {canManageMaster ? (
                        <IconButton size="small" onClick={() => openEditMaster(row)}><EditRoundedIcon fontSize="small" /></IconButton>
                      ) : (
                        <Typography sx={{ fontSize: '0.68rem', color: '#cbd5e1' }}>-</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 0.8 }}>
          <Paper variant="outlined" sx={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" alignItems="center" sx={{ px: 0.9, py: 0.7, borderBottom: '1px solid #e2e8f0' }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 900 }}>발주서 목록</Typography>
              <Chip label={`${visibleOrders.length}건`} size="small" sx={{ ml: 0.5 }} />
            </Stack>
            <Box sx={{ p: 0.55, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc', maxHeight: 210, overflowY: 'auto' }}>
              <Stack spacing={0.35}>
                {categories.map((category) => {
                  const orderCount = visibleOrders.filter((row) => (
                    (row.category_id || categories[0]?.id || '') === category.id
                  )).length;
                  const categoryFolderOptions =
                    categoryFoldersByCategory.get(category.id) || [];
                  const hasProcessFolders = categoryFolderOptions.length > 0;
                  const categoryFoldersOpen =
                    hasProcessFolders &&
                    selectedOrderFolderId === category.id &&
                    processFoldersOpen;
                  const selected =
                    selectedOrderFolderId === category.id &&
                    (!hasProcessFolders || !selectedOrderFolderProcess);
                  return (
                    <Box key={category.id}>
                      <Button
                        fullWidth
                        size="small"
                        variant={selected ? 'contained' : 'text'}
                        color={selected ? 'primary' : 'inherit'}
                        startIcon={
                          categoryFoldersOpen
                            ? <FolderOpenRoundedIcon fontSize="small" />
                            : <FolderRoundedIcon fontSize="small" />
                        }
                        endIcon={<Chip label={`${orderCount}`} size="small" />}
                        onClick={() => {
                          const folderChanged =
                            selectedOrderFolderId !== category.id ||
                            selectedOrderFolderProcess !== '';
                          setSelectedOrderFolderId(category.id);
                          if (hasProcessFolders) {
                            setProcessFoldersOpen(
                              selectedOrderFolderId === category.id
                                ? !processFoldersOpen
                                : true,
                            );
                            setSelectedOrderFolderProcess('');
                            if (folderChanged && order.id) {
                              clearOrderEditorForFolder(category.id);
                            } else if (!isLocked && !order.id) {
                              setOrder((current) => ({ ...current, categoryId: category.id, processName: '' }));
                            }
                          } else {
                            setProcessFoldersOpen(false);
                            setSelectedOrderFolderProcess('');
                            if (folderChanged && order.id) {
                              clearOrderEditorForFolder(category.id);
                            } else if (!isLocked && !order.id) {
                              setOrder((current) => ({
                                ...current,
                                categoryId: category.id,
                                processName: '',
                              }));
                            }
                          }
                        }}
                        sx={{
                          justifyContent: 'flex-start',
                          minHeight: 29,
                          px: 0.8,
                          fontSize: '0.68rem',
                          fontWeight: 850,
                          '& .MuiButton-endIcon': { ml: 'auto' },
                          '& .MuiChip-root': { height: 18, fontSize: '0.58rem' },
                        }}
                      >
                        {category.name}
                      </Button>
                      {categoryFoldersOpen && (
                        <Stack spacing={0.2} sx={{ mt: 0.2, ml: 2.2 }}>
                          {categoryFolderOptions.map((folder) => {
                            const processName = folder.name;
                            const processSelected =
                              selectedOrderFolderId === category.id &&
                              selectedOrderFolderProcess === processName;
                            const processCount = visibleOrders.filter((row) => (
                              (row.category_id || categories[0]?.id || '') === category.id &&
                              row.process_name === processName
                            )).length;
                            return (
                              <Button
                                key={folder.id}
                                fullWidth
                                size="small"
                                variant={processSelected ? 'contained' : 'text'}
                                color={processSelected ? 'primary' : 'inherit'}
                                startIcon={<FolderRoundedIcon sx={{ fontSize: '0.9rem !important' }} />}
                                endIcon={<Chip label={`${processCount}`} size="small" />}
                                onClick={() => {
                                  const folderChanged =
                                    selectedOrderFolderId !== category.id ||
                                    selectedOrderFolderProcess !== processName;
                                  setSelectedOrderFolderId(category.id);
                                  setSelectedOrderFolderProcess(processName);
                                  if (folderChanged && order.id) {
                                    clearOrderEditorForFolder(category.id, processName);
                                  } else if (!isLocked && !order.id) {
                                    setOrder((current) => ({
                                      ...current,
                                      categoryId: category.id,
                                      processName,
                                    }));
                                  }
                                }}
                                sx={{
                                  justifyContent: 'flex-start',
                                  minHeight: 25,
                                  px: 0.65,
                                  fontSize: '0.64rem',
                                  fontWeight: 800,
                                  '& .MuiButton-endIcon': { ml: 'auto' },
                                  '& .MuiChip-root': { height: 17, fontSize: '0.56rem' },
                                }}
                              >
                                {processName}
                              </Button>
                            );
                          })}
                        </Stack>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {folderOrders.length === 0 ? (
                <Box sx={{ height: '100%', minHeight: 160, display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: '0.72rem' }}>선택한 분류의 발주서가 없습니다.</Box>
              ) : (
                folderOrders.map((row) => {
                  const selected = row.id === order.id;
                  return (
                    <Box
                      key={row.id}
                      onClick={() => openOrder(row)}
                      sx={{
                        px: 1,
                        py: 0.8,
                        cursor: 'pointer',
                        borderBottom: '1px solid #edf2f7',
                        bgcolor: selected ? '#eff6ff' : '#fff',
                        '&:hover': { bgcolor: selected ? '#eff6ff' : '#f8fafc' },
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={0.6}>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 900, color: '#0f172a' }}>{row.order_no}</Typography>
                        <Chip
                          label={ORDER_STATUS_LABELS[row.status] || row.status}
                          size="small"
                          color={['ordered', 'confirmed'].includes(row.status) ? 'success' : row.status === 'draft' ? 'warning' : 'default'}
                          variant="outlined"
                          sx={{ ml: 'auto' }}
                        />
                      </Stack>
                      <Typography sx={{ mt: 0.25, fontSize: '0.66rem', color: '#475569', fontWeight: 750 }}>
                        {row.order_date} · {row.process_name || categoryNameById(categories, row.category_id)}
                      </Typography>
                      <Typography noWrap sx={{ mt: 0.1, fontSize: '0.62rem', color: '#94a3b8' }}>
                        요청자 {row.requester_name || '-'} · 납품 {row.delivery_date || '-'}
                      </Typography>
                    </Box>
                  );
                })
              )}
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" alignItems="center" spacing={0.7} sx={{ px: 1, py: 0.7, borderBottom: '1px solid #cbd5e1', bgcolor: '#eef1f4' }}>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 900 }}>사급자재 발주서</Typography>
              {order.orderNo && <Chip label={order.orderNo} size="small" variant="outlined" />}
              {order.status !== 'draft' && <Chip label={ORDER_STATUS_LABELS[order.status]} size="small" color={['ordered', 'confirmed'].includes(order.status) ? 'success' : 'default'} />}
              {order.id && <Button size="small" color="error" variant="outlined" onClick={deleteOrder} startIcon={<DeleteOutlineRoundedIcon />} sx={{ ml: 'auto' }}>삭제</Button>}
            </Stack>

            <Stack
              direction="row"
              alignItems="center"
              spacing={0.8}
              sx={{
                px: 0.9,
                py: 0.55,
                borderBottom: '1px solid #cbd5e1',
                bgcolor: '#f8fafc',
                minWidth: 0,
              }}
            >
              <Typography sx={{ flexShrink: 0, fontSize: '0.69rem', fontWeight: 900, color: '#334155' }}>
                {showProcessFolderTabs ? selectedOrderFolderCategory?.name : '자재분류'}
              </Typography>
              {requiresOrderFolderSelection && !isLocked && (
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  label="하위폴더 선택 필요"
                  sx={{ height: 21, flexShrink: 0, fontSize: '0.6rem', fontWeight: 850 }}
                />
              )}
              <Stack
                role="tablist"
                aria-label="발주서 자재분류"
                direction="row"
                spacing={0.45}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  overflowX: 'auto',
                  pb: 0.15,
                  '&::-webkit-scrollbar': { height: 4 },
                  '&::-webkit-scrollbar-thumb': { bgcolor: '#cbd5e1', borderRadius: 2 },
                }}
              >
                {showProcessFolderTabs ? (
                  selectedCategoryFolders.map((folder) => {
                    const processName = folder.name;
                    const selected = selectedOrderFolderProcess === processName;
                    return (
                      <Button
                        key={folder.id}
                        role="tab"
                        aria-selected={selected}
                        size="small"
                        variant={selected ? 'contained' : 'outlined'}
                        disabled={isLocked}
                        onClick={() => {
                          setSelectedOrderFolderId(selectedOrderFolderCategory.id);
                          setSelectedOrderFolderProcess(processName);
                          const folderChanged =
                            selectedOrderFolderProcess !== processName;
                          if (folderChanged && order.id) {
                            clearOrderEditorForFolder(
                              selectedOrderFolderCategory.id,
                              processName,
                            );
                          } else {
                            setOrder((current) => ({
                              ...current,
                              categoryId: selectedOrderFolderCategory.id,
                              processName,
                            }));
                          }
                        }}
                        sx={{
                          minWidth: 'max-content',
                          height: 25,
                          px: 1,
                          py: 0,
                          borderRadius: 1,
                          fontSize: '0.66rem',
                          fontWeight: 850,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {processName}
                      </Button>
                    );
                  })
                ) : (
                  <>
                    {categories.map((category) => {
                      const selected = selectedOrderFolderId === category.id;
                      const categoryFolderOptions =
                        categoryFoldersByCategory.get(category.id) || [];
                      return (
                        <Button
                          key={category.id}
                          role="tab"
                          aria-selected={selected}
                          size="small"
                          variant={selected ? 'contained' : 'outlined'}
                          disabled={isLocked}
                          onClick={() => {
                            const folderChanged =
                              selectedOrderFolderId !== category.id ||
                              selectedOrderFolderProcess !== '';
                            if (folderChanged && order.id) {
                              clearOrderEditorForFolder(category.id);
                            } else {
                              setOrder((current) => ({
                                ...current,
                                categoryId: category.id,
                                processName: '',
                              }));
                            }
                            setSelectedOrderFolderId(category.id);
                            setSelectedOrderFolderProcess('');
                            setProcessFoldersOpen(categoryFolderOptions.length > 0);
                          }}
                          sx={{
                            minWidth: 'max-content',
                            height: 25,
                            px: 1,
                            py: 0,
                            borderRadius: 1,
                            fontSize: '0.66rem',
                            fontWeight: 850,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {category.name}
                        </Button>
                      );
                    })}
                    <Button
                      size="small"
                      variant="outlined"
                      color="success"
                      startIcon={<AddRoundedIcon />}
                      onClick={() => setCategoryDialogOpen(true)}
                      sx={{
                        minWidth: 'max-content',
                        height: 25,
                        px: 1,
                        py: 0,
                        borderStyle: 'dashed',
                        borderRadius: 1,
                        fontSize: '0.66rem',
                        fontWeight: 850,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      분류 추가
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="success"
                      startIcon={<PlaylistAddRoundedIcon />}
                      onClick={() => openFolderDialog()}
                      disabled={!selectedOrderFolderId}
                      sx={{
                        minWidth: 'max-content',
                        height: 25,
                        px: 1,
                        py: 0,
                        borderStyle: 'dashed',
                        borderRadius: 1,
                        fontSize: '0.66rem',
                        fontWeight: 850,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      하위 폴더 관리
                    </Button>
                  </>
                )}
                {showProcessFolderTabs && (
                  <Button
                    size="small"
                    variant="outlined"
                    color="success"
                    startIcon={<AddRoundedIcon />}
                    onClick={() => openFolderDialog(selectedOrderFolderId)}
                    sx={{
                      minWidth: 'max-content',
                      height: 25,
                      px: 1,
                      py: 0,
                      borderStyle: 'dashed',
                      borderRadius: 1,
                      fontSize: '0.66rem',
                      fontWeight: 850,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    폴더 관리
                  </Button>
                )}
              </Stack>
            </Stack>

            <Box sx={{ p: 0.7, borderBottom: '1px solid #cbd5e1', bgcolor: '#eef1f4' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', columnGap: 0.7, rowGap: 0.55 }}>
                <TextField size="small" label="발주일" type="date" slotProps={{ inputLabel: { shrink: true } }} value={order.orderDate} onChange={(e) => setOrder((current) => ({ ...current, orderDate: e.target.value }))} disabled={isLocked} sx={compactEntryFieldSx(order.orderDate)} />
                <TextField size="small" label="요청자" slotProps={{ inputLabel: { shrink: true } }} value={order.requesterName} onChange={(e) => setOrder((current) => ({ ...current, requesterName: e.target.value }))} disabled={isLocked} sx={compactEntryFieldSx(order.requesterName)} />
                <Box sx={compactSelectFieldSx(order.categoryId, isLocked)}>
                  <Box component="label" htmlFor="material-order-category">자재분류</Box>
                  <Box
                    component="select"
                    id="material-order-category"
                    value={order.categoryId}
                    onChange={(event) => {
                      const nextCategoryId = event.target.value;
                      const nextCategoryFolders =
                        categoryFoldersByCategory.get(nextCategoryId) || [];
                      setOrder((current) => ({
                        ...current,
                        categoryId: nextCategoryId,
                        processName: '',
                      }));
                      setSelectedOrderFolderId(nextCategoryId);
                      setSelectedOrderFolderProcess('');
                      setProcessFoldersOpen(nextCategoryFolders.length > 0);
                    }}
                    disabled={isLocked}
                  >
                    {categories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </Box>
                </Box>
                <TextField size="small" label="납품희망일" type="date" slotProps={{ inputLabel: { shrink: true } }} value={order.deliveryDate} onChange={(e) => setOrder((current) => ({ ...current, deliveryDate: e.target.value }))} disabled={isLocked} sx={compactEntryFieldSx(order.deliveryDate)} />
                <TextField size="small" label="납품장소" slotProps={{ inputLabel: { shrink: true } }} value={order.deliveryLocation} onChange={(e) => setOrder((current) => ({ ...current, deliveryLocation: e.target.value }))} disabled={isLocked} sx={compactEntryFieldSx(order.deliveryLocation)} />
                <TextField size="small" label="수령자" slotProps={{ inputLabel: { shrink: true } }} value={order.receiverName} onChange={(e) => setOrder((current) => ({ ...current, receiverName: e.target.value }))} disabled={isLocked} sx={compactEntryFieldSx(order.receiverName)} />
                <TextField size="small" label="연락처" slotProps={{ inputLabel: { shrink: true } }} value={order.receiverPhone} onChange={(e) => setOrder((current) => ({ ...current, receiverPhone: e.target.value }))} disabled={isLocked} sx={compactEntryFieldSx(order.receiverPhone)} />
              </Box>
            </Box>

            <Stack direction="row" alignItems="center" spacing={0.35} sx={{ px: 0.9, py: 0.6, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 900 }}>발주 품목 {orderItems.length}개</Typography>
              {!isLocked && (
                <Stack
                  direction="row"
                  spacing={0.25}
                  alignItems="center"
                  sx={{ ml: '6px !important' }}
                >
                  <Tooltip title="빈 행 추가" arrow>
                    <IconButton size="small" color="primary" onClick={addBlankOrderItem}>
                      <AddRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="선택 행 삭제" arrow>
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={deleteSelectedOrderItems}
                        disabled={selectedOrderItemCount === 0}
                      >
                        <RemoveRoundedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="선택 행 위로" arrow>
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => moveSelectedOrderItems(-1)}
                        disabled={selectedOrderItemCount === 0}
                      >
                        <ArrowUpwardRoundedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="선택 행 아래로" arrow>
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => moveSelectedOrderItems(1)}
                        disabled={selectedOrderItemCount === 0}
                      >
                        <ArrowDownwardRoundedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              )}
            </Stack>

            <TableContainer sx={{ flex: 1, minHeight: 0 }}>
              <Table
                stickyHeader
                size="small"
                sx={{
                  minWidth: 1320,
                  tableLayout: 'fixed',
                  borderCollapse: 'separate',
                  borderSpacing: 0,
                  '& .MuiTableCell-root': {
                    borderRight: '1px solid #cbd5e1',
                    borderBottom: '1px solid #cbd5e1',
                    fontSize: '0.66rem',
                    lineHeight: 1.25,
                  },
                  '& .MuiTableCell-root:first-of-type': {
                    borderLeft: '1px solid #cbd5e1',
                  },
                  '& .MuiTableHead-root .MuiTableCell-root': {
                    borderTop: '1px solid #cbd5e1',
                    py: 0.45,
                    fontSize: '0.64rem',
                  },
                  '& .MuiInputBase-input': {
                    fontSize: '0.68rem',
                  },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell align="center" sx={{ width: 76, px: 0.35, bgcolor: '#f8fafc', fontWeight: 900, whiteSpace: 'nowrap' }}>
                      <Box
                        sx={{
                          width: '100%',
                          display: 'grid',
                          gridTemplateColumns: '30px minmax(0, 1fr)',
                          alignItems: 'center',
                        }}
                      >
                        <Box sx={{ display: 'grid', placeItems: 'center' }}>
                          {!isLocked && (
                            <Checkbox
                              size="small"
                              checked={allOrderItemsSelected}
                              indeterminate={selectedOrderItemCount > 0 && !allOrderItemsSelected}
                              onChange={(event) => toggleAllOrderItems(event.target.checked)}
                              inputProps={{ 'aria-label': '발주 품목 전체 선택' }}
                              sx={{ p: 0.25 }}
                            />
                          )}
                        </Box>
                        <Box component="span" sx={{ textAlign: 'center' }}>No</Box>
                      </Box>
                    </TableCell>
                    {[
                      ['품명', 220, 'left'],
                      ['규격', 175, 'left'],
                      ['단위', 90, 'center'],
                      ['실행물량', 105, 'center'],
                      ['전회발주량', 105, 'center'],
                      ['금회발주량', 115, 'center'],
                      ['누계발주량', 105, 'center'],
                      ['발주율', 88, 'center'],
                      ['비고', 190, 'left'],
                    ].map(([label, width, align]) => (
                      <TableCell
                        key={label}
                        align={align}
                        sx={{ width, bgcolor: '#f8fafc', fontWeight: 900, whiteSpace: 'nowrap' }}
                      >
                        {label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={10} align="center" sx={{ py: 7 }}><CircularProgress size={24} /></TableCell></TableRow>
                  ) : orderItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 9, color: '#94a3b8' }}>
                        상단의 + 버튼을 눌러 행을 추가한 뒤 품명을 입력해주세요. 비슷한 자재마스터 항목이 자동으로 표시됩니다.
                      </TableCell>
                    </TableRow>
                  ) : orderItems.map((row, index) => {
                    const over = row.executionRatio > 100;
                    const itemKey = getOrderItemKey(row, index);
                    const selected = selectedOrderItemKeys.has(itemKey);
                    return (
                      <TableRow key={itemKey} hover selected={selected}>
                        <TableCell align="center" sx={{ px: 0.35 }}>
                          <Box
                            sx={{
                              width: '100%',
                              display: 'grid',
                              gridTemplateColumns: '30px minmax(0, 1fr)',
                              alignItems: 'center',
                            }}
                          >
                            <Box sx={{ display: 'grid', placeItems: 'center' }}>
                              {!isLocked && (
                                <Checkbox
                                  size="small"
                                  checked={selected}
                                  onChange={() => toggleOrderItemSelection(itemKey)}
                                  inputProps={{ 'aria-label': `${index + 1}번 발주 품목 선택` }}
                                  sx={{ p: 0.25 }}
                                />
                              )}
                            </Box>
                            <Typography component="span" sx={{ textAlign: 'center', fontSize: '0.64rem', fontWeight: 750 }}>
                              {index + 1}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ p: 0.35 }}>
                          <Autocomplete
                            freeSolo
                            openOnFocus
                            slots={{ popper: ScaleAwareAutocompletePopper }}
                            size="small"
                            options={orderMaterialOptions}
                            loading={orderMaterialOptionsLoading}
                            loadingText="자재마스터를 불러오는 중입니다."
                            filterOptions={filterOrderMaterialOptions}
                            slotProps={{
                              listbox: {
                                sx: {
                                  p: 0,
                                  maxHeight: 276,
                                  overflowY: 'auto',
                                  '& .MuiAutocomplete-option': {
                                    minHeight: '46px !important',
                                    height: '46px !important',
                                    boxSizing: 'border-box',
                                  },
                                },
                              },
                            }}
                            getOptionLabel={(option) =>
                              typeof option === 'string' ? option : option.standard_name || ''
                            }
                            getOptionKey={(option) =>
                              option.projectMaterialId || option.materialId || option.id
                            }
                            value={row.standardName || ''}
                            onOpen={() => setOpenMaterialHintKey(itemKey)}
                            onClose={() =>
                              setOpenMaterialHintKey((current) => current === itemKey ? '' : current)
                            }
                            onInputChange={(_, value, reason) => {
                              if (reason === 'input' || reason === 'clear') {
                                updateOrderItem(index, 'standardName', value);
                              }
                            }}
                            onChange={(_, value) => {
                              if (value && typeof value === 'object') {
                                applyMaterialHint(index, value);
                              } else if (typeof value === 'string') {
                                updateOrderItem(index, 'standardName', value);
                              }
                            }}
                            disabled={isLocked}
                            noOptionsText="일치하는 자재가 없습니다. 직접 입력할 수 있습니다."
                            sx={entryFieldSx(row.standardName)}
                            renderOption={(props, option) => {
                              const { key, ...optionProps } = props;
                              return (
                                <Box component="li" key={key} {...optionProps} sx={{ display: 'block !important', py: '6px !important' }}>
                                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 900 }}>
                                    {option.standard_name}
                                    {option.projectMaterialId && !option.materialId ? (
                                      <Box component="span" sx={{ ml: 0.6, color: '#2563eb', fontSize: '0.58rem' }}>
                                        현장 입력
                                      </Box>
                                    ) : null}
                                  </Typography>
                                  <Typography sx={{ mt: 0.1, fontSize: '0.62rem', color: '#64748b' }}>
                                    {option.specification || '규격 없음'} · {option.unit || '단위 없음'}
                                    {option.executionQuantity > 0 ? ` · 실행 ${formatNumber(option.executionQuantity)}` : ''}
                                  </Typography>
                                </Box>
                              );
                            }}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                inputRef={(node) => setOrderItemInputRef(itemKey, 'standardName', node)}
                                onKeyDown={(event) => handleOrderGridKeyDown(event, index, 'standardName')}
                                placeholder="품명 입력"
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell sx={{ p: 0.35 }}>
                          <TextField
                            size="small"
                            fullWidth
                            value={row.specification}
                            onChange={(event) => updateOrderItem(index, 'specification', event.target.value)}
                            onKeyDown={(event) => handleOrderGridKeyDown(event, index, 'specification')}
                            inputRef={(node) => setOrderItemInputRef(itemKey, 'specification', node)}
                            placeholder="규격"
                            disabled={isLocked}
                            sx={entryFieldSx(row.specification)}
                          />
                        </TableCell>
                        <TableCell sx={{ p: 0.35 }}>
                          <TextField
                            size="small"
                            fullWidth
                            value={row.unit}
                            onChange={(event) => updateOrderItem(index, 'unit', event.target.value)}
                            onKeyDown={(event) => handleOrderGridKeyDown(event, index, 'unit')}
                            inputRef={(node) => setOrderItemInputRef(itemKey, 'unit', node)}
                            placeholder="단위"
                            disabled={isLocked}
                            inputProps={{ style: { textAlign: 'center' } }}
                            sx={entryFieldSx(row.unit)}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ bgcolor: '#ffffff' }}>{formatNumber(row.executionQuantity)}</TableCell>
                        <TableCell align="right" sx={{ bgcolor: '#ffffff' }}>{formatNumber(row.previousQuantity)}</TableCell>
                        <TableCell sx={{ p: 0.35 }}>
                          <TextField
                            size="small"
                            fullWidth
                            value={formatNumber(row.currentQuantity)}
                            onChange={(event) => updateOrderItem(index, 'currentQuantity', event.target.value)}
                            onKeyDown={(event) => handleOrderGridKeyDown(event, index, 'currentQuantity')}
                            inputRef={(node) => setOrderItemInputRef(itemKey, 'currentQuantity', node)}
                            disabled={isLocked}
                            inputProps={{ inputMode: 'decimal', style: { textAlign: 'right' } }}
                            sx={entryFieldSx(numberValue(row.currentQuantity) > 0 ? row.currentQuantity : '')}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ bgcolor: '#ffffff', fontWeight: 850 }}>{formatNumber(row.cumulativeQuantity)}</TableCell>
                        <TableCell align="center">
                          <Typography
                            component="span"
                            sx={{
                              fontSize: '0.64rem',
                              fontWeight: 850,
                              color: over
                                ? '#d32f2f'
                                : row.executionRatio >= 90
                                  ? '#b45309'
                                  : '#475569',
                            }}
                          >
                            {row.executionRatio.toFixed(1)}%
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ p: 0.35 }}>
                          <TextField
                            size="small"
                            fullWidth
                            value={row.note}
                            onChange={(event) => updateOrderItem(index, 'note', event.target.value)}
                            onKeyDown={(event) => handleOrderGridKeyDown(event, index, 'note')}
                            inputRef={(node) => setOrderItemInputRef(itemKey, 'note', node)}
                            placeholder="비고"
                            disabled={isLocked}
                            sx={entryFieldSx(row.note, false)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {orderItems.length > 0 && (
                    <TableRow
                      sx={{
                        position: 'sticky',
                        bottom: 0,
                        zIndex: 1,
                        '& .MuiTableCell-root': {
                          bgcolor: '#dff1f5',
                          color: '#164e63',
                          fontWeight: 900,
                        },
                      }}
                    >
                      <TableCell align="center">합계</TableCell>
                      <TableCell colSpan={3} />
                      <TableCell align="right">{formatNumber(orderQuantityTotals.execution)}</TableCell>
                      <TableCell align="right">{formatNumber(orderQuantityTotals.previous)}</TableCell>
                      <TableCell align="right">{formatNumber(orderQuantityTotals.current)}</TableCell>
                      <TableCell align="right">{formatNumber(orderQuantityTotals.cumulative)}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      )}

      <Dialog
        open={settingsDialogOpen}
        onClose={(_, reason) => {
          if (settingsRequired || settingsSaving) return;
          if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
            setSettingsDialogOpen(false);
          }
        }}
        disableEscapeKeyDown={settingsRequired}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle sx={{ pb: 0.8 }}>
          <Stack direction="row" alignItems="center" spacing={0.8}>
            <SettingsRoundedIcon color="primary" fontSize="small" />
            <Box>
              <Typography sx={{ fontSize: '1rem', fontWeight: 900 }}>
                자재발주 기본설정
              </Typography>
              <Typography sx={{ mt: 0.05, fontSize: '0.64rem', color: '#64748b' }}>
                {projectName} · 발주서에 반복 입력되는 기본정보를 설정합니다.
              </Typography>
            </Box>
            {settingsRequired && (
              <Chip
                size="small"
                color="warning"
                label="필수 설정"
                sx={{ ml: 'auto !important', fontWeight: 850 }}
              />
            )}
          </Stack>
        </DialogTitle>

        <Tabs
          value={settingsTab}
          onChange={(_, value) => setSettingsTab(value)}
          sx={{
            position: 'relative',
            px: 1.5,
            minHeight: 36,
            '&::after': {
              content: '""',
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: '1px',
              bgcolor: '#e2e8f0',
              pointerEvents: 'none',
              zIndex: 0,
            },
            /*
              화면 90% CSS zoom에서는 MUI 기본 indicator가 getBoundingClientRect로
              계산한 left/width와 실제 Tab 위치가 어긋날 수 있다. 기본 indicator를
              숨기고 선택된 Tab 자체에 밑줄을 붙여 화면배율과 무관하게 정렬한다.
            */
            '& .MuiTabs-indicator': {
              display: 'none',
            },
            '& .MuiTab-root': {
              minHeight: 36,
              py: 0.4,
              position: 'relative',
              overflow: 'visible',
              fontSize: '0.74rem',
              fontWeight: 850,
            },
            '& .MuiTab-root.Mui-selected::after': {
              content: '""',
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: '2px',
              bgcolor: '#2563eb',
              borderRadius: '2px 2px 0 0',
              pointerEvents: 'none',
              zIndex: 1,
            },
          }}
        >
          <Tab value="basic" label="기본정보" />
          <Tab
            value="history"
            label={`변경이력 (${settingsHistory.length})`}
          />
        </Tabs>

        <DialogContent
          dividers
          sx={{
            p: 1.5,
            minHeight: 430,
            borderTop: 'none',
          }}
        >
          {settingsLoading ? (
            <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}>
              <CircularProgress size={26} />
            </Box>
          ) : settingsTab === 'basic' ? (
            <Box>
              <Alert severity="info" sx={{ mb: 1.2, py: 0.25 }}>
                아래 값은 새 발주서를 만들 때 자동으로 입력됩니다. 발주서별로 다른 경우에는 작성 화면에서 그대로 수정할 수 있습니다.
              </Alert>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 1,
                }}
              >
                <TextField
                  size="small"
                  required
                  label="작성자 = 요청자"
                  value={settingsForm.requesterName}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      requesterName: event.target.value,
                    }))
                  }
                  helperText="새 발주서의 요청자 기본값"
                />
                <TextField
                  size="small"
                  required
                  label="수령자"
                  value={settingsForm.receiverName}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      receiverName: event.target.value,
                    }))
                  }
                  helperText="현장 자재 기본 수령자"
                />
                <TextField
                  size="small"
                  required
                  label="연락처"
                  value={settingsForm.receiverPhone}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      receiverPhone: event.target.value,
                    }))
                  }
                  helperText="수령자 연락처"
                />
                <TextField
                  size="small"
                  required
                  label="납품장소"
                  value={settingsForm.deliveryLocation}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      deliveryLocation: event.target.value,
                    }))
                  }
                  helperText="현장 기본 납품 위치"
                />
              </Box>

              <Paper
                variant="outlined"
                sx={{
                  mt: 1.5,
                  p: 1.2,
                  bgcolor: '#f8fafc',
                  borderColor: '#e2e8f0',
                }}
              >
                <Typography sx={{ fontSize: '0.74rem', fontWeight: 900 }}>
                  기본값 적용 방식
                </Typography>
                <Typography sx={{ mt: 0.45, fontSize: '0.68rem', color: '#64748b', lineHeight: 1.7 }}>
                  기본설정을 저장한 이후 생성하는 발주서에는 작성자(요청자), 수령자, 연락처, 납품장소가 자동 입력됩니다. 이미 저장된 발주서의 값은 변경하지 않으며, 새 발주서에서 필요할 때 직접 수정할 수 있습니다.
                </Typography>
              </Paper>
            </Box>
          ) : settingsTab === 'materials' ? (
            <Box>
              <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 1 }}>
                <Box>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 900 }}>
                    공정 주요자재 실행물량
                  </Typography>
                  <Typography sx={{ mt: 0.15, fontSize: '0.64rem', color: '#64748b' }}>
                    시스템 기본 주요자재를 기준으로 시작합니다. 현장에 필요 없는 자재는 제외하고, 부족한 자재는 직접 추가할 수 있습니다.
                  </Typography>
                </Box>

                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PlaylistAddRoundedIcon />}
                  onClick={() => {
                    setMaterialPickerPurpose('settings');
                    setMaterialPickerSearch('');
                    setMaterialPickerOpen(true);
                  }}
                  sx={{ ml: 'auto !important', whiteSpace: 'nowrap' }}
                >
                  주요자재 추가
                </Button>
              </Stack>

              {settingsMaterials.length === 0 ? (
                <Paper
                  variant="outlined"
                  sx={{
                    minHeight: 260,
                    display: 'grid',
                    placeItems: 'center',
                    p: 2,
                    bgcolor: '#f8fafc',
                  }}
                >
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 900, color: '#475569' }}>
                      설정된 주요자재가 없습니다.
                    </Typography>
                    <Typography sx={{ mt: 0.4, fontSize: '0.66rem', color: '#94a3b8' }}>
                      자재 마스터에서 기본 주요자재를 지정하거나, 위의 주요자재 추가 버튼으로 현장에 필요한 자재를 선택해주세요.
                    </Typography>
                  </Box>
                </Paper>
              ) : (
                <TableContainer
                  sx={{
                    maxHeight: '52vh',
                    border: '1px solid #e2e8f0',
                    borderRadius: 1,
                  }}
                >
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        {['사용', '공정', '품명', '규격', '단위', '실행물량', '구분', '비고'].map((label) => (
                          <TableCell
                            key={label}
                            align={['사용', '단위', '실행물량', '구분'].includes(label) ? 'center' : 'left'}
                            sx={{
                              bgcolor: '#f8fafc',
                              fontWeight: 900,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {label}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {settingsMaterials.map((row) => {
                        const excluded = row.included === false;
                        return (
                          <TableRow
                            key={row.materialId}
                            hover
                            sx={{
                              bgcolor: excluded ? '#f8fafc' : '#fff',
                              opacity: excluded ? 0.58 : 1,
                            }}
                          >
                            <TableCell align="center">
                              <Checkbox
                                size="small"
                                checked={!excluded}
                                onChange={(event) =>
                                  updateSettingsMaterial(
                                    row.materialId,
                                    'included',
                                    event.target.checked,
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>{row.processName || '-'}</TableCell>
                            <TableCell sx={{ fontWeight: 850 }}>{row.standardName}</TableCell>
                            <TableCell>{row.specification || '-'}</TableCell>
                            <TableCell align="center">{row.unit || '-'}</TableCell>
                            <TableCell sx={{ width: 150 }}>
                              <TextField
                                size="small"
                                type="number"
                                value={row.executionQuantity}
                                disabled={excluded}
                                onChange={(event) =>
                                  updateSettingsMaterial(
                                    row.materialId,
                                    'executionQuantity',
                                    event.target.value,
                                  )
                                }
                                inputProps={{
                                  min: 0,
                                  step: 'any',
                                  style: { textAlign: 'right' },
                                }}
                                error={!excluded && numberValue(row.executionQuantity) <= 0}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                size="small"
                                variant="outlined"
                                color={row.source === 'default' ? 'primary' : 'default'}
                                label={row.source === 'default' ? '기본' : '현장추가'}
                                sx={{ fontWeight: 800 }}
                              />
                            </TableCell>
                            <TableCell sx={{ minWidth: 180 }}>
                              <TextField
                                size="small"
                                fullWidth
                                value={row.note || ''}
                                disabled={excluded}
                                onChange={(event) =>
                                  updateSettingsMaterial(
                                    row.materialId,
                                    'note',
                                    event.target.value,
                                  )
                                }
                                placeholder={excluded ? '제외됨' : '선택'}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              <Alert severity="warning" sx={{ mt: 1, py: 0.2 }}>
                사용으로 선택한 주요자재는 실행물량이 0보다 커야 저장할 수 있습니다. 당장 실행물량을 확정할 수 없는 자재는 체크를 해제하여 제외한 뒤 나중에 다시 포함할 수 있습니다.
              </Alert>
            </Box>
          ) : (
            <Box>
              <Typography sx={{ mb: 1, fontSize: '0.75rem', fontWeight: 900 }}>
                기본설정 변경이력
              </Typography>

              {settingsHistory.length === 0 ? (
                <Paper
                  variant="outlined"
                  sx={{
                    py: 5,
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: '0.72rem',
                  }}
                >
                  아직 저장된 변경이력이 없습니다.
                </Paper>
              ) : (
                <Stack spacing={0.8}>
                  {settingsHistory.map((history, index) => {
                    const basic = history.basic_defaults || {};
                    const materials = Array.isArray(history.material_snapshot)
                      ? history.material_snapshot
                      : [];
                    const includedCount = materials.filter(
                      (row) => row?.included !== false,
                    ).length;

                    return (
                      <Paper
                        key={history.id || `${history.changed_at}-${index}`}
                        variant="outlined"
                        sx={{ p: 1, borderColor: '#e2e8f0' }}
                      >
                        <Stack direction="row" alignItems="center" spacing={0.6}>
                          <Typography sx={{ fontSize: '0.72rem', fontWeight: 900 }}>
                            {history.change_note || '기본설정 변경'}
                          </Typography>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`주요자재 ${includedCount}개`}
                          />
                          <Typography sx={{ ml: 'auto !important', fontSize: '0.62rem', color: '#94a3b8' }}>
                            {history.changed_at
                              ? new Date(history.changed_at).toLocaleString('ko-KR')
                              : '-'}
                          </Typography>
                        </Stack>

                        <Typography sx={{ mt: 0.55, fontSize: '0.66rem', color: '#475569' }}>
                          요청자 {basic.requesterName || '-'} · 수령자 {basic.receiverName || '-'} · 연락처 {basic.receiverPhone || '-'} · 납품장소 {basic.deliveryLocation || '-'}
                        </Typography>

                        <Typography sx={{ mt: 0.25, fontSize: '0.62rem', color: '#94a3b8' }}>
                          변경자 {history.changed_by || '-'}
                        </Typography>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 1.5, py: 1 }}>
          {isSuperAdmin && (
            <Button
              color="error"
              variant="outlined"
              startIcon={<RestartAltRoundedIcon />}
              onClick={() => {
                setResetConfirmText('');
                setResetDialogOpen(true);
              }}
              disabled={settingsLoading || settingsSaving || resetting}
              sx={{ mr: 'auto' }}
            >
              발주 테스트 초기화
            </Button>
          )}

          {settingsRequired && (
            <Button
              color="inherit"
              onClick={() => {
                setSettingsDialogOpen(false);
                setMainTab('master');
                loadMasterRows();
              }}
            >
              자재 마스터로 이동
            </Button>
          )}

          <Button
            onClick={() => setSettingsDialogOpen(false)}
            disabled={settingsSaving || resetting}
          >
            닫기
          </Button>

          <Button
            variant="contained"
            onClick={saveProjectSettings}
            disabled={settingsLoading || settingsSaving}
            startIcon={
              settingsSaving ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <SaveRoundedIcon />
              )
            }
          >
            기본설정 저장
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={resetDialogOpen}
        onClose={() => {
          if (!resetting) {
            setResetDialogOpen(false);
            setResetConfirmText('');
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 900, color: '#b91c1c' }}>
          자재발주 테스트 자료 초기화
        </DialogTitle>
        <DialogContent dividers sx={{ p: 1.5 }}>
          <Alert severity="error" sx={{ mb: 1.2 }}>
            현재 현장의 작성중·발주확정·결재요청 발주서, 발주품목, 현장 자재목록, 누계발주량, 발주번호 순번, 기본설정, 주요자재 실행물량과 변경이력을 모두 삭제합니다. 삭제한 자료는 복구할 수 없습니다.
          </Alert>

          <Paper variant="outlined" sx={{ p: 1.2, mb: 1.2, bgcolor: '#f8fafc' }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 900 }}>
              초기화 대상 현장
            </Typography>
            <Typography sx={{ mt: 0.35, fontSize: '0.8rem', color: '#b91c1c', fontWeight: 900 }}>
              {projectName}
            </Typography>
            <Typography sx={{ mt: 0.55, fontSize: '0.66rem', color: '#475569', lineHeight: 1.65 }}>
              유지 자료: 자재 마스터, 자재분류
            </Typography>
          </Paper>

          <TextField
            autoFocus
            fullWidth
            size="small"
            label="확인을 위해 현장명을 입력"
            value={resetConfirmText}
            onChange={(event) => setResetConfirmText(event.target.value)}
            placeholder={projectName}
            disabled={resetting}
            helperText="위 현장명과 동일하게 입력해야 초기화할 수 있습니다."
          />
        </DialogContent>
        <DialogActions sx={{ px: 1.5, py: 1 }}>
          <Button
            onClick={() => {
              setResetDialogOpen(false);
              setResetConfirmText('');
            }}
            disabled={resetting}
          >
            취소
          </Button>
          <Button
            color="error"
            variant="contained"
            startIcon={
              resetting ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <RestartAltRoundedIcon />
              )
            }
            onClick={resetMaterialOrderTestData}
            disabled={
              resetting ||
              resetConfirmText.trim() !== projectName.trim()
            }
          >
            완전 초기화
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={materialPickerOpen} onClose={() => setMaterialPickerOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 900 }}>
          {materialPickerPurpose === 'settings'
            ? '주요자재 추가'
            : '표준 자재 선택'}
        </DialogTitle>
        <DialogContent dividers sx={{ p: 1.2 }}>
          <Stack direction="row" spacing={0.7} sx={{ mb: 1 }}>
            <TextField
              autoFocus
              size="small"
              value={materialPickerSearch}
              onChange={(event) => setMaterialPickerSearch(event.target.value)}
              placeholder="품명 · 규격 · 별칭 검색 (예: SQ-Bar, 에스큐바, 40x30)"
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }}
              fullWidth
            />
            <Button variant="outlined" onClick={loadMaterialPicker}>검색</Button>
          </Stack>
          <TableContainer sx={{ maxHeight: '62vh', border: '1px solid #e2e8f0' }}>
            <Table stickyHeader size="small">
              <TableHead><TableRow>{['분류', '공정', '품명', '규격', '단위', '실행물량', '기발주누계', '별칭', '추가'].map((label) => <TableCell key={label} sx={{ fontWeight: 900, bgcolor: '#f8fafc' }}>{label}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {materialPickerLoading ? (
                  <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6 }}><CircularProgress size={24} /></TableCell></TableRow>
                ) : materialPickerRows.length === 0 ? (
                  <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6, color: '#94a3b8' }}>검색 결과가 없습니다. 자재 마스터에서 먼저 등록해주세요.</TableCell></TableRow>
                ) : materialPickerRows.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>{categoryNameById(categories, row.category_id)}</TableCell>
                    <TableCell>{row.process_name || '-'}</TableCell>
                    <TableCell sx={{ fontWeight: 850 }}>{row.standard_name}</TableCell>
                    <TableCell>{row.specification || '-'}</TableCell>
                    <TableCell>{row.unit || '-'}</TableCell>
                    <TableCell align="right">{formatNumber(row.executionQuantity)}</TableCell>
                    <TableCell align="right">{formatNumber(row.previousQuantity)}</TableCell>
                    <TableCell sx={{ maxWidth: 250 }}>{(row.aliases || []).join(', ') || '-'}</TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => addMaterialFromPicker(row)}
                        disabled={
                          materialPickerPurpose === 'settings' &&
                          settingsMaterials.some(
                            (item) => item.materialId === row.id,
                          )
                        }
                      >
                        {materialPickerPurpose === 'settings' &&
                        settingsMaterials.some(
                          (item) => item.materialId === row.id,
                        )
                          ? '추가됨'
                          : '추가'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions><Button onClick={() => setMaterialPickerOpen(false)}>닫기</Button></DialogActions>
      </Dialog>

      <Dialog open={masterDialogOpen} onClose={() => !saving && setMasterDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 900 }}>{masterForm.id ? '자재 마스터 수정' : '자재 마스터 등록'}</DialogTitle>
        <DialogContent dividers sx={{ p: 1.5 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
            <TextField select size="small" label="자재분류" value={masterForm.categoryId} onChange={(e) => setMasterForm((current) => ({ ...current, categoryId: e.target.value }))}>
              {categories.map((row) => <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}
            </TextField>
            <Autocomplete freeSolo size="small" options={masterProcessOptions} value={masterForm.processName} onInputChange={(_, value) => setMasterForm((current) => ({ ...current, processName: value }))} renderInput={(params) => <TextField {...params} label="공정" />} />
            <TextField size="small" label="표준 품명" value={masterForm.standardName} onChange={(e) => setMasterForm((current) => ({ ...current, standardName: e.target.value }))} />
            <TextField size="small" label="표준 규격" value={masterForm.specification} onChange={(e) => setMasterForm((current) => ({ ...current, specification: e.target.value }))} />
            <TextField size="small" label="단위" value={masterForm.unit} onChange={(e) => setMasterForm((current) => ({ ...current, unit: e.target.value }))} />
            <TextField size="small" label="제조사/브랜드" value={masterForm.manufacturer} onChange={(e) => setMasterForm((current) => ({ ...current, manufacturer: e.target.value }))} />
            <TextField size="small" label="검색 별칭" value={masterForm.aliasesText} onChange={(e) => setMasterForm((current) => ({ ...current, aliasesText: e.target.value }))} placeholder="쉼표로 구분: SQ바, 에스큐바, square bar" />
            <FormControlLabel
              control={
                <Checkbox
                  checked={masterForm.isMainMaterial === true}
                  onChange={(event) =>
                    setMasterForm((current) => ({
                      ...current,
                      isMainMaterial: event.target.checked,
                    }))
                  }
                />
              }
              label="공정 주요자재 기본항목"
              sx={{
                m: 0,
                '& .MuiFormControlLabel-label': {
                  fontSize: '0.76rem',
                  fontWeight: 850,
                },
              }}
            />
            <TextField
              size="small"
              type="number"
              label="기본설정 표시순서"
              value={masterForm.mainSortOrder}
              onChange={(event) =>
                setMasterForm((current) => ({
                  ...current,
                  mainSortOrder: event.target.value,
                }))
              }
              disabled={!masterForm.isMainMaterial}
              inputProps={{ min: 1, step: 1 }}
              helperText="숫자가 작을수록 기본설정 목록 위에 표시됩니다."
            />
            <TextField size="small" multiline minRows={2} label="비고" value={masterForm.note} onChange={(e) => setMasterForm((current) => ({ ...current, note: e.target.value }))} sx={{ gridColumn: '1 / -1' }} />
          </Box>
          <Alert severity="info" sx={{ mt: 1.2, py: 0.2 }}>
            실행물량은 자재 마스터에서 관리하지 않습니다. <b>공정 주요자재 기본항목</b>으로 지정한 자재는 현장별 <b>기본설정</b>에서 실행물량을 입력합니다. 발주서에서 이 자재를 선택하면 품명·규격·단위가 기본값으로 입력되며, 발주서 안에서 규격과 단위를 수정해도 자재마스터 원본은 변경되지 않습니다.
          </Alert>
        </DialogContent>
        <DialogActions><Button onClick={() => setMasterDialogOpen(false)} disabled={saving}>취소</Button><Button variant="contained" onClick={saveMaster} disabled={saving} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveRoundedIcon />}>저장</Button></DialogActions>
      </Dialog>

      <Dialog open={categoryDialogOpen} onClose={() => setCategoryDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 900 }}>자재분류 관리</DialogTitle>
        <DialogContent dividers sx={{ p: 1.2 }}>
          <Alert severity="info" sx={{ mb: 1, py: 0.2 }}>
            기본 제공 분류 외에 필요한 분류를 추가할 수 있습니다. 추가한 분류는 자재발주 담당자가 공통으로 사용합니다.
          </Alert>
          <Stack direction="row" spacing={0.7}>
            <TextField size="small" fullWidth label="새 자재분류" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
            <Button variant="contained" onClick={addCategory}>추가</Button>
          </Stack>
          <Divider sx={{ my: 1 }} />
          <Stack spacing={0.5}>
            {categories.map((row) => <Paper key={row.id} variant="outlined" sx={{ px: 1, py: 0.65, fontSize: '0.75rem', fontWeight: 800 }}>{row.name}</Paper>)}
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setCategoryDialogOpen(false)}>닫기</Button></DialogActions>
      </Dialog>

      <Dialog open={folderDialogOpen} onClose={() => !folderDeletingId && setFolderDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 900 }}>하위 폴더 관리</DialogTitle>
        <DialogContent dividers sx={{ p: 1.2 }}>
          {categoryFolderSchemaMissing && (
            <Alert severity="warning" sx={{ mb: 1, py: 0.2 }}>
              하위 폴더를 저장하려면 제공된 Supabase SQL을 먼저 실행해야 합니다.
            </Alert>
          )}
          <Stack spacing={1}>
            <TextField
              select
              size="small"
              fullWidth
              label="상위 자재분류"
              value={folderParentCategoryId}
              onChange={(event) => setFolderParentCategoryId(event.target.value)}
              disabled={Boolean(folderDeletingId)}
            >
              {categories.map((category) => (
                <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              fullWidth
              autoFocus
              label="새 하위 폴더 이름"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && addCategoryFolder()}
              disabled={Boolean(folderDeletingId)}
            />
          </Stack>
          <Divider sx={{ my: 1.2 }} />
          <Typography sx={{ mb: 0.6, fontSize: '0.72rem', fontWeight: 900, color: '#334155' }}>
            등록된 하위 폴더
          </Typography>
          <Stack spacing={0.45}>
            {categoryFolders.filter((folder) => (
              folder.category_id === folderParentCategoryId
            )).length === 0 ? (
              <Typography sx={{ py: 1.2, textAlign: 'center', fontSize: '0.7rem', color: '#94a3b8' }}>
                등록된 하위 폴더가 없습니다.
              </Typography>
            ) : categoryFolders.filter((folder) => (
              folder.category_id === folderParentCategoryId
            )).map((folder) => {
              const linkedOrderCount = orders.filter((row) => (
                row.category_id === folder.category_id && row.process_name === folder.name
              )).length;
              return (
                <Paper key={folder.id} variant="outlined" sx={{ px: 0.8, py: 0.35 }}>
                  <Stack direction="row" alignItems="center" spacing={0.6}>
                    <FolderRoundedIcon sx={{ fontSize: '1rem', color: '#64748b' }} />
                    <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: '0.72rem', fontWeight: 800 }}>
                      {folder.name}
                    </Typography>
                    <Chip label={`${linkedOrderCount}건`} size="small" sx={{ height: 19, fontSize: '0.58rem' }} />
                    <Tooltip title="하위 폴더 삭제" arrow>
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => deleteCategoryFolder(folder)}
                          disabled={Boolean(folderDeletingId)}
                          aria-label={`${folder.name} 하위 폴더 삭제`}
                        >
                          {folderDeletingId === folder.id
                            ? <CircularProgress size={15} color="inherit" />
                            : <DeleteOutlineRoundedIcon sx={{ fontSize: '1rem' }} />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFolderDialogOpen(false)} disabled={Boolean(folderDeletingId)}>닫기</Button>
          <Button variant="contained" onClick={addCategoryFolder} disabled={Boolean(folderDeletingId)}>추가</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3200} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>{toast.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
