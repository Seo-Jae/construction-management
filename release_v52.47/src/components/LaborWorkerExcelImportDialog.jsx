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
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { supabase } from '../supabaseClient';
import {
  maskAccountNumber,
  maskIdentityNumber,
  maskPhoneNumber,
  parseLaborWorkerExcelFile,
} from '../utils/laborWorkerExcelImport.js';

const NATIONALITY_OPTIONS = [
  '대한민국',
  '중국',
  '베트남',
  '필리핀',
  '태국',
  '인도네시아',
  '몽골',
  '우즈베키스탄',
  '캄보디아',
  '네팔',
  '미얀마',
  '스리랑카',
  '방글라데시',
  '파키스탄',
  '인도',
  '러시아',
  '카자흐스탄',
  '키르기스스탄',
  '라오스',
  '동티모르',
  '기타',
];

const FIELD_LABELS = {
  name: '성명',
  resident_no: '주민등록번호',
  phone: '전체 휴대폰번호',
  bank: '은행',
  account: '계좌번호',
  account_holder: '예금주',
  nationality: '국적',
  domestic_foreign: '내/외국인',
  english_name: '영문 성명',
  stay_status: '체류자격',
  duplicate_in_file: '파일 내 중복',
  duplicate_existing: '기존 마스터 중복',
};

const normalizePreviewRow = (
  source,
  result,
) => ({
  ...source,
  status:
    String(
      result?.status ||
        'pending',
    ),
  worker_master_id:
    result?.worker_master_id ||
    null,
  existing_name:
    result?.existing_name ||
    '',
  birth_date:
    result?.birth_date ||
    '',
  missing_fields:
    Array.isArray(
      result?.missing_fields,
    )
      ? result.missing_fields
      : [],
  include:
    result?.status === 'conflict'
      ? false
      : source.include !== false,
});

const statusConfig = (status) => {
  switch (status) {
    case 'new':
      return {
        label: '신규 등록',
        color: 'success',
      };
    case 'existing':
      return {
        label: '기존 업데이트',
        color: 'info',
      };
    case 'conflict':
      return {
        label: '충돌',
        color: 'error',
      };
    case 'missing':
      return {
        label: '보완 필요',
        color: 'warning',
      };
    default:
      return {
        label: '검증 대기',
        color: 'default',
      };
  }
};

const missingText = (fields) => {
  if (!Array.isArray(fields) || fields.length === 0) {
    return '-';
  }

  return fields
    .map((field) =>
      FIELD_LABELS[field] || field,
    )
    .join(' · ');
};

export default function LaborWorkerExcelImportDialog({
  open,
  canManage = false,
  onClose,
  onImported,
}) {
  const [fileName, setFileName] =
    useState('');
  const [rows, setRows] =
    useState([]);
  const [loading, setLoading] =
    useState(false);
  const [importing, setImporting] =
    useState(false);
  const [errorText, setErrorText] =
    useState('');

  useEffect(() => {
    if (!open) {
      setFileName('');
      setRows([]);
      setLoading(false);
      setImporting(false);
      setErrorText('');
    }
  }, [open]);

  const includedRows = useMemo(
    () =>
      rows.filter(
        (row) => row.include !== false,
      ),
    [rows],
  );

  const invalidIncluded =
    includedRows.some(
      (row) =>
        row.status === 'missing' ||
        row.status === 'conflict' ||
        row.status === 'pending',
    );

  const previewRows = async (
    nextRows,
  ) => {
    if (!canManage) {
      setErrorText(
        '근로자 정보관리 권한이 없습니다.',
      );
      return;
    }

    setLoading(true);
    setErrorText('');

    const { data, error } =
      await supabase.rpc(
        'labor_worker_excel_preview_v52_47',
        {
          p_rows: nextRows,
        },
      );

    setLoading(false);

    if (error) {
      setErrorText(
        error.message ||
          'Excel 근로자 검증에 실패했습니다.',
      );
      return;
    }

    const results =
      Array.isArray(data?.rows)
        ? data.rows
        : [];

    const bySourceRow = new Map(
      results.map((item) => [
        Number(item.source_row),
        item,
      ]),
    );

    setRows(
      nextRows.map((row) =>
        normalizePreviewRow(
          row,
          bySourceRow.get(
            Number(row.source_row),
          ),
        ),
      ),
    );
  };

  const handleFile = async (event) => {
    const file =
      event.target.files?.[0] ||
      null;

    event.target.value = '';

    if (!file) return;

    setLoading(true);
    setErrorText('');

    try {
      const parsed =
        await parseLaborWorkerExcelFile(
          file,
        );

      setFileName(file.name);
      setRows(parsed);
      setLoading(false);
      await previewRows(parsed);
    } catch (error) {
      setLoading(false);
      setRows([]);
      setFileName('');
      setErrorText(
        error?.message ||
          'Excel 파일을 읽지 못했습니다.',
      );
    }
  };

  const changeNationality = (
    sourceRow,
    nationality,
  ) => {
    const nextRows = rows.map(
      (row) =>
        Number(row.source_row) ===
        Number(sourceRow)
          ? {
              ...row,
              nationality:
                nationality || '',
            }
          : row,
    );

    setRows(nextRows);
    void previewRows(nextRows);
  };

  const toggleInclude = (
    sourceRow,
  ) => {
    setRows((previous) =>
      previous.map((row) =>
        Number(row.source_row) ===
        Number(sourceRow)
          ? {
              ...row,
              include:
                row.include === false,
            }
          : row,
      ),
    );
  };

  const importRows = async () => {
    if (
      !canManage ||
      importing ||
      includedRows.length === 0 ||
      invalidIncluded
    ) {
      return;
    }

    setImporting(true);
    setErrorText('');

    const { data, error } =
      await supabase.rpc(
        'labor_worker_excel_import_v52_47',
        {
          p_rows: rows,
        },
      );

    setImporting(false);

    if (error) {
      setErrorText(
        error.message ||
          '근로자 Excel 등록에 실패했습니다.',
      );
      return;
    }

    await onImported?.({
      created:
        Number(data?.created || 0),
      updated:
        Number(data?.updated || 0),
      skipped:
        Number(data?.skipped || 0),
    });
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!loading && !importing) {
          onClose?.();
        }
      }}
      fullWidth
      maxWidth="xl"
    >
      <DialogTitle
        sx={{ fontWeight: 900 }}
      >
        기존 노무비 Excel 업로드
      </DialogTitle>

      <DialogContent dividers>
        <Alert
          severity="info"
          sx={{ mb: 1.2 }}
        >
          회사 노무비명세서의 A:H만 읽습니다. I:AV는 읽거나 저장하지 않습니다.
          파일 원본 자체도 서버에 보관하지 않고 브라우저에서 분석 후 근로자 정보만 암호화 저장합니다.
        </Alert>

        <Stack
          direction={{
            xs: 'column',
            md: 'row',
          }}
          spacing={0.8}
          alignItems={{
            xs: 'stretch',
            md: 'center',
          }}
        >
          <Button
            component="label"
            variant="outlined"
            startIcon={
              <UploadFileRoundedIcon />
            }
            disabled={loading || importing}
          >
            Excel 파일 선택
            <input
              hidden
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFile}
            />
          </Button>

          <Typography
            sx={{
              color: '#475569',
              fontSize: '0.74rem',
              fontWeight: 800,
            }}
          >
            {fileName ||
              '선택된 파일 없음'}
          </Typography>

          {rows.length > 0 ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={
                <RefreshRoundedIcon />
              }
              onClick={() =>
                void previewRows(rows)
              }
              disabled={loading || importing}
              sx={{ ml: { md: 'auto' } }}
            >
              검증 다시하기
            </Button>
          ) : null}
        </Stack>

        {errorText ? (
          <Alert
            severity="error"
            sx={{ mt: 1 }}
          >
            {errorText}
          </Alert>
        ) : null}

        <Box
          sx={{
            mt: 1.2,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.7,
            alignItems: 'center',
          }}
        >
          <Chip
            size="small"
            label={`전체 ${rows.length}명`}
          />
          <Chip
            size="small"
            color="success"
            variant="outlined"
            label={`신규 ${rows.filter((row) => row.status === 'new').length}명`}
          />
          <Chip
            size="small"
            color="info"
            variant="outlined"
            label={`기존 ${rows.filter((row) => row.status === 'existing').length}명`}
          />
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            label={`보완 ${rows.filter((row) => row.status === 'missing').length}명`}
          />
          <Chip
            size="small"
            color="error"
            variant="outlined"
            label={`충돌 ${rows.filter((row) => row.status === 'conflict').length}명`}
          />
        </Box>

        <Paper
          variant="outlined"
          sx={{
            mt: 0.8,
            height: 470,
            overflow: 'auto',
            borderColor: '#cbd5e1',
            boxShadow: 'none',
          }}
        >
          {loading ? (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CircularProgress size={28} />
            </Box>
          ) : rows.length === 0 ? (
            <Box
              sx={{
                py: 8,
                textAlign: 'center',
                color: '#94a3b8',
              }}
            >
              회사 노무비명세서 Excel을 선택해주세요.
            </Box>
          ) : (
            <Table
              stickyHeader
              size="small"
              sx={{ minWidth: 1250 }}
            >
              <TableHead>
                <TableRow>
                  <TableCell align="center">행</TableCell>
                  <TableCell>성명</TableCell>
                  <TableCell>공종</TableCell>
                  <TableCell align="center">내/외국인</TableCell>
                  <TableCell align="center">주민번호</TableCell>
                  <TableCell align="center">휴대폰</TableCell>
                  <TableCell>은행</TableCell>
                  <TableCell>예금주</TableCell>
                  <TableCell align="center">계좌</TableCell>
                  <TableCell sx={{ minWidth: 170 }}>국적</TableCell>
                  <TableCell sx={{ minWidth: 170 }}>검증</TableCell>
                  <TableCell align="center">처리</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {rows.map((row) => {
                  const config =
                    statusConfig(
                      row.status,
                    );
                  const isForeign =
                    row.domestic_foreign ===
                    '외국인';

                  return (
                    <TableRow
                      key={`${row.source_row}-${row.name_ko}`}
                      hover
                      sx={{
                        opacity:
                          row.include === false
                            ? 0.48
                            : 1,
                      }}
                    >
                      <TableCell align="center">
                        {row.source_row}
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontWeight: 900, fontSize: '0.76rem' }}>
                          {row.name_ko || '-'}
                        </Typography>
                        {row.english_name ? (
                          <Typography sx={{ color: '#64748b', fontSize: '0.66rem' }}>
                            {row.english_name}
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell>{row.recent_trade || '-'}</TableCell>
                      <TableCell align="center">
                        {row.domestic_foreign || '-'}
                        {row.stay_status ? (
                          <Typography sx={{ color: '#64748b', fontSize: '0.65rem' }}>
                            {row.stay_status}
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell align="center">
                        {maskIdentityNumber(row.resident_no)}
                      </TableCell>
                      <TableCell align="center">
                        {maskPhoneNumber(row.phone_number)}
                      </TableCell>
                      <TableCell>{row.bank_name || '-'}</TableCell>
                      <TableCell>
                        {row.account_holder || '-'}
                        {row.english_account_holder ? (
                          <Typography sx={{ color: '#64748b', fontSize: '0.65rem' }}>
                            {row.english_account_holder}
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell align="center">
                        {maskAccountNumber(row.account_number)}
                      </TableCell>
                      <TableCell>
                        {isForeign ? (
                          <Autocomplete
                            autoHighlight
                            autoSelect
                            size="small"
                            options={NATIONALITY_OPTIONS.filter((item) => item !== '대한민국')}
                            value={row.nationality || null}
                            onChange={(_event, value) =>
                              changeNationality(
                                row.source_row,
                                value || '',
                              )
                            }
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="국적"
                                placeholder="외국인 국적 선택"
                              />
                            )}
                          />
                        ) : (
                          '대한민국'
                        )}
                      </TableCell>
                      <TableCell>
                        <Stack spacing={0.35} alignItems="flex-start">
                          <Chip
                            size="small"
                            color={config.color}
                            variant="outlined"
                            label={config.label}
                          />
                          <Typography
                            sx={{
                              color:
                                row.status === 'conflict'
                                  ? '#b91c1c'
                                  : '#64748b',
                              fontSize: '0.64rem',
                              lineHeight: 1.4,
                            }}
                          >
                            {row.status === 'conflict' && row.existing_name
                              ? `기존 성명: ${row.existing_name}`
                              : missingText(row.missing_fields)}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="small"
                          variant={
                            row.include === false
                              ? 'outlined'
                              : 'contained'
                          }
                          color={
                            row.include === false
                              ? 'inherit'
                              : 'primary'
                          }
                          onClick={() =>
                            toggleInclude(
                              row.source_row,
                            )
                          }
                          sx={{
                            minWidth: 58,
                            boxShadow: 'none',
                          }}
                        >
                          {row.include === false
                            ? '제외됨'
                            : '등록'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Paper>

        <Typography
          sx={{
            mt: 0.75,
            color: '#64748b',
            fontSize: '0.66rem',
            lineHeight: 1.5,
          }}
        >
          외국인 행은 원본 A:H에 정확한 국적 정보가 없으므로 국적을 선택해야 합니다.
          주민번호가 같은 기존 근로자는 새로 중복 생성하지 않고 기존 보호정보를 업데이트합니다.
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button
          onClick={() => onClose?.()}
          disabled={loading || importing}
        >
          취소
        </Button>

        <Button
          variant="contained"
          onClick={() => void importRows()}
          disabled={
            loading ||
            importing ||
            includedRows.length === 0 ||
            invalidIncluded
          }
          sx={{ boxShadow: 'none' }}
        >
          {importing
            ? '암호화 등록 중...'
            : `최종 등록 ${includedRows.length}명`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
