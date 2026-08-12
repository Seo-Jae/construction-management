import React, {
  useEffect,
  useMemo,
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
  Divider,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import PersonSearchRoundedIcon from '@mui/icons-material/PersonSearchRounded';
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

const getKoreaYearMonth = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());

  const values = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  });

  return `${values.year}-${values.month}`;
};

const createTemporaryWorker = () => ({
  id: `temporary-${Date.now()}-${Math.random()}`,
  workerMasterId: '',
  name: '',
  trade: '',
  birthDate: '',
  phoneMasked: '',
  note: '',
});

const normalizeWorkerOption = (worker) => ({
  id: String(
    worker?.worker_master_id ||
      worker?.id ||
      '',
  ).trim(),
  name: String(
    worker?.name_ko ||
      worker?.name ||
      '',
  ).trim(),
  trade: String(
    worker?.recent_trade ||
      worker?.trade ||
      '',
  ).trim(),
  birthDate: String(
    worker?.birth_date ||
      worker?.birthDate ||
      '',
  ).trim(),
  phoneMasked: String(
    worker?.phone_masked ||
      worker?.phone_last4 ||
      '',
  ).trim(),
});

const formatLookupBirthDate = (value) => {
  if (!value) return '-';
  return String(value).trim();
};

const formatLookupPhone = (value) => {
  if (!value) return '-';

  const normalized = String(value).trim();

  if (/^\d{4}$/.test(normalized)) {
    return `****${normalized}`;
  }

  if (
    normalized.startsWith('****') ||
    normalized.includes('*')
  ) {
    return normalized;
  }

  const digits = normalized.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `****${digits.slice(-4)}`;
  }

  return '-';
};

const moveRowsOneStep = (
  rows,
  selectedIds,
  direction,
) => {
  const selectedSet = new Set(selectedIds);
  const next = [...rows];

  if (direction === 'up') {
    for (
      let index = 1;
      index < next.length;
      index += 1
    ) {
      if (
        selectedSet.has(next[index].id) &&
        !selectedSet.has(next[index - 1].id)
      ) {
        [next[index - 1], next[index]] = [
          next[index],
          next[index - 1],
        ];
      }
    }

    return next;
  }

  for (
    let index = next.length - 2;
    index >= 0;
    index -= 1
  ) {
    if (
      selectedSet.has(next[index].id) &&
      !selectedSet.has(next[index + 1].id)
    ) {
      [next[index], next[index + 1]] = [
        next[index + 1],
        next[index],
      ];
    }
  }

  return next;
};

export default function MonthlyLaborManagement({
  projectName,
}) {
  const [yearMonth, setYearMonth] =
    useState(getKoreaYearMonth);
  const [rows, setRows] = useState([]);
  const [selectedIds, setSelectedIds] =
    useState([]);
  const [lookupOpen, setLookupOpen] =
    useState(false);
  const [lookupQuery, setLookupQuery] =
    useState('');
  const [lookupResults, setLookupResults] =
    useState([]);
  const [lookupLoading, setLookupLoading] =
    useState(false);
  const [lookupMessage, setLookupMessage] =
    useState('');
  const [bulkTrade, setBulkTrade] =
    useState('');

  useEffect(() => {
    setRows([]);
    setSelectedIds([]);
    setLookupQuery('');
    setLookupResults([]);
    setLookupMessage('');
    setLookupOpen(false);
  }, [projectName]);

  const selectedSet = useMemo(
    () => new Set(selectedIds),
    [selectedIds],
  );

  const allSelected =
    rows.length > 0 &&
    selectedIds.length === rows.length;

  const partiallySelected =
    selectedIds.length > 0 &&
    selectedIds.length < rows.length;

  const searchWorkers = async () => {
    const query = lookupQuery.trim();

    if (query.length < 2) {
      setLookupResults([]);
      setLookupMessage(
        '성명을 2자 이상 입력해주세요.',
      );
      return;
    }

    if (!projectName) {
      setLookupResults([]);
      setLookupMessage(
        '현장을 먼저 선택해주세요.',
      );
      return;
    }

    setLookupLoading(true);
    setLookupMessage('');

    const { data, error } = await supabase.rpc(
      'labor_worker_master_search_v52_33',
      {
        p_query: query,
        p_project_name: projectName,
      },
    );

    setLookupLoading(false);

    if (error) {
      setLookupResults([]);
      setLookupMessage(
        error.message ||
          '근로자 조회에 실패했습니다.',
      );
      return;
    }

    const next = (
      Array.isArray(data) ? data : []
    ).map(normalizeWorkerOption);

    setLookupResults(next);

    if (next.length === 0) {
      setLookupMessage(
        '검색된 기존 근로자가 없습니다.',
      );
    }
  };

  const openLookup = () => {
    setLookupOpen(true);
    setLookupQuery('');
    setLookupResults([]);
    setLookupMessage('');
  };

  const addTemporaryWorker = () => {
    setRows((previous) => [
      ...previous,
      createTemporaryWorker(),
    ]);
  };

  const addWorkerFromMaster = (worker) => {
    if (!worker?.id) return;

    setRows((previous) => {
      if (
        previous.some(
          (row) =>
            row.workerMasterId === worker.id,
        )
      ) {
        return previous;
      }

      return [
        ...previous,
        {
          id: `master-${worker.id}-${Date.now()}`,
          workerMasterId: worker.id,
          name: worker.name,
          trade: worker.trade,
          birthDate: worker.birthDate,
          phoneMasked: worker.phoneMasked,
          note: '',
        },
      ];
    });
  };

  const updateRow = (
    rowId,
    field,
    value,
  ) => {
    setRows((previous) =>
      previous.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    );
  };

  const toggleRow = (rowId) => {
    setSelectedIds((previous) =>
      previous.includes(rowId)
        ? previous.filter(
            (id) => id !== rowId,
          )
        : [...previous, rowId],
    );
  };

  const toggleAll = (checked) => {
    setSelectedIds(
      checked
        ? rows.map((row) => row.id)
        : [],
    );
  };

  const deleteSelected = () => {
    if (selectedIds.length === 0) return;

    setRows((previous) =>
      previous.filter(
        (row) =>
          !selectedSet.has(row.id),
      ),
    );

    setSelectedIds([]);
  };

  const moveSelected = (direction) => {
    if (selectedIds.length === 0) return;

    setRows((previous) =>
      moveRowsOneStep(
        previous,
        selectedIds,
        direction,
      ),
    );
  };

  const applyBulkTrade = () => {
    const nextTrade =
      String(bulkTrade || '').trim();

    if (
      !nextTrade ||
      selectedIds.length === 0
    ) {
      return;
    }

    setRows((previous) =>
      previous.map((row) =>
        selectedSet.has(row.id)
          ? {
              ...row,
              trade: nextTrade,
            }
          : row,
      ),
    );
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
      <Paper
        variant="outlined"
        sx={{
          px: 1.5,
          py: 1.25,
          borderColor: '#cbd5e1',
        }}
      >
        <Stack
          direction={{
            xs: 'column',
            md: 'row',
          }}
          spacing={1}
          alignItems={{
            xs: 'stretch',
            md: 'center',
          }}
        >
          <Box
            sx={{
              minWidth: 0,
              flexGrow: 1,
            }}
          >
            <Typography
              sx={{
                fontSize: '0.95rem',
                fontWeight: 900,
                color: '#0f172a',
              }}
            >
              월별 노임작성
            </Typography>

            <Typography
              sx={{
                mt: 0.2,
                color: '#64748b',
                fontSize: '0.72rem',
              }}
            >
              {projectName ||
                '현장 미선택'}
              {' · '}
              근로자 명단 구성
            </Typography>
          </Box>

          <TextField
            type="month"
            size="small"
            label="작성월"
            value={yearMonth}
            onChange={(event) =>
              setYearMonth(
                event.target.value,
              )
            }
            InputLabelProps={{
              shrink: true,
            }}
            sx={{ width: 170 }}
          />
        </Stack>
      </Paper>

      <Alert
        severity="info"
        sx={{
          py: 0.2,
          '& .MuiAlert-message': {
            py: 0.45,
            fontSize: '0.72rem',
          },
        }}
      >
        기존 근로자는 회사 공통 근로자
        마스터에서 성명으로 조회합니다.
        검색 결과에는 생년월일·휴대폰
        뒤 4자리·최근 공종만 표시됩니다.
      </Alert>

      <Paper
        variant="outlined"
        sx={{
          borderColor: '#cbd5e1',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          flexGrow: 1,
        }}
      >
        <Box
          sx={{
            px: 1,
            py: 0.75,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 0.5,
            bgcolor: '#f8fafc',
          }}
        >
          <Button
            size="small"
            variant="contained"
            startIcon={
              <PersonSearchRoundedIcon />
            }
            onClick={openLookup}
            sx={{
              boxShadow: 'none',
              fontWeight: 800,
            }}
          >
            근로자 조회
          </Button>

          <Tooltip title="신규 근로자 행 추가">
            <IconButton
              size="small"
              onClick={addTemporaryWorker}
              aria-label="신규 근로자 추가"
            >
              <AddCircleOutlineRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="선택 삭제">
            <span>
              <IconButton
                size="small"
                disabled={
                  selectedIds.length === 0
                }
                onClick={deleteSelected}
                aria-label="선택 근로자 삭제"
              >
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Divider
            orientation="vertical"
            flexItem
            sx={{ mx: 0.25 }}
          />

          <Tooltip title="선택 근로자 위로">
            <span>
              <IconButton
                size="small"
                disabled={
                  selectedIds.length === 0
                }
                onClick={() =>
                  moveSelected('up')
                }
                aria-label="선택 근로자 위로"
              >
                <ArrowUpwardRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="선택 근로자 아래로">
            <span>
              <IconButton
                size="small"
                disabled={
                  selectedIds.length === 0
                }
                onClick={() =>
                  moveSelected('down')
                }
                aria-label="선택 근로자 아래로"
              >
                <ArrowDownwardRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Divider
            orientation="vertical"
            flexItem
            sx={{ mx: 0.25 }}
          />

          <Autocomplete
            freeSolo
            size="small"
            options={TRADE_OPTIONS}
            value={bulkTrade}
            onChange={(
              _event,
              value,
            ) =>
              setBulkTrade(value || '')
            }
            onInputChange={(
              _event,
              value,
            ) =>
              setBulkTrade(value || '')
            }
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="공종 일괄변경"
              />
            )}
            sx={{ width: 155 }}
          />

          <Button
            size="small"
            variant="outlined"
            disabled={
              selectedIds.length === 0 ||
              !String(
                bulkTrade || '',
              ).trim()
            }
            onClick={applyBulkTrade}
            sx={{ fontWeight: 800 }}
          >
            적용
          </Button>

          <Typography
            sx={{
              ml: 'auto',
              color: '#64748b',
              fontSize: '0.72rem',
              fontWeight: 800,
            }}
          >
            총 {rows.length}명 · 선택{' '}
            {selectedIds.length}명
          </Typography>
        </Box>

        <Divider />

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
              minWidth: 920,
              tableLayout: 'fixed',
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell
                  padding="checkbox"
                  align="center"
                  sx={{ width: 46 }}
                >
                  <Checkbox
                    size="small"
                    checked={allSelected}
                    indeterminate={
                      partiallySelected
                    }
                    onChange={(event) =>
                      toggleAll(
                        event.target
                          .checked,
                      )
                    }
                  />
                </TableCell>

                <TableCell
                  align="center"
                  sx={{
                    width: 54,
                    fontWeight: 900,
                  }}
                >
                  순번
                </TableCell>

                <TableCell
                  align="center"
                  sx={{
                    width: 150,
                    fontWeight: 900,
                  }}
                >
                  성명
                </TableCell>

                <TableCell
                  align="center"
                  sx={{
                    width: 170,
                    fontWeight: 900,
                  }}
                >
                  공종
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
                  align="center"
                  sx={{
                    fontWeight: 900,
                  }}
                >
                  비고
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    align="center"
                    sx={{
                      py: 10,
                      color: '#94a3b8',
                    }}
                  >
                    근로자 조회 또는 신규
                    추가로 명단을
                    구성해주세요.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(
                  (row, index) => (
                    <TableRow
                      key={row.id}
                      hover
                      selected={selectedSet.has(
                        row.id,
                      )}
                    >
                      <TableCell
                        padding="checkbox"
                        align="center"
                      >
                        <Checkbox
                          size="small"
                          checked={selectedSet.has(
                            row.id,
                          )}
                          onChange={() =>
                            toggleRow(
                              row.id,
                            )
                          }
                        />
                      </TableCell>

                      <TableCell align="center">
                        {index + 1}
                      </TableCell>

                      <TableCell>
                        <TextField
                          fullWidth
                          size="small"
                          value={row.name}
                          placeholder="성명"
                          onChange={(
                            event,
                          ) =>
                            updateRow(
                              row.id,
                              'name',
                              event.target
                                .value,
                            )
                          }
                        />
                      </TableCell>

                      <TableCell>
                        <Autocomplete
                          freeSolo
                          size="small"
                          options={
                            TRADE_OPTIONS
                          }
                          value={
                            row.trade ||
                            ''
                          }
                          onChange={(
                            _event,
                            value,
                          ) =>
                            updateRow(
                              row.id,
                              'trade',
                              value || '',
                            )
                          }
                          onInputChange={(
                            _event,
                            value,
                          ) =>
                            updateRow(
                              row.id,
                              'trade',
                              value || '',
                            )
                          }
                          renderInput={(
                            params,
                          ) => (
                            <TextField
                              {...params}
                              placeholder="공종"
                            />
                          )}
                        />
                      </TableCell>

                      <TableCell align="center">
                        {row.birthDate ||
                          '-'}
                      </TableCell>

                      <TableCell align="center">
                        {formatLookupPhone(
                          row.phoneMasked,
                        )}
                      </TableCell>

                      <TableCell>
                        <TextField
                          fullWidth
                          size="small"
                          value={row.note}
                          placeholder="비고"
                          onChange={(
                            event,
                          ) =>
                            updateRow(
                              row.id,
                              'note',
                              event.target
                                .value,
                            )
                          }
                        />
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
        open={lookupOpen}
        onClose={() =>
          setLookupOpen(false)
        }
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle
          sx={{ fontWeight: 900 }}
        >
          근로자 조회
        </DialogTitle>

        <DialogContent dividers>
          <Typography
            sx={{
              mb: 1.25,
              color: '#64748b',
              fontSize: '0.75rem',
            }}
          >
            성명을 검색하고 추가한 뒤
            창을 닫지 않고 다음 근로자를
            계속 검색·추가할 수 있습니다.
          </Typography>

          <Stack
            direction="row"
            spacing={0.75}
          >
            <TextField
              fullWidth
              autoFocus
              size="small"
              label="성명 검색"
              value={lookupQuery}
              onChange={(event) =>
                setLookupQuery(
                  event.target.value,
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter'
                ) {
                  event.preventDefault();
                  void searchWorkers();
                }
              }}
              placeholder="예: 김철수"
            />

            <Button
              variant="contained"
              onClick={() =>
                void searchWorkers()
              }
              disabled={lookupLoading}
              startIcon={
                lookupLoading ? (
                  <CircularProgress
                    size={15}
                    color="inherit"
                  />
                ) : (
                  <SearchRoundedIcon />
                )
              }
              sx={{
                minWidth: 92,
                boxShadow: 'none',
              }}
            >
              검색
            </Button>
          </Stack>

          <Stack
            spacing={0.75}
            sx={{ mt: 1.5 }}
          >
            {lookupMessage && (
              <Box
                sx={{
                  py: 3,
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: '0.76rem',
                }}
              >
                {lookupMessage}
              </Box>
            )}

            {!lookupMessage &&
              lookupResults.map(
                (worker) => {
                  const alreadyAdded =
                    rows.some(
                      (row) =>
                        row.workerMasterId ===
                        worker.id,
                    );

                  return (
                    <Paper
                      key={worker.id}
                      variant="outlined"
                      sx={{
                        p: 1,
                        display: 'flex',
                        alignItems:
                          'center',
                        gap: 1,
                        borderColor:
                          '#cbd5e1',
                      }}
                    >
                      <Box
                        sx={{
                          minWidth: 0,
                          flexGrow: 1,
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize:
                              '0.8rem',
                            fontWeight: 900,
                          }}
                        >
                          {worker.name ||
                            '-'}
                        </Typography>

                        <Typography
                          sx={{
                            mt: 0.2,
                            color:
                              '#64748b',
                            fontSize:
                              '0.68rem',
                          }}
                        >
                          {formatLookupBirthDate(
                            worker.birthDate,
                          )}
                          {' · '}
                          {formatLookupPhone(
                            worker.phoneMasked,
                          )}
                          {worker.trade
                            ? ` · ${worker.trade}`
                            : ''}
                        </Typography>
                      </Box>

                      <Button
                        size="small"
                        variant={
                          alreadyAdded
                            ? 'outlined'
                            : 'contained'
                        }
                        disabled={
                          alreadyAdded
                        }
                        onClick={() =>
                          addWorkerFromMaster(
                            worker,
                          )
                        }
                        sx={{
                          boxShadow:
                            'none',
                        }}
                      >
                        {alreadyAdded
                          ? '추가됨'
                          : '추가'}
                      </Button>
                    </Paper>
                  );
                },
              )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={
              addTemporaryWorker
            }
            startIcon={
              <AddCircleOutlineRoundedIcon />
            }
          >
            신규 근로자 추가
          </Button>

          <Button
            variant="contained"
            onClick={() =>
              setLookupOpen(false)
            }
            sx={{
              boxShadow: 'none',
            }}
          >
            완료
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
