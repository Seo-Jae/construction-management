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
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExcelJS from 'exceljs';
import { supabase } from '../supabaseClient';

const TEMPLATE_URL =
  '/templates/발주서양식.xlsx';

const TEMPLATE_VERSION =
  'MATERIAL_ORDER_V2_SINGLE';

const ITEM_INSERT_CHUNK_SIZE =
  500;

const TITLE_KEY =
  '자재발주의뢰서';

const REQUIRED_HEADERS = [
  {
    column: 'A',
    label: '품명',
  },
  {
    column: 'C',
    label: '규격',
  },
  {
    column: 'E',
    label: '단위',
  },
  {
    column: 'F',
    label: '실행물량',
  },
  {
    column: 'G',
    label: '전회발주량',
  },
  {
    column: 'H',
    label: '금회발주량',
  },
  {
    column: 'I',
    label: '누계발주량',
  },
  {
    column: 'J',
    label:
      '실행물량대비누계물량비',
  },
  {
    column: 'K',
    label: '비고',
  },
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
      /㈜|\(주\)|주식회사/gi,
      '',
    )
    .replace(
      /[^0-9a-zA-Z가-힣]/g,
      '',
    )
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

    if (
      Object.prototype.hasOwnProperty.call(
        value,
        'formula',
      )
    ) {
      return (
        value.result ?? ''
      );
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

const excelSerialToDate = (
  serial,
) => {
  if (
    typeof serial !==
      'number' ||
    !Number.isFinite(serial)
  ) {
    return null;
  }

  const milliseconds =
    Date.UTC(
      1899,
      11,
      30,
    ) +
    Math.round(
      serial *
        24 *
        60 *
        60 *
        1000,
    );

  const date =
    new Date(milliseconds);

  return [
    date.getUTCFullYear(),
    String(
      date.getUTCMonth() +
        1,
    ).padStart(2, '0'),
    String(
      date.getUTCDate(),
    ).padStart(2, '0'),
  ].join('-');
};

const parseDateValue = (
  value,
) => {
  if (value instanceof Date) {
    return [
      value.getFullYear(),
      String(
        value.getMonth() +
          1,
      ).padStart(2, '0'),
      String(
        value.getDate(),
      ).padStart(2, '0'),
    ].join('-');
  }

  if (
    typeof value ===
    'number'
  ) {
    return excelSerialToDate(
      value,
    );
  }

  const text =
    normalizeText(value);

  if (!text) {
    return '';
  }

  const match =
    text.match(
      /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/,
    ) ||
    text.match(
      /(\d{2})\D+(\d{1,2})\D+(\d{1,2})/,
    );

  if (!match) {
    return '';
  }

  const rawYear =
    Number(match[1]);

  const year =
    rawYear < 100
      ? 2000 + rawYear
      : rawYear;

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  const date =
    new Date(
      year,
      month - 1,
      day,
    );

  if (
    date.getFullYear() !==
      year ||
    date.getMonth() !==
      month - 1 ||
    date.getDate() !==
      day
  ) {
    return '';
  }

  return [
    year,
    String(month).padStart(
      2,
      '0',
    ),
    String(day).padStart(
      2,
      '0',
    ),
  ].join('-');
};

const getCellDate = (
  worksheet,
  address,
) =>
  parseDateValue(
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
      .replace(/%/g, '');

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

const getKoreaTodayKey =
  () => {
    const formatter =
      new Intl.DateTimeFormat(
        'en-CA',
        {
          timeZone:
            'Asia/Seoul',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
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
      `${parts.month}-` +
      `${parts.day}`
    );
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

const isCategoryRow = ({
  itemName,
  specification,
  unit,
  executionQuantity,
  previousQuantity,
  currentQuantity,
  note,
}) => {
  if (
    !itemName.startsWith(
      '■',
    )
  ) {
    return false;
  }

  return ![
    specification,
    unit,
    executionQuantity,
    previousQuantity,
    currentQuantity,
    note,
  ].some(
    (value) =>
      value !== null &&
      value !== '',
  );
};

const cleanCategoryName = (
  value,
) =>
  normalizeText(value)
    .replace(/^■+\s*/, '')
    .trim();

const validateHeaders = ({
  worksheet,
  headerRow,
}) => {
  const mismatches = [];

  REQUIRED_HEADERS.forEach(
    ({
      column,
      label,
    }) => {
      const actual =
        getCellText(
          worksheet,
          `${column}${headerRow}`,
        );

      if (
        !normalizeComparable(
          actual,
        ).includes(
          normalizeComparable(
            label,
          ),
        )
      ) {
        mismatches.push(
          {
            column,
            expected: label,
            actual:
              actual || '(빈칸)',
          },
        );
      }
    },
  );

  return mismatches;
};

const parseOrderWorkbook =
  async ({
    file,
    projectName,
  }) => {
    const arrayBuffer =
      await file.arrayBuffer();

    const hash =
      await createFileHash(
        arrayBuffer,
        file,
      );

    const workbook =
      new ExcelJS.Workbook();

    await workbook.xlsx.load(
      arrayBuffer,
    );

    const systemSheet =
      workbook.getWorksheet(
        '_SYSTEM',
      );

    const templateVersion =
      normalizeText(
        systemSheet?.getCell(
          'B1',
        )?.value,
      ) || 'LEGACY';

    const errors = [];
    const warnings = [];
    const orders = [];

    workbook.worksheets
      .filter(
        (worksheet) =>
          worksheet.name !==
          '_SYSTEM',
      )
      .forEach(
        (worksheet) => {
          const titleRows = [];

          const maxRow =
            Math.max(
              worksheet.rowCount,
              1,
            );

          for (
            let row = 1;
            row <= maxRow;
            row += 1
          ) {
            const titleText =
              getCellText(
                worksheet,
                `A${row}`,
              );

            if (
              normalizeComparable(
                titleText,
              ) ===
              normalizeComparable(
                TITLE_KEY,
              )
            ) {
              titleRows.push(
                row,
              );
            }
          }

          titleRows.forEach(
            (
              titleRow,
              titleIndex,
            ) => {
              const infoRow1 =
                titleRow + 1;

              const infoRow2 =
                titleRow + 2;

              const infoRow3 =
                titleRow + 3;

              const headerRow =
                titleRow + 5;

              const nextTitleRow =
                titleRows[
                  titleIndex + 1
                ];

              const blockEndRow =
                nextTitleRow
                  ? nextTitleRow -
                    1
                  : maxRow;

              const headerMismatches =
                validateHeaders({
                  worksheet,
                  headerRow,
                });

              if (
                headerMismatches.length >
                0
              ) {
                errors.push(
                  `${worksheet.name} ${titleIndex + 1}번째 발주서의 표 제목이 양식과 다릅니다: ` +
                    headerMismatches
                      .map(
                        (
                          mismatch,
                        ) =>
                          `${mismatch.column}열 ${mismatch.expected}→${mismatch.actual}`,
                      )
                      .join(', '),
                );

                return;
              }

              const orderDate =
                getCellDate(
                  worksheet,
                  `B${infoRow1}`,
                );

              const authorName =
                getCellText(
                  worksheet,
                  `B${infoRow2}`,
                );

              const excelProjectName =
                getCellText(
                  worksheet,
                  `B${infoRow3}`,
                );

              const deliveryLocation =
                getCellText(
                  worksheet,
                  `F${infoRow1}`,
                );

              const receiverName =
                getCellText(
                  worksheet,
                  `F${infoRow2}`,
                );

              const receiverPhone =
                getCellText(
                  worksheet,
                  `G${infoRow2}`,
                ).replace(
                  /^연락처\s*:\s*/i,
                  '',
                );

              const deliveryDate =
                getCellDate(
                  worksheet,
                  `F${infoRow3}`,
                );

              let currentCategory =
                '';

              const items = [];
              let ignoredRowCount =
                0;
              let foundAnyInput =
                Boolean(
                  orderDate ||
                    authorName ||
                    excelProjectName ||
                    deliveryLocation ||
                    receiverName ||
                    receiverPhone ||
                    deliveryDate,
                );

              for (
                let row =
                  headerRow + 1;
                row <=
                blockEndRow;
                row += 1
              ) {
                const itemName =
                  getCellText(
                    worksheet,
                    `A${row}`,
                  );

                const specification =
                  getCellText(
                    worksheet,
                    `C${row}`,
                  );

                const unit =
                  getCellText(
                    worksheet,
                    `E${row}`,
                  );

                const executionQuantity =
                  parseNumber(
                    getCellRawValue(
                      worksheet.getCell(
                        `F${row}`,
                      ),
                    ),
                  );

                const previousQuantity =
                  parseNumber(
                    getCellRawValue(
                      worksheet.getCell(
                        `G${row}`,
                      ),
                    ),
                  );

                const currentQuantity =
                  parseNumber(
                    getCellRawValue(
                      worksheet.getCell(
                        `H${row}`,
                      ),
                    ),
                  );

                const note =
                  getCellText(
                    worksheet,
                    `K${row}`,
                  );

                const rowHasValue =
                  Boolean(
                    itemName ||
                      specification ||
                      unit ||
                      note ||
                      executionQuantity !==
                        null ||
                      previousQuantity !==
                        null ||
                      currentQuantity !==
                        null,
                  );

                if (!rowHasValue) {
                  continue;
                }

                foundAnyInput =
                  true;

                if (
                  isCategoryRow({
                    itemName,
                    specification,
                    unit,
                    executionQuantity,
                    previousQuantity,
                    currentQuantity,
                    note,
                  })
                ) {
                  currentCategory =
                    cleanCategoryName(
                      itemName,
                    );

                  continue;
                }

                if (!itemName) {
                  warnings.push(
                    `${worksheet.name} ${row}행은 품명이 없어 제외했습니다.`,
                  );

                  ignoredRowCount +=
                    1;

                  continue;
                }

                /*
                  금회발주량이 없는 행은 품목 기준표 또는
                  이전 발주 이력으로 보고 이번 발주 데이터에서는 제외합니다.
                */
                if (
                  currentQuantity ===
                    null ||
                  currentQuantity <=
                    0
                ) {
                  ignoredRowCount +=
                    1;

                  continue;
                }

                const cumulativeQuantity =
                  (
                    previousQuantity ||
                    0
                  ) +
                  currentQuantity;

                const executionRatio =
                  executionQuantity &&
                  executionQuantity > 0
                    ? cumulativeQuantity /
                      executionQuantity
                    : null;

                items.push({
                  lineNo:
                    items.length +
                    1,
                  sourceRow: row,
                  category:
                    currentCategory,
                  itemName,
                  specification,
                  unit,
                  executionQuantity,
                  previousOrderQuantity:
                    previousQuantity,
                  currentOrderQuantity:
                    currentQuantity,
                  cumulativeOrderQuantity:
                    cumulativeQuantity,
                  executionRatio,
                  note,
                  rawRow: {
                    itemName,
                    specification,
                    unit,
                    executionQuantity,
                    previousQuantity,
                    currentQuantity,
                    note,
                  },
                });
              }

              /*
                발주서 기본정보와 자재 입력이 모두 비어 있으면
                빈 양식으로 보고 저장 대상에서 제외합니다.
              */
              if (
                !foundAnyInput
              ) {
                return;
              }

              if (
                items.length ===
                0
              ) {
                warnings.push(
                  `${worksheet.name} ${titleIndex + 1}번째 발주서는 금회발주량이 입력된 자재가 없어 저장 대상에서 제외했습니다.`,
                );

                return;
              }

              if (!orderDate) {
                errors.push(
                  `${worksheet.name} ${titleIndex + 1}번째 발주서의 작성일을 확인할 수 없습니다.`,
                );
              }

              if (
                !excelProjectName
              ) {
                warnings.push(
                  `${worksheet.name} ${titleIndex + 1}번째 발주서에 현장명이 없습니다. 현재 현장(${projectName})으로 저장됩니다.`,
                );
              } else {
                const excelProjectKey =
                  normalizeComparable(
                    excelProjectName,
                  );

                const activeProjectKey =
                  normalizeComparable(
                    projectName,
                  );

                const shareMeaningfulName =
                  excelProjectKey &&
                  activeProjectKey &&
                  (
                    excelProjectKey.includes(
                      activeProjectKey,
                    ) ||
                    activeProjectKey.includes(
                      excelProjectKey,
                    ) ||
                    (
                      excelProjectKey.includes(
                        '용인금어지구',
                      ) &&
                      activeProjectKey.includes(
                        '용인금어지구',
                      )
                    ) ||
                    (
                      excelProjectKey.includes(
                        '마크밸리',
                      ) &&
                      activeProjectKey.includes(
                        '마크밸리',
                      )
                    )
                  );

                if (
                  !shareMeaningfulName
                ) {
                  warnings.push(
                    `${worksheet.name} ${titleIndex + 1}번째 발주서의 현장명(${excelProjectName})과 현재 선택 현장(${projectName})이 다를 수 있습니다.`,
                  );
                }
              }

              if (!deliveryDate) {
                warnings.push(
                  `${worksheet.name} ${titleIndex + 1}번째 발주서의 납품일자가 비어 있습니다. 월별 집계는 작성일 기준으로 처리됩니다.`,
                );
              }

              orders.push({
                sheetName:
                  worksheet.name,
                blockNo:
                  titleIndex + 1,
                orderDate,
                authorName,
                excelProjectName,
                deliveryLocation,
                receiverName,
                receiverPhone,
                deliveryDate,
                ignoredRowCount,
                items,
              });
            },
          );

          if (
            titleRows.length ===
            0
          ) {
            warnings.push(
              `${worksheet.name} 시트에서는 자재발주의뢰서 제목을 찾지 못했습니다.`,
            );
          }
        },
      );

    if (
      orders.length === 0 &&
      errors.length === 0
    ) {
      errors.push(
        '발주서 7행~27행에서 금회발주량이 입력된 자재를 찾지 못했습니다.',
      );
    }

    const totalItemCount =
      orders.reduce(
        (
          total,
          order,
        ) =>
          total +
          order.items.length,
        0,
      );

    const totalCurrentQuantity =
      orders.reduce(
        (
          total,
          order,
        ) =>
          total +
          order.items.reduce(
            (
              itemTotal,
              item,
            ) =>
              itemTotal +
              (
                item.currentOrderQuantity ||
                0
              ),
            0,
          ),
        0,
      );

    return {
      fileName:
        file.name,
      fileSize:
        file.size,
      fileHash: hash,
      templateVersion,
      orders,
      errors,
      warnings,
      totalItemCount,
      totalCurrentQuantity,
    };
  };

const formatNumber = (
  value,
) =>
  Number(
    value || 0,
  ).toLocaleString(
    'ko-KR',
    {
      maximumFractionDigits: 4,
    },
  );

const formatDate = (
  value,
) =>
  value
    ? value.replace(
        /-/g,
        '.',
      )
    : '-';

export default function MaterialOrderUpload({
  projectName = '',
  userProfile = {},
}) {
  const fileInputRef =
    useRef(null);

  const [
    analysis,
    setAnalysis,
  ] = useState(null);

  const [
    analyzing,
    setAnalyzing,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    downloading,
    setDownloading,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState(null);

  const [
    recentOrders,
    setRecentOrders,
  ] = useState([]);

  const [
    recentLoading,
    setRecentLoading,
  ] = useState(false);

  const [
    guideOpen,
    setGuideOpen,
  ] = useState(false);

  const loadRecentOrders =
    useCallback(async () => {
      if (!projectName) {
        setRecentOrders([]);
        return;
      }

      setRecentLoading(true);

      try {
        const {
          data,
          error,
        } = await supabase
          .from(
            'material_orders',
          )
          .select(
            `
            id,
            order_code,
            order_date,
            delivery_date,
            author_name,
            source_file_name,
            source_sheet_name,
            source_block_no,
            created_at
          `,
          )
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
          .limit(20);

        if (error) {
          if (
            error.code ===
            '42P01'
          ) {
            setRecentOrders([]);
            return;
          }

          throw error;
        }

        setRecentOrders(
          data || [],
        );
      } catch (error) {
        console.error(
          '최근 자재발주 조회 실패:',
          error,
        );
      } finally {
        setRecentLoading(false);
      }
    }, [projectName]);

  useEffect(() => {
    loadRecentOrders();
  }, [loadRecentOrders]);

  const previewItems =
    useMemo(
      () =>
        (
          analysis?.orders ||
          []
        ).flatMap(
          (order) =>
            order.items.map(
              (item) => ({
                ...item,
                orderDate:
                  order.orderDate,
                deliveryDate:
                  order.deliveryDate,
                blockNo:
                  order.blockNo,
                sheetName:
                  order.sheetName,
              }),
            ),
        ),
      [analysis],
    );

  const handleDownloadTemplate =
    async () => {
      setDownloading(true);
      setMessage(null);

      try {
        const response =
          await fetch(
            TEMPLATE_URL,
            {
              cache:
                'no-store',
            },
          );

        if (!response.ok) {
          throw new Error(
            '발주서 양식 파일을 찾지 못했습니다. public/templates/발주서양식.xlsx 경로를 확인해주세요.',
          );
        }

        const arrayBuffer =
          await response.arrayBuffer();

        const workbook =
          new ExcelJS.Workbook();

        await workbook.xlsx.load(
          arrayBuffer,
        );

        const worksheet =
          workbook.getWorksheet(
            '발주서',
          ) ||
          workbook.worksheets[0];

        if (!worksheet) {
          throw new Error(
            '발주서 시트를 찾지 못했습니다.',
          );
        }

        const today =
          getKoreaTodayKey();

        const [
          year,
          month,
          day,
        ] = today
          .split('-')
          .map(Number);

        const authorName =
          userProfile
            ?.manager_name ||
          userProfile
            ?.name ||
          '';

        const clearOrderBlock =
          ({
            titleRow,
            itemStartRow,
            itemEndRow,
          }) => {
            const infoRow1 =
              titleRow + 1;

            const infoRow2 =
              titleRow + 2;

            const infoRow3 =
              titleRow + 3;

            worksheet.getCell(
              `B${infoRow1}`,
            ).value =
              new Date(
                year,
                month - 1,
                day,
              );

            worksheet.getCell(
              `B${infoRow1}`,
            ).numFmt =
              'yyyy.mm.dd';

            worksheet.getCell(
              `B${infoRow2}`,
            ).value =
              authorName;

            worksheet.getCell(
              `B${infoRow3}`,
            ).value =
              projectName;

            worksheet.getCell(
              `F${infoRow1}`,
            ).value = null;

            worksheet.getCell(
              `F${infoRow2}`,
            ).value = null;

            worksheet.getCell(
              `G${infoRow2}`,
            ).value = null;

            worksheet.getCell(
              `F${infoRow3}`,
            ).value = null;

            for (
              let row =
                itemStartRow;
              row <= itemEndRow;
              row += 1
            ) {
              [
                'A',
                'C',
                'E',
                'F',
                'G',
                'H',
                'K',
              ].forEach(
                (column) => {
                  worksheet.getCell(
                    `${column}${row}`,
                  ).value = null;
                },
              );

              worksheet.getCell(
                `I${row}`,
              ).value = {
                formula:
                  `IF(AND(G${row}="",H${row}=""),"",N(G${row})+N(H${row}))`,
              };

              worksheet.getCell(
                `J${row}`,
              ).value = {
                formula:
                  `IFERROR(I${row}/F${row},"-")`,
              };

              worksheet.getCell(
                `J${row}`,
              ).numFmt =
                '0%';
            }
          };

        clearOrderBlock({
          titleRow: 1,
          itemStartRow: 7,
          itemEndRow: 27,
        });

        let systemSheet =
          workbook.getWorksheet(
            '_SYSTEM',
          );

        if (!systemSheet) {
          systemSheet =
            workbook.addWorksheet(
              '_SYSTEM',
            );
        }

        systemSheet.getCell(
          'A1',
        ).value =
          'template_version';

        systemSheet.getCell(
          'B1',
        ).value =
          TEMPLATE_VERSION;

        systemSheet.getCell(
          'A2',
        ).value =
          'project_name';

        systemSheet.getCell(
          'B2',
        ).value =
          projectName;

        systemSheet.getCell(
          'A3',
        ).value =
          'downloaded_at';

        systemSheet.getCell(
          'B3',
        ).value =
          new Date();

        systemSheet.state =
          'veryHidden';

        const outputBuffer =
          await workbook.xlsx.writeBuffer();

        const blob =
          new Blob(
            [outputBuffer],
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
          `자재발주서_${safeFileName(
            projectName,
          )}_${today.replace(
            /-/g,
            '',
          )}.xlsx`;

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

        setMessage({
          severity:
            'success',
          text:
            '현재 현장명과 작성일을 반영한 자재발주서 양식을 다운로드했습니다.',
        });
      } catch (error) {
        console.error(
          '자재발주서 다운로드 실패:',
          error,
        );

        setMessage({
          severity: 'error',
          text:
            error?.message ||
            '자재발주서 양식을 다운로드하지 못했습니다.',
        });
      } finally {
        setDownloading(false);
      }
    };

  const analyzeFile =
    async (file) => {
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
      setMessage(null);

      try {
        const result =
          await parseOrderWorkbook({
            file,
            projectName,
          });

        setAnalysis(
          result,
        );

        if (
          result.errors.length >
          0
        ) {
          setMessage({
            severity: 'error',
            text:
              '양식 오류가 발견되었습니다. 아래 오류 내용을 확인해주세요.',
          });
        } else {
          setMessage({
            severity:
              'success',
            text:
              `${result.orders.length}건의 발주서와 ${result.totalItemCount}개 발주 품목을 확인했습니다.`,
          });
        }
      } catch (error) {
        console.error(
          '자재발주서 분석 실패:',
          error,
        );

        setMessage({
          severity: 'error',
          text:
            error?.message ||
            '엑셀 파일을 분석하지 못했습니다.',
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

  const handleFileChange =
    (event) => {
      const file =
        event.target.files?.[0];

      analyzeFile(file);
    };

  const handleSave =
    async () => {
      if (
        !analysis ||
        analysis.errors.length >
          0 ||
        analysis.orders.length ===
          0
      ) {
        return;
      }

      setSaving(true);
      setMessage(null);

      try {
        const {
          data: authData,
        } =
          await supabase.auth.getUser();

        const userEmail =
          authData?.user?.email ||
          '';

        let savedOrderCount =
          0;

        let duplicateOrderCount =
          0;

        let savedItemCount =
          0;

        for (
          const order of
          analysis.orders
        ) {
          const {
            data: existing,
            error:
              existingError,
          } = await supabase
            .from(
              'material_orders',
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
            .eq(
              'source_sheet_name',
              order.sheetName,
            )
            .eq(
              'source_block_no',
              order.blockNo,
            )
            .maybeSingle();

          if (existingError) {
            throw existingError;
          }

          if (existing?.id) {
            duplicateOrderCount +=
              1;

            continue;
          }

          const orderCode =
            [
              (
                order.orderDate ||
                getKoreaTodayKey()
              ).replace(
                /-/g,
                '',
              ),
              analysis.fileHash.slice(
                0,
                8,
              ),
              order.blockNo,
            ].join('-');

          const {
            data:
              insertedOrder,
            error:
              orderInsertError,
          } = await supabase
            .from(
              'material_orders',
            )
            .insert({
              project_name:
                projectName,
              order_code:
                orderCode,
              order_date:
                order.orderDate,
              delivery_date:
                order.deliveryDate ||
                null,
              author_name:
                order.authorName ||
                null,
              delivery_location:
                order.deliveryLocation ||
                null,
              receiver_name:
                order.receiverName ||
                null,
              receiver_phone:
                order.receiverPhone ||
                null,
              source_file_name:
                analysis.fileName,
              source_file_hash:
                analysis.fileHash,
              source_sheet_name:
                order.sheetName,
              source_block_no:
                order.blockNo,
              template_version:
                analysis.templateVersion,
              status: 'saved',
              raw_metadata: {
                excelProjectName:
                  order.excelProjectName,
                ignoredRowCount:
                  order.ignoredRowCount,
              },
              created_by:
                userEmail ||
                null,
            })
            .select('id')
            .single();

          if (orderInsertError) {
            throw orderInsertError;
          }

          const itemPayload =
            order.items.map(
              (item) => ({
                order_id:
                  insertedOrder.id,
                line_no:
                  item.lineNo,
                source_row:
                  item.sourceRow,
                category:
                  item.category ||
                  null,
                item_name:
                  item.itemName,
                specification:
                  item.specification ||
                  null,
                unit:
                  item.unit ||
                  null,
                execution_quantity:
                  item.executionQuantity,
                previous_order_quantity:
                  item.previousOrderQuantity,
                current_order_quantity:
                  item.currentOrderQuantity,
                cumulative_order_quantity:
                  item.cumulativeOrderQuantity,
                execution_ratio:
                  item.executionRatio,
                note:
                  item.note ||
                  null,
                raw_row:
                  item.rawRow,
              }),
            );

          try {
            for (
              const chunk of
              splitIntoChunks(
                itemPayload,
                ITEM_INSERT_CHUNK_SIZE,
              )
            ) {
              const {
                error:
                  itemInsertError,
              } = await supabase
                .from(
                  'material_order_items',
                )
                .insert(
                  chunk,
                );

              if (
                itemInsertError
              ) {
                throw itemInsertError;
              }
            }
          } catch (itemError) {
            await supabase
              .from(
                'material_orders',
              )
              .delete()
              .eq(
                'id',
                insertedOrder.id,
              );

            throw itemError;
          }

          savedOrderCount +=
            1;

          savedItemCount +=
            itemPayload.length;
        }

        const duplicateText =
          duplicateOrderCount >
          0
            ? ` · 중복 ${duplicateOrderCount}건 제외`
            : '';

        setMessage({
          severity:
            'success',
          text:
            `${savedOrderCount}건의 발주서와 ${savedItemCount}개 품목을 저장했습니다.${duplicateText}`,
        });

        await loadRecentOrders();
      } catch (error) {
        console.error(
          '자재발주 저장 실패:',
          error,
        );

        setMessage({
          severity: 'error',
          text:
            error?.code ===
              '42P01'
              ? '자재발주 테이블이 없습니다. 제공된 SQL을 먼저 실행해주세요.'
              : error?.message ||
                '자재발주 데이터를 저장하지 못했습니다.',
        });
      } finally {
        setSaving(false);
      }
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
          p: 1.3,
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
            자재발주작성
          </Typography>

          <Typography
            sx={{
              mt: 0.2,
              color: '#64748b',
              fontSize:
                '0.7rem',
            }}
          >
            양식 다운로드 → 담당자 작성 → 엑셀 업로드 → 검토 후 저장
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.7,
          }}
        >
          <Button
            variant="outlined"
            onClick={() =>
              setGuideOpen(true)
            }
            sx={{
              fontWeight: 800,
            }}
          >
            작성 안내
          </Button>

          <Button
            variant="contained"
            color="success"
            startIcon={
              downloading
                ? (
                  <CircularProgress
                    size={16}
                    color="inherit"
                  />
                )
                : (
                  <DownloadIcon />
                )
            }
            onClick={
              handleDownloadTemplate
            }
            disabled={
              downloading ||
              !projectName
            }
            sx={{
              fontWeight: 900,
            }}
          >
            발주서 양식 다운로드
          </Button>

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
            작성 발주서 업로드
          </Button>
        </Box>
      </Paper>

      {(
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

      {analysis && (
        <Paper
          variant="outlined"
          sx={{
            p: 1.2,
            borderColor:
              analysis.errors
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
                업로드 파일 검토
              </Typography>

              <Typography
                sx={{
                  mt: 0.15,
                  color:
                    '#64748b',
                  fontSize:
                    '0.66rem',
                }}
              >
                {analysis.fileName}
                {' · '}
                양식 버전{' '}
                {
                  analysis.templateVersion
                }
              </Typography>
            </Box>

            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
              }}
            >
              <Chip
                size="small"
                label={`발주서 ${analysis.orders.length}건`}
              />

              <Chip
                size="small"
                color="primary"
                label={`품목 ${analysis.totalItemCount}개`}
              />

              <Chip
                size="small"
                color="success"
                label={`금회수량 ${formatNumber(analysis.totalCurrentQuantity)}`}
              />
            </Box>
          </Box>

          {analysis.errors.map(
            (error, index) => (
              <Alert
                key={`error-${index}`}
                severity="error"
                sx={{ mt: 0.7 }}
              >
                {error}
              </Alert>
            ),
          )}

          {analysis.warnings.map(
            (
              warning,
              index,
            ) => (
              <Alert
                key={`warning-${index}`}
                severity="warning"
                sx={{ mt: 0.7 }}
              >
                {warning}
              </Alert>
            ),
          )}

          <TableContainer
            sx={{
              mt: 1,
              maxHeight: 350,
              border:
                '1px solid #e2e8f0',
            }}
          >
            <Table
              stickyHeader
              size="small"
            >
              <TableHead>
                <TableRow>
                  {[
                    '발주서',
                    '작성일',
                    '납품일',
                    '분류',
                    '품명',
                    '규격',
                    '단위',
                    '실행물량',
                    '전회발주',
                    '금회발주',
                    '예상누계',
                    '비고',
                  ].map(
                    (header) => (
                      <TableCell
                        key={header}
                        align={
                          [
                            '실행물량',
                            '전회발주',
                            '금회발주',
                            '예상누계',
                          ].includes(
                            header,
                          )
                            ? 'right'
                            : 'left'
                        }
                        sx={{
                          fontWeight: 900,
                          bgcolor:
                            '#f8fafc',
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
                {previewItems
                  .slice(0, 300)
                  .map(
                    (
                      item,
                      index,
                    ) => (
                      <TableRow
                        key={`${item.sheetName}-${item.blockNo}-${item.sourceRow}-${index}`}
                        hover
                      >
                        <TableCell>
                          {item.blockNo}
                        </TableCell>

                        <TableCell>
                          {formatDate(
                            item.orderDate,
                          )}
                        </TableCell>

                        <TableCell>
                          {formatDate(
                            item.deliveryDate,
                          )}
                        </TableCell>

                        <TableCell>
                          {item.category ||
                            '-'}
                        </TableCell>

                        <TableCell
                          sx={{
                            fontWeight: 800,
                            minWidth: 150,
                          }}
                        >
                          {item.itemName}
                        </TableCell>

                        <TableCell>
                          {item.specification ||
                            '-'}
                        </TableCell>

                        <TableCell>
                          {item.unit ||
                            '-'}
                        </TableCell>

                        <TableCell align="right">
                          {item.executionQuantity ===
                          null
                            ? '-'
                            : formatNumber(
                                item.executionQuantity,
                              )}
                        </TableCell>

                        <TableCell align="right">
                          {item.previousOrderQuantity ===
                          null
                            ? '-'
                            : formatNumber(
                                item.previousOrderQuantity,
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
                          {formatNumber(
                            item.currentOrderQuantity,
                          )}
                        </TableCell>

                        <TableCell align="right">
                          {formatNumber(
                            item.cumulativeOrderQuantity,
                          )}
                        </TableCell>

                        <TableCell>
                          {item.note ||
                            ''}
                        </TableCell>
                      </TableRow>
                    ),
                  )}
              </TableBody>
            </Table>
          </TableContainer>

          {previewItems.length >
            300 && (
            <Typography
              sx={{
                mt: 0.5,
                color: '#64748b',
                fontSize:
                  '0.66rem',
              }}
            >
              미리보기는 앞의 300개 품목까지만 표시됩니다. 전체 품목은 모두 저장됩니다.
            </Typography>
          )}

          <Box
            sx={{
              mt: 1,
              display: 'flex',
              justifyContent:
                'flex-end',
            }}
          >
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
              disabled={
                saving ||
                analysis.errors
                  .length > 0 ||
                analysis.orders
                  .length === 0
              }
              onClick={
                handleSave
              }
              sx={{
                fontWeight: 900,
              }}
            >
              검토한 발주서 저장
            </Button>
          </Box>
        </Paper>
      )}

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
        <Box
          sx={{
            px: 1.2,
            py: 0.8,
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'space-between',
          }}
        >
          <Typography
            sx={{
              color: '#334155',
              fontSize:
                '0.78rem',
              fontWeight: 900,
            }}
          >
            최근 저장 발주서
          </Typography>

          <Button
            size="small"
            startIcon={
              <RefreshIcon />
            }
            onClick={
              loadRecentOrders
            }
            disabled={
              recentLoading
            }
          >
            새로고침
          </Button>
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
          >
            <TableHead>
              <TableRow>
                {[
                  '발주번호',
                  '작성일',
                  '납품일',
                  '작성자',
                  '원본 파일',
                  '시트/발주서',
                  '저장시각',
                ].map(
                  (header) => (
                    <TableCell
                      key={header}
                      sx={{
                        fontWeight: 900,
                        bgcolor:
                          '#f8fafc',
                      }}
                    >
                      {header}
                    </TableCell>
                  ),
                )}
              </TableRow>
            </TableHead>

            <TableBody>
              {recentOrders.map(
                (order) => (
                  <TableRow
                    key={order.id}
                    hover
                  >
                    <TableCell
                      sx={{
                        fontWeight: 800,
                      }}
                    >
                      {order.order_code}
                    </TableCell>

                    <TableCell>
                      {formatDate(
                        order.order_date,
                      )}
                    </TableCell>

                    <TableCell>
                      {formatDate(
                        order.delivery_date,
                      )}
                    </TableCell>

                    <TableCell>
                      {order.author_name ||
                        '-'}
                    </TableCell>

                    <TableCell>
                      {order.source_file_name}
                    </TableCell>

                    <TableCell>
                      {order.source_sheet_name}
                      {' / '}
                      {order.source_block_no}
                    </TableCell>

                    <TableCell>
                      {order.created_at
                        ? new Date(
                            order.created_at,
                          ).toLocaleString(
                            'ko-KR',
                          )
                        : '-'}
                    </TableCell>
                  </TableRow>
                ),
              )}

              {!recentLoading &&
                recentOrders.length ===
                  0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    align="center"
                    sx={{
                      py: 4,
                      color:
                        '#94a3b8',
                    }}
                  >
                    저장된 자재발주서가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog
        open={guideOpen}
        onClose={() =>
          setGuideOpen(false)
        }
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle
          sx={{
            fontWeight: 900,
          }}
        >
          자재발주서 작성 및 업로드 안내
        </DialogTitle>

        <DialogContent
          dividers
        >
          <Typography
            sx={{
              fontSize:
                '0.76rem',
              lineHeight: 1.7,
            }}
          >
            1. 반드시 이 화면의 ‘발주서 양식 다운로드’ 버튼으로 양식을 받습니다.
            <br />
            2. 품명·규격·단위·실행물량·전회발주량·금회발주량·비고를 입력합니다.
            <br />
            3. 자재 분류 행은 품명 칸에 ‘■ 경량골조’처럼 입력할 수 있습니다.
            <br />
            4. 금회발주량이 0보다 큰 행만 이번 발주 품목으로 저장됩니다.
            <br />
            5. 한 파일에는 발주서 한 장이 들어 있으며, 금회발주량이 입력된 품목만 저장됩니다.
            <br />
            6. 열 제목 또는 발주서 구조가 바뀌면 저장 전에 오류 안내가 표시됩니다.
            <br />
            7. 동일 파일을 다시 업로드하면 파일 해시를 확인해 중복 저장을 막습니다.
          </Typography>

          <Alert
            severity="info"
            sx={{ mt: 1 }}
          >
            자재 종류는 미리 등록하지 않아도 됩니다. 품명·규격·단위는 자유롭게 입력할 수 있으며, 새로운 자재도 그대로 저장됩니다.
          </Alert>
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              setGuideOpen(
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
