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
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Paper,
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

const parseDateParts = ({
  year,
  month,
  day,
}) => {
  const y =
    parseNumber(year);

  const m =
    parseNumber(month);

  const d =
    parseNumber(day);

  const hasAny =
    y !== null ||
    m !== null ||
    d !== null;

  const hasAll =
    y !== null &&
    m !== null &&
    d !== null;

  if (!hasAny) {
    return {
      hasAny: false,
      valid: false,
      value: '',
    };
  }

  if (!hasAll) {
    return {
      hasAny: true,
      valid: false,
      value: '',
      reason:
        '년·월·일 중 일부가 비어 있습니다.',
    };
  }

  const fullYear =
    y < 100
      ? 2000 + y
      : y;

  const date =
    new Date(
      fullYear,
      m - 1,
      d,
    );

  if (
    date.getFullYear() !==
      fullYear ||
    date.getMonth() !==
      m - 1 ||
    date.getDate() !==
      d
  ) {
    return {
      hasAny: true,
      valid: false,
      value: '',
      reason:
        `${fullYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}는 올바른 날짜가 아닙니다.`,
    };
  }

  return {
    hasAny: true,
    valid: true,
    value: [
      fullYear,
      String(m).padStart(
        2,
        '0',
      ),
      String(d).padStart(
        2,
        '0',
      ),
    ].join('-'),
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
        날짜 없이 업체/품명만 있는 분류행,
        마지막 칸의 단독 숫자 같은 잔여값은 저장하지 않습니다.
      */
      if (
        !arrivalDateResult.hasAny
      ) {
        excludedRows.push({
          row,
          reason:
            '입고일이 없어 원장 데이터에서 제외했습니다.',
          supplier,
          itemName,
          specification,
        });

        continue;
      }

      if (
        !arrivalDateResult.valid
      ) {
        excludedRows.push({
          row,
          reason:
            arrivalDateResult.reason,
          supplier,
          itemName,
          specification,
        });

        continue;
      }

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
        },
      });
    }

    const datedRecords =
      records.filter(
        (record) =>
          record.arrivalDate,
      );

    const arrivalDates =
      datedRecords
        .map(
          (record) =>
            record.arrivalDate,
        )
        .sort();

    const summary =
      records.reduce(
        (
          result,
          record,
        ) => ({
          rowCount:
            result.rowCount +
            1,
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
              Number(
                record.supplyAmount,
              ) || 0
            ),
          vatAmount:
            result.vatAmount +
            (
              Number(
                record.vatAmount,
              ) || 0
            ),
          calculatedTotalAmount:
            result.calculatedTotalAmount +
            (
              Number(
                record.calculatedTotalAmount,
              ) || 0
            ),
        }),
        {
          rowCount: 0,
          pricedRowCount: 0,
          unpricedRowCount: 0,
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
        arrivalDates.length -
          1
      ] || '';

    summary.amountMismatchCount =
      amountMismatchRows.length;

    summary.excludedRowCount =
      excludedRows.length;

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
      summary,
    };
  };

const aggregateItemRows = ({
  records,
  monthStart,
  monthEnd,
}) => {
  const map = new Map();

  records.forEach(
    (record) => {
      if (
        !record.arrival_date ||
        record.arrival_date >
          monthEnd
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
          record.quantity ||
            0,
        );

      const amount =
        Number(
          record.calculated_total_amount ||
            0,
        );

      target.cumulativeQuantity +=
        quantity;

      target.cumulativeAmount +=
        amount;

      target.cumulativeCount +=
        1;

      if (
        record.amount_mismatch
      ) {
        target.mismatchCount +=
          1;
      }

      if (
        !target.latestArrivalDate ||
        record.arrival_date >
          target.latestArrivalDate
      ) {
        target.latestArrivalDate =
          record.arrival_date;
      }

      if (
        record.arrival_date >=
          monthStart &&
        record.arrival_date <=
          monthEnd
      ) {
        target.monthlyQuantity +=
          quantity;

        target.monthlyAmount +=
          amount;

        target.monthlyCount +=
          1;
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
                  record.arrival_date >=
                    monthRange.start &&
                  record.arrival_date <=
                    monthRange.end,
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
        monthRange.end,
        monthRange.start,
        records,
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
          monthStart:
            monthRange.start,
          monthEnd:
            monthRange.end,
        }),
      [
        monthRange.end,
        monthRange.start,
        records,
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
              record.arrival_date >=
                monthRange.start &&
              record.arrival_date <=
                monthRange.end;

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
        monthRange.end,
        monthRange.start,
        normalizedSearch,
        records,
        selectedSupplier,
      ],
    );

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
              record.arrival_date >=
                monthRange.start &&
              record.arrival_date <=
                monthRange.end;

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
        monthRange.end,
        monthRange.start,
        records,
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
              record.arrival_date <
                monthRange.start ||
              record.arrival_date >
                monthRange.end
            ) {
              return result;
            }

            return {
              rowCount:
                result.rowCount +
                1,
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
            supplyAmount: 0,
            vatAmount: 0,
            totalAmount: 0,
            mismatchCount: 0,
          },
        ),
      [
        monthRange.end,
        monthRange.start,
        records,
      ],
    );

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
              `${result.summary.rowCount.toLocaleString()}건을 확인했습니다. 제외 ${result.summary.excludedRowCount.toLocaleString()}건, 금액 불일치 ${result.summary.amountMismatchCount.toLocaleString()}건입니다.`,
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
                record.arrivalDate,
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

  const handleExcelDownload =
    async () => {
      const workbook =
        new ExcelJS.Workbook();

      const worksheet =
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
        )}_${selectedMonth}.xlsx`;

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
                      .length === 0
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
          }}
        >
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
            filteredItemRows.length ===
              0
          }
        >
          집계 엑셀 다운로드
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
        {[
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
              monthSummary.mismatchCount
            ).toLocaleString()}건`,
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

                        <TableCell>
                          {row.latestArrivalDate ||
                            '-'}
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
              >
                <TableHead>
                  <TableRow>
                    {[
                      '입고일',
                      '발주일',
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
                    ].map(
                      (
                        header,
                        index,
                      ) => (
                        <TableCell
                          key={header}
                          align={
                            index >=
                              6 &&
                            index <= 11
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
                        colSpan={8}
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
                    </TableRow>
                  )}

                  {filteredDetailRows.map(
                    (record) => (
                      <TableRow
                        key={record.id}
                        hover
                        sx={{
                          bgcolor:
                            record.amount_mismatch
                              ? '#fff7ed'
                              : 'inherit',
                        }}
                      >
                        <TableCell>
                          {record.arrival_date}
                        </TableCell>

                        <TableCell>
                          {record.order_date ||
                            '-'}
                        </TableCell>

                        <TableCell>
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

                        <TableCell>
                          {record.note ||
                            ''}
                        </TableCell>
                      </TableRow>
                    ),
                  )}

                  {!loading &&
                    filteredDetailRows.length ===
                      0 && (
                    <TableRow>
                      <TableCell
                        colSpan={13}
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
