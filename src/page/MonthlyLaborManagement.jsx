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
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import CheckBoxOutlineBlankRoundedIcon from '@mui/icons-material/CheckBoxOutlineBlankRounded';
import CheckBoxRoundedIcon from '@mui/icons-material/CheckBoxRounded';
import IndeterminateCheckBoxRoundedIcon from '@mui/icons-material/IndeterminateCheckBoxRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import PersonSearchRoundedIcon from '@mui/icons-material/PersonSearchRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { supabase } from '../supabaseClient';
import LaborSecurityPhoneDialog from '../components/LaborSecurityPhoneDialog.jsx';
import LaborDownloadAuthDialog from '../components/LaborDownloadAuthDialog.jsx';

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

const CURRENT_YEAR =
  new Date().getFullYear();

const BIRTH_YEAR_OPTIONS =
  Array.from(
    {
      length:
        CURRENT_YEAR - 1920 + 1,
    },
    (_unused, index) =>
      String(
        CURRENT_YEAR - index,
      ),
  );

const BIRTH_MONTH_OPTIONS =
  Array.from(
    { length: 12 },
    (_unused, index) =>
      String(index + 1).padStart(
        2,
        '0',
      ),
  );

const getBirthDayOptions = (
  year,
  month,
) => {
  if (!year || !month) {
    return [];
  }

  const lastDay =
    new Date(
      Number(year),
      Number(month),
      0,
    ).getDate();

  return Array.from(
    { length: lastDay },
    (_unused, index) =>
      String(index + 1).padStart(
        2,
        '0',
      ),
  );
};

const buildBirthDate = (
  year,
  month,
  day,
) => {
  if (!year || !month || !day) {
    return '';
  }

  const validDays =
    getBirthDayOptions(
      year,
      month,
    );

  if (!validDays.includes(day)) {
    return '';
  }

  return `${year}-${month}-${day}`;
};

const EXPORT_FIELD_LABELS = Object.freeze({
  resident_no: '주민등록번호',
  phone: '전체 연락처',
  nationality: '국적',
  bank: '은행',
  account: '계좌번호',
  account_holder: '예금주',
  trade: '공종',
});

const formatExportMissingFields = (fields) => {
  const items = Array.isArray(fields) ? fields : [];

  if (items.length === 0) {
    return '-';
  }

  return items
    .map((field) => EXPORT_FIELD_LABELS[field] || field)
    .join(' · ');
};

const getKoreaYearMonth = () => {
  const parts = new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
    },
  ).formatToParts(new Date());

  const values = {};

  parts.forEach((part) => {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  });

  return `${values.year}-${values.month}`;
};

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
    worker?.monthly_trade ||
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
  note: String(
    worker?.note || '',
  ).trim(),
  rosterItemId: String(
    worker?.roster_item_id || '',
  ).trim(),
  workEntries:
    worker?.work_entries &&
    typeof worker.work_entries === 'object'
      ? worker.work_entries
      : {},
  dailyWage: Number(
    worker?.daily_wage || 0,
  ),
  additionalPay: Number(
    worker?.additional_pay || 0,
  ),
  manualDeduction: Number(
    worker?.manual_deduction || 0,
  ),
  payNote: String(
    worker?.pay_note || '',
  ).trim(),
});

const formatLookupBirthDate = (value) => {
  if (!value) return '-';
  return String(value).trim();
};

const formatLookupPhone = (value) => {
  if (!value) return '-';

  const normalized =
    String(value).trim();

  if (/^\d{4}$/.test(normalized)) {
    return `****${normalized}`;
  }

  if (
    normalized.startsWith('****') ||
    normalized.includes('*')
  ) {
    return normalized;
  }

  const digits =
    normalized.replace(/\D/g, '');

  if (digits.length >= 4) {
    return `****${digits.slice(-4)}`;
  }

  return '-';
};

const moneyFormatter =
  new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  });

const toSafeNumber = (value) => {
  const number = Number(
    String(value ?? '')
      .replace(/,/g, ''),
  );

  return Number.isFinite(number)
    ? number
    : 0;
};

const normalizeMoneyInput = (
  value,
) =>
  String(value ?? '')
    .replace(/,/g, '')
    .replace(/[^\d]/g, '');

const formatMoney = (value) =>
  moneyFormatter.format(
    Math.max(
      0,
      toSafeNumber(value),
    ),
  );

const getDaysInMonth = (
  monthKey,
) => {
  const matched =
    /^(\d{4})-(\d{2})$/.exec(
      String(monthKey || ''),
    );

  if (!matched) {
    return 31;
  }

  return new Date(
    Number(matched[1]),
    Number(matched[2]),
    0,
  ).getDate();
};

const normalizeWorkEntries = (
  value,
) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([day, units]) => [
        String(day),
        Math.max(
          0,
          Math.min(
            2,
            toSafeNumber(units),
          ),
        ),
      ])
      .filter(
        ([day, units]) =>
          /^\d{1,2}$/.test(day) &&
          units > 0,
      ),
  );
};

const getTotalWorkUnits = (
  workEntries,
) =>
  Object.values(
    normalizeWorkEntries(
      workEntries,
    ),
  ).reduce(
    (sum, units) =>
      sum + toSafeNumber(units),
    0,
  );

const getPayrollSummary = (
  row,
) => {
  const totalWorkUnits =
    getTotalWorkUnits(
      row?.workEntries,
    );

  const dailyWage = Math.max(
    0,
    toSafeNumber(
      row?.dailyWage,
    ),
  );

  const additionalPay = Math.max(
    0,
    toSafeNumber(
      row?.additionalPay,
    ),
  );

  const manualDeduction =
    Math.max(
      0,
      toSafeNumber(
        row?.manualDeduction,
      ),
    );

  const basePay =
    totalWorkUnits * dailyWage;

  const grossPay =
    basePay + additionalPay;

  const netPay = Math.max(
    0,
    grossPay -
      manualDeduction,
  );

  return {
    totalWorkUnits,
    dailyWage,
    additionalPay,
    manualDeduction,
    basePay,
    grossPay,
    netPay,
  };
};

const moveRowsOneStep = (
  rows,
  selectedIds,
  direction,
) => {
  const selectedSet =
    new Set(selectedIds);
  const next = [...rows];

  if (direction === 'up') {
    for (
      let index = 1;
      index < next.length;
      index += 1
    ) {
      if (
        selectedSet.has(
          next[index].id,
        ) &&
        !selectedSet.has(
          next[index - 1].id,
        )
      ) {
        [
          next[index - 1],
          next[index],
        ] = [
          next[index],
          next[index - 1],
        ];
      }
    }

    return next;
  }

  for (
    let index =
      next.length - 2;
    index >= 0;
    index -= 1
  ) {
    if (
      selectedSet.has(
        next[index].id,
      ) &&
      !selectedSet.has(
        next[index + 1].id,
      )
    ) {
      [
        next[index],
        next[index + 1],
      ] = [
        next[index + 1],
        next[index],
      ];
    }
  }

  return next;
};

const newWorkerDraft = (
  name = '',
) => ({
  name: String(name || '').trim(),
  birthYear: '',
  birthMonth: '',
  birthDay: '',
  phoneLast4: '',
  trade: '',
});

const formatSavedAt = (value) => {
  if (!value) return '';

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '';
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

export default function MonthlyLaborManagement({
  projectName,
}) {
  const [yearMonth, setYearMonth] =
    useState(getKoreaYearMonth);
  const [rows, setRows] =
    useState([]);
  const [
    selectedIds,
    setSelectedIds,
  ] = useState([]);

  const [
    lookupOpen,
    setLookupOpen,
  ] = useState(false);
  const [
    lookupQuery,
    setLookupQuery,
  ] = useState('');
  const [
    lookupResults,
    setLookupResults,
  ] = useState([]);
  const [
    lookupLoading,
    setLookupLoading,
  ] = useState(false);
  const [
    lookupMessage,
    setLookupMessage,
  ] = useState('');

  const [
    newWorkerOpen,
    setNewWorkerOpen,
  ] = useState(false);
  const [
    newWorker,
    setNewWorker,
  ] = useState(
    newWorkerDraft(),
  );
  const [
    newWorkerSaving,
    setNewWorkerSaving,
  ] = useState(false);

  const [
    bulkTrade,
    setBulkTrade,
  ] = useState('');

  const [
    rosterLoading,
    setRosterLoading,
  ] = useState(false);
  const [
    rosterSaving,
    setRosterSaving,
  ] = useState(false);
  const [
    lastSavedAt,
    setLastSavedAt,
  ] = useState('');
  const [dirty, setDirty] =
    useState(false);
  const [message, setMessage] =
    useState(null);

  const [
    payrollEditor,
    setPayrollEditor,
  ] = useState(null);

  const [
    exportCheckOpen,
    setExportCheckOpen,
  ] = useState(false);
  const [
    exportCheckLoading,
    setExportCheckLoading,
  ] = useState(false);
  const [
    exportCheck,
    setExportCheck,
  ] = useState(null);

  const [
    securityPhoneOpen,
    setSecurityPhoneOpen,
  ] = useState(false);

  const [
    downloadAuthOpen,
    setDownloadAuthOpen,
  ] = useState(false);

  const selectedSet = useMemo(
    () => new Set(selectedIds),
    [selectedIds],
  );

  const allSelected =
    rows.length > 0 &&
    selectedIds.length ===
      rows.length;

  const partiallySelected =
    selectedIds.length > 0 &&
    selectedIds.length <
      rows.length;

  const payrollTotals =
    useMemo(() => {
      return rows.reduce(
        (result, row) => {
          const summary =
            getPayrollSummary(
              row,
            );

          result.workUnits +=
            summary.totalWorkUnits;
          result.grossPay +=
            summary.grossPay;
          result.manualDeduction +=
            summary.manualDeduction;
          result.netPay +=
            summary.netPay;

          return result;
        },
        {
          workUnits: 0,
          grossPay: 0,
          manualDeduction: 0,
          netPay: 0,
        },
      );
    }, [rows]);

  useEffect(() => {
    if (!dirty) {
      return undefined;
    }

    const handleBeforeUnload = (
      event,
    ) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener(
      'beforeunload',
      handleBeforeUnload,
    );

    return () => {
      window.removeEventListener(
        'beforeunload',
        handleBeforeUnload,
      );
    };
  }, [dirty]);

  useEffect(() => {
    let active = true;

    const loadRoster = async () => {
      setRosterLoading(true);
      setSelectedIds([]);
      setLookupOpen(false);
      setLookupQuery('');
      setLookupResults([]);
      setLookupMessage('');

      if (
        !projectName ||
        !yearMonth
      ) {
        if (active) {
          setRows([]);
          setLastSavedAt('');
          setDirty(false);
          setRosterLoading(false);
        }
        return;
      }

      const { data, error } =
        await supabase.rpc(
          'labor_monthly_roster_get_v52_36',
          {
            p_project_name:
              projectName,
            p_month_key:
              yearMonth,
          },
        );

      if (!active) {
        return;
      }

      if (error) {
        setRows([]);
        setLastSavedAt('');
        setDirty(false);
        setRosterLoading(false);
        setMessage({
          severity: 'error',
          text:
            error.message ||
            '월별 노임 명단을 불러오지 못했습니다.',
        });
        return;
      }

      const items =
        Array.isArray(
          data?.items,
        )
          ? data.items
          : [];

      setRows(
        items.map(
          (
            worker,
            index,
          ) => {
            const normalized =
              normalizeWorkerOption(
                worker,
              );

            return {
              ...normalized,
              workEntries:
                normalizeWorkEntries(
                  normalized.workEntries,
                ),
              id:
                normalized
                  .rosterItemId ||
                `roster-${normalized.id}-${index}`,
              workerMasterId:
                normalized.id,
            };
          },
        ),
      );

      setLastSavedAt(
        data?.updated_at || '',
      );
      setDirty(false);
      setRosterLoading(false);
    };

    void loadRoster();

    return () => {
      active = false;
    };
  }, [
    projectName,
    yearMonth,
  ]);

  const markChanged = (
    updater,
  ) => {
    setRows((previous) =>
      updater(previous),
    );
    setDirty(true);
  };

  const searchWorkers =
    async () => {
      const query =
        lookupQuery.trim();

      if (
        query.length < 2
      ) {
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

      const { data, error } =
        await supabase.rpc(
          'labor_worker_master_search_v52_33',
          {
            p_query: query,
            p_project_name:
              projectName,
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
        Array.isArray(data)
          ? data
          : []
      ).map(
        normalizeWorkerOption,
      );

      setLookupResults(next);

      if (
        next.length === 0
      ) {
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

  const openNewWorker = (
    initialName = '',
  ) => {
    setNewWorker(
      newWorkerDraft(
        initialName,
      ),
    );
    setNewWorkerOpen(true);
  };

  const addWorkerFromMaster = (
    worker,
  ) => {
    if (!worker?.id) {
      return;
    }

    markChanged(
      (previous) => {
        if (
          previous.some(
            (row) =>
              row.workerMasterId ===
              worker.id,
          )
        ) {
          return previous;
        }

        return [
          ...previous,
          {
            id: `master-${worker.id}-${Date.now()}`,
            workerMasterId:
              worker.id,
            name: worker.name,
            trade:
              worker.trade,
            birthDate:
              worker.birthDate,
            phoneMasked:
              worker.phoneMasked,
            note: '',
            rosterItemId: '',
            workEntries: {},
            dailyWage: 0,
            additionalPay: 0,
            manualDeduction: 0,
            payNote: '',
          },
        ];
      },
    );
  };

  const createNewWorker =
    async () => {
      if (
        newWorkerSaving
      ) {
        return;
      }

      const name =
        newWorker.name.trim();

      const phoneLast4 =
        String(
          newWorker.phoneLast4 ||
            '',
        )
          .replace(/\D/g, '')
          .slice(0, 4);

      const birthDate =
        buildBirthDate(
          newWorker.birthYear,
          newWorker.birthMonth,
          newWorker.birthDay,
        );

      if (
        name.length < 2
      ) {
        setMessage({
          severity: 'warning',
          text:
            '성명을 2자 이상 입력해주세요.',
        });
        return;
      }

      if (!birthDate) {
        setMessage({
          severity: 'warning',
          text:
            '동명이인 구분을 위해 생년·월·일을 모두 선택해주세요.',
        });
        return;
      }

      if (
        !/^\d{4}$/.test(
          phoneLast4,
        )
      ) {
        setMessage({
          severity: 'warning',
          text:
            '동명이인 구분을 위해 휴대폰 뒤 4자리를 입력해주세요.',
        });
        return;
      }

      if (
        !String(
          newWorker.trade ||
            '',
        ).trim()
      ) {
        setMessage({
          severity: 'warning',
          text:
            '공종을 입력해주세요.',
        });
        return;
      }

      setNewWorkerSaving(true);

      const { data, error } =
        await supabase.rpc(
          'labor_monthly_worker_create_v52_35',
          {
            p_project_name:
              projectName,
            p_name_ko: name,
            p_birth_date:
              birthDate,
            p_phone_last4:
              phoneLast4,
            p_recent_trade:
              String(
                newWorker.trade ||
                  '',
              ).trim(),
          },
        );

      setNewWorkerSaving(false);

      if (error) {
        setMessage({
          severity: 'error',
          text:
            error.message ||
            '신규 근로자 등록에 실패했습니다.',
        });
        return;
      }

      const worker =
        normalizeWorkerOption(
          data || {},
        );

      if (!worker.id) {
        setMessage({
          severity: 'error',
          text:
            '등록된 근로자 정보를 확인하지 못했습니다.',
        });
        return;
      }

      addWorkerFromMaster(
        worker,
      );

      setNewWorkerOpen(
        false,
      );

      setMessage({
        severity:
          data?.reused === true
            ? 'info'
            : 'success',
        text:
          data?.reused === true
            ? '동일한 기존 근로자를 찾아 이번 달 명단에 추가했습니다.'
            : '신규 근로자를 마스터에 등록하고 이번 달 명단에 추가했습니다.',
      });

      if (lookupOpen) {
        setLookupQuery(name);
        setLookupResults([]);
        setLookupMessage(
          '신규 등록한 근로자를 명단에 추가했습니다.',
        );
      }
    };

  const updateRow = (
    rowId,
    field,
    value,
  ) => {
    markChanged(
      (previous) =>
        previous.map(
          (row) =>
            row.id === rowId
              ? {
                  ...row,
                  [field]:
                    value,
                }
              : row,
        ),
    );
  };

  const toggleRow = (
    rowId,
  ) => {
    setSelectedIds(
      (previous) =>
        previous.includes(
          rowId,
        )
          ? previous.filter(
              (id) =>
                id !== rowId,
            )
          : [
              ...previous,
              rowId,
            ],
    );
  };

  const toggleAll = (
    checked,
  ) => {
    setSelectedIds(
      checked
        ? rows.map(
            (row) =>
              row.id,
          )
        : [],
    );
  };

  const deleteSelected = () => {
    if (
      selectedIds.length ===
      0
    ) {
      return;
    }

    markChanged(
      (previous) =>
        previous.filter(
          (row) =>
            !selectedSet.has(
              row.id,
            ),
        ),
    );

    setSelectedIds([]);
  };

  const moveSelected = (
    direction,
  ) => {
    if (
      selectedIds.length ===
      0
    ) {
      return;
    }

    markChanged(
      (previous) =>
        moveRowsOneStep(
          previous,
          selectedIds,
          direction,
        ),
    );
  };

  const applyBulkTrade =
    () => {
      const nextTrade =
        String(
          bulkTrade || '',
        ).trim();

      if (
        !nextTrade ||
        selectedIds.length ===
          0
      ) {
        return;
      }

      markChanged(
        (previous) =>
          previous.map(
            (row) =>
              selectedSet.has(
                row.id,
              )
                ? {
                    ...row,
                    trade:
                      nextTrade,
                  }
                : row,
          ),
      );
    };

  const openPayrollEditor = (
    row,
  ) => {
    const summary =
      getPayrollSummary(row);

    setPayrollEditor({
      rowId: row.id,
      name: row.name,
      workEntries:
        normalizeWorkEntries(
          row.workEntries,
        ),
      dailyWage:
        summary.dailyWage,
      additionalPay:
        summary.additionalPay,
      manualDeduction:
        summary.manualDeduction,
      payNote:
        String(
          row.payNote || '',
        ),
    });
  };

  const updatePayrollEntry = (
    day,
    value,
  ) => {
    setPayrollEditor(
      (previous) => {
        if (!previous) {
          return previous;
        }

        const units =
          Math.max(
            0,
            Math.min(
              2,
              toSafeNumber(
                value,
              ),
            ),
          );

        const nextEntries = {
          ...previous.workEntries,
        };

        if (units > 0) {
          nextEntries[
            String(day)
          ] = units;
        } else {
          delete nextEntries[
            String(day)
          ];
        }

        return {
          ...previous,
          workEntries:
            nextEntries,
        };
      },
    );
  };

  const applyPayrollEditor =
    () => {
      if (!payrollEditor) {
        return;
      }

      markChanged(
        (previous) =>
          previous.map(
            (row) =>
              row.id ===
              payrollEditor.rowId
                ? {
                    ...row,
                    workEntries:
                      normalizeWorkEntries(
                        payrollEditor.workEntries,
                      ),
                    dailyWage:
                      Math.max(
                        0,
                        toSafeNumber(
                          payrollEditor.dailyWage,
                        ),
                      ),
                    additionalPay:
                      Math.max(
                        0,
                        toSafeNumber(
                          payrollEditor.additionalPay,
                        ),
                      ),
                    manualDeduction:
                      Math.max(
                        0,
                        toSafeNumber(
                          payrollEditor.manualDeduction,
                        ),
                      ),
                    payNote:
                      String(
                        payrollEditor.payNote ||
                          '',
                      ).trim(),
                  }
                : row,
          ),
      );

      setPayrollEditor(null);
    };

  const handleMonthChange = (
    nextMonth,
  ) => {
    if (
      nextMonth ===
      yearMonth
    ) {
      return;
    }

    if (
      dirty &&
      !window.confirm(
        '저장하지 않은 변경사항이 있습니다. 작성월을 변경하시겠습니까?',
      )
    ) {
      return;
    }

    setYearMonth(
      nextMonth,
    );
  };

  const saveRoster =
    async () => {
      if (
        rosterSaving ||
        rosterLoading
      ) {
        return;
      }

      if (
        !projectName ||
        !yearMonth
      ) {
        setMessage({
          severity: 'warning',
          text:
            '현장과 작성월을 확인해주세요.',
        });
        return;
      }

      const invalid =
        rows.find(
          (row) =>
            !row.workerMasterId ||
            !String(
              row.trade ||
                '',
            ).trim(),
        );

      if (invalid) {
        setMessage({
          severity: 'warning',
          text:
            `${invalid.name || '근로자'}의 공종 또는 근로자 연결정보를 확인해주세요.`,
        });
        return;
      }

      setRosterSaving(true);

      const payload =
        rows.map(
          (
            row,
            index,
          ) => ({
            worker_master_id:
              row.workerMasterId,
            trade:
              String(
                row.trade ||
                  '',
              ).trim(),
            note:
              String(
                row.note ||
                  '',
              ).trim(),
            work_entries:
              normalizeWorkEntries(
                row.workEntries,
              ),
            daily_wage:
              Math.max(
                0,
                toSafeNumber(
                  row.dailyWage,
                ),
              ),
            additional_pay:
              Math.max(
                0,
                toSafeNumber(
                  row.additionalPay,
                ),
              ),
            manual_deduction:
              Math.max(
                0,
                toSafeNumber(
                  row.manualDeduction,
                ),
              ),
            pay_note:
              String(
                row.payNote ||
                  '',
              ).trim(),
            sort_order:
              index + 1,
          }),
        );

      const { data, error } =
        await supabase.rpc(
          'labor_monthly_roster_save_v52_36',
          {
            p_project_name:
              projectName,
            p_month_key:
              yearMonth,
            p_items:
              payload,
          },
        );

      setRosterSaving(false);

      if (error) {
        setMessage({
          severity: 'error',
          text:
            error.message ||
            '월별 노임 명단 저장에 실패했습니다.',
        });
        return;
      }

      setLastSavedAt(
        data?.updated_at ||
          new Date().toISOString(),
      );
      setDirty(false);

      setMessage({
        severity: 'success',
        text:
          `${yearMonth} 노임 명단 ${rows.length}명을 저장했습니다.`,
      });
    };

  const runExportReadiness = async () => {
    if (!projectName || !yearMonth) {
      setMessage({
        severity: 'warning',
        text: '현장과 작성월을 확인해주세요.',
      });
      return;
    }

    if (dirty) {
      setMessage({
        severity: 'warning',
        text: 'Excel 생성 준비 확인 전에 현재 변경사항을 먼저 저장해주세요.',
      });
      return;
    }

    if (rows.length === 0) {
      setMessage({
        severity: 'warning',
        text: 'Excel 생성 준비를 확인할 근로자 명단이 없습니다.',
      });
      return;
    }

    setExportCheckOpen(true);
    setExportCheckLoading(true);
    setExportCheck(null);

    const { data, error } = await supabase.rpc(
      'labor_monthly_export_readiness_v52_37',
      {
        p_project_name: projectName,
        p_month_key: yearMonth,
      },
    );

    setExportCheckLoading(false);

    if (error) {
      setMessage({
        severity: 'error',
        text:
          error.message ||
          '노임 Excel 생성 준비상태를 확인하지 못했습니다.',
      });
      setExportCheckOpen(false);
      return;
    }

    setExportCheck(data || null);
  };

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection:
          'column',
        gap: 1,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          px: 1.5,
          py: 1.25,
          borderColor:
            '#cbd5e1',
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
                fontSize:
                  '0.95rem',
                fontWeight: 900,
                color:
                  '#0f172a',
              }}
            >
              월별 노임작성
            </Typography>

            <Typography
              sx={{
                mt: 0.2,
                color:
                  '#64748b',
                fontSize:
                  '0.72rem',
              }}
            >
              {projectName ||
                '현장 미선택'}
              {' · '}
              {dirty
                ? '저장되지 않은 변경사항 있음'
                : lastSavedAt
                  ? `저장됨 ${formatSavedAt(lastSavedAt)}`
                  : '신규 명단'}
            </Typography>
          </Box>

          <TextField
            type="month"
            size="small"
            label="작성월"
            value={
              yearMonth
            }
            onChange={(
              event,
            ) =>
              handleMonthChange(
                event.target
                  .value,
              )
            }
            InputLabelProps={{
              shrink: true,
            }}
            sx={{ width: 170 }}
          />

          <Button
            variant="contained"
            size="small"
            startIcon={
              rosterSaving ? (
                <CircularProgress
                  size={15}
                  color="inherit"
                />
              ) : (
                <SaveRoundedIcon />
              )
            }
            onClick={() =>
              void saveRoster()
            }
            disabled={
              rosterSaving ||
              rosterLoading ||
              !projectName
            }
            sx={{
              minWidth: 104,
              boxShadow: 'none',
              fontWeight: 900,
            }}
          >
            저장
          </Button>

          <Button
            variant="outlined"
            size="small"
            onClick={() =>
              void runExportReadiness()
            }
            disabled={
              rosterSaving ||
              rosterLoading ||
              exportCheckLoading ||
              !projectName ||
              rows.length === 0
            }
            sx={{
              minWidth: 126,
              fontWeight: 900,
            }}
          >
            Excel 생성 준비
          </Button>

          <Button
            variant="outlined"
            size="small"
            onClick={() =>
              setSecurityPhoneOpen(true)
            }
            sx={{
              minWidth: 118,
              fontWeight: 900,
            }}
          >
            보안 휴대폰
          </Button>

          <Button
            variant="outlined"
            size="small"
            onClick={() =>
              setDownloadAuthOpen(true)
            }
            disabled={
              rosterSaving ||
              rosterLoading ||
              dirty ||
              !projectName ||
              rows.length === 0
            }
            sx={{
              minWidth: 142,
              fontWeight: 900,
            }}
          >
            다운로드 인증 준비
          </Button>
        </Stack>
      </Paper>

      <Alert
        severity="info"
        sx={{
          py: 0.2,
          '& .MuiAlert-message':
            {
              py: 0.45,
              fontSize:
                '0.72rem',
            },
        }}
      >
        현장과 작성월별로 필요한 근로자를 조회·선별하고
        개인정보를 모아 Excel 다운로드 준비를 합니다.
        실제 출역일자·일급·노임금액 입력과 노임 계산은
        다운로드한 Excel에서 진행합니다.
      </Alert>

      <Paper
        variant="outlined"
        sx={{
          borderColor:
            '#cbd5e1',
          overflow: 'hidden',
          display: 'flex',
          flexDirection:
            'column',
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
            alignItems:
              'center',
            gap: 0.5,
            bgcolor:
              '#f8fafc',
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

          <Paper
            variant="outlined"
            sx={{
              minHeight: 34,
              px: 0.75,
              py: 0.35,
              display: 'flex',
              alignItems: 'center',
              gap: 0.45,
              borderColor: '#94a3b8',
              boxShadow: 'none',
            }}
          >
            <Tooltip title="근로자 추가" arrow>
              <span>
                <IconButton
                  size="small"
                  color="primary"
                  aria-label="근로자 추가"
                  onClick={() =>
                    openNewWorker()
                  }
                >
                  <AddCircleOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title="근로자 삭제" arrow>
              <span>
                <IconButton
                  size="small"
                  color="error"
                  aria-label="근로자 삭제"
                  onClick={
                    deleteSelected
                  }
                  disabled={
                    selectedIds.length ===
                    0
                  }
                >
                  <RemoveCircleOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title="근로자 위로 이동" arrow>
              <span>
                <IconButton
                  size="small"
                  aria-label="근로자 위로 이동"
                  onClick={() =>
                    moveSelected(
                      'up',
                    )
                  }
                  disabled={
                    selectedIds.length ===
                    0
                  }
                >
                  <ArrowUpwardRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title="근로자 아래로 이동" arrow>
              <span>
                <IconButton
                  size="small"
                  aria-label="근로자 아래로 이동"
                  onClick={() =>
                    moveSelected(
                      'down',
                    )
                  }
                  disabled={
                    selectedIds.length ===
                    0
                  }
                >
                  <ArrowDownwardRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Paper>

          <Divider
            orientation="vertical"
            flexItem
            sx={{ mx: 0.25 }}
          />

          <Autocomplete
            freeSolo
            size="small"
            options={
              TRADE_OPTIONS
            }
            value={
              bulkTrade
            }
            onChange={(
              _event,
              value,
            ) =>
              setBulkTrade(
                value || '',
              )
            }
            onInputChange={(
              _event,
              value,
            ) =>
              setBulkTrade(
                value || '',
              )
            }
            renderInput={(
              params,
            ) => (
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
              selectedIds.length ===
                0 ||
              !String(
                bulkTrade || '',
              ).trim()
            }
            onClick={
              applyBulkTrade
            }
            sx={{
              fontWeight: 800,
            }}
          >
            적용
          </Button>

          <Typography
            sx={{
              ml: 'auto',
              color:
                '#64748b',
              fontSize:
                '0.72rem',
              fontWeight: 800,
            }}
          >
            총 {rows.length}명 ·
            선택{' '}
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
              tableLayout:
                'fixed',
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell
                  align="center"
                  sx={{
                    width: 52,
                    minWidth: 52,
                    maxWidth: 52,
                    px: 0.5,
                    overflow: 'visible',
                  }}
                >
                  <Checkbox
                    size="small"
                    disableRipple
                    icon={
                      <CheckBoxOutlineBlankRoundedIcon fontSize="small" />
                    }
                    checkedIcon={
                      <CheckBoxRoundedIcon fontSize="small" />
                    }
                    indeterminateIcon={
                      <IndeterminateCheckBoxRoundedIcon fontSize="small" />
                    }
                    checked={
                      allSelected
                    }
                    indeterminate={
                      partiallySelected
                    }
                    onChange={(
                      event,
                    ) =>
                      toggleAll(
                        event.target
                          .checked,
                      )
                    }
                    sx={{
                      p: 0.5,
                      '& .MuiSvgIcon-root': {
                        fontSize: 20,
                      },
                    }}
                  />
                </TableCell>

                <TableCell
                  align="center"
                  sx={{
                    width: 64,
                    minWidth: 64,
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
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
                    minWidth: 150,
                    fontWeight: 900,
                  }}
                >
                  비고
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rosterLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    align="center"
                    sx={{ py: 10 }}
                  >
                    <CircularProgress
                      size={26}
                    />
                  </TableCell>
                </TableRow>
              ) : rows.length ===
                0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    align="center"
                    sx={{
                      py: 10,
                      color:
                        '#94a3b8',
                    }}
                  >
                    근로자 조회 또는 신규 등록으로 명단을 구성해주세요.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(
                  (
                    row,
                    index,
                  ) => (
                    <TableRow
                      key={
                        row.id
                      }
                      hover
                      selected={selectedSet.has(
                        row.id,
                      )}
                    >
                      <TableCell
                        align="center"
                        sx={{
                          width: 52,
                          minWidth: 52,
                          maxWidth: 52,
                          px: 0.5,
                          overflow: 'visible',
                        }}
                      >
                        <Checkbox
                          size="small"
                          disableRipple
                          icon={
                            <CheckBoxOutlineBlankRoundedIcon fontSize="small" />
                          }
                          checkedIcon={
                            <CheckBoxRoundedIcon fontSize="small" />
                          }
                          checked={selectedSet.has(
                            row.id,
                          )}
                          onChange={() =>
                            toggleRow(
                              row.id,
                            )
                          }
                          sx={{
                            p: 0.5,
                            '& .MuiSvgIcon-root': {
                              fontSize: 20,
                            },
                          }}
                        />
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {index + 1}
                      </TableCell>

                      <TableCell align="center">
                        <Typography
                          sx={{
                            fontSize:
                              '0.78rem',
                            fontWeight: 800,
                          }}
                        >
                          {row.name}
                        </Typography>
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
                              value ||
                                '',
                            )
                          }
                          onInputChange={(
                            _event,
                            value,
                          ) =>
                            updateRow(
                              row.id,
                              'trade',
                              value ||
                                '',
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
                          value={
                            row.note
                          }
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
              color:
                '#64748b',
              fontSize:
                '0.75rem',
            }}
          >
            성명을 검색하고 추가한 뒤
            창을 닫지 않고 다음
            근로자를 계속 검색·추가할
            수 있습니다.
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
              value={
                lookupQuery
              }
              onChange={(
                event,
              ) =>
                setLookupQuery(
                  event.target
                    .value,
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
              disabled={
                lookupLoading
              }
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
                  py: 2.5,
                  textAlign:
                    'center',
                }}
              >
                <Typography
                  sx={{
                    color:
                      '#64748b',
                    fontSize:
                      '0.76rem',
                  }}
                >
                  {lookupMessage}
                </Typography>

                {lookupResults.length ===
                  0 &&
                  lookupQuery
                    .trim()
                    .length >=
                    2 && (
                    <Button
                      size="small"
                      sx={{ mt: 1 }}
                      startIcon={
                        <AddCircleOutlineRoundedIcon />
                      }
                      onClick={() =>
                        openNewWorker(
                          lookupQuery,
                        )
                      }
                    >
                      신규 근로자로 등록
                    </Button>
                  )}
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
                      key={
                        worker.id
                      }
                      variant="outlined"
                      sx={{
                        p: 1,
                        display:
                          'flex',
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
            onClick={() =>
              openNewWorker(
                lookupQuery,
              )
            }
            startIcon={
              <AddCircleOutlineRoundedIcon />
            }
          >
            신규 근로자 등록
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

      <Dialog
        open={newWorkerOpen}
        onClose={() => {
          if (
            !newWorkerSaving
          ) {
            setNewWorkerOpen(
              false,
            );
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle
          sx={{ fontWeight: 900 }}
        >
          신규 근로자 등록
        </DialogTitle>

        <DialogContent dividers>
          <Alert
            severity="info"
            sx={{
              mb: 1.25,
              '& .MuiAlert-message':
                {
                  fontSize:
                    '0.7rem',
                },
            }}
          >
            담당자도 자기 현장 월별 노임작성
            과정에서 신규 근로자를 등록할 수
            있습니다. 이 단계에서는 동명이인
            식별용 최소정보만 등록하며,
            주민번호·계좌 등 보호정보는 별도
            보안 입력 단계에서 관리합니다.
          </Alert>

          <Stack spacing={1.15}>
            <TextField
              fullWidth
              required
              size="small"
              label="성명"
              value={
                newWorker.name
              }
              onChange={(
                event,
              ) =>
                setNewWorker(
                  (previous) => ({
                    ...previous,
                    name:
                      event.target
                        .value,
                  }),
                )
              }
            />

            <Box>
              <Typography
                sx={{
                  mb: 0.55,
                  color: '#475569',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                }}
              >
                생년월일 *
              </Typography>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: '1.35fr 0.8fr 0.8fr',
                  },
                  gap: 0.7,
                }}
              >
                <Autocomplete
                  size="small"
                  options={
                    BIRTH_YEAR_OPTIONS
                  }
                  value={
                    newWorker.birthYear ||
                    null
                  }
                  onChange={(
                    _event,
                    value,
                  ) =>
                    setNewWorker(
                      (previous) => {
                        const nextYear =
                          value || '';

                        const validDays =
                          getBirthDayOptions(
                            nextYear,
                            previous.birthMonth,
                          );

                        return {
                          ...previous,
                          birthYear:
                            nextYear,
                          birthDay:
                            validDays.includes(
                              previous.birthDay,
                            )
                              ? previous.birthDay
                              : '',
                        };
                      },
                    )
                  }
                  renderInput={(
                    params,
                  ) => (
                    <TextField
                      {...params}
                      required
                      label="생년"
                      placeholder="예: 1992"
                    />
                  )}
                />

                <TextField
                  fullWidth
                  required
                  select
                  size="small"
                  label="월"
                  value={
                    newWorker.birthMonth
                  }
                  onChange={(event) =>
                    setNewWorker(
                      (previous) => {
                        const nextMonth =
                          event.target.value;

                        const validDays =
                          getBirthDayOptions(
                            previous.birthYear,
                            nextMonth,
                          );

                        return {
                          ...previous,
                          birthMonth:
                            nextMonth,
                          birthDay:
                            validDays.includes(
                              previous.birthDay,
                            )
                              ? previous.birthDay
                              : '',
                        };
                      },
                    )
                  }
                >
                  <MenuItem value="">
                    선택
                  </MenuItem>

                  {BIRTH_MONTH_OPTIONS.map(
                    (month) => (
                      <MenuItem
                        key={month}
                        value={month}
                      >
                        {Number(month)}월
                      </MenuItem>
                    ),
                  )}
                </TextField>

                <TextField
                  fullWidth
                  required
                  select
                  size="small"
                  label="일"
                  value={
                    newWorker.birthDay
                  }
                  disabled={
                    !newWorker.birthYear ||
                    !newWorker.birthMonth
                  }
                  onChange={(event) =>
                    setNewWorker(
                      (previous) => ({
                        ...previous,
                        birthDay:
                          event.target
                            .value,
                      }),
                    )
                  }
                >
                  <MenuItem value="">
                    선택
                  </MenuItem>

                  {getBirthDayOptions(
                    newWorker.birthYear,
                    newWorker.birthMonth,
                  ).map((day) => (
                    <MenuItem
                      key={day}
                      value={day}
                    >
                      {Number(day)}일
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
            </Box>

            <TextField
              fullWidth
              required
              size="small"
              label="휴대폰 뒤 4자리"
              value={
                newWorker.phoneLast4
              }
              onChange={(
                event,
              ) =>
                setNewWorker(
                  (previous) => ({
                    ...previous,
                    phoneLast4:
                      event.target
                        .value
                        .replace(
                          /\D/g,
                          '',
                        )
                        .slice(
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
            />

            <Autocomplete
              freeSolo
              size="small"
              options={
                TRADE_OPTIONS
              }
              value={
                newWorker.trade
              }
              onChange={(
                _event,
                value,
              ) =>
                setNewWorker(
                  (previous) => ({
                    ...previous,
                    trade:
                      value || '',
                  }),
                )
              }
              onInputChange={(
                _event,
                value,
              ) =>
                setNewWorker(
                  (previous) => ({
                    ...previous,
                    trade:
                      value || '',
                  }),
                )
              }
              renderInput={(
                params,
              ) => (
                <TextField
                  {...params}
                  required
                  label="공종"
                />
              )}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setNewWorkerOpen(
                false,
              )
            }
            disabled={
              newWorkerSaving
            }
          >
            취소
          </Button>

          <Button
            variant="contained"
            onClick={() =>
              void createNewWorker()
            }
            disabled={
              newWorkerSaving
            }
            sx={{
              boxShadow: 'none',
            }}
          >
            {newWorkerSaving
              ? '등록 중...'
              : '등록 후 명단 추가'}
          </Button>
        </DialogActions>
      </Dialog>


      <Dialog
        open={exportCheckOpen}
        onClose={() => {
          if (!exportCheckLoading) {
            setExportCheckOpen(false);
          }
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          노임 Excel 생성 준비
        </DialogTitle>

        <DialogContent dividers>
          {exportCheckLoading ? (
            <Box
              sx={{
                py: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CircularProgress size={28} />
            </Box>
          ) : exportCheck ? (
            <Stack spacing={1.2}>
              <Alert
                severity={
                  exportCheck.ready
                    ? 'success'
                    : 'warning'
                }
              >
                {exportCheck.message ||
                  (exportCheck.ready
                    ? '기본 Excel 생성 데이터가 준비되었습니다.'
                    : '보완이 필요한 항목이 있습니다.')}
              </Alert>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr 1fr',
                    md: 'repeat(4, minmax(0, 1fr))',
                  },
                  gap: 0.8,
                }}
              >
                {[
                  ['전체 근로자', exportCheck.worker_count || 0],
                  ['준비 완료', exportCheck.ready_worker_count || 0],
                  ['보완 필요', exportCheck.issue_worker_count || 0],
                  ['누락 항목', exportCheck.issue_count || 0],
                ].map(([label, value]) => (
                  <Paper
                    key={label}
                    variant="outlined"
                    sx={{
                      p: 1,
                      textAlign: 'center',
                      borderColor: '#cbd5e1',
                    }}
                  >
                    <Typography
                      sx={{
                        color: '#64748b',
                        fontSize: '0.66rem',
                        fontWeight: 800,
                      }}
                    >
                      {label}
                    </Typography>
                    <Typography
                      sx={{
                        mt: 0.25,
                        color: '#0f172a',
                        fontSize: '1rem',
                        fontWeight: 900,
                      }}
                    >
                      {Number(value).toLocaleString('ko-KR')}
                    </Typography>
                  </Paper>
                ))}
              </Box>

              {Array.isArray(exportCheck.workers) &&
              exportCheck.workers.length > 0 ? (
                <TableContainer
                  sx={{
                    maxHeight: 360,
                    border: '1px solid #e2e8f0',
                    borderRadius: 1,
                  }}
                >
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell
                          align="center"
                          sx={{ width: 60, fontWeight: 900 }}
                        >
                          순번
                        </TableCell>
                        <TableCell sx={{ width: 120, fontWeight: 900 }}>
                          성명
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{ width: 120, fontWeight: 900 }}
                        >
                          생년월일
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{ width: 120, fontWeight: 900 }}
                        >
                          휴대폰
                        </TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>
                          보완 필요
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {exportCheck.workers.map((worker) => (
                        <TableRow
                          key={
                            worker.worker_master_id ||
                            `${worker.sort_order}-${worker.name_ko}`
                          }
                          hover
                        >
                          <TableCell align="center">
                            {worker.sort_order || '-'}
                          </TableCell>
                          <TableCell>
                            {worker.name_ko || '-'}
                          </TableCell>
                          <TableCell align="center">
                            {worker.birth_date || '-'}
                          </TableCell>
                          <TableCell align="center">
                            {worker.phone_masked || '-'}
                          </TableCell>
                          <TableCell>
                            <Typography
                              sx={{
                                color: '#b45309',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                              }}
                            >
                              {formatExportMissingFields(
                                worker.missing_fields,
                              )}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : null}

              {exportCheck.ready ? (
                <Alert severity="info">
                  기본 데이터 준비는 완료되었습니다. 실제 회사 노임 Excel
                  원본을 연결하면 다음 단계에서 시트·셀·수식 매핑과
                  SMS 인증 다운로드를 붙일 수 있습니다.
                </Alert>
              ) : (
                <Typography
                  sx={{
                    color: '#64748b',
                    fontSize: '0.68rem',
                    lineHeight: 1.55,
                  }}
                >
                  주민번호·계좌번호 같은 원문은 이 검사에서 복호화하거나
                  화면으로 전송하지 않습니다. 등록 여부와 노임 입력
                  상태만 검사합니다.
                </Typography>
              )}
            </Stack>
          ) : (
            <Typography
              sx={{
                py: 4,
                textAlign: 'center',
                color: '#94a3b8',
                fontSize: '0.75rem',
              }}
            >
              확인 결과가 없습니다.
            </Typography>
          )}
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => setExportCheckOpen(false)}
            disabled={exportCheckLoading}
          >
            닫기
          </Button>
        </DialogActions>
      </Dialog>

      <LaborDownloadAuthDialog
        open={downloadAuthOpen}
        onClose={() =>
          setDownloadAuthOpen(false)
        }
        projectName={projectName}
        monthKey={yearMonth}
      />

      <LaborSecurityPhoneDialog
        open={securityPhoneOpen}
        onClose={() =>
          setSecurityPhoneOpen(false)
        }
      />

      <Snackbar
        open={Boolean(message)}
        autoHideDuration={3500}
        onClose={() =>
          setMessage(null)
        }
        anchorOrigin={{
          vertical: 'top',
          horizontal:
            'center',
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
