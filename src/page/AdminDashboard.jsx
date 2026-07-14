import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';

const PAGE_SIZE = 1000;

const pad2 = (value) => String(value).padStart(2, '0');

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

const isValidUnit = (config, floor, unitNumber) => {
  const exception = config?.exceptions?.[floor];
  const activeUnits = Array.isArray(exception?.units)
    ? exception.units
    : [];

  const isActiveOnPiloti = Boolean(exception) && activeUnits.includes(unitNumber);
  const isException =
    Boolean(exception) && !activeUnits.includes(unitNumber);
  const isPiloti =
    Array.isArray(config?.pilotiFloors) &&
    config.pilotiFloors.includes(floor) &&
    !isActiveOnPiloti;
  const isNonExistent =
    isException &&
    !(
      Array.isArray(config?.pilotiFloors) &&
      config.pilotiFloors.includes(floor)
    );

  return !isPiloti && !isNonExistent;
};

const calculateProjectUnits = (settings) =>
  settings.reduce((total, row) => {
    const config = row?.config_json || {};
    const floors = Number(config?.floors) || 0;
    const unitsPerFloor = Number(config?.unitsPerFloor) || 0;

    let buildingTotal = 0;

    for (let floor = 1; floor <= floors; floor += 1) {
      for (let unitNumber = 1; unitNumber <= unitsPerFloor; unitNumber += 1) {
        if (isValidUnit(config, floor, unitNumber)) {
          buildingTotal += 1;
        }
      }
    }

    return total + buildingTotal;
  }, 0);

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

        <Typography
          fontWeight={800}
          sx={{
            flexShrink: 0,
            px: 0.8,
            py: 0.25,
            borderRadius: 1,
            color: reportColor,
            bgcolor: project.hasTodayReport ? '#dcfce7' : '#fee2e2',
            fontSize: '0.68rem',
          }}
        >
          {reportLabel}
        </Typography>
      </Box>

      <Divider sx={{ my: 1.25 }} />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 0.8,
        }}
      >
        <Box>
          <Typography sx={{ color: '#64748b', fontSize: '0.67rem' }}>
            금일 출력
          </Typography>
          <Typography fontWeight={900} sx={{ mt: 0.2, fontSize: '1.05rem' }}>
            {project.todayWorkers.toLocaleString()}명
          </Typography>
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
        todayReports,
        progressRows,
      ] = await Promise.all([
        fetchAllRows(
          'building_settings',
          'project_name, building_name, config_json',
        ),
        fetchAllRows(
          'daily_reports',
          'project_name, date, workers, tasks, today_task, tomorrow_task, status',
          (query) => query.eq('date', todayKey),
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
      todayReports.forEach((row) => {
        if (row?.project_name) projectNames.add(row.project_name);
      });
      progressRows.forEach((row) => {
        if (row?.project_name) projectNames.add(row.project_name);
      });

      const projectList = Array.from(projectNames)
        .sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }))
        .map((projectName) => {
          const projectBuildings = buildingRows.filter(
            (row) => row.project_name === projectName,
          );
          const projectReports = todayReports.filter(
            (row) =>
              row.project_name === projectName &&
              hasMeaningfulDailyReport(row),
          );
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

          const todayWorkers = projectReports.reduce(
            (total, report) =>
              total + calculateWorkerCount(report?.workers),
            0,
          );

          return {
            projectName,
            buildingCount: projectBuildings.length,
            totalUnits,
            todayWorkers,
            completedProgress,
            fullyCompletedProcessCount,
            progressRate,
            hasTodayReport: projectReports.length > 0,
          };
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
    <Box
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

          <Button
            size="small"
            variant="outlined"
            onClick={loadDashboard}
          >
            새로고침
          </Button>
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
  );
}
