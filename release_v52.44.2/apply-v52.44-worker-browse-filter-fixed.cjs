const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();

const TARGET = path.join(
  ROOT,
  'src',
  'page',
  'MonthlyLaborManagement.jsx',
);

const EXPECTED_SHA =
  'aafd5d8810d77124188e8987759e9c35f56d221f';

function fail(message) {
  console.error('\n[v52.44.2-v52.44 적용 중단]');
  console.error(message);
  process.exit(1);
}

function blobSha(buffer) {
  const header = Buffer.from(
    `blob ${buffer.length}\0`,
  );

  return crypto
    .createHash('sha1')
    .update(
      Buffer.concat([
        header,
        buffer,
      ]),
    )
    .digest('hex');
}

function replaceUnique(
  source,
  oldText,
  newText,
  label,
) {
  const first =
    source.indexOf(oldText);

  if (first < 0) {
    fail(
      `${label}: 기준 문자열을 찾지 못했습니다.`,
    );
  }

  if (
    source.indexOf(
      oldText,
      first + oldText.length,
    ) >= 0
  ) {
    fail(
      `${label}: 기준 문자열이 2개 이상 발견되었습니다.`,
    );
  }

  return source.replace(
    oldText,
    newText,
  );
}

function replaceBetween(
  source,
  startMarker,
  endMarker,
  replacement,
  label,
) {
  const start =
    source.indexOf(
      startMarker,
    );

  if (start < 0) {
    fail(
      `${label}: 시작 기준을 찾지 못했습니다.`,
    );
  }

  const end =
    source.indexOf(
      endMarker,
      start +
        startMarker.length,
    );

  if (end < 0) {
    fail(
      `${label}: 종료 기준을 찾지 못했습니다.`,
    );
  }

  if (
    source.indexOf(
      startMarker,
      start +
        startMarker.length,
    ) >= 0
  ) {
    fail(
      `${label}: 시작 기준이 2개 이상 발견되었습니다.`,
    );
  }

  return (
    source.slice(0, start) +
    replacement +
    source.slice(end)
  );
}

if (!fs.existsSync(TARGET)) {
  fail(
    `대상 파일을 찾을 수 없습니다: ${TARGET}`,
  );
}

const currentBuffer =
  fs.readFileSync(TARGET);

const currentText =
  currentBuffer.toString('utf8');

if (
  currentText.includes(
    'labor_worker_master_browse_v52_44',
  ) &&
  currentText.includes(
    "lookupFilter",
  ) &&
  currentText.includes(
    '등록 근로자 목록',
  )
) {
  console.log(
    '[v52.44] 이미 적용된 상태입니다.',
  );
  process.exit(0);
}

const actualSha =
  blobSha(currentBuffer);

if (
  actualSha !==
  EXPECTED_SHA
) {
  fail(
    '기존 기능 보호를 위해 적용하지 않았습니다.\n' +
    'src/page/MonthlyLaborManagement.jsx\n' +
    `예상 Git blob SHA: ${EXPECTED_SHA}\n` +
    `현재 Git blob SHA: ${actualSha}\n\n` +
    '현재 파일이 최신 main 기준과 다릅니다. git status를 확인해주세요.',
  );
}

let nextText = currentText;

const stateOld = `  const [
    lookupQuery,
    setLookupQuery,
  ] = useState('');
  const [
    lookupResults,
    setLookupResults,
  ] = useState([]);`;

const stateNew = `  const [
    lookupQuery,
    setLookupQuery,
  ] = useState('');
  const [
    lookupFilter,
    setLookupFilter,
  ] = useState('name');
  const [
    lookupResults,
    setLookupResults,
  ] = useState([]);`;

nextText =
  replaceUnique(
    nextText,
    stateOld,
    stateNew,
    '조회 필터 상태 추가',
  );

const functionStart =
  `  const searchWorkers =
    async () => {`;

const functionEnd =
  `  const openNewWorker = (
    initialName = '',
  ) => {`;

const lookupFunctions = `  const loadLookupWorkers =
    async ({
      query =
        lookupQuery,
      filter =
        lookupFilter,
    } = {}) => {
      if (!projectName) {
        setLookupResults([]);
        setLookupMessage(
          '현장을 먼저 선택해주세요.',
        );
        return;
      }

      const preparedQuery =
        String(
          query || '',
        ).trim();

      const preparedFilter =
        filter === 'trade'
          ? 'trade'
          : 'name';

      setLookupLoading(true);
      setLookupMessage('');

      const { data, error } =
        await supabase.rpc(
          'labor_worker_master_browse_v52_44',
          {
            p_project_name:
              projectName,
            p_query:
              preparedQuery,
            p_filter:
              preparedFilter,
            p_limit: 1000,
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

      if (next.length === 0) {
        setLookupMessage(
          preparedQuery
            ? '검색된 근로자가 없습니다.'
            : '등록된 근로자가 없습니다.',
        );
      }
    };

  const searchWorkers = () => {
    void loadLookupWorkers({
      query: lookupQuery,
      filter: lookupFilter,
    });
  };

  const changeLookupFilter = (
    filter,
  ) => {
    const nextFilter =
      filter === 'trade'
        ? 'trade'
        : 'name';

    setLookupFilter(
      nextFilter,
    );
    setLookupQuery('');
    setLookupResults([]);
    setLookupMessage('');

    void loadLookupWorkers({
      query: '',
      filter: nextFilter,
    });
  };

  const openLookup = () => {
    setLookupOpen(true);
    setLookupFilter('name');
    setLookupQuery('');
    setLookupResults([]);
    setLookupMessage('');

    void loadLookupWorkers({
      query: '',
      filter: 'name',
    });
  };

`;

nextText =
  replaceBetween(
    nextText,
    functionStart,
    functionEnd,
    lookupFunctions,
    '근로자 조회 로직 교체',
  );

const createdOld = `      if (lookupOpen) {
        setLookupQuery(name);
        setLookupResults([]);
        setLookupMessage(
          '신규 등록한 근로자를 명단에 추가했습니다.',
        );
      }`;

const createdNew = `      if (lookupOpen) {
        setLookupFilter('name');
        setLookupQuery(name);
        setLookupMessage('');

        void loadLookupWorkers({
          query: name,
          filter: 'name',
        });
      }`;

nextText =
  replaceUnique(
    nextText,
    createdOld,
    createdNew,
    '신규등록 후 조회목록 갱신',
  );

const dialogStart =
  `      <Dialog
        open={lookupOpen}`;

const dialogEnd =
  `      <Dialog
        open={newWorkerOpen}`;

const newDialog = `      <Dialog
        open={lookupOpen}
        onClose={() =>
          setLookupOpen(false)
        }
        fullWidth
        maxWidth="md"
      >
        <DialogTitle
          sx={{ fontWeight: 900 }}
        >
          근로자 조회
        </DialogTitle>

        <DialogContent dividers>
          <Typography
            sx={{
              mb: 1,
              color:
                '#64748b',
              fontSize:
                '0.75rem',
            }}
          >
            등록된 근로자는 검색어 없이도
            아래 목록에 표시됩니다. 성명 또는
            공종 기준을 선택해 검색하거나,
            목록의 근로자를 클릭해 바로
            추가할 수 있습니다.
          </Typography>

          <Stack
            direction={{
              xs: 'column',
              sm: 'row',
            }}
            spacing={0.75}
            alignItems={{
              xs: 'stretch',
              sm: 'center',
            }}
          >
            <Stack
              direction="row"
              spacing={0.5}
            >
              <Button
                size="small"
                variant={
                  lookupFilter ===
                  'name'
                    ? 'contained'
                    : 'outlined'
                }
                onClick={() =>
                  changeLookupFilter(
                    'name',
                  )
                }
                sx={{
                  minWidth: 72,
                  boxShadow:
                    'none',
                  fontWeight: 900,
                }}
              >
                성명
              </Button>

              <Button
                size="small"
                variant={
                  lookupFilter ===
                  'trade'
                    ? 'contained'
                    : 'outlined'
                }
                onClick={() =>
                  changeLookupFilter(
                    'trade',
                  )
                }
                sx={{
                  minWidth: 72,
                  boxShadow:
                    'none',
                  fontWeight: 900,
                }}
              >
                공종
              </Button>
            </Stack>

            <TextField
              fullWidth
              autoFocus
              size="small"
              label={
                lookupFilter ===
                'trade'
                  ? '공종 검색'
                  : '성명 검색'
              }
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
                  searchWorkers();
                }
              }}
              placeholder={
                lookupFilter ===
                'trade'
                  ? '예: 관리자, 몰딩, 세대천정'
                  : '예: 김철수'
              }
            />

            <Button
              variant="contained"
              onClick={
                searchWorkers
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

          <Box
            sx={{
              mt: 1.2,
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                'space-between',
              gap: 1,
            }}
          >
            <Typography
              sx={{
                color:
                  '#475569',
                fontSize:
                  '0.72rem',
                fontWeight: 900,
              }}
            >
              등록 근로자 목록
              {' · '}
              {lookupFilter ===
              'trade'
                ? '공종 기준'
                : '성명 기준'}
            </Typography>

            <Typography
              sx={{
                color:
                  '#64748b',
                fontSize:
                  '0.7rem',
              }}
            >
              조회{' '}
              {lookupResults.length}명
            </Typography>
          </Box>

          <Paper
            variant="outlined"
            sx={{
              mt: 0.6,
              maxHeight: 410,
              overflow: 'auto',
              borderColor:
                '#cbd5e1',
              boxShadow: 'none',
            }}
          >
            {lookupLoading ? (
              <Box
                sx={{
                  py: 6,
                  display: 'flex',
                  justifyContent:
                    'center',
                }}
              >
                <CircularProgress
                  size={26}
                />
              </Box>
            ) : lookupResults.length ===
              0 ? (
              <Box
                sx={{
                  py: 5,
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
                  {lookupMessage ||
                    '등록된 근로자가 없습니다.'}
                </Typography>

                {lookupQuery
                  .trim() &&
                  lookupFilter ===
                    'name' && (
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
            ) : (
              <Table
                stickyHeader
                size="small"
                sx={{
                  minWidth: 650,
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell
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
                        width: 125,
                        fontWeight: 900,
                      }}
                    >
                      생년월일
                    </TableCell>

                    <TableCell
                      align="center"
                      sx={{
                        width: 115,
                        fontWeight: 900,
                      }}
                    >
                      휴대폰
                    </TableCell>

                    <TableCell
                      sx={{
                        fontWeight: 900,
                      }}
                    >
                      최근 공종
                    </TableCell>

                    <TableCell
                      align="center"
                      sx={{
                        width: 90,
                        fontWeight: 900,
                      }}
                    >
                      추가
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {lookupResults.map(
                    (worker) => {
                      const alreadyAdded =
                        rows.some(
                          (row) =>
                            row.workerMasterId ===
                            worker.id,
                        );

                      return (
                        <TableRow
                          key={
                            worker.id
                          }
                          hover
                          onClick={() => {
                            if (
                              !alreadyAdded
                            ) {
                              addWorkerFromMaster(
                                worker,
                              );
                            }
                          }}
                          sx={{
                            cursor:
                              alreadyAdded
                                ? 'default'
                                : 'pointer',
                            opacity:
                              alreadyAdded
                                ? 0.62
                                : 1,
                          }}
                        >
                          <TableCell>
                            <Typography
                              sx={{
                                fontSize:
                                  '0.78rem',
                                fontWeight: 900,
                              }}
                            >
                              {worker.name ||
                                '-'}
                            </Typography>
                          </TableCell>

                          <TableCell align="center">
                            {formatLookupBirthDate(
                              worker.birthDate,
                            )}
                          </TableCell>

                          <TableCell align="center">
                            {formatLookupPhone(
                              worker.phoneMasked,
                            )}
                          </TableCell>

                          <TableCell>
                            {worker.trade ||
                              '-'}
                          </TableCell>

                          <TableCell align="center">
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
                              onClick={(
                                event,
                              ) => {
                                event.stopPropagation();

                                addWorkerFromMaster(
                                  worker,
                                );
                              }}
                              sx={{
                                minWidth: 64,
                                boxShadow:
                                  'none',
                              }}
                            >
                              {alreadyAdded
                                ? '추가됨'
                                : '추가'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    },
                  )}
                </TableBody>
              </Table>
            )}
          </Paper>

          {lookupMessage &&
          lookupResults.length >
            0 ? (
            <Typography
              sx={{
                mt: 0.65,
                color:
                  '#64748b',
                fontSize:
                  '0.7rem',
              }}
            >
              {lookupMessage}
            </Typography>
          ) : null}
        </DialogContent>

        <DialogActions>
          <Button
            onClick={() =>
              openNewWorker(
                lookupFilter ===
                  'name'
                  ? lookupQuery
                  : '',
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

`;

nextText =
  replaceBetween(
    nextText,
    dialogStart,
    dialogEnd,
    newDialog,
    '근로자 조회 팝업 교체',
  );

for (const marker of [
  'labor_worker_master_browse_v52_44',
  'lookupFilter',
  '등록 근로자 목록',
  'changeLookupFilter',
  "filter === 'trade'",
]) {
  if (
    !nextText.includes(marker)
  ) {
    fail(
      `적용 후 필수 마커 누락: ${marker}`,
    );
  }
}

if (
  nextText.includes(
    '성명을 2자 이상 입력해주세요.',
  )
) {
  fail(
    '기존 성명 2자 이상 제한 문구가 남아있습니다.',
  );
}

const stamp =
  new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

const backupPath =
  path.join(
    ROOT,
    `backup_v52.44_${stamp}`,
    'src',
    'page',
    'MonthlyLaborManagement.jsx',
  );

fs.mkdirSync(
  path.dirname(
    backupPath,
  ),
  {
    recursive: true,
  },
);

fs.copyFileSync(
  TARGET,
  backupPath,
);

fs.writeFileSync(
  TARGET,
  nextText,
  'utf8',
);

console.log('\n[v52.44.2-v52.44 적용 완료]');
console.log('- 조회창 진입 즉시 등록 근로자 전체목록 표시');
console.log('- 성명 / 공종 조회기준 버튼 추가');
console.log('- 빈 검색어 전체조회');
console.log('- 선택 기준 검색 지원');
console.log('- 목록 행 클릭으로 즉시 명단 추가');
console.log('- 기존 추가 버튼 유지');
console.log('- 이미 추가된 근로자는 추가됨 표시 및 중복 방지');
console.log('- 신규등록 후 조회목록 자동 갱신');
console.log(`- 백업: ${backupPath}`);
console.log('');
console.log('중요: Supabase v52.44 SQL을 먼저 실행해야 합니다.');
console.log('다음 명령: npm run build');
