// v52.48.5.44.42 골구도 다이얼로그 높이·화면맞춤 로딩 수정
// v52.48.5.44.41 단열·합지 자동기준, 골구도 줌·이동·가로출력
// v52.48.5.44.40 공정별 세대물량 골구도 보기
// v52.48.5.44.39 증감 부호 계산 수정·상하 표 9열 정렬
// v52.48.5.44.38 하단 옵션 증감물량 타입별 상단 자동집계
// v52.48.5.44.37 기본물량 소계·공제물량·자동합계 및 표 정렬
// v52.48.5.44.34 공정별옵션연결 별도 설정·다운로드 연결정보 즉시 저장
// v52.48.5.44.33 공정 탭 배율 오차 수정·기본옵션 명칭 통일
// v52.48.5.44.32 기본 공정 6개·사용자 공정 추가
// v52.48.5.44.31 세대물량관리 단일화·공정별 갑지·Excel 연동
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, ButtonBase, Checkbox, Chip, CircularProgress, IconButton,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider, Paper,
  Snackbar, Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import CenterFocusStrongRoundedIcon from '@mui/icons-material/CenterFocusStrongRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import SystemPageTitle from '../components/SystemPageTitle.jsx';
import SystemRefreshButton from '../components/SystemRefreshButton.jsx';
import BuildingGrid from '../BuildingGrid.jsx';
import { supabase } from '../supabaseClient';
import { normalizeSelectionOptionDocument } from '../utils/optionSelectionExcel.js';
import {
  createHouseholdQuantityDefinitions,
  createHouseholdQuantityDocumentFromDefinitions,
  createHouseholdQuantityUnitValues,
  normalizeHouseholdQuantityDocument,
  parseHouseholdQuantityWorkbookFile,
  saveHouseholdQuantityWorkbook,
} from '../utils/householdQuantityExcel.js';

const HOUSEHOLD_CATEGORY = 'household_quantity';
const DEFAULT_PROCESS_NAMES = [
  '단열',
  '합지',
  '경량벽체',
  '세대천정',
  '몰딩',
  '걸레받이',
];
const HEADER_CONTROL_SX = {
  height: 30,
  minHeight: 30,
  boxSizing: 'border-box',
  whiteSpace: 'nowrap',
};
const GRID_ZOOM_MIN = 0.35;
const GRID_ZOOM_MAX = 1.8;
const GRID_ZOOM_STEP = 0.1;
const TABLE_HEADER_SX = {
  py: 0.8,
  px: 1,
  bgcolor: '#f8fafc',
  color: '#334155',
  fontSize: '0.69rem',
  fontWeight: 900,
  borderRight: '1px solid #e2e8f0',
  whiteSpace: 'nowrap',
  textAlign: 'center',
};
const TABLE_BODY_SX = {
  py: 0.72,
  px: 1,
  color: '#334155',
  fontSize: '0.69rem',
  borderRight: '1px solid #e2e8f0',
  textAlign: 'center',
};

const normalizeInsulationData = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce((result, [cellKey, raw]) => {
    const optionValue = String(raw?.value || '').trim();
    if (optionValue) result[cellKey] = { value: optionValue };
    return result;
  }, {});
};
const isMissingTableError = (error) =>
  ['42P01', 'PGRST205'].includes(String(error?.code || '')) ||
  /option_status_documents|schema cache|does not exist/i.test(String(error?.message || ''));
const isCategoryConstraintError = (error) =>
  String(error?.code || '') === '23514' ||
  /option_status_documents_category_check/i.test(String(error?.message || ''));
const formatQuantity = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return number.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
};
const hasQuantity = (value) =>
  value !== null && value !== undefined && value !== '';
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export default function HouseholdQuantityManagement({
  projectName = '',
  buildingConfigs = {},
  currentUserId = '',
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [insulationData, setInsulationData] = useState({});
  const [selectionDocument, setSelectionDocument] = useState(() =>
    normalizeSelectionOptionDocument({}),
  );
  const [quantityDocument, setQuantityDocument] = useState(() =>
    normalizeHouseholdQuantityDocument({}),
  );
  const [selectedProcess, setSelectedProcess] = useState('');
  const [loading, setLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [sourceFileName, setSourceFileName] = useState('');
  const [message, setMessage] = useState(null);
  const [toast, setToast] = useState(null);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [configurationDialogMode, setConfigurationDialogMode] = useState('download');
  const [dialogProcess, setDialogProcess] = useState('');
  const [workingSelections, setWorkingSelections] = useState({});
  const [customProcessNames, setCustomProcessNames] = useState([]);
  const [workingProcessNames, setWorkingProcessNames] = useState([]);
  const [addingProcess, setAddingProcess] = useState(false);
  const [newProcessName, setNewProcessName] = useState('');
  const [processAddError, setProcessAddError] = useState('');
  const [gridDialogOpen, setGridDialogOpen] = useState(false);
  const [gridProcessName, setGridProcessName] = useState('');
  const [gridZoom, setGridZoom] = useState(1);
  const [gridPan, setGridPan] = useState({ x: 0, y: 0 });
  const [gridPanning, setGridPanning] = useState(false);
  const fileInputRef = useRef(null);
  const gridViewportRef = useRef(null);
  const gridContentRef = useRef(null);
  const gridPanDragRef = useRef(null);
  const gridFitFrameRef = useRef(null);
  const gridZoomRef = useRef(1);
  const gridPanRef = useRef({ x: 0, y: 0 });

  const safeProcessOptions = useMemo(
    () => [
      ...DEFAULT_PROCESS_NAMES,
      ...customProcessNames.filter(
        (processName) => !DEFAULT_PROCESS_NAMES.includes(processName),
      ),
    ],
    [customProcessNames],
  );
  const definitions = useMemo(
    () => createHouseholdQuantityDefinitions({
      buildingConfigs,
      processOptions: safeProcessOptions,
      insulationData,
      selectionDocument,
      quantityDocument,
    }),
    [buildingConfigs, insulationData, quantityDocument, safeProcessOptions, selectionDocument],
  );
  const activeProcess = useMemo(
    () => definitions.processes.find(
      (process) => process.processName === selectedProcess,
    ) || definitions.processes[0] || null,
    [definitions.processes, selectedProcess],
  );
  const gridProcess = useMemo(
    () =>
      definitions.processes.find(
        (process) => process.processName === gridProcessName,
      ) || activeProcess,
    [activeProcess, definitions.processes, gridProcessName],
  );
  const gridUnitValues = useMemo(
    () =>
      createHouseholdQuantityUnitValues({
        buildingConfigs,
        process: gridProcess,
        insulationData,
        selectionDocument,
        processOptionSelections: definitions.processOptionSelections,
      }),
    [
      buildingConfigs,
      definitions.processOptionSelections,
      gridProcess,
      insulationData,
      selectionDocument,
    ],
  );
  const gridCellDisplayData = useMemo(
    () =>
      Object.fromEntries(
        gridUnitValues.rows.map((row) => {
          const unit = row.measurementUnit || 'M2';
          const adjustmentText = row.adjustmentRows.length
            ? row.adjustmentRows
                .map(
                  (item) =>
                    `${item.optionName} ${
                      hasQuantity(item.quantity)
                        ? formatQuantity(item.quantity)
                        : '미입력'
                    }${unit}`,
                )
                .join(' · ')
            : '선택옵션 증감 없음';
          const title = row.complete
            ? `${row.building} ${row.unitCode}호 · ${row.typeName}${
                row.basisOption ? `/${row.basisOption}` : ''
              } · 기본 ${formatQuantity(row.baseQuantity)}${unit} · ${
                adjustmentText
              } · 세대물량 ${formatQuantity(row.finalQuantity)}${unit}`
            : `${row.building} ${row.unitCode}호 · ${row.missingItems.join(
                ', ',
              )} 미입력`;

          return [
            row.cellKey,
            {
              label: row.complete ? formatQuantity(row.finalQuantity) : '미입력',
              backgroundColor: row.complete
                ? row.finalQuantity < 0
                  ? '#fef2f2'
                  : '#eff6ff'
                : '#fff7ed',
              borderColor: row.complete
                ? row.finalQuantity < 0
                  ? '#dc2626'
                  : '#2563eb'
                : '#f97316',
              color: row.complete
                ? row.finalQuantity < 0
                  ? '#991b1b'
                  : '#1e3a8a'
                : '#9a3412',
              fontSize: '0.46rem',
              letterSpacing: '-0.04em',
              fontWeight: 900,
              title,
            },
          ];
        }),
      ),
    [gridUnitValues.rows],
  );
  const buildingEntries = useMemo(
    () =>
      Object.entries(buildingConfigs || {}).sort(([first], [second]) =>
        String(first).localeCompare(String(second), 'ko-KR', { numeric: true }),
      ),
    [buildingConfigs],
  );

  useEffect(() => {
    setSelectedProcess((current) =>
      safeProcessOptions.includes(current) ? current : safeProcessOptions[0] || '',
    );
  }, [safeProcessOptions]);

  const loadDocuments = useCallback(async () => {
    if (!projectName) return;
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase
        .from('option_status_documents')
        .select('option_category, unit_values, source_file_name, updated_at')
        .eq('project_name', projectName)
        .in('option_category', ['insulation', 'selection', HOUSEHOLD_CATEGORY]);
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      const insulationRow = rows.find((row) => row.option_category === 'insulation');
      const selectionRow = rows.find((row) => row.option_category === 'selection');
      const quantityRow = rows.find((row) => row.option_category === HOUSEHOLD_CATEGORY);
      setInsulationData(normalizeInsulationData(insulationRow?.unit_values));
      setSelectionDocument(normalizeSelectionOptionDocument(selectionRow?.unit_values));
      const loadedQuantityDocument = normalizeHouseholdQuantityDocument(
        quantityRow?.unit_values,
      );
      setQuantityDocument(loadedQuantityDocument);
      setCustomProcessNames(
        loadedQuantityDocument.processNames.filter(
          (processName) => !DEFAULT_PROCESS_NAMES.includes(processName),
        ),
      );
      setSourceFileName(quantityRow?.source_file_name || '');
      setHasPendingChanges(false);
    } catch (error) {
      console.error('세대물량관리 자료 불러오기 오류:', error);
      setMessage({
        severity: isMissingTableError(error) ? 'warning' : 'error',
        text: isMissingTableError(error)
          ? '옵션현황 저장표가 없습니다. 기존 옵션현황용 SQL을 먼저 실행해주세요.'
          : `세대물량관리 자료를 불러오지 못했습니다: ${error?.message || '알 수 없는 오류'}`,
      });
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments, refreshKey]);

  const handleRefresh = () => {
    if (hasPendingChanges && !window.confirm(
      '저장하지 않은 세대물량 자료가 있습니다. 새로고침하면 사라집니다. 계속할까요?',
    )) return;
    setRefreshKey((current) => current + 1);
  };

  const openConfigurationDialog = (mode) => {
    const currentSelections = normalizeHouseholdQuantityDocument(
      quantityDocument,
    ).processOptionSelections;
    setWorkingSelections(safeProcessOptions.reduce((result, processName) => {
      result[processName] = Array.isArray(currentSelections[processName])
        ? [...currentSelections[processName]]
        : [];
      return result;
    }, {}));
    setWorkingProcessNames([...safeProcessOptions]);
    setDialogProcess(safeProcessOptions[0] || '');
    setAddingProcess(false);
    setNewProcessName('');
    setProcessAddError('');
    setConfigurationDialogMode(mode);
    setDownloadDialogOpen(true);
  };

  const openOptionConnectionDialog = () => {
    openConfigurationDialog('connections');
  };

  const setGridPanPosition = useCallback((nextPan) => {
    const safePan = {
      x: Number(nextPan?.x || 0),
      y: Number(nextPan?.y || 0),
    };
    gridPanRef.current = safePan;
    setGridPan(safePan);
  }, []);

  const setGridZoomAtClientPoint = useCallback(
    (requestedZoom, clientX, clientY) => {
      const viewport = gridViewportRef.current;
      if (!viewport) return;
      const nextZoom = Math.min(
        GRID_ZOOM_MAX,
        Math.max(
          GRID_ZOOM_MIN,
          Number(Number(requestedZoom).toFixed(2)),
        ),
      );
      const currentZoom = gridZoomRef.current;
      if (Math.abs(nextZoom - currentZoom) < 0.001) return;

      const rect = viewport.getBoundingClientRect();
      const anchorX = Number.isFinite(clientX)
        ? clientX - rect.left
        : rect.width / 2;
      const anchorY = Number.isFinite(clientY)
        ? clientY - rect.top
        : rect.height / 2;
      const currentPan = gridPanRef.current;
      const worldX = (anchorX - currentPan.x) / currentZoom;
      const worldY = (anchorY - currentPan.y) / currentZoom;
      const nextPan = {
        x: anchorX - worldX * nextZoom,
        y: anchorY - worldY * nextZoom,
      };

      gridZoomRef.current = nextZoom;
      setGridZoom(nextZoom);
      setGridPanPosition(nextPan);
    },
    [setGridPanPosition],
  );

  const fitGridView = useCallback(() => {
    const viewport = gridViewportRef.current;
    const content = gridContentRef.current;
    if (!viewport || !content) return false;
    const viewportRect = viewport.getBoundingClientRect();
    const contentWidth = Math.max(content.scrollWidth, content.offsetWidth, 1);
    const contentHeight = Math.max(content.scrollHeight, content.offsetHeight, 1);
    if (viewportRect.width < 100 || viewportRect.height < 100 || contentWidth <= 1 || contentHeight <= 1) {
      return false;
    }
    const nextZoom = Math.min(
      1,
      Math.max(
        GRID_ZOOM_MIN,
        Math.min(
          (viewportRect.width - 32) / contentWidth,
          (viewportRect.height - 32) / contentHeight,
        ),
      ),
    );
    const nextPan = {
      x: Math.max(16, (viewportRect.width - contentWidth * nextZoom) / 2),
      y: Math.max(16, (viewportRect.height - contentHeight * nextZoom) / 2),
    };
    gridZoomRef.current = nextZoom;
    setGridZoom(nextZoom);
    setGridPanPosition(nextPan);
    return true;
  }, [setGridPanPosition]);

  const openGridDialog = () => {
    setGridProcessName(activeProcess?.processName || '');
    gridZoomRef.current = 1;
    gridPanRef.current = { x: 0, y: 0 };
    setGridZoom(1);
    setGridPan({ x: 0, y: 0 });
    setGridDialogOpen(true);
  };

  useEffect(() => {
    if (!gridDialogOpen || buildingEntries.length === 0) return undefined;
    let cancelled = false;
    let attemptCount = 0;
    const tryFitGridView = () => {
      if (cancelled) return;
      attemptCount += 1;
      if (!fitGridView() && attemptCount < 12) {
        gridFitFrameRef.current = window.requestAnimationFrame(tryFitGridView);
      }
    };
    gridFitFrameRef.current = window.requestAnimationFrame(tryFitGridView);
    return () => {
      cancelled = true;
      if (gridFitFrameRef.current) {
        window.cancelAnimationFrame(gridFitFrameRef.current);
        gridFitFrameRef.current = null;
      }
    };
  }, [buildingEntries.length, fitGridView, gridDialogOpen]);

  const changeGridZoom = (difference) => {
    const viewport = gridViewportRef.current;
    const rect = viewport?.getBoundingClientRect();
    setGridZoomAtClientPoint(
      gridZoomRef.current + difference,
      rect ? rect.left + rect.width / 2 : undefined,
      rect ? rect.top + rect.height / 2 : undefined,
    );
  };

  const handleGridWheel = useCallback(
    (event) => {
      event.preventDefault();
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      setGridZoomAtClientPoint(
        gridZoomRef.current * zoomFactor,
        event.clientX,
        event.clientY,
      );
    },
    [setGridZoomAtClientPoint],
  );

  const handleGridPointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gridPanDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origin: gridPanRef.current,
    };
    setGridPanning(true);
  }, []);

  const handleGridPointerMove = useCallback(
    (event) => {
      const drag = gridPanDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      setGridPanPosition({
        x: drag.origin.x + event.clientX - drag.startClientX,
        y: drag.origin.y + event.clientY - drag.startClientY,
      });
    },
    [setGridPanPosition],
  );

  const finishGridPan = useCallback((event) => {
    const drag = gridPanDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    gridPanDragRef.current = null;
    setGridPanning(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const handleGridOutput = (mode) => {
    const content = gridContentRef.current;
    if (!content || !gridProcess) return;
    const outputWindow = window.open('', '_blank', 'width=1400,height=900');
    if (!outputWindow) {
      setToast({
        severity: 'warning',
        text: '출력 창이 차단되었습니다. 브라우저 팝업을 허용한 뒤 다시 시도해주세요.',
      });
      return;
    }

    const styleMarkup = Array.from(
      document.querySelectorAll('style, link[rel="stylesheet"]'),
    )
      .map((node) => node.outerHTML)
      .join('\n');
    const contentWidth = Math.ceil(
      Math.max(content.scrollWidth, content.offsetWidth, 1),
    );
    const contentHeight = Math.ceil(
      Math.max(content.scrollHeight, content.offsetHeight, 1),
    );
    const outputTitle = `${projectName || '현장명 미등록'}_${gridProcess.processName}_세대물량골구도`;
    const finalizeOutput = () => {
      const stage = outputWindow.document.getElementById('quantity-print-stage');
      const printContent = outputWindow.document.getElementById('quantity-print-content');
      if (!stage || !printContent) return;
      const scale = Math.min(
        stage.clientWidth / contentWidth,
        stage.clientHeight / contentHeight,
      );
      const left = Math.max(0, (stage.clientWidth - contentWidth * scale) / 2);
      const top = Math.max(0, (stage.clientHeight - contentHeight * scale) / 2);
      printContent.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
      outputWindow.focus();
      window.setTimeout(() => outputWindow.print(), mode === 'pdf' ? 350 : 250);
    };

    outputWindow.addEventListener('load', finalizeOutput, { once: true });
    outputWindow.document.open();
    outputWindow.document.write(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <base href="${escapeHtml(document.baseURI)}" />
  <title>${escapeHtml(outputTitle)}</title>
  ${styleMarkup}
  <style>
    @page { size: A4 landscape; margin: 5mm; }
    html, body { width: 287mm; height: 200mm; margin: 0; padding: 0; overflow: hidden; }
    body { background: #fff; color: #0f172a; font-family: inherit; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .quantity-print-page { width: 287mm; height: 200mm; box-sizing: border-box; overflow: hidden; }
    .quantity-print-header { height: 13mm; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 8mm; border-bottom: 0.3mm solid #cbd5e1; }
    .quantity-print-title { min-width: 0; font-size: 12pt; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .quantity-print-meta { flex: 0 0 auto; color: #475569; font-size: 7pt; font-weight: 800; }
    .quantity-print-stage { position: relative; width: 287mm; height: 187mm; overflow: hidden; }
    .quantity-print-content { position: absolute; left: 0; top: 0; width: ${contentWidth}px; height: ${contentHeight}px; transform-origin: 0 0; }
    .quantity-print-content button { cursor: default !important; }
    @media print { .quantity-print-page { break-after: avoid; page-break-after: avoid; } }
  </style>
</head>
<body>
  <main class="quantity-print-page">
    <header class="quantity-print-header">
      <div class="quantity-print-title">${escapeHtml(projectName || '현장명 미등록')} · ${escapeHtml(gridProcess.processName)} 세대물량 골구도</div>
      <div class="quantity-print-meta">계산 ${gridUnitValues.completeCount.toLocaleString()}/${gridUnitValues.rows.length.toLocaleString()}세대 · 총 물량 ${escapeHtml(formatQuantity(gridUnitValues.totalQuantity))}</div>
    </header>
    <section class="quantity-print-stage" id="quantity-print-stage">
      <div class="quantity-print-content" id="quantity-print-content">${content.innerHTML}</div>
    </section>
  </main>
</body>
</html>`);
    outputWindow.document.close();
  };

  const openDownloadDialog = () => {
    openConfigurationDialog('download');
  };

  const handleAddWorkingProcess = () => {
    const processName = String(newProcessName || '').trim();
    if (!processName) {
      setProcessAddError('추가할 공정명을 입력해주세요.');
      return;
    }
    if (workingProcessNames.includes(processName)) {
      setProcessAddError('이미 등록된 공정입니다.');
      return;
    }
    if (processName.length > 20) {
      setProcessAddError('공정명은 20자 이내로 입력해주세요.');
      return;
    }
    setWorkingProcessNames((current) => [...current, processName]);
    setWorkingSelections((current) => ({
      ...current,
      [processName]: [],
    }));
    setDialogProcess(processName);
    setAddingProcess(false);
    setNewProcessName('');
    setProcessAddError('');
  };

  const toggleWorkingOption = (processName, optionName) => {
    setWorkingSelections((current) => {
      const selected = Array.isArray(current[processName]) ? current[processName] : [];
      return {
        ...current,
        [processName]: selected.includes(optionName)
          ? selected.filter((value) => value !== optionName)
          : [...selected, optionName],
      };
    });
  };

  const persistQuantityDocument = async (documentToSave) => {
    const payload = {
      project_name: projectName,
      option_category: HOUSEHOLD_CATEGORY,
      unit_values: normalizeHouseholdQuantityDocument(documentToSave),
      source_file_name: sourceFileName || null,
      updated_at: new Date().toISOString(),
    };
    if (currentUserId) payload.updated_by = currentUserId;
    const { error } = await supabase
      .from('option_status_documents')
      .upsert(payload, { onConflict: 'project_name,option_category' });
    if (error) throw error;
  };

  const createWorkingDefinitions = () => createHouseholdQuantityDefinitions({
    buildingConfigs,
    processOptions: workingProcessNames,
    insulationData,
    selectionDocument,
    quantityDocument,
    processOptionSelections: workingSelections,
  });

  const applyWorkingDefinitions = (workingDefinitions) => {
    const nextDocument = createHouseholdQuantityDocumentFromDefinitions(
      workingDefinitions,
    );
    setQuantityDocument(nextDocument);
    setCustomProcessNames(
      workingProcessNames.filter(
        (processName) => !DEFAULT_PROCESS_NAMES.includes(processName),
      ),
    );
    return nextDocument;
  };

  const handleSaveOptionConnections = async () => {
    setSaving(true);
    setToast(null);
    try {
      const workingDefinitions = createWorkingDefinitions();
      const nextDocument = createHouseholdQuantityDocumentFromDefinitions(
        workingDefinitions,
      );
      await persistQuantityDocument(nextDocument);
      applyWorkingDefinitions(workingDefinitions);
      setHasPendingChanges(false);
      setDownloadDialogOpen(false);
      setToast({
        severity: 'success',
        text: '공정별 옵션 연결정보를 저장했습니다.',
      });
    } catch (error) {
      console.error('공정별 옵션 연결정보 저장 오류:', error);
      setToast({
        severity: 'error',
        text: isCategoryConstraintError(error)
          ? '세대물량 저장 분류를 추가하는 v52.48.5.44.31 SQL을 먼저 실행해주세요.'
          : `공정별 옵션 연결정보를 저장하지 못했습니다: ${error?.message || '알 수 없는 오류'}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadExcel = async () => {
    setExcelLoading(true);
    setToast(null);
    try {
      const downloadDefinitions = createWorkingDefinitions();
      const nextDocument = createHouseholdQuantityDocumentFromDefinitions(
        downloadDefinitions,
      );
      await persistQuantityDocument(nextDocument);
      const result = await saveHouseholdQuantityWorkbook({
        projectName,
        definitions: downloadDefinitions,
      });
      applyWorkingDefinitions(downloadDefinitions);
      setHasPendingChanges(false);
      setDownloadDialogOpen(false);
      setToast({
        severity: 'success',
        text: `공정별 옵션 연결정보를 저장하고 ${result.processCount.toLocaleString()}개 공정, ${result.unitCount.toLocaleString()}세대 기준 물량 양식을 내려받았습니다.`,
      });
    } catch (error) {
      console.error('세대물량 Excel 다운로드 오류:', error);
      setToast({
        severity: 'error',
        text: `세대물량 Excel을 만들지 못했습니다: ${error?.message || '알 수 없는 오류'}`,
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
      const result = await parseHouseholdQuantityWorkbookFile({ file, projectName });
      setQuantityDocument(result.document);
      setCustomProcessNames(
        result.document.processNames.filter(
          (processName) => !DEFAULT_PROCESS_NAMES.includes(processName),
        ),
      );
      setSourceFileName(file.name);
      setHasPendingChanges(true);
      setToast({
        severity: 'success',
        text: `${result.processCount.toLocaleString()}개 공정에서 입력된 물량 ${result.filledCount.toLocaleString()}건을 불러왔습니다. 갑지를 확인한 뒤 저장해주세요.`,
      });
    } catch (error) {
      console.error('세대물량 Excel 업로드 오류:', error);
      setToast({
        severity: 'error',
        text: `세대물량 Excel을 불러오지 못했습니다: ${error?.message || '알 수 없는 오류'}`,
      });
    } finally {
      setExcelLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      await persistQuantityDocument(quantityDocument);
      setHasPendingChanges(false);
      setToast({ severity: 'success', text: '공정별 세대물량 갑지를 저장했습니다.' });
    } catch (error) {
      console.error('세대물량관리 저장 오류:', error);
      setToast({
        severity: 'error',
        text: isCategoryConstraintError(error)
          ? '세대물량 저장 분류를 추가하는 v52.48.5.44.31 SQL을 먼저 실행해주세요.'
          : `세대물량 갑지를 저장하지 못했습니다: ${error?.message || '알 수 없는 오류'}`,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
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
          <SystemPageTitle
            title="세대물량관리"
            help="타입별 기본물량과 옵션별 증감물량을 입력하면 골구도 세대정보를 기준으로 공정별 예정물량을 계산합니다."
          />
          <Typography sx={{ mt: 0.15, color: '#64748b', fontSize: '0.67rem' }}>
            {projectName || '현장명 미등록'} · 공정별 세대물량 갑지
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.7} alignItems="center" useFlexGap flexWrap="wrap" sx={{ flex: 1 }}>
          <Chip size="small" variant="outlined" color="primary" label={`${definitions.processes.length.toLocaleString()}개 공정`} />
          <Chip size="small" variant="outlined" label={`${definitions.unitCount.toLocaleString()}세대`} />
          {sourceFileName && <Chip size="small" variant="outlined" label={sourceFileName} />}
        </Stack>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleUploadExcel}
        />
        <Button
          size="small"
          variant="outlined"
          startIcon={<GridViewRoundedIcon />}
          onClick={openGridDialog}
          disabled={loading || excelLoading || !activeProcess || definitions.unitCount === 0}
          sx={HEADER_CONTROL_SX}
        >
          골구도보기
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<LinkRoundedIcon />}
          onClick={openOptionConnectionDialog}
          disabled={excelLoading || saving || loading || safeProcessOptions.length === 0}
          sx={HEADER_CONTROL_SX}
        >
          공정별옵션연결
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<DownloadRoundedIcon />}
          onClick={openDownloadDialog}
          disabled={excelLoading || loading || definitions.unitCount === 0 || safeProcessOptions.length === 0}
          sx={HEADER_CONTROL_SX}
        >
          양식 다운로드
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="success"
          startIcon={<UploadFileRoundedIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={excelLoading || loading}
          sx={HEADER_CONTROL_SX}
        >
          엑셀 업로드
        </Button>
        <Button
          size="small"
          variant="contained"
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveRoundedIcon />}
          onClick={handleSave}
          disabled={saving || loading || !hasPendingChanges}
          sx={HEADER_CONTROL_SX}
        >
          저장
        </Button>
        <SystemRefreshButton onClick={handleRefresh} loading={loading} label="세대물량관리 새로고침" />
      </Paper>

      {message && <Alert severity={message.severity}>{message.text}</Alert>}

      <Paper variant="outlined" sx={{ minHeight: 42, borderColor: '#cbd5e1', boxShadow: 'none', overflow: 'hidden' }}>
        <Tabs
          value={activeProcess?.processName || false}
          onChange={(_, value) => setSelectedProcess(value)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="공정별 세대물량 갑지 선택"
          sx={{
            minHeight: 40,
            '& .MuiTabs-indicator': { display: 'none' },
            '& .MuiTab-root': {
              minHeight: 40,
              py: 0.5,
              px: 1.7,
              borderBottom: '2px solid transparent',
              fontSize: '0.72rem',
              fontWeight: 800,
            },
            '& .MuiTab-root.Mui-selected': {
              borderBottomColor: '#2563eb',
            },
          }}
        >
          {definitions.processes.map((process) => (
            <Tab key={process.processName} value={process.processName} label={process.processName} />
          ))}
        </Tabs>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          flexGrow: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          borderColor: '#cbd5e1',
          boxShadow: 'none',
          overflow: 'hidden',
          bgcolor: '#ffffff',
        }}
      >
        {loading || excelLoading ? (
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <CircularProgress size={22} />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 800 }}>
              {excelLoading ? '세대물량 Excel을 처리하는 중입니다.' : '세대물량 자료를 불러오는 중입니다.'}
            </Typography>
          </Box>
        ) : !activeProcess ? (
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">표시할 공정정보가 없습니다.</Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ px: 1.5, py: 1.15, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ color: '#0f172a', fontSize: '0.9rem', fontWeight: 900 }}>
                  {activeProcess.processName} 갑지
                </Typography>
                <Typography sx={{ mt: 0.15, color: '#64748b', fontSize: '0.65rem' }}>
                  {activeProcess.usesInsulationBasis
                    ? '타입·단열옵션별 기본물량 + 연결된 유상옵션별 증감물량'
                    : '타입별 기본물량 + 연결된 유상옵션별 증감물량'}
                </Typography>
              </Box>
              <Chip size="small" variant="outlined" label={`기본 ${activeProcess.baseRows.length.toLocaleString()}항목`} />
              <Chip size="small" variant="outlined" label={`옵션 ${activeProcess.optionRows.length.toLocaleString()}항목`} />
              <Chip size="small" color="primary" label={`총 예정물량 ${formatQuantity(activeProcess.totalQuantity)}`} />
            </Box>

            <TableContainer sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
              <Box sx={{ minWidth: 900, p: 1.25 }}>
                <Typography sx={{ mb: 0.65, color: '#2563eb', fontSize: '0.75rem', fontWeight: 900 }}>
                  타입별 기본물량
                </Typography>
                <Table size="small" sx={{ tableLayout: 'fixed' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell align="center" sx={{ ...TABLE_HEADER_SX, width: 80 }}>구분</TableCell>
                      <TableCell align="center" sx={{ ...TABLE_HEADER_SX, width: 130 }}>타입</TableCell>
                      <TableCell align="center" sx={{ ...TABLE_HEADER_SX, width: 210 }}>기본옵션</TableCell>
                      <TableCell align="right" sx={{ ...TABLE_HEADER_SX, width: 110 }}>해당 세대</TableCell>
                      <TableCell align="right" sx={{ ...TABLE_HEADER_SX, width: 130 }}>기본물량</TableCell>
                      <TableCell align="center" sx={{ ...TABLE_HEADER_SX, width: 90 }}>단위</TableCell>
                      <TableCell align="right" sx={{ ...TABLE_HEADER_SX, width: 140 }}>소계</TableCell>
                      <TableCell align="right" sx={{ ...TABLE_HEADER_SX, width: 130 }}>증감물량</TableCell>
                      <TableCell align="right" sx={TABLE_HEADER_SX}>자동 합계</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activeProcess.baseRows.map((row) => (
                      <TableRow key={`base-${row.typeName}-${row.basisOption}`} hover>
                        <TableCell align="center" sx={TABLE_BODY_SX}>기본</TableCell>
                        <TableCell align="center" sx={{ ...TABLE_BODY_SX, fontWeight: 800 }}>{row.typeName}</TableCell>
                        <TableCell align="center" sx={TABLE_BODY_SX}>{row.basisOption || '-'}</TableCell>
                        <TableCell align="right" sx={TABLE_BODY_SX}>{row.unitCount.toLocaleString()}세대</TableCell>
                        <TableCell align="right" sx={{ ...TABLE_BODY_SX, color: hasQuantity(row.quantity) ? '#0f172a' : '#dc2626', fontWeight: 850 }}>
                          {hasQuantity(row.quantity) ? formatQuantity(row.quantity) : '미입력'}
                        </TableCell>
                        <TableCell align="center" sx={TABLE_BODY_SX}>{row.unit}</TableCell>
                        <TableCell align="right" sx={{ ...TABLE_BODY_SX, fontWeight: 850 }}>
                          {formatQuantity((Number(row.quantity) || 0) * row.unitCount)}
                        </TableCell>
                        <TableCell align="right" sx={{ ...TABLE_BODY_SX, fontWeight: 850 }}>
                          {formatQuantity(Number(row.adjustmentQuantity) || 0)}
                        </TableCell>
                        <TableCell align="right" sx={{ ...TABLE_BODY_SX, fontWeight: 850 }}>
                          {formatQuantity(
                            (Number(row.quantity) || 0) * row.unitCount +
                              (Number(row.adjustmentQuantity) || 0),
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Typography sx={{ mt: 2, mb: 0.65, color: '#0f766e', fontSize: '0.75rem', fontWeight: 900 }}>
                  타입·유상옵션별 증감물량
                </Typography>
                {activeProcess.optionRows.length === 0 ? (
                  <Alert severity="info" variant="outlined">
                    공정별옵션연결에서 이 공정에 연결할 유상옵션을 선택하면 증감물량 행이 생성됩니다.
                  </Alert>
                ) : (
                  <Table size="small" sx={{ tableLayout: 'fixed' }}>
                    <TableHead>
                      <TableRow>
                        <TableCell align="center" sx={{ ...TABLE_HEADER_SX, width: 80 }}>구분</TableCell>
                        <TableCell align="center" sx={{ ...TABLE_HEADER_SX, width: 130 }}>타입</TableCell>
                        <TableCell align="center" sx={{ ...TABLE_HEADER_SX, width: 210 }}>유상옵션</TableCell>
                        <TableCell align="right" sx={{ ...TABLE_HEADER_SX, width: 110 }}>해당 세대</TableCell>
                        <TableCell align="right" sx={{ ...TABLE_HEADER_SX, width: 130 }}>증감물량</TableCell>
                        <TableCell align="center" sx={{ ...TABLE_HEADER_SX, width: 90 }}>단위</TableCell>
                        <TableCell align="right" sx={{ ...TABLE_HEADER_SX, width: 140 }}>소계</TableCell>
                        <TableCell sx={{ ...TABLE_HEADER_SX, width: 130 }} />
                        <TableCell sx={TABLE_HEADER_SX} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {activeProcess.optionRows.map((row) => (
                        <TableRow key={`option-${row.typeName}-${row.optionName}`} hover>
                          <TableCell align="center" sx={TABLE_BODY_SX}>옵션증감</TableCell>
                          <TableCell align="center" sx={{ ...TABLE_BODY_SX, fontWeight: 800 }}>{row.typeName}</TableCell>
                          <TableCell align="center" sx={TABLE_BODY_SX}>{row.optionName}</TableCell>
                          <TableCell align="right" sx={TABLE_BODY_SX}>{row.unitCount.toLocaleString()}세대</TableCell>
                          <TableCell align="right" sx={{ ...TABLE_BODY_SX, color: hasQuantity(row.quantity) ? '#0f172a' : '#dc2626', fontWeight: 850 }}>
                            {hasQuantity(row.quantity) ? formatQuantity(row.quantity) : '미입력'}
                          </TableCell>
                          <TableCell align="center" sx={TABLE_BODY_SX}>{row.unit}</TableCell>
                          <TableCell align="right" sx={{ ...TABLE_BODY_SX, fontWeight: 850 }}>
                            {formatQuantity((Number(row.quantity) || 0) * row.unitCount)}
                          </TableCell>
                          <TableCell sx={TABLE_BODY_SX} />
                          <TableCell sx={TABLE_BODY_SX} />
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Box>
            </TableContainer>
          </>
        )}
      </Paper>

      <Dialog
        open={gridDialogOpen}
        onClose={() => setGridDialogOpen(false)}
        fullWidth
        maxWidth={false}
        slotProps={{
          paper: {
            sx: {
              width: '96vw',
              maxWidth: '96vw',
              height: '90vh',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            },
          },
        }}
      >
        <DialogTitle sx={{ py: 1.2, px: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Box sx={{ minWidth: 220, flex: 1 }}>
              <Typography sx={{ color: '#0f172a', fontSize: '1rem', fontWeight: 900 }}>
                공정별 세대물량 골구도
              </Typography>
              <Typography sx={{ mt: 0.15, color: '#64748b', fontSize: '0.68rem' }}>
                세대물량 = 해당 세대의 기본물량 + 연결된 선택옵션 증감물량
              </Typography>
            </Box>
            <Chip size="small" color="primary" label={gridProcess?.processName || '-'} />
            <Chip
              size="small"
              variant="outlined"
              label={`계산 ${gridUnitValues.completeCount.toLocaleString()}/${gridUnitValues.rows.length.toLocaleString()}세대`}
            />
            <Chip
              size="small"
              variant="outlined"
              color={gridUnitValues.missingCount > 0 ? 'warning' : 'default'}
              label={`총 물량 ${formatQuantity(gridUnitValues.totalQuantity)}`}
            />
          </Box>
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            p: 0,
            flex: '1 1 auto',
            height: 0,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: '#f8fafc',
          }}
        >
          <Paper
            square
            elevation={0}
            sx={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              pr: 1,
              borderBottom: '1px solid #cbd5e1',
            }}
          >
            <Tabs
              value={gridProcess?.processName || false}
              onChange={(_, value) => setGridProcessName(value)}
              variant="scrollable"
              scrollButtons="auto"
              aria-label="골구도 표시 공정 선택"
              sx={{
                flex: 1,
                minWidth: 0,
                minHeight: 38,
                '& .MuiTab-root': {
                  minHeight: 38,
                  py: 0.5,
                  px: 1.7,
                  fontSize: '0.72rem',
                  fontWeight: 800,
                },
              }}
            >
              {definitions.processes.map((process) => (
                <Tab
                  key={`grid-${process.processName}`}
                  value={process.processName}
                  label={process.processName}
                />
              ))}
            </Tabs>
            <Stack direction="row" spacing={0.15} alignItems="center" sx={{ flex: '0 0 auto' }}>
              <Tooltip title="축소">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => changeGridZoom(-GRID_ZOOM_STEP)}
                    disabled={gridZoom <= GRID_ZOOM_MIN}
                    aria-label="골구도 축소"
                  >
                    <Typography sx={{ fontSize: 18, fontWeight: 900, lineHeight: 1 }}>−</Typography>
                  </IconButton>
                </span>
              </Tooltip>
              <Typography sx={{ minWidth: 40, textAlign: 'center', color: '#475569', fontSize: '0.67rem', fontWeight: 900 }}>
                {Math.round(gridZoom * 100)}%
              </Typography>
              <Tooltip title="확대">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => changeGridZoom(GRID_ZOOM_STEP)}
                    disabled={gridZoom >= GRID_ZOOM_MAX}
                    aria-label="골구도 확대"
                  >
                    <Typography sx={{ fontSize: 18, fontWeight: 900, lineHeight: 1 }}>+</Typography>
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="화면에 맞춤">
                <IconButton size="small" onClick={fitGridView} aria-label="골구도 화면 맞춤">
                  <CenterFocusStrongRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.4 }} />
              <Tooltip title="PDF 저장(A4 가로 1장)">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleGridOutput('pdf')}
                  aria-label="골구도 PDF 저장"
                >
                  <PictureAsPdfRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="인쇄(A4 가로 1장)">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => handleGridOutput('print')}
                  aria-label="골구도 인쇄"
                >
                  <PrintRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Paper>

          {buildingEntries.length === 0 ? (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography color="text.secondary">표시할 현장 골구도 정보가 없습니다.</Typography>
            </Box>
          ) : (
            <Box
              ref={gridViewportRef}
              onWheel={handleGridWheel}
              onPointerDown={handleGridPointerDown}
              onPointerMove={handleGridPointerMove}
              onPointerUp={finishGridPan}
              onPointerCancel={finishGridPan}
              sx={{
                position: 'relative',
                flex: '1 1 0',
                height: 0,
                minHeight: 0,
                overflow: 'hidden',
                bgcolor: '#f8fafc',
                cursor: gridPanning ? 'grabbing' : 'grab',
                touchAction: 'none',
                userSelect: gridPanning ? 'none' : 'auto',
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  transform: `translate(${gridPan.x}px, ${gridPan.y}px) scale(${gridZoom})`,
                  transformOrigin: '0 0',
                  willChange: 'transform',
                }}
              >
                <Box
                  ref={gridContentRef}
                  sx={{
                    width: 'max-content',
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 2.5,
                    p: 2,
                    bgcolor: '#f8fafc',
                  }}
                >
                  {buildingEntries.map(([buildingName, config]) => (
                    <BuildingGrid
                      key={`household-quantity-grid-${buildingName}`}
                      buildingName={buildingName}
                      config={config}
                      readOnly
                      cellDisplayData={gridCellDisplayData}
                    />
                  ))}
                </Box>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 1.5, py: 1 }}>
          <Button onClick={() => setGridDialogOpen(false)}>닫기</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={downloadDialogOpen}
        onClose={() => !excelLoading && !saving && setDownloadDialogOpen(false)}
        fullWidth
        maxWidth="md"
        slotProps={{ paper: { sx: { height: '72vh', minHeight: 520 } } }}
      >
        <DialogTitle sx={{ pb: 1, fontSize: '1rem', fontWeight: 900 }}>
          {configurationDialogMode === 'connections'
            ? '공정별 옵션 연결'
            : '세대물량 Excel 설정'}
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, minHeight: 0 }}>
          <Alert severity="info" sx={{ m: 1.25 }}>
            단열과 합지는 단열 옵션현황을 기본값으로 자동 연결합니다. 두 공정을 포함해 물량에 영향을 주는 유상옵션은 추가로 선택할 수 있습니다.
          </Alert>
          <Box sx={{ height: 'calc(100% - 76px)', minHeight: 0, display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)' }}>
            <Box sx={{ minHeight: 0, overflowY: 'auto', p: 1 }}>
              {workingProcessNames.map((processName) => {
                const selectedCount = workingSelections[processName]?.length || 0;
                return (
                  <ButtonBase
                    key={processName}
                    onClick={() => setDialogProcess(processName)}
                    sx={{
                      width: '100%',
                      minHeight: 40,
                      mb: 0.5,
                      px: 1,
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 0.7,
                      textAlign: 'left',
                      border: '1px solid',
                      borderColor: dialogProcess === processName ? '#2563eb' : '#e2e8f0',
                      borderRadius: 1,
                      bgcolor: dialogProcess === processName ? '#eff6ff' : '#ffffff',
                    }}
                  >
                    <Typography sx={{ fontSize: '0.73rem', fontWeight: 850 }}>{processName}</Typography>
                    <Chip
                      size="small"
                      color={['단열', '합지'].includes(processName) ? 'primary' : 'default'}
                      label={['단열', '합지'].includes(processName)
                        ? `자동${selectedCount ? ` + ${selectedCount}개` : ''}`
                        : `${selectedCount}개`}
                      sx={{ height: 21, fontSize: '0.62rem' }}
                    />
                  </ButtonBase>
                );
              })}

              {addingProcess ? (
                <Box
                  sx={{
                    mt: 0.8,
                    p: 0.8,
                    border: '1px solid #93c5fd',
                    borderRadius: 1,
                    bgcolor: '#eff6ff',
                  }}
                >
                  <TextField
                    autoFocus
                    fullWidth
                    size="small"
                    label="추가 공정명"
                    value={newProcessName}
                    onChange={(event) => {
                      setNewProcessName(event.target.value);
                      setProcessAddError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAddWorkingProcess();
                      }
                    }}
                    inputProps={{ maxLength: 20 }}
                  />
                  {processAddError && (
                    <Typography
                      sx={{ mt: 0.45, color: '#dc2626', fontSize: '0.62rem' }}
                    >
                      {processAddError}
                    </Typography>
                  )}
                  <Stack
                    direction="row"
                    spacing={0.5}
                    justifyContent="flex-end"
                    sx={{ mt: 0.7 }}
                  >
                    <Button
                      size="small"
                      onClick={() => {
                        setAddingProcess(false);
                        setNewProcessName('');
                        setProcessAddError('');
                      }}
                    >
                      취소
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={handleAddWorkingProcess}
                    >
                      추가
                    </Button>
                  </Stack>
                </Box>
              ) : (
                <Button
                  fullWidth
                  size="small"
                  variant="outlined"
                  startIcon={<AddCircleOutlineRoundedIcon />}
                  onClick={() => {
                    setAddingProcess(true);
                    setProcessAddError('');
                  }}
                  sx={{ mt: 0.8, minHeight: 36, borderStyle: 'dashed' }}
                >
                  추가하기
                </Button>
              )}
            </Box>

            <Box sx={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e2e8f0' }}>
              <Box sx={{ px: 1.5, py: 1.1, bgcolor: '#f8fafc' }}>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 900 }}>{dialogProcess || '공정 선택'}</Typography>
                <Typography sx={{ mt: 0.2, color: '#64748b', fontSize: '0.65rem' }}>
                  {['단열', '합지'].includes(dialogProcess)
                    ? '단열 옵션현황의 타입·옵션 조합을 자동으로 사용하고, 필요한 유상옵션을 추가 연결합니다.'
                    : '이 공정 물량에 영향을 주는 유상옵션을 선택합니다.'}
                </Typography>
              </Box>
              <Divider />
              <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', p: 1 }}>
                {['단열', '합지'].includes(dialogProcess) && (
                  <Alert severity="success" variant="outlined" sx={{ mb: 0.7 }}>
                    단열 옵션현황과 타입정보를 조합한 기본물량 행은 자동 생성됩니다. 아래 선택옵션은 필요한 경우에만 추가 연결하세요.
                  </Alert>
                )}
                {selectionDocument.optionNames.length === 0 ? (
                  <Alert severity="warning" variant="outlined">
                    옵션현황(선택)에 등록된 유상옵션이 없습니다. 기본물량만 포함된 양식이 생성됩니다.
                  </Alert>
                ) : (
                  selectionDocument.optionNames.map((optionName) => {
                    const checked = Boolean(workingSelections[dialogProcess]?.includes(optionName));
                    return (
                      <ButtonBase
                        key={optionName}
                        onClick={() => toggleWorkingOption(dialogProcess, optionName)}
                        sx={{
                          width: '100%',
                          minHeight: 38,
                          px: 0.6,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          textAlign: 'left',
                          borderBottom: '1px solid #f1f5f9',
                          '&:hover': { bgcolor: '#f8fafc' },
                        }}
                      >
                        <Checkbox size="small" checked={checked} tabIndex={-1} disableRipple />
                        <Typography sx={{ fontSize: '0.72rem' }}>{optionName}</Typography>
                      </ButtonBase>
                    );
                  })
                )}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 1.5, py: 1 }}>
          <Button
            onClick={() => setDownloadDialogOpen(false)}
            disabled={excelLoading || saving}
          >
            취소
          </Button>
          {configurationDialogMode === 'connections' ? (
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveRoundedIcon />}
              onClick={handleSaveOptionConnections}
              disabled={saving || excelLoading}
            >
              연결 저장
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={excelLoading ? <CircularProgress size={14} color="inherit" /> : <DownloadRoundedIcon />}
              onClick={handleDownloadExcel}
              disabled={excelLoading || saving}
            >
              선택 완료 및 다운로드
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4200}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>
            {toast.text}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
