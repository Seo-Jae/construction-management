const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.44.68';
const releaseDir = __dirname;
const projectRoot = process.cwd();

const targets = [
  {
    rel: 'src/page/WeeklyOverview.jsx',
    expected: [
      '891f769cbb34ddc99af29d05c74e652be56c7d61f9418bd2cd3b205d69ef408b',
    ],
    next: '68da931ef778fd95896c722e01d30109dc2fb90fdd5b7ff3c84663575d144541',
  },
  {
    rel: 'src/page/WeeklyReportEditor.jsx',
    expected: [
      'f31f05c4c411e0fdafdf7ad55167997db271172988e04409708abf8aa101e32e',
      '3790436e614bc015d1495c07c856553668831d5aef3682839f60f565e573bd7d',
    ],
    next: 'd8a4580ca4bda115ea5c3484feb2fc04ec2f153516c926df6145cab9250f2043',
  },
  {
    rel: 'src/page/ReportDocumentList.jsx',
    expected: [
      '71b0d45ffe8a91cf8205f5eb5700aaed9ce25eb68eb9e71579974e073748b764',
    ],
    next: 'd7d24918504a7ba4b9a652a124ea72f64285d22f79cd0d8065d5cc0b984a2455',
  },
];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

const states = targets.map((target) => {
  const dest = path.join(projectRoot, target.rel);
  const src = path.join(releaseDir, 'files', target.rel);

  if (!fs.existsSync(dest)) {
    throw new Error(`[적용 중단] 대상 파일이 없습니다: ${target.rel}`);
  }
  if (!fs.existsSync(src)) {
    throw new Error(`[적용 중단] 릴리스 파일이 없습니다: ${target.rel}`);
  }

  const current = sha256(dest);
  const source = sha256(src);
  if (source !== target.next) {
    throw new Error(`[적용 중단] 릴리스 파일 검증값이 다릅니다: ${target.rel}`);
  }

  if (current === target.next) {
    return { ...target, dest, src, current, already: true };
  }

  if (!target.expected.includes(current)) {
    throw new Error(
      `[적용 중단] ${target.rel} 내용이 예상 기준 버전과 다릅니다.\n` +
      `기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.\n` +
      `현재 SHA256: ${current}`,
    );
  }

  return { ...target, dest, src, current, already: false };
});

if (states.every((state) => state.already)) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  console.log('추가 SQL이 있으므로 Supabase SQL Editor 적용 여부만 확인해주세요.');
  process.exit(0);
}

const backupRoot = path.join(projectRoot, `backup_${VERSION}_${stamp()}`);

states.forEach((state) => {
  if (state.already) return;
  const backupPath = path.join(backupRoot, state.rel);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(state.dest, backupPath);
});

states.forEach((state) => {
  if (state.already) return;
  fs.copyFileSync(state.src, state.dest);
  const applied = sha256(state.dest);
  if (applied !== state.next) {
    throw new Error(`[적용 실패] 복사 후 검증값이 다릅니다: ${state.rel}`);
  }
  console.log(`[적용 완료] ${state.rel}`);
});

console.log('');
console.log(`[${VERSION}] 적용 완료`);
console.log(`백업: ${path.relative(projectRoot, backupRoot)}`);
console.log('');
console.log('[중요] 아래 SQL 파일을 Supabase > SQL Editor에서 1회 실행하세요.');
console.log('  release_v52.48.5.44.68/supabase_v52.48.5.44.68_weekly_report_revision.sql');
console.log('');
console.log('다음 명령: npm run build');
