const fs = require('fs');
const path = require('path');

const VERSION = 'v52.08.1';
const projectRoot = process.cwd();
const releaseRoot = __dirname;
const relativePaths = [path.join('src', 'page', 'Messenger.jsx')];

if (
  !fs.existsSync(path.join(projectRoot, 'package.json')) ||
  !fs.existsSync(path.join(projectRoot, 'src'))
) {
  console.error('\n[중단] package.json과 src 폴더가 있는 프로젝트 최상위 폴더에서 실행해주세요.\n');
  process.exit(1);
}

for (const relativePath of relativePaths) {
  const sourcePath = path.join(releaseRoot, relativePath);
  if (!fs.existsSync(sourcePath)) {
    console.error(`\n[중단] v52.08.1 파일을 찾을 수 없습니다.\n- ${sourcePath}\n`);
    process.exit(1);
  }
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_${VERSION}_${timestamp}`);

try {
  for (const relativePath of relativePaths) {
    const sourcePath = path.join(releaseRoot, relativePath);
    const targetPath = path.join(projectRoot, relativePath);

    if (fs.existsSync(targetPath)) {
      const backupPath = path.join(backupRoot, relativePath);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(targetPath, backupPath);
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }

  console.log('\n=====================================================');
  console.log('사내시스템 v52.08.1 메신저 화면 깜빡임 안정화 적용 완료');
  console.log('기준: v52.08 메신저 v1.2 적용 상태');
  console.log('=====================================================');
  console.log('\n[적용 파일]');
  relativePaths.forEach((relativePath) => console.log(`- ${relativePath}`));
  console.log('\n[자동 백업]');
  console.log(`- ${backupRoot}`);
  console.log('\n[Supabase]');
  console.log('- 추가 SQL 실행 없음 (v52.08 SQL 그대로 사용)');
  console.log('\n다음 순서');
  console.log('1. npm run build');
  console.log('2. 메신저 대화방을 1~2분 열어두고 지속 깜빡임이 사라졌는지 확인');
  console.log('3. 메시지 송수신 / 읽지않음 / 파일 전송 재확인');
  console.log('4. 이상 없을 때만 Git 배포 진행\n');
} catch (error) {
  console.error(`\n[적용 실패] ${error.message}\n`);
  process.exit(1);
}
