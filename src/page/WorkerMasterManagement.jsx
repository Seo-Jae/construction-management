import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';
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
  FormControlLabel,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { supabase } from '../supabaseClient';

const TRADE_OPTIONS = [
  '소장',
  '관리자',
  '직영',
  '먹매김',
  '단열',
  '합지',
  '경량벽체',
  '세대천정',
  '공용홀천정',
  '몰딩',
  '걸레받이',
  '수장',
  '외주',
  '기타',
  '용역',
];

const emptyDraft = () => ({
  id: '',
  nameKo: '',
  birthDate: '',
  phoneLast4: '',
  recentTrade: '',
  note: '',
  isActive: true,

  residentRegistrationNumber: '',
  foreignRegistrationNumber: '',
  fullPhoneNumber: '',
  address: '',
  nationality: '',
  bankName: '',
  accountNumber: '',
  accountHolder: '',

  hasPrivateData: false,
  hasResidentNo: false,
  hasForeignNo: false,
  hasPrivatePhone: false,
  hasAddress: false,
  hasAccount: false,
  hasNationality: false,
  bankNameHint: '',
  accountLast4: '',
});

const normalizeWorker = (row) => ({
  id: String(
    row?.worker_master_id || '',
  ).trim(),
  nameKo: String(
    row?.name_ko || '',
  ).trim(),
  birthDate: String(
    row?.birth_date || '',
  ).trim(),
  phoneLast4: String(
    row?.phone_last4 || '',
  ).trim(),
  phoneMasked: String(
    row?.phone_masked || '',
  ).trim(),
  recentTrade: String(
    row?.recent_trade || '',
  ).trim(),
  note: String(
    row?.note || '',
  ).trim(),
  isActive: row?.is_active !== false,
  createdAt: row?.created_at || '',
  updatedAt: row?.updated_at || '',

  hasPrivateData:
    row?.has_private_data === true,
  hasResidentNo:
    row?.has_resident_no === true,
  hasForeignNo:
    row?.has_foreign_no === true,
  hasPrivatePhone:
    row?.has_private_phone === true,
  hasAddress:
    row?.has_address === true,
  hasAccount:
    row?.has_account === true,
  hasNationality:
    row?.has_nationality === true,
  bankNameHint: String(
    row?.bank_name_hint || '',
  ).trim(),
  accountLast4: String(
    row?.account_last4 || '',
  ).trim(),
});

const formatKoreaDateTime = (value) => {
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

const digitsOnly = (value) =>
  String(value || '').replace(
    /\D/g,
    '',
  );

const privateStatusText = (worker) => {
  const labels = [];

  if (worker.hasResidentNo) {
    labels.push('주민번호');
  }

  if (worker.hasForeignNo) {
    labels.push('외국인번호');
  }

  if (worker.hasPrivatePhone) {
    labels.push('연락처');
  }

  if (worker.hasAddress) {
    labels.push('주소');
  }

  if (worker.hasAccount) {
    const accountHint = [
      worker.bankNameHint,
      worker.accountLast4
        ? `****${worker.accountLast4}`
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    labels.push(
      accountHint
        ? `계좌(${accountHint})`
        : '계좌',
    );
  }

  if (worker.hasNationality) {
    labels.push('국적');
  }

  return labels.length > 0
    ? labels.join(' · ')
    : '미등록';
};

const privateHelper = (
  isRegistered,
  existingHint = '',
) => {
  if (!isRegistered) {
    return '현재 등록정보 없음';
  }

  if (existingHint) {
    return `기존 등록: ${existingHint} · 변경할 때만 새 값을 입력하세요.`;
  }

  return '기존 암호화 정보가 등록되어 있습니다. 변경할 때만 새 값을 입력하세요.';
};

export default function WorkerMasterManagement({
  canManage = false,
}) {
  const [rows, setRows] = useState([]);
  const [query, setQuery] =
    useState('');
  const [loading, setLoading] =
    useState(true);
  const [editorOpen, setEditorOpen] =
    useState(false);
  const [draft, setDraft] =
    useState(emptyDraft);
  const [saving, setSaving] =
    useState(false);
  const [message, setMessage] =
    useState(null);

  const loadWorkers = useCallback(
    async ({
      silent = false,
      searchQuery = query,
    } = {}) => {
      if (!silent) {
        setLoading(true);
      }

      const { data, error } =
        await supabase.rpc(
          'labor_worker_master_list_v52_34',
          {
            p_query: String(
              searchQuery || '',
            ).trim(),
            p_limit: 300,
          },
        );

      if (error) {
        setMessage({
          severity: 'error',
          text:
            error.message ||
            '근로자 마스터를 불러오지 못했습니다.',
        });

        if (!silent) {
          setLoading(false);
        }

        return;
      }

      setRows(
        (
          Array.isArray(data)
            ? data
            : []
        ).map(normalizeWorker),
      );

      if (!silent) {
        setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        void loadWorkers({
          searchQuery: '',
        });
      }, 0);

    return () =>
      window.clearTimeout(timer);
  }, [loadWorkers]);

  const openNew = () => {
    if (!canManage) return;

    setDraft(emptyDraft());
    setEditorOpen(true);
  };

  const openEdit = (worker) => {
    if (!canManage) return;

    setDraft({
      ...emptyDraft(),

      id: worker.id,
      nameKo: worker.nameKo,
      birthDate: worker.birthDate,
      phoneLast4: worker.phoneLast4,
      recentTrade:
        worker.recentTrade,
      note: worker.note,
      isActive: worker.isActive,

      hasPrivateData:
        worker.hasPrivateData,
      hasResidentNo:
        worker.hasResidentNo,
      hasForeignNo:
        worker.hasForeignNo,
      hasPrivatePhone:
        worker.hasPrivatePhone,
      hasAddress:
        worker.hasAddress,
      hasAccount:
        worker.hasAccount,
      hasNationality:
        worker.hasNationality,
      bankNameHint:
        worker.bankNameHint,
      accountLast4:
        worker.accountLast4,
    });

    setEditorOpen(true);
  };

  const saveWorker = async () => {
    if (
      !canManage ||
      saving
    ) {
      return;
    }

    const nameKo =
      draft.nameKo.trim();

    const phoneLast4 =
      digitsOnly(
        draft.phoneLast4,
      );

    const residentNo =
      digitsOnly(
        draft.residentRegistrationNumber,
      );

    const foreignNo =
      digitsOnly(
        draft.foreignRegistrationNumber,
      );

    const fullPhone =
      digitsOnly(
        draft.fullPhoneNumber,
      );

    const accountNumber =
      digitsOnly(
        draft.accountNumber,
      );

    if (nameKo.length < 2) {
      setMessage({
        severity: 'warning',
        text:
          '성명을 2자 이상 입력해주세요.',
      });
      return;
    }

    if (
      phoneLast4 &&
      !/^\d{4}$/.test(
        phoneLast4,
      )
    ) {
      setMessage({
        severity: 'warning',
        text:
          '휴대폰 뒤 4자리는 숫자 4자리로 입력해주세요.',
      });
      return;
    }

    if (
      residentNo &&
      !/^\d{13}$/.test(
        residentNo,
      )
    ) {
      setMessage({
        severity: 'warning',
        text:
          '주민등록번호는 13자리 전체를 입력해주세요.',
      });
      return;
    }

    if (
      foreignNo &&
      !/^\d{13}$/.test(
        foreignNo,
      )
    ) {
      setMessage({
        severity: 'warning',
        text:
          '외국인등록번호는 13자리 전체를 입력해주세요.',
      });
      return;
    }

    if (
      residentNo &&
      foreignNo
    ) {
      setMessage({
        severity: 'warning',
        text:
          '주민등록번호와 외국인등록번호는 동시에 입력할 수 없습니다.',
      });
      return;
    }

    if (
      fullPhone &&
      !/^\d{10,11}$/.test(
        fullPhone,
      )
    ) {
      setMessage({
        severity: 'warning',
        text:
          '전체 휴대폰번호를 확인해주세요.',
      });
      return;
    }

    if (
      accountNumber &&
      accountNumber.length < 5
    ) {
      setMessage({
        severity: 'warning',
        text:
          '계좌번호를 확인해주세요.',
      });
      return;
    }

    setSaving(true);

    const { data, error } =
      await supabase.rpc(
        'labor_worker_master_secure_upsert_v52_34',
        {
          p_worker_id:
            draft.id || null,
          p_name_ko: nameKo,
          p_birth_date:
            draft.birthDate ||
            null,
          p_phone_last4:
            phoneLast4 || null,
          p_recent_trade:
            String(
              draft.recentTrade ||
                '',
            ).trim() || null,
          p_note:
            String(
              draft.note || '',
            ).trim() || null,
          p_is_active:
            draft.isActive !==
            false,

          p_resident_registration_number:
            residentNo || null,
          p_foreign_registration_number:
            foreignNo || null,
          p_phone_number:
            fullPhone || null,
          p_address:
            String(
              draft.address || '',
            ).trim() || null,
          p_nationality:
            String(
              draft.nationality ||
                '',
            ).trim() || null,
          p_bank_name:
            String(
              draft.bankName || '',
            ).trim() || null,
          p_account_number:
            accountNumber || null,
          p_account_holder:
            String(
              draft.accountHolder ||
                '',
            ).trim() || null,
        },
      );

    setSaving(false);

    if (error) {
      setMessage({
        severity: 'error',
        text:
          error.message ||
          '근로자 저장에 실패했습니다.',
      });
      return;
    }

    setEditorOpen(false);

    setMessage({
      severity: 'success',
      text:
        data?.created === true
          ? '근로자와 보호정보를 등록했습니다.'
          : data?.private_updated ===
              true
            ? '근로자 정보와 보호정보를 수정했습니다.'
            : '근로자 기본정보를 수정했습니다.',
    });

    await loadWorkers({
      silent: true,
      searchQuery: query,
    });
  };

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Alert
        severity="info"
        sx={{
          '& .MuiAlert-message': {
            fontSize: '0.72rem',
          },
        }}
      >
        주민등록번호·외국인등록번호·전체
        연락처·주소·국적·은행·계좌번호·예금주는
        보호정보로 암호화 저장합니다. 목록과
        수정화면에는 기존 원문을 다시 표시하지
        않습니다.
      </Alert>

      <Paper
        variant="outlined"
        sx={{
          borderColor: '#cbd5e1',
          overflow: 'hidden',
          minHeight: 0,
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box
          sx={{
            px: 1.25,
            py: 1,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.75,
            alignItems:
              'center',
            bgcolor: '#f8fafc',
          }}
        >
          <Box sx={{ mr: 1 }}>
            <Typography
              sx={{
                fontWeight: 900,
                fontSize:
                  '0.92rem',
              }}
            >
              근로자 정보관리
            </Typography>

            <Typography
              sx={{
                mt: 0.1,
                color: '#64748b',
                fontSize:
                  '0.68rem',
              }}
            >
              회사 공통 근로자 마스터 · 보호정보 암호화 저장
            </Typography>
          </Box>

          <TextField
            size="small"
            value={query}
            onChange={(event) =>
              setQuery(
                event.target.value,
              )
            }
            onKeyDown={(
              event,
            ) => {
              if (
                event.key ===
                'Enter'
              ) {
                event.preventDefault();

                void loadWorkers({
                  searchQuery:
                    query,
                });
              }
            }}
            placeholder="성명 검색"
            sx={{ width: 210 }}
          />

          <Button
            size="small"
            variant="outlined"
            startIcon={
              <SearchRoundedIcon />
            }
            onClick={() =>
              void loadWorkers({
                searchQuery:
                  query,
              })
            }
          >
            검색
          </Button>

          <Button
            size="small"
            variant="outlined"
            startIcon={
              <RefreshRoundedIcon />
            }
            onClick={() => {
              setQuery('');

              void loadWorkers({
                searchQuery: '',
              });
            }}
          >
            새로고침
          </Button>

          <Button
            size="small"
            variant="contained"
            startIcon={
              <AddRoundedIcon />
            }
            onClick={openNew}
            disabled={!canManage}
            sx={{
              ml: 'auto',
              boxShadow: 'none',
            }}
          >
            근로자 등록
          </Button>
        </Box>

        <TableContainer
          sx={{
            flexGrow: 1,
            minHeight: 0,
          }}
        >
          <Table
            stickyHeader
            size="small"
            sx={{
              minWidth: 1120,
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell
                  align="center"
                  sx={{
                    width: 62,
                    fontWeight: 900,
                  }}
                >
                  순번
                </TableCell>

                <TableCell
                  sx={{
                    width: 130,
                    fontWeight: 900,
                  }}
                >
                  성명
                </TableCell>

                <TableCell
                  align="center"
                  sx={{
                    width: 125,
                    fontWeight: 900,
                  }}
                >
                  생년월일
                </TableCell>

                <TableCell
                  align="center"
                  sx={{
                    width: 125,
                    fontWeight: 900,
                  }}
                >
                  휴대폰
                </TableCell>

                <TableCell
                  sx={{
                    width: 140,
                    fontWeight: 900,
                  }}
                >
                  최근 공종
                </TableCell>

                <TableCell
                  sx={{
                    minWidth: 250,
                    fontWeight: 900,
                  }}
                >
                  보호정보
                </TableCell>

                <TableCell
                  sx={{
                    minWidth: 140,
                    fontWeight: 900,
                  }}
                >
                  비고
                </TableCell>

                <TableCell
                  align="center"
                  sx={{
                    width: 82,
                    fontWeight: 900,
                  }}
                >
                  상태
                </TableCell>

                <TableCell
                  align="center"
                  sx={{
                    width: 140,
                    fontWeight: 900,
                  }}
                >
                  최근수정
                </TableCell>

                <TableCell
                  align="center"
                  sx={{
                    width: 74,
                    fontWeight: 900,
                  }}
                >
                  관리
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    align="center"
                    sx={{ py: 8 }}
                  >
                    <CircularProgress
                      size={24}
                    />
                  </TableCell>
                </TableRow>
              ) : rows.length ===
                0 ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    align="center"
                    sx={{
                      py: 8,
                      color:
                        '#94a3b8',
                    }}
                  >
                    등록된 근로자가
                    없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(
                  (
                    worker,
                    index,
                  ) => (
                    <TableRow
                      key={
                        worker.id
                      }
                      hover
                    >
                      <TableCell align="center">
                        {index +
                          1}
                      </TableCell>

                      <TableCell>
                        {worker.nameKo ||
                          '-'}
                      </TableCell>

                      <TableCell align="center">
                        {worker.birthDate ||
                          '-'}
                      </TableCell>

                      <TableCell align="center">
                        {worker.phoneMasked ||
                          (worker.phoneLast4
                            ? `****${worker.phoneLast4}`
                            : '-')}
                      </TableCell>

                      <TableCell>
                        {worker.recentTrade ||
                          '-'}
                      </TableCell>

                      <TableCell>
                        <Typography
                          sx={{
                            fontSize:
                              '0.69rem',
                            color:
                              worker.hasPrivateData
                                ? '#334155'
                                : '#94a3b8',
                            lineHeight:
                              1.45,
                          }}
                        >
                          {privateStatusText(
                            worker,
                          )}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        {worker.note ||
                          '-'}
                      </TableCell>

                      <TableCell align="center">
                        {worker.isActive
                          ? '사용중'
                          : '비활성'}
                      </TableCell>

                      <TableCell align="center">
                        {formatKoreaDateTime(
                          worker.updatedAt,
                        )}
                      </TableCell>

                      <TableCell align="center">
                        <Button
                          size="small"
                          onClick={() =>
                            openEdit(
                              worker,
                            )
                          }
                          disabled={
                            !canManage
                          }
                          startIcon={
                            <EditRoundedIcon />
                          }
                          sx={{
                            minWidth: 0,
                            px: 0.75,
                          }}
                        >
                          수정
                        </Button>
                      </TableCell>
                    </TableRow>
                  ),
                )
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog
        open={editorOpen}
        onClose={() => {
          if (!saving) {
            setEditorOpen(false);
          }
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle
          sx={{ fontWeight: 900 }}
        >
          {draft.id
            ? '근로자 정보 수정'
            : '근로자 등록'}
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={1.35}>
            <Typography
              sx={{
                fontWeight: 900,
                color: '#334155',
                fontSize: '0.8rem',
              }}
            >
              기본정보
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  md: 'repeat(2, minmax(0, 1fr))',
                },
                gap: 1,
              }}
            >
              <TextField
                fullWidth
                required
                size="small"
                label="성명"
                value={draft.nameKo}
                onChange={(event) =>
                  setDraft(
                    (previous) => ({
                      ...previous,
                      nameKo:
                        event.target
                          .value,
                    }),
                  )
                }
              />

              <TextField
                fullWidth
                size="small"
                type="date"
                label="생년월일"
                value={
                  draft.birthDate
                }
                onChange={(event) =>
                  setDraft(
                    (previous) => ({
                      ...previous,
                      birthDate:
                        event.target
                          .value,
                    }),
                  )
                }
                InputLabelProps={{
                  shrink: true,
                }}
              />

              <TextField
                fullWidth
                size="small"
                label="검색용 휴대폰 뒤 4자리"
                value={
                  draft.phoneLast4
                }
                onChange={(event) =>
                  setDraft(
                    (previous) => ({
                      ...previous,
                      phoneLast4:
                        digitsOnly(
                          event.target
                            .value,
                        ).slice(
                          0,
                          4,
                        ),
                    }),
                  )
                }
                inputProps={{
                  inputMode:
                    'numeric',
                  maxLength: 4,
                }}
                helperText="전체 휴대폰번호를 아래에 입력하면 이 값은 자동으로 실제 번호의 뒤 4자리와 맞춰집니다."
              />

              <Autocomplete
                freeSolo
                size="small"
                options={
                  TRADE_OPTIONS
                }
                value={
                  draft.recentTrade
                }
                onChange={(
                  _event,
                  value,
                ) =>
                  setDraft(
                    (previous) => ({
                      ...previous,
                      recentTrade:
                        value || '',
                    }),
                  )
                }
                onInputChange={(
                  _event,
                  value,
                ) =>
                  setDraft(
                    (previous) => ({
                      ...previous,
                      recentTrade:
                        value || '',
                    }),
                  )
                }
                renderInput={(
                  params,
                ) => (
                  <TextField
                    {...params}
                    label="최근 공종"
                  />
                )}
              />
            </Box>

            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              label="비고"
              value={draft.note}
              onChange={(event) =>
                setDraft(
                  (previous) => ({
                    ...previous,
                    note:
                      event.target
                        .value,
                  }),
                )
              }
            />

            <FormControlLabel
              control={
                <Switch
                  checked={
                    draft.isActive
                  }
                  onChange={(
                    event,
                  ) =>
                    setDraft(
                      (previous) => ({
                        ...previous,
                        isActive:
                          event
                            .target
                            .checked,
                      }),
                    )
                  }
                />
              }
              label="사용중"
            />

            <Divider />

            <Box>
              <Typography
                sx={{
                  fontWeight: 900,
                  color: '#0f172a',
                  fontSize:
                    '0.82rem',
                }}
              >
                보호정보
              </Typography>

              <Typography
                sx={{
                  mt: 0.25,
                  color: '#64748b',
                  fontSize:
                    '0.68rem',
                  lineHeight: 1.55,
                }}
              >
                기존 보호정보의 원문은 웹 화면에
                다시 표시하지 않습니다. 수정하지
                않을 항목은 빈칸으로 두면 기존
                암호화 값이 유지됩니다.
              </Typography>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  md: 'repeat(2, minmax(0, 1fr))',
                },
                gap: 1,
              }}
            >
              <TextField
                fullWidth
                size="small"
                label="주민등록번호"
                value={
                  draft.residentRegistrationNumber
                }
                onChange={(event) =>
                  setDraft(
                    (previous) => ({
                      ...previous,
                      residentRegistrationNumber:
                        digitsOnly(
                          event.target
                            .value,
                        ).slice(
                          0,
                          13,
                        ),
                    }),
                  )
                }
                inputProps={{
                  inputMode:
                    'numeric',
                  maxLength: 13,
                }}
                placeholder={
                  draft.hasResidentNo
                    ? '기존값 유지'
                    : '13자리'
                }
                helperText={privateHelper(
                  draft.hasResidentNo,
                )}
              />

              <TextField
                fullWidth
                size="small"
                label="외국인등록번호"
                value={
                  draft.foreignRegistrationNumber
                }
                onChange={(event) =>
                  setDraft(
                    (previous) => ({
                      ...previous,
                      foreignRegistrationNumber:
                        digitsOnly(
                          event.target
                            .value,
                        ).slice(
                          0,
                          13,
                        ),
                    }),
                  )
                }
                inputProps={{
                  inputMode:
                    'numeric',
                  maxLength: 13,
                }}
                placeholder={
                  draft.hasForeignNo
                    ? '기존값 유지'
                    : '13자리'
                }
                helperText={privateHelper(
                  draft.hasForeignNo,
                )}
              />

              <TextField
                fullWidth
                size="small"
                label="전체 휴대폰번호"
                value={
                  draft.fullPhoneNumber
                }
                onChange={(event) =>
                  setDraft(
                    (previous) => ({
                      ...previous,
                      fullPhoneNumber:
                        digitsOnly(
                          event.target
                            .value,
                        ).slice(
                          0,
                          11,
                        ),
                    }),
                  )
                }
                inputProps={{
                  inputMode:
                    'numeric',
                  maxLength: 11,
                }}
                placeholder={
                  draft.hasPrivatePhone
                    ? '기존값 유지'
                    : '01012345678'
                }
                helperText={privateHelper(
                  draft.hasPrivatePhone,
                  draft.phoneLast4
                    ? `****${draft.phoneLast4}`
                    : '',
                )}
              />

              <TextField
                fullWidth
                size="small"
                label="국적"
                value={
                  draft.nationality
                }
                onChange={(event) =>
                  setDraft(
                    (previous) => ({
                      ...previous,
                      nationality:
                        event.target
                          .value,
                    }),
                  )
                }
                placeholder={
                  draft.hasNationality
                    ? '기존값 유지'
                    : '예: 대한민국'
                }
                helperText={privateHelper(
                  draft.hasNationality,
                )}
              />

              <TextField
                fullWidth
                size="small"
                label="은행"
                value={
                  draft.bankName
                }
                onChange={(event) =>
                  setDraft(
                    (previous) => ({
                      ...previous,
                      bankName:
                        event.target
                          .value,
                    }),
                  )
                }
                placeholder={
                  draft.hasAccount
                    ? '변경할 때만 입력'
                    : '예: 국민은행'
                }
                helperText={privateHelper(
                  draft.hasAccount,
                  draft.bankNameHint,
                )}
              />

              <TextField
                fullWidth
                size="small"
                label="계좌번호"
                value={
                  draft.accountNumber
                }
                onChange={(event) =>
                  setDraft(
                    (previous) => ({
                      ...previous,
                      accountNumber:
                        digitsOnly(
                          event.target
                            .value,
                        ).slice(
                          0,
                          30,
                        ),
                    }),
                  )
                }
                inputProps={{
                  inputMode:
                    'numeric',
                  maxLength: 30,
                }}
                placeholder={
                  draft.hasAccount
                    ? '기존값 유지'
                    : '계좌번호'
                }
                helperText={privateHelper(
                  draft.hasAccount,
                  draft.accountLast4
                    ? `****${draft.accountLast4}`
                    : '',
                )}
              />

              <TextField
                fullWidth
                size="small"
                label="예금주"
                value={
                  draft.accountHolder
                }
                onChange={(event) =>
                  setDraft(
                    (previous) => ({
                      ...previous,
                      accountHolder:
                        event.target
                          .value,
                    }),
                  )
                }
                placeholder={
                  draft.hasAccount
                    ? '변경할 때만 입력'
                    : '예금주'
                }
                helperText={privateHelper(
                  draft.hasAccount,
                )}
              />

              <TextField
                fullWidth
                multiline
                minRows={2}
                size="small"
                label="주소"
                value={
                  draft.address
                }
                onChange={(event) =>
                  setDraft(
                    (previous) => ({
                      ...previous,
                      address:
                        event.target
                          .value,
                    }),
                  )
                }
                placeholder={
                  draft.hasAddress
                    ? '기존값 유지'
                    : '주소 입력'
                }
                helperText={privateHelper(
                  draft.hasAddress,
                )}
              />
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setEditorOpen(false)
            }
            disabled={saving}
          >
            취소
          </Button>

          <Button
            variant="contained"
            onClick={() =>
              void saveWorker()
            }
            disabled={saving}
            sx={{
              boxShadow: 'none',
            }}
          >
            {saving
              ? '암호화 저장 중...'
              : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(message)}
        autoHideDuration={3500}
        onClose={() =>
          setMessage(null)
        }
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
      >
        <Alert
          severity={
            message?.severity ||
            'info'
          }
          variant="filled"
          onClose={() =>
            setMessage(null)
          }
        >
          {message?.text || ''}
        </Alert>
      </Snackbar>
    </Box>
  );
}
