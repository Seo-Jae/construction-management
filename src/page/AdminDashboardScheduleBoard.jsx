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
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';

const RECORD_ID = 'main-dashboard';

const WEEKDAY_LABELS = [
  '일',
  '월',
  '화',
  '수',
  '목',
  '금',
  '토',
];

const pad2 = (value) =>
  String(value).padStart(2, '0');

const toDateKey = (date) =>
  [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join('-');

const createId = () =>
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;

const createEmptyMeeting = () => ({
  id: createId(),
  dateTime: '',
  projectName: '',
  title: '',
  location: '',
});

const normalizeProjectSchedules = (
  projectNames,
  savedSchedules,
) => {
  const savedMap = new Map(
    (
      Array.isArray(savedSchedules)
        ? savedSchedules
        : []
    ).map((schedule) => [
      schedule.projectName,
      schedule,
    ]),
  );

  return projectNames.map((projectName) => {
    const saved =
      savedMap.get(projectName) || {};

    return {
      projectName,
      briefingAt:
        String(saved.briefingAt || ''),
      bidAt:
        String(saved.bidAt || ''),
      note:
        String(saved.note || ''),
    };
  });
};

const normalizeMeetings = (meetings) => {
  const rows = Array.isArray(meetings)
    ? meetings
    : [];

  if (rows.length === 0) {
    return [createEmptyMeeting()];
  }

  return rows.map((meeting) => ({
    id:
      String(meeting?.id || '') ||
      createId(),
    dateTime:
      String(meeting?.dateTime || ''),
    projectName:
      String(
        meeting?.projectName || '',
      ),
    title:
      String(meeting?.title || ''),
    location:
      String(meeting?.location || ''),
  }));
};

const getDatePart = (dateTime) =>
  String(dateTime || '').slice(0, 10);

const getTimePart = (dateTime) =>
  String(dateTime || '').slice(11, 16);

const getProjectShortName = (
  projectName,
) =>
  String(projectName || '')
    .replace('건설', '')
    .replace('공동주택', '')
    .trim();

const buildCalendarDays = (
  cursor,
) => {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const firstDay =
    new Date(year, month, 1);

  const gridStart =
    new Date(
      year,
      month,
      1 - firstDay.getDay(),
    );

  return Array.from(
    { length: 42 },
    (_, index) => {
      const date =
        new Date(gridStart);

      date.setDate(
        gridStart.getDate() + index,
      );

      return {
        date,
        dateKey: toDateKey(date),
        isCurrentMonth:
          date.getMonth() === month,
      };
    },
  );
};

const buildCalendarEvents = (
  siteSchedules,
  meetings,
) => {
  const map = new Map();

  const pushEvent = (
    dateKey,
    event,
  ) => {
    if (!dateKey) {
      return;
    }

    if (!map.has(dateKey)) {
      map.set(dateKey, []);
    }

    map.get(dateKey).push(event);
  };

  siteSchedules.forEach((schedule) => {
    const project =
      getProjectShortName(
        schedule.projectName,
      );

    pushEvent(
      getDatePart(
        schedule.briefingAt,
      ),
      {
        id:
          `briefing-${schedule.projectName}`,
        type: 'briefing',
        label:
          `현설 ${project}`,
        time:
          getTimePart(
            schedule.briefingAt,
          ),
      },
    );

    pushEvent(
      getDatePart(
        schedule.bidAt,
      ),
      {
        id:
          `bid-${schedule.projectName}`,
        type: 'bid',
        label:
          `입찰 ${project}`,
        time:
          getTimePart(
            schedule.bidAt,
          ),
      },
    );
  });

  meetings.forEach((meeting) => {
    if (
      !meeting.dateTime ||
      !meeting.title
    ) {
      return;
    }

    pushEvent(
      getDatePart(
        meeting.dateTime,
      ),
      {
        id:
          `meeting-${meeting.id}`,
        type: 'meeting',
        label:
          `회의 ${meeting.title}`,
        time:
          getTimePart(
            meeting.dateTime,
          ),
      },
    );
  });

  return map;
};

function PanelHeader({
  title,
  subtitle,
  saving,
  onSave,
  rightContent,
}) {
  return (
    <Box
      sx={{
        px: 1.1,
        py: 0.85,
        display: 'flex',
        alignItems: 'center',
        justifyContent:
          'space-between',
        gap: 1,
        borderBottom:
          '1px solid #e2e8f0',
        bgcolor: '#f8fafc',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            color: '#0f172a',
            fontSize: '0.82rem',
            fontWeight: 900,
          }}
        >
          {title}
        </Typography>

        {subtitle && (
          <Typography
            sx={{
              mt: 0.15,
              color: '#64748b',
              fontSize: '0.62rem',
              lineHeight: 1.4,
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        {rightContent}

        {onSave && (
          <Button
            size="small"
            variant="contained"
            onClick={onSave}
            disabled={saving}
            sx={{
              minWidth: 54,
              px: 0.75,
              whiteSpace: 'nowrap',
              fontSize: '0.63rem',
              fontWeight: 900,
            }}
          >
            {saving ? '저장중' : '저장'}
          </Button>
        )}
      </Box>
    </Box>
  );
}

function SiteSchedulePanel({
  siteSchedules,
  saving,
  onChange,
  onSave,
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        borderColor: '#cbd5e1',
        boxShadow: 'none',
        overflow: 'hidden',
      }}
    >
      <PanelHeader
        title="현장설명·입찰 현황"
        subtitle="현설일시는 빨간색, 입찰일시는 파란색으로 캘린더에 표시됩니다."
        saving={saving}
        onSave={onSave}
      />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
        }}
      >
        <Box
          sx={{
            minWidth: 760,
            display: 'grid',
            gridTemplateColumns:
              '190px 180px 180px minmax(180px, 1fr)',
            borderLeft:
              '1px solid #cbd5e1',
          }}
        >
          {[
            '현장명',
            '현설일시',
            '입찰일시',
            '비고',
          ].map((label) => (
            <Box
              key={label}
              sx={{
                px: 0.65,
                py: 0.55,
                borderRight:
                  '1px solid #cbd5e1',
                borderBottom:
                  '1px solid #cbd5e1',
                bgcolor: '#eef2f7',
                color: '#334155',
                textAlign: 'center',
                fontSize: '0.65rem',
                fontWeight: 900,
              }}
            >
              {label}
            </Box>
          ))}

          {siteSchedules.map(
            (schedule, index) => (
              <React.Fragment
                key={
                  schedule.projectName
                }
              >
                <Box
                  sx={{
                    px: 0.75,
                    py: 0.65,
                    borderRight:
                      '1px solid #dbe3ee',
                    borderBottom:
                      '1px solid #dbe3ee',
                    display: 'flex',
                    alignItems: 'center',
                    color: '#1e293b',
                    fontSize: '0.67rem',
                    fontWeight: 800,
                  }}
                >
                  {schedule.projectName}
                </Box>

                <Box
                  sx={{
                    p: 0.4,
                    borderRight:
                      '1px solid #dbe3ee',
                    borderBottom:
                      '1px solid #dbe3ee',
                  }}
                >
                  <TextField
                    fullWidth
                    type="datetime-local"
                    size="small"
                    value={
                      schedule.briefingAt
                    }
                    onChange={(event) =>
                      onChange(
                        index,
                        'briefingAt',
                        event.target.value,
                      )
                    }
                    InputLabelProps={{
                      shrink: true,
                    }}
                    sx={{
                      '& .MuiInputBase-input':
                        {
                          py: 0.65,
                          color: '#b91c1c',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                        },
                    }}
                  />
                </Box>

                <Box
                  sx={{
                    p: 0.4,
                    borderRight:
                      '1px solid #dbe3ee',
                    borderBottom:
                      '1px solid #dbe3ee',
                  }}
                >
                  <TextField
                    fullWidth
                    type="datetime-local"
                    size="small"
                    value={schedule.bidAt}
                    onChange={(event) =>
                      onChange(
                        index,
                        'bidAt',
                        event.target.value,
                      )
                    }
                    InputLabelProps={{
                      shrink: true,
                    }}
                    sx={{
                      '& .MuiInputBase-input':
                        {
                          py: 0.65,
                          color: '#1d4ed8',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                        },
                    }}
                  />
                </Box>

                <Box
                  sx={{
                    p: 0.4,
                    borderRight:
                      '1px solid #dbe3ee',
                    borderBottom:
                      '1px solid #dbe3ee',
                  }}
                >
                  <TextField
                    fullWidth
                    size="small"
                    value={schedule.note}
                    placeholder="장소 또는 비고"
                    onChange={(event) =>
                      onChange(
                        index,
                        'note',
                        event.target.value,
                      )
                    }
                    sx={{
                      '& .MuiInputBase-input':
                        {
                          py: 0.65,
                          fontSize: '0.65rem',
                        },
                    }}
                  />
                </Box>
              </React.Fragment>
            ),
          )}
        </Box>
      </Box>
    </Paper>
  );
}

function MeetingSchedulePanel({
  projectNames,
  meetings,
  saving,
  onChange,
  onAdd,
  onDelete,
  onSave,
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        borderColor: '#cbd5e1',
        boxShadow: 'none',
        overflow: 'hidden',
      }}
    >
      <PanelHeader
        title="현장회의일정"
        subtitle="위 현장설명 현황과 동일한 높이로 표시됩니다."
        saving={saving}
        onSave={onSave}
        rightContent={
          <Button
            size="small"
            variant="outlined"
            onClick={onAdd}
            sx={{
              minWidth: 58,
              px: 0.7,
              whiteSpace: 'nowrap',
              fontSize: '0.62rem',
              fontWeight: 900,
            }}
          >
            일정 추가
          </Button>
        }
      />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
        }}
      >
        <Box
          sx={{
            minWidth: 820,
            display: 'grid',
            gridTemplateColumns:
              '170px 190px minmax(180px, 1fr) 150px 44px',
            borderLeft:
              '1px solid #cbd5e1',
          }}
        >
          {[
            '회의일시',
            '현장',
            '회의내용',
            '장소',
            '',
          ].map((label, index) => (
            <Box
              key={`${label}-${index}`}
              sx={{
                px: 0.65,
                py: 0.55,
                borderRight:
                  '1px solid #cbd5e1',
                borderBottom:
                  '1px solid #cbd5e1',
                bgcolor: '#eef2f7',
                color: '#334155',
                textAlign: 'center',
                fontSize: '0.65rem',
                fontWeight: 900,
              }}
            >
              {label}
            </Box>
          ))}

          {meetings.map(
            (meeting, index) => (
              <React.Fragment
                key={meeting.id}
              >
                <Box
                  sx={{
                    p: 0.4,
                    borderRight:
                      '1px solid #dbe3ee',
                    borderBottom:
                      '1px solid #dbe3ee',
                  }}
                >
                  <TextField
                    fullWidth
                    type="datetime-local"
                    size="small"
                    value={
                      meeting.dateTime
                    }
                    onChange={(event) =>
                      onChange(
                        index,
                        'dateTime',
                        event.target.value,
                      )
                    }
                    InputLabelProps={{
                      shrink: true,
                    }}
                    sx={{
                      '& .MuiInputBase-input':
                        {
                          py: 0.65,
                          fontSize: '0.64rem',
                        },
                    }}
                  />
                </Box>

                <Box
                  sx={{
                    p: 0.4,
                    borderRight:
                      '1px solid #dbe3ee',
                    borderBottom:
                      '1px solid #dbe3ee',
                  }}
                >
                  <TextField
                    select
                    fullWidth
                    size="small"
                    value={
                      meeting.projectName
                    }
                    onChange={(event) =>
                      onChange(
                        index,
                        'projectName',
                        event.target.value,
                      )
                    }
                    sx={{
                      '& .MuiSelect-select':
                        {
                          py: 0.65,
                          fontSize: '0.64rem',
                        },
                    }}
                  >
                    <MenuItem value="">
                      전체 또는 본사
                    </MenuItem>

                    {projectNames.map(
                      (projectName) => (
                        <MenuItem
                          key={projectName}
                          value={projectName}
                        >
                          {projectName}
                        </MenuItem>
                      ),
                    )}
                  </TextField>
                </Box>

                <Box
                  sx={{
                    p: 0.4,
                    borderRight:
                      '1px solid #dbe3ee',
                    borderBottom:
                      '1px solid #dbe3ee',
                  }}
                >
                  <TextField
                    fullWidth
                    size="small"
                    value={meeting.title}
                    placeholder="회의내용"
                    onChange={(event) =>
                      onChange(
                        index,
                        'title',
                        event.target.value,
                      )
                    }
                    sx={{
                      '& .MuiInputBase-input':
                        {
                          py: 0.65,
                          fontSize: '0.64rem',
                        },
                    }}
                  />
                </Box>

                <Box
                  sx={{
                    p: 0.4,
                    borderRight:
                      '1px solid #dbe3ee',
                    borderBottom:
                      '1px solid #dbe3ee',
                  }}
                >
                  <TextField
                    fullWidth
                    size="small"
                    value={
                      meeting.location
                    }
                    placeholder="장소"
                    onChange={(event) =>
                      onChange(
                        index,
                        'location',
                        event.target.value,
                      )
                    }
                    sx={{
                      '& .MuiInputBase-input':
                        {
                          py: 0.65,
                          fontSize: '0.64rem',
                        },
                    }}
                  />
                </Box>

                <Box
                  sx={{
                    p: 0.35,
                    borderRight:
                      '1px solid #dbe3ee',
                    borderBottom:
                      '1px solid #dbe3ee',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent:
                      'center',
                  }}
                >
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    onClick={() =>
                      onDelete(index)
                    }
                    sx={{
                      minWidth: 32,
                      width: 32,
                      px: 0,
                      fontWeight: 900,
                    }}
                  >
                    ×
                  </Button>
                </Box>
              </React.Fragment>
            ),
          )}
        </Box>
      </Box>
    </Paper>
  );
}

function CalendarPanel({
  cursor,
  onPreviousMonth,
  onNextMonth,
  onToday,
  events,
}) {
  const days = useMemo(
    () =>
      buildCalendarDays(cursor),
    [cursor],
  );

  const todayKey = toDateKey(
    new Date(),
  );

  const title =
    `${cursor.getFullYear()}년 ` +
    `${cursor.getMonth() + 1}월`;

  return (
    <Paper
      variant="outlined"
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        borderColor: '#cbd5e1',
        boxShadow: 'none',
        overflow: 'hidden',
      }}
    >
      <PanelHeader
        title="일정 캘린더"
        subtitle="현설 빨간색 · 입찰 파란색 · 회의 초록색"
        rightContent={
          <>
            <Button
              size="small"
              variant="outlined"
              onClick={onPreviousMonth}
              sx={{
                minWidth: 30,
                px: 0.5,
                fontWeight: 900,
              }}
            >
              ‹
            </Button>

            <Button
              size="small"
              variant="outlined"
              onClick={onToday}
              sx={{
                minWidth: 42,
                px: 0.6,
                fontSize: '0.62rem',
                fontWeight: 800,
              }}
            >
              오늘
            </Button>

            <Button
              size="small"
              variant="outlined"
              onClick={onNextMonth}
              sx={{
                minWidth: 30,
                px: 0.5,
                fontWeight: 900,
              }}
            >
              ›
            </Button>
          </>
        }
      />

      <Typography
        sx={{
          py: 0.55,
          textAlign: 'center',
          color: '#0f172a',
          fontSize: '0.78rem',
          fontWeight: 900,
          borderBottom:
            '1px solid #e2e8f0',
        }}
      >
        {title}
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(7, minmax(0, 1fr))',
          borderLeft:
            '1px solid #dbe3ee',
        }}
      >
        {WEEKDAY_LABELS.map(
          (label, index) => (
            <Box
              key={label}
              sx={{
                py: 0.45,
                borderRight:
                  '1px solid #dbe3ee',
                borderBottom:
                  '1px solid #dbe3ee',
                bgcolor: '#f8fafc',
                color:
                  index === 0
                    ? '#dc2626'
                    : index === 6
                      ? '#2563eb'
                      : '#475569',
                textAlign: 'center',
                fontSize: '0.62rem',
                fontWeight: 900,
              }}
            >
              {label}
            </Box>
          ),
        )}
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns:
            'repeat(7, minmax(0, 1fr))',
          gridTemplateRows:
            'repeat(6, minmax(70px, 1fr))',
          borderLeft:
            '1px solid #dbe3ee',
        }}
      >
        {days.map(
          ({
            date,
            dateKey,
            isCurrentMonth,
          }) => {
            const dayEvents =
              events.get(dateKey) || [];

            const isToday =
              dateKey === todayKey;

            return (
              <Box
                key={dateKey}
                sx={{
                  minWidth: 0,
                  p: 0.4,
                  borderRight:
                    '1px solid #dbe3ee',
                  borderBottom:
                    '1px solid #dbe3ee',
                  bgcolor: isToday
                    ? '#fffbeb'
                    : '#ffffff',
                  opacity:
                    isCurrentMonth
                      ? 1
                      : 0.48,
                  overflow: 'hidden',
                }}
              >
                <Typography
                  sx={{
                    mb: 0.3,
                    color:
                      date.getDay() === 0
                        ? '#dc2626'
                        : date.getDay() === 6
                          ? '#2563eb'
                          : '#334155',
                    fontSize: '0.62rem',
                    fontWeight:
                      isToday ? 900 : 700,
                  }}
                >
                  {date.getDate()}
                </Typography>

                <Box
                  sx={{
                    display: 'grid',
                    gap: 0.25,
                  }}
                >
                  {dayEvents
                    .slice(0, 4)
                    .map((event) => {
                      const style =
                        event.type ===
                        'briefing'
                          ? {
                              color:
                                '#991b1b',
                              bgcolor:
                                '#fee2e2',
                            }
                          : event.type ===
                              'bid'
                            ? {
                                color:
                                  '#1d4ed8',
                                bgcolor:
                                  '#dbeafe',
                              }
                            : {
                                color:
                                  '#166534',
                                bgcolor:
                                  '#dcfce7',
                              };

                      return (
                        <Box
                          key={event.id}
                          title={
                            `${event.time} ` +
                            `${event.label}`
                          }
                          sx={{
                            minWidth: 0,
                            px: 0.35,
                            py: 0.2,
                            borderRadius: 0.65,
                            ...style,
                            fontSize: '0.53rem',
                            fontWeight: 800,
                            lineHeight: 1.25,
                            overflow: 'hidden',
                            textOverflow:
                              'ellipsis',
                            whiteSpace:
                              'nowrap',
                          }}
                        >
                          {event.time
                            ? `${event.time} `
                            : ''}
                          {event.label}
                        </Box>
                      );
                    })}
                </Box>
              </Box>
            );
          },
        )}
      </Box>
    </Paper>
  );
}

export default function AdminDashboardScheduleBoard({
  projectNames = [],
}) {
  const normalizedProjectNames =
    useMemo(
      () =>
        Array.from(
          new Set(
            projectNames.filter(
              Boolean,
            ),
          ),
        ),
      [projectNames],
    );

  const [siteSchedules, setSiteSchedules] =
    useState([]);

  const [meetings, setMeetings] =
    useState([
      createEmptyMeeting(),
    ]);

  const [calendarCursor, setCalendarCursor] =
    useState(() => {
      const today = new Date();

      return new Date(
        today.getFullYear(),
        today.getMonth(),
        1,
      );
    });

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState('');

  const [successMessage, setSuccessMessage] =
    useState('');

  const loadScheduleBoard =
    useCallback(async () => {
      setLoading(true);
      setErrorMessage('');

      try {
        const {
          data,
          error,
        } = await supabase
          .from(
            'admin_dashboard_planning',
          )
          .select(
            `
            id,
            site_schedules,
            meeting_schedules,
            updated_at
          `,
          )
          .eq('id', RECORD_ID)
          .maybeSingle();

        if (error) {
          throw error;
        }

        setSiteSchedules(
          normalizeProjectSchedules(
            normalizedProjectNames,
            data?.site_schedules,
          ),
        );

        setMeetings(
          normalizeMeetings(
            data?.meeting_schedules,
          ),
        );
      } catch (error) {
        console.error(
          'Dashboard 일정 조회 실패:',
          error,
        );

        setSiteSchedules(
          normalizeProjectSchedules(
            normalizedProjectNames,
            [],
          ),
        );

        setMeetings([
          createEmptyMeeting(),
        ]);

        setErrorMessage(
          error?.message ||
            'Dashboard 일정 데이터를 불러오지 못했습니다.',
        );
      } finally {
        setLoading(false);
      }
    }, [normalizedProjectNames]);

  useEffect(() => {
    loadScheduleBoard();
  }, [loadScheduleBoard]);

  useEffect(() => {
    setSiteSchedules(
      (previous) =>
        normalizeProjectSchedules(
          normalizedProjectNames,
          previous,
        ),
    );
  }, [normalizedProjectNames]);

  const events = useMemo(
    () =>
      buildCalendarEvents(
        siteSchedules,
        meetings,
      ),
    [meetings, siteSchedules],
  );

  const handleSiteScheduleChange = (
    index,
    field,
    value,
  ) => {
    setSiteSchedules((previous) =>
      previous.map(
        (schedule, scheduleIndex) =>
          scheduleIndex === index
            ? {
                ...schedule,
                [field]: value,
              }
            : schedule,
      ),
    );

    setSuccessMessage('');
  };

  const handleMeetingChange = (
    index,
    field,
    value,
  ) => {
    setMeetings((previous) =>
      previous.map(
        (meeting, meetingIndex) =>
          meetingIndex === index
            ? {
                ...meeting,
                [field]: value,
              }
            : meeting,
      ),
    );

    setSuccessMessage('');
  };

  const handleAddMeeting = () => {
    setMeetings((previous) => [
      ...previous,
      createEmptyMeeting(),
    ]);

    setSuccessMessage('');
  };

  const handleDeleteMeeting = (
    index,
  ) => {
    setMeetings((previous) => {
      const next = previous.filter(
        (_, meetingIndex) =>
          meetingIndex !== index,
      );

      return next.length > 0
        ? next
        : [createEmptyMeeting()];
    });

    setSuccessMessage('');
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user?.id) {
        throw new Error(
          '로그인 사용자 정보를 확인하지 못했습니다.',
        );
      }

      const now =
        new Date().toISOString();

      const { error } = await supabase
        .from(
          'admin_dashboard_planning',
        )
        .upsert(
          {
            id: RECORD_ID,
            site_schedules:
              siteSchedules,
            meeting_schedules:
              meetings,
            updated_by: user.id,
            updated_at: now,
          },
          {
            onConflict: 'id',
          },
        );

      if (error) {
        throw error;
      }

      setSuccessMessage(
        'Dashboard 일정이 저장되었습니다.',
      );
    } catch (error) {
      console.error(
        'Dashboard 일정 저장 실패:',
        error,
      );

      setErrorMessage(
        error?.message ||
          'Dashboard 일정을 저장하지 못했습니다.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Paper
        variant="outlined"
        sx={{
          minHeight: 280,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          borderColor: '#cbd5e1',
        }}
      >
        <CircularProgress size={20} />

        <Typography
          sx={{
            color: '#64748b',
            fontSize: '0.72rem',
          }}
        >
          Dashboard 일정을 불러오는 중입니다.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box
      className="admin-dashboard-no-print"
      sx={{
        mt: 1.5,
      }}
    >
      {(errorMessage ||
        successMessage) && (
        <Box sx={{ mb: 0.9 }}>
          {errorMessage && (
            <Alert
              severity="error"
              sx={{
                py: 0.2,
                fontSize: '0.68rem',
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
                fontSize: '0.68rem',
              }}
            >
              {successMessage}
            </Alert>
          )}
        </Box>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            xl:
              'minmax(620px, 1fr) minmax(420px, 0.72fr)',
          },
          gridTemplateRows: {
            xs: 'auto',
            xl: '280px 280px',
          },
          gap: 1.2,
          alignItems: 'stretch',
        }}
      >
        <SiteSchedulePanel
          siteSchedules={
            siteSchedules
          }
          saving={saving}
          onChange={
            handleSiteScheduleChange
          }
          onSave={handleSave}
        />

        <Box
          sx={{
            gridColumn: {
              xs: '1',
              xl: '2',
            },
            gridRow: {
              xs: 'auto',
              xl: '1 / span 2',
            },
            minHeight: {
              xs: 560,
              xl: 0,
            },
          }}
        >
          <CalendarPanel
            cursor={calendarCursor}
            events={events}
            onPreviousMonth={() =>
              setCalendarCursor(
                (previous) =>
                  new Date(
                    previous.getFullYear(),
                    previous.getMonth() - 1,
                    1,
                  ),
              )
            }
            onNextMonth={() =>
              setCalendarCursor(
                (previous) =>
                  new Date(
                    previous.getFullYear(),
                    previous.getMonth() + 1,
                    1,
                  ),
              )
            }
            onToday={() => {
              const today =
                new Date();

              setCalendarCursor(
                new Date(
                  today.getFullYear(),
                  today.getMonth(),
                  1,
                ),
              );
            }}
          />
        </Box>

        <MeetingSchedulePanel
          projectNames={
            normalizedProjectNames
          }
          meetings={meetings}
          saving={saving}
          onChange={
            handleMeetingChange
          }
          onAdd={handleAddMeeting}
          onDelete={
            handleDeleteMeeting
          }
          onSave={handleSave}
        />
      </Box>
    </Box>
  );
}
