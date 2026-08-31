const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.75';
const projectRoot = process.cwd();
const targetPath = path.join(projectRoot, 'src', 'page', 'UnitPriceAnalysis.jsx');
const replacements = [{"label": "일위대가 행 작업바 여백/클릭영역 보정", "oldText": "                    sx={{\n                      minHeight: 34,\n                      px: 0.75,\n                      py: 0.35,\n                      mb: 0.8,\n                      display: 'flex',\n                      alignItems: 'center',\n                      gap: 0.45,\n                      borderColor: '#94a3b8',\n                      boxShadow: 'none',\n                    }}\n                  >", "newText": "                    sx={{\n                      minHeight: 34,\n                      pl: 1.15,\n                      pr: 0.75,\n                      py: 0.35,\n                      mb: 0.8,\n                      display: 'flex',\n                      alignItems: 'center',\n                      gap: 0.45,\n                      position: 'relative',\n                      overflow: 'visible',\n                      isolation: 'isolate',\n                      borderColor: '#94a3b8',\n                      boxShadow: 'none',\n                    }}\n                  >"}, {"label": "행 작업 버튼 Portal Tooltip 제거 및 고정 클릭영역 적용", "oldText": "                    <Tooltip title=\"빈 항목 추가\" arrow>\n                      <IconButton size=\"small\" color=\"primary\" aria-label=\"빈 항목 추가\" onClick={addBlankDraftRow}>\n                        <AddCircleOutlineRoundedIcon fontSize=\"small\" />\n                      </IconButton>\n                    </Tooltip>\n                    <Tooltip title=\"선택 항목 삭제\" arrow>\n                      <span>\n                        <IconButton size=\"small\" color=\"error\" aria-label=\"선택 항목 삭제\" disabled={selectedRowIds.size === 0} onClick={removeSelectedDraftRows}>\n                          <RemoveCircleOutlineRoundedIcon fontSize=\"small\" />\n                        </IconButton>\n                      </span>\n                    </Tooltip>\n                    <Tooltip title=\"선택 항목 위로 이동\" arrow>\n                      <span>\n                        <IconButton size=\"small\" aria-label=\"선택 항목 위로 이동\" disabled={selectedRowIds.size === 0} onClick={() => moveSelectedDraftRows(-1)}>\n                          <ArrowUpwardRoundedIcon fontSize=\"small\" />\n                        </IconButton>\n                      </span>\n                    </Tooltip>\n                    <Tooltip title=\"선택 항목 아래로 이동\" arrow>\n                      <span>\n                        <IconButton size=\"small\" aria-label=\"선택 항목 아래로 이동\" disabled={selectedRowIds.size === 0} onClick={() => moveSelectedDraftRows(1)}>\n                          <ArrowDownwardRoundedIcon fontSize=\"small\" />\n                        </IconButton>\n                      </span>\n                    </Tooltip>", "newText": "                    <Box\n                      component=\"span\"\n                      title=\"빈 항목 추가\"\n                      sx={{ display: 'inline-flex', flex: '0 0 30px', width: 30, height: 30 }}\n                    >\n                      <IconButton\n                        size=\"small\"\n                        color=\"primary\"\n                        aria-label=\"빈 항목 추가\"\n                        onClick={addBlankDraftRow}\n                        sx={{\n                          width: 30,\n                          height: 30,\n                          p: 0,\n                          position: 'relative',\n                          zIndex: 2,\n                          pointerEvents: 'auto',\n                          transform: 'none',\n                        }}\n                      >\n                        <AddCircleOutlineRoundedIcon fontSize=\"small\" />\n                      </IconButton>\n                    </Box>\n                    <Box\n                      component=\"span\"\n                      title=\"선택 항목 삭제\"\n                      sx={{ display: 'inline-flex', flex: '0 0 30px', width: 30, height: 30 }}\n                    >\n                      <IconButton\n                        size=\"small\"\n                        color=\"error\"\n                        aria-label=\"선택 항목 삭제\"\n                        disabled={selectedRowIds.size === 0}\n                        onClick={removeSelectedDraftRows}\n                        sx={{\n                          width: 30,\n                          height: 30,\n                          p: 0,\n                          position: 'relative',\n                          zIndex: 2,\n                          pointerEvents: 'auto',\n                          transform: 'none',\n                        }}\n                      >\n                        <RemoveCircleOutlineRoundedIcon fontSize=\"small\" />\n                      </IconButton>\n                    </Box>\n                    <Box\n                      component=\"span\"\n                      title=\"선택 항목 위로 이동\"\n                      sx={{ display: 'inline-flex', flex: '0 0 30px', width: 30, height: 30 }}\n                    >\n                      <IconButton\n                        size=\"small\"\n                        aria-label=\"선택 항목 위로 이동\"\n                        disabled={selectedRowIds.size === 0}\n                        onClick={() => moveSelectedDraftRows(-1)}\n                        sx={{\n                          width: 30,\n                          height: 30,\n                          p: 0,\n                          position: 'relative',\n                          zIndex: 2,\n                          pointerEvents: 'auto',\n                          transform: 'none',\n                        }}\n                      >\n                        <ArrowUpwardRoundedIcon fontSize=\"small\" />\n                      </IconButton>\n                    </Box>\n                    <Box\n                      component=\"span\"\n                      title=\"선택 항목 아래로 이동\"\n                      sx={{ display: 'inline-flex', flex: '0 0 30px', width: 30, height: 30 }}\n                    >\n                      <IconButton\n                        size=\"small\"\n                        aria-label=\"선택 항목 아래로 이동\"\n                        disabled={selectedRowIds.size === 0}\n                        onClick={() => moveSelectedDraftRows(1)}\n                        sx={{\n                          width: 30,\n                          height: 30,\n                          p: 0,\n                          position: 'relative',\n                          zIndex: 2,\n                          pointerEvents: 'auto',\n                          transform: 'none',\n                        }}\n                      >\n                        <ArrowDownwardRoundedIcon fontSize=\"small\" />\n                      </IconButton>\n                    </Box>"}];

if (!fs.existsSync(targetPath)) {
  console.error(`[적용 중단] 파일을 찾을 수 없습니다: ${targetPath}`);
  process.exit(1);
}

let source = fs.readFileSync(targetPath, 'utf8');
let changed = false;

for (const replacement of replacements) {
  if (source.includes(replacement.newText)) {
    console.log(`[이미 적용됨] ${replacement.label}`);
    continue;
  }

  if (!source.includes(replacement.oldText)) {
    console.error(`[적용 중단] ${replacement.label} 위치가 현재 파일과 다릅니다.`);
    console.error('기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.');
    process.exit(1);
  }

  source = source.replace(replacement.oldText, replacement.newText);
  changed = true;
  console.log(`[적용] ${replacement.label}`);
}

if (!changed) {
  console.log('\n전체 변경이 이미 적용되어 있습니다.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `${targetPath}.bak-${VERSION}-${stamp}`;
fs.copyFileSync(targetPath, backupPath);
fs.writeFileSync(targetPath, source, 'utf8');

console.log(`\n[적용 완료] ${path.relative(projectRoot, targetPath)}`);
console.log(`[백업] ${path.relative(projectRoot, backupPath)}`);
console.log('90% 화면배율에서도 행 작업 아이콘의 표시 위치와 클릭영역이 일치하도록 보정했습니다.');
