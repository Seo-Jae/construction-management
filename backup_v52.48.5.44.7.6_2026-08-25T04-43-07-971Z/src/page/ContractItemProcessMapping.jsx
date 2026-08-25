// v52.48.5.44.7.5 기성양식-계약품목 공정연결 실시간 연동
import React, {
  useCallback,
  useDeferredValue,
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
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { supabase } from '../supabaseClient';

import SystemPageTitle from '../components/SystemPageTitle.jsx';
import SystemRefreshButton from '../components/SystemRefreshButton.jsx';
const PAGE_SIZE = 1000;
const PROCESS_SEPARATOR = ' + ';
const HOUSEHOLD_TYPE_PATTERN = /^(68A|68B|84A|84B|101)(?:_|$)/i;
const EXCLUDED_PROCESS_OPTIONS = new Set(['허리먹']);

const DEFAULT_PROCESS_OPTIONS = [
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

const moneyFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 0,
});

const quantityFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 4,
});

const normalizeText = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();

const normalizeProcessOption = (process) => {
  if (process === '경량골조' || process === '경량석고') return '경량벽체';
  if (process === '1차몰딩' || process === '2차몰딩') return '몰딩';
  if (process === '1차 걸레받이' || process === '2차 걸레받이') return '걸레받이';
  return String(process || '').trim();
};

const buildProcessOptions = (processOptions = []) =>
  Array.from(
    new Set(
      [...DEFAULT_PROCESS_OPTIONS, ...processOptions.map(normalizeProcessOption)]
        .map((value) => String(value || '').trim())
        .filter((value) => Boolean(value) && !EXCLUDED_PROCESS_OPTIONS.has(value)),
    ),
  );

const decodeProcessTypes = (value) =>
  Array.from(
    new Set(
      String(value || '')
        .split(/\s*\+\s*|\s*,\s*/g)
        .map((process) => normalizeProcessOption(process))
        .filter(Boolean),
    ),
  );

const encodeProcessTypes = (values) =>
  Array.from(
    new Set(
      (values || [])
        .map((value) => normalizeProcessOption(value))
        .filter(Boolean),
    ),
  ).join(PROCESS_SEPARATOR);

const getProcessLabel = (value) => {
  const values = decodeProcessTypes(value);
  return values.length > 0 ? values.join(PROCESS_SEPARATOR) : '미연결';
};

const getTypeLabel = (item) => {
  /*
    표준 기성양식 B열은 이제 '구분'이며 classification이 원본값입니다.
    과거에는 housing_type을 먼저 보면서 classification을 '세대/공용'으로
    수정해도 계약품목 공정연결 화면에 이전값이 남을 수 있었습니다.
  */
  const classification = String(
    item?.classification || '',
  ).trim();

  if (classification) {
    return HOUSEHOLD_TYPE_PATTERN.test(
      classification,
    )
      ? '세대'
      : classification;
  }

  const housingType = String(
    item?.housing_type || '',
  ).trim();

  if (!housingType) {
    return '미분류';
  }

  return HOUSEHOLD_TYPE_PATTERN.test(
    housingType,
  )
    ? '세대'
    : housingType;
};

const getSameItemKey = (item) =>
  `${getTypeLabel(item)}::${String(item?.base_item_name || item?.item_name || '').trim()}`;

const getRowIds = (row) =>
  Array.isArray(row?.group_item_ids) && row.group_item_ids.length > 0
    ? row.group_item_ids
    : [row?.id].filter(Boolean);

const buildGroupedRows = (items) => {
  const groups = new Map();

  items.forEach((item) => {
    const key = getSameItemKey(item);
    const existing = groups.get(key);
    const normalizedProcess = encodeProcessTypes(decodeProcessTypes(item.process_type));

    if (!existing) {
      groups.set(key, {
        ...item,
        id: `group:${key}`,
        source_row_no: item.source_row_no,
        classification: getTypeLabel(item),
        housing_type: getTypeLabel(item),
        item_name: item.base_item_name || item.item_name,
        base_item_name: item.base_item_name || item.item_name,
        group_item_ids: [item.id],
        group_count: 1,
        group_row_numbers: [item.source_row_no],
        group_specifications: new Set([String(item.specification || '').trim()].filter(Boolean)),
        group_units: new Set([String(item.unit || '').trim()].filter(Boolean)),
        group_options: new Set([String(item.option_type || '').trim()].filter(Boolean)),
        group_processes: new Set([normalizedProcess]),
        contract_quantity: Number(item.contract_quantity || 0),
        contract_material_amount: Number(item.contract_material_amount || 0),
        contract_labor_amount: Number(item.contract_labor_amount || 0),
        contract_expense_amount: Number(item.contract_expense_amount || 0),
      });
      return;
    }

    existing.group_item_ids.push(item.id);
    existing.group_count += 1;
    existing.group_row_numbers.push(item.source_row_no);
    existing.group_specifications.add(String(item.specification || '').trim());
    existing.group_units.add(String(item.unit || '').trim());
    existing.group_options.add(String(item.option_type || '').trim());
    existing.group_processes.add(normalizedProcess);
    existing.contract_quantity += Number(item.contract_quantity || 0);
    existing.contract_material_amount += Number(item.contract_material_amount || 0);
    existing.contract_labor_amount += Number(item.contract_labor_amount || 0);
    existing.contract_expense_amount += Number(item.contract_expense_amount || 0);
  });

  return Array.from(groups.values()).map((group) => {
    const specifications = Array.from(group.group_specifications);
    const units = Array.from(group.group_units);
    const options = Array.from(group.group_options);
    const processes = Array.from(group.group_processes);
    const mixedProcess = processes.length > 1;

    return {
      ...group,
      source_row_no: `${group.group_count.toLocaleString()}건`,
      specification:
        specifications.length <= 1
          ? specifications[0] || '-'
          : `규격 ${specifications.length.toLocaleString()}종`,
      unit: units.length <= 1 ? units[0] || '-' : '혼합',
      option_type: options.length <= 1 ? options[0] || '기본' : '혼합',
      process_type: mixedProcess ? '' : processes[0] || '',
      group_process_mixed: mixedProcess,
    };
  });
};

const fetchAllContractItems = async ({ projectName, contractVersionId }) => {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('progress_contract_items')
      .select(
        [
          'id',
          'contract_version_id',
          'project_name',
          'source_key',
          'source_row_no',
          'sort_order',
          'classification',
          'housing_type',
          'option_type',
          'work_zone',
          'item_name',
          'base_item_name',
          'specification',
          'unit',
          'process_type',
          'contract_quantity',
          'contract_material_amount',
          'contract_labor_amount',
          'contract_expense_amount',
          'mapped_by_name',
          'mapped_at',
        ].join(','),
      )
      .eq('project_name', projectName)
      .eq('contract_version_id', contractVersionId)
      .order('sort_order', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const pageRows = data || [];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows.map((item) => ({
    ...item,
    process_type: encodeProcessTypes(decodeProcessTypes(item.process_type)),
  }));
};

function ContractItemProcessMapping({
  projectName,
  userProfile,
  processOptions = [],
}) {
  const [versions, setVersions] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [items, setItems] = useState([]);
  const [originalMappings, setOriginalMappings] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [
    contractMasterRefreshTick,
    setContractMasterRefreshTick,
  ] = useState(0);
  const [keyword, setKeyword] = useState('');
  const deferredKeyword = useDeferredValue(keyword);
  const [typeFilter, setTypeFilter] = useState('전체');
  const [optionFilter, setOptionFilter] = useState('전체');
  const [mappingFilter, setMappingFilter] = useState('전체');
  const [groupSameItem, setGroupSameItem] = useState(false);
  const [tablePage, setTablePage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [message, setMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [processDialogTargetIds, setProcessDialogTargetIds] = useState([]);
  const [processDialogValues, setProcessDialogValues] = useState([]);
  const [processDialogTitle, setProcessDialogTitle] = useState('공정 연결');
  const [processDialogKeyword, setProcessDialogKeyword] = useState('');
  const [processDialogTypeFilter, setProcessDialogTypeFilter] = useState('전체');
  const [processDialogMappingFilter, setProcessDialogMappingFilter] =
    useState('전체');
  const deferredProcessDialogKeyword = useDeferredValue(processDialogKeyword);

  const claimProcessOptions = useMemo(
    () => buildProcessOptions(processOptions),
    [processOptions],
  );

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) || null,
    [selectedVersionId, versions],
  );

  const loadVersions = useCallback(async () => {
    if (!projectName) return;

    setLoading(true);
    setErrorMessage('');

    try {
      const { data, error } = await supabase
        .from('progress_contract_versions')
        .select('id, project_name, version_label, effective_date, source_file_name, created_at')
        .eq('project_name', projectName)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const nextVersions = data || [];
      setVersions(nextVersions);
      setSelectedVersionId((previous) => {
        if (previous && nextVersions.some((version) => version.id === previous)) {
          return previous;
        }
        return nextVersions[nextVersions.length - 1]?.id || '';
      });
    } catch (error) {
      console.error(error);
      setErrorMessage(`계약 버전을 불러오지 못했습니다: ${error.message}`);
      setVersions([]);
      setSelectedVersionId('');
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  const loadItems = useCallback(async () => {
    if (!projectName || !selectedVersionId) {
      setItems([]);
      setOriginalMappings(new Map());
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setMessage(null);

    try {
      const nextItems = await fetchAllContractItems({
        projectName,
        contractVersionId: selectedVersionId,
      });

      setItems(nextItems);
      setOriginalMappings(
        new Map(
          nextItems.map((item) => [
            item.id,
            encodeProcessTypes(decodeProcessTypes(item.process_type)),
          ]),
        ),
      );
      setSelectedIds(new Set());
    } catch (error) {
      console.error(error);
      setErrorMessage(`계약 품목을 불러오지 못했습니다: ${error.message}`);
      setItems([]);
      setOriginalMappings(new Map());
    } finally {
      setLoading(false);
    }
  }, [projectName, selectedVersionId]);

  useEffect(() => {
    loadVersions();
  }, [
    loadVersions,
    contractMasterRefreshTick,
  ]);

  useEffect(() => {
    loadItems();
  }, [
    loadItems,
    contractMasterRefreshTick,
  ]);

  useEffect(() => {
    if (
      typeof window === 'undefined'
    ) {
      return undefined;
    }

    const handleContractMasterChanged = (
      event,
    ) => {
      const detail =
        event?.detail || {};

      if (
        detail.source ===
        'contract-item-process-mapping'
      ) {
        return;
      }

      if (
        detail.projectName &&
        detail.projectName !== projectName
      ) {
        return;
      }

      setContractMasterRefreshTick(
        (previous) => previous + 1,
      );
    };

    window.addEventListener(
      'progress-contract-master-changed',
      handleContractMasterChanged,
    );

    return () => {
      window.removeEventListener(
        'progress-contract-master-changed',
        handleContractMasterChanged,
      );
    };
  }, [projectName]);

  const typeOptions = useMemo(
    () =>
      Array.from(new Set(items.map(getTypeLabel).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'ko'),
      ),
    [items],
  );

  const sourceRows = useMemo(
    () => (groupSameItem ? buildGroupedRows(items) : items),
    [groupSameItem, items],
  );

  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const processDialogTypeOptions = useMemo(() => {
    const counts = new Map();

    items.forEach((item) => {
      const label = getTypeLabel(item);
      counts.set(label, (counts.get(label) || 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((first, second) =>
        first.label.localeCompare(second.label, 'ko'),
      );
  }, [items]);

  const filteredRows = useMemo(() => {
    const normalizedKeyword = normalizeText(deferredKeyword);

    return sourceRows.filter((row) => {
      const rowIds = getRowIds(row);
      const underlying = rowIds
        .map((id) => itemById.get(id))
        .filter(Boolean);
      const typeLabel = getTypeLabel(row);
      const optionValues = Array.from(
        new Set(underlying.map((item) => item.option_type || '기본')),
      );
      const mappedCount = underlying.filter(
        (item) => decodeProcessTypes(item.process_type).length > 0,
      ).length;

      if (typeFilter !== '전체' && typeLabel !== typeFilter) return false;
      if (optionFilter !== '전체' && !optionValues.includes(optionFilter)) return false;
      if (mappingFilter === '연결' && mappedCount !== underlying.length) return false;
      if (mappingFilter === '미연결' && mappedCount === underlying.length) return false;

      if (!normalizedKeyword) return true;

      return normalizeText(
        [
          typeLabel,
          row.option_type,
          row.item_name,
          row.base_item_name,
          row.specification,
          row.unit,
          row.process_type,
        ].join(' '),
      ).includes(normalizedKeyword);
    });
  }, [deferredKeyword, itemById, mappingFilter, optionFilter, sourceRows, typeFilter]);

  const processDialogRows = useMemo(() => {
    const normalizedKeyword = normalizeText(deferredProcessDialogKeyword);

    return sourceRows.filter((row) => {
      const rowIds = getRowIds(row);
      const underlying = rowIds
        .map((id) => itemById.get(id))
        .filter(Boolean);
      const typeLabel = getTypeLabel(row);
      const mappedCount = underlying.filter(
        (item) => decodeProcessTypes(item.process_type).length > 0,
      ).length;

      if (
        processDialogTypeFilter !== '전체' &&
        typeLabel !== processDialogTypeFilter
      ) {
        return false;
      }

      if (
        processDialogMappingFilter === '연결' &&
        mappedCount !== underlying.length
      ) {
        return false;
      }

      if (
        processDialogMappingFilter === '미연결' &&
        mappedCount === underlying.length
      ) {
        return false;
      }

      if (!normalizedKeyword) return true;

      return normalizeText(
        [
          typeLabel,
          row.option_type,
          row.item_name,
          row.base_item_name,
          row.specification,
          row.unit,
          row.process_type,
        ].join(' '),
      ).includes(normalizedKeyword);
    });
  }, [
    deferredProcessDialogKeyword,
    itemById,
    processDialogMappingFilter,
    processDialogTypeFilter,
    sourceRows,
  ]);

  useEffect(() => {
    setTablePage(0);
  }, [deferredKeyword, groupSameItem, mappingFilter, optionFilter, selectedVersionId, typeFilter]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredRows.length / rowsPerPage) - 1);
    setTablePage((previous) => Math.min(previous, maxPage));
  }, [filteredRows.length, rowsPerPage]);

  const pagedRows = useMemo(
    () => filteredRows.slice(tablePage * rowsPerPage, tablePage * rowsPerPage + rowsPerPage),
    [filteredRows, rowsPerPage, tablePage],
  );

  const totalCount = items.length;
  const mappedCount = useMemo(
    () => items.filter((item) => decodeProcessTypes(item.process_type).length > 0).length,
    [items],
  );
  const unmappedCount = totalCount - mappedCount;

  const changedItems = useMemo(
    () =>
      items.filter((item) => {
        const current = encodeProcessTypes(decodeProcessTypes(item.process_type));
        const original = originalMappings.get(item.id) || '';
        return current !== original;
      }),
    [items, originalMappings],
  );

  const filteredItemIds = useMemo(
    () => Array.from(new Set(filteredRows.flatMap(getRowIds))),
    [filteredRows],
  );

  const allFilteredSelected =
    filteredItemIds.length > 0 && filteredItemIds.every((id) => selectedIds.has(id));
  const someFilteredSelected =
    !allFilteredSelected && filteredItemIds.some((id) => selectedIds.has(id));

  const processDialogItemIds = useMemo(
    () => Array.from(new Set(processDialogRows.flatMap(getRowIds))),
    [processDialogRows],
  );

  const allProcessDialogSelected =
    processDialogItemIds.length > 0 &&
    processDialogItemIds.every((id) => processDialogTargetIds.includes(id));
  const someProcessDialogSelected =
    !allProcessDialogSelected &&
    processDialogItemIds.some((id) => processDialogTargetIds.includes(id));

  const updateSelectedIds = useCallback((ids, checked) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      ids.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }, []);

  const updateProcessDialogTargetIds = useCallback((ids, checked) => {
    setProcessDialogTargetIds((previous) => {
      const next = new Set(previous);
      ids.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return Array.from(next);
    });
  }, []);

  const applyProcessToIds = useCallback((ids, encodedProcess) => {
    const targetSet = new Set(ids);
    setItems((previous) =>
      previous.map((item) =>
        targetSet.has(item.id)
          ? {
              ...item,
              process_type: encodedProcess,
            }
          : item,
      ),
    );
  }, []);

  const openProcessDialog = useCallback((ids, title) => {
    if (!ids || ids.length === 0) return;

    const targetItems = items.filter((item) => ids.includes(item.id));
    const uniqueProcessValues = Array.from(
      new Set(
        targetItems.map((item) =>
          encodeProcessTypes(decodeProcessTypes(item.process_type)),
        ),
      ),
    );

    setProcessDialogTargetIds(ids);
    setProcessDialogValues(
      uniqueProcessValues.length === 1
        ? decodeProcessTypes(uniqueProcessValues[0])
        : [],
    );
    setProcessDialogTitle(title || '공정 연결');
    setProcessDialogKeyword('');
    setProcessDialogTypeFilter('전체');
    setProcessDialogMappingFilter('전체');
    setProcessDialogOpen(true);
  }, [items]);

  const handleApplyDialogProcess = useCallback(() => {
    if (
      processDialogTargetIds.length === 0 ||
      processDialogValues.length === 0
    ) {
      return;
    }

    applyProcessToIds(processDialogTargetIds, encodeProcessTypes(processDialogValues));
    setProcessDialogOpen(false);
    setMessage({
      severity: 'success',
      text: `${processDialogTargetIds.length.toLocaleString()}개 계약 품목의 공정 연결을 변경했습니다. 저장 버튼을 눌러 반영해주세요.`,
    });
  }, [applyProcessToIds, processDialogTargetIds, processDialogValues]);

  const handleClearDialogMappings = useCallback(() => {
    if (processDialogTargetIds.length === 0) return;

    applyProcessToIds(processDialogTargetIds, '');
    setProcessDialogOpen(false);
    setMessage({
      severity: 'info',
      text: `${processDialogTargetIds.length.toLocaleString()}개 계약 품목의 공정 연결을 해제했습니다. 저장 버튼을 눌러 반영해주세요.`,
    });
  }, [applyProcessToIds, processDialogTargetIds]);

  const handleVersionChange = (nextVersionId) => {
    if (
      changedItems.length > 0 &&
      !window.confirm('저장하지 않은 공정 연결 변경사항이 있습니다. 계약 버전을 변경하시겠습니까?')
    ) {
      return;
    }

    setSelectedVersionId(nextVersionId);
  };

  const handleReload = () => {
    if (
      changedItems.length > 0 &&
      !window.confirm('저장하지 않은 공정 연결 변경사항을 버리고 다시 불러오시겠습니까?')
    ) {
      return;
    }

    loadItems();
  };

  const handleSave = async () => {
    if (!selectedVersionId || changedItems.length === 0 || saving) return;

    setSaving(true);
    setErrorMessage('');
    setMessage(null);

    try {
      const { data, error } = await supabase.rpc(
        'save_progress_contract_item_process_mappings',
        {
          p_project_name: projectName,
          p_contract_version_id: selectedVersionId,
          p_items: changedItems.map((item) => ({
            contract_item_id: item.id,
            process_type: encodeProcessTypes(decodeProcessTypes(item.process_type)),
          })),
        },
      );

      if (error) throw error;

      const nextOriginalMappings = new Map(originalMappings);
      changedItems.forEach((item) => {
        nextOriginalMappings.set(
          item.id,
          encodeProcessTypes(decodeProcessTypes(item.process_type)),
        );
      });
      setOriginalMappings(nextOriginalMappings);
      setSelectedIds(new Set());
      setMessage({
        severity: 'success',
        text: `계약 품목 공정 연결 ${Number(data || changedItems.length).toLocaleString()}건을 저장했습니다.`,
      });

      if (
        typeof window !== 'undefined'
      ) {
        window.dispatchEvent(
          new CustomEvent(
            'progress-contract-master-changed',
            {
              detail: {
                projectName,
                versionLabel:
                  selectedVersion?.version_label ||
                  '',
                source:
                  'contract-item-process-mapping',
              },
            },
          ),
        );
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(`공정 연결을 저장하지 못했습니다: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleInheritPreviousVersion = async () => {
    const currentIndex = versions.findIndex((version) => version.id === selectedVersionId);
    const previousVersion = currentIndex > 0 ? versions[currentIndex - 1] : null;

    if (!previousVersion) return;

    if (
      !window.confirm(
        `${previousVersion.version_label}의 공정 연결을 현재 미연결 품목에 승계하시겠습니까?\n현재 연결된 품목은 변경하지 않습니다.`,
      )
    ) {
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setMessage(null);

    try {
      const previousItems = await fetchAllContractItems({
        projectName,
        contractVersionId: previousVersion.id,
      });

      const exactMap = new Map();
      const groupedMap = new Map();

      previousItems.forEach((item) => {
        const process = encodeProcessTypes(decodeProcessTypes(item.process_type));
        if (!process) return;

        exactMap.set(item.source_key, process);
        const groupKey = getSameItemKey(item);
        if (!groupedMap.has(groupKey)) groupedMap.set(groupKey, new Set());
        groupedMap.get(groupKey).add(process);
      });

      const consensusMap = new Map();
      groupedMap.forEach((values, key) => {
        if (values.size === 1) consensusMap.set(key, [...values][0]);
      });

      let inheritedCount = 0;
      const nextItems = items.map((item) => {
        if (decodeProcessTypes(item.process_type).length > 0) return item;

        const nextProcess =
          exactMap.get(item.source_key) || consensusMap.get(getSameItemKey(item)) || '';

        if (!nextProcess) return item;
        inheritedCount += 1;
        return { ...item, process_type: nextProcess };
      });
      setItems(nextItems);

      setMessage({
        severity: inheritedCount > 0 ? 'success' : 'info',
        text:
          inheritedCount > 0
            ? `${previousVersion.version_label}에서 미연결 품목 ${inheritedCount.toLocaleString()}건의 공정을 승계했습니다. 저장 버튼을 눌러 반영해주세요.`
            : '승계할 수 있는 미연결 품목이 없습니다.',
      });
    } catch (error) {
      console.error(error);
      setErrorMessage(`이전 계약 버전의 공정 연결을 불러오지 못했습니다: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!projectName) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography color="text.secondary">현장을 먼저 선택해주세요.</Typography>
      </Paper>
    );
  }

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
      <Paper variant="outlined" sx={{ p: 1.25, flexShrink: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Box sx={{ minWidth: 240, mr: 'auto' }}>
            <SystemPageTitle
              title="계약품목 공정연결"
              help="계약 품목을 시스템 공정과 연결하여 기성 산정에 사용할 공정 기준을 설정합니다."
            />
            <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
              {projectName}
            </Typography>
          </Box>

          <TextField
            select
            size="small"
            label="계약 버전"
            value={selectedVersionId}
            onChange={(event) => handleVersionChange(event.target.value)}
            sx={{ width: 190 }}
          >
            {versions.map((version) => (
              <MenuItem key={version.id} value={version.id}>
                {version.version_label}
              </MenuItem>
            ))}
          </TextField>

          <Button
            variant="outlined"
            startIcon={<ContentCopyRoundedIcon />}
            onClick={handleInheritPreviousVersion}
            disabled={loading || versions.findIndex((version) => version.id === selectedVersionId) <= 0}
          >
            이전 계약 공정 승계
          </Button>

          <SystemRefreshButton
            onClick={handleReload}
            loading={loading}
            label="계약품목 공정연결 새로고침"
          />

          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRoundedIcon />}
            onClick={handleSave}
            disabled={saving || changedItems.length === 0}
          >
            공정연결 저장 {changedItems.length > 0 ? `(${changedItems.length})` : ''}
          </Button>
        </Stack>
      </Paper>

      {errorMessage && (
        <Alert severity="error" onClose={() => setErrorMessage('')} sx={{ flexShrink: 0 }}>
          {errorMessage}
        </Alert>
      )}

      {message && (
        <Alert severity={message.severity || 'info'} onClose={() => setMessage(null)} sx={{ flexShrink: 0 }}>
          {message.text}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 1, flexShrink: 0 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="품명 또는 규격 검색"
            sx={{ width: 240 }}
          />

          <TextField
            select
            size="small"
            label="구분"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            sx={{ width: 135 }}
          >
            <MenuItem value="전체">전체</MenuItem>
            {typeOptions.map((type) => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="옵션"
            value={optionFilter}
            onChange={(event) => setOptionFilter(event.target.value)}
            sx={{ width: 110 }}
          >
            <MenuItem value="전체">전체</MenuItem>
            <MenuItem value="기본">기본</MenuItem>
            <MenuItem value="확장">확장</MenuItem>
          </TextField>

          <TextField
            select
            size="small"
            label="연결 상태"
            value={mappingFilter}
            onChange={(event) => setMappingFilter(event.target.value)}
            sx={{ width: 125 }}
          >
            <MenuItem value="전체">전체</MenuItem>
            <MenuItem value="연결">연결</MenuItem>
            <MenuItem value="미연결">미연결</MenuItem>
          </TextField>

          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={groupSameItem}
                onChange={(event) => {
                  setGroupSameItem(event.target.checked);
                  setSelectedIds(new Set());
                }}
              />
            }
            label="동일 구분·품명 묶기"
            sx={{ ml: 0.5, '& .MuiFormControlLabel-label': { fontSize: '0.72rem' } }}
          />

          <Box sx={{ flex: 1 }} />

          <Chip label={`전체 ${totalCount.toLocaleString()}`} size="small" />
          <Chip label={`연결 ${mappedCount.toLocaleString()}`} color="success" variant="outlined" size="small" />
          <Chip label={`미연결 ${unmappedCount.toLocaleString()}`} color="warning" variant="outlined" size="small" />
          <Chip label={`선택 ${selectedIds.size.toLocaleString()}`} color="primary" variant="outlined" size="small" />

          <Button
            size="small"
            variant="outlined"
            startIcon={<LinkRoundedIcon />}
            disabled={selectedIds.size === 0}
            onClick={() => openProcessDialog(Array.from(selectedIds), '선택 품목 공정 연결')}
          >
            선택 공정 연결
          </Button>

          <Button
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={<LinkOffRoundedIcon />}
            disabled={selectedIds.size === 0}
            onClick={() => {
              const targetIds = Array.from(selectedIds);
              applyProcessToIds(targetIds, '');
              setMessage({
                severity: 'info',
                text: `${targetIds.length.toLocaleString()}개 품목의 공정 연결을 해제했습니다. 저장 버튼을 눌러 반영해주세요.`,
              });
            }}
          >
            선택 연결 해제
          </Button>
        </Stack>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          minHeight: 0,
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <TableContainer sx={{ minHeight: 0, flex: 1, overflow: 'auto' }}>
          <Table stickyHeader size="small" sx={{ minWidth: 1280 }}>
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={{ width: 42, bgcolor: '#e2e8f0', fontWeight: 900 }}>
                  <Checkbox
                    size="small"
                    checked={allFilteredSelected}
                    indeterminate={someFilteredSelected}
                    onChange={(event) => updateSelectedIds(filteredItemIds, event.target.checked)}
                  />
                </TableCell>
                {[
                  ['행', 55],
                  ['구분', 110],
                  ['옵션', 65],
                  ['품명', 210],
                  ['규격', 250],
                  ['단위', 60],
                  ['공정 연결', 190],
                  ['계약 수량', 95],
                  ['계약 재료비', 115],
                  ['계약 노무비', 115],
                  ['계약 경비', 105],
                  ['계약 직접비', 125],
                  ['연결자', 95],
                ].map(([label, width]) => (
                  <TableCell
                    key={label}
                    align="center"
                    sx={{
                      width,
                      minWidth: width,
                      bgcolor: '#e2e8f0',
                      color: '#334155',
                      fontSize: '0.72rem',
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
              {loading && (
                <TableRow>
                  <TableCell colSpan={14} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              )}

              {!loading && filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={14} align="center" sx={{ py: 6, color: '#64748b' }}>
                    표시할 계약 품목이 없습니다.
                  </TableCell>
                </TableRow>
              )}

              {!loading && pagedRows.map((row) => {
                const rowIds = getRowIds(row);
                const selectedCount = rowIds.filter((id) => selectedIds.has(id)).length;
                const rowSelected = selectedCount === rowIds.length && rowIds.length > 0;
                const rowIndeterminate = selectedCount > 0 && selectedCount < rowIds.length;
                const directCost =
                  Number(row.contract_material_amount || 0) +
                  Number(row.contract_labor_amount || 0) +
                  Number(row.contract_expense_amount || 0);
                const processLabel = row.group_process_mixed
                  ? '공정 혼합'
                  : getProcessLabel(row.process_type);

                return (
                  <TableRow key={row.id} hover selected={rowSelected}>
                    <TableCell align="center">
                      <Checkbox
                        size="small"
                        checked={rowSelected}
                        indeterminate={rowIndeterminate}
                        onChange={(event) => updateSelectedIds(rowIds, event.target.checked)}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                      {row.source_row_no}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                      {getTypeLabel(row)}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                      {row.option_type || '기본'}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.68rem' }}>
                      <Typography noWrap title={row.item_name || ''} sx={{ fontSize: 'inherit' }}>
                        {row.item_name || '-'}
                      </Typography>
                      {row.group_count > 1 && (
                        <Typography sx={{ fontSize: '0.6rem', color: '#64748b' }}>
                          원본 {row.group_count.toLocaleString()}행
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.68rem' }}>
                      <Typography noWrap title={row.specification || ''} sx={{ fontSize: 'inherit' }}>
                        {row.specification || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.68rem' }}>
                      {row.unit || '-'}
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        size="small"
                        variant={processLabel === '미연결' ? 'text' : 'outlined'}
                        onClick={() => openProcessDialog(rowIds, `${row.item_name || '품목'} 공정 연결`)}
                        sx={{
                          minWidth: 130,
                          maxWidth: 180,
                          fontSize: '0.66rem',
                          color: processLabel === '미연결' ? '#94a3b8' : '#0f766e',
                        }}
                      >
                        <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 155 }}>
                          {processLabel}
                        </Typography>
                      </Button>
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums' }}>
                      {quantityFormatter.format(Number(row.contract_quantity || 0))}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums' }}>
                      {moneyFormatter.format(Number(row.contract_material_amount || 0))}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums' }}>
                      {moneyFormatter.format(Number(row.contract_labor_amount || 0))}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.68rem', fontVariantNumeric: 'tabular-nums' }}>
                      {moneyFormatter.format(Number(row.contract_expense_amount || 0))}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.68rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                      {moneyFormatter.format(directCost)}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}>
                      {row.group_count > 1 ? '-' : row.mapped_by_name || '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={filteredRows.length}
          page={tablePage}
          onPageChange={(_, nextPage) => setTablePage(nextPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(Number(event.target.value));
            setTablePage(0);
          }}
          rowsPerPageOptions={[50, 100, 200]}
          labelRowsPerPage="페이지당 행"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
          sx={{
            minHeight: 42,
            borderTop: '1px solid #e2e8f0',
            '& .MuiTablePagination-toolbar': { minHeight: 42 },
            '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
              fontSize: '0.68rem',
            },
          }}
        />

        <Divider />
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ px: 1.25, py: 0.75, bgcolor: '#f8fafc', flexShrink: 0 }}
        >
          <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
            표시 {filteredRows.length.toLocaleString()}행 · 선택 {selectedIds.size.toLocaleString()}품목
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
            계약 버전: {selectedVersion?.version_label || '-'} · 작성자: {userProfile?.manager_name || userProfile?.email || '-'}
          </Typography>
        </Stack>
      </Paper>

      <Dialog
        open={processDialogOpen}
        onClose={() => setProcessDialogOpen(false)}
        fullWidth
        maxWidth="lg"
        scroll="paper"
        sx={{
          '& .MuiDialog-paper': {
            width: '100%',
            height: 'calc(100vh - 48px)',
            minHeight: 'calc(100vh - 48px)',
            maxHeight: 'calc(100vh - 48px)',
            m: 3,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, flexShrink: 0 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 900 }}>
            {processDialogTitle}
          </Typography>
          <Typography sx={{ mt: 0.25, color: '#64748b', fontSize: '0.7rem' }}>
            구분을 고르고 품명 또는 규격을 검색한 뒤, 필요한 계약 품목을
            선택해 공정을 한 번에 연결합니다.
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
            <Typography
              sx={{
                mb: 0.55,
                color: '#475569',
                fontSize: '0.7rem',
                fontWeight: 900,
              }}
            >
              구분
            </Typography>
            <Stack direction="row" spacing={0.55} useFlexGap flexWrap="wrap">
              <Chip
                size="small"
                clickable
                color={
                  processDialogTypeFilter === '전체' ? 'primary' : 'default'
                }
                variant={
                  processDialogTypeFilter === '전체' ? 'filled' : 'outlined'
                }
                label={`전체 ${items.length.toLocaleString()}`}
                onClick={() => setProcessDialogTypeFilter('전체')}
              />
              {processDialogTypeOptions.map((type) => (
                <Chip
                  key={type.label}
                  size="small"
                  clickable
                  color={
                    processDialogTypeFilter === type.label
                      ? 'primary'
                      : 'default'
                  }
                  variant={
                    processDialogTypeFilter === type.label
                      ? 'filled'
                      : 'outlined'
                  }
                  label={`${type.label} ${type.count.toLocaleString()}`}
                  onClick={() => setProcessDialogTypeFilter(type.label)}
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
              value={processDialogKeyword}
              onChange={(event) => setProcessDialogKeyword(event.target.value)}
              sx={{ flex: 1, minWidth: 260 }}
            />

            <TextField
              select
              size="small"
              label="연결 상태"
              value={processDialogMappingFilter}
              onChange={(event) =>
                setProcessDialogMappingFilter(event.target.value)
              }
              sx={{ width: 125 }}
            >
              <MenuItem value="전체">전체</MenuItem>
              <MenuItem value="연결">연결</MenuItem>
              <MenuItem value="미연결">미연결</MenuItem>
            </TextField>

            <Chip
              size="small"
              color="warning"
              variant="outlined"
              label={`검색 ${processDialogRows.length.toLocaleString()} / 전체 ${items.length.toLocaleString()}`}
            />
            <Chip
              size="small"
              color="primary"
              label={`품목 선택 ${processDialogTargetIds.length.toLocaleString()}`}
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
                value={processDialogValues}
                onChange={(_event, nextValues) => {
                  setProcessDialogValues(Array.from(new Set(nextValues)));
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
                      <Typography sx={{ fontSize: '0.75rem' }}>
                        {option}
                      </Typography>
                    </li>
                  );
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="연결할 공정 · 복수 선택"
                    placeholder={
                      processDialogValues.length === 0
                        ? '공정을 선택하세요'
                        : ''
                    }
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
                disabled={processDialogValues.length === 0}
                onClick={() => setProcessDialogValues([])}
                sx={{ whiteSpace: 'nowrap' }}
              >
                공정 전체 해제
              </Button>
              <Chip
                size="small"
                color="success"
                variant="outlined"
                label={`공정 선택 ${processDialogValues.length.toLocaleString()}`}
              />
            </Stack>
            <Typography
              sx={{ mt: 0.7, color: '#64748b', fontSize: '0.64rem' }}
            >
              드롭다운에서 공정을 복수 선택한 뒤 선택 계약 품목에 한 번에
              적용합니다.
            </Typography>
          </Box>

          <TableContainer
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
            <Table stickyHeader size="small" sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell
                    align="center"
                    sx={{
                      width: 48,
                      bgcolor: '#e2e8f0',
                      fontWeight: 900,
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={allProcessDialogSelected}
                      indeterminate={someProcessDialogSelected}
                      disabled={processDialogRows.length === 0}
                      onChange={(event) =>
                        updateProcessDialogTargetIds(
                          processDialogItemIds,
                          event.target.checked,
                        )
                      }
                      inputProps={{
                        'aria-label': '검색된 계약 품목 전체 선택',
                      }}
                      sx={{ p: 0.4 }}
                    />
                  </TableCell>
                  {[
                    ['행', 65],
                    ['구분', 125],
                    ['품명', 220],
                    ['규격', 300],
                    ['현재 공정', 170],
                  ].map(([label, width]) => (
                    <TableCell
                      key={label}
                      sx={{
                        width,
                        minWidth: width,
                        bgcolor: '#e2e8f0',
                        color: '#334155',
                        fontSize: '0.7rem',
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
                {processDialogRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      align="center"
                      sx={{ py: 5, color: '#94a3b8' }}
                    >
                      검색 조건에 해당하는 계약 품목이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  processDialogRows.map((row) => {
                    const rowIds = getRowIds(row);
                    const selectedCount = rowIds.filter((id) =>
                      processDialogTargetIds.includes(id),
                    ).length;
                    const rowSelected =
                      rowIds.length > 0 && selectedCount === rowIds.length;
                    const rowIndeterminate =
                      selectedCount > 0 && selectedCount < rowIds.length;
                    const processLabel = row.group_process_mixed
                      ? '공정 혼합'
                      : getProcessLabel(row.process_type);

                    return (
                      <TableRow
                        key={row.id}
                        hover
                        selected={rowSelected}
                        onClick={() =>
                          updateProcessDialogTargetIds(
                            rowIds,
                            !rowSelected,
                          )
                        }
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell align="center" sx={{ p: 0.2 }}>
                          <Checkbox
                            size="small"
                            checked={rowSelected}
                            indeterminate={rowIndeterminate}
                            onChange={(event) =>
                              updateProcessDialogTargetIds(
                                rowIds,
                                event.target.checked,
                              )
                            }
                            onClick={(event) => event.stopPropagation()}
                            sx={{ p: 0.4 }}
                          />
                        </TableCell>
                        <TableCell
                          sx={{ fontSize: '0.67rem', whiteSpace: 'nowrap' }}
                        >
                          {row.source_row_no}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.67rem' }}>
                          <Typography
                            sx={{ fontSize: '0.67rem', fontWeight: 800 }}
                          >
                            {getTypeLabel(row)}
                          </Typography>
                          <Typography
                            sx={{ color: '#64748b', fontSize: '0.6rem' }}
                          >
                            {row.work_zone || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.67rem' }}>
                          <Typography
                            sx={{ fontSize: '0.67rem', fontWeight: 800 }}
                          >
                            {row.item_name || '-'}
                          </Typography>
                          {row.group_count > 1 && (
                            <Typography
                              sx={{ color: '#64748b', fontSize: '0.6rem' }}
                            >
                              원본 {row.group_count.toLocaleString()}행
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.67rem' }}>
                          {row.specification || '-'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.67rem' }}>
                          <Chip
                            size="small"
                            color={
                              processLabel === '미연결'
                                ? 'warning'
                                : 'success'
                            }
                            variant="outlined"
                            label={processLabel}
                            sx={{
                              maxWidth: 160,
                              '& .MuiChip-label': {
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              },
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.2, flexShrink: 0 }}>
          <Button
            color="inherit"
            disabled={processDialogTargetIds.length === 0}
            onClick={handleClearDialogMappings}
          >
            선택 연결 해제
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setProcessDialogOpen(false)} color="inherit">
            취소
          </Button>
          <Button
            variant="contained"
            disabled={
              processDialogTargetIds.length === 0 ||
              processDialogValues.length === 0
            }
            onClick={handleApplyDialogProcess}
            sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#115e59' } }}
          >
            선택 품목에 적용
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ContractItemProcessMapping;
