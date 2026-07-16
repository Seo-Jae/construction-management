import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';

const SUPABASE_PAGE_SIZE = 1000;
const ALL_PROJECTS_OPTION = '전체현장';

/*
  현재 월을 포함한 최근 19개월을 표시합니다.

  예:
  현재 월이 2026-07이면
  2025-01 ~ 2026-07

  다음 달이 2026-08이면
  2025-02 ~ 2026-08
*/
const DISPLAY_MONTH_COUNT = 19;

const DAILY_REPORT_JOB_ORDER = [
  '소장',
  '관리자',
  '직영',
  '먹매김',
  '단열',
  '합지',
  '경량벽체',
  '세대천정',
  '공용홀천정',
  '몰딩',
  '걸레받이',
  '수장',
  '외주',
  '기타',
  '용역',
];

const FILTER_OPTIONS = [
  {
    value: 'all',
    label: '전체 조회',
  },
  {
    value: '10',
    label: '10개월 조회',
  },
  {
    value: '11',
    label: '11개월 조회',
  },
  {
    value: '12',
    label: '12개월 조회',
  },
  {
    value: 'over',
    label: '초과자 조회',
  },
];

const normalizeWorkerName = (name) =>
  String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const normalizeText = (value) =>
  String(value || '').trim();

const getJobOrder = (job) => {
  const index = DAILY_REPORT_JOB_ORDER.indexOf(
    normalizeText(job),
  );

  return index === -1
    ? DAILY_REPORT_JOB_ORDER.length
    : index;
};

const parseReportDate = (dateValue) => {
  const value = normalizeText(dateValue);

  if (!value) {
    return null;
  }

  let match = value.match(
    /^(\d{2})\.(\d{2})\.(\d{2})$/,
  );

  if (match) {
    return {
      year: 2000 + Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }

  match = value.match(
    /^(\d{4})[-.](\d{2})[-.](\d{2})$/,
  );

  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }

  return null;
};

const createMonthKey = (year, month) =>
  `${year}-${String(month).padStart(2, '0')}`;

const parseMonthKey = (monthKey) => {
  const [year, month] = String(monthKey)
    .split('-')
    .map(Number);

  return {
    year,
    month,
  };
};

const getKoreaCurrentMonthKey = () => {
  const formatter = new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
    },
  );

  const parts = {};

  formatter
    .formatToParts(new Date())
    .forEach((part) => {
      if (part.type !== 'literal') {
        parts[part.type] = part.value;
      }
    });

  return `${parts.year}-${parts.month}`;
};

const compareMonthKeys = (
  first,
  second,
) =>
  String(first).localeCompare(
    String(second),
  );

const buildRecentMonthKeys = (
  currentMonthKey =
    getKoreaCurrentMonthKey(),
  monthCount =
    DISPLAY_MONTH_COUNT,
) => {
  const current =
    parseMonthKey(currentMonthKey);

  const result = [];

  for (
    let offset =
      monthCount - 1;
    offset >= 0;
    offset -= 1
  ) {
    const date = new Date(
      Date.UTC(
        current.year,
        current.month - 1 - offset,
        1,
      ),
    );

    result.push(
      createMonthKey(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
      ),
    );
  }

  return result;
};

const getRowBackground = (
  totalMonths,
) => {
  if (totalMonths === 10) {
    return '#fff1f2';
  }

  if (totalMonths === 11) {
    return '#ffe4e6';
  }

  if (totalMonths >= 12) {
    return '#fecdd3';
  }

  return '#ffffff';
};

const getRowHoverBackground = (
  totalMonths,
) => {
  if (totalMonths === 10) {
    return '#ffe4e6';
  }

  if (totalMonths === 11) {
    return '#fecdd3';
  }

  if (totalMonths >= 12) {
    return '#fda4af';
  }

  return '#f8fafc';
};

const resolveWorkers = (workersValue) => {
  if (Array.isArray(workersValue)) {
    return workersValue;
  }

  if (typeof workersValue === 'string') {
    try {
      const parsed =
        JSON.parse(workersValue);

      return Array.isArray(parsed)
        ? parsed
        : [];
    } catch {
      return [];
    }
  }

  return [];
};

const fetchAllDailyReports = async (
  projectScope,
) => {
  const allRows = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from('daily_reports')
      .select(
        'project_name, date, workers',
      )
      .order('date', {
        ascending: true,
      })
      .range(
        from,
        from + SUPABASE_PAGE_SIZE - 1,
      );

    if (
      projectScope &&
      projectScope !==
        ALL_PROJECTS_OPTION
    ) {
      query = query.eq(
        'project_name',
        projectScope,
      );
    }

    const {
      data,
      error,
    } = await query;

    if (error) {
      throw error;
    }

    const rows = data || [];
    allRows.push(...rows);

    if (
      rows.length <
      SUPABASE_PAGE_SIZE
    ) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  return allRows;
};

const buildCumulativeWorkers = (
  reportRows,
) => {
  const workerMap = new Map();

  reportRows.forEach((report) => {
    const parsedDate =
      parseReportDate(report?.date);

    if (!parsedDate) {
      return;
    }

    const monthKey =
      createMonthKey(
        parsedDate.year,
        parsedDate.month,
      );

    const projectName =
      normalizeText(
        report?.project_name,
      ) || '현장 미등록';

    resolveWorkers(
      report?.workers,
    ).forEach((worker) => {
      const name =
        normalizeText(worker?.name);
      const job =
        normalizeText(worker?.job) ||
        '미지정';

      if (!name) {
        return;
      }

      /*
        기존 금월 투입현황과 동일하게
        직종과 성명을 합쳐 근로자를 구분합니다.
      */
      const workerKey =
        `${job}::${normalizeWorkerName(
          name,
        )}`;

      if (!workerMap.has(workerKey)) {
        workerMap.set(workerKey, {
          key: workerKey,
          job,
          name,
          projectNames: new Set(),
          workedMonths: new Set(),
        });
      }

      const target =
        workerMap.get(workerKey);

      target.projectNames.add(
        projectName,
      );

      /*
        같은 달에 며칠을 출력했든
        Set에 월을 한 번만 저장하므로 1로 집계됩니다.
      */
      target.workedMonths.add(
        monthKey,
      );
    });
  });

  const workers = Array.from(
    workerMap.values(),
  ).map((worker) => ({
    ...worker,
    projectNames:
      Array.from(
        worker.projectNames,
      ).sort((first, second) =>
        first.localeCompare(
          second,
          'ko',
          {
            numeric: true,
          },
        ),
      ),
    totalMonths:
      worker.workedMonths.size,
  }));

  workers.sort((first, second) => {
    if (
      second.totalMonths !==
      first.totalMonths
    ) {
      return (
        second.totalMonths -
        first.totalMonths
      );
    }

    const jobOrderCompare =
      getJobOrder(first.job) -
      getJobOrder(second.job);

    if (jobOrderCompare !== 0) {
      return jobOrderCompare;
    }

    const jobCompare =
      first.job.localeCompare(
        second.job,
        'ko',
        {
          numeric: true,
        },
      );

    if (jobCompare !== 0) {
      return jobCompare;
    }

    return first.name.localeCompare(
      second.name,
      'ko',
      {
        numeric: true,
      },
    );
  });

  return {
    workers,
    monthKeys:
      buildRecentMonthKeys(),
  };
};

const getFilterCount = (
  workers,
  filterValue,
) => {
  if (filterValue === '10') {
    return workers.filter(
      (worker) =>
        worker.totalMonths === 10,
    ).length;
  }

  if (filterValue === '11') {
    return workers.filter(
      (worker) =>
        worker.totalMonths === 11,
    ).length;
  }

  if (filterValue === '12') {
    return workers.filter(
      (worker) =>
        worker.totalMonths === 12,
    ).length;
  }

  if (filterValue === 'over') {
    return workers.filter(
      (worker) =>
        worker.totalMonths > 12,
    ).length;
  }

  return workers.length;
};

const matchesMonthFilter = (
  worker,
  filterValue,
) => {
  if (filterValue === '10') {
    return worker.totalMonths === 10;
  }

  if (filterValue === '11') {
    return worker.totalMonths === 11;
  }

  if (filterValue === '12') {
    return worker.totalMonths === 12;
  }

  if (filterValue === 'over') {
    return worker.totalMonths > 12;
  }

  return true;
};

const groupMonthsByYear = (
  monthKeys,
) => {
  const result = [];

  monthKeys.forEach((monthKey) => {
    const {
      year,
    } = parseMonthKey(monthKey);

    const last =
      result[result.length - 1];

    if (
      !last ||
      last.year !== year
    ) {
      result.push({
        year,
        monthKeys: [monthKey],
      });

      return;
    }

    last.monthKeys.push(monthKey);
  });

  return result;
};

export default function CumulativeWorkerStatus({
  projectScope = '',
  userRole = '담당자',
}) {
  const isManagementRole = [
    '관리자',
    '최고관리자',
  ].includes(userRole);

  const effectiveScope =
    isManagementRole
      ? (
          projectScope ||
          ALL_PROJECTS_OPTION
        )
      : projectScope;

  const [workers, setWorkers] =
    useState([]);

  const [monthKeys, setMonthKeys] =
    useState(() =>
      buildRecentMonthKeys(),
    );

  const [searchName, setSearchName] =
    useState('');

  const [filterMode, setFilterMode] =
    useState('all');

  const [loading, setLoading] =
    useState(true);

  const [errorMessage, setErrorMessage] =
    useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      if (
        !effectiveScope &&
        !isManagementRole
      ) {
        throw new Error(
          '담당자 현장정보를 확인하지 못했습니다.',
        );
      }

      const reportRows =
        await fetchAllDailyReports(
          effectiveScope,
        );

      const result =
        buildCumulativeWorkers(
          reportRows,
        );

      setWorkers(result.workers);
      setMonthKeys(
        result.monthKeys,
      );
    } catch (error) {
      console.error(
        '누계투입조회 오류:',
        error,
      );

      setWorkers([]);
      setMonthKeys(
        buildRecentMonthKeys(),
      );

      setErrorMessage(
        error?.message ||
          '누계투입 데이터를 불러오지 못했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }, [
    effectiveScope,
    isManagementRole,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setSearchName('');
    setFilterMode('all');
  }, [effectiveScope]);

  const workerNameOptions = useMemo(
    () =>
      Array.from(
        new Set(
          workers.map(
            (worker) =>
              worker.name,
          ),
        ),
      ).sort((first, second) =>
        first.localeCompare(
          second,
          'ko',
          {
            numeric: true,
          },
        ),
      ),
    [workers],
  );

  const normalizedSearch =
    normalizeWorkerName(searchName);

  const filteredWorkers =
    useMemo(() => {
      return workers.filter(
        (worker) => {
          if (
            !matchesMonthFilter(
              worker,
              filterMode,
            )
          ) {
            return false;
          }

          if (!normalizedSearch) {
            return true;
          }

          return (
            normalizeWorkerName(
              worker.name,
            ).includes(
              normalizedSearch,
            ) ||
            normalizeWorkerName(
              worker.job,
            ).includes(
              normalizedSearch,
            )
          );
        },
      );
    }, [
      filterMode,
      normalizedSearch,
      workers,
    ]);

  const yearGroups = useMemo(
    () =>
      groupMonthsByYear(
        monthKeys,
      ),
    [monthKeys],
  );

  const monthlyWorkerCounts =
    useMemo(
      () =>
        Object.fromEntries(
          monthKeys.map(
            (monthKey) => [
              monthKey,
              workers.filter(
                (worker) =>
                  worker.workedMonths.has(
                    monthKey,
                  ),
              ).length,
            ],
          ),
        ),
      [monthKeys, workers],
    );

  const filterCounts = useMemo(
    () =>
      Object.fromEntries(
        FILTER_OPTIONS.map(
          (option) => [
            option.value,
            getFilterCount(
              workers,
              option.value,
            ),
          ],
        ),
      ),
    [workers],
  );

  const scopeLabel =
    effectiveScope ||
    '현장 미등록';

  const stickyHeaderSx = {
    position: 'sticky',
    bgcolor: '#f1f5f9',
    borderRight:
      '1px solid #94a3b8',
    borderBottom:
      '1px solid #64748b',
    color: '#1e293b',
    fontWeight: 900,
    px: 0.45,
    py: 0.6,
    whiteSpace: 'nowrap',
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
          bgcolor: '#ffffff',
          boxShadow: 'none',
        }}
      >
        <CircularProgress size={21} />

        <Typography
          sx={{
            color: '#64748b',
            fontSize: '0.78rem',
          }}
        >
          누계투입 데이터를 불러오는 중입니다.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.1,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          px: 1.4,
          py: 1.15,
          borderColor: '#cbd5e1',
          bgcolor: '#ffffff',
          boxShadow: 'none',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              lg:
                'minmax(250px, 0.75fr) minmax(430px, 1.25fr)',
            },
            border:
              '1px solid #64748b',
          }}
        >
          <Box
            sx={{
              minHeight: 76,
              display: 'grid',
              gridTemplateColumns:
                '78px minmax(0, 1fr)',
              borderRight: {
                xs: 0,
                lg:
                  '1px solid #64748b',
              },
              borderBottom: {
                xs:
                  '1px solid #64748b',
                lg: 0,
              },
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight:
                  '1px solid #64748b',
                bgcolor: '#f8fafc',
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.74rem',
                  fontWeight: 900,
                }}
              >
                조회현장
              </Typography>
            </Box>

            <Box
              sx={{
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                px: 1.25,
              }}
            >
              <Typography
                noWrap
                title={scopeLabel}
                sx={{
                  color: '#0f172a',
                  fontSize: '0.84rem',
                  fontWeight: 900,
                }}
              >
                {scopeLabel}
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              minHeight: 76,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.15,
            }}
          >
            <Typography
              sx={{
                color: '#0f172a',
                fontSize: '1.3rem',
                fontWeight: 900,
                letterSpacing: '0.1em',
              }}
            >
              누계투입조회
            </Typography>

            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.68rem',
                fontWeight: 700,
              }}
            >
              최근 19개월 표시 · 해당 월에 1일 이상 출력 시 1로 집계
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            mt: 1,
            display: 'flex',
            alignItems: {
              xs: 'stretch',
              lg: 'center',
            },
            justifyContent:
              'space-between',
            flexDirection: {
              xs: 'column',
              lg: 'row',
            },
            gap: 0.8,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 0.5,
            }}
          >
            {FILTER_OPTIONS.map(
              (option) => {
                const selected =
                  filterMode ===
                  option.value;

                return (
                  <Button
                    key={option.value}
                    size="small"
                    variant={
                      selected
                        ? 'contained'
                        : 'outlined'
                    }
                    color={
                      option.value ===
                      'all'
                        ? 'primary'
                        : 'error'
                    }
                    onClick={() =>
                      setFilterMode(
                        option.value,
                      )
                    }
                    sx={{
                      minWidth: 86,
                      px: 0.7,
                      whiteSpace:
                        'nowrap',
                      fontSize:
                        '0.66rem',
                      fontWeight: 900,
                    }}
                  >
                    {option.label}{' '}
                    {
                      filterCounts[
                        option.value
                      ]
                    }
                  </Button>
                );
              },
            )}
          </Box>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                'flex-end',
              gap: 0.6,
            }}
          >
            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.7rem',
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}
            >
              조회{' '}
              {filteredWorkers.length.toLocaleString()}
              명 / 전체{' '}
              {workers.length.toLocaleString()}
              명
            </Typography>

            <Autocomplete
              freeSolo
              openOnFocus
              options={
                workerNameOptions
              }
              inputValue={searchName}
              onInputChange={(
                _event,
                nextValue,
              ) => {
                setSearchName(
                  nextValue,
                );
              }}
              onChange={(
                _event,
                nextValue,
              ) => {
                setSearchName(
                  nextValue || '',
                );
              }}
              filterOptions={(
                options,
                state,
              ) => {
                const keyword =
                  normalizeWorkerName(
                    state.inputValue,
                  );

                if (!keyword) {
                  return options.slice(
                    0,
                    10,
                  );
                }

                return options
                  .filter((name) =>
                    normalizeWorkerName(
                      name,
                    ).includes(
                      keyword,
                    ),
                  )
                  .slice(0, 10);
              }}
              noOptionsText="검색된 근로자가 없습니다."
              sx={{
                width: {
                  xs: 220,
                  md: 280,
                },
                '& .MuiInputBase-root':
                  {
                    minHeight: 34,
                    bgcolor: '#ffffff',
                    fontSize: '0.75rem',
                  },
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  label="근로자 조회"
                  placeholder="성명 입력"
                />
              )}
            />

            <Button
              size="small"
              variant="outlined"
              onClick={loadData}
              sx={{
                minWidth: 64,
                whiteSpace: 'nowrap',
                fontSize: '0.66rem',
                fontWeight: 900,
              }}
            >
              새로고침
            </Button>
          </Box>
        </Box>

        <Box
          sx={{
            mt: 0.8,
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1.2,
          }}
        >
          {[
            {
              label: '합계 10개월',
              color: '#fff1f2',
            },
            {
              label: '합계 11개월',
              color: '#ffe4e6',
            },
            {
              label:
                '합계 12개월 이상',
              color: '#fecdd3',
            },
          ].map((item) => (
            <Box
              key={item.label}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.4,
              }}
            >
              <Box
                sx={{
                  width: 18,
                  height: 12,
                  border:
                    '1px solid #fda4af',
                  bgcolor: item.color,
                }}
              />

              <Typography
                sx={{
                  color: '#64748b',
                  fontSize: '0.64rem',
                  fontWeight: 700,
                }}
              >
                {item.label}
              </Typography>
            </Box>
          ))}
        </Box>

        {errorMessage && (
          <Alert
            severity="error"
            sx={{
              mt: 0.8,
              py: 0.15,
              fontSize: '0.7rem',
            }}
          >
            {errorMessage}
          </Alert>
        )}
      </Paper>

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          borderColor: '#94a3b8',
          bgcolor: '#ffffff',
          boxShadow: 'none',
        }}
      >
        <Table
          stickyHeader
          size="small"
          sx={{
            minWidth:
              430 +
              monthKeys.length * 46,
            tableLayout: 'fixed',
            borderCollapse:
              'separate',
            borderSpacing: 0,
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell
                rowSpan={2}
                align="center"
                sx={{
                  ...stickyHeaderSx,
                  top: 0,
                  left: 0,
                  width: 44,
                  minWidth: 44,
                  maxWidth: 44,
                  zIndex: 12,
                }}
              >
                No.
              </TableCell>

              <TableCell
                rowSpan={2}
                align="center"
                sx={{
                  ...stickyHeaderSx,
                  top: 0,
                  left: 44,
                  width: 86,
                  minWidth: 86,
                  maxWidth: 86,
                  zIndex: 12,
                }}
              >
                직종
              </TableCell>

              <TableCell
                rowSpan={2}
                align="center"
                sx={{
                  ...stickyHeaderSx,
                  top: 0,
                  left: 130,
                  width: 108,
                  minWidth: 108,
                  maxWidth: 108,
                  zIndex: 12,
                }}
              >
                성명
              </TableCell>

              <TableCell
                rowSpan={2}
                align="center"
                sx={{
                  ...stickyHeaderSx,
                  top: 0,
                  left: 238,
                  width: 150,
                  minWidth: 150,
                  maxWidth: 150,
                  zIndex: 12,
                  boxShadow:
                    '2px 0 0 #94a3b8',
                }}
              >
                현장
              </TableCell>

              {yearGroups.map(
                (group) => (
                  <TableCell
                    key={group.year}
                    colSpan={
                      group.monthKeys
                        .length
                    }
                    align="center"
                    sx={{
                      ...stickyHeaderSx,
                      top: 0,
                      zIndex: 7,
                      height: 31,
                      bgcolor:
                        '#e2e8f0',
                      fontSize:
                        '0.72rem',
                      letterSpacing:
                        '0.05em',
                    }}
                  >
                    {group.year}년
                  </TableCell>
                ),
              )}

              <TableCell
                rowSpan={2}
                align="center"
                sx={{
                  ...stickyHeaderSx,
                  top: 0,
                  right: 0,
                  width: 62,
                  minWidth: 62,
                  maxWidth: 62,
                  zIndex: 12,
                  boxShadow:
                    '-2px 0 0 #94a3b8',
                }}
              >
                합계
              </TableCell>
            </TableRow>

            <TableRow>
              {monthKeys.map(
                (monthKey) => {
                  const {
                    month,
                  } =
                    parseMonthKey(
                      monthKey,
                    );

                  return (
                    <TableCell
                      key={monthKey}
                      align="center"
                      sx={{
                        ...stickyHeaderSx,
                        top: 31,
                        zIndex: 7,
                        width: 46,
                        minWidth: 46,
                        maxWidth: 46,
                        bgcolor:
                          month === 12
                            ? '#eff6ff'
                            : '#f8fafc',
                        fontSize:
                          '0.66rem',
                      }}
                    >
                      {month}월
                    </TableCell>
                  );
                },
              )}
            </TableRow>
          </TableHead>

          <TableBody>
            {filteredWorkers.length ===
            0 ? (
              <TableRow>
                <TableCell
                  colSpan={
                    monthKeys.length + 5
                  }
                  align="center"
                  sx={{
                    py: 7,
                    color: '#64748b',
                    fontSize: '0.82rem',
                  }}
                >
                  {normalizedSearch
                    ? '검색한 근로자가 없습니다.'
                    : filterMode !== 'all'
                      ? '해당 개월 조건에 맞는 근로자가 없습니다.'
                      : '조회된 누계 근로자가 없습니다.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredWorkers.map(
                (worker, index) => {
                  const rowBackground =
                    getRowBackground(
                      worker.totalMonths,
                    );

                  const hoverBackground =
                    getRowHoverBackground(
                      worker.totalMonths,
                    );

                  const projectLabel =
                    worker.projectNames.join(
                      ', ',
                    );

                  const stickyBodySx = {
                    position:
                      'sticky',
                    zIndex: 4,
                    bgcolor:
                      rowBackground,
                    borderRight:
                      '1px solid #cbd5e1',
                    py: 0.65,
                    px: 0.45,
                    fontSize:
                      '0.69rem',
                    '.MuiTableRow-root:hover &':
                      {
                        bgcolor:
                          hoverBackground,
                      },
                  };

                  return (
                    <TableRow
                      key={worker.key}
                      hover
                      sx={{
                        bgcolor:
                          rowBackground,
                        '&:hover': {
                          bgcolor:
                            hoverBackground,
                        },
                      }}
                    >
                      <TableCell
                        align="center"
                        sx={{
                          ...stickyBodySx,
                          left: 0,
                          width: 44,
                          minWidth: 44,
                          maxWidth: 44,
                        }}
                      >
                        {index + 1}
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{
                          ...stickyBodySx,
                          left: 44,
                          width: 86,
                          minWidth: 86,
                          maxWidth: 86,
                          color:
                            '#475569',
                          fontWeight: 700,
                        }}
                      >
                        {worker.job}
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{
                          ...stickyBodySx,
                          left: 130,
                          width: 108,
                          minWidth: 108,
                          maxWidth: 108,
                          color:
                            '#0f172a',
                          fontSize:
                            '0.72rem',
                          fontWeight: 900,
                        }}
                      >
                        {worker.name}
                      </TableCell>

                      <TableCell
                        title={
                          projectLabel
                        }
                        sx={{
                          ...stickyBodySx,
                          left: 238,
                          width: 150,
                          minWidth: 150,
                          maxWidth: 150,
                          overflow:
                            'hidden',
                          textOverflow:
                            'ellipsis',
                          whiteSpace:
                            'nowrap',
                          boxShadow:
                            '2px 0 0 #e2e8f0',
                          color:
                            '#475569',
                          fontSize:
                            '0.64rem',
                        }}
                      >
                        {projectLabel}
                      </TableCell>

                      {monthKeys.map(
                        (monthKey) => {
                          const worked =
                            worker.workedMonths.has(
                              monthKey,
                            );

                          return (
                            <TableCell
                              key={
                                monthKey
                              }
                              align="center"
                              sx={{
                                width: 46,
                                minWidth: 46,
                                maxWidth: 46,
                                px: 0,
                                py: 0.65,
                                borderRight:
                                  '1px dotted #cbd5e1',
                                bgcolor:
                                  rowBackground,
                                color: worked
                                  ? '#0f172a'
                                  : '#cbd5e1',
                                fontSize:
                                  '0.7rem',
                                fontWeight:
                                  worked
                                    ? 900
                                    : 400,
                              }}
                            >
                              {worked
                                ? 1
                                : ''}
                            </TableCell>
                          );
                        },
                      )}

                      <TableCell
                        align="center"
                        sx={{
                          position:
                            'sticky',
                          right: 0,
                          zIndex: 4,
                          width: 62,
                          minWidth: 62,
                          maxWidth: 62,
                          px: 0.4,
                          py: 0.65,
                          bgcolor:
                            rowBackground,
                          borderLeft:
                            '1px solid #94a3b8',
                          boxShadow:
                            '-2px 0 0 #e2e8f0',
                          color:
                            worker.totalMonths >=
                            10
                              ? '#b91c1c'
                              : '#0369a1',
                          fontSize:
                            '0.74rem',
                          fontWeight: 900,
                        }}
                      >
                        {worker.totalMonths}
                      </TableCell>
                    </TableRow>
                  );
                },
              )
            )}
          </TableBody>

          <TableFooter>
            <TableRow>
              <TableCell
                colSpan={4}
                align="center"
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 5,
                  bgcolor: '#e2e8f0',
                  borderRight:
                    '1px solid #94a3b8',
                  borderTop:
                    '1px solid #64748b',
                  fontSize: '0.68rem',
                  fontWeight: 900,
                  color: '#334155',
                  boxShadow:
                    '2px 0 0 #94a3b8',
                }}
              >
                월별 투입 근로자
              </TableCell>

              {monthKeys.map(
                (monthKey) => (
                  <TableCell
                    key={monthKey}
                    align="center"
                    sx={{
                      width: 46,
                      minWidth: 46,
                      maxWidth: 46,
                      px: 0,
                      py: 0.65,
                      bgcolor: '#f1f5f9',
                      borderTop:
                        '1px solid #64748b',
                      borderRight:
                        '1px dotted #94a3b8',
                      color: '#334155',
                      fontSize:
                        '0.66rem',
                      fontWeight: 900,
                    }}
                  >
                    {
                      monthlyWorkerCounts[
                        monthKey
                      ]
                    }
                  </TableCell>
                ),
              )}

              <TableCell
                align="center"
                sx={{
                  position: 'sticky',
                  right: 0,
                  zIndex: 5,
                  width: 62,
                  minWidth: 62,
                  maxWidth: 62,
                  bgcolor: '#e2e8f0',
                  borderTop:
                    '1px solid #64748b',
                  borderLeft:
                    '1px solid #94a3b8',
                  color: '#334155',
                  fontSize: '0.66rem',
                  fontWeight: 900,
                }}
              >
                -
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>
    </Box>
  );
}
