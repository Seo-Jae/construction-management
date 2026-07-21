import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Switch,
  Tooltip,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import HistoryIcon from '@mui/icons-material/History';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ExcelJS from 'exceljs';
import { supabase } from '../supabaseClient';

const PAGE_SIZE = 1000;
const INSERT_CHUNK_SIZE = 400;

const TARGET_TITLE =
  '자재투입현황';

const EXPECTED_HEADERS = [
  ['A', '년'],
  ['B', '월'],
  ['C', '일'],
  ['D', '업체명'],
  ['E', '품명'],
  ['F', '규격'],
  ['G', '단위'],
  ['H', '수량'],
  ['I', '단가'],
  ['J', '공급가액'],
  ['K', '부가세'],
  ['L', '지출합계'],
];

const DATE_STATUS_OPTIONS = [
  {
    value: 'confirmed',
    label: '확정',
  },
  {
    value: 'unconfirmed',
    label: '미확정',
  },
  {
    value: 'carryover',
    label: '이월',
  },
  {
    value: 'scheduled',
    label: '입고예정',
  },
  {
    value: 'other',
    label: '기타',
  },
];

const DATE_STATUS_LABELS =
  DATE_STATUS_OPTIONS.reduce(
    (result, option) => ({
      ...result,
      [option.value]:
        option.label,
    }),
    {},
  );

const COMPACT_TABLE_SX = {
  tableLayout: 'auto',
  '& .MuiTableCell-root': {
    px: 0.65,
    py: 0.48,
    fontSize: '0.63rem',
    lineHeight: 1.22,
    borderRight:
      '1px solid #e2e8f0',
    verticalAlign: 'middle',
  },
  '& .MuiTableCell-head': {
    px: 0.65,
    py: 0.55,
    fontSize: '0.61rem',
    lineHeight: 1.15,
    fontWeight: 900,
    whiteSpace: 'nowrap',
  },
  '& .MuiTableCell-root:last-of-type': {
    borderRight: 'none',
  },
};

const normalizeText = (
  value,
) =>
  String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const normalizeComparable = (
  value,
) =>
  normalizeText(value)
    .replace(
      /[^0-9a-zA-Z가-힣]/g,
      '',
    )
    .toLowerCase();

const normalizeSearch = (
  value,
) =>
  normalizeText(value)
    .replace(/\s+/g, '')
    .toLowerCase();

const getCellRawValue = (
  cell,
) => {
  const value = cell?.value;

  if (
    value &&
    typeof value ===
      'object' &&
    !(value instanceof Date)
  ) {
    if (
      Array.isArray(
        value.richText,
      )
    ) {
      return value.richText
        .map(
          (part) =>
            part?.text || '',
        )
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

const getCellText = (
  worksheet,
  address,
) =>
  normalizeText(
    getCellRawValue(
      worksheet.getCell(
        address,
      ),
    ),
  );

const parseNumber = (
  value,
) => {
  const raw =
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(value)
      ? (
          value.result ??
          value.text ??
          ''
        )
      : value;

  if (
    raw === null ||
    raw === undefined ||
    raw === ''
  ) {
    return null;
  }

  if (
    typeof raw ===
      'number' &&
    Number.isFinite(raw)
  ) {
    return raw;
  }

  const text =
    normalizeText(raw)
      .replace(/,/g, '')
      .replace(/원/g, '');

  if (!text) {
    return null;
  }

  const number =
    Number(text);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
};

const roundAmount = (
  value,
) =>
  value === null ||
  value === undefined
    ? null
    : Math.round(
        (
          Number(value) +
          Number.EPSILON
        ) *
          10000,
      ) / 10000;

const inferDateStatus = (
  text,
) => {
  const normalized =
    normalizeText(text);

  if (
    normalized.includes(
      '이월',
    )
  ) {
    return 'carryover';
  }

  if (
    normalized.includes(
      '예정',
    )
  ) {
    return 'scheduled';
  }

  if (
    normalized.includes(
      '미정',
    ) ||
    normalized.includes(
      '미확정',
    )
  ) {
    return 'unconfirmed';
  }

  return 'other';
};

const parseDateParts = ({
  year,
  month,
  day,
}) => {
  const rawYearText =
    normalizeText(year);

  const rawMonthText =
    normalizeText(month);

  const rawDayText =
    normalizeText(day);

  const y =
    parseNumber(year);

  const m =
    parseNumber(month);

  const exactDay =
    parseNumber(day);

  const dayMatch =
    rawDayText.match(
      /(?:^|\D)(\d{1,2})(?:\D|$)/,
    );

  const extractedDay =
    exactDay !== null
      ? exactDay
      : dayMatch
        ? Number(
            dayMatch[1],
          )
        : null;

  const hasTextAnnotation =
    Boolean(rawDayText) &&
    exactDay === null;

  const hasAny =
    Boolean(
      rawYearText ||
      rawMonthText ||
      rawDayText,
    );

  const sourceYear =
    y === null
      ? null
      : y < 100
        ? 2000 + y
        : y;

  const sourceMonth =
    m === null
      ? null
      : m;

  const status =
    hasTextAnnotation
      ? inferDateStatus(
          rawDayText,
        )
      : 'confirmed';

  if (!hasAny) {
    return {
      hasAny: false,
      valid: false,
      value: null,
      sourceYear,
      sourceMonth,
      rawDayText,
      reviewRequired: true,
      status: '',
      suggestedStatus:
        'other',
      reason:
        '입고일이 비어 있습니다.',
    };
  }

  if (
    sourceYear === null ||
    sourceMonth === null
  ) {
    return {
      hasAny: true,
      valid: false,
      value: null,
      sourceYear,
      sourceMonth,
      rawDayText,
      reviewRequired: true,
      status: '',
      suggestedStatus:
        status === 'confirmed'
          ? 'other'
          : status,
      reason:
        '년 또는 월을 확인할 수 없습니다.',
    };
  }

  if (
    extractedDay === null
  ) {
    return {
      hasAny: true,
      valid: false,
      value: null,
      sourceYear,
      sourceMonth,
      rawDayText,
      reviewRequired: true,
      status: '',
      suggestedStatus:
        status === 'confirmed'
          ? 'other'
          : status,
      reason:
        rawDayText
          ? `일자 '${rawDayText}'를 확인해주세요.`
          : '일자가 비어 있습니다.',
    };
  }

  const date =
    new Date(
      sourceYear,
      sourceMonth - 1,
      extractedDay,
    );

  const validDate =
    date.getFullYear() ===
      sourceYear &&
    date.getMonth() ===
      sourceMonth - 1 &&
    date.getDate() ===
      extractedDay;

  const value =
    validDate
      ? [
          sourceYear,
          String(
            sourceMonth,
          ).padStart(2, '0'),
          String(
            extractedDay,
          ).padStart(2, '0'),
        ].join('-')
      : null;

  if (!validDate) {
    return {
      hasAny: true,
      valid: false,
      value: null,
      sourceYear,
      sourceMonth,
      rawDayText,
      reviewRequired: true,
      status: '',
      suggestedStatus:
        status === 'confirmed'
          ? 'other'
          : status,
      reason:
        `${sourceYear}-${String(sourceMonth).padStart(2, '0')}-${String(extractedDay).padStart(2, '0')}는 올바른 날짜가 아닙니다.`,
    };
  }

  return {
    hasAny: true,
    valid: true,
    value,
    sourceYear,
    sourceMonth,
    rawDayText,
    reviewRequired:
      hasTextAnnotation,
    status:
      hasTextAnnotation
        ? ''
        : status,
    suggestedStatus:
      hasTextAnnotation
        ? status
        : 'confirmed',
    reason:
      hasTextAnnotation
        ? `원본 일자 '${rawDayText}'를 확인해주세요.`
        : '',
  };
};

const getKoreaMonthKey =
  () => {
    const formatter =
      new Intl.DateTimeFormat(
        'en-CA',
        {
          timeZone:
            'Asia/Seoul',
          year: 'numeric',
          month: '2-digit',
        },
      );

    const parts = {};

    formatter
      .formatToParts(
        new Date(),
      )
      .forEach((part) => {
        if (
          part.type !==
          'literal'
        ) {
          parts[part.type] =
            part.value;
        }
      });

    return (
      `${parts.year}-` +
      `${parts.month}`
    );
  };

const getMonthRange = (
  monthKey,
) => {
  const [
    year,
    month,
  ] = String(monthKey)
    .split('-')
    .map(Number);

  const start =
    `${year}-` +
    `${String(month).padStart(
      2,
      '0',
    )}-01`;

  const lastDay =
    new Date(
      year,
      month,
      0,
    ).getDate();

  const end =
    `${year}-` +
    `${String(month).padStart(
      2,
      '0',
    )}-` +
    `${String(lastDay).padStart(
      2,
      '0',
    )}`;

  return {
    start,
    end,
    label:
      `${year}년 ${month}월`,
  };
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

const getRecordMonthKey = (
  record,
) => {
  if (
    record?.arrival_date
  ) {
    return String(
      record.arrival_date,
    ).slice(0, 7);
  }

  const year =
    Number(
      record?.source_year,
    );

  const month =
    Number(
      record?.source_month,
    );

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    month < 1 ||
    month > 12
  ) {
    return '';
  }

  return (
    `${year}-` +
    `${String(month).padStart(2, '0')}`
  );
};

const isRecordInMonth = (
  record,
  monthKey,
) =>
  getRecordMonthKey(
    record,
  ) === monthKey;

const isReviewComplete = (
  record,
) => {
  if (
    !record?.reviewRequired &&
    !record?.review_required
  ) {
    return true;
  }

  const status =
    record.arrivalDateStatus ??
    record.arrival_date_status;

  const includeInAmount =
    record.includeInAmount ??
    record.include_in_amount;

  const arrivalDate =
    record.arrivalDate ??
    record.arrival_date;

  const sourceYear =
    record.sourceYear ??
    record.source_year;

  const sourceMonth =
    record.sourceMonth ??
    record.source_month;

  const hasReferenceMonth =
    Boolean(
      Number(sourceYear) &&
      Number(sourceMonth),
    );

  return Boolean(
    status &&
    typeof includeInAmount ===
      'boolean' &&
    (
      arrivalDate ||
      (
        includeInAmount === false &&
        hasReferenceMonth
      )
    ),
  );
};

const createImportSummary = ({
  records,
  excludedRows,
  amountMismatchRows,
}) => {
  const arrivalDates =
    records
      .map(
        (record) =>
          record.arrivalDate,
      )
      .filter(Boolean)
      .sort();

  const summary =
    records.reduce(
      (
        result,
        record,
      ) => {
        const includeAmount =
          record.includeInAmount ===
          true;

        return {
          rowCount:
            result.rowCount + 1,
          pricedRowCount:
            result.pricedRowCount +
            (
              record.calculatedTotalAmount !==
              null
                ? 1
                : 0
            ),
          unpricedRowCount:
            result.unpricedRowCount +
            (
              record.calculatedTotalAmount ===
              null
                ? 1
                : 0
            ),
          excludedAmountCount:
            result.excludedAmountCount +
            (
              record.includeInAmount ===
              false
                ? 1
                : 0
            ),
          pendingReviewCount:
            result.pendingReviewCount +
            (
              isReviewComplete(
                record,
              )
                ? 0
                : 1
            ),
          reviewRowCount:
            result.reviewRowCount +
            (
              record.reviewRequired
                ? 1
                : 0
            ),
          quantity:
            result.quantity +
            (
              Number(
                record.quantity,
              ) || 0
            ),
          supplyAmount:
            result.supplyAmount +
            (
              includeAmount
                ? Number(
                    record.supplyAmount,
                  ) || 0
                : 0
            ),
          vatAmount:
            result.vatAmount +
            (
              includeAmount
                ? Number(
                    record.vatAmount,
                  ) || 0
                : 0
            ),
          calculatedTotalAmount:
            result.calculatedTotalAmount +
            (
              includeAmount
                ? Number(
                    record.calculatedTotalAmount,
                  ) || 0
                : 0
            ),
        };
      },
      {
        rowCount: 0,
        pricedRowCount: 0,
        unpricedRowCount: 0,
        excludedAmountCount: 0,
        pendingReviewCount: 0,
        reviewRowCount: 0,
        quantity: 0,
        supplyAmount: 0,
        vatAmount: 0,
        calculatedTotalAmount: 0,
      },
    );

  summary.minArrivalDate =
    arrivalDates[0] || '';

  summary.maxArrivalDate =
    arrivalDates[
      arrivalDates.length - 1
    ] || '';

  summary.amountMismatchCount =
    amountMismatchRows.length;

  summary.excludedRowCount =
    excludedRows.length;

  return summary;
};

const createFileHash =
  async (
    arrayBuffer,
    file,
  ) => {
    try {
      const digest =
        await crypto.subtle.digest(
          'SHA-256',
          arrayBuffer,
        );

      return Array.from(
        new Uint8Array(
          digest,
        ),
      )
        .map((byte) =>
          byte
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
    } catch {
      return [
        file?.name || '',
        file?.size || 0,
        file?.lastModified ||
          0,
      ].join('-');
    }
  };

const splitIntoChunks = (
  rows,
  size,
) => {
  const chunks = [];

  for (
    let index = 0;
    index < rows.length;
    index += size
  ) {
    chunks.push(
      rows.slice(
        index,
        index + size,
      ),
    );
  }

  return chunks;
};

const formatNumber = (
  value,
  maximumFractionDigits = 4,
) =>
  Number(
    value || 0,
  ).toLocaleString(
    'ko-KR',
    {
      maximumFractionDigits,
    },
  );

const formatMoney = (
  value,
) =>
  `${formatNumber(
    value,
    0,
  )}원`;

const formatShortDate = (
  value,
) => {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '-';
  }

  if (
    value instanceof Date &&
    !Number.isNaN(
      value.getTime(),
    )
  ) {
    return [
      String(
        value.getFullYear(),
      ).slice(-2),
      String(
        value.getMonth() + 1,
      ).padStart(2, '0'),
      String(
        value.getDate(),
      ).padStart(2, '0'),
    ].join('-');
  }

  const text =
    String(value).trim();

  const matched =
    text.match(
      /(\d{4})-(\d{1,2})-(\d{1,2})/,
    );

  if (!matched) {
    return text;
  }

  return [
    matched[1].slice(-2),
    String(
      matched[2],
    ).padStart(2, '0'),
    String(
      matched[3],
    ).padStart(2, '0'),
  ].join('-');
};

const tableVerticalBorderSx = {
  '& th, & td': {
    borderRight:
      '1px solid #e2e8f0',
  },
  '& th:last-of-type, & td:last-of-type':
    {
      borderRight: 'none',
    },
};

const safeFileName = (
  value,
) =>
  normalizeText(value)
    .replace(
      /[\\/:*?"<>|]/g,
      '_',
    )
    .replace(/\s+/g, '_');

const parseHeadOfficeWorkbook =
  async ({
    file,
    projectName,
  }) => {
    const arrayBuffer =
      await file.arrayBuffer();

    const fileHash =
      await createFileHash(
        arrayBuffer,
        file,
      );

    const workbook =
      new ExcelJS.Workbook();

    await workbook.xlsx.load(
      arrayBuffer,
    );

    const worksheet =
      workbook.worksheets.find(
        (sheet) =>
          normalizeComparable(
            getCellText(
              sheet,
              'A1',
            ),
          ).includes(
            normalizeComparable(
              TARGET_TITLE,
            ),
          ),
      ) ||
      workbook.worksheets.find(
        (sheet) =>
          normalizeComparable(
            getCellText(
              sheet,
              'D2',
            ),
          ).includes(
            normalizeComparable(
              '업체명',
            ),
          ) &&
          normalizeComparable(
            getCellText(
              sheet,
              'E2',
            ),
          ).includes(
            normalizeComparable(
              '품명',
            ),
          ),
      );

    if (!worksheet) {
      return {
        fileName:
          file.name,
        fileSize:
          file.size,
        fileHash,
        sheetName: '',
        records: [],
        blockingErrors: [
          '자재투입현황 원장 시트를 찾지 못했습니다.',
        ],
        warnings: [],
        excludedRows: [],
        amountMismatchRows: [],
        summary: null,
      };
    }

    const blockingErrors =
      [];

    const warnings = [];

    const excludedRows =
      [];

    const amountMismatchRows =
      [];

    EXPECTED_HEADERS.forEach(
      ([
        column,
        expected,
      ]) => {
        const actual =
          getCellText(
            worksheet,
            `${column}2`,
          );

        if (
          !normalizeComparable(
            actual,
          ).includes(
            normalizeComparable(
              expected,
            ),
          )
        ) {
          blockingErrors.push(
            `${column}2 제목이 '${expected}'가 아닙니다. 현재 값: ${actual || '(빈칸)'}`,
          );
        }
      },
    );

    if (
      blockingErrors.length >
      0
    ) {
      return {
        fileName:
          file.name,
        fileSize:
          file.size,
        fileHash,
        sheetName:
          worksheet.name,
        records: [],
        blockingErrors,
        warnings,
        excludedRows,
        amountMismatchRows,
        summary: null,
      };
    }

    const records = [];

    const maxRow =
      Math.max(
        worksheet.rowCount,
        2,
      );

    for (
      let row = 3;
      row <= maxRow;
      row += 1
    ) {
      const arrivalDateResult =
        parseDateParts({
          year:
            getCellRawValue(
              worksheet.getCell(
                `A${row}`,
              ),
            ),
          month:
            getCellRawValue(
              worksheet.getCell(
                `B${row}`,
              ),
            ),
          day:
            getCellRawValue(
              worksheet.getCell(
                `C${row}`,
              ),
            ),
        });

      const supplier =
        getCellText(
          worksheet,
          `D${row}`,
        );

      const itemName =
        getCellText(
          worksheet,
          `E${row}`,
        );

      const specification =
        getCellText(
          worksheet,
          `F${row}`,
        );

      const unit =
        getCellText(
          worksheet,
          `G${row}`,
        );

      const quantity =
        parseNumber(
          getCellRawValue(
            worksheet.getCell(
              `H${row}`,
            ),
          ),
        );

      const unitPrice =
        parseNumber(
          getCellRawValue(
            worksheet.getCell(
              `I${row}`,
            ),
          ),
        );

      const rawSupplyAmount =
        parseNumber(
          getCellRawValue(
            worksheet.getCell(
              `J${row}`,
            ),
          ),
        );

      const rawVatAmount =
        parseNumber(
          getCellRawValue(
            worksheet.getCell(
              `K${row}`,
            ),
          ),
        );

      const rawTotalAmount =
        parseNumber(
          getCellRawValue(
            worksheet.getCell(
              `L${row}`,
            ),
          ),
        );

      const note =
        getCellText(
          worksheet,
          `M${row}`,
        );

      const receiptStatus =
        getCellText(
          worksheet,
          `N${row}`,
        );

      const orderDateResult =
        parseDateParts({
          year:
            getCellRawValue(
              worksheet.getCell(
                `P${row}`,
              ),
            ),
          month:
            getCellRawValue(
              worksheet.getCell(
                `Q${row}`,
              ),
            ),
          day:
            getCellRawValue(
              worksheet.getCell(
                `R${row}`,
              ),
            ),
        });

      const auxiliaryS =
        getCellText(
          worksheet,
          `S${row}`,
        );

      const auxiliaryT =
        getCellText(
          worksheet,
          `T${row}`,
        );

      const auxiliaryU =
        getCellText(
          worksheet,
          `U${row}`,
        );

      const rowHasMeaningfulValue =
        Boolean(
          supplier ||
            itemName ||
            specification ||
            unit ||
            note ||
            receiptStatus ||
            arrivalDateResult.hasAny ||
            quantity !== null ||
            rawSupplyAmount !==
              null ||
            rawTotalAmount !==
              null,
        );

      if (
        !rowHasMeaningfulValue
      ) {
        continue;
      }

      /*
        품명이 없는 분류행이나 잔여값은 제외합니다.
        품명이 있는 실제 자재행은 날짜가 미정·이월이어도
        검토 대상으로 보존합니다.
      */
      if (!itemName) {
        excludedRows.push({
          row,
          reason:
            '품명이 없어 원장 데이터에서 제외했습니다.',
          supplier,
          itemName,
          specification,
        });

        continue;
      }

      if (
        orderDateResult.hasAny &&
        !orderDateResult.valid
      ) {
        warnings.push(
          `${worksheet.name} ${row}행의 발주일은 올바르지 않아 빈 값으로 저장합니다.`,
        );
      }

      let supplyAmount =
        rawSupplyAmount;

      if (
        supplyAmount === null &&
        quantity !== null &&
        unitPrice !== null
      ) {
        supplyAmount =
          roundAmount(
            quantity *
              unitPrice,
          );
      }

      let vatAmount =
        rawVatAmount;

      let calculatedTotalAmount =
        null;

      if (
        supplyAmount !== null &&
        vatAmount !== null
      ) {
        calculatedTotalAmount =
          roundAmount(
            supplyAmount +
              vatAmount,
          );
      } else if (
        rawTotalAmount !== null
      ) {
        calculatedTotalAmount =
          rawTotalAmount;
      }

      const amountMismatch =
        rawTotalAmount !==
          null &&
        calculatedTotalAmount !==
          null &&
        supplyAmount !==
          null &&
        vatAmount !==
          null &&
        Math.abs(
          rawTotalAmount -
            calculatedTotalAmount,
        ) > 0.5;

      if (amountMismatch) {
        amountMismatchRows.push({
          row,
          supplier,
          itemName,
          specification,
          rawTotalAmount,
          calculatedTotalAmount,
        });
      }

      records.push({
        sourceRow: row,
        arrivalDate:
          arrivalDateResult.value,
        sourceYear:
          arrivalDateResult.sourceYear,
        sourceMonth:
          arrivalDateResult.sourceMonth,
        sourceDayText:
          arrivalDateResult.rawDayText,
        arrivalDateStatus:
          arrivalDateResult.reviewRequired
            ? arrivalDateResult.status
            : 'confirmed',
        arrivalDateReason:
          arrivalDateResult.reason || '',
        reviewRequired:
          Boolean(
            arrivalDateResult.reviewRequired,
          ),
        includeInAmount:
          arrivalDateResult.reviewRequired
            ? null
            : true,
        orderDate:
          orderDateResult.valid
            ? orderDateResult.value
            : null,
        supplier,
        itemName,
        specification,
        unit,
        quantity,
        unitPrice,
        supplyAmount,
        vatAmount,
        rawTotalAmount,
        calculatedTotalAmount,
        amountMismatch,
        note,
        receiptStatus,
        rawMetadata: {
          projectNameFromApp:
            projectName,
          auxiliaryS,
          auxiliaryT,
          auxiliaryU,
          rawArrivalYear:
            normalizeText(
              getCellRawValue(
                worksheet.getCell(
                  `A${row}`,
                ),
              ),
            ),
          rawArrivalMonth:
            normalizeText(
              getCellRawValue(
                worksheet.getCell(
                  `B${row}`,
                ),
              ),
            ),
          rawArrivalDay:
            normalizeText(
              getCellRawValue(
                worksheet.getCell(
                  `C${row}`,
                ),
              ),
            ),
          suggestedArrivalDateStatus:
            arrivalDateResult.suggestedStatus ||
            '',
        },
      });
    }

    const summary =
      createImportSummary({
        records,
        excludedRows,
        amountMismatchRows,
      });

    return {
      fileName:
        file.name,
      fileSize:
        file.size,
      fileHash,
      sheetName:
        worksheet.name,
      records,
      blockingErrors,
      warnings,
      excludedRows,
      amountMismatchRows,
      reviewRows:
        records.filter(
          (record) =>
            record.reviewRequired,
        ),
      summary,
    };
  };

const aggregateItemRows = ({
  records,
  monthKey,
}) => {
  const map = new Map();

  records.forEach(
    (record) => {
      const recordMonth =
        getRecordMonthKey(
          record,
        );

      if (
        !recordMonth ||
        recordMonth > monthKey
      ) {
        return;
      }

      const key = [
        normalizeText(
          record.raw_item_name,
        ),
        normalizeText(
          record.raw_specification,
        ),
        normalizeText(
          record.raw_unit,
        ),
      ].join('|');

      if (!map.has(key)) {
        map.set(key, {
          itemName:
            normalizeText(
              record.raw_item_name,
            ),
          specification:
            normalizeText(
              record.raw_specification,
            ),
          unit:
            normalizeText(
              record.raw_unit,
            ),
          suppliers:
            new Set(),
          monthlyQuantity: 0,
          monthlyAmount: 0,
          cumulativeQuantity: 0,
          cumulativeAmount: 0,
          monthlyCount: 0,
          cumulativeCount: 0,
          latestArrivalDate:
            '',
          mismatchCount: 0,
          excludedAmountCount:
            0,
          reviewCount: 0,
        });
      }

      const target =
        map.get(key);

      if (record.supplier) {
        target.suppliers.add(
          record.supplier,
        );
      }

      const quantity =
        Number(
          record.quantity || 0,
        );

      const amountIncluded =
        record.include_in_amount !==
        false;

      const amount =
        amountIncluded
          ? Number(
              record.calculated_total_amount ||
                0,
            )
          : 0;

      target.cumulativeQuantity +=
        quantity;

      target.cumulativeAmount +=
        amount;

      target.cumulativeCount += 1;

      if (!amountIncluded) {
        target.excludedAmountCount +=
          1;
      }

      if (
        record.arrival_date_status !==
          'confirmed'
      ) {
        target.reviewCount += 1;
      }

      if (record.amount_mismatch) {
        target.mismatchCount += 1;
      }

      if (
        record.arrival_date &&
        (
          !target.latestArrivalDate ||
          record.arrival_date >
            target.latestArrivalDate
        )
      ) {
        target.latestArrivalDate =
          record.arrival_date;
      }

      if (recordMonth === monthKey) {
        target.monthlyQuantity +=
          quantity;

        target.monthlyAmount +=
          amount;

        target.monthlyCount += 1;
      }
    },
  );

  return Array.from(
    map.values(),
  )
    .map((row) => ({
      ...row,
      supplierText:
        Array.from(
          row.suppliers,
        ).join(', '),
    }))
    .sort(
      (first, second) =>
        first.itemName.localeCompare(
          second.itemName,
          'ko',
          {
            numeric: true,
          },
        ) ||
        first.specification.localeCompare(
          second.specification,
          'ko',
          {
            numeric: true,
          },
        ),
    );
};

const aggregateSupplierMonthlyRows = ({
  records,
  startMonth,
  endMonth,
  selectedSupplier,
}) => {
  const monthlyMap =
    new Map();

  (records || []).forEach(
    (record) => {
      const supplier =
        normalizeText(
          record.supplier,
        );

      const monthKey =
        getRecordMonthKey(
          record,
        );

      if (
        !supplier ||
        !monthKey ||
        monthKey > endMonth ||
        (
          selectedSupplier &&
          supplier !==
            selectedSupplier
        )
      ) {
        return;
      }

      const key =
        `${supplier}|${monthKey}`;

      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, {
          supplier,
          monthKey,
          monthlySupplyAmount: 0,
          monthlyVatAmount: 0,
          monthlyTotalAmount: 0,
          rowCount: 0,
          includedAmountCount: 0,
          excludedAmountCount: 0,
          mismatchCount: 0,
          reviewCount: 0,
        });
      }

      const target =
        monthlyMap.get(key);

      const includeAmount =
        record.include_in_amount !==
        false;

      target.rowCount += 1;

      if (includeAmount) {
        target.includedAmountCount +=
          1;

        target.monthlySupplyAmount +=
          Number(
            record.supply_amount ||
              0,
          );

        target.monthlyVatAmount +=
          Number(
            record.vat_amount ||
              0,
          );

        target.monthlyTotalAmount +=
          Number(
            record.calculated_total_amount ||
              0,
          );
      } else {
        target.excludedAmountCount +=
          1;
      }

      if (record.amount_mismatch) {
        target.mismatchCount +=
          1;
      }

      if (
        record.review_required ||
        record.arrival_date_status !==
          'confirmed'
      ) {
        target.reviewCount +=
          1;
      }
    },
  );

  const ascendingRows =
    Array.from(
      monthlyMap.values(),
    ).sort(
      (first, second) =>
        first.supplier.localeCompare(
          second.supplier,
          'ko',
          {
            numeric: true,
          },
        ) ||
        first.monthKey.localeCompare(
          second.monthKey,
        ),
    );

  const cumulativeMap =
    new Map();

  const result = [];

  ascendingRows.forEach(
    (row) => {
      const cumulative =
        cumulativeMap.get(
          row.supplier,
        ) || {
          supplyAmount: 0,
          vatAmount: 0,
          totalAmount: 0,
          rowCount: 0,
        };

      cumulative.supplyAmount +=
        row.monthlySupplyAmount;

      cumulative.vatAmount +=
        row.monthlyVatAmount;

      cumulative.totalAmount +=
        row.monthlyTotalAmount;

      cumulative.rowCount +=
        row.rowCount;

      cumulativeMap.set(
        row.supplier,
        cumulative,
      );

      if (
        row.monthKey >=
          startMonth &&
        row.monthKey <=
          endMonth
      ) {
        result.push({
          ...row,
          cumulativeSupplyAmount:
            cumulative.supplyAmount,
          cumulativeVatAmount:
            cumulative.vatAmount,
          cumulativeTotalAmount:
            cumulative.totalAmount,
          cumulativeRowCount:
            cumulative.rowCount,
        });
      }
    },
  );

  return result.sort(
    (first, second) =>
      second.monthKey.localeCompare(
        first.monthKey,
      ) ||
      first.supplier.localeCompare(
        second.supplier,
        'ko',
        {
          numeric: true,
        },
      ),
  );
};

export default function MaterialInputStatus({
  projectName = '',
}) {
  const fileInputRef =
    useRef(null);

  const [
    selectedMonth,
    setSelectedMonth,
  ] = useState(
    getKoreaMonthKey(),
  );

  const [
    supplierPeriodStart,
    setSupplierPeriodStart,
  ] = useState(
    getKoreaMonthKey(),
  );

  const [
    supplierPeriodEnd,
    setSupplierPeriodEnd,
  ] = useState(
    getKoreaMonthKey(),
  );

  const [
    activeImport,
    setActiveImport,
  ] = useState(null);

  const [
    records,
    setRecords,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    analyzing,
    setAnalyzing,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    analysis,
    setAnalysis,
  ] = useState(null);

  const [
    selectedFile,
    setSelectedFile,
  ] = useState(null);

  const [
    message,
    setMessage,
  ] = useState(null);

  const [
    searchText,
    setSearchText,
  ] = useState('');

  const [
    selectedSupplier,
    setSelectedSupplier,
  ] = useState('');

  const [
    tabValue,
    setTabValue,
  ] = useState(0);

  const [
    issueDialogOpen,
    setIssueDialogOpen,
  ] = useState(false);

  const [
    dateReviewDialogOpen,
    setDateReviewDialogOpen,
  ] = useState(false);

  const [
    selectedReviewRows,
    setSelectedReviewRows,
  ] = useState([]);

  const [
    batchReviewStatus,
    setBatchReviewStatus,
  ] = useState('');

  const [
    batchReviewDate,
    setBatchReviewDate,
  ] = useState('');

  const [
    batchIncludeInAmount,
    setBatchIncludeInAmount,
  ] = useState('');

  const [
    recordEditOpen,
    setRecordEditOpen,
  ] = useState(false);

  const [
    editingRecord,
    setEditingRecord,
  ] = useState(null);

  const [
    recordEditSaving,
    setRecordEditSaving,
  ] = useState(false);

  const [
    importHistoryOpen,
    setImportHistoryOpen,
  ] = useState(false);

  const [
    importHistory,
    setImportHistory,
  ] = useState([]);

  const monthRange =
    useMemo(
      () =>
        getMonthRange(
          selectedMonth,
        ),
      [selectedMonth],
    );

  const loadActiveSnapshot =
    useCallback(async () => {
      if (!projectName) {
        setActiveImport(
          null,
        );
        setRecords([]);
        return;
      }

      setLoading(true);

      try {
        const {
          data:
            importData,
          error:
            importError,
        } = await supabase
          .from(
            'material_input_imports',
          )
          .select('*')
          .eq(
            'project_name',
            projectName,
          )
          .eq(
            'is_active',
            true,
          )
          .maybeSingle();

        if (importError) {
          if (
            importError.code ===
            '42P01'
          ) {
            setMessage({
              severity:
                'error',
              text:
                '자재투입현황 테이블이 없습니다. 제공된 SQL을 먼저 실행해주세요.',
            });

            setActiveImport(
              null,
            );
            setRecords([]);

            return;
          }

          throw importError;
        }

        if (!importData) {
          setActiveImport(
            null,
          );
          setRecords([]);

          return;
        }

        const allRows = [];
        let from = 0;

        while (true) {
          const {
            data,
            error,
          } = await supabase
            .from(
              'material_input_records',
            )
            .select('*')
            .eq(
              'import_id',
              importData.id,
            )
            .order(
              'arrival_date',
              {
                ascending: true,
              },
            )
            .order(
              'source_row',
              {
                ascending: true,
              },
            )
            .range(
              from,
              from +
                PAGE_SIZE -
                1,
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

          from +=
            PAGE_SIZE;
        }

        setActiveImport(
          importData,
        );

        setRecords(
          allRows,
        );
      } catch (error) {
        console.error(
          '자재투입현황 조회 실패:',
          error,
        );

        setMessage({
          severity: 'error',
          text:
            error?.message ||
            '자재투입현황을 불러오지 못했습니다.',
        });
      } finally {
        setLoading(false);
      }
    }, [projectName]);

  useEffect(() => {
    loadActiveSnapshot();
  }, [loadActiveSnapshot]);

  const loadImportHistory =
    async () => {
      if (!projectName) {
        return;
      }

      try {
        const {
          data,
          error,
        } = await supabase
          .from(
            'material_input_imports',
          )
          .select('*')
          .eq(
            'project_name',
            projectName,
          )
          .order(
            'created_at',
            {
              ascending: false,
            },
          )
          .limit(30);

        if (error) {
          throw error;
        }

        setImportHistory(
          data || [],
        );

        setImportHistoryOpen(
          true,
        );
      } catch (error) {
        setMessage({
          severity: 'error',
          text:
            error?.message ||
            '업로드 이력을 불러오지 못했습니다.',
        });
      }
    };

  const allSupplierOptions =
    useMemo(
      () =>
        Array.from(
          new Set(
            records
              .map(
                (record) =>
                  record.supplier,
              )
              .filter(Boolean),
          ),
        ).sort(
          (first, second) =>
            first.localeCompare(
              second,
              'ko',
              {
                numeric: true,
              },
            ),
        ),
      [records],
    );

  const monthlySupplierOptions =
    useMemo(
      () =>
        Array.from(
          new Set(
            records
              .filter(
                (record) =>
                  isRecordInMonth(
                    record,
                    selectedMonth,
                  ),
              )
              .map(
                (record) =>
                  record.supplier,
              )
              .filter(Boolean),
          ),
        ).sort(
          (first, second) =>
            first.localeCompare(
              second,
              'ko',
              {
                numeric: true,
              },
            ),
        ),
      [
        records,
        selectedMonth,
      ],
    );

  const supplierOptions =
    tabValue === 0
      ? monthlySupplierOptions
      : allSupplierOptions;

  useEffect(() => {
    if (
      selectedSupplier &&
      !supplierOptions.includes(
        selectedSupplier,
      )
    ) {
      setSelectedSupplier('');
    }
  }, [
    selectedSupplier,
    supplierOptions,
  ]);

  const itemRows =
    useMemo(
      () =>
        aggregateItemRows({
          records,
          monthKey:
            selectedMonth,
        }),
      [
        records,
        selectedMonth,
      ],
    );

  const normalizedSearch =
    normalizeSearch(
      searchText,
    );

  const filteredItemRows =
    useMemo(
      () =>
        itemRows.filter(
          (row) => {
            const supplierMatched =
              !selectedSupplier ||
              row.suppliers.has(
                selectedSupplier,
              );

            const searchMatched =
              !normalizedSearch ||
              [
                row.itemName,
                row.specification,
                row.unit,
                row.supplierText,
              ].some(
                (value) =>
                  normalizeSearch(
                    value,
                  ).includes(
                    normalizedSearch,
                  ),
              );

            return (
              supplierMatched &&
              searchMatched
            );
          },
        ),
      [
        itemRows,
        normalizedSearch,
        selectedSupplier,
      ],
    );

  const filteredDetailRows =
    useMemo(
      () =>
        records.filter(
          (record) => {
            const inMonth =
              isRecordInMonth(
                record,
                selectedMonth,
              );

            const supplierMatched =
              !selectedSupplier ||
              record.supplier ===
                selectedSupplier;

            const searchMatched =
              !normalizedSearch ||
              [
                record.raw_item_name,
                record.raw_specification,
                record.raw_unit,
                record.supplier,
              ].some(
                (value) =>
                  normalizeSearch(
                    value,
                  ).includes(
                    normalizedSearch,
                  ),
              );

            return (
              inMonth &&
              supplierMatched &&
              searchMatched
            );
          },
        ),
      [
        normalizedSearch,
        records,
        selectedMonth,
        selectedSupplier,
      ],
    );

  const supplierMonthlyRows =
    useMemo(
      () =>
        aggregateSupplierMonthlyRows({
          records,
          startMonth:
            supplierPeriodStart,
          endMonth:
            supplierPeriodEnd,
          selectedSupplier,
        }),
      [
        records,
        selectedSupplier,
        supplierPeriodEnd,
        supplierPeriodStart,
      ],
    );

  const supplierPeriodSummary =
    useMemo(
      () => {
        const supplierSet =
          new Set();

        return supplierMonthlyRows.reduce(
          (
            result,
            row,
          ) => {
            supplierSet.add(
              row.supplier,
            );

            return {
              supplyAmount:
                result.supplyAmount +
                row.monthlySupplyAmount,
              vatAmount:
                result.vatAmount +
                row.monthlyVatAmount,
              totalAmount:
                result.totalAmount +
                row.monthlyTotalAmount,
              rowCount:
                result.rowCount +
                row.rowCount,
              excludedAmountCount:
                result.excludedAmountCount +
                row.excludedAmountCount,
              issueCount:
                result.issueCount +
                row.mismatchCount +
                row.reviewCount,
              supplierCount:
                supplierSet.size,
            };
          },
          {
            supplyAmount: 0,
            vatAmount: 0,
            totalAmount: 0,
            rowCount: 0,
            excludedAmountCount: 0,
            issueCount: 0,
            supplierCount: 0,
          },
        );
      },
      [supplierMonthlyRows],
    );

  const supplierPeriodLabel =
    supplierPeriodStart ===
      supplierPeriodEnd
      ? formatMonthLabel(
          supplierPeriodStart,
        )
      : `${formatMonthLabel(
          supplierPeriodStart,
        )} ~ ${formatMonthLabel(
          supplierPeriodEnd,
        )}`;

  const selectedSupplierMonthSummary =
    useMemo(
      () => {
        if (!selectedSupplier) {
          return null;
        }

        return records.reduce(
          (
            result,
            record,
          ) => {
            const inMonth =
              isRecordInMonth(
                record,
                selectedMonth,
              );

            if (
              !inMonth ||
              record.supplier !==
                selectedSupplier
            ) {
              return result;
            }

            return {
              supplyAmount:
                result.supplyAmount +
                (
                  record.include_in_amount ===
                  false
                    ? 0
                    : Number(
                        record.supply_amount,
                      ) || 0
                ),
              vatAmount:
                result.vatAmount +
                (
                  record.include_in_amount ===
                  false
                    ? 0
                    : Number(
                        record.vat_amount,
                      ) || 0
                ),
              totalAmount:
                result.totalAmount +
                (
                  record.include_in_amount ===
                  false
                    ? 0
                    : Number(
                        record.calculated_total_amount,
                      ) || 0
                ),
            };
          },
          {
            supplyAmount: 0,
            vatAmount: 0,
            totalAmount: 0,
          },
        );
      },
      [
        records,
        selectedMonth,
        selectedSupplier,
      ],
    );

  const monthSummary =
    useMemo(
      () =>
        records.reduce(
          (
            result,
            record,
          ) => {
            if (
              !isRecordInMonth(
                record,
                selectedMonth,
              )
            ) {
              return result;
            }

            const includeAmount =
              record.include_in_amount !==
              false;

            return {
              rowCount:
                result.rowCount + 1,
              pricedRowCount:
                result.pricedRowCount +
                (
                  record.calculated_total_amount !==
                  null
                    ? 1
                    : 0
                ),
              unpricedRowCount:
                result.unpricedRowCount +
                (
                  record.calculated_total_amount ===
                  null
                    ? 1
                    : 0
                ),
              excludedAmountCount:
                result.excludedAmountCount +
                (
                  includeAmount
                    ? 0
                    : 1
                ),
              reviewCount:
                result.reviewCount +
                (
                  record.arrival_date_status !==
                    'confirmed'
                    ? 1
                    : 0
                ),
              supplyAmount:
                result.supplyAmount +
                (
                  includeAmount
                    ? Number(
                        record.supply_amount,
                      ) || 0
                    : 0
                ),
              vatAmount:
                result.vatAmount +
                (
                  includeAmount
                    ? Number(
                        record.vat_amount,
                      ) || 0
                    : 0
                ),
              totalAmount:
                result.totalAmount +
                (
                  includeAmount
                    ? Number(
                        record.calculated_total_amount,
                      ) || 0
                    : 0
                ),
              mismatchCount:
                result.mismatchCount +
                (
                  record.amount_mismatch
                    ? 1
                    : 0
                ),
            };
          },
          {
            rowCount: 0,
            pricedRowCount: 0,
            unpricedRowCount: 0,
            excludedAmountCount: 0,
            reviewCount: 0,
            supplyAmount: 0,
            vatAmount: 0,
            totalAmount: 0,
            mismatchCount: 0,
          },
        ),
      [
        records,
        selectedMonth,
      ],
    );

  const pendingAnalysisReviewRows =
    useMemo(
      () =>
        analysis?.records?.filter(
          (record) =>
            !isReviewComplete(
              record,
            ),
        ) || [],
      [analysis],
    );

  const reviewRowIds =
    useMemo(
      () =>
        (
          analysis?.reviewRows ||
          []
        ).map(
          (record) =>
            record.sourceRow,
        ),
      [analysis],
    );

  const allReviewRowsSelected =
    reviewRowIds.length > 0 &&
    reviewRowIds.every(
      (sourceRow) =>
        selectedReviewRows.includes(
          sourceRow,
        ),
    );

  const someReviewRowsSelected =
    selectedReviewRows.length >
      0 &&
    !allReviewRowsSelected;

  const handleToggleReviewRow = (
    sourceRow,
  ) => {
    setSelectedReviewRows(
      (previous) =>
        previous.includes(
          sourceRow,
        )
          ? previous.filter(
              (value) =>
                value !==
                sourceRow,
            )
          : [
              ...previous,
              sourceRow,
            ],
    );
  };

  const handleToggleAllReviewRows =
    () => {
      setSelectedReviewRows(
        allReviewRowsSelected
          ? []
          : reviewRowIds,
      );
    };

  const resetBatchReviewFields =
    () => {
      setBatchReviewStatus('');
      setBatchReviewDate('');
      setBatchIncludeInAmount('');
    };

  const updateAnalysisRecord = (
    sourceRow,
    patch,
  ) => {
    setAnalysis(
      (previous) => {
        if (!previous) {
          return previous;
        }

        const nextRecords =
          previous.records.map(
            (record) =>
              record.sourceRow ===
              sourceRow
                ? {
                    ...record,
                    ...patch,
                  }
                : record,
          );

        return {
          ...previous,
          records: nextRecords,
          reviewRows:
            nextRecords.filter(
              (record) =>
                record.reviewRequired,
            ),
          summary:
            createImportSummary({
              records:
                nextRecords,
              excludedRows:
                previous.excludedRows,
              amountMismatchRows:
                previous.amountMismatchRows,
            }),
        };
      },
    );
  };

  const handleApplyBatchReview =
    () => {
      if (
        selectedReviewRows.length ===
        0
      ) {
        return;
      }

      const hasStatus =
        Boolean(
          batchReviewStatus,
        );

      const hasDate =
        Boolean(
          batchReviewDate,
        );

      const hasIncludeSetting =
        batchIncludeInAmount ===
          'include' ||
        batchIncludeInAmount ===
          'exclude';

      if (
        !hasStatus &&
        !hasDate &&
        !hasIncludeSetting
      ) {
        setMessage({
          severity: 'warning',
          text:
            '일괄 적용할 처리상태, 확정입고일 또는 금액 포함여부를 선택해주세요.',
        });

        return;
      }

      const selectedSet =
        new Set(
          selectedReviewRows,
        );

      setAnalysis(
        (previous) => {
          if (!previous) {
            return previous;
          }

          const nextRecords =
            previous.records.map(
              (record) => {
                if (
                  !selectedSet.has(
                    record.sourceRow,
                  )
                ) {
                  return record;
                }

                const patch = {};

                if (hasStatus) {
                  patch.arrivalDateStatus =
                    batchReviewStatus;

                  patch.arrivalDateReason =
                    DATE_STATUS_LABELS[
                      batchReviewStatus
                    ] || '';
                }

                if (hasDate) {
                  patch.arrivalDate =
                    batchReviewDate;

                  patch.sourceYear =
                    Number(
                      batchReviewDate.slice(
                        0,
                        4,
                      ),
                    );

                  patch.sourceMonth =
                    Number(
                      batchReviewDate.slice(
                        5,
                        7,
                      ),
                    );
                }

                if (
                  hasIncludeSetting
                ) {
                  patch.includeInAmount =
                    batchIncludeInAmount ===
                    'include';
                }

                return {
                  ...record,
                  ...patch,
                };
              },
            );

          return {
            ...previous,
            records: nextRecords,
            reviewRows:
              nextRecords.filter(
                (record) =>
                  record.reviewRequired,
              ),
            summary:
              createImportSummary({
                records:
                  nextRecords,
                excludedRows:
                  previous.excludedRows,
                amountMismatchRows:
                  previous.amountMismatchRows,
              }),
          };
        },
      );

      setMessage({
        severity: 'success',
        text:
          `${selectedReviewRows.length.toLocaleString()}개 행에 일괄 처리값을 적용했습니다.`,
      });

      setSelectedReviewRows([]);
      resetBatchReviewFields();
    };

  const handleFileChange =
    async (event) => {
      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }

      const lowerName =
        file.name.toLowerCase();

      if (
        !lowerName.endsWith(
          '.xlsx',
        ) &&
        !lowerName.endsWith(
          '.xlsm',
        )
      ) {
        setMessage({
          severity: 'error',
          text:
            '엑셀 파일(.xlsx 또는 .xlsm)만 업로드할 수 있습니다.',
        });

        return;
      }

      setAnalyzing(true);
      setAnalysis(null);
      setSelectedFile(file);
      setSelectedReviewRows([]);
      resetBatchReviewFields();
      setMessage(null);

      try {
        const result =
          await parseHeadOfficeWorkbook({
            file,
            projectName,
          });

        setAnalysis(
          result,
        );

        if (
          result.reviewRows.length >
          0
        ) {
          setDateReviewDialogOpen(
            true,
          );
        }

        if (
          result.blockingErrors.length >
          0
        ) {
          setMessage({
            severity: 'error',
            text:
              '본사 자재 원장 양식과 맞지 않습니다. 오류 내용을 확인해주세요.',
          });
        } else {
          setMessage({
            severity:
              'success',
            text:
              result.summary.reviewRowCount > 0
                ? `${result.summary.rowCount.toLocaleString()}건을 확인했습니다. 일자 확인 ${result.summary.reviewRowCount.toLocaleString()}건은 금액 포함여부를 반드시 결정해야 합니다.`
                : `${result.summary.rowCount.toLocaleString()}건을 확인했습니다. 제외 ${result.summary.excludedRowCount.toLocaleString()}건, 금액 불일치 ${result.summary.amountMismatchCount.toLocaleString()}건입니다.`,
          });
        }
      } catch (error) {
        console.error(
          '본사 자재 원장 분석 실패:',
          error,
        );

        setMessage({
          severity: 'error',
          text:
            error?.message ||
            '본사 자재 원장을 분석하지 못했습니다.',
        });
      } finally {
        setAnalyzing(false);

        if (
          fileInputRef.current
        ) {
          fileInputRef.current.value =
            '';
        }
      }
    };

  const handleSaveSnapshot =
    async () => {
      if (
        !analysis ||
        !selectedFile ||
        analysis.blockingErrors
          .length > 0 ||
        analysis.records.length ===
          0
      ) {
        return;
      }

      if (
        pendingAnalysisReviewRows.length >
        0
      ) {
        setDateReviewDialogOpen(
          true,
        );

        setMessage({
          severity: 'error',
          text:
            `일자 확인이 끝나지 않은 자료가 ${pendingAnalysisReviewRows.length.toLocaleString()}건 있습니다. 사유와 금액 포함여부를 먼저 결정해주세요.`,
        });

        return;
      }

      const confirmed =
        window.confirm(
          '현재 활성 자재투입현황을 이 파일의 내용으로 교체하시겠습니까?\n\n이전 업로드 자료는 이력으로 보관되고, 화면 집계는 새 파일을 기준으로 변경됩니다.',
        );

      if (!confirmed) {
        return;
      }

      setSaving(true);
      setMessage(null);

      let createdImportId =
        null;

      try {
        const {
          data: authData,
        } =
          await supabase.auth.getUser();

        const userEmail =
          authData?.user?.email ||
          null;

        const duplicateResult =
          await supabase
            .from(
              'material_input_imports',
            )
            .select('id')
            .eq(
              'project_name',
              projectName,
            )
            .eq(
              'source_file_hash',
              analysis.fileHash,
            )
            .maybeSingle();

        if (
          duplicateResult.error
        ) {
          throw duplicateResult.error;
        }

        if (
          duplicateResult.data
        ) {
          throw new Error(
            '동일한 파일이 이미 업로드되어 있습니다.',
          );
        }

        const {
          data:
            createdImport,
          error:
            importInsertError,
        } = await supabase
          .from(
            'material_input_imports',
          )
          .insert({
            project_name:
              projectName,
            source_file_name:
              analysis.fileName,
            source_file_hash:
              analysis.fileHash,
            source_sheet_name:
              analysis.sheetName,
            import_status:
              'uploading',
            is_active: false,
            row_count:
              analysis.summary
                .rowCount,
            excluded_row_count:
              analysis.summary
                .excludedRowCount,
            amount_mismatch_count:
              analysis.summary
                .amountMismatchCount,
            review_required_count:
              analysis.summary
                .reviewRowCount,
            min_arrival_date:
              analysis.summary
                .minArrivalDate ||
              null,
            max_arrival_date:
              analysis.summary
                .maxArrivalDate ||
              null,
            total_supply_amount:
              analysis.summary
                .supplyAmount,
            total_vat_amount:
              analysis.summary
                .vatAmount,
            total_amount:
              analysis.summary
                .calculatedTotalAmount,
            imported_by:
              userEmail,
            raw_metadata: {
              fileSize:
                analysis.fileSize,
              warnings:
                analysis.warnings,
              excludedRows:
                analysis.excludedRows,
              amountMismatchRows:
                analysis.amountMismatchRows,
            },
          })
          .select('id')
          .single();

        if (
          importInsertError
        ) {
          throw importInsertError;
        }

        createdImportId =
          createdImport.id;

        const payload =
          analysis.records.map(
            (record) => ({
              import_id:
                createdImport.id,
              project_name:
                projectName,
              source_type:
                'hq_ledger',
              source_row:
                record.sourceRow,
              arrival_date:
                record.arrivalDate ||
                null,
              source_year:
                record.sourceYear,
              source_month:
                record.sourceMonth,
              source_day_text:
                record.sourceDayText ||
                null,
              arrival_date_status:
                record.arrivalDateStatus ||
                'confirmed',
              arrival_date_reason:
                record.arrivalDateReason ||
                null,
              include_in_amount:
                record.includeInAmount ===
                true,
              review_required:
                Boolean(
                  record.reviewRequired,
                ),
              reviewed_by:
                record.reviewRequired
                  ? userEmail
                  : null,
              reviewed_at:
                record.reviewRequired
                  ? new Date().toISOString()
                  : null,
              order_date:
                record.orderDate,
              supplier:
                record.supplier ||
                null,
              raw_item_name:
                record.itemName,
              raw_specification:
                record.specification ||
                null,
              raw_unit:
                record.unit ||
                null,
              quantity:
                record.quantity,
              unit_price:
                record.unitPrice,
              supply_amount:
                record.supplyAmount,
              vat_amount:
                record.vatAmount,
              raw_total_amount:
                record.rawTotalAmount,
              calculated_total_amount:
                record.calculatedTotalAmount,
              amount_mismatch:
                record.amountMismatch,
              note:
                record.note ||
                null,
              receipt_status:
                record.receiptStatus ||
                null,
              match_status:
                'unmatched',
              raw_metadata:
                record.rawMetadata,
            }),
          );

        for (
          const chunk of
          splitIntoChunks(
            payload,
            INSERT_CHUNK_SIZE,
          )
        ) {
          const {
            error:
              recordInsertError,
          } = await supabase
            .from(
              'material_input_records',
            )
            .insert(
              chunk,
            );

          if (
            recordInsertError
          ) {
            throw recordInsertError;
          }
        }

        const {
          error:
            deactivateError,
        } = await supabase
          .from(
            'material_input_imports',
          )
          .update({
            is_active: false,
          })
          .eq(
            'project_name',
            projectName,
          )
          .eq(
            'is_active',
            true,
          );

        if (
          deactivateError
        ) {
          throw deactivateError;
        }

        const {
          error:
            activateError,
        } = await supabase
          .from(
            'material_input_imports',
          )
          .update({
            is_active: true,
            import_status:
              'ready',
          })
          .eq(
            'id',
            createdImport.id,
          );

        if (activateError) {
          throw activateError;
        }

        setMessage({
          severity:
            'success',
          text:
            `${analysis.summary.rowCount.toLocaleString()}건의 본사 자재 원장을 현재 현황으로 반영했습니다.`,
        });

        setAnalysis(null);
        setSelectedFile(null);

        await loadActiveSnapshot();
      } catch (error) {
        console.error(
          '본사 자재 원장 저장 실패:',
          error,
        );

        if (createdImportId) {
          await supabase
            .from(
              'material_input_imports',
            )
            .delete()
            .eq(
              'id',
              createdImportId,
            );
        }

        setMessage({
          severity: 'error',
          text:
            error?.code ===
              '42P01'
              ? '자재투입현황 테이블이 없습니다. 제공된 SQL을 먼저 실행해주세요.'
              : error?.message ||
                '본사 자재 원장을 저장하지 못했습니다.',
        });
      } finally {
        setSaving(false);
      }
    };

  const handleOpenRecordEdit = (
    record,
  ) => {
    setEditingRecord({
      ...record,
      arrival_date_status:
        record.arrival_date_status ||
        'confirmed',
      include_in_amount:
        record.include_in_amount !==
        false,
    });

    setRecordEditOpen(true);
  };

  const handleSaveRecordEdit =
    async () => {
      if (!editingRecord) {
        return;
      }

      if (
        editingRecord.include_in_amount &&
        !editingRecord.arrival_date
      ) {
        setMessage({
          severity: 'error',
          text:
            '금액을 포함하려면 입고일을 입력해야 합니다.',
        });
        return;
      }

      setRecordEditSaving(true);

      try {
        const {
          data: authData,
        } =
          await supabase.auth.getUser();

        const userEmail =
          authData?.user?.email ||
          null;

        const nextDate =
          editingRecord.arrival_date ||
          null;

        const nextYear =
          nextDate
            ? Number(
                nextDate.slice(0, 4),
              )
            : editingRecord.source_year;

        const nextMonth =
          nextDate
            ? Number(
                nextDate.slice(5, 7),
              )
            : editingRecord.source_month;

        const payload = {
          arrival_date: nextDate,
          source_year:
            nextYear || null,
          source_month:
            nextMonth || null,
          arrival_date_status:
            editingRecord.arrival_date_status,
          arrival_date_reason:
            editingRecord.arrival_date_reason ||
            null,
          include_in_amount:
            Boolean(
              editingRecord.include_in_amount,
            ),
          review_required:
            Boolean(
              editingRecord.review_required ||
              editingRecord.arrival_date_status !==
                'confirmed',
            ),
          reviewed_by:
            userEmail,
          reviewed_at:
            new Date().toISOString(),
        };

        const {
          data,
          error,
        } = await supabase
          .from(
            'material_input_records',
          )
          .update(payload)
          .eq(
            'id',
            editingRecord.id,
          )
          .select('*')
          .single();

        if (error) {
          throw error;
        }

        const nextRecords =
          records.map(
            (record) =>
              record.id ===
              data.id
                ? data
                : record,
          );

        setRecords(
          nextRecords,
        );

        if (activeImport?.id) {
          const includedRows =
            nextRecords.filter(
              (record) =>
                record.include_in_amount !==
                false,
            );

          const datedRows =
            nextRecords
              .map(
                (record) =>
                  record.arrival_date,
              )
              .filter(Boolean)
              .sort();

          const importTotals =
            includedRows.reduce(
              (
                result,
                record,
              ) => ({
                supplyAmount:
                  result.supplyAmount +
                  (
                    Number(
                      record.supply_amount,
                    ) || 0
                  ),
                vatAmount:
                  result.vatAmount +
                  (
                    Number(
                      record.vat_amount,
                    ) || 0
                  ),
                totalAmount:
                  result.totalAmount +
                  (
                    Number(
                      record.calculated_total_amount,
                    ) || 0
                  ),
              }),
              {
                supplyAmount: 0,
                vatAmount: 0,
                totalAmount: 0,
              },
            );

          const importPatch = {
            total_supply_amount:
              importTotals.supplyAmount,
            total_vat_amount:
              importTotals.vatAmount,
            total_amount:
              importTotals.totalAmount,
            min_arrival_date:
              datedRows[0] || null,
            max_arrival_date:
              datedRows[
                datedRows.length - 1
              ] || null,
            review_required_count:
              nextRecords.filter(
                (record) =>
                  record.review_required,
              ).length,
          };

          const {
            error:
              importUpdateError,
          } = await supabase
            .from(
              'material_input_imports',
            )
            .update(
              importPatch,
            )
            .eq(
              'id',
              activeImport.id,
            );

          if (importUpdateError) {
            throw importUpdateError;
          }

          setActiveImport(
            (previous) => ({
              ...previous,
              ...importPatch,
            }),
          );
        }

        setRecordEditOpen(false);
        setEditingRecord(null);

        setMessage({
          severity: 'success',
          text:
            '일자 상태와 금액 포함여부를 수정했습니다.',
        });
      } catch (error) {
        console.error(
          '자재투입 상세 수정 실패:',
          error,
        );

        setMessage({
          severity: 'error',
          text:
            error?.message ||
            '자재투입 상세를 수정하지 못했습니다.',
        });
      } finally {
        setRecordEditSaving(false);
      }
    };

  const handleExcelDownload =
    async () => {
      const workbook =
        new ExcelJS.Workbook();

      let worksheet;
      let downloadSuffix;

      if (tabValue === 1) {
        worksheet =
          workbook.addWorksheet(
            '업체별 월누계',
          );

        worksheet.addRow([
          '업체',
          '기준월',
          '월 공급가액',
          '월 부가세',
          '월 재계산 합계',
          '누계 공급가액',
          '누계 부가세',
          '누계 재계산 합계',
          '입고건수',
          '금액제외',
          '확인필요',
        ]);

        supplierMonthlyRows.forEach(
          (row) => {
            worksheet.addRow([
              row.supplier,
              row.monthKey,
              row.monthlySupplyAmount,
              row.monthlyVatAmount,
              row.monthlyTotalAmount,
              row.cumulativeSupplyAmount,
              row.cumulativeVatAmount,
              row.cumulativeTotalAmount,
              row.rowCount,
              row.excludedAmountCount,
              row.mismatchCount +
                row.reviewCount,
            ]);
          },
        );

        worksheet.columns.forEach(
          (
            column,
            index,
          ) => {
            column.width =
              [
                24,
                12,
                18,
                16,
                18,
                18,
                16,
                18,
                12,
                12,
                12,
              ][index] || 14;
          },
        );

        [
          3,
          4,
          5,
          6,
          7,
          8,
        ].forEach(
          (columnNumber) => {
            worksheet.getColumn(
              columnNumber,
            ).numFmt =
              '#,##0';
          },
        );

        downloadSuffix =
          `업체별월누계_${supplierPeriodStart}_${supplierPeriodEnd}`;
      } else {
        worksheet =
          workbook.addWorksheet(
            '품목별 집계',
          );

        worksheet.addRow([
          '품명',
          '규격',
          '단위',
          '업체',
          `${monthRange.label} 수량`,
          `${monthRange.label} 금액`,
          '누계수량',
          '누계금액',
          '최근입고일',
          '금액오류건수',
        ]);

        filteredItemRows.forEach(
          (row) => {
            worksheet.addRow([
              row.itemName,
              row.specification,
              row.unit,
              row.supplierText,
              row.monthlyQuantity,
              row.monthlyAmount,
              row.cumulativeQuantity,
              row.cumulativeAmount,
              row.latestArrivalDate,
              row.mismatchCount,
            ]);
          },
        );

        worksheet.columns.forEach(
          (
            column,
            index,
          ) => {
            column.width =
              [
                28,
                30,
                10,
                24,
                16,
                18,
                16,
                18,
                14,
                14,
              ][index] || 14;
          },
        );

        worksheet.getColumn(
          6,
        ).numFmt =
          '#,##0';

        worksheet.getColumn(
          8,
        ).numFmt =
          '#,##0';

        downloadSuffix =
          `품목별월누계_${selectedMonth}`;
      }

      worksheet.getRow(
        1,
      ).font = {
        bold: true,
      };

      worksheet.views = [
        {
          state: 'frozen',
          ySplit: 1,
        },
      ];

      const buffer =
        await workbook.xlsx.writeBuffer();

      const blob =
        new Blob(
          [buffer],
          {
            type:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        );

      const url =
        URL.createObjectURL(
          blob,
        );

      const link =
        document.createElement(
          'a',
        );

      link.href = url;

      link.download =
        `자재투입현황_${safeFileName(
          projectName,
        )}_${downloadSuffix}.xlsx`;

      document.body.appendChild(
        link,
      );

      link.click();

      document.body.removeChild(
        link,
      );

      URL.revokeObjectURL(
        url,
      );
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
          p: 1.2,
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'space-between',
          gap: 1,
          borderColor:
            '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Box>
          <Typography
            sx={{
              color: '#1e293b',
              fontSize: '1rem',
              fontWeight: 900,
            }}
          >
            자재투입현황
          </Typography>

          <Typography
            sx={{
              mt: 0.15,
              color: '#64748b',
              fontSize:
                '0.7rem',
            }}
          >
            본사 자재부 원장을 업로드하고 월별 금액과 품목별 누계수량을 조회합니다.
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.7,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept=".xlsx,.xlsm"
            onChange={
              handleFileChange
            }
          />

          <Button
            variant="contained"
            startIcon={
              analyzing
                ? (
                  <CircularProgress
                    size={16}
                    color="inherit"
                  />
                )
                : (
                  <UploadFileIcon />
                )
            }
            onClick={() =>
              fileInputRef.current?.click()
            }
            disabled={
              analyzing ||
              saving ||
              !projectName
            }
            sx={{
              fontWeight: 900,
            }}
          >
            본사 자료 업로드
          </Button>

          <Button
            variant="outlined"
            startIcon={
              <HistoryIcon />
            }
            onClick={
              loadImportHistory
            }
            disabled={
              !projectName
            }
          >
            업로드 이력
          </Button>

          <Button
            variant="outlined"
            startIcon={
              loading
                ? (
                  <CircularProgress
                    size={15}
                  />
                )
                : (
                  <RefreshIcon />
                )
            }
            onClick={
              loadActiveSnapshot
            }
            disabled={
              loading
            }
          >
            새로고침
          </Button>
        </Box>
      </Paper>

      {(
        loading ||
        analyzing ||
        saving
      ) && (
        <LinearProgress />
      )}

      {message && (
        <Alert
          severity={
            message.severity
          }
          onClose={() =>
            setMessage(null)
          }
        >
          {message.text}
        </Alert>
      )}

      {activeImport && (
        <Alert
          severity="info"
          sx={{
            py: 0.2,
            '& .MuiAlert-message':
              {
                fontSize:
                  '0.68rem',
              },
          }}
        >
          현재 자료: {activeImport.source_file_name}
          {' · '}
          {activeImport.row_count?.toLocaleString()}건
          {' · '}
          입고일 {activeImport.min_arrival_date || '-'} ~ {activeImport.max_arrival_date || '-'}
          {' · '}
          업로드 {new Date(activeImport.created_at).toLocaleString('ko-KR')}
        </Alert>
      )}

      {analysis && (
        <Paper
          variant="outlined"
          sx={{
            p: 1.2,
            borderColor:
              analysis.blockingErrors
                .length > 0
                ? '#fca5a5'
                : '#cbd5e1',
            boxShadow: 'none',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems:
                'center',
              justifyContent:
                'space-between',
              gap: 1,
            }}
          >
            <Box>
              <Typography
                sx={{
                  color:
                    '#1e293b',
                  fontSize:
                    '0.82rem',
                  fontWeight: 900,
                }}
              >
                본사 자재 원장 검토
              </Typography>

              <Typography
                sx={{
                  mt: 0.1,
                  color:
                    '#64748b',
                  fontSize:
                    '0.66rem',
                }}
              >
                {analysis.fileName}
                {' · '}
                {analysis.sheetName || '시트 없음'}
              </Typography>
            </Box>

            {analysis.summary && (
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.5,
                  flexWrap:
                    'wrap',
                  justifyContent:
                    'flex-end',
                }}
              >
                <Chip
                  size="small"
                  label={`저장 ${analysis.summary.rowCount.toLocaleString()}건`}
                />

                <Chip
                  size="small"
                  color="success"
                  label={`총액 ${formatMoney(analysis.summary.calculatedTotalAmount)}`}
                />

                <Chip
                  size="small"
                  color="warning"
                  label={`제외 ${analysis.summary.excludedRowCount.toLocaleString()}건`}
                />

                <Chip
                  size="small"
                  color={
                    analysis.summary.pendingReviewCount >
                    0
                      ? 'error'
                      : 'success'
                  }
                  icon={
                    analysis.summary.reviewRowCount >
                    0
                      ? (
                        <WarningAmberOutlinedIcon />
                      )
                      : undefined
                  }
                  label={`일자확인 ${analysis.summary.reviewRowCount.toLocaleString()}건`}
                  onClick={
                    analysis.summary.reviewRowCount >
                    0
                      ? () =>
                          setDateReviewDialogOpen(
                            true,
                          )
                      : undefined
                  }
                />

                <Chip
                  size="small"
                  color="error"
                  label={`금액불일치 ${analysis.summary.amountMismatchCount.toLocaleString()}건`}
                />
              </Box>
            )}
          </Box>

          {analysis.blockingErrors.map(
            (error, index) => (
              <Alert
                key={`blocking-${index}`}
                severity="error"
                sx={{ mt: 0.7 }}
              >
                {error}
              </Alert>
            ),
          )}

          {analysis.summary && (
            <>
              <Box
                sx={{
                  mt: 1,
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(5, minmax(0, 1fr))',
                  gap: 0.7,
                }}
              >
                {[
                  [
                    '자료기간',
                    `${analysis.summary.minArrivalDate} ~ ${analysis.summary.maxArrivalDate}`,
                  ],
                  [
                    '공급가액',
                    formatMoney(
                      analysis.summary.supplyAmount,
                    ),
                  ],
                  [
                    '부가세',
                    formatMoney(
                      analysis.summary.vatAmount,
                    ),
                  ],
                  [
                    '재계산 총액',
                    formatMoney(
                      analysis.summary.calculatedTotalAmount,
                    ),
                  ],
                  [
                    '금액 없는 행',
                    `${analysis.summary.unpricedRowCount.toLocaleString()}건`,
                  ],
                ].map(
                  ([
                    label,
                    value,
                  ]) => (
                    <Paper
                      key={label}
                      variant="outlined"
                      sx={{
                        px: 1,
                        py: 0.8,
                        borderColor:
                          '#dbe3ee',
                        boxShadow:
                          'none',
                      }}
                    >
                      <Typography
                        sx={{
                          color:
                            '#64748b',
                          fontSize:
                            '0.62rem',
                          fontWeight:
                            800,
                        }}
                      >
                        {label}
                      </Typography>

                      <Typography
                        sx={{
                          mt: 0.15,
                          color:
                            '#0f172a',
                          fontSize:
                            '0.76rem',
                          fontWeight:
                            900,
                        }}
                      >
                        {value}
                      </Typography>
                    </Paper>
                  ),
                )}
              </Box>

              <Box
                sx={{
                  mt: 1,
                  display: 'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'space-between',
                  gap: 1,
                }}
              >
                <Button
                  variant="outlined"
                  color={
                    analysis.summary.amountMismatchCount >
                      0 ||
                    analysis.summary.excludedRowCount >
                      0
                      ? 'warning'
                      : 'primary'
                  }
                  onClick={() =>
                    setIssueDialogOpen(
                      true,
                    )
                  }
                >
                  제외·오류 행 확인
                </Button>

                <Button
                  variant="contained"
                  color="primary"
                  startIcon={
                    saving
                      ? (
                        <CircularProgress
                          size={16}
                          color="inherit"
                        />
                      )
                      : (
                        <SaveIcon />
                      )
                  }
                  onClick={
                    handleSaveSnapshot
                  }
                  disabled={
                    saving ||
                    analysis.blockingErrors
                      .length > 0 ||
                    analysis.records
                      .length === 0 ||
                    analysis.summary
                      .pendingReviewCount > 0
                  }
                  sx={{
                    fontWeight: 900,
                  }}
                >
                  이 파일을 현재 현황으로 반영
                </Button>
              </Box>
            </>
          )}
        </Paper>
      )}

      <Paper
        variant="outlined"
        sx={{
          p: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'space-between',
          gap: 1,
          borderColor:
            '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.7,
            flexWrap: 'wrap',
          }}
        >
          {tabValue === 1 ? (
            <>
              <TextField
                label="시작 월"
                type="month"
                size="small"
                value={
                  supplierPeriodStart
                }
                onChange={(
                  event,
                ) => {
                  const value =
                    event.target.value;

                  setSupplierPeriodStart(
                    value,
                  );

                  if (
                    value >
                    supplierPeriodEnd
                  ) {
                    setSupplierPeriodEnd(
                      value,
                    );
                  }
                }}
                InputLabelProps={{
                  shrink: true,
                }}
                sx={{
                  width: 150,
                }}
              />

              <TextField
                label="종료 월"
                type="month"
                size="small"
                value={
                  supplierPeriodEnd
                }
                onChange={(
                  event,
                ) => {
                  const value =
                    event.target.value;

                  setSupplierPeriodEnd(
                    value,
                  );

                  if (
                    value <
                    supplierPeriodStart
                  ) {
                    setSupplierPeriodStart(
                      value,
                    );
                  }
                }}
                InputLabelProps={{
                  shrink: true,
                }}
                sx={{
                  width: 150,
                }}
              />

              <Autocomplete
                freeSolo
                options={
                  allSupplierOptions
                }
                inputValue={
                  selectedSupplier
                }
                onInputChange={(
                  _event,
                  value,
                ) =>
                  setSelectedSupplier(
                    value,
                  )
                }
                onChange={(
                  _event,
                  value,
                ) =>
                  setSelectedSupplier(
                    value || '',
                  )
                }
                sx={{
                  width: 220,
                }}
                renderInput={(
                  params,
                ) => (
                  <TextField
                    {...params}
                    label="업체 검색"
                    placeholder="전체 업체"
                    size="small"
                  />
                )}
              />
            </>
          ) : (
            <>
              <TextField
                label="조회 월"
                type="month"
                size="small"
                value={
                  selectedMonth
                }
                onChange={(
                  event,
                ) =>
                  setSelectedMonth(
                    event.target.value,
                  )
                }
                InputLabelProps={{
                  shrink: true,
                }}
                sx={{
                  width: 150,
                }}
              />

              <Autocomplete
                freeSolo
                options={
                  supplierOptions
                }
                inputValue={
                  selectedSupplier
                }
                onInputChange={(
                  _event,
                  value,
                ) =>
                  setSelectedSupplier(
                    value,
                  )
                }
                onChange={(
                  _event,
                  value,
                ) =>
                  setSelectedSupplier(
                    value || '',
                  )
                }
                sx={{
                  width: 190,
                }}
                renderInput={(
                  params,
                ) => (
                  <TextField
                    {...params}
                    label={
                      tabValue === 0
                        ? '해당 월 입고업체'
                        : '전체 업체 검색'
                    }
                    placeholder={
                      tabValue === 0
                        ? `${monthRange.label} 입고업체`
                        : '전체 누계 업체'
                    }
                    size="small"
                  />
                )}
              />

              <TextField
                label="품명·규격 검색"
                size="small"
                value={
                  searchText
                }
                onChange={(
                  event,
                ) =>
                  setSearchText(
                    event.target.value,
                  )
                }
                placeholder="예: 스터드"
                sx={{
                  width: 230,
                }}
              />
            </>
          )}
        </Box>

        <Button
          variant="contained"
          color="success"
          startIcon={
            <DownloadIcon />
          }
          onClick={
            handleExcelDownload
          }
          disabled={
            tabValue === 1
              ? supplierMonthlyRows.length ===
                0
              : filteredItemRows.length ===
                0
          }
        >
          {tabValue === 1
            ? '업체 월누계 다운로드'
            : '집계 엑셀 다운로드'}
        </Button>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(5, minmax(0, 1fr))',
          gap: 0.8,
        }}
      >
        {(tabValue === 1
          ? [
              [
                `${supplierPeriodLabel} 지출합계`,
                formatMoney(
                  supplierPeriodSummary
                    .totalAmount,
                ),
              ],
              [
                '공급가액',
                formatMoney(
                  supplierPeriodSummary
                    .supplyAmount,
                ),
              ],
              [
                '부가세',
                formatMoney(
                  supplierPeriodSummary
                    .vatAmount,
                ),
              ],
              [
                '조회 업체',
                `${supplierPeriodSummary.supplierCount.toLocaleString()}개`,
              ],
              [
                '입고 내역',
                `${supplierPeriodSummary.rowCount.toLocaleString()}건`,
              ],
            ]
          : [
              [
                `${monthRange.label} 지출합계`,
                formatMoney(
                  monthSummary.totalAmount,
                ),
              ],
              [
                '공급가액',
                formatMoney(
                  monthSummary.supplyAmount,
                ),
              ],
              [
                '부가세',
                formatMoney(
                  monthSummary.vatAmount,
                ),
              ],
              [
                '입고 내역',
                `${monthSummary.rowCount.toLocaleString()}건`,
              ],
              [
                '금액 확인 필요',
                `${(
                  monthSummary.unpricedRowCount +
                  monthSummary.mismatchCount +
                  monthSummary.reviewCount +
                  monthSummary.excludedAmountCount
                ).toLocaleString()}건`,
              ],
            ]
        ).map(
          ([
            label,
            value,
          ]) => (
            <Paper
              key={label}
              variant="outlined"
              sx={{
                px: 1.2,
                py: 0.9,
                borderColor:
                  '#cbd5e1',
                boxShadow:
                  'none',
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
                  mt: 0.2,
                  color:
                    '#0f172a',
                  fontSize:
                    '1.02rem',
                  fontWeight: 900,
                }}
              >
                {value}
              </Typography>
            </Paper>
          ),
        )}
      </Box>

      <Paper
        variant="outlined"
        sx={{
          flexGrow: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection:
            'column',
          overflow: 'hidden',
          borderColor:
            '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        <Tabs
          value={tabValue}
          onChange={(
            _event,
            value,
          ) =>
            setTabValue(value)
          }
          sx={{
            minHeight: 38,
            borderBottom:
              '1px solid #e2e8f0',
            '& .MuiTab-root':
              {
                minHeight: 38,
                py: 0,
                fontSize:
                  '0.72rem',
                fontWeight:
                  800,
              },
          }}
        >
          <Tab label="월 원본 상세" />
          <Tab label="업체별 월·누계" />
          <Tab label="품목별 월·누계" />
        </Tabs>

        <Box
          sx={{
            flexGrow: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {tabValue === 1 && (
            <TableContainer
              sx={{
                height: '100%',
                overflow: 'auto',
              }}
            >
              <Table
                stickyHeader
                size="small"
                sx={{
                  ...tableVerticalBorderSx,
                  ...COMPACT_TABLE_SX,
                }}
              >
                <TableHead>
                  <TableRow>
                    {[
                      '업체',
                      '기준월',
                      '월 공급가액',
                      '월 부가세',
                      '월 재계산 합계',
                      '누계 공급가액',
                      '누계 부가세',
                      '누계 재계산 합계',
                      '입고건수',
                      '금액제외',
                      '확인필요',
                    ].map(
                      (
                        header,
                        index,
                      ) => (
                        <TableCell
                          key={header}
                          align={
                            index >= 2
                              ? 'right'
                              : 'left'
                          }
                          sx={{
                            bgcolor:
                              '#f8fafc',
                            fontWeight:
                              900,
                            whiteSpace:
                              'nowrap',
                            ...(
                              index === 0
                                ? {
                                    minWidth: 180,
                                  }
                                : index === 1
                                  ? {
                                      width: 92,
                                      minWidth: 92,
                                    }
                                  : index >= 2 &&
                                      index <= 7
                                    ? {
                                        minWidth: 105,
                                      }
                                    : {
                                        minWidth: 72,
                                      }
                            ),
                          }}
                        >
                          {header}
                        </TableCell>
                      ),
                    )}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {supplierMonthlyRows.map(
                    (row) => (
                      <TableRow
                        key={`${row.supplier}|${row.monthKey}`}
                        hover
                        sx={{
                          bgcolor:
                            row.excludedAmountCount >
                              0 ||
                            row.reviewCount > 0
                              ? '#fffbea'
                              : row.mismatchCount >
                                  0
                                ? '#fff7ed'
                                : 'inherit',
                        }}
                      >
                        <TableCell
                          sx={{
                            minWidth: 180,
                            fontWeight: 800,
                          }}
                        >
                          {row.supplier}
                        </TableCell>

                        <TableCell
                          sx={{
                            width: 92,
                            minWidth: 92,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {formatMonthLabel(
                            row.monthKey,
                          )}
                        </TableCell>

                        <TableCell align="right">
                          {formatMoney(
                            row.monthlySupplyAmount,
                          )}
                        </TableCell>

                        <TableCell align="right">
                          {formatMoney(
                            row.monthlyVatAmount,
                          )}
                        </TableCell>

                        <TableCell
                          align="right"
                          sx={{
                            color:
                              '#1d4ed8',
                            fontWeight: 900,
                          }}
                        >
                          {formatMoney(
                            row.monthlyTotalAmount,
                          )}
                        </TableCell>

                        <TableCell align="right">
                          {formatMoney(
                            row.cumulativeSupplyAmount,
                          )}
                        </TableCell>

                        <TableCell align="right">
                          {formatMoney(
                            row.cumulativeVatAmount,
                          )}
                        </TableCell>

                        <TableCell
                          align="right"
                          sx={{
                            fontWeight: 900,
                          }}
                        >
                          {formatMoney(
                            row.cumulativeTotalAmount,
                          )}
                        </TableCell>

                        <TableCell align="right">
                          {row.rowCount.toLocaleString()}
                        </TableCell>

                        <TableCell align="right">
                          {row.excludedAmountCount >
                          0 ? (
                            <Chip
                              size="small"
                              color="default"
                              label={
                                row.excludedAmountCount
                              }
                            />
                          ) : (
                            '-'
                          )}
                        </TableCell>

                        <TableCell align="right">
                          {row.mismatchCount +
                            row.reviewCount >
                          0 ? (
                            <Chip
                              size="small"
                              color="warning"
                              label={
                                row.mismatchCount +
                                row.reviewCount
                              }
                            />
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ),
                  )}

                  {!loading &&
                    supplierMonthlyRows.length ===
                      0 && (
                    <TableRow>
                      <TableCell
                        colSpan={11}
                        align="center"
                        sx={{
                          py: 5,
                          color:
                            '#94a3b8',
                        }}
                      >
                        선택한 업체와 기간에 해당하는 자료가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {tabValue === 2 && (
            <TableContainer
              sx={{
                height: '100%',
                overflow: 'auto',
              }}
            >
              <Table
                stickyHeader
                size="small"
                sx={{
                  ...tableVerticalBorderSx,
                  ...COMPACT_TABLE_SX,
                }}
              >
                <TableHead>
                  <TableRow>
                    {[
                      '품명',
                      '규격',
                      '단위',
                      '업체',
                      `${monthRange.label} 수량`,
                      `${monthRange.label} 금액`,
                      '누계수량',
                      '누계금액',
                      '최근입고일',
                      '오류',
                    ].map(
                      (
                        header,
                        index,
                      ) => (
                        <TableCell
                          key={header}
                          align={
                            index >=
                              4 &&
                            index <= 7
                              ? 'right'
                              : 'left'
                          }
                          sx={{
                            bgcolor:
                              '#f8fafc',
                            fontWeight:
                              900,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {header}
                        </TableCell>
                      ),
                    )}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {filteredItemRows.map(
                    (row) => (
                      <TableRow
                        key={[
                          row.itemName,
                          row.specification,
                          row.unit,
                        ].join('|')}
                        hover
                      >
                        <TableCell
                          sx={{
                            minWidth: 160,
                          }}
                        >
                          {row.itemName}
                        </TableCell>

                        <TableCell
                          sx={{
                            minWidth: 180,
                          }}
                        >
                          {row.specification ||
                            '-'}
                        </TableCell>

                        <TableCell>
                          {row.unit ||
                            '-'}
                        </TableCell>

                        <TableCell
                          sx={{
                            minWidth: 130,
                          }}
                        >
                          {row.supplierText ||
                            '-'}
                        </TableCell>

                        <TableCell align="right">
                          {formatNumber(
                            row.monthlyQuantity,
                          )}
                        </TableCell>

                        <TableCell
                          align="right"
                          sx={{
                            color:
                              row.monthlyAmount !==
                              0
                                ? '#1d4ed8'
                                : '#94a3b8',
                            fontWeight: 900,
                          }}
                        >
                          {formatMoney(
                            row.monthlyAmount,
                          )}
                        </TableCell>

                        <TableCell align="right">
                          {formatNumber(
                            row.cumulativeQuantity,
                          )}
                        </TableCell>

                        <TableCell
                          align="right"
                          sx={{
                            fontWeight: 900,
                          }}
                        >
                          {formatMoney(
                            row.cumulativeAmount,
                          )}
                        </TableCell>

                        <TableCell
                          sx={{
                            width: 82,
                            minWidth: 82,
                            maxWidth: 82,
                            whiteSpace:
                              'nowrap',
                            wordBreak:
                              'keep-all',
                            fontVariantNumeric:
                              'tabular-nums',
                          }}
                        >
                          {formatShortDate(
                            row.latestArrivalDate,
                          )}
                        </TableCell>

                        <TableCell>
                          {row.mismatchCount >
                          0 ? (
                            <Chip
                              size="small"
                              color="error"
                              label={
                                row.mismatchCount
                              }
                            />
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ),
                  )}

                  {!loading &&
                    filteredItemRows.length ===
                      0 && (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        align="center"
                        sx={{
                          py: 5,
                          color:
                            '#94a3b8',
                        }}
                      >
                        조회할 자재투입 자료가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {tabValue === 0 && (
            <TableContainer
              sx={{
                height: '100%',
                overflow: 'auto',
              }}
            >
              <Table
                stickyHeader
                size="small"
                sx={{
                  ...tableVerticalBorderSx,
                  ...COMPACT_TABLE_SX,
                }}
              >
                <TableHead>
                  <TableRow>
                    {[
                      '입고일',
                      '발주일',
                      '일자상태',
                      '금액포함',
                      '업체',
                      '품명',
                      '규격',
                      '단위',
                      '수량',
                      '단가',
                      '공급가액',
                      '부가세',
                      '재계산 합계',
                      '원본 합계',
                      '비고',
                      '수정',
                    ].map(
                      (
                        header,
                        index,
                      ) => (
                        <TableCell
                          key={header}
                          align={
                            index >=
                              8 &&
                            index <= 13
                              ? 'right'
                              : 'left'
                          }
                          sx={{
                            bgcolor:
                              '#f8fafc',
                            fontWeight:
                              900,
                            whiteSpace:
                              'nowrap',
                            ...(
                              index <= 1
                                ? {
                                    width: 64,
                                    minWidth: 64,
                                    maxWidth: 64,
                                  }
                                : index === 4
                                  ? {
                                      minWidth: 145,
                                    }
                                  : index === 15
                                    ? {
                                        minWidth: 220,
                                      }
                                    : index >= 10 &&
                                        index <= 13
                                      ? {
                                          minWidth: 86,
                                        }
                                      : {}
                            ),
                          }}
                        >
                          {header}
                        </TableCell>
                      ),
                    )}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {selectedSupplier &&
                    selectedSupplierMonthSummary && (
                    <TableRow
                      sx={{
                        bgcolor:
                          '#eff6ff',
                        '& td': {
                          borderBottom:
                            '2px solid #93c5fd',
                        },
                      }}
                    >
                      <TableCell
                        colSpan={10}
                        sx={{
                          color:
                            '#1e3a8a',
                          fontWeight:
                            900,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {selectedSupplier}{' '}
                        {monthRange.label}{' '}
                        금액 합계
                      </TableCell>

                      <TableCell
                        align="right"
                        sx={{
                          color:
                            '#1e3a8a',
                          fontWeight:
                            900,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {formatMoney(
                          selectedSupplierMonthSummary
                            .supplyAmount,
                        )}
                      </TableCell>

                      <TableCell
                        align="right"
                        sx={{
                          color:
                            '#1e3a8a',
                          fontWeight:
                            900,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {formatMoney(
                          selectedSupplierMonthSummary
                            .vatAmount,
                        )}
                      </TableCell>

                      <TableCell
                        align="right"
                        sx={{
                          color:
                            '#1d4ed8',
                          fontWeight:
                            900,
                          whiteSpace:
                            'nowrap',
                        }}
                      >
                        {formatMoney(
                          selectedSupplierMonthSummary
                            .totalAmount,
                        )}
                      </TableCell>

                      <TableCell />

                      <TableCell />

                      <TableCell />
                    </TableRow>
                  )}

                  {filteredDetailRows.map(
                    (record) => (
                      <TableRow
                        key={record.id}
                        hover
                        sx={{
                          bgcolor:
                            record.review_required ||
                            record.arrival_date_status !==
                              'confirmed'
                              ? record.include_in_amount ===
                                false
                                ? '#f8fafc'
                                : '#fffbea'
                              : record.amount_mismatch
                                ? '#fff7ed'
                                : 'inherit',
                        }}
                      >
                        <TableCell
                          sx={{
                            width: 64,
                            minWidth: 64,
                            maxWidth: 64,
                            whiteSpace:
                              'nowrap',
                            wordBreak:
                              'keep-all',
                            fontVariantNumeric:
                              'tabular-nums',
                          }}
                        >
                          {formatShortDate(
                            record.arrival_date,
                          )}
                        </TableCell>

                        <TableCell
                          sx={{
                            width: 64,
                            minWidth: 64,
                            maxWidth: 64,
                            whiteSpace:
                              'nowrap',
                            wordBreak:
                              'keep-all',
                            fontVariantNumeric:
                              'tabular-nums',
                          }}
                        >
                          {formatShortDate(
                            record.order_date,
                          )}
                        </TableCell>

                        <TableCell
                          sx={{
                            minWidth: 72,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          <Chip
                            size="small"
                            color={
                              record.arrival_date_status ===
                              'confirmed'
                                ? 'default'
                                : 'warning'
                            }
                            label={
                              DATE_STATUS_LABELS[
                                record.arrival_date_status ||
                                  'confirmed'
                              ] || '기타'
                            }
                            sx={{
                              height: 20,
                              fontSize:
                                '0.58rem',
                            }}
                          />
                        </TableCell>

                        <TableCell
                          sx={{
                            minWidth: 66,
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          <Chip
                            size="small"
                            color={
                              record.include_in_amount ===
                              false
                                ? 'default'
                                : 'success'
                            }
                            label={
                              record.include_in_amount ===
                              false
                                ? '제외'
                                : '포함'
                            }
                            sx={{
                              height: 20,
                              fontSize:
                                '0.58rem',
                            }}
                          />
                        </TableCell>

                        <TableCell
                          sx={{
                            minWidth: 145,
                            maxWidth: 210,
                            whiteSpace:
                              'normal',
                            wordBreak:
                              'keep-all',
                          }}
                        >
                          {record.supplier ||
                            '-'}
                        </TableCell>

                        <TableCell
                          sx={{
                            minWidth: 150,
                          }}
                        >
                          {record.raw_item_name}
                        </TableCell>

                        <TableCell
                          sx={{
                            minWidth: 180,
                          }}
                        >
                          {record.raw_specification ||
                            '-'}
                        </TableCell>

                        <TableCell>
                          {record.raw_unit ||
                            '-'}
                        </TableCell>

                        <TableCell align="right">
                          {record.quantity ===
                          null
                            ? '-'
                            : formatNumber(
                                record.quantity,
                              )}
                        </TableCell>

                        <TableCell align="right">
                          {record.unit_price ===
                          null
                            ? '-'
                            : formatNumber(
                                record.unit_price,
                              )}
                        </TableCell>

                        <TableCell align="right">
                          {record.supply_amount ===
                          null
                            ? '-'
                            : formatMoney(
                                record.supply_amount,
                              )}
                        </TableCell>

                        <TableCell align="right">
                          {record.vat_amount ===
                          null
                            ? '-'
                            : formatMoney(
                                record.vat_amount,
                              )}
                        </TableCell>

                        <TableCell
                          align="right"
                          sx={{
                            color:
                              '#1d4ed8',
                            fontWeight: 900,
                          }}
                        >
                          {record.calculated_total_amount ===
                          null
                            ? '-'
                            : formatMoney(
                                record.calculated_total_amount,
                              )}
                        </TableCell>

                        <TableCell
                          align="right"
                          sx={{
                            color:
                              record.amount_mismatch
                                ? '#dc2626'
                                : 'inherit',
                            fontWeight:
                              record.amount_mismatch
                                ? 900
                                : 400,
                          }}
                        >
                          {record.raw_total_amount ===
                          null
                            ? '-'
                            : formatMoney(
                                record.raw_total_amount,
                              )}
                        </TableCell>

                        <TableCell
                          sx={{
                            minWidth: 220,
                            maxWidth: 340,
                            whiteSpace:
                              'normal',
                            wordBreak:
                              'break-word',
                          }}
                        >
                          {record.note ||
                            ''}
                        </TableCell>

                        <TableCell
                          align="center"
                          sx={{
                            width: 42,
                            minWidth: 42,
                          }}
                        >
                          <Tooltip title="일자·금액 포함 수정">
                            <IconButton
                              size="small"
                              onClick={() =>
                                handleOpenRecordEdit(
                                  record,
                                )
                              }
                            >
                              <EditOutlinedIcon
                                sx={{
                                  fontSize: 16,
                                }}
                              />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ),
                  )}

                  {!loading &&
                    filteredDetailRows.length ===
                      0 && (
                    <TableRow>
                      <TableCell
                        colSpan={16}
                        align="center"
                        sx={{
                          py: 5,
                          color:
                            '#94a3b8',
                        }}
                      >
                        선택한 월에 조회할 원본 내역이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Paper>

      <Alert
        severity="info"
        sx={{
          '& .MuiAlert-message':
            {
              fontSize:
                '0.68rem',
            },
        }}
      >
        기성청구 참고금액은 입고일 기준으로 집계하며, 원본 지출합계가 잘못된 행은 공급가액과 부가세를 더한 재계산 합계를 사용합니다. 발주일은 참고정보로 별도 보관됩니다.
      </Alert>

      <Dialog
        open={dateReviewDialogOpen}
        onClose={() =>
          setDateReviewDialogOpen(
            false,
          )
        }
        fullWidth
        maxWidth="xl"
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
          }}
        >
          입고일 확인 및 금액 포함 결정
        </DialogTitle>

        <DialogContent dividers>
          <Alert
            severity={
              pendingAnalysisReviewRows.length >
              0
                ? 'warning'
                : 'success'
            }
          >
            숫자와 문자가 함께 입력된 일자나 존재하지 않는 일자는 자동 제외하지 않습니다. 각 행의 상태와 금액 포함여부를 결정해야 현재 현황으로 반영할 수 있습니다.
          </Alert>

          {selectedReviewRows.length >
            0 && (
            <Paper
              variant="outlined"
              sx={{
                mt: 1,
                p: 1,
                display: 'flex',
                alignItems:
                  'center',
                gap: 0.8,
                flexWrap:
                  'wrap',
                borderColor:
                  '#93c5fd',
                bgcolor:
                  '#eff6ff',
                boxShadow:
                  'none',
              }}
            >
              <Chip
                color="primary"
                size="small"
                label={`${selectedReviewRows.length.toLocaleString()}개 행 선택`}
                sx={{
                  fontWeight: 900,
                }}
              />

              <TextField
                select
                size="small"
                label="처리상태"
                value={
                  batchReviewStatus
                }
                onChange={(event) =>
                  setBatchReviewStatus(
                    event.target.value,
                  )
                }
                sx={{
                  minWidth: 135,
                }}
              >
                <MenuItem value="">
                  변경 안 함
                </MenuItem>

                {DATE_STATUS_OPTIONS.map(
                  (option) => (
                    <MenuItem
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </MenuItem>
                  ),
                )}
              </TextField>

              <TextField
                type="date"
                size="small"
                label="확정 입고일"
                value={
                  batchReviewDate
                }
                onChange={(event) =>
                  setBatchReviewDate(
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

              <TextField
                select
                size="small"
                label="금액 포함"
                value={
                  batchIncludeInAmount
                }
                onChange={(event) =>
                  setBatchIncludeInAmount(
                    event.target.value,
                  )
                }
                sx={{
                  minWidth: 125,
                }}
              >
                <MenuItem value="">
                  변경 안 함
                </MenuItem>

                <MenuItem value="include">
                  포함
                </MenuItem>

                <MenuItem value="exclude">
                  제외
                </MenuItem>
              </TextField>

              <Button
                variant="contained"
                onClick={
                  handleApplyBatchReview
                }
                sx={{
                  fontWeight: 900,
                }}
              >
                선택 행 일괄 적용
              </Button>

              <Button
                variant="text"
                color="inherit"
                onClick={() => {
                  setSelectedReviewRows(
                    [],
                  );

                  resetBatchReviewFields();
                }}
              >
                선택 해제
              </Button>
            </Paper>
          )}

          <TableContainer
            sx={{
              mt: 1,
              maxHeight: 520,
              border:
                '1px solid #dbe3ee',
            }}
          >
            <Table
              stickyHeader
              size="small"
              sx={{
                ...COMPACT_TABLE_SX,
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell
                    padding="checkbox"
                    sx={{
                      width: 38,
                      minWidth: 38,
                      maxWidth: 38,
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={
                        allReviewRowsSelected
                      }
                      indeterminate={
                        someReviewRowsSelected
                      }
                      onChange={
                        handleToggleAllReviewRows
                      }
                      inputProps={{
                        'aria-label':
                          '검토 대상 전체 선택',
                      }}
                    />
                  </TableCell>

                  {[
                    '엑셀행',
                    '원본 일자',
                    '업체',
                    '품명',
                    '규격',
                    '처리상태',
                    '확정 입고일',
                    '금액 포함',
                    '안내',
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
                {(analysis?.reviewRows || []).map(
                  (record) => {
                    const complete =
                      isReviewComplete(
                        record,
                      );

                    return (
                      <TableRow
                        key={record.sourceRow}
                        sx={{
                          bgcolor:
                            complete
                              ? '#f0fdf4'
                              : '#fffbea',
                        }}
                      >
                        <TableCell
                          padding="checkbox"
                          sx={{
                            width: 38,
                            minWidth: 38,
                            maxWidth: 38,
                          }}
                        >
                          <Checkbox
                            size="small"
                            checked={
                              selectedReviewRows.includes(
                                record.sourceRow,
                              )
                            }
                            onChange={() =>
                              handleToggleReviewRow(
                                record.sourceRow,
                              )
                            }
                            inputProps={{
                              'aria-label':
                                `${record.sourceRow}행 선택`,
                            }}
                          />
                        </TableCell>

                        <TableCell>
                          {record.sourceRow}
                        </TableCell>

                        <TableCell
                          sx={{
                            minWidth: 90,
                            fontWeight: 900,
                          }}
                        >
                          {[
                            record.sourceYear,
                            record.sourceMonth,
                            record.sourceDayText ||
                              '(빈칸)',
                          ]
                            .filter(
                              (value) =>
                                value !== null &&
                                value !== undefined &&
                                value !== '',
                            )
                            .join('-')}
                        </TableCell>

                        <TableCell>
                          {record.supplier || '-'}
                        </TableCell>

                        <TableCell>
                          {record.itemName}
                        </TableCell>

                        <TableCell>
                          {record.specification || '-'}
                        </TableCell>

                        <TableCell
                          sx={{
                            minWidth: 120,
                          }}
                        >
                          <TextField
                            select
                            fullWidth
                            size="small"
                            value={
                              record.arrivalDateStatus ||
                              ''
                            }
                            onChange={(event) =>
                              updateAnalysisRecord(
                                record.sourceRow,
                                {
                                  arrivalDateStatus:
                                    event.target.value,
                                  arrivalDateReason:
                                    DATE_STATUS_LABELS[
                                      event.target.value
                                    ] || '',
                                },
                              )
                            }
                          >
                            <MenuItem value="">
                              선택 필요
                            </MenuItem>
                            {DATE_STATUS_OPTIONS.map(
                              (option) => (
                                <MenuItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </MenuItem>
                              ),
                            )}
                          </TextField>
                        </TableCell>

                        <TableCell
                          sx={{
                            minWidth: 140,
                          }}
                        >
                          <TextField
                            type="date"
                            fullWidth
                            size="small"
                            value={
                              record.arrivalDate ||
                              ''
                            }
                            onChange={(event) =>
                              updateAnalysisRecord(
                                record.sourceRow,
                                {
                                  arrivalDate:
                                    event.target.value ||
                                    null,
                                  sourceYear:
                                    event.target.value
                                      ? Number(
                                          event.target.value.slice(
                                            0,
                                            4,
                                          ),
                                        )
                                      : record.sourceYear,
                                  sourceMonth:
                                    event.target.value
                                      ? Number(
                                          event.target.value.slice(
                                            5,
                                            7,
                                          ),
                                        )
                                      : record.sourceMonth,
                                },
                              )
                            }
                            InputLabelProps={{
                              shrink: true,
                            }}
                          />
                        </TableCell>

                        <TableCell
                          sx={{
                            minWidth: 105,
                          }}
                        >
                          <TextField
                            select
                            fullWidth
                            size="small"
                            value={
                              typeof record.includeInAmount ===
                              'boolean'
                                ? record.includeInAmount
                                  ? 'include'
                                  : 'exclude'
                                : ''
                            }
                            onChange={(event) =>
                              updateAnalysisRecord(
                                record.sourceRow,
                                {
                                  includeInAmount:
                                    event.target.value ===
                                    'include',
                                },
                              )
                            }
                          >
                            <MenuItem value="">
                              선택 필요
                            </MenuItem>
                            <MenuItem value="include">
                              포함
                            </MenuItem>
                            <MenuItem value="exclude">
                              제외
                            </MenuItem>
                          </TextField>
                        </TableCell>

                        <TableCell
                          sx={{
                            minWidth: 180,
                            color:
                              complete
                                ? '#166534'
                                : '#b45309',
                          }}
                        >
                          {complete
                            ? '확인 완료'
                            : record.includeInAmount ===
                                true &&
                              !record.arrivalDate
                              ? '금액 포함 시 입고일이 필요합니다.'
                              : !record.arrivalDate &&
                                  !(
                                    record.sourceYear &&
                                    record.sourceMonth
                                  )
                                ? '조회 월을 정하려면 입고일을 입력해야 합니다.'
                                : record.arrivalDateReason ||
                                (
                                  record.rawMetadata
                                    ?.suggestedArrivalDateStatus
                                    ? `추천: ${DATE_STATUS_LABELS[record.rawMetadata.suggestedArrivalDateStatus]}`
                                    : '상태와 금액 포함여부를 선택해주세요.'
                                )}
                        </TableCell>
                      </TableRow>
                    );
                  },
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>

        <DialogActions>
          <Typography
            sx={{
              mr: 'auto',
              color:
                pendingAnalysisReviewRows.length >
                0
                  ? '#b45309'
                  : '#166534',
              fontSize: '0.72rem',
              fontWeight: 900,
            }}
          >
            미완료 {pendingAnalysisReviewRows.length.toLocaleString()}건
          </Typography>

          <Button
            onClick={() =>
              setDateReviewDialogOpen(
                false,
              )
            }
          >
            닫기
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={recordEditOpen}
        onClose={() =>
          !recordEditSaving &&
          setRecordEditOpen(false)
        }
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
          }}
        >
          입고일·금액 포함 수정
        </DialogTitle>

        <DialogContent dividers>
          {editingRecord && (
            <Box
              sx={{
                display: 'grid',
                gap: 1.2,
              }}
            >
              <Alert severity="info">
                {editingRecord.supplier || '-'} · {editingRecord.raw_item_name} · {editingRecord.raw_specification || '-'}
              </Alert>

              <TextField
                select
                label="일자 상태"
                value={
                  editingRecord.arrival_date_status ||
                  'confirmed'
                }
                onChange={(event) =>
                  setEditingRecord(
                    (previous) => ({
                      ...previous,
                      arrival_date_status:
                        event.target.value,
                    }),
                  )
                }
              >
                {DATE_STATUS_OPTIONS.map(
                  (option) => (
                    <MenuItem
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </MenuItem>
                  ),
                )}
              </TextField>

              <TextField
                label="사유"
                value={
                  editingRecord.arrival_date_reason ||
                  ''
                }
                onChange={(event) =>
                  setEditingRecord(
                    (previous) => ({
                      ...previous,
                      arrival_date_reason:
                        event.target.value,
                    }),
                  )
                }
              />

              <TextField
                type="date"
                label="입고일"
                value={
                  editingRecord.arrival_date ||
                  ''
                }
                onChange={(event) =>
                  setEditingRecord(
                    (previous) => ({
                      ...previous,
                      arrival_date:
                        event.target.value ||
                        null,
                    }),
                  )
                }
                InputLabelProps={{
                  shrink: true,
                }}
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={
                      editingRecord.include_in_amount !==
                      false
                    }
                    onChange={(event) =>
                      setEditingRecord(
                        (previous) => ({
                          ...previous,
                          include_in_amount:
                            event.target.checked,
                        }),
                      )
                    }
                  />
                }
                label={
                  editingRecord.include_in_amount !==
                  false
                    ? '월 금액 합계에 포함'
                    : '월 금액 합계에서 제외'
                }
              />
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setRecordEditOpen(false)
            }
            disabled={recordEditSaving}
          >
            취소
          </Button>

          <Button
            variant="contained"
            onClick={
              handleSaveRecordEdit
            }
            disabled={recordEditSaving}
            startIcon={
              recordEditSaving
                ? (
                  <CircularProgress
                    size={16}
                    color="inherit"
                  />
                )
                : (
                  <SaveIcon />
                )
            }
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={issueDialogOpen}
        onClose={() =>
          setIssueDialogOpen(
            false,
          )
        }
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
          }}
        >
          제외·금액 오류 행
        </DialogTitle>

        <DialogContent
          dividers
        >
          <Typography
            sx={{
              color: '#475569',
              fontSize:
                '0.72rem',
              fontWeight: 900,
            }}
          >
            제외된 행
          </Typography>

          <TableContainer
            sx={{
              mt: 0.6,
              maxHeight: 220,
              border:
                '1px solid #e2e8f0',
            }}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  {[
                    '행',
                    '사유',
                    '업체',
                    '품명',
                    '규격',
                  ].map(
                    (header) => (
                      <TableCell
                        key={header}
                        sx={{
                          fontWeight: 900,
                        }}
                      >
                        {header}
                      </TableCell>
                    ),
                  )}
                </TableRow>
              </TableHead>

              <TableBody>
                {(analysis?.excludedRows ||
                  []).map(
                  (row) => (
                    <TableRow
                      key={`excluded-${row.row}`}
                    >
                      <TableCell>
                        {row.row}
                      </TableCell>

                      <TableCell>
                        {row.reason}
                      </TableCell>

                      <TableCell>
                        {row.supplier ||
                          '-'}
                      </TableCell>

                      <TableCell>
                        {row.itemName ||
                          '-'}
                      </TableCell>

                      <TableCell>
                        {row.specification ||
                          '-'}
                      </TableCell>
                    </TableRow>
                  ),
                )}

                {(analysis?.excludedRows ||
                  []).length ===
                  0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      align="center"
                    >
                      제외된 행이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography
            sx={{
              mt: 1.5,
              color: '#475569',
              fontSize:
                '0.72rem',
              fontWeight: 900,
            }}
          >
            지출합계 불일치 행
          </Typography>

          <TableContainer
            sx={{
              mt: 0.6,
              maxHeight: 280,
              border:
                '1px solid #e2e8f0',
            }}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  {[
                    '행',
                    '업체',
                    '품명',
                    '규격',
                    '원본 합계',
                    '재계산 합계',
                  ].map(
                    (
                      header,
                      index,
                    ) => (
                      <TableCell
                        key={header}
                        align={
                          index >= 4
                            ? 'right'
                            : 'left'
                        }
                        sx={{
                          fontWeight: 900,
                        }}
                      >
                        {header}
                      </TableCell>
                    ),
                  )}
                </TableRow>
              </TableHead>

              <TableBody>
                {(analysis?.amountMismatchRows ||
                  []).map(
                  (row) => (
                    <TableRow
                      key={`mismatch-${row.row}`}
                    >
                      <TableCell>
                        {row.row}
                      </TableCell>

                      <TableCell>
                        {row.supplier ||
                          '-'}
                      </TableCell>

                      <TableCell>
                        {row.itemName}
                      </TableCell>

                      <TableCell>
                        {row.specification ||
                          '-'}
                      </TableCell>

                      <TableCell
                        align="right"
                        sx={{
                          color:
                            '#dc2626',
                          fontWeight: 900,
                        }}
                      >
                        {formatMoney(
                          row.rawTotalAmount,
                        )}
                      </TableCell>

                      <TableCell
                        align="right"
                        sx={{
                          color:
                            '#1d4ed8',
                          fontWeight: 900,
                        }}
                      >
                        {formatMoney(
                          row.calculatedTotalAmount,
                        )}
                      </TableCell>
                    </TableRow>
                  ),
                )}

                {(analysis?.amountMismatchRows ||
                  []).length ===
                  0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      align="center"
                    >
                      지출합계가 잘못된 행이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setIssueDialogOpen(
                false,
              )
            }
          >
            닫기
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={importHistoryOpen}
        onClose={() =>
          setImportHistoryOpen(
            false,
          )
        }
        fullWidth
        maxWidth="md"
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
          }}
        >
          본사 자료 업로드 이력
        </DialogTitle>

        <DialogContent
          dividers
        >
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {[
                    '상태',
                    '파일명',
                    '자료기간',
                    '행수',
                    '총액',
                    '업로드일',
                  ].map(
                    (header) => (
                      <TableCell
                        key={header}
                        sx={{
                          fontWeight: 900,
                        }}
                      >
                        {header}
                      </TableCell>
                    ),
                  )}
                </TableRow>
              </TableHead>

              <TableBody>
                {importHistory.map(
                  (item) => (
                    <TableRow
                      key={item.id}
                    >
                      <TableCell>
                        <Chip
                          size="small"
                          color={
                            item.is_active
                              ? 'success'
                              : 'default'
                          }
                          label={
                            item.is_active
                              ? '현재'
                              : '이전'
                          }
                        />
                      </TableCell>

                      <TableCell>
                        {item.source_file_name}
                      </TableCell>

                      <TableCell>
                        {item.min_arrival_date || '-'}
                        {' ~ '}
                        {item.max_arrival_date || '-'}
                      </TableCell>

                      <TableCell align="right">
                        {item.row_count?.toLocaleString()}
                      </TableCell>

                      <TableCell align="right">
                        {formatMoney(
                          item.total_amount,
                        )}
                      </TableCell>

                      <TableCell>
                        {new Date(
                          item.created_at,
                        ).toLocaleString(
                          'ko-KR',
                        )}
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setImportHistoryOpen(
                false,
              )
            }
          >
            닫기
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
