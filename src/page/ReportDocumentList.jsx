import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Fade,
  IconButton,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import {
  REPORT_STATUS_META,
  deleteProposalReportDocuments,
  fetchReportDocuments,
  toApprovalRequest,
} from '../utils/reportDocuments.js';
import ApprovalReportViewer, {
  downloadApprovalReportExcel,
} from './ApprovalReportViewer.jsx';

import SystemPageTitle from '../components/SystemPageTitle.jsx';
const DeleteOutlineIcon = ({ fontSize = 'medium', ...props }) => {
  const size = fontSize === 'small' ? 20 : 24;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      {...props}
    >
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm2-10h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4h-3.5z" />
    </svg>
  );
};
import { supabase } from '../supabaseClient';

const formatDate = (value) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const headerCellSx = {
  py: 1,
  px: 1,
  bgcolor: '#f8fafc',
  borderRight: '1px solid #e2e8f0',
  color: '#334155',
  fontSize: '0.72rem',
  fontWeight: 900,
  whiteSpace: 'nowrap',
};

const bodyCellSx = {
  py: 0.85,
  px: 1,
  borderRight: '1px solid #e2e8f0',
  color: '#475569',
  fontSize: '0.72rem',
};

export default function ReportDocumentList({
  reportType,
  reportName,
  projectName,
  onCreate,
  onEdit,
}) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [message, setMessage] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [downloadingId, setDownloadingId] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;

    const loadCurrentUser = async () => {
      const {
        data,
        error,
      } = await supabase.auth.getUser();

      if (error) {
        console.error('보고서 목록 사용자 확인 실패:', error);
        return;
      }

      const userId = data?.user?.id || '';

      if (!active) return;
      setCurrentUserId(userId);

      if (!userId) return;

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('auth_user_id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('보고서 목록 사용자 권한 확인 실패:', profileError);
        return;
      }

      if (active) {
        setCurrentUserRole(profile?.role || '');
      }
    };

    loadCurrentUser();

    return () => {
      active = false;
    };
  }, []);

  const loadDocuments = useCallback(async () => {
    if (!projectName) return;

    setLoading(true);
    setErrorMessage('');

    try {
      const rows = await fetchReportDocuments({ reportType, projectName });
      setDocuments(rows);
    } catch (error) {
      console.error(`${reportName} 목록 조회 실패:`, error);
      setErrorMessage(
        error?.message || `${reportName} 목록을 불러오지 못했습니다.`,
      );
    } finally {
      setLoading(false);
    }
  }, [projectName, reportName, reportType]);

  useEffect(() => {
    loadDocuments();

    const handleChanged = () => loadDocuments();
    const timer = window.setInterval(loadDocuments, 30 * 1000);

    window.addEventListener('focus', handleChanged);
    window.addEventListener('report-documents-changed', handleChanged);
    window.addEventListener('approval-workflow-changed', handleChanged);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleChanged);
      window.removeEventListener('report-documents-changed', handleChanged);
      window.removeEventListener('approval-workflow-changed', handleChanged);
    };
  }, [loadDocuments]);

  const isSuperAdmin = currentUserRole === '최고관리자';

  const canDeleteDocument = useCallback(
    (document) =>
      reportType === 'proposal' &&
      (
        isSuperAdmin ||
        (
          document?.author_user_id === currentUserId &&
          ['draft', 'rejected', 'cancelled'].includes(document?.status)
        )
      ),
    [currentUserId, isSuperAdmin, reportType],
  );

  const selectableDocuments = useMemo(
    () => documents.filter(canDeleteDocument),
    [canDeleteDocument, documents],
  );

  useEffect(() => {
    const selectableIds = new Set(
      selectableDocuments.map((document) => document.id),
    );

    setSelectedDocumentIds((previous) =>
      previous.filter((documentId) => selectableIds.has(documentId)),
    );
  }, [selectableDocuments]);

  const allSelectableChecked =
    selectableDocuments.length > 0 &&
    selectedDocumentIds.length === selectableDocuments.length;

  const someSelectableChecked =
    selectedDocumentIds.length > 0 &&
    !allSelectableChecked;

  const toggleAllSelectableDocuments = (checked) => {
    setSelectedDocumentIds(
      checked
        ? selectableDocuments.map((document) => document.id)
        : [],
    );
  };

  const toggleDocument = (documentId, checked) => {
    setSelectedDocumentIds((previous) =>
      checked
        ? Array.from(new Set([...previous, documentId]))
        : previous.filter((id) => id !== documentId),
    );
  };

  const previewRequest = useMemo(
    () =>
      previewDocument
        ? toApprovalRequest(
            previewDocument,
            previewDocument.approval_steps || [],
          )
        : null,
    [previewDocument],
  );

  const handleDownload = async (event, document) => {
    event.stopPropagation();
    setDownloadingId(document.id);
    setErrorMessage('');

    try {
      await downloadApprovalReportExcel(
        toApprovalRequest(document, document.approval_steps || []),
      );
    } catch (error) {
      console.error(`${reportName} 다운로드 실패:`, error);
      setErrorMessage(
        error?.message || `${reportName} 파일을 만들지 못했습니다.`,
      );
    } finally {
      setDownloadingId('');
    }
  };

  const handleDeleteDocuments = async (documentIds) => {
    const targetIds = Array.from(new Set(documentIds || [])).filter(
      (documentId) =>
        documents.some(
          (document) =>
            document.id === documentId &&
            canDeleteDocument(document),
        ),
    );

    if (targetIds.length === 0) {
      setErrorMessage('삭제할 수 있는 품의 보고를 선택해주세요.');
      return;
    }

    const confirmed = window.confirm(
      `선택한 품의 보고 ${targetIds.length.toLocaleString()}건을 삭제하시겠습니까?\n` +
        '삭제하면 목록과 연결된 결재 단계가 함께 삭제되며 복구할 수 없습니다.',
    );

    if (!confirmed) return;

    setDeleting(true);
    setErrorMessage('');
    setMessage(null);

    try {
      const result = await deleteProposalReportDocuments(targetIds);
      const deletedCount = Number(result?.deletedCount || 0);
      const skippedCount = Math.max(0, targetIds.length - deletedCount);

      if (
        previewDocument &&
        targetIds.includes(previewDocument.id)
      ) {
        setPreviewDocument(null);
      }

      setSelectedDocumentIds([]);
      setMessage({
        severity: skippedCount > 0 ? 'warning' : 'success',
        text:
          skippedCount > 0
            ? `품의 보고 ${deletedCount.toLocaleString()}건을 삭제했습니다. 권한 또는 문서 상태로 삭제하지 못한 ${skippedCount.toLocaleString()}건은 유지했습니다.`
            : `품의 보고 ${deletedCount.toLocaleString()}건을 삭제했습니다.`,
      });

      await loadDocuments();
    } catch (error) {
      console.error('품의 보고 목록 삭제 실패:', error);
      setErrorMessage(
        error?.message || '선택한 품의 보고를 삭제하지 못했습니다.',
      );
    } finally {
      setDeleting(false);
    }
  };

  const tableColumnCount = reportType === 'proposal' ? 7 : 6;

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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box>
            <SystemPageTitle
              title={reportName}
              help={
                reportType === 'weekly'
                  ? '주간 업무 보고 문서를 작성·저장하고 결재 진행상태와 작성 문서를 관리합니다.'
                  : '품의 보고 문서를 작성·저장하고 결재 요청·진행상태와 작성 문서를 관리합니다.'
              }
            />
            <Typography sx={{ mt: 0.2, color: '#64748b', fontSize: '0.7rem' }}>
              {projectName} · 작성 문서 {documents.length.toLocaleString()}건
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
            {reportType === 'proposal' && (
              <Tooltip
                title={
                  selectedDocumentIds.length > 0
                    ? `선택 품의 보고 ${selectedDocumentIds.length.toLocaleString()}건 삭제`
                    : '삭제할 품의 보고를 먼저 선택하세요'
                }
              >
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() =>
                      handleDeleteDocuments(selectedDocumentIds)
                    }
                    disabled={deleting || selectedDocumentIds.length === 0}
                    sx={{
                      border: '1px solid #fecaca',
                      borderRadius: 1,
                    }}
                  >
                    {deleting ? (
                      <CircularProgress size={17} color="inherit" />
                    ) : (
                      <DeleteOutlineIcon fontSize="small" />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            )}

            <Tooltip title="목록 새로고침">
              <IconButton
                size="small"
                onClick={loadDocuments}
                disabled={loading}
                sx={{ border: '1px solid #cbd5e1', borderRadius: 1 }}
              >
                {loading ? <CircularProgress size={17} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </Tooltip>

            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon />}
              onClick={onCreate}
              sx={{ minWidth: 92, fontWeight: 900 }}
            >
              작성
            </Button>
          </Box>
        </Box>
      </Paper>

      <Snackbar
        open={Boolean(errorMessage || message)}
        autoHideDuration={3000}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        TransitionComponent={Fade}
        transitionDuration={{ enter: 220, exit: 500 }}
        onClose={(_event, reason) => {
          if (reason === 'clickaway') return;
          setErrorMessage('');
          setMessage(null);
        }}
        sx={{
          top: '72px !important',
          zIndex: (theme) => theme.zIndex.snackbar + 10,
          '& .MuiAlert-root': {
            width: 'max-content',
            minWidth: { xs: 280, sm: 420 },
            maxWidth: 'min(920px, calc(100vw - 32px))',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.22)',
          },
          '& .MuiAlert-message': {
            whiteSpace: 'normal',
          },
        }}
      >
        <Alert
          severity={errorMessage ? 'error' : message?.severity || 'info'}
          variant="filled"
          onClose={() => {
            setErrorMessage('');
            setMessage(null);
          }}
        >
          {errorMessage || message?.text || ''}
        </Alert>
      </Snackbar>

      <Paper
        variant="outlined"
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflow: 'hidden',
          borderColor: '#cbd5e1',
          bgcolor: '#ffffff',
        }}
      >
        <TableContainer sx={{ height: '100%' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {reportType === 'proposal' && (
                  <TableCell
                    padding="checkbox"
                    sx={{ ...headerCellSx, width: 48 }}
                  >
                    <Checkbox
                      size="small"
                      checked={allSelectableChecked}
                      indeterminate={someSelectableChecked}
                      disabled={deleting || selectableDocuments.length === 0}
                      onChange={(event) =>
                        toggleAllSelectableDocuments(event.target.checked)
                      }
                      inputProps={{
                        'aria-label': '삭제 가능한 품의 보고 전체 선택',
                      }}
                    />
                  </TableCell>
                )}
                <TableCell sx={{ ...headerCellSx, width: '36%' }}>제목</TableCell>
                <TableCell align="center" sx={{ ...headerCellSx, width: 126 }}>작성된 날</TableCell>
                <TableCell align="center" sx={{ ...headerCellSx, width: 126 }}>결재요청한 날</TableCell>
                <TableCell align="center" sx={{ ...headerCellSx, width: 126 }}>결재완료된 날</TableCell>
                <TableCell align="center" sx={{ ...headerCellSx, width: 110 }}>상태</TableCell>
                <TableCell align="center" sx={{ ...headerCellSx, width: reportType === 'proposal' ? 164 : 128, borderRight: 'none' }}>
                  {reportType === 'proposal' ? '보기 / 다운로드 / 삭제' : '보기 / 다운로드'}
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {!loading && documents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={tableColumnCount} align="center" sx={{ py: 12, color: '#64748b', fontSize: '0.78rem' }}>
                    작성된 {reportName}가 없습니다. 우측 상단의 작성 버튼을 눌러 시작해주세요.
                  </TableCell>
                </TableRow>
              ) : (
                documents.map((document) => {
                  const status =
                    REPORT_STATUS_META[document.status] ||
                    REPORT_STATUS_META.pending;
                  const canEdit =
                    ['draft', 'rejected'].includes(document.status) &&
                    document.author_user_id === currentUserId;
                  const canDelete = canDeleteDocument(document);
                  const isSelected = selectedDocumentIds.includes(document.id);

                  return (
                    <TableRow
                      hover
                      key={document.id}
                      onClick={() => setPreviewDocument(document)}
                      sx={{ cursor: 'pointer' }}
                    >
                      {reportType === 'proposal' && (
                        <TableCell
                          padding="checkbox"
                          sx={bodyCellSx}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Checkbox
                            size="small"
                            checked={isSelected}
                            disabled={!canDelete || deleting}
                            onChange={(event) =>
                              toggleDocument(
                                document.id,
                                event.target.checked,
                              )
                            }
                            inputProps={{
                              'aria-label': `${document.title || '제목 없음'} 삭제 선택`,
                            }}
                          />
                        </TableCell>
                      )}
                      <TableCell sx={bodyCellSx}>
                        <Typography sx={{ color: '#1e293b', fontSize: '0.75rem', fontWeight: 900 }}>
                          {document.title || '제목 없음'}
                        </Typography>
                        <Typography sx={{ mt: 0.15, color: '#94a3b8', fontSize: '0.62rem' }}>
                          작성자: {document.author_name || '-'} {document.author_position || ''}
                        </Typography>
                      </TableCell>
                      <TableCell align="center" sx={bodyCellSx}>{formatDate(document.created_at)}</TableCell>
                      <TableCell align="center" sx={bodyCellSx}>{formatDate(document.submitted_at)}</TableCell>
                      <TableCell align="center" sx={bodyCellSx}>
                        {document.status === 'approved' ? formatDate(document.completed_at) : '-'}
                      </TableCell>
                      <TableCell align="center" sx={bodyCellSx}>
                        <Chip
                          size="small"
                          label={status.label}
                          sx={{ height: 22, color: status.color, bgcolor: status.bgcolor, fontSize: '0.62rem', fontWeight: 900 }}
                        />
                      </TableCell>
                      <TableCell align="center" sx={{ ...bodyCellSx, borderRight: 'none' }}>
                        {canEdit && (
                          <Tooltip title="계속 작성">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={(event) => {
                                event.stopPropagation();
                                onEdit?.(document);
                              }}
                            >
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="내용 보기">
                          <IconButton
                            size="small"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPreviewDocument(document);
                            }}
                          >
                            <VisibilityOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="XLS 다운로드">
                          <IconButton
                            size="small"
                            color="success"
                            onClick={(event) => handleDownload(event, document)}
                            disabled={downloadingId === document.id}
                          >
                            {downloadingId === document.id ? (
                              <CircularProgress size={16} />
                            ) : (
                              <DownloadIcon fontSize="small" />
                            )}
                          </IconButton>
                        </Tooltip>
                        {reportType === 'proposal' && canDelete && (
                          <Tooltip title="이 품의 보고 삭제">
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={deleting}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteDocuments([document.id]);
                                }}
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <ApprovalReportViewer
        open={Boolean(previewRequest)}
        request={previewRequest}
        onClose={() => setPreviewDocument(null)}
      />
    </Box>
  );
}
