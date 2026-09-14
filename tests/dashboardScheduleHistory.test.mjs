import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { canArchiveSavedSchedule, filterScheduleHistory, scheduleHistoryYears } from '../src/utils/dashboardScheduleHistory.js';

const rows = [
  { snapshot: { siteName: '서울 현장', constructionCompany: '건설사A', briefingAt: '2025-12-30T10:00', bidAt: '2026-01-05T14:00', attendees: '담당자A', note: '견적 완료' } },
  { snapshot: { siteName: '부산 현장', constructionCompany: '건설사B', briefingAt: '2024-03-01T10:00', trade: '수장' } },
  { snapshot: { projectName: '과거 현장', note: '날짜 미정' } },
];

test('현설과 입찰 연도가 다르면 두 연도에서 모두 찾을 수 있다', () => {
  assert.deepEqual(scheduleHistoryYears(rows), ['2026', '2025', '2024']);
  assert.equal(filterScheduleHistory(rows, '', '2025')[0], rows[0]);
  assert.equal(filterScheduleHistory(rows, '', '2026')[0], rows[0]);
});
test('건설사·현장·참석자·비고를 함께 검색하며 날짜 없는 기록도 보존한다', () => {
  assert.deepEqual(filterScheduleHistory(rows, '서울 담당자A 완료', ''), [rows[0]]);
  assert.deepEqual(filterScheduleHistory(rows, '건설사B 수장', '2024'), [rows[1]]);
  assert.deepEqual(filterScheduleHistory(rows, '과거 미정', ''), [rows[2]]);
  assert.deepEqual(filterScheduleHistory(rows, '서울', '2024'), []);
  assert.equal(filterScheduleHistory(rows, '', '').length, 3);
});
test('저장하지 않은 추가·수정 행을 이력 보관으로 제거하지 않는다', () => {
  const saved = { id: 'one', siteName: '서울', note: '최초 저장' };
  assert.equal(canArchiveSavedSchedule({ ...saved }, [saved]), true);
  assert.equal(canArchiveSavedSchedule({ ...saved, note: '미저장 수정' }, [saved]), false);
  assert.equal(canArchiveSavedSchedule({ ...saved, id: 'new' }, [saved]), false);
  assert.equal(canArchiveSavedSchedule(undefined, [saved]), false);
});

const source = readFileSync(new URL('../src/page/AdminDashboardScheduleBoard.jsx', import.meta.url), 'utf8');
function deletionHarness({ failSave = false, history = true, canEdit = true } = {}) {
  const target = { id: 'one', siteName: '서울', note: '저장됨' };
  const ctx = {
    canEdit, saving: false, historyReady: true, siteSchedules: [target, { id: 'two', siteName: '부산' }],
    savedSiteSchedules: [target], selectedSiteScheduleId: 'one', meetings: [{ id: 'meeting' }], RECORD_ID: 'main-dashboard',
    canArchiveSavedSchedule, hasSiteScheduleContent: (row) => Boolean(row.siteName),
    window: { confirm: () => true }, console: { error: () => {} }, calls: [],
  };
  ctx.setSaving = (v) => { ctx.saving = v; };
  ctx.setErrorMessage = (v) => { ctx.error = v; };
  ctx.setSuccessMessage = (v) => { ctx.success = v; };
  ctx.setSiteSchedules = (f) => { ctx.siteSchedules = f(ctx.siteSchedules); };
  ctx.setSavedSiteSchedules = (v) => { ctx.savedSiteSchedules = v; };
  ctx.setSelectedSiteScheduleId = (v) => { ctx.selectedSiteScheduleId = v; };
  ctx.supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
    rpc: async (name, args) => { ctx.calls.push({ name, args }); return { error: failSave ? new Error('save failed') : null }; },
    from: (table) => {
      assert.equal(table, 'admin_dashboard_site_history');
      return { select() { return this; }, eq() { return this; }, limit: async () => ({ data: history ? [{ id: 'history' }] : [] }) };
    },
  };
  const remove = source.slice(source.indexOf('  const handleDeleteSiteSchedule ='), source.indexOf('  const handleAddMeeting ='));
  const save = source.slice(source.indexOf('  const handleSave ='), source.indexOf('  if (loading) {'));
  vm.createContext(ctx);
  return { ctx, remove: vm.runInContext(`${remove}\n${save}\nhandleDeleteSiteSchedule`, ctx) };
}

test('삭제 버튼으로 즉시 저장하고 이력 확인 후 성공을 알린다', async () => {
  const { ctx, remove } = deletionHarness();
  await remove();
  assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.calls[0].name, 'save_admin_dashboard_planning_v52_13');
  assert.deepEqual(ctx.calls[0].args.p_site_schedules.map((r) => r.id), ['two']);
  assert.deepEqual(ctx.calls[0].args.p_meeting_schedules, [{ id: 'meeting' }]);
  assert.equal(ctx.siteSchedules.length, 1);
  assert.match(ctx.success, /과거 이력/);
  assert.equal(ctx.saving, false);
});
test('저장 실패 시 행을 화면에 유지하고 재시도할 수 있다', async () => {
  const { ctx, remove } = deletionHarness({ failSave: true });
  await remove();
  assert.equal(ctx.siteSchedules.length, 2);
  assert.equal(ctx.error, 'save failed');
  assert.equal(ctx.saving, false);
});
test('이력 누락 시 성공으로 표시하지 않으며 조회 전용 사용자는 삭제하지 못한다', async () => {
  const { ctx, remove } = deletionHarness({ history: false });
  await remove();
  assert.match(ctx.error, /과거 이력 등록을 확인하지 못했습니다/);
  assert.equal(ctx.success, '');
  const readonly = deletionHarness({ canEdit: false });
  await readonly.remove();
  assert.equal(readonly.ctx.calls.length, 0);
  assert.equal(readonly.ctx.siteSchedules.length, 2);
});
