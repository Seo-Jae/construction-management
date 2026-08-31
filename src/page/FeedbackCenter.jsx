// v52.48.5.44.86 제보 상태·답변 관리 및 처리완료 종결
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import { supabase } from '../supabaseClient';
import SystemPageTitle from '../components/SystemPageTitle.jsx';
import FeedbackSubmitDialog from '../components/FeedbackSubmitDialog.jsx';
import {
  FEEDBACK_BUCKET,
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  FEEDBACK_ADMIN_STATUSES,
  FEEDBACK_SELECT_COLUMNS,
  formatFeedbackDateTime,
  getFeedbackCategoryMeta,
  getFeedbackStatusMeta,
  isFeedbackCompleted,
  normalizeFeedbackStatus,
  resolveFeedbackAdminUpdate,
} from '../config/feedbackCatalog.js';

const allFilter = 'all';

const statCardSx = {
  minWidth: 118,
  px: 1.2,
  py: 0.85,
  border: '1px solid #e2e8f0',
  borderRadius: 1,
  bgcolor: '#fff',
};

export default function FeedbackCenter({
  userId = '',
  userProfile = {},
  dashboardScale = 1,
}) {
  const isSuperAdmin = String(userProfile?.role || '').trim() === '최고관리자';
  const resolvedUserId = String(userId || userProfile?.auth_user_id || '').trim();

  const [tab, setTab] = useState(isSuperAdmin ? 'all' : 'mine');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [attachmentUrls, setAttachmentUrls] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState(allFilter);
  const [statusFilter, setStatusFilter] = useState(allFilter);
  const [keyword, setKeyword] = useState('');
  const [adminDraft, setAdminDraft] = useState({
    status: 'received',
    admin_reply: '',
  });
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [message, setMessage] = useState(null);
  const [adminMessage, setAdminMessage] = useState(null);
  const selectedCompleted = isFeedbackCompleted(selected?.status);
  const columnCount = isSuperAdmin && tab === 'all' ? 7 : 6;

  const loadRows = useCallback(async () => {
    if (!resolvedUserId) return;

    setLoading(true);

    try {
      let query = supabase
        .from('system_feedback')
        .select(FEEDBACK_SELECT_COLUMNS)
        .order('created_at', { ascending: false });

      if (!isSuperAdmin || tab === 'mine') {
        query = query.eq('created_by', resolvedUserId);
      }

      const { data, error } = await query;
      if (error) throw error;

      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('건의·오류 목록 조회 실패:', error);
      setMessage({
        severity: 'error',
        text: error?.message || '제보 목록을 불러오지 못했습니다.',
      });
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, resolvedUserId, tab]);

  useEffect(() => {
    loadRows();

    const handleChanged = () => loadRows();
    window.addEventListener('system-feedback-changed', handleChanged);

    return () => {
      window.removeEventListener('system-feedback-changed', handleChanged);
    };
  }, [loadRows]);

  useEffect(() => {
    setAdminMessage(null);
    setAttachmentUrls([]);
    if (!selected) {
      return;
    }

    const attachments = Array.isArray(selected.attachments)
      ? selected.attachments
      : [];

    let active = true;

    Promise.all(
      attachments.map(async (file) => {
        const { data, error } = await supabase
          .storage
          .from(FEEDBACK_BUCKET)
          .createSignedUrl(file.path, 60 * 30);

        return {
          ...file,
          url: error ? '' : String(data?.signedUrl || ''),
        };
      }),
    ).then((items) => {
      if (active) setAttachmentUrls(items);
    });

    setAdminDraft({
      status: normalizeFeedbackStatus(selected.status) || 'received',
      admin_reply: selected.admin_reply || '',
    });

    return () => {
      active = false;
    };
  }, [selected]);

  const filteredRows = useMemo(() => {
    const normalizedKeyword = String(keyword || '').trim().toLowerCase();

    return rows.filter((row) => {
      if (categoryFilter !== allFilter && row.category !== categoryFilter) {
        return false;
      }

      if (statusFilter !== allFilter && normalizeFeedbackStatus(row.status) !== statusFilter) {
        return false;
      }

      if (!normalizedKeyword) return true;

      return [
        row.title,
        row.content,
        row.project_name,
        row.created_by_name,
        row.source_label,
        row.admin_reply,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedKeyword));
    });
  }, [categoryFilter, keyword, rows, statusFilter]);

  const stats = useMemo(() => {
    const result = {
      total: rows.length,
      received: 0,
      reviewing: 0,
      planned: 0,
      completed: 0,
      rejected: 0,
    };

    rows.forEach((row) => {
      const status = normalizeFeedbackStatus(row.status);
      if (Object.prototype.hasOwnProperty.call(result, status)) {
        result[status] += 1;
      }
    });

    return result;
  }, [rows]);

  const saveAdmin = async () => {
    if (!isSuperAdmin || !selected || savingAdmin) return;

    let treatment;
    try {
      treatment = resolveFeedbackAdminUpdate(selected.status, adminDraft);
    } catch (error) {
      setAdminMessage({ severity: 'warning', text: error.message });
      return;
    }

    setSavingAdmin(true);
    setAdminMessage(null);

    try {
      const now = new Date().toISOString();

      const updatePayload = {
        ...treatment,
        handled_by: resolvedUserId || null,
        handled_by_name: String(userProfile?.manager_name || '').trim(),
        handled_at: now,
        updated_at: now,
      };

      const { data, error } = await supabase
        .from('system_feedback')
        .update(updatePayload)
        .eq('id', selected.id)
        .eq('status', selected.status)
        .eq('updated_at', selected.updated_at)
        .select(FEEDBACK_SELECT_COLUMNS)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        await loadRows();
        throw new Error('다른 관리자가 먼저 처리했거나 자료가 변경되었습니다. 창을 닫고 해당 제보를 다시 열어 확인해주세요.');
      }

      setRows((prev) => prev.map((row) => row.id === data.id ? data : row));
      setMessage({
        severity: 'success',
        text: '처리 내용을 저장했습니다.',
      });

      window.dispatchEvent(new CustomEvent('system-feedback-changed'));
      // 저장 결과는 목록 토스트에서 확인하고, 다시 열면 최종 상태로 표시합니다.
      setSelected(null);
    } catch (error) {
      console.error('건의·오류 처리 저장 실패:', error);
      setAdminMessage({
        severity: 'error',
        text: error?.message || '처리 내용을 저장하지 못했습니다.',
      });
    } finally {
      setSavingAdmin(false);
    }
  };

  const pageTitle = isSuperAdmin ? '건의·오류 관리' : '건의·오류 제보';

  return (
    <Box sx={{ p: 1.5 }}>
      <Paper
        variant="outlined"
        sx={{
          p: 1.35,
          borderColor: '#cbd5e1',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          alignItems={{ xs: 'stretch', md: 'center' }}
          justifyContent="space-between"
          gap={1}
        >
          <SystemPageTitle
            title={pageTitle}
            meta={isSuperAdmin
              ? '전 현장의 건의사항·오류 제보를 확인하고 처리상태와 답변을 관리합니다.'
              : '내가 등록한 건의사항·오류 제보와 처리상태를 확인합니다.'}
            help={'사용 중 발견한 오류나 기능개선 의견을 등록할 수 있습니다.\n현재 메뉴·현장·브라우저 환경은 제보 시 자동 기록됩니다.'}
          />

          <Stack direction="row" gap={0.65} justifyContent="flex-end">
            <Tooltip title="새로고침" arrow>
              <span>
                <IconButton
                  size="small"
                  onClick={loadRows}
                  disabled={loading}
                  sx={{ border: '1px solid #cbd5e1', borderRadius: 1 }}
                >
                  <RefreshRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>

            <Button
              variant="contained"
              size="small"
              startIcon={<AddRoundedIcon />}
              onClick={() => setCreateOpen(true)}
              sx={{ fontWeight: 900 }}
            >
              새 제보
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {message && (
        <Alert
          severity={message.severity}
          onClose={() => setMessage(null)}
          sx={{ mt: 1 }}
        >
          {message.text}
        </Alert>
      )}

      {isSuperAdmin && (
        <Paper variant="outlined" sx={{ mt: 1, px: 1, borderColor: '#cbd5e1' }}>
          <Tabs
            value={tab}
            onChange={(_, value) => setTab(value)}
            sx={{
              minHeight: 38,
              '& .MuiTab-root': { minHeight: 38, py: 0.4, fontSize: '0.73rem', fontWeight: 800 },
            }}
          >
            <Tab value="all" label="전체 제보 관리" />
            <Tab value="mine" label="내 제보" />
          </Tabs>
        </Paper>
      )}

      <Stack direction="row" gap={0.8} flexWrap="wrap" sx={{ mt: 1 }}>
        <Box sx={statCardSx}>
          <Typography sx={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 800 }}>전체</Typography>
          <Typography sx={{ mt: 0.15, fontSize: '1.05rem', fontWeight: 950 }}>{stats.total}건</Typography>
        </Box>

        {FEEDBACK_STATUSES.map((item) => (
          <Box key={item.value} sx={statCardSx}>
            <Typography sx={{ color: item.color, fontSize: '0.65rem', fontWeight: 850 }}>
              {item.label}
            </Typography>
            <Typography sx={{ mt: 0.15, fontSize: '1.05rem', fontWeight: 950 }}>
              {stats[item.value] || 0}건
            </Typography>
          </Box>
        ))}
      </Stack>

      <Paper
        variant="outlined"
        sx={{
          mt: 1,
          borderColor: '#cbd5e1',
          overflow: 'hidden',
        }}
      >
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          gap={0.7}
          sx={{ p: 0.9, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}
        >
          <TextField
            select
            size="small"
            label="구분"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            sx={{ minWidth: 135 }}
          >
            <MenuItem value={allFilter}>전체</MenuItem>
            {FEEDBACK_CATEGORIES.map((item) => (
              <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="상태"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            sx={{ minWidth: 135 }}
          >
            <MenuItem value={allFilter}>전체</MenuItem>
            {FEEDBACK_STATUSES.map((item) => (
              <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
            ))}
          </TextField>

          <TextField
            size="small"
            placeholder="제목·내용·현장·메뉴 검색"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            sx={{ minWidth: 260, flex: 1 }}
          />
        </Stack>

        <TableContainer sx={{ maxHeight: 'calc(100vh - 365px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 900, width: 125 }}>접수일</TableCell>
                <TableCell sx={{ fontWeight: 900, width: 95 }}>구분</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>제목</TableCell>
                <TableCell sx={{ fontWeight: 900, width: 150 }}>현장</TableCell>
                {isSuperAdmin && tab === 'all' && (
                  <TableCell sx={{ fontWeight: 900, width: 115 }}>작성자</TableCell>
                )}
                <TableCell sx={{ fontWeight: 900, width: 150 }}>발생 메뉴</TableCell>
                <TableCell sx={{ fontWeight: 900, width: 100 }} align="center">상태</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={columnCount} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              )}

              {!loading && filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columnCount} align="center" sx={{ py: 6, color: '#94a3b8' }}>
                    등록된 제보가 없습니다.
                  </TableCell>
                </TableRow>
              )}

              {!loading && filteredRows.map((row) => {
                const category = getFeedbackCategoryMeta(row.category);
                const status = getFeedbackStatusMeta(row.status);

                return (
                  <TableRow
                    hover
                    key={row.id}
                    onClick={() => setSelected(row)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ fontSize: '0.69rem' }}>
                      {formatFeedbackDateTime(row.created_at)}
                    </TableCell>

                    <TableCell>
                      <Chip
                        size="small"
                        label={category.label}
                        sx={{
                          height: 21,
                          color: category.color,
                          bgcolor: category.bgcolor,
                          fontSize: '0.62rem',
                          fontWeight: 900,
                        }}
                      />
                    </TableCell>

                    <TableCell>
                      <Typography
                        sx={{
                          maxWidth: 520,
                          fontSize: '0.74rem',
                          fontWeight: 850,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.title}
                      </Typography>
                    </TableCell>

                    <TableCell sx={{ fontSize: '0.69rem' }}>
                      {row.project_name || '-'}
                    </TableCell>

                    {isSuperAdmin && tab === 'all' && (
                      <TableCell sx={{ fontSize: '0.69rem' }}>
                        {row.created_by_name || '-'}
                      </TableCell>
                    )}

                    <TableCell sx={{ fontSize: '0.69rem' }}>
                      {row.source_label || row.source_view || '-'}
                    </TableCell>

                    <TableCell align="center">
                      <Chip
                        size="small"
                        label={status.label}
                        sx={{
                          height: 21,
                          color: status.color,
                          bgcolor: status.bgcolor,
                          fontSize: '0.62rem',
                          fontWeight: 900,
                        }}
                      />
                    </TableCell>

                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <FeedbackSubmitDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmitted={() => loadRows()}
        userId={resolvedUserId}
        userProfile={userProfile}
        sourceView="feedback"
        sourceLabel="건의·오류 제보"
        dashboardScale={dashboardScale}
      />

      <Dialog
        open={Boolean(selected)}
        onClose={savingAdmin ? undefined : () => setSelected(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" alignItems="center" gap={0.7} flexWrap="wrap">
            {selected && (
              <>
                <Chip
                  size="small"
                  label={getFeedbackCategoryMeta(selected.category).label}
                  sx={{
                    color: getFeedbackCategoryMeta(selected.category).color,
                    bgcolor: getFeedbackCategoryMeta(selected.category).bgcolor,
                    fontWeight: 900,
                  }}
                />
                <Typography sx={{ fontSize: '0.98rem', fontWeight: 950 }}>
                  {selected.title}
                </Typography>
              </>
            )}
          </Stack>
        </DialogTitle>

        <DialogContent dividers>
          {selected && (
            <Stack spacing={1.4}>
              {adminMessage && (
                <Alert severity={adminMessage.severity}>{adminMessage.text}</Alert>
              )}
              {selectedCompleted && (
                <Alert severity="success">
                  처리완료로 종결된 제보입니다. 같은 문제가 다시 발생하면 새 제보로 등록해주세요.
                </Alert>
              )}
              <Stack direction="row" gap={1} flexWrap="wrap">
                <Typography sx={{ color: '#64748b', fontSize: '0.69rem' }}>
                  작성자: <b>{selected.created_by_name || '-'}</b>
                </Typography>
                <Typography sx={{ color: '#64748b', fontSize: '0.69rem' }}>
                  현장: <b>{selected.project_name || '-'}</b>
                </Typography>
                <Typography sx={{ color: '#64748b', fontSize: '0.69rem' }}>
                  메뉴: <b>{selected.source_label || '-'}</b>
                </Typography>
                <Typography sx={{ color: '#64748b', fontSize: '0.69rem' }}>
                  접수: <b>{formatFeedbackDateTime(selected.created_at)}</b>
                </Typography>
              </Stack>

              <Box
                sx={{
                  p: 1.3,
                  minHeight: 100,
                  border: '1px solid #e2e8f0',
                  borderRadius: 1,
                  bgcolor: '#f8fafc',
                }}
              >
                <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: '0.78rem', lineHeight: 1.7 }}>
                  {selected.content}
                </Typography>
              </Box>

              {attachmentUrls.length > 0 && (
                <Box>
                  <Typography sx={{ mb: 0.55, fontSize: '0.7rem', fontWeight: 900 }}>
                    첨부파일
                  </Typography>
                  <Stack direction="row" gap={0.55} flexWrap="wrap">
                    {attachmentUrls.map((file, index) => (
                      <Button
                        key={`${file.path}-${index}`}
                        size="small"
                        variant="outlined"
                        startIcon={<AttachFileRoundedIcon />}
                        endIcon={file.url ? <OpenInNewRoundedIcon /> : undefined}
                        onClick={() => {
                          if (file.url) window.open(file.url, '_blank', 'noopener,noreferrer');
                        }}
                        disabled={!file.url}
                        sx={{ textTransform: 'none' }}
                      >
                        {file.name || `첨부 ${index + 1}`}
                      </Button>
                    ))}
                  </Stack>
                </Box>
              )}

              <Divider />

              {isSuperAdmin && !selectedCompleted ? (
                <Stack spacing={1}>
                  <Typography sx={{ fontSize: '0.76rem', fontWeight: 950 }}>
                    관리자 처리
                  </Typography>

                  <Stack direction={{ xs: 'column', sm: 'row' }} gap={0.8}>
                    <TextField
                      select
                      size="small"
                      label="처리상태"
                      disabled={savingAdmin}
                      value={adminDraft.status}
                      onChange={(event) => setAdminDraft((prev) => ({
                        ...prev,
                        status: event.target.value,
                      }))}
                      sx={{ minWidth: 150 }}
                    >
                      {adminDraft.status === 'received' && (
                        <MenuItem value="received" disabled>접수</MenuItem>
                      )}
                      {FEEDBACK_ADMIN_STATUSES.map((item) => (
                        <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                      ))}
                    </TextField>

                  </Stack>

                  {adminDraft.status === 'received' && (
                    <Typography sx={{ color: '#64748b', fontSize: '0.69rem' }}>
                      접수 상태에서 답변을 저장하면 자동으로 확인중으로 변경됩니다.
                    </Typography>
                  )}
                  {adminDraft.status === 'completed' && (
                    <Alert severity="info">저장하면 이 제보가 종결되며 처리상태와 답변을 다시 수정할 수 없습니다.</Alert>
                  )}

                  <TextField
                    multiline
                    minRows={4}
                    label="관리자 답변 / 처리내용"
                    disabled={savingAdmin}
                    value={adminDraft.admin_reply}
                    onChange={(event) => setAdminDraft((prev) => ({
                      ...prev,
                      admin_reply: event.target.value,
                    }))}
                  />
                </Stack>
              ) : (
                <Box>
                  <Stack direction="row" alignItems="center" gap={0.7}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 900 }}>
                      처리상태
                    </Typography>
                    <Chip
                      size="small"
                      label={getFeedbackStatusMeta(selected.status).label}
                      sx={{
                        color: getFeedbackStatusMeta(selected.status).color,
                        bgcolor: getFeedbackStatusMeta(selected.status).bgcolor,
                        fontWeight: 900,
                      }}
                    />
                  </Stack>

                  <Box
                    sx={{
                      mt: 1,
                      p: 1.2,
                      border: '1px solid #dbeafe',
                      borderRadius: 1,
                      bgcolor: '#eff6ff',
                    }}
                  >
                    <Typography sx={{ color: '#1e3a8a', fontSize: '0.69rem', fontWeight: 900 }}>
                      관리자 답변
                    </Typography>
                    <Typography sx={{ mt: 0.45, color: '#334155', fontSize: '0.76rem', whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
                      {selected.admin_reply || '아직 등록된 답변이 없습니다.'}
                    </Typography>

                  </Box>
                </Box>
              )}

              <Box
                sx={{
                  p: 1,
                  border: '1px solid #e2e8f0',
                  borderRadius: 1,
                  bgcolor: '#fff',
                }}
              >
                <Typography sx={{ color: '#94a3b8', fontSize: '0.63rem', fontWeight: 800 }}>
                  자동 기록 환경
                </Typography>
                <Typography sx={{ mt: 0.25, color: '#64748b', fontSize: '0.65rem', wordBreak: 'break-all' }}>
                  화면배율 {selected.client_meta?.dashboardScale ?? '-'} ·
                  뷰포트 {selected.client_meta?.viewport || '-'} ·
                  {selected.client_meta?.userAgent || '-'}
                </Typography>
              </Box>
            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button disabled={savingAdmin} onClick={() => setSelected(null)}>닫기</Button>
          {isSuperAdmin && !selectedCompleted && (
            <Button
              variant="contained"
              startIcon={<SaveRoundedIcon />}
              onClick={saveAdmin}
              disabled={savingAdmin}
              sx={{ fontWeight: 900 }}
            >
              처리내용 저장
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
