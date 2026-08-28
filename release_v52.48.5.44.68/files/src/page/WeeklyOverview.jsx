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
  CircularProgress,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import ExcelJS from 'exceljs';
import { supabase } from '../supabaseClient';

import SystemPageTitle from '../components/SystemPageTitle.jsx';
import SystemRefreshButton from '../components/SystemRefreshButton.jsx';
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

const MAX_OVERVIEW_PROJECTS =
  TEMPLATE_PROJECTS.length;

const normalizeProjectNameList = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) =>
          String(
            value?.project_name ??
              value?.projectName ??
              value ??
              '',
          ).trim(),
        )
        .filter(Boolean),
    ),
  );

const buildOverviewProjects = (
  projectNames,
) =>
  normalizeProjectNameList(projectNames)
    .slice(0, MAX_OVERVIEW_PROJECTS)
    .map((projectName, index) => ({
      ...TEMPLATE_PROJECTS[index],
      projectName,
      slotIndex: index,
      projectNameCell:
        `B${6 + index * 4}`,
    }));

const deriveOverviewProjectNames = ({
  systemProjectNames = [],
  manualProjectNames = [],
  excludedSystemProjectNames = [],
  weeklyReports = [],
  savedDisplayProjectNames = [],
  readOnly = false,
  hasSavedProjectSettings = false,
}) => {
  if (
    readOnly &&
    savedDisplayProjectNames.length > 0
  ) {
    return normalizeProjectNameList(
      savedDisplayProjectNames,
    ).slice(0, MAX_OVERVIEW_PROJECTS);
  }

  if (
    readOnly &&
    !hasSavedProjectSettings &&
    savedDisplayProjectNames.length === 0
  ) {
    const reportNames =
      normalizeProjectNameList(
        weeklyReports.map(
          (report) =>
            report?.project_name,
        ),
      );

    return (
      reportNames.length > 0
        ? reportNames
        : TEMPLATE_PROJECT_NAMES
    ).slice(0, MAX_OVERVIEW_PROJECTS);
  }

  const excluded =
    new Set(
      normalizeProjectNameList(
        excludedSystemProjectNames,
      ),
    );

  const systemNames =
    normalizeProjectNameList(
      systemProjectNames,
    ).filter(
      (projectName) =>
        !excluded.has(projectName),
    );

  const manualNames =
    normalizeProjectNameList(
      manualProjectNames,
    );

  const reportNames =
    normalizeProjectNameList(
      weeklyReports.map(
        (report) =>
          report?.project_name,
      ),
    );

  const reportNameSet =
    new Set(reportNames);

  const reportSystemNames =
    reportNames.filter((name) =>
      systemNames.includes(name),
    );

  const otherSystemNames =
    systemNames.filter(
      (name) =>
        !reportNameSet.has(name),
    );

  const fallbackReportNames =
    reportNames.filter(
      (name) =>
        !systemNames.includes(name) &&
        !manualNames.includes(name),
    );

  const availableNames =
    normalizeProjectNameList([
      ...manualNames,
      ...reportSystemNames,
      ...otherSystemNames,
      ...fallbackReportNames,
    ]);

  const savedNames =
    normalizeProjectNameList(
      savedDisplayProjectNames,
    ).filter((name) =>
      availableNames.includes(name),
    );

  return normalizeProjectNameList([
    ...manualNames,
    ...savedNames,
    ...reportSystemNames,
    ...otherSystemNames,
    ...fallbackReportNames,
  ]).slice(0, MAX_OVERVIEW_PROJECTS);
};

const TEMPLATE_CELL_ADDRESSES =
  TEMPLATE_PROJECTS.flatMap(
    (project) => [
      project.processCell,
      project.specialCell,
    ],
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

const SCHEDULE_DATE_CELLS = [
  'H58',
  'I58',
  'J58',
  'K58',
  'L58',
  'M58',
  'N58',
];

const SCHEDULE_INPUT_CELLS = [
  'H59',
  'I59',
  'J59',
  'K59',
  'L59',
  'M59',
  'N59',
];

const createEmptyScheduleValues = () =>
  Array.from(
    { length: 7 },
    () => '',
  );

const OFFICE_INPUT_SECTIONS = [
  {
    title: '[입찰]',
    fields: [
      {
        key: 'bidSubmitted',
        label: '1. 제출',
        cellRange: 'C44:N46',
        anchorCell: 'C44',
        startRow: 44,
        endRow: 46,
      },
      {
        key: 'bidExpected',
        label: '2. 제출예정',
        cellRange: 'C48:N49',
        anchorCell: 'C48',
        startRow: 48,
        endRow: 49,
      },
    ],
  },
  {
    title: '[예가 및 견적]',
    fields: [
      {
        key: 'estimateSubmitted',
        label: '1. 제출',
        cellRange: 'C52:N54',
        anchorCell: 'C52',
        startRow: 52,
        endRow: 54,
      },
      {
        key: 'estimateExpected',
        label: '2. 제출예정',
        cellRange: 'C56:N57',
        anchorCell: 'C56',
        startRow: 56,
        endRow: 57,
      },
    ],
  },
];

const OFFICE_INPUT_FIELDS =
  OFFICE_INPUT_SECTIONS.flatMap(
    (section) => section.fields,
  );

const createEmptyOfficeRows = () =>
  Object.fromEntries(
    OFFICE_INPUT_FIELDS.map(
      (field) => [field.key, ['']],
    ),
  );

const OFFICE_GROUPS = [
  {
    label: '공무',
    rows: [
      '[입찰]',
      '1. 제출',
      '',
      '',
      '2. 제출예정',
      '',
      '',
      '[예가 및 견적]',
      '1. 제출',
      '',
      '',
      '2. 제출예정',
      '',
      '',
      '',
      '[하자보수]',
      '',
      '',
      '',
      '1. 특이사항',
      '',
      '',
    ],
  },
  {
    label: '관리',
    rows: [
      '[노무, 세무]',
      '',
      '',
      '[회계, 경리]',
      '',
      '',
    ],
  },
  {
    label: '안전',
    rows: [
      '',
      '',
      '',
      '',
      '',
    ],
  },
];

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

const addDaysToISO = (
  dateKey,
  days,
) => {
  const [year, month, day] =
    String(dateKey)
      .split('-')
      .map(Number);

  return formatUtcDateToISO(
    Date.UTC(
      year,
      month - 1,
      day + days,
    ),
  );
};

const formatMonthDay = (dateKey) =>
  String(dateKey || '').slice(5);

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

  const nextMondayUtc =
    weekStartUtc +
    8 * 24 * 60 * 60 * 1000;

  return {
    weekStart:
      formatUtcDateToISO(weekStartUtc),
    weekEnd:
      formatUtcDateToISO(weekEndUtc),
    nextMonday:
      formatUtcDateToISO(nextMondayUtc),
  };
};

const getWeekRangeFromStart = (
  weekStart,
) => {
  const normalized =
    String(weekStart || '').trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      normalized,
    )
  ) {
    return getKoreaWeekRange();
  }

  return {
    weekStart: normalized,
    weekEnd:
      addDaysToISO(
        normalized,
        6,
      ),
    nextMonday:
      addDaysToISO(
        normalized,
        8,
      ),
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
  String(value || '')
    .replace(/합지석고/g, '합지')
    .trim();

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

const textToRows = (value) => {
  const rows = String(value || '')
    .replace(/\r/g, '')
    .split('\n');

  return rows.length > 0
    ? rows
    : [''];
};

const normalizeRows = (rows) => {
  if (Array.isArray(rows)) {
    return rows.length > 0
      ? rows.map((value) =>
          String(value || ''),
        )
      : [''];
  }

  return textToRows(rows);
};

const rowsToText = (rows) =>
  normalizeRows(rows).join('\n');

const createEmptyCellRows = () =>
  Object.fromEntries(
    TEMPLATE_CELL_ADDRESSES.map(
      (address) => [address, ['']],
    ),
  );

const getReportCellRows = (report) => {
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

  const processRows = [];
  const specialRows = [];

  highlights.forEach((text) => {
    if (
      specialSet.has(text) &&
      !processSet.has(text)
    ) {
      specialRows.push(text);
      return;
    }

    processRows.push(text);
  });

  return {
    processRows:
      processRows.length > 0
        ? processRows
        : [''],
    specialRows:
      specialRows.length > 0
        ? specialRows
        : [''],
  };
};

const createSourceCellRows = (
  weeklyReports,
  projects = TEMPLATE_PROJECTS,
) => {
  const rowsByCell =
    createEmptyCellRows();

  const reportMap = new Map(
    (weeklyReports || []).map(
      (report) => [
        report.project_name,
        report,
      ],
    ),
  );

  projects.forEach(
    (project) => {
      const report = reportMap.get(
        project.projectName,
      );

      if (!report) {
        return;
      }

      const {
        processRows,
        specialRows,
      } = getReportCellRows(report);

      rowsByCell[
        project.processCell
      ] = processRows;

      rowsByCell[
        project.specialCell
      ] = specialRows;
    },
  );

  return rowsByCell;
};

const migrateSavedOfficeRows = (
  payload,
) => {
  const result =
    createEmptyOfficeRows();

  if (
    payload?.officeRows &&
    typeof payload.officeRows === 'object'
  ) {
    OFFICE_INPUT_FIELDS.forEach(
      (field) => {
        result[field.key] =
          normalizeRows(
            payload.officeRows[
              field.key
            ],
          );
      },
    );

    return result;
  }

  if (
    payload?.officeValues &&
    typeof payload.officeValues === 'object'
  ) {
    OFFICE_INPUT_FIELDS.forEach(
      (field) => {
        result[field.key] =
          textToRows(
            payload.officeValues[
              field.key
            ],
          );
      },
    );
  }

  return result;
};

const migrateSavedPayload = (
  payload,
  projects = TEMPLATE_PROJECTS,
) => {
  const result =
    createEmptyCellRows();

  if (
    payload?.cellRows &&
    typeof payload.cellRows === 'object'
  ) {
    TEMPLATE_CELL_ADDRESSES.forEach(
      (address) => {
        result[address] =
          normalizeRows(
            payload.cellRows[address],
          );
      },
    );

    return result;
  }

  if (
    payload?.cellValues &&
    typeof payload.cellValues === 'object'
  ) {
    TEMPLATE_CELL_ADDRESSES.forEach(
      (address) => {
        result[address] =
          textToRows(
            payload.cellValues[address],
          );
      },
    );

    return result;
  }

  const oldProjects = Array.isArray(
    payload?.projects,
  )
    ? payload.projects
    : [];

  oldProjects.forEach(
    (savedProject) => {
      const templateProject =
        projects.find(
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

      result[
        templateProject.processCell
      ] =
        lines.slice(0, 5).length > 0
          ? lines.slice(0, 5)
          : [''];

      result[
        templateProject.specialCell
      ] =
        lines.slice(5).length > 0
          ? lines.slice(5)
          : [''];
    },
  );

  return result;
};

const createDraftStorageKey = (
  weekStart,
) =>
  `weekly-overview-draft:${weekStart}`;

const readDraft = (storageKey) => {
  try {
    const raw =
      window.localStorage.getItem(
        storageKey,
      );

    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error(
      '주간업무총괄 임시저장 읽기 실패:',
      error,
    );

    return null;
  }
};

const writeDraft = (
  storageKey,
  draft,
) => {
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(draft),
    );
  } catch (error) {
    console.error(
      '주간업무총괄 임시저장 실패:',
      error,
    );
  }
};

const removeDraft = (storageKey) => {
  try {
    window.localStorage.removeItem(
      storageKey,
    );
  } catch (error) {
    console.error(
      '주간업무총괄 임시저장 삭제 실패:',
      error,
    );
  }
};

const saveWorkbook = async (
  workbook,
  filename,
) => {
  const buffer =
    await workbook.xlsx.writeBuffer();

  const blob = new Blob(
    [buffer],
    {
      type:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement('a');

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
};

const getExcelRowNumber = (address) =>
  Number(
    String(address).replace(
      /[^0-9]/g,
      '',
    ),
  );

const STRONG_BORDER =
  '1px solid #111827';

const LIGHT_BORDER =
  '1px solid #cbd5e1';

const SOFT_BORDER =
  '1px solid #e2e8f0';

const previewBaseSx = {
  bgcolor: '#ffffff',
  color: '#111827',
  fontFamily:
    '"Malgun Gothic", "맑은 고딕", sans-serif',
};

function LineEditor({
  title,
  rows,
  onChange,
  onAdd,
  onDelete,
}) {
  const normalizedRows =
    normalizeRows(rows);

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <Box
        sx={{
          mb: 0.45,
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
          display: 'grid',
          gridTemplateColumns:
            'minmax(0, 1fr) auto',
          alignItems: 'center',
          columnGap: 0.6,
        }}
      >
        <Typography
          sx={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#334155',
            fontSize: '0.7rem',
            fontWeight: 900,
          }}
        >
          {title}
        </Typography>

        <Button
          size="small"
          variant="outlined"
          onClick={onAdd}
          sx={{
            flexShrink: 0,
            width: 58,
            minWidth: 58,
            maxWidth: 58,
            px: 0.35,
            whiteSpace: 'nowrap',
            fontSize: '0.61rem',
            fontWeight: 900,
          }}
        >
          행 추가
        </Button>
      </Box>

      <Box
        sx={{
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          display: 'grid',
          gap: 0.45,
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {normalizedRows.map(
          (value, index) => (
            <Box
              key={`${title}-${index}`}
              sx={{
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                display: 'grid',
                gridTemplateColumns:
                  '26px minmax(0, 1fr) 38px',
                gap: 0.4,
                alignItems: 'stretch',
                overflow: 'hidden',
                boxSizing: 'border-box',
              }}
            >
              <Box
                sx={{
                  borderRadius: 0.8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent:
                    'center',
                  color: '#475569',
                  bgcolor: '#f1f5f9',
                  fontSize: '0.62rem',
                  fontWeight: 900,
                }}
              >
                {index + 1}
              </Box>

              <TextField
                fullWidth
                size="small"
                value={value}
                placeholder={`${title} 내용`}
                onChange={(event) =>
                  onChange(
                    index,
                    event.target.value,
                  )
                }
                sx={{
                  width: '100%',
                  maxWidth: '100%',
                  minWidth: 0,
                  overflow: 'hidden',
                  '& .MuiInputBase-root':
                    {
                      width: '100%',
                      maxWidth: '100%',
                      minWidth: 0,
                      minHeight: 34,
                      boxSizing: 'border-box',
                    },
                  '& .MuiInputBase-input':
                    {
                      minWidth: 0,
                      py: 0.7,
                      fontSize: '0.69rem',
                    },
                }}
              />

              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() =>
                  onDelete(index)
                }
                disabled={
                  normalizedRows.length === 1 &&
                  !value
                }
                sx={{
                  flexShrink: 0,
                  width: 38,
                  minWidth: 38,
                  maxWidth: 38,
                  px: 0,
                  fontSize: '0.78rem',
                  fontWeight: 900,
                }}
              >
                ×
              </Button>
            </Box>
          ),
        )}
      </Box>
    </Box>
  );
}

function ProjectEditor({
  project,
  cellRows,
  registered,
  onRowChange,
  onAddRow,
  onDeleteRow,
  onRestore,
  onClear,
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        mb: 1,
        overflow: 'hidden',
        boxSizing: 'border-box',
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
          gap: 1.05,
        }}
      >
        <LineEditor
          title="1. 공정"
          rows={
            cellRows[
              project.processCell
            ] || ['']
          }
          onChange={(index, value) =>
            onRowChange(
              project.processCell,
              index,
              value,
            )
          }
          onAdd={() =>
            onAddRow(
              project.processCell,
            )
          }
          onDelete={(index) =>
            onDeleteRow(
              project.processCell,
              index,
            )
          }
        />

        <LineEditor
          title="2. 특이사항"
          rows={
            cellRows[
              project.specialCell
            ] || ['']
          }
          onChange={(index, value) =>
            onRowChange(
              project.specialCell,
              index,
              value,
            )
          }
          onAdd={() =>
            onAddRow(
              project.specialCell,
            )
          }
          onDelete={(index) =>
            onDeleteRow(
              project.specialCell,
              index,
            )
          }
        />
      </Box>
    </Paper>
  );
}

function ScheduleEditor({
  scheduleDates,
  scheduleValues,
  onChange,
  onClear,
}) {
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <Box
        sx={{
          mb: 0.55,
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          display: 'grid',
          gridTemplateColumns:
            'minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 0.6,
          boxSizing: 'border-box',
        }}
      >
        <Box>
          <Typography
            sx={{
              color: '#334155',
              fontSize: '0.72rem',
              fontWeight: 900,
            }}
          >
            [하자보수]
          </Typography>


        </Box>

        <Button
          size="small"
          variant="outlined"
          color="error"
          onClick={onClear}
          sx={{
            flexShrink: 0,
            width: 58,
            minWidth: 58,
            maxWidth: 58,
            px: 0.3,
            whiteSpace: 'nowrap',
            fontSize: '0.59rem',
            fontWeight: 800,
          }}
        >
          전체삭제
        </Button>
      </Box>

      <Box
        sx={{
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            display: 'grid',
            gridTemplateColumns:
              'repeat(7, minmax(0, 1fr))',
            gap: 0.35,
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {scheduleDates.map(
            (dateKey, index) => (
              <Box
                key={dateKey}
                sx={{
                  width: '100%',
                  maxWidth: '100%',
                  minWidth: 0,
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    mb: 0.35,
                    py: 0.4,
                    borderRadius: 0.8,
                    color: '#334155',
                    bgcolor: '#f1f5f9',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                    fontSize: '0.61rem',
                    fontWeight: 900,
                  }}
                >
                  {formatMonthDay(
                    dateKey,
                  )}
                </Box>

                <TextField
                  fullWidth
                  size="small"
                  multiline
                  minRows={2}
                  maxRows={5}
                  value={
                    scheduleValues[
                      index
                    ] || ''
                  }
                  placeholder="입력"
                  onChange={(event) =>
                    onChange(
                      index,
                      event.target.value,
                    )
                  }
                  sx={{
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                    overflow: 'hidden',
                    '& .MuiInputBase-root':
                      {
                        width: '100%',
                        maxWidth: '100%',
                        minWidth: 0,
                        minHeight: 54,
                        alignItems:
                          'flex-start',
                        boxSizing:
                          'border-box',
                      },
                    '& .MuiInputBase-input':
                      {
                        px: 0.25,
                        py: 0.45,
                        overflowWrap:
                          'anywhere',
                        wordBreak:
                          'break-word',
                        textAlign:
                          'center',
                        fontSize:
                          '0.61rem',
                        lineHeight: 1.35,
                      },
                  }}
                />
              </Box>
            ),
          )}
        </Box>
      </Box>
    </Box>
  );
}

function OfficeInputCard({
  officeRows,
  scheduleDates,
  scheduleValues,
  onOfficeRowChange,
  onAddOfficeRow,
  onDeleteOfficeRow,
  onClearOffice,
  onScheduleChange,
  onClearSchedule,
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        mb: 1,
        overflow: 'hidden',
        boxSizing: 'border-box',
        borderColor: '#94a3b8',
        boxShadow: 'none',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          px: 1,
          py: 0.8,
          display: 'grid',
          gridTemplateColumns:
            'minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 0.6,
          overflow: 'hidden',
          boxSizing: 'border-box',
          bgcolor: '#e2e8f0',
          borderBottom:
            '1px solid #94a3b8',
        }}
      >
        <Box>
          <Box>
            <Typography
              sx={{
                color: '#0f172a',
                fontSize: '0.8rem',
                fontWeight: 900,
              }}
            >
              본사 · 공무
            </Typography>

            <Typography
              sx={{
                mt: 0.15,
                color: '#64748b',
                fontSize: '0.61rem',
                fontWeight: 700,
              }}
            >
              제출·제출예정 항목별 행 추가 가능
            </Typography>
          </Box>


        </Box>

        <Button
          size="small"
          variant="outlined"
          color="error"
          onClick={onClearOffice}
          sx={{
            flexShrink: 0,
            width: 64,
            minWidth: 64,
            maxWidth: 64,
            px: 0.3,
            whiteSpace: 'nowrap',
            fontSize: '0.59rem',
            fontWeight: 800,
          }}
        >
          공무 삭제
        </Button>
      </Box>

      <Box
        sx={{
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          p: 0.95,
          display: 'grid',
          gap: 1.25,
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {OFFICE_INPUT_SECTIONS.map(
          (section) => (
            <Box
              key={section.title}
              sx={{
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                p: 0.85,
                border: SOFT_BORDER,
                borderRadius: 1,
                bgcolor: '#ffffff',
                overflow: 'hidden',
                boxSizing: 'border-box',
              }}
            >
              <Typography
                sx={{
                  mb: 0.75,
                  color: '#0f172a',
                  fontSize: '0.73rem',
                  fontWeight: 900,
                }}
              >
                {section.title}
              </Typography>

              <Box
                sx={{
                  width: '100%',
                  maxWidth: '100%',
                  minWidth: 0,
                  display: 'grid',
                  gap: 1.05,
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                }}
              >
                {section.fields.map(
                  (field) => (
                    <LineEditor
                      key={field.key}
                      title={field.label}
                      rows={
                        officeRows[
                          field.key
                        ] || ['']
                      }
                      onChange={(
                        index,
                        value,
                      ) =>
                        onOfficeRowChange(
                          field.key,
                          index,
                          value,
                        )
                      }
                      onAdd={() =>
                        onAddOfficeRow(
                          field.key,
                        )
                      }
                      onDelete={(index) =>
                        onDeleteOfficeRow(
                          field.key,
                          index,
                        )
                      }
                    />
                  ),
                )}
              </Box>
            </Box>
          ),
        )}

        <Box
          sx={{
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            p: 0.85,
            border: SOFT_BORDER,
            borderRadius: 1,
            bgcolor: '#ffffff',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          <ScheduleEditor
            scheduleDates={
              scheduleDates
            }
            scheduleValues={
              scheduleValues
            }
            onChange={
              onScheduleChange
            }
            onClear={
              onClearSchedule
            }
          />
        </Box>
      </Box>
    </Paper>
  );
}

function PreviewContentRow({
  children,
  minHeight = 27,
  strongTop = false,
  strongBottom = false,
  center = false,
  bold = false,
}) {
  return (
    <Box
      sx={{
        minHeight,
        px: 0.75,
        borderRight:
          STRONG_BORDER,
        borderTop: strongTop
          ? STRONG_BORDER
          : 0,
        borderBottom: strongBottom
          ? STRONG_BORDER
          : LIGHT_BORDER,
        ...previewBaseSx,
        display: 'flex',
        alignItems: 'center',
        justifyContent: center
          ? 'center'
          : 'flex-start',
        textAlign: center
          ? 'center'
          : 'left',
        fontSize: '0.66rem',
        fontWeight: bold
          ? 900
          : 500,
        lineHeight: 1.35,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {children}
    </Box>
  );
}

function PreviewInputRows({
  rows,
  strongBottom = false,
}) {
  const normalizedRows =
    normalizeRows(rows);

  return (
    <>
      {normalizedRows.map(
        (line, index) => (
          <PreviewContentRow
            key={index}
            minHeight={24}
            strongBottom={
              strongBottom &&
              index ===
                normalizedRows.length - 1
            }
          >
            {line || ''}
          </PreviewContentRow>
        ),
      )}
    </>
  );
}

function PreviewProjectRows({
  project,
  cellRows,
}) {
  const processRows =
    cellRows[
      project.processCell
    ] || [''];

  const specialRows =
    cellRows[
      project.specialCell
    ] || [''];

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns:
          '18.9% 81.1%',
        borderBottom:
          STRONG_BORDER,
      }}
    >
      <Box
        sx={{
          px: 0.5,
          borderRight:
            STRONG_BORDER,
          ...previewBaseSx,
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'center',
          textAlign: 'center',
          fontSize: '0.69rem',
          fontWeight: 800,
        }}
      >
        {project.projectName}
      </Box>

      <Box>
        <PreviewContentRow
          bold
        >
          1. 공정
        </PreviewContentRow>

        <PreviewInputRows
          rows={processRows}
        />

        <PreviewContentRow
          bold
        >
          2. 특이사항
        </PreviewContentRow>

        <PreviewInputRows
          rows={specialRows}
          strongBottom
        />
      </Box>
    </Box>
  );
}

function SchedulePreviewRow({
  scheduleDates,
  scheduleValues,
  inputRow = false,
  strongBottom = false,
}) {
  const values = inputRow
    ? scheduleValues
    : scheduleDates;

  return (
    <Box
      sx={{
        minHeight: inputRow
          ? 58
          : 30,
        borderRight:
          STRONG_BORDER,
        borderBottom:
          strongBottom
            ? STRONG_BORDER
            : LIGHT_BORDER,
        ...previewBaseSx,
        display: 'grid',
        gridTemplateColumns:
          'repeat(7, minmax(0, 1fr))',
      }}
    >
      {values.map((value, index) => (
        <Box
          key={index}
          sx={{
            minWidth: 0,
            px: 0.35,
            py: inputRow ? 0.45 : 0.3,
            borderLeft:
              index === 0
                ? 0
                : LIGHT_BORDER,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            color: '#111827',
            fontSize: inputRow
              ? '0.64rem'
              : '0.66rem',
            fontWeight: inputRow
              ? 500
              : 900,
            lineHeight: 1.3,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'hidden',
          }}
        >
          {value || ''}
        </Box>
      ))}
    </Box>
  );
}

function OfficeFieldPreview({
  label,
  rows,
}) {
  return (
    <>
      <PreviewContentRow
        bold
      >
        {label}
      </PreviewContentRow>

      <PreviewInputRows
        rows={rows}
      />
    </>
  );
}

function OfficeGroupPreview({
  label,
  children,
  first = false,
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns:
          '18.9% 81.1%',
        borderTop: first
          ? STRONG_BORDER
          : 0,
        borderBottom:
          STRONG_BORDER,
      }}
    >
      <Box
        sx={{
          borderRight:
            STRONG_BORDER,
          ...previewBaseSx,
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'center',
          fontSize: '0.69rem',
          fontWeight: 900,
        }}
      >
        {label}
      </Box>

      <Box>
        {children}
      </Box>
    </Box>
  );
}

function OfficePreviewRows({
  officeRows,
  scheduleDates,
  scheduleValues,
}) {
  const safetyRows =
    Array.from(
      { length: 5 },
      () => '',
    );

  return (
    <Box
      sx={{
        display: 'flex',
        borderLeft:
          STRONG_BORDER,
      }}
    >
      <Box
        sx={{
          width: '5.99%',
          borderRight:
            STRONG_BORDER,
          borderBottom:
            STRONG_BORDER,
          ...previewBaseSx,
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'center',
          fontSize: '0.68rem',
          fontWeight: 900,
        }}
      >
        본사
      </Box>

      <Box sx={{ width: '94.01%' }}>
        <OfficeGroupPreview
          label="공무"
          first
        >
          <PreviewContentRow
            bold
          >
            [입찰]
          </PreviewContentRow>

          <OfficeFieldPreview
            label="1. 제출"
            rows={
              officeRows.bidSubmitted
            }
          />

          <OfficeFieldPreview
            label="2. 제출예정"
            rows={
              officeRows.bidExpected
            }
          />

          <PreviewContentRow
            bold
          >
            [예가 및 견적]
          </PreviewContentRow>

          <OfficeFieldPreview
            label="1. 제출"
            rows={
              officeRows
                .estimateSubmitted
            }
          />

          <OfficeFieldPreview
            label="2. 제출예정"
            rows={
              officeRows
                .estimateExpected
            }
          />

          <PreviewContentRow
            bold
          >
            [하자보수]
          </PreviewContentRow>

          <SchedulePreviewRow
            scheduleDates={
              scheduleDates
            }
            scheduleValues={
              scheduleValues
            }
          />

          <SchedulePreviewRow
            inputRow
            scheduleDates={
              scheduleDates
            }
            scheduleValues={
              scheduleValues
            }
          />

          <PreviewContentRow
            bold
          >
            1. 특이사항
          </PreviewContentRow>

          <PreviewContentRow
            strongBottom
          >
            {' '}
          </PreviewContentRow>
        </OfficeGroupPreview>

        <OfficeGroupPreview
          label="관리"
        >
          <PreviewContentRow
            bold
          >
            [노무, 세무]
          </PreviewContentRow>

          <PreviewContentRow>
            {' '}
          </PreviewContentRow>

          <PreviewContentRow
            bold
          >
            [회계, 경리]
          </PreviewContentRow>

          <PreviewContentRow
            strongBottom
          >
            {' '}
          </PreviewContentRow>
        </OfficeGroupPreview>

        <OfficeGroupPreview
          label="안전"
        >
          {safetyRows.map(
            (line, index) => (
              <PreviewContentRow
                key={index}
                strongTop={
                  index === 0
                }
                strongBottom={
                  index ===
                  safetyRows.length - 1
                }
              >
                {line}
              </PreviewContentRow>
            ),
          )}
        </OfficeGroupPreview>
      </Box>
    </Box>
  );
}

function ExcelTemplatePreview({
  cellRows,
  projects = TEMPLATE_PROJECTS,
  nextMondayKey,
  scheduleDates,
  scheduleValues,
  officeRows,
}) {
  return (
    <Box
      sx={{
        width: 860,
        minWidth: 760,
        mx: 'auto',
        bgcolor: '#ffffff',
        borderTop:
          STRONG_BORDER,
        borderLeft:
          STRONG_BORDER,
        boxShadow:
          '0 7px 24px rgba(15,23,42,0.18)',
        fontFamily:
          '"Malgun Gothic", "맑은 고딕", sans-serif',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns:
            '23.76% 55.14% 2.86% 9.05% 9.19%',
          gridTemplateRows:
            '28px 28px 28px 28px',
        }}
      >
        <Box
          sx={{
            gridColumn: '1',
            gridRow: '1 / 5',
            borderRight:
              STRONG_BORDER,
            borderBottom:
              STRONG_BORDER,
            ...previewBaseSx,
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'center',
            fontSize: '1.12rem',
            fontWeight: 900,
            letterSpacing: '0.34em',
          }}
        >
          업 무 보 고
        </Box>

        <Box
          sx={{
            gridColumn: '2',
            gridRow: '1 / 3',
            borderRight:
              STRONG_BORDER,
            borderBottom:
              STRONG_BORDER,
            ...previewBaseSx,
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'center',
            fontSize: '0.86rem',
            fontWeight: 900,
            letterSpacing: '0.12em',
          }}
        >
          주 요 현 황 (주 간)
        </Box>

        <Box
          sx={{
            gridColumn: '2',
            gridRow: '3 / 5',
            borderRight:
              STRONG_BORDER,
            borderBottom:
              STRONG_BORDER,
            ...previewBaseSx,
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'center',
            fontSize: '0.88rem',
            fontWeight: 900,
          }}
        >
          {nextMondayKey}
        </Box>

        <Box
          sx={{
            gridColumn: '3',
            gridRow: '1 / 5',
            borderRight:
              STRONG_BORDER,
            borderBottom:
              STRONG_BORDER,
            ...previewBaseSx,
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'center',
            fontSize: '0.62rem',
            fontWeight: 900,
            writingMode: 'vertical-rl',
          }}
        >
          결재
        </Box>

        <Box
          sx={{
            gridColumn: '4',
            gridRow: '1',
            borderRight:
              STRONG_BORDER,
            borderBottom:
              STRONG_BORDER,
            ...previewBaseSx,
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'center',
            fontSize: '0.64rem',
            fontWeight: 900,
          }}
        >
          담당
        </Box>

        <Box
          sx={{
            gridColumn: '4',
            gridRow: '2 / 5',
            borderRight:
              STRONG_BORDER,
            borderBottom:
              STRONG_BORDER,
            ...previewBaseSx,
          }}
        />

        <Box
          sx={{
            gridColumn: '5',
            gridRow: '1',
            borderRight:
              STRONG_BORDER,
            borderBottom:
              STRONG_BORDER,
            ...previewBaseSx,
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'center',
            fontSize: '0.64rem',
            fontWeight: 900,
          }}
        >
          대표이사
        </Box>

        <Box
          sx={{
            gridColumn: '5',
            gridRow: '2 / 5',
            borderRight:
              STRONG_BORDER,
            borderBottom:
              STRONG_BORDER,
            ...previewBaseSx,
          }}
        />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns:
            '5.99% 17.77% 76.24%',
        }}
      >
        {[
          '구분',
          '현장명',
          '특기사항',
        ].map((label) => (
          <Box
            key={label}
            sx={{
              minHeight: 27,
              borderRight:
                STRONG_BORDER,
              borderBottom:
                STRONG_BORDER,
              ...previewBaseSx,
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                'center',
              fontSize: '0.67rem',
              fontWeight: 900,
            }}
          >
            {label}
          </Box>
        ))}
      </Box>

      <Box
        sx={{
          display: 'flex',
          borderLeft:
            STRONG_BORDER,
        }}
      >
        <Box
          sx={{
            width: '5.99%',
            borderRight:
              STRONG_BORDER,
            borderBottom:
              STRONG_BORDER,
            ...previewBaseSx,
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'center',
            fontSize: '0.68rem',
            fontWeight: 900,
          }}
        >
          현장
        </Box>

        <Box sx={{ width: '94.01%' }}>
          {projects.map(
            (project) => (
              <PreviewProjectRows
                key={
                  project.projectName
                }
                project={project}
                cellRows={cellRows}
              />
            ),
          )}
        </Box>
      </Box>

      <OfficePreviewRows
        officeRows={officeRows}
        scheduleDates={
          scheduleDates
        }
        scheduleValues={
          scheduleValues
        }
      />
    </Box>
  );
}

export default function WeeklyOverview({
  userProfile,
  readOnly = false,
  weekStartOverride = '',
}) {
  const weekRange = useMemo(
    () =>
      weekStartOverride
        ? getWeekRangeFromStart(
            weekStartOverride,
          )
        : getKoreaWeekRange(),
    [weekStartOverride],
  );

  const draftStorageKey = useMemo(
    () =>
      createDraftStorageKey(
        weekRange.weekStart,
      ),
    [weekRange.weekStart],
  );

  const scheduleDates = useMemo(
    () =>
      Array.from(
        { length: 7 },
        (_, index) =>
          addDaysToISO(
            weekRange.nextMonday,
            index,
          ),
      ),
    [weekRange.nextMonday],
  );

  const [cellRows, setCellRows] =
    useState(
      createEmptyCellRows(),
    );

  const [
    sourceCellRows,
    setSourceCellRows,
  ] = useState(
    createEmptyCellRows(),
  );

  const [
    registeredProjects,
    setRegisteredProjects,
  ] = useState(new Set());

  const [
    systemProjectNames,
    setSystemProjectNames,
  ] = useState([]);

  const [
    manualProjectNames,
    setManualProjectNames,
  ] = useState([]);

  const [
    excludedSystemProjectNames,
    setExcludedSystemProjectNames,
  ] = useState([]);

  const [
    displayProjectNames,
    setDisplayProjectNames,
  ] = useState(
    TEMPLATE_PROJECT_NAMES,
  );

  const [
    weeklyReports,
    setWeeklyReports,
  ] = useState([]);

  const [
    projectSettingsOpen,
    setProjectSettingsOpen,
  ] = useState(false);

  const [
    projectSettingsDraft,
    setProjectSettingsDraft,
  ] = useState({
    manualProjectNames: [],
    excludedSystemProjectNames: [],
  });

  const [
    manualProjectInput,
    setManualProjectInput,
  ] = useState('');

  const overviewProjects = useMemo(
    () =>
      buildOverviewProjects(
        displayProjectNames,
      ),
    [displayProjectNames],
  );

  const [
    scheduleValues,
    setScheduleValues,
  ] = useState(
    createEmptyScheduleValues(),
  );

  const [
    officeRows,
    setOfficeRows,
  ] = useState(
    createEmptyOfficeRows(),
  );

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [downloading, setDownloading] =
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

  const [
    savedMetadata,
    setSavedMetadata,
  ] = useState(null);

  const isHydratedRef = useRef(false);
  const isDirtyRef = useRef(false);

  const markDirty = () => {
    isDirtyRef.current = true;
    setSuccessMessage('');
  };

  const loadData = useCallback(async () => {
    isHydratedRef.current = false;

    setLoading(true);
    setErrorMessage('');
    setWarningMessage('');
    setSuccessMessage('');
    setSavedMetadata(null);

    let reports = [];
    let savedOverview = null;
    let systemNames = [];

    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        'admin_list_projects_v1',
      );

      if (error) {
        throw error;
      }

      systemNames =
        normalizeProjectNameList(data);
    } catch (error) {
      console.error(
        '주간업무총괄 등록 현장 조회 실패:',
        error,
      );

      if (!readOnly) {
        setWarningMessage(
          '시스템 등록 현장 목록을 불러오지 못했습니다. ' +
            '주간업무 완료 현장을 기준으로 표시합니다.',
        );
      }
    }

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
        .maybeSingle();

      if (error) {
        throw error;
      }

      savedOverview = data || null;

      if (savedOverview) {
        setSavedMetadata({
          id: savedOverview.id,
          weekStart:
            savedOverview.week_start,
          weekEnd:
            savedOverview.week_end,
          displayPeriod:
            savedOverview.display_period,
          updatedByName:
            savedOverview.updated_by_name,
          updatedAt:
            savedOverview.updated_at,
        });
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
          week_end,
          payload,
          status,
          author_name,
          completed_at,
          updated_at
        `,
        )
        .eq(
          'week_start',
          weekRange.weekStart,
        )
        .eq('status', 'completed')
        .order('updated_at', {
          ascending: false,
        });

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
        (previous) =>
          previous ||
          (readOnly
            ? '자동보관 원본을 불러오지 못했습니다.'
            : '현재 주차 주간업무 원본을 불러오지 못했습니다. ' +
              '입력 화면은 사용할 수 있습니다.'),
      );
    }

    const draft =
      readOnly
        ? null
        : readDraft(
            draftStorageKey,
          );

    const savedProjectSettings =
      savedOverview?.payload
        ?.projectSettings || {};

    const draftProjectSettings =
      draft?.projectSettings || {};

    const nextManualProjectNames =
      normalizeProjectNameList(
        draftProjectSettings
          .manualProjectNames ??
          savedProjectSettings
            .manualProjectNames ??
          [],
      );

    const nextExcludedSystemProjectNames =
      normalizeProjectNameList(
        draftProjectSettings
          .excludedSystemProjectNames ??
          savedProjectSettings
            .excludedSystemProjectNames ??
          [],
      );

    const savedDisplayProjectNames =
      normalizeProjectNameList(
        draftProjectSettings
          .displayProjectNames ??
          savedProjectSettings
            .displayProjectNames ??
          [],
      );

    if (
      systemNames.length === 0 &&
      !readOnly
    ) {
      systemNames =
        normalizeProjectNameList(
          reports.map(
            (report) =>
              report?.project_name,
          ),
        );
    }

    const nextDisplayProjectNames =
      deriveOverviewProjectNames({
        systemProjectNames:
          systemNames,
        manualProjectNames:
          nextManualProjectNames,
        excludedSystemProjectNames:
          nextExcludedSystemProjectNames,
        weeklyReports: reports,
        savedDisplayProjectNames,
        readOnly,
        hasSavedProjectSettings:
          Boolean(
            savedOverview?.payload
              ?.projectSettings,
          ),
      });

    const nextProjects =
      buildOverviewProjects(
        nextDisplayProjectNames,
      );

    const nextSourceRows =
      createSourceCellRows(
        reports,
        nextProjects,
      );

    setSystemProjectNames(
      systemNames,
    );
    setManualProjectNames(
      nextManualProjectNames,
    );
    setExcludedSystemProjectNames(
      nextExcludedSystemProjectNames,
    );
    setDisplayProjectNames(
      nextDisplayProjectNames,
    );
    setWeeklyReports(reports);

    setSourceCellRows(
      nextSourceRows,
    );

    setRegisteredProjects(
      new Set(
        reports.map(
          (report) =>
            report.project_name,
        ),
      ),
    );

    let savedRows = null;
    let savedScheduleValues = null;
    let savedOfficeRows = null;

    if (savedOverview) {
      savedRows =
        migrateSavedPayload(
          savedOverview.payload,
          nextProjects,
        );

      savedScheduleValues =
        Array.from(
          { length: 7 },
          (_, index) =>
            String(
              savedOverview?.payload
                ?.scheduleValues
                ?.[index] || '',
            ),
        );

      savedOfficeRows =
        migrateSavedOfficeRows(
          savedOverview.payload,
        );
    }

    if (
      readOnly &&
      !savedRows
    ) {
      if (reports.length > 0) {
        const latestReportDate =
          reports.reduce(
            (latest, report) => {
              const candidate =
                report.updated_at ||
                report.completed_at ||
                '';

              return candidate >
                latest
                ? candidate
                : latest;
            },
            '',
          );

        setSavedMetadata({
          id:
            `auto:${weekRange.weekStart}`,
          weekStart:
            weekRange.weekStart,
          weekEnd:
            weekRange.weekEnd,
          displayPeriod:
            `${formatDisplayDate(
              weekRange.weekStart,
            )}~${formatDisplayDate(
              weekRange.weekEnd,
            )}`,
          updatedByName:
            `자동보관 · ${reports.length}개 현장`,
          updatedAt:
            latestReportDate,
          isAuto: true,
        });

        setWarningMessage(
          '별도 총괄 저장본이 없어 각 현장에서 완료한 주간업무를 자동보관하여 표시합니다. ' +
          '본사·공무 수기 입력은 저장된 총괄본이 있을 때만 복원됩니다.',
        );
      } else {
        setWarningMessage(
          '선택한 기간의 저장본과 완료된 주간업무가 없습니다.',
        );
      }
    }

    const nextCellRows =
      draft?.cellRows
        ? migrateSavedPayload(
            {
              cellRows:
                draft.cellRows,
            },
            nextProjects,
          )
        : savedRows ||
          nextSourceRows;

    const nextScheduleValues =
      Array.isArray(
        draft?.scheduleValues,
      )
        ? Array.from(
            { length: 7 },
            (_, index) =>
              String(
                draft.scheduleValues[
                  index
                ] || '',
              ),
          )
        : savedScheduleValues ||
          createEmptyScheduleValues();

    const nextOfficeRows =
      draft?.officeRows
        ? migrateSavedOfficeRows({
            officeRows:
              draft.officeRows,
          })
        : savedOfficeRows ||
          createEmptyOfficeRows();

    setCellRows(nextCellRows);
    setScheduleValues(
      nextScheduleValues,
    );
    setOfficeRows(nextOfficeRows);

    isDirtyRef.current =
      Boolean(draft);

    if (
      draft &&
      !readOnly
    ) {
      setWarningMessage(
        '저장하지 않은 작성 내용이 임시저장에서 복원되었습니다.',
      );
    }

    isHydratedRef.current = true;
    setLoading(false);
  }, [
    draftStorageKey,
    readOnly,
    weekRange.weekEnd,
    weekRange.weekStart,
  ]);

  useEffect(() => {
    loadData();

    const handleWeeklyChanged = () => {
      /*
        작성 중인 내용이 있으면 외부 이벤트로
        현재 화면을 다시 불러오지 않습니다.
      */
      if (!isDirtyRef.current) {
        loadData();
      }
    };

    window.addEventListener(
      'weekly-report-completed',
      handleWeeklyChanged,
    );

    return () => {
      window.removeEventListener(
        'weekly-report-completed',
        handleWeeklyChanged,
      );
    };
  }, [loadData]);

  useEffect(() => {
    if (
      readOnly ||
      !isHydratedRef.current
    ) {
      return;
    }

    writeDraft(
      draftStorageKey,
      {
        cellRows,
        officeRows,
        scheduleValues,
        projectSettings: {
          manualProjectNames,
          excludedSystemProjectNames,
          displayProjectNames,
        },
        savedAt:
          new Date().toISOString(),
      },
    );
  }, [
    cellRows,
    displayProjectNames,
    draftStorageKey,
    excludedSystemProjectNames,
    manualProjectNames,
    officeRows,
    readOnly,
    scheduleValues,
  ]);

  const handleOpenProjectSettings = () => {
    setProjectSettingsDraft({
      manualProjectNames: [
        ...manualProjectNames,
      ],
      excludedSystemProjectNames: [
        ...excludedSystemProjectNames,
      ],
    });
    setManualProjectInput('');
    setProjectSettingsOpen(true);
  };

  const handleToggleSystemProject = (
    projectName,
    checked,
  ) => {
    setProjectSettingsDraft(
      (previous) => {
        const excluded =
          new Set(
            normalizeProjectNameList(
              previous
                .excludedSystemProjectNames,
            ),
          );

        if (checked) {
          excluded.delete(projectName);
        } else {
          excluded.add(projectName);
        }

        return {
          ...previous,
          excludedSystemProjectNames:
            Array.from(excluded),
        };
      },
    );
  };

  const handleAddManualProject = () => {
    const projectName =
      String(
        manualProjectInput || '',
      ).trim();

    if (!projectName) {
      return;
    }

    if (
      systemProjectNames.includes(
        projectName,
      )
    ) {
      window.alert(
        '이미 시스템에 등록된 현장입니다. 시스템 등록 현장에서 선택해주세요.',
      );
      return;
    }

    setProjectSettingsDraft(
      (previous) => ({
        ...previous,
        manualProjectNames:
          normalizeProjectNameList([
            ...previous
              .manualProjectNames,
            projectName,
          ]),
      }),
    );

    setManualProjectInput('');
  };

  const handleDeleteManualProject = (
    projectName,
  ) => {
    setProjectSettingsDraft(
      (previous) => ({
        ...previous,
        manualProjectNames:
          previous.manualProjectNames.filter(
            (name) =>
              name !== projectName,
          ),
      }),
    );
  };

  const handleApplyProjectSettings = () => {
    const nextManual =
      normalizeProjectNameList(
        projectSettingsDraft
          .manualProjectNames,
      );

    const nextExcluded =
      normalizeProjectNameList(
        projectSettingsDraft
          .excludedSystemProjectNames,
      );

    const selectedSystemCount =
      systemProjectNames.filter(
        (name) =>
          !nextExcluded.includes(name),
      ).length;

    const totalSelected =
      selectedSystemCount +
      nextManual.length;

    const nextDisplay =
      deriveOverviewProjectNames({
        systemProjectNames,
        manualProjectNames:
          nextManual,
        excludedSystemProjectNames:
          nextExcluded,
        weeklyReports,
        savedDisplayProjectNames:
          displayProjectNames,
        readOnly: false,
        hasSavedProjectSettings: true,
      });

    const nextProjects =
      buildOverviewProjects(
        nextDisplay,
      );

    const currentRowsByProject =
      new Map(
        overviewProjects.map(
          (project) => [
            project.projectName,
            {
              processRows:
                normalizeRows(
                  cellRows[
                    project
                      .processCell
                  ],
                ),
              specialRows:
                normalizeRows(
                  cellRows[
                    project
                      .specialCell
                  ],
                ),
            },
          ],
        ),
      );

    const nextSourceRows =
      createSourceCellRows(
        weeklyReports,
        nextProjects,
      );

    const nextCellRows =
      createEmptyCellRows();

    nextProjects.forEach(
      (project) => {
        const previousRows =
          currentRowsByProject.get(
            project.projectName,
          );

        nextCellRows[
          project.processCell
        ] =
          previousRows?.processRows ||
          normalizeRows(
            nextSourceRows[
              project.processCell
            ],
          );

        nextCellRows[
          project.specialCell
        ] =
          previousRows?.specialRows ||
          normalizeRows(
            nextSourceRows[
              project.specialCell
            ],
          );
      },
    );

    setManualProjectNames(
      nextManual,
    );
    setExcludedSystemProjectNames(
      nextExcluded,
    );
    setDisplayProjectNames(
      nextDisplay,
    );
    setSourceCellRows(
      nextSourceRows,
    );
    setCellRows(nextCellRows);
    setProjectSettingsOpen(false);

    if (
      totalSelected >
      MAX_OVERVIEW_PROJECTS
    ) {
      setWarningMessage(
        `주간업무총괄 양식은 최대 ${MAX_OVERVIEW_PROJECTS}개 현장을 표시합니다. ` +
          `현재 ${totalSelected}개가 선택되어 있으며 수동 추가 현장과 주간업무 등록 현장을 우선 표시합니다.`,
      );
    }

    markDirty();
  };

  const handleOfficeRowChange = (
    fieldKey,
    index,
    value,
  ) => {
    setOfficeRows((previous) => ({
      ...previous,
      [fieldKey]:
        normalizeRows(
          previous[fieldKey],
        ).map(
          (row, rowIndex) =>
            rowIndex === index
              ? value
              : row,
        ),
    }));

    markDirty();
  };

  const handleAddOfficeRow = (
    fieldKey,
  ) => {
    setOfficeRows((previous) => ({
      ...previous,
      [fieldKey]: [
        ...normalizeRows(
          previous[fieldKey],
        ),
        '',
      ],
    }));

    markDirty();
  };

  const handleDeleteOfficeRow = (
    fieldKey,
    index,
  ) => {
    setOfficeRows((previous) => {
      const currentRows =
        normalizeRows(
          previous[fieldKey],
        );

      const nextRows =
        currentRows.filter(
          (_, rowIndex) =>
            rowIndex !== index,
        );

      return {
        ...previous,
        [fieldKey]:
          nextRows.length > 0
            ? nextRows
            : [''],
      };
    });

    markDirty();
  };

  const handleClearOffice = () => {
    setOfficeRows(
      createEmptyOfficeRows(),
    );

    markDirty();
  };

  const handleScheduleValueChange = (
    index,
    value,
  ) => {
    setScheduleValues((previous) =>
      previous.map(
        (item, itemIndex) =>
          itemIndex === index
            ? value
            : item,
      ),
    );

    markDirty();
  };

  const handleClearSchedule = () => {
    setScheduleValues(
      createEmptyScheduleValues(),
    );

    markDirty();
  };

  const handleRowChange = (
    cellAddress,
    index,
    value,
  ) => {
    setCellRows((previous) => ({
      ...previous,
      [cellAddress]:
        normalizeRows(
          previous[cellAddress],
        ).map(
          (row, rowIndex) =>
            rowIndex === index
              ? value
              : row,
        ),
    }));

    markDirty();
  };

  const handleAddRow = (
    cellAddress,
  ) => {
    setCellRows((previous) => ({
      ...previous,
      [cellAddress]: [
        ...normalizeRows(
          previous[cellAddress],
        ),
        '',
      ],
    }));

    markDirty();
  };

  const handleDeleteRow = (
    cellAddress,
    index,
  ) => {
    setCellRows((previous) => {
      const currentRows =
        normalizeRows(
          previous[cellAddress],
        );

      const nextRows =
        currentRows.filter(
          (_, rowIndex) =>
            rowIndex !== index,
        );

      return {
        ...previous,
        [cellAddress]:
          nextRows.length > 0
            ? nextRows
            : [''],
      };
    });

    markDirty();
  };

  const handleRestoreProject = (
    project,
  ) => {
    setCellRows((previous) => ({
      ...previous,
      [project.processCell]:
        normalizeRows(
          sourceCellRows[
            project.processCell
          ],
        ),
      [project.specialCell]:
        normalizeRows(
          sourceCellRows[
            project.specialCell
          ],
        ),
    }));

    markDirty();
  };

  const handleClearProject = (
    project,
  ) => {
    setCellRows((previous) => ({
      ...previous,
      [project.processCell]: [''],
      [project.specialCell]: [''],
    }));

    markDirty();
  };

  const handleRestoreAll = () => {
    const confirmed = window.confirm(
      '현재 주차 각 현장의 주간업무 주요보고 원본으로 다시 불러오시겠습니까?',
    );

    if (!confirmed) {
      return;
    }

    setCellRows(
      Object.fromEntries(
        Object.entries(
          sourceCellRows,
        ).map(
          ([address, rows]) => [
            address,
            normalizeRows(rows),
          ],
        ),
      ),
    );

    markDirty();
  };

  const handleManualReload = () => {
    if (
      isDirtyRef.current &&
      !window.confirm(
        '저장하지 않은 작성 내용이 있습니다. 원본과 저장본을 다시 불러오시겠습니까?',
      )
    ) {
      return;
    }

    removeDraft(
      draftStorageKey,
    );

    isDirtyRef.current = false;
    loadData();
  };

  const handleDownloadExcel = async () => {
    setDownloading(true);
    setErrorMessage('');

    try {
      const templateUrl =
        '/templates/' +
        '주간업무총괄.xlsx' +
        `?v=${Date.now()}`;

      const response = await fetch(
        templateUrl,
        {
          cache: 'no-store',
        },
      );

      if (!response.ok) {
        throw new Error(
          'public/templates/주간업무총괄.xlsx 원본 파일을 찾을 수 없습니다.',
        );
      }

      const arrayBuffer =
        await response.arrayBuffer();

      const bytes =
        new Uint8Array(arrayBuffer);

      if (
        bytes.length < 4 ||
        bytes[0] !== 0x50 ||
        bytes[1] !== 0x4b
      ) {
        throw new Error(
          '주간업무총괄.xlsx가 올바른 엑셀 파일이 아닙니다.',
        );
      }

      const workbook =
        new ExcelJS.Workbook();

      try {
        await workbook.xlsx.load(
          arrayBuffer,
        );
      } catch (loadError) {
        throw new Error(
          '주간업무총괄.xlsx 원본을 읽지 못했습니다. ' +
          'public/templates의 파일을 제공된 원본으로 교체해주세요. ' +
          `(${loadError?.message || 'load error'})`,
        );
      }

      const worksheet =
        workbook.getWorksheet(
          '주간업무총괄',
        ) ||
        workbook.worksheets[0];

      if (!worksheet) {
        throw new Error(
          '주간업무총괄 양식 시트를 찾지 못했습니다.',
        );
      }

      const dateCell =
        worksheet.getCell('C3');

      dateCell.value =
        weekRange.nextMonday;

      dateCell.numFmt = '@';

      dateCell.font = {
        ...(dateCell.font || {}),
        name: '맑은 고딕',
        size: 14,
        bold: true,
        italic: false,
      };

      dateCell.alignment = {
        ...(dateCell.alignment || {}),
        horizontal: 'center',
        vertical: 'middle',
        wrapText: false,
      };

      SCHEDULE_DATE_CELLS.forEach(
        (address, index) => {
          const cell =
            worksheet.getCell(address);

          cell.value =
            formatMonthDay(
              scheduleDates[index],
            );

          cell.numFmt = '@';

          cell.alignment = {
            ...(cell.alignment || {}),
            horizontal: 'center',
            vertical: 'middle',
            wrapText: false,
          };
        },
      );

      SCHEDULE_INPUT_CELLS.forEach(
        (address, index) => {
          const cell =
            worksheet.getCell(address);

          cell.value =
            String(
              scheduleValues[index] || '',
            );

          cell.alignment = {
            ...(cell.alignment || {}),
            horizontal: 'center',
            vertical: 'middle',
            wrapText: true,
          };
        },
      );

      OFFICE_INPUT_FIELDS.forEach(
        (field) => {
          const rows =
            normalizeRows(
              officeRows[field.key],
            );

          const rowCount =
            field.endRow -
            field.startRow +
            1;

          /*
            템플릿의 셀 병합과 테두리를 변경하지 않습니다.

            기존에는 C:N 전체를 하나로 병합하면서
            원본 셀 서식과 테두리가 깨졌습니다.

            이제 각 행의 C열에 한 줄씩 입력하고
            D:N은 비워둬 원본 테두리와 셀 구조를 유지합니다.
          */
          for (
            let rowNumber =
              field.startRow;
            rowNumber <=
              field.endRow;
            rowNumber += 1
          ) {
            for (
              let columnNumber = 3;
              columnNumber <= 14;
              columnNumber += 1
            ) {
              worksheet.getCell(
                rowNumber,
                columnNumber,
              ).value = null;
            }
          }

          const displayRows =
            Array.from(
              { length: rowCount },
              (_, index) => {
                if (
                  index <
                  rowCount - 1
                ) {
                  return String(
                    rows[index] || '',
                  );
                }

                return rows
                  .slice(index)
                  .map(
                    (value) =>
                      String(
                        value || '',
                      ),
                  )
                  .filter(Boolean)
                  .join('\n');
              },
            );

          displayRows.forEach(
            (value, index) => {
              const rowNumber =
                field.startRow +
                index;

              const cell =
                worksheet.getCell(
                  rowNumber,
                  3,
                );

              cell.value = value;

              cell.alignment = {
                ...(cell.alignment || {}),
                horizontal: 'left',
                vertical: 'middle',
                wrapText:
                  value.includes(
                    '\n',
                  ),
              };

              const lineCount =
                Math.max(
                  1,
                  value
                    .split('\n')
                    .length,
                );

              const currentHeight =
                Number(
                  worksheet.getRow(
                    rowNumber,
                  ).height,
                ) || 16.5;

              worksheet.getRow(
                rowNumber,
              ).height =
                Math.max(
                  currentHeight,
                  lineCount * 17 +
                    3,
                );
            },
          );
        },
      );

      TEMPLATE_PROJECTS.forEach(
        (_slot, index) => {
          const project =
            overviewProjects[index];

          const nameCell =
            worksheet.getCell(
              `B${6 + index * 4}`,
            );

          nameCell.value =
            project?.projectName || '';
        },
      );

      worksheet.pageSetup.printArea =
        'A1:N74';

      TEMPLATE_CELL_ADDRESSES.forEach(
        (address) => {
          const rows =
            normalizeRows(
              cellRows[address],
            );

          const cell =
            worksheet.getCell(address);

          cell.value =
            rowsToText(rows);

          cell.alignment = {
            ...(cell.alignment || {}),
            horizontal: 'left',
            vertical: 'middle',
            wrapText: true,
          };

          const rowNumber =
            getExcelRowNumber(address);

          const worksheetRow =
            worksheet.getRow(rowNumber);

          const baseHeight =
            Number(
              worksheetRow.height,
            ) || 16.5;

          worksheetRow.height =
            Math.max(
              baseHeight,
              rows.length * 17 + 4,
            );
        },
      );

      await saveWorkbook(
        workbook,
        `주간업무총괄_${weekRange.nextMonday}.xlsx`,
      );
    } catch (error) {
      console.error(
        '주간업무총괄 XLS 다운로드 실패:',
        error,
      );

      setErrorMessage(
        error?.message ||
        '주간업무총괄 엑셀을 다운로드하지 못했습니다.',
      );
    } finally {
      setDownloading(false);
    }
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

      const cellValues =
        Object.fromEntries(
          TEMPLATE_CELL_ADDRESSES.map(
            (address) => [
              address,
              rowsToText(
                cellRows[address],
              ),
            ],
          ),
        );

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
              cellRows,
              cellValues,
              scheduleValues,
              officeRows,
              projectSettings: {
                manualProjectNames,
                excludedSystemProjectNames,
                displayProjectNames,
              },
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

      removeDraft(
        draftStorageKey,
      );

      isDirtyRef.current = false;

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

  if (readOnly) {
    return (
      <Paper
        variant="outlined"
        sx={{
          width: '100%',
          height: '100%',
          minHeight: 620,
          display: 'flex',
          flexDirection: 'column',
          borderColor: '#cbd5e1',
          bgcolor: '#ffffff',
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
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                color: '#0f172a',
                fontSize: '0.86rem',
                fontWeight: 900,
              }}
            >
              {savedMetadata?.isAuto
                ? '주간업무 자동보관본'
                : '주간업무 저장본'}
            </Typography>

            <Typography
              sx={{
                mt: 0.15,
                color: '#64748b',
                fontSize: '0.66rem',
              }}
            >
              {formatDisplayDate(
                weekRange.weekStart,
              )}
              {' ~ '}
              {formatDisplayDate(
                weekRange.weekEnd,
              )}
              {savedMetadata
                ?.updatedByName
                ? ` · 저장자 ${savedMetadata.updatedByName}`
                : ''}
            </Typography>
          </Box>

          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={
              handleDownloadExcel
            }
            disabled={
              downloading ||
              !savedMetadata
            }
            sx={{
              minWidth: 72,
              px: 0.8,
              whiteSpace: 'nowrap',
              fontSize: '0.64rem',
              fontWeight: 900,
            }}
          >
            {downloading
              ? '생성중'
              : 'XLS 다운로드'}
          </Button>
        </Box>

        {warningMessage && (
          <Alert
            severity="warning"
            sx={{
              mx: 1,
              mt: 1,
              fontSize: '0.68rem',
            }}
          >
            {warningMessage}
          </Alert>
        )}

        {errorMessage && (
          <Alert
            severity="error"
            sx={{
              mx: 1,
              mt: 1,
              fontSize: '0.68rem',
            }}
          >
            {errorMessage}
          </Alert>
        )}

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            p: 1.2,
            bgcolor: '#e2e8f0',
          }}
        >
          {savedMetadata ? (
            <ExcelTemplatePreview
              projects={overviewProjects}
              cellRows={cellRows}
              nextMondayKey={
                weekRange.nextMonday
              }
              scheduleDates={
                scheduleDates.map(
                  formatMonthDay,
                )
              }
              scheduleValues={
                scheduleValues
              }
              officeRows={
                officeRows
              }
            />
          ) : (
            <Box
              sx={{
                minHeight: 420,
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  'center',
              }}
            >
              <Typography
                sx={{
                  color: '#64748b',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                }}
              >
                선택한 주차의 저장본이 없습니다.
              </Typography>
            </Box>
          )}
        </Box>
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
            'minmax(430px, 0.8fr) ' +
            'minmax(720px, 1.2fr)',
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
            <SystemPageTitle
              title="주간업무총괄 작성"
              help="각 현장의 주간업무를 총괄 양식으로 작성·저장하고 미리보기와 Excel 파일에 반영합니다. 행 추가 내용은 줄 단위로 반영됩니다."
            />

            
          </Box>

          <Box
            sx={{
              flexShrink: 0,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              gap: 0.45,
            }}
          >
            <Button
              size="small"
              variant="outlined"
              onClick={
                handleOpenProjectSettings
              }
              sx={{
                minWidth: 76,
                px: 0.75,
                whiteSpace: 'nowrap',
                fontSize: '0.62rem',
                fontWeight: 900,
              }}
            >
              현장 설정
            </Button>

            <Button
              size="small"
              variant="contained"
              color="success"
              onClick={
                handleDownloadExcel
              }
              disabled={downloading}
              sx={{
                minWidth: 54,
                px: 0.8,
                whiteSpace: 'nowrap',
                fontSize: '0.64rem',
                fontWeight: 900,
              }}
            >
              {downloading
                ? '생성중'
                : 'XLS'}
            </Button>

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

            <SystemRefreshButton
              onClick={handleManualReload}
              disabled={saving}
              label="주간업무총괄 새로고침"
            />

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
              {' · '}
              C3 기준일:{' '}
              {weekRange.nextMonday}
            </Typography>
          </Paper>

          {warningMessage && (
            <Alert
              severity="warning"
              sx={{
                fontSize: '0.68rem',
              }}
            >
              {warningMessage}
            </Alert>
          )}

          {errorMessage && (
            <Alert
              severity="error"
              sx={{
                fontSize: '0.68rem',
              }}
            >
              {errorMessage}
            </Alert>
          )}

          {successMessage && (
            <Alert
              severity="success"
              sx={{
                fontSize: '0.68rem',
              }}
            >
              {successMessage}
            </Alert>
          )}
        </Box>

        <Box
          sx={{
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            flex: 1,
            minHeight: 540,
            overflowY: 'auto',
            overflowX: 'hidden',
            px: 1,
            py: 1,
            bgcolor: '#f8fafc',
            boxSizing: 'border-box',
          }}
        >
          {overviewProjects.map(
            (project) => (
              <ProjectEditor
                key={
                  project.projectName
                }
                project={project}
                cellRows={cellRows}
                registered={
                  registeredProjects.has(
                    project.projectName,
                  )
                }
                onRowChange={
                  handleRowChange
                }
                onAddRow={handleAddRow}
                onDeleteRow={
                  handleDeleteRow
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

          <OfficeInputCard
            officeRows={officeRows}
            scheduleDates={
              scheduleDates
            }
            scheduleValues={
              scheduleValues
            }
            onOfficeRowChange={
              handleOfficeRowChange
            }
            onAddOfficeRow={
              handleAddOfficeRow
            }
            onDeleteOfficeRow={
              handleDeleteOfficeRow
            }
            onClearOffice={
              handleClearOffice
            }
            onScheduleChange={
              handleScheduleValueChange
            }
            onClearSchedule={
              handleClearSchedule
            }
          />
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
            하자보수 일정은 전체 폭을 7등분하고,
            입력행 수에 맞춰 셀 높이가 자동으로 늘어납니다.
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
            projects={overviewProjects}
            cellRows={cellRows}
            nextMondayKey={
              weekRange.nextMonday
            }
            scheduleDates={
              scheduleDates.map(
                formatMonthDay,
              )
            }
            scheduleValues={
              scheduleValues
            }
            officeRows={officeRows}
          />
        </Box>
      </Paper>

      <Dialog
        open={projectSettingsOpen}
        onClose={() =>
          setProjectSettingsOpen(false)
        }
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle
          sx={{
            pb: 1,
            fontSize: '1rem',
            fontWeight: 900,
          }}
        >
          주간업무총괄 현장 설정
        </DialogTitle>

        <DialogContent dividers>
          <Alert
            severity="info"
            sx={{
              mb: 1.5,
              fontSize: '0.72rem',
            }}
          >
            시스템에 등록된 현장은 기본으로 포함됩니다.
            종료된 현장처럼 시스템에 없는 현장은 아래에서
            이번 주 총괄용 수동 현장으로 추가할 수 있습니다.
            양식에는 최대 {MAX_OVERVIEW_PROJECTS}개 현장이 표시됩니다.
          </Alert>

          <Typography
            sx={{
              mb: 0.7,
              color: '#334155',
              fontSize: '0.78rem',
              fontWeight: 900,
            }}
          >
            시스템 등록 현장
          </Typography>

          <Paper
            variant="outlined"
            sx={{
              maxHeight: 250,
              overflowY: 'auto',
              p: 0.8,
              borderColor: '#e2e8f0',
              boxShadow: 'none',
            }}
          >
            {systemProjectNames.length > 0 ? (
              systemProjectNames.map(
                (projectName) => (
                  <FormControlLabel
                    key={projectName}
                    sx={{
                      width: '100%',
                      m: 0,
                      py: 0.15,
                      '& .MuiFormControlLabel-label':
                        {
                          fontSize:
                            '0.75rem',
                          fontWeight: 700,
                        },
                    }}
                    control={
                      <Checkbox
                        size="small"
                        checked={
                          !projectSettingsDraft
                            .excludedSystemProjectNames
                            .includes(
                              projectName,
                            )
                        }
                        onChange={(
                          event,
                        ) =>
                          handleToggleSystemProject(
                            projectName,
                            event.target
                              .checked,
                          )
                        }
                      />
                    }
                    label={projectName}
                  />
                ),
              )
            ) : (
              <Typography
                sx={{
                  py: 1,
                  color: '#94a3b8',
                  fontSize: '0.72rem',
                }}
              >
                시스템 등록 현장을 불러오지 못했습니다.
              </Typography>
            )}
          </Paper>

          <Typography
            sx={{
              mt: 1.6,
              mb: 0.7,
              color: '#334155',
              fontSize: '0.78rem',
              fontWeight: 900,
            }}
          >
            이번 주 수동 현장
          </Typography>

          <Box
            sx={{
              display: 'flex',
              gap: 0.6,
              alignItems: 'center',
            }}
          >
            <TextField
              fullWidth
              size="small"
              value={manualProjectInput}
              placeholder="예: 종료현장 하자보수"
              onChange={(event) =>
                setManualProjectInput(
                  event.target.value,
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter'
                ) {
                  event.preventDefault();
                  handleAddManualProject();
                }
              }}
            />

            <Button
              variant="contained"
              onClick={handleAddManualProject}
              sx={{
                minWidth: 64,
                whiteSpace: 'nowrap',
                fontWeight: 800,
              }}
            >
              추가
            </Button>
          </Box>

          <Box
            sx={{
              mt: 0.9,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.6,
            }}
          >
            {projectSettingsDraft
              .manualProjectNames
              .map((projectName) => (
                <Chip
                  key={projectName}
                  label={`${projectName} · 수동`}
                  onDelete={() =>
                    handleDeleteManualProject(
                      projectName,
                    )
                  }
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              ))}

            {projectSettingsDraft
              .manualProjectNames
              .length === 0 && (
              <Typography
                sx={{
                  color: '#94a3b8',
                  fontSize: '0.7rem',
                }}
              >
                추가된 수동 현장이 없습니다.
              </Typography>
            )}
          </Box>

          {(
            systemProjectNames.filter(
              (name) =>
                !projectSettingsDraft
                  .excludedSystemProjectNames
                  .includes(name),
            ).length +
            projectSettingsDraft
              .manualProjectNames.length
          ) > MAX_OVERVIEW_PROJECTS && (
            <Alert
              severity="warning"
              sx={{
                mt: 1.3,
                fontSize: '0.72rem',
              }}
            >
              현재 선택 현장이 {systemProjectNames.filter(
                (name) =>
                  !projectSettingsDraft
                    .excludedSystemProjectNames
                    .includes(name),
              ).length +
                projectSettingsDraft
                  .manualProjectNames
                  .length}개입니다.
              최대 {MAX_OVERVIEW_PROJECTS}개까지 표시되므로,
              필요 없는 시스템 현장의 체크를 해제해주세요.
            </Alert>
          )}
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setProjectSettingsOpen(
                false,
              )
            }
          >
            취소
          </Button>

          <Button
            variant="contained"
            onClick={
              handleApplyProjectSettings
            }
          >
            적용
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
