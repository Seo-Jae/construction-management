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

const COST_TYPES = [
  { value: 'material', label: '재료비', color: '#0f766e' },
  { value: 'labor', label: '노무비', color: '#b45309' },
  { value: 'expense', label: '경비', color: '#7c3aed' },
];

const EMPTY_DOCUMENT = {
  id: '',
  documentName: '',
  status: 'draft',
  versionNo: 0,
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
  unitPrice: 0,
  itemMarkupPercent: '',
  submittedQuantityOverride: '',
  remarks: '',
  sortOrder,
});

const getMarkupForType = (document, costType) => {
  if (costType === 'labor') return toNumber(document.laborMarkup);
  if (costType === 'expense') return toNumber(document.expenseMarkup);
  return toNumber(document.materialMarkup);
};

const getEffectiveMarkup = (row, document) => (
  row.itemMarkupPercent === '' || row.itemMarkupPercent === null
    ? getMarkupForType(document, row.costType)
    : toNumber(row.itemMarkupPercent)
);

const getSubmittedQuantity = (row, document) => {
  if (
    row.submittedQuantityOverride !== '' &&
    row.submittedQuantityOverride !== null
  ) {
    return toNumber(row.submittedQuantityOverride);
  }

  return toNumber(row.netQuantity) * (
    1 + getEffectiveMarkup(row, document) / 100
  );
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

export default function UnitPriceAnalysis({
  projectName,
  projectOptions = [],
  canManage = false,
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
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const priceUploadRef = useRef(null);

  const showToast = useCallback((message, severity = 'success') => {
    setToast({ open: true, message, severity });
  }, []);

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
      costType: item.cost_type || 'material',
      itemName: item.item_name || item.material?.item_name || '',
      specification: item.specification || item.material?.specification || '',
      unit: item.unit || item.material?.unit || '',
      netQuantity: toNumber(item.net_quantity),
      unitPrice: toNumber(item.unit_price_override ?? item.material?.current_unit_price),
      itemMarkupPercent: '',
      submittedQuantityOverride: '',
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

  const updateDraftRow = (clientId, field, value) => {
    setDraftRows((previous) => previous.map((row) => (
      row.clientId === clientId ? { ...row, [field]: value } : row
    )));
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

  const totals = useMemo(() => {
    const initial = {
      material: { net: 0, submitted: 0 },
      labor: { net: 0, submitted: 0 },
      expense: { net: 0, submitted: 0 },
    };

    return draftRows.reduce((result, row) => {
      const key = COST_TYPES.some((item) => item.value === row.costType)
        ? row.costType
        : 'material';
      result[key].net += toNumber(row.netQuantity) * toNumber(row.unitPrice);
      result[key].submitted += getSubmittedQuantity(row, documentState) * toNumber(row.unitPrice);
      return result;
    }, initial);
  }, [documentState, draftRows]);

  const grandNet = totals.material.net + totals.labor.net + totals.expense.net;
  const grandSubmitted = (
    totals.material.submitted + totals.labor.submitted + totals.expense.submitted
  );

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

  const handleSaveDocument = async () => {
    if (!projectName) {
      showToast('현장을 먼저 선택해주세요.', 'warning');
      return;
    }
    if (!selectedSpec) {
      showToast('벽체 또는 천정 규격을 선택해주세요.', 'warning');
      return;
    }
    if (!String(documentState.documentName || '').trim()) {
      showToast('일위대가 문서명을 입력해주세요.', 'warning');
      return;
    }
    if (draftRows.length === 0 || draftRows.every((row) => !row.itemName.trim())) {
      showToast('일위대가 항목을 한 개 이상 입력해주세요.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const documentPayload = {
        id: documentState.id || null,
        project_name: projectName,
        document_name: documentState.documentName.trim(),
        status: documentState.status,
        spec_id: selectedSpec.id,
        major_category: selectedSpec.major_category,
        middle_category: selectedSpec.middle_category,
        detail_category: selectedSpec.detail_category,
        material_markup_percent: toNumber(documentState.materialMarkup),
        labor_markup_percent: toNumber(documentState.laborMarkup),
        expense_markup_percent: toNumber(documentState.expenseMarkup),
        image_url: selectedSpec.image_url || '',
        notes: documentState.notes || '',
      };
      const itemPayload = draftRows
        .filter((row) => String(row.itemName || '').trim())
        .map((row, index) => ({
          source_template_item_id: row.sourceTemplateItemId || null,
          material_id: row.materialId || null,
          item_code: row.itemCode || '',
          cost_type: row.costType,
          item_name: row.itemName.trim(),
          specification: row.specification || '',
          unit: row.unit || '',
          net_quantity: toNumber(row.netQuantity),
          net_unit_price: toNumber(row.unitPrice),
          markup_override_percent:
            row.itemMarkupPercent === '' ? null : toNumber(row.itemMarkupPercent),
          submitted_quantity: getSubmittedQuantity(row, documentState),
          remarks: row.remarks || '',
          sort_order: index,
        }));

      const { data, error } = await supabase.rpc('save_unit_price_document', {
        p_document: documentPayload,
        p_items: itemPayload,
      });
      if (error) throw error;

      const nextId = data;
      const nextVersion = documentState.id ? documentState.versionNo + 1 : 1;
      setDocumentState((previous) => ({
        ...previous,
        id: nextId,
        versionNo: nextVersion,
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
      setDraftRows((data || []).map((item, index) => {
        const baseRow = {
          clientId: createClientId(),
          sourceTemplateItemId: item.source_template_item_id || '',
          materialId: item.material_id || '',
          itemCode: item.item_code || '',
          costType: item.cost_type || 'material',
          itemName: item.item_name || '',
          specification: item.specification || '',
          unit: item.unit || '',
          netQuantity: toNumber(item.net_quantity),
          unitPrice: toNumber(item.net_unit_price),
          itemMarkupPercent:
            item.markup_override_percent === null ? '' : toNumber(item.markup_override_percent),
          submittedQuantityOverride: '',
          remarks: item.remarks || '',
          sortOrder: item.sort_order ?? index,
        };
        const calculated = toNumber(baseRow.netQuantity) * (
          1 + getEffectiveMarkup(baseRow, nextDocument) / 100
        );
        if (Math.abs(calculated - toNumber(item.submitted_quantity)) > 0.000001) {
          baseRow.submittedQuantityOverride = toNumber(item.submitted_quantity);
        }
        return baseRow;
      }));
      setMainTab(0);
      showToast('저장된 일위대가를 불러왔습니다.', 'info');
    } catch (error) {
      console.error('일위대가 불러오기 실패:', error);
      showToast('저장된 일위대가를 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
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
    const search = materialSearch.trim().toLowerCase();
    return materials.filter((item) => {
      if (!search) return true;
      return [item.item_code, item.item_name, item.specification, item.unit]
        .some((value) => String(value || '').toLowerCase().includes(search));
    });
  }, [materialSearch, materials]);

  const pickerMaterials = useMemo(() => {
    const search = materialPicker.search.trim().toLowerCase();
    return materials
      .filter((item) => !search || [
        item.item_code,
        item.item_name,
        item.specification,
        item.unit,
      ].some((value) => String(value || '').toLowerCase().includes(search)))
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
    setSaving(true);
    try {
      const { error } = await supabase.rpc('replace_unit_price_spec_items', {
        p_spec_id: selectedTemplateSpecId,
        p_items: templateRows
          .filter((row) => row.itemName.trim())
          .map((row, index) => ({
            material_id: row.materialId || null,
            cost_type: row.costType,
            item_name: row.itemName,
            specification: row.specification || '',
            unit: row.unit || '',
            net_quantity: toNumber(row.netQuantity),
            unit_price_override: row.materialId ? null : toNumber(row.unitPrice),
            sort_order: index,
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

  const exportDocumentExcel = async () => {
    if (draftRows.length === 0) {
      showToast('내보낼 일위대가 항목이 없습니다.', 'warning');
      return;
    }
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '욱림건설 공사관리시스템';

    const createSheet = (mode, title) => {
      const sheet = workbook.addWorksheet(title);
      sheet.mergeCells('A1:M1');
      sheet.getCell('A1').value = `일위대가 (${title})`;
      sheet.getCell('A1').font = { size: 18, bold: true };
      sheet.getCell('A1').alignment = { horizontal: 'center' };
      sheet.addRow(['현장', projectName, '', '', '품명', documentState.documentName || selectedMiddle, '', '', '규격', selectedDetail, '', '', '']);
      sheet.addRow(['구분', selectedMajor, '', '', '중분류', selectedMiddle, '', '', '단위', 'M2', '', '', `버전 ${documentState.versionNo || 1}`]);
      sheet.addRow([]);
      sheet.addRow([
        '품명', '규격', '단위', '수량', '재료비 단가', '재료비 금액',
        '노무비 단가', '노무비 금액', '경비 단가', '경비 금액',
        '합계 단가', '합계 금액', '비고',
      ]);
      draftRows.forEach((row) => {
        const quantity = mode === 'net' ? toNumber(row.netQuantity) : getSubmittedQuantity(row, documentState);
        const price = toNumber(row.unitPrice);
        const amount = quantity * price;
        const materialPrice = row.costType === 'material' ? price : 0;
        const laborPrice = row.costType === 'labor' ? price : 0;
        const expensePrice = row.costType === 'expense' ? price : 0;
        sheet.addRow([
          row.itemName,
          row.specification,
          row.unit,
          quantity,
          materialPrice,
          row.costType === 'material' ? amount : 0,
          laborPrice,
          row.costType === 'labor' ? amount : 0,
          expensePrice,
          row.costType === 'expense' ? amount : 0,
          price,
          amount,
          row.remarks,
        ]);
      });
      const start = 6;
      const end = start + draftRows.length - 1;
      sheet.addRow([
        '합계', '', '', '', '', { formula: `SUM(F${start}:F${end})` }, '',
        { formula: `SUM(H${start}:H${end})` }, '', { formula: `SUM(J${start}:J${end})` }, '',
        { formula: `SUM(L${start}:L${end})` }, '',
      ]);
      sheet.columns = [28, 25, 8, 11, 13, 15, 13, 15, 13, 15, 13, 15, 22]
        .map((width) => ({ width }));
      sheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      sheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF94A3B8' } },
            left: { style: 'thin', color: { argb: 'FF94A3B8' } },
            bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
            right: { style: 'thin', color: { argb: 'FF94A3B8' } },
          };
          if (rowNumber >= 6 && [4, 5, 6, 7, 8, 9, 10, 11, 12].includes(cell.col)) {
            cell.numFmt = '#,##0.####';
          }
        });
      });
      sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
      sheet.views = [{ state: 'frozen', ySplit: 5 }];
    };

    createSheet('net', '정미값');
    createSheet('submitted', '제출용');
    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = String(documentState.documentName || selectedDetail || '일위대가')
      .replace(/[\\/:*?"<>|]/g, '_');
    saveBlob(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `일위대가_${safeName}_${getToday()}.xlsx`,
    );
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
          minWidth: 1200,
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
            <TableCell sx={{ ...compactHeaderCellSx, width: 56 }}>단위</TableCell>
            <TableCell sx={{ ...compactHeaderCellSx, width: 84 }}>정미수량</TableCell>
            <TableCell sx={{ ...compactHeaderCellSx, width: 84 }}>단가</TableCell>
            <TableCell sx={{ ...compactHeaderCellSx, width: 90 }}>정미금액</TableCell>
            <TableCell sx={{ ...compactHeaderCellSx, width: 92 }}>항목할증률</TableCell>
            <TableCell sx={{ ...compactHeaderCellSx, width: 94 }}>제출수량</TableCell>
            <TableCell sx={{ ...compactHeaderCellSx, width: 94 }}>제출금액</TableCell>
            <TableCell sx={{ ...compactHeaderCellSx, minWidth: 120 }}>비고</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {draftRows.map((row) => {
            const netAmount = toNumber(row.netQuantity) * toNumber(row.unitPrice);
            const submittedQuantity = getSubmittedQuantity(row, documentState);
            const submittedAmount = submittedQuantity * toNumber(row.unitPrice);
            const categoryMarkup = getMarkupForType(documentState, row.costType);
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
                    {COST_TYPES.map((item) => (
                      <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
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
                  <TextField value={row.unit} onChange={(event) => updateDraftRow(row.clientId, 'unit', event.target.value)} size="small" fullWidth />
                </TableCell>
                <TableCell sx={compactBodyCellSx}>
                  <CompactNumberField value={row.netQuantity} onChange={(value) => updateDraftRow(row.clientId, 'netQuantity', value)} min="0" />
                </TableCell>
                <TableCell sx={compactBodyCellSx}>
                  <CompactNumberField value={row.unitPrice} onChange={(value) => updateDraftRow(row.clientId, 'unitPrice', value)} min="0" step="1" />
                </TableCell>
                <TableCell align="right" sx={{ ...compactBodyCellSx, fontWeight: 700 }}>{formatMoney(netAmount)}</TableCell>
                <TableCell sx={compactBodyCellSx}>
                  <TextField
                    type="number"
                    value={row.itemMarkupPercent}
                    placeholder={`${categoryMarkup}%`}
                    onChange={(event) => updateDraftRow(row.clientId, 'itemMarkupPercent', event.target.value)}
                    size="small"
                    inputProps={{ min: 0, step: 0.1 }}
                    helperText={row.itemMarkupPercent === '' ? '분류값 적용' : '개별 적용'}
                    sx={{ '& .MuiInputBase-input': { textAlign: 'right' } }}
                  />
                </TableCell>
                <TableCell sx={compactBodyCellSx}>
                  <TextField
                    type="number"
                    value={row.submittedQuantityOverride}
                    placeholder={formatQuantity(submittedQuantity)}
                    onChange={(event) => updateDraftRow(row.clientId, 'submittedQuantityOverride', event.target.value)}
                    size="small"
                    inputProps={{ min: 0, step: 0.0001 }}
                    helperText={row.submittedQuantityOverride === '' ? '할증 자동계산' : '직접 수정'}
                    sx={{ '& .MuiInputBase-input': { textAlign: 'right' } }}
                  />
                </TableCell>
                <TableCell align="right" sx={{ ...compactBodyCellSx, color: '#b91c1c', fontWeight: 800 }}>{formatMoney(submittedAmount)}</TableCell>
                <TableCell sx={compactBodyCellSx}>
                  <TextField value={row.remarks} onChange={(event) => updateDraftRow(row.clientId, 'remarks', event.target.value)} size="small" fullWidth />
                </TableCell>
              </TableRow>
            );
          })}
          {draftRows.length === 0 && (
            <TableRow>
              <TableCell colSpan={12} align="center" sx={{ py: 6, color: '#64748b', fontSize: '0.7rem' }}>
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
              const rows = draftRows.filter((row) => row.costType === type.value);
              if (rows.length === 0) return [];
              return [
                <TableRow key={`${type.value}-title`} className="print-section-row"><TableCell colSpan={13}>■ {type.label}</TableCell></TableRow>,
                ...rows.map((row) => {
                  const quantity = isNet ? toNumber(row.netQuantity) : getSubmittedQuantity(row, documentState);
                  const amount = quantity * toNumber(row.unitPrice);
                  return (
                    <TableRow key={row.clientId}>
                      <TableCell>{row.itemName}</TableCell><TableCell>{row.specification}</TableCell><TableCell>{row.unit}</TableCell><TableCell>{formatQuantity(quantity)}</TableCell>
                      <TableCell>{row.costType === 'material' ? formatMoney(row.unitPrice) : ''}</TableCell><TableCell>{row.costType === 'material' ? formatMoney(amount) : ''}</TableCell>
                      <TableCell>{row.costType === 'labor' ? formatMoney(row.unitPrice) : ''}</TableCell><TableCell>{row.costType === 'labor' ? formatMoney(amount) : ''}</TableCell>
                      <TableCell>{row.costType === 'expense' ? formatMoney(row.unitPrice) : ''}</TableCell><TableCell>{row.costType === 'expense' ? formatMoney(amount) : ''}</TableCell>
                      <TableCell>{formatMoney(row.unitPrice)}</TableCell><TableCell>{formatMoney(amount)}</TableCell><TableCell>{row.remarks}</TableCell>
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
        {documentState.notes && <Typography className="print-note">※ {documentState.notes}</Typography>}
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
                      placeholder={`${selectedMiddle || '공정'} ${selectedDetail || '규격'} 일위대가`}
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

                <Paper variant="outlined" sx={{ p: 1.3 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(130px, 1fr)) 2fr' }, gap: 1 }}>
                    {COST_TYPES.map((type) => {
                      const key = type.value === 'material' ? 'materialMarkup' : type.value === 'labor' ? 'laborMarkup' : 'expenseMarkup';
                      return (
                        <TextField
                          key={type.value} type="number" size="small" label={`${type.label} 기본 할증률(%)`}
                          value={documentState[key]}
                          onChange={(event) => setDocumentState((previous) => ({ ...previous, [key]: event.target.value }))}
                          inputProps={{ min: 0, step: 0.1 }}
                        />
                      );
                    })}
                    <TextField size="small" label="문서 비고" value={documentState.notes} onChange={(event) => setDocumentState((previous) => ({ ...previous, notes: event.target.value }))} />
                  </Box>
                </Paper>
              </Box>

              <Stack spacing={1.2}>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography sx={{ fontWeight: 900, mb: 1 }}>금액 요약</Typography>
                  {COST_TYPES.map((type) => (
                    <Box key={type.value} sx={{ py: 0.8, borderBottom: '1px dashed #cbd5e1' }}>
                      <Typography sx={{ fontSize: '0.72rem', color: type.color, fontWeight: 900 }}>{type.label}</Typography>
                      <Stack direction="row" justifyContent="space-between"><Typography sx={{ fontSize: '0.76rem' }}>정미</Typography><Typography sx={{ fontWeight: 800 }}>{formatMoney(totals[type.value].net)}원</Typography></Stack>
                      <Stack direction="row" justifyContent="space-between"><Typography sx={{ fontSize: '0.76rem' }}>제출</Typography><Typography sx={{ color: '#b91c1c', fontWeight: 900 }}>{formatMoney(totals[type.value].submitted)}원</Typography></Stack>
                    </Box>
                  ))}
                  <Box sx={{ mt: 1.2, p: 1.2, borderRadius: 1, bgcolor: '#0f172a', color: '#fff' }}>
                    <Typography sx={{ fontSize: '0.72rem', opacity: 0.75 }}>1㎡당 총 일위대가</Typography>
                    <Typography sx={{ fontSize: '0.8rem' }}>정미 {formatMoney(grandNet)}원</Typography>
                    <Typography sx={{ mt: 0.3, fontSize: '1.15rem', fontWeight: 950 }}>제출 {formatMoney(grandSubmitted)}원</Typography>
                  </Box>
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.3, minHeight: 180, display: 'grid', placeItems: 'center', bgcolor: '#f8fafc' }}>
                  {selectedSpec?.image_url ? (
                    <Box component="img" src={selectedSpec.image_url} alt={selectedSpec.detail_category} sx={{ width: '100%', maxHeight: 230, objectFit: 'contain' }} />
                  ) : (
                    <Stack alignItems="center" spacing={0.7} sx={{ color: '#94a3b8' }}>
                      <ImageOutlinedIcon sx={{ fontSize: 44 }} />
                      <Typography sx={{ fontWeight: 800, fontSize: '0.8rem' }}>기술자료 이미지 준비 중</Typography>
                      <Typography sx={{ fontSize: '0.68rem', textAlign: 'center' }}>{selectedMiddle}<br />{selectedDetail}</Typography>
                    </Stack>
                  )}
                </Paper>

                <FormControl size="small" fullWidth><InputLabel>출력 기준</InputLabel><Select value={printMode} label="출력 기준" onChange={(event) => setPrintMode(event.target.value)}><MenuItem value="net">정미 일위대가</MenuItem><MenuItem value="submitted">제출용 일위대가</MenuItem></Select></FormControl>
                {documentState.id && <Alert severity="info" icon={<EditNoteRoundedIcon />} sx={{ fontSize: '0.72rem' }}>저장본 v{documentState.versionNo}을 편집 중입니다.</Alert>}
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
                    {['구분', '품명', '규격', '단위', '기본 정미수량', '기준단가', '비고', ''].map((label) => <TableCell key={label} sx={headerCellSx}>{label}</TableCell>)}
                  </TableRow></TableHead><TableBody>
                    {templateRows.map((row) => <TableRow key={row.clientId}>
                      <TableCell sx={bodyCellSx}><Select disabled={!canManage} size="small" value={row.costType} onChange={(event) => setTemplateRows((previous) => previous.map((item) => item.clientId === row.clientId ? { ...item, costType: event.target.value } : item))}>{COST_TYPES.map((type) => <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>)}</Select></TableCell>
                      <TableCell sx={bodyCellSx}><TextField disabled={!canManage} size="small" value={row.itemName} onChange={(event) => setTemplateRows((previous) => previous.map((item) => item.clientId === row.clientId ? { ...item, itemName: event.target.value } : item))} /></TableCell>
                      <TableCell sx={bodyCellSx}><TextField disabled={!canManage} size="small" value={row.specification} onChange={(event) => setTemplateRows((previous) => previous.map((item) => item.clientId === row.clientId ? { ...item, specification: event.target.value } : item))} /></TableCell>
                      <TableCell sx={bodyCellSx}><TextField disabled={!canManage} size="small" value={row.unit} onChange={(event) => setTemplateRows((previous) => previous.map((item) => item.clientId === row.clientId ? { ...item, unit: event.target.value } : item))} /></TableCell>
                      <TableCell sx={bodyCellSx}><CompactNumberField disabled={!canManage} value={row.netQuantity} onChange={(value) => setTemplateRows((previous) => previous.map((item) => item.clientId === row.clientId ? { ...item, netQuantity: value } : item))} /></TableCell>
                      <TableCell sx={bodyCellSx}><CompactNumberField disabled={!canManage || Boolean(row.materialId)} value={row.unitPrice} onChange={(value) => setTemplateRows((previous) => previous.map((item) => item.clientId === row.clientId ? { ...item, unitPrice: value } : item))} min="0" step="1" /></TableCell>
                      <TableCell sx={bodyCellSx}><TextField disabled={!canManage} size="small" value={row.remarks} onChange={(event) => setTemplateRows((previous) => previous.map((item) => item.clientId === row.clientId ? { ...item, remarks: event.target.value } : item))} /></TableCell>
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
          <TableContainer sx={{ maxHeight: 460 }}>
            <Table stickyHeader size="small">
              <TableHead><TableRow><TableCell sx={headerCellSx}>품명</TableCell><TableCell sx={headerCellSx}>규격</TableCell><TableCell sx={headerCellSx}>단위</TableCell><TableCell sx={headerCellSx}>현재단가</TableCell><TableCell sx={headerCellSx} /></TableRow></TableHead>
              <TableBody>{pickerMaterials.map((item) => <TableRow key={item.id} hover><TableCell sx={bodyCellSx}>{item.item_name}</TableCell><TableCell sx={bodyCellSx}>{item.specification || '-'}</TableCell><TableCell sx={bodyCellSx}>{item.unit}</TableCell><TableCell align="right" sx={bodyCellSx}>{formatMoney(item.current_unit_price)}원</TableCell><TableCell sx={bodyCellSx}><Button size="small" onClick={() => addMaterialToDraft(item)}>추가</Button></TableCell></TableRow>)}</TableBody>
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
