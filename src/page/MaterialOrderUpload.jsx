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
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import CategoryRoundedIcon from '@mui/icons-material/CategoryRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import PlaylistAddRoundedIcon from '@mui/icons-material/PlaylistAddRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { supabase } from '../supabaseClient';

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

const ORDER_STATUS_LABELS = {
  draft: '작성중',
  confirmed: '발주완료',
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

const normalizeText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const numberValue = (value) => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const isProjectSettingsComplete = (form, materials) => {
  const basicReady = [
    form?.requesterName,
    form?.receiverName,
    form?.receiverPhone,
    form?.deliveryLocation,
  ].every((value) => normalizeText(value));

  const included = (materials || []).filter((row) => row.included !== false);
  return (
    basicReady &&
    included.length > 0 &&
    included.every((row) => numberValue(row.executionQuantity) > 0)
  );
};
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

const categoryNameById = (categories, id) =>
  categories.find((row) => row.id === id)?.name || '-';

export default function MaterialOrderUpload({ projectName, userProfile }) {
  const [mainTab, setMainTab] = useState('order');
  const [supplyTab, setSupplyTab] = useState('private');
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [masterRows, setMasterRows] = useState([]);
  const [masterSearch, setMasterSearch] = useState('');
  const [masterCategoryId, setMasterCategoryId] = useState('');
  const [loading, setLoading] = useState(false);
  const [masterLoading, setMasterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [toast, setToast] = useState(null);
  const [order, setOrder] = useState({
    ...EMPTY_ORDER,
    orderDate: getKoreaToday(),
    requesterName: getProfileName(userProfile),
  });
  const [orderItems, setOrderItems] = useState([]);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [materialPickerSearch, setMaterialPickerSearch] = useState('');
  const [materialPickerRows, setMaterialPickerRows] = useState([]);
  const [materialPickerLoading, setMaterialPickerLoading] = useState(false);
  const [masterDialogOpen, setMasterDialogOpen] = useState(false);
  const [masterForm, setMasterForm] = useState(EMPTY_MASTER);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
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
  const isLocked = order.status === 'confirmed' || order.status === 'cancelled';

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

    setCategories(data || []);
  }, [handleSchemaError, notify, projectName]);

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

      const complete = isProjectSettingsComplete(
        nextForm,
        mergedMaterials,
      );

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
      let query = supabase
        .from('material_master_items')
        .select('id, category_id, process_name, standard_name, specification, unit, manufacturer, aliases, note, is_active, is_main_material, main_sort_order, updated_at')
        .eq('is_active', true)
        .order('process_name', { ascending: true })
        .order('main_sort_order', { ascending: true })
        .order('standard_name', { ascending: true })
        .limit(500);

      if (masterCategoryId) {
        query = query.eq('category_id', masterCategoryId);
      }

      const keyword = normalizeText(masterSearch);
      if (keyword) {
        query = query.ilike('search_text', `%${keyword}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setMasterRows(data || []);
    } catch (error) {
      if (!handleSchemaError(error)) {
        notify('error', `자재 마스터 조회 실패: ${error.message}`);
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
        '발주서 작성 전에 기본설정과 주요자재 실행물량을 먼저 완료해주세요.',
      );
      return;
    }

    setOrder({
      ...EMPTY_ORDER,
      orderDate: getKoreaToday(),
      requesterName:
        projectSettings?.default_requester_name ||
        getProfileName(userProfile),
      receiverName: projectSettings?.default_receiver_name || '',
      receiverPhone: projectSettings?.default_receiver_phone || '',
      deliveryLocation:
        projectSettings?.default_delivery_location || '',
    });
    setOrderItems([]);
    setMainTab('order');
  }, [
    notify,
    projectSettings,
    settingsRequired,
    userProfile,
  ]);

  const refreshBalances = useCallback(
    async (items) => {
      if (!projectName || items.length === 0) return items;
      const ids = [...new Set(items.map((row) => row.materialId).filter(Boolean))];
      if (ids.length === 0) return items;

      const { data, error } = await supabase
        .from('material_supply_cumulative')
        .select('material_id, cumulative_order_quantity')
        .eq('project_name', projectName)
        .in('material_id', ids);

      if (error) throw error;
      const cumulativeMap = new Map(
        (data || []).map((row) => [row.material_id, numberValue(row.cumulative_order_quantity)]),
      );

      return items.map((row) => {
        const previous = cumulativeMap.get(row.materialId) || 0;
        const current = numberValue(row.currentQuantity);
        const cumulative = previous + current;
        const execution = numberValue(row.executionQuantity);
        return {
          ...row,
          previousQuantity: previous,
          cumulativeQuantity: cumulative,
          executionRatio: execution > 0 ? (cumulative / execution) * 100 : 0,
        };
      });
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
          materialId: item.material_id,
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

        setOrder({
          id: row.id,
          orderNo: row.order_no || '',
          orderDate: row.order_date || getKoreaToday(),
          requesterName: row.requester_name || '',
          deliveryDate: row.delivery_date || '',
          deliveryLocation: row.delivery_location || '',
          receiverName: row.receiver_name || '',
          receiverPhone: row.receiver_phone || '',
          categoryId: row.category_id || '',
          processName: row.process_name || '',
          note: row.note || '',
          status: row.status || 'draft',
        });
        setOrderItems(mapped);
        setMainTab('order');
      } catch (error) {
        notify('error', `발주서 불러오기 실패: ${error.message}`);
      } finally {
        setLoading(false);
      }
    },
    [notify, refreshBalances],
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
      const cumulativeMap = new Map(cumulative.map((row) => [row.material_id, numberValue(row.cumulative_order_quantity)]));

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

  useEffect(() => {
    if (!materialPickerOpen) return;
    const timer = window.setTimeout(loadMaterialPicker, 180);
    return () => window.clearTimeout(timer);
  }, [loadMaterialPicker, materialPickerOpen]);

  const addMaterialToOrder = (material) => {
    if (orderItems.some((row) => row.materialId === material.id)) {
      notify('warning', '이미 발주서에 추가된 자재입니다.');
      return;
    }
    const previous = numberValue(material.previousQuantity);
    const execution = numberValue(material.executionQuantity);
    setOrderItems((current) => [
      ...current,
      {
        id: '',
        materialId: material.id,
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
    ]);
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

    const includedMaterials = settingsMaterials.filter(
      (row) => row.included !== false,
    );

    if (includedMaterials.length === 0) {
      notify(
        'warning',
        '주요자재를 하나 이상 포함해주세요. 사용하지 않는 자재는 제외로 설정할 수 있습니다.',
      );
      setSettingsTab('materials');
      return;
    }

    const missingQuantity = includedMaterials.find(
      (row) => numberValue(row.executionQuantity) <= 0,
    );

    if (missingQuantity) {
      notify(
        'warning',
        `"${missingQuantity.standardName}"의 실행물량을 입력하거나 제외로 변경해주세요.`,
      );
      setSettingsTab('materials');
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
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const nextRow = { ...row, [field]: value };
        if (field === 'currentQuantity') {
          const currentQuantity = numberValue(value);
          const previous = numberValue(nextRow.previousQuantity);
          const execution = numberValue(nextRow.executionQuantity);
          nextRow.currentQuantity = currentQuantity;
          nextRow.cumulativeQuantity = previous + currentQuantity;
          nextRow.executionRatio = execution > 0 ? (nextRow.cumulativeQuantity / execution) * 100 : 0;
        }
        return nextRow;
      }),
    );
  };

  const saveOrder = async (status = 'draft') => {
    if (!projectName || isLocked) return;

    if (settingsRequired) {
      setSettingsTab('basic');
      setSettingsDialogOpen(true);
      notify(
        'warning',
        '기본설정과 주요자재 실행물량을 먼저 완료해주세요.',
      );
      return;
    }

    if (!order.orderDate) {
      notify('warning', '발주일을 입력해주세요.');
      return;
    }
    if (orderItems.length === 0) {
      notify('warning', '발주 자재를 하나 이상 추가해주세요.');
      return;
    }
    if (status === 'confirmed' && orderItems.every((row) => numberValue(row.currentQuantity) <= 0)) {
      notify('warning', '금회발주량을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
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

      const refreshedItems = status === 'confirmed' ? await refreshBalances(orderItems) : orderItems;
      const itemPayloads = refreshedItems.map((row, index) => ({
        order_id: orderId,
        material_id: row.materialId,
        sort_order: index + 1,
        category_id: row.categoryId || null,
        process_name: row.processName || null,
        standard_name: row.standardName,
        specification: row.specification || null,
        unit: row.unit || null,
        execution_quantity: numberValue(row.executionQuantity),
        previous_order_quantity: numberValue(row.previousQuantity),
        current_order_quantity: numberValue(row.currentQuantity),
        cumulative_order_quantity: numberValue(row.previousQuantity) + numberValue(row.currentQuantity),
        execution_ratio:
          numberValue(row.executionQuantity) > 0
            ? ((numberValue(row.previousQuantity) + numberValue(row.currentQuantity)) /
                numberValue(row.executionQuantity)) *
              100
            : 0,
        note: normalizeText(row.note) || null,
      }));

      const { error: itemError } = await supabase
        .from('material_supply_order_items')
        .insert(itemPayloads);
      if (itemError) throw itemError;

      notify('success', status === 'confirmed' ? '발주서를 발주완료 처리했습니다.' : '발주서를 저장했습니다.');
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
    } catch (error) {
      if (!handleSchemaError(error)) notify('error', `발주서 저장 실패: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteDraft = async () => {
    if (!order.id || order.status !== 'draft') return;
    if (!window.confirm(`${order.orderNo || '현재 발주서'}를 삭제할까요?`)) return;
    const { error } = await supabase.from('material_supply_orders').delete().eq('id', order.id).eq('status', 'draft');
    if (error) {
      notify('error', `발주서 삭제 실패: ${error.message}`);
      return;
    }
    notify('success', '작성중 발주서를 삭제했습니다.');
    createNewOrder();
    loadOrders();
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
    setMasterForm({
      ...EMPTY_MASTER,
      categoryId: masterCategoryId || categories[0]?.id || '',
    });
    setMasterDialogOpen(true);
  };

  const openEditMaster = (row) => {
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
    const name = normalizeText(newCategoryName);
    if (!name) return;
    const nextSort = categories.reduce((max, row) => Math.max(max, Number(row.sort_order || 0)), 0) + 10;
    const { error } = await supabase.from('material_supply_categories').insert({
      name,
      sort_order: nextSort,
      is_active: true,
      created_by: currentUserId || null,
      updated_by: currentUserId || null,
    });
    if (error) {
      notify('error', error.code === '23505' ? '이미 등록된 자재분류입니다.' : `분류 추가 실패: ${error.message}`);
      return;
    }
    setNewCategoryName('');
    notify('success', `자재분류 "${name}"을 추가했습니다.`);
    loadCategories();
  };

  const orderSummary = useMemo(() => {
    const execution = orderItems.reduce((sum, row) => sum + numberValue(row.executionQuantity), 0);
    const current = orderItems.reduce((sum, row) => sum + numberValue(row.currentQuantity), 0);
    const cumulative = orderItems.reduce((sum, row) => sum + numberValue(row.cumulativeQuantity), 0);
    return { execution, current, cumulative };
  }, [orderItems]);

  const visibleOrders = useMemo(
    () => orders.filter((row) => (mainTab === 'history' ? row.status !== 'draft' : true)),
    [mainTab, orders],
  );

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0.8, p: 1 }}>
      <Paper variant="outlined" sx={{ px: 1.25, py: 0.8, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ minWidth: 210 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>자재발주작성</Typography>
          <Typography sx={{ mt: 0.1, fontSize: '0.64rem', color: '#64748b', fontWeight: 700 }}>
            {projectName} · 표준 자재명칭 / 실행물량 / 누계발주율 통합관리
          </Typography>
        </Box>

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

        <Tabs
          value={mainTab}
          onChange={(_, value) => {
            setMainTab(value);
            if (value === 'order' && settingsRequired) {
              setSettingsTab('basic');
              setSettingsDialogOpen(true);
            }
          }}
          sx={{
            ml: 'auto',
            minHeight: 34,
            '& .MuiTabs-indicator': {
              display: 'none',
            },
            '& .MuiTab-root': {
              minHeight: 34,
              py: 0.4,
              position: 'relative',
              overflow: 'visible',
              fontSize: '0.72rem',
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
            },
          }}
        >
          <Tab value="order" icon={<AddShoppingCartRoundedIcon fontSize="small" />} iconPosition="start" label="발주서 작성" />
          <Tab value="master" icon={<Inventory2RoundedIcon fontSize="small" />} iconPosition="start" label="자재 마스터" />
          <Tab value="history" icon={<HistoryRoundedIcon fontSize="small" />} iconPosition="start" label="발주이력" />
        </Tabs>

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

        {settingsRequired && (
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
            <Button variant="outlined" onClick={() => setCategoryDialogOpen(true)} startIcon={<CategoryRoundedIcon />}>분류 관리</Button>
            <Button variant="contained" onClick={openNewMaster} startIcon={<AddRoundedIcon />} sx={{ ml: 'auto !important' }}>자재 등록</Button>
          </Stack>

          <TableContainer sx={{ flex: 1, minHeight: 0 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {['분류', '공정', '표준 품명', '표준 규격', '단위', '제조사', '주요자재', '별칭', '수정'].map((label) => (
                    <TableCell key={label} align={['주요자재', '수정'].includes(label) ? 'center' : 'left'} sx={{ fontWeight: 900, bgcolor: '#f8fafc', whiteSpace: 'nowrap' }}>{label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {masterLoading ? (
                  <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6 }}><CircularProgress size={24} /></TableCell></TableRow>
                ) : masterRows.length === 0 ? (
                  <TableRow><TableCell colSpan={9} align="center" sx={{ py: 8, color: '#94a3b8' }}>등록된 자재가 없거나 검색 결과가 없습니다.</TableCell></TableRow>
                ) : masterRows.map((row) => (
                  <TableRow key={row.id} hover>
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
                    <TableCell align="center"><IconButton size="small" onClick={() => openEditMaster(row)}><EditRoundedIcon fontSize="small" /></IconButton></TableCell>
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
              <Button size="small" startIcon={<AddRoundedIcon />} onClick={createNewOrder} sx={{ ml: 'auto' }}>새 발주서</Button>
            </Stack>
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              {visibleOrders.length === 0 ? (
                <Box sx={{ height: '100%', minHeight: 220, display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: '0.72rem' }}>발주서가 없습니다.</Box>
              ) : visibleOrders.map((row) => {
                const selected = row.id === order.id;
                return (
                  <Box
                    key={row.id}
                    onClick={() => openOrder(row)}
                    sx={{ px: 1, py: 0.8, cursor: 'pointer', borderBottom: '1px solid #edf2f7', bgcolor: selected ? '#eff6ff' : '#fff', '&:hover': { bgcolor: selected ? '#eff6ff' : '#f8fafc' } }}
                  >
                    <Stack direction="row" alignItems="center" spacing={0.6}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 900, color: '#0f172a' }}>{row.order_no}</Typography>
                      <Chip
                        label={ORDER_STATUS_LABELS[row.status] || row.status}
                        size="small"
                        color={row.status === 'confirmed' ? 'success' : row.status === 'draft' ? 'warning' : 'default'}
                        variant="outlined"
                        sx={{ ml: 'auto' }}
                      />
                    </Stack>
                    <Typography sx={{ mt: 0.25, fontSize: '0.66rem', color: '#475569', fontWeight: 750 }}>{row.order_date} · {row.process_name || categoryNameById(categories, row.category_id)}</Typography>
                    <Typography noWrap sx={{ mt: 0.1, fontSize: '0.62rem', color: '#94a3b8' }}>요청자 {row.requester_name || '-'} · 납품 {row.delivery_date || '-'}</Typography>
                  </Box>
                );
              })}
            </Box>
          </Paper>

          <Paper variant="outlined" sx={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" alignItems="center" spacing={0.7} sx={{ px: 1, py: 0.7, borderBottom: '1px solid #e2e8f0' }}>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 900 }}>사급자재 발주서</Typography>
              {order.orderNo && <Chip label={order.orderNo} size="small" variant="outlined" />}
              {order.status !== 'draft' && <Chip label={ORDER_STATUS_LABELS[order.status]} size="small" color={order.status === 'confirmed' ? 'success' : 'default'} />}
              <Stack direction="row" spacing={0.5} sx={{ ml: 'auto' }}>
                {!isLocked && order.id && <Button size="small" color="error" variant="outlined" onClick={deleteDraft} startIcon={<DeleteOutlineRoundedIcon />}>삭제</Button>}
                {!isLocked && <Button size="small" variant="outlined" onClick={() => saveOrder('draft')} disabled={saving} startIcon={<SaveRoundedIcon />}>저장</Button>}
                {!isLocked && <Button size="small" variant="contained" color="success" onClick={() => saveOrder('confirmed')} disabled={saving} startIcon={<CheckCircleRoundedIcon />}>발주완료</Button>}
              </Stack>
            </Stack>

            <Box sx={{ p: 0.9, borderBottom: '1px solid #e2e8f0' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 0.7 }}>
                <TextField size="small" label="발주일" type="date" InputLabelProps={{ shrink: true }} slotProps={{ inputLabel: { shrink: true } }} value={order.orderDate} onChange={(e) => setOrder((current) => ({ ...current, orderDate: e.target.value }))} disabled={isLocked} />
                <TextField size="small" label="요청자" value={order.requesterName} onChange={(e) => setOrder((current) => ({ ...current, requesterName: e.target.value }))} disabled={isLocked} />
                <TextField select size="small" label="자재분류" value={order.categoryId} onChange={(e) => setOrder((current) => ({ ...current, categoryId: e.target.value }))} disabled={isLocked}>
                  <MenuItem value="">전체/혼합</MenuItem>
                  {categories.map((row) => <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}
                </TextField>
                <Autocomplete freeSolo size="small" options={PROCESS_OPTIONS} value={order.processName || ''} onInputChange={(_, value) => setOrder((current) => ({ ...current, processName: value }))} disabled={isLocked} renderInput={(params) => <TextField {...params} label="공정" />} />
                <TextField size="small" label="납품희망일" type="date" InputLabelProps={{ shrink: true }} slotProps={{ inputLabel: { shrink: true } }} value={order.deliveryDate} onChange={(e) => setOrder((current) => ({ ...current, deliveryDate: e.target.value }))} disabled={isLocked} />
                <TextField size="small" label="납품장소" value={order.deliveryLocation} onChange={(e) => setOrder((current) => ({ ...current, deliveryLocation: e.target.value }))} disabled={isLocked} />
                <TextField size="small" label="수령자" value={order.receiverName} onChange={(e) => setOrder((current) => ({ ...current, receiverName: e.target.value }))} disabled={isLocked} />
                <TextField size="small" label="연락처" value={order.receiverPhone} onChange={(e) => setOrder((current) => ({ ...current, receiverPhone: e.target.value }))} disabled={isLocked} />
                <TextField size="small" label="비고" value={order.note} onChange={(e) => setOrder((current) => ({ ...current, note: e.target.value }))} disabled={isLocked} sx={{ gridColumn: 'span 4' }} />
              </Box>
            </Box>

            <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 0.9, py: 0.6, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 900 }}>발주 품목 {orderItems.length}개</Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#64748b' }}>실행물량 합계 {formatNumber(orderSummary.execution)}</Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#2563eb', fontWeight: 850 }}>금회 {formatNumber(orderSummary.current)}</Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#0f766e', fontWeight: 850 }}>누계 {formatNumber(orderSummary.cumulative)}</Typography>
              {!isLocked && (
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => {
                    setMaterialPickerPurpose('order');
                    setMaterialPickerSearch('');
                    setMaterialPickerOpen(true);
                  }}
                  startIcon={<AddRoundedIcon />}
                  sx={{ ml: 'auto !important' }}
                >
                  자재 추가
                </Button>
              )}
            </Stack>

            <TableContainer sx={{ flex: 1, minHeight: 0 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {['No', '품명', '규격', '단위', '실행물량', '전회발주량', '금회발주량', '누계발주량', '발주율', '비고', ''].map((label) => (
                      <TableCell key={label} align={['No', '단위', '실행물량', '전회발주량', '금회발주량', '누계발주량', '발주율', ''].includes(label) ? 'center' : 'left'} sx={{ bgcolor: '#f8fafc', fontWeight: 900, whiteSpace: 'nowrap' }}>{label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={11} align="center" sx={{ py: 7 }}><CircularProgress size={24} /></TableCell></TableRow>
                  ) : orderItems.length === 0 ? (
                    <TableRow><TableCell colSpan={11} align="center" sx={{ py: 9, color: '#94a3b8' }}>자재 추가를 눌러 표준 자재 마스터에서 발주품목을 선택해주세요.</TableCell></TableRow>
                  ) : orderItems.map((row, index) => {
                    const over = row.executionRatio > 100;
                    return (
                      <TableRow key={`${row.materialId}-${index}`} hover>
                        <TableCell align="center">{index + 1}</TableCell>
                        <TableCell sx={{ fontWeight: 850 }}>{row.standardName}</TableCell>
                        <TableCell>{row.specification || '-'}</TableCell>
                        <TableCell align="center">{row.unit || '-'}</TableCell>
                        <TableCell align="right">{formatNumber(row.executionQuantity)}</TableCell>
                        <TableCell align="right">{formatNumber(row.previousQuantity)}</TableCell>
                        <TableCell sx={{ width: 120 }}>
                          <TextField
                            size="small"
                            type="number"
                            value={row.currentQuantity}
                            onChange={(event) => updateOrderItem(index, 'currentQuantity', event.target.value)}
                            disabled={isLocked}
                            inputProps={{ min: 0, step: 'any', style: { textAlign: 'right' } }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 850 }}>{formatNumber(row.cumulativeQuantity)}</TableCell>
                        <TableCell align="center">
                          <Chip label={`${row.executionRatio.toFixed(1)}%`} size="small" color={over ? 'error' : row.executionRatio >= 90 ? 'warning' : 'default'} variant={over ? 'filled' : 'outlined'} />
                        </TableCell>
                        <TableCell sx={{ minWidth: 170 }}>
                          <TextField size="small" fullWidth value={row.note} onChange={(event) => updateOrderItem(index, 'note', event.target.value)} disabled={isLocked} />
                        </TableCell>
                        <TableCell align="center">
                          {!isLocked && <IconButton size="small" color="error" onClick={() => setOrderItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
                {projectName} · 발주 기본값과 주요자재 실행물량을 설정합니다.
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
            value="materials"
            label={`주요자재 실행물량 (${settingsMaterials.filter((row) => row.included !== false).length})`}
          />
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
            현재 현장의 작성중·발주완료 발주서, 발주품목, 누계발주량, 발주번호 순번, 기본설정, 주요자재 실행물량과 변경이력을 모두 삭제합니다. 삭제한 자료는 복구할 수 없습니다.
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
            <Autocomplete freeSolo size="small" options={PROCESS_OPTIONS} value={masterForm.processName} onInputChange={(_, value) => setMasterForm((current) => ({ ...current, processName: value }))} renderInput={(params) => <TextField {...params} label="공정" />} />
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
            실행물량은 자재 마스터에서 관리하지 않습니다. <b>공정 주요자재 기본항목</b>으로 지정한 자재는 현장별 <b>기본설정</b>에서 실행물량을 입력합니다. 발주서에는 항상 표준 품명/규격이 사용됩니다.
          </Alert>
        </DialogContent>
        <DialogActions><Button onClick={() => setMasterDialogOpen(false)} disabled={saving}>취소</Button><Button variant="contained" onClick={saveMaster} disabled={saving} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveRoundedIcon />}>저장</Button></DialogActions>
      </Dialog>

      <Dialog open={categoryDialogOpen} onClose={() => setCategoryDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 900 }}>자재분류 관리</DialogTitle>
        <DialogContent dividers sx={{ p: 1.2 }}>
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

      <Snackbar open={Boolean(toast)} autoHideDuration={3200} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>{toast.text}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
