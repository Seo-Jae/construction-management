const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();

const TARGETS = [
  {
    label: '월별 노임작성',
    path: path.join(ROOT, 'src', 'page', 'MonthlyLaborManagement.jsx'),
    expectedSha: '597faf3b8790a4dbc013b5228ad61be2735036ba',
    oldBlock: `                <Autocomplete
                  size="small"
                  options={
                    BIRTH_YEAR_OPTIONS
                  }
                  value={
                    newWorker.birthYear ||
                    null
                  }
                  onChange={(
                    _event,
                    value,
                  ) =>
                    setNewWorker(
                      (previous) => {
                        const nextYear =
                          value || '';

                        const validDays =
                          getBirthDayOptions(
                            nextYear,
                            previous.birthMonth,
                          );

                        return {
                          ...previous,
                          birthYear:
                            nextYear,
                          birthDay:
                            validDays.includes(
                              previous.birthDay,
                            )
                              ? previous.birthDay
                              : '',
                        };
                      },
                    )
                  }
                  renderInput={(
                    params,
                  ) => (
                    <TextField
                      {...params}
                      required
                      label="생년"
                      placeholder="예: 1992"
                    />
                  )}
                />`,
    newBlock: `                <Autocomplete
                  freeSolo
                  autoSelect
                  size="small"
                  options={
                    BIRTH_YEAR_OPTIONS
                  }
                  value={
                    newWorker.birthYear ||
                    null
                  }
                  onChange={(
                    _event,
                    value,
                  ) =>
                    setNewWorker(
                      (previous) => {
                        const rawYear =
                          String(
                            value || '',
                          ).trim();

                        const nextYear =
                          BIRTH_YEAR_OPTIONS.includes(
                            rawYear,
                          )
                            ? rawYear
                            : '';

                        const validDays =
                          getBirthDayOptions(
                            nextYear,
                            previous.birthMonth,
                          );

                        return {
                          ...previous,
                          birthYear:
                            nextYear,
                          birthDay:
                            validDays.includes(
                              previous.birthDay,
                            )
                              ? previous.birthDay
                              : '',
                        };
                      },
                    )
                  }
                  renderInput={(
                    params,
                  ) => (
                    <TextField
                      {...params}
                      required
                      label="생년"
                      placeholder="예: 1992"
                      inputProps={{
                        ...params.inputProps,
                        inputMode:
                          'numeric',
                        maxLength: 4,
                      }}
                    />
                  )}
                />`,
  },
  {
    label: '근로자 정보관리',
    path: path.join(ROOT, 'src', 'page', 'WorkerMasterManagement.jsx'),
    expectedSha: 'ce52fc211b400b0b13307b6747fce4c2b33c9ccc',
    oldBlock: `                <Autocomplete
                  size="small"
                  options={BIRTH_YEAR_OPTIONS}
                  value={draft.birthYear || null}
                  onChange={(_event, value) =>
                    setDraft((previous) => {
                      const nextYear = value || '';
                      const validDays = getBirthDayOptions(
                        nextYear,
                        previous.birthMonth,
                      );
                      return {
                        ...previous,
                        birthYear: nextYear,
                        birthDay: validDays.includes(previous.birthDay)
                          ? previous.birthDay
                          : '',
                      };
                    })
                  }
                  renderInput={(params) => (
                    <TextField {...params} label="생년" placeholder="예: 1992" />
                  )}
                />`,
    newBlock: `                <Autocomplete
                  freeSolo
                  autoSelect
                  size="small"
                  options={BIRTH_YEAR_OPTIONS}
                  value={draft.birthYear || null}
                  onChange={(_event, value) =>
                    setDraft((previous) => {
                      const rawYear = String(value || '').trim();
                      const nextYear = BIRTH_YEAR_OPTIONS.includes(rawYear)
                        ? rawYear
                        : '';
                      const validDays = getBirthDayOptions(
                        nextYear,
                        previous.birthMonth,
                      );
                      return {
                        ...previous,
                        birthYear: nextYear,
                        birthDay: validDays.includes(previous.birthDay)
                          ? previous.birthDay
                          : '',
                      };
                    })
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="생년"
                      placeholder="예: 1992"
                      inputProps={{
                        ...params.inputProps,
                        inputMode: 'numeric',
                        maxLength: 4,
                      }}
                    />
                  )}
                />`,
  },
];

function fail(message) {
  console.error('\n[v52.43 적용 중단]');
  console.error(message);
  process.exit(1);
}

function gitBlobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto
    .createHash('sha1')
    .update(Buffer.concat([header, buffer]))
    .digest('hex');
}

for (const item of TARGETS) {
  if (!fs.existsSync(item.path)) {
    fail(`대상 파일을 찾을 수 없습니다: ${item.path}`);
  }

  const currentBuffer = fs.readFileSync(item.path);
  const currentText = currentBuffer.toString('utf8');

  if (
    currentText.includes('freeSolo') &&
    currentText.includes('autoSelect') &&
    currentText.includes('BIRTH_YEAR_OPTIONS.includes')
  ) {
    console.log(`[v52.43] ${item.label}: 이미 적용된 상태입니다.`);
    continue;
  }

  const actualSha = gitBlobSha(currentBuffer);

  if (actualSha !== item.expectedSha) {
    fail(
      `${item.label} 파일이 최신 기준과 다릅니다.\n` +
      `파일: ${path.relative(ROOT, item.path)}\n` +
      `예상 Git blob SHA: ${item.expectedSha}\n` +
      `현재 Git blob SHA: ${actualSha}\n\n` +
      'git status를 확인한 뒤 다시 시도해주세요.',
    );
  }

  const first = currentText.indexOf(item.oldBlock);

  if (first < 0) {
    fail(`${item.label}: 생년 Autocomplete 기준 블록을 찾지 못했습니다.`);
  }

  if (
    currentText.indexOf(
      item.oldBlock,
      first + item.oldBlock.length,
    ) >= 0
  ) {
    fail(`${item.label}: 기준 블록이 2개 이상 발견되어 중단했습니다.`);
  }
}

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-');

const backupRoot = path.join(
  ROOT,
  `backup_v52.43_${stamp}`,
);

let changed = 0;

for (const item of TARGETS) {
  const currentBuffer = fs.readFileSync(item.path);
  const currentText = currentBuffer.toString('utf8');

  if (
    currentText.includes('freeSolo') &&
    currentText.includes('autoSelect') &&
    currentText.includes('BIRTH_YEAR_OPTIONS.includes')
  ) {
    continue;
  }

  const relative = path.relative(ROOT, item.path);
  const backupPath = path.join(backupRoot, relative);

  fs.mkdirSync(
    path.dirname(backupPath),
    { recursive: true },
  );
  fs.copyFileSync(item.path, backupPath);

  const nextText = currentText.replace(
    item.oldBlock,
    item.newBlock,
  );

  if (nextText === currentText) {
    fail(`${item.label}: 실제 변경이 발생하지 않았습니다.`);
  }

  fs.writeFileSync(
    item.path,
    nextText,
    'utf8',
  );

  changed += 1;
  console.log(`- ${item.label}: 생년 Tab/Enter 확정 처리 적용`);
}

if (changed === 0) {
  console.log('\n[v52.43] 변경할 파일이 없습니다.');
  process.exit(0);
}

console.log('\n[v52.43 적용 완료]');
console.log('- 생년 직접입력 후 Tab 시 입력값 자동 확정');
console.log('- Enter 입력도 동일하게 확정');
console.log('- 1920년~현재연도 목록에 없는 값은 저장하지 않음');
console.log('- 생년 입력은 숫자 4자리로 제한');
console.log('- 월별 노임작성/근로자 정보관리 동일 동작');
console.log(`- 백업: ${backupRoot}`);
console.log('');
console.log('SQL 변경 없음');
console.log('다음 명령: npm run build');
