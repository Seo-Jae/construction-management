const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 'v52.48.5.44.71';
const releaseDir = __dirname;
const projectRoot = process.cwd();
const rel = 'supabase/v52.48.5.44.71_expense_runtime_access_v2.sql';
const source = path.join(releaseDir, 'files', rel);
const dest = path.join(projectRoot, rel);
const expectedSourceHash = 'eff4417a4064b3ccb1c72da7311876b70d0739963c965623030a58756fd5d439';

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

if (!fs.existsSync(source)) {
  throw new Error('[적용 중단] 릴리스 SQL 파일을 찾지 못했습니다: ' + source);
}

if (sha256(source) !== expectedSourceHash) {
  throw new Error('[적용 중단] 릴리스 SQL 파일 검증값이 다릅니다. 다시 다운로드해주세요.');
}

fs.mkdirSync(path.dirname(dest), { recursive: true });

if (fs.existsSync(dest)) {
  if (sha256(dest) === expectedSourceHash) {
    console.log('[' + VERSION + '] SQL 파일이 이미 프로젝트에 적용되어 있습니다.');
  } else {
    throw new Error('[적용 중단] 같은 이름의 SQL 파일이 이미 있고 내용이 다릅니다: ' + rel);
  }
} else {
  fs.copyFileSync(source, dest);
  console.log('[적용 완료] ' + rel);
}

console.log('');
console.log('[중요] Supabase > SQL Editor에서 아래 파일을 전부 1회 실행하세요.');
console.log('  ' + rel);
console.log('');
console.log('이번 버전은 DB 권한 수정만 포함하므로 프론트 소스 변경은 없습니다.');
