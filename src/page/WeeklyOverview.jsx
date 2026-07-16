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
  CircularProgress,
  Divider,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';

const SUPABASE_PAGE_SIZE = 1000;
const MAX_LINES_PER_PROJECT = 10;

const PROJECT_DISPLAY_ORDER = [
  '한라건설 용인금어지구',
  '현대건설 용인마크밸리',
  '대우건설 용인현장',
];

const pad2 = (value) =>
  String(value).padStart(2, '0');

const formatKoreaISODate = (date = new Date()) => {
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

  return `${values.year}-${values.month}-${values.day}`;
};

const formatUtcDateToISO = (utcValue) => {
  const date = new Date(utcValue);

  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join('-');
};

const getKoreaWeekRange = (date = new Date()) => {
  const todayKey = formatKoreaISODate(date);
  const [year, month, day] = todayKey
    .split('-')
    .map(Number);

  const todayUtc = Date.UTC(
    year,
    month - 1,
    day,
  );
  const dayOfWeek = new Date(todayUtc).getUTCDay();
  const weekStartUtc =
    todayUtc - dayOfWeek * 24 * 60 * 60 * 1000;
  const weekEndUtc =
    weekStartUtc + 6 * 24 * 60 * 60 * 1000;

  return {
    weekStart: formatUtcDateToISO(weekStartUtc),
    weekEnd: formatUtcDateToISO(weekEndUtc),
  };
};

const formatDisplayDate = (dateKey) => {
  if (!dateKey) {
    return '';
  }

  const [year, month, day] = dateKey.split('-');

  return `${year}.${month}.${day}`;
};

const createEmptyLines = () =>
  Array.from(
    { length: MAX_LINES_PER_PROJECT },
    () => '',
  );

const normalizeLines = (values) => {
  const source = Array.isArray(values)
    ? values
    : [];

  return Array.from(
    { length: MAX_LINES_PER_PROJECT },
    (_, index) =>
      String(source[index] || '').trim(),
  );
};

const sortProjectNames = (projectNames) =>
  [...projectNames].sort((first, second) => {
    const firstIndex =
      PROJECT_DISPLAY_ORDER.indexOf(first);
    const secondIndex =
      PROJECT_DISPLAY_ORDER.indexOf(second);

    if (firstIndex !== -1 || secondIndex !== -1) {
      if (firstIndex === -1) {
        return 1;
      }

      if (secondIndex === -1) {
        return -1;
      }

      return firstIndex - secondIndex;
    }

    return String(first).localeCompare(
      String(second),
      'ko',
    );
  });

const fetchAllProjectNames = async () => {
  const allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('building_settings')
      .select('project_name')
      .not('project_name', 'is', null)
      .order('project_name', {
        ascending: true,
      })
      .range(
        from,
        from + SUPABASE_PAGE_SIZE - 1,
      );

    if (error) {
      throw error;
    }

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  return sortProjectNames(
    Array.from(
      new Set(
        allRows
          .map((row) =>
            String(
              row?.project_name || '',
            ).trim(),
          )
          .filter(Boolean),
      ),
    ),
  );
};

const createSourceProjectRows = ({
  projectNames,
  weeklyReports,
}) => {
  const reportMap = new Map(
    (weeklyReports || []).map((report) => [
      report.project_name,
      report,
    ]),
  );

  return projectNames.map((projectName) => {
    const report = reportMap.get(projectName);
    const sourceLines = normalizeLines(
      report?.payload?.nextWeekHighlights,
    );

    return {
      projectName,
      registered: Boolean(report),
      completedAt: report?.completed_at || null,
      sourceLines,
      lines: [...sourceLines],
    };
  });
};

const mergeSavedProjects = ({
  sourceProjects,
  savedPayload,
}) => {
  const savedProjects = Array.isArray(
    savedPayload?.projects,
  )
    ? savedPayload.projects
    : [];

  if (savedProjects.length === 0) {
    return sourceProjects;
  }

  const savedMap = new Map(
    savedProjects.map((project) => [
      project.projectName,
      project,
    ]),
  );

  return sourceProjects.map((sourceProject) => {
    const savedProject = savedMap.get(
      sourceProject.projectName,
    );

    if (!savedProject) {
      return sourceProject;
    }

    return {
      ...sourceProject,
      lines: normalizeLines(
        savedProject.lines,
      ),
    };
  });
};

const countFilledLines = (lines) =>
  normalizeLines(lines).filter(Boolean).length;

function ProjectInputCard({
  project,
  onLineChange,
  onClearLine,
  onClearProject,
  onRestoreProject,
}) {
  const filledCount = countFilledLines(
    project.lines,
  );

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 1.2,
        overflow: 'hidden',
        borderColor: '#cbd5e1',
        boxShadow: 'none',
      }}
    >
      <Box
        sx={{
          px: 1.15,
          py: 0.85,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          bgcolor: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              color: '#0f172a',
              fontSize: '0.8rem',
              fontWeight: 900,
            }}
          >
            {project.projectName}
          </Typography>

          <Typography
            sx={{
              mt: 0.15,
              color: project.registered
                ? '#15803d'
                : '#dc2626',
              fontSize: '0.64rem',
              fontWeight: 800,
            }}
          >
            {project.registered
              ? '주간업무 등록'
              : '주간업무 미등록'}
            {' · '}
            입력 {filledCount}/10
          </Typography>
        </Box>

        <Box
          sx={{
            flexShrink: 0,
            display: 'flex',
            gap: 0.45,
          }}
        >
          <Button
            size="small"
            variant="outlined"
            onClick={() =>
              onRestoreProject(
                project.projectName,
              )
            }
            sx={{
              minWidth: 58,
              px: 0.7,
              whiteSpace: 'nowrap',
              fontSize: '0.63rem',
              fontWeight: 800,
            }}
          >
            원본복원
          </Button>

          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() =>
              onClearProject(
                project.projectName,
              )
            }
            sx={{
              minWidth: 52,
              px: 0.7,
              whiteSpace: 'nowrap',
              fontSize: '0.63rem',
              fontWeight: 800,
            }}
          >
            전체삭제
          </Button>
        </Box>
      </Box>

      <Box sx={{ p: 1 }}>
        {project.lines.map((value, index) => (
          <Box
            key={`${project.projectName}-${index}`}
            sx={{
              mb:
                index ===
                MAX_LINES_PER_PROJECT - 1
                  ? 0
                  : 0.55,
              display: 'grid',
              gridTemplateColumns:
                '28px minmax(0, 1fr) 36px',
              gap: 0.45,
              alignItems: 'stretch',
            }}
          >
            <Box
              sx={{
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
                bgcolor: '#f1f5f9',
                fontSize: '0.66rem',
                fontWeight: 900,
              }}
            >
              {index + 1}
            </Box>

            <TextField
              fullWidth
              size="small"
              value={value}
              placeholder={
                project.registered
                  ? '주간업무 주요보고 내용'
                  : '직접 입력'
              }
              onChange={(event) =>
                onLineChange(
                  project.projectName,
                  index,
                  event.target.value,
                )
              }
              multiline
              minRows={1}
              maxRows={3}
              sx={{
                '& .MuiInputBase-root': {
                  minHeight: 36,
                  alignItems: 'flex-start',
                },
                '& .MuiInputBase-input': {
                  fontSize: '0.72rem',
                  lineHeight: 1.45,
                },
              }}
            />

            <Button
              size="small"
              variant="outlined"
              color="error"
              disabled={!value}
              onClick={() =>
                onClearLine(
                  project.projectName,
                  index,
                )
              }
              sx={{
                minWidth: 36,
                width: 36,
                px: 0,
                fontSize: '0.8rem',
                fontWeight: 900,
              }}
            >
              ×
            </Button>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

function WeeklyOverviewPreview({
  weekRange,
  projects,
  updatedByName,
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        width: 850,
        minHeight: 1020,
        mx: 'auto',
        bgcolor: '#ffffff',
        color: '#0f172a',
        borderColor: '#94a3b8',
        boxShadow:
          '0 8px 28px rgba(15, 23, 42, 0.12)',
        fontFamily:
          '"Malgun Gothic", "맑은 고딕", sans-serif',
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 2.4,
          borderTop: '1px solid #334155',
          borderLeft: '1px solid #334155',
          borderRight: '1px solid #334155',
          borderBottom: '1px solid #334155',
          textAlign: 'center',
        }}
      >
        <Typography
          sx={{
            fontSize: '1.75rem',
            fontWeight: 900,
            letterSpacing: '0.2em',
          }}
        >
          주간업무총괄
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '90px 1fr 90px 180px',
          borderLeft: '1px solid #334155',
        }}
      >
        <Box sx={previewLabelSx}>기간</Box>
        <Box sx={previewValueSx}>
          {formatDisplayDate(weekRange.weekStart)}
          {' ~ '}
          {formatDisplayDate(weekRange.weekEnd)}
        </Box>

        <Box sx={previewLabelSx}>작성자</Box>
        <Box sx={previewValueSx}>
          {updatedByName || ''}
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '55px 210px 1fr',
          borderTop: '1px solid #334155',
          borderLeft: '1px solid #334155',
        }}
      >
        {['No.', '현장명', '주요보고 내용'].map(
          (label) => (
            <Box key={label} sx={previewHeaderSx}>
              {label}
            </Box>
          ),
        )}

        {projects.map((project, projectIndex) =>
          project.lines.map((line, lineIndex) => (
            <React.Fragment
              key={`${project.projectName}-${lineIndex}`}
            >
              <Box sx={previewBodyCenterSx}>
                {lineIndex === 0
                  ? projectIndex + 1
                  : ''}
              </Box>

              <Box sx={previewBodyCenterSx}>
                {lineIndex === 0
                  ? project.projectName
                  : ''}
              </Box>

              <Box
                sx={{
                  ...previewBodySx,
                  minHeight: 38,
                  color: line
                    ? '#0f172a'
                    : '#cbd5e1',
                }}
              >
                {line || ''}
              </Box>
            </React.Fragment>
          )),
        )}
      </Box>
    </Paper>
  );
}

const previewLabelSx = {
  p: 0.7,
  borderRight: '1px solid #334155',
  borderBottom: '1px solid #334155',
  bgcolor: '#f1f5f9',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.68rem',
  fontWeight: 900,
  textAlign: 'center',
};

const previewValueSx = {
  p: 0.7,
  borderRight: '1px solid #334155',
  borderBottom: '1px solid #334155',
  display: 'flex',
  alignItems: 'center',
  fontSize: '0.68rem',
};

const previewHeaderSx = {
  p: 0.72,
  borderRight: '1px solid #334155',
  borderBottom: '1px solid #334155',
  bgcolor: '#e2e8f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  fontSize: '0.7rem',
  fontWeight: 900,
};

const previewBodySx = {
  px: 0.85,
  py: 0.55,
  borderRight: '1px solid #64748b',
  borderBottom: '1px solid #94a3b8',
  display: 'flex',
  alignItems: 'center',
  fontSize: '0.67rem',
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const previewBodyCenterSx = {
  ...previewBodySx,
  justifyContent: 'center',
  textAlign: 'center',
  color: '#334155',
  fontWeight: 800,
};

export default function WeeklyOverview({
  userProfile,
}) {
  const weekRange = useMemo(
    () => getKoreaWeekRange(),
    [],
  );

  const [projects, setProjects] = useState([]);
  const [sourceProjects, setSourceProjects] =
    useState([]);
  const [savedOverview, setSavedOverview] =
    useState(null);
  const [updatedByName, setUpdatedByName] =
    useState(
      userProfile?.manager_name ||
        userProfile?.name ||
        '',
    );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState('');
  const [successMessage, setSuccessMessage] =
    useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const projectNames =
        await fetchAllProjectNames();

      const [
        {
          data: weeklyReports,
          error: weeklyError,
        },
        {
          data: overview,
          error: overviewError,
        },
      ] = await Promise.all([
        supabase
          .from('weekly_reports')
          .select(
            `
            id,
            project_name,
            week_start,
            week_end,
            payload,
            status,
            completed_at
          `,
          )
          .eq(
            'week_start',
            weekRange.weekStart,
          )
          .eq('status', 'completed'),

        supabase
          .from('weekly_overviews')
          .select(
            `
            id,
            week_start,
            week_end,
            display_period,
            payload,
            updated_by_name,
            updated_at
          `,
          )
          .eq(
            'week_start',
            weekRange.weekStart,
          )
          .maybeSingle(),
      ]);

      if (weeklyError) {
        throw weeklyError;
      }

      if (overviewError) {
        throw overviewError;
      }

      const extraProjectNames = (
        weeklyReports || []
      )
        .map((report) => report.project_name)
        .filter(Boolean);

      const allProjectNames = sortProjectNames(
        Array.from(
          new Set([
            ...projectNames,
            ...extraProjectNames,
          ]),
        ),
      );

      const nextSourceProjects =
        createSourceProjectRows({
          projectNames: allProjectNames,
          weeklyReports: weeklyReports || [],
        });

      const nextProjects =
        mergeSavedProjects({
          sourceProjects: nextSourceProjects,
          savedPayload: overview?.payload,
        });

      setSourceProjects(nextSourceProjects);
      setProjects(nextProjects);
      setSavedOverview(overview || null);
      setUpdatedByName(
        overview?.updated_by_name ||
          userProfile?.manager_name ||
          userProfile?.name ||
          '',
      );
    } catch (error) {
      console.error(
        '주간업무총괄 조회 실패:',
        error,
      );
      setErrorMessage(
        error?.message ||
          '주간업무총괄을 불러오지 못했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }, [
    userProfile?.manager_name,
    userProfile?.name,
    weekRange.weekStart,
  ]);

  useEffect(() => {
    loadData();

    const handleFocus = () => {
      loadData();
    };

    const handleWeeklyCompleted = () => {
      loadData();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener(
      'weekly-report-completed',
      handleWeeklyCompleted,
    );

    return () => {
      window.removeEventListener(
        'focus',
        handleFocus,
      );
      window.removeEventListener(
        'weekly-report-completed',
        handleWeeklyCompleted,
      );
    };
  }, [loadData]);

  const handleLineChange = (
    projectName,
    index,
    value,
  ) => {
    setProjects((previous) =>
      previous.map((project) => {
        if (
          project.projectName !== projectName
        ) {
          return project;
        }

        return {
          ...project,
          lines: project.lines.map(
            (line, lineIndex) =>
              lineIndex === index
                ? value
                : line,
          ),
        };
      }),
    );

    setSuccessMessage('');
  };

  const handleClearLine = (
    projectName,
    index,
  ) => {
    handleLineChange(
      projectName,
      index,
      '',
    );
  };

  const handleClearProject = (projectName) => {
    setProjects((previous) =>
      previous.map((project) =>
        project.projectName === projectName
          ? {
              ...project,
              lines: createEmptyLines(),
            }
          : project,
      ),
    );

    setSuccessMessage('');
  };

  const handleRestoreProject = (
    projectName,
  ) => {
    const sourceProject = sourceProjects.find(
      (project) =>
        project.projectName === projectName,
    );

    if (!sourceProject) {
      return;
    }

    setProjects((previous) =>
      previous.map((project) =>
        project.projectName === projectName
          ? {
              ...project,
              lines: [
                ...sourceProject.sourceLines,
              ],
            }
          : project,
      ),
    );

    setSuccessMessage('');
  };

  const handleRestoreAll = () => {
    const confirmed = window.confirm(
      '모든 현장의 내용을 현재 등록된 주간업무 주요보고 원본으로 되돌리시겠습니까?',
    );

    if (!confirmed) {
      return;
    }

    setProjects(
      sourceProjects.map((project) => ({
        ...project,
        lines: [...project.sourceLines],
      })),
    );

    setSuccessMessage('');
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user?.id) {
        throw new Error(
          '로그인 사용자 정보를 확인하지 못했습니다.',
        );
      }

      const displayPeriod =
        `${formatDisplayDate(
          weekRange.weekStart,
        )}~${formatDisplayDate(
          weekRange.weekEnd,
        )}`;

      const payload = {
        projects: projects.map((project) => ({
          projectName: project.projectName,
          lines: normalizeLines(
            project.lines,
          ),
        })),
      };

      const now = new Date().toISOString();
      const name =
        userProfile?.manager_name ||
        userProfile?.name ||
        user.email ||
        '';

      const {
        data,
        error,
      } = await supabase
        .from('weekly_overviews')
        .upsert(
          {
            week_start: weekRange.weekStart,
            week_end: weekRange.weekEnd,
            display_period: displayPeriod,
            payload,
            updated_by: user.id,
            updated_by_name: name,
            updated_at: now,
          },
          {
            onConflict: 'week_start',
          },
        )
        .select(
          `
          id,
          week_start,
          week_end,
          display_period,
          payload,
          updated_by_name,
          updated_at
        `,
        )
        .single();

      if (error) {
        throw error;
      }

      setSavedOverview(data);
      setUpdatedByName(name);
      setSuccessMessage(
        '주간업무총괄이 저장되었습니다.',
      );
    } catch (error) {
      console.error(
        '주간업무총괄 저장 실패:',
        error,
      );
      setErrorMessage(
        error?.message ||
          '주간업무총괄을 저장하지 못했습니다.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Paper
        variant="outlined"
        sx={{
          height: '100%',
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <CircularProgress size={20} />
        <Typography
          sx={{
            color: '#64748b',
            fontSize: '0.78rem',
          }}
        >
          주간업무총괄을 불러오는 중입니다.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          xl: 'minmax(430px, 0.86fr) minmax(700px, 1.14fr)',
        },
        gap: 1.2,
        overflow: 'hidden',
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          borderColor: '#cbd5e1',
          boxShadow: 'none',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            px: 1.35,
            py: 1.05,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            borderBottom: '1px solid #e2e8f0',
            bgcolor: '#ffffff',
          }}
        >
          <Box>
            <Typography
              sx={{
                color: '#0f172a',
                fontSize: '0.88rem',
                fontWeight: 900,
              }}
            >
              주간업무총괄 작성
            </Typography>

            <Typography
              sx={{
                mt: 0.2,
                color: '#64748b',
                fontSize: '0.68rem',
              }}
            >
              각 현장의 주간업무 주요보고가 기본으로
              입력됩니다. 내용을 직접 수정하거나 삭제할 수
              있습니다.
            </Typography>
          </Box>

          <Box
            sx={{
              flexShrink: 0,
              display: 'flex',
              gap: 0.5,
            }}
          >
            <Button
              size="small"
              variant="outlined"
              onClick={handleRestoreAll}
              sx={{
                minWidth: 84,
                whiteSpace: 'nowrap',
                fontSize: '0.66rem',
                fontWeight: 800,
              }}
            >
              원본 불러오기
            </Button>

            <Button
              size="small"
              variant="outlined"
              onClick={loadData}
              disabled={saving}
              sx={{
                minWidth: 64,
                whiteSpace: 'nowrap',
                fontSize: '0.66rem',
                fontWeight: 800,
              }}
            >
              새로고침
            </Button>

            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={saving}
              sx={{
                minWidth: 64,
                whiteSpace: 'nowrap',
                fontSize: '0.66rem',
                fontWeight: 900,
              }}
            >
              {saving ? '저장중' : '저장'}
            </Button>
          </Box>
        </Box>

        {(errorMessage || successMessage) && (
          <Box sx={{ px: 1, pt: 1 }}>
            {errorMessage && (
              <Alert
                severity="error"
                sx={{ fontSize: '0.7rem' }}
              >
                {errorMessage}
              </Alert>
            )}

            {successMessage && (
              <Alert
                severity="success"
                sx={{ fontSize: '0.7rem' }}
              >
                {successMessage}
              </Alert>
            )}
          </Box>
        )}

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            px: 1,
            py: 1,
            bgcolor: '#f8fafc',
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              mb: 1.1,
              px: 1,
              py: 0.75,
              borderColor: '#bfdbfe',
              bgcolor: '#eff6ff',
              boxShadow: 'none',
            }}
          >
            <Typography
              sx={{
                color: '#1e40af',
                fontSize: '0.68rem',
                fontWeight: 800,
              }}
            >
              기간: {formatDisplayDate(
                weekRange.weekStart,
              )}
              {' ~ '}
              {formatDisplayDate(
                weekRange.weekEnd,
              )}
              {savedOverview?.updated_at
                ? ` · 저장된 총괄 있음`
                : ' · 아직 저장되지 않음'}
            </Typography>
          </Paper>

          {projects.length === 0 ? (
            <Alert severity="warning">
              등록된 현장을 찾지 못했습니다.
            </Alert>
          ) : (
            projects.map((project) => (
              <ProjectInputCard
                key={project.projectName}
                project={project}
                onLineChange={handleLineChange}
                onClearLine={handleClearLine}
                onClearProject={handleClearProject}
                onRestoreProject={handleRestoreProject}
              />
            ))
          )}
        </Box>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          borderColor: '#cbd5e1',
          boxShadow: 'none',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            px: 1.35,
            py: 1.05,
            borderBottom: '1px solid #e2e8f0',
            bgcolor: '#ffffff',
          }}
        >
          <Typography
            sx={{
              color: '#0f172a',
              fontSize: '0.88rem',
              fontWeight: 900,
            }}
          >
            주간업무총괄 미리보기
          </Typography>

          <Typography
            sx={{
              mt: 0.2,
              color: '#64748b',
              fontSize: '0.68rem',
            }}
          >
            왼쪽 입력내용이 즉시 반영됩니다.
          </Typography>
        </Box>

        <Divider />

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            p: 1.4,
            bgcolor: '#e2e8f0',
          }}
        >
          <WeeklyOverviewPreview
            weekRange={weekRange}
            projects={projects}
            updatedByName={updatedByName}
          />
        </Box>
      </Paper>
    </Box>
  );
}
