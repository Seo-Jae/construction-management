import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  SvgIcon,
  Tooltip,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';
import { countUniqueUnits } from '../utils/buildingUnits.js';

const PAGE_SIZE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const PROJECT_SCHEDULES = {
  '한라건설 용인금어지구': {
    startDate: '25.06.30',
    endDate: '26.12.31',
  },
  '현대건설 용인마크밸리': {
    startDate: '25.10.31',
    endDate: '27.12.07',
  },
  '대우건설 용인현장': {
    startDate: '26.04.15',
    endDate: '28.02.29',
  },
};

const pad2 = (value) => String(value).padStart(2, '0');

const parseDateKeyToUtc = (dateKey) => {
  const parts = String(dateKey || '')
    .split('.')
    .map(Number);

  if (
    parts.length !== 3 ||
    parts.some((value) => !Number.isFinite(value))
  ) {
    return null;
  }

  const [yy, month, day] = parts;
  const fullYear = yy < 100 ? 2000 + yy : yy;

  return Date.UTC(fullYear, month - 1, day);
};

const getProjectSchedule = (projectName, todayKey) => {
  const schedule = PROJECT_SCHEDULES[projectName];

  if (!schedule) {
    return {
      startDate: '-',
      endDate: '-',
      startSort: Number.MAX_SAFE_INTEGER,
      dDayLabel: '일정 미등록',
      dDayState: 'unknown',
    };
  }

  const todayUtc = parseDateKeyToUtc(todayKey);
  const startUtc = parseDateKeyToUtc(schedule.startDate);
  const endUtc = parseDateKeyToUtc(schedule.endDate);

  let dDayLabel = 'D-000';
  let dDayState = 'active';

  if (todayUtc !== null && endUtc !== null) {
    const remainingDays = Math.round((endUtc - todayUtc) / DAY_MS);

    if (remainingDays > 0) {
      dDayLabel = `D-${String(remainingDays).padStart(3, '0')}`;
    } else if (remainingDays === 0) {
      dDayLabel = 'D-DAY';
      dDayState = 'today';
    } else {
      dDayLabel = `D+${String(Math.abs(remainingDays)).padStart(3, '0')}`;
      dDayState = 'expired';
    }
  }

  return {
    ...schedule,
    startSort:
      startUtc === null ? Number.MAX_SAFE_INTEGER : startUtc,
    dDayLabel,
    dDayState,
  };
};

const formatKoreaYYMMDD = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const values = {};

  formatter.formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  });

  const yy = String(values.year).slice(2);
  return `${yy}.${values.month}.${values.day}`;
};

const dateKeyToNumber = (dateKey) => {
  const parts = String(dateKey || '')
    .split('.')
    .map(Number);

  if (
    parts.length !== 3 ||
    parts.some((value) => !Number.isFinite(value))
  ) {
    return null;
  }

  const [yy, mm, dd] = parts;
  return (2000 + yy) * 10000 + mm * 100 + dd;
};

function PrinterIcon(props) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path d="M6 9V3h12v6h1a3 3 0 0 1 3 3v5h-4v4H6v-4H2v-5a3 3 0 0 1 3-3h1Zm2-4v4h8V5H8Zm8 14v-5H8v5h8Zm3-4h1v-3a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v3h2v-3h12v3h1Z" />
    </SvgIcon>
  );
}

const hasMeaningfulDailyReport = (report) => {
  const workers = Array.isArray(report?.workers)
    ? report.workers
    : [];
  const tasks = Array.isArray(report?.tasks)
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

  const todayTask = String(report?.today_task || '').trim();
  const tomorrowTask = String(report?.tomorrow_task || '').trim();

  /*
    단순히 마감 상태 행만 존재하는 것은 일보 등록으로 보지 않습니다.
    근로자/작업 내용 또는 '작업없음' 같은 실제 내용이 있어야 등록입니다.
  */
  return Boolean(
    hasWorker ||
      hasTask ||
      todayTask ||
      tomorrowTask,
  );
};

const calculateProjectUnits = (settings) =>
  settings.reduce(
    (total, row) =>
      total + countUniqueUnits(row?.config_json || {}),
    0,
  );

const calculateWorkerCount = (workers) =>
  (Array.isArray(workers) ? workers : []).reduce((total, worker) => {
    const day = Number(worker?.day) || 0;
    const night = Number(worker?.night) || 0;
    return total + day + night;
  }, 0);

const fetchAllRows = async (table, columns, queryBuilder) => {
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);

    if (typeof queryBuilder === 'function') {
      query = queryBuilder(query);
    }

    const { data, error } = await query;

    if (error) throw error;

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
};

function SummaryBox({ label, value, detail }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        minHeight: 92,
        borderColor: '#dbe3ee',
        bgcolor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <Typography sx={{ color: '#64748b', fontSize: '0.73rem' }}>
        {label}
      </Typography>
      <Typography
        fontWeight={900}
        sx={{ mt: 0.35, color: '#0f172a', fontSize: '1.45rem' }}
      >
        {value}
      </Typography>
      {detail && (
        <Typography sx={{ mt: 0.2, color: '#94a3b8', fontSize: '0.68rem' }}>
          {detail}
        </Typography>
      )}
    </Paper>
  );
}

function ProjectCard({ project, onOpenProject }) {
  const reportLabel = project.hasTodayReport ? '일보 등록' : '일보 미등록';
  const reportColor = project.hasTodayReport ? '#15803d' : '#dc2626';
  const rate = Number(project.progressRate) || 0;

  const dDayStyle =
    project.dDayState === 'expired'
      ? {
          color: '#64748b',
          bgcolor: '#e2e8f0',
        }
      : project.dDayState === 'today'
        ? {
            color: '#b91c1c',
            bgcolor: '#fee2e2',
          }
        : project.dDayState === 'unknown'
          ? {
              color: '#64748b',
              bgcolor: '#f1f5f9',
            }
          : {
              color: '#9a3412',
              bgcolor: '#ffedd5',
            };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.7,
        borderColor: '#cbd5e1',
        bgcolor: '#ffffff',
        boxShadow: '0 2px 9px rgba(15, 23, 42, 0.05)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            noWrap
            fontWeight={900}
            sx={{ color: '#1e293b', fontSize: '1rem' }}
          >
            {project.projectName}
          </Typography>
          <Typography sx={{ mt: 0.25, color: '#64748b', fontSize: '0.7rem' }}>
            {project.buildingCount}개 동 · 전체 {project.totalUnits.toLocaleString()}세대
          </Typography>
        </Box>

        <Box
          sx={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 0.55,
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              mr: 0.15,
              textAlign: 'right',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
            }}
          >
            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.61rem',
                lineHeight: 1.35,
              }}
            >
              시작일 {project.startDate}
            </Typography>
            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.61rem',
                lineHeight: 1.35,
              }}
            >
              종료일 {project.endDate}
            </Typography>
          </Box>

          <Typography
            fontWeight={900}
            sx={{
              flexShrink: 0,
              minWidth: project.dDayState === 'unknown' ? 66 : 52,
              px: 0.75,
              py: 0.28,
              borderRadius: 1,
              textAlign: 'center',
              fontSize: '0.68rem',
              ...dDayStyle,
            }}
          >
            {project.dDayLabel}
          </Typography>

          <Typography
            fontWeight={800}
            sx={{
              flexShrink: 0,
              px: 0.8,
              py: 0.28,
              borderRadius: 1,
              color: reportColor,
              bgcolor: project.hasTodayReport ? '#dcfce7' : '#fee2e2',
              fontSize: '0.68rem',
            }}
          >
            {reportLabel}
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ my: 1.25 }} />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1.45fr 0.85fr 0.85fr',
          gap: 0.8,
          alignItems: 'stretch',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '0.82fr 1.18fr',
            gap: 0.85,
            minWidth: 0,
          }}
        >
          <Box>
            <Typography sx={{ color: '#64748b', fontSize: '0.67rem' }}>
              금일 출력
            </Typography>
            <Typography
              fontWeight={900}
              sx={{ mt: 0.2, fontSize: '1.05rem' }}
            >
              {project.todayWorkers.toLocaleString()}명
            </Typography>
          </Box>

          <Box
            sx={{
              pl: 0.9,
              borderLeft: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 0.18,
              minWidth: 0,
            }}
          >
            {[
              `전일누계: ${project.previousWorkers.toLocaleString()}명`,
              `금일출력: ${project.todayWorkers.toLocaleString()}명`,
              `누계출력: ${project.cumulativeWorkers.toLocaleString()}명`,
            ].map((label) => (
              <Typography
                key={label}
                sx={{
                  color: '#475569',
                  fontSize: '0.66rem',
                  fontWeight: 400,
                  lineHeight: 1.35,
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </Typography>
            ))}
          </Box>
        </Box>

        <Box>
          <Typography sx={{ color: '#64748b', fontSize: '0.67rem' }}>
            공정 완료
          </Typography>
          <Typography fontWeight={900} sx={{ mt: 0.2, fontSize: '1.05rem' }}>
            {project.fullyCompletedProcessCount.toLocaleString()}건
          </Typography>
        </Box>

        <Box>
          <Typography sx={{ color: '#64748b', fontSize: '0.67rem' }}>
            작업 공정률
          </Typography>
          <Typography
            fontWeight={900}
            sx={{ mt: 0.2, color: '#0284c7', fontSize: '1.05rem' }}
          >
            {rate.toFixed(1)}%
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          mt: 1.2,
          height: 7,
          borderRadius: 999,
          bgcolor: '#e2e8f0',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${Math.min(100, Math.max(0, rate))}%`,
            height: '100%',
            bgcolor: '#0ea5e9',
          }}
        />
      </Box>

      <Button
        className="admin-dashboard-no-print"
        fullWidth
        size="small"
        variant="contained"
        onClick={() => onOpenProject(project.projectName)}
        sx={{
          mt: 1.35,
          bgcolor: '#334155',
          boxShadow: 'none',
          fontSize: '0.73rem',
          '&:hover': {
            bgcolor: '#1e293b',
            boxShadow: 'none',
          },
        }}
      >
        현장 열기
      </Button>
    </Paper>
  );
}

export default function AdminDashboard({
  processOptions = [],
  onOpenProject,
}) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [koreaTodayKey, setKoreaTodayKey] = useState(() =>
    formatKoreaYYMMDD(),
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextKey = formatKoreaYYMMDD();

      setKoreaTodayKey((currentKey) =>
        currentKey === nextKey ? currentKey : nextKey,
      );
    }, 60 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const todayKey = koreaTodayKey;

      const [
        buildingRows,
        dailyReports,
        progressRows,
      ] = await Promise.all([
        fetchAllRows(
          'building_settings',
          'project_name, building_name, config_json',
        ),
        fetchAllRows(
          'daily_reports',
          'project_name, date, workers, tasks, today_task, tomorrow_task, status',
        ),
        fetchAllRows(
          'unit_progress',
          'project_name, building, unit, process_type, status',
        ),
      ]);

      const projectNames = new Set();

      buildingRows.forEach((row) => {
        if (row?.project_name) projectNames.add(row.project_name);
      });
      dailyReports.forEach((row) => {
        if (row?.project_name) projectNames.add(row.project_name);
      });
      progressRows.forEach((row) => {
        if (row?.project_name) projectNames.add(row.project_name);
      });

      const projectList = Array.from(projectNames)
        .map((projectName) => {
          const projectSchedule = getProjectSchedule(
            projectName,
            todayKey,
          );

          const projectBuildings = buildingRows.filter(
            (row) => row.project_name === projectName,
          );
          const todayDateNumber = dateKeyToNumber(todayKey);

          const projectAllReports = dailyReports.filter(
            (row) => row.project_name === projectName,
          );

          const projectReports = projectAllReports.filter(
            (row) =>
              row.date === todayKey &&
              hasMeaningfulDailyReport(row),
          );

          const previousReports = projectAllReports.filter((row) => {
            const reportDateNumber = dateKeyToNumber(row.date);

            return (
              reportDateNumber !== null &&
              todayDateNumber !== null &&
              reportDateNumber < todayDateNumber
            );
          });

          const projectProgress = progressRows.filter(
            (row) => row.project_name === projectName,
          );

          const totalUnits = calculateProjectUnits(projectBuildings);
          const processCount = Math.max(1, processOptions.length);
          const totalProgressTargets = totalUnits * processCount;

          /*
            전체 공정률:
            전체 세대 × 전체 공정 수를 기준으로 계산합니다.

            공정 완료:
            해당 공정이 현장의 전체 세대에서 100% 완료됐을 때만
            공정 1건 완료로 집계합니다.
          */
          const uniqueCompleted = new Set();
          const completedUnitsByProcess = {};

          projectProgress.forEach((row) => {
            if (row?.status !== '작업완료' || !row?.process_type) return;

            const unitKey = [
              row.building,
              row.unit,
            ].join('|');

            const fullKey = [
              row.project_name,
              row.building,
              row.unit,
              row.process_type,
            ].join('|');

            uniqueCompleted.add(fullKey);

            if (!completedUnitsByProcess[row.process_type]) {
              completedUnitsByProcess[row.process_type] = new Set();
            }

            completedUnitsByProcess[row.process_type].add(unitKey);
          });

          const fullyCompletedProcessCount = Object.values(
            completedUnitsByProcess,
          ).filter(
            (completedUnits) =>
              totalUnits > 0 && completedUnits.size >= totalUnits,
          ).length;

          const completedProgress = uniqueCompleted.size;
          const progressRate =
            totalProgressTargets === 0
              ? 0
              : (completedProgress / totalProgressTargets) * 100;

          const previousWorkers = previousReports.reduce(
            (total, report) =>
              total + calculateWorkerCount(report?.workers),
            0,
          );

          const todayWorkers = projectReports.reduce(
            (total, report) =>
              total + calculateWorkerCount(report?.workers),
            0,
          );

          const cumulativeWorkers =
            previousWorkers + todayWorkers;

          return {
            projectName,
            buildingCount: projectBuildings.length,
            totalUnits,
            previousWorkers,
            todayWorkers,
            cumulativeWorkers,
            completedProgress,
            fullyCompletedProcessCount,
            progressRate,
            hasTodayReport: projectReports.length > 0,
            ...projectSchedule,
          };
        })
        .sort((a, b) => {
          if (a.startSort !== b.startSort) {
            return a.startSort - b.startSort;
          }

          return a.projectName.localeCompare(
            b.projectName,
            'ko',
            {
              numeric: true,
            },
          );
        });

      setProjects(projectList);
    } catch (error) {
      console.error('관리자 Dashboard 조회 오류:', error);
      setProjects([]);
      setErrorMessage(
        error?.message ||
          '전체 현장 데이터를 불러오지 못했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }, [processOptions, koreaTodayKey]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const totals = useMemo(() => {
    const totalProjects = projects.length;
    const todayWorkers = projects.reduce(
      (sum, project) => sum + project.todayWorkers,
      0,
    );
    const submittedReports = projects.filter(
      (project) => project.hasTodayReport,
    ).length;
    const averageProgress =
      totalProjects === 0
        ? 0
        : projects.reduce(
            (sum, project) => sum + project.progressRate,
            0,
          ) / totalProjects;

    return {
      totalProjects,
      todayWorkers,
      submittedReports,
      averageProgress,
    };
  }, [projects]);

  const handlePrintDashboard = () => {
    window.print();
  };

  if (loading) {
    return (
      <Paper
        variant="outlined"
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderColor: '#cbd5e1',
        }}
      >
        <CircularProgress size={30} />
      </Paper>
    );
  }

  return (
    <>
      <style>
        {`
          @media print {
            @page {
              size: A4 landscape;
              margin: 10mm;
            }

            html,
            body {
              background: #ffffff !important;
            }

            body * {
              visibility: hidden !important;
            }

            #admin-dashboard-print-area,
            #admin-dashboard-print-area * {
              visibility: visible !important;
            }

            #admin-dashboard-print-area {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
              padding: 0 !important;
              margin: 0 !important;
              background: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            #admin-dashboard-print-area .admin-dashboard-no-print {
              display: none !important;
            }

            #admin-dashboard-print-area .MuiPaper-root {
              break-inside: avoid;
              page-break-inside: avoid;
              box-shadow: none !important;
            }
          }
        `}
      </style>

      <Box
        id="admin-dashboard-print-area"
        sx={{
          height: '100%',
          minHeight: 0,
          overflowY: 'auto',
          pr: 0.4,
        }}
      >
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          mb: 1.5,
          borderColor: '#cbd5e1',
          bgcolor: '#ffffff',
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
          <Box>
            <Typography
              fontWeight={900}
              sx={{
                color: '#0f172a',
                fontSize: '1.18rem',
                lineHeight: 1.2,
              }}
            >
              욱림건설
            </Typography>
            <Typography
              fontWeight={800}
              sx={{
                mt: 0.15,
                color: '#334155',
                fontSize: '0.93rem',
              }}
            >
              전체 현장 Dashboard
            </Typography>
            <Typography sx={{ mt: 0.35, color: '#64748b', fontSize: '0.73rem' }}>
              등록된 모든 현장의 금일 출력과 공정 현황을 확인합니다.
            </Typography>
          </Box>

          <Box
            className="admin-dashboard-no-print"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.7,
            }}
          >
            <Tooltip title="Dashboard 인쇄">
              <IconButton
                size="small"
                aria-label="Dashboard 인쇄"
                onClick={handlePrintDashboard}
                sx={{
                  width: 32,
                  height: 32,
                  border: '1px solid #93c5fd',
                  borderRadius: 1,
                  color: '#2563eb',
                  bgcolor: '#ffffff',
                  '&:hover': {
                    bgcolor: '#eff6ff',
                    borderColor: '#60a5fa',
                  },
                }}
              >
                <PrinterIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>

            <Button
              size="small"
              variant="outlined"
              onClick={loadDashboard}
            >
              새로고침
            </Button>
          </Box>
        </Box>
      </Paper>

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {errorMessage}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(4, minmax(0, 1fr))',
          },
          gap: 1.2,
          mb: 1.5,
        }}
      >
        <SummaryBox
          label="전체 현장"
          value={`${totals.totalProjects}개`}
        />
        <SummaryBox
          label="금일 총출력"
          value={`${totals.todayWorkers.toLocaleString()}명`}
        />
        <SummaryBox
          label="금일 일보 등록"
          value={`${totals.submittedReports}/${totals.totalProjects}`}
        />
        <SummaryBox
          label="평균 작업 공정률"
          value={`${totals.averageProgress.toFixed(1)}%`}
          detail="전체 공정·전체 세대 기준"
        />
      </Box>

      {projects.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            py: 8,
            textAlign: 'center',
            borderColor: '#cbd5e1',
            bgcolor: '#ffffff',
          }}
        >
          <Typography fontWeight={800} color="#475569">
            조회 가능한 현장이 없습니다.
          </Typography>
          <Typography sx={{ mt: 0.6, color: '#94a3b8', fontSize: '0.75rem' }}>
            관리자 계정의 Supabase 조회 권한과 현장 데이터를 확인해주세요.
          </Typography>
        </Paper>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: 'repeat(2, minmax(0, 1fr))',
              xl: 'repeat(3, minmax(0, 1fr))',
            },
            gap: 1.2,
            pb: 1,
          }}
        >
          {projects.map((project) => (
            <ProjectCard
              key={project.projectName}
              project={project}
              onOpenProject={onOpenProject}
            />
          ))}
        </Box>
      )}
      </Box>
    </>
  );
}
