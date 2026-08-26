// v52.48.5.44.39 증감 부호 계산 수정·상하 표 9열 정렬
// v52.48.5.44.38 하단 옵션 증감물량 타입별 상단 자동집계
// v52.48.5.44.37 기본물량 소계·공제물량·자동합계 및 표 정렬
// v52.48.5.44.34 공정별옵션연결 별도 설정·다운로드 연결정보 즉시 저장
// v52.48.5.44.33 공정 탭 배율 오차 수정·기본옵션 명칭 통일
// v52.48.5.44.32 기본 공정 6개·사용자 공정 추가
// v52.48.5.44.31 세대물량관리 단일화·공정별 갑지·Excel 연동
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, ButtonBase, Checkbox, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider, Paper,
  Snackbar, Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import SystemPageTitle from '../components/SystemPageTitle.jsx';
import SystemRefreshButton from '../components/SystemRefreshButton.jsx';
import { supabase } from '../supabaseClient';
import { normalizeSelectionOptionDocument } from '../utils/optionSelectionExcel.js';
import {
  createHouseholdQuantityDefinitions,
  createHouseholdQuantityDocumentFromDefinitions,
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
  const fileInputRef = useRef(null);

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
    setDialogProcess(
      safeProcessOptions.find((processName) => processName !== '단열') ||
      safeProcessOptions[0] || '',
    );
    setAddingProcess(false);
    setNewProcessName('');
    setProcessAddError('');
    setConfigurationDialogMode(mode);
    setDownloadDialogOpen(true);
  };

  const openOptionConnectionDialog = () => {
    openConfigurationDialog('connections');
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
                  {activeProcess.isInsulation
                    ? '타입과 단열 옵션현황 조합별 기본물량'
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
                    {activeProcess.isInsulation
                      ? '단열공정은 상단의 타입·단열옵션별 기본물량을 사용합니다.'
                      : '공정별옵션연결에서 이 공정에 연결할 유상옵션을 선택하면 증감물량 행이 생성됩니다.'}
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
        open={downloadDialogOpen}
        onClose={() => !excelLoading && !saving && setDownloadDialogOpen(false)}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { height: '72vh', minHeight: 520 } }}
      >
        <DialogTitle sx={{ pb: 1, fontSize: '1rem', fontWeight: 900 }}>
          {configurationDialogMode === 'connections'
            ? '공정별 옵션 연결'
            : '세대물량 Excel 설정'}
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, minHeight: 0 }}>
          <Alert severity="info" sx={{ m: 1.25 }}>
            단열은 단열 옵션현황이 자동 연결됩니다. 다른 공정은 물량에 영향을 주는 유상옵션을 선택하세요.
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
                      color={processName === '단열' ? 'primary' : 'default'}
                      label={processName === '단열' ? '자동' : `${selectedCount}개`}
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
                  {dialogProcess === '단열'
                    ? '단열 옵션현황의 타입·옵션 조합을 자동으로 사용합니다.'
                    : '이 공정 물량에 영향을 주는 유상옵션을 선택합니다.'}
                </Typography>
              </Box>
              <Divider />
              <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', p: 1 }}>
                {dialogProcess === '단열' ? (
                  <Alert severity="success" variant="outlined">
                    단열 옵션현황에 등록된 세대별 옵션과 현장관리의 타입정보를 조합해 Excel 기본물량 행을 자동 생성합니다.
                  </Alert>
                ) : selectionDocument.optionNames.length === 0 ? (
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
