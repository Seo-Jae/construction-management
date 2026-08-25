import React, {
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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ExcelJS from 'exceljs';
import { supabase } from '../supabaseClient';

const LEGACY_JOB_MAP = {
  경량: '경량벽체',
  천정: '세대천정',
};

const UPLOAD_CHUNK_SIZE = 50;

/*
  월별 과거 출력일보에서 하루 최대 200명까지 읽습니다.

  좌측 명단:
  B:F

  우측 명단:
  H:L

  각 명단은 100명까지 탐색합니다.
*/
const MAX_HISTORICAL_WORKERS = 200;
const WORKER_START_ROW = 18;
const WORKER_ROWS_PER_SIDE = 100;
const WORKER_END_ROW =
  WORKER_START_ROW +
  WORKER_ROWS_PER_SIDE -
  1;

const normalizeText = (value) =>
  String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const normalizeComparableText = (value) =>
  normalizeText(value)
    .replace(/㈜|\(주\)|주식회사/gi, '')
    .replace(/[^0-9a-zA-Z가-힣]/g, '')
    .toLowerCase();

const getCellRawValue = (cell) => {
  const value = cell?.value;

  if (
    value &&
    typeof value === 'object' &&
    !(value instanceof Date)
  ) {
    if (
      Array.isArray(value.richText)
    ) {
      return value.richText
        .map((part) => part?.text || '')
        .join('');
    }

    if (
      Object.prototype.hasOwnProperty.call(
        value,
        'result',
      )
    ) {
      return value.result;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        value,
        'text',
      )
    ) {
      return value.text;
    }
  }

  return value;
};

const getCellText = (cell) =>
  normalizeText(getCellRawValue(cell));

const isValidDateParts = (
  year,
  month,
  day,
) => {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  const date = new Date(
    year,
    month - 1,
    day,
  );

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

const toDateParts = (
  year,
  month,
  day,
) => {
  const normalizedYear =
    year < 100
      ? 2000 + year
      : year;

  if (
    !isValidDateParts(
      normalizedYear,
      month,
      day,
    )
  ) {
    return null;
  }

  return {
    year: normalizedYear,
    month,
    day,
  };
};

const datePartsToKey = (parts) => {
  if (!parts) return '';

  return [
    String(parts.year).slice(-2),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('.');
};

const datePartsToIso = (parts) => {
  if (!parts) return '';

  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
};

const sameDateParts = (
  first,
  second,
) =>
  Boolean(
    first &&
      second &&
      first.year === second.year &&
      first.month === second.month &&
      first.day === second.day,
  );

const excelSerialToDateParts = (
  serial,
) => {
  if (
    typeof serial !== 'number' ||
    !Number.isFinite(serial)
  ) {
    return null;
  }

  const milliseconds =
    Date.UTC(1899, 11, 30) +
    Math.round(
      serial * 24 * 60 * 60 * 1000,
    );

  const date = new Date(milliseconds);

  return toDateParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
};

const parseDateValue = (value) => {
  if (value instanceof Date) {
    const localParts = toDateParts(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
    );

    if (localParts) {
      return localParts;
    }

    return toDateParts(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  }

  if (typeof value === 'number') {
    return excelSerialToDateParts(value);
  }

  const text = normalizeText(value);

  if (!text) return null;

  let match = text.match(
    /(\d{4})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})/,
  );

  if (match) {
    return toDateParts(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    );
  }

  match = text.match(
    /(?:^|\D)(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\D|$)/,
  );

  if (match) {
    return toDateParts(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    );
  }

  return null;
};

const parseFileMonth = (fileName) => {
  const text = normalizeText(fileName);

  let match = text.match(
    /(?:^|\D)(\d{4})\s*년?[_\-\s.]*(\d{1,2})\s*월/,
  );

  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
    };
  }

  match = text.match(
    /(?:^|\D)(\d{2})\s*년?[_\-\s.]*(\d{1,2})\s*월/,
  );

  if (match) {
    return {
      year: 2000 + Number(match[1]),
      month: Number(match[2]),
    };
  }

  return null;
};

const parseSheetDate = (
  sheetName,
  fileMonth,
) => {
  const text = normalizeText(sheetName);

  let match = text.match(
    /^(\d{2})(\d{2})(\d{2})$/,
  );

  if (match) {
    return toDateParts(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    );
  }

  match = text.match(
    /^(\d{4})(\d{2})(\d{2})$/,
  );

  if (match) {
    return toDateParts(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    );
  }

  match = text.match(
    /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/,
  );

  if (match) {
    return toDateParts(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    );
  }

  match = text.match(
    /^(\d{1,2})\s*월\s*(\d{1,2})\s*일?$/,
  );

  if (
    match &&
    fileMonth
  ) {
    return toDateParts(
      fileMonth.year,
      Number(match[1]),
      Number(match[2]),
    );
  }

  match = text.match(
    /^(\d{1,2})[.\-/](\d{1,2})$/,
  );

  if (
    match &&
    fileMonth
  ) {
    return toDateParts(
      fileMonth.year,
      Number(match[1]),
      Number(match[2]),
    );
  }

  match = text.match(
    /^(\d{1,2})\s*일?$/,
  );

  if (
    match &&
    fileMonth
  ) {
    return toDateParts(
      fileMonth.year,
      fileMonth.month,
      Number(match[1]),
    );
  }

  return null;
};

const mapLegacyJob = (value) => {
  const normalized = normalizeText(value);

  return (
    LEGACY_JOB_MAP[normalized] ||
    normalized
  );
};

const getNumericCellValue = (cell) => {
  const raw = getCellRawValue(cell);
  const numeric = Number(raw);

  return Number.isFinite(numeric)
    ? numeric
    : null;
};

const readWorkerRow = ({
  worksheet,
  rowNumber,
  numberColumn,
  columns,
  sheetName,
}) => {
  const [
    jobColumn,
    nameColumn,
    processColumn,
    locationColumn,
    contentColumn,
  ] = columns;

  const sequenceValue =
    getCellRawValue(
      worksheet.getCell(
        `${numberColumn}${rowNumber}`,
      ),
    );

  const sequenceNumber =
    Number(sequenceValue);

  const sourceJob = getCellText(
    worksheet.getCell(
      `${jobColumn}${rowNumber}`,
    ),
  );

  const name = getCellText(
    worksheet.getCell(
      `${nameColumn}${rowNumber}`,
    ),
  );

  const sourceProcess = getCellText(
    worksheet.getCell(
      `${processColumn}${rowNumber}`,
    ),
  );

  const location = getCellText(
    worksheet.getCell(
      `${locationColumn}${rowNumber}`,
    ),
  );

  const workContent = getCellText(
    worksheet.getCell(
      `${contentColumn}${rowNumber}`,
    ),
  );

  if (!name) {
    return null;
  }

  /*
    명단 아래쪽의 서명·비고 등에 적힌 이름을
    근로자로 잘못 읽지 않도록 순번 또는 작업정보가
    존재하는 행만 근로자 행으로 인정합니다.
  */
  const hasWorkerEvidence =
    Number.isFinite(sequenceNumber) ||
    Boolean(
      sourceJob ||
      sourceProcess ||
      location ||
      workContent,
    );

  if (!hasWorkerEvidence) {
    return null;
  }

  const job = mapLegacyJob(
    sourceJob || sourceProcess,
  );

  const process = mapLegacyJob(
    sourceProcess || sourceJob,
  );

  return {
    id:
      `historical-${sheetName}-${rowNumber}-${nameColumn}`,
    sequence:
      Number.isFinite(sequenceNumber)
        ? sequenceNumber
        : null,
    job: job || null,
    name,
    process:
      process || job || null,
    location,
    workContent,
    day: 1,
    night: 0,
    sourceJob,
    sourceProcess,
  };
};

const readWorksheetWorkers = (
  worksheet,
) => {
  const detectedWorkers = [];

  /*
    기존 양식은 좌측 30명 + 우측 30명이었지만,
    확장 양식에서는 동일한 열 구조로 아래쪽 행이
    계속 늘어날 수 있으므로 각 영역을 100행까지 읽습니다.

    좌측 최대 100명 + 우측 최대 100명 = 총 200명
  */
  for (
    let rowNumber =
      WORKER_START_ROW;
    rowNumber <=
      WORKER_END_ROW;
    rowNumber += 1
  ) {
    const leftWorker =
      readWorkerRow({
        worksheet,
        rowNumber,
        numberColumn: 'A',
        columns: [
          'B',
          'C',
          'D',
          'E',
          'F',
        ],
        sheetName: worksheet.name,
      });

    const rightWorker =
      readWorkerRow({
        worksheet,
        rowNumber,
        numberColumn: 'G',
        columns: [
          'H',
          'I',
          'J',
          'K',
          'L',
        ],
        sheetName: worksheet.name,
      });

    if (leftWorker) {
      detectedWorkers.push(
        leftWorker,
      );
    }

    if (rightWorker) {
      detectedWorkers.push(
        rightWorker,
      );
    }
  }

  /*
    혹시 200명 범위를 넘겨 명단이 이어지는 경우를
    탐지하여 일부만 잘린 상태로 업로드되지 않게 합니다.
  */
  let overflowCount = 0;

  const actualLastRow = Math.min(
    Number(
      worksheet.actualRowCount ||
      worksheet.rowCount ||
      WORKER_END_ROW,
    ),
    WORKER_END_ROW + 300,
  );

  for (
    let rowNumber =
      WORKER_END_ROW + 1;
    rowNumber <= actualLastRow;
    rowNumber += 1
  ) {
    const leftWorker =
      readWorkerRow({
        worksheet,
        rowNumber,
        numberColumn: 'A',
        columns: [
          'B',
          'C',
          'D',
          'E',
          'F',
        ],
        sheetName: worksheet.name,
      });

    const rightWorker =
      readWorkerRow({
        worksheet,
        rowNumber,
        numberColumn: 'G',
        columns: [
          'H',
          'I',
          'J',
          'K',
          'L',
        ],
        sheetName: worksheet.name,
      });

    if (leftWorker) {
      overflowCount += 1;
    }

    if (rightWorker) {
      overflowCount += 1;
    }
  }

  return {
    workers:
      detectedWorkers.slice(
        0,
        MAX_HISTORICAL_WORKERS,
      ),
    detectedCount:
      detectedWorkers.length +
      overflowCount,
    overflowCount:
      Math.max(
        0,
        detectedWorkers.length +
          overflowCount -
          MAX_HISTORICAL_WORKERS,
      ),
  };
};

const getSummaryWorkerCount = (
  worksheet,
) => {
  const leftRows = [
    8,
    9,
    10,
    11,
    12,
    13,
    14,
  ];

  const rightRows = [
    8,
    9,
    10,
    11,
    12,
    13,
    14,
  ];

  const values = [
    ...leftRows.map((row) =>
      getNumericCellValue(
        worksheet.getCell(`C${row}`),
      ),
    ),
    ...rightRows.map((row) =>
      getNumericCellValue(
        worksheet.getCell(`I${row}`),
      ),
    ),
  ].filter(
    (value) => value !== null,
  );

  if (values.length === 0) {
    return null;
  }

  return values.reduce(
    (sum, value) => sum + value,
    0,
  );
};

const splitIntoChunks = (
  values,
  chunkSize,
) => {
  const result = [];

  for (
    let index = 0;
    index < values.length;
    index += chunkSize
  ) {
    result.push(
      values.slice(
        index,
        index + chunkSize,
      ),
    );
  }

  return result;
};

const getResultStatus = (result) => {
  if (
    Array.isArray(result.errors) &&
    result.errors.length > 0
  ) {
    return {
      label: '오류',
      color: 'error',
    };
  }

  if (result.duplicate) {
    return {
      label: '중복',
      color: 'warning',
    };
  }

  if (result.workers.length === 0) {
    return {
      label: '빈 일보',
      color: 'default',
    };
  }

  return {
    label: '등록 가능',
    color: 'success',
  };
};

const canSelectResult = ({
  result,
  includeEmpty,
  duplicateMode,
}) => {
  if (
    result.errors.length > 0
  ) {
    return false;
  }

  if (
    result.workers.length === 0 &&
    !includeEmpty
  ) {
    return false;
  }

  if (
    result.duplicate &&
    duplicateMode === 'skip'
  ) {
    return false;
  }

  return true;
};

export default function HistoricalDailyReportUpload({
  projectName,
  companyName = '',
  onUploadComplete,
}) {
  const fileInputRef = useRef(null);

  const [
    dialogOpen,
    setDialogOpen,
  ] = useState(false);

  const [
    fileName,
    setFileName,
  ] = useState('');

  const [
    results,
    setResults,
  ] = useState([]);

  const [
    selectedDates,
    setSelectedDates,
  ] = useState(
    () => new Set(),
  );

  const [
    includeEmpty,
    setIncludeEmpty,
  ] = useState(false);

  const [
    duplicateMode,
    setDuplicateMode,
  ] = useState('skip');

  const [
    analyzing,
    setAnalyzing,
  ] = useState(false);

  const [
    uploading,
    setUploading,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const [
    successMessage,
    setSuccessMessage,
  ] = useState('');

  const handleOpen = () => {
    setDialogOpen(true);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleClose = () => {
    if (
      analyzing ||
      uploading
    ) {
      return;
    }

    setDialogOpen(false);
  };

  const resetAnalysis = () => {
    setFileName('');
    setResults([]);
    setSelectedDates(
      new Set(),
    );
    setIncludeEmpty(false);
    setDuplicateMode('skip');
    setErrorMessage('');
    setSuccessMessage('');

    if (
      fileInputRef.current
    ) {
      fileInputRef.current.value = '';
    }
  };

  const updateSelections = ({
    nextResults = results,
    nextIncludeEmpty =
      includeEmpty,
    nextDuplicateMode =
      duplicateMode,
  }) => {
    const nextSelected =
      new Set();

    nextResults.forEach(
      (result) => {
        if (
          canSelectResult({
            result,
            includeEmpty:
              nextIncludeEmpty,
            duplicateMode:
              nextDuplicateMode,
          })
        ) {
          nextSelected.add(
            result.dateKey,
          );
        }
      },
    );

    setSelectedDates(
      nextSelected,
    );
  };

  const analyzeFile = async (
    file,
  ) => {
    if (!projectName) {
      setErrorMessage(
        '먼저 업로드할 현장을 선택해주세요.',
      );
      return;
    }

    setAnalyzing(true);
    setErrorMessage('');
    setSuccessMessage('');
    setResults([]);
    setSelectedDates(
      new Set(),
    );
    setIncludeEmpty(false);
    setDuplicateMode('skip');
    setFileName(file.name);

    try {
      const arrayBuffer =
        await file.arrayBuffer();

      const workbook =
        new ExcelJS.Workbook();

      await workbook.xlsx.load(
        arrayBuffer,
      );

      const fileMonth =
        parseFileMonth(file.name);

      const preliminaryResults = [];
      const usedDateKeys =
        new Set();

      workbook.worksheets.forEach(
        (worksheet) => {
          const errors = [];
          const warnings = [];

          const sheetDate =
            parseSheetDate(
              worksheet.name,
              fileMonth,
            );

          const cellDate =
            parseDateValue(
              getCellRawValue(
                worksheet.getCell('C5'),
              ),
            );

          let resolvedDate =
            cellDate || sheetDate;

          if (
            sheetDate &&
            cellDate &&
            !sameDateParts(
              sheetDate,
              cellDate,
            )
          ) {
            errors.push(
              `시트명 날짜(${datePartsToIso(
                sheetDate,
              )})와 C5 날짜(${datePartsToIso(
                cellDate,
              )})가 다릅니다.`,
            );
          }

          if (!resolvedDate) {
            errors.push(
              '날짜를 확인하지 못했습니다.',
            );
          }

          if (
            fileMonth &&
            resolvedDate &&
            (
              fileMonth.year !==
                resolvedDate.year ||
              fileMonth.month !==
                resolvedDate.month
            )
          ) {
            errors.push(
              `파일명 월(${fileMonth.year}-${String(
                fileMonth.month,
              ).padStart(
                2,
                '0',
              )})과 시트 날짜가 다릅니다.`,
            );
          }

          const dateKey =
            datePartsToKey(
              resolvedDate,
            );

          if (
            dateKey &&
            usedDateKeys.has(
              dateKey,
            )
          ) {
            errors.push(
              `같은 날짜(${dateKey})가 파일 안에 중복되어 있습니다.`,
            );
          }

          if (dateKey) {
            usedDateKeys.add(
              dateKey,
            );
          }

          const sourceProjectName =
            getCellText(
              worksheet.getCell('C3'),
            );

          const sourceCompanyName =
            getCellText(
              worksheet.getCell('C4'),
            );

          const selectedProjectComparable =
            normalizeComparableText(
              projectName,
            );

          const sourceProjectComparable =
            normalizeComparableText(
              sourceProjectName,
            );

          if (
            sourceProjectComparable &&
            selectedProjectComparable &&
            sourceProjectComparable !==
              selectedProjectComparable
          ) {
            errors.push(
              `엑셀 현장명(${sourceProjectName})과 선택 현장(${projectName})이 다릅니다.`,
            );
          }

          const selectedCompanyComparable =
            normalizeComparableText(
              companyName,
            );

          const sourceCompanyComparable =
            normalizeComparableText(
              sourceCompanyName,
            );

          if (
            sourceCompanyComparable &&
            selectedCompanyComparable &&
            sourceCompanyComparable !==
              selectedCompanyComparable
          ) {
            warnings.push(
              `업체명이 다릅니다: ${sourceCompanyName}`,
            );
          }

          const workerReadResult =
            readWorksheetWorkers(
              worksheet,
            );

          const workers =
            workerReadResult.workers;

          if (
            workerReadResult
              .overflowCount > 0
          ) {
            errors.push(
              `근로자 명단이 최대 ${MAX_HISTORICAL_WORKERS}명을 초과했습니다. 감지 인원: ${workerReadResult.detectedCount}명`,
            );
          }

          workers.forEach(
            (worker) => {
              if (!worker.job) {
                errors.push(
                  `${worker.name}: 구분을 확인할 수 없습니다.`,
                );
              }

              if (!worker.process) {
                errors.push(
                  `${worker.name}: 공정을 확인할 수 없습니다.`,
                );
              }
            },
          );

          const listWorkerCount =
            workers.length;

          const summaryWorkerCount =
            getSummaryWorkerCount(
              worksheet,
            );

          const displayedTotal =
            getNumericCellValue(
              worksheet.getCell('N7'),
            );

          if (
            summaryWorkerCount !==
              null &&
            summaryWorkerCount !==
              listWorkerCount
          ) {
            errors.push(
              `인원현황 합계 ${summaryWorkerCount}명과 근로자 목록 ${listWorkerCount}명이 다릅니다.`,
            );
          }

          if (
            displayedTotal !== null &&
            displayedTotal !==
              listWorkerCount
          ) {
            errors.push(
              `표시 총원 ${displayedTotal}명과 근로자 목록 ${listWorkerCount}명이 다릅니다.`,
            );
          }

          preliminaryResults.push({
            sheetName:
              worksheet.name,
            dateParts:
              resolvedDate,
            dateKey,
            dateIso:
              datePartsToIso(
                resolvedDate,
              ),
            sourceProjectName,
            sourceCompanyName,
            workers,
            summaryWorkerCount,
            displayedTotal,
            warnings,
            errors:
              Array.from(
                new Set(errors),
              ),
            duplicate: false,
          });
        },
      );

      const dateKeys =
        preliminaryResults
          .map(
            (result) =>
              result.dateKey,
          )
          .filter(Boolean);

      const existingDateSet =
        new Set();

      if (
        dateKeys.length > 0
      ) {
        const {
          data,
          error,
        } = await supabase
          .from('daily_reports')
          .select('date')
          .eq(
            'project_name',
            projectName,
          )
          .in(
            'date',
            dateKeys,
          );

        if (error) {
          throw error;
        }

        (data || []).forEach(
          (row) => {
            existingDateSet.add(
              row.date,
            );
          },
        );
      }

      const analyzedResults =
        preliminaryResults
          .map((result) => ({
            ...result,
            duplicate:
              existingDateSet.has(
                result.dateKey,
              ),
          }))
          .sort(
            (first, second) =>
              String(
                first.dateKey,
              ).localeCompare(
                String(
                  second.dateKey,
                ),
              ),
          );

      setResults(
        analyzedResults,
      );

      updateSelections({
        nextResults:
          analyzedResults,
        nextIncludeEmpty: false,
        nextDuplicateMode:
          'skip',
      });
    } catch (error) {
      console.error(
        '이전 출력일보 분석 오류:',
        error,
      );

      setResults([]);
      setSelectedDates(
        new Set(),
      );
      setErrorMessage(
        error?.message ||
          '월별 Excel 파일을 분석하지 못했습니다.',
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileChange = (
    event,
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    analyzeFile(file);
  };

  const handleIncludeEmptyChange = (
    event,
  ) => {
    const nextValue =
      event.target.checked;

    setIncludeEmpty(
      nextValue,
    );

    updateSelections({
      nextIncludeEmpty:
        nextValue,
    });
  };

  const handleDuplicateModeChange = (
    event,
  ) => {
    const nextMode =
      event.target.value;

    setDuplicateMode(
      nextMode,
    );

    updateSelections({
      nextDuplicateMode:
        nextMode,
    });
  };

  const handleToggleResult = (
    result,
  ) => {
    if (
      !canSelectResult({
        result,
        includeEmpty,
        duplicateMode,
      })
    ) {
      return;
    }

    setSelectedDates(
      (previous) => {
        const next =
          new Set(previous);

        if (
          next.has(
            result.dateKey,
          )
        ) {
          next.delete(
            result.dateKey,
          );
        } else {
          next.add(
            result.dateKey,
          );
        }

        return next;
      },
    );
  };

  const selectedResults =
    useMemo(
      () =>
        results.filter(
          (result) =>
            selectedDates.has(
              result.dateKey,
            ) &&
            canSelectResult({
              result,
              includeEmpty,
              duplicateMode,
            }),
        ),
      [
        duplicateMode,
        includeEmpty,
        results,
        selectedDates,
      ],
    );

  const summary = useMemo(
    () => ({
      total: results.length,
      ready:
        results.filter(
          (result) =>
            result.errors.length ===
              0 &&
            !result.duplicate &&
            result.workers.length >
              0,
        ).length,
      empty:
        results.filter(
          (result) =>
            result.errors.length ===
              0 &&
            result.workers.length ===
              0,
        ).length,
      duplicate:
        results.filter(
          (result) =>
            result.errors.length ===
              0 &&
            result.duplicate,
        ).length,
      error:
        results.filter(
          (result) =>
            result.errors.length > 0,
        ).length,
    }),
    [results],
  );

  const handleUpload = async () => {
    if (
      selectedResults.length ===
      0
    ) {
      setErrorMessage(
        '업로드할 일자를 선택해주세요.',
      );
      return;
    }

    const confirmed =
      window.confirm(
        `${projectName}\n\n선택한 ${selectedResults.length}개 일보를 업로드하시겠습니까?`,
      );

    if (!confirmed) {
      return;
    }

    setUploading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      const authorEmail =
        authData?.user?.email;

      if (!authorEmail) {
        throw new Error(
          '로그인 사용자 이메일을 확인하지 못했습니다.',
        );
      }

      const payload =
        selectedResults.map(
          (result) => ({
            date: result.dateKey,
            project_name:
              projectName,
            author_email:
              authorEmail,
            workers:
              result.workers,
            tasks: [],
            today_task: '',
            tomorrow_task: '',
            status: 'closed',
          }),
        );

      const chunks =
        splitIntoChunks(
          payload,
          UPLOAD_CHUNK_SIZE,
        );

      for (
        const chunk of chunks
      ) {
        const {
          error,
        } = await supabase
          .from('daily_reports')
          .upsert(
            chunk,
            {
              onConflict:
                'date, project_name',
            },
          );

        if (error) {
          throw error;
        }
      }

      if (
        typeof onUploadComplete ===
        'function'
      ) {
        await onUploadComplete(
          payload,
        );
      }

      window.dispatchEvent(
        new CustomEvent(
          'daily-reports-updated',
          {
            detail: {
              projectName,
              dates:
                payload.map(
                  (row) =>
                    row.date,
                ),
            },
          },
        ),
      );

      setSuccessMessage(
        `${payload.length}개 출력일보를 업로드했습니다.`,
      );

      setResults((previous) =>
        previous.map((result) =>
          selectedDates.has(
            result.dateKey,
          )
            ? {
                ...result,
                duplicate: true,
              }
            : result,
        ),
      );

      setSelectedDates(
        new Set(),
      );

      alert(
        `${payload.length}개 출력일보가 등록되었습니다.`,
      );
    } catch (error) {
      console.error(
        '이전 출력일보 업로드 오류:',
        error,
      );

      setErrorMessage(
        error?.message ||
          '출력일보를 업로드하지 못했습니다.',
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        color="success"
        size="small"
        fullWidth
        disabled={!projectName}
        onClick={handleOpen}
        sx={{
          minHeight: 35,
          px: 0.45,
          py: 0.55,
          fontSize: '0.68rem',
          fontWeight: 900,
          lineHeight: 1.2,
          whiteSpace: 'normal',
        }}
      >
        이전 출력일보 업로드
      </Button>

      <Dialog
        open={dialogOpen}
        onClose={handleClose}
        fullWidth
        maxWidth="lg"
        PaperProps={{
          sx: {
            height: '82vh',
            minHeight: 560,
          },
        }}
      >
        <DialogTitle
          sx={{
            px: 2,
            py: 1.4,
            borderBottom:
              '1px solid #e2e8f0',
          }}
        >
          <Typography
            component="div"
            sx={{
              color: '#0f172a',
              fontSize: '1rem',
              fontWeight: 900,
            }}
          >
            이전 출력일보 업로드
          </Typography>

          <Typography
            sx={{
              mt: 0.2,
              color: '#64748b',
              fontSize: '0.7rem',
              fontWeight: 700,
            }}
          >
            월별 Excel 파일의 모든 일자 시트를 분석하고 하루 최대 200명까지 daily_reports에 등록합니다.
          </Typography>
        </DialogTitle>

        <DialogContent
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.1,
            overflow: 'hidden',
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              px: 1.2,
              py: 1,
              borderColor:
                '#cbd5e1',
              bgcolor:
                '#f8fafc',
              boxShadow: 'none',
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  md:
                    'minmax(240px, 0.9fr) minmax(300px, 1.1fr)',
                },
                gap: 1,
                alignItems:
                  'center',
              }}
            >
              <Box>
                <Typography
                  sx={{
                    color: '#64748b',
                    fontSize:
                      '0.65rem',
                    fontWeight: 800,
                  }}
                >
                  업로드 대상 현장
                </Typography>

                <Typography
                  sx={{
                    mt: 0.2,
                    color: '#0f172a',
                    fontSize:
                      '0.82rem',
                    fontWeight: 900,
                  }}
                >
                  {projectName ||
                    '현장을 선택해주세요'}
                </Typography>
              </Box>

              <Box
                sx={{
                  minWidth: 0,
                  display: 'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'flex-end',
                  gap: 0.7,
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xlsm"
                  hidden
                  onChange={
                    handleFileChange
                  }
                />

                <Button
                  variant="contained"
                  size="small"
                  disabled={
                    analyzing ||
                    uploading ||
                    !projectName
                  }
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  sx={{
                    flexShrink: 0,
                    fontSize:
                      '0.68rem',
                    fontWeight: 900,
                  }}
                >
                  월별 Excel 선택
                </Button>

                <Typography
                  noWrap
                  title={fileName}
                  sx={{
                    minWidth: 0,
                    maxWidth: 330,
                    color: fileName
                      ? '#334155'
                      : '#94a3b8',
                    fontSize:
                      '0.7rem',
                    fontWeight: 700,
                  }}
                >
                  {fileName ||
                    '선택된 파일이 없습니다.'}
                </Typography>
              </Box>
            </Box>
          </Paper>

          {(analyzing ||
            uploading) && (
            <LinearProgress />
          )}

          {errorMessage && (
            <Alert
              severity="error"
              sx={{
                py: 0.2,
                fontSize: '0.7rem',
              }}
            >
              {errorMessage}
            </Alert>
          )}

          {successMessage && (
            <Alert
              severity="success"
              sx={{
                py: 0.2,
                fontSize: '0.7rem',
              }}
            >
              {successMessage}
            </Alert>
          )}

          {results.length > 0 && (
            <>
              <Box
                sx={{
                  display: 'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'space-between',
                  gap: 1,
                  flexWrap: 'wrap',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems:
                      'center',
                    flexWrap: 'wrap',
                    gap: 0.45,
                  }}
                >
                  <Chip
                    size="small"
                    label={`전체 ${summary.total}`}
                  />

                  <Chip
                    size="small"
                    color="success"
                    label={`등록 가능 ${summary.ready}`}
                  />

                  <Chip
                    size="small"
                    label={`빈 일보 ${summary.empty}`}
                  />

                  <Chip
                    size="small"
                    color="warning"
                    label={`중복 ${summary.duplicate}`}
                  />

                  <Chip
                    size="small"
                    color="error"
                    label={`오류 ${summary.error}`}
                  />
                </Box>

                <Box
                  sx={{
                    display: 'flex',
                    alignItems:
                      'center',
                    gap: 0.7,
                    flexWrap: 'wrap',
                  }}
                >
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={
                          includeEmpty
                        }
                        onChange={
                          handleIncludeEmptyChange
                        }
                      />
                    }
                    label="빈 일보 포함"
                    sx={{
                      m: 0,
                      '& .MuiFormControlLabel-label':
                        {
                          fontSize:
                            '0.7rem',
                          fontWeight: 800,
                        },
                    }}
                  />

                  <Typography
                    sx={{
                      color: '#64748b',
                      fontSize:
                        '0.67rem',
                      fontWeight: 800,
                    }}
                  >
                    중복 처리
                  </Typography>

                  <Select
                    size="small"
                    value={
                      duplicateMode
                    }
                    onChange={
                      handleDuplicateModeChange
                    }
                    sx={{
                      minWidth: 148,
                      height: 32,
                      fontSize:
                        '0.68rem',
                      fontWeight: 800,
                    }}
                  >
                    <MenuItem value="skip">
                      기존 자료 유지
                    </MenuItem>

                    <MenuItem value="overwrite">
                      기존 자료 덮어쓰기
                    </MenuItem>
                  </Select>
                </Box>
              </Box>

              <TableContainer
                component={Paper}
                variant="outlined"
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflow: 'auto',
                  borderColor:
                    '#94a3b8',
                  boxShadow: 'none',
                }}
              >
                <Table
                  stickyHeader
                  size="small"
                  sx={{
                    minWidth: 880,
                    tableLayout:
                      'fixed',
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell
                        align="center"
                        sx={{
                          width: 48,
                          bgcolor:
                            '#e2e8f0',
                          fontWeight:
                            900,
                        }}
                      >
                        선택
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{
                          width: 88,
                          bgcolor:
                            '#e2e8f0',
                          fontWeight:
                            900,
                        }}
                      >
                        시트
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{
                          width: 105,
                          bgcolor:
                            '#e2e8f0',
                          fontWeight:
                            900,
                        }}
                      >
                        날짜
                      </TableCell>

                      <TableCell
                        sx={{
                          width: 230,
                          bgcolor:
                            '#e2e8f0',
                          fontWeight:
                            900,
                        }}
                      >
                        엑셀 현장명
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{
                          width: 78,
                          bgcolor:
                            '#e2e8f0',
                          fontWeight:
                            900,
                        }}
                      >
                        인원
                      </TableCell>

                      <TableCell
                        align="center"
                        sx={{
                          width: 90,
                          bgcolor:
                            '#e2e8f0',
                          fontWeight:
                            900,
                        }}
                      >
                        상태
                      </TableCell>

                      <TableCell
                        sx={{
                          bgcolor:
                            '#e2e8f0',
                          fontWeight:
                            900,
                        }}
                      >
                        확인내용
                      </TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {results.map(
                      (result) => {
                        const status =
                          getResultStatus(
                            result,
                          );

                        const selectable =
                          canSelectResult({
                            result,
                            includeEmpty,
                            duplicateMode,
                          });

                        const messages = [
                          ...result.errors,
                          ...result.warnings,
                        ];

                        return (
                          <TableRow
                            key={`${result.sheetName}-${result.dateKey}`}
                            hover
                            selected={selectedDates.has(
                              result.dateKey,
                            )}
                          >
                            <TableCell
                              align="center"
                            >
                              <Checkbox
                                size="small"
                                disabled={
                                  !selectable
                                }
                                checked={selectedDates.has(
                                  result.dateKey,
                                )}
                                onChange={() =>
                                  handleToggleResult(
                                    result,
                                  )
                                }
                              />
                            </TableCell>

                            <TableCell
                              align="center"
                              sx={{
                                fontSize:
                                  '0.67rem',
                                fontWeight:
                                  800,
                              }}
                            >
                              {
                                result.sheetName
                              }
                            </TableCell>

                            <TableCell
                              align="center"
                              sx={{
                                fontSize:
                                  '0.68rem',
                                fontWeight:
                                  900,
                              }}
                            >
                              {result.dateIso ||
                                '-'}
                            </TableCell>

                            <TableCell
                              title={
                                result.sourceProjectName
                              }
                              sx={{
                                overflow:
                                  'hidden',
                                textOverflow:
                                  'ellipsis',
                                whiteSpace:
                                  'nowrap',
                                fontSize:
                                  '0.68rem',
                              }}
                            >
                              {result.sourceProjectName ||
                                '-'}
                            </TableCell>

                            <TableCell
                              align="center"
                              sx={{
                                fontSize:
                                  '0.7rem',
                                fontWeight:
                                  900,
                              }}
                            >
                              {
                                result
                                  .workers
                                  .length
                              }
                              명
                            </TableCell>

                            <TableCell
                              align="center"
                            >
                              <Chip
                                size="small"
                                color={
                                  status.color
                                }
                                label={
                                  status.label
                                }
                                sx={{
                                  height: 22,
                                  fontSize:
                                    '0.61rem',
                                  fontWeight:
                                    900,
                                }}
                              />
                            </TableCell>

                            <TableCell
                              sx={{
                                color:
                                  result.errors
                                    .length >
                                  0
                                    ? '#b91c1c'
                                    : '#64748b',
                                fontSize:
                                  '0.64rem',
                                lineHeight:
                                  1.4,
                              }}
                            >
                              {messages.length >
                              0
                                ? messages.join(
                                    ' / ',
                                  )
                                : '정상'}
                            </TableCell>
                          </TableRow>
                        );
                      },
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {results.length ===
            0 &&
            !analyzing && (
              <Paper
                variant="outlined"
                sx={{
                  flex: 1,
                  minHeight: 220,
                  display: 'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'center',
                  borderColor:
                    '#cbd5e1',
                  bgcolor:
                    '#ffffff',
                  boxShadow: 'none',
                }}
              >
                <Box
                  sx={{
                    textAlign:
                      'center',
                  }}
                >
                  <Typography
                    sx={{
                      color:
                        '#475569',
                      fontSize:
                        '0.82rem',
                      fontWeight: 900,
                    }}
                  >
                    월별 출력일보 Excel 파일을 선택해주세요.
                  </Typography>

                  <Typography
                    sx={{
                      mt: 0.45,
                      color:
                        '#94a3b8',
                      fontSize:
                        '0.68rem',
                    }}
                  >
                    시트 1개를 하루 일보로 분석하며 업로드 전에 결과를 미리 확인합니다.
                  </Typography>
                </Box>
              </Paper>
            )}
        </DialogContent>

        <DialogActions
          sx={{
            px: 2,
            py: 1.2,
            borderTop:
              '1px solid #e2e8f0',
          }}
        >
          <Button
            size="small"
            onClick={resetAnalysis}
            disabled={
              analyzing ||
              uploading
            }
          >
            초기화
          </Button>

          <Box
            sx={{
              flex: 1,
            }}
          />

          <Typography
            sx={{
              mr: 0.6,
              color: '#475569',
              fontSize: '0.7rem',
              fontWeight: 900,
            }}
          >
            선택{' '}
            {selectedResults.length}개
          </Typography>

          <Button
            size="small"
            onClick={handleClose}
            disabled={
              analyzing ||
              uploading
            }
          >
            닫기
          </Button>

          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={handleUpload}
            disabled={
              analyzing ||
              uploading ||
              selectedResults.length ===
                0
            }
            sx={{
              fontWeight: 900,
            }}
          >
            업로드 실행
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
