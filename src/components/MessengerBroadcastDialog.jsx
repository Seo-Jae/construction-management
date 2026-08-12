import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { supabase } from '../supabaseClient';

const normalizeText = (value) => String(value || '').trim();

export default function MessengerBroadcastDialog({
  open,
  users = [],
  usersLoading = false,
  usersError = '',
  onClose,
  onSent,
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const initializedRef = useRef(false);

  const selectableUsers = useMemo(
    () => users.filter((user) => Boolean(user?.user_id)),
    [users],
  );

  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      setSelectedIds([]);
      setBody('');
      setSending(false);
      setSendError('');
      return;
    }

    if (!initializedRef.current && !usersLoading) {
      setSelectedIds(selectableUsers.map((user) => user.user_id));
      initializedRef.current = true;
    }
  }, [open, selectableUsers, usersLoading]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected =
    selectableUsers.length > 0 && selectedIds.length === selectableUsers.length;
  const partiallySelected =
    selectedIds.length > 0 && selectedIds.length < selectableUsers.length;

  const handleToggleAll = () => {
    if (sending) return;
    setSelectedIds(
      allSelected ? [] : selectableUsers.map((user) => user.user_id),
    );
  };

  const handleToggleUser = (userId) => {
    if (sending || !userId) return;
    setSelectedIds((previous) =>
      previous.includes(userId)
        ? previous.filter((id) => id !== userId)
        : [...previous, userId],
    );
  };

  const handleClose = () => {
    if (sending) return;
    onClose?.();
  };

  const handleSend = async () => {
    const messageBody = normalizeText(body);
    if (sending) return;

    if (selectedIds.length === 0) {
      setSendError('메시지를 받을 사용자를 한 명 이상 선택해주세요.');
      return;
    }

    if (!messageBody) {
      setSendError('전송할 메시지를 입력해주세요.');
      return;
    }

    if (messageBody.length > 4000) {
      setSendError('메시지는 4,000자 이하로 입력해주세요.');
      return;
    }

    if (
      !window.confirm(
        `선택한 ${selectedIds.length}명에게 동일한 메시지를 전송할까요?`,
      )
    ) {
      return;
    }

    setSending(true);
    setSendError('');

    try {
      const { data, error } = await supabase.rpc(
        'messenger_broadcast_text_message',
        {
          p_recipient_user_ids: selectedIds,
          p_body: messageBody,
        },
      );
      if (error) throw error;

      const sentCount = Number(data || 0);
      if (!Number.isFinite(sentCount) || sentCount < 1) {
        throw new Error('전송 대상이 없어 전체 메시지를 보내지 못했습니다.');
      }

      await onSent?.(sentCount);
      onClose?.();
    } catch (error) {
      console.error('전체 메시지 전송 오류:', error);
      setSendError(error?.message || '전체 메시지 전송에 실패했습니다.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          maxHeight: '88vh',
        },
      }}
    >
      <DialogTitle
        sx={{
          py: 1.25,
          display: 'flex',
          alignItems: 'center',
          gap: 0.8,
          fontWeight: 900,
        }}
      >
        <CampaignRoundedIcon sx={{ color: '#d97706' }} />
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography sx={{ color: '#0f172a', fontSize: '0.92rem', fontWeight: 900 }}>
            전체 메시지 전송
          </Typography>
          <Typography sx={{ mt: 0.1, color: '#64748b', fontSize: '0.64rem' }}>
            선택한 사용자에게 같은 내용을 각각 1:1 메시지로 전송합니다.
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {usersError && (
          <Alert severity="error" sx={{ m: 1.25, fontSize: '0.7rem' }}>
            {usersError}
          </Alert>
        )}

        <Box sx={{ px: 1.5, py: 1.05, bgcolor: '#f8fafc' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Typography sx={{ color: '#334155', fontSize: '0.72rem', fontWeight: 900 }}>
              수신자 선택
            </Typography>
            <Typography sx={{ color: '#64748b', fontSize: '0.66rem', fontWeight: 700 }}>
              {selectedIds.length} / {selectableUsers.length}명 선택
            </Typography>
          </Stack>
        </Box>

        <Divider />

        <TableContainer sx={{ maxHeight: 330 }}>
          <Table stickyHeader size="small" aria-label="전체 메시지 수신자 선택">
            <TableHead>
              <TableRow>
                <TableCell
                  sx={{
                    width: 118,
                    py: 0.65,
                    bgcolor: '#f1f5f9',
                    color: '#334155',
                    fontSize: '0.7rem',
                    fontWeight: 900,
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={0.45}>
                    <Checkbox
                      size="small"
                      checked={allSelected}
                      indeterminate={partiallySelected}
                      disabled={sending || usersLoading || selectableUsers.length === 0}
                      onChange={handleToggleAll}
                      inputProps={{ 'aria-label': '전체 선택 또는 해제' }}
                      sx={{ p: 0.25 }}
                    />
                    <Typography component="span" sx={{ fontSize: '0.7rem', fontWeight: 900 }}>
                      No.
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell
                  sx={{
                    py: 0.65,
                    bgcolor: '#f1f5f9',
                    color: '#334155',
                    fontSize: '0.7rem',
                    fontWeight: 900,
                  }}
                >
                  이름
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {usersLoading ? (
                <TableRow>
                  <TableCell colSpan={2} sx={{ py: 4, textAlign: 'center' }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : selectableUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} sx={{ py: 4, textAlign: 'center', color: '#94a3b8' }}>
                    <Typography sx={{ fontSize: '0.72rem' }}>
                      전송 가능한 사용자가 없습니다.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                selectableUsers.map((user, index) => {
                  const checked = selectedSet.has(user.user_id);
                  return (
                    <TableRow
                      hover
                      key={user.user_id}
                      onClick={() => handleToggleUser(user.user_id)}
                      sx={{ cursor: sending ? 'default' : 'pointer' }}
                    >
                      <TableCell sx={{ py: 0.45 }}>
                        <Stack direction="row" alignItems="center" spacing={0.55}>
                          <Checkbox
                            size="small"
                            checked={checked}
                            disabled={sending}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => handleToggleUser(user.user_id)}
                            sx={{ p: 0.25 }}
                          />
                          <Typography sx={{ color: '#64748b', fontSize: '0.68rem', fontWeight: 700 }}>
                            {index + 1}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ py: 0.65 }}>
                        <Typography sx={{ color: '#0f172a', fontSize: '0.76rem', fontWeight: 800 }}>
                          {normalizeText(user.manager_name) || '이름 미등록'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Divider />

        <Box sx={{ p: 1.5 }}>
          <TextField
            fullWidth
            multiline
            minRows={5}
            maxRows={10}
            label="전체 메시지 내용"
            placeholder="선택한 사용자에게 전달할 메시지를 입력하세요."
            value={body}
            disabled={sending}
            onChange={(event) => {
              setBody(event.target.value);
              if (sendError) setSendError('');
            }}
            inputProps={{ maxLength: 4000 }}
            helperText={`${body.length.toLocaleString()} / 4,000자`}
          />

          {sendError && (
            <Alert severity="error" sx={{ mt: 1, fontSize: '0.7rem' }}>
              {sendError}
            </Alert>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 1.5, py: 1 }}>
        <Button disabled={sending} onClick={handleClose}>
          취소
        </Button>
        <Button
          variant="contained"
          disabled={
            sending ||
            usersLoading ||
            selectedIds.length === 0 ||
            !normalizeText(body)
          }
          onClick={handleSend}
          startIcon={sending ? <CircularProgress size={15} /> : <SendRoundedIcon />}
        >
          {sending ? '전송 중...' : `${selectedIds.length}명에게 전송`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
