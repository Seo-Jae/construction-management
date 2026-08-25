const fs = require('fs');
const path = require('path');

const VERSION = 'v51.95';
const projectRoot = process.cwd();
const releaseRoot = __dirname;

const files = [
  {
    source: path.join(releaseRoot, 'src', 'Dashboard.jsx'),
    target: path.join(projectRoot, 'src', 'Dashboard.jsx'),
    relativePath: path.join('src', 'Dashboard.jsx'),
    label: 'src/Dashboard.jsx',
  },
  {
    source: path.join(
      releaseRoot,
      'public',
      'images',
      'wooklim-logo.png',
    ),
    target: path.join(
      projectRoot,
      'public',
      'images',
      'wooklim-logo.png',
    ),
    relativePath: path.join(
      'public',
      'images',
      'wooklim-logo.png',
    ),
    label: 'public/images/wooklim-logo.png',
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
  console.log(
    '사내시스템 v51.95 공사·안전 관리영역 분리 적용 완료',
  );
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
  console.log('3. 상단 회사 로고와 공사 관리·안전 관리 탭 확인');
  console.log('4. 안전 관리 선택 시 공사 메뉴가 숨겨지는지 확인');
  console.log('5. 공사 관리 복귀 시 기존 화면이 유지되는지 확인');
  console.log('6. 문제 없으면 배포\n');
} catch (error) {
  console.error(`\n[적용 실패] ${error.message}\n`);
  process.exit(1);
}
