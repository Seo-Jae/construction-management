import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExcelJS from 'exceljs';
import { supabase } from '../supabaseClient';

const PAGE_SIZE = 1000;

const normalizeText = (
  value,
) =>
  String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const normalizeSearch = (
  value,
) =>
  normalizeText(value)
    .replace(/\s+/g, '')
    .toLowerCase();

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

  const nextMonth =
    new Date(
      year,
      month,
      1,
    );

  const endDate =
    new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      0,
    );

  const end =
    [
      endDate.getFullYear(),
      String(
        endDate.getMonth() +
          1,
      ).padStart(2, '0'),
      String(
        endDate.getDate(),
      ).padStart(2, '0'),
    ].join('-');

  return {
    start,
    end,
    label:
      `${year}년 ${month}월`,
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

const getOrderObject = (
  joinedValue,
) =>
  Array.isArray(
    joinedValue,
  )
    ? joinedValue[0] ||
      null
    : joinedValue ||
      null;

const aggregateRows = ({
  rows,
  monthStart,
  monthEnd,
}) => {
  const map = new Map();

  rows.forEach((row) => {
    const order =
      getOrderObject(
        row.material_orders,
      );

    if (!order) {
      return;
    }

    const basisDate =
      order.delivery_date ||
      order.order_date;

    if (
      !basisDate ||
      basisDate >
        monthEnd
    ) {
      return;
    }

    const key = [
      normalizeText(
        row.category,
      ),
      normalizeText(
        row.item_name,
      ),
      normalizeText(
        row.specification,
      ),
      normalizeText(
        row.unit,
      ),
    ].join('|');

    if (!map.has(key)) {
      map.set(key, {
        category:
          normalizeText(
            row.category,
          ),
        itemName:
          normalizeText(
            row.item_name,
          ),
        specification:
          normalizeText(
            row.specification,
          ),
        unit:
          normalizeText(
            row.unit,
          ),
        previousCumulative: 0,
        monthlyQuantity: 0,
        cumulativeQuantity: 0,
        monthlyOrderIds:
          new Set(),
        cumulativeOrderIds:
          new Set(),
        latestOrderDate:
          '',
      });
    }

    const target =
      map.get(key);

    const quantity =
      Number(
        row.current_order_quantity ||
          0,
      );

    target.cumulativeQuantity +=
      quantity;

    target.cumulativeOrderIds.add(
      row.order_id,
    );

    if (
      basisDate <
      monthStart
    ) {
      target.previousCumulative +=
        quantity;
    }

    if (
      basisDate >=
        monthStart &&
      basisDate <=
        monthEnd
    ) {
      target.monthlyQuantity +=
        quantity;

      target.monthlyOrderIds.add(
        row.order_id,
      );
    }

    if (
      !target.latestOrderDate ||
      basisDate >
        target.latestOrderDate
    ) {
      target.latestOrderDate =
        basisDate;
    }
  });

  return Array.from(
    map.values(),
  )
    .map((row) => ({
      ...row,
      monthlyOrderCount:
        row.monthlyOrderIds
          .size,
      cumulativeOrderCount:
        row.cumulativeOrderIds
          .size,
    }))
    .sort(
      (first, second) =>
        (
          first.category ||
          ''
        ).localeCompare(
          second.category ||
            '',
          'ko',
          {
            numeric: true,
          },
        ) ||
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
  const [
    selectedMonth,
    setSelectedMonth,
  ] = useState(
    getKoreaMonthKey(),
  );

  const [
    rows,
    setRows,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const [
    searchText,
    setSearchText,
  ] = useState('');

  const [
    selectedCategory,
    setSelectedCategory,
  ] = useState('');

  const monthRange =
    useMemo(
      () =>
        getMonthRange(
          selectedMonth,
        ),
      [selectedMonth],
    );

  const loadRows =
    useCallback(async () => {
      if (!projectName) {
        setRows([]);
        return;
      }

      setLoading(true);
      setErrorMessage('');

      try {
        const allRows = [];
        let from = 0;

        while (true) {
          const {
            data,
            error,
          } = await supabase
            .from(
              'material_order_items',
            )
            .select(
              `
              order_id,
              category,
              item_name,
              specification,
              unit,
              current_order_quantity,
              material_orders!inner(
                project_name,
                order_date,
                delivery_date,
                status
              )
            `,
            )
            .eq(
              'material_orders.project_name',
              projectName,
            )
            .eq(
              'material_orders.status',
              'saved',
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

        setRows(allRows);
      } catch (error) {
        console.error(
          '자재투입현황 조회 실패:',
          error,
        );

        setRows([]);

        setErrorMessage(
          error?.code ===
            '42P01'
            ? '자재발주 테이블이 없습니다. 제공된 SQL을 먼저 실행해주세요.'
            : error?.message ||
                '자재투입현황을 불러오지 못했습니다.',
        );
      } finally {
        setLoading(false);
      }
    }, [projectName]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const aggregatedRows =
    useMemo(
      () =>
        aggregateRows({
          rows,
          monthStart:
            monthRange.start,
          monthEnd:
            monthRange.end,
        }),
      [
        monthRange.end,
        monthRange.start,
        rows,
      ],
    );

  const categoryOptions =
    useMemo(
      () =>
        Array.from(
          new Set(
            aggregatedRows
              .map(
                (row) =>
                  row.category,
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
      [aggregatedRows],
    );

  const normalizedSearch =
    normalizeSearch(
      searchText,
    );

  const filteredRows =
    useMemo(
      () =>
        aggregatedRows.filter(
          (row) => {
            const categoryMatched =
              !selectedCategory ||
              row.category ===
                selectedCategory;

            const searchMatched =
              !normalizedSearch ||
              [
                row.category,
                row.itemName,
                row.specification,
                row.unit,
              ].some(
                (value) =>
                  normalizeSearch(
                    value,
                  ).includes(
                    normalizedSearch,
                  ),
              );

            return (
              categoryMatched &&
              searchMatched
            );
          },
        ),
      [
        aggregatedRows,
        normalizedSearch,
        selectedCategory,
      ],
    );

  const totals =
    useMemo(
      () =>
        filteredRows.reduce(
          (
            result,
            row,
          ) => ({
            previousCumulative:
              result.previousCumulative +
              row.previousCumulative,
            monthlyQuantity:
              result.monthlyQuantity +
              row.monthlyQuantity,
            cumulativeQuantity:
              result.cumulativeQuantity +
              row.cumulativeQuantity,
          }),
          {
            previousCumulative: 0,
            monthlyQuantity: 0,
            cumulativeQuantity: 0,
          },
        ),
      [filteredRows],
    );

  const handleExcelDownload =
    async () => {
      const workbook =
        new ExcelJS.Workbook();

      const worksheet =
        workbook.addWorksheet(
          '자재투입현황',
        );

      worksheet.addRow([
        '분류',
        '품명',
        '규격',
        '단위',
        '전월누계',
        `${monthRange.label} 발주량`,
        '누계발주량',
        '금월발주횟수',
        '누계발주횟수',
        '최종발주일',
      ]);

      filteredRows.forEach(
        (row) => {
          worksheet.addRow([
            row.category,
            row.itemName,
            row.specification,
            row.unit,
            row.previousCumulative,
            row.monthlyQuantity,
            row.cumulativeQuantity,
            row.monthlyOrderCount,
            row.cumulativeOrderCount,
            row.latestOrderDate,
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
              18,
              26,
              18,
              10,
              14,
              16,
              14,
              14,
              14,
              14,
            ][index] || 14;

          column.alignment = {
            vertical:
              'middle',
            horizontal:
              index >= 4 &&
              index <= 8
                ? 'right'
                : 'left',
          };
        },
      );

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
        `자재투입현황_${selectedMonth}.xlsx`;

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
            발주서의 금회발주량을 기준으로 월별 발주량과 누계값을 조회합니다.
          </Typography>
        </Box>

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
              categoryOptions
            }
            inputValue={
              selectedCategory
            }
            onInputChange={(
              _event,
              value,
            ) =>
              setSelectedCategory(
                value,
              )
            }
            onChange={(
              _event,
              value,
            ) =>
              setSelectedCategory(
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
                label="자재 분류"
                placeholder="예: 경량골조"
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
            sx={{
              width: 220,
            }}
          />

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
              loadRows
            }
            disabled={
              loading
            }
          >
            새로고침
          </Button>

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
              loading ||
              filteredRows.length ===
                0
            }
          >
            엑셀 다운로드
          </Button>
        </Box>
      </Paper>

      {errorMessage && (
        <Alert severity="error">
          {errorMessage}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(4, minmax(0, 1fr))',
          gap: 0.8,
        }}
      >
        {[
          {
            label:
              '조회 품목수',
            value:
              filteredRows.length,
          },
          {
            label:
              '전월 누계',
            value:
              totals.previousCumulative,
          },
          {
            label:
              `${monthRange.label} 발주량`,
            value:
              totals.monthlyQuantity,
          },
          {
            label:
              '누계 발주량',
            value:
              totals.cumulativeQuantity,
          },
        ].map(
          (card) => (
            <Paper
              key={card.label}
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
                {card.label}
              </Typography>

              <Typography
                sx={{
                  mt: 0.2,
                  color:
                    '#0f172a',
                  fontSize:
                    '1.05rem',
                  fontWeight: 900,
                }}
              >
                {formatNumber(
                  card.value,
                )}
              </Typography>
            </Paper>
          ),
        )}
      </Box>

      <Paper
        variant="outlined"
        sx={{
          position: 'relative',
          flexGrow: 1,
          minHeight: 0,
          overflow: 'hidden',
          borderColor:
            '#cbd5e1',
          boxShadow: 'none',
        }}
      >
        {loading && (
          <Box
            sx={{
              position:
                'absolute',
              inset: 0,
              zIndex: 10,
              display: 'flex',
              alignItems:
                'center',
              justifyContent:
                'center',
              bgcolor:
                'rgba(255,255,255,0.8)',
            }}
          >
            <CircularProgress />
          </Box>
        )}

        <TableContainer
          sx={{
            width: '100%',
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
                  '분류',
                  '품명',
                  '규격',
                  '단위',
                  '전월누계',
                  `${monthRange.label} 발주량`,
                  '누계발주량',
                  '금월발주횟수',
                  '누계발주횟수',
                  '최종발주일',
                ].map(
                  (
                    header,
                    index,
                  ) => (
                    <TableCell
                      key={header}
                      align={
                        index >= 4 &&
                        index <= 8
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
              {filteredRows.map(
                (row) => (
                  <TableRow
                    key={[
                      row.category,
                      row.itemName,
                      row.specification,
                      row.unit,
                    ].join('|')}
                    hover
                  >
                    <TableCell>
                      {row.category ||
                        '-'}
                    </TableCell>

                    <TableCell
                      sx={{
                        minWidth: 180,
                        fontWeight: 800,
                      }}
                    >
                      {row.itemName}
                    </TableCell>

                    <TableCell>
                      {row.specification ||
                        '-'}
                    </TableCell>

                    <TableCell>
                      {row.unit ||
                        '-'}
                    </TableCell>

                    <TableCell align="right">
                      {formatNumber(
                        row.previousCumulative,
                      )}
                    </TableCell>

                    <TableCell
                      align="right"
                      sx={{
                        color:
                          row.monthlyQuantity >
                          0
                            ? '#1d4ed8'
                            : '#94a3b8',
                        fontWeight: 900,
                      }}
                    >
                      {formatNumber(
                        row.monthlyQuantity,
                      )}
                    </TableCell>

                    <TableCell
                      align="right"
                      sx={{
                        fontWeight: 900,
                      }}
                    >
                      {formatNumber(
                        row.cumulativeQuantity,
                      )}
                    </TableCell>

                    <TableCell align="right">
                      {formatNumber(
                        row.monthlyOrderCount,
                      )}
                    </TableCell>

                    <TableCell align="right">
                      {formatNumber(
                        row.cumulativeOrderCount,
                      )}
                    </TableCell>

                    <TableCell>
                      {row.latestOrderDate ||
                        '-'}
                    </TableCell>
                  </TableRow>
                ),
              )}

              {!loading &&
                filteredRows.length ===
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
                    조회 조건에 맞는 자재발주 데이터가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
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
        현재 1차 버전은 발주서의 금회발주량을 자재 투입량으로 집계합니다. 실제 납품 완료량을 별도로 관리하려면 이후 입고확인 기능을 추가해 발주량과 실제 투입량을 분리할 수 있습니다.
      </Alert>
    </Box>
  );
}
