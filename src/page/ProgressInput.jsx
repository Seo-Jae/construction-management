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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  LinearProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import BuildingGrid from '../BuildingGrid';
import { supabase } from '../supabaseClient';
import {
  getFloorCellKeys,
  getProjectCellKeys,
} from '../utils/buildingUnits.js';

const STATUS_OPTIONS = ['작업전', '작업중', '작업완료'];

const TARGET_COLORS = [
  '#dc2626',
  '#2563eb',
  '#16a34a',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#be123c',
  '#4f46e5',
];

const TARGET_SELECT_COLUMNS = `
  id,
  project_name,
  process_type,
  sequence,
  target_name,
  target_date,
  building_floor_targets,
  created_by,
  updated_by,
  created_at,
  updated_at
`;

const getKoreaDateKey = (
  date = new Date(),
) => {
  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      },
    );

  const values = {};

  formatter
    .formatToParts(date)
    .forEach((part) => {
      if (part.type !== 'literal') {
        values[part.type] =
          part.value;
      }
    });

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );
};

const parseDateKeyToUtc = (
  dateKey,
) => {
  const match =
    String(dateKey || '')
      .match(
        /^(\d{4})-(\d{2})-(\d{2})$/,
      );

  if (!match) {
    return null;
  }

  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
};

const getDdayValue = (
  targetDate,
) => {
  const todayUtc =
    parseDateKeyToUtc(
      getKoreaDateKey(),
    );

  const targetUtc =
    parseDateKeyToUtc(
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
  days,
) => {
  if (
    days === null ||
    Number.isNaN(days)
  ) {
    return '목표일 미설정';
  }

  if (days > 0) {
    return `D-${days}`;
  }

  if (days === 0) {
    return 'D-DAY';
  }

  return `D+${Math.abs(days)}`;
};

const normalizeFloorTargets = (
  value,
) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  return Object.entries(value)
    .reduce(
      (
        result,
        [buildingName, floor],
      ) => {
        const nextFloor =
          Number(floor);

        if (
          buildingName &&
          Number.isFinite(
            nextFloor,
          ) &&
          nextFloor > 0
        ) {
          result[buildingName] =
            nextFloor;
        }

        return result;
      },
      {},
    );
};

const getTargetCellKeys = ({
  buildingFloorTargets,
  buildingConfigs,
}) => {
  const cellKeys =
    new Set();

  Object.entries(
    normalizeFloorTargets(
      buildingFloorTargets,
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

      const maxFloor =
        Math.min(
          Number(
            config?.floors,
          ) || 0,
          Number(
            targetFloor,
          ) || 0,
        );

      for (
        let floor = 1;
        floor <= maxFloor;
        floor += 1
      ) {
        getFloorCellKeys(
          buildingName,
          config,
          floor,
        ).forEach(
          (cellKey) =>
            cellKeys.add(
              cellKey,
            ),
        );
      }
    },
  );

  return cellKeys;
};

const getTargetSummary = ({
  target,
  buildingConfigs,
  unitProgressData,
}) => {
  const targetCellKeys =
    getTargetCellKeys({
      buildingFloorTargets:
        target
          ?.building_floor_targets,
      buildingConfigs,
    });

  let completedCount = 0;

  targetCellKeys.forEach(
    (cellKey) => {
      if (
        unitProgressData?.[
          cellKey
        ]?.status ===
        '작업완료'
      ) {
        completedCount += 1;
      }
    },
  );

  const targetCount =
    targetCellKeys.size;

  const remainingCount =
    Math.max(
      targetCount -
        completedCount,
      0,
    );

  const dday =
    getDdayValue(
      target?.target_date,
    );

  const dailyRequired =
    remainingCount === 0
      ? 0
      : dday !== null &&
          dday > 0
        ? remainingCount /
          dday
        : null;

  const percentage =
    targetCount > 0
      ? Math.round(
          (
            completedCount /
            targetCount
          ) * 1000,
        ) / 10
      : 0;

  return {
    targetCount,
    completedCount,
    remainingCount,
    dday,
    ddayLabel:
      formatDday(dday),
    dailyRequired,
    percentage,
  };
};

const getStatusButtonStyle = (status, selectedStatusAction) => {
  const selected = selectedStatusAction === status;

  if (status === '작업중') {
    return {
      color: selected ? '#ffffff' : '#10b981',
      borderColor: '#6ee7b7',
      bgcolor: selected ? '#10b981' : '#ffffff',
      '&:hover': {
        bgcolor: selected ? '#059669' : '#ecfdf5',
        borderColor: '#10b981',
      },
    };
  }

  if (status === '작업완료') {
    return {
      color: selected ? '#ffffff' : '#0ea5e9',
      borderColor: '#7dd3fc',
      bgcolor: selected ? '#0ea5e9' : '#ffffff',
      '&:hover': {
        bgcolor: selected ? '#0284c7' : '#f0f9ff',
        borderColor: '#0ea5e9',
      },
    };
  }

  return {
    color: selected ? '#ffffff' : '#64748b',
    borderColor: '#cbd5e1',
    bgcolor: selected ? '#94a3b8' : '#ffffff',
    '&:hover': {
      bgcolor: selected ? '#64748b' : '#f8fafc',
      borderColor: '#94a3b8',
    },
  };
};

export default function ProgressInput({
  projectName = '',
  selectedCells = new Set(),
  actionName = '',
  progressDate = '',
  setProgressDate,
  handleSaveProgress,
  setSelectedCells,
  selectedStatusAction = '작업완료',
  setSelectedStatusAction,
  protectCompleted = false,
  completedUnits = 0,
  totalUnits = 0,
  progressPercentage = 0,
  setSelectedProcess,
  selectedProcess = '',
  processOptions = [],
  buildingConfigs = {},
  unitProgressData = {},
  handleGridCellClick,
  handleFloorClick,
}) {
  const [
    progressTargets,
    setProgressTargets,
  ] = useState([]);

  const [
    activeTargetId,
    setActiveTargetId,
  ] = useState('');

  const [
    targetLineEditMode,
    setTargetLineEditMode,
  ] = useState(false);

  const [
    targetDialogOpen,
    setTargetDialogOpen,
  ] = useState(false);

  const [
    targetDraft,
    setTargetDraft,
  ] = useState({
    id: '',
    sequence: 1,
    target_name:
      '1차 방통',
    target_date: '',
    building_floor_targets:
      {},
  });

  const [
    targetLoading,
    setTargetLoading,
  ] = useState(false);

  const [
    targetSaving,
    setTargetSaving,
  ] = useState(false);

  const [
    targetError,
    setTargetError,
  ] = useState('');

  const selectionCount =
    selectedCells?.size ?? 0;

  const protectedCompletedCount =
    Object.values(
      unitProgressData || {},
    ).filter(
      (progressItem) =>
        progressItem?.status ===
        '작업완료',
    ).length;

  const sortedBuildings = Object.entries(buildingConfigs || {}).sort(
    ([keyA], [keyB]) =>
      keyA.localeCompare(keyB, 'ko', {
        numeric: true,
      }),
  );

  const loadProgressTargets =
    useCallback(async () => {
      if (
        !projectName ||
        !selectedProcess
      ) {
        setProgressTargets([]);
        setActiveTargetId('');
        setTargetLineEditMode(
          false,
        );
        return;
      }

      setTargetLoading(true);
      setTargetError('');

      try {
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
          .eq(
            'process_type',
            selectedProcess,
          )
          .order(
            'sequence',
            {
              ascending: true,
            },
          );

        if (error) {
          throw error;
        }

        const rows =
          (data || []).map(
            (row) => ({
              ...row,
              building_floor_targets:
                normalizeFloorTargets(
                  row
                    .building_floor_targets,
                ),
            }),
          );

        setProgressTargets(rows);

        setActiveTargetId(
          (previous) =>
            rows.some(
              (row) =>
                row.id ===
                previous,
            )
              ? previous
              : rows[0]?.id ||
                '',
        );
      } catch (error) {
        console.error(
          '공정 목표 조회 실패:',
          error,
        );

        setProgressTargets([]);
        setActiveTargetId('');

        setTargetError(
          error?.code ===
            '42P01'
            ? 'progress_targets 테이블이 없습니다. 제공된 SQL을 먼저 실행해주세요.'
            : error?.message ||
                '공정 목표를 불러오지 못했습니다.',
        );
      } finally {
        setTargetLoading(false);
      }
    }, [
      projectName,
      selectedProcess,
    ]);

  useEffect(() => {
    loadProgressTargets();
  }, [loadProgressTargets]);

  useEffect(() => {
    setTargetLineEditMode(
      false,
    );
  }, [
    projectName,
    selectedProcess,
  ]);

  const targetSummaries =
    useMemo(
      () =>
        progressTargets.map(
          (target, index) => ({
            target,
            color:
              TARGET_COLORS[
                index %
                  TARGET_COLORS.length
              ],
            summary:
              getTargetSummary({
                target,
                buildingConfigs,
                unitProgressData,
              }),
          }),
        ),
      [
        buildingConfigs,
        progressTargets,
        unitProgressData,
      ],
    );

  const activeTargetItem =
    targetSummaries.find(
      (item) =>
        item.target.id ===
        activeTargetId,
    ) || null;

  const openNewTargetDialog =
    () => {
      const nextSequence =
        progressTargets.reduce(
          (maximum, target) =>
            Math.max(
              maximum,
              Number(
                target.sequence,
              ) || 0,
            ),
          0,
        ) + 1;

      setTargetDraft({
        id: '',
        sequence:
          nextSequence,
        target_name:
          `${nextSequence}차 방통`,
        target_date:
          getKoreaDateKey(),
        building_floor_targets:
          {},
      });

      setTargetDialogOpen(
        true,
      );
    };

  const openEditTargetDialog =
    () => {
      if (!activeTargetItem) {
        return;
      }

      setTargetDraft({
        ...activeTargetItem
          .target,
        building_floor_targets:
          normalizeFloorTargets(
            activeTargetItem
              .target
              .building_floor_targets,
          ),
      });

      setTargetDialogOpen(
        true,
      );
    };

  const getCurrentUserEmail =
    async () => {
      const {
        data,
      } =
        await supabase.auth.getUser();

      return (
        data?.user?.email ||
        ''
      );
    };

  const saveTargetDraft =
    async () => {
      const targetName =
        String(
          targetDraft
            .target_name || '',
        ).trim();

      if (!targetName) {
        setTargetError(
          '차수명을 입력해주세요.',
        );
        return;
      }

      if (
        !targetDraft
          .target_date
      ) {
        setTargetError(
          '목표일을 선택해주세요.',
        );
        return;
      }

      setTargetSaving(true);
      setTargetError('');

      try {
        const userEmail =
          await getCurrentUserEmail();

        const payload = {
          project_name:
            projectName,
          process_type:
            selectedProcess,
          sequence:
            Number(
              targetDraft
                .sequence,
            ) || 1,
          target_name:
            targetName,
          target_date:
            targetDraft
              .target_date,
          building_floor_targets:
            normalizeFloorTargets(
              targetDraft
                .building_floor_targets,
            ),
          updated_by:
            userEmail || null,
        };

        let savedRow;

        if (targetDraft.id) {
          const {
            data,
            error,
          } = await supabase
            .from(
              'progress_targets',
            )
            .update(payload)
            .eq(
              'id',
              targetDraft.id,
            )
            .select(
              TARGET_SELECT_COLUMNS,
            )
            .single();

          if (error) {
            throw error;
          }

          savedRow = data;
        } else {
          const {
            data,
            error,
          } = await supabase
            .from(
              'progress_targets',
            )
            .insert({
              ...payload,
              created_by:
                userEmail ||
                null,
            })
            .select(
              TARGET_SELECT_COLUMNS,
            )
            .single();

          if (error) {
            throw error;
          }

          savedRow = data;
        }

        const normalizedRow = {
          ...savedRow,
          building_floor_targets:
            normalizeFloorTargets(
              savedRow
                .building_floor_targets,
            ),
        };

        setProgressTargets(
          (previous) =>
            previous
              .filter(
                (target) =>
                  target.id !==
                  normalizedRow.id,
              )
              .concat(
                normalizedRow,
              )
              .sort(
                (
                  first,
                  second,
                ) =>
                  Number(
                    first.sequence,
                  ) -
                  Number(
                    second.sequence,
                  ),
              ),
        );

        setActiveTargetId(
          normalizedRow.id,
        );

        setTargetDialogOpen(
          false,
        );

        if (
          !targetDraft.id
        ) {
          setTargetLineEditMode(
            true,
          );
        }
      } catch (error) {
        console.error(
          '공정 목표 저장 실패:',
          error,
        );

        setTargetError(
          error?.message ||
            '공정 목표를 저장하지 못했습니다.',
        );
      } finally {
        setTargetSaving(false);
      }
    };

  const deleteActiveTarget =
    async () => {
      if (
        !targetDraft.id
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          `${targetDraft.target_name} 설정을 삭제할까요?`,
        );

      if (!confirmed) {
        return;
      }

      setTargetSaving(true);
      setTargetError('');

      try {
        const {
          error,
        } = await supabase
          .from(
            'progress_targets',
          )
          .delete()
          .eq(
            'id',
            targetDraft.id,
          );

        if (error) {
          throw error;
        }

        const nextTargets =
          progressTargets.filter(
            (target) =>
              target.id !==
              targetDraft.id,
          );

        setProgressTargets(
          nextTargets,
        );

        setActiveTargetId(
          nextTargets[0]
            ?.id || '',
        );

        setTargetLineEditMode(
          false,
        );

        setTargetDialogOpen(
          false,
        );
      } catch (error) {
        console.error(
          '공정 목표 삭제 실패:',
          error,
        );

        setTargetError(
          error?.message ||
            '공정 목표를 삭제하지 못했습니다.',
        );
      } finally {
        setTargetSaving(false);
      }
    };

  const updateTargetFloor =
    async (
      buildingName,
      floor,
    ) => {
      if (
        !targetLineEditMode ||
        !activeTargetItem ||
        targetSaving
      ) {
        return;
      }

      const activeTarget =
        activeTargetItem
          .target;

      const currentTargets =
        normalizeFloorTargets(
          activeTarget
            .building_floor_targets,
        );

      const nextTargets = {
        ...currentTargets,
      };

      if (
        Number(
          currentTargets[
            buildingName
          ],
        ) === Number(floor)
      ) {
        delete nextTargets[
          buildingName
        ];
      } else {
        nextTargets[
          buildingName
        ] = Number(floor);
      }

      setTargetSaving(true);
      setTargetError('');

      try {
        const userEmail =
          await getCurrentUserEmail();

        const {
          data,
          error,
        } = await supabase
          .from(
            'progress_targets',
          )
          .update({
            building_floor_targets:
              nextTargets,
            updated_by:
              userEmail ||
              null,
          })
          .eq(
            'id',
            activeTarget.id,
          )
          .select(
            TARGET_SELECT_COLUMNS,
          )
          .single();

        if (error) {
          throw error;
        }

        const normalizedRow = {
          ...data,
          building_floor_targets:
            normalizeFloorTargets(
              data
                .building_floor_targets,
            ),
        };

        setProgressTargets(
          (previous) =>
            previous.map(
              (target) =>
                target.id ===
                normalizedRow.id
                  ? normalizedRow
                  : target,
            ),
        );
      } catch (error) {
        console.error(
          '목표 라인 저장 실패:',
          error,
        );

        setTargetError(
          error?.message ||
            '목표 라인을 저장하지 못했습니다.',
        );
      } finally {
        setTargetSaving(false);
      }
    };

  const handleEffectiveFloorClick =
    (
      buildingName,
      floor,
    ) => {
      if (
        targetLineEditMode &&
        activeTargetItem
      ) {
        updateTargetFloor(
          buildingName,
          floor,
        );
        return;
      }

      handleFloorClick?.(
        buildingName,
        floor,
      );
    };

  const selectAllCells = () => {
    const allCellKeys =
      getProjectCellKeys(
        buildingConfigs,
      );

    const editableCellKeys =
      protectCompleted
        ? Array.from(
            allCellKeys,
          ).filter(
            (cellKey) =>
              unitProgressData?.[
                cellKey
              ]?.status !==
              '작업완료',
          )
        : Array.from(
            allCellKeys,
          );

    setSelectedCells?.(
      new Set(
        editableCellKeys,
      ),
    );
  };

  const clearSelectedCells = () => {
    setSelectedCells?.(new Set());
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* 진도율과 공정 선택을 항상 화면 최상단에 고정합니다. */}
      <Paper
        elevation={1}
        sx={{
          minHeight: 42,
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          columnGap: 1.5,
          px: 1.25,
          py: 0.35,
          bgcolor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 1,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-start',
            gap: 0.5,
            minWidth: 0,
          }}
        >
          {STATUS_OPTIONS.map((status) => (
            <Button
              key={status}
              size="small"
              variant={
                selectedStatusAction === status ? 'contained' : 'outlined'
              }
              onClick={() => setSelectedStatusAction?.(status)}
              sx={{
                minWidth: 68,
                py: 0.25,
                px: 1.1,
                fontSize: '0.75rem',
                boxShadow: 'none',
                ...getStatusButtonStyle(status, selectedStatusAction),
              }}
            >
              {status === '작업완료' ? '완료' : status}
            </Button>
          ))}

          <Box
            sx={{
              width: '1px',
              height: 22,
              mx: 0.25,
              bgcolor: '#cbd5e1',
              flexShrink: 0,
            }}
          />

          <Button
            size="small"
            variant="outlined"
            onClick={selectAllCells}
            disabled={sortedBuildings.length === 0}
            sx={{
              minWidth: 74,
              py: 0.25,
              px: 1,
              color: '#7c3aed',
              borderColor: '#c4b5fd',
              bgcolor: '#ffffff',
              fontSize: '0.72rem',
              boxShadow: 'none',
              '&:hover': {
                borderColor: '#8b5cf6',
                bgcolor: '#f5f3ff',
              },
            }}
          >
            전체선택
          </Button>

          <Button
            size="small"
            variant="outlined"
            onClick={clearSelectedCells}
            disabled={selectionCount === 0}
            sx={{
              minWidth: 88,
              py: 0.25,
              px: 1,
              color: '#64748b',
              borderColor: '#cbd5e1',
              bgcolor: '#ffffff',
              fontSize: '0.72rem',
              boxShadow: 'none',
              '&:hover': {
                borderColor: '#94a3b8',
                bgcolor: '#f8fafc',
              },
            }}
          >
            전체선택해제
          </Button>
        </Box>

        <Typography
          component="div"
          fontWeight={800}
          sx={{
            color: '#334155',
            fontSize: '0.9rem',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          진도율 : {completedUnits}/{totalUnits}{' '}
          <Box component="span" sx={{ color: '#ef4444' }}>
            {progressPercentage}%
          </Box>
        </Typography>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            minWidth: 0,
          }}
        >
          <Autocomplete
            options={processOptions}
            value={selectedProcess || null}
            onChange={(_, value) => {
              if (value) setSelectedProcess?.(value);
            }}
            disableClearable
            size="small"
            sx={{ width: 180 }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="공정 선택"
                sx={{
                  '& .MuiInputBase-root': {
                    minHeight: 34,
                    py: 0,
                    fontSize: '0.8rem',
                  },
                  '& .MuiInputLabel-root': {
                    fontSize: '0.75rem',
                  },
                }}
              />
            )}
          />
        </Box>
      </Paper>

      <Paper
        elevation={1}
        sx={{
          mt: 0.5,
          minHeight: 58,
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns:
            'minmax(0, 1fr) auto auto',
          alignItems: 'center',
          gap: 0.75,
          px: 1,
          py: 0.55,
          bgcolor: '#ffffff',
          border: targetLineEditMode
            ? '1px solid #f59e0b'
            : '1px solid #e2e8f0',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            minWidth: 0,
            display: 'flex',
            alignItems: 'stretch',
            gap: 0.45,
            overflowX: 'auto',
            py: 0.1,
          }}
        >
          {targetLoading && (
            <Box
              sx={{
                width: 70,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <LinearProgress
                sx={{ width: '100%' }}
              />
            </Box>
          )}

          {!targetLoading &&
            targetSummaries.map(
              ({
                target,
                summary,
                color,
              }) => {
                const selected =
                  target.id ===
                  activeTargetId;

                return (
                  <Button
                    key={target.id}
                    size="small"
                    variant={
                      selected
                        ? 'contained'
                        : 'outlined'
                    }
                    onClick={() => {
                      setActiveTargetId(
                        target.id,
                      );
                      setTargetLineEditMode(
                        false,
                      );
                    }}
                    sx={{
                      minWidth: 126,
                      px: 0.8,
                      py: 0.35,
                      flexShrink: 0,
                      display: 'flex',
                      flexDirection:
                        'column',
                      alignItems:
                        'flex-start',
                      borderColor: color,
                      bgcolor: selected
                        ? color
                        : '#ffffff',
                      color: selected
                        ? '#ffffff'
                        : color,
                      boxShadow: 'none',
                      '&:hover': {
                        borderColor: color,
                        bgcolor: selected
                          ? color
                          : `${color}12`,
                        boxShadow: 'none',
                      },
                    }}
                  >
                    <Typography
                      component="span"
                      sx={{
                        maxWidth: 112,
                        overflow: 'hidden',
                        textOverflow:
                          'ellipsis',
                        whiteSpace:
                          'nowrap',
                        fontSize:
                          '0.69rem',
                        fontWeight: 900,
                      }}
                    >
                      {target.target_name}
                    </Typography>

                    <Typography
                      component="span"
                      sx={{
                        mt: 0.1,
                        fontSize:
                          '0.56rem',
                        fontWeight: 800,
                        opacity: 0.94,
                        whiteSpace:
                          'nowrap',
                      }}
                    >
                      잔여{' '}
                      {summary.remainingCount.toLocaleString()}
                      {' · '}
                      {summary.ddayLabel}
                    </Typography>
                  </Button>
                );
              },
            )}

          <Button
            size="small"
            variant="outlined"
            onClick={
              openNewTargetDialog
            }
            disabled={
              !projectName ||
              !selectedProcess ||
              targetSaving
            }
            sx={{
              minWidth:
                progressTargets.length >
                0
                  ? 78
                  : 118,
              flexShrink: 0,
              px: 0.8,
              py: 0.35,
              color: '#7c3aed',
              borderColor: '#c4b5fd',
              bgcolor: '#faf5ff',
              fontSize: '0.65rem',
              fontWeight: 900,
              '&:hover': {
                borderColor:
                  '#8b5cf6',
                bgcolor: '#f3e8ff',
              },
            }}
          >
            {progressTargets.length >
            0
              ? '+ 차수 추가'
              : '1차 방통 설정'}
          </Button>
        </Box>

        <Box
          sx={{
            minWidth: 310,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent:
              'center',
            gap: 0.15,
          }}
        >
          {activeTargetItem ? (
            <>
              <Typography
                sx={{
                  color: '#334155',
                  fontSize: '0.67rem',
                  fontWeight: 900,
                  whiteSpace: 'nowrap',
                }}
              >
                목표{' '}
                {activeTargetItem.summary.targetCount.toLocaleString()}
                {' · 완료 '}
                {activeTargetItem.summary.completedCount.toLocaleString()}
                {' · 잔여 '}
                <Box
                  component="span"
                  sx={{
                    color:
                      activeTargetItem
                        .color,
                  }}
                >
                  {activeTargetItem.summary.remainingCount.toLocaleString()}
                </Box>
                {' · '}
                {activeTargetItem.summary.ddayLabel}
              </Typography>

              <Typography
                sx={{
                  color: '#64748b',
                  fontSize: '0.58rem',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                진척{' '}
                {activeTargetItem.summary.percentage}
                %
                {' · 일 필요량 '}
                {activeTargetItem.summary.dailyRequired ===
                null
                  ? activeTargetItem.summary.remainingCount ===
                    0
                    ? '0'
                    : '기한초과'
                  : activeTargetItem.summary.dailyRequired.toLocaleString(
                      'ko-KR',
                      {
                        maximumFractionDigits: 1,
                      },
                    )}
                세대
              </Typography>
            </>
          ) : (
            <Typography
              sx={{
                color: '#94a3b8',
                fontSize: '0.66rem',
                fontWeight: 800,
              }}
            >
              차수를 추가하면 목표량과 D-day가 표시됩니다.
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'flex-end',
            gap: 0.4,
            whiteSpace: 'nowrap',
          }}
        >
          <Button
            size="small"
            variant={
              targetLineEditMode
                ? 'contained'
                : 'outlined'
            }
            disabled={
              !activeTargetItem ||
              targetSaving
            }
            onClick={() =>
              setTargetLineEditMode(
                (previous) =>
                  !previous,
              )
            }
            sx={{
              minWidth: 78,
              px: 0.65,
              fontSize: '0.63rem',
              fontWeight: 900,
              color: targetLineEditMode
                ? '#ffffff'
                : '#d97706',
              borderColor:
                '#fbbf24',
              bgcolor: targetLineEditMode
                ? '#f59e0b'
                : '#fffbeb',
              boxShadow: 'none',
              '&:hover': {
                bgcolor: targetLineEditMode
                  ? '#d97706'
                  : '#fef3c7',
                boxShadow: 'none',
              },
            }}
          >
            {targetLineEditMode
              ? '라인설정 종료'
              : '라인 설정'}
          </Button>

          <Button
            size="small"
            variant="outlined"
            disabled={
              !activeTargetItem ||
              targetSaving
            }
            onClick={
              openEditTargetDialog
            }
            sx={{
              minWidth: 66,
              px: 0.65,
              color: '#475569',
              borderColor: '#cbd5e1',
              fontSize: '0.63rem',
              fontWeight: 900,
            }}
          >
            설정수정
          </Button>
        </Box>

        {(targetLineEditMode ||
          targetError) && (
          <Box
            sx={{
              gridColumn: '1 / -1',
              minWidth: 0,
            }}
          >
            {targetLineEditMode && (
              <Alert
                severity="warning"
                sx={{
                  py: 0,
                  px: 0.8,
                  minHeight: 24,
                  alignItems:
                    'center',
                  '& .MuiAlert-message':
                    {
                      py: 0.25,
                      fontSize:
                        '0.61rem',
                      fontWeight: 800,
                    },
                }}
              >
                라인 설정 중입니다. 각 동의 목표 최종층을 클릭하세요. 같은 층을 다시 누르면 해제됩니다.
              </Alert>
            )}

            {targetError && (
              <Alert
                severity="error"
                sx={{
                  mt:
                    targetLineEditMode
                      ? 0.35
                      : 0,
                  py: 0,
                  px: 0.8,
                  minHeight: 24,
                  '& .MuiAlert-message':
                    {
                      py: 0.25,
                      fontSize:
                        '0.61rem',
                    },
                }}
              >
                {targetError}
              </Alert>
            )}
          </Box>
        )}
      </Paper>

      {/*
        날짜 선택창 전용 공간입니다.
        선택 전에도 같은 높이를 유지하므로 건물들이 아래로 움직이지 않습니다.
      */}
      <Box
        sx={{
          position: 'relative',
          height: 43,
          minHeight: 43,
          flexShrink: 0,
          mt: 0.5,
          mb: 0.5,
        }}
      >
        <Fade in={selectionCount > 0} timeout={180}>
          <Paper
            elevation={1}
            sx={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 'fit-content',
              maxWidth: 'calc(100% - 16px)',
              minHeight: 38,
              px: 1.75,
              py: 0.4,
              bgcolor: '#e0f2fe',
              border: '1px solid #7dd3fc',
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              whiteSpace: 'nowrap',
              zIndex: 2,
            }}
          >
            <Typography
              fontWeight={800}
              sx={{ color: '#0369a1', fontSize: '0.8rem' }}
            >
              {actionName} {selectionCount}개 선택
            </Typography>

            <TextField
              type="date"
              size="small"
              value={progressDate}
              onChange={(event) => setProgressDate?.(event.target.value)}
              sx={{
                width: 145,
                bgcolor: '#ffffff',
                '& .MuiInputBase-input': {
                  py: 0.5,
                  px: 1,
                  fontSize: '0.78rem',
                },
              }}
            />

            <Button
              variant="contained"
              size="small"
              disabled={selectionCount === 0 || !progressDate}
              onClick={handleSaveProgress}
              sx={{
                minWidth: 62,
                px: 1.6,
                py: 0.4,
                bgcolor: '#0284c7',
                fontSize: '0.75rem',
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: '#0369a1',
                  boxShadow: 'none',
                },
              }}
            >
              저장
            </Button>

            <Button
              variant="outlined"
              size="small"
              onClick={clearSelectedCells}
              sx={{
                minWidth: 62,
                px: 1.6,
                py: 0.4,
                color: '#0369a1',
                borderColor: '#7dd3fc',
                bgcolor: '#ffffff',
                fontSize: '0.75rem',
              }}
            >
              취소
            </Button>
          </Paper>
        </Fade>
      </Box>

      {/* 동은 줄바꿈하지 않고 다중 공종 화면처럼 가로로 이어집니다. */}
      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflow: 'auto',
          bgcolor: '#f1f5f9',
          borderRadius: 1,
          scrollbarGutter: 'stable both-edges',
        }}
      >
        {sortedBuildings.length === 0 ? (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography sx={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              등록된 동 정보가 없습니다.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'nowrap',
              alignItems: 'flex-end',
              gap: 4,
              width: 'max-content',
              minWidth: '100%',
              minHeight: '100%',
              height: 'max-content',
              px: 1.5,
              pt: 0.5,
              pb: 1,
            }}
          >
            {sortedBuildings.map(([name, config]) => (
              <Box
                key={name}
                sx={{
                  flex: '0 0 auto',
                }}
              >
                <BuildingGrid
                  buildingName={name}
                  config={config}
                  selectedCells={selectedCells}
                  onCellClick={
                    targetLineEditMode
                      ? undefined
                      : handleGridCellClick
                  }
                  unitData={unitProgressData}
                  onFloorClick={
                    handleEffectiveFloorClick
                  }
                  protectCompleted={
                    protectCompleted
                  }
                  targetEditMode={
                    targetLineEditMode
                  }
                  activeTargetId={
                    activeTargetId
                  }
                  targetLines={
                    targetSummaries
                      .map(
                        ({
                          target,
                          color,
                        }) => ({
                          id:
                            target.id,
                          label:
                            target.target_name,
                          color,
                          floor:
                            Number(
                              target
                                .building_floor_targets?.[
                                name
                              ],
                            ) || 0,
                          active:
                            target.id ===
                            activeTargetId,
                        }),
                      )
                      .filter(
                        (line) =>
                          line.floor >
                          0,
                      )
                  }
                />
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <Dialog
        open={targetDialogOpen}
        onClose={() => {
          if (!targetSaving) {
            setTargetDialogOpen(
              false,
            );
          }
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle
          sx={{
            pb: 0.75,
            fontSize: '1rem',
            fontWeight: 900,
          }}
        >
          {targetDraft.id
            ? '차수 설정 수정'
            : '차수 목표 추가'}
        </DialogTitle>

        <DialogContent
          dividers
          sx={{
            display: 'grid',
            gap: 1.2,
          }}
        >
          <TextField
            label="차수명"
            size="small"
            value={
              targetDraft
                .target_name
            }
            onChange={(event) =>
              setTargetDraft(
                (previous) => ({
                  ...previous,
                  target_name:
                    event.target
                      .value,
                }),
              )
            }
            placeholder="예: 1차 방통"
          />

          <TextField
            label="목표일"
            type="date"
            size="small"
            value={
              targetDraft
                .target_date
            }
            onChange={(event) =>
              setTargetDraft(
                (previous) => ({
                  ...previous,
                  target_date:
                    event.target
                      .value,
                }),
              )
            }
            InputLabelProps={{
              shrink: true,
            }}
          />

          <Alert
            severity="info"
            sx={{
              '& .MuiAlert-message':
                {
                  fontSize:
                    '0.69rem',
                  lineHeight: 1.55,
                },
            }}
          >
            저장 후 라인 설정을 누르고 각 동의 층 번호를 클릭하세요. 선택한 층까지의 실제 존재 세대가 목표량으로 자동 계산됩니다.
          </Alert>

          {targetDraft.id && (
            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.68rem',
                lineHeight: 1.55,
              }}
            >
              현재 라인 설정 동수:{' '}
              {Object.keys(
                normalizeFloorTargets(
                  targetDraft
                    .building_floor_targets,
                ),
              ).length.toLocaleString()}
              개 동
            </Typography>
          )}
        </DialogContent>

        <DialogActions
          sx={{
            justifyContent:
              targetDraft.id
                ? 'space-between'
                : 'flex-end',
            px: 2,
            py: 1,
          }}
        >
          {targetDraft.id && (
            <Button
              color="error"
              onClick={
                deleteActiveTarget
              }
              disabled={
                targetSaving
              }
              sx={{
                fontWeight: 900,
              }}
            >
              차수 삭제
            </Button>
          )}

          <Box
            sx={{
              display: 'flex',
              gap: 0.6,
            }}
          >
            <Button
              onClick={() =>
                setTargetDialogOpen(
                  false,
                )
              }
              disabled={
                targetSaving
              }
            >
              취소
            </Button>

            <Button
              variant="contained"
              onClick={
                saveTargetDraft
              }
              disabled={
                targetSaving
              }
              sx={{
                fontWeight: 900,
              }}
            >
              {targetSaving
                ? '저장중'
                : '저장'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
