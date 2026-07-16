import React, { useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ApprovalReportViewer from './ApprovalReportViewer.jsx';

const JOB_ORDER = [
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

const calculateWorkerCount = (worker) =>
  (Number(worker?.day) || 0) +
  (Number(worker?.night) || 0);

const getWorkerSummary = (workers) => {
  const summary = new Map();

  (Array.isArray(workers) ? workers : []).forEach(
    (worker) => {
      const job =
        String(worker?.job || '').trim() || '기타';

      summary.set(
        job,
        (summary.get(job) || 0) +
          calculateWorkerCount(worker),
      );
    },
  );

  const orderedJobs = [
    ...JOB_ORDER,
    ...Array.from(summary.keys()).filter(
      (job) => !JOB_ORDER.includes(job),
    ),
  ];

  return orderedJobs
    .filter((job) => summary.has(job))
    .map((job) => ({
      job,
      count: summary.get(job) || 0,
    }));
};

const workerSortIndex = (job) => {
  const index = JOB_ORDER.indexOf(job);

  return index === -1
    ? JOB_ORDER.length
    : index;
};

function DailyReportPreviewDialog({
  open,
  onClose,
  projectName,
  dateKey,
  report,
}) {
  const workers = useMemo(
    () =>
      [...(Array.isArray(report?.workers)
        ? report.workers
        : [])].sort((a, b) => {
        const jobCompare =
          workerSortIndex(a?.job) -
          workerSortIndex(b?.job);

        if (jobCompare !== 0) {
          return jobCompare;
        }

        return String(a?.name || '').localeCompare(
          String(b?.name || ''),
          'ko',
        );
      }),
    [report],
  );

  const tasks = Array.isArray(report?.tasks)
    ? report.tasks
    : [];

  const summary = useMemo(
    () => getWorkerSummary(workers),
    [workers],
  );

  const totalWorkers = workers.reduce(
    (total, worker) =>
      total + calculateWorkerCount(worker),
    0,
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xl"
      PaperProps={{
        sx: {
          height: '92vh',
          bgcolor: '#f1f5f9',
        },
      }}
    >
      <DialogTitle
        sx={{
          py: 1.15,
          bgcolor: '#ffffff',
          color: '#0f172a',
          fontSize: '0.96rem',
          fontWeight: 900,
        }}
      >
        오늘 공사일보 미리보기
      </DialogTitle>

      <Divider />

      <DialogContent
        sx={{
          p: 1.5,
          overflow: 'auto',
          bgcolor: '#e2e8f0',
        }}
      >
        {!report ? (
          <Alert severity="warning">
            {projectName}의 {dateKey} 공사일보가 등록되지
            않았습니다.
          </Alert>
        ) : (
          <Paper
            variant="outlined"
            sx={{
              width: 980,
              minHeight: 900,
              mx: 'auto',
              p: 1.6,
              borderColor: '#94a3b8',
              bgcolor: '#ffffff',
              boxShadow:
                '0 8px 28px rgba(15, 23, 42, 0.12)',
            }}
          >
            <Typography
              sx={{
                textAlign: 'center',
                fontSize: '1.75rem',
                fontWeight: 900,
                letterSpacing: '0.28em',
              }}
            >
              출 력 일 보
            </Typography>

            <Box
              sx={{
                mt: 1.4,
                display: 'grid',
                gridTemplateColumns: '105px 1fr',
                borderTop: '1px solid #334155',
                borderLeft: '1px solid #334155',
              }}
            >
              {[
                ['현장명', projectName],
                ['업체명', '(주)욱림건설'],
                ['일자', dateKey],
                ['총원', `${totalWorkers.toLocaleString()}명`],
              ].map(([label, value]) => (
                <React.Fragment key={label}>
                  <Box
                    sx={{
                      p: 0.7,
                      borderRight:
                        '1px solid #334155',
                      borderBottom:
                        '1px solid #334155',
                      bgcolor: '#f1f5f9',
                      fontSize: '0.72rem',
                      fontWeight: 900,
                      textAlign: 'center',
                    }}
                  >
                    {label}
                  </Box>
                  <Box
                    sx={{
                      p: 0.7,
                      borderRight:
                        '1px solid #334155',
                      borderBottom:
                        '1px solid #334155',
                      fontSize: '0.72rem',
                    }}
                  >
                    {value}
                  </Box>
                </React.Fragment>
              ))}
            </Box>

            <Typography
              sx={{
                mt: 1.5,
                mb: 0.6,
                color: '#1e293b',
                fontSize: '0.8rem',
                fontWeight: 900,
              }}
            >
              인원 출력현황
            </Typography>

            {summary.length === 0 ? (
              <Alert severity="info">
                등록된 근로자가 없습니다.
              </Alert>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(5, minmax(0, 1fr))',
                  borderTop:
                    '1px solid #64748b',
                  borderLeft:
                    '1px solid #64748b',
                }}
              >
                {summary.map((row) => (
                  <Box
                    key={row.job}
                    sx={{
                      minHeight: 52,
                      px: 0.8,
                      py: 0.6,
                      borderRight:
                        '1px solid #64748b',
                      borderBottom:
                        '1px solid #64748b',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography
                      sx={{
                        color: '#475569',
                        fontSize: '0.66rem',
                        fontWeight: 700,
                      }}
                    >
                      {row.job}
                    </Typography>
                    <Typography
                      sx={{
                        mt: 0.2,
                        color: '#0f172a',
                        fontSize: '0.86rem',
                        fontWeight: 900,
                      }}
                    >
                      {row.count.toLocaleString()}명
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}

            <Typography
              sx={{
                mt: 1.5,
                mb: 0.6,
                color: '#1e293b',
                fontSize: '0.8rem',
                fontWeight: 900,
              }}
            >
              금일 출력 및 작업현황
            </Typography>

            <TableContainer
              sx={{
                border: '1px solid #64748b',
              }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {[
                      'No.',
                      '구분',
                      '성명',
                      '공정',
                      '위치',
                      '작업내용',
                      '주간',
                      '야간',
                    ].map((label) => (
                      <TableCell
                        key={label}
                        align="center"
                        sx={{
                          py: 0.6,
                          px: 0.65,
                          bgcolor: '#e2e8f0',
                          borderRight:
                            '1px solid #94a3b8',
                          fontSize: '0.66rem',
                          fontWeight: 900,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {workers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        align="center"
                        sx={{
                          py: 4,
                          color: '#94a3b8',
                          fontSize: '0.72rem',
                        }}
                      >
                        등록된 근로자가 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    workers.map((worker, index) => (
                      <TableRow
                        key={
                          worker?.id ||
                          `${worker?.name}-${index}`
                        }
                      >
                        <TableCell
                          align="center"
                          sx={{ fontSize: '0.65rem' }}
                        >
                          {index + 1}
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{ fontSize: '0.65rem' }}
                        >
                          {worker?.job || ''}
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{ fontSize: '0.65rem' }}
                        >
                          {worker?.name || ''}
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{ fontSize: '0.65rem' }}
                        >
                          {worker?.process || ''}
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{ fontSize: '0.65rem' }}
                        >
                          {worker?.location || ''}
                        </TableCell>
                        <TableCell
                          sx={{
                            fontSize: '0.65rem',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {worker?.workContent ||
                            worker?.work_content ||
                            ''}
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{ fontSize: '0.65rem' }}
                        >
                          {Number(worker?.day) || ''}
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{ fontSize: '0.65rem' }}
                        >
                          {Number(worker?.night) || ''}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {tasks.length > 0 && (
              <>
                <Typography
                  sx={{
                    mt: 1.5,
                    mb: 0.6,
                    color: '#1e293b',
                    fontSize: '0.8rem',
                    fontWeight: 900,
                  }}
                >
                  작업내역
                </Typography>

                <Box
                  sx={{
                    borderTop:
                      '1px solid #64748b',
                    borderLeft:
                      '1px solid #64748b',
                  }}
                >
                  {tasks.map((task, index) => (
                    <Box
                      key={
                        task?.id ||
                        `${task?.taskName}-${index}`
                      }
                      sx={{
                        display: 'grid',
                        gridTemplateColumns:
                          '60px 1fr 120px',
                      }}
                    >
                      <Box
                        sx={{
                          p: 0.65,
                          borderRight:
                            '1px solid #64748b',
                          borderBottom:
                            '1px solid #64748b',
                          textAlign: 'center',
                          fontSize: '0.66rem',
                        }}
                      >
                        {index + 1}
                      </Box>
                      <Box
                        sx={{
                          p: 0.65,
                          borderRight:
                            '1px solid #64748b',
                          borderBottom:
                            '1px solid #64748b',
                          fontSize: '0.66rem',
                        }}
                      >
                        {task?.taskName ||
                          task?.task_name ||
                          ''}
                      </Box>
                      <Box
                        sx={{
                          p: 0.65,
                          borderRight:
                            '1px solid #64748b',
                          borderBottom:
                            '1px solid #64748b',
                          textAlign: 'center',
                          fontSize: '0.66rem',
                        }}
                      >
                        {task?.amount || ''}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </Paper>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: 1.5,
          py: 1,
          bgcolor: '#ffffff',
          borderTop: '1px solid #cbd5e1',
        }}
      >
        <Button
          size="small"
          variant="outlined"
          onClick={onClose}
        >
          닫기
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function AdminDashboardReportPreview({
  open,
  type,
  projectName,
  dateKey,
  report,
  onClose,
}) {
  if (type === 'weekly') {
    if (!report) {
      return (
        <Dialog
          open={open}
          onClose={onClose}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle
            sx={{
              fontSize: '0.94rem',
              fontWeight: 900,
            }}
          >
            주간 업무 보고 미리보기
          </DialogTitle>
          <DialogContent dividers>
            <Alert severity="warning">
              {projectName}의 이번 주 주간 업무 보고가
              등록되지 않았습니다.
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button
              size="small"
              variant="outlined"
              onClick={onClose}
            >
              닫기
            </Button>
          </DialogActions>
        </Dialog>
      );
    }

    const weeklyRequest = {
      id: report.id,
      report_type: 'weekly',
      report_title: `주간 업무 보고 ${
        report.display_period ||
        report?.payload?.period?.display ||
        ''
      }`,
      report_key: `weekly:${report.week_start}`,
      project_name:
        report.project_name || projectName,
      requester_name:
        report.author_name ||
        report?.payload?.managerName ||
        '',
      payload: report.payload || {},
      status: 'approved',
      approval_steps: [],
    };

    return (
      <ApprovalReportViewer
        open={open}
        request={weeklyRequest}
        onClose={onClose}
      />
    );
  }

  return (
    <DailyReportPreviewDialog
      open={open}
      onClose={onClose}
      projectName={projectName}
      dateKey={dateKey}
      report={report}
    />
  );
}
