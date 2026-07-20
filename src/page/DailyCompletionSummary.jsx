import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExcelJS from 'exceljs';
import { supabase } from '../supabaseClient';

const PAGE_SIZE = 1000;
const DATE_RANGE_OPTIONS = [
  14,
  30,
  60,
  90,
];

const TARGET_SELECT_COLUMNS = `
  id,
  project_name,
  process_type,
  sequence,
  target_name,
  target_date,
  building_floor_targets,
  updated_at
`;

const pad2 = (value) =>
  String(value).padStart(
    2,
    '0',
  );

const normalizeNumberArray = (
  value,
) =>
  Array.isArray(value)
    ? value
        .map(Number)
        .filter(
          (item) =>
            Number.isFinite(
              item,
            ),
        )
    : [];

const getFloorException = (
  exceptions,
  floor,
) =>
  exceptions?.[floor] ||
  exceptions?.[
    String(floor)
  ] ||
  null;

const isValidUnit = (
  config,
  floor,
  unitNumber,
) => {
  const pilotiFloors =
    normalizeNumberArray(
      config?.pilotiFloors,
    );

  const floorException =
    getFloorException(
      config?.exceptions,
      floor,
    );

  const exceptionUnits =
    normalizeNumberArray(
      floorException?.units,
    );

  const isActiveOnPiloti =
    Boolean(floorException) &&
    exceptionUnits.includes(
      unitNumber,
    );

  const isPiloti =
    pilotiFloors.includes(
      floor,
    ) &&
    !isActiveOnPiloti;

  const isNonExistent =
    Boolean(floorException) &&
    !exceptionUnits.includes(
      unitNumber,
    ) &&
    !pilotiFloors.includes(
      floor,
    );

  return (
    !isPiloti &&
    !isNonExistent
  );
};

const getUnitCode = (
  floor,
  unitNumber,
) =>
  `${floor}${String(
    unitNumber,
  ).padStart(2, '0')}`;

const getCellKey = (
  buildingName,
  unitCode,
) =>
  `${String(
    buildingName,
  )}-${String(unitCode)}`;

const getKoreaDateParts = (
  date = new Date(),
) => {
  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      },
    );

  const values = {};

  formatter
    .formatToParts(date)
    .forEach((part) => {
      if (
        part.type !==
        'literal'
      ) {
        values[part.type] =
          part.value;
      }
    });

  return {
    year:
      Number(values.year),
    month:
      Number(values.month),
    day:
      Number(values.day),
  };
};

const getKoreaTodayKey = () => {
  const parts =
    getKoreaDateParts();

  return [
    parts.year,
    pad2(parts.month),
    pad2(parts.day),
  ].join('-');
};

const parseDateKey = (
  dateKey,
) => {
  const match =
    String(dateKey || '')
      .trim()
      .match(
        /^(\d{4})-(\d{2})-(\d{2})/,
      );

  if (!match) {
    return null;
  }

  return {
    year:
      Number(match[1]),
    month:
      Number(match[2]),
    day:
      Number(match[3]),
  };
};

const dateKeyToUtc = (
  dateKey,
) => {
  const parts =
    parseDateKey(dateKey);

  if (!parts) {
    return null;
  }

  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
  );
};

const addDaysToDateKey = (
  dateKey,
  days,
) => {
  const utc =
    dateKeyToUtc(dateKey);

  if (utc === null) {
    return '';
  }

  const date =
    new Date(
      utc +
        Number(days) *
          86400000,
    );

  return [
    date.getUTCFullYear(),
    pad2(
      date.getUTCMonth() +
        1,
    ),
    pad2(
      date.getUTCDate(),
    ),
  ].join('-');
};

const getWeekdayLabel = (
  dateKey,
) => {
  const utc =
    dateKeyToUtc(dateKey);

  if (utc === null) {
    return '';
  }

  return [
    '일',
    '월',
    '화',
    '수',
    '목',
    '금',
    '토',
  ][
    new Date(
      utc,
    ).getUTCDay()
  ];
};

const formatMonthDay = (
  dateKey,
) => {
  const parts =
    parseDateKey(dateKey);

  if (!parts) {
    return dateKey;
  }

  return (
    `${pad2(parts.month)}.` +
    `${pad2(parts.day)}`
  );
};

const formatFullDate = (
  dateKey,
) => {
  const parts =
    parseDateKey(dateKey);

  if (!parts) {
    return dateKey;
  }

  return (
    `${parts.year}.` +
    `${pad2(parts.month)}.` +
    `${pad2(parts.day)}`
  );
};

const makeDailyPeriods = (
  dayCount,
) => {
  const today =
    getKoreaTodayKey();

  /*
    최신 날짜를 가장 앞에 표시합니다.

    index 0:
    오늘

    index 1:
    어제
  */
  return Array.from(
    {
      length:
        Number(dayCount) ||
        14,
    },
    (_, index) => {
      const key =
        addDaysToDateKey(
          today,
          -index,
        );

      return {
        key,
        label:
          formatMonthDay(key),
        weekday:
          getWeekdayLabel(
            key,
          ),
        title:
          `${formatFullDate(
            key,
          )} (${getWeekdayLabel(
            key,
          )})`,
        isToday:
          key === today,
      };
    },
  );
};

const normalizeFloorTargets = (
  value,
) => {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  return Object.entries(
    value,
  ).reduce(
    (
      result,
      [
        buildingName,
        floor,
      ],
    ) => {
      const floorNumber =
        Number(floor);

      if (
        buildingName &&
        Number.isFinite(
          floorNumber,
        ) &&
        floorNumber > 0
      ) {
        result[
          buildingName
        ] = floorNumber;
      }

      return result;
    },
    {},
  );
};

const groupTargetRows = (
  rows,
  processOptions,
) => {
  const processOrder =
    new Map(
      processOptions.map(
        (
          processName,
          index,
        ) => [
          processName,
          index,
        ],
      ),
    );

  const groupMap =
    new Map();

  (rows || []).forEach(
    (row) => {
      const sequence =
        Number(
          row?.sequence,
        ) || 1;

      if (
        !groupMap.has(
          sequence,
        )
      ) {
        groupMap.set(
          sequence,
          [],
        );
      }

      groupMap
        .get(sequence)
        .push(row);
    },
  );

  return Array.from(
    groupMap.entries(),
  )
    .sort(
      (
        [firstSequence],
        [secondSequence],
      ) =>
        firstSequence -
        secondSequence,
    )
    .map(
      ([
        sequence,
        groupRows,
      ]) => {
        const representative =
          groupRows
            .slice()
            .sort(
              (
                first,
                second,
              ) =>
                String(
                  second.updated_at ||
                    '',
                ).localeCompare(
                  String(
                    first.updated_at ||
                      '',
                  ),
                ),
            )[0] ||
          groupRows[0];

        const processTypes =
          Array.from(
            new Set(
              groupRows
                .map(
                  (row) =>
                    row.process_type,
                )
                .filter(Boolean),
            ),
          ).sort(
            (
              first,
              second,
            ) =>
              (
                processOrder.get(
                  first,
                ) ??
                Number.MAX_SAFE_INTEGER
              ) -
              (
                processOrder.get(
                  second,
                ) ??
                Number.MAX_SAFE_INTEGER
              ),
          );

        return {
          id:
            `sequence:${sequence}`,
          sequence,
          targetName:
            representative
              ?.target_name ||
            `${sequence}차 방통`,
          targetDate:
            representative
              ?.target_date ||
            '',
          processTypes,
          floorTargets:
            normalizeFloorTargets(
              representative
                ?.building_floor_targets,
            ),
        };
      },
    );
};

const getTargetCellKeys = ({
  floorTargets,
  buildingConfigs,
}) => {
  const targetKeys =
    new Set();

  Object.entries(
    normalizeFloorTargets(
      floorTargets,
    ),
  ).forEach(
    ([
      buildingName,
      targetFloor,
    ]) => {
      const config =
        buildingConfigs?.[
          buildingName
        ];

      if (!config) {
        return;
      }

      const floors =
        Math.min(
          Number(
            config?.floors,
          ) || 0,
          Number(
            targetFloor,
          ) || 0,
        );

      const unitsPerFloor =
        Number(
          config
            ?.unitsPerFloor,
        ) || 0;

      for (
        let floor = 1;
        floor <= floors;
        floor += 1
      ) {
        for (
          let unitNumber = 1;
          unitNumber <=
          unitsPerFloor;
          unitNumber += 1
        ) {
          if (
            !isValidUnit(
              config,
              floor,
              unitNumber,
            )
          ) {
            continue;
          }

          targetKeys.add(
            getCellKey(
              buildingName,
              getUnitCode(
                floor,
                unitNumber,
              ),
            ),
          );
        }
      }
    },
  );

  return targetKeys;
};

const getDdayValue = (
  targetDate,
) => {
  const todayUtc =
    dateKeyToUtc(
      getKoreaTodayKey(),
    );

  const targetUtc =
    dateKeyToUtc(
      targetDate,
    );

  if (
    todayUtc === null ||
    targetUtc === null
  ) {
    return null;
  }

  return Math.round(
    (
      targetUtc -
      todayUtc
    ) /
      86400000,
  );
};

const formatDday = (
  dday,
) => {
  if (
    dday === null ||
    Number.isNaN(dday)
  ) {
    return '-';
  }

  if (dday > 0) {
    return `D-${dday}`;
  }

  if (dday === 0) {
    return 'D-DAY';
  }

  return `D+${Math.abs(
    dday,
  )}`;
};

const formatNumber = (
  value,
) =>
  Number(
    value || 0,
  ).toLocaleString(
    'ko-KR',
  );

const stickyCellStyle = (
  left,
  width,
  zIndex = 3,
) => ({
  position: 'sticky',
  left,
  zIndex,
  width,
  minWidth: width,
  maxWidth: width,
  bgcolor: '#ffffff',
  borderRight:
    '1px solid #cbd5e1',
});

export default function DailyCompletionSummary({
  projectName = '',
  processOptions = [],
  buildingConfigs = {},
}) {
  const safeProcessOptions =
    Array.isArray(
      processOptions,
    )
      ? processOptions
      : [];

  const safeBuildingConfigs =
    buildingConfigs || {};

  const [
    dayCount,
    setDayCount,
  ] = useState(30);

  const [
    selectedTargetId,
    setSelectedTargetId,
  ] = useState('');

  const [
    progressRows,
    setProgressRows,
  ] = useState([]);

  const [
    targetRows,
    setTargetRows,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  useEffect(() => {
    let active = true;

    const loadData =
      async () => {
        if (
          !projectName ||
          safeProcessOptions
            .length === 0
        ) {
          if (active) {
            setProgressRows([]);
            setTargetRows([]);
            setErrorMessage('');
          }

          return;
        }

        setLoading(true);
        setErrorMessage('');

        try {
          const allProgressRows =
            [];

          let progressFrom = 0;

          while (true) {
            const progressTo =
              progressFrom +
              PAGE_SIZE -
              1;

            const {
              data,
              error,
            } = await supabase
              .from(
                'unit_progress',
              )
              .select(
                `
                building,
                unit,
                process_type,
                status,
                completion_date
              `,
              )
              .eq(
                'project_name',
                projectName,
              )
              .eq(
                'status',
                '작업완료',
              )
              .in(
                'process_type',
                safeProcessOptions,
              )
              .range(
                progressFrom,
                progressTo,
              );

            if (error) {
              throw error;
            }

            const pageRows =
              data || [];

            allProgressRows.push(
              ...pageRows,
            );

            if (
              pageRows.length <
              PAGE_SIZE
            ) {
              break;
            }

            progressFrom +=
              PAGE_SIZE;
          }

          const allTargetRows =
            [];

          let targetFrom = 0;

          while (true) {
            const targetTo =
              targetFrom +
              PAGE_SIZE -
              1;

            const {
              data,
              error,
            } = await supabase
              .from(
                'progress_targets',
              )
              .select(
                TARGET_SELECT_COLUMNS,
              )
              .eq(
                'project_name',
                projectName,
              )
              .range(
                targetFrom,
                targetTo,
              );

            if (error) {
              if (
                error.code ===
                '42P01'
              ) {
                break;
              }

              throw error;
            }

            const pageRows =
              data || [];

            allTargetRows.push(
              ...pageRows,
            );

            if (
              pageRows.length <
              PAGE_SIZE
            ) {
              break;
            }

            targetFrom +=
              PAGE_SIZE;
          }

          if (active) {
            setProgressRows(
              allProgressRows,
            );

            setTargetRows(
              allTargetRows,
            );
          }
        } catch (error) {
          console.error(
            '일별 완료 집계 조회 오류:',
            error,
          );

          if (active) {
            setProgressRows([]);
            setTargetRows([]);

            setErrorMessage(
              error?.message ||
                '일별 완료 집계 데이터를 불러오지 못했습니다.',
            );
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

    loadData();

    return () => {
      active = false;
    };
  }, [
    projectName,
    refreshKey,
    safeProcessOptions,
  ]);

  const validCellKeys =
    useMemo(() => {
      const keys =
        new Set();

      Object.entries(
        safeBuildingConfigs,
      ).forEach(
        ([
          buildingName,
          config,
        ]) => {
          const floors =
            Number(
              config?.floors,
            ) || 0;

          const unitsPerFloor =
            Number(
              config
                ?.unitsPerFloor,
            ) || 0;

          for (
            let floor = 1;
            floor <= floors;
            floor += 1
          ) {
            for (
              let unitNumber = 1;
              unitNumber <=
              unitsPerFloor;
              unitNumber += 1
            ) {
              if (
                !isValidUnit(
                  config,
                  floor,
                  unitNumber,
                )
              ) {
                continue;
              }

              keys.add(
                getCellKey(
                  buildingName,
                  getUnitCode(
                    floor,
                    unitNumber,
                  ),
                ),
              );
            }
          }
        },
      );

      return keys;
    }, [
      safeBuildingConfigs,
    ]);

  const targetGroups =
    useMemo(
      () =>
        groupTargetRows(
          targetRows,
          safeProcessOptions,
        ),
      [
        safeProcessOptions,
        targetRows,
      ],
    );

  useEffect(() => {
    setSelectedTargetId(
      (previous) =>
        targetGroups.some(
          (target) =>
            target.id ===
            previous,
        )
          ? previous
          : targetGroups[0]
              ?.id || '',
    );
  }, [targetGroups]);

  const selectedTarget =
    targetGroups.find(
      (target) =>
        target.id ===
        selectedTargetId,
    ) || null;

  const selectedTargetCellKeys =
    useMemo(
      () =>
        selectedTarget
          ? getTargetCellKeys({
              floorTargets:
                selectedTarget
                  .floorTargets,
              buildingConfigs:
                safeBuildingConfigs,
            })
          : new Set(),
      [
        safeBuildingConfigs,
        selectedTarget,
      ],
    );

  const periods =
    useMemo(
      () =>
        makeDailyPeriods(
          dayCount,
        ),
      [dayCount],
    );

  const periodKeySet =
    useMemo(
      () =>
        new Set(
          periods.map(
            (period) =>
              period.key,
          ),
        ),
      [periods],
    );

  const summaryRows =
    useMemo(() => {
      const processCellMaps =
        {};

      safeProcessOptions.forEach(
        (processName) => {
          processCellMaps[
            processName
          ] = new Map();
        },
      );

      progressRows.forEach(
        (row) => {
          const processName =
            row.process_type;

          if (
            !processCellMaps[
              processName
            ]
          ) {
            return;
          }

          const cellKey =
            getCellKey(
              row.building,
              row.unit,
            );

          if (
            !validCellKeys.has(
              cellKey,
            )
          ) {
            return;
          }

          processCellMaps[
            processName
          ].set(
            cellKey,
            row,
          );
        },
      );

      const selectedTargetProcesses =
        new Set(
          selectedTarget
            ?.processTypes ||
            [],
        );

      const targetCount =
        selectedTargetCellKeys
          .size;

      const targetDday =
        getDdayValue(
          selectedTarget
            ?.targetDate,
        );

      return safeProcessOptions.map(
        (processName) => {
          const completedMap =
            processCellMaps[
              processName
            ];

          const completedRows =
            Array.from(
              completedMap.values(),
            );

          const dailyCounts =
            {};

          periods.forEach(
            (period) => {
              dailyCounts[
                period.key
              ] = 0;
            },
          );

          completedRows.forEach(
            (row) => {
              const dateKey =
                String(
                  row.completion_date ||
                    '',
                ).slice(
                  0,
                  10,
                );

              if (
                periodKeySet.has(
                  dateKey,
                )
              ) {
                dailyCounts[
                  dateKey
                ] += 1;
              }
            },
          );

          const total =
            validCellKeys.size;

          const completed =
            completedMap.size;

          const remaining =
            Math.max(
              total -
                completed,
              0,
            );

          const progress =
            total === 0
              ? 0
              : (
                  completed /
                  total
                ) *
                100;

          const targetApplied =
            Boolean(
              selectedTarget,
            ) &&
            selectedTargetProcesses.has(
              processName,
            );

          let targetCompleted =
            0;

          if (targetApplied) {
            selectedTargetCellKeys.forEach(
              (cellKey) => {
                if (
                  completedMap.has(
                    cellKey,
                  )
                ) {
                  targetCompleted += 1;
                }
              },
            );
          }

          const targetRemaining =
            targetApplied
              ? Math.max(
                  targetCount -
                    targetCompleted,
                  0,
                )
              : null;

          return {
            processName,
            total,
            completed,
            progress,
            remaining,
            targetApplied,
            targetCount:
              targetApplied
                ? targetCount
                : null,
            targetCompleted:
              targetApplied
                ? targetCompleted
                : null,
            targetRemaining,
            dday:
              targetApplied
                ? targetDday
                : null,
            dailyCounts,
          };
        },
      );
    }, [
      periodKeySet,
      periods,
      progressRows,
      safeProcessOptions,
      selectedTarget,
      selectedTargetCellKeys,
      validCellKeys,
    ]);

  const handleExcelDownload =
    async () => {
      const workbook =
        new ExcelJS.Workbook();

      const worksheet =
        workbook.addWorksheet(
          '일별 완료 집계',
        );

      const targetName =
        selectedTarget
          ?.targetName ||
        '선택 차수';

      const headers = [
        '공정',
        '전체',
        '완료',
        '진도율',
        '잔여',
        `${targetName} 목표량`,
        `${targetName} 완료`,
        `${targetName} 잔여`,
        'D-day',
        ...periods.map(
          (period) =>
            `${period.label}(${period.weekday})`,
        ),
      ];

      worksheet.addRow(
        headers,
      );

      summaryRows.forEach(
        (row) => {
          worksheet.addRow([
            row.processName,
            row.total,
            row.completed,
            `${row.progress.toFixed(
              2,
            )}%`,
            row.remaining,
            row.targetApplied
              ? row.targetCount
              : '',
            row.targetApplied
              ? row.targetCompleted
              : '',
            row.targetApplied
              ? row.targetRemaining
              : '',
            row.targetApplied
              ? formatDday(
                  row.dday,
                )
              : '',
            ...periods.map(
              (period) =>
                row.dailyCounts[
                  period.key
                ] || 0,
            ),
          ]);
        },
      );

      worksheet.views = [
        {
          state: 'frozen',
          xSplit: 1,
          ySplit: 1,
        },
      ];

      worksheet.getRow(
        1,
      ).font = {
        bold: true,
      };

      worksheet.columns.forEach(
        (
          column,
          index,
        ) => {
          column.width =
            index === 0
              ? 16
              : index <= 8
                ? 10
                : 8.5;

          column.alignment = {
            horizontal:
              index === 0
                ? 'left'
                : 'center',
            vertical:
              'middle',
          };
        },
      );

      const buffer =
        await workbook.xlsx.writeBuffer();

      const blob =
        new Blob(
          [buffer],
          {
            type:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        );

      const url =
        URL.createObjectURL(
          blob,
        );

      const link =
        document.createElement(
          'a',
        );

      link.href = url;
      link.download =
        `일별_완료집계_${getKoreaTodayKey()}.xlsx`;

      document.body.appendChild(
        link,
      );

      link.click();

      document.body.removeChild(
        link,
      );

      URL.revokeObjectURL(
        url,
      );
    };

  const selectedTargetDday =
    getDdayValue(
      selectedTarget
        ?.targetDate,
    );

  const selectedTargetName =
    selectedTarget
      ?.targetName ||
    '선택 차수';

  const stickyColumns = [
    {
      key: 'process',
      label: '공정',
      left: 0,
      width: 110,
    },
    {
      key: 'total',
      label: '전체',
      left: 110,
      width: 68,
    },
    {
      key: 'completed',
      label: '완료',
      left: 178,
      width: 68,
    },
    {
      key: 'progress',
      label: '진도율',
      left: 246,
      width: 68,
    },
    {
      key: 'remaining',
      label: '잔여',
      left: 314,
      width: 68,
    },
    {
      key: 'targetCount',
      label: (
        <>
          {selectedTargetName}
          <br />
          목표량
        </>
      ),
      left: 382,
      width: 68,
    },
    {
      key: 'targetCompleted',
      label: (
        <>
          {selectedTargetName}
          <br />
          완료
        </>
      ),
      left: 450,
      width: 68,
    },
    {
      key: 'targetRemaining',
      label: (
        <>
          {selectedTargetName}
          <br />
          잔여
        </>
      ),
      left: 518,
      width: 68,
    },
    {
      key: 'dday',
      label: (
        <>
          D-
          <br />
          day
        </>
      ),
      left: 586,
      width: 68,
    },
  ];

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection:
          'column',
        gap: 1,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          px: 1.5,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'space-between',
          gap: 1,
          borderColor:
            '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Box>
          <Typography
            fontWeight={800}
            color="#334155"
          >
            일별 완료 집계
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
          >
            오늘부터 과거 순으로 일별 완료수량과 선택 차수의 목표·잔여·D-day를 비교합니다.
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.8,
            whiteSpace:
              'nowrap',
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
          >
            표시 기간
          </Typography>

          <FormControl
            size="small"
          >
            <Select
              value={dayCount}
              onChange={(
                event,
              ) =>
                setDayCount(
                  Number(
                    event.target
                      .value,
                  ),
                )
              }
              sx={{
                minWidth: 110,
                fontSize:
                  '0.78rem',
              }}
            >
              {DATE_RANGE_OPTIONS.map(
                (choice) => (
                  <MenuItem
                    key={choice}
                    value={choice}
                  >
                    최근 {choice}일
                  </MenuItem>
                ),
              )}
            </Select>
          </FormControl>

          <Typography
            variant="caption"
            color="text.secondary"
          >
            차수
          </Typography>

          <FormControl
            size="small"
          >
            <Select
              value={
                selectedTargetId
              }
              displayEmpty
              onChange={(
                event,
              ) =>
                setSelectedTargetId(
                  event.target
                    .value,
                )
              }
              disabled={
                targetGroups
                  .length === 0
              }
              sx={{
                minWidth: 190,
                fontSize:
                  '0.78rem',
              }}
            >
              {targetGroups.length ===
                0 && (
                <MenuItem
                  value=""
                  disabled
                >
                  설정된 차수 없음
                </MenuItem>
              )}

              {targetGroups.map(
                (target) => (
                  <MenuItem
                    key={target.id}
                    value={target.id}
                  >
                    {target.targetName}
                    {' · '}
                    {formatDday(
                      getDdayValue(
                        target.targetDate,
                      ),
                    )}
                  </MenuItem>
                ),
              )}
            </Select>
          </FormControl>

          {selectedTarget && (
            <Box
              sx={{
                px: 0.8,
                py: 0.45,
                borderRadius: 1,
                bgcolor:
                  selectedTargetDday !==
                    null &&
                  selectedTargetDday <
                    0
                    ? '#fff1f2'
                    : '#eff6ff',
                border:
                  selectedTargetDday !==
                    null &&
                  selectedTargetDday <
                    0
                    ? '1px solid #fda4af'
                    : '1px solid #93c5fd',
              }}
            >
              <Typography
                sx={{
                  color:
                    selectedTargetDday !==
                      null &&
                    selectedTargetDday <
                      0
                      ? '#be123c'
                      : '#1d4ed8',
                  fontSize:
                    '0.67rem',
                  fontWeight: 900,
                }}
              >
                {formatDday(
                  selectedTargetDday,
                )}
                {' · '}
                목표일{' '}
                {selectedTarget.targetDate}
              </Typography>
            </Box>
          )}

          <Button
            variant="outlined"
            startIcon={
              <RefreshIcon />
            }
            onClick={() =>
              setRefreshKey(
                (previous) =>
                  previous + 1,
              )
            }
            disabled={loading}
          >
            새로고침
          </Button>

          <Button
            variant="contained"
            color="success"
            startIcon={
              <DownloadIcon />
            }
            onClick={
              handleExcelDownload
            }
            disabled={
              loading ||
              summaryRows.length ===
                0
            }
          >
            엑셀 다운로드
          </Button>
        </Box>
      </Paper>

      {errorMessage && (
        <Alert severity="error">
          {errorMessage}
        </Alert>
      )}

      {!selectedTarget &&
        !loading && (
          <Alert
            severity="info"
          >
            차수 목표가 아직 설정되지 않았습니다. 전체·완료·진도율·잔여와 일별 완료수량은 확인할 수 있으며, 차수 목표를 설정하면 목표량·목표잔여·D-day가 함께 표시됩니다.
          </Alert>
        )}

      <Paper
        variant="outlined"
        sx={{
          position: 'relative',
          flexGrow: 1,
          minHeight: 0,
          overflow: 'hidden',
          borderColor:
            '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        {loading && (
          <Box
            sx={{
              position:
                'absolute',
              inset: 0,
              zIndex: 20,
              display: 'flex',
              flexDirection:
                'column',
              alignItems:
                'center',
              justifyContent:
                'center',
              gap: 1,
              bgcolor:
                'rgba(255,255,255,0.82)',
            }}
          >
            <CircularProgress
              size={32}
            />

            <Typography
              variant="body2"
              color="text.secondary"
            >
              일별 완료 집계를 계산하는 중입니다.
            </Typography>
          </Box>
        )}

        <TableContainer
          sx={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
          }}
        >
          <Table
            stickyHeader
            size="small"
            sx={{
              minWidth:
                654 +
                periods.length *
                  56,
              tableLayout:
                'fixed',
              '& th, & td': {
                borderBottom:
                  '1px solid #dbe3ee',
                borderRight:
                  '1px solid #dbe3ee',
                fontSize:
                  '0.64rem',
                lineHeight: 1.15,
                px: 0.45,
                py: 0.42,
              },
            }}
          >
            <TableHead>
              <TableRow>
                {stickyColumns.map(
                  (column) => (
                    <TableCell
                      key={
                        column.key
                      }
                      align="center"
                      sx={{
                        ...stickyCellStyle(
                          column.left,
                          column.width,
                          8,
                        ),
                        fontWeight: 800,
                        bgcolor:
                          column.key
                            .startsWith(
                              'target',
                            ) ||
                          column.key ===
                            'dday'
                            ? '#f5f3ff'
                            : '#ffffff',
                        whiteSpace:
                          'normal',
                        wordBreak:
                          'keep-all',
                        lineHeight: 1.05,
                        px: 0.3,
                        py: 0.38,
                        fontSize:
                          '0.6rem',
                      }}
                    >
                      {column.label}
                    </TableCell>
                  ),
                )}

                {periods.map(
                  (period) => (
                    <TableCell
                      key={period.key}
                      align="center"
                      title={
                        period.title
                      }
                      sx={{
                        width: 56,
                        minWidth: 56,
                        maxWidth: 56,
                        fontWeight: 800,
                        bgcolor:
                          period.isToday
                            ? '#fef3c7'
                            : period.weekday ===
                                '일'
                              ? '#fff1f2'
                              : period.weekday ===
                                  '토'
                                ? '#eff6ff'
                                : '#f8fafc',
                        whiteSpace:
                          'nowrap',
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize:
                            '0.6rem',
                          fontWeight: 900,
                          lineHeight: 1.05,
                        }}
                      >
                        {period.label}
                      </Typography>

                      <Typography
                        sx={{
                          mt: 0.1,
                          color:
                            period.weekday ===
                            '일'
                              ? '#dc2626'
                              : period.weekday ===
                                  '토'
                                ? '#2563eb'
                                : '#64748b',
                          fontSize:
                            '0.52rem',
                          fontWeight: 800,
                          lineHeight: 1.05,
                        }}
                      >
                        {period.weekday}
                      </Typography>
                    </TableCell>
                  ),
                )}
              </TableRow>
            </TableHead>

            <TableBody>
              {summaryRows.map(
                (
                  row,
                  index,
                ) => (
                  <TableRow
                    key={
                      row.processName
                    }
                    hover
                    sx={{
                      bgcolor:
                        index % 2 ===
                        0
                          ? '#ffffff'
                          : '#fbfdff',
                    }}
                  >
                    <TableCell
                      sx={{
                        ...stickyCellStyle(
                          0,
                          110,
                          5,
                        ),
                        fontWeight: 700,
                        color:
                          '#1e293b',
                        fontSize:
                          '0.62rem',
                        px: 0.45,
                      }}
                    >
                      {row.processName}
                    </TableCell>

                    <TableCell
                      align="right"
                      sx={{
                        ...stickyCellStyle(
                          110,
                          68,
                          5,
                        ),
                        fontWeight: 700,
                      }}
                    >
                      {formatNumber(
                        row.total,
                      )}
                    </TableCell>

                    <TableCell
                      align="right"
                      sx={{
                        ...stickyCellStyle(
                          178,
                          68,
                          5,
                        ),
                        fontWeight: 700,
                      }}
                    >
                      {formatNumber(
                        row.completed,
                      )}
                    </TableCell>

                    <TableCell
                      align="right"
                      sx={{
                        ...stickyCellStyle(
                          246,
                          68,
                          5,
                        ),
                        fontWeight: 800,
                        color:
                          '#0369a1',
                      }}
                    >
                      {row.progress.toFixed(
                        2,
                      )}
                      %
                    </TableCell>

                    <TableCell
                      align="right"
                      sx={{
                        ...stickyCellStyle(
                          314,
                          68,
                          5,
                        ),
                        fontWeight: 700,
                      }}
                    >
                      {formatNumber(
                        row.remaining,
                      )}
                    </TableCell>

                    <TableCell
                      align="right"
                      sx={{
                        ...stickyCellStyle(
                          382,
                          68,
                          5,
                        ),
                        bgcolor:
                          '#faf5ff',
                        fontWeight: 700,
                      }}
                    >
                      {row.targetApplied
                        ? formatNumber(
                            row.targetCount,
                          )
                        : '-'}
                    </TableCell>

                    <TableCell
                      align="right"
                      sx={{
                        ...stickyCellStyle(
                          450,
                          68,
                          5,
                        ),
                        bgcolor:
                          '#faf5ff',
                        fontWeight: 700,
                      }}
                    >
                      {row.targetApplied
                        ? formatNumber(
                            row.targetCompleted,
                          )
                        : '-'}
                    </TableCell>

                    <TableCell
                      align="right"
                      sx={{
                        ...stickyCellStyle(
                          518,
                          68,
                          5,
                        ),
                        bgcolor:
                          '#faf5ff',
                        color:
                          row.targetApplied &&
                          row.targetRemaining >
                            0
                            ? '#c2410c'
                            : '#166534',
                        fontWeight: 900,
                      }}
                    >
                      {row.targetApplied
                        ? formatNumber(
                            row.targetRemaining,
                          )
                        : '-'}
                    </TableCell>

                    <TableCell
                      align="center"
                      sx={{
                        ...stickyCellStyle(
                          586,
                          68,
                          5,
                        ),
                        bgcolor:
                          '#faf5ff',
                        color:
                          row.targetApplied &&
                          row.dday !==
                            null &&
                          row.dday < 0
                            ? '#be123c'
                            : '#5b21b6',
                        fontWeight: 900,
                      }}
                    >
                      {row.targetApplied
                        ? formatDday(
                            row.dday,
                          )
                        : '-'}
                    </TableCell>

                    {periods.map(
                      (period) => {
                        const count =
                          row.dailyCounts[
                            period.key
                          ] || 0;

                        return (
                          <TableCell
                            key={
                              period.key
                            }
                            align="right"
                            sx={{
                              bgcolor:
                                period.isToday
                                  ? '#fffbeb'
                                  : period.weekday ===
                                      '일'
                                    ? '#fffafa'
                                    : period.weekday ===
                                        '토'
                                      ? '#f8fbff'
                                      : 'transparent',
                              color:
                                count > 0
                                  ? '#0f172a'
                                  : '#cbd5e1',
                              fontWeight:
                                count > 0
                                  ? 800
                                  : 400,
                              fontSize:
                                '0.62rem',
                              px: 0.35,
                              py: 0.4,
                            }}
                          >
                            {count > 0
                              ? formatNumber(
                                  count,
                                )
                              : ''}
                          </TableCell>
                        );
                      },
                    )}
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ px: 0.5 }}
      >
        날짜 열은 오늘부터 과거 순으로 표시되며, 해당 날짜에 새로 작업완료 처리된 세대수입니다. 차수 목표량은 공종별 현황입력에서 설정한 동·층 목표선을 기준으로 계산하며, D-day는 한국시간 오늘 날짜와 선택 차수 목표일의 차이입니다.
      </Typography>
    </Box>
  );
}
