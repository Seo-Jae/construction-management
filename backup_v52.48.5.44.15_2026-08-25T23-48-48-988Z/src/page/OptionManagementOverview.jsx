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
  Chip,
  CircularProgress,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import BuildingGrid from '../BuildingGrid.jsx';
import SystemPageTitle from '../components/SystemPageTitle.jsx';
import SystemRefreshButton from '../components/SystemRefreshButton.jsx';
import { supabase } from '../supabaseClient';
import { countUniqueUnits } from '../utils/buildingUnits.js';
import {
  parseInsulationOptionWorkbookFile,
  saveInsulationOptionWorkbook,
} from '../utils/optionInsulationExcel.js';

const MODE_CONFIG = {
  insulation: {
    title: '옵션현황(단열)',
    help: '현장 골구도를 내려받아 단열 옵션을 작성한 뒤 다시 업로드합니다.',
    category: '단열 옵션',
    accent: '#0284c7',
  },
  selection: {
    title: '옵션현황(선택)',
    help: '현장 골구도를 기준으로 세대별 선택 옵션 현황을 관리합니다.',
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
  const [loading, setLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [sourceFileName, setSourceFileName] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [message, setMessage] = useState(null);
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  const pageConfig = MODE_CONFIG[mode] || MODE_CONFIG.insulation;
  const isInsulation = mode === 'insulation';
  const isComparison = mode === 'comparison';

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

  const displayData = useMemo(() => {
    if (!isInsulation) return {};
    return Object.entries(optionData).reduce((result, [cellKey, row]) => {
      const value = String(row?.value || '').trim();
      if (!value) return result;
      result[cellKey] = {
        label: value,
        backgroundColor: '#ffffff',
        borderColor: '#cbd5e1',
        color: '#334155',
        title: `${cellKey} · ${value}`,
      };
      return result;
    }, {});
  }, [isInsulation, optionData]);

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

  const loadInsulationData = useCallback(async () => {
    if (!isInsulation || !projectName) return;
    setLoading(true);
    setMessage(null);

    try {
      const { data, error } = await supabase
        .from('option_status_documents')
        .select('unit_values, source_file_name, updated_at')
        .eq('project_name', projectName)
        .eq('option_category', 'insulation')
        .maybeSingle();

      if (error) throw error;
      setOptionData(normalizeOptionData(data?.unit_values));
      setSourceFileName(data?.source_file_name || '');
      setSavedAt(data?.updated_at || '');
      setHasPendingChanges(false);
      setSchemaMissing(false);
    } catch (error) {
      if (isMissingOptionTableError(error)) {
        setSchemaMissing(true);
        setOptionData({});
        setMessage({
          severity: 'warning',
          text: '옵션 저장용 Supabase 표가 아직 없습니다. 제공된 SQL을 먼저 실행하면 업로드 결과를 저장할 수 있습니다.',
        });
      } else {
        console.error('단열 옵션 현황 불러오기 오류:', error);
        setMessage({
          severity: 'error',
          text: `단열 옵션 현황을 불러오지 못했습니다: ${
            error?.message || '알 수 없는 오류'
          }`,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [isInsulation, projectName]);

  useEffect(() => {
    loadInsulationData();
  }, [loadInsulationData, refreshKey]);

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
      const rowCount = await saveInsulationOptionWorkbook({
        projectName,
        buildingConfigs,
        optionData,
      });
      setToast({
        severity: 'success',
        text: `현장 골구도 ${rowCount.toLocaleString()}세대를 단열 옵션 엑셀로 내려받았습니다.`,
      });
    } catch (error) {
      console.error('단열 옵션 골구도 엑셀 다운로드 오류:', error);
      setToast({
        severity: 'error',
        text: `골구도 엑셀을 만들지 못했습니다: ${
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
      const result = await parseInsulationOptionWorkbookFile({
        file,
        projectName,
        buildingConfigs,
      });
      setOptionData(result.unitValues);
      setSourceFileName(file.name);
      setHasPendingChanges(true);
      setToast({
        severity: 'success',
        text: `전체 동 골구도에서 단열 옵션 ${result.filledRows.toLocaleString()}세대를 불러왔습니다. 화면 확인 후 저장해주세요.`,
      });
    } catch (error) {
      console.error('단열 옵션 골구도 엑셀 업로드 오류:', error);
      setToast({
        severity: 'error',
        text: `골구도 엑셀을 불러오지 못했습니다: ${
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
        option_category: 'insulation',
        unit_values: optionData,
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
        text: `단열 옵션 ${Object.keys(optionData).length.toLocaleString()}세대를 저장했습니다.`,
      });
    } catch (error) {
      console.error('단열 옵션 현황 저장 오류:', error);
      if (isMissingOptionTableError(error)) setSchemaMissing(true);
      setToast({
        severity: 'error',
        text: `단열 옵션 현황을 저장하지 못했습니다: ${
          error?.message || '알 수 없는 오류'
        }`,
      });
    } finally {
      setSaving(false);
    }
  };

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
          <Chip
            size="small"
            label="골구도 기준"
            sx={{
              height: HEADER_CONTROL_HEIGHT,
              bgcolor: `${pageConfig.accent}16`,
              border: `1px solid ${pageConfig.accent}66`,
              color: pageConfig.accent,
              fontWeight: 800,
              '& .MuiChip-label': { px: 1.2 },
            }}
          />
          <Chip
            size="small"
            variant="outlined"
            label={pageConfig.category}
            sx={{
              height: HEADER_CONTROL_HEIGHT,
              '& .MuiChip-label': { px: 1.2 },
            }}
          />

          {isInsulation ? (
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
                sx={{ height: HEADER_CONTROL_HEIGHT, whiteSpace: 'nowrap' }}
              >
                골구도 다운로드
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="success"
                startIcon={<UploadFileRoundedIcon />}
                onClick={() => fileInputRef.current?.click()}
                disabled={excelLoading || buildingEntries.length === 0}
                sx={{ height: HEADER_CONTROL_HEIGHT, whiteSpace: 'nowrap' }}
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
                sx={{ height: HEADER_CONTROL_HEIGHT, whiteSpace: 'nowrap' }}
              >
                저장
              </Button>
            </>
          ) : isComparison ? (
            <>
              <TextField
                size="small"
                label="기준 옵션"
                value=""
                placeholder="비교 기준 옵션"
                disabled
                sx={{ minWidth: 170 }}
              />
              <TextField
                size="small"
                label="비교 옵션"
                value=""
                placeholder="비교할 옵션"
                disabled
                sx={{ minWidth: 170 }}
              />
            </>
          ) : (
            <TextField
              size="small"
              label="옵션 항목"
              value=""
              placeholder="옵션 항목 연결 예정"
              disabled
              sx={{ minWidth: 210 }}
            />
          )}
        </Stack>

        <SystemRefreshButton onClick={handleRefresh} label={`${pageConfig.title} 새로고침`} />
      </Paper>

      {!isInsulation && (
        <Alert severity="info" sx={{ py: 0.35 }}>
          메뉴와 골구도 기본화면을 구성했습니다. 다음 단계에서 옵션 항목,
          세대별 선택값, 색상 및 저장 기능을 연결합니다.
        </Alert>
      )}

      {message && <Alert severity={message.severity}>{message.text}</Alert>}

      <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" alignItems="center">
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
        {isInsulation && (
          <>
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
          </>
        )}
        {isComparison && <Chip size="small" color="warning" label="비교 옵션 미선택" />}
      </Stack>

      {isInsulation && optionLegend.length > 0 && (
        <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap">
          {optionLegend.map((row) => (
            <Chip
              key={row.value}
              size="small"
              variant="outlined"
              label={`${row.value} ${row.count.toLocaleString()}세대`}
              sx={{
                bgcolor: '#ffffff',
                color: '#334155',
                borderColor: '#cbd5e1',
                fontWeight: 800,
              }}
            />
          ))}
        </Stack>
      )}

      <Paper
        variant="outlined"
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflowX: 'auto',
          overflowY: 'hidden',
          p: 0.75,
          borderColor: 'transparent',
          boxShadow: 'none',
          bgcolor: '#f1f5f9',
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
              {excelLoading ? '엑셀을 처리하는 중입니다.' : '단열 옵션을 불러오는 중입니다.'}
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
            <Typography color="text.secondary">이 현장에 등록된 동 설정이 없습니다.</Typography>
          </Box>
        ) : (
          <Box
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
                cellDisplayData={isInsulation ? displayData : {}}
              />
            ))}
          </Box>
        )}
      </Paper>

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
