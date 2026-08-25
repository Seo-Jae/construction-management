const fs = require('fs');
const path = require('path');

const root = process.cwd();
const packageDir = __dirname;
const target = path.join(root, 'src', 'page', 'UnitPriceAnalysis.jsx');
const utilTarget = path.join(root, 'src', 'utils', 'technicalImageAnnotations.js');
const sqlTarget = path.join(root, 'supabase', 'v52.48.5.32_unit_price_annotation_editor.sql');
const utilSource = path.join(packageDir, 'files', 'technicalImageAnnotations.js');
const sqlSource = path.join(packageDir, 'supabase', 'v52.48.5.32_unit_price_annotation_editor.sql');

const fail = (message) => {
  console.error(`\n[적용 중단] ${message}\n기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.\n`);
  process.exit(1);
};

if (!fs.existsSync(target)) fail('src/page/UnitPriceAnalysis.jsx 파일을 찾지 못했습니다. new 프로젝트 최상위 폴더에서 실행해주세요.');
if (!fs.existsSync(utilSource)) fail('패키지의 files/technicalImageAnnotations.js 파일을 찾지 못했습니다.');
if (!fs.existsSync(sqlSource)) fail('패키지의 Supabase SQL 파일을 찾지 못했습니다.');

let source = fs.readFileSync(target, 'utf8');
if (source.includes('v52.48.5.32 기술자료 편집기 v1')) {
  console.log('[v52.48.5.32] 이미 적용되어 있습니다. 추가 변경 없이 종료합니다.');
  process.exit(0);
}
if (!source.includes('// v52.48.5.31 기술자료 새창 보기')) {
  fail('현재 UnitPriceAnalysis.jsx가 예상 기준(v52.48.5.31)과 다릅니다.');
}
if (!source.includes('canManageTechnicalImages = false')) {
  fail('기술자료 이미지 권한 코드가 예상 위치에 없습니다.');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, `backup_v52.48.5.32_${stamp}`);
fs.mkdirSync(path.join(backupDir, 'src', 'page'), { recursive: true });
fs.copyFileSync(target, path.join(backupDir, 'src', 'page', 'UnitPriceAnalysis.jsx'));
if (fs.existsSync(utilTarget)) {
  fs.mkdirSync(path.join(backupDir, 'src', 'utils'), { recursive: true });
  fs.copyFileSync(utilTarget, path.join(backupDir, 'src', 'utils', 'technicalImageAnnotations.js'));
}
console.log(`[백업 완료] ${path.relative(root, backupDir)}`);

const importMarker = "import { supabase } from '../supabaseClient';";
const importReplacement = `${importMarker}\nimport {\n  normalizeTechnicalAnnotations,\n  openTechnicalImageEditorWindow,\n  openTechnicalImageViewerWindow,\n} from '../utils/technicalImageAnnotations';`;
if (!source.includes(importMarker)) fail('Supabase import 위치를 찾지 못했습니다.');
source = source.replace(importMarker, importReplacement);

const stateMarker = "  const [technicalImageBusy, setTechnicalImageBusy] = useState(false);\n";
const stateReplacement = `${stateMarker}  const [technicalAnnotations, setTechnicalAnnotations] = useState([]);\n  const [technicalAnnotationBusy, setTechnicalAnnotationBusy] = useState(false);\n`;
if (!source.includes(stateMarker)) fail('기술자료 이미지 state 위치를 찾지 못했습니다.');
source = source.replace(stateMarker, stateReplacement);

const showToastMarker = `  const showToast = useCallback((message, severity = 'success') => {\n    setToast({ open: true, message, severity });\n  }, []);\n`;
const annotationLogic = `${showToastMarker}\n  // v52.48.5.32 기술자료 편집기 v1\n  // 원본 이미지는 수정하지 않고 image_key별 지시선/번호/명칭 좌표만 별도 저장합니다.\n  const loadTechnicalAnnotations = useCallback(async (imageKey) => {\n    const normalizedKey = String(imageKey || '').trim();\n    if (!normalizedKey) {\n      setTechnicalAnnotations([]);\n      return [];\n    }\n\n    setTechnicalAnnotationBusy(true);\n    try {\n      const { data, error } = await supabase\n        .from('unit_price_technical_annotations')\n        .select('annotations')\n        .eq('image_key', normalizedKey)\n        .maybeSingle();\n      if (error) throw error;\n      const next = normalizeTechnicalAnnotations(data?.annotations || []);\n      setTechnicalAnnotations(next);\n      return next;\n    } catch (error) {\n      const message = String(error?.message || '');\n      if (error?.code === '42P01' || /unit_price_technical_annotations/i.test(message)) {\n        console.warn('기술자료 지시선 DB가 아직 준비되지 않았습니다:', error);\n        setTechnicalAnnotations([]);\n        return [];\n      }\n      console.error('기술자료 지시선 조회 실패:', error);\n      setTechnicalAnnotations([]);\n      return [];\n    } finally {\n      setTechnicalAnnotationBusy(false);\n    }\n  }, []);\n\n  useEffect(() => {\n    const imageKey = String(selectedSpec?.image_key || '').trim();\n    if (!imageKey) {\n      // eslint-disable-next-line react-hooks/set-state-in-effect\n      setTechnicalAnnotations([]);\n      return;\n    }\n    loadTechnicalAnnotations(imageKey);\n  }, [loadTechnicalAnnotations, selectedSpec?.image_key]);\n`;
if (!source.includes(showToastMarker)) fail('showToast 기준 위치를 찾지 못했습니다.');
source = source.replace(showToastMarker, annotationLogic);

const viewerStart = source.indexOf('  // v52.48.5.31 기술자료 새창 보기');
const viewerEndMarker = '  const accessibleProjects = useMemo(() => {';
const viewerEnd = source.indexOf(viewerEndMarker, viewerStart);
if (viewerStart < 0 || viewerEnd < 0) fail('v52.48.5.31 기술자료 새창 보기 함수 범위를 찾지 못했습니다.');

const viewerAndEditor = `  // v52.48.5.32 기술자료 편집기 v1\n  // 조회 창은 일위대가 화면과 나란히 유지하며, 하단 항목 hover 시 해당 지시선/부재 위치가 강조됩니다.\n  const openTechnicalImageWindow = useCallback(() => {\n    const imageUrl = String(selectedSpec?.image_url || '').trim();\n    if (!imageUrl) return;\n\n    const imageTitle = [selectedMiddle, selectedDetail]\n      .filter(Boolean)\n      .join(' · ') || '기술자료';\n\n    const previewWindow = openTechnicalImageViewerWindow({\n      imageUrl,\n      title: imageTitle,\n      annotations: technicalAnnotations,\n    });\n\n    if (!previewWindow) {\n      showToast('기술자료 새 창이 차단되었습니다. 브라우저의 팝업 허용 후 다시 눌러주세요.', 'warning');\n    }\n  }, [\n    selectedDetail,\n    selectedMiddle,\n    selectedSpec?.image_url,\n    showToast,\n    technicalAnnotations,\n  ]);\n\n  const openTechnicalAnnotationEditor = useCallback(async () => {\n    if (!canManageTechnicalImages) {\n      showToast('기술자료 이미지를 편집할 권한이 없습니다.', 'warning');\n      return;\n    }\n\n    const imageKey = String(selectedSpec?.image_key || '').trim();\n    const imageUrl = String(selectedSpec?.image_url || '').trim();\n    if (!imageKey || !imageUrl) {\n      showToast('기술자료 이미지를 먼저 등록해주세요.', 'warning');\n      return;\n    }\n\n    const imageTitle = [selectedMiddle, selectedDetail]\n      .filter(Boolean)\n      .join(' · ') || '기술자료';\n\n    const result = await openTechnicalImageEditorWindow({\n      imageUrl,\n      title: imageTitle,\n      annotations: technicalAnnotations,\n    });\n\n    if (!result?.opened && result?.reason === 'blocked') {\n      showToast('기술자료 편집 창이 차단되었습니다. 브라우저의 팝업 허용 후 다시 눌러주세요.', 'warning');\n      return;\n    }\n    if (!result?.saved) return;\n\n    const nextAnnotations = normalizeTechnicalAnnotations(result.annotations);\n    setTechnicalAnnotationBusy(true);\n    try {\n      const { error } = await supabase.rpc('save_unit_price_technical_annotations', {\n        p_image_key: imageKey,\n        p_annotations: nextAnnotations,\n      });\n      if (error) throw error;\n      setTechnicalAnnotations(nextAnnotations);\n      showToast(\n        nextAnnotations.length > 0\n          ? \`기술자료 지시선 \${nextAnnotations.length}개를 저장했습니다.\`\n          : '기술자료 지시선을 모두 삭제했습니다.',\n      );\n      try {\n        if (result.popup && !result.popup.closed) result.popup.close();\n      } catch (_error) {\n        // 팝업 닫기 실패는 저장 결과에 영향을 주지 않습니다.\n      }\n    } catch (error) {\n      console.error('기술자료 지시선 저장 실패:', error);\n      const message = String(error?.message || '');\n      showToast(\n        message.includes('save_unit_price_technical_annotations')\n          ? 'v52.48.5.32 Supabase SQL을 먼저 실행해주세요.'\n          : message || '기술자료 지시선을 저장하지 못했습니다.',\n        'error',\n      );\n    } finally {\n      setTechnicalAnnotationBusy(false);\n    }\n  }, [\n    canManageTechnicalImages,\n    selectedDetail,\n    selectedMiddle,\n    selectedSpec?.image_key,\n    selectedSpec?.image_url,\n    showToast,\n    technicalAnnotations,\n  ]);\n\n`;
source = source.slice(0, viewerStart) + viewerAndEditor + source.slice(viewerEnd);

const headerOld = `                      {canManageTechnicalImages && (\n                        <Chip\n                          size="small"\n                          label="이미지 관리"\n                          variant="outlined"\n                          color="primary"\n                          sx={{ height: 20, fontSize: '0.58rem' }}\n                        />\n                      )}`;
const headerNew = `                      {technicalAnnotations.length > 0 && (\n                        <Chip\n                          size="small"\n                          label={\`지시선 \${technicalAnnotations.length}\`}\n                          variant="outlined"\n                          sx={{ height: 20, fontSize: '0.58rem', bgcolor: '#ffffff' }}\n                        />\n                      )}\n                      {canManageTechnicalImages && selectedSpec?.image_url && (\n                        <Button\n                          size="small"\n                          variant="outlined"\n                          startIcon={technicalAnnotationBusy ? <CircularProgress size={13} /> : <EditNoteRoundedIcon />}\n                          disabled={technicalAnnotationBusy}\n                          onClick={openTechnicalAnnotationEditor}\n                          sx={{ minHeight: 24, py: 0.1, px: 0.75, fontSize: '0.6rem' }}\n                        >\n                          지시선 편집\n                        </Button>\n                      )}\n                      {canManageTechnicalImages && (\n                        <Chip\n                          size="small"\n                          label="이미지 관리"\n                          variant="outlined"\n                          color="primary"\n                          sx={{ height: 20, fontSize: '0.58rem' }}\n                        />\n                      )}`;
if (!source.includes(headerOld)) fail('기술자료 헤더의 이미지 관리 표시 위치를 찾지 못했습니다.');
source = source.replace(headerOld, headerNew);

fs.writeFileSync(target, source, 'utf8');
fs.mkdirSync(path.dirname(utilTarget), { recursive: true });
fs.copyFileSync(utilSource, utilTarget);
fs.mkdirSync(path.dirname(sqlTarget), { recursive: true });
fs.copyFileSync(sqlSource, sqlTarget);

console.log('[수정] src/page/UnitPriceAnalysis.jsx');
console.log('[추가] src/utils/technicalImageAnnotations.js');
console.log('[추가] supabase/v52.48.5.32_unit_price_annotation_editor.sql');
console.log('\n[v52.48.5.32] 적용 완료');
console.log('1) Supabase SQL Editor에서 supabase/v52.48.5.32_unit_price_annotation_editor.sql 전체 실행');
console.log('2) npm.cmd run build');
console.log('3) npm.cmd run dev');
