const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.8.3';
const TARGET = path.resolve(
  process.cwd(),
  'src/page/ContractItemProcessMapping.jsx',
);
const SQL_SOURCE = path.resolve(
  process.cwd(),
  'release_v52.48.5.44.8.3/supabase/v52.48.5.44.8.3_contract_item_semantic_dedupe.sql',
);
const SQL_TARGET = path.resolve(
  process.cwd(),
  'supabase/v52.48.5.44.8.3_contract_item_semantic_dedupe.sql',
);
const BASE_MARKER = '// v52.48.5.44.8.2 계약품목 중복방지·표시정리';
const VERSION_MARKER = '// v52.48.5.44.8.3 서로 다른 source_key의 완전중복 정리·동기화 교체방식 보강';

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail(`파일을 찾을 수 없습니다: ${TARGET}`);
}

if (!fs.existsSync(SQL_SOURCE)) {
  fail(`SQL 파일을 찾을 수 없습니다: ${SQL_SOURCE}`);
}

let source = fs.readFileSync(TARGET, 'utf8');

if (!source.includes(VERSION_MARKER)) {
  const markerIndex = source.indexOf(BASE_MARKER);

  if (markerIndex === -1) {
    fail('v52.48.5.44.8.2 기준 파일이 아닙니다. 기존 변경을 보호하기 위해 적용을 중단합니다.');
  }

  const secondMarkerIndex = source.indexOf(
    BASE_MARKER,
    markerIndex + BASE_MARKER.length,
  );

  if (secondMarkerIndex !== -1) {
    fail('기준 마커가 두 개 이상 발견되었습니다. 자동 적용을 중단합니다.');
  }

  const backupDir = path.resolve(
    process.cwd(),
    `backup_v52.48.5.44.8.3_${new Date().toISOString().replace(/[:.]/g, '-')}`,
  );
  const backupPath = path.join(
    backupDir,
    'src/page/ContractItemProcessMapping.jsx',
  );

  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(TARGET, backupPath);

  source =
    source.slice(0, markerIndex) +
    `${VERSION_MARKER}\n` +
    source.slice(markerIndex);

  fs.writeFileSync(TARGET, source, 'utf8');
}

fs.mkdirSync(path.dirname(SQL_TARGET), { recursive: true });
fs.copyFileSync(SQL_SOURCE, SQL_TARGET);

console.log(`[${VERSION}] 적용 완료`);
console.log('- ContractItemProcessMapping 버전 기준 갱신');
console.log('- 의미상 완전중복 91건 정리 SQL 복사');
console.log('- 기존 공정연결을 new-contract 품목으로 병합 보존');
console.log('- 계약마스터 재업로드를 교체방식으로 변경');
console.log('- 동일 현장/계약버전 동시 업로드 잠금 추가');
console.log('- Supabase SQL Editor에서 SQL 전체 실행 필요');
