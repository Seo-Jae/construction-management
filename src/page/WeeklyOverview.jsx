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
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';

const TEMPLATE_PROJECTS = [
  {
    projectName: '디에이치 방배',
    processCell: 'C7',
    specialCell: 'C9',
  },
  {
    projectName: '진접선 차량기지',
    processCell: 'C11',
    specialCell: 'C13',
  },
  {
    projectName: '김해 장유삼문 공동주택',
    processCell: 'C15',
    specialCell: 'C17',
  },
  {
    projectName: '여수 죽림 공동주택',
    processCell: 'C19',
    specialCell: 'C21',
  },
  {
    projectName: '한라건설 용인금어지구',
    processCell: 'C23',
    specialCell: 'C25',
  },
  {
    projectName: '울산 학성동 공동주택',
    processCell: 'C27',
    specialCell: 'C29',
  },
  {
    projectName: '현대건설 용인마크밸리',
    processCell: 'C31',
    specialCell: 'C33',
  },
  {
    projectName: '원주 푸르지오더센트럴',
    processCell: 'C35',
    specialCell: 'C37',
  },
  {
    projectName: '대우건설 용인현장',
    processCell: 'C39',
    specialCell: 'C41',
  },
];

const TEMPLATE_PROJECT_NAMES =
  TEMPLATE_PROJECTS.map(
    (project) => project.projectName,
  );

const EMPTY_CELL_VALUES = Object.fromEntries(
  TEMPLATE_PROJECTS.flatMap((project) => [
    [project.processCell, ''],
    [project.specialCell, ''],
  ]),
);

const PROCESS_FORM_KEYS = [
  'progressCurrent',
  'progressNext',
  'materialCurrent',
  'materialNext',
];

const SPECIAL_FORM_KEYS = [
  'publicCurrent',
  'publicNext',
  'meetingCurrent',
  'meetingNext',
  'directiveCurrent',
  'directiveNext',
  'specialCurrent',
  'specialNext',
];

const CELL_OVERLAYS = [
  { cell: 'C7', top: 9.113001 },
  { cell: 'C9', top: 11.786148 },
  { cell: 'C11', top: 14.459295 },
  { cell: 'C13', top: 17.132442 },
  { cell: 'C15', top: 19.805589 },
  { cell: 'C17', top: 22.478736 },
  { cell: 'C19', top: 25.151883 },
  { cell: 'C21', top: 27.82503 },
  { cell: 'C23', top: 30.498177 },
  { cell: 'C25', top: 33.171324 },
  { cell: 'C27', top: 35.844471 },
  { cell: 'C29', top: 38.517618 },
  { cell: 'C31', top: 41.190765 },
  { cell: 'C33', top: 43.863913 },
  { cell: 'C35', top: 46.53706 },
  { cell: 'C37', top: 49.210207 },
  { cell: 'C39', top: 51.883354 },
  { cell: 'C41', top: 54.556501 },
];

const CELL_LEFT_PERCENT = 23.753666;
const CELL_WIDTH_PERCENT = 76.246334;
const CELL_HEIGHT_PERCENT = 1.336574;

const pad2 = (value) =>
  String(value).padStart(2, '0');

const formatKoreaISODate = (
  date = new Date(),
) => {
  const formatter =
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

  const values = {};

  formatter
    .formatToParts(date)
    .forEach((part) => {
      if (part.type !== 'literal') {
        values[part.type] = part.value;
      }
    });

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );
};

const formatUtcDateToISO = (utcValue) => {
  const date = new Date(utcValue);

  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join('-');
};

const getKoreaWeekRange = (
  date = new Date(),
) => {
  const todayKey =
    formatKoreaISODate(date);

  const [year, month, day] = todayKey
    .split('-')
    .map(Number);

  const todayUtc = Date.UTC(
    year,
    month - 1,
    day,
  );

  const dayOfWeek =
    new Date(todayUtc).getUTCDay();

  const weekStartUtc =
    todayUtc -
    dayOfWeek * 24 * 60 * 60 * 1000;

  const weekEndUtc =
    weekStartUtc +
    6 * 24 * 60 * 60 * 1000;

  return {
    weekStart:
      formatUtcDateToISO(weekStartUtc),
    weekEnd:
      formatUtcDateToISO(weekEndUtc),
  };
};

const formatDisplayDate = (dateKey) => {
  if (!dateKey) {
    return '';
  }

  const [year, month, day] =
    dateKey.split('-');

  return `${year}.${month}.${day}`;
};

const normalizeText = (value) =>
  String(value || '').trim();

const normalizeTextList = (values) =>
  (Array.isArray(values) ? values : [])
    .map(normalizeText)
    .filter(Boolean);

const createTextSet = (
  form,
  keys,
) =>
  new Set(
    keys.flatMap((key) =>
      normalizeTextList(form?.[key]),
    ),
  );

const getReportCellValues = (report) => {
  const payload = report?.payload || {};
  const highlights = normalizeTextList(
    payload?.nextWeekHighlights,
  );
  const form = payload?.form || {};

  const processSet = createTextSet(
    form,
    PROCESS_FORM_KEYS,
  );
  const specialSet = createTextSet(
    form,
    SPECIAL_FORM_KEYS,
  );

  const processLines = [];
  const specialLines = [];

  highlights.forEach((text) => {
    if (
      specialSet.has(text) &&
      !processSet.has(text)
    ) {
      specialLines.push(text);
      return;
    }

    processLines.push(text);
  });

  /*
    과거 데이터처럼 입력 분류를 판단할 수 없는 경우에도
    주요보고가 누락되지 않도록 공정 칸에 우선 배치합니다.
  */
  return {
    processText: processLines.join('\n'),
    specialText: specialLines.join('\n'),
  };
};

const createSourceCellValues = (
  weeklyReports,
) => {
  const values = {
    ...EMPTY_CELL_VALUES,
  };

  const reportMap = new Map(
    (weeklyReports || []).map((report) => [
      report.project_name,
      report,
    ]),
  );

  TEMPLATE_PROJECTS.forEach((project) => {
    const report = reportMap.get(
      project.projectName,
    );

    if (!report) {
      return;
    }

    const {
      processText,
      specialText,
    } = getReportCellValues(report);

    values[project.processCell] =
      processText;
    values[project.specialCell] =
      specialText;
  });

  return values;
};

const migrateOldSavedPayload = (
  payload,
) => {
  if (
    payload?.cellValues &&
    typeof payload.cellValues === 'object'
  ) {
    return {
      ...EMPTY_CELL_VALUES,
      ...payload.cellValues,
    };
  }

  const values = {
    ...EMPTY_CELL_VALUES,
  };

  const oldProjects = Array.isArray(
    payload?.projects,
  )
    ? payload.projects
    : [];

  oldProjects.forEach((savedProject) => {
    const templateProject =
      TEMPLATE_PROJECTS.find(
        (project) =>
          project.projectName ===
          savedProject.projectName,
      );

    if (!templateProject) {
      return;
    }

    const lines =
      normalizeTextList(
        savedProject.lines,
      );

    values[
      templateProject.processCell
    ] = lines.slice(0, 5).join('\n');

    values[
      templateProject.specialCell
    ] = lines.slice(5).join('\n');
  });

  return values;
};

function ProjectEditor({
  project,
  cellValues,
  registered,
  onChange,
  onRestore,
  onClear,
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 1,
        overflow: 'hidden',
        borderColor: '#cbd5e1',
        boxShadow: 'none',
      }}
    >
      <Box
        sx={{
          px: 1,
          py: 0.75,
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'space-between',
          gap: 1,
          bgcolor: '#f8fafc',
          borderBottom:
            '1px solid #e2e8f0',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              color: '#0f172a',
              fontSize: '0.78rem',
              fontWeight: 900,
            }}
          >
            {project.projectName}
          </Typography>

          <Typography
            sx={{
              mt: 0.15,
              color: registered
                ? '#15803d'
                : '#dc2626',
              fontSize: '0.62rem',
              fontWeight: 800,
            }}
          >
            {registered
              ? '주간업무 등록 · 자동취합'
              : '주간업무 미등록 · 직접입력 가능'}
          </Typography>
        </Box>

        <Box
          sx={{
            flexShrink: 0,
            display: 'flex',
            gap: 0.4,
          }}
        >
          <Button
            size="small"
            variant="outlined"
            onClick={() =>
              onRestore(project)
            }
            sx={{
              minWidth: 54,
              px: 0.65,
              whiteSpace: 'nowrap',
              fontSize: '0.61rem',
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
              onClear(project)
            }
            sx={{
              minWidth: 48,
              px: 0.65,
              whiteSpace: 'nowrap',
              fontSize: '0.61rem',
              fontWeight: 800,
            }}
          >
            삭제
          </Button>
        </Box>
      </Box>

      <Box
        sx={{
          p: 0.9,
          display: 'grid',
          gap: 0.75,
        }}
      >
        <TextField
          fullWidth
          multiline
          minRows={2}
          maxRows={6}
          size="small"
          label={`공정 · ${project.processCell}`}
          value={
            cellValues[
              project.processCell
            ] || ''
          }
          onChange={(event) =>
            onChange(
              project.processCell,
              event.target.value,
            )
          }
          sx={{
            '& .MuiInputBase-input': {
              fontSize: '0.7rem',
              lineHeight: 1.45,
            },
            '& .MuiInputLabel-root': {
              fontSize: '0.7rem',
            },
          }}
        />

        <TextField
          fullWidth
          multiline
          minRows={2}
          maxRows={6}
          size="small"
          label={`특이사항 · ${project.specialCell}`}
          value={
            cellValues[
              project.specialCell
            ] || ''
          }
          onChange={(event) =>
            onChange(
              project.specialCell,
              event.target.value,
            )
          }
          sx={{
            '& .MuiInputBase-input': {
              fontSize: '0.7rem',
              lineHeight: 1.45,
            },
            '& .MuiInputLabel-root': {
              fontSize: '0.7rem',
            },
          }}
        />
      </Box>
    </Paper>
  );
}

function ExcelTemplatePreview({
  cellValues,
}) {
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        minWidth: 720,
        aspectRatio: '1543 / 2457',
        bgcolor: '#ffffff',
        boxShadow:
          '0 7px 24px rgba(15,23,42,0.18)',
      }}
    >
      <Box
        component="img"
        src={
          '/templates/' +
          '주간업무총괄_미리보기.png'
        }
        alt="주간업무총괄 미리보기"
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'fill',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      {CELL_OVERLAYS.map((overlay) => {
        const value =
          cellValues[overlay.cell] || '';

        return (
          <Box
            key={overlay.cell}
            title={overlay.cell}
            sx={{
              position: 'absolute',
              left:
                `${CELL_LEFT_PERCENT}%`,
              top: `${overlay.top}%`,
              width:
                `${CELL_WIDTH_PERCENT}%`,
              height:
                `${CELL_HEIGHT_PERCENT}%`,
              px: '0.5%',
              py: '0.05%',
              display: 'flex',
              alignItems: 'center',
              overflow: 'hidden',
              color: '#111827',
              fontFamily:
                '"Malgun Gothic",' +
                ' "맑은 고딕",' +
                ' sans-serif',
              fontSize:
                'clamp(7px, 0.68vw, 11px)',
              fontWeight: 500,
              lineHeight: 1.2,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              pointerEvents: 'none',
            }}
          >
            {value}
          </Box>
        );
      })}
    </Box>
  );
}

export default function WeeklyOverview({
  userProfile,
}) {
  const weekRange = useMemo(
    () => getKoreaWeekRange(),
    [],
  );

  const [cellValues, setCellValues] =
    useState({
      ...EMPTY_CELL_VALUES,
    });

  const [
    sourceCellValues,
    setSourceCellValues,
  ] = useState({
    ...EMPTY_CELL_VALUES,
  });

  const [
    registeredProjects,
    setRegisteredProjects,
  ] = useState(new Set());

  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [errorMessage, setErrorMessage] =
    useState('');
  const [
    warningMessage,
    setWarningMessage,
  ] = useState('');
  const [
    successMessage,
    setSuccessMessage,
  ] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    setWarningMessage('');
    setSuccessMessage('');

    let reports = [];

    try {
      const {
        data,
        error,
      } = await supabase
        .from('weekly_reports')
        .select(
          `
          id,
          project_name,
          week_start,
          payload,
          status,
          completed_at
        `,
        )
        .eq(
          'week_start',
          weekRange.weekStart,
        )
        .eq('status', 'completed')
        .in(
          'project_name',
          TEMPLATE_PROJECT_NAMES,
        );

      if (error) {
        throw error;
      }

      reports = data || [];
    } catch (error) {
      console.error(
        '주간업무 원본 조회 실패:',
        error,
      );

      setWarningMessage(
        '현재 주차 주간업무 원본을 불러오지 못했습니다. ' +
        '입력 화면은 사용할 수 있습니다.',
      );
    }

    const nextSourceValues =
      createSourceCellValues(reports);

    setSourceCellValues(
      nextSourceValues,
    );

    setRegisteredProjects(
      new Set(
        reports.map(
          (report) =>
            report.project_name,
        ),
      ),
    );

    let savedValues = null;

    try {
      const {
        data,
        error,
      } = await supabase
        .from('weekly_overviews')
        .select(
          `
          id,
          week_start,
          payload,
          updated_at
        `,
        )
        .eq(
          'week_start',
          weekRange.weekStart,
        )
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        savedValues =
          migrateOldSavedPayload(
            data.payload,
          );
      }
    } catch (error) {
      console.error(
        '주간업무총괄 저장본 조회 실패:',
        error,
      );

      setWarningMessage(
        (previous) =>
          previous ||
          '저장 테이블을 확인하지 못했습니다. ' +
          'SQL 적용 후 저장할 수 있습니다.',
      );
    }

    setCellValues(
      savedValues ||
        nextSourceValues,
    );

    setLoading(false);
  }, [weekRange.weekStart]);

  useEffect(() => {
    loadData();

    const handleFocus = () => {
      loadData();
    };

    const handleWeeklyChanged = () => {
      loadData();
    };

    window.addEventListener(
      'focus',
      handleFocus,
    );

    window.addEventListener(
      'weekly-report-completed',
      handleWeeklyChanged,
    );

    return () => {
      window.removeEventListener(
        'focus',
        handleFocus,
      );

      window.removeEventListener(
        'weekly-report-completed',
        handleWeeklyChanged,
      );
    };
  }, [loadData]);

  const handleCellChange = (
    cell,
    value,
  ) => {
    setCellValues((previous) => ({
      ...previous,
      [cell]: value,
    }));

    setSuccessMessage('');
  };

  const handleRestoreProject = (
    project,
  ) => {
    setCellValues((previous) => ({
      ...previous,
      [project.processCell]:
        sourceCellValues[
          project.processCell
        ] || '',
      [project.specialCell]:
        sourceCellValues[
          project.specialCell
        ] || '',
    }));

    setSuccessMessage('');
  };

  const handleClearProject = (
    project,
  ) => {
    setCellValues((previous) => ({
      ...previous,
      [project.processCell]: '',
      [project.specialCell]: '',
    }));

    setSuccessMessage('');
  };

  const handleRestoreAll = () => {
    const confirmed = window.confirm(
      '현재 주차 각 현장의 주간업무 주요보고 원본으로 다시 불러오시겠습니까?',
    );

    if (!confirmed) {
      return;
    }

    setCellValues({
      ...sourceCellValues,
    });

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

      const name =
        userProfile?.manager_name ||
        userProfile?.name ||
        user.email ||
        '';

      const now =
        new Date().toISOString();

      const { error } = await supabase
        .from('weekly_overviews')
        .upsert(
          {
            week_start:
              weekRange.weekStart,
            week_end:
              weekRange.weekEnd,
            display_period:
              `${formatDisplayDate(
                weekRange.weekStart,
              )}~${formatDisplayDate(
                weekRange.weekEnd,
              )}`,
            payload: {
              cellValues,
            },
            updated_by: user.id,
            updated_by_name: name,
            updated_at: now,
          },
          {
            onConflict: 'week_start',
          },
        );

      if (error) {
        throw error;
      }

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
          minHeight:
            'calc(100vh - 96px)',
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
            fontSize: '0.76rem',
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
        width: '100%',
        minHeight:
          'calc(100vh - 96px)',
        bgcolor: '#f1f5f9',
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          xl:
            'minmax(420px, 0.8fr) ' +
            'minmax(680px, 1.2fr)',
        },
        gap: 1.2,
        alignItems: 'stretch',
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          borderColor: '#cbd5e1',
          boxShadow: 'none',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            px: 1.2,
            py: 0.95,
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'space-between',
            gap: 1,
            borderBottom:
              '1px solid #e2e8f0',
            bgcolor: '#ffffff',
          }}
        >
          <Box>
            <Typography
              sx={{
                color: '#0f172a',
                fontSize: '0.86rem',
                fontWeight: 900,
              }}
            >
              주간업무총괄 작성
            </Typography>

            <Typography
              sx={{
                mt: 0.15,
                color: '#64748b',
                fontSize: '0.66rem',
                lineHeight: 1.45,
              }}
            >
              엑셀 양식의 C7, C9 형태 빈칸에
              대응합니다.
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
              onClick={handleRestoreAll}
              sx={{
                minWidth: 78,
                px: 0.7,
                whiteSpace: 'nowrap',
                fontSize: '0.62rem',
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
                minWidth: 58,
                px: 0.7,
                whiteSpace: 'nowrap',
                fontSize: '0.62rem',
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
                minWidth: 56,
                px: 0.7,
                whiteSpace: 'nowrap',
                fontSize: '0.62rem',
                fontWeight: 900,
              }}
            >
              {saving
                ? '저장중'
                : '저장'}
            </Button>
          </Box>
        </Box>

        <Box
          sx={{
            px: 1,
            pt: 0.9,
            display: 'grid',
            gap: 0.7,
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              px: 0.9,
              py: 0.7,
              borderColor: '#bfdbfe',
              bgcolor: '#eff6ff',
              boxShadow: 'none',
            }}
          >
            <Typography
              sx={{
                color: '#1e40af',
                fontSize: '0.66rem',
                fontWeight: 800,
              }}
            >
              기간:{' '}
              {formatDisplayDate(
                weekRange.weekStart,
              )}
              {' ~ '}
              {formatDisplayDate(
                weekRange.weekEnd,
              )}
            </Typography>
          </Paper>

          {warningMessage && (
            <Alert
              severity="warning"
              sx={{ fontSize: '0.68rem' }}
            >
              {warningMessage}
            </Alert>
          )}

          {errorMessage && (
            <Alert
              severity="error"
              sx={{ fontSize: '0.68rem' }}
            >
              {errorMessage}
            </Alert>
          )}

          {successMessage && (
            <Alert
              severity="success"
              sx={{ fontSize: '0.68rem' }}
            >
              {successMessage}
            </Alert>
          )}
        </Box>

        <Box
          sx={{
            flex: 1,
            minHeight: 540,
            overflowY: 'auto',
            px: 1,
            py: 1,
            bgcolor: '#f8fafc',
          }}
        >
          {TEMPLATE_PROJECTS.map(
            (project) => (
              <ProjectEditor
                key={project.projectName}
                project={project}
                cellValues={cellValues}
                registered={
                  registeredProjects.has(
                    project.projectName,
                  )
                }
                onChange={
                  handleCellChange
                }
                onRestore={
                  handleRestoreProject
                }
                onClear={
                  handleClearProject
                }
              />
            ),
          )}
        </Box>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          borderColor: '#cbd5e1',
          boxShadow: 'none',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            px: 1.2,
            py: 0.95,
            borderBottom:
              '1px solid #e2e8f0',
            bgcolor: '#ffffff',
          }}
        >
          <Typography
            sx={{
              color: '#0f172a',
              fontSize: '0.86rem',
              fontWeight: 900,
            }}
          >
            주간업무총괄 미리보기
          </Typography>

          <Typography
            sx={{
              mt: 0.15,
              color: '#64748b',
              fontSize: '0.66rem',
            }}
          >
            업로드한 엑셀 양식과 같은 위치에
            입력값이 즉시 반영됩니다.
          </Typography>
        </Box>

        <Box
          sx={{
            flex: 1,
            minHeight: 700,
            overflow: 'auto',
            p: 1.2,
            bgcolor: '#e2e8f0',
          }}
        >
          <ExcelTemplatePreview
            cellValues={cellValues}
          />
        </Box>
      </Paper>
    </Box>
  );
}
