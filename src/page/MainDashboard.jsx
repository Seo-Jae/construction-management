import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import { supabase } from '../supabaseClient';
import { getProjectCellKeys } from '../utils/buildingUnits.js';
import { fetchPendingApprovalSummary } from '../utils/approvalQueries.js';

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

const NOTICES = [
  {
    date: '2026.07.14',
    category: '공지',
    title: '공사관리 시스템 테스트운영을 시작합니다.',
    content:
      '현장별 공사일보, 공정 진척, 업무 보고 기능을 순차적으로 적용합니다.',
  },
  {
    date: '2026.07.14',
    category: '안내',
    title: '계정 및 권한 관련 안내',
    content:
      '로그인 계정과 현장 권한에 문제가 있는 경우 최고관리자에게 문의해주세요.',
  },
  {
    date: '2026.07.14',
    category: '업데이트',
    title: '관리자 전체 현장 Dashboard 적용',
    content:
      '관리자와 최고관리자는 전체 현장의 금일 출력과 공정 현황을 확인할 수 있습니다.',
  },
];

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

function ApprovalCard({ counts, onNavigate }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        minHeight: 146,
        p: 1.7,
        borderColor: '#fed7aa',
        bgcolor:
          'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)',
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
            <FactCheckOutlinedIcon
              sx={{ color: '#ea580c', fontSize: 22 }}
            />
            <Typography
              sx={{
                color: '#0f172a',
                fontSize: '0.88rem',
                fontWeight: 900,
              }}
            >
              결재승인 요청
            </Typography>
          </Box>

          <Typography
            sx={{
              color: '#9a3412',
              fontSize: '1.45rem',
              fontWeight: 900,
              letterSpacing: '-0.04em',
            }}
          >
            {counts.total.toLocaleString()}건
          </Typography>
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
            ['주간 보고', counts.weekly],
            ['품의 보고', counts.proposal],
            ['기타', counts.other],
          ].map(([label, count]) => (
            <Box
              key={label}
              sx={{
                px: 0.7,
                py: 0.7,
                borderRadius: 1.1,
                border: '1px solid #ffedd5',
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
                  color: '#9a3412',
                  fontSize: '0.76rem',
                  fontWeight: 900,
                }}
              >
                {Number(count || 0).toLocaleString()}건
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
          <Typography
            sx={{
              color: '#78716c',
              fontSize: '0.66rem',
            }}
          >
            현재 로그인 이메일에 배정된 결재 대기 건수입니다.
          </Typography>

          <Button
            size="small"
            variant="outlined"
            onClick={() => onNavigate?.('approval-inbox')}
            sx={{
              flexShrink: 0,
              minWidth: 0,
              px: 1,
              py: 0.35,
              color: '#c2410c',
              borderColor: '#fdba74',
              fontSize: '0.67rem',
              fontWeight: 800,
              '&:hover': {
                borderColor: '#fb923c',
                bgcolor: '#fff7ed',
              },
            }}
          >
            결재 처리
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}

function NoticePanel() {
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

      <Box
        sx={{
          mt: 0.6,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {NOTICES.map((notice, index) => (
          <Box
            key={`${notice.date}-${notice.title}`}
            sx={{
              py: 1.15,
              borderBottom:
                index === NOTICES.length - 1
                  ? 'none'
                  : '1px solid #eef2f7',
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

              <Typography
                sx={{
                  color: '#94a3b8',
                  fontSize: '0.62rem',
                }}
              >
                {notice.date}
              </Typography>
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
          </Box>
        ))}
      </Box>
    </Paper>
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
  buildingConfigs = {},
  processOptions = [],
  savedData = {},
  viewYear,
  viewMonth,
  handlePrevMonth,
  handleNextMonth,
  onNavigate,
}) {
  const [progressRows, setProgressRows] = useState([]);
  const [approvalCounts, setApprovalCounts] = useState({
    total: 0,
    weekly: 0,
    proposal: 0,
    other: 0,
  });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const loadApprovalCounts =
    useCallback(async () => {
      try {
        const result =
          await fetchPendingApprovalSummary();

        setApprovalCounts(result.counts);
      } catch (error) {
        console.error(
          'Main 결재 대기 건수 조회 오류:',
          error,
        );

        setApprovalCounts({
          total: 0,
          weekly: 0,
          proposal: 0,
          other: 0,
        });
      }
    }, []);

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
    loadApprovalCounts();

    const timer = window.setInterval(
      loadApprovalCounts,
      20 * 1000,
    );

    const handleFocus = () => {
      loadApprovalCounts();
    };

    const handleApprovalChanged = () => {
      loadApprovalCounts();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener(
      'approval-workflow-changed',
      handleApprovalChanged,
    );

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(
        'approval-workflow-changed',
        handleApprovalChanged,
      );
    };
  }, [
    loadApprovalCounts,
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

        <ApprovalCard
          counts={approvalCounts}
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
        <NoticePanel />

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
