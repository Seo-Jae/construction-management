import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Alert,
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
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import AssignmentLateRoundedIcon from '@mui/icons-material/AssignmentLateRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EngineeringOutlinedIcon from '@mui/icons-material/EngineeringOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import { supabase } from '../supabaseClient';

const COMPLETE_CONTRACT_STATUSES = new Set([
  'manager_confirmed',
  'excluded',
]);

const pad2 = (value) => String(value).padStart(2, '0');

const getKoreaDateKeys = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const values = {};

  formatter.formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') {
      values[part.type] = Number(part.value);
    }
  });

  const yyyy = String(values.year);
  const mm = pad2(values.month);
  const dd = pad2(values.day);
  const yy = yyyy.slice(2);

  return {
    monthKey: `${yyyy}-${mm}`,
    monthStartReportKey: `${yy}.${mm}.01`,
    monthEndReportKey: `${yy}.${mm}.31`,
    reportDateKey: `${yy}.${mm}.${dd}`,
    progressDateKey: `${yyyy}-${mm}-${dd}`,
    displayDate: `${yyyy}.${mm}.${dd}`,
  };
};

const normalizeName = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();

const hasMeaningfulDailyReport = (report) => {
  if (!report) return false;

  const workers = Array.isArray(report.workers)
    ? report.workers
    : [];
  const tasks = Array.isArray(report.tasks)
    ? report.tasks
    : [];

  const hasWorker = workers.some((worker) => {
    const day = Number(worker?.day) || 0;
    const night = Number(worker?.night) || 0;

    return Boolean(
      String(worker?.name || '').trim() ||
        String(worker?.job || '').trim() ||
        String(worker?.process || '').trim() ||
        String(worker?.location || '').trim() ||
        String(
          worker?.workContent ||
            worker?.work_content ||
            '',
        ).trim() ||
        day > 0 ||
        night > 0,
    );
  });

  const hasTask = tasks.some((task) =>
    Boolean(
      String(
        task?.taskName ?? task?.task_name ?? '',
      ).trim() ||
        String(task?.amount ?? '').trim(),
    ),
  );

  return Boolean(
    hasWorker ||
      hasTask ||
      String(
        report.today_task ?? report.todayTask ?? '',
      ).trim() ||
      String(
        report.tomorrow_task ?? report.tomorrowTask ?? '',
      ).trim(),
  );
};

const getMonthlyWorkerNames = (reportRows) => {
  const names = new Set();

  (reportRows || []).forEach((report) => {
    const workers = Array.isArray(report?.workers)
      ? report.workers
      : [];

    workers.forEach((worker) => {
      const normalizedName = normalizeName(worker?.name);

      if (normalizedName) {
        names.add(normalizedName);
      }
    });
  });

  return names;
};

const getRequirementName = (row) =>
  normalizeName(
    row?.normalized_name ||
      row?.name ||
      row?.worker_name ||
      '',
  );

const initialSummary = {
  laborMissingCount: null,
  dailyReportWritten: null,
  progressWritten: null,
};

function WorkAlertRow({
  icon,
  title,
  statusLabel,
  complete,
  loading,
  onMove,
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.4, sm: 1.7 },
        borderColor: complete ? '#bbf7d0' : '#fed7aa',
        bgcolor: complete ? '#f0fdf4' : '#fff7ed',
        boxShadow: 'none',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.2,
        }}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            flexShrink: 0,
            borderRadius: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: complete ? '#15803d' : '#c2410c',
            bgcolor: complete ? '#dcfce7' : '#ffedd5',
          }}
        >
          {icon}
        </Box>

        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography
            sx={{
              color: '#0f172a',
              fontSize: { xs: '0.87rem', sm: '0.93rem' },
              fontWeight: 900,
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </Typography>

          {loading ? (
            <Box
              sx={{
                mt: 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: 0.7,
                color: '#64748b',
              }}
            >
              <CircularProgress size={13} thickness={5} />
              <Typography sx={{ fontSize: '0.74rem' }}>
                확인 중...
              </Typography>
            </Box>
          ) : (
            <Chip
              size="small"
              label={statusLabel}
              sx={{
                mt: 0.55,
                height: 23,
                color: complete ? '#166534' : '#9a3412',
                bgcolor: complete ? '#dcfce7' : '#ffedd5',
                fontSize: '0.7rem',
                fontWeight: 900,
              }}
            />
          )}
        </Box>

        <Button
          variant={complete ? 'outlined' : 'contained'}
          size="small"
          endIcon={<ArrowForwardRoundedIcon />}
          onClick={onMove}
          sx={{
            minWidth: 82,
            flexShrink: 0,
            whiteSpace: 'nowrap',
            fontWeight: 900,
            boxShadow: 'none',
          }}
        >
          이동
        </Button>
      </Box>
    </Paper>
  );
}

export default function MainWorkAlertDialog({
  open,
  projectName,
  onClose,
  onNavigate,
}) {
  const dateKeys = useMemo(() => getKoreaDateKeys(), []);
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadSummary = useCallback(async () => {
    if (!projectName) {
      setSummary(initialSummary);
      return;
    }

    setLoading(true);
    setErrorMessage('');

    const [reportResult, progressResult, contractResult] =
      await Promise.all([
        supabase
          .from('daily_reports')
          .select(
            'date, workers, tasks, today_task, tomorrow_task',
          )
          .eq('project_name', projectName)
          .gte('date', dateKeys.monthStartReportKey)
          .lte('date', dateKeys.monthEndReportKey)
          .order('date', { ascending: true }),
        supabase
          .from('unit_progress')
          .select('building', {
            count: 'exact',
            head: true,
          })
          .eq('project_name', projectName)
          .eq('completion_date', dateKeys.progressDateKey)
          .neq('status', '작업전'),
        supabase.rpc('labor_get_contract_month', {
          p_project_name: projectName,
          p_contract_month: dateKeys.monthKey,
        }),
      ]);

    const errorMessages = [];

    if (reportResult.error) {
      console.error(
        'Main 알림 출력일보 조회 오류:',
        reportResult.error,
      );
      errorMessages.push('출력일보');
    }

    if (progressResult.error) {
      console.error(
        'Main 알림 공정입력 조회 오류:',
        progressResult.error,
      );
      errorMessages.push('공종별 현황');
    }

    if (contractResult.error) {
      console.error(
        'Main 알림 근로계약 조회 오류:',
        contractResult.error,
      );
      errorMessages.push('근로계약서');
    }

    const reportRows = reportResult.error
      ? []
      : reportResult.data || [];
    const todayReport = reportRows.find(
      (row) => row?.date === dateKeys.reportDateKey,
    );

    let laborMissingCount = null;

    if (!contractResult.error && !reportResult.error) {
      const requirementRows = contractResult.data || [];
      const monthlyWorkerNames = getMonthlyWorkerNames(reportRows);
      const requirementNames = new Set(
        requirementRows
          .map(getRequirementName)
          .filter(Boolean),
      );
      const unsyncedWorkerCount = Array.from(
        monthlyWorkerNames,
      ).filter(
        (workerName) => !requirementNames.has(workerName),
      ).length;
      const pendingRequirementCount = requirementRows.filter(
        (row) =>
          !COMPLETE_CONTRACT_STATUSES.has(row?.status),
      ).length;

      laborMissingCount =
        pendingRequirementCount + unsyncedWorkerCount;
    }

    setSummary({
      laborMissingCount,
      dailyReportWritten: reportResult.error
        ? null
        : hasMeaningfulDailyReport(todayReport),
      progressWritten: progressResult.error
        ? null
        : Number(progressResult.count || 0) > 0,
    });

    if (errorMessages.length > 0) {
      setErrorMessage(
        `${errorMessages.join('·')} 상태를 불러오지 못했습니다. 각 업무 화면에서 직접 확인해주세요.`,
      );
    }

    setLoading(false);
  }, [dateKeys, projectName]);

  useEffect(() => {
    if (open) {
      loadSummary();
    }
  }, [loadSummary, open]);

  const handleMove = (view) => {
    if (typeof onClose === 'function') {
      onClose();
    }

    if (typeof onNavigate === 'function') {
      onNavigate(view);
    }
  };

  const rows = [
    {
      key: 'labor',
      icon: <DescriptionOutlinedIcon fontSize="small" />,
      title: '근로계약서작성',
      statusLabel:
        summary.laborMissingCount === null
          ? '확인 필요'
          : `${summary.laborMissingCount.toLocaleString()}건 미작성`,
      complete: summary.laborMissingCount === 0,
      view: 'labor-contract',
    },
    {
      key: 'daily',
      icon: <AssignmentLateRoundedIcon fontSize="small" />,
      title: '출력일보작성',
      statusLabel:
        summary.dailyReportWritten === null
          ? '확인 필요'
          : summary.dailyReportWritten
            ? '작성완료'
            : '미작성',
      complete: summary.dailyReportWritten === true,
      view: 'daily',
    },
    {
      key: 'progress',
      icon: <EngineeringOutlinedIcon fontSize="small" />,
      title: '공종별 현황 입력',
      statusLabel:
        summary.progressWritten === null
          ? '확인 필요'
          : summary.progressWritten
            ? '입력완료'
            : '미작성',
      complete: summary.progressWritten === true,
      view: 'progress-input',
    },
  ];

  return (
    <Dialog
      open={Boolean(open)}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="main-work-alert-title"
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle
        id="main-work-alert-title"
        sx={{
          px: { xs: 2, sm: 2.5 },
          py: 1.8,
          bgcolor: '#0f172a',
          color: '#ffffff',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.1,
          }}
        >
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 1.4,
              bgcolor: 'rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FactCheckOutlinedIcon />
          </Box>

          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography
              component="div"
              sx={{ fontSize: '1.05rem', fontWeight: 900 }}
            >
              미작성 업무 알림
            </Typography>
            <Typography
              component="div"
              noWrap
              sx={{
                mt: 0.15,
                color: '#cbd5e1',
                fontSize: '0.72rem',
              }}
            >
              {projectName} · {dateKeys.displayDate} 기준
            </Typography>
          </Box>

          <Tooltip title="닫기">
            <IconButton
              size="small"
              onClick={onClose}
              sx={{ color: '#ffffff' }}
            >
              <CloseRoundedIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogTitle>

      <DialogContent
        sx={{ px: { xs: 1.6, sm: 2.5 }, py: 2.2 }}
      >
        <Typography
          sx={{
            mb: 1.4,
            color: '#475569',
            fontSize: '0.78rem',
            lineHeight: 1.6,
          }}
        >
          현재 처리 상태를 확인하고 필요한 화면으로 바로 이동할 수 있습니다.
        </Typography>

        {errorMessage && (
          <Alert severity="warning" sx={{ mb: 1.3 }}>
            {errorMessage}
          </Alert>
        )}

        <Stack spacing={1}>
          {rows.map((row) => (
            <WorkAlertRow
              key={row.key}
              icon={row.icon}
              title={row.title}
              statusLabel={row.statusLabel}
              complete={row.complete}
              loading={loading}
              onMove={() => handleMove(row.view)}
            />
          ))}
        </Stack>
      </DialogContent>

      <Divider />

      <DialogActions
        sx={{
          px: { xs: 1.6, sm: 2.5 },
          py: 1.4,
          justifyContent: 'space-between',
        }}
      >
        <Button
          size="small"
          startIcon={
            loading ? (
              <CircularProgress size={14} />
            ) : (
              <RefreshRoundedIcon />
            )
          }
          onClick={loadSummary}
          disabled={loading}
          sx={{ fontWeight: 800 }}
        >
          새로고침
        </Button>

        <Button
          variant="contained"
          onClick={onClose}
          sx={{ minWidth: 94, fontWeight: 900, boxShadow: 'none' }}
        >
          확인
        </Button>
      </DialogActions>
    </Dialog>
  );
}
