const fs = require('fs');
const path = require('path');

const VERSION = 'v51.97';
const projectRoot = process.cwd();
const releaseRoot = __dirname;

const files = [
  {
    source: path.join(
      releaseRoot,
      'src',
      'page',
      'AdminDashboardScheduleBoard.jsx',
    ),
    target: path.join(
      projectRoot,
      'src',
      'page',
      'AdminDashboardScheduleBoard.jsx',
    ),
    relativePath: path.join(
      'src',
      'page',
      'AdminDashboardScheduleBoard.jsx',
    ),
    label: 'src/page/AdminDashboardScheduleBoard.jsx',
  },
];

if (
  !fs.existsSync(path.join(projectRoot, 'package.json')) ||
  !fs.existsSync(path.join(projectRoot, 'src'))
) {
  console.error(
    '\n[중단] package.json과 src 폴더가 있는 프로젝트 최상위 폴더에서 실행해주세요.\n',
  );
  process.exit(1);
}

for (const file of files) {
  if (!fs.existsSync(file.source)) {
    console.error(
      `\n[중단] 배포 파일을 찾을 수 없습니다.\n- ${file.source}\n`,
    );
    process.exit(1);
  }
}

const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-');
const backupRoot = path.join(
  projectRoot,
  `backup_${VERSION}_${timestamp}`,
);
const backupFiles = [];

try {
  files.forEach((file) => {
    fs.mkdirSync(path.dirname(file.target), {
      recursive: true,
    });

    if (fs.existsSync(file.target)) {
      const backupPath = path.join(
        backupRoot,
        file.relativePath,
      );
      fs.mkdirSync(path.dirname(backupPath), {
        recursive: true,
      });
      fs.copyFileSync(file.target, backupPath);
      backupFiles.push(backupPath);
    }

    fs.copyFileSync(file.source, file.target);
  });

  console.log('\n============================================');
  console.log('사내시스템 v51.97 Dashboard 일정 토스트 적용 완료');
  console.log('============================================');
  console.log('\n[적용 파일]');
  files.forEach((file) => console.log(`- ${file.label}`));

  if (backupFiles.length > 0) {
    console.log('\n[자동 백업]');
    backupFiles.forEach((backupPath) =>
      console.log(`- ${backupPath}`),
    );
  }

  console.log(
    '\n이번 버전은 DB 변경이 없어 Supabase SQL 실행이 필요하지 않습니다.',
  );
  console.log('\n다음 순서');
  console.log('1. npm run build');
  console.log('2. npm run dev');
  console.log('3. Dashboard에서 현장설명·입찰 현황 또는 회의 일정을 저장');
  console.log('4. 화면 상단 중앙 토스트와 3초 자동 종료 확인');
  console.log('5. 문제 없으면 배포\n');
} catch (error) {
  console.error(`\n[적용 실패] ${error.message}\n`);
  process.exit(1);
}
