import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { supabase } from '../supabaseClient';

const headerCellSx = {
  py: 0.8,
  px: 0.8,
  bgcolor: '#f8fafc',
  borderRight: '1px solid #e2e8f0',
  color: '#334155',
  fontSize: '0.72rem',
  fontWeight: 900,
  whiteSpace: 'nowrap',
};

const bodyCellSx = {
  py: 0.75,
  px: 0.8,
  borderRight: '1px solid #e2e8f0',
  fontSize: '0.72rem',
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

export default function ApprovalRequestDialog({
  open,
  onClose,
  reportType,
  reportTitle,
  reportKey,
  projectName,
  requesterName,
  payload,
  onSubmitted,
}) {
  const [approvers, setApprovers] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!open) return;

    const loadApprovers = async () => {
      setLoading(true);
      setErrorMessage('');

      try {
        const { data, error } = await supabase
          .from('approval_approvers')
          .select(
            'id, full_name, position, email, approval_order',
          )
          .eq('active', true)
          .order('approval_order', { ascending: true });

        if (error) {
          throw error;
        }

        const rows = data || [];
        setApprovers(rows);
        setSelectedIds(
          new Set(rows.map((approver) => approver.id)),
        );
      } catch (error) {
        console.error('결재자 명단 조회 실패:', error);
        setErrorMessage(
          error?.message ||
            '결재자 명단을 불러오지 못했습니다.',
        );
      } finally {
        setLoading(false);
      }
    };

    loadApprovers();
  }, [open]);

  const allSelected =
    approvers.length > 0 &&
    approvers.every((approver) =>
      selectedIds.has(approver.id),
    );

  const partiallySelected =
    selectedIds.size > 0 && !allSelected;

  const selectedApprovers = useMemo(
    () =>
      approvers.filter((approver) =>
        selectedIds.has(approver.id),
      ),
    [approvers, selectedIds],
  );

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(
      new Set(approvers.map((approver) => approver.id)),
    );
  };

  const toggleApprover = (approverId) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);

      if (next.has(approverId)) {
        next.delete(approverId);
      } else {
        next.add(approverId);
      }

      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedApprovers.length === 0) {
      setErrorMessage('결재자를 한 명 이상 선택해주세요.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      const { data, error } = await supabase.functions.invoke(
        'approval-workflow',
        {
          body: {
            action: 'create',
            reportType,
            reportTitle,
            reportKey,
            projectName,
            requesterName,
            payload,
            approverIds: selectedApprovers.map(
              (approver) => approver.id,
            ),
          },
        },
      );

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const firstApprover = data?.firstApproverName || '';
      const emailMessage = data?.emailSent
        ? `${firstApprover} 결재자에게 이메일을 발송했습니다.`
        : `결재요청은 저장됐지만 이메일은 발송되지 않았습니다.${
            data?.emailWarning
              ? `\n${data.emailWarning}`
              : ''
          }`;

      window.alert(
        `결재요청이 등록되었습니다.\n${emailMessage}`,
      );

      onSubmitted?.(data);
      onClose?.();
    } catch (error) {
      console.error('결재요청 등록 실패:', error);
      const detailedMessage =
        await getEdgeFunctionErrorMessage(error);
      setErrorMessage(detailedMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle
        sx={{
          pb: 1,
          color: '#1e293b',
          fontSize: '1rem',
          fontWeight: 900,
        }}
      >
        결재요청
      </DialogTitle>

      <DialogContent dividers sx={{ p: 1.5 }}>
        <Box
          sx={{
            mb: 1.3,
            px: 1.2,
            py: 1,
            borderRadius: 1.2,
            border: '1px solid #dbeafe',
            bgcolor: '#eff6ff',
          }}
        >
          <Typography
            sx={{
              color: '#1e3a8a',
              fontSize: '0.76rem',
              fontWeight: 900,
            }}
          >
            {reportTitle}
          </Typography>
          <Typography
            sx={{
              mt: 0.25,
              color: '#475569',
              fontSize: '0.68rem',
            }}
          >
            선택된 결재자는 직급 순서와 관계없이 아래
            결재순서대로 순차 승인됩니다.
          </Typography>
        </Box>

        {errorMessage && (
          <Alert
            severity="error"
            sx={{ mb: 1.2, fontSize: '0.72rem' }}
          >
            {errorMessage}
          </Alert>
        )}

        {loading ? (
          <Box
            sx={{
              minHeight: 210,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
            }}
          >
            <CircularProgress size={22} />
            <Typography
              sx={{ color: '#64748b', fontSize: '0.76rem' }}
            >
              결재자 명단을 불러오는 중입니다.
            </Typography>
          </Box>
        ) : (
          <TableContainer
            sx={{
              maxHeight: 360,
              overflowX: 'hidden',
              border: '1px solid #cbd5e1',
              borderRadius: 1,
            }}
          >
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell
                    align="center"
                    sx={{
                      ...headerCellSx,
                      width: 82,
                      minWidth: 82,
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 0.2,
                      }}
                    >
                      <Checkbox
                        size="small"
                        checked={allSelected}
                        indeterminate={partiallySelected}
                        onChange={toggleAll}
                        inputProps={{
                          'aria-label': '결재자 전체선택',
                        }}
                        sx={{ p: 0.2 }}
                      />
                      No.
                    </Box>
                  </TableCell>

                  <TableCell
                    align="center"
                    sx={headerCellSx}
                  >
                    성명
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={headerCellSx}
                  >
                    직급
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{ ...headerCellSx, borderRight: 0 }}
                  >
                    E-mail
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {approvers.map((approver, index) => (
                  <TableRow
                    key={approver.id}
                    hover
                    onClick={() =>
                      toggleApprover(approver.id)
                    }
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell
                      align="center"
                      sx={{
                        ...bodyCellSx,
                        fontWeight: 800,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 0.35,
                        }}
                      >
                        <Checkbox
                          size="small"
                          checked={selectedIds.has(approver.id)}
                          onChange={() =>
                            toggleApprover(approver.id)
                          }
                          onClick={(event) =>
                            event.stopPropagation()
                          }
                          sx={{ p: 0.2 }}
                        />
                        {index + 1}
                      </Box>
                    </TableCell>

                    <TableCell
                      align="center"
                      sx={{
                        ...bodyCellSx,
                        color: '#0f172a',
                        fontWeight: 900,
                      }}
                    >
                      {approver.full_name}
                    </TableCell>

                    <TableCell
                      align="center"
                      sx={{
                        ...bodyCellSx,
                        color: '#475569',
                        fontWeight: 700,
                      }}
                    >
                      {approver.position}
                    </TableCell>

                    <TableCell
                      align="center"
                      sx={{
                        ...bodyCellSx,
                        borderRight: 0,
                        color: '#64748b',
                      }}
                    >
                      {approver.email}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Typography
          sx={{
            mt: 1,
            color: '#64748b',
            fontSize: '0.66rem',
          }}
        >
          결재순서: 이사 → 기획실장 → 대표이사. 일부만
          선택하면 선택된 사람만 이 순서대로 진행됩니다.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 1.5, py: 1.2 }}>
        <Button
          size="small"
          variant="outlined"
          onClick={onClose}
          disabled={submitting}
        >
          취소
        </Button>

        <Button
          size="small"
          variant="contained"
          startIcon={
            submitting ? (
              <CircularProgress size={14} color="inherit" />
            ) : (
              <SendOutlinedIcon />
            )
          }
          onClick={handleSubmit}
          disabled={
            loading ||
            submitting ||
            selectedApprovers.length === 0
          }
        >
          결재요청 보내기
        </Button>
      </DialogActions>
    </Dialog>
  );
}
