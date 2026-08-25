import React, {
  useEffect,
  useMemo,
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
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';

const digitsOnly = (value) =>
  String(value || '').replace(/\D/g, '');

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
      second: '2-digit',
      hour12: false,
    },
  ).format(date);
};

const normalizePreflight = (data) => ({
  canRequest:
    data?.can_request === true,
  excelReady:
    data?.excel_ready === true,
  hasVerifiedPhone:
    data?.has_verified_phone === true,
  smsProviderReady:
    data?.sms_provider_ready === true,
  verifiedPhoneMasked:
    String(
      data?.verified_phone_masked || '',
    ).trim(),
  workerCount: Number(
    data?.worker_count || 0,
  ),
  issueWorkerCount: Number(
    data?.issue_worker_count || 0,
  ),
  issueCount: Number(
    data?.issue_count || 0,
  ),
  rosterId: String(
    data?.roster_id || '',
  ).trim(),
  snapshotHash: String(
    data?.snapshot_hash || '',
  ).trim(),
  blockers: Array.isArray(
    data?.blockers,
  )
    ? data.blockers
    : [],
});

const BLOCKER_LABELS = Object.freeze({
  excel_not_ready:
    'Excel 생성 사전검증을 먼저 통과해야 합니다.',
  security_phone_unverified:
    '인증 완료된 보안 휴대폰이 필요합니다.',
  sms_provider_not_connected:
    'SENS SMS 발송 연동이 아직 준비되지 않았습니다.',
  roster_missing:
    '저장된 월별 노임 명단이 없습니다.',
});

export default function LaborDownloadAuthDialog({
  open,
  onClose,
  projectName,
  monthKey,
}) {
  const [
    preflight,
    setPreflight,
  ] = useState(null);
  const [
    preflightLoading,
    setPreflightLoading,
  ] = useState(false);
  const [
    requestLoading,
    setRequestLoading,
  ] = useState(false);
  const [
    verifyLoading,
    setVerifyLoading,
  ] = useState(false);
  const [
    challenge,
    setChallenge,
  ] = useState(null);
  const [otp, setOtp] =
    useState('');
  const [
    verification,
    setVerification,
  ] = useState(null);
  const [
    message,
    setMessage,
  ] = useState(null);

  const loadPreflight = async () => {
    if (
      !projectName ||
      !monthKey
    ) {
      return;
    }

    setPreflightLoading(true);
    setMessage(null);
    setChallenge(null);
    setVerification(null);
    setOtp('');

    const { data, error } =
      await supabase.rpc(
        'labor_download_auth_preflight_v52_39',
        {
          p_project_name:
            projectName,
          p_month_key:
            monthKey,
        },
      );

    setPreflightLoading(false);

    if (error) {
      setPreflight(null);
      setMessage({
        severity: 'error',
        text:
          error.message ||
          '다운로드 인증 준비상태를 확인하지 못했습니다.',
      });
      return;
    }

    setPreflight(
      normalizePreflight(
        data || {},
      ),
    );
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadPreflight();
  }, [
    open,
    projectName,
    monthKey,
  ]);

  const blockerMessages =
    useMemo(
      () =>
        (
          preflight?.blockers ||
          []
        ).map(
          (blocker) =>
            BLOCKER_LABELS[
              blocker
            ] ||
            blocker,
        ),
      [preflight],
    );

  const requestOtp =
    async () => {
      if (
        requestLoading ||
        !preflight?.canRequest
      ) {
        return;
      }

      setRequestLoading(true);
      setMessage(null);
      setChallenge(null);
      setVerification(null);
      setOtp('');

      const { data, error } =
        await supabase.rpc(
          'labor_download_otp_request_v52_39',
          {
            p_project_name:
              projectName,
            p_month_key:
              monthKey,
          },
        );

      setRequestLoading(false);

      if (error) {
        setMessage({
          severity: 'error',
          text:
            error.message ||
            'SMS 인증요청을 만들지 못했습니다.',
        });
        return;
      }

      setChallenge({
        id: String(
          data?.challenge_id ||
            '',
        ).trim(),
        expiresAt:
          data?.expires_at ||
          null,
        phoneMasked:
          String(
            data?.phone_masked ||
              '',
          ).trim(),
      });

      setMessage({
        severity: 'success',
        text:
          '인증번호 요청이 생성되었습니다.',
      });
    };

  const verifyOtp =
    async () => {
      if (
        verifyLoading ||
        !challenge?.id
      ) {
        return;
      }

      const preparedOtp =
        digitsOnly(otp).slice(
          0,
          6,
        );

      if (
        !/^\d{6}$/.test(
          preparedOtp,
        )
      ) {
        setMessage({
          severity: 'warning',
          text:
            '인증번호 6자리를 입력해주세요.',
        });
        return;
      }

      setVerifyLoading(true);
      setMessage(null);

      const { data, error } =
        await supabase.rpc(
          'labor_download_otp_verify_v52_39',
          {
            p_challenge_id:
              challenge.id,
            p_otp:
              preparedOtp,
          },
        );

      setVerifyLoading(false);

      if (error) {
        setMessage({
          severity: 'error',
          text:
            error.message ||
            '인증번호 확인에 실패했습니다.',
        });
        return;
      }

      setVerification({
        verified:
          data?.verified === true,
        authorizedUntil:
          data?.authorized_until ||
          null,
      });

      setOtp('');

      setMessage({
        severity:
          data?.verified === true
            ? 'success'
            : 'warning',
        text:
          data?.verified === true
            ? '다운로드 2차 인증이 완료되었습니다.'
            : '인증번호가 일치하지 않습니다.',
      });
    };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (
          !preflightLoading &&
          !requestLoading &&
          !verifyLoading
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
        노임 다운로드 인증 준비
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={1.15}>
          <Alert severity="info">
            민감정보가 포함되는 노임 Excel은
            현장·작성월·현재 명단 스냅샷에
            묶인 1회성 SMS 인증을 거쳐야
            다운로드할 수 있도록 준비하고 있습니다.
          </Alert>

          {preflightLoading ? (
            <Box
              sx={{
                py: 5,
                display: 'flex',
                justifyContent:
                  'center',
              }}
            >
              <CircularProgress
                size={26}
              />
            </Box>
          ) : preflight ? (
            <>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(3, minmax(0, 1fr))',
                  },
                  gap: 0.75,
                }}
              >
                {[
                  [
                    'Excel 데이터',
                    preflight.excelReady
                      ? '준비 완료'
                      : '보완 필요',
                  ],
                  [
                    '보안 휴대폰',
                    preflight.hasVerifiedPhone
                      ? preflight.verifiedPhoneMasked ||
                        '인증 완료'
                      : '미인증',
                  ],
                  [
                    'SMS 발송',
                    preflight.smsProviderReady
                      ? '연동 완료'
                      : '연동 대기',
                  ],
                ].map(
                  ([label, value]) => (
                    <Paper
                      key={label}
                      variant="outlined"
                      sx={{
                        p: 1,
                        textAlign:
                          'center',
                        borderColor:
                          '#cbd5e1',
                      }}
                    >
                      <Typography
                        sx={{
                          color:
                            '#64748b',
                          fontSize:
                            '0.66rem',
                          fontWeight: 800,
                        }}
                      >
                        {label}
                      </Typography>
                      <Typography
                        sx={{
                          mt: 0.25,
                          color:
                            '#0f172a',
                          fontSize:
                            '0.78rem',
                          fontWeight: 900,
                        }}
                      >
                        {value}
                      </Typography>
                    </Paper>
                  ),
                )}
              </Box>

              <Typography
                sx={{
                  color: '#64748b',
                  fontSize: '0.68rem',
                  lineHeight: 1.55,
                }}
              >
                근로자 {preflight.workerCount}명
                {' · '}
                보완필요 {preflight.issueWorkerCount}명
                {' · '}
                누락 {preflight.issueCount}건
              </Typography>

              {preflight.snapshotHash ? (
                <Typography
                  sx={{
                    color: '#94a3b8',
                    fontSize:
                      '0.62rem',
                    fontFamily:
                      'monospace',
                  }}
                >
                  명단 스냅샷:{' '}
                  {preflight.snapshotHash.slice(
                    0,
                    16,
                  )}
                  …
                </Typography>
              ) : null}

              {blockerMessages.length >
              0 ? (
                <Alert severity="warning">
                  <Stack spacing={0.25}>
                    {blockerMessages.map(
                      (item) => (
                        <Typography
                          key={item}
                          sx={{
                            fontSize:
                              '0.7rem',
                          }}
                        >
                          · {item}
                        </Typography>
                      ),
                    )}
                  </Stack>
                </Alert>
              ) : null}

              <Button
                variant="contained"
                onClick={() =>
                  void requestOtp()
                }
                disabled={
                  !preflight.canRequest ||
                  requestLoading
                }
                sx={{
                  boxShadow: 'none',
                  fontWeight: 900,
                }}
              >
                {requestLoading
                  ? '인증요청 생성 중...'
                  : 'SMS 인증번호 요청'}
              </Button>

              {challenge?.id ? (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.1,
                    borderColor:
                      '#cbd5e1',
                  }}
                >
                  <Stack
                    spacing={0.85}
                  >
                    <Typography
                      sx={{
                        fontSize:
                          '0.72rem',
                        fontWeight: 900,
                      }}
                    >
                      {challenge.phoneMasked ||
                        '등록된 보안 휴대폰'}
                      으로 전송된 인증번호를
                      입력합니다.
                    </Typography>

                    <Typography
                      sx={{
                        color:
                          '#64748b',
                        fontSize:
                          '0.65rem',
                      }}
                    >
                      만료:{' '}
                      {formatDateTime(
                        challenge.expiresAt,
                      )}
                    </Typography>

                    <TextField
                      fullWidth
                      size="small"
                      label="인증번호 6자리"
                      value={otp}
                      onChange={(
                        event,
                      ) =>
                        setOtp(
                          digitsOnly(
                            event.target
                              .value,
                          ).slice(
                            0,
                            6,
                          ),
                        )
                      }
                      inputProps={{
                        inputMode:
                          'numeric',
                        maxLength: 6,
                      }}
                    />

                    <Button
                      variant="outlined"
                      onClick={() =>
                        void verifyOtp()
                      }
                      disabled={
                        verifyLoading ||
                        otp.length !== 6
                      }
                    >
                      {verifyLoading
                        ? '확인 중...'
                        : '인증번호 확인'}
                    </Button>
                  </Stack>
                </Paper>
              ) : null}

              {verification?.verified ? (
                <Alert severity="success">
                  2차 인증 완료 · 인증 유효시간{' '}
                  {formatDateTime(
                    verification.authorizedUntil,
                  )}
                  <br />
                  실제 Excel 템플릿과 다운로드
                  함수를 연결하면 이 인증을
                  1회 사용 후 즉시 소모하게 됩니다.
                </Alert>
              ) : null}

              <Button
                variant="outlined"
                disabled
              >
                실제 노임 Excel 다운로드
              </Button>

              <Typography
                sx={{
                  color: '#94a3b8',
                  fontSize: '0.64rem',
                  textAlign: 'center',
                }}
              >
                실제 회사 Excel 템플릿이 아직
                연결되지 않아 다운로드 버튼은
                비활성 상태입니다.
              </Typography>
            </>
          ) : null}

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
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button
          onClick={() =>
            void loadPreflight()
          }
          disabled={
            preflightLoading ||
            requestLoading ||
            verifyLoading
          }
        >
          새로고침
        </Button>
        <Button
          onClick={() =>
            onClose?.()
          }
          disabled={
            preflightLoading ||
            requestLoading ||
            verifyLoading
          }
        >
          닫기
        </Button>
      </DialogActions>
    </Dialog>
  );
}
