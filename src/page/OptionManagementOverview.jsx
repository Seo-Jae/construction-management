// v52.48.5.44.117 옵션비교 인쇄 선택색상 강제표시
// v52.48.5.44.116 옵션비교 인쇄 이중축소 제거
// v52.48.5.44.115 옵션비교 저장 불러오기·A4 가로 인쇄
// v52.48.5.44.114 선택옵션 미해당 세대 회색 빗금
// v52.48.5.44.32 옵션별 비교 선택옵션 전용 전환
// v52.48.5.44.28 선택옵션 MenuListContext 누락 백색화면 긴급수정
// v52.48.5.44.27 선택옵션 로컬목록 위치고정·10행 스크롤 제한
// v52.48.5.44.26 비교 옵션선택 높이축소·불필요 세로스크롤 제거
// v52.48.5.44.25 선택옵션 세대수 단일표시·비교카드 세대수·X 해제
// v52.48.5.44.23 옵션선택 팝업·저장옵션 연동·세대셀 다분할 비교
// v52.48.5.44.22 옵션별 비교 상단 6칸 옵션선택 UI·임시안내 제거
// v52.48.5.44.21 선택옵션 단일필터·엑셀순서·해당세대 색상강조
// v52.48.5.44.18 선택옵션 동·호·타입 3열 수정가능 양식
// v52.48.5.44.17 선택옵션 양식 다운로드·업로드·저장 연결
// v52.48.5.44.16 타입·옵션 골구도 강조·좌우 패널 크기조절
// v52.48.5.44.15 단열 옵션 타입별 현황·상단 박스 실높이 통일
// v52.48.5.44.14 단열 옵션 상단정리·토스트·단일시트 무색상 전환
// v52.48.5.44.13 옵션현황(단열) 골구도 엑셀 다운로드·업로드·저장
// v52.48.5.44.12 옵션관리 골구도 기본화면
import React, {
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
  ButtonBase,
  Chip,
  CircularProgress,
  ClickAwayListener,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  GlobalStyles,
  IconButton,
  Menu,
  MenuItem,
  MenuList,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import BookmarkAddRoundedIcon from '@mui/icons-material/BookmarkAddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import BuildingGrid from '../BuildingGrid.jsx';
import SystemPageTitle from '../components/SystemPageTitle.jsx';
import SystemRefreshButton from '../components/SystemRefreshButton.jsx';
import { supabase } from '../supabaseClient';
import {
  countUniqueUnits,
  getProjectCellKeys,
} from '../utils/buildingUnits.js';
import {
  parseInsulationOptionWorkbookFile,
  saveInsulationOptionWorkbook,
} from '../utils/optionInsulationExcel.js';
import {
  normalizeSelectionOptionDocument,
  parseSelectionOptionWorkbookFile,
  saveSelectionOptionWorkbook,
} from '../utils/optionSelectionExcel.js';
import { createOptionTypeSummary } from '../utils/optionTypeSummary.js';

const MODE_CONFIG = {
  insulation: {
    title: '옵션현황(단열)',
    help: '현장 골구도를 내려받아 단열 옵션을 작성한 뒤 다시 업로드합니다.',
    category: '단열 옵션',
    accent: '#0284c7',
  },
  selection: {
    title: '옵션현황(선택)',
    help: '동·호·타입이 기본 입력된 양식을 내려받고, 원청사 자료에 맞게 수정해 유상옵션을 업로드합니다.',
    category: '선택 옵션',
    accent: '#0f766e',
  },
  comparison: {
    title: '옵션별 비교',
    help: '같은 세대의 여러 옵션을 한 골구도에서 비교합니다.',
    category: '옵션 비교',
    accent: '#7c3aed',
  },
};

const HEADER_CONTROL_HEIGHT = 30;
const DEFAULT_SUMMARY_PANEL_WIDTH = 270;
const MIN_SUMMARY_PANEL_WIDTH = 220;
const MIN_BUILDING_PANEL_WIDTH = 520;

const HEADER_CONTROL_SX = {
  height: HEADER_CONTROL_HEIGHT,
  minHeight: HEADER_CONTROL_HEIGHT,
  boxSizing: 'border-box',
};

const COMPARISON_OPTION_SLOT_STYLES = [
  { backgroundColor: '#eff6ff', borderColor: '#93c5fd', segmentColor: '#60a5fa' },
  { backgroundColor: '#fff7f7', borderColor: '#fca5a5', segmentColor: '#fb7185' },
  { backgroundColor: '#faf5ff', borderColor: '#d8b4fe', segmentColor: '#c084fc' },
  { backgroundColor: '#f7fee7', borderColor: '#bef264', segmentColor: '#a3e635' },
  { backgroundColor: '#fffbeb', borderColor: '#fcd34d', segmentColor: '#fbbf24' },
  { backgroundColor: '#ecfeff', borderColor: '#a5f3fc', segmentColor: '#22d3ee' },
];

const normalizeOptionData = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce((result, [cellKey, raw]) => {
    const optionValue = String(raw?.value || '').trim();
    if (!optionValue) return result;
    result[cellKey] = {
      value: optionValue,
    };
    return result;
  }, {});
};

const isMissingOptionTableError = (error) =>
  ['42P01', 'PGRST205'].includes(String(error?.code || '')) ||
  /option_status_documents|schema cache|does not exist/i.test(
    String(error?.message || ''),
  );

export default function OptionManagementOverview({
  projectName = '',
  buildingConfigs = {},
  mode = 'insulation',
  currentUserId = '',
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [optionData, setOptionData] = useState({});
  const [selectionDocument, setSelectionDocument] = useState(() =>
    normalizeSelectionOptionDocument({}),
  );
  const [loading, setLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [sourceFileName, setSourceFileName] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [message, setMessage] = useState(null);
  const [toast, setToast] = useState(null);
  const [expandedUnitType, setExpandedUnitType] = useState('');
  const [selectedHighlight, setSelectedHighlight] = useState(null);
  const [selectedSelectionOption, setSelectedSelectionOption] = useState('');
  const [selectionOptionMenuOpen, setSelectionOptionMenuOpen] = useState(false);
  const [comparisonOptionKeys, setComparisonOptionKeys] = useState(() =>
    Array(COMPARISON_OPTION_SLOT_STYLES.length).fill(''),
  );
  const [comparisonMenuAnchor, setComparisonMenuAnchor] = useState(null);
  const [activeComparisonSlot, setActiveComparisonSlot] = useState(-1);
  const [comparisonPresetDialogOpen, setComparisonPresetDialogOpen] =
    useState(false);
  const [comparisonPresetName, setComparisonPresetName] = useState('');
  const [comparisonPresetSaving, setComparisonPresetSaving] = useState(false);
  const [summaryPanelWidth, setSummaryPanelWidth] = useState(
    DEFAULT_SUMMARY_PANEL_WIDTH,
  );
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const fileInputRef = useRef(null);
  const splitPaneRef = useRef(null);
  const resizeStartRef = useRef(null);
  const printGridRef = useRef(null);

  const pageConfig = MODE_CONFIG[mode] || MODE_CONFIG.insulation;
  const isInsulation = mode === 'insulation';
  const isSelection = mode === 'selection';
  const isComparison = mode === 'comparison';
  const isEditableOptionMode = isInsulation || isSelection;

  const buildingEntries = useMemo(
    () =>
      Object.entries(buildingConfigs || {}).sort(([first], [second]) =>
        first.localeCompare(second, 'ko', { numeric: true }),
      ),
    [buildingConfigs],
  );

  const totalUnits = useMemo(
    () =>
      buildingEntries.reduce(
        (total, [, config]) => total + countUniqueUnits(config),
        0,
      ),
    [buildingEntries],
  );

  const optionLegend = useMemo(() => {
    const byValue = new Map();
    Object.values(optionData).forEach((row) => {
      const value = String(row?.value || '').trim();
      if (!value) return;
      const existing = byValue.get(value) || {
        value,
        count: 0,
      };
      existing.count += 1;
      byValue.set(value, existing);
    });
    return [...byValue.values()].sort(
      (first, second) =>
        second.count - first.count ||
        first.value.localeCompare(second.value, 'ko', { numeric: true }),
    );
  }, [optionData]);

  const typeOptionSummary = useMemo(
    () =>
      createOptionTypeSummary({
        buildingConfigs,
        optionData,
      }),
    [buildingConfigs, optionData],
  );

  const selectionSummary = useMemo(() => {
    const selectedRows = Object.values(selectionDocument.units || {});
    return {
      optionCount: selectionDocument.optionNames.length,
      selectedUnitCount: selectedRows.length,
      selectionCount: selectedRows.reduce(
        (total, row) => total + (row?.selectedOptions?.length || 0),
        0,
      ),
    };
  }, [selectionDocument]);

  const selectionOptionNames = selectionDocument.optionNames;

  const displayedSelectionUnitCount = useMemo(() => {
    const selectedRows = Object.values(selectionDocument.units || {});
    if (!selectedSelectionOption) return selectedRows.length;

    return selectedRows.filter((row) =>
      Array.isArray(row?.selectedOptions) &&
      row.selectedOptions.includes(selectedSelectionOption),
    ).length;
  }, [selectedSelectionOption, selectionDocument.units]);

  const comparisonOptionChoices = useMemo(() => {
    const selectionByName = new Map(
      selectionDocument.optionNames.map((optionName) => [
        optionName,
        {
          key: `selection:${optionName}`,
          category: '선택 옵션',
          optionName,
          cellKeys: new Set(),
        },
      ]),
    );

    Object.entries(selectionDocument.units || {}).forEach(([cellKey, row]) => {
      const selectedOptions = Array.isArray(row?.selectedOptions)
        ? row.selectedOptions
        : [];
      selectedOptions.forEach((optionName) => {
        selectionByName.get(optionName)?.cellKeys.add(cellKey);
      });
    });

    return selectionDocument.optionNames
      .map((optionName) => selectionByName.get(optionName))
      .filter(Boolean);
  }, [selectionDocument]);

  const comparisonChoiceMap = useMemo(
    () =>
      new Map(
        comparisonOptionChoices.map((choice) => [choice.key, choice]),
      ),
    [comparisonOptionChoices],
  );

  const selectedComparisonChoices = useMemo(
    () =>
      comparisonOptionKeys
        .map((optionKey, slotIndex) => {
          const choice = comparisonChoiceMap.get(optionKey);
          return choice ? { ...choice, slotIndex } : null;
        })
        .filter(Boolean),
    [comparisonChoiceMap, comparisonOptionKeys],
  );

  const comparisonPresets = Array.isArray(
    selectionDocument?.comparisonPresets,
  )
    ? selectionDocument.comparisonPresets
    : [];

  const comparisonDisplayData = useMemo(() => {
    if (!isComparison || selectedComparisonChoices.length === 0) return {};

    const result = {};
    getProjectCellKeys(buildingConfigs).forEach((cellKey) => {
      const activeNames = [];
      const segments = selectedComparisonChoices.map((choice) => {
        const active = choice.cellKeys.has(cellKey);
        if (active) activeNames.push(`${choice.category} · ${choice.optionName}`);
        return {
          active,
          color:
            COMPARISON_OPTION_SLOT_STYLES[choice.slotIndex]?.segmentColor ||
            '#60a5fa',
          inactiveColor: '#ffffff',
        };
      });

      result[cellKey] = {
        label: cellKey.slice(cellKey.lastIndexOf('-') + 1),
        backgroundColor: '#ffffff',
        borderColor: '#cbd5e1',
        color: '#0f172a',
        segments,
        title: `${cellKey} · ${
          activeNames.length > 0 ? activeNames.join(', ') : '선택 옵션 해당 없음'
        }`,
      };
    });

    return result;
  }, [buildingConfigs, isComparison, selectedComparisonChoices]);

  const highlightedCellKeys = useMemo(() => {
    if (!selectedHighlight?.typeName) return new Set();
    const typeRow = typeOptionSummary.rows.find(
      (row) => row.typeName === selectedHighlight.typeName,
    );
    if (!typeRow) return new Set();
    if (!selectedHighlight.optionName) return new Set(typeRow.cellKeys);
    const optionRow = typeRow.optionCounts.find(
      (row) => row.optionName === selectedHighlight.optionName,
    );
    return new Set(optionRow?.cellKeys || []);
  }, [selectedHighlight, typeOptionSummary]);

  const displayData = useMemo(() => {
    if (isSelection) {
      const selectionUnits = selectionDocument.units || {};
      const unitInfo = selectionDocument.unitInfo || {};
      const result = {};

      getProjectCellKeys(buildingConfigs).forEach((cellKey) => {
        const row = selectionUnits[cellKey] || {};
        const selectedOptions = Array.isArray(row?.selectedOptions)
          ? row.selectedOptions.filter(Boolean)
          : [];
        const unitLabel =
          String(unitInfo?.[cellKey]?.unit || '').trim() ||
          cellKey.slice(cellKey.lastIndexOf('-') + 1);
        const isApplicable = selectedSelectionOption
          ? selectedOptions.includes(selectedSelectionOption)
          : selectedOptions.length > 0;

        if (isApplicable) {
          result[cellKey] = {
            label: unitLabel,
            backgroundColor: '#bfdbfe',
            borderColor: '#2563eb',
            color: '#1e3a8a',
            title: `${cellKey} · ${
              selectedSelectionOption || selectedOptions.join(', ')
            }`,
          };
          return;
        }

        result[cellKey] = {
          label: unitLabel,
          backgroundColor: '#f1f5f9',
          backgroundImage:
            'repeating-linear-gradient(135deg, rgba(148, 163, 184, 0.48) 0px, rgba(148, 163, 184, 0.48) 1px, transparent 1px, transparent 5px)',
          borderColor: '#cbd5e1',
          color: '#94a3b8',
          title: `${cellKey} · ${
            selectedSelectionOption || '선택 옵션'
          } 해당 없음`,
        };
      });

      return result;
    }
    if (isComparison) return comparisonDisplayData;
    if (!isInsulation) return {};
    const isOptionHighlight = Boolean(selectedHighlight?.optionName);
    const highlightStyle = isOptionHighlight
      ? {
          backgroundColor: '#fef3c7',
          borderColor: '#f59e0b',
          color: '#92400e',
        }
      : {
          backgroundColor: '#dbeafe',
          borderColor: '#2563eb',
          color: '#1e3a8a',
        };

    const result = Object.entries(optionData).reduce(
      (nextResult, [cellKey, row]) => {
        const value = String(row?.value || '').trim();
        if (!value) return nextResult;
        const highlighted = highlightedCellKeys.has(cellKey);
        nextResult[cellKey] = {
          label: value,
          backgroundColor: highlighted
            ? highlightStyle.backgroundColor
            : '#ffffff',
          borderColor: highlighted ? highlightStyle.borderColor : '#cbd5e1',
          color: highlighted ? highlightStyle.color : '#334155',
          title: `${cellKey} · ${value}`,
        };
        return nextResult;
      },
      {},
    );

    if (selectedHighlight?.typeName && !selectedHighlight.optionName) {
      highlightedCellKeys.forEach((cellKey) => {
        if (result[cellKey]) return;
        result[cellKey] = {
          label: cellKey.slice(cellKey.lastIndexOf('-') + 1),
          ...highlightStyle,
          title: `${cellKey} · ${selectedHighlight.typeName}`,
        };
      });
    }

    return result;
  }, [
    highlightedCellKeys,
    comparisonDisplayData,
    isComparison,
    isInsulation,
    isSelection,
    optionData,
    selectedHighlight,
    selectedSelectionOption,
    selectionDocument,
  ]);

  useEffect(() => {
    setExpandedUnitType('');
    setSelectedHighlight(null);
    setSelectedSelectionOption('');
    setSelectionOptionMenuOpen(false);
    setComparisonOptionKeys(
      Array(COMPARISON_OPTION_SLOT_STYLES.length).fill(''),
    );
    setComparisonMenuAnchor(null);
    setActiveComparisonSlot(-1);
    setComparisonPresetDialogOpen(false);
    setComparisonPresetName('');
    setSummaryPanelWidth(DEFAULT_SUMMARY_PANEL_WIDTH);
    setMessage(null);
  }, [mode, projectName]);

  useEffect(() => {
    if (!isSelection) return;
    setSelectedSelectionOption((current) =>
      current && !selectionOptionNames.includes(current) ? '' : current,
    );
  }, [isSelection, selectionOptionNames]);

  useEffect(() => {
    if (!isComparison) return;
    const validKeys = new Set(
      comparisonOptionChoices.map((choice) => choice.key),
    );
    setComparisonOptionKeys((current) => {
      const next = current.map((optionKey) =>
        optionKey && validKeys.has(optionKey) ? optionKey : '',
      );
      return next.some((optionKey, index) => optionKey !== current[index])
        ? next
        : current;
    });
  }, [comparisonOptionChoices, isComparison]);

  useEffect(() => {
    if (!isResizingPanels) return undefined;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (event) => {
      const resizeStart = resizeStartRef.current;
      const splitWidth = splitPaneRef.current?.getBoundingClientRect().width || 0;
      if (!resizeStart || splitWidth <= 0) return;

      const maximumWidth = Math.max(
        MIN_SUMMARY_PANEL_WIDTH,
        splitWidth - MIN_BUILDING_PANEL_WIDTH - 10,
      );
      const nextWidth = resizeStart.width - (event.clientX - resizeStart.clientX);
      setSummaryPanelWidth(
        Math.min(maximumWidth, Math.max(MIN_SUMMARY_PANEL_WIDTH, nextWidth)),
      );
    };

    const handlePointerUp = () => {
      resizeStartRef.current = null;
      setIsResizingPanels(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizingPanels]);

  const changeSummaryPanelWidth = useCallback((nextWidth) => {
    const splitWidth = splitPaneRef.current?.getBoundingClientRect().width || 0;
    const maximumWidth = Math.max(
      MIN_SUMMARY_PANEL_WIDTH,
      splitWidth - MIN_BUILDING_PANEL_WIDTH - 10,
    );
    setSummaryPanelWidth(
      Math.min(maximumWidth, Math.max(MIN_SUMMARY_PANEL_WIDTH, nextWidth)),
    );
  }, []);

  const handleResizePointerDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeStartRef.current = {
      clientX: event.clientX,
      width: summaryPanelWidth,
    };
    setIsResizingPanels(true);
  };

  const loadOptionStatusData = useCallback(async () => {
    if ((!isEditableOptionMode && !isComparison) || !projectName) return;
    setLoading(true);
    setMessage(null);

    try {
      const baseQuery = supabase
        .from('option_status_documents')
        .select('option_category, unit_values, source_file_name, updated_at')
        .eq('project_name', projectName);
      const { data, error } = isComparison
        ? await baseQuery.in('option_category', ['insulation', 'selection'])
        : await baseQuery
            .eq('option_category', isInsulation ? 'insulation' : 'selection')
            .maybeSingle();

      if (error) throw error;
      if (isComparison) {
        const rows = Array.isArray(data) ? data : [];
        const insulationRow = rows.find(
          (row) => row.option_category === 'insulation',
        );
        const selectionRow = rows.find(
          (row) => row.option_category === 'selection',
        );
        setOptionData(normalizeOptionData(insulationRow?.unit_values));
        setSelectionDocument(
          normalizeSelectionOptionDocument(selectionRow?.unit_values),
        );
        setSourceFileName('');
        setSavedAt('');
      } else if (isInsulation) {
        setOptionData(normalizeOptionData(data?.unit_values));
      } else {
        setSelectionDocument(
          normalizeSelectionOptionDocument(data?.unit_values),
        );
      }
      setSelectedHighlight(null);
      setSourceFileName(data?.source_file_name || '');
      setSavedAt(data?.updated_at || '');
      setHasPendingChanges(false);
      setSchemaMissing(false);
    } catch (error) {
      if (isMissingOptionTableError(error)) {
        setSchemaMissing(true);
        if (isComparison) {
          setOptionData({});
          setSelectionDocument(normalizeSelectionOptionDocument({}));
        } else if (isInsulation) {
          setOptionData({});
        } else {
          setSelectionDocument(normalizeSelectionOptionDocument({}));
        }
        setMessage({
          severity: 'warning',
          text: '옵션 저장용 Supabase 표가 아직 없습니다. 제공된 SQL을 먼저 실행하면 업로드 결과를 저장할 수 있습니다.',
        });
      } else {
        console.error(`${pageConfig.category} 현황 불러오기 오류:`, error);
        setMessage({
          severity: 'error',
          text: `${pageConfig.category} 현황을 불러오지 못했습니다: ${
            error?.message || '알 수 없는 오류'
          }`,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [
    isComparison,
    isEditableOptionMode,
    isInsulation,
    pageConfig.category,
    projectName,
  ]);

  useEffect(() => {
    loadOptionStatusData();
  }, [loadOptionStatusData, refreshKey]);

  const handleRefresh = () => {
    if (
      hasPendingChanges &&
      !window.confirm('저장하지 않은 업로드 결과가 있습니다. 새로고침하면 사라집니다. 계속할까요?')
    ) {
      return;
    }
    setRefreshKey((previous) => previous + 1);
  };

  const handleDownloadExcel = async () => {
    setExcelLoading(true);
    setToast(null);
    try {
      const rowCount = isInsulation
        ? await saveInsulationOptionWorkbook({
            projectName,
            buildingConfigs,
            optionData,
          })
        : await saveSelectionOptionWorkbook({
            projectName,
            buildingConfigs,
            selectionDocument,
          });
      setToast({
        severity: 'success',
        text: isInsulation
          ? `현장 골구도 ${rowCount.toLocaleString()}세대를 단열 옵션 Excel로 내려받았습니다.`
          : `골구도 ${rowCount.toLocaleString()}세대를 입력한 선택옵션 양식을 내려받았습니다.`,
      });
    } catch (error) {
      console.error(`${pageConfig.category} Excel 다운로드 오류:`, error);
      setToast({
        severity: 'error',
        text: `${pageConfig.category} Excel을 만들지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      });
    } finally {
      setExcelLoading(false);
    }
  };

  const handleUploadExcel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setExcelLoading(true);
    setToast(null);
    try {
      const result = isInsulation
        ? await parseInsulationOptionWorkbookFile({
            file,
            projectName,
            buildingConfigs,
          })
        : await parseSelectionOptionWorkbookFile({
            file,
            projectName,
            buildingConfigs,
          });
      if (isInsulation) {
        setOptionData(result.unitValues);
      } else {
        const normalizedDocument = normalizeSelectionOptionDocument(
          result.selectionDocument,
        );
        setSelectionDocument((current) => ({
          ...normalizedDocument,
          comparisonPresets: Array.isArray(current?.comparisonPresets)
            ? current.comparisonPresets
            : [],
        }));
      }
      setSelectedHighlight(null);
      setSourceFileName(file.name);
      setHasPendingChanges(true);
      setToast({
        severity: 'success',
        text: isInsulation
          ? `전체 동 골구도에서 단열 옵션 ${result.filledRows.toLocaleString()}세대를 불러왔습니다. 화면 확인 후 저장해주세요.`
          : `유상옵션 ${result.optionCount.toLocaleString()}개, 선택 ${result.selectionCount.toLocaleString()}건을 불러왔습니다. 화면 확인 후 저장해주세요.`,
      });
    } catch (error) {
      console.error(`${pageConfig.category} Excel 업로드 오류:`, error);
      setToast({
        severity: 'error',
        text: `${pageConfig.category} Excel을 불러오지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      });
    } finally {
      setExcelLoading(false);
    }
  };

  const handleSave = async () => {
    if (schemaMissing) {
      setToast({
        severity: 'warning',
        text: '제공된 Supabase SQL을 실행한 뒤 저장해주세요.',
      });
      return;
    }
    setSaving(true);
    setToast(null);
    try {
      const now = new Date().toISOString();
      const payload = {
        project_name: projectName,
        option_category: isInsulation ? 'insulation' : 'selection',
        unit_values: isInsulation ? optionData : selectionDocument,
        source_file_name: sourceFileName || null,
        updated_at: now,
      };
      if (currentUserId) payload.updated_by = currentUserId;

      const { error } = await supabase
        .from('option_status_documents')
        .upsert(payload, {
          onConflict: 'project_name,option_category',
        });
      if (error) throw error;

      setSavedAt(now);
      setHasPendingChanges(false);
      setToast({
        severity: 'success',
        text: isInsulation
          ? `단열 옵션 ${Object.keys(optionData).length.toLocaleString()}세대를 저장했습니다.`
          : `유상옵션 ${selectionSummary.optionCount.toLocaleString()}개, 선택 ${selectionSummary.selectionCount.toLocaleString()}건을 저장했습니다.`,
      });
    } catch (error) {
      console.error(`${pageConfig.category} 현황 저장 오류:`, error);
      if (isMissingOptionTableError(error)) setSchemaMissing(true);
      setToast({
        severity: 'error',
        text: `${pageConfig.category} 현황을 저장하지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      });
    } finally {
      setSaving(false);
    }
  };

  const openComparisonOptionMenu = (event, slotIndex) => {
    setComparisonMenuAnchor(event.currentTarget);
    setActiveComparisonSlot(slotIndex);
  };

  const closeComparisonOptionMenu = () => {
    setComparisonMenuAnchor(null);
    setActiveComparisonSlot(-1);
  };

  const selectComparisonOption = (optionKey) => {
    if (activeComparisonSlot < 0) return;
    setComparisonOptionKeys((current) =>
      current.map((currentKey, index) =>
        index === activeComparisonSlot ? optionKey : currentKey,
      ),
    );
    closeComparisonOptionMenu();
  };

  const clearComparisonOption = (slotIndex) => {
    setComparisonOptionKeys((current) =>
      current.map((optionKey, index) =>
        index === slotIndex ? '' : optionKey,
      ),
    );

    if (activeComparisonSlot === slotIndex) {
      closeComparisonOptionMenu();
    }
  };

  const persistComparisonPresets = useCallback(
    async (nextPresets) => {
      if (!projectName) {
        setToast({
          severity: 'warning',
          text: '현장을 먼저 선택해주세요.',
        });
        return false;
      }

      setComparisonPresetSaving(true);
      try {
        const { data: currentRow, error: readError } = await supabase
          .from('option_status_documents')
          .select('unit_values, source_file_name')
          .eq('project_name', projectName)
          .eq('option_category', 'selection')
          .maybeSingle();

        if (readError) throw readError;

        const latestDocument = normalizeSelectionOptionDocument(
          currentRow?.unit_values || selectionDocument,
        );
        const nextDocument = {
          ...latestDocument,
          comparisonPresets: nextPresets,
        };
        const now = new Date().toISOString();
        const payload = {
          project_name: projectName,
          option_category: 'selection',
          unit_values: nextDocument,
          source_file_name: currentRow?.source_file_name || null,
          updated_at: now,
        };

        if (currentUserId) payload.updated_by = currentUserId;

        const { error: saveError } = await supabase
          .from('option_status_documents')
          .upsert(payload, {
            onConflict: 'project_name,option_category',
          });

        if (saveError) throw saveError;

        setSelectionDocument(nextDocument);
        return true;
      } catch (error) {
        console.error('옵션비교 프리셋 저장 오류:', error);
        if (isMissingOptionTableError(error)) setSchemaMissing(true);
        setToast({
          severity: 'error',
          text: `옵션비교 저장정보를 반영하지 못했습니다: ${
            error?.message || '알 수 없는 오류'
          }`,
        });
        return false;
      } finally {
        setComparisonPresetSaving(false);
      }
    },
    [
      currentUserId,
      projectName,
      selectionDocument,
    ],
  );

  const handleSaveComparisonPreset = async () => {
    const name = comparisonPresetName.trim();

    if (!name) {
      setToast({
        severity: 'warning',
        text: '저장할 비교명(공정명)을 입력해주세요.',
      });
      return;
    }

    const optionNames = selectedComparisonChoices.map(
      (choice) => choice.optionName,
    );

    if (optionNames.length === 0) {
      setToast({
        severity: 'warning',
        text: '먼저 비교할 옵션을 하나 이상 선택해주세요.',
      });
      return;
    }

    const now = new Date().toISOString();
    const normalizedName = name.toLocaleLowerCase('ko-KR');
    const existingPreset = comparisonPresets.find(
      (preset) =>
        String(preset?.name || '')
          .trim()
          .toLocaleLowerCase('ko-KR') === normalizedName,
    );

    const preset = {
      id:
        existingPreset?.id ||
        (globalThis.crypto?.randomUUID?.() ||
          `comparison-preset-${Date.now()}`),
      name,
      optionNames,
      createdAt: existingPreset?.createdAt || now,
      updatedAt: now,
      updatedBy: currentUserId || '',
    };

    const nextPresets = existingPreset
      ? comparisonPresets.map((row) =>
          row.id === existingPreset.id ? preset : row,
        )
      : [preset, ...comparisonPresets].slice(0, 50);

    const saved = await persistComparisonPresets(nextPresets);
    if (!saved) return;

    setComparisonPresetName('');
    setToast({
      severity: 'success',
      text: existingPreset
        ? `"${name}" 비교 구성을 업데이트했습니다.`
        : `"${name}" 비교 구성을 저장했습니다.`,
    });
  };

  const handleLoadComparisonPreset = (preset) => {
    const optionNames = Array.isArray(preset?.optionNames)
      ? preset.optionNames
      : [];
    const validKeys = optionNames
      .map((optionName) => `selection:${optionName}`)
      .filter((optionKey) => comparisonChoiceMap.has(optionKey))
      .slice(0, COMPARISON_OPTION_SLOT_STYLES.length);
    const nextKeys = Array(COMPARISON_OPTION_SLOT_STYLES.length).fill('');

    validKeys.forEach((optionKey, index) => {
      nextKeys[index] = optionKey;
    });

    setComparisonOptionKeys(nextKeys);
    setComparisonPresetDialogOpen(false);

    const missingCount = optionNames.length - validKeys.length;
    setToast({
      severity: missingCount > 0 ? 'warning' : 'success',
      text:
        missingCount > 0
          ? `"${preset.name}"을 불러왔습니다. 현재 양식에 없는 옵션 ${missingCount}개는 제외했습니다.`
          : `"${preset.name}" 비교 구성을 불러왔습니다.`,
    });
  };

  const handleDeleteComparisonPreset = async (preset) => {
    if (
      !window.confirm(
        `"${preset?.name || '비교 구성'}" 저장정보를 삭제할까요?`,
      )
    ) {
      return;
    }

    const nextPresets = comparisonPresets.filter(
      (row) => row.id !== preset.id,
    );
    const saved = await persistComparisonPresets(nextPresets);
    if (!saved) return;

    setToast({
      severity: 'success',
      text: `"${preset.name}" 비교 구성을 삭제했습니다.`,
    });
  };

  const handlePrintComparison = () => {
    if (!isComparison) return;

    /*
      Chrome 인쇄는 A4 가로 폭을 넘어가는 웹 콘텐츠를 인쇄 단계에서
      자동으로 한 페이지 폭에 맞춰 축소합니다.

      v115에서는 이 브라우저 자동 축소 전에 JS로 zoom을 한 번 더 적용해
      같은 콘텐츠가 사실상 두 번 축소되는 문제가 있었습니다.
      그래서 골구도가 용지의 절반 정도만 차지했습니다.

      v116부터는 화면 콘텐츠를 원래 크기로 인쇄 DOM에 전달하고,
      A4 landscape의 실제 맞춤은 브라우저 인쇄 엔진에 맡깁니다.
    */
    document.body.classList.add('option-comparison-printing');

    const cleanup = () => {
      document.body.classList.remove('option-comparison-printing');
    };

    window.addEventListener('afterprint', cleanup, { once: true });

    window.setTimeout(() => {
      try {
        window.print();
      } catch (error) {
        cleanup();
        setToast({
          severity: 'error',
          text: '인쇄 창을 열지 못했습니다.',
        });
      }
    }, 80);
  };

  return (
    <Box
      className={isComparison ? 'option-comparison-print-root' : undefined}
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      {isComparison && (
        <GlobalStyles
          styles={{
            '@page': {
              size: 'A4 landscape',
              margin: '5mm',
            },
            '@media print': {
              'html, body': {
                background: '#ffffff !important',
              },
              'body.option-comparison-printing *': {
                visibility: 'hidden !important',
              },
              'body.option-comparison-printing .option-comparison-print-root, body.option-comparison-printing .option-comparison-print-root *': {
                visibility: 'visible !important',
                WebkitPrintColorAdjust: 'exact !important',
                printColorAdjust: 'exact !important',
                colorAdjust: 'exact !important',
              },
              'body.option-comparison-printing .option-comparison-print-root': {
                position: 'absolute !important',
                left: '0 !important',
                top: '0 !important',
                width: 'max-content !important',
                height: 'auto !important',
                minHeight: '0 !important',
                overflow: 'visible !important',
                background: '#ffffff !important',
                zoom: '1 !important',
                transform: 'none !important',
                transformOrigin: 'top left !important',
              },
              'body.option-comparison-printing .option-comparison-print-hide': {
                display: 'none !important',
              },
              'body.option-comparison-printing .option-comparison-slot-clear': {
                display: 'none !important',
              },
              'body.option-comparison-printing .option-comparison-building-panel': {
                overflow: 'visible !important',
                minWidth: '0 !important',
                width: 'max-content !important',
                border: 'none !important',
                padding: '0 !important',
                background: '#ffffff !important',
              },
              'body.option-comparison-printing .option-comparison-building-content': {
                minHeight: '0 !important',
                paddingBottom: '0 !important',
                transform: 'none !important',
              },
              'body.option-comparison-printing .option-comparison-building-content > *': {
                transform: 'none !important',
              },
              'body.option-comparison-printing .wooklim-comparison-segment-active': {
                WebkitPrintColorAdjust: 'exact !important',
                printColorAdjust: 'exact !important',
                colorAdjust: 'exact !important',
                backgroundColor:
                  'var(--wooklim-comparison-segment-color) !important',
                boxShadow:
                  'inset 0 0 0 999px var(--wooklim-comparison-segment-color) !important',
                borderTop:
                  '2px solid var(--wooklim-comparison-segment-color) !important',
                borderBottom:
                  '2px solid var(--wooklim-comparison-segment-color) !important',
              },
              'body.option-comparison-printing .wooklim-comparison-segment-inactive': {
                backgroundColor: '#ffffff !important',
                boxShadow: 'none !important',
              },
              'body.option-comparison-printing .MuiSnackbar-root': {
                display: 'none !important',
              },
            },
          }}
        />
      )}

      <Paper
        variant="outlined"
        sx={{
          p: 1.25,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Box sx={{ minWidth: 245 }}>
          <SystemPageTitle title={pageConfig.title} help={pageConfig.help} />
          <Typography sx={{ mt: 0.15, color: '#64748b', fontSize: '0.67rem' }}>
            {projectName || '현장명 미등록'} · 현장관리 골구도 연동
          </Typography>
        </Box>

        <Stack
          direction="row"
          spacing={0.7}
          alignItems="center"
          useFlexGap
          flexWrap="wrap"
          sx={{ flex: 1 }}
        >
          <Box
            component="span"
            sx={{
              ...HEADER_CONTROL_SX,
              display: 'inline-flex',
              alignItems: 'center',
              px: 1.2,
              bgcolor: `${pageConfig.accent}16`,
              border: `1px solid ${pageConfig.accent}66`,
              borderRadius: '16px',
              color: pageConfig.accent,
              fontSize: '0.72rem',
              fontWeight: 800,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            골구도 기준
          </Box>
          <Box
            component="span"
            sx={{
              ...HEADER_CONTROL_SX,
              display: 'inline-flex',
              alignItems: 'center',
              px: 1.2,
              bgcolor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '16px',
              color: '#334155',
              fontSize: '0.72rem',
              fontWeight: 700,
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            {pageConfig.category}
          </Box>

          {isEditableOptionMode ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={handleUploadExcel}
              />
              <Button
                size="small"
                variant="outlined"
                startIcon={<DownloadRoundedIcon />}
                onClick={handleDownloadExcel}
                disabled={excelLoading || buildingEntries.length === 0}
                sx={{ ...HEADER_CONTROL_SX, whiteSpace: 'nowrap' }}
              >
                {isInsulation ? '골구도 다운로드' : '양식 다운로드'}
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="success"
                startIcon={<UploadFileRoundedIcon />}
                onClick={() => fileInputRef.current?.click()}
                disabled={excelLoading || buildingEntries.length === 0}
                sx={{ ...HEADER_CONTROL_SX, whiteSpace: 'nowrap' }}
              >
                엑셀 업로드
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
                onClick={handleSave}
                disabled={saving || loading || !hasPendingChanges || schemaMissing}
                sx={{ ...HEADER_CONTROL_SX, whiteSpace: 'nowrap' }}
              >
                저장
              </Button>
            </>
          ) : !isComparison ? (
            <TextField
              size="small"
              label="옵션 항목"
              value=""
              placeholder="옵션 항목 연결 예정"
              disabled
              sx={{ minWidth: 210 }}
            />
          ) : null}
        </Stack>

        <Stack
          className={isComparison ? 'option-comparison-print-hide' : undefined}
          direction="row"
          spacing={0.55}
          alignItems="center"
        >
          {isComparison && (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<FolderOpenRoundedIcon />}
                onClick={() => setComparisonPresetDialogOpen(true)}
                disabled={loading || comparisonPresetSaving}
                sx={{
                  ...HEADER_CONTROL_SX,
                  whiteSpace: 'nowrap',
                  borderColor: '#c4b5fd',
                  color: '#6d28d9',
                  '&:hover': {
                    borderColor: '#8b5cf6',
                    bgcolor: '#f5f3ff',
                  },
                }}
              >
                옵션 불러오기
              </Button>

              <Tooltip title="A4 가로 인쇄" arrow>
                <span>
                  <IconButton
                    type="button"
                    size="small"
                    aria-label="A4 가로 인쇄"
                    onClick={handlePrintComparison}
                    disabled={loading || buildingEntries.length === 0}
                    sx={{
                      width: '30px !important',
                      height: '30px !important',
                      minWidth: 30,
                      p: '5px !important',
                      color: '#475569',
                      bgcolor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px !important',
                      '&:hover': {
                        color: '#2563eb',
                        borderColor: '#93c5fd',
                        bgcolor: '#eff6ff',
                      },
                    }}
                  >
                    <PrintRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}

          <SystemRefreshButton
            onClick={handleRefresh}
            label={`${pageConfig.title} 새로고침`}
          />
        </Stack>
      </Paper>

      {message && <Alert severity={message.severity}>{message.text}</Alert>}

      {isComparison && (
        <Box sx={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <Box
            sx={{
              minWidth: 1080,
              display: 'grid',
              gridTemplateColumns: 'repeat(6, minmax(160px, 1fr))',
              gap: 1.4,
            }}
          >
            {COMPARISON_OPTION_SLOT_STYLES.map((slotStyle, index) => {
              const selectedChoice = comparisonChoiceMap.get(
                comparisonOptionKeys[index],
              );
              return (
                <Box
                  key={`comparison-option-slot-${index + 1}`}
                  sx={{
                    height: 64,
                    position: 'relative',
                  }}
                >
                  <ButtonBase
                    aria-label={
                      selectedChoice
                        ? `비교 옵션 ${index + 1}, ${selectedChoice.optionName}, ${selectedChoice.cellKeys.size}세대`
                        : `비교 옵션 ${index + 1} 선택`
                    }
                    onClick={(event) => openComparisonOptionMenu(event, index)}
                    sx={{
                      width: '100%',
                      height: '100%',
                      px: selectedChoice ? 2.7 : 2,
                      border: `1px solid ${slotStyle.borderColor}`,
                      borderRadius: '6px',
                      bgcolor: slotStyle.backgroundColor,
                      color: '#1e293b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 0.65,
                      boxShadow: selectedChoice
                        ? `inset 0 0 0 1px ${slotStyle.borderColor}`
                        : '0 1px 2px rgba(15, 23, 42, 0.04)',
                      transition: 'box-shadow 120ms ease',
                      '&:hover': {
                        boxShadow: `0 3px 10px ${slotStyle.borderColor}55`,
                      },
                      '&:focus-visible': {
                        outline: `2px solid ${slotStyle.borderColor}`,
                        outlineOffset: 2,
                      },
                    }}
                  >
                    {selectedChoice ? (
                      <Box sx={{ minWidth: 0, textAlign: 'center' }}>
                        <Typography
                          sx={{
                            mb: 0.25,
                            color: '#64748b',
                            fontSize: '0.6rem',
                            fontWeight: 800,
                            lineHeight: 1,
                          }}
                        >
                          옵션비교
                        </Typography>
                        <Typography
                          title={`${selectedChoice.category} · ${selectedChoice.optionName}`}
                          noWrap
                          sx={{
                            color: '#1e293b',
                            fontSize: '0.82rem',
                            fontWeight: 850,
                            lineHeight: 1.18,
                          }}
                        >
                          {selectedChoice.optionName}
                        </Typography>
                        <Typography
                          sx={{
                            mt: 0.25,
                            color: '#475569',
                            fontSize: '0.64rem',
                            fontWeight: 800,
                            lineHeight: 1,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {selectedChoice.cellKeys.size.toLocaleString()}세대
                        </Typography>
                      </Box>
                    ) : (
                      <>
                        <AddCircleOutlineRoundedIcon sx={{ fontSize: 22 }} />
                        <Typography
                          component="span"
                          sx={{
                            fontSize: '0.96rem',
                            fontWeight: 850,
                            lineHeight: 1,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          옵션선택
                        </Typography>
                      </>
                    )}
                  </ButtonBase>

                  {selectedChoice && (
                    <IconButton
                      className="option-comparison-slot-clear"
                      aria-label={`${selectedChoice.optionName} 비교 취소`}
                      title="비교 옵션 취소"
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        clearComparisonOption(index);
                      }}
                      sx={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        zIndex: 2,
                        width: 21,
                        height: 21,
                        color: '#ffffff',
                        bgcolor: '#0f172a',
                        '&:hover': {
                          bgcolor: '#dc2626',
                        },
                      }}
                    >
                      <CloseRoundedIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  )}
                </Box>
              );
            })}
          </Box>
          <Menu
            anchorEl={comparisonMenuAnchor}
            open={Boolean(comparisonMenuAnchor)}
            onClose={closeComparisonOptionMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{
              paper: {
                sx: {
                  mt: 0.5,
                  width: 320,
                  maxHeight: 430,
                  border: '1px solid #cbd5e1',
                  boxShadow: '0 12px 28px rgba(15, 23, 42, 0.18)',
                },
              },
            }}
          >
            {activeComparisonSlot >= 0 &&
              comparisonOptionKeys[activeComparisonSlot] && (
                <MenuItem
                  onClick={() => selectComparisonOption('')}
                  sx={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 800 }}
                >
                  선택 해제
                </MenuItem>
              )}
            {comparisonOptionChoices.length === 0 ? (
              <MenuItem disabled sx={{ fontSize: '0.75rem' }}>
                저장된 옵션이 없습니다.
              </MenuItem>
            ) : (
              ['선택 옵션'].map((category) => {
                const categoryChoices = comparisonOptionChoices.filter(
                  (choice) => choice.category === category,
                );
                if (categoryChoices.length === 0) return null;
                return (
                  <React.Fragment key={category}>
                    <MenuItem
                      disabled
                      sx={{
                        minHeight: 28,
                        opacity: '1 !important',
                        bgcolor: '#f8fafc',
                        color: '#475569',
                        fontSize: '0.66rem',
                        fontWeight: 900,
                      }}
                    >
                      {category}
                    </MenuItem>
                    {categoryChoices.map((choice) => {
                      const selectedElsewhere = comparisonOptionKeys.some(
                        (optionKey, slotIndex) =>
                          slotIndex !== activeComparisonSlot &&
                          optionKey === choice.key,
                      );
                      return (
                        <MenuItem
                          key={choice.key}
                          selected={
                            activeComparisonSlot >= 0 &&
                            comparisonOptionKeys[activeComparisonSlot] ===
                              choice.key
                          }
                          disabled={selectedElsewhere}
                          onClick={() => selectComparisonOption(choice.key)}
                          sx={{
                            minHeight: 34,
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 1fr) auto',
                            gap: 1,
                            fontSize: '0.73rem',
                          }}
                        >
                          <Typography noWrap sx={{ fontSize: '0.73rem' }}>
                            {choice.optionName}
                          </Typography>
                          <Typography
                            sx={{
                              color: '#64748b',
                              fontSize: '0.65rem',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {choice.cellKeys.size.toLocaleString()}세대
                          </Typography>
                        </MenuItem>
                      );
                    })}
                  </React.Fragment>
                );
              })
            )}
          </Menu>
        </Box>
      )}

      {isInsulation && (
        <Stack
          direction="row"
          spacing={0.8}
          useFlexGap
          flexWrap="wrap"
          alignItems="center"
        >
          <Chip
            size="small"
            variant="outlined"
            label={`등록 동 ${buildingEntries.length.toLocaleString()}개`}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`전체 세대 ${totalUnits.toLocaleString()}개`}
          />
          <Chip
            size="small"
            color={hasPendingChanges ? 'warning' : 'primary'}
            variant={hasPendingChanges ? 'filled' : 'outlined'}
            label={`단열 옵션 ${Object.keys(optionData).length.toLocaleString()}세대${
              hasPendingChanges ? ' · 저장 전' : ''
            }`}
          />
          <Chip
            size="small"
            variant="outlined"
            label={`옵션 종류 ${optionLegend.length.toLocaleString()}개`}
          />
          {sourceFileName && (
            <Chip size="small" variant="outlined" label={`파일 ${sourceFileName}`} />
          )}
          {savedAt && !hasPendingChanges && (
            <Typography sx={{ fontSize: '0.65rem', color: '#64748b' }}>
              최근 저장 {new Date(savedAt).toLocaleString('ko-KR')}
            </Typography>
          )}
        </Stack>
      )}

      {isSelection && (
        <Box
          sx={{
            minHeight: 32,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Typography
            sx={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              color: '#0f172a',
              fontSize: '0.78rem',
              fontWeight: 900,
              lineHeight: 1,
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            세대수 : {displayedSelectionUnitCount.toLocaleString()}세대
          </Typography>

          <ClickAwayListener
            onClickAway={() => setSelectionOptionMenuOpen(false)}
          >
            <Box
              sx={{
                ml: 'auto',
                width: 250,
                minWidth: 210,
                position: 'relative',
                zIndex: 12,
              }}
            >
              <ButtonBase
                id="selection-option-filter-button"
                aria-haspopup="listbox"
                aria-expanded={selectionOptionMenuOpen ? 'true' : undefined}
                disabled={selectionOptionNames.length === 0}
                onClick={() =>
                  setSelectionOptionMenuOpen((current) => !current)
                }
                sx={{
                  width: '100%',
                  height: 32,
                  px: 1.2,
                  border: '1px solid #2563eb',
                  borderRadius: 1,
                  bgcolor: '#ffffff',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 18px',
                  alignItems: 'center',
                  columnGap: 0.7,
                  textAlign: 'left',
                  '&:hover': {
                    bgcolor: '#f8fafc',
                  },
                  '&.Mui-disabled': {
                    color: '#94a3b8',
                    borderColor: '#cbd5e1',
                    bgcolor: '#f8fafc',
                  },
                }}
              >
                <Typography
                  noWrap
                  sx={{
                    color: 'inherit',
                    fontSize: '0.72rem',
                    lineHeight: 1,
                  }}
                >
                  {selectedSelectionOption || '전체 옵션'}
                </Typography>
                <KeyboardArrowDownRoundedIcon
                  sx={{
                    fontSize: 18,
                    color: '#475569',
                    transform: selectionOptionMenuOpen
                      ? 'rotate(180deg)'
                      : 'none',
                    transition: 'transform 120ms ease',
                  }}
                />
              </ButtonBase>

              <Typography
                component="span"
                sx={{
                  position: 'absolute',
                  top: -6,
                  left: 10,
                  zIndex: 1,
                  px: 0.4,
                  color: '#2563eb',
                  bgcolor: '#ffffff',
                  fontSize: '0.58rem',
                  fontWeight: 700,
                  lineHeight: 1,
                  pointerEvents: 'none',
                }}
              >
                표시 옵션
              </Typography>

              {selectionOptionMenuOpen && (
                <Paper
                  role="listbox"
                  aria-labelledby="selection-option-filter-button"
                  elevation={8}
                  sx={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    maxHeight: 320,
                    overflowX: 'hidden',
                    overflowY: 'auto',
                    border: '1px solid #cbd5e1',
                    borderRadius: 1,
                    bgcolor: '#ffffff',
                  }}
                >
                  <MenuList disablePadding>
                    {['', ...selectionOptionNames].map((optionName) => {
                      const selected = selectedSelectionOption === optionName;
                      return (
                        <MenuItem
                          key={optionName || 'all-options'}
                          selected={selected}
                          onClick={() => {
                            setSelectedSelectionOption(optionName);
                            setSelectionOptionMenuOpen(false);
                          }}
                          sx={{
                            minHeight: '32px !important',
                            height: 32,
                            px: 1.2,
                            fontSize: '0.7rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {optionName || '전체 옵션'}
                        </MenuItem>
                      );
                    })}
                  </MenuList>
                </Paper>
              )}
            </Box>
          </ClickAwayListener>
        </Box>
      )}

      <Box
        ref={splitPaneRef}
        sx={{
          flexGrow: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'stretch',
          gap: 0,
        }}
      >
        <Paper
          className={isComparison ? 'option-comparison-building-panel' : undefined}
          variant="outlined"
          sx={{
            flex: 1,
            minWidth: MIN_BUILDING_PANEL_WIDTH,
            minHeight: 0,
            overflowX: 'auto',
            overflowY: 'hidden',
            p: 0.75,
            borderColor: 'transparent',
            boxShadow: 'none',
            bgcolor: isComparison ? '#ffffff' : '#f1f5f9',
            position: 'relative',
          }}
        >
          {(loading || excelLoading) && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                zIndex: 5,
                bgcolor: 'rgba(248, 250, 252, 0.72)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
              }}
            >
              <CircularProgress size={22} />
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 800 }}>
                {excelLoading
                  ? 'Excel을 처리하는 중입니다.'
                  : `${pageConfig.category}을 불러오는 중입니다.`}
              </Typography>
            </Box>
          )}

          {buildingEntries.length === 0 ? (
            <Box
              sx={{
                minHeight: 260,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography color="text.secondary">
                이 현장에 등록된 동 설정이 없습니다.
              </Typography>
            </Box>
          ) : (
            <Box
              ref={printGridRef}
              className={isComparison ? 'option-comparison-building-content' : undefined}
              sx={{
                minWidth: 'max-content',
                minHeight: '100%',
                display: 'flex',
                alignItems: 'flex-end',
                gap: 2.5,
                pb: 0.5,
              }}
            >
              {buildingEntries.map(([buildingName, config]) => (
                <BuildingGrid
                  key={`${buildingName}-${refreshKey}`}
                  buildingName={buildingName}
                  config={config}
                  readOnly
                  cellDisplayData={
                    isEditableOptionMode || isComparison ? displayData : {}
                  }
                />
              ))}
            </Box>
          )}
        </Paper>

        {isInsulation && (
          <Box
            role="separator"
            aria-label="골구도와 타입별 현황 너비 조절"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={handleResizePointerDown}
            onDoubleClick={() =>
              changeSummaryPanelWidth(DEFAULT_SUMMARY_PANEL_WIDTH)
            }
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                changeSummaryPanelWidth(summaryPanelWidth + 20);
              }
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                changeSummaryPanelWidth(summaryPanelWidth - 20);
              }
            }}
            sx={{
              width: 10,
              flex: '0 0 10px',
              position: 'relative',
              cursor: 'col-resize',
              outline: 'none',
              touchAction: 'none',
              '&::after': {
                content: '""',
                position: 'absolute',
                top: 8,
                bottom: 8,
                left: '50%',
                width: isResizingPanels ? 3 : 1,
                transform: 'translateX(-50%)',
                bgcolor: isResizingPanels ? '#0284c7' : '#cbd5e1',
                borderRadius: 4,
              },
              '&:hover::after, &:focus-visible::after': {
                width: 3,
                bgcolor: '#0284c7',
              },
            }}
          />
        )}

        {isInsulation && (
          <Box
            sx={{
              width: summaryPanelWidth,
              minWidth: MIN_SUMMARY_PANEL_WIDTH,
              flexShrink: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid #cbd5e1',
              borderRadius: 1,
              bgcolor: '#ffffff',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                px: 1.15,
                py: 1,
                bgcolor: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              <Typography sx={{ color: '#0f172a', fontSize: '0.78rem', fontWeight: 900 }}>
                타입별 단열 옵션 현황
              </Typography>
              <Typography sx={{ mt: 0.15, color: '#64748b', fontSize: '0.62rem' }}>
                타입·옵션을 클릭하면 골구도에 표시됩니다.
              </Typography>
            </Box>

            <Box sx={{ minHeight: 0, overflowY: 'auto', p: 0.75 }}>
              {typeOptionSummary.rows.length === 0 ? (
                <Typography
                  sx={{ py: 2, color: '#94a3b8', fontSize: '0.68rem', textAlign: 'center' }}
                >
                  등록된 세대 타입이 없습니다.
                </Typography>
              ) : (
                typeOptionSummary.rows.map((row) => {
                  const expanded = expandedUnitType === row.typeName;
                  const typeSelected =
                    selectedHighlight?.typeName === row.typeName &&
                    !selectedHighlight?.optionName;
                  return (
                    <Box
                      key={row.typeName}
                      sx={{
                        mb: 0.55,
                        border: '1px solid #e2e8f0',
                        borderRadius: 1,
                        overflow: 'hidden',
                        bgcolor: '#ffffff',
                      }}
                    >
                      <ButtonBase
                        onClick={() => {
                          setExpandedUnitType((current) =>
                            current === row.typeName ? '' : row.typeName,
                          );
                          setSelectedHighlight((current) =>
                            current?.typeName === row.typeName &&
                            !current?.optionName
                              ? null
                              : { typeName: row.typeName, optionName: '' },
                          );
                        }}
                        sx={{
                          width: '100%',
                          minHeight: 34,
                          px: 0.8,
                          display: 'grid',
                          gridTemplateColumns: '20px minmax(0, 1fr)',
                          alignItems: 'center',
                          textAlign: 'left',
                          bgcolor: typeSelected ? '#dbeafe' : '#ffffff',
                          '&:hover': {
                            bgcolor: typeSelected ? '#bfdbfe' : '#f8fafc',
                          },
                        }}
                      >
                        {expanded ? (
                          <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: '#0284c7' }} />
                        ) : (
                          <ChevronRightRoundedIcon sx={{ fontSize: 18, color: '#64748b' }} />
                        )}
                        <Typography
                          noWrap
                          sx={{
                            color: '#334155',
                            fontSize: '0.7rem',
                            fontWeight: 850,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {row.typeName} {row.assignedCount.toLocaleString()}/
                          {row.totalCount.toLocaleString()}세대({row.percentage}%)
                        </Typography>
                      </ButtonBase>

                      <Collapse in={expanded} timeout="auto" unmountOnExit>
                        <Box
                          sx={{
                            px: 1,
                            py: 0.75,
                            display: 'grid',
                            gap: 0.45,
                            bgcolor: '#f8fafc',
                            borderTop: '1px solid #e2e8f0',
                          }}
                        >
                          {row.optionCounts.length === 0 ? (
                            <Typography sx={{ color: '#94a3b8', fontSize: '0.65rem' }}>
                              엑셀에 등록된 옵션명이 없습니다.
                            </Typography>
                          ) : (
                            row.optionCounts.map(({ optionName, count }) => {
                              const optionSelected =
                                selectedHighlight?.typeName === row.typeName &&
                                selectedHighlight?.optionName === optionName;
                              return (
                                <ButtonBase
                                  key={optionName}
                                  onClick={() =>
                                    setSelectedHighlight((current) =>
                                      current?.typeName === row.typeName &&
                                      current?.optionName === optionName
                                        ? null
                                        : { typeName: row.typeName, optionName },
                                    )
                                  }
                                  sx={{
                                    width: '100%',
                                    minHeight: 25,
                                    px: 0.55,
                                    borderRadius: 0.75,
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                                    columnGap: 0.7,
                                    alignItems: 'center',
                                    textAlign: 'left',
                                    bgcolor: optionSelected
                                      ? '#fef3c7'
                                      : 'transparent',
                                    '&:hover': {
                                      bgcolor: optionSelected ? '#fde68a' : '#eef2f7',
                                    },
                                  }}
                                >
                                  <Typography
                                    title={optionName}
                                    noWrap
                                    sx={{
                                      color: '#475569',
                                      fontSize: '0.65rem',
                                      fontWeight: 700,
                                    }}
                                  >
                                    {optionName}
                                  </Typography>
                                  <Typography
                                    sx={{
                                      color: '#0f172a',
                                      fontSize: '0.65rem',
                                      fontWeight: 800,
                                      fontVariantNumeric: 'tabular-nums',
                                    }}
                                  >
                                    {count.toLocaleString()}세대
                                  </Typography>
                                </ButtonBase>
                              );
                            })
                          )}
                        </Box>
                      </Collapse>
                    </Box>
                  );
                })
              )}
            </Box>
          </Box>
        )}
      </Box>

      <Dialog
        open={isComparison && comparisonPresetDialogOpen}
        onClose={() => {
          if (!comparisonPresetSaving) {
            setComparisonPresetDialogOpen(false);
            setComparisonPresetName('');
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ pb: 1, fontSize: '1rem', fontWeight: 900 }}>
          옵션 비교 저장 · 불러오기
        </DialogTitle>

        <DialogContent dividers sx={{ p: 1.5 }}>
          <Typography
            sx={{
              mb: 0.8,
              color: '#475569',
              fontSize: '0.72rem',
              fontWeight: 800,
            }}
          >
            현재 선택한 옵션만 공정별 비교 구성으로 저장합니다.
          </Typography>

          <Stack direction="row" spacing={0.8} alignItems="stretch">
            <TextField
              size="small"
              label="저장명(공정명)"
              placeholder="예: 침실2 발코니확장"
              value={comparisonPresetName}
              onChange={(event) => setComparisonPresetName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSaveComparisonPreset();
                }
              }}
              disabled={comparisonPresetSaving}
              sx={{ flex: 1 }}
            />
            <Button
              variant="contained"
              startIcon={
                comparisonPresetSaving ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <BookmarkAddRoundedIcon />
                )
              }
              onClick={handleSaveComparisonPreset}
              disabled={
                comparisonPresetSaving ||
                selectedComparisonChoices.length === 0
              }
              sx={{ minWidth: 128, whiteSpace: 'nowrap' }}
            >
              현재 비교 저장
            </Button>
          </Stack>

          <Box
            sx={{
              mt: 1,
              minHeight: 34,
              px: 1,
              py: 0.7,
              borderRadius: 1,
              bgcolor: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.62rem',
                fontWeight: 800,
              }}
            >
              현재 선택
            </Typography>
            <Typography
              sx={{
                mt: 0.15,
                color: '#0f172a',
                fontSize: '0.72rem',
                fontWeight: 850,
              }}
            >
              {selectedComparisonChoices.length > 0
                ? selectedComparisonChoices
                    .map((choice) => choice.optionName)
                    .join(' · ')
                : '선택된 옵션 없음'}
            </Typography>
          </Box>

          <Divider sx={{ my: 1.4 }} />

          <Typography
            sx={{
              mb: 0.7,
              color: '#0f172a',
              fontSize: '0.75rem',
              fontWeight: 900,
            }}
          >
            저장된 비교 구성 {comparisonPresets.length.toLocaleString()}개
          </Typography>

          {comparisonPresets.length === 0 ? (
            <Box
              sx={{
                py: 3,
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '0.72rem',
              }}
            >
              저장된 옵션 비교 구성이 없습니다.
            </Box>
          ) : (
            <Stack spacing={0.7}>
              {comparisonPresets.map((preset) => (
                <Paper
                  key={preset.id}
                  variant="outlined"
                  sx={{
                    px: 1,
                    py: 0.8,
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
                    gap: 0.65,
                    alignItems: 'center',
                    borderColor: '#e2e8f0',
                    boxShadow: 'none',
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      noWrap
                      sx={{
                        color: '#0f172a',
                        fontSize: '0.76rem',
                        fontWeight: 900,
                      }}
                    >
                      {preset.name}
                    </Typography>
                    <Typography
                      noWrap
                      title={(preset.optionNames || []).join(' · ')}
                      sx={{
                        mt: 0.18,
                        color: '#64748b',
                        fontSize: '0.64rem',
                        fontWeight: 700,
                      }}
                    >
                      {(preset.optionNames || []).join(' · ')}
                    </Typography>
                  </Box>

                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleLoadComparisonPreset(preset)}
                    disabled={comparisonPresetSaving}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    불러오기
                  </Button>

                  <Tooltip title="저장 구성 삭제" arrow>
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteComparisonPreset(preset)}
                        disabled={comparisonPresetSaving}
                        sx={{
                          color: '#64748b',
                          '&:hover': {
                            color: '#dc2626',
                            bgcolor: '#fef2f2',
                          },
                        }}
                      >
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Paper>
              ))}
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 1.5, py: 1 }}>
          <Button
            onClick={() => {
              setComparisonPresetDialogOpen(false);
              setComparisonPresetName('');
            }}
            disabled={comparisonPresetSaving}
          >
            닫기
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3800}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setToast(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast?.severity || 'info'}
          variant="filled"
          onClose={() => setToast(null)}
          sx={{ minWidth: 320, fontWeight: 700 }}
        >
          {toast?.text || ''}
        </Alert>
      </Snackbar>
    </Box>
  );
}
