const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.29';
const ROOT = process.cwd();
const PACKAGE_DIR = __dirname;

const unitPricePath = path.join(ROOT, 'src', 'page', 'UnitPriceAnalysis.jsx');
const dashboardPath = path.join(ROOT, 'src', 'Dashboard.jsx');
const sqlTargetPath = path.join(ROOT, 'supabase', 'v52.48.5.29_unit_price_technical_images.sql');
const imageTargetDir = path.join(ROOT, 'public', 'unit-price-technical-images');

const requiredFiles = [unitPricePath, dashboardPath];
for (const filePath of requiredFiles) {
  if (!fs.existsSync(filePath)) {
    console.error(`[적용 중단] 필수 파일을 찾지 못했습니다: ${path.relative(ROOT, filePath)}`);
    process.exit(1);
  }
}

const originalUnitPrice = fs.readFileSync(unitPricePath, 'utf8');
const originalDashboard = fs.readFileSync(dashboardPath, 'utf8');

if (
  originalUnitPrice.includes('canManageTechnicalImages = false') &&
  originalDashboard.includes('material.unit_price.tech_image.manage')
) {
  console.log(`[${VERSION}] 이미 적용된 코드입니다. 중복 적용하지 않습니다.`);
  process.exit(0);
}

function assertContains(source, needle, label) {
  if (!source.includes(needle)) {
    console.error(`[적용 중단] ${label} 기준 위치를 찾지 못했습니다.`);
    console.error('현재 코드가 예상 기준 버전과 다를 수 있으므로 기존 변경을 보호하기 위해 아무 파일도 수정하지 않았습니다.');
    process.exit(1);
  }
}

function replaceOnce(source, needle, replacement, label) {
  assertContains(source, needle, label);
  const first = source.indexOf(needle);
  const second = source.indexOf(needle, first + needle.length);
  if (second !== -1) {
    console.error(`[적용 중단] ${label} 기준 위치가 2개 이상 발견되었습니다.`);
    console.error('안전한 자동 적용을 위해 아무 파일도 수정하지 않았습니다.');
    process.exit(1);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

let nextUnitPrice = originalUnitPrice;
let nextDashboard = originalDashboard;

// 1) UnitPriceAnalysis에 기술자료 이미지 전용 관리권한 prop 추가
const componentPropsBefore = `export default function UnitPriceAnalysis({\n  projectName,\n  projectOptions = [],\n  canManage = false,\n}) {`;
const componentPropsAfter = `export default function UnitPriceAnalysis({\n  projectName,\n  projectOptions = [],\n  canManage = false,\n  canManageTechnicalImages = false,\n}) {`;
nextUnitPrice = replaceOnce(
  nextUnitPrice,
  componentPropsBefore,
  componentPropsAfter,
  'UnitPriceAnalysis props',
);

// 2) Storage bucket/path helper 추가
const missingTableAnchor = `const isMissingTableError = (error) => (`;
assertContains(nextUnitPrice, missingTableAnchor, '기술자료 Storage helper 삽입');
const technicalImageHelpers = `// ${VERSION} 일위대가 기술자료 이미지\nconst UNIT_PRICE_TECHNICAL_IMAGE_BUCKET = 'unit-price-technical-images';\nconst UNIT_PRICE_TECHNICAL_IMAGE_MAX_BYTES = 10 * 1024 * 1024;\nconst UNIT_PRICE_TECHNICAL_IMAGE_TYPES = new Set([\n  'image/png',\n  'image/jpeg',\n  'image/webp',\n]);\n\nconst normalizeTechnicalImageStorageKey = (value) => {\n  const normalized = String(value || '')\n    .normalize('NFKC')\n    .trim()\n    .replace(/[^a-zA-Z0-9가-힣_-]+/g, '-');\n  return normalized || 'technical-image';\n};\n\nconst getTechnicalImageStoragePath = (imageKey) => (\n  \`${'${normalizeTechnicalImageStorageKey(imageKey)}'}/technical-image\`\n);\n\n`;
nextUnitPrice = nextUnitPrice.replace(
  missingTableAnchor,
  technicalImageHelpers + missingTableAnchor,
);

// 3) ref/state 추가
const priceUploadRefAnchor = `  const priceUploadRef = useRef(null);`;
const imageStateBlock = `  const priceUploadRef = useRef(null);\n  const technicalImageInputRef = useRef(null);\n  const [technicalImageBusy, setTechnicalImageBusy] = useState(false);`;
nextUnitPrice = replaceOnce(
  nextUnitPrice,
  priceUploadRefAnchor,
  imageStateBlock,
  '기술자료 이미지 state/ref',
);

// 4) 기존 showToast 뒤에 업로드/교체/삭제 로직 추가
const accessibleProjectsAnchor = `  const accessibleProjects = useMemo(() => {`;
assertContains(nextUnitPrice, accessibleProjectsAnchor, '기술자료 이미지 동작 함수 삽입');
const technicalImageActions = `  // ${VERSION} 기술자료 이미지는 기존 image_key 그룹 단위로 관리합니다.\n  const applyTechnicalImageUrlLocally = useCallback((imageKey, imageUrl) => {\n    setSpecs((previous) => previous.map((spec) => (\n      spec.image_key === imageKey\n        ? { ...spec, image_url: imageUrl }\n        : spec\n    )));\n    setSelectedSpec((previous) => (\n      previous?.image_key === imageKey\n        ? { ...previous, image_url: imageUrl }\n        : previous\n    ));\n  }, []);\n\n  const persistTechnicalImageUrl = useCallback(async (imageKey, imageUrl) => {\n    const { error } = await supabase.rpc('set_unit_price_technical_image', {\n      p_image_key: imageKey,\n      p_image_url: imageUrl,\n    });\n    if (error) throw error;\n    applyTechnicalImageUrlLocally(imageKey, imageUrl);\n  }, [applyTechnicalImageUrlLocally]);\n\n  const uploadTechnicalImage = useCallback(async (file) => {\n    if (!file) return;\n    if (!canManageTechnicalImages) {\n      showToast('기술자료 이미지를 수정할 권한이 없습니다.', 'warning');\n      return;\n    }\n\n    const imageKey = String(selectedSpec?.image_key || '').trim();\n    if (!imageKey) {\n      showToast('선택한 규격에 기술자료 이미지 키가 없습니다.', 'warning');\n      return;\n    }\n    if (!UNIT_PRICE_TECHNICAL_IMAGE_TYPES.has(file.type)) {\n      showToast('PNG, JPG(JPEG), WEBP 이미지만 업로드할 수 있습니다.', 'warning');\n      return;\n    }\n    if (file.size > UNIT_PRICE_TECHNICAL_IMAGE_MAX_BYTES) {\n      showToast('기술자료 이미지는 10MB 이하만 업로드할 수 있습니다.', 'warning');\n      return;\n    }\n\n    setTechnicalImageBusy(true);\n    try {\n      const storagePath = getTechnicalImageStoragePath(imageKey);\n      const { error: uploadError } = await supabase.storage\n        .from(UNIT_PRICE_TECHNICAL_IMAGE_BUCKET)\n        .upload(storagePath, file, {\n          upsert: true,\n          contentType: file.type,\n          cacheControl: '3600',\n        });\n      if (uploadError) throw uploadError;\n\n      const { data: publicUrlData } = supabase.storage\n        .from(UNIT_PRICE_TECHNICAL_IMAGE_BUCKET)\n        .getPublicUrl(storagePath);\n      const publicUrl = String(publicUrlData?.publicUrl || '').trim();\n      if (!publicUrl) throw new Error('업로드된 기술자료 이미지 URL을 만들지 못했습니다.');\n\n      const versionedUrl = \`${'${publicUrl}'}?v=${'${Date.now()}'}\`;\n      await persistTechnicalImageUrl(imageKey, versionedUrl);\n      showToast('기술자료 이미지를 저장했습니다.');\n    } catch (error) {\n      console.error('기술자료 이미지 업로드 실패:', error);\n      showToast(error?.message || '기술자료 이미지를 업로드하지 못했습니다.', 'error');\n    } finally {\n      setTechnicalImageBusy(false);\n      if (technicalImageInputRef.current) technicalImageInputRef.current.value = '';\n    }\n  }, [canManageTechnicalImages, persistTechnicalImageUrl, selectedSpec?.image_key, showToast]);\n\n  const removeTechnicalImage = useCallback(async () => {\n    if (!canManageTechnicalImages) {\n      showToast('기술자료 이미지를 수정할 권한이 없습니다.', 'warning');\n      return;\n    }\n\n    const imageKey = String(selectedSpec?.image_key || '').trim();\n    if (!imageKey) return;\n    if (!window.confirm('현재 기술자료 이미지를 삭제하시겠습니까?')) return;\n\n    setTechnicalImageBusy(true);\n    try {\n      const storagePath = getTechnicalImageStoragePath(imageKey);\n      const { error: removeError } = await supabase.storage\n        .from(UNIT_PRICE_TECHNICAL_IMAGE_BUCKET)\n        .remove([storagePath]);\n      if (removeError) {\n        console.warn('Storage 기존 이미지 삭제 경고:', removeError);\n      }\n\n      await persistTechnicalImageUrl(imageKey, '');\n      showToast('기술자료 이미지를 삭제했습니다.', 'info');\n    } catch (error) {\n      console.error('기술자료 이미지 삭제 실패:', error);\n      showToast(error?.message || '기술자료 이미지를 삭제하지 못했습니다.', 'error');\n    } finally {\n      setTechnicalImageBusy(false);\n    }\n  }, [canManageTechnicalImages, persistTechnicalImageUrl, selectedSpec?.image_key, showToast]);\n\n`;
nextUnitPrice = nextUnitPrice.replace(
  accessibleProjectsAnchor,
  technicalImageActions + accessibleProjectsAnchor,
);

// 5) 우측 기존 기술자료 표시영역만 새 viewer/uploader로 교체
const techPanelStart = `                <Paper variant="outlined" sx={{ p: 1.3, minHeight: 180, display: 'grid', placeItems: 'center', bgcolor: '#f8fafc' }}>`;
const techPanelEnd = `\n\n                <FormControl size="small" fullWidth>`;
const panelStartIndex = nextUnitPrice.indexOf(techPanelStart);
const panelEndIndex = nextUnitPrice.indexOf(techPanelEnd, panelStartIndex);
if (panelStartIndex === -1 || panelEndIndex === -1) {
  console.error('[적용 중단] 기존 기술자료 이미지 표시영역을 정확히 찾지 못했습니다.');
  console.error('기존 변경을 보호하기 위해 아무 파일도 수정하지 않았습니다.');
  process.exit(1);
}
const technicalImagePanel = `                <Paper\n                  variant="outlined"\n                  sx={{ p: 1.15, minHeight: 180, bgcolor: '#f8fafc', borderColor: '#cbd5e1' }}\n                >\n                  <Stack spacing={0.8} sx={{ width: '100%' }}>\n                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>\n                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 900, color: '#334155' }}>\n                        기술자료\n                      </Typography>\n                      <Box sx={{ flex: 1 }} />\n                      {canManageTechnicalImages && (\n                        <Chip\n                          size="small"\n                          label="이미지 관리"\n                          variant="outlined"\n                          color="primary"\n                          sx={{ height: 20, fontSize: '0.58rem' }}\n                        />\n                      )}\n                    </Box>\n\n                    {selectedSpec?.image_url ? (\n                      <>\n                        <Box\n                          sx={{\n                            minHeight: 145,\n                            display: 'grid',\n                            placeItems: 'center',\n                            overflow: 'hidden',\n                            borderRadius: 1,\n                            bgcolor: '#ffffff',\n                            border: '1px solid #e2e8f0',\n                          }}\n                        >\n                          <Box\n                            component="img"\n                            src={selectedSpec.image_url}\n                            alt={selectedSpec.detail_category || '기술자료'}\n                            sx={{ width: '100%', maxHeight: 260, objectFit: 'contain', display: 'block' }}\n                          />\n                        </Box>\n                        {canManageTechnicalImages && (\n                          <Stack direction="row" spacing={0.6} justifyContent="flex-end">\n                            <Button\n                              size="small"\n                              variant="outlined"\n                              startIcon={technicalImageBusy ? <CircularProgress size={14} /> : <UploadFileRoundedIcon />}\n                              disabled={technicalImageBusy}\n                              onClick={() => technicalImageInputRef.current?.click()}\n                              sx={{ fontSize: '0.64rem' }}\n                            >\n                              교체\n                            </Button>\n                            <Button\n                              size="small"\n                              color="error"\n                              variant="outlined"\n                              startIcon={<DeleteOutlineRoundedIcon />}\n                              disabled={technicalImageBusy}\n                              onClick={removeTechnicalImage}\n                              sx={{ fontSize: '0.64rem' }}\n                            >\n                              삭제\n                            </Button>\n                          </Stack>\n                        )}\n                      </>\n                    ) : canManageTechnicalImages ? (\n                      <Button\n                        variant="outlined"\n                        disabled={technicalImageBusy || !selectedSpec?.image_key}\n                        onClick={() => technicalImageInputRef.current?.click()}\n                        sx={{\n                          minHeight: 150,\n                          borderStyle: 'dashed',\n                          display: 'flex',\n                          flexDirection: 'column',\n                          gap: 0.6,\n                          color: '#64748b',\n                          bgcolor: '#ffffff',\n                        }}\n                      >\n                        {technicalImageBusy ? <CircularProgress size={26} /> : <UploadFileRoundedIcon sx={{ fontSize: 34 }} />}\n                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 900 }}>기술자료 이미지 업로드</Typography>\n                        <Typography sx={{ fontSize: '0.6rem', color: '#94a3b8' }}>PNG · JPG · WEBP / 최대 10MB</Typography>\n                      </Button>\n                    ) : (\n                      <Stack\n                        alignItems="center"\n                        justifyContent="center"\n                        spacing={0.55}\n                        sx={{ minHeight: 150, color: '#94a3b8' }}\n                      >\n                        <ImageOutlinedIcon sx={{ fontSize: 38 }} />\n                        <Typography sx={{ fontWeight: 800, fontSize: '0.72rem' }}>등록된 기술자료 이미지가 없습니다.</Typography>\n                      </Stack>\n                    )}\n\n                    {canManageTechnicalImages && (\n                      <input\n                        ref={technicalImageInputRef}\n                        type="file"\n                        hidden\n                        accept="image/png,image/jpeg,image/webp"\n                        onChange={(event) => uploadTechnicalImage(event.target.files?.[0])}\n                      />\n                    )}\n                  </Stack>\n                </Paper>`;
nextUnitPrice =
  nextUnitPrice.slice(0, panelStartIndex) +
  technicalImagePanel +
  nextUnitPrice.slice(panelEndIndex);

// 6) Dashboard는 기존 canManage를 건드리지 않고 기술자료 이미지 전용 권한 prop만 추가
const unitPriceComponentStart = nextDashboard.indexOf('<UnitPriceAnalysis');
if (unitPriceComponentStart === -1) {
  console.error('[적용 중단] Dashboard의 UnitPriceAnalysis 연결부를 찾지 못했습니다.');
  process.exit(1);
}
const unitPriceComponentEnd = nextDashboard.indexOf('/>', unitPriceComponentStart);
if (unitPriceComponentEnd === -1) {
  console.error('[적용 중단] Dashboard의 UnitPriceAnalysis 닫힘 위치를 찾지 못했습니다.');
  process.exit(1);
}
const currentUnitPriceBlock = nextDashboard.slice(unitPriceComponentStart, unitPriceComponentEnd + 2);
if (!currentUnitPriceBlock.includes('canManage={Boolean(')) {
  console.error('[적용 중단] 현재 일위대가 관리권한 연결 구조가 예상과 다릅니다.');
  process.exit(1);
}
if (!currentUnitPriceBlock.includes('canManageTechnicalImages=')) {
  const propIndentMatch = currentUnitPriceBlock.match(/\n(\s*)projectName=/);
  const closingIndentMatch = currentUnitPriceBlock.match(/\n(\s*)\/>$/);
  if (!propIndentMatch || !closingIndentMatch) {
    console.error('[적용 중단] Dashboard의 일위대가 컴포넌트 들여쓰기 구조가 예상과 다릅니다.');
    process.exit(1);
  }
  const propIndent = propIndentMatch[1];
  const closingIndent = closingIndentMatch[1];
  const insertion = [
    `${propIndent}canManageTechnicalImages={Boolean(`,
    `${propIndent}  isSuperAdmin ||`,
    `${propIndent}    hasPermission(`,
    `${propIndent}      'material.unit_price.tech_image.manage',`,
    `${propIndent}      activeProjectName,`,
    `${propIndent}    ) === true`,
    `${propIndent})}`,
  ].join('\n');
  const nextBlock = currentUnitPriceBlock.replace(
    /\n\s*\/>$/,
    `\n${insertion}\n${closingIndent}/>`,
  );
  nextDashboard =
    nextDashboard.slice(0, unitPriceComponentStart) +
    nextBlock +
    nextDashboard.slice(unitPriceComponentEnd + 2);
}

// 모든 검증/변환이 완료된 뒤에만 백업 및 실제 파일 쓰기
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_${VERSION}_${timestamp}`);
fs.mkdirSync(backupDir, { recursive: true });
fs.mkdirSync(path.join(backupDir, 'src', 'page'), { recursive: true });
fs.mkdirSync(path.join(backupDir, 'src'), { recursive: true });
fs.copyFileSync(unitPricePath, path.join(backupDir, 'src', 'page', 'UnitPriceAnalysis.jsx'));
fs.copyFileSync(dashboardPath, path.join(backupDir, 'src', 'Dashboard.jsx'));

fs.writeFileSync(unitPricePath, nextUnitPrice, 'utf8');
fs.writeFileSync(dashboardPath, nextDashboard, 'utf8');

fs.mkdirSync(path.dirname(sqlTargetPath), { recursive: true });
fs.copyFileSync(
  path.join(PACKAGE_DIR, 'supabase', 'v52.48.5.29_unit_price_technical_images.sql'),
  sqlTargetPath,
);

fs.mkdirSync(imageTargetDir, { recursive: true });
fs.copyFileSync(
  path.join(PACKAGE_DIR, 'assets', 'clip-bar-ceiling.png'),
  path.join(imageTargetDir, 'clip-bar-ceiling.png'),
);
fs.copyFileSync(
  path.join(PACKAGE_DIR, 'assets', 'clip-bar-ceiling-wind-pressure.png'),
  path.join(imageTargetDir, 'clip-bar-ceiling-wind-pressure.png'),
);

console.log('');
console.log(`[${VERSION}] 적용 완료`);
console.log(`백업: ${path.relative(ROOT, backupDir)}`);
console.log('수정: src/page/UnitPriceAnalysis.jsx');
console.log('수정: src/Dashboard.jsx');
console.log('추가: supabase/v52.48.5.29_unit_price_technical_images.sql');
console.log('추가: public/unit-price-technical-images/clip-bar-ceiling.png');
console.log('추가: public/unit-price-technical-images/clip-bar-ceiling-wind-pressure.png');
console.log('');
console.log('[다음 단계]');
console.log('1) Supabase SQL Editor에서 supabase/v52.48.5.29_unit_price_technical_images.sql 전체 실행');
console.log('2) npm.cmd run build');
console.log('3) npm.cmd run dev');
console.log('');
