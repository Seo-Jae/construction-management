import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';
import WeeklyOverview from './WeeklyOverview.jsx';

const PAGE_SIZE = 1000;

const formatKoreaDate = (
  date = new Date(),
) => {
  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      },
    );

  const values = {};

  formatter
    .formatToParts(date)
    .forEach((part) => {
      if (part.type !== 'literal') {
        values[part.type] =
          part.value;
      }
    });

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );
};

const addMonths = (
  dateKey,
  months,
) => {
  const [year, month, day] =
    String(dateKey)
      .split('-')
      .map(Number);

  const date = new Date(
    Date.UTC(
      year,
      month - 1 + months,
      day,
    ),
  );

  return [
    date.getUTCFullYear(),
    String(
      date.getUTCMonth() + 1,
    ).padStart(2, '0'),
    String(
      date.getUTCDate(),
    ).padStart(2, '0'),
  ].join('-');
};

const formatDisplayDate = (
  dateKey,
) =>
  String(dateKey || '')
    .replace(/-/g, '.');

const formatUpdatedAt = (
  value,
) => {
  if (!value) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat(
      'ko-KR',
      {
        timeZone:
          'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      },
    ).format(
      new Date(value),
    );
  } catch {
    return '';
  }
};

const fetchAllSavedOverviews =
  async () => {
    const rows = [];
    let from = 0;

    while (true) {
      const {
        data,
        error,
      } = await supabase
        .from(
          'weekly_overviews',
        )
        .select(
          `
          id,
          week_start,
          week_end,
          display_period,
          updated_by_name,
          created_at,
          updated_at
        `,
        )
        .order(
          'week_start',
          {
            ascending: false,
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

      const nextRows =
        data || [];

      rows.push(...nextRows);

      if (
        nextRows.length <
        PAGE_SIZE
      ) {
        break;
      }

      from += PAGE_SIZE;
    }

    return rows;
  };

export default function WeeklyOverviewArchive({
  userProfile,
}) {
  const [items, setItems] =
    useState([]);

  const [
    selectedWeekStart,
    setSelectedWeekStart,
  ] = useState('');

  const [startDate, setStartDate] =
    useState('');

  const [endDate, setEndDate] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const loadItems =
    useCallback(async () => {
      setLoading(true);
      setErrorMessage('');

      try {
        const rows =
          await fetchAllSavedOverviews();

        setItems(rows);

        setSelectedWeekStart(
          (previous) => {
            if (
              previous &&
              rows.some(
                (row) =>
                  row.week_start ===
                  previous,
              )
            ) {
              return previous;
            }

            return (
              rows[0]
                ?.week_start ||
              ''
            );
          },
        );
      } catch (error) {
        console.error(
          '주간업무 보관함 조회 실패:',
          error,
        );

        setItems([]);
        setSelectedWeekStart(
          '',
        );

        setErrorMessage(
          error?.message ||
            '저장된 주간업무를 불러오지 못했습니다.',
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const filteredItems =
    useMemo(
      () =>
        items.filter(
          (item) => {
            if (
              startDate &&
              item.week_start <
                startDate
            ) {
              return false;
            }

            if (
              endDate &&
              item.week_start >
                endDate
            ) {
              return false;
            }

            return true;
          },
        ),
      [
        endDate,
        items,
        startDate,
      ],
    );

  useEffect(() => {
    if (
      filteredItems.length ===
      0
    ) {
      setSelectedWeekStart(
        '',
      );
      return;
    }

    const stillVisible =
      filteredItems.some(
        (item) =>
          item.week_start ===
          selectedWeekStart,
      );

    if (!stillVisible) {
      setSelectedWeekStart(
        filteredItems[0]
          .week_start,
      );
    }
  }, [
    filteredItems,
    selectedWeekStart,
  ]);

  const applyRecentMonths = (
    months,
  ) => {
    const today =
      formatKoreaDate();

    setEndDate(today);
    setStartDate(
      addMonths(
        today,
        -months,
      ),
    );
  };

  const selectedItem =
    filteredItems.find(
      (item) =>
        item.week_start ===
        selectedWeekStart,
    ) || null;

  return (
    <Box
      sx={{
        width: '100%',
        height:
          'calc(100vh - 88px)',
        minHeight: 650,
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          xl:
            '330px minmax(0, 1fr)',
        },
        gap: 1.2,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          borderColor: '#cbd5e1',
          bgcolor: '#ffffff',
          boxShadow: 'none',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            px: 1.2,
            py: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'space-between',
            gap: 0.7,
            borderBottom:
              '1px solid #e2e8f0',
          }}
        >
          <Box>
            <Typography
              sx={{
                color: '#0f172a',
                fontSize: '0.86rem',
                fontWeight: 900,
              }}
            >
              주간업무보관
            </Typography>

            <Typography
              sx={{
                mt: 0.15,
                color: '#64748b',
                fontSize: '0.64rem',
              }}
            >
              저장된 주차{' '}
              {filteredItems.length}건
            </Typography>
          </Box>

          <Button
            size="small"
            variant="outlined"
            onClick={loadItems}
            disabled={loading}
            sx={{
              minWidth: 58,
              px: 0.65,
              fontSize: '0.62rem',
              fontWeight: 900,
            }}
          >
            새로고침
          </Button>
        </Box>

        <Box
          sx={{
            p: 1,
            display: 'grid',
            gap: 0.7,
            borderBottom:
              '1px solid #e2e8f0',
            bgcolor: '#f8fafc',
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(4, minmax(0, 1fr))',
              gap: 0.4,
            }}
          >
            <Button
              size="small"
              variant={
                !startDate &&
                !endDate
                  ? 'contained'
                  : 'outlined'
              }
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              sx={{
                px: 0.4,
                fontSize: '0.59rem',
                fontWeight: 900,
              }}
            >
              전체
            </Button>

            {[3, 6, 12].map(
              (months) => (
                <Button
                  key={months}
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    applyRecentMonths(
                      months,
                    )
                  }
                  sx={{
                    px: 0.35,
                    fontSize:
                      '0.59rem',
                    fontWeight: 900,
                  }}
                >
                  {months}개월
                </Button>
              ),
            )}
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns:
                '1fr 1fr',
              gap: 0.55,
            }}
          >
            <TextField
              size="small"
              type="date"
              label="시작일"
              value={startDate}
              onChange={(event) =>
                setStartDate(
                  event.target.value,
                )
              }
              InputLabelProps={{
                shrink: true,
              }}
              sx={{
                '& .MuiInputBase-input':
                  {
                    fontSize:
                      '0.65rem',
                  },
              }}
            />

            <TextField
              size="small"
              type="date"
              label="종료일"
              value={endDate}
              onChange={(event) =>
                setEndDate(
                  event.target.value,
                )
              }
              InputLabelProps={{
                shrink: true,
              }}
              sx={{
                '& .MuiInputBase-input':
                  {
                    fontSize:
                      '0.65rem',
                  },
              }}
            />
          </Box>
        </Box>

        {errorMessage && (
          <Alert
            severity="error"
            sx={{
              m: 1,
              fontSize: '0.67rem',
            }}
          >
            {errorMessage}
          </Alert>
        )}

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          {loading ? (
            <Box
              sx={{
                minHeight: 220,
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  'center',
                gap: 0.7,
              }}
            >
              <CircularProgress
                size={18}
              />

              <Typography
                sx={{
                  color: '#64748b',
                  fontSize: '0.7rem',
                }}
              >
                저장본을 불러오는 중입니다.
              </Typography>
            </Box>
          ) : filteredItems.length ===
            0 ? (
            <Box
              sx={{
                minHeight: 220,
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  'center',
                px: 2,
                textAlign: 'center',
              }}
            >
              <Typography
                sx={{
                  color: '#64748b',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}
              >
                선택한 기간에 저장된 주간업무가 없습니다.
              </Typography>
            </Box>
          ) : (
            filteredItems.map(
              (item, index) => {
                const selected =
                  item.week_start ===
                  selectedWeekStart;

                return (
                  <React.Fragment
                    key={item.id}
                  >
                    <Box
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setSelectedWeekStart(
                          item.week_start,
                        )
                      }
                      onKeyDown={(
                        event,
                      ) => {
                        if (
                          event.key ===
                            'Enter' ||
                          event.key ===
                            ' '
                        ) {
                          setSelectedWeekStart(
                            item.week_start,
                          );
                        }
                      }}
                      sx={{
                        px: 1.1,
                        py: 0.95,
                        cursor: 'pointer',
                        bgcolor: selected
                          ? '#eff6ff'
                          : '#ffffff',
                        borderLeft: selected
                          ? '4px solid #2563eb'
                          : '4px solid transparent',
                        '&:hover': {
                          bgcolor: selected
                            ? '#dbeafe'
                            : '#f8fafc',
                        },
                      }}
                    >
                      <Typography
                        sx={{
                          color: '#0f172a',
                          fontSize:
                            '0.73rem',
                          fontWeight: 900,
                        }}
                      >
                        {formatDisplayDate(
                          item.week_start,
                        )}
                        {' ~ '}
                        {formatDisplayDate(
                          item.week_end,
                        )}
                      </Typography>

                      <Typography
                        noWrap
                        sx={{
                          mt: 0.25,
                          color: '#64748b',
                          fontSize:
                            '0.62rem',
                        }}
                      >
                        저장자:{' '}
                        {item.updated_by_name ||
                          '확인불가'}
                      </Typography>

                      <Typography
                        sx={{
                          mt: 0.1,
                          color: '#94a3b8',
                          fontSize:
                            '0.58rem',
                        }}
                      >
                        {formatUpdatedAt(
                          item.updated_at,
                        )}
                      </Typography>
                    </Box>

                    {index <
                      filteredItems.length -
                        1 && (
                      <Divider />
                    )}
                  </React.Fragment>
                );
              },
            )
          )}
        </Box>
      </Paper>

      <Box
        sx={{
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {selectedItem ? (
          <WeeklyOverview
            key={
              selectedItem.week_start
            }
            userProfile={
              userProfile
            }
            readOnly
            weekStartOverride={
              selectedItem.week_start
            }
          />
        ) : (
          <Paper
            variant="outlined"
            sx={{
              height: '100%',
              minHeight: 620,
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                'center',
              borderColor:
                '#cbd5e1',
              bgcolor: '#ffffff',
              boxShadow: 'none',
            }}
          >
            <Typography
              sx={{
                color: '#64748b',
                fontSize: '0.8rem',
                fontWeight: 800,
              }}
            >
              왼쪽에서 저장된 주차를 선택해주세요.
            </Typography>
          </Paper>
        )}
      </Box>
    </Box>
  );
}
