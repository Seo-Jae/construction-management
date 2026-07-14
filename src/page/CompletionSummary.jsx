import React, { useEffect, useMemo, useState } from 'react';
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

const normalizeNumberArray = (value) =>
  Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    : [];

const getFloorException = (exceptions, floor) =>
  exceptions?.[floor] || exceptions?.[String(floor)] || null;

const isValidUnit = (config, floor, unitNumber) => {
  const pilotiFloors = normalizeNumberArray(config?.pilotiFloors);
  const floorException = getFloorException(config?.exceptions, floor);
  const exceptionUnits = normalizeNumberArray(floorException?.units);

  const isActiveOnPiloti =
    Boolean(floorException) && exceptionUnits.includes(unitNumber);
  const isPiloti = pilotiFloors.includes(floor) && !isActiveOnPiloti;
  const isNonExistent =
    Boolean(floorException) &&
    !exceptionUnits.includes(unitNumber) &&
    !pilotiFloors.includes(floor);

  return !isPiloti && !isNonExistent;
};

const getUnitCode = (floor, unitNumber) =>
  `${floor}${String(unitNumber).padStart(2, '0')}`;

const getCellKey = (buildingName, unitCode) =>
  `${String(buildingName)}-${String(unitCode)}`;

const parseDateValue = (value) => {
  if (!value) return null;

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );

  return Number.isNaN(date.getTime()) ? null : date;
};

const pad2 = (value) => String(value).padStart(2, '0');

const getMonthKey = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

const getMonthLabel = (date) =>
  `${String(date.getFullYear()).slice(2)}.${pad2(date.getMonth() + 1)}`;

const getWeekEndDate = (date) => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysUntilSaturday = (6 - result.getDay() + 7) % 7;
  result.setDate(result.getDate() + daysUntilSaturday);
  return result;
};

const getDateKey = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const getWeekLabel = (date) =>
  `${String(date.getFullYear()).slice(2)}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;

const makePeriods = (mode, count) => {
  const now = new Date();
  const periods = [];

  if (mode === 'monthly') {
    const cursor = new Date(now.getFullYear(), now.getMonth(), 1);

    for (let index = 0; index < count; index += 1) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth() - index, 1);
      periods.push({
        key: getMonthKey(date),
        label: getMonthLabel(date),
        title: `${date.getFullYear()}년 ${date.getMonth() + 1}월`,
      });
    }

    return periods;
  }

  const currentWeekEnd = getWeekEndDate(now);

  for (let index = 0; index < count; index += 1) {
    const endDate = new Date(currentWeekEnd);
    endDate.setDate(currentWeekEnd.getDate() - index * 7);

    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - 6);

    periods.push({
      key: getDateKey(endDate),
      label: getWeekLabel(endDate),
      title: `${startDate.getFullYear()}.${pad2(startDate.getMonth() + 1)}.${pad2(startDate.getDate())} ~ ${endDate.getFullYear()}.${pad2(endDate.getMonth() + 1)}.${pad2(endDate.getDate())}`,
    });
  }

  return periods;
};

const getRowPeriodKey = (mode, completionDate) => {
  const date = parseDateValue(completionDate);
  if (!date) return null;

  if (mode === 'monthly') return getMonthKey(date);
  return getDateKey(getWeekEndDate(date));
};

const formatNumber = (value) => Number(value || 0).toLocaleString('ko-KR');

const stickyCellStyle = (left, width, zIndex = 3) => ({
  position: 'sticky',
  left,
  zIndex,
  width,
  minWidth: width,
  maxWidth: width,
  bgcolor: '#ffffff',
  borderRight: '1px solid #cbd5e1',
});

export default function CompletionSummary({
  mode = 'weekly',
  projectName = '',
  processOptions = [],
  buildingConfigs = {},
}) {
  const safeProcessOptions = Array.isArray(processOptions) ? processOptions : [];
  const safeBuildingConfigs = buildingConfigs || {};
  const isMonthly = mode === 'monthly';

  const periodChoices = isMonthly ? [6, 12, 18, 24] : [8, 12, 18, 26];
  const [periodCount, setPeriodCount] = useState(18);
  const [progressRows, setProgressRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const fetchRows = async () => {
      if (!projectName || safeProcessOptions.length === 0) {
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
            .select('building, unit, process_type, status, completion_date')
            .eq('project_name', projectName)
            .eq('status', '작업완료')
            .in('process_type', safeProcessOptions)
            .range(from, to);

          if (error) throw error;

          const pageRows = data || [];
          allRows.push(...pageRows);

          if (pageRows.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }

        if (isMounted) setProgressRows(allRows);
      } catch (error) {
        console.error('완료 집계 조회 오류:', error);
        if (isMounted) {
          setProgressRows([]);
          setErrorMessage(
            error?.message || '완료 집계 데이터를 불러오지 못했습니다.',
          );
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRows();

    return () => {
      isMounted = false;
    };
  }, [projectName, refreshKey, safeProcessOptions]);

  const validCellKeys = useMemo(() => {
    const keys = new Set();

    Object.entries(safeBuildingConfigs).forEach(([buildingName, config]) => {
      const floors = Number(config?.floors) || 0;
      const unitsPerFloor = Number(config?.unitsPerFloor) || 0;

      for (let floor = 1; floor <= floors; floor += 1) {
        for (let unitNumber = 1; unitNumber <= unitsPerFloor; unitNumber += 1) {
          if (!isValidUnit(config, floor, unitNumber)) continue;
          keys.add(getCellKey(buildingName, getUnitCode(floor, unitNumber)));
        }
      }
    });

    return keys;
  }, [safeBuildingConfigs]);

  const periods = useMemo(
    () => makePeriods(mode, periodCount),
    [mode, periodCount],
  );

  const periodKeySet = useMemo(
    () => new Set(periods.map((period) => period.key)),
    [periods],
  );

  const summaryRows = useMemo(() => {
    const processCellMap = {};

    safeProcessOptions.forEach((processName) => {
      processCellMap[processName] = new Map();
    });

    progressRows.forEach((row) => {
      const processName = row.process_type;
      if (!processCellMap[processName]) return;

      const cellKey = getCellKey(row.building, row.unit);
      if (!validCellKeys.has(cellKey)) return;

      processCellMap[processName].set(cellKey, row);
    });

    return safeProcessOptions.map((processName) => {
      const periodCounts = {};
      periods.forEach((period) => {
        periodCounts[period.key] = 0;
      });

      let outOfRange = 0;
      const completedRows = Array.from(processCellMap[processName].values());

      completedRows.forEach((row) => {
        const periodKey = getRowPeriodKey(mode, row.completion_date);

        if (periodKey && periodKeySet.has(periodKey)) {
          periodCounts[periodKey] += 1;
        } else {
          outOfRange += 1;
        }
      });

      const total = validCellKeys.size;
      const completed = completedRows.length;
      const remaining = Math.max(total - completed, 0);
      const progress = total === 0 ? 0 : (completed / total) * 100;

      return {
        processName,
        total,
        completed,
        remaining,
        progress,
        periodCounts,
        outOfRange,
      };
    });
  }, [mode, periodKeySet, periods, progressRows, safeProcessOptions, validCellKeys]);

  const hasOutOfRange = summaryRows.some((row) => row.outOfRange > 0);

  const handleExcelDownload = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(
      isMonthly ? '월별 완료 집계' : '주별 완료 집계',
    );

    const headers = [
      '공정',
      '전체',
      '완료',
      '진도율',
      '잔여',
      ...periods.map((period) => period.label),
      ...(hasOutOfRange ? ['기간 외/날짜 미지정'] : []),
    ];

    worksheet.addRow(headers);

    summaryRows.forEach((row) => {
      worksheet.addRow([
        row.processName,
        row.total,
        row.completed,
        `${row.progress.toFixed(2)}%`,
        row.remaining,
        ...periods.map((period) => row.periodCounts[period.key] || 0),
        ...(hasOutOfRange ? [row.outOfRange] : []),
      ]);
    });

    worksheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
    worksheet.getRow(1).font = { bold: true };
    worksheet.columns.forEach((column, index) => {
      column.width = index === 0 ? 22 : 12;
      column.alignment = { horizontal: index === 0 ? 'left' : 'center' };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${isMonthly ? '월별' : '주별'}_완료집계_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
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
          justifyContent: 'space-between',
          gap: 1,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Box>
          <Typography fontWeight={800} color="#334155">
            {isMonthly ? '월별 완료 집계' : '주별 완료 집계'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            공종별 작업완료 세대를 완료일 기준으로 집계합니다.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            표시 기간
          </Typography>
          <FormControl size="small">
            <Select
              value={periodCount}
              onChange={(event) => setPeriodCount(Number(event.target.value))}
              sx={{ minWidth: 105, fontSize: '0.8rem' }}
            >
              {periodChoices.map((choice) => (
                <MenuItem key={choice} value={choice}>
                  최근 {choice}{isMonthly ? '개월' : '주'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => setRefreshKey((previous) => previous + 1)}
            disabled={loading}
          >
            새로고침
          </Button>

          <Button
            variant="contained"
            color="success"
            startIcon={<DownloadIcon />}
            onClick={handleExcelDownload}
            disabled={loading || summaryRows.length === 0}
          >
            엑셀 다운로드
          </Button>
        </Box>
      </Paper>

      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

      <Paper
        variant="outlined"
        sx={{
          position: 'relative',
          flexGrow: 1,
          minHeight: 0,
          overflow: 'hidden',
          borderColor: '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              bgcolor: 'rgba(255,255,255,0.82)',
            }}
          >
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary">
              완료 집계를 계산하는 중입니다.
            </Typography>
          </Box>
        )}

        <TableContainer sx={{ width: '100%', height: '100%', overflow: 'auto' }}>
          <Table
            stickyHeader
            size="small"
            sx={{
              minWidth: 500 + periods.length * 84 + (hasOutOfRange ? 120 : 0),
              tableLayout: 'fixed',
              '& th, & td': {
                borderBottom: '1px solid #dbe3ee',
                borderRight: '1px solid #dbe3ee',
                fontSize: '0.75rem',
                py: 0.75,
              },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell
                  align="center"
                  sx={{ ...stickyCellStyle(0, 170, 8), fontWeight: 800 }}
                >
                  공정
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ ...stickyCellStyle(170, 80, 8), fontWeight: 800 }}
                >
                  전체
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ ...stickyCellStyle(250, 80, 8), fontWeight: 800 }}
                >
                  완료
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ ...stickyCellStyle(330, 90, 8), fontWeight: 800 }}
                >
                  진도율
                </TableCell>
                <TableCell
                  align="center"
                  sx={{ ...stickyCellStyle(420, 80, 8), fontWeight: 800 }}
                >
                  잔여
                </TableCell>

                {periods.map((period) => (
                  <TableCell
                    key={period.key}
                    align="center"
                    title={period.title}
                    sx={{
                      width: 84,
                      minWidth: 84,
                      maxWidth: 84,
                      fontWeight: 800,
                      bgcolor: '#f8fafc',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {period.label}
                  </TableCell>
                ))}

                {hasOutOfRange && (
                  <TableCell
                    align="center"
                    sx={{
                      width: 120,
                      minWidth: 120,
                      fontWeight: 800,
                      bgcolor: '#fff7ed',
                    }}
                  >
                    기간 외
                  </TableCell>
                )}
              </TableRow>
            </TableHead>

            <TableBody>
              {summaryRows.map((row, index) => (
                <TableRow
                  key={row.processName}
                  hover
                  sx={{ bgcolor: index % 2 === 0 ? '#ffffff' : '#fbfdff' }}
                >
                  <TableCell
                    sx={{
                      ...stickyCellStyle(0, 170, 5),
                      fontWeight: 700,
                      color: '#1e293b',
                    }}
                  >
                    {row.processName}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ ...stickyCellStyle(170, 80, 5), fontWeight: 700 }}
                  >
                    {formatNumber(row.total)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ ...stickyCellStyle(250, 80, 5), fontWeight: 700 }}
                  >
                    {formatNumber(row.completed)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      ...stickyCellStyle(330, 90, 5),
                      fontWeight: 800,
                      color: '#0369a1',
                    }}
                  >
                    {row.progress.toFixed(2)}%
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ ...stickyCellStyle(420, 80, 5), fontWeight: 700 }}
                  >
                    {formatNumber(row.remaining)}
                  </TableCell>

                  {periods.map((period) => {
                    const count = row.periodCounts[period.key] || 0;
                    return (
                      <TableCell key={period.key} align="right">
                        {count > 0 ? formatNumber(count) : ''}
                      </TableCell>
                    );
                  })}

                  {hasOutOfRange && (
                    <TableCell align="right" sx={{ bgcolor: '#fffaf5' }}>
                      {row.outOfRange > 0 ? formatNumber(row.outOfRange) : ''}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
        주별 집계는 일요일부터 토요일까지를 한 주로 계산하며, 열 제목은 해당 주의 토요일입니다.
        {hasOutOfRange
          ? ' 표시 기간 밖의 완료분 또는 완료일이 없는 데이터는 기간 외 열에 표시됩니다.'
          : ''}
      </Typography>
    </Box>
  );
}
