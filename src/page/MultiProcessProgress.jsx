import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import PrintIcon from '@mui/icons-material/Print';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import { supabase } from '../supabaseClient';
import {
  buildFloorVisualCells,
  countUniqueUnits,
  getCellKey,
  getProjectCellKeys,
} from '../utils/buildingUnits.js';

const PAGE_SIZE = 1000;

const PROCESS_COLORS = [
  '#38bdf8',
  '#fb7185',
  '#a78bfa',
  '#84cc16',
  '#f59e0b',
  '#22d3ee',
  '#f472b6',
  '#34d399',
  '#818cf8',
  '#fb923c',
  '#14b8a6',
  '#e11d48',
];

const getProcessColor = (processName, processOptions) => {
  const processIndex = processOptions.indexOf(processName);
  const safeIndex = processIndex >= 0 ? processIndex : 0;
  return PROCESS_COLORS[safeIndex % PROCESS_COLORS.length];
};

const formatCompletionDate = (dateValue) => {
  if (!dateValue) return '';

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue);

  const year = String(date.getFullYear()).slice(2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
};

function MultiStatusCell({
  buildingName,
  unitCode,
  selectedProcesses,
  processOptions,
  progressMap,
  cellWidth = 34,
}) {
  const cellKey = getCellKey(buildingName, unitCode);
  const cellProgress = progressMap[cellKey] || {};

  const completedProcesses = selectedProcesses.filter(
    (processName) => cellProgress[processName]?.status === '작업완료',
  );

  const tooltipContent = (
    <Box sx={{ py: 0.25 }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, mb: 0.5 }}>
        {buildingName} {unitCode}호
      </Typography>

      {selectedProcesses.map((processName) => {
        const item = cellProgress[processName];
        const isCompleted = item?.status === '작업완료';
        const color = getProcessColor(processName, processOptions);

        return (
          <Box
            key={processName}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              mb: 0.25,
              whiteSpace: 'nowrap',
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: isCompleted ? color : '#64748b',
              }}
            />
            <Typography sx={{ fontSize: '0.7rem' }}>
              {processName}: {isCompleted ? '완료' : '미완료'}
              {isCompleted && item?.date
                ? ` (${formatCompletionDate(item.date)})`
                : ''}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} placement="top" arrow>
      <Box
        sx={{
          position: 'relative',
          width: cellWidth,
          height: 23,
          flex: `0 0 ${cellWidth}px`,
          border: '1px solid #cbd5e1',
          bgcolor: '#ffffff',
          overflow: 'hidden',
          cursor: 'default',
          boxSizing: 'border-box',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
          }}
        >
          {selectedProcesses.map((processName, index) => {
            const isCompleted =
              cellProgress[processName]?.status === '작업완료';
            const color = getProcessColor(processName, processOptions);

            return (
              <Box
                key={processName}
                sx={{
                  flex: '1 1 0',
                  minWidth: 0,
                  bgcolor: isCompleted ? color : '#ffffff',
                  borderRight:
                    index < selectedProcesses.length - 1
                      ? '1px solid rgba(148, 163, 184, 0.45)'
                      : 'none',
                }}
              />
            );
          })}
        </Box>

        <Typography
          component="span"
          sx={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            fontSize: '0.57rem',
            lineHeight: 1,
            fontWeight: completedProcesses.length > 0 ? 800 : 500,
            color: '#0f172a',
            textShadow:
              completedProcesses.length > 0
                ? '0 0 2px #ffffff, 0 0 3px #ffffff'
                : 'none',
            userSelect: 'none',
          }}
        >
          {unitCode}
        </Typography>
      </Box>
    </Tooltip>
  );
}

function MultiProcessBuildingGrid({
  buildingName,
  config,
  selectedProcesses,
  processOptions,
  progressMap,
}) {
  const floors = Number(config?.floors) || 0;
  const buildingTotalUnits = countUniqueUnits(config);

  const floorNumbers = Array.from(
    { length: floors },
    (_, index) => floors - index,
  );

  return (
    <Box
      className="multi-progress-building"
      sx={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          bgcolor: 'transparent',
        }}
      >
          {floorNumbers.map((floor) => {
            const floorCells = buildFloorVisualCells(config, floor);

            return (
            <Box
              key={floor}
              sx={{ display: 'flex', alignItems: 'center', gap: '2px' }}
            >
              <Typography
                sx={{
                  width: 21,
                  flex: '0 0 21px',
                  textAlign: 'right',
                  pr: 0.25,
                  color: '#64748b',
                  fontSize: '0.55rem',
                  lineHeight: 1,
                }}
              >
                {floor}F
              </Typography>

              {floorCells.map((cell) => {
                const cellWidth = 34 * cell.span + 2 * (cell.span - 1);
                const visualKey = `${floor}-${cell.visualStart}-${cell.visualEnd}`;

                if (cell.type === 'piloti') {
                  return (
                    <Box
                      key={visualKey}
                      title={`${buildingName} ${floor}층 제외호`}
                      sx={{
                        position: 'relative',
                        width: cellWidth,
                        height: 23,
                        flex: `0 0 ${cellWidth}px`,
                        border: '1px solid #cbd5e1',
                        bgcolor: '#f8fafc',
                        boxSizing: 'border-box',
                        overflow: 'hidden',
                        userSelect: 'none',
                        '&::before, &::after': {
                          content: '""',
                          position: 'absolute',
                          left: '50%',
                          top: '-8px',
                          width: '1px',
                          height: '39px',
                          bgcolor: '#94a3b8',
                          transformOrigin: 'center',
                        },
                        '&::before': {
                          transform: 'translateX(-50%) rotate(56deg)',
                        },
                        '&::after': {
                          transform: 'translateX(-50%) rotate(-56deg)',
                        },
                      }}
                    />
                  );
                }

                if (cell.type === 'empty') {
                  return (
                    <Box
                      key={visualKey}
                      aria-hidden="true"
                      sx={{
                        width: cellWidth,
                        height: 23,
                        flex: `0 0 ${cellWidth}px`,
                        border: 'none',
                        bgcolor: 'transparent',
                        boxSizing: 'border-box',
                      }}
                    />
                  );
                }

                return (
                  <MultiStatusCell
                    key={visualKey}
                    buildingName={buildingName}
                    unitCode={cell.unitCode}
                    selectedProcesses={selectedProcesses}
                    processOptions={processOptions}
                    progressMap={progressMap}
                    cellWidth={cellWidth}
                  />
                );
              })}
            </Box>
          );
          })}
      </Box>

      <Typography
        sx={{
          mt: 0.8,
          fontSize: '0.78rem',
          fontWeight: 800,
          color: '#0f172a',
        }}
      >
        {buildingName}
      </Typography>
      <Typography
        sx={{
          mt: 0.15,
          fontSize: '0.66rem',
          fontWeight: 700,
          color: '#64748b',
        }}
      >
        전체 {buildingTotalUnits.toLocaleString('ko-KR')}세대
      </Typography>
    </Box>
  );
}

export default function MultiProcessProgress({
  projectName = '',
  processOptions = [],
  buildingConfigs = {},
}) {
  const safeProcessOptions = Array.isArray(processOptions)
    ? processOptions
    : [];
  const safeBuildingConfigs = buildingConfigs || {};

  const [selectedProcesses, setSelectedProcesses] = useState(() =>
    safeProcessOptions.slice(0, 2),
  );
  const [progressRows, setProgressRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setSelectedProcesses((previous) => {
      const validPrevious = previous.filter((processName) =>
        safeProcessOptions.includes(processName),
      );

      if (validPrevious.length > 0) return validPrevious;
      return safeProcessOptions.slice(0, 2);
    });
  }, [safeProcessOptions]);

  useEffect(() => {
    let isMounted = true;

    const fetchProgressRows = async () => {
      if (!projectName || selectedProcesses.length === 0) {
        if (isMounted) {
          setProgressRows([]);
          setErrorMessage('');
        }
        return;
      }

      setLoading(true);
      setErrorMessage('');

      try {
        const allRows = [];
        let from = 0;

        while (true) {
          const to = from + PAGE_SIZE - 1;
          const { data, error } = await supabase
            .from('unit_progress')
            .select(
              'building, unit, process_type, status, completion_date',
            )
            .eq('project_name', projectName)
            .in('process_type', selectedProcesses)
            .order('building', { ascending: true })
            .order('unit', { ascending: true })
            .order('process_type', { ascending: true })
            .range(from, to);

          if (error) throw error;

          const pageRows = data || [];
          allRows.push(...pageRows);

          if (pageRows.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }

        if (isMounted) setProgressRows(allRows);
      } catch (error) {
        console.error('다중 공종 진척 데이터 조회 오류:', error);
        if (isMounted) {
          setProgressRows([]);
          setErrorMessage(
            error?.message || '다중 공종 진척 데이터를 불러오지 못했습니다.',
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProgressRows();

    return () => {
      isMounted = false;
    };
  }, [projectName, selectedProcesses, refreshKey]);

  const progressMap = useMemo(() => {
    const mapped = {};

    progressRows.forEach((row) => {
      const buildingName = String(row.building ?? '');
      const unitCode = String(row.unit ?? '');
      const processName = row.process_type;

      if (!buildingName || !unitCode || !processName) return;

      const cellKey = getCellKey(buildingName, unitCode);
      if (!mapped[cellKey]) mapped[cellKey] = {};

      mapped[cellKey][processName] = {
        status: row.status,
        date: row.completion_date,
      };
    });

    return mapped;
  }, [progressRows]);

  const validCellKeys = useMemo(
    () => getProjectCellKeys(safeBuildingConfigs),
    [safeBuildingConfigs],
  );

  const processStats = useMemo(
    () =>
      selectedProcesses.map((processName) => {
        let completed = 0;

        validCellKeys.forEach((cellKey) => {
          if (progressMap[cellKey]?.[processName]?.status === '작업완료') {
            completed += 1;
          }
        });

        const total = validCellKeys.size;
        const percentage = total === 0 ? 0 : (completed / total) * 100;

        return {
          processName,
          completed,
          total,
          percentage,
          color: getProcessColor(processName, safeProcessOptions),
        };
      }),
    [progressMap, safeProcessOptions, selectedProcesses, validCellKeys],
  );

  const handleProcessChange = (_event, nextValue) => {
    setSelectedProcesses(nextValue);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <style>
        {`
          .multi-progress-print-only {
            display: none;
          }

          @media print {
            @page {
              size: A4 landscape;
              margin: 8mm;
            }

            html,
            body {
              background: #ffffff !important;
            }

            body * {
              visibility: hidden !important;
            }

            #multi-progress-print-area,
            #multi-progress-print-area * {
              visibility: visible !important;
            }

            #multi-progress-print-area {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
              display: block !important;
              background: #ffffff !important;
              padding: 0 !important;
              margin: 0 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            #multi-progress-print-area .multi-progress-no-print {
              display: none !important;
            }

            #multi-progress-print-area .multi-progress-print-only {
              display: flex !important;
            }

            #multi-progress-print-area .multi-progress-stats {
              grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
              margin-bottom: 4mm !important;
            }

            #multi-progress-print-area .multi-progress-scroll {
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
              padding: 0 !important;
              background: #ffffff !important;
              border: none !important;
            }

            #multi-progress-print-area .multi-progress-buildings {
              width: 100% !important;
              min-width: 0 !important;
              min-height: 0 !important;
              display: flex !important;
              flex-wrap: wrap !important;
              align-items: flex-end !important;
              justify-content: flex-start !important;
              gap: 12mm 8mm !important;
              padding: 0 !important;
            }

            #multi-progress-print-area .multi-progress-building {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            #multi-progress-print-area .MuiPaper-root {
              box-shadow: none !important;
            }
          }
        `}
      </style>

      <Box
        id="multi-progress-print-area"
        sx={{
          height: '100%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        <Box
          className="multi-progress-print-only"
          sx={{
            display: 'none',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 2,
            pb: 1,
            borderBottom: '2px solid #0f172a',
          }}
        >
          <Box>
            <Typography sx={{ fontSize: '1.05rem', fontWeight: 900 }}>
              다중 공종 진척 현황
            </Typography>
            <Typography sx={{ mt: 0.2, fontSize: '0.72rem', color: '#475569' }}>
              {projectName || '현장명 미등록'}
            </Typography>
          </Box>

          <Typography
            sx={{
              maxWidth: '65%',
              textAlign: 'right',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#334155',
            }}
          >
            선택 공종: {selectedProcesses.join(', ') || '-'}
          </Typography>
        </Box>
      <Paper
        className="multi-progress-no-print"
        variant="outlined"
        sx={{
          p: 1.5,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 1.5,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Box sx={{ minWidth: 190 }}>
          <Typography fontWeight={800} color="#334155">
            비교할 공종 선택
          </Typography>
          <Typography variant="caption" color="text.secondary">
            같은 세대 셀을 선택 공종 수만큼 나눠서 표시합니다.
          </Typography>
        </Box>

        <Autocomplete
          multiple
          disableCloseOnSelect
          filterSelectedOptions
          options={safeProcessOptions}
          value={selectedProcesses}
          onChange={handleProcessChange}
          sx={{ flex: '1 1 520px', minWidth: 300 }}
          renderOption={(props, option, { selected }) => (
            <li {...props}>
              <Checkbox
                icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                checkedIcon={<CheckBoxIcon fontSize="small" />}
                checked={selected}
                sx={{ mr: 1, p: 0.25 }}
              />
              {option}
            </li>
          )}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => {
              const color = getProcessColor(option, safeProcessOptions);
              const tagProps = getTagProps({ index });

              return (
                <Chip
                  {...tagProps}
                  key={option}
                  label={option}
                  size="small"
                  sx={{
                    bgcolor: `${color}22`,
                    border: `1px solid ${color}`,
                    color: '#0f172a',
                    fontWeight: 700,
                  }}
                />
              );
            })
          }
          renderInput={(params) => (
            <TextField
              {...params}
              size="small"
              label="공종 선택"
              placeholder={
                selectedProcesses.length === 0
                  ? '2개 이상의 공종을 선택하세요'
                  : ''
              }
            />
          )}
        />

        <Tooltip title="다중 공종 진척 현황 인쇄">
          <IconButton
            size="small"
            aria-label="다중 공종 진척 현황 인쇄"
            onClick={handlePrint}
            disabled={selectedProcesses.length === 0}
            sx={{
              width: 34,
              height: 34,
              flexShrink: 0,
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
            <PrintIcon sx={{ fontSize: 19 }} />
          </IconButton>
        </Tooltip>

        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => setRefreshKey((previous) => previous + 1)}
          disabled={loading || selectedProcesses.length === 0}
          sx={{ whiteSpace: 'nowrap' }}
        >
          새로고침
        </Button>
      </Paper>

      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

      {selectedProcesses.length === 0 && (
        <Alert severity="info">표시할 공종을 한 개 이상 선택해주세요.</Alert>
      )}

      {selectedProcesses.length > 0 && (
        <Box
          className="multi-progress-stats"
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: 'repeat(2, minmax(0, 1fr))',
              xl: 'repeat(4, minmax(0, 1fr))',
            },
            gap: 1,
          }}
        >
          {processStats.map((stat) => (
            <Paper
              key={stat.processName}
              variant="outlined"
              sx={{
                px: 1.25,
                py: 1,
                borderColor: `${stat.color}aa`,
                borderTop: `4px solid ${stat.color}`,
                boxShadow: 'none',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  mb: 0.5,
                }}
              >
                <Typography
                  noWrap
                  sx={{ fontSize: '0.8rem', fontWeight: 800 }}
                >
                  {stat.processName}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: '#475569',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stat.completed}/{stat.total} ({stat.percentage.toFixed(1)}%)
                </Typography>
              </Box>

              <LinearProgress
                variant="determinate"
                value={stat.percentage}
                sx={{
                  height: 5,
                  borderRadius: 99,
                  bgcolor: '#e2e8f0',
                  '& .MuiLinearProgress-bar': {
                    bgcolor: stat.color,
                    borderRadius: 99,
                  },
                }}
              />
            </Paper>
          ))}
        </Box>
      )}

      <Paper
        className="multi-progress-scroll"
        variant="outlined"
        sx={{
          position: 'relative',
          flexGrow: 1,
          minHeight: 0,
          overflow: 'auto',
          p: 1.5,
          borderColor: 'transparent',
          boxShadow: 'none',
          bgcolor: '#f1f5f9',
        }}
      >
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              bgcolor: 'rgba(248, 250, 252, 0.82)',
            }}
          >
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary">
              공종별 완료 데이터를 불러오는 중입니다.
            </Typography>
          </Box>
        )}

        {Object.keys(safeBuildingConfigs).length === 0 ? (
          <Box
            sx={{
              minHeight: 260,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography color="text.secondary">
              이 현장에 등록된 동 설정이 없습니다.
            </Typography>
          </Box>
        ) : (
          <Box
            className="multi-progress-buildings"
            sx={{
              minWidth: 'max-content',
              minHeight: '100%',
              display: 'flex',
              alignItems: 'flex-end',
              gap: 3,
              pb: 1,
            }}
          >
            {Object.entries(safeBuildingConfigs)
              .sort(([nameA], [nameB]) =>
                nameA.localeCompare(nameB, 'ko', { numeric: true }),
              )
              .map(([buildingName, config]) => (
                <MultiProcessBuildingGrid
                  key={buildingName}
                  buildingName={buildingName}
                  config={config}
                  selectedProcesses={selectedProcesses}
                  processOptions={safeProcessOptions}
                  progressMap={progressMap}
                />
              ))}
          </Box>
        )}
      </Paper>
      </Box>
    </>
  );
}
