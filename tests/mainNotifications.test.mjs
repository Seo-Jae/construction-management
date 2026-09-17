import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMainNotifications, searchMainItems } from '../src/utils/mainNotifications.js';

test('새 결재 회차는 이전 읽음 상태와 구분한다', () => {
  const first = buildMainNotifications({ approvals: [{ id: 'd', current_round: 1 }] });
  const next = buildMainNotifications({ approvals: [{ id: 'd', current_round: 2 }] });
  assert.equal(next.some((item) => first.some((previous) => previous.id === item.id)), false);
});

test('결재 알림만 생성하며 공지사항은 알림에 포함하지 않는다', () => {
  const items = buildMainNotifications({ notices: [{ id: 'n' }], approvals: [{ id: 'a' }], received: [{ id: 'r', status: 'approved' }] });
  assert.equal(items.length, 2);
  assert.ok(items.every((item) => item.type === 'approval'));
  assert.deepEqual(buildMainNotifications(null), []);
});

test('검색은 전달된 접근 가능 메뉴와 공지 제목·본문만 대상으로 한다', () => {
  const menus = [{ id: 'material', title: '자재 관리' }];
  assert.equal(searchMainItems(menus, [], '회원').length, 0);
  assert.equal(searchMainItems(menus, [], '자재 관리')[0].targetId, 'material');
  assert.equal(searchMainItems([], [{ id: 'n', title: '안내', content: '자재 발주 변경' }], '발주 변경')[0].targetId, 'n');
  assert.equal(searchMainItems(menus, [], '  ').length, 0);
});
