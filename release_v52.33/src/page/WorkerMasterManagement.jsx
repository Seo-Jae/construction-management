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
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
});

const normalizeWorker = (row) => ({
  id: String(row?.worker_master_id || '').trim(),
  nameKo: String(row?.name_ko || '').trim(),
  birthDate: String(row?.birth_date || '').trim(),
  phoneLast4: String(row?.phone_last4 || '').trim(),
  phoneMasked: String(row?.phone_masked || '').trim(),
  recentTrade: String(row?.recent_trade || '').trim(),
  note: String(row?.note || '').trim(),
  isActive: row?.is_active !== false,
  createdAt: row?.created_at || '',
  updatedAt: row?.updated_at || '',
});

const formatKoreaDateTime = (value) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

export default function WorkerMasterManagement({
  canManage = false,
}) {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const loadWorkers = useCallback(
    async ({
      silent = false,
      searchQuery = query,
    } = {}) => {
      if (!silent) setLoading(true);

      const { data, error } = await supabase.rpc(
        'labor_worker_master_list_v52_33',
        {
          p_query: String(searchQuery || '').trim(),
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
        if (!silent) setLoading(false);
        return;
      }

      setRows(
        (Array.isArray(data) ? data : []).map(
          normalizeWorker,
        ),
      );

      if (!silent) setLoading(false);
    },
    [query],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkers({
        searchQuery: '',
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadWorkers]);

  const openNew = () => {
    if (!canManage) return;
    setDraft(emptyDraft());
    setEditorOpen(true);
  };

  const openEdit = (worker) => {
    if (!canManage) return;

    setDraft({
      id: worker.id,
      nameKo: worker.nameKo,
      birthDate: worker.birthDate,
      phoneLast4: worker.phoneLast4,
      recentTrade: worker.recentTrade,
      note: worker.note,
      isActive: worker.isActive,
    });
    setEditorOpen(true);
  };

  const saveWorker = async () => {
    if (!canManage || saving) return;

    const nameKo = draft.nameKo.trim();
    const phoneLast4 =
      draft.phoneLast4.replace(/\D/g, '');

    if (nameKo.length < 2) {
      setMessage({
        severity: 'warning',
        text: '성명을 2자 이상 입력해주세요.',
      });
      return;
    }

    if (
      phoneLast4 &&
      !/^\d{4}$/.test(phoneLast4)
    ) {
      setMessage({
        severity: 'warning',
        text:
          '휴대폰 뒤 4자리는 숫자 4자리로 입력해주세요.',
      });
      return;
    }

    setSaving(true);

    const { data, error } = await supabase.rpc(
      'labor_worker_master_upsert_v52_33',
      {
        p_worker_id: draft.id || null,
        p_name_ko: nameKo,
        p_birth_date:
          draft.birthDate || null,
        p_phone_last4:
          phoneLast4 || null,
        p_recent_trade:
          String(
            draft.recentTrade || '',
          ).trim() || null,
        p_note:
          String(
            draft.note || '',
          ).trim() || null,
        p_is_active:
          draft.isActive !== false,
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
          ? '근로자를 등록했습니다.'
          : '근로자 정보를 수정했습니다.',
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
        severity="warning"
        sx={{
          '& .MuiAlert-message': {
            fontSize: '0.72rem',
          },
        }}
      >
        v52.33에서는 근로자 식별용 최소정보만
        관리합니다. 주민등록번호·주소·전체
        휴대폰번호·계좌정보 등은 암호화 저장
        단계에서 별도 연결하며 현재 화면에는
        입력하지 않습니다.
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
            alignItems: 'center',
            bgcolor: '#f8fafc',
          }}
        >
          <Box sx={{ mr: 1 }}>
            <Typography
              sx={{
                fontWeight: 900,
                fontSize: '0.92rem',
              }}
            >
              근로자 정보관리
            </Typography>

            <Typography
              sx={{
                mt: 0.1,
                color: '#64748b',
                fontSize: '0.68rem',
              }}
            >
              회사 공통 근로자 마스터
            </Typography>
          </Box>

          <TextField
            size="small"
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void loadWorkers({
                  searchQuery: query,
                });
              }
            }}
            placeholder="성명 검색"
            sx={{ width: 210 }}
          />

          <Button
            size="small"
            variant="outlined"
            startIcon={<SearchRoundedIcon />}
            onClick={() =>
              void loadWorkers({
                searchQuery: query,
              })
            }
          >
            검색
          </Button>

          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshRoundedIcon />}
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
            startIcon={<AddRoundedIcon />}
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
            sx={{ minWidth: 920 }}
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
                    width: 140,
                    fontWeight: 900,
                  }}
                >
                  성명
                </TableCell>
                <TableCell
                  align="center"
                  sx={{
                    width: 130,
                    fontWeight: 900,
                  }}
                >
                  생년월일
                </TableCell>
                <TableCell
                  align="center"
                  sx={{
                    width: 130,
                    fontWeight: 900,
                  }}
                >
                  휴대폰
                </TableCell>
                <TableCell
                  sx={{
                    width: 150,
                    fontWeight: 900,
                  }}
                >
                  최근 공종
                </TableCell>
                <TableCell
                  sx={{ fontWeight: 900 }}
                >
                  비고
                </TableCell>
                <TableCell
                  align="center"
                  sx={{
                    width: 90,
                    fontWeight: 900,
                  }}
                >
                  상태
                </TableCell>
                <TableCell
                  align="center"
                  sx={{
                    width: 145,
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
                    colSpan={9}
                    align="center"
                    sx={{ py: 8 }}
                  >
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    align="center"
                    sx={{
                      py: 8,
                      color: '#94a3b8',
                    }}
                  >
                    등록된 근로자가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((worker, index) => (
                  <TableRow
                    key={worker.id}
                    hover
                  >
                    <TableCell align="center">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      {worker.nameKo || '-'}
                    </TableCell>
                    <TableCell align="center">
                      {worker.birthDate || '-'}
                    </TableCell>
                    <TableCell align="center">
                      {worker.phoneMasked ||
                        (worker.phoneLast4
                          ? `****${worker.phoneLast4}`
                          : '-')}
                    </TableCell>
                    <TableCell>
                      {worker.recentTrade || '-'}
                    </TableCell>
                    <TableCell>
                      {worker.note || '-'}
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
                          openEdit(worker)
                        }
                        disabled={!canManage}
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
                ))
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
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          {draft.id
            ? '근로자 정보 수정'
            : '근로자 등록'}
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={1.25}>
            <TextField
              fullWidth
              required
              size="small"
              label="성명"
              value={draft.nameKo}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  nameKo:
                    event.target.value,
                }))
              }
            />

            <TextField
              fullWidth
              size="small"
              type="date"
              label="생년월일"
              value={draft.birthDate}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  birthDate:
                    event.target.value,
                }))
              }
              InputLabelProps={{
                shrink: true,
              }}
            />

            <TextField
              fullWidth
              size="small"
              label="휴대폰 뒤 4자리"
              value={draft.phoneLast4}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  phoneLast4:
                    event.target.value
                      .replace(/\D/g, '')
                      .slice(0, 4),
                }))
              }
              inputProps={{
                inputMode: 'numeric',
                maxLength: 4,
              }}
              helperText="월별 노임작성 검색결과에서 동명이인 식별용으로만 사용합니다."
            />

            <Autocomplete
              freeSolo
              size="small"
              options={TRADE_OPTIONS}
              value={draft.recentTrade}
              onChange={(_event, value) =>
                setDraft((previous) => ({
                  ...previous,
                  recentTrade:
                    value || '',
                }))
              }
              onInputChange={(
                _event,
                value,
              ) =>
                setDraft((previous) => ({
                  ...previous,
                  recentTrade:
                    value || '',
                }))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="최근 공종"
                />
              )}
            />

            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              label="비고"
              value={draft.note}
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  note: event.target.value,
                }))
              }
            />

            <FormControlLabel
              control={
                <Switch
                  checked={draft.isActive}
                  onChange={(event) =>
                    setDraft(
                      (previous) => ({
                        ...previous,
                        isActive:
                          event.target
                            .checked,
                      }),
                    )
                  }
                />
              }
              label="사용중"
            />
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
            sx={{ boxShadow: 'none' }}
          >
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(message)}
        autoHideDuration={3500}
        onClose={() => setMessage(null)}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
      >
        <Alert
          severity={message?.severity || 'info'}
          variant="filled"
          onClose={() => setMessage(null)}
        >
          {message?.text || ''}
        </Alert>
      </Snackbar>
    </Box>
  );
}
