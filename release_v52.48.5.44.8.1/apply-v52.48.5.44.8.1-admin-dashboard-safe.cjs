const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.8.1';
const target = path.resolve(
  process.cwd(),
  'src/page/AdminDashboard.jsx',
);
const projectTarget = path.resolve(
  process.cwd(),
  'src/page/ProjectManagement.jsx',
);
const mainTarget = path.resolve(
  process.cwd(),
  'src/page/MainDashboard.jsx',
);

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function replaceExactOnce(source, before, after, label) {
  const first = source.indexOf(before);

  if (first === -1) {
    fail(`적용 기준을 찾지 못했습니다: ${label}`);
  }

  const second = source.indexOf(
    before,
    first + before.length,
  );

  if (second !== -1) {
    fail(`적용 기준이 2개 이상 발견되었습니다: ${label}`);
  }

  return (
    source.slice(0, first) +
    after +
    source.slice(first + before.length)
  );
}

function replaceFunctionRange(
  source,
  startAnchor,
  endAnchor,
  replacement,
  label,
) {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(
    endAnchor,
    start + startAnchor.length,
  );

  if (start === -1 || end === -1 || end <= start) {
    fail(`함수 범위를 찾지 못했습니다: ${label}`);
  }

  return (
    source.slice(0, start) +
    replacement +
    '\n\n' +
    source.slice(end)
  );
}

if (!fs.existsSync(target)) {
  fail(`파일을 찾을 수 없습니다: ${target}`);
}

/*
  v52.48.5.44.8은 ProjectManagement/MainDashboard를 먼저 저장한 뒤
  AdminDashboard 적용 중 중단되는 구조였습니다.
  따라서 두 파일이 이미 적용됐는지 확인만 하고 건드리지 않습니다.
*/
for (const [filePath, marker, label] of [
  [
    projectTarget,
    '// v52.48.5.44.8 현장 시작일·종료일 관리 + Dashboard/Main 연동',
    'ProjectManagement',
  ],
  [
    mainTarget,
    '// v52.48.5.44.8 현장관리 시작일·종료일 연동',
    'MainDashboard',
  ],
]) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} 파일을 찾을 수 없습니다.`);
  }

  const fileSource = fs.readFileSync(filePath, 'utf8');

  if (!fileSource.includes(marker)) {
    fail(
      `${label}에 v52.48.5.44.8 선행 적용이 확인되지 않습니다. 기존 v52.48.5.44.8 적용 로그와 현재 파일 상태를 보내주세요.`,
    );
  }
}

let source = fs.readFileSync(target, 'utf8');

const finalMarker =
  '// v52.48.5.44.8.1 Admin Dashboard 날짜 parser 안전수정';

if (source.includes(finalMarker)) {
  console.log(
    `- src/page/AdminDashboard.jsx: ${VERSION} 이미 적용됨`,
  );
  process.exit(0);
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_${VERSION}_${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}`,
);
const backupPath = path.join(
  backupDir,
  'src/page/AdminDashboard.jsx',
);

fs.mkdirSync(
  path.dirname(backupPath),
  { recursive: true },
);
fs.copyFileSync(target, backupPath);

/* 1. 버전 마커 */
if (
  !source.includes(
    '// v52.48.5.44.8 현장관리 시작일·종료일 연동',
  )
) {
  source = replaceExactOnce(
    source,
    "import React, { useCallback, useEffect, useMemo, useState } from 'react';",
    `${finalMarker}
      // v52.48.5.44.8 현장관리 시작일·종료일 연동
import React, { useCallback, useEffect, useMemo, useState } from 'react';`
      .replace('      //', '//'),
    'AdminDashboard 버전 마커',
  );
} else {
  source = source.replace(
    '// v52.48.5.44.8 현장관리 시작일·종료일 연동',
    `${finalMarker}
      // v52.48.5.44.8 현장관리 시작일·종료일 연동`
      .replace('      //', '//'),
  );
}

/* 2. 하드코딩 일정 -> legacy fallback + formatter */
if (!source.includes('const LEGACY_PROJECT_SCHEDULES = {')) {
  const oldSchedules = `const PROJECT_SCHEDULES = {
  '한라건설 용인금어지구': {
    startDate: '25.06.30',
    endDate: '26.12.31',
  },
  '현대건설 용인마크밸리': {
    startDate: '25.10.31',
    endDate: '27.12.07',
  },
  '대우건설 용인현장': {
    startDate: '26.04.15',
    endDate: '28.02.29',
  },
};`;

  const nextSchedules = `const LEGACY_PROJECT_SCHEDULES = {
  '한라건설 용인금어지구': {
    startDate: '25.06.30',
    endDate: '26.12.31',
  },
  '현대건설 용인마크밸리': {
    startDate: '25.10.31',
    endDate: '27.12.07',
  },
  '대우건설 용인현장': {
    startDate: '26.04.15',
    endDate: '28.02.29',
  },
};

const formatAdminScheduleDate = (
  value,
) => {
  const text =
    String(value || '').trim();

  if (!text) return '';

  const normalized =
    text.replace(/-/g, '.');
  const parts =
    normalized.split('.');

  if (parts.length !== 3) {
    return '';
  }

  const [
    year,
    month,
    day,
  ] = parts;

  const yy =
    year.length === 4
      ? year.slice(2)
      : year;

  if (
    !/^\\d{2}$/.test(yy) ||
    !/^\\d{2}$/.test(month) ||
    !/^\\d{2}$/.test(day)
  ) {
    return '';
  }

  return \`\${yy}.\${month}.\${day}\`;
};`;

  source = replaceExactOnce(
    source,
    oldSchedules,
    nextSchedules,
    'Admin 일정 fallback',
  );
}

/*
  3. 문제 원인이었던 parser 수정.
  이전 v8은 ".split('.').map(Number)" 조각을 파일 전체에서 찾았고,
  parseDateKeyToUtc와 dateKeyToNumber 양쪽에 존재해서 중단됐습니다.
  이번에는 parseDateKeyToUtc 함수 범위 안에서만 수정합니다.
*/
{
  const startAnchor =
    'const parseDateKeyToUtc = (dateKey) => {';
  const endAnchor =
    'const getProjectSchedule =';

  const start = source.indexOf(startAnchor);
  const end = source.indexOf(
    endAnchor,
    start + startAnchor.length,
  );

  if (start === -1 || end === -1) {
    fail(
      'parseDateKeyToUtc 함수 범위를 찾지 못했습니다.',
    );
  }

  let block = source.slice(start, end);

  if (!block.includes(".replace(/-/g, '.')")) {
    const oldParser = `  const parts = String(dateKey || '')
    .split('.')
    .map(Number);`;

    const newParser = `  const parts = String(dateKey || '')
    .replace(/-/g, '.')
    .split('.')
    .map(Number);`;

    if (!block.includes(oldParser)) {
      fail(
        'parseDateKeyToUtc 내부 날짜 parser 기준을 찾지 못했습니다.',
      );
    }

    block = block.replace(
      oldParser,
      newParser,
    );

    source =
      source.slice(0, start) +
      block +
      source.slice(end);
  }
}

/* 4. Dashboard 일정 계산을 building_settings 우선으로 교체 */
if (
  source.includes(
    'const getProjectSchedule = (projectName, todayKey) => {',
  )
) {
  const newGetProjectSchedule = `const getProjectSchedule = (
  projectName,
  todayKey,
  projectBuildings = [],
) => {
  const configs = (
    Array.isArray(
      projectBuildings,
    )
      ? projectBuildings
      : []
  )
    .map(
      (row) =>
        row?.config_json || {},
    )
    .filter(Boolean);

  const configuredStartDate =
    configs
      .map((config) =>
        formatAdminScheduleDate(
          config.projectStartDate ||
            config.project_start_date ||
            config.startDate ||
            config.start_date,
        ),
      )
      .find(Boolean);

  const configuredEndDate =
    configs
      .map((config) =>
        formatAdminScheduleDate(
          config.projectEndDate ||
            config.project_end_date ||
            config.endDate ||
            config.end_date,
        ),
      )
      .find(Boolean);

  const legacy =
    LEGACY_PROJECT_SCHEDULES[
      projectName
    ] || {};

  const schedule = {
    startDate:
      configuredStartDate ||
      formatAdminScheduleDate(
        legacy.startDate,
      ),
    endDate:
      configuredEndDate ||
      formatAdminScheduleDate(
        legacy.endDate,
      ),
  };

  if (
    !schedule.startDate ||
    !schedule.endDate
  ) {
    return {
      startDate: '-',
      endDate: '-',
      startSort:
        Number.MAX_SAFE_INTEGER,
      dDayLabel: '일정 미등록',
      dDayState: 'unknown',
    };
  }

  const todayUtc =
    parseDateKeyToUtc(todayKey);
  const startUtc =
    parseDateKeyToUtc(
      schedule.startDate,
    );
  const endUtc =
    parseDateKeyToUtc(
      schedule.endDate,
    );

  let dDayLabel = 'D-000';
  let dDayState = 'active';

  if (
    todayUtc !== null &&
    endUtc !== null
  ) {
    const remainingDays =
      Math.round(
        (endUtc - todayUtc) /
          DAY_MS,
      );

    if (remainingDays > 0) {
      dDayLabel =
        \`D-\${String(
          remainingDays,
        ).padStart(3, '0')}\`;
    } else if (
      remainingDays === 0
    ) {
      dDayLabel = 'D-DAY';
      dDayState = 'today';
    } else {
      dDayLabel =
        \`D+\${String(
          Math.abs(
            remainingDays,
          ),
        ).padStart(3, '0')}\`;
      dDayState = 'expired';
    }
  }

  return {
    ...schedule,
    startSort:
      startUtc === null
        ? Number.MAX_SAFE_INTEGER
        : startUtc,
    dDayLabel,
    dDayState,
  };
};`;

  source = replaceFunctionRange(
    source,
    'const getProjectSchedule = (projectName, todayKey) => {',
    'const formatKoreaISODate =',
    newGetProjectSchedule,
    'getProjectSchedule',
  );
}

/* 5. 현장별 building rows를 먼저 구한 뒤 일정 계산에 전달 */
if (
  !source.includes(
    'todayKey,\n            projectBuildings,',
  )
) {
  const oldMapBlock = `        .map((projectName) => {
          const projectSchedule = getProjectSchedule(
            projectName,
            todayKey,
          );

          const projectBuildings = buildingRows.filter(
            (row) => row.project_name === projectName,
          );`;

  const newMapBlock = `        .map((projectName) => {
          const projectBuildings = buildingRows.filter(
            (row) => row.project_name === projectName,
          );

          const projectSchedule = getProjectSchedule(
            projectName,
            todayKey,
            projectBuildings,
          );`;

  source = replaceExactOnce(
    source,
    oldMapBlock,
    newMapBlock,
    'Dashboard 현장 일정 계산 순서',
  );
}

/* 최종 검증 */
const requiredChecks = [
  [
    finalMarker,
    'v8.1 마커',
  ],
  [
    'const LEGACY_PROJECT_SCHEDULES = {',
    'legacy 일정 fallback',
  ],
  [
    "config.projectStartDate",
    '현장 시작일 연동',
  ],
  [
    "config.projectEndDate",
    '현장 종료일 연동',
  ],
  [
    "projectBuildings = []",
    '현장별 building 일정 조회',
  ],
  [
    ".replace(/-/g, '.')",
    '날짜 parser 하이픈 지원',
  ],
];

for (const [needle, label] of requiredChecks) {
  if (!source.includes(needle)) {
    fail(
      `최종 검증 실패: ${label}`,
    );
  }
}

fs.writeFileSync(
  target,
  source,
  'utf8',
);

console.log(
  `[${VERSION}] 적용 완료`,
);
console.log(
  '- v52.48.5.44.8에서 먼저 적용된 ProjectManagement/MainDashboard는 유지',
);
console.log(
  '- AdminDashboard만 안전하게 후속 적용',
);
console.log(
  '- parseDateKeyToUtc 함수 범위 내부만 수정하여 중복 anchor 문제 제거',
);
console.log(
  '- 전체 현장 Dashboard 시작일/종료일/D-Day가 현장관리 저장값을 사용',
);
console.log(
  '- SQL 없음',
);
console.log(
  `- 백업: ${path.relative(
    process.cwd(),
    backupDir,
  )}`,
);
