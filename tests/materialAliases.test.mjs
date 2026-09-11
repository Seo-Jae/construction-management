import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as aliases from '../src/utils/materialAliases.js';

test('띄어쓰기·전각·대소문자를 정규화하되 다른 규격의 기호는 보존한다', () => {
  assert.equal(aliases.normalizeMaterialAlias(' ＣＴ 100 '), 'ct100');
  assert.equal(aliases.normalizeMaterialAlias('케이블 타이'), aliases.normalizeMaterialAlias('케이블타이'));
  assert.notEqual(aliases.normalizeMaterialAlias('M-10'), aliases.normalizeMaterialAlias('M10'));
});

test('활성 후보만 해당 자재에 연결하고 기존 마스터 검색어를 유지한다', () => {
  const master = [{ id: 'a', standard_name: '케이블타이', aliases: ['타이밴드'] }, { id: 'b', standard_name: '나사' }];
  const result = aliases.attachMaterialAliases(master, [
    { id: 'one', material_id: 'a', keyword: 'CT', status: 'pending' },
    { id: 'two', material_id: 'a', keyword: '전선 묶음띠', status: 'approved' },
    { id: 'three', material_id: 'a', keyword: '나사', status: 'rejected' },
  ]);
  assert.equal(result[0].sharedAliases.length, 2);
  assert.equal(result[1].sharedAliases.length, 0);
  assert.deepEqual(master[0].aliases, ['타이밴드']);
  assert.equal(master[0].sharedAliases, undefined);
  assert.equal(aliases.matchingMaterialAliases(result[0], '전선묶음띠').length, 1);
  assert.equal(aliases.matchingMaterialAliases(result[0], '나사').length, 0);
  for (const term of ['', 'CT', '타이밴드', '케이블 타이']) assert.ok(aliases.isKnownMaterialAlias(result[0], term));
  assert.equal(aliases.isKnownMaterialAlias(result[0], '새로운 표현'), false);
});

test('공동 검색어 500개 이후도 조회하며 모든 페이지의 현장 범위를 유지한다', async () => {
  const offsets = [];
  const result = await aliases.loadMaterialAliasPages({ rpc: async (name, args) => {
    assert.equal(name, 'list_material_aliases_v185');
    assert.equal(args.p_project_name, '현장A');
    offsets.push(args.p_offset);
    return { data: Array.from({ length: args.p_offset ? 1 : 500 }, (_, i) => ({ id: i + args.p_offset })) };
  } }, 'list_material_aliases_v185', { p_project_name: '현장A' });
  assert.equal(result.length, 501);
  assert.deepEqual(offsets, [0, 500]);
});

test('중간 페이지 실패 시 일부 결과를 전체 결과로 사용하지 않는다', async () => {
  const error = { code: '42501', message: 'permission denied' };
  await assert.rejects(aliases.loadMaterialAliasPages({ rpc: async (_, args) =>
    args.p_offset ? { error } : { data: Array(500).fill({}) } }, 'rpc', {}), (result) => result === error);
  assert.ok(aliases.isMaterialAliasSchemaMissing({ code: 'PGRST202' }));
  assert.equal(aliases.isMaterialAliasSchemaMissing(error), false);
});

test('대량 자재의 현장 수량 조회를 200개씩 나누고 실패를 전파한다', async () => {
  const ids = Array.from({ length: 501 }, (_, i) => i);
  const batches = [];
  const result = await aliases.loadMaterialRowsInBatches(ids, async (batch) => {
    batches.push(batch.length);
    return { data: batch.map((id) => ({ id })) };
  });
  assert.deepEqual(batches, [200, 200, 101]);
  assert.deepEqual(result.data.map((row) => row.id), ids);
  const error = { message: 'failed' };
  assert.deepEqual(await aliases.loadMaterialRowsInBatches(ids, async () => ({ error })), { data: [], error });
});

const source = readFileSync(new URL('../src/page/MaterialOrderUpload.jsx', import.meta.url), 'utf8');
const searchSource = source.slice(source.indexOf('const buildOrderMaterialSearchText'), source.indexOf('const categoryNameById'));
const loaderStart = source.indexOf('async () => {', source.indexOf('const loadOrderMaterialOptions ='));
const loaderEnd = source.indexOf('\n  }, [', loaderStart);
const loaderSource = `(${source.slice(loaderStart, loaderEnd)}\n  })`;

function createHarness({ missing = false } = {}) {
  const materials = Array.from({ length: 501 }, (_, id) => ({ id: String(id), standard_name: `품목${id}`, aliases: [], is_main_material: true }));
  const shared = [{ id: 'alias', material_id: '500', keyword: '현장표현', status: 'approved' }];
  const ctx = { ...aliases, projectName: '현장A', order: { categoryId: '분류A', processName: '공정A' },
    materialOptionsRequest: { current: 0 }, normalizeText: (v) => String(v ?? '').trim().replace(/\s+/g, ' '),
    numberValue: (v) => Number(v) || 0, handleSchemaError: () => false, notify: () => {},
    setOrderMaterialOptions: (v) => { ctx.options = v; }, setOrderProjectMaterialOptions: () => {},
    setOrderMaterialOptionsLoading: () => {}, setMaterialAliasAvailability: (v) => { ctx.availability = v; } };
  ctx.supabase = {
    rpc: async () => missing ? { error: { code: 'PGRST202' } } : { data: shared },
    from(table) {
      const query = { offset: 0, end: 499,
        select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, in() { return this; },
        range(offset, end) { this.offset = offset; this.end = end; return this; },
        then(resolve) { return Promise.resolve({ data: table === 'material_master_items' ? materials.slice(this.offset, this.end + 1) : [] }).then(resolve); } };
      return query;
    },
  };
  vm.createContext(ctx);
  return { ctx, load: vm.runInContext(loaderSource, ctx), search: vm.runInContext(`${searchSource}\nfilterOrderMaterialOptions`, ctx) };
}

test('실제 발주 검색 흐름에서 501번째 품목을 공동 검색어로 찾는다', async () => {
  const { ctx, load, search } = createHarness();
  await load();
  assert.equal(ctx.options.length, 501);
  assert.equal(ctx.availability.ready, true);
  assert.equal(search(ctx.options, { inputValue: '현장 표현' })[0].id, '500');
  assert.equal(search(ctx.options, { inputValue: '품목0' })[0].id, '0');
});

test('SQL 적용 전에도 기존 자재 검색을 제공한다', async () => {
  const { ctx, load, search } = createHarness({ missing: true });
  await load();
  assert.equal(ctx.availability.ready, false);
  assert.equal(ctx.options.length, 501);
  assert.equal(search(ctx.options, { inputValue: '품목500' })[0].id, '500');
});

test('승인된 검색어를 후보보다 먼저 보여주고 정확한 표준 품명을 우선한다', () => {
  const { search } = createHarness();
  const data = aliases.attachMaterialAliases([
    { id: 'pending', standard_name: '가' }, { id: 'approved', standard_name: '나' }, { id: 'exact', standard_name: '별칭' },
  ], [
    { material_id: 'pending', keyword: '별칭', status: 'pending' },
    { material_id: 'approved', keyword: '별칭', status: 'approved' },
  ]);
  assert.deepEqual(Array.from(search(data, { inputValue: '별칭' }), (row) => row.id), ['exact', 'approved', 'pending']);
});
