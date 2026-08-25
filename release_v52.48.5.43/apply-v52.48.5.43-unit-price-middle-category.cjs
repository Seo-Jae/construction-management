const fs = require('fs');
const path = require('path');

const root = process.cwd();
const unitPath = path.join(root, 'src', 'page', 'UnitPriceAnalysis.jsx');
const dashboardPath = path.join(root, 'src', 'Dashboard.jsx');
const sqlSourcePath = path.join(__dirname, 'v52.48.5.43_unit_price_middle_category_manage.sql');
const sqlTargetPath = path.join(root, 'supabase', 'v52.48.5.43_unit_price_middle_category_manage.sql');
const versionMarker = '// v52.48.5.43 중분류 최고관리자 관리';

function fail(message) {
  console.error(`\n[적용 중단] ${message}`);
  process.exit(1);
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first === -1) fail(`${label} 기준 위치를 찾지 못했습니다. 기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.`);
  if (source.indexOf(search, first + search.length) !== -1) {
    fail(`${label} 기준 위치가 2개 이상입니다. 안전을 위해 자동 적용을 중단합니다.`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

if (!fs.existsSync(unitPath)) fail('src/page/UnitPriceAnalysis.jsx 파일을 찾지 못했습니다.');
if (!fs.existsSync(dashboardPath)) fail('src/Dashboard.jsx 파일을 찾지 못했습니다.');
if (!fs.existsSync(sqlSourcePath)) fail('패키지 SQL 파일을 찾지 못했습니다.');

let unit = fs.readFileSync(unitPath, 'utf8');
let dashboard = fs.readFileSync(dashboardPath, 'utf8');

if (unit.includes(versionMarker)) {
  fs.mkdirSync(path.dirname(sqlTargetPath), { recursive: true });
  fs.copyFileSync(sqlSourcePath, sqlTargetPath);
  console.log('[확인] v52.48.5.43은 이미 적용되어 있습니다. SQL 파일만 다시 준비했습니다.');
  process.exit(0);
}

if (!unit.includes('// v52.48.5.42.3.1 기본 잡자재 가산액 500원')) {
  fail('UnitPriceAnalysis.jsx가 예상 기준(v52.48.5.42.3.1)과 다릅니다. 기존 변경을 보호하기 위해 자동 적용하지 않았습니다.');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(root, `backup_v52.48.5.43_${stamp}`);
fs.mkdirSync(path.join(backupRoot, 'src', 'page'), { recursive: true });
fs.mkdirSync(path.join(backupRoot, 'src'), { recursive: true });
fs.copyFileSync(unitPath, path.join(backupRoot, 'src', 'page', 'UnitPriceAnalysis.jsx'));
fs.copyFileSync(dashboardPath, path.join(backupRoot, 'src', 'Dashboard.jsx'));

unit = replaceOnce(
  unit,
  `// v52.48.5.42.3.1 기본 잡자재 가산액 500원\nconst DEFAULT_ROUNDING_ITEM_NAME = '잡자재';`,
  `// v52.48.5.42.3.1 기본 잡자재 가산액 500원\n${versionMarker}\nconst DEFAULT_ROUNDING_ITEM_NAME = '잡자재';`,
  '버전 마커',
);

unit = replaceOnce(
  unit,
  `export default function UnitPriceAnalysis({\n  projectName,\n  projectOptions = [],\n  canManage = false,\n  canManageTechnicalImages = false,\n}) {`,
  `export default function UnitPriceAnalysis({\n  projectName,\n  projectOptions = [],\n  canManage = false,\n  canManageTechnicalImages = false,\n  isSuperAdmin = false,\n}) {`,
  'UnitPriceAnalysis props',
);

unit = replaceOnce(
  unit,
  `  const [documentScope, setDocumentScope] = useState('current');\n  const [documentSearch, setDocumentSearch] = useState('');\n  const [materialSearch, setMaterialSearch] = useState('');`,
  `  const [documentScope, setDocumentScope] = useState('current');\n  const [documentSearch, setDocumentSearch] = useState('');\n  const [middleCategoryDialog, setMiddleCategoryDialog] = useState({\n    open: false,\n    original: '',\n    value: '',\n    saving: false,\n  });\n  const [materialSearch, setMaterialSearch] = useState('');`,
  '중분류 관리 state',
);

const handlerInsertion = `  const openMiddleCategoryDialog = () => {\n    if (!isSuperAdmin || !selectedMajor || !selectedMiddle) return;\n\n    setMiddleCategoryDialog({\n      open: true,\n      original: selectedMiddle,\n      value: selectedMiddle,\n      saving: false,\n    });\n  };\n\n  const closeMiddleCategoryDialog = () => {\n    if (middleCategoryDialog.saving) return;\n    setMiddleCategoryDialog({\n      open: false,\n      original: '',\n      value: '',\n      saving: false,\n    });\n  };\n\n  const saveMiddleCategoryName = async () => {\n    if (!isSuperAdmin) {\n      showToast('중분류 수정은 최고관리자만 가능합니다.', 'warning');\n      return;\n    }\n\n    const originalMiddle = String(middleCategoryDialog.original || '').trim();\n    const nextMiddle = String(middleCategoryDialog.value || '').trim();\n\n    if (!selectedMajor || !originalMiddle) {\n      showToast('수정할 중분류를 선택해주세요.', 'warning');\n      return;\n    }\n\n    if (!nextMiddle) {\n      showToast('변경할 중분류명을 입력해주세요.', 'warning');\n      return;\n    }\n\n    if (nextMiddle.length > 60) {\n      showToast('중분류명은 60자 이하로 입력해주세요.', 'warning');\n      return;\n    }\n\n    if (nextMiddle === originalMiddle) {\n      closeMiddleCategoryDialog();\n      return;\n    }\n\n    const isMerge = specs.some((item) => (\n      item.major_category === selectedMajor &&\n      item.middle_category === nextMiddle &&\n      item.middle_category !== originalMiddle\n    ));\n\n    setMiddleCategoryDialog((previous) => ({\n      ...previous,\n      saving: true,\n    }));\n\n    try {\n      const { data, error } = await supabase.rpc(\n        'rename_unit_price_middle_category_v1',\n        {\n          p_major_category: selectedMajor,\n          p_old_middle_category: originalMiddle,\n          p_new_middle_category: nextMiddle,\n        },\n      );\n\n      if (error) throw error;\n\n      setSpecs((previous) => previous.map((item) => (\n        item.major_category === selectedMajor &&\n        item.middle_category === originalMiddle\n          ? { ...item, middle_category: nextMiddle }\n          : item\n      )));\n\n      setSelectedMiddle(nextMiddle);\n      setSelectedSpec((previous) => (\n        previous?.major_category === selectedMajor &&\n        previous?.middle_category === originalMiddle\n          ? { ...previous, middle_category: nextMiddle }\n          : previous\n      ));\n\n      await loadDocuments();\n\n      setMiddleCategoryDialog({\n        open: false,\n        original: '',\n        value: '',\n        saving: false,\n      });\n\n      const renamedSpecs = toNumber(data?.renamed_specs);\n      const updatedDocuments = toNumber(data?.updated_documents);\n      showToast(\n        isMerge\n          ? \`중분류 “\${originalMiddle}”을(를) “\${nextMiddle}”에 통합했습니다. 기준규격 \${renamedSpecs}개 · 기존문서 \${updatedDocuments}건 반영\`\n          : \`중분류명을 “\${originalMiddle}” → “\${nextMiddle}”로 변경했습니다. 기준규격 \${renamedSpecs}개 · 기존문서 \${updatedDocuments}건 반영\`,\n      );\n    } catch (error) {\n      console.error('일위대가 중분류 수정 실패:', error);\n      const message = String(error?.message || '');\n      showToast(\n        message.includes('rename_unit_price_middle_category_v1')\n          ? 'v52.48.5.43 Supabase SQL을 먼저 실행해주세요.'\n          : message || '중분류명을 변경하지 못했습니다.',\n        'error',\n      );\n      setMiddleCategoryDialog((previous) => ({\n        ...previous,\n        saving: false,\n      }));\n    }\n  };\n\n`;

unit = replaceOnce(
  unit,
  `  const validateDocumentForSave = () => {`,
  `${handlerInsertion}  const validateDocumentForSave = () => {`,
  '중분류 관리 handler',
);

const oldMiddleField = `                    <TextField\n                      select label="중분류" value={selectedMiddle} size="small"\n                      sx={compactFilterFieldSx}\n                      onChange={(event) => {\n                        const middle = event.target.value;\n                        const detail = specs.find((item) => item.major_category === selectedMajor && item.middle_category === middle)?.detail_category || '';\n                        handleSpecChange(detail, selectedMajor, middle);\n                      }}\n                    >{middleOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>`;

const newMiddleField = `                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.35, minWidth: 0 }}>\n                      <TextField\n                        select label="중분류" value={selectedMiddle} size="small"\n                        sx={{ ...compactFilterFieldSx, flex: 1, minWidth: 0 }}\n                        onChange={(event) => {\n                          const middle = event.target.value;\n                          const detail = specs.find((item) => item.major_category === selectedMajor && item.middle_category === middle)?.detail_category || '';\n                          handleSpecChange(detail, selectedMajor, middle);\n                        }}\n                      >{middleOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</TextField>\n                      {isSuperAdmin && (\n                        <Tooltip title="중분류 관리" arrow>\n                          <span>\n                            <IconButton\n                              size="small"\n                              aria-label="중분류 관리"\n                              disabled={!selectedMajor || !selectedMiddle}\n                              onClick={openMiddleCategoryDialog}\n                              sx={{\n                                width: 30,\n                                height: 30,\n                                flexShrink: 0,\n                                border: '1px solid #cbd5e1',\n                                borderRadius: 1,\n                                bgcolor: '#ffffff',\n                              }}\n                            >\n                              <EditNoteRoundedIcon fontSize="small" />\n                            </IconButton>\n                          </span>\n                        </Tooltip>\n                      )}\n                    </Box>`;

unit = replaceOnce(unit, oldMiddleField, newMiddleField, '중분류 입력 UI');

const dialogBlock = `      <Dialog\n        open={middleCategoryDialog.open}\n        onClose={closeMiddleCategoryDialog}\n        fullWidth\n        maxWidth="xs"\n      >\n        <DialogTitle>중분류 관리</DialogTitle>\n        <DialogContent sx={{ pt: '10px !important' }}>\n          <Stack spacing={1.2}>\n            <Alert severity="info" sx={{ fontSize: '0.72rem' }}>\n              중분류는 모든 현장이 함께 사용하는 일위대가 기준정보입니다. 이름을 변경하면 해당 중분류의 기준규격과 기존 문서의 현재 분류명도 함께 변경됩니다. 과거 버전 이력은 그대로 보존됩니다.\n            </Alert>\n            <TextField\n              size="small"\n              label="대분류"\n              value={selectedMajor}\n              disabled\n            />\n            <TextField\n              size="small"\n              label="현재 중분류"\n              value={middleCategoryDialog.original}\n              disabled\n            />\n            <TextField\n              autoFocus\n              size="small"\n              label="변경할 중분류명"\n              value={middleCategoryDialog.value}\n              onChange={(event) => setMiddleCategoryDialog((previous) => ({\n                ...previous,\n                value: event.target.value,\n              }))}\n              onKeyDown={(event) => {\n                if (event.key === 'Enter' && !middleCategoryDialog.saving) {\n                  event.preventDefault();\n                  saveMiddleCategoryName();\n                }\n              }}\n              inputProps={{ maxLength: 60 }}\n            />\n            {Boolean(\n              String(middleCategoryDialog.value || '').trim() &&\n              String(middleCategoryDialog.value || '').trim() !== middleCategoryDialog.original &&\n              specs.some((item) => (\n                item.major_category === selectedMajor &&\n                item.middle_category === String(middleCategoryDialog.value || '').trim()\n              ))\n            ) && (\n              <Alert severity="warning" sx={{ fontSize: '0.72rem' }}>\n                이미 존재하는 중분류명입니다. 동일한 세부규격이 겹치지 않으면 두 중분류가 하나로 통합됩니다. 동일 세부규격이 있으면 데이터 보호를 위해 저장을 중단합니다.\n              </Alert>\n            )}\n          </Stack>\n        </DialogContent>\n        <DialogActions>\n          <Button onClick={closeMiddleCategoryDialog} disabled={middleCategoryDialog.saving}>\n            취소\n          </Button>\n          <Button\n            variant="contained"\n            onClick={saveMiddleCategoryName}\n            disabled={\n              middleCategoryDialog.saving ||\n              !String(middleCategoryDialog.value || '').trim()\n            }\n            startIcon={middleCategoryDialog.saving ? <CircularProgress size={15} /> : <SaveRoundedIcon />}\n          >\n            {specs.some((item) => (\n              item.major_category === selectedMajor &&\n              item.middle_category === String(middleCategoryDialog.value || '').trim() &&\n              String(middleCategoryDialog.value || '').trim() !== middleCategoryDialog.original\n            )) ? '통합 적용' : '이름 변경'}\n          </Button>\n        </DialogActions>\n      </Dialog>\n\n`;

unit = replaceOnce(
  unit,
  `      <Dialog\n        open={nameGuideDialogOpen}`,
  `${dialogBlock}      <Dialog\n        open={nameGuideDialogOpen}`,
  '중분류 관리 Dialog',
);

dashboard = replaceOnce(
  dashboard,
  `                projectOptions={accessibleProjectNames}\n                canManage={Boolean(`,
  `                projectOptions={accessibleProjectNames}\n                isSuperAdmin={isSuperAdmin}\n                canManage={Boolean(`,
  'Dashboard 최고관리자 prop',
);

fs.writeFileSync(unitPath, unit, 'utf8');
fs.writeFileSync(dashboardPath, dashboard, 'utf8');
fs.mkdirSync(path.dirname(sqlTargetPath), { recursive: true });
fs.copyFileSync(sqlSourcePath, sqlTargetPath);

console.log('');
console.log('=== v52.48.5.43 적용 완료 ===');
console.log('- 최고관리자만 일위대가 중분류 관리 버튼 표시');
console.log('- 중분류 이름 변경 및 충돌 없는 기존 중분류 통합 지원');
console.log('- 기존 문서 현재 분류명 동기화 / 버전이력 보존');
console.log('- Supabase SQL 파일 준비:', path.relative(root, sqlTargetPath));
console.log('- 백업:', path.relative(root, backupRoot));
console.log('');
console.log('중요: 배포 후 기능 사용 전 Supabase SQL Editor에서 아래 파일 전체를 1회 실행하세요.');
console.log('supabase/v52.48.5.43_unit_price_middle_category_manage.sql');
