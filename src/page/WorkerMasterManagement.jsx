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
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
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
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { supabase } from '../supabaseClient';
import LaborWorkerExcelImportDialog from '../components/LaborWorkerExcelImportDialog.jsx';

import SystemPageTitle from '../components/SystemPageTitle.jsx';
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

const NATIONALITY_OPTIONS = [
  '대한민국', '중국', '베트남', '필리핀', '태국', '인도네시아',
  '몽골', '우즈베키스탄', '캄보디아', '네팔', '미얀마', '스리랑카',
  '방글라데시', '파키스탄', '인도', '러시아', '카자흐스탄',
  '키르기스스탄', '라오스', '동티모르', '기타',
];

const NATIONALITY_SEARCH_ALIASES = {
  대한민국: ['대한민국', '한국', '남한', 'korea', 'south korea', 'republic of korea', 'rok', 'kor'],
  중국: ['중국', 'china', 'prc', 'cn'],
  베트남: ['베트남', 'vietnam', 'viet nam', 'vn'],
  필리핀: ['필리핀', 'philippines', 'philippine', 'ph'],
  태국: ['태국', 'thailand', 'thai', 'th'],
  인도네시아: ['인도네시아', 'indonesia', 'id'],
  몽골: ['몽골', 'mongolia', 'mn'],
  우즈베키스탄: ['우즈베키스탄', 'uzbekistan', 'uz'],
  캄보디아: ['캄보디아', 'cambodia', 'kh'],
  네팔: ['네팔', 'nepal', 'np'],
  미얀마: ['미얀마', 'myanmar', 'burma', 'mm'],
  스리랑카: ['스리랑카', 'sri lanka', 'srilanka', 'lk'],
  방글라데시: ['방글라데시', 'bangladesh', 'bd'],
  파키스탄: ['파키스탄', 'pakistan', 'pk'],
  인도: ['인도', 'india', 'in'],
  러시아: ['러시아', 'russia', 'russian federation', 'ru'],
  카자흐스탄: ['카자흐스탄', 'kazakhstan', 'kz'],
  키르기스스탄: ['키르기스스탄', 'kyrgyzstan', 'kg'],
  라오스: ['라오스', 'laos', 'lao', 'la'],
  동티모르: ['동티모르', 'timor-leste', 'timorleste', 'east timor', 'tl'],
  기타: ['기타', 'other', 'others'],
};

const normalizeSearchText = (value) =>
  String(value || '').trim().toLowerCase().replace(/[\s._-]+/g, '');

const filterNationalityOptions = (options, state) => {
  const query = normalizeSearchText(state?.inputValue);
  if (!query) return options;
  return options.filter((option) =>
    (NATIONALITY_SEARCH_ALIASES[option] || [option]).some((alias) =>
      normalizeSearchText(alias).includes(query),
    ),
  );
};

const CURRENT_YEAR = new Date().getFullYear();
const BIRTH_YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - 1920 + 1 },
  (_unused, index) => String(CURRENT_YEAR - index),
);
const BIRTH_MONTH_OPTIONS = Array.from(
  { length: 12 },
  (_unused, index) => String(index + 1).padStart(2, '0'),
);

const splitBirthDate = (value) => {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return matched
    ? { year: matched[1], month: matched[2], day: matched[3] }
    : { year: '', month: '', day: '' };
};

const getBirthDayOptions = (year, month) => {
  if (!year || !month) return [];
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  return Array.from(
    { length: lastDay },
    (_unused, index) => String(index + 1).padStart(2, '0'),
  );
};

const buildBirthDate = (year, month, day) => {
  if (!year && !month && !day) return null;
  if (!year || !month || !day) return '';
  return getBirthDayOptions(year, month).includes(day)
    ? `${year}-${month}-${day}`
    : '';
};

const emptyDraft = () => ({
  id: '',
  nameKo: '',
  birthYear: '',
  birthMonth: '',
  birthDay: '',
  phoneLast4: '',
  recentTrade: '',
  note: '',
  isActive: true,

  residentRegistrationNumber: '',
  fullPhoneNumber: '',
  address: '',
  nationality: '',
  bankName: '',
  accountNumber: '',
  accountHolder: '',
  englishName: '',
  stayStatus: '',
  englishAccountHolder: '',
  isForeign: false,

  hasPrivateData: false,
  hasResidentNo: false,
  hasPrivatePhone: false,
  hasAddress: false,
  hasAccount: false,
  hasAccountHolder: false,
  hasNationality: false,
  hasEnglishName: false,
  hasStayStatus: false,
  hasEnglishAccountHolder: false,
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
  hasPrivatePhone:
    row?.has_private_phone === true,
  hasAddress:
    row?.has_address === true,
  hasAccount:
    row?.has_account === true,
  hasAccountHolder:
    row?.has_account_holder === true,
  hasNationality:
    row?.has_nationality === true,
  isForeign:
    row?.is_foreign === true,
  hasEnglishName:
    row?.has_english_name === true,
  hasStayStatus:
    row?.has_stay_status === true,
  hasEnglishAccountHolder:
    row?.has_english_account_holder === true,
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

  if (worker.hasEnglishName) {
    labels.push('영문성명');
  }

  if (worker.hasStayStatus) {
    labels.push('체류자격');
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
  const [excelUploadOpen, setExcelUploadOpen] =
    useState(false);
  const [draft, setDraft] =
    useState(emptyDraft);
  const [saving, setSaving] =
    useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState(null);
  const [deleting, setDeleting] =
    useState(false);
  const [message, setMessage] =
    useState(null);
  const [guideOpen, setGuideOpen] = useState(true);

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
          'labor_worker_master_list_v52_47',
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

    const birth = splitBirthDate(worker.birthDate);

    setDraft({
      ...emptyDraft(),

      id: worker.id,
      nameKo: worker.nameKo,
      birthYear: birth.year,
      birthMonth: birth.month,
      birthDay: birth.day,
      phoneLast4: worker.phoneLast4,
      recentTrade:
        worker.recentTrade,
      note: worker.note,
      isActive: worker.isActive,

      hasPrivateData:
        worker.hasPrivateData,
      hasResidentNo:
        worker.hasResidentNo,
      hasPrivatePhone:
        worker.hasPrivatePhone,
      hasAddress:
        worker.hasAddress,
      hasAccount:
        worker.hasAccount,
      hasAccountHolder:
        worker.hasAccountHolder,
      hasNationality:
        worker.hasNationality,
      isForeign:
        worker.isForeign,
      hasEnglishName:
        worker.hasEnglishName,
      hasStayStatus:
        worker.hasStayStatus,
      hasEnglishAccountHolder:
        worker.hasEnglishAccountHolder,
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

    const fullPhone =
      digitsOnly(
        draft.fullPhoneNumber,
      );

    const accountNumber =
      digitsOnly(
        draft.accountNumber,
      );

    const nationality = String(draft.nationality || '').trim();
    const bankName = String(draft.bankName || '').trim();
    const accountHolder = String(draft.accountHolder || '').trim();
    const englishName = String(draft.englishName || '').trim();
    const stayStatus = String(draft.stayStatus || '').trim();
    const englishAccountHolder = String(draft.englishAccountHolder || '').trim();
    const finalIsForeign = nationality
      ? nationality !== '대한민국'
      : draft.isForeign === true;
    const birthDate = buildBirthDate(
      draft.birthYear,
      draft.birthMonth,
      draft.birthDay,
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

    if (birthDate === '') {
      setMessage({ severity: 'warning', text: '생년월일은 연·월·일을 모두 선택하거나 모두 비워주세요.' });
      return;
    }

    if (!residentNo && !draft.hasResidentNo) {
      setMessage({ severity: 'warning', text: '주민등록번호는 필수정보입니다.' });
      return;
    }

    if (!fullPhone && !draft.hasPrivatePhone) {
      setMessage({ severity: 'warning', text: '전체 휴대폰번호는 필수정보입니다.' });
      return;
    }

    if (!nationality && !draft.hasNationality) {
      setMessage({ severity: 'warning', text: '국적은 필수정보입니다.' });
      return;
    }

    if (nationality && !NATIONALITY_OPTIONS.includes(nationality)) {
      setMessage({ severity: 'warning', text: '국적은 목록에서 선택해주세요.' });
      return;
    }

    if (!bankName && !draft.bankNameHint) {
      setMessage({ severity: 'warning', text: '은행은 필수정보입니다.' });
      return;
    }

    if (!accountNumber && !draft.hasAccount) {
      setMessage({ severity: 'warning', text: '계좌번호는 필수정보입니다.' });
      return;
    }

    if (!accountHolder && !draft.hasAccountHolder) {
      setMessage({ severity: 'warning', text: '예금주는 필수정보입니다.' });
      return;
    }

    if (finalIsForeign && !englishName && !draft.hasEnglishName) {
      setMessage({ severity: 'warning', text: '외국인 근로자는 영문 성명이 필요합니다.' });
      return;
    }

    if (finalIsForeign && !stayStatus && !draft.hasStayStatus) {
      setMessage({ severity: 'warning', text: '외국인 근로자는 체류자격이 필요합니다.' });
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
        'labor_worker_master_secure_upsert_v52_47',
        {
          p_worker_id:
            draft.id || null,
          p_name_ko: nameKo,
          p_birth_date:
            birthDate || null,
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
          p_phone_number:
            fullPhone || null,
          p_address:
            String(
              draft.address || '',
            ).trim() || null,
          p_nationality:
            nationality || null,
          p_bank_name:
            bankName || null,
          p_account_number:
            accountNumber || null,
          p_account_holder:
            accountHolder || null,
          p_english_name:
            englishName || null,
          p_stay_status:
            stayStatus || null,
          p_english_account_holder:
            englishAccountHolder || null,
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

  const deleteWorker = async () => {
    if (
      !canManage ||
      deleting ||
      !deleteTarget?.id
    ) {
      return;
    }

    setDeleting(true);

    const { data, error } =
      await supabase.rpc(
        'labor_worker_master_delete_v52_46',
        {
          p_worker_id:
            deleteTarget.id,
        },
      );

    setDeleting(false);

    if (error) {
      setMessage({
        severity: 'error',
        text:
          error.message ||
          '근로자 삭제에 실패했습니다.',
      });
      return;
    }

    const deletedName =
      data?.worker_name ||
      deleteTarget.nameKo ||
      '근로자';

    setDeleteTarget(null);
    setMessage({
      severity: 'success',
      text: deletedName + ' 근로자를 삭제했습니다.',
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
      <Snackbar
        open={guideOpen}
        autoHideDuration={5200}
        onClose={(_event, reason) => {
          if (reason !== 'clickaway') setGuideOpen(false);
        }}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ top: '72px !important' }}
      >
        <Alert
          severity="info"
          variant="filled"
          onClose={() => setGuideOpen(false)}
          sx={{ maxWidth: 760, fontSize: '0.72rem', lineHeight: 1.55 }}
        >
          주민등록번호·전체 연락처·주소·국적·은행·계좌번호·예금주는 보호정보로 암호화 저장합니다. 목록과 수정화면에는 기존 원문을 다시 표시하지 않습니다.
        </Alert>
      </Snackbar>

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
            <SystemPageTitle
              title="근로자 정보관리"
              help="근로자 기본정보를 등록하고 노임·근로계약에 사용하는 공통정보를 관리합니다."
            />

            
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
            variant="outlined"
            startIcon={
              <UploadFileRoundedIcon />
            }
            onClick={() => setExcelUploadOpen(true)}
            disabled={!canManage}
            sx={{ ml: 'auto' }}
          >
            EXCEL 업로드
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
              minWidth: 1040,
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
                    width: 140,
                    fontWeight: 900,
                  }}
                >
                  최근수정
                </TableCell>

                <TableCell
                  align="center"
                  sx={{
                    width: 90,
                    minWidth: 90,
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
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
                    <CircularProgress
                      size={24}
                    />
                  </TableCell>
                </TableRow>
              ) : rows.length ===
                0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
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
                        {formatKoreaDateTime(
                          worker.updatedAt,
                        )}
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{
                          width: 86,
                          minWidth: 86,
                          whiteSpace: 'nowrap',
                          px: 0.5,
                        }}
                      >
                        <Tooltip title="수정" arrow>
                          <span>
                            <IconButton
                              size="small"
                              aria-label="근로자 정보 수정"
                              onClick={() => openEdit(worker)}
                              disabled={!canManage}
                              color="primary"
                            >
                              <EditRoundedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>

                        <Tooltip title="삭제" arrow>
                          <span>
                            <IconButton
                              size="small"
                              aria-label="근로자 삭제"
                              onClick={() => setDeleteTarget(worker)}
                              disabled={!canManage}
                              color="error"
                            >
                              <DeleteOutlineRoundedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
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

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1.35fr 0.8fr 0.8fr',
                  gap: 0.65,
                }}
              >
                <Autocomplete
                  freeSolo
                  autoSelect
                  size="small"
                  options={BIRTH_YEAR_OPTIONS}
                  value={draft.birthYear || null}
                  onChange={(_event, value) =>
                    setDraft((previous) => {
                      const rawYear = String(value || '').trim();
                      const nextYear = BIRTH_YEAR_OPTIONS.includes(rawYear)
                        ? rawYear
                        : '';
                      const validDays = getBirthDayOptions(
                        nextYear,
                        previous.birthMonth,
                      );
                      return {
                        ...previous,
                        birthYear: nextYear,
                        birthDay: validDays.includes(previous.birthDay)
                          ? previous.birthDay
                          : '',
                      };
                    })
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="생년"
                      placeholder="예: 1992"
                      inputProps={{
                        ...params.inputProps,
                        inputMode: 'numeric',
                        maxLength: 4,
                      }}
                    />
                  )}
                />

                <TextField
                  fullWidth
                  select
                  size="small"
                  label="월"
                  value={draft.birthMonth}
                  onChange={(event) =>
                    setDraft((previous) => {
                      const nextMonth = event.target.value;
                      const validDays = getBirthDayOptions(
                        previous.birthYear,
                        nextMonth,
                      );
                      return {
                        ...previous,
                        birthMonth: nextMonth,
                        birthDay: validDays.includes(previous.birthDay)
                          ? previous.birthDay
                          : '',
                      };
                    })
                  }
                >
                  <MenuItem value="">선택</MenuItem>
                  {BIRTH_MONTH_OPTIONS.map((month) => (
                    <MenuItem key={month} value={month}>
                      {Number(month)}월
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  fullWidth
                  select
                  size="small"
                  label="일"
                  value={draft.birthDay}
                  disabled={!draft.birthYear || !draft.birthMonth}
                  onChange={(event) =>
                    setDraft((previous) => ({
                      ...previous,
                      birthDay: event.target.value,
                    }))
                  }
                >
                  <MenuItem value="">선택</MenuItem>
                  {getBirthDayOptions(draft.birthYear, draft.birthMonth).map(
                    (day) => (
                      <MenuItem key={day} value={day}>
                        {Number(day)}일
                      </MenuItem>
                    ),
                  )}
                </TextField>
              </Box>

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
                암호화 값이 유지됩니다. * 표시는
                필수정보입니다.
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
                required
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
                required
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

              <Autocomplete
                autoHighlight
                autoSelect
                size="small"
                options={NATIONALITY_OPTIONS}
                filterOptions={filterNationalityOptions}
                value={draft.nationality || null}
                onChange={(_event, value) =>
                  setDraft((previous) => ({
                    ...previous,
                    nationality: value || '',
                    isForeign: value
                      ? value !== '대한민국'
                      : previous.isForeign,
                  }))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    required
                    label="국적"
                    placeholder={
                      draft.hasNationality
                        ? '기존값 유지 · 변경 시 검색'
                        : '예: 한국, Korea, 중국, China'
                    }
                    helperText={privateHelper(draft.hasNationality)}
                  />
                )}
              />

              {(
                draft.isForeign ||
                (draft.nationality &&
                  draft.nationality !== '대한민국')
              ) ? (
                <>
                  <TextField
                    fullWidth
                    required
                    size="small"
                    label="영문 성명"
                    value={draft.englishName}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        englishName: event.target.value,
                      }))
                    }
                    placeholder={
                      draft.hasEnglishName
                        ? '기존값 유지'
                        : '예: HONG GILDONG'
                    }
                    helperText={privateHelper(draft.hasEnglishName)}
                  />

                  <TextField
                    fullWidth
                    required
                    size="small"
                    label="체류자격"
                    value={draft.stayStatus}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        stayStatus: event.target.value,
                      }))
                    }
                    placeholder={
                      draft.hasStayStatus
                        ? '기존값 유지'
                        : '예: F-5'
                    }
                    helperText={privateHelper(draft.hasStayStatus)}
                  />

                  <TextField
                    fullWidth
                    size="small"
                    label="영문 예금주"
                    value={draft.englishAccountHolder}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        englishAccountHolder: event.target.value,
                      }))
                    }
                    placeholder={
                      draft.hasEnglishAccountHolder
                        ? '기존값 유지'
                        : '예: HONG GILDONG'
                    }
                    helperText={privateHelper(draft.hasEnglishAccountHolder)}
                  />
                </>
              ) : null}

              <TextField
                fullWidth
                required
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
                  Boolean(draft.bankNameHint),
                  draft.bankNameHint,
                )}
              />

              <TextField
                fullWidth
                required
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
                required
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
                  draft.hasAccountHolder,
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

      <LaborWorkerExcelImportDialog
        open={excelUploadOpen}
        canManage={canManage}
        onClose={() => setExcelUploadOpen(false)}
        onImported={async (result) => {
          setExcelUploadOpen(false);
          setMessage({
            severity: 'success',
            text: 'Excel 이관 완료 · 신규 ' + result.created + '명 · 업데이트 ' + result.updated + '명 · 제외 ' + result.skipped + '명',
          });
          await loadWorkers({
            silent: true,
            searchQuery: query,
          });
        }}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!deleting) {
            setDeleteTarget(null);
          }
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          근로자 삭제
        </DialogTitle>

        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 1.2 }}>
            삭제된 근로자 정보는 복구할 수 없습니다.
          </Alert>

          <Typography
            sx={{
              color: '#0f172a',
              fontSize: '0.86rem',
              fontWeight: 900,
            }}
          >
            {deleteTarget?.nameKo || '선택한 근로자'}를 정말로 삭제하시겠습니까?
          </Typography>

          <Typography
            sx={{
              mt: 0.75,
              color: '#64748b',
              fontSize: '0.7rem',
              lineHeight: 1.55,
            }}
          >
            월별 노임 명단에 사용된 이력이 있는 근로자는 이력 보호를 위해 삭제가 차단됩니다.
          </Typography>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
          >
            아니오
          </Button>

          <Button
            variant="contained"
            color="error"
            onClick={() => void deleteWorker()}
            disabled={deleting}
            sx={{ boxShadow: 'none' }}
          >
            {deleting ? '삭제 중...' : '예, 삭제'}
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
