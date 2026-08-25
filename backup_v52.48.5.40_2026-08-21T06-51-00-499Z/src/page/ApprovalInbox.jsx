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
  MenuItem,
  Paper,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import { supabase } from '../supabaseClient';
import { invokeApprovalFunction } from '../utils/approvalFunction.js';
import {
  deleteApprovalDocumentAsSuperAdmin,
  fetchApprovalInboxData,
} from '../utils/approvalQueries.js';
import ApprovalReportViewer, {
  downloadApprovalReportExcel,
} from './ApprovalReportViewer.jsx';

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
    label: '앞 단계 승인 대기',
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

const REQUESTER_ITEM_STATUS = {
  pending: {
    label: '승인 진행중',
    color: '#0369a1',
    bgcolor: '#e0f2fe',
  },
  approved: {
    label: '승인 완료',
    color: '#15803d',
    bgcolor: '#dcfce7',
  },
  rejected: {
    label: '반려됨',
    color: '#b91c1c',
    bgcolor: '#fee2e2',
  },
  cancelled: {
    label: '취소됨',
    color: '#64748b',
    bgcolor: '#e2e8f0',
  },
};

const REPORT_TYPE_LABEL = {
  weekly: '주간 업무 보고',
  proposal: '품의 보고',
};

const INBOX_FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'approval-waiting', label: '결재대기' },
  { value: 'approval-requested', label: '결재요청' },
  { value: 'approval-completed', label: '결재완료' },
  { value: 'rejected', label: '반려' },
];

const RECENT_DAY_OPTIONS = [
  { value: 7, label: '최근 7일' },
  { value: 14, label: '최근 14일' },
  { value: 21, label: '최근 21일' },
  { value: 0, label: '전체기간' },
];

const getInboxItemFilter = (item) => {
  const request = item?.approval_requests;

  if (
    item?.item_kind === 'approver' &&
    item?.status === 'pending' &&
    request?.status === 'pending'
  ) {
    return 'approval-waiting';
  }

  if (
    item?.item_kind === 'requester' &&
    request?.status === 'pending'
  ) {
    return 'approval-requested';
  }

  if (
    (item?.item_kind === 'approver' &&
      item?.status === 'approved') ||
    (item?.item_kind === 'requester' &&
      request?.status === 'approved')
  ) {
    return 'approval-completed';
  }

  if (
    item?.status === 'rejected' ||
    request?.status === 'rejected'
  ) {
    return 'rejected';
  }

  return 'other';
};

const getInboxItemDate = (item) => {
  const request = item?.approval_requests || {};
  const candidates =
    request.status === 'approved'
      ? [
          request.completed_at,
          item?.acted_at,
          request.updated_at,
          request.submitted_at,
          request.created_at,
        ]
      : [
          item?.acted_at,
          request.updated_at,
          request.submitted_at,
          request.created_at,
          item?.created_at,
        ];

  const value = candidates.find(Boolean);
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const getEdgeFunctionErrorMessage = async (error) => {
  const fallback =
    error?.message || 'Edge Function 호출에 실패했습니다.';

  const response = error?.context;

  if (!response) {
    return fallback;
  }

  try {
    const readableResponse =
      typeof response.clone === 'function'
        ? response.clone()
        : response;

    const contentType =
      readableResponse.headers?.get?.('content-type') || '';

    let payload;

    if (contentType.includes('application/json')) {
      payload = await readableResponse.json();
    } else {
      const text = await readableResponse.text();
      payload = text ? { error: text } : {};
    }

    const mainMessage =
      payload?.error ||
      payload?.message ||
      payload?.details ||
      fallback;

    const extras = [
      payload?.stage ? `단계: ${payload.stage}` : '',
      payload?.code ? `코드: ${payload.code}` : '',
      payload?.hint ? `안내: ${payload.hint}` : '',
    ].filter(Boolean);

    return extras.length > 0
      ? `${mainMessage}\n${extras.join('\n')}`
      : mainMessage;
  } catch (parseError) {
    console.error(
      'Edge Function 오류 본문 해석 실패:',
      parseError,
    );
    return fallback;
  }
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
  const [userLabel, setUserLabel] = useState('');
  const [userRole, setUserRole] = useState('');
  const [items, setItems] = useState([]);
  const [stepsByRequest, setStepsByRequest] = useState({});
  const [comments, setComments] = useState({});
  const [expandedRequestId, setExpandedRequestId] =
    useState('');
  const [loading, setLoading] = useState(false);
  const [actingRequestId, setActingRequestId] =
    useState('');
  const [previewRequest, setPreviewRequest] =
    useState(null);
  const [downloadingRequestId, setDownloadingRequestId] =
    useState('');
  const [deletingRequestId, setDeletingRequestId] =
    useState('');
  const [viewFilter, setViewFilter] = useState('all');
  const [recentDays, setRecentDays] = useState(7);
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
      const result = await fetchApprovalInboxData();

      setUserLabel(result.displayName || '사용자');
      setUserRole(result.role || '');
      setItems(result.items);
      setStepsByRequest(result.stepsByRequest);

      if (
        requestedId &&
        result.items.some(
          (row) => row.request_id === requestedId,
        )
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

    const timer = window.setInterval(
      loadInbox,
      20 * 1000,
    );

    const handleFocus = () => {
      loadInbox();
    };

    const handleApprovalChanged = () => {
      loadInbox();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener(
      'approval-workflow-changed',
      handleApprovalChanged,
    );

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener(
        'approval-workflow-changed',
        handleApprovalChanged,
      );
    };
  }, [loadInbox]);

  const handleDownloadReport = async (request) => {
    if (!request?.id) {
      return;
    }

    setDownloadingRequestId(request.id);
    setErrorMessage('');

    try {
      await downloadApprovalReportExcel(request);
    } catch (error) {
      console.error(
        '결재 보고서 XLS 다운로드 실패:',
        error,
      );
      setErrorMessage(
        error?.message ||
          '보고서 파일을 다운로드하지 못했습니다.',
      );
    } finally {
      setDownloadingRequestId('');
    }
  };

  const handleDeleteDocument = async (request) => {
    if (userRole !== '최고관리자' || !request?.id) return;

    if (
      !window.confirm(
        `[${request.report_title || '제목 없음'}]\n\n이 결재 내역을 삭제하시겠습니까?\n삭제하면 결재 단계와 의견도 함께 삭제되며 복구할 수 없습니다.`,
      )
    ) {
      return;
    }

    setDeletingRequestId(request.id);
    setErrorMessage('');

    try {
      await deleteApprovalDocumentAsSuperAdmin(request.id);

      if (previewRequest?.id === request.id) {
        setPreviewRequest(null);
      }

      setExpandedRequestId((current) =>
        current === request.id ? '' : current,
      );

      window.dispatchEvent(
        new Event('approval-workflow-changed'),
      );
      window.dispatchEvent(
        new Event('report-documents-changed'),
      );

      await loadInbox();
    } catch (error) {
      console.error('결재 내역 삭제 실패:', error);
      setErrorMessage(
        error?.message || '결재 내역을 삭제하지 못했습니다.',
      );
    } finally {
      setDeletingRequestId('');
    }
  };

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
      const { data, error } =
        await invokeApprovalFunction({
          action: 'act',
          requestId,
          decision,
          comment: comments[requestId] || '',
        });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      window.alert(`${actionName} 처리가 완료되었습니다.`);

      window.dispatchEvent(
        new Event('approval-workflow-changed'),
      );

      await loadInbox();
    } catch (error) {
      console.error('결재 처리 실패:', error);
      const detailedMessage =
        await getEdgeFunctionErrorMessage(error);
      setErrorMessage(detailedMessage);
    } finally {
      setActingRequestId('');
    }
  };

  const pendingCount = items.filter(
    (item) =>
      item.item_kind === 'approver' &&
      item.status === 'pending' &&
      item.approval_requests?.status === 'pending',
  ).length;

  const requesterResultCount = items.filter(
    (item) =>
      item.item_kind === 'requester' &&
      ['approved', 'rejected'].includes(
        item.approval_requests?.status,
      ),
  ).length;

  const recentItems = useMemo(() => {
    if (recentDays === 0) return items;

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (recentDays - 1));

    return items.filter((item) => {
      const itemDate = getInboxItemDate(item);
      return itemDate ? itemDate >= startDate : false;
    });
  }, [items, recentDays]);

  const filterCounts = useMemo(
    () =>
      recentItems.reduce(
        (counts, item) => {
          counts.all += 1;
          const filter = getInboxItemFilter(item);
          if (
            Object.prototype.hasOwnProperty.call(counts, filter)
          ) {
            counts[filter] += 1;
          }
          return counts;
        },
        {
          all: 0,
          'approval-waiting': 0,
          'approval-requested': 0,
          'approval-completed': 0,
          rejected: 0,
        },
      ),
    [recentItems],
  );

  const visibleItems = useMemo(
    () =>
      viewFilter === 'all'
        ? recentItems
        : recentItems.filter(
            (item) => getInboxItemFilter(item) === viewFilter,
          ),
    [recentItems, viewFilter],
  );

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
              {userLabel || '-'} · 지금 처리할 결재{' '}
              {pendingCount.toLocaleString()}건 · 처리 결과{' '}
              {requesterResultCount.toLocaleString()}건
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

        <Box
          sx={{
            mt: 1,
            pt: 1,
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 0.8,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 0.45,
            }}
          >
            {INBOX_FILTERS.map((filter) => (
              <Button
                key={filter.value}
                size="small"
                variant={
                  viewFilter === filter.value
                    ? 'contained'
                    : 'outlined'
                }
                onClick={() => setViewFilter(filter.value)}
                sx={{
                  minWidth: 76,
                  px: 1,
                  py: 0.35,
                  boxShadow: 'none',
                  fontSize: '0.68rem',
                  fontWeight: 900,
                }}
              >
                {filter.label} {filterCounts[filter.value] || 0}
              </Button>
            ))}
          </Box>

          <Select
            size="small"
            value={recentDays}
            onChange={(event) =>
              setRecentDays(Number(event.target.value))
            }
            sx={{
              minWidth: 112,
              height: 31,
              bgcolor: '#ffffff',
              fontSize: '0.7rem',
              fontWeight: 800,
            }}
          >
            {RECENT_DAY_OPTIONS.map((option) => (
              <MenuItem
                key={option.value}
                value={option.value}
                sx={{ fontSize: '0.76rem' }}
              >
                {option.label}
              </MenuItem>
            ))}
          </Select>
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
        {!loading && visibleItems.length === 0 ? (
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
            선택한 조건에 해당하는 결재 내역이 없습니다.
          </Paper>
        ) : (
          visibleItems.map((item) => {
            const request = item.approval_requests;
            const isRequesterItem =
              item.item_kind === 'requester';
            const requestStatus =
              REQUEST_STATUS[request?.status] ||
              REQUEST_STATUS.pending;
            const stepStatus = isRequesterItem
              ? REQUESTER_ITEM_STATUS[request?.status] ||
                REQUESTER_ITEM_STATUS.pending
              : STEP_STATUS[item.status] ||
                STEP_STATUS.waiting;
            const isPending =
              !isRequesterItem &&
              item.status === 'pending' &&
              request?.status === 'pending';
            const isExpanded =
              expandedRequestId === item.request_id;
            const allSteps =
              stepsByRequest[item.request_id] || [];
            const rejectedStep = allSteps.find(
              (step) => step.status === 'rejected',
            );
            const currentPendingStep = allSteps.find(
              (step) => step.status === 'pending',
            );
            const incompleteSteps = allSteps.filter(
              (step) =>
                step.status === 'pending' ||
                step.status === 'waiting',
            );

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
                        label={
                          isRequesterItem
                            ? '내가 요청한 보고'
                            : '내 결재 항목'
                        }
                        size="small"
                        sx={{
                          height: 20,
                          color: isRequesterItem
                            ? '#6d28d9'
                            : '#0f766e',
                          bgcolor: isRequesterItem
                            ? '#ede9fe'
                            : '#ccfbf1',
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

                    {request?.status === 'pending' && (
                      <Typography
                        sx={{
                          mt: 0.28,
                          color: '#475569',
                          fontSize: '0.66rem',
                          lineHeight: 1.5,
                        }}
                      >
                        현재 결재자:{' '}
                        <Box
                          component="span"
                          sx={{
                            color: '#c2410c',
                            fontWeight: 900,
                          }}
                        >
                          {currentPendingStep
                            ? `${currentPendingStep.approver_name} ${currentPendingStep.approver_position}`
                            : '-'}
                        </Box>
                        {' · '}
                        미결재:{' '}
                        {incompleteSteps.length > 0
                          ? incompleteSteps
                              .map(
                                (step) =>
                                  `${step.approver_name} ${step.approver_position}`,
                              )
                              .join(' → ')
                          : '-'}
                      </Typography>
                    )}
                  </Box>

                  <Box
                    sx={{
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.45,
                    }}
                  >
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() =>
                        setPreviewRequest({
                          ...request,
                          approval_steps: allSteps,
                        })
                      }
                      disabled={
                        !['weekly', 'proposal'].includes(
                          request?.report_type,
                        )
                      }
                      sx={{
                        minWidth: 68,
                        px: 0.8,
                        whiteSpace: 'nowrap',
                        fontSize: '0.66rem',
                        fontWeight: 800,
                      }}
                    >
                      미리보기
                    </Button>

                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      onClick={() =>
                        handleDownloadReport({
                          ...request,
                          approval_steps: allSteps,
                        })
                      }
                      disabled={
                        downloadingRequestId === request?.id ||
                        !['weekly', 'proposal'].includes(
                          request?.report_type,
                        )
                      }
                      sx={{
                        minWidth: 48,
                        px: 0.8,
                        whiteSpace: 'nowrap',
                        fontSize: '0.66rem',
                        fontWeight: 900,
                      }}
                    >
                      {downloadingRequestId === request?.id
                        ? '생성 중'
                        : 'XLS'}
                    </Button>

                    {userRole === '최고관리자' && (
                      <Tooltip title="최고관리자 결재 내역 삭제">
                        <span>
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            onClick={() =>
                              handleDeleteDocument(request)
                            }
                            disabled={
                              deletingRequestId === request?.id
                            }
                            sx={{
                              height: 29,
                              minWidth: 42,
                              px: 0.8,
                              border: '1px solid #fecaca',
                              borderRadius: 1,
                              fontSize: '0.66rem',
                              fontWeight: 900,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {deletingRequestId === request?.id ? (
                              <CircularProgress
                                size={14}
                                color="inherit"
                              />
                            ) : (
                              '삭제'
                            )}
                          </Button>
                        </span>
                      </Tooltip>
                    )}

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
                          isExpanded
                            ? ''
                            : item.request_id,
                        )
                      }
                      sx={{
                        minWidth: 0,
                        px: 0.6,
                        whiteSpace: 'nowrap',
                        fontSize: '0.66rem',
                      }}
                    >
                      결재내역
                    </Button>
                  </Box>
                </Box>

                <Collapse in={isExpanded}>
                  <ReportSnapshot request={request} />

                  {isRequesterItem &&
                    request?.status === 'rejected' && (
                      <Alert
                        severity="error"
                        sx={{
                          mt: 1,
                          fontSize: '0.7rem',
                          '& .MuiAlert-message': {
                            width: '100%',
                          },
                        }}
                      >
                        <Typography
                          sx={{
                            color: '#991b1b',
                            fontSize: '0.72rem',
                            fontWeight: 900,
                          }}
                        >
                          반려자:{' '}
                          {rejectedStep
                            ? `${rejectedStep.approver_name} ${rejectedStep.approver_position}`
                            : '-'}
                        </Typography>
                        <Typography
                          sx={{
                            mt: 0.35,
                            color: '#7f1d1d',
                            fontSize: '0.7rem',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          반려내용:{' '}
                          {String(
                            rejectedStep?.comment || '',
                          ).trim() ||
                            '반려내용이 입력되지 않았습니다.'}
                        </Typography>
                      </Alert>
                    )}

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

                            {String(
                              step.comment || '',
                            ).trim() && (
                              <Typography
                                sx={{
                                  mt: 0.25,
                                  maxWidth: 220,
                                  color:
                                    step.status === 'rejected'
                                      ? '#991b1b'
                                      : '#475569',
                                  fontSize: '0.58rem',
                                  lineHeight: 1.4,
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                }}
                              >
                                의견: {step.comment}
                              </Typography>
                            )}
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
                        onClick={() =>
                          handleAction(
                            item.request_id,
                            'reject',
                          )
                        }
                        disabled={
                          actingRequestId === item.request_id
                        }
                        sx={{
                          minWidth: 58,
                          whiteSpace: 'nowrap',
                          fontWeight: 800,
                        }}
                      >
                        반려
                      </Button>

                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        onClick={() =>
                          handleAction(
                            item.request_id,
                            'approve',
                          )
                        }
                        disabled={
                          actingRequestId === item.request_id
                        }
                        sx={{
                          minWidth: 82,
                          whiteSpace: 'nowrap',
                          fontWeight: 800,
                        }}
                      >
                        {actingRequestId === item.request_id ? (
                          <CircularProgress
                            size={14}
                            color="inherit"
                          />
                        ) : (
                          '결재 승인'
                        )}
                      </Button>
                    </Box>
                  )}
                </Collapse>
              </Paper>
            );
          })
        )}
      </Box>

      <ApprovalReportViewer
        open={Boolean(previewRequest)}
        request={previewRequest}
        onClose={() => setPreviewRequest(null)}
      />
    </Box>
  );
}
