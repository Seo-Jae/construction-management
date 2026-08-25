const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(
  process.cwd(),
  'src/page/WeeklyOverview.jsx'
);

if (!fs.existsSync(targetPath)) {
  console.error(`파일을 찾을 수 없습니다: ${targetPath}`);
  process.exit(1);
}

let source = fs.readFileSync(targetPath, 'utf8');

const replaceFunction = (
  currentSource,
  startMarker,
  nextMarker,
  replacement,
) => {
  const startIndex = currentSource.indexOf(startMarker);
  const endIndex = currentSource.indexOf(
    nextMarker,
    startIndex,
  );

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(
      `${startMarker} 교체 위치를 찾지 못했습니다. 최신 WeeklyOverview.jsx인지 확인해주세요.`
    );
  }

  return (
    currentSource.slice(0, startIndex) +
    replacement.trimEnd() +
    '\n\n' +
    currentSource.slice(endIndex)
  );
};

const lineEditor = String.raw`function LineEditor({
  title,
  rows,
  onChange,
  onAdd,
  onDelete,
}) {
  const normalizedRows =
    normalizeRows(rows);

  return (
    <Box
      sx={{
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          minWidth: 0,
          maxWidth: '100%',
          minHeight: 30,
          mb: 0.45,
          pr: '66px',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Typography
          sx={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#334155',
            fontSize: '0.7rem',
            fontWeight: 900,
          }}
        >
          {title}
        </Typography>

        <Button
          size="small"
          variant="outlined"
          onClick={onAdd}
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            minWidth: 58,
            height: 28,
            px: 0.65,
            whiteSpace: 'nowrap',
            fontSize: '0.61rem',
            fontWeight: 900,
          }}
        >
          행 추가
        </Button>
      </Box>

      <Box
        sx={{
          width: '100%',
          minWidth: 0,
          maxWidth: '100%',
          overflow: 'hidden',
          display: 'grid',
          gap: 0.45,
        }}
      >
        {normalizedRows.map(
          (value, index) => (
            <Box
              key={
                title + '-' + index
              }
              sx={{
                width: '100%',
                minWidth: 0,
                maxWidth: '100%',
                boxSizing: 'border-box',
                overflow: 'hidden',
                display: 'grid',
                gridTemplateColumns:
                  '26px minmax(0, 1fr) 34px',
                gap: 0.4,
                alignItems: 'stretch',
              }}
            >
              <Box
                sx={{
                  minWidth: 0,
                  borderRadius: 0.8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent:
                    'center',
                  color: '#475569',
                  bgcolor: '#f1f5f9',
                  fontSize: '0.62rem',
                  fontWeight: 900,
                }}
              >
                {index + 1}
              </Box>

              <TextField
                fullWidth
                size="small"
                value={value}
                placeholder={
                  title + ' 내용'
                }
                onChange={(event) =>
                  onChange(
                    index,
                    event.target.value,
                  )
                }
                sx={{
                  width: '100%',
                  minWidth: 0,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  '& .MuiInputBase-root':
                    {
                      width: '100%',
                      minWidth: 0,
                      maxWidth: '100%',
                      minHeight: 34,
                      boxSizing:
                        'border-box',
                    },
                  '& .MuiInputBase-input':
                    {
                      minWidth: 0,
                      py: 0.7,
                      fontSize:
                        '0.69rem',
                    },
                }}
              />

              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() =>
                  onDelete(index)
                }
                disabled={
                  normalizedRows.length === 1 &&
                  !value
                }
                sx={{
                  minWidth: 34,
                  width: 34,
                  maxWidth: 34,
                  px: 0,
                  fontSize: '0.78rem',
                  fontWeight: 900,
                }}
              >
                ×
              </Button>
            </Box>
          ),
        )}
      </Box>
    </Box>
  );
}`;

const scheduleEditor = String.raw`function ScheduleEditor({
  scheduleDates,
  scheduleValues,
  onChange,
  onClear,
}) {
  return (
    <Box
      sx={{
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <Box
        sx={{
          mb: 0.55,
          width: '100%',
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'space-between',
          gap: 1,
        }}
      >
        <Typography
          sx={{
            minWidth: 0,
            color: '#334155',
            fontSize: '0.72rem',
            fontWeight: 900,
          }}
        >
          [하자보수]
        </Typography>

        <Button
          size="small"
          variant="outlined"
          color="error"
          onClick={onClear}
          sx={{
            flexShrink: 0,
            minWidth: 54,
            px: 0.65,
            whiteSpace: 'nowrap',
            fontSize: '0.61rem',
            fontWeight: 800,
          }}
        >
          전체삭제
        </Button>
      </Box>

      <Box
        sx={{
          width: '100%',
          minWidth: 0,
          maxWidth: '100%',
          overflowX: 'auto',
          overflowY: 'hidden',
          WebkitOverflowScrolling:
            'touch',
        }}
      >
        <Box
          sx={{
            width: 'max-content',
            minWidth: 700,
            display: 'grid',
            gridTemplateColumns:
              'repeat(7, minmax(90px, 1fr))',
            gap: 0.55,
          }}
        >
          {scheduleDates.map(
            (dateKey, index) => (
              <Box
                key={dateKey}
                sx={{ minWidth: 0 }}
              >
                <Box
                  sx={{
                    mb: 0.35,
                    py: 0.4,
                    borderRadius: 0.8,
                    color: '#334155',
                    bgcolor: '#f1f5f9',
                    textAlign: 'center',
                    fontSize: '0.66rem',
                    fontWeight: 900,
                  }}
                >
                  {formatMonthDay(
                    dateKey,
                  )}
                </Box>

                <TextField
                  fullWidth
                  size="small"
                  multiline
                  minRows={2}
                  maxRows={5}
                  value={
                    scheduleValues[
                      index
                    ] || ''
                  }
                  placeholder="입력"
                  onChange={(event) =>
                    onChange(
                      index,
                      event.target.value,
                    )
                  }
                  sx={{
                    minWidth: 0,
                    '& .MuiInputBase-root':
                      {
                        minHeight: 54,
                        alignItems:
                          'flex-start',
                      },
                    '& .MuiInputBase-input':
                      {
                        px: 0.65,
                        py: 0.6,
                        textAlign:
                          'center',
                        fontSize:
                          '0.67rem',
                        lineHeight: 1.4,
                      },
                  }}
                />
              </Box>
            ),
          )}
        </Box>
      </Box>
    </Box>
  );
}`;

const officeInputCard = String.raw`function OfficeInputCard({
  officeRows,
  scheduleDates,
  scheduleValues,
  onOfficeRowChange,
  onAddOfficeRow,
  onDeleteOfficeRow,
  onClearOffice,
  onScheduleChange,
  onClearSchedule,
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        mb: 1,
        boxSizing: 'border-box',
        overflow: 'hidden',
        borderColor: '#94a3b8',
        boxShadow: 'none',
      }}
    >
      <Box
        sx={{
          width: '100%',
          minWidth: 0,
          maxWidth: '100%',
          boxSizing: 'border-box',
          px: 1,
          py: 0.8,
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'space-between',
          gap: 1,
          bgcolor: '#e2e8f0',
          borderBottom:
            '1px solid #94a3b8',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              color: '#0f172a',
              fontSize: '0.8rem',
              fontWeight: 900,
            }}
          >
            본사 · 공무
          </Typography>

          <Typography
            sx={{
              mt: 0.15,
              color: '#64748b',
              fontSize: '0.61rem',
              fontWeight: 700,
            }}
          >
            제출·제출예정 항목별 행 추가 가능
          </Typography>
        </Box>

        <Button
          size="small"
          variant="outlined"
          color="error"
          onClick={onClearOffice}
          sx={{
            flexShrink: 0,
            minWidth: 64,
            px: 0.65,
            whiteSpace: 'nowrap',
            fontSize: '0.61rem',
            fontWeight: 800,
          }}
        >
          공무 삭제
        </Button>
      </Box>

      <Box
        sx={{
          width: '100%',
          minWidth: 0,
          maxWidth: '100%',
          boxSizing: 'border-box',
          overflow: 'hidden',
          p: 0.95,
          display: 'grid',
          gap: 1.25,
          '& > *': {
            minWidth: 0,
            maxWidth: '100%',
          },
        }}
      >
        {OFFICE_INPUT_SECTIONS.map(
          (section) => (
            <Box
              key={section.title}
              sx={{
                width: '100%',
                minWidth: 0,
                maxWidth: '100%',
                boxSizing:
                  'border-box',
                overflow: 'hidden',
                p: 0.85,
                border: SOFT_BORDER,
                borderRadius: 1,
                bgcolor: '#ffffff',
              }}
            >
              <Typography
                sx={{
                  mb: 0.75,
                  color: '#0f172a',
                  fontSize: '0.73rem',
                  fontWeight: 900,
                }}
              >
                {section.title}
              </Typography>

              <Box
                sx={{
                  width: '100%',
                  minWidth: 0,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  display: 'grid',
                  gap: 1.05,
                }}
              >
                {section.fields.map(
                  (field) => (
                    <LineEditor
                      key={field.key}
                      title={field.label}
                      rows={
                        officeRows[
                          field.key
                        ] || ['']
                      }
                      onChange={(
                        index,
                        value,
                      ) =>
                        onOfficeRowChange(
                          field.key,
                          index,
                          value,
                        )
                      }
                      onAdd={() =>
                        onAddOfficeRow(
                          field.key,
                        )
                      }
                      onDelete={(index) =>
                        onDeleteOfficeRow(
                          field.key,
                          index,
                        )
                      }
                    />
                  ),
                )}
              </Box>
            </Box>
          ),
        )}

        <Box
          sx={{
            width: '100%',
            minWidth: 0,
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflow: 'hidden',
            p: 0.85,
            border: SOFT_BORDER,
            borderRadius: 1,
            bgcolor: '#ffffff',
          }}
        >
          <ScheduleEditor
            scheduleDates={
              scheduleDates
            }
            scheduleValues={
              scheduleValues
            }
            onChange={
              onScheduleChange
            }
            onClear={
              onClearSchedule
            }
          />
        </Box>
      </Box>
    </Paper>
  );
}`;

try {
  source = replaceFunction(
    source,
    'function LineEditor(',
    'function ProjectEditor(',
    lineEditor,
  );

  source = replaceFunction(
    source,
    'function ScheduleEditor(',
    'function OfficeInputCard(',
    scheduleEditor,
  );

  source = replaceFunction(
    source,
    'function OfficeInputCard(',
    'function PreviewContentRow(',
    officeInputCard,
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const backupPath = `${targetPath}.before-office-width-fix`;
fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, source, 'utf8');

console.log('수정 완료');
console.log(`수정 파일: ${targetPath}`);
console.log(`백업 파일: ${backupPath}`);