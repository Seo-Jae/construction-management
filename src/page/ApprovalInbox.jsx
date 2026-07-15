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
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import { supabase } from '../supabaseClient';

const REQUEST_STATUS = {
  pending: {
    label: '결재 진행중',
    color: '#0369a1',
    bgcolor: '#e0f2fe',
  },
  approved: {
    label: '최종 승인',
    color: '#15803d',
    bgcolor: '#dcfce7',
  },
  rejected: {
    label: '반려',
    color: '#b91c1c',
    bgcolor: '#fee2e2',
  },
  cancelled: {
    label: '취소',
    color: '#64748b',
    bgcolor: '#e2e8f0',
  },
};

const STEP_STATUS = {
  waiting: {
    label: '대기',
    color: '#64748b',
    bgcolor: '#f1f5f9',
  },
  pending: {
    label: '결재 대기',
    color: '#9a3412',
    bgcolor: '#ffedd5',
  },
  approved: {
    label: '승인',
    color: '#15803d',
    bgcolor: '#dcfce7',
  },
  rejected: {
    label: '반려',
    color: '#b91c1c',
    bgcolor: '#fee2e2',
  },
  cancelled: {
    label: '종료',
    color: '#64748b',
    bgcolor: '#e2e8f0',
  },
};

const REPORT_TYPE_LABEL = {
  weekly: '주간 업무 보고',
  proposal: '품의 보고',
};

const formatDateTime = (value) => {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const extractWeeklyLines = (payload) => {
  const form = payload?.form || {};
  const labels = [
    ['공무사항', 'publicCurrent'],
    ['공정사항', 'progressCurrent'],
    ['회의내용', 'meetingCurrent'],
    ['지시사항', 'directiveCurrent'],
    ['자재 반입계획', 'materialCurrent'],
    ['특이사항', 'specialCurrent'],
  ];

  return labels
    .map(([label, key]) => ({
      label,
      values: Array.isArray(form[key])
        ? form[key].filter((value) =>
            String(value || '').trim(),
          )
        : [],
    }))
    .filter((section) => section.values.length > 0);
};

function ReportSnapshot({ request }) {
  const payload = request?.payload || {};

  if (request?.report_type === 'weekly') {
    const sections = extractWeeklyLines(payload);

    return (
      <Box
        sx={{
          mt: 1,
          p: 1.1,
          borderRadius: 1.2,
          border: '1px solid #e2e8f0',
          bgcolor: '#f8fafc',
        }}
      >
        <Typography
          sx={{
            color: '#334155',
            fontSize: '0.7rem',
            fontWeight: 900,
          }}
        >
          보고기간
        </Typography>
        <Typography
          sx={{
            mt: 0.2,
            color: '#475569',
            fontSize: '0.7rem',
          }}
        >
          {payload?.period?.display || request?.report_key || '-'}
        </Typography>

        {sections.length === 0 ? (
          <Typography
            sx={{
              mt: 0.8,
              color: '#94a3b8',
              fontSize: '0.68rem',
            }}
          >
            직접 입력된 보고내용이 없습니다.
          </Typography>
        ) : (
          sections.map((section) => (
            <Box key={section.label} sx={{ mt: 0.8 }}>
              <Typography
                sx={{
                  color: '#334155',
                  fontSize: '0.68rem',
                  fontWeight: 900,
                }}
              >
                {section.label}
              </Typography>
              {section.values.map((value, index) => (
                <Typography
                  key={`${section.label}-${index}`}
                  sx={{
                    mt: 0.15,
                    pl: 0.7,
                    color: '#64748b',
                    fontSize: '0.67rem',
                  }}
                >
                  • {value}
                </Typography>
              ))}
            </Box>
          ))
        )}
      </Box>
    );
  }

  if (request?.report_type === 'proposal') {
    const lines = Array.isArray(payload?.reportLines)
      ? payload.reportLines.filter((line) =>
          String(line || '').trim(),
        )
      : [];

    return (
      <Box
        sx={{
          mt: 1,
          p: 1.1,
          borderRadius: 1.2,
          border: '1px solid #e2e8f0',
          bgcolor: '#f8fafc',
        }}
      >
        <Typography
          sx={{
            color: '#334155',
            fontSize: '0.7rem',
            fontWeight: 900,
          }}
        >
          제목
        </Typography>
        <Typography
          sx={{
            mt: 0.2,
            color: '#475569',
            fontSize: '0.7rem',
          }}
        >
          {payload?.title || '-'}
        </Typography>

        <Typography
          sx={{
            mt: 0.8,
            color: '#334155',
            fontSize: '0.7rem',
            fontWeight: 900,
          }}
        >
          보고내용
        </Typography>
        {lines.length > 0 ? (
          lines.map((line, index) => (
            <Typography
              key={`proposal-${index}`}
              sx={{
                mt: 0.15,
                pl: 0.7,
                color: '#64748b',
                fontSize: '0.67rem',
              }}
            >
              • {line}
            </Typography>
          ))
        ) : (
          <Typography
            sx={{
              mt: 0.2,
              color: '#94a3b8',
              fontSize: '0.68rem',
            }}
          >
            입력된 보고내용이 없습니다.
          </Typography>
        )}

        {(payload?.itemName || payload?.amount) && (
          <Typography
            sx={{
              mt: 0.8,
              color: '#475569',
              fontSize: '0.68rem',
            }}
          >
            품목: {payload?.itemName || '-'} / 금액:{' '}
            {payload?.amount
              ? Number(payload.amount).toLocaleString()
              : '-'}
            원
          </Typography>
        )}
      </Box>
    );
  }

  return null;
}

export default function ApprovalInbox() {
  const [userEmail, setUserEmail] = useState('');
  const [items, setItems] = useState([]);
  const [stepsByRequest, setStepsByRequest] = useState({});
  const [comments, setComments] = useState({});
  const [expandedRequestId, setExpandedRequestId] =
    useState('');
  const [loading, setLoading] = useState(false);
  const [actingRequestId, setActingRequestId] =
    useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const requestedId = useMemo(
    () =>
      new URLSearchParams(window.location.search).get(
        'request',
      ) || '',
    [],
  );

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      const email = String(user?.email || '').toLowerCase();

      if (!email) {
        throw new Error(
          '로그인 계정의 이메일을 확인하지 못했습니다.',
        );
      }

      setUserEmail(email);

      const { data, error } = await supabase
        .from('approval_steps')
        .select(
          `
          id,
          request_id,
          step_order,
          approver_name,
          approver_position,
          approver_email,
          status,
          acted_at,
          comment,
          created_at,
          approval_requests!inner(
            id,
            report_type,
            report_title,
            report_key,
            project_name,
            requester_name,
            requester_email,
            payload,
            status,
            current_step_order,
            current_approver_email,
            created_at,
            completed_at
          )
        `,
        )
        .eq('approver_email', email)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const rows = data || [];
      setItems(rows);

      const requestIds = Array.from(
        new Set(rows.map((row) => row.request_id)),
      );

      if (requestIds.length === 0) {
        setStepsByRequest({});
        return;
      }

      const { data: allSteps, error: stepsError } =
        await supabase
          .from('approval_steps')
          .select(
            `
            id,
            request_id,
            step_order,
            approver_name,
            approver_position,
            approver_email,
            status,
            acted_at,
            comment
          `,
          )
          .in('request_id', requestIds)
          .order('step_order', { ascending: true });

      if (stepsError) {
        throw stepsError;
      }

      const grouped = {};

      (allSteps || []).forEach((step) => {
        if (!grouped[step.request_id]) {
          grouped[step.request_id] = [];
        }
        grouped[step.request_id].push(step);
      });

      setStepsByRequest(grouped);

      if (
        requestedId &&
        rows.some((row) => row.request_id === requestedId)
      ) {
        setExpandedRequestId(requestedId);
      }
    } catch (error) {
      console.error('결재함 조회 실패:', error);
      setErrorMessage(
        error?.message || '결재함을 불러오지 못했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }, [requestedId]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const handleAction = async (requestId, decision) => {
    const actionName =
      decision === 'approve' ? '승인' : '반려';

    if (
      !window.confirm(
        `해당 보고서를 ${actionName} 처리하시겠습니까?`,
      )
    ) {
      return;
    }

    setActingRequestId(requestId);
    setErrorMessage('');

    try {
      const { data, error } = await supabase.functions.invoke(
        'approval-workflow',
        {
          body: {
            action: 'act',
            requestId,
            decision,
            comment: comments[requestId] || '',
          },
        },
      );

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const emailMessage = data?.emailSent
        ? '다음 대상에게 이메일이 발송되었습니다.'
        : data?.emailWarning
          ? `\n이메일 안내: ${data.emailWarning}`
          : '';

      window.alert(
        `${actionName} 처리가 완료되었습니다.${emailMessage}`,
      );

      await loadInbox();
    } catch (error) {
      console.error('결재 처리 실패:', error);
      setErrorMessage(
        error?.message || '결재 처리를 완료하지 못했습니다.',
      );
    } finally {
      setActingRequestId('');
    }
  };

  const pendingCount = items.filter(
    (item) =>
      item.status === 'pending' &&
      item.approval_requests?.status === 'pending',
  ).length;

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
          bgcolor: '#ffffff',
          boxShadow: 'none',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Box>
            <Typography
              sx={{
                color: '#1e293b',
                fontSize: '0.98rem',
                fontWeight: 900,
              }}
            >
              결재함
            </Typography>
            <Typography
              sx={{
                mt: 0.2,
                color: '#64748b',
                fontSize: '0.7rem',
              }}
            >
              {userEmail || '-'} · 현재 결재 대기{' '}
              {pendingCount.toLocaleString()}건
            </Typography>
          </Box>

          <Tooltip title="결재함 새로고침">
            <IconButton
              size="small"
              onClick={loadInbox}
              disabled={loading}
              sx={{
                border: '1px solid #cbd5e1',
                borderRadius: 1,
              }}
            >
              {loading ? (
                <CircularProgress size={17} />
              ) : (
                <RefreshIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      </Paper>

      {errorMessage && (
        <Alert severity="error" sx={{ fontSize: '0.72rem' }}>
          {errorMessage}
        </Alert>
      )}

      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflowY: 'auto',
          pr: 0.3,
        }}
      >
        {!loading && items.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{
              minHeight: 240,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderColor: '#cbd5e1',
              color: '#64748b',
              fontSize: '0.78rem',
            }}
          >
            해당 이메일로 요청된 결재가 없습니다.
          </Paper>
        ) : (
          items.map((item) => {
            const request = item.approval_requests;
            const requestStatus =
              REQUEST_STATUS[request?.status] ||
              REQUEST_STATUS.pending;
            const stepStatus =
              STEP_STATUS[item.status] ||
              STEP_STATUS.waiting;
            const isPending =
              item.status === 'pending' &&
              request?.status === 'pending';
            const isExpanded =
              expandedRequestId === item.request_id;
            const allSteps =
              stepsByRequest[item.request_id] || [];

            return (
              <Paper
                key={item.id}
                variant="outlined"
                sx={{
                  mb: 1,
                  p: 1.4,
                  borderColor: isPending
                    ? '#fdba74'
                    : '#cbd5e1',
                  bgcolor: '#ffffff',
                  boxShadow: isPending
                    ? '0 4px 14px rgba(234, 88, 12, 0.08)'
                    : 'none',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 1,
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 0.5,
                      }}
                    >
                      <Chip
                        label={
                          REPORT_TYPE_LABEL[
                            request?.report_type
                          ] || request?.report_type
                        }
                        size="small"
                        sx={{
                          height: 20,
                          color: '#1d4ed8',
                          bgcolor: '#dbeafe',
                          fontSize: '0.6rem',
                          fontWeight: 900,
                        }}
                      />
                      <Chip
                        label={stepStatus.label}
                        size="small"
                        sx={{
                          height: 20,
                          color: stepStatus.color,
                          bgcolor: stepStatus.bgcolor,
                          fontSize: '0.6rem',
                          fontWeight: 900,
                        }}
                      />
                      <Chip
                        label={requestStatus.label}
                        size="small"
                        sx={{
                          height: 20,
                          color: requestStatus.color,
                          bgcolor: requestStatus.bgcolor,
                          fontSize: '0.6rem',
                          fontWeight: 900,
                        }}
                      />
                    </Box>

                    <Typography
                      sx={{
                        mt: 0.65,
                        color: '#0f172a',
                        fontSize: '0.82rem',
                        fontWeight: 900,
                      }}
                    >
                      {request?.report_title}
                    </Typography>

                    <Typography
                      sx={{
                        mt: 0.25,
                        color: '#64748b',
                        fontSize: '0.68rem',
                      }}
                    >
                      현장: {request?.project_name || '-'} ·
                      요청자: {request?.requester_name || '-'} ·
                      요청일: {formatDateTime(request?.created_at)}
                    </Typography>
                  </Box>

                  <Button
                    size="small"
                    variant="text"
                    endIcon={
                      isExpanded ? (
                        <ExpandLessIcon />
                      ) : (
                        <ExpandMoreIcon />
                      )
                    }
                    onClick={() =>
                      setExpandedRequestId(
                        isExpanded ? '' : item.request_id,
                      )
                    }
                    sx={{
                      flexShrink: 0,
                      minWidth: 0,
                      fontSize: '0.68rem',
                    }}
                  >
                    내용 보기
                  </Button>
                </Box>

                <Collapse in={isExpanded}>
                  <ReportSnapshot request={request} />

                  <Divider sx={{ my: 1 }} />

                  <Typography
                    sx={{
                      color: '#334155',
                      fontSize: '0.7rem',
                      fontWeight: 900,
                    }}
                  >
                    결재 진행순서
                  </Typography>

                  <Box
                    sx={{
                      mt: 0.65,
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 0.5,
                    }}
                  >
                    {allSteps.map((step, index) => {
                      const status =
                        STEP_STATUS[step.status] ||
                        STEP_STATUS.waiting;

                      return (
                        <React.Fragment key={step.id}>
                          <Box
                            sx={{
                              px: 0.8,
                              py: 0.55,
                              borderRadius: 1,
                              border: '1px solid #e2e8f0',
                              bgcolor: status.bgcolor,
                            }}
                          >
                            <Typography
                              sx={{
                                color: status.color,
                                fontSize: '0.64rem',
                                fontWeight: 900,
                              }}
                            >
                              {step.step_order}.{' '}
                              {step.approver_name}{' '}
                              {step.approver_position}
                            </Typography>
                            <Typography
                              sx={{
                                mt: 0.1,
                                color: '#64748b',
                                fontSize: '0.58rem',
                              }}
                            >
                              {status.label}
                              {step.acted_at
                                ? ` · ${formatDateTime(
                                    step.acted_at,
                                  )}`
                                : ''}
                            </Typography>
                          </Box>

                          {index < allSteps.length - 1 && (
                            <Typography
                              sx={{
                                color: '#94a3b8',
                                fontSize: '0.7rem',
                              }}
                            >
                              →
                            </Typography>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </Box>

                  {isPending && (
                    <Box
                      sx={{
                        mt: 1.1,
                        display: 'grid',
                        gridTemplateColumns:
                          'minmax(220px, 1fr) auto auto',
                        alignItems: 'center',
                        gap: 0.7,
                      }}
                    >
                      <TextField
                        size="small"
                        label="결재 의견"
                        placeholder="선택 입력"
                        value={comments[item.request_id] || ''}
                        onChange={(event) =>
                          setComments((previous) => ({
                            ...previous,
                            [item.request_id]:
                              event.target.value,
                          }))
                        }
                        sx={{
                          '& .MuiInputBase-root': {
                            minHeight: 34,
                            fontSize: '0.72rem',
                          },
                          '& .MuiInputLabel-root': {
                            fontSize: '0.72rem',
                          },
                        }}
                      />

                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<CloseOutlinedIcon />}
                        onClick={() =>
                          handleAction(
                            item.request_id,
                            'reject',
                          )
                        }
                        disabled={
                          actingRequestId === item.request_id
                        }
                      >
                        반려
                      </Button>

                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        startIcon={
                          actingRequestId ===
                          item.request_id ? (
                            <CircularProgress
                              size={14}
                              color="inherit"
                            />
                          ) : (
                            <CheckCircleOutlineIcon />
                          )
                        }
                        onClick={() =>
                          handleAction(
                            item.request_id,
                            'approve',
                          )
                        }
                        disabled={
                          actingRequestId === item.request_id
                        }
                      >
                        결재 승인
                      </Button>
                    </Box>
                  )}
                </Collapse>
              </Paper>
            );
          })
        )}
      </Box>
    </Box>
  );
}
