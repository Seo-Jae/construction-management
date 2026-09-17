import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/utils/dashboardWorkSummary.js', import.meta.url), 'utf8');
const group = runInNewContext(source.slice(source.indexOf('export const groupDashboardWork'), source.indexOf('const readAll'))
  .replace('export const groupDashboardWork =', 'const groupDashboardWork =') + '\ngroupDashboardWork;');
const document = (id, status, extra = {}) => ({ id, status, author_user_id: 'me', project_name: 'A', report_type: 'weekly', current_round: 2, ...extra });
const base = { userId: 'me', projectName: 'A', reportTypes: ['weekly'], canApprove: true };

test('작성 대상과 수신 결과는 본인·현재 현장·상태로 구분한다', () => {
  const result = group({ ...base, steps: [], documents: [document('draft', 'draft'), document('rejected', 'rejected'), document('done', 'approved'),
    document('other-user', 'draft', { author_user_id: 'other' }), document('other-site', 'draft', { project_name: 'B' }), document('blocked-type', 'draft', { report_type: 'proposal' })] });
  assert.equal(result.reports.map((r) => r.id).join(','), 'draft,rejected');
  assert.equal(result.received.map((r) => r.id).join(','), 'rejected,done');
});

test('현재 회차의 본인 결재 대기만 집계하며 중복 단계는 한 문서로 센다', () => {
  const step = (document_id, approval_round, status = 'pending') => ({ document_id, approval_round, status, approver_user_id: 'me' });
  const result = group({ ...base, documents: [document('current', 'pending'), document('old', 'pending'), document('waiting', 'pending'), document('done', 'approved')],
    steps: [step('current', 2), step('current', 2), step('old', 1), step('waiting', 2, 'waiting'), step('done', 2)] });
  assert.equal(result.approvals.map((r) => r.id).join(','), 'current');
});

test('권한이 없는 항목에는 문서를 제공하지 않는다', () => {
  const result = group({ ...base, canApprove: false, reportTypes: [], documents: [document('draft', 'draft'), document('done', 'approved')], steps: [] });
  assert.equal(result.reports.length + result.approvals.length + result.received.length, 0);
});
