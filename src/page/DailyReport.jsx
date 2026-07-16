import React from 'react';
import {
  Box,
  Button,
  Divider,
  IconButton,
  Paper,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import HistoricalDailyReportUpload from './HistoricalDailyReportUpload.jsx';

export default function DailyReport({
  weekDays,
  calendarCells,
  viewYear,
  viewMonth,
  selectedWeekDate,
  savedData,
  isClosed,
  handlePrevMonth,
  handleNextMonth,
  handleDayClick,
  handleOpenModal,
  handleDownloadExcel,
  handleDownloadMonthlyExcel,
  handleToggleDeadline,
  handleSetNoTask,
  todayMidnight,
  formatYYMMDD,
  userProfile,
  canCancelDeadline = false,
  onHistoricalUploadComplete,
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
        gap: 2,
        height: '100%',
      }}
    >
      <Paper sx={{ p: 1.5, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, alignItems: 'center' }}>
          <Typography variant="subtitle2" fontWeight="bold">
            기간 선택
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton size="small" onClick={handlePrevMonth} sx={{ p: 0 }}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>

            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>
              {`${viewYear}.${String(viewMonth + 1).padStart(2, '0')}`}
            </Typography>

            <IconButton size="small" onClick={handleNextMonth} sx={{ p: 0 }}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        <Divider sx={{ mb: 1.5 }} />

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', mb: 0.5 }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
            <Typography
              key={day}
              variant="caption"
              sx={{
                fontSize: '0.65rem',
                fontWeight: 'bold',
                color: index === 0 ? '#ef4444' : index === 6 ? '#3b82f6' : '#64748b',
              }}
            >
              {day}
            </Typography>
          ))}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center' }}>
          {calendarCells.map((day, index) => {
            const dayIndex = index % 7;
            let isSelectedWeek = false;
            let isTodayHighlight = false;
            let dailyWorkers = 0;

            if (day) {
              const cellDate = new Date(viewYear, viewMonth, day);
              isTodayHighlight = cellDate.getTime() === todayMidnight.getTime();

              const startOfSelectedWeek = new Date(selectedWeekDate);
              startOfSelectedWeek.setDate(selectedWeekDate.getDate() - selectedWeekDate.getDay());

              const endOfSelectedWeek = new Date(startOfSelectedWeek);
              endOfSelectedWeek.setDate(startOfSelectedWeek.getDate() + 6);

              isSelectedWeek = cellDate >= startOfSelectedWeek && cellDate <= endOfSelectedWeek;

              const dateKey = formatYYMMDD(cellDate);
              dailyWorkers = savedData[dateKey]?.workers?.length || 0;
            }

            return (
              <Box
                key={`${viewYear}-${viewMonth}-${index}`}
                onClick={() => handleDayClick(day)}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  bgcolor: isSelectedWeek ? '#e0f2fe' : 'transparent',
                  py: 0.5,
                  cursor: day ? 'pointer' : 'default',
                  '&:hover': {
                    bgcolor: day && !isSelectedWeek ? '#f1f5f9' : isSelectedWeek ? '#bae6fd' : 'transparent',
                  },
                  borderTopLeftRadius: dayIndex === 0 ? '6px' : 0,
                  borderBottomLeftRadius: dayIndex === 0 ? '6px' : 0,
                  borderTopRightRadius: dayIndex === 6 ? '6px' : 0,
                  borderBottomRightRadius: dayIndex === 6 ? '6px' : 0,
                }}
              >
                {day && (
                  <>
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        bgcolor: isTodayHighlight ? '#ef4444' : 'transparent',
                        color: isTodayHighlight
                          ? 'white'
                          : dayIndex === 0
                            ? '#ef4444'
                            : dayIndex === 6
                              ? '#3b82f6'
                              : '#334155',
                        lineHeight: '20px',
                        fontSize: '0.7rem',
                        fontWeight: isTodayHighlight ? 'bold' : 'normal',
                      }}
                    >
                      {day}
                    </Box>

                    <Typography
                      variant="caption"
                      sx={{
                        color: dailyWorkers > 0 ? '#0ea5e9' : '#94a3b8',
                        fontSize: '0.6rem',
                        fontWeight: 'bold',
                        mt: 0.2,
                      }}
                    >
                      {dailyWorkers > 0 ? `${dailyWorkers}명` : ''}
                    </Typography>
                  </>
                )}
              </Box>
            );
          })}
        </Box>

        <Box
          sx={{
            mt: 'auto',
            display: 'grid',
            gridTemplateColumns:
              'repeat(2, minmax(0, 1fr))',
            gap: 0.65,
          }}
        >
          <Button
            variant="contained"
            color="success"
            size="small"
            fullWidth
            sx={{
              minHeight: 35,
              px: 0.45,
              py: 0.55,
              fontSize: '0.68rem',
              fontWeight: 900,
              lineHeight: 1.2,
              whiteSpace: 'normal',
            }}
            onClick={handleDownloadMonthlyExcel}
          >
            출력일보 금월 다운로드
          </Button>

          <HistoricalDailyReportUpload
            projectName={
              userProfile?.project_name || ''
            }
            companyName={
              userProfile?.company || ''
            }
            onUploadComplete={
              onHistoricalUploadComplete
            }
          />
        </Box>
      </Paper>

      {weekDays.map((day) => {
        const closedStatus = isClosed(day.date);

        return (
          <Paper
            key={day.date}
            sx={{
              p: 1.5,
              display: 'flex',
              flexDirection: 'column',
              borderTop: day.isToday ? '4px solid #ef4444' : '4px solid transparent',
              bgcolor: closedStatus ? '#f8fafc' : 'white',
              overflowY: 'auto',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography
                  variant="subtitle2"
                  fontWeight="bold"
                  sx={{ color: closedStatus ? '#64748b' : 'inherit' }}
                >
                  {day.date} ({day.dayName})
                </Typography>

                {closedStatus && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: '#ef4444',
                      fontWeight: 'bold',
                      bgcolor: '#fee2e2',
                      px: 0.5,
                      py: 0.1,
                      borderRadius: 1,
                    }}
                  >
                    마감됨
                  </Typography>
                )}
              </Box>

              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                {!closedStatus && (
                  <Button
                    onClick={() => handleOpenModal(day)}
                    variant="outlined"
                    size="small"
                    sx={{
                      minWidth: 0,
                      px: 1,
                      py: 0.2,
                      fontSize: '0.65rem',
                      color: '#0ea5e9',
                      borderColor: '#0ea5e9',
                      fontWeight: 'bold',
                    }}
                  >
                    근로자 추가/수정
                  </Button>
                )}

                <Button
                  onClick={() => handleDownloadExcel(day)}
                  variant="contained"
                  color="success"
                  size="small"
                  sx={{ minWidth: 0, px: 1, py: 0.2, fontSize: '0.7rem' }}
                >
                  XLS
                </Button>

                <Button
                  onClick={() => handleToggleDeadline(day.date)}
                  title={
                    closedStatus
                      ? canCancelDeadline
                        ? '최고관리자 마감 취소'
                        : '최고관리자만 마감 취소 가능'
                      : '일보 마감 처리'
                  }
                  variant="outlined"
                  size="small"
                  sx={{
                    minWidth: 0,
                    px: 1,
                    py: 0.2,
                    fontSize: '0.65rem',
                    fontWeight: 'bold',
                    color: closedStatus
                      ? canCancelDeadline
                        ? '#dc2626'
                        : '#64748b'
                      : '#64748b',
                    borderColor: closedStatus
                      ? canCancelDeadline
                        ? '#f87171'
                        : '#cbd5e1'
                      : '#cbd5e1',
                    bgcolor:
                      closedStatus && canCancelDeadline
                        ? '#fff7f7'
                        : 'transparent',
                    '&:hover': {
                      borderColor: closedStatus ? '#ef4444' : '#94a3b8',
                      bgcolor: closedStatus ? '#fef2f2' : '#f8fafc',
                    },
                  }}
                >
                  {closedStatus ? '마감 취소' : '마감 처리'}
                </Button>
              </Box>
            </Box>

            <Divider sx={{ mb: 1 }} />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography
                  variant="caption"
                  fontWeight="bold"
                  sx={{
                    color: 'white',
                    bgcolor: closedStatus ? '#94a3b8' : '#0f766e',
                    px: 0.5,
                    py: 0.2,
                    borderRadius: 1,
                  }}
                >
                  내장공사
                </Typography>

                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                  {userProfile?.company || '소속없음'} · {userProfile?.manager_name || '담당자없음'}
                </Typography>
              </Box>

              <Typography
                variant="caption"
                sx={{
                  bgcolor: closedStatus ? '#94a3b8' : '#334155',
                  color: 'white',
                  px: 0.5,
                  py: 0.2,
                  borderRadius: 1,
                  fontSize: '0.65rem',
                }}
              >
                출역일보
              </Typography>
            </Box>

            <Box sx={{ mb: 1.2 }}>
              <Typography
                variant="caption"
                fontWeight="bold"
                sx={{ color: closedStatus ? '#64748b' : '#0f766e' }}
              >
                투입 인원 (총원 {day.workers}명)
              </Typography>
            </Box>

            <Box
              sx={{
                flexGrow: 1,
                minHeight: 82,
                px: 1,
                py: 0.9,
                border: '1px solid #e2e8f0',
                borderRadius: 1,
                bgcolor: closedStatus ? '#f1f5f9' : '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.45,
              }}
            >
              {Object.entries(day.jobCounts || {})
                .filter(([, count]) => Number(count) > 0)
                .map(([job, count]) => (
                  <Typography
                    key={`${day.date}-${job}`}
                    variant="caption"
                    sx={{
                      color: closedStatus ? '#64748b' : '#334155',
                      fontSize: '0.73rem',
                      fontWeight: 700,
                    }}
                  >
                    {job}: {count}명
                  </Typography>
                ))}
            </Box>

            {!closedStatus && (
              <Box
                sx={{
                  mt: 'auto',
                  display: 'flex',
                  justifyContent: 'center',
                  pt: 1,
                }}
              >
                <Button
                  onClick={() => handleSetNoTask(day.date)}
                  variant="contained"
                  color="error"
                  size="small"
                  sx={{
                    fontSize: '0.7rem',
                    py: 0.3,
                    fontWeight: 'bold',
                  }}
                >
                  작업없음
                </Button>
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
}
