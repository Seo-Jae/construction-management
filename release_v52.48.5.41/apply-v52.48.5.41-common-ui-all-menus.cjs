const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.41';
const ROOT = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_ROOT = path.join(ROOT, `backup_${VERSION}_${stamp}`);

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const write = (relativePath, content) => {
  const fullPath = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
};

const backup = (relativePath) => {
  const source = path.join(ROOT, relativePath);
  if (!fs.existsSync(source)) return;
  const destination = path.join(BACKUP_ROOT, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
};

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function ensureSystemPageTitleImport(source) {
  if (source.includes("../components/SystemPageTitle.jsx")) return source;

  const importRegex = /^import[\s\S]*?;\s*$/gm;
  let lastMatch = null;
  let match;
  while ((match = importRegex.exec(source)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    throw new Error('import 구문 위치를 찾지 못했습니다.');
  }

  const insertionIndex = lastMatch.index + lastMatch[0].length;
  return (
    source.slice(0, insertionIndex) +
    "\nimport SystemPageTitle from '../components/SystemPageTitle.jsx';" +
    source.slice(insertionIndex)
  );
}

function isLikelyStaticDescription(openTag, inner) {
  const raw = String(inner || '').trim();
  if (!raw || raw.length < 7 || raw.length > 260) return false;
  if (raw.includes('{') || raw.includes('}') || raw.includes('<') || raw.includes('>')) {
    return false;
  }

  const styleHint = String(openTag || '');
  return (
    /variant\s*=\s*["']caption["']/.test(styleHint) ||
    /text\.secondary/.test(styleHint) ||
    /#64748b|#667085|#94a3b8/i.test(styleHint) ||
    /fontSize[\s\S]{0,35}(0\.(5|6|7|8)[0-9]*rem|1[01]px)/i.test(styleHint)
  );
}

function removeImmediateStaticDescription(source, startIndex) {
  const tail = source.slice(startIndex);
  const match = tail.match(
    /^(\s*)<Typography\b([^>]*)>([\s\S]*?)<\/Typography>/,
  );

  if (!match) return { source, removed: '' };
  if (!isLikelyStaticDescription(match[2], match[3])) {
    return { source, removed: '' };
  }

  const plain = match[3].replace(/\s+/g, ' ').trim();
  return {
    source: source.slice(0, startIndex) + match[1] + tail.slice(match[0].length),
    removed: plain,
  };
}

function replaceLiteralTitle(source, config) {
  const aliases = config.aliases || [config.title];

  for (const alias of aliases) {
    const pattern = new RegExp(
      `<Typography\\b([^>]*)>\\s*${escapeRegExp(alias)}\\s*<\\/Typography>`,
      'g',
    );
    const matches = [...source.matchAll(pattern)];
    if (matches.length === 0) continue;

    // 페이지 제목은 보통 굵기/크기가 큰 Typography입니다.
    const score = (match) => {
      const attrs = match[1] || '';
      let value = 0;
      if (/component\s*=\s*["']h[1-6]["']/.test(attrs)) value += 8;
      if (/variant\s*=\s*["']h[1-6]["']/.test(attrs)) value += 8;
      if (/fontWeight[\s\S]{0,15}(800|900)/.test(attrs)) value += 4;
      if (/fontSize[\s\S]{0,30}(1(\.|\d)|20px|18px)/.test(attrs)) value += 3;
      if (/letterSpacing/.test(attrs)) value += 1;
      return value;
    };

    const selected = matches
      .map((match) => ({ match, score: score(match) }))
      .sort((a, b) => b.score - a.score || a.match.index - b.match.index)[0].match;

    const replacement = `<SystemPageTitle\n              title=${JSON.stringify(config.title)}\n              help=${JSON.stringify(config.help)}\n            />`;
    let next =
      source.slice(0, selected.index) +
      replacement +
      source.slice(selected.index + selected[0].length);

    const afterReplacement = selected.index + replacement.length;
    const descriptionResult = removeImmediateStaticDescription(next, afterReplacement);
    next = descriptionResult.source;

    return {
      source: next,
      matchedAlias: alias,
      removedDescription: descriptionResult.removed,
    };
  }

  return { source, matchedAlias: '', removedDescription: '' };
}

function replaceCompletionSummaryHeader(source) {
  const pattern = /<Typography\s+fontWeight=\{800\}\s+color=["']#334155["']>\s*\{isMonthly\s*\?\s*["']월별 완료 집계["']\s*:\s*["']주별 완료 집계["']\}\s*<\/Typography>\s*<Typography\s+variant=["']caption["']\s+color=["']text\.secondary["']>\s*공종별 작업완료 세대를 완료일 기준으로 집계합니다\.\s*<\/Typography>/;
  if (!pattern.test(source)) {
    return { source, changed: false };
  }

  const replacement = `<SystemPageTitle\n            title={isMonthly ? '월별 완료 집계' : '주별 완료 집계'}\n            help="공정별 작업완료 세대를 완료일 기준으로 집계하고 기간별 완료 현황을 비교합니다."\n          />`;

  return {
    source: source.replace(pattern, replacement),
    changed: true,
  };
}

function removeHoverTooltipFromHelp(source) {
  let next = source;

  // import 목록에서 Tooltip 제거
  next = next.replace(/\n\s*Tooltip,/, '');

  const openTag = '<Tooltip title={help} arrow enterDelay={350}>';
  if (next.includes(openTag)) {
    next = next.replace(openTag, '');
    const closeIndex = next.indexOf('</Tooltip>');
    if (closeIndex !== -1) {
      next = next.slice(0, closeIndex) + next.slice(closeIndex + '</Tooltip>'.length);
    }
  }

  // 접근성 속성 보강: 클릭했을 때만 Popover가 열림
  const iconNeedle = 'aria-label={title + \' 화면 안내\'}\n                onClick={(event) => setAnchorEl(event.currentTarget)}';
  if (next.includes(iconNeedle) && !next.includes("aria-haspopup=\"dialog\"")) {
    next = next.replace(
      iconNeedle,
      'aria-label={title + \' 화면 안내\'}\n                aria-haspopup="dialog"\n                aria-expanded={Boolean(anchorEl) ? \'true\' : undefined}\n                onClick={(event) => setAnchorEl(event.currentTarget)}',
    );
  }

  return next;
}

const migrations = [
  {
    file: 'src/page/AdminDashboard.jsx',
    title: 'Dashboard',
    aliases: ['Dashboard', '관리자 Dashboard', '현장 Dashboard', '현장관리 Dashboard'],
    help: '전체 현장의 공사 현황과 주요 정보를 확인하고 현장별 관리 화면으로 이동합니다.',
  },
  {
    file: 'src/page/AttendanceManagement.jsx',
    title: '근태관리',
    aliases: ['근태관리', '근태 관리'],
    help: '현장 근로자의 출·퇴근 기록, 기기변경, 변경이력, 진척승인 등 근태 관련 업무를 관리합니다.',
  },
  {
    file: 'src/page/DailyReport.jsx',
    title: '출력일보작성',
    aliases: ['출력일보작성', '출력일보 작성', '출력일보'],
    help: '일자별 출력인원과 작업내용을 작성·마감하고 일보 및 월간 자료를 출력합니다.',
  },
  {
    file: 'src/page/MonthlyWorkerStatus.jsx',
    title: '금월 투입현황',
    aliases: ['금월 투입현황'],
    help: '선택한 월의 근로자별 투입일과 일자별 인원 소계를 조회합니다.',
  },
  {
    file: 'src/page/CumulativeWorkerStatus.jsx',
    title: '누계투입조회',
    aliases: ['누계투입조회', '누계 투입 조회', '누계투입현황'],
    help: '근로자별 최근 월 투입 이력을 누계로 조회하고 장기 투입 여부를 확인합니다.',
  },
  {
    file: 'src/page/WeeklyOverview.jsx',
    title: '주간업무작성',
    aliases: ['주간업무작성', '주간 업무 작성', '주간업무'],
    help: '주간 업무 계획과 실적을 작성하고 보고용 내용을 관리합니다.',
  },
  {
    file: 'src/page/WeeklyOverviewArchive.jsx',
    title: '주간업무보관',
    aliases: ['주간업무보관', '주간 업무 보관', '주간업무 보관함'],
    help: '작성 완료된 주간업무 자료를 기간별로 조회하고 보관 내용을 확인합니다.',
  },
  {
    file: 'src/page/ProgressInput.jsx',
    title: '공종별 현황 입력',
    aliases: ['공종별 현황 입력', '공정별 현황 입력', '공정진척 입력'],
    help: '세대별 공정 상태를 작업전·작업중·작업완료로 입력하고 차수별 목표 구간을 관리합니다.',
  },
  {
    file: 'src/page/MultiProcessProgress.jsx',
    title: '다중 공종 진척 현황',
    aliases: ['다중 공종 진척 현황', '다중공종 진척현황', '다중 공정 진척 현황'],
    help: '세대별 여러 공정의 진척 상태를 한 화면에서 비교하고 공정별 진행상태를 확인합니다.',
  },
  {
    file: 'src/page/DailyCompletionSummary.jsx',
    title: '일별 완료 집계',
    aliases: ['일별 완료 집계', '일별완료집계'],
    help: '공정별 작업완료 세대를 완료일 기준으로 집계해 일자별 완료 현황을 확인합니다.',
  },
  {
    file: 'src/page/DrawingQuantityAnalysis.jsx',
    title: '도면분석',
    aliases: ['도면분석', '도면 분석', '도면 물량 분석', '도면물량분석'],
    help: '도면을 불러와 길이·면적 등 물량을 분석하고 산출 결과를 관리합니다.',
  },
  {
    file: 'src/page/MaterialInputStatus.jsx',
    title: '자재투입현황',
    aliases: ['자재투입현황', '자재 투입 현황'],
    help: '자재 품목의 현장 투입현황을 조회하고 기간·품목별 사용내역을 확인합니다.',
  },
  {
    file: 'src/page/UnitPriceAnalysis.jsx',
    title: '일위대가작성',
    aliases: ['일위대가작성', '일위대가 작성', '일위대가'],
    help: '1㎡ 기준 재료비·노무비·경비를 산정하고 저장·공유·출력하며 기술자료를 함께 관리합니다.',
  },
  {
    file: 'src/page/MonthlyLaborManagement.jsx',
    title: '월별 노임작성',
    aliases: ['월별 노임작성', '월별 노임 작성'],
    help: '월별 공정 및 근로자 노임을 작성하고 예상·실적 현황을 관리합니다.',
  },
  {
    file: 'src/page/WorkerMasterManagement.jsx',
    title: '근로자 정보관리',
    aliases: ['근로자 정보관리', '근로자 정보 관리'],
    help: '근로자 기본정보를 등록하고 노임·근로계약에 사용하는 공통정보를 관리합니다.',
  },
  {
    file: 'src/page/LaborContractManagement.jsx',
    title: '근로계약서작성',
    aliases: ['근로계약서작성', '근로계약서 작성'],
    help: '월별 근로계약 대상자를 확인하고 계약서 작성·출력·서명본 상태를 관리합니다.',
  },
  {
    file: 'src/page/LaborCostManagement.jsx',
    title: '공정별 노임작성',
    aliases: ['공정별 노임작성', '공정별 노임 작성'],
    help: '세대별 물량과 노무비를 연결해 공정별 월간 노임 예상 및 실적을 산정합니다.',
  },
  {
    file: 'src/page/ProgressClaimManagement.jsx',
    title: '기성내역서작성',
    aliases: ['기성내역서작성', '기성내역서 작성', '기성내역서'],
    help: '기성내역을 작성하고 공정 진척과 연계해 기성수량과 금액을 관리합니다.',
  },
  {
    file: 'src/page/ContractItemProcessMapping.jsx',
    title: '계약품목 공정연결',
    aliases: ['계약품목 공정연결', '계약품목 공정 연결'],
    help: '계약 품목을 시스템 공정과 연결하여 기성 산정에 사용할 공정 기준을 설정합니다.',
  },
  {
    file: 'src/page/WeeklyReport.jsx',
    title: '주간 업무 보고',
    aliases: ['주간 업무 보고', '주간업무보고'],
    help: '주간 업무 보고서를 작성하고 결재 요청 및 출력 자료를 관리합니다.',
  },
  {
    file: 'src/page/ExpenseResolution.jsx',
    title: '지출결의서 작성',
    aliases: ['지출결의서 작성', '지출결의서작성', '지출결의서'],
    help: '사용내역과 증빙자료를 입력하여 지출결의서를 작성하고 결재·출력 자료를 관리합니다.',
  },
  {
    file: 'src/page/ProposalReport.jsx',
    title: '품의 보고',
    aliases: ['품의 보고', '품의보고'],
    help: '품의 내용을 작성하고 결재 요청 및 출력 자료를 관리합니다.',
  },
];

const requiredFiles = [
  'src/components/SystemPageTitle.jsx',
  'src/theme.js',
  ...migrations.map((item) => item.file),
  'src/page/CompletionSummary.jsx',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(ROOT, file))) {
    console.error(`[적용 중단] 필요한 파일을 찾을 수 없습니다: ${file}`);
    process.exit(1);
  }
}

console.log('');
console.log(`=== ${VERSION} 공통 UI 전체 메뉴 적용 시작 ===`);
console.log('기존 기능은 변경하지 않고 페이지 제목/도움말 표시방식과 공통 UI만 수정합니다.');

fs.mkdirSync(BACKUP_ROOT, { recursive: true });

const changedFiles = [];
const skippedTitles = [];
const migratedTitles = [];

// 1) 기존 3개 메뉴 포함 모든 SystemPageTitle의 도움말을 클릭 전용으로 변경
{
  const file = 'src/components/SystemPageTitle.jsx';
  backup(file);
  const before = read(file);
  const after = removeHoverTooltipFromHelp(before);

  if (before === after) {
    if (before.includes('Tooltip title={help}')) {
      console.error('[적용 중단] SystemPageTitle 도움말 구조를 안전하게 변경하지 못했습니다.');
      process.exit(1);
    }
    console.log('[유지] SystemPageTitle은 이미 클릭 전용 도움말 구조입니다.');
  } else {
    write(file, after);
    changedFiles.push(file);
    console.log('[적용] 도움말 아이콘: hover 안내 제거 / 클릭 Popover만 유지');
  }
}

// 2) 일반 메뉴 제목을 공통 SystemPageTitle로 전환
for (const config of migrations) {
  const file = config.file;
  let source = read(file);

  // 이미 이 화면에 SystemPageTitle이 적용돼 있으면 중복 적용하지 않습니다.
  if (
    source.includes('<SystemPageTitle') &&
    source.includes(`title=${JSON.stringify(config.title)}`)
  ) {
    console.log(`[유지] ${config.title}: 이미 공통 제목 적용됨`);
    continue;
  }

  const result = replaceLiteralTitle(source, config);
  if (!result.matchedAlias) {
    skippedTitles.push(`${config.title} (${file})`);
    console.log(`[확인 필요] ${config.title}: 독립 제목 Typography를 찾지 못해 기능화면은 그대로 유지`);
    continue;
  }

  source = ensureSystemPageTitleImport(result.source);
  backup(file);
  write(file, source);
  changedFiles.push(file);
  migratedTitles.push(config.title);
  console.log(
    `[적용] ${config.title}` +
      (result.removedDescription
        ? ` / 기존 상시 설명 숨김: ${result.removedDescription}`
        : ''),
  );
}

// 3) 주별/월별 완료집계는 한 컴포넌트에서 동적 제목을 사용하므로 별도 처리
{
  const file = 'src/page/CompletionSummary.jsx';
  let source = read(file);
  const result = replaceCompletionSummaryHeader(source);
  if (result.changed) {
    source = ensureSystemPageTitleImport(result.source);
    backup(file);
    write(file, source);
    changedFiles.push(file);
    migratedTitles.push('주별 완료 집계 / 월별 완료 집계');
    console.log('[적용] 주별 완료 집계 / 월별 완료 집계');
  } else if (source.includes('<SystemPageTitle')) {
    console.log('[유지] 주별/월별 완료 집계: 이미 공통 제목 적용됨');
  } else {
    skippedTitles.push(`주별/월별 완료 집계 (${file})`);
    console.log('[확인 필요] 주별/월별 완료 집계 제목 구조를 찾지 못해 기능화면은 그대로 유지');
  }
}

// 4) 변경된 파일 중복 제거 및 결과 기록
const uniqueChangedFiles = [...new Set(changedFiles)];
const report = {
  version: VERSION,
  appliedAt: new Date().toISOString(),
  backup: path.relative(ROOT, BACKUP_ROOT),
  changedFiles: uniqueChangedFiles,
  migratedTitles,
  skippedTitles,
  notes: [
    '도움말은 마우스 hover로 열리지 않고 아이콘 클릭 시에만 표시됩니다.',
    '제목을 찾지 못한 화면은 기능 보호를 위해 자동 구조 변경을 하지 않습니다.',
    '공통 버튼/입력/탭/카드 규격은 v52.48.5.40의 .wooklim-admin-ui 전역 규칙을 그대로 사용합니다.',
  ],
};
write(`release_${VERSION}/apply-report.json`, JSON.stringify(report, null, 2));

console.log('');
console.log(`백업 위치: ${path.relative(ROOT, BACKUP_ROOT)}`);
console.log(`수정 파일: ${uniqueChangedFiles.length}개`);
console.log(`공통 제목 전환: ${migratedTitles.length}개 화면`);
if (skippedTitles.length > 0) {
  console.log('');
  console.log('※ 아래 화면은 독립 제목 구조를 자동으로 찾지 못해 기존 기능을 보호했습니다.');
  skippedTitles.forEach((item) => console.log(`  - ${item}`));
  console.log('이 목록은 오류가 아니며, 빌드 후 화면 확인 시 필요하면 다음 패치에서 개별 구조로 연결할 수 있습니다.');
}
console.log('');
console.log(`=== ${VERSION} 적용 완료 ===`);
