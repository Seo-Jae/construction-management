import React, {
  useEffect,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';

const digitsOnly = (value) =>
  String(value || '').replace(/\D/g, '');

const normalizeStatus = (data) => ({
  hasVerifiedPhone:
    data?.has_verified_phone === true,
  hasPendingPhone:
    data?.has_pending_phone === true,
  verifiedPhoneMasked:
    String(
      data?.verified_phone_masked || '',
    ).trim(),
  pendingPhoneMasked:
    String(
      data?.pending_phone_masked || '',
    ).trim(),
  verifiedAt:
    data?.verified_at || null,
  pendingRequestedAt:
    data?.pending_requested_at || null,
});

const formatDateTime = (value) => {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat(
    'ko-KR',
    {
      timeZone: 'Asia/Seoul',
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
  ).format(date);
};

export default function LaborSecurityPhoneDialog({
  open,
  onClose,
}) {
  const [status, setStatus] =
    useState(null);
  const [loading, setLoading] =
    useState(false);
  const [saving, setSaving] =
    useState(false);
  const [phoneNumber, setPhoneNumber] =
    useState('');
  const [message, setMessage] =
    useState(null);

  const loadStatus = async () => {
    setLoading(true);
    setMessage(null);

    const { data, error } =
      await supabase.rpc(
        'labor_security_phone_status_v52_38',
      );

    setLoading(false);

    if (error) {
      setMessage({
        severity: 'error',
        text:
          error.message ||
          '보안 휴대폰 상태를 확인하지 못했습니다.',
      });
      return;
    }

    setStatus(
      normalizeStatus(
        data || {},
      ),
    );
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    setPhoneNumber('');
    void loadStatus();
  }, [open]);

  const registerPending =
    async () => {
      if (saving) return;

      const normalized =
        digitsOnly(phoneNumber);

      if (
        !/^01[016789]\d{7,8}$/.test(
          normalized,
        )
      ) {
        setMessage({
          severity: 'warning',
          text:
            '휴대폰번호를 확인해주세요.',
        });
        return;
      }

      setSaving(true);
      setMessage(null);

      const { data, error } =
        await supabase.rpc(
          'labor_security_phone_register_pending_v52_38',
          {
            p_phone_number:
              normalized,
          },
        );

      setSaving(false);

      if (error) {
        setMessage({
          severity: 'error',
          text:
            error.message ||
            '보안 휴대폰 등록에 실패했습니다.',
        });
        return;
      }

      setPhoneNumber('');
      setMessage({
        severity: 'success',
        text:
          '인증 대기 번호를 저장했습니다. SENS 연동 후 이 번호로 인증번호를 발송하게 됩니다.',
      });

      setStatus(
        normalizeStatus(
          data || {},
        ),
      );
    };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (
          !saving &&
          !loading
        ) {
          onClose?.();
        }
      }}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle
        sx={{ fontWeight: 900 }}
      >
        보안 휴대폰
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={1.2}>
          <Alert severity="info">
            노임 Excel의 민감정보 다운로드는
            최종적으로 등록된 보안 휴대폰의
            SMS 인증을 거쳐야 합니다.
          </Alert>

          <Alert severity="warning">
            현재는 SENS 사업자 연동 전 단계라
            휴대폰번호를 <b>인증 완료</b>로
            처리하지 않습니다. 이번 단계에서는
            인증번호를 받을 번호를 암호화 저장하고
            대기상태로만 등록합니다.
          </Alert>

          {loading ? (
            <Box
              sx={{
                py: 4,
                display: 'flex',
                justifyContent:
                  'center',
              }}
            >
              <CircularProgress
                size={26}
              />
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  p: 1.2,
                  border:
                    '1px solid #e2e8f0',
                  borderRadius: 1,
                  bgcolor:
                    '#f8fafc',
                }}
              >
                <Typography
                  sx={{
                    fontSize:
                      '0.72rem',
                    color:
                      '#64748b',
                    fontWeight: 800,
                  }}
                >
                  현재 보안인증 상태
                </Typography>

                <Typography
                  sx={{
                    mt: 0.35,
                    fontSize:
                      '0.82rem',
                    color:
                      status?.hasVerifiedPhone
                        ? '#166534'
                        : '#b45309',
                    fontWeight: 900,
                  }}
                >
                  {status?.hasVerifiedPhone
                    ? `인증 완료 ${status.verifiedPhoneMasked || ''}`
                    : '미인증'}
                </Typography>

                {status?.hasVerifiedPhone ? (
                  <Typography
                    sx={{
                      mt: 0.25,
                      fontSize:
                        '0.66rem',
                      color:
                        '#64748b',
                    }}
                  >
                    인증일시:{' '}
                    {formatDateTime(
                      status.verifiedAt,
                    )}
                  </Typography>
                ) : null}

                {status?.hasPendingPhone ? (
                  <Typography
                    sx={{
                      mt: 0.45,
                      fontSize:
                        '0.68rem',
                      color:
                        '#475569',
                    }}
                  >
                    인증 대기:{' '}
                    <b>
                      {status.pendingPhoneMasked}
                    </b>
                    {' · '}
                    {formatDateTime(
                      status.pendingRequestedAt,
                    )}
                  </Typography>
                ) : null}
              </Box>

              <TextField
                fullWidth
                size="small"
                label="인증용 휴대폰번호"
                value={phoneNumber}
                onChange={(event) =>
                  setPhoneNumber(
                    digitsOnly(
                      event.target
                        .value,
                    ).slice(
                      0,
                      11,
                    ),
                  )
                }
                inputProps={{
                  inputMode:
                    'numeric',
                  maxLength: 11,
                }}
                placeholder="01012345678"
                helperText="번호는 암호화 저장되며 화면에는 뒤 4자리만 표시합니다."
              />

              {message ? (
                <Alert
                  severity={
                    message.severity ||
                    'info'
                  }
                >
                  {message.text}
                </Alert>
              ) : null}

              <Button
                variant="contained"
                onClick={() =>
                  void registerPending()
                }
                disabled={
                  saving ||
                  loading ||
                  phoneNumber.length <
                    10
                }
                sx={{
                  boxShadow: 'none',
                  fontWeight: 900,
                }}
              >
                {saving
                  ? '저장 중...'
                  : '인증 대기 번호 등록'}
              </Button>
            </>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button
          onClick={() =>
            onClose?.()
          }
          disabled={
            saving ||
            loading
          }
        >
          닫기
        </Button>
      </DialogActions>
    </Dialog>
  );
}
