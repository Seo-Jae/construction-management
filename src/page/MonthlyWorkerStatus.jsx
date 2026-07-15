import React, { useMemo, useState } from 'react';
import {
  Box,
  IconButton,
  InputAdornment,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';

const pad2 = (value) => String(value).padStart(2, '0');

const createDateKey = (year, monthIndex, day) => {
  const yy = String(year).slice(2);
  return `${yy}.${pad2(monthIndex + 1)}.${pad2(day)}`;
};

const normalizeWorkerName = (name) =>
  String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const getWeekendStyle = (year, monthIndex, day) => {
  const dayOfWeek = new Date(year, monthIndex, day).getDay();

  if (dayOfWeek === 0) {
    return {
      color: '#dc2626',
      bgcolor: '#fff1f2',
    };
  }

  if (dayOfWeek === 6) {
    return {
      color: '#2563eb',
      bgcolor: '#eff6ff',
    };
  }

  return {
    color: '#334155',
    bgcolor: '#f8fafc',
  };
};

export default function MonthlyWorkerStatus({
  projectName = '',
  savedData = {},
  viewYear,
  viewMonth,
  handlePrevMonth,
  handleNextMonth,
}) {
  const [searchName, setSearchName] = useState('');

  const daysInMonth = new Date(
    viewYear,
    viewMonth + 1,
    0,
  ).getDate();

  const monthNumber = viewMonth + 1;
  const startDate = `${viewYear}-${pad2(monthNumber)}-01`;
  const endDate = `${viewYear}-${pad2(monthNumber)}-${pad2(
    daysInMonth,
  )}`;

  const workers = useMemo(() => {
    const workerMap = new Map();

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = createDateKey(
        viewYear,
        viewMonth,
        day,
      );
      const dailyWorkers = Array.isArray(
        savedData?.[dateKey]?.workers,
      )
        ? savedData[dateKey].workers
        : [];

      dailyWorkers.forEach((worker) => {
        const name = String(worker?.name || '').trim();
        const job = String(worker?.job || '').trim();

        if (!name) return;

        /*
          같은 이름이 다른 직종으로 등록된 경우를 구분하기 위해
          직종과 성명을 합친 값을 근로자 식별 기준으로 사용합니다.
        */
        const workerKey = `${job}::${normalizeWorkerName(name)}`;

        if (!workerMap.has(workerKey)) {
          workerMap.set(workerKey, {
            key: workerKey,
            job: job || '미지정',
            name,
            attendance: {},
          });
        }

        /*
          월별 투입현황은 날짜별 근로 여부를 표시합니다.
          같은 사람이 하루에 중복 등록돼도 해당 날짜는 1일로 집계합니다.
        */
        workerMap.get(workerKey).attendance[day] = 1;
      });
    }

    return Array.from(workerMap.values()).sort((a, b) => {
      const jobCompare = a.job.localeCompare(
        b.job,
        'ko',
        { numeric: true },
      );

      if (jobCompare !== 0) return jobCompare;

      return a.name.localeCompare(
        b.name,
        'ko',
        { numeric: true },
      );
    });
  }, [daysInMonth, savedData, viewMonth, viewYear]);

  const normalizedSearch = normalizeWorkerName(searchName);

  const filteredWorkers = useMemo(() => {
    if (!normalizedSearch) {
      return workers;
    }

    return workers.filter((worker) =>
      normalizeWorkerName(worker.name).includes(
        normalizedSearch,
      ),
    );
  }, [normalizedSearch, workers]);

  const dayColumns = Array.from(
    { length: daysInMonth },
    (_, index) => index + 1,
  );

  const stickyHeaderStyle = {
    position: 'sticky',
    zIndex: 5,
    bgcolor: '#f1f5f9',
    borderRight: '1px solid #94a3b8',
    borderBottom: '1px solid #64748b',
    fontWeight: 900,
    color: '#1e293b',
    py: 0.7,
    px: 0.5,
    whiteSpace: 'nowrap',
  };

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.2,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          px: 1.5,
          py: 1.2,
          borderColor: '#cbd5e1',
          boxShadow: 'none',
          bgcolor: '#ffffff',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(220px, 1fr) minmax(260px, 1.35fr) minmax(250px, 1fr)',
            alignItems: 'stretch',
            border: '1px solid #64748b',
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '68px 1fr',
              minHeight: 72,
              borderRight: '1px solid #64748b',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: '1px solid #64748b',
                bgcolor: '#f8fafc',
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.72rem',
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                }}
              >
                현장명
              </Typography>
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                px: 1.4,
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  color: '#0f172a',
                }}
              >
                {projectName || '현장명 미등록'}
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              minHeight: 72,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.2,
              borderRight: '1px solid #64748b',
            }}
          >
            <Typography
              sx={{
                fontSize: '1.25rem',
                fontWeight: 900,
                letterSpacing: '0.12em',
                color: '#0f172a',
              }}
            >
              금월 투입현황
            </Typography>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.4,
              }}
            >
              <IconButton
                size="small"
                onClick={handlePrevMonth}
                aria-label="이전 달"
                sx={{ p: 0.15 }}
              >
                <ChevronLeftIcon fontSize="small" />
              </IconButton>

              <Typography
                sx={{
                  minWidth: 92,
                  textAlign: 'center',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  color: '#475569',
                }}
              >
                {viewYear}년 {pad2(monthNumber)}월
              </Typography>

              <IconButton
                size="small"
                onClick={handleNextMonth}
                aria-label="다음 달"
                sx={{ p: 0.15 }}
              >
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '54px 1fr 44px',
              gridTemplateRows: '1fr 1fr',
              minHeight: 72,
            }}
          >
            <Box
              sx={{
                gridRow: '1 / 3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: '1px solid #64748b',
                bgcolor: '#f8fafc',
              }}
            >
              <Typography
                sx={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'upright',
                  fontSize: '0.67rem',
                  fontWeight: 900,
                  letterSpacing: '0.16em',
                }}
              >
                기간
              </Typography>
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: '1px solid #64748b',
                borderBottom: '1px solid #64748b',
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}
              >
                {startDate}
              </Typography>
            </Box>

            <Box
              sx={{
                gridRow: '1 / 3',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#f8fafc',
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.6rem',
                  fontWeight: 800,
                  color: '#64748b',
                }}
              >
                일수
              </Typography>
              <Typography
                sx={{
                  mt: 0.2,
                  fontSize: '0.76rem',
                  fontWeight: 900,
                }}
              >
                {daysInMonth}일
              </Typography>
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: '1px solid #64748b',
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}
              >
                {endDate}
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            mt: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Typography
            sx={{
              color: '#64748b',
              fontSize: '0.72rem',
              fontWeight: 700,
            }}
          >
            등록 근로자 {workers.length.toLocaleString()}명
            {normalizedSearch
              ? ` · 조회 결과 ${filteredWorkers.length.toLocaleString()}명`
              : ''}
          </Typography>

          <TextField
            value={searchName}
            onChange={(event) =>
              setSearchName(event.target.value)
            }
            size="small"
            label="근로자 조회"
            placeholder="근로자 이름 입력"
            sx={{
              width: 260,
              '& .MuiInputBase-root': {
                height: 34,
                bgcolor: '#ffffff',
                fontSize: '0.78rem',
              },
              '& .MuiInputLabel-root': {
                fontSize: '0.76rem',
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon
                    sx={{
                      color: '#64748b',
                      fontSize: 18,
                    }}
                  />
                </InputAdornment>
              ),
              endAdornment: searchName ? (
                <InputAdornment position="end">
                  <Tooltip title="검색어 지우기">
                    <IconButton
                      size="small"
                      onClick={() => setSearchName('')}
                      aria-label="검색어 지우기"
                      sx={{ p: 0.2 }}
                    >
                      <CloseIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ) : null,
            }}
          />
        </Box>
      </Paper>

      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflow: 'auto',
          borderColor: '#94a3b8',
          boxShadow: 'none',
          bgcolor: '#ffffff',
        }}
      >
        <Table
          stickyHeader
          size="small"
          sx={{
            minWidth: 300 + daysInMonth * 34,
            tableLayout: 'fixed',
            borderCollapse: 'separate',
            borderSpacing: 0,
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell
                align="center"
                sx={{
                  ...stickyHeaderStyle,
                  left: 0,
                  width: 44,
                  minWidth: 44,
                  maxWidth: 44,
                  zIndex: 8,
                }}
              >
                No.
              </TableCell>

              <TableCell
                align="center"
                sx={{
                  ...stickyHeaderStyle,
                  left: 44,
                  width: 88,
                  minWidth: 88,
                  maxWidth: 88,
                  zIndex: 8,
                }}
              >
                직종
              </TableCell>

              <TableCell
                align="center"
                sx={{
                  ...stickyHeaderStyle,
                  left: 132,
                  width: 112,
                  minWidth: 112,
                  maxWidth: 112,
                  zIndex: 8,
                  boxShadow: '2px 0 0 #94a3b8',
                }}
              >
                성명
              </TableCell>

              {dayColumns.map((day) => {
                const weekendStyle = getWeekendStyle(
                  viewYear,
                  viewMonth,
                  day,
                );

                return (
                  <TableCell
                    key={day}
                    align="center"
                    sx={{
                      ...stickyHeaderStyle,
                      position: 'sticky',
                      top: 0,
                      width: 34,
                      minWidth: 34,
                      maxWidth: 34,
                      color: weekendStyle.color,
                      bgcolor: weekendStyle.bgcolor,
                      px: 0,
                    }}
                  >
                    {day}
                  </TableCell>
                );
              })}

              <TableCell
                align="center"
                sx={{
                  ...stickyHeaderStyle,
                  right: 0,
                  width: 56,
                  minWidth: 56,
                  maxWidth: 56,
                  zIndex: 8,
                  boxShadow: '-2px 0 0 #94a3b8',
                }}
              >
                합계
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {filteredWorkers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={daysInMonth + 4}
                  align="center"
                  sx={{
                    py: 7,
                    color: '#64748b',
                    fontSize: '0.82rem',
                  }}
                >
                  {normalizedSearch
                    ? '검색한 근로자가 없습니다.'
                    : '해당 월에 등록된 근로자가 없습니다.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredWorkers.map((worker, index) => {
                const totalAttendance = dayColumns.reduce(
                  (total, day) =>
                    total +
                    Number(worker.attendance[day] || 0),
                  0,
                );

                return (
                  <TableRow
                    key={worker.key}
                    hover
                    sx={{
                      '&:nth-of-type(even) td': {
                        bgcolor: '#fbfdff',
                      },
                    }}
                  >
                    <TableCell
                      align="center"
                      sx={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 3,
                        width: 44,
                        minWidth: 44,
                        maxWidth: 44,
                        px: 0.4,
                        py: 0.65,
                        bgcolor: '#ffffff',
                        borderRight: '1px solid #cbd5e1',
                        fontSize: '0.7rem',
                      }}
                    >
                      {index + 1}
                    </TableCell>

                    <TableCell
                      align="center"
                      sx={{
                        position: 'sticky',
                        left: 44,
                        zIndex: 3,
                        width: 88,
                        minWidth: 88,
                        maxWidth: 88,
                        px: 0.5,
                        py: 0.65,
                        bgcolor: '#ffffff',
                        borderRight: '1px solid #cbd5e1',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#475569',
                      }}
                    >
                      {worker.job}
                    </TableCell>

                    <TableCell
                      align="center"
                      sx={{
                        position: 'sticky',
                        left: 132,
                        zIndex: 3,
                        width: 112,
                        minWidth: 112,
                        maxWidth: 112,
                        px: 0.5,
                        py: 0.65,
                        bgcolor: '#ffffff',
                        borderRight: '1px solid #94a3b8',
                        boxShadow: '2px 0 0 #e2e8f0',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        color: '#0f172a',
                      }}
                    >
                      {worker.name}
                    </TableCell>

                    {dayColumns.map((day) => {
                      const attended = Number(
                        worker.attendance[day] || 0,
                      );
                      const weekendStyle = getWeekendStyle(
                        viewYear,
                        viewMonth,
                        day,
                      );

                      return (
                        <TableCell
                          key={`${worker.key}-${day}`}
                          align="center"
                          sx={{
                            width: 34,
                            minWidth: 34,
                            maxWidth: 34,
                            px: 0,
                            py: 0.65,
                            borderRight: '1px dotted #cbd5e1',
                            bgcolor:
                              weekendStyle.bgcolor === '#f8fafc'
                                ? 'transparent'
                                : weekendStyle.bgcolor,
                            color: attended
                              ? '#0f172a'
                              : '#cbd5e1',
                            fontSize: '0.7rem',
                            fontWeight: attended ? 800 : 400,
                          }}
                        >
                          {attended || ''}
                        </TableCell>
                      );
                    })}

                    <TableCell
                      align="center"
                      sx={{
                        position: 'sticky',
                        right: 0,
                        zIndex: 3,
                        width: 56,
                        minWidth: 56,
                        maxWidth: 56,
                        px: 0.4,
                        py: 0.65,
                        bgcolor: '#f8fafc',
                        borderLeft: '1px solid #94a3b8',
                        fontSize: '0.72rem',
                        fontWeight: 900,
                        color: '#0369a1',
                      }}
                    >
                      {totalAttendance}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
