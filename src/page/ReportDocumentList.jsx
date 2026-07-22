import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
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
  fetchReportDocuments,
  toApprovalRequest,
} from '../utils/reportDocuments.js';
import ApprovalReportViewer, {
  downloadApprovalReportExcel,
} from './ApprovalReportViewer.jsx';
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
  const [previewDocument, setPreviewDocument] = useState(null);
  const [downloadingId, setDownloadingId] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data?.user?.id || '');
    });
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
            <Typography sx={{ color: '#1e293b', fontSize: '0.98rem', fontWeight: 900 }}>
              {reportName}
            </Typography>
            <Typography sx={{ mt: 0.2, color: '#64748b', fontSize: '0.7rem' }}>
              {projectName} · 작성 문서 {documents.length.toLocaleString()}건
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
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

      {errorMessage && (
        <Alert severity="error" sx={{ fontSize: '0.72rem' }}>
          {errorMessage}
        </Alert>
      )}

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
                <TableCell sx={{ ...headerCellSx, width: '36%' }}>제목</TableCell>
                <TableCell align="center" sx={{ ...headerCellSx, width: 126 }}>작성된 날</TableCell>
                <TableCell align="center" sx={{ ...headerCellSx, width: 126 }}>결재요청한 날</TableCell>
                <TableCell align="center" sx={{ ...headerCellSx, width: 126 }}>결재완료된 날</TableCell>
                <TableCell align="center" sx={{ ...headerCellSx, width: 110 }}>상태</TableCell>
                <TableCell align="center" sx={{ ...headerCellSx, width: 128, borderRight: 'none' }}>보기 / 다운로드</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {!loading && documents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 12, color: '#64748b', fontSize: '0.78rem' }}>
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

                  return (
                    <TableRow
                      hover
                      key={document.id}
                      onClick={() => setPreviewDocument(document)}
                      sx={{ cursor: 'pointer' }}
                    >
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
