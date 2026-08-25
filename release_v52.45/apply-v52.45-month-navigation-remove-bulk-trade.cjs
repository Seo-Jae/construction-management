const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

const TARGET = path.join(
  ROOT,
  'src',
  'page',
  'MonthlyLaborManagement.jsx',
);

function fail(message) {
  console.error('\n[v52.45 적용 중단]');
  console.error(message);
  process.exit(1);
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

if (!fs.existsSync(TARGET)) {
  fail(
    `대상 파일을 찾을 수 없습니다: ${TARGET}`,
  );
}

const currentText =
  fs.readFileSync(
    TARGET,
    'utf8',
  );

if (
  currentText.includes(
    'const changeMonthBy =',
  ) &&
  !currentText.includes(
    'bulkTrade',
  ) &&
  !currentText.includes(
    '공종 일괄변경',
  )
) {
  console.log(
    '[v52.45] 이미 적용된 상태입니다.',
  );
  process.exit(0);
}

// v52.44 이후 순차 적용을 강제.
// v52.44는 근로자 조회 팝업 전체목록/성명·공종 필터 버전.
if (
  !currentText.includes(
    'labor_worker_master_browse_v52_44',
  )
) {
  fail(
    'v52.44가 먼저 적용되어야 합니다.\n' +
    'release_v52.44를 적용·빌드한 뒤 v52.45를 실행해주세요.',
  );
}

let nextText = currentText;

const importOld = `import CheckBoxRoundedIcon from '@mui/icons-material/CheckBoxRounded';
import IndeterminateCheckBoxRoundedIcon from '@mui/icons-material/IndeterminateCheckBoxRounded';`;

const importNew = `import CheckBoxRoundedIcon from '@mui/icons-material/CheckBoxRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import IndeterminateCheckBoxRoundedIcon from '@mui/icons-material/IndeterminateCheckBoxRounded';`;

nextText =
  replaceUnique(
    nextText,
    importOld,
    importNew,
    '작성월 이동 아이콘 import',
  );

const stateOld = `  const [
    bulkTrade,
    setBulkTrade,
  ] = useState('');

`;

nextText =
  replaceUnique(
    nextText,
    stateOld,
    '',
    '공종 일괄변경 state 제거',
  );

const bulkFunctionOld = `  const applyBulkTrade =
    () => {
      const nextTrade =
        String(
          bulkTrade || '',
        ).trim();

      if (
        !nextTrade ||
        selectedIds.length ===
          0
      ) {
        return;
      }

      markChanged(
        (previous) =>
          previous.map(
            (row) =>
              selectedSet.has(
                row.id,
              )
                ? {
                    ...row,
                    trade:
                      nextTrade,
                  }
                : row,
          ),
      );
    };

`;

nextText =
  replaceUnique(
    nextText,
    bulkFunctionOld,
    '',
    '공종 일괄변경 함수 제거',
  );

const monthFunctionOld = `  const handleMonthChange = (
    nextMonth,
  ) => {
    if (
      nextMonth ===
      yearMonth
    ) {
      return;
    }

    if (
      dirty &&
      !window.confirm(
        '저장하지 않은 변경사항이 있습니다. 작성월을 변경하시겠습니까?',
      )
    ) {
      return;
    }

    setYearMonth(
      nextMonth,
    );
  };

`;

const monthFunctionNew = `  const handleMonthChange = (
    nextMonth,
  ) => {
    if (
      nextMonth ===
      yearMonth
    ) {
      return;
    }

    if (
      dirty &&
      !window.confirm(
        '저장하지 않은 변경사항이 있습니다. 작성월을 변경하시겠습니까?',
      )
    ) {
      return;
    }

    setYearMonth(
      nextMonth,
    );
  };

  const changeMonthBy = (
    offset,
  ) => {
    const matched =
      /^(\\d{4})-(\\d{2})$/.exec(
        String(
          yearMonth || '',
        ),
      );

    if (!matched) {
      return;
    }

    const year =
      Number(matched[1]);

    const month =
      Number(matched[2]);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      return;
    }

    const totalMonths =
      year * 12 +
      (month - 1) +
      Number(offset || 0);

    const nextYear =
      Math.floor(
        totalMonths / 12,
      );

    const nextMonth =
      ((totalMonths % 12) + 12) %
        12 +
      1;

    handleMonthChange(
      \`\${nextYear}-\${String(
        nextMonth,
      ).padStart(2, '0')}\`,
    );
  };

`;

nextText =
  replaceUnique(
    nextText,
    monthFunctionOld,
    monthFunctionNew,
    '이전월/다음월 이동 함수 추가',
  );

const monthUiOld = `          <TextField
            type="month"
            size="small"
            label="작성월"
            value={
              yearMonth
            }
            onChange={(
              event,
            ) =>
              handleMonthChange(
                event.target
                  .value,
              )
            }
            InputLabelProps={{
              shrink: true,
            }}
            sx={{ width: 170 }}
          />

`;

const monthUiNew = `          <Stack
            direction="row"
            spacing={0.35}
            alignItems="center"
          >
            <Tooltip
              title="이전월"
              arrow
            >
              <span>
                <IconButton
                  size="small"
                  aria-label="이전월"
                  disabled={
                    rosterSaving ||
                    rosterLoading
                  }
                  onClick={() =>
                    changeMonthBy(-1)
                  }
                  sx={{
                    border:
                      '1px solid #cbd5e1',
                    borderRadius: 1,
                  }}
                >
                  <ChevronLeftRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>

            <TextField
              type="month"
              size="small"
              label="작성월"
              value={
                yearMonth
              }
              onChange={(
                event,
              ) =>
                handleMonthChange(
                  event.target
                    .value,
                )
              }
              InputLabelProps={{
                shrink: true,
              }}
              sx={{ width: 170 }}
            />

            <Tooltip
              title="다음월"
              arrow
            >
              <span>
                <IconButton
                  size="small"
                  aria-label="다음월"
                  disabled={
                    rosterSaving ||
                    rosterLoading
                  }
                  onClick={() =>
                    changeMonthBy(1)
                  }
                  sx={{
                    border:
                      '1px solid #cbd5e1',
                    borderRadius: 1,
                  }}
                >
                  <ChevronRightRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

`;

nextText =
  replaceUnique(
    nextText,
    monthUiOld,
    monthUiNew,
    '작성월 이전/다음 버튼 UI',
  );

const bulkUiOld = `          <Divider
            orientation="vertical"
            flexItem
            sx={{ mx: 0.25 }}
          />

          <Autocomplete
            freeSolo
            size="small"
            options={
              TRADE_OPTIONS
            }
            value={
              bulkTrade
            }
            onChange={(
              _event,
              value,
            ) =>
              setBulkTrade(
                value || '',
              )
            }
            onInputChange={(
              _event,
              value,
            ) =>
              setBulkTrade(
                value || '',
              )
            }
            renderInput={(
              params,
            ) => (
              <TextField
                {...params}
                placeholder="공종 일괄변경"
              />
            )}
            sx={{ width: 155 }}
          />

          <Button
            size="small"
            variant="outlined"
            disabled={
              selectedIds.length ===
                0 ||
              !String(
                bulkTrade || '',
              ).trim()
            }
            onClick={
              applyBulkTrade
            }
            sx={{
              fontWeight: 800,
            }}
          >
            적용
          </Button>

`;

nextText =
  replaceUnique(
    nextText,
    bulkUiOld,
    '',
    '공종 일괄변경 UI 제거',
  );

for (const marker of [
  'ChevronLeftRoundedIcon',
  'ChevronRightRoundedIcon',
  'const changeMonthBy =',
  'title="이전월"',
  'title="다음월"',
]) {
  if (
    !nextText.includes(marker)
  ) {
    fail(
      `적용 후 필수 마커 누락: ${marker}`,
    );
  }
}

for (const marker of [
  'bulkTrade',
  'setBulkTrade',
  'applyBulkTrade',
  '공종 일괄변경',
]) {
  if (
    nextText.includes(marker)
  ) {
    fail(
      `제거 대상이 남아있습니다: ${marker}`,
    );
  }
}

const stamp =
  new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

const backupPath =
  path.join(
    ROOT,
    `backup_v52.45_${stamp}`,
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

console.log('\n[v52.45 적용 완료]');
console.log('- 공종 일괄변경 입력/적용 기능 제거');
console.log('- 개별 근로자 공종 입력은 그대로 유지');
console.log('- 작성월 좌측 이전월 버튼 추가');
console.log('- 작성월 우측 다음월 버튼 추가');
console.log('- 기존 직접 월 선택 기능 유지');
console.log('- 저장 안 된 변경사항 경고 로직 그대로 사용');
console.log(`- 백업: ${backupPath}`);
console.log('');
console.log('SQL 변경 없음');
console.log('다음 명령: npm run build');
