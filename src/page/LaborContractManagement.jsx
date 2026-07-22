import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import AssignmentLateRoundedIcon from '@mui/icons-material/AssignmentLateRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import ExcelJS from 'exceljs';
import { supabase } from '../supabaseClient';
import { createLaborContractPrintWindow } from '../utils/laborContractPrint';

const PAGE_SIZE = 1000;
const CONTRACT_TEMPLATE_VERSION = 'LABOR_CONTRACT_V1';
const CONTRACT_TEMPLATE_SHEET = '근로계약서작성자료';
const FIXED_CONTRACT_VALUES = Object.freeze({
  job: '일급제',
  process: '내장공',
  dailyWage: 180000,
  workStartTime: '07:00',
  workEndTime: '17:00',
  breakMinutes: 120,
  workDescription: '내장공',
});
const CONTRACT_TEMPLATE_HEADERS = [
  '근로자번호',
  '성명',
  '연락처',
  '주민등록번호',
  '주소',
  '직종',
  '공정',
  '계약시작일',
  '계약종료일',
  '일급',
  '근무시작',
  '근무종료',
  '휴게시간(분)',
  '업무내용',
];
const CONTRACT_TEMPLATE_EDITABLE_COLUMNS = new Set([3, 4, 5]);

const STATUS_META = {
  required: {
    label: '양식 미입력',
    color: 'error',
    screenGroup: 'missing',
  },
  form_ready: {
    label: '양식입력완료',
    color: 'info',
    screenGroup: 'progress',
  },
  pdf_generated: {
    label: 'PDF 생성',
    color: 'primary',
    screenGroup: 'progress',
  },
  scan_verified: {
    label: '서명본 확인',
    color: 'secondary',
    screenGroup: 'progress',
  },
  manager_confirmed: {
    label: '작성완료',
    color: 'success',
    screenGroup: 'complete',
  },
  rejected: {
    label: '반려',
    color: 'error',
    screenGroup: 'missing',
  },
  excluded: {
    label: '제외',
    color: 'default',
    screenGroup: 'excluded',
  },
};

const ACCESS_ROLE_LABELS = {
  site_manager: '현장 담당자',
  labor_manager: '노임 관리자',
  admin: '최고관리자',
};

const getKoreaMonthKey = () => {
  const now = new Date(
    new Date().toLocaleString(
      'en-US',
      {
        timeZone: 'Asia/Seoul',
      },
    ),
  );

  return [
    now.getFullYear(),
    String(
      now.getMonth() + 1,
    ).padStart(2, '0'),
  ].join('-');
};

const normalizeName = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();

const parseReportDate = (value) => {
  const text =
    String(value || '').trim();

  let matched =
    text.match(
      /^(\d{2})\.(\d{1,2})\.(\d{1,2})$/,
    );

  if (matched) {
    const year =
      2000 +
      Number(matched[1]);

    const month =
      Number(matched[2]);

    const day =
      Number(matched[3]);

    const date =
      new Date(
        year,
        month - 1,
        day,
      );

    if (
      date.getFullYear() === year &&
      date.getMonth() + 1 === month &&
      date.getDate() === day
    ) {
      return [
        String(year),
        String(month).padStart(
          2,
          '0',
        ),
        String(day).padStart(
          2,
          '0',
        ),
      ].join('-');
    }
  }

  matched =
    text.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})/,
    );

  if (matched) {
    return [
      matched[1],
      String(
        Number(matched[2]),
      ).padStart(2, '0'),
      String(
        Number(matched[3]),
      ).padStart(2, '0'),
    ].join('-');
  }

  return '';
};

const formatShortDate = (value) => {
  if (!value) {
    return '-';
  }

  const matched =
    String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})/,
    );

  if (!matched) {
    return String(value);
  }

  return [
    matched[1].slice(-2),
    matched[2],
    matched[3],
  ].join('.');
};

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return String(value);
  }

  return date.toLocaleString(
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
  );
};

const formatMonthLabel = (
  monthKey,
) => {
  const [
    year,
    month,
  ] = String(monthKey || '')
    .split('-');

  if (!year || !month) {
    return '-';
  }

  return `${year}년 ${Number(month)}월`;
};

const maskPhone = (value) => {
  const digits =
    String(value || '')
      .replace(/\D/g, '');

  if (digits.length < 8) {
    return value || '미등록';
  }

  return [
    digits.slice(0, 3),
    '****',
    digits.slice(-4),
  ].join('-');
};

const getWorkerWorkAmount = (
  worker,
) => {
  const day =
    Number(worker?.day || 0);

  const night =
    Number(worker?.night || 0);

  return day + night;
};

const getLatestWorkerInfo = (
  current,
  worker,
  workDate,
) => {
  if (
    !current.latestWorkDate ||
    workDate >=
      current.latestWorkDate
  ) {
    current.latestWorkDate =
      workDate;

    current.job =
      String(
        worker?.job || '',
      ).trim();

    current.process =
      String(
        worker?.process ||
          worker?.job ||
          '',
      ).trim();
  }
};

const getStatusMeta = (
  status,
) =>
  STATUS_META[status] ||
  STATUS_META.required;

const getExcelCellText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('');
    }
    if (value.text !== undefined) return String(value.text);
    if (value.result !== undefined) return String(value.result);
  }
  return String(value).trim();
};

const parseExcelDateValue = (value) => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }
  const matched = getExcelCellText(value).match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (!matched) return '';
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return '';
  return [String(year), String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
};

const getMonthEndDate = (monthKey) => {
  const matched = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);

  if (!matched) {
    return '';
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const lastDay = new Date(year, month, 0).getDate();

  return `${matched[1]}-${matched[2]}-${String(lastDay).padStart(2, '0')}`;
};

const getFixedContractStartDate = (row, monthKey) => {
  if (row?.requirement_type === 'continuous') {
    return `${monthKey}-01`;
  }

  return (
    parseExcelDateValue(row?.current_month_first_work_date) ||
    `${monthKey}-01`
  );
};

const sortRowsByContractStart = (rows, monthKey) =>
  [...rows].sort((first, second) => {
    const firstDate = getFixedContractStartDate(first, monthKey);
    const secondDate = getFixedContractStartDate(second, monthKey);

    return (
      firstDate.localeCompare(secondDate) ||
      String(first?.name || '').localeCompare(
        String(second?.name || ''),
        'ko',
        { numeric: true },
      )
    );
  });

const downloadExcelBuffer = (buffer, fileName) => {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const normalizeResidentNumber = (value) => {
  const digits = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 13);

  if (digits.length <= 6) {
    return digits;
  }

  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
};

const isValidResidentNumber = (value) =>
  /^\d{6}-\d{7}$/.test(
    normalizeResidentNumber(value),
  );

const maskResidentNumber = (value) => {
  const normalized = normalizeResidentNumber(value);

  if (!normalized) {
    return '-';
  }

  return normalized.length >= 8
    ? `${normalized.slice(0, 8)}******`
    : normalized;
};

export default function LaborContractManagement({
  projectName = '',
  userProfile = null,
}) {
  const [
    selectedMonth,
    setSelectedMonth,
  ] = useState(
    getKoreaMonthKey(),
  );

  const [
    loadingReports,
    setLoadingReports,
  ] = useState(false);

  const [
    loadingStoredRows,
    setLoadingStoredRows,
  ] = useState(false);

  const [
    syncing,
    setSyncing,
  ] = useState(false);

  const [
    reports,
    setReports,
  ] = useState([]);

  const [
    storedRows,
    setStoredRows,
  ] = useState([]);

  const [
    accessInfo,
    setAccessInfo,
  ] = useState(null);

  const [
    accessChecked,
    setAccessChecked,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const [
    successMessage,
    setSuccessMessage,
  ] = useState('');

  const [
    searchText,
    setSearchText,
  ] = useState('');

  const [
    workerTypeFilter,
    setWorkerTypeFilter,
  ] = useState('all');

  const [
    statusFilter,
    setStatusFilter,
  ] = useState('all');

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  const [
    workerEditOpen,
    setWorkerEditOpen,
  ] = useState(false);

  const [
    workerEditForm,
    setWorkerEditForm,
  ] = useState(null);

  const [
    actionDialog,
    setActionDialog,
  ] = useState(null);

  const [
    actionReason,
    setActionReason,
  ] = useState('');

  const [
    actionFileName,
    setActionFileName,
  ] = useState('');

  const [
    actionSaving,
    setActionSaving,
  ] = useState(false);

  const [
    eventDialogOpen,
    setEventDialogOpen,
  ] = useState(false);

  const [
    eventTarget,
    setEventTarget,
  ] = useState(null);

  const [
    eventRows,
    setEventRows,
  ] = useState([]);

  const [
    eventLoading,
    setEventLoading,
  ] = useState(false);

  const contractFileInputRef = useRef(null);

  const [
    importDialogOpen,
    setImportDialogOpen,
  ] = useState(false);

  const [
    importFileName,
    setImportFileName,
  ] = useState('');

  const [
    importRows,
    setImportRows,
  ] = useState([]);

  const [
    importSaving,
    setImportSaving,
  ] = useState(false);

  const [
    contractPrintOpen,
    setContractPrintOpen,
  ] = useState(false);

  const [
    contractPrintLoading,
    setContractPrintLoading,
  ] = useState(false);

  const [
    includeCompletedPrintRows,
    setIncludeCompletedPrintRows,
  ] = useState(false);

  const [
    selectedPrintIds,
    setSelectedPrintIds,
  ] = useState([]);

  const [
    sensitivePrintInputs,
    setSensitivePrintInputs,
  ] = useState({});

  const [
    contractPrintError,
    setContractPrintError,
  ] = useState('');

  const [
    pendingPrintBatch,
    setPendingPrintBatch,
  ] = useState(null);

  const [
    printRecordSaving,
    setPrintRecordSaving,
  ] = useState(false);

  const canManage =
    Boolean(
      accessInfo?.can_manage,
    );

  const loadAccess =
    useCallback(
      async () => {
        setAccessChecked(false);

        if (!projectName) {
          setAccessInfo(null);
          setAccessChecked(true);
          return;
        }

        const {
          data,
          error,
        } = await supabase.rpc(
          'labor_get_my_access',
          {
            p_project_name:
              projectName,
          },
        );

        if (error) {
          console.error(
            '노임관리 접근권한 조회 오류:',
            error,
          );

          setAccessInfo(null);
          setErrorMessage(
            error.message ||
              '노임관리 접근권한을 확인하지 못했습니다.',
          );
        } else {
          setAccessInfo(
            data?.[0] || null,
          );
        }

        setAccessChecked(true);
      },
      [projectName],
    );

  const loadStoredRows =
    useCallback(
      async () => {
        if (
          !projectName ||
          !accessInfo
        ) {
          setStoredRows([]);
          return [];
        }

        setLoadingStoredRows(true);

        const [
          requirementResult,
          formResult,
        ] = await Promise.all([
          supabase.rpc(
            'labor_get_contract_month',
            {
              p_project_name: projectName,
              p_contract_month: selectedMonth,
            },
          ),
          supabase.rpc(
            'labor_get_contract_forms',
            {
              p_project_name: projectName,
              p_contract_month: selectedMonth,
            },
          ),
        ]);

        if (
          requirementResult.error ||
          formResult.error
        ) {
          const error =
            requirementResult.error ||
            formResult.error;

          console.error(
            '근로계약 월별 상태 조회 오류:',
            error,
          );

          setStoredRows([]);
          setErrorMessage(
            error?.message ||
              '저장된 근로계약 상태를 불러오지 못했습니다.',
          );
          setLoadingStoredRows(false);
          return [];
        } else {
          const formMap = new Map(
            (formResult.data || []).map(
              (formRow) => [
                formRow.requirement_id,
                formRow,
              ],
            ),
          );

          const nextRows = (requirementResult.data || []).map(
            (requirement) => ({
              ...requirement,
              contract_form:
                formMap.get(requirement.requirement_id) || null,
            }),
          );

          setStoredRows(nextRows);
          setLoadingStoredRows(false);
          return nextRows;
        }
      },
      [
        accessInfo,
        projectName,
        selectedMonth,
      ],
    );

  useEffect(() => {
    loadAccess();
  }, [
    loadAccess,
    refreshKey,
  ]);

  useEffect(() => {
    let active = true;

    const fetchReports =
      async () => {
        if (!projectName) {
          if (active) {
            setReports([]);
          }

          return;
        }

        setLoadingReports(true);
        setErrorMessage('');

        try {
          const allRows = [];
          let from = 0;

          while (true) {
            const to =
              from +
              PAGE_SIZE -
              1;

            const {
              data,
              error,
            } = await supabase
              .from('daily_reports')
              .select(
                'date, workers, project_name',
              )
              .eq(
                'project_name',
                projectName,
              )
              .order(
                'date',
                {
                  ascending: true,
                },
              )
              .range(
                from,
                to,
              );

            if (error) {
              throw error;
            }

            const pageRows =
              data || [];

            allRows.push(
              ...pageRows,
            );

            if (
              pageRows.length <
              PAGE_SIZE
            ) {
              break;
            }

            from += PAGE_SIZE;
          }

          if (active) {
            setReports(
              allRows,
            );
          }
        } catch (error) {
          console.error(
            '근로계약 대상자 조회 오류:',
            error,
          );

          if (active) {
            setReports([]);

            setErrorMessage(
              error?.message ||
                '출력일보 근로자 정보를 불러오지 못했습니다.',
            );
          }
        } finally {
          if (active) {
            setLoadingReports(false);
          }
        }
      };

    fetchReports();

    return () => {
      active = false;
    };
  }, [
    projectName,
    refreshKey,
  ]);

  useEffect(() => {
    loadStoredRows();
  }, [
    loadStoredRows,
    refreshKey,
  ]);

  const analyzedWorkers =
    useMemo(() => {
      const workerMap =
        new Map();

      const monthStart =
        `${selectedMonth}-01`;

      const nextMonthDate =
        new Date(
          Number(
            selectedMonth.slice(
              0,
              4,
            ),
          ),
          Number(
            selectedMonth.slice(
              5,
              7,
            ),
          ),
          1,
        );

      const nextMonth =
        [
          nextMonthDate.getFullYear(),
          String(
            nextMonthDate.getMonth() +
              1,
          ).padStart(2, '0'),
        ].join('-');

      const monthEndExclusive =
        `${nextMonth}-01`;

      reports.forEach(
        (report) => {
          const workDate =
            parseReportDate(
              report.date,
            );

          if (!workDate) {
            return;
          }

          const workers =
            Array.isArray(
              report.workers,
            )
              ? report.workers
              : [];

          workers.forEach(
            (worker) => {
              const displayName =
                String(
                  worker?.name || '',
                ).trim();

              const normalizedName =
                normalizeName(
                  displayName,
                );

              if (
                !displayName ||
                !normalizedName
              ) {
                return;
              }

              if (
                !workerMap.has(
                  normalizedName,
                )
              ) {
                workerMap.set(
                  normalizedName,
                  {
                    key:
                      normalizedName,
                    displayName,
                    normalizedName,
                    job: '',
                    process: '',
                    firstWorkDate:
                      workDate,
                    latestWorkDate:
                      workDate,
                    hasWorkBeforeMonth:
                      false,
                    currentMonthDates:
                      [],
                    currentMonthAmount:
                      0,
                  },
                );
              }

              const target =
                workerMap.get(
                  normalizedName,
                );

              if (
                workDate <
                target.firstWorkDate
              ) {
                target.firstWorkDate =
                  workDate;
              }

              getLatestWorkerInfo(
                target,
                worker,
                workDate,
              );

              if (
                workDate <
                monthStart
              ) {
                target.hasWorkBeforeMonth =
                  true;
              }

              if (
                workDate >=
                  monthStart &&
                workDate <
                  monthEndExclusive
              ) {
                target.currentMonthDates.push(
                  workDate,
                );

                target.currentMonthAmount +=
                  getWorkerWorkAmount(
                    worker,
                  );
              }
            },
          );
        },
      );

      return Array.from(
        workerMap.values(),
      )
        .filter(
          (worker) =>
            worker.currentMonthDates
              .length > 0,
        )
        .map(
          (worker) => {
            const requirementType =
              worker.hasWorkBeforeMonth
                ? 'continuous'
                : 'new';

            return {
              ...worker,
              requirementType,
              requirementLabel:
                requirementType ===
                'continuous'
                  ? '연속근무자'
                  : '신규근로자',
              contractMonth:
                selectedMonth,
              currentMonthFirstDate:
                worker.currentMonthDates
                  .slice()
                  .sort()[0],
            };
          },
        )
        .sort(
          (first, second) => {
            const firstContractStart =
              first.requirementType === 'continuous'
                ? `${selectedMonth}-01`
                : first.currentMonthFirstDate;
            const secondContractStart =
              second.requirementType === 'continuous'
                ? `${selectedMonth}-01`
                : second.currentMonthFirstDate;

            return (
              firstContractStart.localeCompare(
                secondContractStart,
              ) ||
              first.displayName.localeCompare(
                second.displayName,
                'ko',
                {
                  numeric: true,
                },
              )
            );
          },
        );
    }, [
      reports,
      selectedMonth,
    ]);

  const handleDownloadTemplate = async () => {
    const targetRows = sortRowsByContractStart(
      storedRows.filter(
        (row) => !['manager_confirmed', 'excluded'].includes(row.status),
      ),
      selectedMonth,
    );

    if (targetRows.length === 0) {
      setErrorMessage('양식에 넣을 작성 대상자가 없습니다. 먼저 작성 대상을 반영해주세요.');
      return;
    }

    setErrorMessage('');

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Wooklim Construction Management';
      const worksheet = workbook.addWorksheet(CONTRACT_TEMPLATE_SHEET, {
        views: [{ state: 'frozen', ySplit: 5 }],
      });

      worksheet.mergeCells('A1:N1');
      worksheet.getCell('A1').value = '근로계약서 작성자료';
      worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      worksheet.getRow(1).height = 28;

      worksheet.getCell('A2').value = '양식버전';
      worksheet.getCell('B2').value = CONTRACT_TEMPLATE_VERSION;
      worksheet.getCell('D2').value = '현장명';
      worksheet.getCell('E2').value = projectName;
      worksheet.getCell('G2').value = '계약대상월';
      worksheet.getCell('H2').value = selectedMonth;

      worksheet.mergeCells('A3:N3');
      worksheet.getCell('A3').value = '노란색 3개 열(연락처, 주민등록번호, 주소)만 입력하세요. 회색 항목은 회사 양식에 맞춘 고정값입니다.';
      worksheet.getCell('A3').font = { bold: true, color: { argb: 'FF9A3412' } };
      worksheet.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };

      worksheet.mergeCells('A4:N4');
      worksheet.getCell('A4').value = '필수입력: 연락처, 주민등록번호, 주소 · 계약종료일은 월말 · 일급은 180,000원 · 목록은 계약시작일 과거순';
      worksheet.getCell('A4').font = { color: { argb: 'FF475569' } };

      const headerRow = worksheet.getRow(5);
      CONTRACT_TEMPLATE_HEADERS.forEach((header, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = header;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });
      headerRow.height = 24;

      targetRows.forEach((row, index) => {
        const excelRow = worksheet.getRow(index + 6);
        const form = row.contract_form || {};
        excelRow.values = [
          row.worker_code,
          row.name,
          form.phone || row.phone || '',
          '',
          '',
          FIXED_CONTRACT_VALUES.job,
          FIXED_CONTRACT_VALUES.process,
          getFixedContractStartDate(row, selectedMonth),
          getMonthEndDate(selectedMonth),
          FIXED_CONTRACT_VALUES.dailyWage,
          FIXED_CONTRACT_VALUES.workStartTime,
          FIXED_CONTRACT_VALUES.workEndTime,
          FIXED_CONTRACT_VALUES.breakMinutes,
          FIXED_CONTRACT_VALUES.workDescription,
        ];
        excelRow.getCell(3).numFmt = '@';
        excelRow.getCell(4).numFmt = '@';
        excelRow.getCell(10).numFmt = '#,##0';
        excelRow.getCell(13).numFmt = '0';
        for (let column = 1; column <= CONTRACT_TEMPLATE_HEADERS.length; column += 1) {
          excelRow.getCell(column).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: {
              argb: CONTRACT_TEMPLATE_EDITABLE_COLUMNS.has(column)
                ? 'FFFFF2CC'
                : 'FFF1F5F9',
            },
          };
          excelRow.getCell(column).border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
        }
      });

      [16, 13, 18, 20, 34, 14, 15, 14, 14, 14, 12, 12, 14, 24].forEach((width, index) => {
        worksheet.getColumn(index + 1).width = width;
      });
      worksheet.autoFilter = { from: 'A5', to: 'N5' };

      const buffer = await workbook.xlsx.writeBuffer();
      downloadExcelBuffer(buffer, `근로계약서작성자료_${projectName}_${selectedMonth}.xlsx`);
      setSuccessMessage(`${formatMonthLabel(selectedMonth)} 작성 대상 ${targetRows.length.toLocaleString()}명의 양식을 다운로드했습니다.`);
    } catch (error) {
      console.error('근로계약서 양식 생성 오류:', error);
      setErrorMessage(error?.message || '근로계약서 작성자료 양식을 만들지 못했습니다.');
    }
  };

  const handleContractFileSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setErrorMessage('');
    setSuccessMessage('');

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.getWorksheet(CONTRACT_TEMPLATE_SHEET);
      if (!worksheet) throw new Error(`시트 이름이 '${CONTRACT_TEMPLATE_SHEET}'인 회사 배포 양식만 업로드할 수 있습니다.`);

      const templateVersion = getExcelCellText(worksheet.getCell('B2').value);
      const uploadedProject = getExcelCellText(worksheet.getCell('E2').value);
      const uploadedMonth = getExcelCellText(worksheet.getCell('H2').value).slice(0, 7);
      if (templateVersion !== CONTRACT_TEMPLATE_VERSION) throw new Error(`양식 버전이 다릅니다. 현재 버전은 ${CONTRACT_TEMPLATE_VERSION}입니다.`);
      if (uploadedProject !== projectName) throw new Error(`업로드 현장(${uploadedProject || '없음'})과 현재 현장(${projectName})이 다릅니다.`);
      if (uploadedMonth !== selectedMonth) throw new Error(`업로드 계약월(${uploadedMonth || '없음'})과 현재 선택 월(${selectedMonth})이 다릅니다.`);

      const actualHeaders = CONTRACT_TEMPLATE_HEADERS.map((_, index) => getExcelCellText(worksheet.getRow(5).getCell(index + 1).value));
      if (CONTRACT_TEMPLATE_HEADERS.some((header, index) => actualHeaders[index] !== header)) {
        throw new Error('양식의 열 제목이 변경되었습니다. 최신 양식을 다시 다운로드해주세요.');
      }

      const storedMap = new Map(storedRows.map((row) => [row.worker_code, row]));
      const seenCodes = new Set();
      const duplicateCodes = new Set();
      const parsedRows = [];

      for (let rowNumber = 6; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const excelRow = worksheet.getRow(rowNumber);
        const workerCode = getExcelCellText(excelRow.getCell(1).value);
        const name = getExcelCellText(excelRow.getCell(2).value);
        if (!workerCode && !name) continue;
        if (seenCodes.has(workerCode)) duplicateCodes.add(workerCode);
        seenCodes.add(workerCode);

        const stored = storedMap.get(workerCode);
        const phone = getExcelCellText(excelRow.getCell(3).value);
        const residentNumber = normalizeResidentNumber(
          getExcelCellText(excelRow.getCell(4).value),
        );
        const address = getExcelCellText(excelRow.getCell(5).value);
        const job = FIXED_CONTRACT_VALUES.job;
        const process = FIXED_CONTRACT_VALUES.process;
        const contractStartDate = stored
          ? getFixedContractStartDate(stored, selectedMonth)
          : '';
        const contractEndDate = getMonthEndDate(selectedMonth);
        const dailyWage = FIXED_CONTRACT_VALUES.dailyWage;
        const workStartTime = FIXED_CONTRACT_VALUES.workStartTime;
        const workEndTime = FIXED_CONTRACT_VALUES.workEndTime;
        const breakMinutes = FIXED_CONTRACT_VALUES.breakMinutes;
        const workDescription = FIXED_CONTRACT_VALUES.workDescription;
        const note = stored?.contract_form?.note || '';
        const issues = [];

        if (!workerCode) issues.push('근로자번호 누락');
        if (!stored) issues.push('현재 월 작성대상에 없는 근로자번호');
        if (stored && normalizeName(stored.name) !== normalizeName(name)) issues.push(`성명 불일치(등록: ${stored.name})`);
        if (stored && ['manager_confirmed', 'excluded'].includes(stored.status)) issues.push('완료 또는 제외된 대상');
        if (!phone) issues.push('연락처 누락');
        if (!isValidResidentNumber(residentNumber)) issues.push('주민등록번호 오류');
        if (!address) issues.push('주소 누락');
        if (!contractStartDate) issues.push('계약시작일 오류');
        if (!contractEndDate) issues.push('계약종료일 오류');
        if (contractStartDate && contractEndDate && contractStartDate > contractEndDate) issues.push('계약종료일이 시작일보다 빠름');

        parsedRows.push({
          excelRow: rowNumber,
          workerCode,
          name,
          phone,
          residentNumber,
          address,
          job,
          process,
          contractStartDate,
          contractEndDate,
          dailyWage,
          workStartTime,
          workEndTime,
          breakMinutes,
          workDescription,
          note,
          issues,
        });
      }

      if (parsedRows.length === 0) throw new Error('업로드할 근로자 작성자료가 없습니다.');
      parsedRows.forEach((row) => {
        if (duplicateCodes.has(row.workerCode)) row.issues.push('동일 근로자번호 중복');
      });

      setImportRows(parsedRows);
      setImportFileName(file.name);
      setImportDialogOpen(true);
    } catch (error) {
      console.error('근로계약서 작성자료 분석 오류:', error);
      setErrorMessage(error?.message || '근로계약서 작성자료를 분석하지 못했습니다.');
    }
  };

  const closeContractImportDialog = () => {
    if (importSaving) {
      return;
    }

    setImportDialogOpen(false);
    setImportRows([]);
    setImportFileName('');
  };

  const handleSaveContractImport = async () => {
    const invalidCount = importRows.filter((row) => row.issues.length > 0).length;
    if (invalidCount > 0) {
      setErrorMessage(`오류가 있는 ${invalidCount.toLocaleString()}개 행을 수정한 뒤 다시 업로드해주세요.`);
      return;
    }

    setImportSaving(true);
    setErrorMessage('');

    const importedRowsSnapshot = importRows.map((row) => ({
      ...row,
    }));

    const { data, error } = await supabase.rpc('labor_import_contract_forms', {
      p_project_name: projectName,
      p_contract_month: selectedMonth,
      p_template_version: CONTRACT_TEMPLATE_VERSION,
      p_file_name: importFileName,
      p_rows: importRows.map((row) => ({
        worker_code: row.workerCode,
        name: row.name,
        phone: row.phone,
        job: row.job,
        process: row.process,
        contract_start_date: row.contractStartDate,
        contract_end_date: row.contractEndDate,
        daily_wage: row.dailyWage,
        work_start_time: row.workStartTime,
        work_end_time: row.workEndTime,
        break_minutes: row.breakMinutes,
        work_description: row.workDescription,
        note: row.note,
      })),
    });

    if (error) {
      console.error('근로계약 작성자료 저장 오류:', error);
      setErrorMessage(error.message || '근로계약 작성자료를 저장하지 못했습니다.');
    } else {
      setSuccessMessage(`${formatMonthLabel(selectedMonth)} 근로계약 작성자료 ${(data?.imported_count || importedRowsSnapshot.length).toLocaleString()}명을 반영했습니다. 엑셀에 입력한 개인정보를 적용해 PDF 생성 화면을 열었습니다.`);
      setImportDialogOpen(false);
      setImportRows([]);
      setImportFileName('');
      const refreshedRows = await loadStoredRows();
      openContractPrintDialog(
        null,
        {
          sourceRows: refreshedRows,
          allowedWorkerCodes: importedRowsSnapshot.map(
            (row) => row.workerCode,
          ),
          sensitiveByWorkerCode: Object.fromEntries(
            importedRowsSnapshot.map((row) => [
              row.workerCode,
              {
                residentNumber: row.residentNumber,
                address: row.address,
              },
            ]),
          ),
        },
      );
    }
    setImportSaving(false);
  };

  const clearContractPrintInputs = () => {
    setSensitivePrintInputs({});
    setSelectedPrintIds([]);
    setContractPrintError('');
  };

  const closeContractPrintDialog = () => {
    if (contractPrintLoading) {
      return;
    }

    setContractPrintOpen(false);
    clearContractPrintInputs();
  };

  const openContractPrintDialog = (
    targetRow = null,
    options = {},
  ) => {
    const sourceRows = Array.isArray(options.sourceRows)
      ? options.sourceRows
      : storedRows;
    const allowedWorkerCodes = options.allowedWorkerCodes
      ? new Set(options.allowedWorkerCodes)
      : null;
    const sensitiveByWorkerCode = options.sensitiveByWorkerCode || {};
    const initialRows = targetRow
      ? [targetRow]
      : sortRowsByContractStart(
        sourceRows.filter(
          (row) =>
            row.contract_form &&
            [
              'form_ready',
              'rejected',
            ].includes(row.status) &&
            (
              !allowedWorkerCodes ||
              allowedWorkerCodes.has(row.worker_code)
            ),
        ),
        selectedMonth,
      );

    if (initialRows.length === 0) {
      setErrorMessage(
        'PDF로 출력할 양식입력완료 또는 반려 대상자가 없습니다.',
      );
      return;
    }

    setIncludeCompletedPrintRows(
      targetRow?.status === 'manager_confirmed',
    );
    setSelectedPrintIds(
      initialRows.map(
        (row) => String(row.requirement_id),
      ),
    );
    setSensitivePrintInputs(
      initialRows.reduce(
        (result, row) => ({
          ...result,
          [String(row.requirement_id)]: {
            residentNumber:
              sensitiveByWorkerCode[row.worker_code]
                ?.residentNumber || '',
            address:
              sensitiveByWorkerCode[row.worker_code]
                ?.address || '',
          },
        }),
        {},
      ),
    );
    setContractPrintError('');
    setContractPrintOpen(true);
  };

  const handlePrintRowToggle = (row) => {
    const rowId = String(row.requirement_id);
    const wasSelected =
      selectedPrintIds.includes(rowId);

    setSelectedPrintIds((previous) => {
      if (previous.includes(rowId)) {
        return previous.filter(
          (id) => id !== rowId,
        );
      }

      return [
        ...previous,
        rowId,
      ];
    });

    setSensitivePrintInputs((previous) => {
      if (wasSelected) {
        const next = {
          ...previous,
        };

        delete next[rowId];
        return next;
      }

      return {
        ...previous,
        [rowId]: previous[rowId] || {
          residentNumber: '',
          address: '',
        },
      };
    });
  };

  const handleSensitivePrintInput = (
    rowId,
    field,
    value,
  ) => {
    setSensitivePrintInputs(
      (previous) => ({
        ...previous,
        [rowId]: {
          residentNumber:
            previous[rowId]
              ?.residentNumber || '',
          address:
            previous[rowId]
              ?.address || '',
          [field]:
            field === 'residentNumber'
              ? normalizeResidentNumber(value)
              : value,
        },
      }),
    );
  };

  const handleSelectAllPrintRows = (
    checked,
  ) => {
    if (!checked) {
      clearContractPrintInputs();
      return;
    }

    setSelectedPrintIds(
      contractPrintRows.map(
        (row) => String(row.requirement_id),
      ),
    );
    setSensitivePrintInputs(
      (previous) =>
        contractPrintRows.reduce(
          (result, row) => {
            const rowId =
              String(row.requirement_id);

            return {
              ...result,
              [rowId]:
                previous[rowId] || {
                  residentNumber: '',
                  address: '',
                },
            };
          },
          {},
        ),
    );
  };

  const handleIncludeCompletedPrintRows = (
    checked,
  ) => {
    setIncludeCompletedPrintRows(
      checked,
    );

    if (checked) {
      return;
    }

    const completedIds = new Set(
      storedRows
        .filter(
          (row) =>
            row.status ===
            'manager_confirmed',
        )
        .map(
          (row) =>
            String(
              row.requirement_id,
            ),
        ),
    );

    setSelectedPrintIds(
      (previous) =>
        previous.filter(
          (id) =>
            !completedIds.has(id),
        ),
    );
    setSensitivePrintInputs(
      (previous) =>
        Object.fromEntries(
          Object.entries(previous)
            .filter(
              ([id]) =>
                !completedIds.has(id),
            ),
        ),
    );
  };

  const handleCreateContractPdf = async () => {
    const selectedRows = sortRowsByContractStart(
      storedRows.filter(
        (row) =>
          selectedPrintIds.includes(
            String(row.requirement_id),
          ),
      ),
      selectedMonth,
    );

    if (selectedRows.length === 0) {
      setContractPrintError(
        'PDF로 출력할 근로자를 한 명 이상 선택해주세요.',
      );
      return;
    }

    const invalidRows = selectedRows.filter(
      (row) => {
        const values =
          sensitivePrintInputs[
            String(row.requirement_id)
          ] || {};

        return (
          !isValidResidentNumber(
            values.residentNumber,
          ) ||
          !String(
            values.address || '',
          ).trim()
        );
      },
    );

    if (invalidRows.length > 0) {
      setContractPrintError(
        `${invalidRows.map((row) => row.name).join(', ')}의 주민등록번호와 주소를 확인해주세요.`,
      );
      return;
    }

    setContractPrintLoading(true);
    setContractPrintError('');

    try {
      const batchId =
        window.crypto
          ?.randomUUID?.() ||
        `labor-${Date.now()}`;
      const printResult =
        await createLaborContractPrintWindow({
          workers:
            selectedRows.map(
              (row) => {
                const values =
                  sensitivePrintInputs[
                    String(
                      row.requirement_id,
                    )
                  ];

                return {
                  name: row.name,
                  residentNumber:
                    normalizeResidentNumber(
                      values.residentNumber,
                    ),
                  address:
                    String(
                      values.address,
                    ).trim(),
                  contractStartDate:
                    getFixedContractStartDate(
                      row,
                      selectedMonth,
                    ),
                  contractEndDate:
                    getMonthEndDate(
                      selectedMonth,
                    ),
                };
              },
            ),
          projectName,
          selectedMonth,
          batchId,
        });

      setPendingPrintBatch({
        batchId,
        fileName:
          printResult.fileName,
        rows:
          selectedRows.map(
            (row) => ({
              requirementId:
                row.requirement_id,
              name: row.name,
            }),
          ),
      });

      setContractPrintOpen(false);
      clearContractPrintInputs();
      setSuccessMessage(
        `${selectedRows.length.toLocaleString()}명의 계약서 인쇄창을 열었습니다. PDF로 저장한 뒤 완료 기록 여부를 확인해주세요.`,
      );
    } catch (error) {
      console.error(
        '근로계약서 PDF 출력 오류:',
        error,
      );
      setContractPrintError(
        error?.message ||
          '근로계약서 인쇄창을 만들지 못했습니다.',
      );
    }

    setContractPrintLoading(false);
  };

  const handleConfirmPrintRecord = async () => {
    if (!pendingPrintBatch) {
      return;
    }

    setPrintRecordSaving(true);
    setErrorMessage('');

    const results = await Promise.all(
      pendingPrintBatch.rows.map(
        async (row) => {
          const {
            error,
          } = await supabase.rpc(
            'labor_update_contract_status',
            {
              p_project_name:
                projectName,
              p_requirement_id:
                row.requirementId,
              p_next_status:
                'pdf_generated',
              p_reason: '',
              p_scan_file_name:
                pendingPrintBatch.fileName,
              p_scan_file_hash: '',
            },
          );

          return {
            ...row,
            error,
          };
        },
      ),
    );
    const failedRows = results.filter(
      (row) => row.error,
    );
    const successCount =
      results.length -
      failedRows.length;

    if (failedRows.length > 0) {
      setErrorMessage(
        `${successCount.toLocaleString()}명은 PDF 생성으로 기록했고, ${failedRows.map((row) => row.name).join(', ')} 기록은 실패했습니다. 다시 시도해주세요.`,
      );
      setPendingPrintBatch(
        (previous) => ({
          ...previous,
          rows:
            failedRows.map(
              (row) => ({
                requirementId:
                  row.requirementId,
                name: row.name,
              }),
            ),
        }),
      );
    } else {
      setSuccessMessage(
        `${successCount.toLocaleString()}명을 PDF 생성 상태로 기록했습니다.`,
      );
      setPendingPrintBatch(null);
    }

    await loadStoredRows();
    setPrintRecordSaving(false);
  };

  const handleSync =
    async () => {
      if (!accessInfo) {
        setErrorMessage(
          '노임관리 접근권한을 먼저 등록해주세요.',
        );
        return;
      }

      if (
        analyzedWorkers.length ===
        0
      ) {
        setErrorMessage(
          '선택한 월에 반영할 출력일보 근로자가 없습니다.',
        );
        return;
      }

      setSyncing(true);
      setErrorMessage('');
      setSuccessMessage('');

      const payload =
        analyzedWorkers.map(
          (worker) => ({
            name:
              worker.displayName,
            normalized_name:
              worker.normalizedName,
            job:
              worker.job || '',
            process:
              worker.process || '',
            first_work_date:
              worker.firstWorkDate,
            latest_work_date:
              worker.latestWorkDate,
            current_month_first_work_date:
              worker.currentMonthFirstDate,
            requirement_type:
              worker.requirementType,
          }),
        );

      const {
        data,
        error,
      } = await supabase.rpc(
        'labor_sync_contract_month',
        {
          p_project_name:
            projectName,
          p_contract_month:
            selectedMonth,
          p_workers: payload,
        },
      );

      if (error) {
        console.error(
          '근로계약 작성대상 반영 오류:',
          error,
        );

        setErrorMessage(
          error.message ||
            '작성 대상자를 반영하지 못했습니다.',
        );
      } else {
        const result =
          data || {};

        setSuccessMessage(
          [
            `${formatMonthLabel(
              selectedMonth,
            )} 작성대상 반영 완료`,
            `신규 근로자 ${
              result.inserted_workers ||
              0
            }명`,
            `신규 월별대상 ${
              result.inserted_requirements ||
              0
            }명`,
            `기존 대상 ${
              result.existing_requirements ||
              0
            }명`,
          ].join(' · '),
        );

        await loadStoredRows();
      }

      setSyncing(false);
    };

  const handleSaveWorker =
    async () => {
      if (!workerEditForm) {
        return;
      }

      setActionSaving(true);
      setErrorMessage('');

      const {
        error,
      } = await supabase.rpc(
        'labor_update_worker_profile',
        {
          p_project_name:
            projectName,
          p_worker_id:
            workerEditForm.worker_id,
          p_phone:
            workerEditForm.phone,
          p_job:
            workerEditForm.job,
          p_process:
            workerEditForm.process,
        },
      );

      if (error) {
        setErrorMessage(
          error.message ||
            '근로자 정보를 수정하지 못했습니다.',
        );
      } else {
        setSuccessMessage(
          `${workerEditForm.name} 근로자 정보를 수정했습니다.`,
        );

        setWorkerEditOpen(false);
        setWorkerEditForm(null);

        await loadStoredRows();
      }

      setActionSaving(false);
    };

  const openStatusAction = (
    row,
    nextStatus,
    title,
  ) => {
    setActionDialog({
      row,
      nextStatus,
      title,
    });

    setActionReason('');
    setActionFileName('');
  };

  const handleStatusAction =
    async () => {
      if (!actionDialog) {
        return;
      }

      setActionSaving(true);
      setErrorMessage('');

      const {
        error,
      } = await supabase.rpc(
        'labor_update_contract_status',
        {
          p_project_name:
            projectName,
          p_requirement_id:
            actionDialog.row
              .requirement_id,
          p_next_status:
            actionDialog.nextStatus,
          p_reason:
            actionReason,
          p_scan_file_name:
            actionFileName,
          p_scan_file_hash: '',
        },
      );

      if (error) {
        setErrorMessage(
          error.message ||
            '계약서 상태를 변경하지 못했습니다.',
        );
      } else {
        setSuccessMessage(
          `${actionDialog.row.name} · ${
            getStatusMeta(
              actionDialog.nextStatus,
            ).label
          } 처리했습니다.`,
        );

        setActionDialog(null);
        setActionReason('');
        setActionFileName('');

        await loadStoredRows();
      }

      setActionSaving(false);
    };

  const handleOpenEvents =
    async (row) => {
      setEventTarget(row);
      setEventRows([]);
      setEventDialogOpen(true);
      setEventLoading(true);

      const {
        data,
        error,
      } = await supabase.rpc(
        'labor_get_contract_events',
        {
          p_project_name:
            projectName,
          p_requirement_id:
            row.requirement_id,
        },
      );

      if (error) {
        setErrorMessage(
          error.message ||
            '처리 이력을 불러오지 못했습니다.',
        );
      } else {
        setEventRows(
          data || [],
        );
      }

      setEventLoading(false);
    };

  const filteredRows =
    useMemo(() => {
      const keyword =
        String(
          searchText || '',
        )
          .trim()
          .toLowerCase();

      return sortRowsByContractStart(
        storedRows.filter(
          (row) => {
            if (
              workerTypeFilter !==
                'all' &&
              row.requirement_type !==
                workerTypeFilter
            ) {
              return false;
            }

            if (
              statusFilter !==
                'all' &&
              row.status !==
                statusFilter
            ) {
              return false;
            }

            if (!keyword) {
              return true;
            }

            return [
              row.worker_code,
              row.name,
              row.phone,
              row.job,
              row.process,
            ]
              .join(' ')
              .toLowerCase()
              .includes(keyword);
          },
        ),
        selectedMonth,
      );
    }, [
      searchText,
      selectedMonth,
      statusFilter,
      storedRows,
      workerTypeFilter,
    ]);

  const contractPrintRows =
    useMemo(
      () =>
        sortRowsByContractStart(
          storedRows.filter(
            (row) =>
              row.contract_form &&
              row.status !==
                'excluded' &&
              (
                includeCompletedPrintRows ||
                row.status !==
                  'manager_confirmed'
              ),
          ),
          selectedMonth,
        ),
      [
        includeCompletedPrintRows,
        selectedMonth,
        storedRows,
      ],
    );

  const allPrintRowsSelected =
    contractPrintRows.length > 0 &&
    contractPrintRows.every(
      (row) =>
        selectedPrintIds.includes(
          String(row.requirement_id),
        ),
    );

  const summary =
    useMemo(
      () =>
        storedRows.reduce(
          (
            result,
            row,
          ) => {
            result.total += 1;

            if (
              row.requirement_type ===
              'new'
            ) {
              result.newCount += 1;
            } else {
              result.continuous += 1;
            }

            if (
              row.status ===
                'required' ||
              row.status ===
                'rejected'
            ) {
              result.warning += 1;
            }

            if (row.status === 'form_ready') {
              result.formReady += 1;
            }

            if (
              row.status ===
              'manager_confirmed'
            ) {
              result.completed += 1;
            }

            return result;
          },
          {
            total: 0,
            newCount: 0,
            continuous: 0,
            warning: 0,
            formReady: 0,
            completed: 0,
          },
        ),
      [storedRows],
    );

  const summaryCards = [
    {
      title: '저장된 작성 대상',
      value:
        `${summary.total.toLocaleString()}명`,
      icon:
        <GroupsRoundedIcon />,
      color: '#1d4ed8',
      background: '#eff6ff',
    },
    {
      title: '신규 근로자',
      value:
        `${summary.newCount.toLocaleString()}명`,
      icon:
        <PersonAddAlt1RoundedIcon />,
      color: '#047857',
      background: '#ecfdf5',
    },
    {
      title: '연속 근무자',
      value:
        `${summary.continuous.toLocaleString()}명`,
      icon:
        <AssignmentLateRoundedIcon />,
      color: '#7c3aed',
      background: '#f5f3ff',
    },
    {
      title: '미작성·반려 경고',
      value:
        `${summary.warning.toLocaleString()}명`,
      icon:
        <WarningAmberRoundedIcon />,
      color: '#dc2626',
      background: '#fef2f2',
    },
  ];

  const loading =
    loadingReports ||
    loadingStoredRows;

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
      <input
        ref={contractFileInputRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={handleContractFileSelected}
      />

      <Paper
        variant="outlined"
        sx={{
          p: 1.4,
          borderColor: '#cbd5e1',
        }}
      >
        <Stack
          direction={{
            xs: 'column',
            md: 'row',
          }}
          justifyContent="space-between"
          alignItems={{
            xs: 'stretch',
            md: 'center',
          }}
          spacing={1}
        >
          <Box>
            <Stack
              direction="row"
              spacing={0.7}
              alignItems="center"
              flexWrap="wrap"
            >
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 900,
                  color: '#0f172a',
                }}
              >
                근로계약서작성
              </Typography>

              {accessInfo && (
                <Chip
                  size="small"
                  color={
                    canManage
                      ? 'secondary'
                      : 'default'
                  }
                  label={
                    ACCESS_ROLE_LABELS[
                      accessInfo
                        .access_role
                    ] ||
                    accessInfo
                      .access_role
                  }
                />
              )}
            </Stack>

            <Typography
              sx={{
                mt: 0.15,
                color: '#64748b',
                fontSize: '0.78rem',
              }}
            >
              양식에서 연락처·주민등록번호·주소만 입력하면 나머지 계약조건은 자동으로 적용됩니다.
            </Typography>
          </Box>

          <Stack
            direction="row"
            spacing={0.7}
            alignItems="center"
            flexWrap="wrap"
          >
            <TextField
              type="month"
              size="small"
              label="계약 대상 월"
              value={selectedMonth}
              onChange={(event) =>
                setSelectedMonth(
                  event.target.value,
                )
              }
              InputLabelProps={{
                shrink: true,
              }}
              sx={{
                width: 155,
              }}
            />

            <Button
              variant="contained"
              startIcon={
                syncing
                  ? (
                    <CircularProgress
                      size={16}
                      color="inherit"
                    />
                  )
                  : (
                    <SyncRoundedIcon />
                  )
              }
              onClick={
                handleSync
              }
              disabled={
                syncing ||
                !accessInfo ||
                analyzedWorkers.length ===
                  0
              }
            >
              작성 대상 반영
            </Button>

            <Button
              variant="outlined"
              startIcon={<DownloadOutlinedIcon />}
              onClick={handleDownloadTemplate}
              disabled={!accessInfo || storedRows.length === 0}
            >
              양식 다운로드
            </Button>

            <Button
              variant="outlined"
              color="secondary"
              startIcon={<UploadFileOutlinedIcon />}
              onClick={() => contractFileInputRef.current?.click()}
              disabled={!accessInfo || storedRows.length === 0}
            >
              작성자료 업로드
            </Button>

            <Button
              variant="contained"
              color="error"
              startIcon={
                <PictureAsPdfOutlinedIcon />
              }
              onClick={() =>
                openContractPrintDialog()
              }
              disabled={
                !accessInfo ||
                !storedRows.some(
                  (row) =>
                    row.contract_form &&
                    [
                      'form_ready',
                      'rejected',
                    ].includes(
                      row.status,
                    ),
                )
              }
            >
              계약서 PDF 생성
            </Button>

            <Button
              variant="outlined"
              startIcon={
                <RefreshIcon />
              }
              onClick={() =>
                setRefreshKey(
                  (previous) =>
                    previous + 1,
                )
              }
              disabled={loading}
            >
              새로고침
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {!accessChecked && (
        <Alert
          severity="info"
          icon={
            <CircularProgress
              size={18}
            />
          }
        >
          노임관리 현장 접근권한을 확인하고 있습니다.
        </Alert>
      )}

      {accessChecked &&
        !accessInfo && (
        <Alert severity="error">
          <Typography
            sx={{
              fontWeight: 900,
            }}
          >
            현재 계정에는 이 현장의 노임관리 접근권한이 없습니다.
          </Typography>

          <Typography
            sx={{
              mt: 0.4,
              fontSize: '0.76rem',
            }}
          >
            SQL 적용 후 labor_project_access에 현재 로그인 이메일과 현장명을 등록해야 합니다. 권한은 현장 담당자(site_manager), 노임 관리자(labor_manager), 최고관리자(admin)로 구분됩니다.
          </Typography>
        </Alert>
      )}

      {successMessage && (
        <Alert
          severity="success"
          onClose={() =>
            setSuccessMessage('')
          }
        >
          {successMessage}
        </Alert>
      )}

      {errorMessage && (
        <Alert
          severity="error"
          onClose={() =>
            setErrorMessage('')
          }
        >
          {errorMessage}
        </Alert>
      )}

      {accessInfo &&
        analyzedWorkers.length >
          storedRows.length && (
          <Alert
            severity="warning"
            icon={
              <WarningAmberRoundedIcon />
            }
          >
            출력일보 분석 인원은 {analyzedWorkers.length.toLocaleString()}명이고, DB에 저장된 작성 대상은 {storedRows.length.toLocaleString()}명입니다. 상단의 ‘작성 대상 반영’을 눌러 신규 인원을 저장해주세요.
          </Alert>
        )}

      {accessInfo &&
        summary.warning > 0 && (
          <Alert
            severity="warning"
            sx={{
              py: 0.35,
              fontWeight: 800,
            }}
          >
            {formatMonthLabel(
              selectedMonth,
            )} 양식 미입력 또는 반려 대상자가 {summary.warning.toLocaleString()}명 있습니다.
          </Alert>
        )}

      {accessInfo && summary.formReady > 0 && (
        <Alert severity="info" sx={{ py: 0.35, fontWeight: 800 }}>
          작성자료 입력이 끝나 PDF 출력이 가능한 인원이 {summary.formReady.toLocaleString()}명 있습니다.
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs:
              'repeat(2, minmax(0, 1fr))',
            lg:
              'repeat(4, minmax(0, 1fr))',
          },
          gap: 0.8,
        }}
      >
        {summaryCards.map(
          (card) => (
            <Paper
              key={card.title}
              variant="outlined"
              sx={{
                p: 1.1,
                display: 'flex',
                alignItems: 'center',
                gap: 0.9,
                borderColor: '#dbe4ee',
                bgcolor: card.background,
              }}
            >
              <Box
                sx={{
                  width: 35,
                  height: 35,
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: card.color,
                  bgcolor: '#ffffff',
                  '& svg': {
                    fontSize: 21,
                  },
                }}
              >
                {card.icon}
              </Box>

              <Box>
                <Typography
                  sx={{
                    color: '#64748b',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                  }}
                >
                  {card.title}
                </Typography>

                <Typography
                  sx={{
                    color: card.color,
                    fontSize: '1rem',
                    lineHeight: 1.2,
                    fontWeight: 900,
                  }}
                >
                  {card.value}
                </Typography>
              </Box>
            </Paper>
          ),
        )}
      </Box>

      <Paper
        variant="outlined"
        sx={{
          p: 0.9,
          borderColor: '#cbd5e1',
        }}
      >
        <Stack
          direction={{
            xs: 'column',
            lg: 'row',
          }}
          spacing={0.8}
          alignItems={{
            xs: 'stretch',
            lg: 'center',
          }}
        >
          <TextField
            size="small"
            label="성명·연락처·직종·공정 검색"
            value={searchText}
            onChange={(event) =>
              setSearchText(
                event.target.value,
              )
            }
            sx={{
              width: {
                xs: '100%',
                lg: 280,
              },
            }}
          />

          <FormControl
            size="small"
            sx={{
              minWidth: 155,
            }}
          >
            <InputLabel>
              작성 대상 구분
            </InputLabel>

            <Select
              label="작성 대상 구분"
              value={workerTypeFilter}
              onChange={(event) =>
                setWorkerTypeFilter(
                  event.target.value,
                )
              }
            >
              <MenuItem value="all">
                전체
              </MenuItem>

              <MenuItem value="new">
                신규 근로자
              </MenuItem>

              <MenuItem value="continuous">
                연속 근무자
              </MenuItem>
            </Select>
          </FormControl>

          <FormControl
            size="small"
            sx={{
              minWidth: 145,
            }}
          >
            <InputLabel>
              작성 상태
            </InputLabel>

            <Select
              label="작성 상태"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value,
                )
              }
            >
              <MenuItem value="all">
                전체
              </MenuItem>

              {Object.entries(
                STATUS_META,
              ).map(
                ([
                  value,
                  meta,
                ]) => (
                  <MenuItem
                    key={value}
                    value={value}
                  >
                    {meta.label}
                  </MenuItem>
                ),
              )}
            </Select>
          </FormControl>

          <Typography
            sx={{
              ml: {
                lg: 'auto',
              },
              color: '#64748b',
              fontSize: '0.72rem',
              fontWeight: 800,
            }}
          >
            출력일보 분석 {analyzedWorkers.length.toLocaleString()}명 · 저장된 대상 {storedRows.length.toLocaleString()}명 · 조회 결과 {filteredRows.length.toLocaleString()}명
          </Typography>
        </Stack>
      </Paper>

      <Paper
        variant="outlined"
        sx={{
          minHeight: 0,
          flex: 1,
          overflow: 'hidden',
          borderColor: '#cbd5e1',
        }}
      >
        {loading ? (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
            }}
          >
            <CircularProgress size={22} />

            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.8rem',
              }}
            >
              출력일보와 저장된 계약상태를 불러오고 있습니다.
            </Typography>
          </Box>
        ) : (
          <TableContainer
            sx={{
              height: '100%',
            }}
          >
            <Table
              stickyHeader
              size="small"
              sx={{
                '& th, & td': {
                  borderRight:
                    '1px solid #e2e8f0',
                  fontSize: '0.68rem',
                  whiteSpace: 'nowrap',
                },
                '& th': {
                  bgcolor: '#f8fafc',
                  fontWeight: 900,
                },
              }}
            >
              <TableHead>
                <TableRow>
                  {[
                    '작성여부',
                    '근로자번호',
                    '성명',
                    '연락처',
                    '직종',
                    '공정',
                    '계약시작일',
                    '계약대상월',
                    '작성사유',
                    '양식입력일',
                    'PDF 생성일',
                    '서명본 확인일',
                    '관리자 확인일',
                    '처리',
                  ].map(
                    (header) => (
                      <TableCell
                        key={header}
                      >
                        {header}
                      </TableCell>
                    ),
                  )}
                </TableRow>
              </TableHead>

              <TableBody>
                {filteredRows.map(
                  (row) => {
                    const statusMeta =
                      getStatusMeta(
                        row.status,
                      );

                    return (
                      <TableRow
                        key={
                          row.requirement_id
                        }
                        hover
                        sx={{
                          bgcolor:
                            row.status ===
                            'rejected'
                              ? '#fff1f2'
                              : row.status ===
                                'required'
                                ? '#fff7ed'
                                : row.status ===
                                  'form_ready'
                                  ? '#eff6ff'
                                  : row.status ===
                                  'manager_confirmed'
                                  ? '#f0fdf4'
                                  : 'inherit',
                        }}
                      >
                        <TableCell>
                          <Chip
                            size="small"
                            color={
                              statusMeta.color
                            }
                            variant={
                              row.status ===
                              'required'
                                ? 'outlined'
                                : 'filled'
                            }
                            label={
                              statusMeta.label
                            }
                            sx={{
                              fontWeight: 900,
                            }}
                          />
                        </TableCell>

                        <TableCell
                          sx={{
                            fontFamily:
                              'monospace',
                            fontWeight: 800,
                          }}
                        >
                          {row.worker_code}
                        </TableCell>

                        <TableCell
                          sx={{
                            fontWeight: 900,
                          }}
                        >
                          {row.name}
                        </TableCell>

                        <TableCell>
                          {maskPhone(
                            row.phone,
                          )}
                        </TableCell>

                        <TableCell>
                          {row.job || '-'}
                        </TableCell>

                        <TableCell>
                          {row.process ||
                            '-'}
                        </TableCell>

                        <TableCell>
                          {formatShortDate(
                            getFixedContractStartDate(
                              row,
                              selectedMonth,
                            ),
                          )}
                        </TableCell>

                        <TableCell>
                          {formatMonthLabel(
                            String(
                              row.contract_month,
                            ).slice(0, 7),
                          )}
                        </TableCell>

                        <TableCell>
                          <Chip
                            size="small"
                            color={
                              row.requirement_type ===
                              'continuous'
                                ? 'secondary'
                                : 'warning'
                            }
                            label={
                              row.requirement_type ===
                              'continuous'
                                ? '연속근무자'
                                : '신규근로자'
                            }
                          />
                        </TableCell>

                        <TableCell>
                          {formatDateTime(
                            row.contract_form?.imported_at,
                          )}
                        </TableCell>

                        <TableCell>
                          {formatDateTime(
                            row.pdf_generated_at,
                          )}
                        </TableCell>

                        <TableCell>
                          {formatDateTime(
                            row.scan_verified_at,
                          )}
                        </TableCell>

                        <TableCell>
                          {formatDateTime(
                            row.manager_confirmed_at,
                          )}
                        </TableCell>

                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={0.25}
                            alignItems="center"
                          >
                            <Tooltip title="근로자 정보 수정">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setWorkerEditForm({
                                    ...row,
                                  });

                                  setWorkerEditOpen(
                                    true,
                                  );
                                }}
                              >
                                <EditOutlinedIcon fontSize="inherit" />
                              </IconButton>
                            </Tooltip>

                            {(row.status ===
                              'form_ready' ||
                              row.status ===
                                'rejected' ||
                              row.status ===
                                'pdf_generated') && (
                              <Tooltip title="계약서 PDF 생성·재출력">
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() =>
                                    openContractPrintDialog(
                                      row,
                                    )
                                  }
                                >
                                  <PictureAsPdfOutlinedIcon fontSize="inherit" />
                                </IconButton>
                              </Tooltip>
                            )}

                            {(row.status ===
                              'pdf_generated' ||
                              row.status ===
                                'rejected' ||
                              row.status ===
                                'scan_verified') && (
                              <Tooltip title="서명본 업로드 확인">
                                <IconButton
                                  size="small"
                                  color="secondary"
                                  onClick={() =>
                                    openStatusAction(
                                      row,
                                      'scan_verified',
                                      '서명본 업로드 확인',
                                    )
                                  }
                                >
                                  <UploadFileOutlinedIcon fontSize="inherit" />
                                </IconButton>
                              </Tooltip>
                            )}

                            {canManage &&
                              row.status ===
                                'scan_verified' && (
                                <>
                                  <Tooltip title="관리자 확인">
                                    <IconButton
                                      size="small"
                                      color="success"
                                      onClick={() =>
                                        openStatusAction(
                                          row,
                                          'manager_confirmed',
                                          '관리자 확인',
                                        )
                                      }
                                    >
                                      <TaskAltRoundedIcon fontSize="inherit" />
                                    </IconButton>
                                  </Tooltip>

                                  <Tooltip title="반려">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() =>
                                        openStatusAction(
                                          row,
                                          'rejected',
                                          '계약서 반려',
                                        )
                                      }
                                    >
                                      <ReplayRoundedIcon fontSize="inherit" />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              )}

                            {![
                              'manager_confirmed',
                              'excluded',
                            ].includes(
                              row.status,
                            ) && (
                              <Tooltip title="이번 달 대상 제외">
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    openStatusAction(
                                      row,
                                      'excluded',
                                      '작성 대상 제외',
                                    )
                                  }
                                >
                                  <BlockOutlinedIcon fontSize="inherit" />
                                </IconButton>
                              </Tooltip>
                            )}

                            <Tooltip title="처리 이력">
                              <IconButton
                                size="small"
                                onClick={() =>
                                  handleOpenEvents(
                                    row,
                                  )
                                }
                              >
                                <HistoryRoundedIcon fontSize="inherit" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  },
                )}

                {filteredRows.length ===
                  0 && (
                  <TableRow>
                    <TableCell
                      colSpan={14}
                      align="center"
                      sx={{
                        py: 6,
                        color: '#94a3b8',
                      }}
                    >
                      {accessInfo
                        ? '저장된 작성 대상이 없습니다. 출력일보 분석 후 ‘작성 대상 반영’을 눌러주세요.'
                        : '노임관리 접근권한을 등록해주세요.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Typography
        sx={{
          color: '#94a3b8',
          fontSize: '0.62rem',
          textAlign: 'right',
        }}
      >
        접속자: {userProfile?.manager_name || '-'} · 현장: {projectName || '-'}
      </Typography>

      <Dialog
        open={contractPrintOpen}
        onClose={closeContractPrintDialog}
        fullWidth
        maxWidth="xl"
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
          }}
        >
          실제 근로계약서 PDF 생성
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={1.2}>
            <Alert severity="warning">
              엑셀 업로드 직후에는 주민등록번호와 주소가 자동으로 채워집니다. 이 정보는 브라우저 임시 메모리에서만 사용되며, 계약서 인쇄창을 만들거나 창을 닫으면 즉시 초기화됩니다.
            </Alert>

            <Stack
              direction={{
                xs: 'column',
                md: 'row',
              }}
              spacing={1}
              alignItems={{
                xs: 'flex-start',
                md: 'center',
              }}
              justifyContent="space-between"
            >
              <Typography
                sx={{
                  color: '#475569',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                }}
              >
                엑셀 업로드 직후에는 이번에 반영한 대상만 선택됩니다. 일반 실행 시에는 양식입력완료·반려 대상이 선택되며, 기존 대상도 필요할 때 재출력할 수 있습니다.
              </Typography>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={
                      includeCompletedPrintRows
                    }
                    onChange={(event) =>
                      handleIncludeCompletedPrintRows(
                        event.target.checked,
                      )
                    }
                  />
                }
                label="작성완료자 포함"
              />
            </Stack>

            {contractPrintError && (
              <Alert severity="error">
                {contractPrintError}
              </Alert>
            )}

            <TableContainer
              sx={{
                maxHeight: 560,
                border:
                  '1px solid #cbd5e1',
              }}
            >
              <Table
                stickyHeader
                size="small"
                sx={{
                  '& th, & td': {
                    borderRight:
                      '1px solid #e2e8f0',
                    fontSize: '0.7rem',
                    whiteSpace: 'nowrap',
                  },
                  '& th': {
                    bgcolor: '#f8fafc',
                    fontWeight: 900,
                  },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={
                          allPrintRowsSelected
                        }
                        indeterminate={
                          selectedPrintIds.length > 0 &&
                          !allPrintRowsSelected
                        }
                        onChange={(event) =>
                          handleSelectAllPrintRows(
                            event.target.checked,
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>상태</TableCell>
                    <TableCell>성명</TableCell>
                    <TableCell>계약기간</TableCell>
                    <TableCell>
                      주민등록번호
                    </TableCell>
                    <TableCell>주소</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {contractPrintRows.map(
                    (row) => {
                      const rowId =
                        String(
                          row.requirement_id,
                        );
                      const checked =
                        selectedPrintIds.includes(
                          rowId,
                        );
                      const inputs =
                        sensitivePrintInputs[
                          rowId
                        ] || {
                          residentNumber: '',
                          address: '',
                        };

                      return (
                        <TableRow
                          key={rowId}
                          hover
                          sx={{
                            bgcolor: checked
                              ? '#eff6ff'
                              : '#ffffff',
                            opacity: checked
                              ? 1
                              : 0.62,
                          }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={checked}
                              onChange={() =>
                                handlePrintRowToggle(
                                  row,
                                )
                              }
                            />
                          </TableCell>

                          <TableCell>
                            <Chip
                              size="small"
                              color={
                                getStatusMeta(
                                  row.status,
                                ).color
                              }
                              label={
                                getStatusMeta(
                                  row.status,
                                ).label
                              }
                            />
                          </TableCell>

                          <TableCell
                            sx={{
                              fontWeight: 900,
                            }}
                          >
                            {row.name}
                          </TableCell>

                          <TableCell>
                            {formatShortDate(
                              getFixedContractStartDate(
                                row,
                                selectedMonth,
                              ),
                            )}{' '}
                            ~{' '}
                            {formatShortDate(
                              getMonthEndDate(
                                selectedMonth,
                              ),
                            )}
                          </TableCell>

                          <TableCell>
                            <TextField
                              size="small"
                              value={
                                inputs.residentNumber
                              }
                              onChange={(event) =>
                                handleSensitivePrintInput(
                                  rowId,
                                  'residentNumber',
                                  event.target.value,
                                )
                              }
                              placeholder="000000-0000000"
                              disabled={!checked}
                              error={
                                checked &&
                                Boolean(
                                  inputs.residentNumber,
                                ) &&
                                !isValidResidentNumber(
                                  inputs.residentNumber,
                                )
                              }
                              inputProps={{
                                autoComplete: 'off',
                                inputMode: 'numeric',
                              }}
                              sx={{
                                minWidth: 180,
                              }}
                            />
                          </TableCell>

                          <TableCell>
                            <TextField
                              size="small"
                              value={
                                inputs.address
                              }
                              onChange={(event) =>
                                handleSensitivePrintInput(
                                  rowId,
                                  'address',
                                  event.target.value,
                                )
                              }
                              placeholder="상세주소까지 입력"
                              disabled={!checked}
                              inputProps={{
                                autoComplete: 'off',
                              }}
                              sx={{
                                minWidth: 360,
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    },
                  )}

                  {contractPrintRows.length ===
                    0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        align="center"
                        sx={{
                          py: 5,
                          color: '#94a3b8',
                        }}
                      >
                        PDF로 출력할 작성자료가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Alert severity="info">
              실제 양식의 C6·G6·C7·C10:D10·E10:F10·C13:E13·G30:H30·H34·G39:H39에 값을 넣습니다. 일급 등 나머지 내용은 원본 고정값을 유지합니다.
            </Alert>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={
              closeContractPrintDialog
            }
            disabled={
              contractPrintLoading
            }
          >
            취소
          </Button>

          <Button
            variant="contained"
            color="error"
            startIcon={
              contractPrintLoading
                ? (
                  <CircularProgress
                    size={16}
                    color="inherit"
                  />
                )
                : (
                  <PictureAsPdfOutlinedIcon />
                )
            }
            onClick={
              handleCreateContractPdf
            }
            disabled={
              contractPrintLoading ||
              selectedPrintIds.length === 0
            }
          >
            선택 {selectedPrintIds.length.toLocaleString()}명 인쇄창 열기
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(pendingPrintBatch)}
        onClose={() => {
          if (!printRecordSaving) {
            setPendingPrintBatch(null);
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
          }}
        >
          PDF 저장 완료 확인
        </DialogTitle>

        <DialogContent dividers>
          {pendingPrintBatch && (
            <Stack spacing={1.2}>
              <Alert severity="warning">
                인쇄창에서 ‘PDF로 저장’을 완료한 경우에만 아래 완료 버튼을 눌러주세요.
              </Alert>

              <Typography>
                대상 {pendingPrintBatch.rows.length.toLocaleString()}명: {pendingPrintBatch.rows.map((row) => row.name).join(', ')}
              </Typography>

              <Typography
                sx={{
                  color: '#64748b',
                  fontSize: '0.76rem',
                }}
              >
                기록 파일명: {pendingPrintBatch.fileName}
              </Typography>

              <Alert severity="info">
                PDF 파일 원본과 주민등록번호·주소는 서버에 저장하지 않습니다. 완료 처리 시 대상자의 상태와 생성 시각만 기록됩니다.
              </Alert>
            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setPendingPrintBatch(null)
            }
            disabled={printRecordSaving}
          >
            기록하지 않음
          </Button>

          <Button
            variant="contained"
            startIcon={
              printRecordSaving
                ? (
                  <CircularProgress
                    size={16}
                    color="inherit"
                  />
                )
                : (
                  <TaskAltRoundedIcon />
                )
            }
            onClick={
              handleConfirmPrintRecord
            }
            disabled={printRecordSaving}
          >
            PDF 저장 완료 처리
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={importDialogOpen}
        onClose={closeContractImportDialog}
        fullWidth
        maxWidth="xl"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          근로계약서 작성자료 업로드 검토
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            <Alert severity={importRows.some((row) => row.issues.length > 0) ? 'error' : 'success'}>
              파일: {importFileName || '-'} · 전체 {importRows.length.toLocaleString()}명 · 정상 {importRows.filter((row) => row.issues.length === 0).length.toLocaleString()}명 · 오류 {importRows.filter((row) => row.issues.length > 0).length.toLocaleString()}명
            </Alert>
            <Alert severity="info">
              연락처는 근로자 정보에 반영하고, 주민등록번호·주소는 PDF 생성 화면에만 임시 전달합니다. 직종·공정·계약기간·일급·근무조건은 회사 고정값으로 처리합니다.
            </Alert>
            <TableContainer sx={{ maxHeight: 520, border: '1px solid #e2e8f0' }}>
              <Table stickyHeader size="small" sx={{ '& th, & td': { borderRight: '1px solid #e2e8f0', fontSize: '0.68rem', whiteSpace: 'nowrap' }, '& th': { bgcolor: '#f8fafc', fontWeight: 900 } }}>
                <TableHead>
                  <TableRow>
                    {['엑셀행','검토결과','근로자번호','성명','연락처','주민등록번호','주소','직종','공정','계약시작','계약종료','일급','근무시간','휴게','업무내용','확인내용'].map((header) => <TableCell key={header}>{header}</TableCell>)}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {importRows.map((row) => (
                    <TableRow key={`${row.excelRow}-${row.workerCode}`} sx={{ bgcolor: row.issues.length > 0 ? '#fff1f2' : '#f0fdf4' }}>
                      <TableCell>{row.excelRow}</TableCell>
                      <TableCell><Chip size="small" color={row.issues.length > 0 ? 'error' : 'success'} label={row.issues.length > 0 ? '오류' : '정상'} /></TableCell>
                      <TableCell>{row.workerCode || '-'}</TableCell>
                      <TableCell sx={{ fontWeight: 900 }}>{row.name || '-'}</TableCell>
                      <TableCell>{row.phone || '-'}</TableCell>
                      <TableCell>{maskResidentNumber(row.residentNumber)}</TableCell>
                      <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.address || '-'}</TableCell>
                      <TableCell>{row.job || '-'}</TableCell>
                      <TableCell>{row.process || '-'}</TableCell>
                      <TableCell>{row.contractStartDate || '-'}</TableCell>
                      <TableCell>{row.contractEndDate || '-'}</TableCell>
                      <TableCell align="right">{row.dailyWage === null ? '-' : Number(row.dailyWage).toLocaleString()}</TableCell>
                      <TableCell>{row.workStartTime || '-'} ~ {row.workEndTime || '-'}</TableCell>
                      <TableCell align="right">{row.breakMinutes === null ? '-' : `${row.breakMinutes}분`}</TableCell>
                      <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.workDescription || '-'}</TableCell>
                      <TableCell sx={{ minWidth: 260, whiteSpace: 'normal !important', color: row.issues.length > 0 ? '#b91c1c' : '#047857', fontWeight: 800 }}>
                        {row.issues.length > 0 ? row.issues.join(' · ') : '정상 반영 가능'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {importRows.some((row) => row.issues.length > 0) && <Alert severity="warning">오류가 있는 행은 엑셀에서 수정한 뒤 다시 업로드해야 합니다.</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeContractImportDialog} disabled={importSaving}>취소</Button>
          <Button variant="contained" startIcon={<FactCheckOutlinedIcon />} onClick={handleSaveContractImport} disabled={importSaving || importRows.length === 0 || importRows.some((row) => row.issues.length > 0)}>
            정상 자료 반영 후 PDF 준비
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={workerEditOpen}
        onClose={() => {
          if (!actionSaving) {
            setWorkerEditOpen(false);
            setWorkerEditForm(null);
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
          }}
        >
          근로자 기본정보 수정
        </DialogTitle>

        <DialogContent dividers>
          {workerEditForm && (
            <Stack spacing={1.2}>
              <Alert severity="info">
                주민등록번호·상세주소·계약서 원문은 이 화면에 저장하지 않습니다.
              </Alert>

              <TextField
                label="근로자번호"
                value={
                  workerEditForm.worker_code ||
                  ''
                }
                disabled
              />

              <TextField
                label="성명"
                value={
                  workerEditForm.name ||
                  ''
                }
                disabled
              />

              <TextField
                label="연락처"
                value={
                  workerEditForm.phone ||
                  ''
                }
                onChange={(event) =>
                  setWorkerEditForm(
                    (previous) => ({
                      ...previous,
                      phone:
                        event.target.value,
                    }),
                  )
                }
                placeholder="010-0000-0000"
              />

              <TextField
                label="직종"
                value={
                  workerEditForm.job ||
                  ''
                }
                onChange={(event) =>
                  setWorkerEditForm(
                    (previous) => ({
                      ...previous,
                      job:
                        event.target.value,
                    }),
                  )
                }
              />

              <TextField
                label="공정"
                value={
                  workerEditForm.process ||
                  ''
                }
                onChange={(event) =>
                  setWorkerEditForm(
                    (previous) => ({
                      ...previous,
                      process:
                        event.target.value,
                    }),
                  )
                }
              />
            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() => {
              setWorkerEditOpen(false);
              setWorkerEditForm(null);
            }}
            disabled={actionSaving}
          >
            취소
          </Button>

          <Button
            variant="contained"
            onClick={handleSaveWorker}
            disabled={actionSaving}
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(actionDialog)}
        onClose={() => {
          if (!actionSaving) {
            setActionDialog(null);
          }
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
          }}
        >
          {actionDialog?.title ||
            '상태 변경'}
        </DialogTitle>

        <DialogContent dividers>
          {actionDialog && (
            <Stack spacing={1.2}>
              <Alert severity="info">
                {actionDialog.row.name} · {formatMonthLabel(selectedMonth)}
              </Alert>

              {actionDialog.nextStatus ===
                'pdf_generated' && (
                <Typography>
                  실제 PDF를 출력한 후 이 기록을 남겨주세요. PDF 파일 자체는 서버에 저장하지 않습니다.
                </Typography>
              )}

              {actionDialog.nextStatus ===
                'scan_verified' && (
                <>
                  <Typography>
                    서명받은 스캔 사본을 노임관리자에게 전달하고, 업로드 파일명만 기록합니다. 파일 원본은 현재 단계에서 서버에 저장하지 않습니다.
                  </Typography>

                  <TextField
                    label="스캔 파일명"
                    value={actionFileName}
                    onChange={(event) =>
                      setActionFileName(
                        event.target.value,
                      )
                    }
                    placeholder="예: 홍길동_2026-07_근로계약서.pdf"
                  />
                </>
              )}

              {[
                'rejected',
                'excluded',
              ].includes(
                actionDialog.nextStatus,
              ) && (
                <TextField
                  label={
                    actionDialog.nextStatus ===
                    'rejected'
                      ? '반려 사유'
                      : '제외 사유'
                  }
                  value={actionReason}
                  onChange={(event) =>
                    setActionReason(
                      event.target.value,
                    )
                  }
                  multiline
                  minRows={3}
                  required
                />
              )}

              {actionDialog.nextStatus ===
                'manager_confirmed' && (
                <Alert severity="warning">
                  관리자 확인을 완료하면 작성완료로 표시되고 기본 미작성 경고에서 제외됩니다.
                </Alert>
              )}
            </Stack>
          )}
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setActionDialog(null)
            }
            disabled={actionSaving}
          >
            취소
          </Button>

          <Button
            variant="contained"
            color={
              actionDialog?.nextStatus ===
                'rejected'
                ? 'error'
                : 'primary'
            }
            onClick={
              handleStatusAction
            }
            disabled={
              actionSaving ||
              (
                [
                  'rejected',
                  'excluded',
                ].includes(
                  actionDialog?.nextStatus,
                ) &&
                !actionReason.trim()
              )
            }
          >
            확인
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={eventDialogOpen}
        onClose={() =>
          setEventDialogOpen(false)
        }
        fullWidth
        maxWidth="md"
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
          }}
        >
          {eventTarget
            ? `${eventTarget.name} 처리 이력`
            : '처리 이력'}
        </DialogTitle>

        <DialogContent dividers>
          {eventLoading ? (
            <Box
              sx={{
                py: 5,
                textAlign: 'center',
              }}
            >
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Table
              size="small"
              sx={{
                '& th': {
                  fontWeight: 900,
                  bgcolor: '#f8fafc',
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>
                    처리일시
                  </TableCell>

                  <TableCell>
                    이전상태
                  </TableCell>

                  <TableCell>
                    변경상태
                  </TableCell>

                  <TableCell>
                    사유
                  </TableCell>

                  <TableCell>
                    처리자
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {eventRows.map(
                  (event) => (
                    <TableRow
                      key={event.id}
                    >
                      <TableCell>
                        {formatDateTime(
                          event.performed_at,
                        )}
                      </TableCell>

                      <TableCell>
                        {event.previous_status
                          ? getStatusMeta(
                              event.previous_status,
                            ).label
                          : '-'}
                      </TableCell>

                      <TableCell>
                        {event.next_status
                          ? getStatusMeta(
                              event.next_status,
                            ).label
                          : '-'}
                      </TableCell>

                      <TableCell>
                        {event.reason ||
                          '-'}
                      </TableCell>

                      <TableCell>
                        {event.performed_by_email ||
                          '-'}
                      </TableCell>
                    </TableRow>
                  ),
                )}

                {eventRows.length ===
                  0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      align="center"
                      sx={{
                        py: 4,
                        color: '#94a3b8',
                      }}
                    >
                      처리 이력이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setEventDialogOpen(false)
            }
          >
            닫기
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
