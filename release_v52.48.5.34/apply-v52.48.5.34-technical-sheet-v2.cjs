const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.34';
const ROOT = process.cwd();
const PAGE = path.join(ROOT, 'src', 'page', 'UnitPriceAnalysis.jsx');
const NEW_UTIL_SRC = path.join(
  __dirname,
  'files',
  'src',
  'utils',
  'technicalImageSheetEditor.js',
);
const NEW_UTIL_DST = path.join(
  ROOT,
  'src',
  'utils',
  'technicalImageSheetEditor.js',
);
const SQL_SRC = path.join(
  __dirname,
  'files',
  'supabase',
  'v52.48.5.34_unit_price_technical_sheet_v2.sql',
);
const SQL_DST = path.join(
  ROOT,
  'supabase',
  'v52.48.5.34_unit_price_technical_sheet_v2.sql',
);

function fail(message) {
  console.error(`[적용 중단] ${message}`);
  process.exitCode = 1;
  return false;
}

if (!fs.existsSync(PAGE)) {
  fail(`대상 파일을 찾을 수 없습니다: ${PAGE}`);
  return;
}
if (!fs.existsSync(NEW_UTIL_SRC) || !fs.existsSync(SQL_SRC)) {
  fail('패키지 내부 적용 파일을 찾을 수 없습니다. ZIP을 다시 풀어주세요.');
  return;
}

let source = fs.readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');

if (!source.includes('openTechnicalImageEditorWindow')) {
  fail('현재 UnitPriceAnalysis.jsx에서 v52.48.5.32 편집기 기준 코드를 찾지 못했습니다.');
  return;
}
if (!source.includes('technicalAnnotations')) {
  fail('현재 UnitPriceAnalysis.jsx에서 기술자료 지시선 상태를 찾지 못했습니다.');
  return;
}
if (source.includes('openTechnicalSheetEditorWindow')) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  process.exitCode = 0;
  return;
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_${VERSION}_${stamp}`);
fs.mkdirSync(path.join(backupDir, 'src', 'page'), { recursive: true });
fs.mkdirSync(path.join(backupDir, 'src', 'utils'), { recursive: true });
fs.copyFileSync(PAGE, path.join(backupDir, 'src', 'page', 'UnitPriceAnalysis.jsx'));

const oldUtil = path.join(ROOT, 'src', 'utils', 'technicalImageAnnotations.js');
if (fs.existsSync(oldUtil)) {
  fs.copyFileSync(
    oldUtil,
    path.join(backupDir, 'src', 'utils', 'technicalImageAnnotations.js'),
  );
}

function replaceOnce(find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) {
    throw new Error(`${label} 기준 코드를 찾지 못했습니다.`);
  }
  source = source.slice(0, index) + replacement + source.slice(index + find.length);
}

try {
  replaceOnce(
`import {
  normalizeTechnicalAnnotations,
  openTechnicalImageEditorWindow,
  openTechnicalImageViewerWindow,
} from '../utils/technicalImageAnnotations';`,
`import {
  normalizeTechnicalAnnotations,
} from '../utils/technicalImageAnnotations';
import {
  DEFAULT_TECHNICAL_SHEET_LAYOUT,
  normalizeTechnicalSheetLayout,
  openTechnicalSheetEditorWindow,
  openTechnicalSheetViewerWindow,
} from '../utils/technicalImageSheetEditor';`,
    '기술자료 import',
  );

  replaceOnce(
`  const [technicalAnnotations, setTechnicalAnnotations] = useState([]);
  const [technicalAnnotationBusy, setTechnicalAnnotationBusy] = useState(false);`,
`  const [technicalAnnotations, setTechnicalAnnotations] = useState([]);
  const [technicalSheetLayout, setTechnicalSheetLayout] = useState(
    DEFAULT_TECHNICAL_SHEET_LAYOUT,
  );
  const [technicalAnnotationBusy, setTechnicalAnnotationBusy] = useState(false);`,
    '기술자료 상태',
  );

  replaceOnce(
`    if (!normalizedKey) {
      setTechnicalAnnotations([]);
      return [];
    }`,
`    if (!normalizedKey) {
      setTechnicalAnnotations([]);
      setTechnicalSheetLayout(DEFAULT_TECHNICAL_SHEET_LAYOUT);
      return [];
    }`,
    '빈 image_key 처리',
  );

  replaceOnce(
`.from('unit_price_technical_annotations')
        .select('annotations')`,
`.from('unit_price_technical_annotations')
        .select('annotations, layout_settings')`,
    '기술자료 DB 조회',
  );

  replaceOnce(
`      const next = normalizeTechnicalAnnotations(data?.annotations || []);
      setTechnicalAnnotations(next);
      return next;`,
`      const next = normalizeTechnicalAnnotations(data?.annotations || []);
      const nextLayout = normalizeTechnicalSheetLayout(data?.layout_settings);
      setTechnicalAnnotations(next);
      setTechnicalSheetLayout(nextLayout);
      return next;`,
    '기술자료 조회 결과',
  );

  replaceOnce(
`        setTechnicalAnnotations([]);
        return [];`,
`        setTechnicalAnnotations([]);
        setTechnicalSheetLayout(DEFAULT_TECHNICAL_SHEET_LAYOUT);
        return [];`,
    '기술자료 테이블 미준비 처리',
  );

  replaceOnce(
`      setTechnicalAnnotations([]);
      return [];`,
`      setTechnicalAnnotations([]);
      setTechnicalSheetLayout(DEFAULT_TECHNICAL_SHEET_LAYOUT);
      return [];`,
    '기술자료 조회 실패 처리',
  );

  replaceOnce(
`      setTechnicalAnnotations([]);
      return;
    }`,
`      setTechnicalAnnotations([]);
      setTechnicalSheetLayout(DEFAULT_TECHNICAL_SHEET_LAYOUT);
      return;
    }`,
    '선택 규격 없음 처리',
  );

  replaceOnce(
`    const previewWindow = openTechnicalImageViewerWindow({
      imageUrl,
      title: imageTitle,
      annotations: technicalAnnotations,
    });`,
`    const previewWindow = openTechnicalSheetViewerWindow({
      imageUrl,
      title: imageTitle,
      annotations: technicalAnnotations,
      layout: technicalSheetLayout,
    });`,
    'VIEW 호출',
  );

  replaceOnce(
`    technicalAnnotations,
  ]);`,
`    technicalAnnotations,
    technicalSheetLayout,
  ]);`,
    'VIEW dependency',
  );

  replaceOnce(
`    const result = await openTechnicalImageEditorWindow({
      imageUrl,
      title: imageTitle,
      annotations: technicalAnnotations,
    });`,
`    const result = await openTechnicalSheetEditorWindow({
      imageUrl,
      title: imageTitle,
      annotations: technicalAnnotations,
      layout: technicalSheetLayout,
    });`,
    '편집기 호출',
  );

  replaceOnce(
`    const nextAnnotations = normalizeTechnicalAnnotations(result.annotations);
    setTechnicalAnnotationBusy(true);
    try {
      const { error } = await supabase.rpc('save_unit_price_technical_annotations', {
        p_image_key: imageKey,
        p_annotations: nextAnnotations,
      });
      if (error) throw error;
      setTechnicalAnnotations(nextAnnotations);`,
`    const nextAnnotations = normalizeTechnicalAnnotations(result.annotations);
    const nextLayout = normalizeTechnicalSheetLayout(result.layout);
    setTechnicalAnnotationBusy(true);
    try {
      const { error } = await supabase.rpc('save_unit_price_technical_sheet', {
        p_image_key: imageKey,
        p_annotations: nextAnnotations,
        p_layout_settings: nextLayout,
      });
      if (error) throw error;
      setTechnicalAnnotations(nextAnnotations);
      setTechnicalSheetLayout(nextLayout);`,
    '기술자료 저장 RPC',
  );

  source = source.replace(
    "message.includes('save_unit_price_technical_annotations')",
    "message.includes('save_unit_price_technical_sheet')",
  );
  source = source.replace(
    "'v52.48.5.32 Supabase SQL을 먼저 실행해주세요.'",
    "'v52.48.5.34 Supabase SQL을 먼저 실행해주세요.'",
  );

  const editorDepMarker = `    showToast,
    technicalAnnotations,
  ]);`;
  const editorDepReplacement = `    showToast,
    technicalAnnotations,
    technicalSheetLayout,
  ]);`;
  const depIndex = source.indexOf(editorDepMarker);
  if (depIndex < 0) {
    throw new Error('편집기 dependency 기준 코드를 찾지 못했습니다.');
  }
  source = source.slice(0, depIndex)
    + editorDepReplacement
    + source.slice(depIndex + editorDepMarker.length);

  fs.writeFileSync(PAGE, source, 'utf8');
  fs.copyFileSync(NEW_UTIL_SRC, NEW_UTIL_DST);
  fs.copyFileSync(SQL_SRC, SQL_DST);

  console.log(`[${VERSION}] 적용 완료`);
  console.log('- 기존 일위대가 계산/저장/권한은 유지');
  console.log('- VIEW의 항목별 색상 구분 제거');
  console.log('- 이미지에는 번호 + 흑백 지시선만 표시');
  console.log('- 하단 부재명은 1~4열 도면 스타일로 별도 생성');
  console.log('- 하단 설명 박스 위치/높이/너비/글자/간격 설정 추가');
  console.log(`- SQL 생성: ${path.relative(ROOT, SQL_DST)}`);
  console.log(`- 백업: ${path.relative(ROOT, backupDir)}`);
} catch (error) {
  console.error(`[적용 중단] ${error.message}`);
  console.error('기존 변경 보호를 위해 예상 코드가 다르면 자동 덮어쓰기를 하지 않습니다.');
  process.exitCode = 1;
}
