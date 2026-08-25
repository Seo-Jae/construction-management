const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const RELEASE = __dirname;
const TARGET = path.join(ROOT, 'src', 'page', 'WorkerMasterManagement.jsx');
const EXPECTED_SHA = '9efa0aedf4834101bda4e951d1555b508cd798b4';

function fail(message) {
  console.error('\n[v52.47 적용 중단]');
  console.error(message);
  process.exit(1);
}

function blobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto.createHash('sha1')
    .update(Buffer.concat([header, buffer]))
    .digest('hex');
}

function replaceUnique(source, oldText, newText, label) {
  const first = source.indexOf(oldText);
  if (first < 0) fail(`${label}: 기준 문자열을 찾지 못했습니다.`);
  if (source.indexOf(oldText, first + oldText.length) >= 0) {
    fail(`${label}: 기준 문자열이 2개 이상 발견되었습니다.`);
  }
  return source.replace(oldText, newText);
}

if (!fs.existsSync(TARGET)) fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);

const currentBuffer = fs.readFileSync(TARGET);
const currentText = currentBuffer.toString('utf8');

if (
  currentText.includes('labor_worker_master_secure_upsert_v52_47') &&
  currentText.includes('LaborWorkerExcelImportDialog')
) {
  console.log('[v52.47] 이미 적용된 상태입니다.');
  process.exit(0);
}

const actualSha = blobSha(currentBuffer);
if (actualSha !== EXPECTED_SHA) {
  fail(
    '현재 WorkerMasterManagement.jsx가 v52.46 최신 main 기준과 다릅니다.\n' +
    `예상 Git blob SHA: ${EXPECTED_SHA}\n` +
    `현재 Git blob SHA: ${actualSha}\n\n` +
    'git status를 확인해주세요.'
  );
}

let next = currentText;

next = replaceUnique(
  next,
  `import React, {\n  useCallback,\n  useEffect,\n  useState,\n} from 'react';`,
  `import React, {\n  useCallback,\n  useEffect,\n  useState,\n} from 'react';`,
  'React import 확인',
);

next = replaceUnique(
  next,
  `import AddRoundedIcon from '@mui/icons-material/AddRounded';\nimport EditRoundedIcon from '@mui/icons-material/EditRounded';`,
  `import AddRoundedIcon from '@mui/icons-material/AddRounded';\nimport UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';\nimport EditRoundedIcon from '@mui/icons-material/EditRounded';`,
  'Excel 업로드 아이콘 import',
);

next = replaceUnique(
  next,
  `import SearchRoundedIcon from '@mui/icons-material/SearchRounded';\nimport { supabase } from '../supabaseClient';`,
  `import SearchRoundedIcon from '@mui/icons-material/SearchRounded';\nimport { supabase } from '../supabaseClient';\nimport LaborWorkerExcelImportDialog from '../components/LaborWorkerExcelImportDialog.jsx';`,
  'Excel 업로드 Dialog import',
);

next = replaceUnique(
  next,
  `  accountHolder: '',\n\n  hasPrivateData: false,`,
  `  accountHolder: '',\n  englishName: '',\n  stayStatus: '',\n  englishAccountHolder: '',\n  isForeign: false,\n\n  hasPrivateData: false,`,
  '외국인 추가정보 draft',
);

next = replaceUnique(
  next,
  `  hasNationality: false,\n  bankNameHint: '',`,
  `  hasNationality: false,\n  hasEnglishName: false,\n  hasStayStatus: false,\n  hasEnglishAccountHolder: false,\n  bankNameHint: '',`,
  '외국인 추가정보 flags',
);

next = replaceUnique(
  next,
  `  hasNationality:\n    row?.has_nationality === true,\n  bankNameHint: String(`,
  `  hasNationality:\n    row?.has_nationality === true,\n  isForeign:\n    row?.is_foreign === true,\n  hasEnglishName:\n    row?.has_english_name === true,\n  hasStayStatus:\n    row?.has_stay_status === true,\n  hasEnglishAccountHolder:\n    row?.has_english_account_holder === true,\n  bankNameHint: String(`,
  '외국인 추가정보 normalize',
);

next = replaceUnique(
  next,
  `  if (worker.hasNationality) {\n    labels.push('국적');\n  }\n\n  return labels.length > 0`,
  `  if (worker.hasNationality) {\n    labels.push('국적');\n  }\n\n  if (worker.hasEnglishName) {\n    labels.push('영문성명');\n  }\n\n  if (worker.hasStayStatus) {\n    labels.push('체류자격');\n  }\n\n  return labels.length > 0`,
  '보호정보 상태표시 확장',
);

next = replaceUnique(
  next,
  `  const [editorOpen, setEditorOpen] =\n    useState(false);\n  const [draft, setDraft] =`,
  `  const [editorOpen, setEditorOpen] =\n    useState(false);\n  const [excelUploadOpen, setExcelUploadOpen] =\n    useState(false);\n  const [draft, setDraft] =`,
  'Excel 업로드 state',
);

next = replaceUnique(
  next,
  `'labor_worker_master_list_v52_41',`,
  `'labor_worker_master_list_v52_47',`,
  '근로자 목록 RPC 전환',
);

next = replaceUnique(
  next,
  `      hasNationality:\n        worker.hasNationality,\n      bankNameHint:`,
  `      hasNationality:\n        worker.hasNationality,\n      isForeign:\n        worker.isForeign,\n      hasEnglishName:\n        worker.hasEnglishName,\n      hasStayStatus:\n        worker.hasStayStatus,\n      hasEnglishAccountHolder:\n        worker.hasEnglishAccountHolder,\n      bankNameHint:`,
  '수정창 외국인 상태 연결',
);

next = replaceUnique(
  next,
  `    const accountHolder = String(draft.accountHolder || '').trim();\n    const birthDate = buildBirthDate(`,
  `    const accountHolder = String(draft.accountHolder || '').trim();\n    const englishName = String(draft.englishName || '').trim();\n    const stayStatus = String(draft.stayStatus || '').trim();\n    const englishAccountHolder = String(draft.englishAccountHolder || '').trim();\n    const finalIsForeign = nationality\n      ? nationality !== '대한민국'\n      : draft.isForeign === true;\n    const birthDate = buildBirthDate(`,
  '외국인 저장값 계산',
);

next = replaceUnique(
  next,
  `    if (!accountHolder && !draft.hasAccountHolder) {\n      setMessage({ severity: 'warning', text: '예금주는 필수정보입니다.' });\n      return;\n    }\n\n    if (\n      fullPhone &&`,
  `    if (!accountHolder && !draft.hasAccountHolder) {\n      setMessage({ severity: 'warning', text: '예금주는 필수정보입니다.' });\n      return;\n    }\n\n    if (finalIsForeign && !englishName && !draft.hasEnglishName) {\n      setMessage({ severity: 'warning', text: '외국인 근로자는 영문 성명이 필요합니다.' });\n      return;\n    }\n\n    if (finalIsForeign && !stayStatus && !draft.hasStayStatus) {\n      setMessage({ severity: 'warning', text: '외국인 근로자는 체류자격이 필요합니다.' });\n      return;\n    }\n\n    if (\n      fullPhone &&`,
  '외국인 필수정보 검증',
);

next = replaceUnique(
  next,
  `'labor_worker_master_secure_upsert_v52_41',`,
  `'labor_worker_master_secure_upsert_v52_47',`,
  '근로자 저장 RPC 전환',
);

next = replaceUnique(
  next,
  `          p_account_holder:\n            accountHolder || null,\n        },`,
  `          p_account_holder:\n            accountHolder || null,\n          p_english_name:\n            englishName || null,\n          p_stay_status:\n            stayStatus || null,\n          p_english_account_holder:\n            englishAccountHolder || null,\n        },`,
  '외국인 보호정보 RPC 인자',
);

next = replaceUnique(
  next,
  `          <Button\n            size="small"\n            variant="contained"\n            startIcon={\n              <AddRoundedIcon />\n            }\n            onClick={openNew}`,
  `          <Button\n            size="small"\n            variant="outlined"\n            startIcon={\n              <UploadFileRoundedIcon />\n            }\n            onClick={() => setExcelUploadOpen(true)}\n            disabled={!canManage}\n            sx={{ ml: 'auto' }}\n          >\n            EXCEL 업로드\n          </Button>\n\n          <Button\n            size="small"\n            variant="contained"\n            startIcon={\n              <AddRoundedIcon />\n            }\n            onClick={openNew}`,
  'Excel 업로드 버튼 추가',
);

next = next.replace(
  `            sx={{\n              ml: 'auto',\n              boxShadow: 'none',\n            }}\n          >\n            근로자 등록`,
  `            sx={{\n              boxShadow: 'none',\n            }}\n          >\n            근로자 등록`,
);

next = replaceUnique(
  next,
  `                onChange={(_event, value) =>\n                  setDraft((previous) => ({\n                    ...previous,\n                    nationality: value || '',\n                  }))\n                }`, 
  `                onChange={(_event, value) =>\n                  setDraft((previous) => ({\n                    ...previous,\n                    nationality: value || '',\n                    isForeign: value\n                      ? value !== '대한민국'\n                      : previous.isForeign,\n                  }))\n                }`,
  '국적-외국인 상태 연결',
);

const constForeignFields = `              {(\n                draft.isForeign ||\n                (draft.nationality &&\n                  draft.nationality !== '대한민국')\n              ) ? (\n                <>\n                  <TextField\n                    fullWidth\n                    required\n                    size="small"\n                    label="영문 성명"\n                    value={draft.englishName}\n                    onChange={(event) =>\n                      setDraft((previous) => ({\n                        ...previous,\n                        englishName: event.target.value,\n                      }))\n                    }\n                    placeholder={\n                      draft.hasEnglishName\n                        ? '기존값 유지'\n                        : '예: HONG GILDONG'\n                    }\n                    helperText={privateHelper(draft.hasEnglishName)}\n                  />\n\n                  <TextField\n                    fullWidth\n                    required\n                    size="small"\n                    label="체류자격"\n                    value={draft.stayStatus}\n                    onChange={(event) =>\n                      setDraft((previous) => ({\n                        ...previous,\n                        stayStatus: event.target.value,\n                      }))\n                    }\n                    placeholder={\n                      draft.hasStayStatus\n                        ? '기존값 유지'\n                        : '예: F-5'\n                    }\n                    helperText={privateHelper(draft.hasStayStatus)}\n                  />\n\n                  <TextField\n                    fullWidth\n                    size="small"\n                    label="영문 예금주"\n                    value={draft.englishAccountHolder}\n                    onChange={(event) =>\n                      setDraft((previous) => ({\n                        ...previous,\n                        englishAccountHolder: event.target.value,\n                      }))\n                    }\n                    placeholder={\n                      draft.hasEnglishAccountHolder\n                        ? '기존값 유지'\n                        : '예: HONG GILDONG'\n                    }\n                    helperText={privateHelper(draft.hasEnglishAccountHolder)}\n                  />\n                </>\n              ) : null}\n\n`;

const constBankAnchor = `              <TextField\n                fullWidth\n                required\n                size="small"\n                label="은행"`;
const bankIndex = next.indexOf(constBankAnchor);
if (bankIndex < 0) fail('외국인 추가정보 삽입 위치를 찾지 못했습니다.');
next = next.slice(0, bankIndex) + constForeignFields + next.slice(bankIndex);

next = replaceUnique(
  next,
  `      <Dialog\n        open={Boolean(deleteTarget)}`,
  `      <LaborWorkerExcelImportDialog\n        open={excelUploadOpen}\n        canManage={canManage}\n        onClose={() => setExcelUploadOpen(false)}\n        onImported={async (result) => {\n          setExcelUploadOpen(false);\n          setMessage({\n            severity: 'success',\n            text: 'Excel 이관 완료 · 신규 ' + result.created + '명 · 업데이트 ' + result.updated + '명 · 제외 ' + result.skipped + '명',\n          });\n          await loadWorkers({\n            silent: true,\n            searchQuery: query,\n          });\n        }}\n      />\n\n      <Dialog\n        open={Boolean(deleteTarget)}`,
  'Excel 업로드 Dialog 연결',
);

for (const marker of [
  'labor_worker_master_list_v52_47',
  'labor_worker_master_secure_upsert_v52_47',
  'LaborWorkerExcelImportDialog',
  'EXCEL 업로드',
  '영문 성명',
  '체류자격',
]) {
  if (!next.includes(marker)) fail(`적용 결과 필수 마커 누락: ${marker}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(
  ROOT,
  `backup_v52.47_${stamp}`,
  'src',
  'page',
  'WorkerMasterManagement.jsx',
);
fs.mkdirSync(path.dirname(backup), { recursive: true });
fs.copyFileSync(TARGET, backup);
fs.writeFileSync(TARGET, next, 'utf8');

for (const relative of [
  ['src', 'components', 'LaborWorkerExcelImportDialog.jsx'],
  ['src', 'utils', 'laborWorkerExcelImport.js'],
]) {
  const source = path.join(RELEASE, ...relative);
  const target = path.join(ROOT, ...relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

console.log('\n[v52.47 적용 완료]');
console.log('- 근로자 정보관리 EXCEL 업로드 버튼 추가');
console.log('- 회사 노무비명세서 A:H만 브라우저에서 분석');
console.log('- I:AV는 읽지 않음');
console.log('- 신규/기존/보완/충돌 미리보기');
console.log('- 외국인은 국적 선택 후 검증');
console.log('- 기존 주민번호 fingerprint 일치 시 중복생성 없이 업데이트');
console.log('- 영문 성명/체류자격/영문 예금주 암호화 저장 기반 추가');
console.log('- 이관 완료 즉시 월별 노임작성 근로자 조회에서 사용 가능');
console.log(`- 백업: ${backup}`);
console.log('');
console.log('중요: Supabase v52.47 SQL을 먼저 실행해주세요.');
console.log('다음 명령: npm run build');
