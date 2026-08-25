const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.30';
const ROOT = process.cwd();
const unitPricePath = path.join(ROOT, 'src', 'page', 'UnitPriceAnalysis.jsx');

if (!fs.existsSync(unitPricePath)) {
  console.error(`[적용 중단] 필수 파일을 찾지 못했습니다: ${path.relative(ROOT, unitPricePath)}`);
  process.exit(1);
}

const original = fs.readFileSync(unitPricePath, 'utf8');

if (original.includes('v52.48.5.30 기술자료 이미지 상세보기')) {
  console.log(`[${VERSION}] 이미 적용된 코드입니다. 중복 적용하지 않습니다.`);
  process.exit(0);
}

function assertContains(source, needle, label) {
  if (!source.includes(needle)) {
    console.error(`[적용 중단] ${label} 기준 위치를 찾지 못했습니다.`);
    console.error('현재 코드를 유지하기 위해 아무 파일도 수정하지 않았습니다.');
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

// v52.48.5.29 기술자료 업로드 기능이 적용된 현재 코드만 대상으로 합니다.
assertContains(original, "canManageTechnicalImages = false", 'v52.48.5.29 기술자료 관리권한');
assertContains(original, "const [technicalImageBusy, setTechnicalImageBusy] = useState(false);", '기술자료 이미지 상태');
assertContains(original, "기술자료 이미지 업로드", '기술자료 업로드 UI');

let next = original;

// 1) 상세보기 팝업 상태 추가
const stateBefore = `  const [technicalImageBusy, setTechnicalImageBusy] = useState(false);`;
const stateAfter = `  const [technicalImageBusy, setTechnicalImageBusy] = useState(false);\n  // v52.48.5.30 기술자료 이미지 상세보기\n  const [technicalImagePreviewOpen, setTechnicalImagePreviewOpen] = useState(false);`;
next = replaceOnce(next, stateBefore, stateAfter, '기술자료 상세보기 state');

// 2) 기존 썸네일 이미지만 클릭 가능한 확대보기 이미지로 변경
const imageBefore = `                          <Box\n                            component="img"\n                            src={selectedSpec.image_url}\n                            alt={selectedSpec.detail_category || '기술자료'}\n                            sx={{ width: '100%', maxHeight: 260, objectFit: 'contain', display: 'block' }}\n                          />`;
const imageAfter = `                          <Tooltip title="클릭해서 크게 보기" arrow>\n                            <Box\n                              component="img"\n                              src={selectedSpec.image_url}\n                              alt={selectedSpec.detail_category || '기술자료'}\n                              role="button"\n                              tabIndex={0}\n                              aria-label="기술자료 이미지 크게 보기"\n                              onClick={() => setTechnicalImagePreviewOpen(true)}\n                              onKeyDown={(event) => {\n                                if (event.key === 'Enter' || event.key === ' ') {\n                                  event.preventDefault();\n                                  setTechnicalImagePreviewOpen(true);\n                                }\n                              }}\n                              sx={{\n                                width: '100%',\n                                maxHeight: 260,\n                                objectFit: 'contain',\n                                display: 'block',\n                                cursor: 'zoom-in',\n                                transition: 'opacity 0.15s ease, transform 0.15s ease',\n                                '&:hover': {\n                                  opacity: 0.92,\n                                  transform: 'scale(1.01)',\n                                },\n                                '&:focus-visible': {\n                                  outline: '2px solid #2563eb',\n                                  outlineOffset: 2,\n                                },\n                              }}\n                            />\n                          </Tooltip>`;
next = replaceOnce(next, imageBefore, imageAfter, '기술자료 썸네일 클릭 확대');

// 3) 기존 다이얼로그 영역 앞에 큰 이미지 상세보기 창 추가
const dialogAnchor = `      <Dialog\n        open={nameGuideDialogOpen}`;
assertContains(next, dialogAnchor, '문서명 안내 다이얼로그');

const previewDialog = `      {/* v52.48.5.30 기술자료 이미지 상세보기 - 조회는 모든 일위대가 열람 사용자에게 제공 */}\n      <Dialog\n        open={technicalImagePreviewOpen && Boolean(selectedSpec?.image_url)}\n        onClose={() => setTechnicalImagePreviewOpen(false)}\n        fullWidth\n        maxWidth="xl"\n        PaperProps={{\n          sx: {\n            width: '96vw',\n            maxWidth: '1600px',\n            height: '92vh',\n            maxHeight: '92vh',\n            m: 1.5,\n          },\n        }}\n      >\n        <DialogTitle sx={{ py: 1.2, px: 1.8 }}>\n          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>\n            <Box sx={{ minWidth: 0, flex: 1 }}>\n              <Typography sx={{ fontSize: '1rem', fontWeight: 950, color: '#0f172a' }}>\n                기술자료 상세보기\n              </Typography>\n              <Typography sx={{ mt: 0.15, fontSize: '0.7rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>\n                {[selectedMiddle, selectedDetail].filter(Boolean).join(' · ')}\n              </Typography>\n            </Box>\n            <Chip size="small" label="업무 참고용" variant="outlined" sx={{ flexShrink: 0 }} />\n          </Box>\n        </DialogTitle>\n        <DialogContent\n          dividers\n          sx={{\n            p: 1.2,\n            minHeight: 0,\n            display: 'grid',\n            placeItems: 'center',\n            overflow: 'auto',\n            bgcolor: '#0f172a',\n          }}\n        >\n          {selectedSpec?.image_url && (\n            <Box\n              component="img"\n              src={selectedSpec.image_url}\n              alt={selectedSpec.detail_category || '기술자료 상세보기'}\n              sx={{\n                display: 'block',\n                width: 'auto',\n                height: 'auto',\n                maxWidth: '100%',\n                maxHeight: 'calc(92vh - 132px)',\n                objectFit: 'contain',\n                bgcolor: '#ffffff',\n                boxShadow: '0 10px 36px rgba(0,0,0,0.28)',\n              }}\n            />\n          )}\n        </DialogContent>\n        <DialogActions sx={{ px: 1.5, py: 0.8 }}>\n          <Typography sx={{ mr: 'auto', fontSize: '0.65rem', color: '#64748b' }}>\n            설치구조·부재명·접합관계 확인용 기술자료\n          </Typography>\n          <Button onClick={() => setTechnicalImagePreviewOpen(false)}>닫기</Button>\n        </DialogActions>\n      </Dialog>\n\n`;
next = next.replace(dialogAnchor, previewDialog + dialogAnchor);

// 모든 변환이 성공한 뒤에만 백업하고 실제 파일을 수정합니다.
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_${VERSION}_${timestamp}`);
fs.mkdirSync(path.join(backupDir, 'src', 'page'), { recursive: true });
fs.copyFileSync(unitPricePath, path.join(backupDir, 'src', 'page', 'UnitPriceAnalysis.jsx'));
fs.writeFileSync(unitPricePath, next, 'utf8');

console.log('');
console.log(`[${VERSION}] 적용 완료`);
console.log(`백업: ${path.relative(ROOT, backupDir)}`);
console.log('수정: src/page/UnitPriceAnalysis.jsx');
console.log('DB / Supabase SQL 변경 없음');
console.log('기존 업로드 권한 및 기술자료 저장 데이터 변경 없음');
console.log('');
console.log('[다음 단계]');
console.log('1) npm.cmd run build');
console.log('2) npm.cmd run dev');
console.log('3) 일위대가작성 > 기술자료 이미지를 클릭해 큰 상세보기 창 확인');
console.log('');
