import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { invokeApprovalFunction } from '../utils/approvalFunction.js';
import { listApprovalCandidates } from '../utils/reportDocuments.js';

const SLOT_LABELS = ['1차 결재자', '2차 결재자', '3차 결재자'];

export default function ApprovalRequestDialog({
  open,
  onClose,
  reportType,
  reportTitle,
  reportKey,
  projectName,
  requesterName,
  documentId,
  payload,
  onSubmitted,
}) {
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState([null, null, null]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!open) return;

    let active = true;

    const loadCandidates = async () => {
      setLoading(true);
      setErrorMessage('');
      setSelected([null, null, null]);

      try {
        const rows = await listApprovalCandidates();
        if (active) setCandidates(rows);
      } catch (error) {
        console.error('결재자 명단 조회 실패:', error);
        if (active) {
          setErrorMessage(
            error?.message || '결재자 명단을 불러오지 못했습니다.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadCandidates();

    return () => {
      active = false;
    };
  }, [open]);

  const selectedIds = useMemo(
    () => selected.filter(Boolean).map((candidate) => candidate.userId),
    [selected],
  );

  const optionsForSlot = (slotIndex) =>
    candidates.filter(
      (candidate) =>
        selected[slotIndex]?.userId === candidate.userId ||
        !selectedIds.includes(candidate.userId),
    );

  const handleSelect = (slotIndex, candidate) => {
    setSelected((previous) => {
      const next = [...previous];
      next[slotIndex] = candidate;

      if (!candidate) {
        for (let index = slotIndex + 1; index < next.length; index += 1) {
          next[index] = null;
        }
      }

      return next;
    });
    setErrorMessage('');
  };

  const handleSubmit = async () => {
    const orderedApprovers = selected.filter(Boolean);

    if (orderedApprovers.length === 0 || !selected[0]) {
      setErrorMessage('1차 결재자를 선택해주세요.');
      return;
    }

    if (selected[2] && !selected[1]) {
      setErrorMessage('3차 결재자를 지정하려면 2차 결재자를 먼저 선택해주세요.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      const { data, error } = await invokeApprovalFunction({
        action: 'create',
        documentId,
        reportType,
        reportTitle,
        reportKey,
        projectName,
        requesterName,
        payload,
        approverIds: orderedApprovers.map((approver) => approver.userId),
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      window.alert(
        `결재요청이 등록되었습니다.\n${orderedApprovers[0].fullName} ${orderedApprovers[0].position}에게 1차 결재가 올라갔습니다.`,
      );

      window.dispatchEvent(new Event('approval-workflow-changed'));
      window.dispatchEvent(new Event('report-documents-changed'));

      onClose?.();
      onSubmitted?.(data);
    } catch (error) {
      console.error('결재요청 등록 실패:', error);
      setErrorMessage(error?.message || '결재요청을 등록하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const orderedSelected = selected.filter(Boolean);

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle sx={{ pb: 1, color: '#1e293b', fontSize: '1rem', fontWeight: 900 }}>
        결재요청
      </DialogTitle>

      <DialogContent dividers sx={{ p: 1.5 }}>
        <Paper
          variant="outlined"
          sx={{ mb: 1.5, p: 1.2, borderColor: '#dbeafe', bgcolor: '#eff6ff' }}
        >
          <Typography sx={{ color: '#1e3a8a', fontSize: '0.78rem', fontWeight: 900 }}>
            {reportTitle}
          </Typography>
          <Typography sx={{ mt: 0.3, color: '#475569', fontSize: '0.7rem' }}>
            현장: {projectName || '-'} · 요청자: {requesterName || '-'}
          </Typography>
        </Paper>

        <Typography sx={{ color: '#334155', fontSize: '0.78rem', fontWeight: 900 }}>
          결재순서 직접 지정
        </Typography>
        <Typography sx={{ mt: 0.25, mb: 1.2, color: '#64748b', fontSize: '0.68rem', lineHeight: 1.5 }}>
          성명과 직급만 표시됩니다. 1차 승인 후 2차, 2차 승인 후 3차 결재자에게 순서대로 올라갑니다.
        </Typography>

        {errorMessage && (
          <Alert severity="error" sx={{ mb: 1.2, fontSize: '0.72rem' }}>
            {errorMessage}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ minHeight: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <CircularProgress size={22} />
            <Typography sx={{ color: '#64748b', fontSize: '0.76rem' }}>
              가입 회원 명단을 불러오는 중입니다.
            </Typography>
          </Box>
        ) : candidates.length === 0 ? (
          <Alert severity="warning">
            선택할 수 있는 활성 회원이 없습니다. 회원관리에서 이름·직급과 승인 상태를 확인해주세요.
          </Alert>
        ) : (
          <Box sx={{ display: 'grid', gap: 1 }}>
            {SLOT_LABELS.map((label, index) => {
              const disabled = index > 0 && !selected[index - 1];

              return (
                <Box
                  key={label}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '76px minmax(0, 1fr)',
                    gap: 1,
                    alignItems: 'center',
                    p: 1,
                    border: '1px solid #e2e8f0',
                    borderRadius: 1,
                    bgcolor: disabled ? '#f8fafc' : '#ffffff',
                  }}
                >
                  <Typography sx={{ color: disabled ? '#94a3b8' : '#334155', fontSize: '0.72rem', fontWeight: 900 }}>
                    {index + 1}차
                  </Typography>

                  <Autocomplete
                    size="small"
                    options={optionsForSlot(index)}
                    value={selected[index]}
                    disabled={disabled || submitting}
                    onChange={(_, value) => handleSelect(index, value)}
                    getOptionLabel={(option) => `${option.fullName} · ${option.position}`}
                    isOptionEqualToValue={(option, value) => option.userId === value.userId}
                    noOptionsText="선택 가능한 회원이 없습니다."
                    renderOption={(props, option) => (
                      <Box component="li" {...props} key={option.userId}>
                        <Box>
                          <Typography sx={{ color: '#1e293b', fontSize: '0.76rem', fontWeight: 900 }}>
                            {option.fullName}
                          </Typography>
                          <Typography sx={{ color: '#64748b', fontSize: '0.66rem' }}>
                            {option.position}
                          </Typography>
                        </Box>
                      </Box>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={label}
                        placeholder={index === 0 ? '필수 선택' : '선택 사항'}
                      />
                    )}
                  />
                </Box>
              );
            })}
          </Box>
        )}

        <Divider sx={{ my: 1.5 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.55 }}>
          {orderedSelected.length === 0 ? (
            <Typography sx={{ color: '#94a3b8', fontSize: '0.7rem' }}>
              결재자를 지정하면 순서가 여기에 표시됩니다.
            </Typography>
          ) : (
            orderedSelected.map((approver, index) => (
              <React.Fragment key={approver.userId}>
                <Box sx={{ px: 0.85, py: 0.6, borderRadius: 1, border: '1px solid #bfdbfe', bgcolor: '#eff6ff' }}>
                  <Typography sx={{ color: '#1d4ed8', fontSize: '0.68rem', fontWeight: 900 }}>
                    {index + 1}. {approver.fullName} {approver.position}
                  </Typography>
                </Box>
                {index < orderedSelected.length - 1 && (
                  <Typography sx={{ color: '#94a3b8', fontSize: '0.75rem' }}>→</Typography>
                )}
              </React.Fragment>
            ))
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 1.5, py: 1.1 }}>
        <Button size="small" variant="outlined" onClick={onClose} disabled={submitting}>
          취소
        </Button>
        <Button
          size="small"
          variant="contained"
          startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : <SendOutlinedIcon />}
          onClick={handleSubmit}
          disabled={loading || submitting || candidates.length === 0}
          sx={{ minWidth: 112, fontWeight: 900 }}
        >
          {submitting ? '요청 중...' : '결재요청'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
