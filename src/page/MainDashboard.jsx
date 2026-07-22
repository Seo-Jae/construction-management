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
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import { supabase } from '../supabaseClient';
import { getProjectCellKeys } from '../utils/buildingUnits.js';
import MainWorkAlertDialog from './MainWorkAlertDialog.jsx';

const PAGE_SIZE = 1000;

const PROJECT_SCHEDULES = {
  '한라건설 용인금어지구': {
    startDate: '2025.06.30',
    endDate: '2026.12.31',
  },
  '현대건설 용인마크밸리': {
    startDate: '2025.10.31',
    endDate: '2027.12.07',
  },
  '대우건설 용인현장': {
    startDate: '2026.04.15',
    endDate: '2028.02.29',
  },
};

const DEFAULT_NOTICES = [
  {
    id: 1,
    updated_at: '2026-07-14T00:00:00+09:00',
    category: '공지',
    title: '공사관리 시스템 테스트운영을 시작합니다.',
    content:
      '현장별 공사일보, 공정 진척, 업무 보고 기능을 순차적으로 적용합니다.',
  },
  {
    id: 2,
    updated_at: '2026-07-14T00:00:00+09:00',
    category: '안내',
    title: '계정 및 권한 관련 안내',
    content:
      '로그인 계정과 현장 권한에 문제가 있는 경우 최고관리자에게 문의해주세요.',
  },
  {
    id: 3,
    updated_at: '2026-07-14T00:00:00+09:00',
    category: '업데이트',
    title: '관리자 전체 현장 Dashboard 적용',
    content:
      '관리자와 최고관리자는 전체 현장의 금일 출력과 공정 현황을 확인할 수 있습니다.',
  },
];

const NOTICE_CATEGORIES = ['공지', '안내', '업데이트'];

const formatNoticeDate = (value) => {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10).replace(/-/g, '.');
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replace(/\. /g, '.')
    .replace(/\.$/, '');
};

const pad2 = (value) => String(value).padStart(2, '0');

const createDateKey = (year, monthIndex, day) => {
  const yy = String(year).slice(2);
  return `${yy}.${pad2(monthIndex + 1)}.${pad2(day)}`;
};

const getKoreaDateParts = (date = new Date()) => {
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

  return {
    year: values.year,
    month: values.month,
    day: values.day,
  };
};

const LABOR_MISSING_STATUSES = new Set([
  'required',
  'rejected',
]);

const LABOR_PROGRESS_STATUSES = new Set([
  'form_ready',
  'pdf_generated',
  'scan_verified',
]);

const EMPTY_LABOR_SUMMARY = {
  monthLabel: '',
  total: 0,
  missing: 0,
  progress: 0,
  completed: 0,
  unsynced: 0,
  missingNames: [],
};

const normalizeWorkerName = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();

const getRequirementName = (row) =>
  String(
    row?.name ||
      row?.worker_name ||
      row?.normalized_name ||
      '',
  ).trim();

const getCurrentContractPeriod = () => {
  const { year, month } = getKoreaDateParts();
  const monthText = pad2(month);
  const shortYear = String(year).slice(-2);

  return {
    monthKey: `${year}-${monthText}`,
    monthLabel: `${year}년 ${month}월`,
    reportStart: `${shortYear}.${monthText}.01`,
    reportEnd: `${shortYear}.${monthText}.31`,
  };
};

const hasMeaningfulReport = (report) => {
  if (!report) return false;

  const workers = Array.isArray(report.workers)
    ? report.workers
    : [];
  const tasks = Array.isArray(report.tasks)
    ? report.tasks
    : [];

  const hasWorker = workers.some((worker) => {
    const name = String(worker?.name || '').trim();
    const job = String(worker?.job || '').trim();
    const process = String(worker?.process || '').trim();
    const location = String(worker?.location || '').trim();
    const workContent = String(
      worker?.workContent || worker?.work_content || '',
    ).trim();
    const day = Number(worker?.day) || 0;
    const night = Number(worker?.night) || 0;

    return Boolean(
      name ||
        job ||
        process ||
        location ||
        workContent ||
        day > 0 ||
        night > 0,
    );
  });

  const hasTask = tasks.some((task) =>
    Object.values(task || {}).some((value) =>
      String(value ?? '').trim(),
    ),
  );

  return Boolean(
    hasWorker ||
      hasTask ||
      String(report.todayTask || '').trim() ||
      String(report.tomorrowTask || '').trim(),
  );
};

const fetchAllProgressRows = async (projectName) => {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('unit_progress')
      .select(
        'building, unit, process_type, status, completion_date',
      )
      .eq('project_name', projectName)
      .neq('status', '작업전')
      .order('process_type', { ascending: true })
      .order('building', { ascending: true })
      .order('unit', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const pageRows = data || [];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
};

const fetchLaborContractSummary = async (projectName) => {
  const period = getCurrentContractPeriod();
  const [requirementResult, reportResult] = await Promise.all([
    supabase.rpc('labor_get_contract_month', {
      p_project_name: projectName,
      p_contract_month: period.monthKey,
    }),
    supabase
      .from('daily_reports')
      .select('workers')
      .eq('project_name', projectName)
      .gte('date', period.reportStart)
      .lte('date', period.reportEnd),
  ]);

  if (requirementResult.error) {
    throw requirementResult.error;
  }

  if (reportResult.error) {
    throw reportResult.error;
  }

  const requirementRows = requirementResult.data || [];
  const activeRows = requirementRows.filter(
    (row) => row?.status !== 'excluded',
  );
  const requirementNames = new Set(
    requirementRows
      .map((row) => normalizeWorkerName(getRequirementName(row)))
      .filter(Boolean),
  );
  const monthlyWorkers = new Map();

  (reportResult.data || []).forEach((report) => {
    const workers = Array.isArray(report?.workers)
      ? report.workers
      : [];

    workers.forEach((worker) => {
      const displayName = String(worker?.name || '').trim();
      const normalizedName = normalizeWorkerName(displayName);

      if (normalizedName && !monthlyWorkers.has(normalizedName)) {
        monthlyWorkers.set(normalizedName, displayName);
      }
    });
  });

  const unsyncedNames = Array.from(monthlyWorkers.entries())
    .filter(([normalizedName]) =>
      !requirementNames.has(normalizedName),
    )
    .map(([, displayName]) => displayName);
  const missingRows = activeRows.filter((row) =>
    LABOR_MISSING_STATUSES.has(row?.status),
  );
  const progressCount = activeRows.filter((row) =>
    LABOR_PROGRESS_STATUSES.has(row?.status),
  ).length;
  const completedCount = activeRows.filter(
    (row) => row?.status === 'manager_confirmed',
  ).length;
  const missingNames = [];
  const missingNameKeys = new Set();

  [
    ...missingRows.map(getRequirementName),
    ...unsyncedNames,
  ].forEach((name) => {
    const normalizedName = normalizeWorkerName(name);

    if (
      normalizedName &&
      !missingNameKeys.has(normalizedName)
    ) {
      missingNameKeys.add(normalizedName);
      missingNames.push(String(name).trim());
    }
  });

  return {
    monthLabel: period.monthLabel,
    total: activeRows.length + unsyncedNames.length,
    missing: missingRows.length + unsyncedNames.length,
    progress: progressCount,
    completed: completedCount,
    unsynced: unsyncedNames.length,
    missingNames,
  };
};

const getProcessState = (percentage) => {
  if (percentage >= 100) {
    return {
      label: '완료',
      color: '#15803d',
      bgcolor: '#dcfce7',
    };
  }

  if (percentage > 0) {
    return {
      label: '진행중',
      color: '#0369a1',
      bgcolor: '#e0f2fe',
    };
  }

  return {
    label: '작업전',
    color: '#64748b',
    bgcolor: '#f1f5f9',
  };
};

function ProgressSummaryCard({
  schedule,
  percentage,
  completedCount,
  totalCount,
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        minHeight: 146,
        p: 1.7,
        borderColor: '#bfdbfe',
        bgcolor:
          'linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%)',
        boxShadow: '0 3px 12px rgba(15, 23, 42, 0.05)',
      }}
    >
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.7,
            }}
          >
            <TrendingUpOutlinedIcon
              sx={{ color: '#0284c7', fontSize: 22 }}
            />
            <Typography
              sx={{
                color: '#0f172a',
                fontSize: '0.88rem',
                fontWeight: 900,
              }}
            >
              진행률
            </Typography>
          </Box>

          <Typography
            sx={{
              color: '#0369a1',
              fontSize: '1.5rem',
              fontWeight: 900,
              letterSpacing: '-0.04em',
            }}
          >
            {percentage.toFixed(2)}%
          </Typography>
        </Box>

        <LinearProgress
          variant="determinate"
          value={Math.min(percentage, 100)}
          sx={{
            mt: 1.1,
            height: 8,
            borderRadius: 999,
            bgcolor: '#dbeafe',
            '& .MuiLinearProgress-bar': {
              borderRadius: 999,
              bgcolor: '#0ea5e9',
            },
          }}
        />

        <Box
          sx={{
            mt: 1.2,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0.8,
          }}
        >
          <Box
            sx={{
              px: 1,
              py: 0.75,
              borderRadius: 1.2,
              bgcolor: '#ffffff',
              border: '1px solid #e2e8f0',
            }}
          >
            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.65rem',
                fontWeight: 700,
              }}
            >
              시작일
            </Typography>
            <Typography
              sx={{
                mt: 0.15,
                color: '#0f172a',
                fontSize: '0.78rem',
                fontWeight: 900,
              }}
            >
              {schedule.startDate}
            </Typography>
          </Box>

          <Box
            sx={{
              px: 1,
              py: 0.75,
              borderRadius: 1.2,
              bgcolor: '#ffffff',
              border: '1px solid #e2e8f0',
            }}
          >
            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.65rem',
                fontWeight: 700,
              }}
            >
              종료일
            </Typography>
            <Typography
              sx={{
                mt: 0.15,
                color: '#0f172a',
                fontSize: '0.78rem',
                fontWeight: 900,
              }}
            >
              {schedule.endDate}
            </Typography>
          </Box>
        </Box>

        <Typography
          sx={{
            mt: 'auto',
            pt: 0.8,
            color: '#64748b',
            fontSize: '0.65rem',
            textAlign: 'right',
          }}
        >
          완료 {completedCount.toLocaleString()} /
          {' '}
          전체 {totalCount.toLocaleString()} 공정세대
        </Typography>
      </Box>
    </Paper>
  );
}

function LaborContractCard({
  summary,
  loading,
  errorMessage,
  onNavigate,
}) {
  const hasMissing = summary.missing > 0;
  const needsAttention = Boolean(errorMessage) || hasMissing;
  const visibleNames = summary.missingNames.slice(0, 3);
  const hiddenNameCount = Math.max(
    summary.missingNames.length - visibleNames.length,
    0,
  );

  return (
    <Paper
      variant="outlined"
      sx={{
        minHeight: 146,
        p: 1.7,
        borderColor: needsAttention ? '#fecaca' : '#bbf7d0',
        background: needsAttention
          ? 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)'
          : 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)',
        boxShadow: '0 3px 12px rgba(15, 23, 42, 0.05)',
      }}
    >
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.7,
            }}
          >
            <DescriptionOutlinedIcon
              sx={{
                color: needsAttention ? '#dc2626' : '#15803d',
                fontSize: 22,
              }}
            />
            <Typography
              sx={{
                color: '#0f172a',
                fontSize: '0.88rem',
                fontWeight: 900,
              }}
            >
              근로계약서 작성 현황
            </Typography>
          </Box>

          {loading ? (
            <CircularProgress size={22} thickness={5} />
          ) : (
            <Typography
              sx={{
                color: needsAttention ? '#b91c1c' : '#15803d',
                fontSize: '1.2rem',
                fontWeight: 900,
                letterSpacing: '-0.04em',
              }}
            >
              {errorMessage
                ? '확인 필요'
                : hasMissing
                  ? `${summary.missing.toLocaleString()}명 미작성`
                  : summary.total > 0
                    ? '전체 작성완료'
                    : '작성 대상 없음'}
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            mt: 1.15,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 0.65,
          }}
        >
          {[
            ['양식 미입력', summary.missing, '#b91c1c'],
            ['작성 진행', summary.progress, '#0369a1'],
            ['작성 완료', summary.completed, '#15803d'],
          ].map(([label, count, color]) => (
            <Box
              key={label}
              sx={{
                px: 0.7,
                py: 0.7,
                borderRadius: 1.1,
                border: '1px solid #e2e8f0',
                bgcolor: '#ffffff',
                textAlign: 'center',
              }}
            >
              <Typography
                sx={{
                  color: '#64748b',
                  fontSize: '0.63rem',
                  fontWeight: 700,
                }}
              >
                {label}
              </Typography>
              <Typography
                sx={{
                  mt: 0.2,
                  color,
                  fontSize: '0.76rem',
                  fontWeight: 900,
                }}
              >
                {Number(count || 0).toLocaleString()}명
              </Typography>
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            mt: 'auto',
            pt: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              noWrap
              sx={{
                color: errorMessage ? '#b91c1c' : '#78716c',
                fontSize: '0.66rem',
                fontWeight: errorMessage ? 800 : 500,
              }}
            >
              {errorMessage
                ? errorMessage
                : hasMissing
                  ? visibleNames.length > 0
                    ? `미작성: ${visibleNames.join(', ')}${hiddenNameCount > 0 ? ` 외 ${hiddenNameCount}명` : ''}`
                    : '미작성 인원을 관리 화면에서 확인해주세요.'
                  : `${summary.monthLabel} 대상 ${summary.total.toLocaleString()}명`}
            </Typography>

            {!errorMessage && summary.unsynced > 0 && (
              <Typography
                sx={{
                  mt: 0.15,
                  color: '#c2410c',
                  fontSize: '0.61rem',
                  fontWeight: 800,
                }}
              >
                작성 대상 반영 필요 {summary.unsynced.toLocaleString()}명 포함
              </Typography>
            )}
          </Box>

          <Button
            size="small"
            variant="outlined"
            onClick={() => onNavigate?.('labor-contract')}
            sx={{
              flexShrink: 0,
              minWidth: 0,
              px: 1,
              py: 0.35,
              color: needsAttention ? '#c2410c' : '#15803d',
              borderColor: needsAttention ? '#fdba74' : '#86efac',
              fontSize: '0.67rem',
              fontWeight: 800,
              '&:hover': {
                borderColor: needsAttention ? '#fb923c' : '#4ade80',
                bgcolor: needsAttention ? '#fff7ed' : '#f0fdf4',
              },
            }}
          >
            관리 화면
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}

function NoticePanel({ notices, canEdit, onEdit }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        minHeight: 300,
        p: 1.5,
        borderColor: '#cbd5e1',
        bgcolor: '#ffffff',
        boxShadow: '0 3px 12px rgba(15, 23, 42, 0.04)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.7,
          pb: 1,
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.7,
            minWidth: 0,
          }}
        >
          <CampaignOutlinedIcon
            sx={{ color: '#2563eb', fontSize: 21 }}
          />
          <Typography
            sx={{
              color: '#0f172a',
              fontSize: '0.88rem',
              fontWeight: 900,
            }}
          >
            공지사항
          </Typography>
        </Box>

        {canEdit && (
          <Tooltip title="공지사항 수정">
            <IconButton
              size="small"
              aria-label="공지사항 수정"
              onClick={onEdit}
              sx={{
                ml: 'auto',
                width: 28,
                height: 28,
                color: '#2563eb',
                border: '1px solid #bfdbfe',
                bgcolor: '#eff6ff',
                '&:hover': {
                  bgcolor: '#dbeafe',
                },
              }}
            >
              <EditOutlinedIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Box
        sx={{
          mt: 0.6,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {notices.map((notice, index) => (
          <Box
            key={notice.id}
            sx={{
              py: 1.15,
              borderBottom:
                index === notices.length - 1
                  ? 'none'
                  : '1px solid #eef2f7',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Chip
                label={notice.category}
                size="small"
                sx={{
                  height: 20,
                  color:
                    notice.category === '공지'
                      ? '#1d4ed8'
                      : notice.category === '업데이트'
                        ? '#047857'
                        : '#7c3aed',
                  bgcolor:
                    notice.category === '공지'
                      ? '#dbeafe'
                      : notice.category === '업데이트'
                        ? '#d1fae5'
                        : '#ede9fe',
                  fontSize: '0.62rem',
                  fontWeight: 900,
                }}
              />
            </Box>

            <Typography
              sx={{
                mt: 0.55,
                color: '#1e293b',
                fontSize: '0.78rem',
                fontWeight: 900,
              }}
            >
              {notice.title}
            </Typography>

            <Typography
              sx={{
                mt: 0.3,
                color: '#64748b',
                fontSize: '0.68rem',
                lineHeight: 1.55,
              }}
            >
              {notice.content}
            </Typography>

            <Typography
              sx={{
                mt: 0.35,
                color: '#94a3b8',
                fontSize: '0.62rem',
                textAlign: 'right',
              }}
            >
              {formatNoticeDate(notice.updated_at)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

function NoticeEditDialog({
  open,
  drafts,
  saving,
  errorMessage,
  onChange,
  onClose,
  onSave,
}) {
  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle
        sx={{
          pb: 1,
          fontSize: '1.05rem',
          fontWeight: 900,
        }}
      >
        공지사항 수정
      </DialogTitle>

      <DialogContent dividers>
        <Typography
          sx={{
            mb: 1.5,
            color: '#64748b',
            fontSize: '0.76rem',
          }}
        >
          수정한 공지만 저장일이 오늘 날짜로 변경됩니다.
        </Typography>

        {errorMessage && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {errorMessage}
          </Alert>
        )}

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.4,
          }}
        >
          {drafts.map((notice, index) => (
            <Paper
              key={notice.id}
              variant="outlined"
              sx={{
                p: 1.5,
                borderColor: '#dbe3ee',
                bgcolor: '#f8fafc',
              }}
            >
              <Typography
                sx={{
                  mb: 1,
                  color: '#334155',
                  fontSize: '0.76rem',
                  fontWeight: 900,
                }}
              >
                공지 {index + 1}
              </Typography>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: '130px minmax(0, 1fr)',
                  },
                  gap: 1,
                }}
              >
                <TextField
                  select
                  size="small"
                  label="분류"
                  value={notice.category}
                  disabled={saving}
                  onChange={(event) =>
                    onChange(
                      notice.id,
                      'category',
                      event.target.value,
                    )
                  }
                >
                  {NOTICE_CATEGORIES.map((category) => (
                    <MenuItem key={category} value={category}>
                      {category}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  size="small"
                  label="제목"
                  value={notice.title}
                  disabled={saving}
                  inputProps={{ maxLength: 120 }}
                  onChange={(event) =>
                    onChange(
                      notice.id,
                      'title',
                      event.target.value,
                    )
                  }
                />

                <TextField
                  multiline
                  minRows={2}
                  label="내용"
                  value={notice.content}
                  disabled={saving}
                  inputProps={{ maxLength: 500 }}
                  onChange={(event) =>
                    onChange(
                      notice.id,
                      'content',
                      event.target.value,
                    )
                  }
                  sx={{
                    gridColumn: {
                      xs: 'auto',
                      sm: '1 / -1',
                    },
                  }}
                />
              </Box>
            </Paper>
          ))}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={onClose} disabled={saving}>
          취소
        </Button>
        <Button
          variant="contained"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? '저장 중...' : '저장'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CalendarPanel({
  viewYear,
  viewMonth,
  handlePrevMonth,
  handleNextMonth,
  savedData,
  onNavigate,
}) {
  const firstDay = new Date(
    viewYear,
    viewMonth,
    1,
  ).getDay();
  const daysInMonth = new Date(
    viewYear,
    viewMonth + 1,
    0,
  ).getDate();
  const today = getKoreaDateParts();
  const isCurrentMonth =
    today.year === viewYear &&
    today.month === viewMonth + 1;

  const cells = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => index + 1,
    ),
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        minHeight: 300,
        p: 1.5,
        borderColor: '#cbd5e1',
        bgcolor: '#ffffff',
        boxShadow: '0 3px 12px rgba(15, 23, 42, 0.04)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          pb: 1,
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.7,
          }}
        >
          <CalendarMonthOutlinedIcon
            sx={{ color: '#7c3aed', fontSize: 21 }}
          />
          <Typography
            sx={{
              color: '#0f172a',
              fontSize: '0.88rem',
              fontWeight: 900,
            }}
          >
            캘린더
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
          }}
        >
          <IconButton
            size="small"
            onClick={handlePrevMonth}
            aria-label="이전 달"
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>

          <Typography
            sx={{
              minWidth: 88,
              textAlign: 'center',
              color: '#334155',
              fontSize: '0.73rem',
              fontWeight: 900,
            }}
          >
            {viewYear}.{pad2(viewMonth + 1)}
          </Typography>

          <IconButton
            size="small"
            onClick={handleNextMonth}
            aria-label="다음 달"
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <Box
        sx={{
          mt: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 0.4,
        }}
      >
        {['일', '월', '화', '수', '목', '금', '토'].map(
          (label, index) => (
            <Box
              key={label}
              sx={{
                py: 0.45,
                textAlign: 'center',
                color:
                  index === 0
                    ? '#dc2626'
                    : index === 6
                      ? '#2563eb'
                      : '#64748b',
                fontSize: '0.64rem',
                fontWeight: 900,
              }}
            >
              {label}
            </Box>
          ),
        )}

        {cells.map((day, index) => {
          if (!day) {
            return (
              <Box
                key={`empty-${index}`}
                sx={{ minHeight: 34 }}
              />
            );
          }

          const dateKey = createDateKey(
            viewYear,
            viewMonth,
            day,
          );
          const hasReport = hasMeaningfulReport(
            savedData?.[dateKey],
          );
          const dayOfWeek = index % 7;
          const isToday =
            isCurrentMonth && today.day === day;

          return (
            <Box
              component="button"
              type="button"
              key={dateKey}
              onClick={() => onNavigate?.('daily')}
              sx={{
                position: 'relative',
                minHeight: 34,
                p: 0,
                border: isToday
                  ? '2px solid #ef4444'
                  : '1px solid #e2e8f0',
                borderRadius: 1,
                bgcolor: isToday
                  ? '#fff7ed'
                  : hasReport
                    ? '#f0fdf4'
                    : '#ffffff',
                color:
                  dayOfWeek === 0
                    ? '#dc2626'
                    : dayOfWeek === 6
                      ? '#2563eb'
                      : '#334155',
                fontFamily: 'inherit',
                fontSize: '0.68rem',
                fontWeight: isToday ? 900 : 700,
                cursor: 'pointer',
                '&:hover': {
                  bgcolor: '#f8fafc',
                },
              }}
            >
              {day}

              {hasReport && (
                <Box
                  sx={{
                    position: 'absolute',
                    left: '50%',
                    bottom: 3,
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    bgcolor: '#16a34a',
                    transform: 'translateX(-50%)',
                  }}
                />
              )}
            </Box>
          );
        })}
      </Box>

      <Box
        sx={{
          mt: 1,
          pt: 0.8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid #f1f5f9',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: '#16a34a',
            }}
          />
          <Typography
            sx={{
              color: '#64748b',
              fontSize: '0.62rem',
            }}
          >
            출력일보 등록일
          </Typography>
        </Box>

        <Typography
          sx={{
            color: '#94a3b8',
            fontSize: '0.6rem',
          }}
        >
          날짜 선택 시 출력일보작성으로 이동
        </Typography>
      </Box>
    </Paper>
  );
}

function MainProcessPanel({
  processStats,
  loading,
  onRefresh,
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderColor: '#cbd5e1',
        bgcolor: '#ffffff',
        boxShadow: '0 3px 12px rgba(15, 23, 42, 0.04)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          pb: 1,
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.7,
          }}
        >
          <TrendingUpOutlinedIcon
            sx={{ color: '#0f766e', fontSize: 21 }}
          />
          <Typography
            sx={{
              color: '#0f172a',
              fontSize: '0.88rem',
              fontWeight: 900,
            }}
          >
            주요공정
          </Typography>
        </Box>

        <Tooltip title="공정현황 새로고침">
          <span>
            <IconButton
              size="small"
              onClick={onRefresh}
              disabled={loading}
              aria-label="공정현황 새로고침"
            >
              {loading ? (
                <CircularProgress size={17} />
              ) : (
                <RefreshIcon fontSize="small" />
              )}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Box
        sx={{
          mt: 1.1,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(2, minmax(0, 1fr))',
            xl: 'repeat(3, minmax(0, 1fr))',
          },
          gap: 1,
        }}
      >
        {processStats.map((process) => {
          const state = getProcessState(process.percentage);

          return (
            <Box
              key={process.name}
              sx={{
                p: 1.15,
                border: '1px solid #e2e8f0',
                borderRadius: 1.5,
                bgcolor: '#ffffff',
                transition:
                  'border-color 0.15s ease, transform 0.15s ease',
                '&:hover': {
                  borderColor: '#94a3b8',
                  transform: 'translateY(-1px)',
                },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                }}
              >
                <Typography
                  sx={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: '#1e293b',
                    fontSize: '0.76rem',
                    fontWeight: 900,
                  }}
                >
                  {process.name}
                </Typography>

                <Chip
                  label={state.label}
                  size="small"
                  sx={{
                    height: 20,
                    flexShrink: 0,
                    color: state.color,
                    bgcolor: state.bgcolor,
                    fontSize: '0.6rem',
                    fontWeight: 900,
                  }}
                />
              </Box>

              <LinearProgress
                variant="determinate"
                value={Math.min(process.percentage, 100)}
                sx={{
                  mt: 0.9,
                  height: 6,
                  borderRadius: 999,
                  bgcolor: '#e2e8f0',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 999,
                    bgcolor:
                      process.percentage >= 100
                        ? '#16a34a'
                        : '#14b8a6',
                  },
                }}
              />

              <Box
                sx={{
                  mt: 0.65,
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 1,
                }}
              >
                <Typography
                  sx={{
                    color: '#64748b',
                    fontSize: '0.63rem',
                  }}
                >
                  {process.completed.toLocaleString()}
                  /
                  {process.total.toLocaleString()}세대
                </Typography>

                <Typography
                  sx={{
                    color: '#0f766e',
                    fontSize: '0.76rem',
                    fontWeight: 900,
                  }}
                >
                  {process.percentage.toFixed(2)}%
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

export default function MainDashboard({
  projectName = '',
  userRole = '담당자',
  buildingConfigs = {},
  processOptions = [],
  savedData = {},
  viewYear,
  viewMonth,
  handlePrevMonth,
  handleNextMonth,
  onNavigate,
  workAlertOpen = false,
  onCloseWorkAlert,
}) {
  const [progressRows, setProgressRows] = useState([]);
  const [laborSummary, setLaborSummary] = useState(
    EMPTY_LABOR_SUMMARY,
  );
  const [laborLoading, setLaborLoading] = useState(false);
  const [laborErrorMessage, setLaborErrorMessage] =
    useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [notices, setNotices] = useState(DEFAULT_NOTICES);
  const [noticeDialogOpen, setNoticeDialogOpen] =
    useState(false);
  const [noticeDrafts, setNoticeDrafts] = useState([]);
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [noticeErrorMessage, setNoticeErrorMessage] =
    useState('');

  const isSuperAdmin = userRole === '최고관리자';

  const loadNotices = useCallback(async () => {
    const { data, error } = await supabase
      .from('system_notices')
      .select('id, category, title, content, updated_at')
      .order('id', { ascending: true });

    if (error) {
      throw error;
    }

    if (Array.isArray(data) && data.length > 0) {
      setNotices(data);
    }
  }, []);

  useEffect(() => {
    loadNotices().catch((error) => {
      console.error('Main 공지사항 조회 오류:', error);
    });
  }, [loadNotices]);

  const handleOpenNoticeEditor = () => {
    if (!isSuperAdmin) return;

    setNoticeDrafts(
      notices.map((notice) => ({ ...notice })),
    );
    setNoticeErrorMessage('');
    setNoticeDialogOpen(true);
  };

  const handleChangeNoticeDraft = (
    noticeId,
    field,
    value,
  ) => {
    setNoticeDrafts((previous) =>
      previous.map((notice) =>
        notice.id === noticeId
          ? { ...notice, [field]: value }
          : notice,
      ),
    );
  };

  const handleSaveNotices = async () => {
    if (!isSuperAdmin || noticeSaving) return;

    const preparedDrafts = noticeDrafts.map((notice) => ({
      ...notice,
      category: String(notice.category || '').trim(),
      title: String(notice.title || '').trim(),
      content: String(notice.content || '').trim(),
    }));

    if (
      preparedDrafts.some(
        (notice) =>
          !notice.category || !notice.title || !notice.content,
      )
    ) {
      setNoticeErrorMessage(
        '각 공지의 분류, 제목, 내용을 모두 입력해주세요.',
      );
      return;
    }

    const changedNotices = preparedDrafts.filter((draft) => {
      const original = notices.find(
        (notice) => notice.id === draft.id,
      );

      return Boolean(
        !original ||
          draft.category !== original.category ||
          draft.title !== original.title ||
          draft.content !== original.content,
      );
    });

    if (changedNotices.length === 0) {
      setNoticeDialogOpen(false);
      return;
    }

    setNoticeSaving(true);
    setNoticeErrorMessage('');

    try {
      const savedNotices = [];

      for (const notice of changedNotices) {
        const { data, error } = await supabase
          .from('system_notices')
          .update({
            category: notice.category,
            title: notice.title,
            content: notice.content,
          })
          .eq('id', notice.id)
          .select(
            'id, category, title, content, updated_at',
          )
          .single();

        if (error) {
          throw error;
        }

        savedNotices.push(data);
      }

      const savedById = new Map(
        savedNotices.map((notice) => [notice.id, notice]),
      );

      setNotices((previous) =>
        previous.map(
          (notice) => savedById.get(notice.id) || notice,
        ),
      );
      setNoticeDialogOpen(false);
    } catch (error) {
      console.error('Main 공지사항 저장 오류:', error);
      setNoticeErrorMessage(
        error?.message ||
          '공지사항을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.',
      );

      loadNotices().catch((loadError) => {
        console.error(
          'Main 공지사항 재조회 오류:',
          loadError,
        );
      });
    } finally {
      setNoticeSaving(false);
    }
  };

  const loadLaborSummary = useCallback(async () => {
    if (!projectName) {
      setLaborSummary(EMPTY_LABOR_SUMMARY);
      setLaborErrorMessage('');
      return;
    }

    setLaborLoading(true);
    setLaborErrorMessage('');

    try {
      const nextSummary =
        await fetchLaborContractSummary(projectName);

      setLaborSummary(nextSummary);
    } catch (error) {
      console.error(
        'Main 근로계약서 작성 현황 조회 오류:',
        error,
      );
      setLaborSummary(EMPTY_LABOR_SUMMARY);
      setLaborErrorMessage(
        error?.message || '근로계약 현황을 불러오지 못했습니다.',
      );
    } finally {
      setLaborLoading(false);
    }
  }, [projectName]);

  const loadProgress = useCallback(async () => {
    if (!projectName) {
      setProgressRows([]);
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const rows = await fetchAllProgressRows(projectName);
      setProgressRows(rows);
    } catch (error) {
      console.error('Main 공정현황 조회 오류:', error);
      setErrorMessage(
        error?.message || '공정현황을 불러오지 못했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  useEffect(() => {
    loadProgress();
    loadLaborSummary();

    const timer = window.setInterval(
      loadLaborSummary,
      20 * 1000,
    );

    const handleFocus = () => {
      loadLaborSummary();
    };

    const handleLaborChanged = () => {
      loadLaborSummary();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener(
      'labor-contract-changed',
      handleLaborChanged,
    );

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(
        'labor-contract-changed',
        handleLaborChanged,
      );
    };
  }, [
    loadLaborSummary,
    loadProgress,
    refreshKey,
  ]);

  const totalUnits = useMemo(
    () => getProjectCellKeys(buildingConfigs).size,
    [buildingConfigs],
  );

  const processStats = useMemo(() => {
    const allowedProcesses = new Set(processOptions);

    const completedMap = new Map();

    progressRows.forEach((row) => {
      if (
        row?.status !== '작업완료' ||
        !allowedProcesses.has(row?.process_type)
      ) {
        return;
      }

      if (!completedMap.has(row.process_type)) {
        completedMap.set(row.process_type, new Set());
      }

      completedMap
        .get(row.process_type)
        .add(`${row.building}-${row.unit}`);
    });

    return processOptions.map((processName) => {
      const completed =
        completedMap.get(processName)?.size || 0;
      const percentage =
        totalUnits === 0
          ? 0
          : (completed / totalUnits) * 100;

      return {
        name: processName,
        completed,
        total: totalUnits,
        percentage,
      };
    });
  }, [processOptions, progressRows, totalUnits]);

  const completedCount = processStats.reduce(
    (total, process) => total + process.completed,
    0,
  );
  const totalCount = totalUnits * processOptions.length;
  const overallPercentage =
    totalCount === 0
      ? 0
      : (completedCount / totalCount) * 100;

  const schedule =
    PROJECT_SCHEDULES[projectName] || {
      startDate: '일정 미등록',
      endDate: '일정 미등록',
    };

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        overflowY: 'auto',
        pr: 0.4,
      }}
    >
      <MainWorkAlertDialog
        open={workAlertOpen}
        projectName={projectName}
        onClose={onCloseWorkAlert}
        onNavigate={onNavigate}
      />

      <NoticeEditDialog
        open={noticeDialogOpen}
        drafts={noticeDrafts}
        saving={noticeSaving}
        errorMessage={noticeErrorMessage}
        onChange={handleChangeNoticeDraft}
        onClose={() => setNoticeDialogOpen(false)}
        onSave={handleSaveNotices}
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            lg: 'repeat(2, minmax(0, 1fr))',
          },
          gap: 1.2,
        }}
      >
        <ProgressSummaryCard
          schedule={schedule}
          percentage={overallPercentage}
          completedCount={completedCount}
          totalCount={totalCount}
        />

        <LaborContractCard
          summary={laborSummary}
          loading={laborLoading}
          errorMessage={laborErrorMessage}
          onNavigate={onNavigate}
        />
      </Box>

      <Box
        sx={{
          mt: 1.2,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            lg: 'minmax(0, 1.25fr) minmax(330px, 0.75fr)',
          },
          gap: 1.2,
          alignItems: 'stretch',
        }}
      >
        <NoticePanel
          notices={notices}
          canEdit={isSuperAdmin}
          onEdit={handleOpenNoticeEditor}
        />

        <CalendarPanel
          viewYear={viewYear}
          viewMonth={viewMonth}
          handlePrevMonth={handlePrevMonth}
          handleNextMonth={handleNextMonth}
          savedData={savedData}
          onNavigate={onNavigate}
        />
      </Box>

      <Box sx={{ mt: 1.2 }}>
        {errorMessage ? (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderColor: '#fecaca',
              bgcolor: '#fff1f2',
              color: '#b91c1c',
              fontSize: '0.78rem',
            }}
          >
            {errorMessage}
          </Paper>
        ) : (
          <MainProcessPanel
            processStats={processStats}
            loading={loading}
            onRefresh={() =>
              setRefreshKey((previous) => previous + 1)
            }
          />
        )}
      </Box>
    </Box>
  );
}
