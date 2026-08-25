const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const RELEASE_DIR = __dirname;
const TARGET = path.join(ROOT, 'src', 'page', 'AttendanceManagement.jsx');
const SOURCE = path.join(RELEASE_DIR, 'src', 'page', 'AttendanceManagement.jsx');
const EXPECTED_BASE_BLOB_SHA = '2c29d2360dd3b140be36503f9dc0885a474a38a9';
const APPLIED_MARKER = "attendance_manager_list_workers_v52_16";

const gitBlobSha = (text) => {
  const normalized = text.replace(/\r\n/g, '\n');
  const buffer = Buffer.from(normalized, 'utf8');
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(Buffer.concat([header, buffer])).digest('hex');
};

if (!fs.existsSync(TARGET)) {
  throw new Error(`대상 파일이 없습니다: ${TARGET}`);
}
if (!fs.existsSync(SOURCE)) {
  throw new Error(`배포 구성 파일이 없습니다: ${SOURCE}`);
}

const original = fs.readFileSync(TARGET, 'utf8');
if (original.includes(APPLIED_MARKER)) {
  console.log('[v52.16] 이미 근로자 관리 기능이 적용되어 있습니다.');
  process.exit(0);
}

const actualBlobSha = gitBlobSha(original);
if (actualBlobSha !== EXPECTED_BASE_BLOB_SHA) {
  throw new Error([
    '현재 src/page/AttendanceManagement.jsx가 제작 기준 v52.14.9 파일과 다릅니다.',
    `기대 Git blob SHA: ${EXPECTED_BASE_BLOB_SHA}`,
    `현재 Git blob SHA: ${actualBlobSha}`,
    '기존 기능 보호를 위해 자동 적용을 중단했습니다.',
  ].join('\n'));
}

const replacementLf = fs.readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
const replacement = eol === '\r\n' ? replacementLf.replace(/\n/g, '\r\n') : replacementLf;

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(ROOT, `backup_v52.16_${timestamp}`);
const backupTarget = path.join(backupRoot, 'src', 'page', 'AttendanceManagement.jsx');
fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
fs.copyFileSync(TARGET, backupTarget);
fs.writeFileSync(TARGET, replacement, 'utf8');

console.log('');
console.log('[v52.16] 적용 완료');
console.log(`- 수정: ${path.relative(ROOT, TARGET)}`);
console.log(`- 백업: ${path.relative(ROOT, backupRoot)}`);
console.log('');
console.log('다음 명령: npm run build');
