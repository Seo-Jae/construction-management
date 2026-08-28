const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.44.72';
const projectRoot = process.cwd();
const releaseRoot = __dirname;
const source = path.join(releaseRoot, 'files', 'supabase', 'v52.48.5.44.72_expense_own_project_helper.sql');
const target = path.join(projectRoot, 'supabase', 'v52.48.5.44.72_expense_own_project_helper.sql');
const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

if (!fs.existsSync(source)) {
  console.error(`[적용 중단] 패키지 SQL을 찾을 수 없습니다: ${source}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });

if (fs.existsSync(target)) {
  if (sha256(source) === sha256(target)) {
    console.log(`[이미 적용됨] ${path.relative(projectRoot, target)}`);
    console.log('\n이제 Supabase SQL Editor에서 해당 SQL 파일 전체를 실행하세요.');
    process.exit(0);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${target}.bak-${VERSION}-${stamp}`;
  fs.copyFileSync(target, backup);
  console.log(`[백업] ${path.relative(projectRoot, backup)}`);
}

fs.copyFileSync(source, target);
console.log(`[적용 완료] ${path.relative(projectRoot, target)}`);
console.log('\n중요: 이번 버전은 DB 권한 helper 수정입니다.');
console.log('Supabase SQL Editor에서 아래 파일을 전체 실행하세요:');
console.log('supabase/v52.48.5.44.72_expense_own_project_helper.sql');
