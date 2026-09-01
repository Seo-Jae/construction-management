// v52.48.5.44.88 공지사항 목록·상세·이미지 팝업
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
  FormControlLabel,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import { supabase } from '../supabaseClient';
import { getProjectCellKeys } from '../utils/buildingUnits.js';
import MainWorkAlertDialog from './MainWorkAlertDialog.jsx';
import KoreanDatePicker from '../components/KoreanDatePicker.jsx';
import SystemNoticeDetailDialog from '../components/SystemNoticeDialog.jsx';
import {
  SYSTEM_NOTICE_BUCKET,
  fetchSystemNotices,
  formatSystemNoticeDate,
  getSystemNoticeImageUrl,
  normalizeSystemNotice,
} from '../utils/systemNotices.js';

const MAIN_PROGRESS_CACHE = new Map();
const MAIN_LABOR_CACHE = new Map();
const MAIN_NOTICE_CACHE_KEY = 'system-notices';
const MAIN_NOTICE_CACHE = new Map();
const PROGRESS_CACHE_TTL_MS = 5 * 60 * 1000;
const LABOR_CACHE_TTL_MS = 20 * 1000;
const NOTICE_CACHE_TTL_MS = 5 * 60 * 1000;

const EMPTY_CALENDAR_ISSUE_ACCESS = {
  can_write: false,
  can_share_all_projects: false,
};

const getCachedValue = (cache, key, ttlMs) => {
  const cached = cache.get(key);

  if (!cached) return null;

  if (Date.now() - cached.savedAt > ttlMs) {
    return null;
  }

  return cached.value;
};

const setCachedValue = (cache, key, value) => {
  cache.set(key, {
    value,
    savedAt: Date.now(),
  });
};

const getProgressChangedAt = (projectName) => {
  try {
    return Number(
      window.sessionStorage.getItem(
        `main-progress-changed:${projectName}`,
      ) || 0,
    );
  } catch {
    return 0;
  }
};

const LEGACY_PROJECT_SCHEDULES = {
  '한라건설 용인금어지구': {
    startDate: '2025-06-30',
    endDate: '2026-12-31',
  },
  '현대건설 용인마크밸리': {
    startDate: '2025-10-31',
    endDate: '2027-12-07',
  },
  '대우건설 용인현장': {
    startDate: '2026-04-15',
    endDate: '2028-02-29',
  },
};

const formatProjectScheduleDate = (
  value,
) => {
  const text = String(value || '').trim();

  if (!text) return '';

  const normalized =
    text.replace(/\./g, '-');
  const matched =
    normalized.match(
      /^(\d{4})-(\d{2})-(\d{2})$/,
    );

  if (!matched) return '';

  return [
    matched[1],
    matched[2],
    matched[3],
  ].join('.');
};

const getLegacyProjectSchedule = (
  projectName,
) => {
  const schedule =
    LEGACY_PROJECT_SCHEDULES[
      projectName
    ] || {};

  return {
    startDate:
      formatProjectScheduleDate(
        schedule.startDate,
      ) || '일정 미등록',
    endDate:
      formatProjectScheduleDate(
        schedule.endDate,
      ) || '일정 미등록',
  };
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

const createEmptyNoticeDraft = () => ({
  id: '',
  category: '공지',
  title: '',
  summary: '',
  content: '',
  image_paths: [],
  published_at: '',
});

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

const createIsoDate = (year, monthIndex, day) =>
  `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;

const getMonthBounds = (year, monthIndex) => ({
  firstDate: createIsoDate(year, monthIndex, 1),
  lastDate: createIsoDate(
    year,
    monthIndex,
    new Date(year, monthIndex + 1, 0).getDate(),
  ),
});

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
  allPeriodMissing: 0,
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

const fetchProgressSummary = async (projectName) => {
  const { data, error } = await supabase.rpc(
    'main_get_progress_summary',
    {
      p_project_name: projectName,
    },
  );

  if (error) {
    throw error;
  }

  return (data || []).map((row) => ({
    process_type: row.process_type,
    completed_count: Number(row.completed_count || 0),
  }));
};

const fetchLaborContractSummary = async (projectName) => {
  const period = getCurrentContractPeriod();
  const [
    requirementResult,
    reportResult,
    allPeriodResult,
  ] = await Promise.all([
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
    supabase.rpc('labor_get_all_period_missing_count', {
      p_project_name: projectName,
    }),
  ]);

  if (requirementResult.error) {
    throw requirementResult.error;
  }

  if (reportResult.error) {
    throw reportResult.error;
  }

  if (allPeriodResult.error) {
    throw allPeriodResult.error;
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
  const allPeriodRow = Array.isArray(allPeriodResult.data)
    ? allPeriodResult.data[0]
    : allPeriodResult.data;

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
    allPeriodMissing: Number(
      allPeriodRow?.missing_count || 0,
    ),
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
  const hasAllPeriodMissing =
    summary.allPeriodMissing > 0;
  const needsAttention =
    Boolean(errorMessage) ||
    hasMissing ||
    hasAllPeriodMissing;
  const visibleNames = summary.missingNames.slice(0, 3);
  const hiddenNameCount = Math.max(
    summary.missingNames.length - visibleNames.length,
    0,
  );

  return (
    <Paper
      variant="outlined"
      sx={{
        minHeight: 164,
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

            {!errorMessage && (
              <Typography
                sx={{
                  mt: 0.22,
                  color: hasAllPeriodMissing
                    ? '#b91c1c'
                    : '#15803d',
                  fontSize: '0.66rem',
                  fontWeight: 900,
                }}
              >
                전체기간 미입력 {summary.allPeriodMissing.toLocaleString()}건
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

function NoticePanel({ notices, canEdit, onEdit, onOpen }) {
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
              onClick={(event) => {
                event.stopPropagation();
                onEdit?.();
              }}
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
            component="button"
            type="button"
            onClick={() => onOpen?.(notice.id)}
            sx={{
              width: '100%',
              py: 1.15,
              px: 0.4,
              display: 'block',
              textAlign: 'left',
              color: 'inherit',
              font: 'inherit',
              borderTop: 0,
              borderLeft: 0,
              borderRight: 0,
              bgcolor: 'transparent',
              cursor: 'pointer',
              borderBottom:
                index === notices.length - 1
                  ? 'none'
                  : '1px solid #eef2f7',
              '&:hover': {
                bgcolor: '#f8fbff',
              },
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
              {notice.summary || notice.content}
            </Typography>

            <Typography
              sx={{
                mt: 0.35,
                color: '#94a3b8',
                fontSize: '0.62rem',
                textAlign: 'right',
              }}
            >
              {formatNoticeDate(notice.published_at || notice.updated_at)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

function NoticeManageDialog({
  open,
  notices,
  draft,
  imageFiles,
  saving,
  errorMessage,
  onSelect,
  onNew,
  onChange,
  onAddImages,
  onRemoveImage,
  onRemoveNewImage,
  onClose,
  onSave,
}) {
  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="lg"
      slotProps={{
        paper: {
          sx: {
            height: { xs: '92vh', md: '82vh' },
            maxHeight: { xs: '92vh', md: '820px' },
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          pb: 1,
          fontSize: '1.05rem',
          fontWeight: 900,
        }}
      >
        공지사항 관리
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0, minHeight: 0, overflow: 'hidden' }}>
        <Box
          sx={{
            height: '100%',
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '300px minmax(0, 1fr)' },
            gridTemplateRows: { xs: '210px minmax(0, 1fr)', md: '1fr' },
          }}
        >
          <Box
            sx={{
              minHeight: 0,
              overflowY: 'auto',
              p: 1.25,
              bgcolor: '#f8fafc',
              borderRight: { md: '1px solid #e2e8f0' },
              borderBottom: { xs: '1px solid #e2e8f0', md: 'none' },
            }}
          >
            <Button
              fullWidth
              variant="contained"
              startIcon={<AddOutlinedIcon />}
              onClick={onNew}
              disabled={saving}
              sx={{
                mb: 1,
                justifyContent: 'flex-start',
                fontWeight: 900,
              }}
            >
              새 공지 작성
            </Button>

            {notices.map((notice) => {
              const selected = String(draft?.id) === String(notice.id);
              return (
                <Paper
                  key={notice.id}
                  component="button"
                  type="button"
                  variant="outlined"
                  onClick={() => onSelect(notice)}
                  disabled={saving}
                  sx={{
                    width: '100%',
                    mb: 0.7,
                    p: 1,
                    display: 'block',
                    textAlign: 'left',
                    font: 'inherit',
                    cursor: 'pointer',
                    borderColor: selected ? '#60a5fa' : '#e2e8f0',
                    bgcolor: selected ? '#eff6ff' : '#ffffff',
                  }}
                >
                  <Typography noWrap sx={{ color: '#1e293b', fontSize: '0.75rem', fontWeight: 900 }}>
                    {notice.title}
                  </Typography>
                  <Typography sx={{ mt: 0.35, color: '#94a3b8', fontSize: '0.61rem' }}>
                    {formatSystemNoticeDate(notice.published_at || notice.updated_at)}
                  </Typography>
                </Paper>
              );
            })}
          </Box>

          <Box sx={{ minWidth: 0, minHeight: 0, overflowY: 'auto', p: { xs: 1.5, md: 2.5 } }}>
            <Typography
              sx={{
                mb: 1.5,
                color: '#334155',
                fontSize: '0.82rem',
                fontWeight: 900,
              }}
            >
              {draft?.id ? '공지 수정' : '새 공지 작성'}
            </Typography>

            {errorMessage && (
              <Alert severity="error" sx={{ mb: 1.5 }}>
                {errorMessage}
              </Alert>
            )}

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '130px minmax(0, 1fr)' },
                gap: 1.2,
              }}
            >
              <TextField
                select
                size="small"
                label="분류"
                value={draft?.category || '공지'}
                disabled={saving}
                onChange={(event) => onChange('category', event.target.value)}
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
                value={draft?.title || ''}
                disabled={saving}
                inputProps={{ maxLength: 120 }}
                onChange={(event) => onChange('title', event.target.value)}
              />

              <TextField
                multiline
                minRows={2}
                label="목록에 표시할 간략 내용"
                value={draft?.summary || ''}
                disabled={saving}
                inputProps={{ maxLength: 500 }}
                onChange={(event) => onChange('summary', event.target.value)}
                sx={{
                  gridColumn: { xs: 'auto', sm: '1 / -1' },
                }}
              />

              <TextField
                multiline
                minRows={7}
                label="상세 내용"
                value={draft?.content || ''}
                disabled={saving}
                inputProps={{ maxLength: 10000 }}
                onChange={(event) => onChange('content', event.target.value)}
                sx={{
                  gridColumn: { xs: 'auto', sm: '1 / -1' },
                }}
              />
            </Box>

            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Button
                component="label"
                variant="outlined"
                size="small"
                startIcon={<AddPhotoAlternateOutlinedIcon />}
                disabled={saving || ((draft?.image_paths?.length || 0) + imageFiles.length >= 5)}
              >
                이미지 추가
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  onChange={onAddImages}
                />
              </Button>
              <Typography sx={{ color: '#64748b', fontSize: '0.68rem' }}>
                최대 5장 · 장당 8MB 이하
              </Typography>
            </Box>

            {((draft?.image_paths?.length || 0) > 0 || imageFiles.length > 0) && (
              <Box
                sx={{
                  mt: 1.2,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: 1,
                }}
              >
                {(draft?.image_paths || []).map((path) => (
                  <Box key={path} sx={{ position: 'relative', border: '1px solid #e2e8f0', borderRadius: 1, overflow: 'hidden' }}>
                    <Box component="img" src={getSystemNoticeImageUrl(path)} alt="기존 공지 첨부" sx={{ display: 'block', width: '100%', height: 105, objectFit: 'cover' }} />
                    <IconButton
                      size="small"
                      aria-label="기존 이미지 제거"
                      onClick={() => onRemoveImage(path)}
                      disabled={saving}
                      sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(255,255,255,0.92)', '&:hover': { bgcolor: '#ffffff' } }}
                    >
                      <DeleteOutlinedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                ))}

                {imageFiles.map((file, index) => (
                  <Box key={`${file.name}-${file.lastModified}-${index}`} sx={{ position: 'relative', p: 1, minHeight: 105, border: '1px solid #bfdbfe', borderRadius: 1, bgcolor: '#eff6ff' }}>
                    <Typography sx={{ pr: 3, color: '#1e3a8a', fontSize: '0.68rem', fontWeight: 800, overflowWrap: 'anywhere' }}>
                      {file.name}
                    </Typography>
                    <Typography sx={{ mt: 0.5, color: '#64748b', fontSize: '0.61rem' }}>
                      {(file.size / 1024 / 1024).toFixed(2)}MB · 저장 예정
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label="새 이미지 제거"
                      onClick={() => onRemoveNewImage(index)}
                      disabled={saving}
                      sx={{ position: 'absolute', top: 4, right: 4 }}
                    >
                      <DeleteOutlinedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
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

function CalendarIssueEditDialog({
  open,
  draft,
  saving,
  canShareAllProjects,
  minDate,
  maxDate,
  onChange,
  onClose,
  onSave,
}) {
  const isEdit = Boolean(draft?.id);

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle
        sx={{
          pb: 1,
          fontSize: '1.05rem',
          fontWeight: 900,
        }}
      >
        {isEdit ? '주요일정 수정' : '주요일정 등록'}
      </DialogTitle>

      <DialogContent dividers>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.4,
          }}
        >
          <KoreanDatePicker
            size="small"
            label="일정 일자"
            value={draft?.issueDate || ''}
            disabled={saving}
            minDate={minDate}
            maxDate={maxDate}
            onChange={(value) => onChange('issueDate', value)}
          />

          <TextField
            multiline
            minRows={3}
            label="주요일정 내용"
            placeholder="예: 위험성평가 회의, 공정회의, 자재 반입 일정"
            value={draft?.content || ''}
            disabled={saving}
            inputProps={{ maxLength: 1000 }}
            helperText={`${String(draft?.content || '').length}/1000`}
            onChange={(event) =>
              onChange('content', event.target.value)
            }
          />

          {canShareAllProjects ? (
            <Box
              sx={{
                px: 1.2,
                py: 0.8,
                border: '1px solid #bfdbfe',
                borderRadius: 1.2,
                bgcolor: '#eff6ff',
              }}
            >
              <FormControlLabel
                control={(
                  <Checkbox
                    size="small"
                    checked={Boolean(draft?.shareAllProjects)}
                    disabled={saving}
                    onChange={(event) =>
                      onChange(
                        'shareAllProjects',
                        event.target.checked,
                      )
                    }
                  />
                )}
                label="전체현장에 공유"
                sx={{
                  m: 0,
                  '& .MuiFormControlLabel-label': {
                    color: '#1e3a8a',
                    fontSize: '0.78rem',
                    fontWeight: 900,
                  },
                }}
              />
              <Typography
                sx={{
                  ml: 4,
                  color: '#64748b',
                  fontSize: '0.66rem',
                }}
              >
                체크하면 한 현장에서 등록한 일정이 모든 현장의 Main 캘린더에 표시됩니다.
              </Typography>
            </Box>
          ) : (
            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.7rem',
              }}
            >
              이 일정은 현재 현장에만 등록됩니다. 전체현장 공유 권한은 회원관리에서 최고관리자가 부여할 수 있습니다.
            </Typography>
          )}
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

function CalendarIssueDetailDialog({
  open,
  issueDate,
  issues,
  onClose,
}) {
  const [year, month, day] = String(issueDate || '').split('-');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle
        sx={{
          pb: 1,
          fontSize: '1.05rem',
          fontWeight: 900,
        }}
      >
        {year && month && day
          ? `${year}년 ${Number(month)}월 ${Number(day)}일 주요일정`
          : '주요일정'}
      </DialogTitle>

      <DialogContent dividers>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {issues.map((issue) => (
            <Box
              key={issue.id}
              sx={{
                p: 1.4,
                border: '1px solid #e2e8f0',
                borderRadius: 1.4,
                bgcolor: issue.share_all_projects
                  ? '#f8faff'
                  : '#ffffff',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 0.6,
                }}
              >
                <Chip
                  size="small"
                  label={
                    issue.share_all_projects
                      ? '전체현장'
                      : '현장'
                  }
                  icon={
                    issue.share_all_projects
                      ? <PublicOutlinedIcon />
                      : undefined
                  }
                  sx={{
                    height: 22,
                    color: issue.share_all_projects
                      ? '#1d4ed8'
                      : '#047857',
                    bgcolor: issue.share_all_projects
                      ? '#dbeafe'
                      : '#d1fae5',
                    fontSize: '0.64rem',
                    fontWeight: 900,
                    '& .MuiChip-icon': {
                      color: 'inherit',
                      fontSize: 14,
                    },
                  }}
                />

                <Typography
                  sx={{
                    color: '#64748b',
                    fontSize: '0.66rem',
                    fontWeight: 700,
                  }}
                >
                  {issue.project_name || '현장 미상'}
                </Typography>
              </Box>

              <Typography
                sx={{
                  mt: 1,
                  color: '#1e293b',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {issue.content}
              </Typography>

              <Box
                sx={{
                  mt: 1,
                  pt: 0.8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  borderTop: '1px solid #f1f5f9',
                }}
              >
                <Typography
                  sx={{
                    color: '#64748b',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                  }}
                >
                  작성자 · {issue.author_name || '작성자 미상'}
                </Typography>

                <Typography
                  sx={{
                    color: '#94a3b8',
                    fontSize: '0.61rem',
                  }}
                >
                  수정일 · {formatNoticeDate(issue.updated_at)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={onClose}>닫기</Button>
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
  issues,
  issuesLoading,
  issuesErrorMessage,
  canWriteIssues,
  onCreateIssue,
  onEditIssue,
  onDeleteIssue,
}) {
  const [selectedIssueDate, setSelectedIssueDate] = useState('');
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
  const issueDateSet = useMemo(
    () => new Set(
      (Array.isArray(issues) ? issues : [])
        .map((issue) => String(issue?.issue_date || '').slice(0, 10))
        .filter(Boolean),
    ),
    [issues],
  );
  const selectedDateIssues = useMemo(
    () => (Array.isArray(issues) ? issues : []).filter(
      (issue) =>
        String(issue?.issue_date || '').slice(0, 10) ===
        selectedIssueDate,
    ),
    [issues, selectedIssueDate],
  );

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
        minHeight: 430,
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        borderColor: '#cbd5e1',
        bgcolor: '#ffffff',
        boxShadow: '0 3px 12px rgba(15, 23, 42, 0.04)',
      }}
    >
      <CalendarIssueDetailDialog
        open={
          Boolean(selectedIssueDate) &&
          selectedDateIssues.length > 0
        }
        issueDate={selectedIssueDate}
        issues={selectedDateIssues}
        onClose={() => setSelectedIssueDate('')}
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'minmax(0, 2fr) minmax(240px, 1fr)',
          },
          gap: 1.4,
          flex: 1,
          minHeight: 0,
          alignItems: 'stretch',
        }}
      >
        <Box
          sx={{
            minWidth: 0,
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
                {viewYear}년 {viewMonth + 1}월
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
          const isoDate = createIsoDate(
            viewYear,
            viewMonth,
            day,
          );
          const hasIssue = issueDateSet.has(isoDate);
          const dayOfWeek = index % 7;
          const isToday =
            isCurrentMonth && today.day === day;

          return (
            <Box
              key={dateKey}
              component={hasIssue ? 'button' : 'div'}
              type={hasIssue ? 'button' : undefined}
              onClick={
                hasIssue
                  ? () => setSelectedIssueDate(isoDate)
                  : undefined
              }
              aria-label={
                hasIssue
                  ? `${viewYear}년 ${viewMonth + 1}월 ${day}일 주요일정 보기`
                  : undefined
              }
              sx={{
                position: 'relative',
                width: '100%',
                minHeight: 38,
                p: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
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
                appearance: 'none',
                cursor: hasIssue ? 'pointer' : 'default',
                '&:hover': hasIssue
                  ? {
                      borderColor: '#e11d48',
                      bgcolor: '#fff1f2',
                    }
                  : undefined,
              }}
            >
              {day}

              {(hasReport || hasIssue) && (
                <Box
                  sx={{
                    position: 'absolute',
                    left: '50%',
                    bottom: 3,
                    display: 'flex',
                    gap: 0.35,
                    transform: 'translateX(-50%)',
                  }}
                >
                  {hasReport && (
                    <Box
                      sx={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        bgcolor: '#16a34a',
                      }}
                    />
                  )}
                  {hasIssue && (
                    <Box
                      sx={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        bgcolor: '#e11d48',
                      }}
                    />
                  )}
                </Box>
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
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
          {[
            ['#16a34a', '출력일보 등록일'],
            ['#e11d48', '주요일정 등록일 · 날짜 클릭 시 상세보기'],
          ].map(([color, label]) => (
            <Box
              key={label}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.45 }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  bgcolor: color,
                }}
              />
              <Typography
                sx={{
                  color: '#64748b',
                  fontSize: '0.62rem',
                }}
              >
                {label}
              </Typography>
            </Box>
          ))}
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            minWidth: 0,
            alignSelf: 'stretch',
            pl: { xs: 0, md: 1.4 },
            pt: { xs: 1.2, md: 0 },
            borderLeft: {
              xs: 'none',
              md: '1px solid #e2e8f0',
            },
            borderTop: {
              xs: '1px solid #e2e8f0',
              md: 'none',
            },
          }}
        >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 0.7,
          }}
        >
          <EventNoteOutlinedIcon
            sx={{ color: '#e11d48', fontSize: 20 }}
          />
          <Typography
            sx={{
              color: '#0f172a',
              fontSize: '0.82rem',
              fontWeight: 900,
            }}
          >
            {viewYear}년 {viewMonth + 1}월 주요일정
          </Typography>

          {canWriteIssues && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddOutlinedIcon sx={{ fontSize: 16 }} />}
              onClick={onCreateIssue}
              sx={{
                ml: 'auto',
                minWidth: 0,
                px: 1,
                py: 0.35,
                fontSize: '0.67rem',
                fontWeight: 900,
              }}
            >
              일정 등록
            </Button>
          )}
        </Box>

        {issuesErrorMessage && (
          <Alert severity="error" sx={{ mt: 1, py: 0 }}>
            {issuesErrorMessage}
          </Alert>
        )}

        {issuesLoading ? (
          <Box
            sx={{
              minHeight: 90,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress size={24} />
          </Box>
        ) : issues.length === 0 ? (
          <Box
            sx={{
              mt: 1,
              minHeight: 86,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px dashed #cbd5e1',
              borderRadius: 1.2,
              bgcolor: '#f8fafc',
            }}
          >
            <Typography
              sx={{ color: '#94a3b8', fontSize: '0.7rem' }}
            >
              등록된 주요일정이 없습니다.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              mt: 0.8,
              maxHeight: 260,
              overflowY: 'auto',
              pr: 0.35,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.65,
            }}
          >
            {issues.map((issue) => {
              const issueDate = String(issue.issue_date || '');
              const [year, month, day] = issueDate.split('-');

              return (
                <Box
                  key={issue.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '52px minmax(0, 1fr)',
                    gap: 0.75,
                    alignItems: 'stretch',
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#475569',
                    }}
                  >
                    <Typography
                      sx={{ fontSize: '0.58rem', fontWeight: 700 }}
                    >
                      {year}
                    </Typography>
                    <Typography
                      sx={{ fontSize: '0.7rem', fontWeight: 900 }}
                    >
                      {month}.{day}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      px: 1,
                      py: 0.85,
                      border: '1px solid #e2e8f0',
                      borderRadius: 1.2,
                      bgcolor: issue.share_all_projects
                        ? '#f8faff'
                        : '#ffffff',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.55,
                      }}
                    >
                      <Chip
                        size="small"
                        label={
                          issue.share_all_projects
                            ? '전체현장'
                            : '현장'
                        }
                        icon={
                          issue.share_all_projects
                            ? <PublicOutlinedIcon />
                            : undefined
                        }
                        sx={{
                          height: 20,
                          color: issue.share_all_projects
                            ? '#1d4ed8'
                            : '#047857',
                          bgcolor: issue.share_all_projects
                            ? '#dbeafe'
                            : '#d1fae5',
                          fontSize: '0.6rem',
                          fontWeight: 900,
                          '& .MuiChip-icon': {
                            color: 'inherit',
                            fontSize: 14,
                          },
                        }}
                      />

                      {issue.share_all_projects && (
                        <Typography
                          noWrap
                          sx={{
                            minWidth: 0,
                            color: '#64748b',
                            fontSize: '0.6rem',
                          }}
                        >
                          {issue.project_name}
                        </Typography>
                      )}

                      {issue.can_edit && (
                        <Box
                          sx={{
                            ml: 'auto',
                            display: 'flex',
                            gap: 0.15,
                          }}
                        >
                          <Tooltip title="일정 수정">
                            <IconButton
                              size="small"
                              onClick={() => onEditIssue(issue)}
                              sx={{ width: 25, height: 25 }}
                            >
                              <EditOutlinedIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="일정 삭제">
                            <IconButton
                              size="small"
                              onClick={() => onDeleteIssue(issue)}
                              sx={{
                                width: 25,
                                height: 25,
                                color: '#dc2626',
                              }}
                            >
                              <DeleteOutlinedIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Box>

                    <Typography
                      sx={{
                        mt: 0.55,
                        color: '#1e293b',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {issue.content}
                    </Typography>

                    <Typography
                      sx={{
                        mt: 0.35,
                        color: '#94a3b8',
                        fontSize: '0.58rem',
                        textAlign: 'right',
                      }}
                    >
                      {issue.author_name || '작성자 미상'}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
        </Box>
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
  const [progressSummaryRows, setProgressSummaryRows] =
    useState([]);
  const [
    projectSchedule,
    setProjectSchedule,
  ] = useState(() =>
    getLegacyProjectSchedule(
      projectName,
    ),
  );
  const [laborSummary, setLaborSummary] = useState(
    EMPTY_LABOR_SUMMARY,
  );
  const [laborLoading, setLaborLoading] = useState(false);
  const [laborErrorMessage, setLaborErrorMessage] =
    useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notices, setNotices] = useState(DEFAULT_NOTICES);
  const [noticeViewerOpen, setNoticeViewerOpen] = useState(false);
  const [selectedNoticeId, setSelectedNoticeId] = useState('');
  const [noticeDialogOpen, setNoticeDialogOpen] =
    useState(false);
  const [noticeAdminRows, setNoticeAdminRows] = useState([]);
  const [noticeDraft, setNoticeDraft] = useState(
    createEmptyNoticeDraft,
  );
  const [noticeImageFiles, setNoticeImageFiles] = useState([]);
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [noticeErrorMessage, setNoticeErrorMessage] =
    useState('');
  const [calendarIssues, setCalendarIssues] = useState([]);
  const [calendarIssueAccess, setCalendarIssueAccess] =
    useState(EMPTY_CALENDAR_ISSUE_ACCESS);
  const [calendarIssuesLoading, setCalendarIssuesLoading] =
    useState(false);
  const [calendarIssuesErrorMessage, setCalendarIssuesErrorMessage] =
    useState('');
  const [calendarIssueDialogOpen, setCalendarIssueDialogOpen] =
    useState(false);
  const [calendarIssueDraft, setCalendarIssueDraft] = useState({
    id: null,
    issueDate: '',
    content: '',
    shareAllProjects: false,
  });
  const [calendarIssueSaving, setCalendarIssueSaving] =
    useState(false);
  const [toast, setToast] = useState({
    open: false,
    severity: 'success',
    message: '',
  });
  const progressRequestIdRef = useRef(0);
  const laborRequestIdRef = useRef(0);

  const isSuperAdmin = userRole === '최고관리자';

  const loadProjectSchedule =
    useCallback(async () => {
      if (!projectName) {
        setProjectSchedule({
          startDate: '일정 미등록',
          endDate: '일정 미등록',
        });
        return;
      }

      const fallback =
        getLegacyProjectSchedule(
          projectName,
        );

      try {
        const { data, error } =
          await supabase
            .from('building_settings')
            .select(
              'building_name, config_json',
            )
            .eq(
              'project_name',
              projectName,
            )
            .order(
              'building_name',
              { ascending: true },
            )
            .limit(50);

        if (error) throw error;

        const configs = (
          Array.isArray(data)
            ? data
            : []
        )
          .map(
            (row) =>
              row?.config_json || {},
          )
          .filter(Boolean);

        const configuredStartDate =
          configs
            .map((config) =>
              formatProjectScheduleDate(
                config.projectStartDate ||
                  config.project_start_date ||
                  config.startDate ||
                  config.start_date,
              ),
            )
            .find(Boolean);

        const configuredEndDate =
          configs
            .map((config) =>
              formatProjectScheduleDate(
                config.projectEndDate ||
                  config.project_end_date ||
                  config.endDate ||
                  config.end_date,
              ),
            )
            .find(Boolean);

        setProjectSchedule({
          startDate:
            configuredStartDate ||
            fallback.startDate,
          endDate:
            configuredEndDate ||
            fallback.endDate,
        });
      } catch (error) {
        console.error(
          'Main 현장 공사기간 조회 오류:',
          error,
        );
        setProjectSchedule(
          fallback,
        );
      }
    }, [projectName]);

  useEffect(() => {
    loadProjectSchedule();

    const handleProjectRegistryChanged = (
      event,
    ) => {
      const changedProjectName =
        String(
          event?.detail
            ?.projectName || '',
        ).trim();

      if (
        changedProjectName &&
        changedProjectName !==
          projectName
      ) {
        return;
      }

      loadProjectSchedule();
    };

    window.addEventListener(
      'project-registry-changed',
      handleProjectRegistryChanged,
    );

    return () => {
      window.removeEventListener(
        'project-registry-changed',
        handleProjectRegistryChanged,
      );
    };
  }, [
    loadProjectSchedule,
    projectName,
  ]);

  const calendarMonthBounds = useMemo(
    () => getMonthBounds(viewYear, viewMonth),
    [viewMonth, viewYear],
  );

  const loadNotices = useCallback(async ({ force = false } = {}) => {
    const cachedNotices = getCachedValue(
      MAIN_NOTICE_CACHE,
      MAIN_NOTICE_CACHE_KEY,
      NOTICE_CACHE_TTL_MS,
    );

    if (!force && cachedNotices) {
      setNotices(cachedNotices);
      return;
    }

    const data = await fetchSystemNotices();
    setCachedValue(
      MAIN_NOTICE_CACHE,
      MAIN_NOTICE_CACHE_KEY,
      data,
    );
    setNotices(data);
  }, []);

  useEffect(() => {
    loadNotices().catch((error) => {
      console.error('Main 공지사항 조회 오류:', error);
    });
  }, [loadNotices]);

  const handleOpenNoticeViewer = (noticeId) => {
    setSelectedNoticeId(noticeId || notices[0]?.id || '');
    setNoticeViewerOpen(true);
  };

  const handleSelectNoticeDraft = (notice) => {
    setNoticeDraft(normalizeSystemNotice(notice));
    setNoticeImageFiles([]);
    setNoticeErrorMessage('');
  };

  const handleNewNoticeDraft = () => {
    setNoticeDraft(createEmptyNoticeDraft());
    setNoticeImageFiles([]);
    setNoticeErrorMessage('');
  };

  const handleOpenNoticeEditor = () => {
    if (!isSuperAdmin) return;

    const nextRows = notices.map(normalizeSystemNotice);
    setNoticeAdminRows(nextRows);
    setNoticeDraft(
      nextRows[0] || createEmptyNoticeDraft(),
    );
    setNoticeImageFiles([]);
    setNoticeErrorMessage('');
    setNoticeDialogOpen(true);
  };

  const handleChangeNoticeDraft = (field, value) => {
    setNoticeDraft((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleAddNoticeImages = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';

    const invalidType = files.find(
      (file) => !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type),
    );
    if (invalidType) {
      setNoticeErrorMessage('JPG, PNG, WEBP, GIF 이미지만 첨부할 수 있습니다.');
      return;
    }

    const oversized = files.find((file) => file.size > 8 * 1024 * 1024);
    if (oversized) {
      setNoticeErrorMessage(`이미지는 장당 8MB 이하여야 합니다: ${oversized.name}`);
      return;
    }

    const availableCount = Math.max(
      0,
      5 - (noticeDraft.image_paths?.length || 0) - noticeImageFiles.length,
    );
    if (files.length > availableCount) {
      setNoticeErrorMessage('공지 이미지에는 최대 5장까지 첨부할 수 있습니다.');
      return;
    }

    setNoticeImageFiles((previous) => [...previous, ...files]);
    setNoticeErrorMessage('');
  };

  const handleSaveNotice = async () => {
    if (!isSuperAdmin || noticeSaving) return;

    const prepared = {
      ...noticeDraft,
      category: String(noticeDraft.category || '').trim(),
      title: String(noticeDraft.title || '').trim(),
      summary: String(noticeDraft.summary || '').trim(),
      content: String(noticeDraft.content || '').trim(),
      image_paths: Array.isArray(noticeDraft.image_paths)
        ? noticeDraft.image_paths.filter(Boolean)
        : [],
    };

    if (!prepared.category || !prepared.title || !prepared.summary || !prepared.content) {
      setNoticeErrorMessage(
        '분류, 제목, 간략 내용, 상세 내용을 모두 입력해주세요.',
      );
      return;
    }

    setNoticeSaving(true);
    setNoticeErrorMessage('');

    const noticeId = prepared.id || window.crypto.randomUUID();
    const uploadedPaths = [];
    const original = noticeAdminRows.find(
      (notice) => String(notice.id) === String(prepared.id),
    );
    const originalPaths = original?.image_paths || [];
    const removedPaths = originalPaths.filter(
      (path) => !prepared.image_paths.includes(path),
    );

    try {
      for (const [index, file] of noticeImageFiles.entries()) {
        const extension = String(file.name || '')
          .split('.')
          .pop()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `${noticeId}/${Date.now()}-${index}-${window.crypto.randomUUID().slice(0, 8)}.${extension}`;
        const uploadResult = await supabase.storage
          .from(SYSTEM_NOTICE_BUCKET)
          .upload(path, file, {
            contentType: file.type,
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadResult.error) throw uploadResult.error;
        uploadedPaths.push(path);
      }

      const now = new Date().toISOString();
      const payload = {
        category: prepared.category,
        title: prepared.title,
        summary: prepared.summary,
        content: prepared.content,
        image_paths: [...prepared.image_paths, ...uploadedPaths],
        is_published: true,
        updated_at: now,
      };

      const saveQuery = prepared.id
        ? supabase
            .from('system_notice_posts')
            .update(payload)
            .eq('id', prepared.id)
        : supabase
            .from('system_notice_posts')
            .insert({
              id: noticeId,
              ...payload,
              published_at: now,
            });

      const { data, error } = await saveQuery
        .select(
          'id, category, title, summary, content, image_paths, published_at, created_at, updated_at',
        )
        .single();

      if (error) throw error;

      if (removedPaths.length > 0) {
        const removeResult = await supabase.storage
          .from(SYSTEM_NOTICE_BUCKET)
          .remove(removedPaths);
        if (removeResult.error) {
          console.error('공지사항 기존 이미지 삭제 오류:', removeResult.error);
        }
      }

      const nextNotices = await fetchSystemNotices();

      setCachedValue(
        MAIN_NOTICE_CACHE,
        MAIN_NOTICE_CACHE_KEY,
        nextNotices,
      );
      setNotices(nextNotices);
      setNoticeAdminRows(nextNotices);
      setNoticeDraft(normalizeSystemNotice(data));
      setNoticeImageFiles([]);
      setNoticeDialogOpen(false);
      setToast({
        open: true,
        severity: 'success',
        message: prepared.id
          ? '공지사항을 수정했습니다.'
          : '새 공지사항을 등록했습니다.',
      });
    } catch (error) {
      console.error('Main 공지사항 저장 오류:', error);

      if (uploadedPaths.length > 0) {
        await supabase.storage
          .from(SYSTEM_NOTICE_BUCKET)
          .remove(uploadedPaths);
      }

      setNoticeErrorMessage(
        error?.message ||
          '공지사항을 저장하지 못했습니다. v88 SQL 적용 여부를 확인해주세요.',
      );
    } finally {
      setNoticeSaving(false);
    }
  };

  const loadCalendarIssues = useCallback(async () => {
    if (!projectName) {
      setCalendarIssues([]);
      setCalendarIssueAccess(EMPTY_CALENDAR_ISSUE_ACCESS);
      setCalendarIssuesErrorMessage('');
      return;
    }

    setCalendarIssuesLoading(true);
    setCalendarIssuesErrorMessage('');

    try {
      const [contextResult, issuesResult] = await Promise.all([
        supabase.rpc('main_get_calendar_issue_context', {
          p_project_name: projectName,
        }),
        supabase.rpc('main_list_calendar_issues', {
          p_project_name: projectName,
          p_month_start: calendarMonthBounds.firstDate,
        }),
      ]);

      if (contextResult.error) throw contextResult.error;
      if (issuesResult.error) throw issuesResult.error;

      setCalendarIssueAccess({
        can_write: contextResult.data?.can_write === true,
        can_share_all_projects:
          contextResult.data?.can_share_all_projects === true,
      });
      setCalendarIssues(
        Array.isArray(issuesResult.data) ? issuesResult.data : [],
      );
    } catch (error) {
      console.error('Main 캘린더 주요일정 조회 오류:', error);
      setCalendarIssues([]);
      setCalendarIssueAccess(EMPTY_CALENDAR_ISSUE_ACCESS);
      setCalendarIssuesErrorMessage(
        error?.message || '주요일정을 불러오지 못했습니다.',
      );
    } finally {
      setCalendarIssuesLoading(false);
    }
  }, [calendarMonthBounds.firstDate, projectName]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadCalendarIssues();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadCalendarIssues]);

  const handleOpenCalendarIssueCreate = () => {
    const today = getKoreaDateParts();
    const initialDay =
      today.year === viewYear &&
      today.month === viewMonth + 1
        ? today.day
        : 1;

    setCalendarIssueDraft({
      id: null,
      issueDate: createIsoDate(viewYear, viewMonth, initialDay),
      content: '',
      shareAllProjects: false,
    });
    setCalendarIssueDialogOpen(true);
  };

  const handleOpenCalendarIssueEdit = (issue) => {
    setCalendarIssueDraft({
      id: issue.id,
      issueDate: String(issue.issue_date || '').slice(0, 10),
      content: String(issue.content || ''),
      shareAllProjects: issue.share_all_projects === true,
    });
    setCalendarIssueDialogOpen(true);
  };

  const handleChangeCalendarIssueDraft = (field, value) => {
    setCalendarIssueDraft((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSaveCalendarIssue = async () => {
    if (calendarIssueSaving) return;

    const issueDate = String(
      calendarIssueDraft.issueDate || '',
    ).trim();
    const content = String(
      calendarIssueDraft.content || '',
    ).trim();

    if (!issueDate || !content) {
      setToast({
        open: true,
        severity: 'warning',
        message: '일정 일자와 내용을 모두 입력해주세요.',
      });
      return;
    }

    if (
      issueDate < calendarMonthBounds.firstDate ||
      issueDate > calendarMonthBounds.lastDate
    ) {
      setToast({
        open: true,
        severity: 'warning',
        message: '현재 보고 있는 달의 날짜를 선택해주세요.',
      });
      return;
    }

    setCalendarIssueSaving(true);

    try {
      const { error } = await supabase.rpc(
        'main_save_calendar_issue',
        {
          p_issue_id: calendarIssueDraft.id || null,
          p_project_name: projectName,
          p_issue_date: issueDate,
          p_content: content,
          p_share_all_projects:
            calendarIssueDraft.shareAllProjects === true,
        },
      );

      if (error) throw error;

      setCalendarIssueDialogOpen(false);
      setToast({
        open: true,
        severity: 'success',
        message: calendarIssueDraft.id
          ? '주요일정을 수정했습니다.'
          : '주요일정을 등록했습니다.',
      });
      await loadCalendarIssues();
    } catch (error) {
      console.error('Main 캘린더 주요일정 저장 오류:', error);
      setToast({
        open: true,
        severity: 'error',
        message:
          error?.message || '주요일정을 저장하지 못했습니다.',
      });
    } finally {
      setCalendarIssueSaving(false);
    }
  };

  const handleDeleteCalendarIssue = async (issue) => {
    const confirmed = window.confirm(
      `${String(issue.issue_date || '').slice(0, 10)} 주요일정을 삭제할까요?`,
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase.rpc(
        'main_delete_calendar_issue',
        { p_issue_id: issue.id },
      );

      if (error) throw error;

      setToast({
        open: true,
        severity: 'success',
        message: '주요일정을 삭제했습니다.',
      });
      await loadCalendarIssues();
    } catch (error) {
      console.error('Main 캘린더 주요일정 삭제 오류:', error);
      setToast({
        open: true,
        severity: 'error',
        message:
          error?.message || '주요일정을 삭제하지 못했습니다.',
      });
    }
  };

  const loadLaborSummary = useCallback(async ({ force = false } = {}) => {
    const requestId = laborRequestIdRef.current + 1;
    laborRequestIdRef.current = requestId;

    if (!projectName) {
      setLaborSummary(EMPTY_LABOR_SUMMARY);
      setLaborErrorMessage('');
      return;
    }

    const cachedSummary = getCachedValue(
      MAIN_LABOR_CACHE,
      projectName,
      LABOR_CACHE_TTL_MS,
    );

    if (!force && cachedSummary) {
      setLaborSummary(cachedSummary);
      setLaborErrorMessage('');
      setLaborLoading(false);
      return;
    }

    if (!cachedSummary) {
      setLaborSummary(EMPTY_LABOR_SUMMARY);
    }

    setLaborLoading(true);
    setLaborErrorMessage('');

    try {
      const nextSummary =
        await fetchLaborContractSummary(projectName);

      setCachedValue(
        MAIN_LABOR_CACHE,
        projectName,
        nextSummary,
      );

      if (requestId !== laborRequestIdRef.current) return;

      setLaborSummary(nextSummary);
    } catch (error) {
      if (requestId !== laborRequestIdRef.current) return;

      console.error(
        'Main 근로계약서 작성 현황 조회 오류:',
        error,
      );
      setLaborSummary(EMPTY_LABOR_SUMMARY);
      setLaborErrorMessage(
        error?.message || '근로계약 현황을 불러오지 못했습니다.',
      );
    } finally {
      if (requestId === laborRequestIdRef.current) {
        setLaborLoading(false);
      }
    }
  }, [projectName]);

  const loadProgress = useCallback(async ({ force = false } = {}) => {
    const requestId = progressRequestIdRef.current + 1;
    progressRequestIdRef.current = requestId;

    if (!projectName) {
      setProgressSummaryRows([]);
      setLoading(false);
      return;
    }

    const cachedEntry = MAIN_PROGRESS_CACHE.get(projectName);
    const progressChangedAt = getProgressChangedAt(projectName);
    const cachedSummary =
      cachedEntry &&
      Date.now() - cachedEntry.savedAt <= PROGRESS_CACHE_TTL_MS &&
      cachedEntry.savedAt >= progressChangedAt
        ? cachedEntry.value
        : null;

    if (!force && cachedSummary) {
      setProgressSummaryRows(cachedSummary);
      setErrorMessage('');
      setLoading(false);
      return;
    }

    const staleCache =
      cachedEntry?.savedAt >= progressChangedAt
        ? cachedEntry.value
        : null;

    if (staleCache) {
      setProgressSummaryRows(staleCache);
    } else {
      setProgressSummaryRows([]);
    }

    setLoading(!staleCache);
    setErrorMessage('');

    try {
      const rows = await fetchProgressSummary(projectName);
      setCachedValue(
        MAIN_PROGRESS_CACHE,
        projectName,
        rows,
      );

      if (requestId !== progressRequestIdRef.current) return;

      setProgressSummaryRows(rows);
    } catch (error) {
      if (requestId !== progressRequestIdRef.current) return;

      console.error('Main 공정현황 조회 오류:', error);
      setErrorMessage(
        error?.message || '공정현황을 불러오지 못했습니다.',
      );
    } finally {
      if (requestId === progressRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [projectName]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  useEffect(() => {
    loadLaborSummary();

    const timer = window.setInterval(
      () => loadLaborSummary({ force: true }),
      20 * 1000,
    );

    const handleFocus = () => {
      loadLaborSummary({ force: true });
    };

    const handleLaborChanged = () => {
      MAIN_LABOR_CACHE.delete(projectName);
      loadLaborSummary({ force: true });
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
    projectName,
  ]);

  useEffect(() => {
    const handleProgressChanged = (event) => {
      const changedProjectName = String(
        event?.detail?.projectName || '',
      ).trim();

      if (
        changedProjectName &&
        changedProjectName !== projectName
      ) {
        return;
      }

      MAIN_PROGRESS_CACHE.delete(projectName);
      loadProgress({ force: true });
    };

    window.addEventListener(
      'unit-progress-changed',
      handleProgressChanged,
    );

    return () => {
      window.removeEventListener(
        'unit-progress-changed',
        handleProgressChanged,
      );
    };
  }, [loadProgress, projectName]);

  const totalUnits = useMemo(
    () => getProjectCellKeys(buildingConfigs).size,
    [buildingConfigs],
  );

  const processStats = useMemo(() => {
    const completedMap = new Map();

    progressSummaryRows.forEach((row) => {
      completedMap.set(
        row.process_type,
        Number(row.completed_count || 0),
      );
    });

    return processOptions.map((processName) => {
      const completed =
        completedMap.get(processName) || 0;
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
  }, [processOptions, progressSummaryRows, totalUnits]);

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
    projectSchedule;

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

      <SystemNoticeDetailDialog
        open={noticeViewerOpen}
        notices={notices}
        selectedId={selectedNoticeId}
        onSelect={setSelectedNoticeId}
        onClose={() => setNoticeViewerOpen(false)}
      />

      <NoticeManageDialog
        open={noticeDialogOpen}
        notices={noticeAdminRows}
        draft={noticeDraft}
        imageFiles={noticeImageFiles}
        saving={noticeSaving}
        errorMessage={noticeErrorMessage}
        onSelect={handleSelectNoticeDraft}
        onNew={handleNewNoticeDraft}
        onChange={handleChangeNoticeDraft}
        onAddImages={handleAddNoticeImages}
        onRemoveImage={(path) =>
          setNoticeDraft((previous) => ({
            ...previous,
            image_paths: (previous.image_paths || []).filter(
              (item) => item !== path,
            ),
          }))
        }
        onRemoveNewImage={(index) =>
          setNoticeImageFiles((previous) =>
            previous.filter((_, itemIndex) => itemIndex !== index),
          )
        }
        onClose={() => {
          setNoticeDialogOpen(false);
          setNoticeImageFiles([]);
        }}
        onSave={handleSaveNotice}
      />

      <CalendarIssueEditDialog
        open={calendarIssueDialogOpen}
        draft={calendarIssueDraft}
        saving={calendarIssueSaving}
        canShareAllProjects={
          calendarIssueAccess.can_share_all_projects
        }
        minDate={calendarMonthBounds.firstDate}
        maxDate={calendarMonthBounds.lastDate}
        onChange={handleChangeCalendarIssueDraft}
        onClose={() => setCalendarIssueDialogOpen(false)}
        onSave={handleSaveCalendarIssue}
      />

      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        onClose={() =>
          setToast((previous) => ({ ...previous, open: false }))
        }
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() =>
            setToast((previous) => ({ ...previous, open: false }))
          }
          sx={{ fontWeight: 800 }}
        >
          {toast.message}
        </Alert>
      </Snackbar>

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
            lg: 'minmax(280px, 1fr) minmax(0, 2fr)',
          },
          gap: 1.2,
          alignItems: 'stretch',
        }}
      >
        <NoticePanel
          notices={notices.slice(0, 3)}
          canEdit={isSuperAdmin}
          onEdit={handleOpenNoticeEditor}
          onOpen={handleOpenNoticeViewer}
        />

        <CalendarPanel
          viewYear={viewYear}
          viewMonth={viewMonth}
          handlePrevMonth={handlePrevMonth}
          handleNextMonth={handleNextMonth}
          savedData={savedData}
          issues={calendarIssues}
          issuesLoading={calendarIssuesLoading}
          issuesErrorMessage={calendarIssuesErrorMessage}
          canWriteIssues={calendarIssueAccess.can_write}
          onCreateIssue={handleOpenCalendarIssueCreate}
          onEditIssue={handleOpenCalendarIssueEdit}
          onDeleteIssue={handleDeleteCalendarIssue}
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
            onRefresh={() => loadProgress({ force: true })}
          />
        )}
      </Box>
    </Box>
  );
}
