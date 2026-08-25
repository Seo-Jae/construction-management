const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const DASHBOARD = path.join(ROOT, 'src', 'Dashboard.jsx');
const HISTORICAL = path.join(ROOT, 'src', 'page', 'HistoricalDailyReportUpload.jsx');

const EXPECTED = {
  [DASHBOARD]: '522d92b7cbac451b6f00ee38e32f167f4028479c',
  [HISTORICAL]: '88eb20aa61dd7d5bd066d48292f45d00913f67db',
};

function fail(message) {
  console.error('\n[v52.29.1 적용 중단]');
  console.error(message);
  process.exit(1);
}

function gitBlobSha(content) {
  const body = Buffer.from(content, 'utf8');
  const header = Buffer.from(`blob ${body.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, body])).digest('hex');
}

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    fail(`${label}: 기준 문자열이 ${count}개 발견되었습니다. 예상값은 정확히 1개입니다.`);
  }
  return source.replace(before, after);
}

for (const target of [DASHBOARD, HISTORICAL]) {
  if (!fs.existsSync(target)) fail(`대상 파일을 찾을 수 없습니다: ${target}`);
}

let dashboard = fs.readFileSync(DASHBOARD, 'utf8');
let historical = fs.readFileSync(HISTORICAL, 'utf8');

const alreadyApplied =
  dashboard.includes('normalizeDailyReportJob') &&
  dashboard.includes('selectedMonthPrefix') &&
  historical.includes("경량골조: '경량벽체'") &&
  historical.includes("경량석고: '경량벽체'") &&
  historical.includes("먹메김: '먹매김'") &&
  historical.includes(`  const process = sourceProcess
    ? normalizeText(sourceProcess)
    : job;`);

if (alreadyApplied) {
  console.log('[v52.29.1] 이미 프로그램 파일이 적용된 상태입니다.');
  process.exit(0);
}

for (const [target, expectedSha] of Object.entries(EXPECTED)) {
  const source = target === DASHBOARD ? dashboard : historical;
  const actualSha = gitBlobSha(source);
  if (actualSha !== expectedSha) {
    fail(
      `현재 파일이 확인한 최신 GitHub main과 다릅니다.\n` +
      `${path.relative(ROOT, target)}\n` +
      `예상 Git blob SHA: ${expectedSha}\n` +
      `현재 Git blob SHA: ${actualSha}\n` +
      '기존 기능 보호를 위해 자동 적용하지 않았습니다.'
    );
  }
}

/* =========================================================
   Dashboard.jsx
   - 구형 직종명 runtime 호환
   - 전일누계 = 같은 월 1일 ~ 전일
   ========================================================= */

dashboard = replaceOnce(
  dashboard,
`const jobOptions = ['소장', '관리자', '직영', '먹매김', '단열', '합지', '경량벽체', '세대천정', '공용홀천정', '몰딩', '걸레받이', '수장', '외주', '기타', '용역'];`,
`const jobOptions = ['소장', '관리자', '직영', '먹매김', '단열', '합지', '경량벽체', '세대천정', '공용홀천정', '몰딩', '걸레받이', '수장', '외주', '기타', '용역'];

/*
  v52.29 과거 출력일보 직종명 최소 호환.
  공정(process)은 별도 세부공정이므로 이 함수로 변경하지 않습니다.
*/
const LEGACY_DAILY_REPORT_JOB_MAP = {
  먹메김: '먹매김',
  경량: '경량벽체',
  경량골조: '경량벽체',
  경량석고: '경량벽체',
  천정: '세대천정',
};

const normalizeDailyReportJob = (value) => {
  const normalized = String(value || '').trim();
  return LEGACY_DAILY_REPORT_JOB_MAP[normalized] || normalized;
};`,
  '출력일보 직종명 정규화 helper 추가',
);

dashboard = replaceOnce(
  dashboard,
`      const jobCounts = workers.reduce((counts, worker) => {
        const job = worker?.job;
        if (!job) return counts;`,
`      const jobCounts = workers.reduce((counts, worker) => {
        const job = normalizeDailyReportJob(worker?.job);
        if (!job) return counts;`,
  '주간카드 직종 집계 정규화',
);

dashboard = replaceOnce(
  dashboard,
`    const selectedDateTime = parseReportDateKey(dateStr);
    const previousJobCounts = {};`,
`    const selectedDateTime = parseReportDateKey(dateStr);
    const selectedMonthPrefix = String(dateStr || '').slice(0, 6);
    const previousJobCounts = {};`,
  '전일누계 월 기준 추가',
);

dashboard = replaceOnce(
  dashboard,
`          reportDateTime === null ||
          selectedDateTime === null ||
          reportDateTime >= selectedDateTime`,
`          reportDateTime === null ||
          selectedDateTime === null ||
          !String(reportDateKey).startsWith(selectedMonthPrefix) ||
          reportDateTime >= selectedDateTime`,
  '전일누계를 동일 연월로 제한',
);

dashboard = replaceOnce(
  dashboard,
`          const job = worker?.job;
          const name = String(worker?.name || '').trim();`,
`          const job = normalizeDailyReportJob(worker?.job);
          const name = String(worker?.name || '').trim();`,
  '전일누계 직종명 정규화',
);

dashboard = replaceOnce(
  dashboard,
"        worksheet.getCell(`B${row}`).value = worker.job || '';",
"        worksheet.getCell(`B${row}`).value = normalizeDailyReportJob(worker.job) || '';",
  '엑셀 좌측 직종명 정규화',
);

dashboard = replaceOnce(
  dashboard,
"        worksheet.getCell(`H${row}`).value = worker.job || '';",
"        worksheet.getCell(`H${row}`).value = normalizeDailyReportJob(worker.job) || '';",
  '엑셀 우측 직종명 정규화',
);

dashboard = replaceOnce(
  dashboard,
`    job: worker?.job ?? null,
    name: worker?.name ?? '',`,
`    job: normalizeDailyReportJob(worker?.job) || null,
    name: worker?.name ?? '',`,
  '일보 편집 시 구형 직종명 정규화',
);

/* =========================================================
   HistoricalDailyReportUpload.jsx
   - 향후 과거일보 업로드 시 job 최소 정규화
   - process는 원본 세부공정 보존
   ========================================================= */

historical = replaceOnce(
  historical,
`const LEGACY_JOB_MAP = {
  경량: '경량벽체',
  천정: '세대천정',
};`,
`const LEGACY_JOB_MAP = {
  먹메김: '먹매김',
  경량: '경량벽체',
  경량골조: '경량벽체',
  경량석고: '경량벽체',
  천정: '세대천정',
};`,
  '과거일보 직종명 정규화표 확장',
);

historical = replaceOnce(
  historical,
`  const process = mapLegacyJob(
    sourceProcess || sourceJob,
  );`,
`  /*
    구분(job)만 현재 직종체계로 통합하고,
    원본 공정(process)은 경량골조/경량석고 같은 세부공정을 보존합니다.
    원본 공정이 비어 있을 때만 정규화된 job을 사용합니다.
  */
  const process = sourceProcess
    ? normalizeText(sourceProcess)
    : job;`,
  '과거일보 process 원본 보존',
);

const requiredDashboard = [
  'normalizeDailyReportJob',
  "경량골조: '경량벽체'",
  "경량석고: '경량벽체'",
  "먹메김: '먹매김'",
  'selectedMonthPrefix',
  '!String(reportDateKey).startsWith(selectedMonthPrefix)',
  'normalizeDailyReportJob(worker.job)',
];

const requiredHistorical = [
  "먹메김: '먹매김'",
  "경량골조: '경량벽체'",
  "경량석고: '경량벽체'",
  "천정: '세대천정'",
  `  const process = sourceProcess
    ? normalizeText(sourceProcess)
    : job;`,
];

for (const marker of requiredDashboard) {
  if (!dashboard.includes(marker)) fail(`Dashboard 적용 후 검증 실패: ${marker}`);
}
for (const marker of requiredHistorical) {
  if (!historical.includes(marker)) fail(`과거일보 업로드 적용 후 검증 실패: ${marker}`);
}

const historicalProcessPreservationBlock = `  const process = sourceProcess
    ? normalizeText(sourceProcess)
    : job;`;

if (!historical.includes(historicalProcessPreservationBlock)) {
  fail('과거일보 공정(process) 원본 보존 검증에 실패했습니다.');
}

if (
  historical.includes(`  const process = mapLegacyJob(
    sourceProcess || sourceJob,
  );`)
) {
  fail('과거일보 process에 구형 mapLegacyJob 처리가 아직 남아 있습니다.');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.29.1_${stamp}`);

for (const target of [DASHBOARD, HISTORICAL]) {
  const backupTarget = path.join(backupDir, path.relative(ROOT, target));
  fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
  fs.copyFileSync(target, backupTarget);
}

fs.writeFileSync(DASHBOARD, dashboard, 'utf8');
fs.writeFileSync(HISTORICAL, historical, 'utf8');

console.log('\n[v52.29.1 적용 완료]');
console.log('- 전일누계: 전체 공사기간 -> 같은 연월 1일~전일로 수정');
console.log('- 먹메김 -> 먹매김');
console.log('- 경량 / 경량골조 / 경량석고 -> 경량벽체');
console.log('- 천정 -> 세대천정');
console.log('- 과거일보 공정(process)은 원본 세부공정 보존');
console.log('- 주간카드/엑셀 출력도 구형 직종명 runtime 호환');
console.log(`- 백업: ${backupDir}`);
console.log('\n주의: 기존 DB 자료 보정용 Supabase SQL도 실행해야 합니다.');
console.log('다음 명령: npm run build');
