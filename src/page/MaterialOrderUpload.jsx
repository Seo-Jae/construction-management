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
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
  executionQuantity: '',
  note: '',
  isActive: true,
};

const normalizeText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const numberValue = (value) => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
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

  const currentUserId = getProfileId(userProfile);
  const isLocked = order.status === 'confirmed' || order.status === 'cancelled';

  const notify = useCallback((severity, text) => {
    setToast({ severity, text });
  }, []);

  const handleSchemaError = useCallback(
    (error) => {
      if (error?.code === '42P01' || String(error?.message || '').includes('does not exist')) {
        setSchemaMissing(true);
        notify('error', '자재발주 1차 DB 구조가 아직 적용되지 않았습니다. 제공된 SQL을 먼저 실행해주세요.');
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

  const loadMasterRows = useCallback(async () => {
    if (!projectName) return;
    setMasterLoading(true);
    try {
      let query = supabase
        .from('material_master_items')
        .select('id, category_id, process_name, standard_name, specification, unit, manufacturer, aliases, note, is_active, updated_at')
        .eq('is_active', true)
        .order('standard_name', { ascending: true })
        .limit(300);

      if (masterCategoryId) query = query.eq('category_id', masterCategoryId);
      const keyword = normalizeText(masterSearch);
      if (keyword) query = query.ilike('search_text', `%${keyword}%`);

      const { data: materials, error } = await query;
      if (error) throw error;

      const materialIds = (materials || []).map((row) => row.id);
      let projectQuantities = [];
      if (materialIds.length > 0) {
        const { data, error: quantityError } = await supabase
          .from('material_project_materials')
          .select('material_id, execution_quantity, note')
          .eq('project_name', projectName)
          .in('material_id', materialIds);
        if (quantityError) throw quantityError;
        projectQuantities = data || [];
      }

      const quantityMap = new Map(projectQuantities.map((row) => [row.material_id, row]));
      setMasterRows(
        (materials || []).map((row) => ({
          ...row,
          execution_quantity: quantityMap.get(row.id)?.execution_quantity ?? 0,
          project_note: quantityMap.get(row.id)?.note || '',
        })),
      );
    } catch (error) {
      if (!handleSchemaError(error)) notify('error', `자재 마스터 조회 실패: ${error.message}`);
    } finally {
      setMasterLoading(false);
    }
  }, [handleSchemaError, masterCategoryId, masterSearch, notify, projectName]);

  useEffect(() => {
    setSchemaMissing(false);
    loadCategories();
    loadOrders();
  }, [loadCategories, loadOrders, projectName]);

  useEffect(() => {
    if (mainTab === 'master') loadMasterRows();
  }, [loadMasterRows, mainTab]);

  const createNewOrder = useCallback(() => {
    setOrder({
      ...EMPTY_ORDER,
      orderDate: getKoreaToday(),
      requesterName: getProfileName(userProfile),
    });
    setOrderItems([]);
    setMainTab('order');
  }, [userProfile]);

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

      if (order.categoryId) query = query.eq('category_id', order.categoryId);
      if (order.processName) query = query.eq('process_name', order.processName);
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
  }, [materialPickerSearch, notify, order.categoryId, order.processName, projectName]);

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
      executionQuantity: row.execution_quantity ?? '',
      note: row.project_note || row.note || '',
      isActive: row.is_active !== false,
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

      const { error: projectError } = await supabase
        .from('material_project_materials')
        .upsert(
          {
            project_name: projectName,
            material_id: materialId,
            execution_quantity: numberValue(masterForm.executionQuantity),
            note: normalizeText(masterForm.note) || null,
            updated_by: currentUserId || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'project_name,material_id' },
        );
      if (projectError) throw projectError;

      notify('success', masterForm.id ? '자재 마스터를 수정했습니다.' : '자재 마스터를 등록했습니다.');
      setMasterDialogOpen(false);
      await loadMasterRows();
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
          onChange={(_, value) => setMainTab(value)}
          sx={{ ml: 'auto', minHeight: 34, '& .MuiTab-root': { minHeight: 34, py: 0.4, fontSize: '0.72rem', fontWeight: 850 } }}
        >
          <Tab value="order" icon={<AddShoppingCartRoundedIcon fontSize="small" />} iconPosition="start" label="발주서 작성" />
          <Tab value="master" icon={<Inventory2RoundedIcon fontSize="small" />} iconPosition="start" label="자재 마스터" />
          <Tab value="history" icon={<HistoryRoundedIcon fontSize="small" />} iconPosition="start" label="발주이력" />
        </Tabs>

        <Tooltip title="새로고침" arrow>
          <IconButton
            size="small"
            onClick={() => {
              loadCategories();
              loadOrders();
              if (mainTab === 'master') loadMasterRows();
            }}
          >
            <RefreshRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Paper>

      {schemaMissing && (
        <Alert severity="warning" sx={{ py: 0.25 }}>
          자재발주 1차 DB SQL이 적용되지 않았습니다. 패키지의 <b>supabase_v52.48.5.44.120_material_order_phase1.sql</b>을 Supabase SQL Editor에서 먼저 실행해주세요.
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
                  {['분류', '공정', '표준 품명', '표준 규격', '단위', '제조사', '실행물량', '별칭', '수정'].map((label) => (
                    <TableCell key={label} align={['실행물량', '수정'].includes(label) ? 'center' : 'left'} sx={{ fontWeight: 900, bgcolor: '#f8fafc', whiteSpace: 'nowrap' }}>{label}</TableCell>
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
                    <TableCell align="right" sx={{ fontWeight: 850 }}>{formatNumber(row.execution_quantity)}</TableCell>
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
                <TextField size="small" label="발주일" type="date" InputLabelProps={{ shrink: true }} value={order.orderDate} onChange={(e) => setOrder((current) => ({ ...current, orderDate: e.target.value }))} disabled={isLocked} />
                <TextField size="small" label="요청자" value={order.requesterName} onChange={(e) => setOrder((current) => ({ ...current, requesterName: e.target.value }))} disabled={isLocked} />
                <TextField select size="small" label="자재분류" value={order.categoryId} onChange={(e) => setOrder((current) => ({ ...current, categoryId: e.target.value }))} disabled={isLocked}>
                  <MenuItem value="">전체/혼합</MenuItem>
                  {categories.map((row) => <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}
                </TextField>
                <Autocomplete freeSolo size="small" options={PROCESS_OPTIONS} value={order.processName || ''} onInputChange={(_, value) => setOrder((current) => ({ ...current, processName: value }))} disabled={isLocked} renderInput={(params) => <TextField {...params} label="공정" />} />
                <TextField size="small" label="납품희망일" type="date" InputLabelProps={{ shrink: true }} value={order.deliveryDate} onChange={(e) => setOrder((current) => ({ ...current, deliveryDate: e.target.value }))} disabled={isLocked} />
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
              {!isLocked && <Button size="small" variant="contained" onClick={() => setMaterialPickerOpen(true)} startIcon={<AddRoundedIcon />} sx={{ ml: 'auto !important' }}>자재 추가</Button>}
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

      <Dialog open={materialPickerOpen} onClose={() => setMaterialPickerOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 900 }}>표준 자재 선택</DialogTitle>
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
                    <TableCell><Button size="small" variant="outlined" onClick={() => addMaterialToOrder(row)}>추가</Button></TableCell>
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
            <TextField size="small" type="number" label={`${projectName} 실행물량`} value={masterForm.executionQuantity} onChange={(e) => setMasterForm((current) => ({ ...current, executionQuantity: e.target.value }))} inputProps={{ min: 0, step: 'any' }} />
            <TextField size="small" label="검색 별칭" value={masterForm.aliasesText} onChange={(e) => setMasterForm((current) => ({ ...current, aliasesText: e.target.value }))} placeholder="쉼표로 구분: SQ바, 에스큐바, square bar" />
            <TextField size="small" multiline minRows={2} label="비고" value={masterForm.note} onChange={(e) => setMasterForm((current) => ({ ...current, note: e.target.value }))} sx={{ gridColumn: '1 / -1' }} />
          </Box>
          <Alert severity="info" sx={{ mt: 1.2, py: 0.2 }}>
            담당자가 다른 명칭으로 검색하더라도 이 표준 자재로 귀결되도록 별칭을 충분히 등록해주세요. 발주서에는 항상 <b>표준 품명/규격</b>이 사용됩니다.
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
