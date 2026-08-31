const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.76';
const projectRoot = process.cwd();
const targetPath = path.join(projectRoot, 'src', 'index.css');

if (!fs.existsSync(targetPath)) {
  console.error(`[적용 중단] 파일을 찾을 수 없습니다: ${targetPath}`);
  process.exit(1);
}

const marker = `/*
  대시보드에서 선택한 화면 배율은 문서 최상위 요소에 적용된다.
  인쇄물은 화면 배율과 무관하게 항상 100%로 출력한다.
*/`;

const block = `/*
  v52.48.5.44.76
  CSS zoom 상태에서 MUI Tooltip도 Portal(body)로 렌더링되기 때문에
  기준 요소 좌표가 화면배율만큼 다시 축소되어 왼쪽/위쪽으로 밀린다.
  Popper 좌표계에는 역배율을 적용하고 Tooltip 본체 크기는 현재 화면배율로
  다시 맞춰 커서/버튼 위치와 설명 위치가 일치하도록 한다.
*/
html.wooklim-dashboard-scaled .MuiTooltip-popper {
  zoom: var(--wooklim-dashboard-overlay-inverse-scale, 1);
}

html.wooklim-dashboard-scaled
  .MuiTooltip-popper
  .MuiTooltip-tooltip {
  zoom: var(--wooklim-dashboard-scale, 1);
}

`;

let source = fs.readFileSync(targetPath, 'utf8');

if (source.includes(block)) {
  console.log(`[이미 적용됨] ${path.relative(projectRoot, targetPath)}`);
  process.exit(0);
}

if (!source.includes(marker)) {
  console.error('[적용 중단] src/index.css의 화면배율 기준 구간이 예상과 다릅니다.');
  console.error('기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${targetPath}.bak-${VERSION}-${stamp}`;
fs.copyFileSync(targetPath, backupPath);

source = source.replace(marker, block + marker);
fs.writeFileSync(targetPath, source, 'utf8');

console.log(`[적용 완료] ${path.relative(projectRoot, targetPath)}`);
console.log(`[백업] ${path.relative(projectRoot, backupPath)}`);
console.log('90% 화면배율에서 MUI Tooltip의 Portal 좌표를 역배율 보정했습니다.');
