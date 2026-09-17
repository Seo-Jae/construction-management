export const buildMainNotifications = (work) => [
  ...(work?.approvals || []).map((row) => ({
    id: `approval:${row.id}:${row.current_round}`, type: 'approval', targetId: row.id,
    title: row.title || '결재 문서', label: '결재 요청', date: row.updated_at || '',
  })),
  ...(work?.received || []).map((row) => ({
    id: `result:${row.id}:${row.current_round}:${row.status}`, type: 'approval', targetId: row.id,
    title: row.title || '결재 문서', label: row.status === 'approved' ? '결재 완료' : '결재 반려', date: row.updated_at || '',
  })),
].sort((a, b) => String(b.date).localeCompare(String(a.date)));

export const searchMainItems = (menus, notices, query) => {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return [
    ...menus.map((row) => ({ id: `menu:${row.id}`, type: 'menu', targetId: row.id, title: row.title, label: '메뉴', text: row.title })),
    ...notices.map((row) => ({ id: `notice:${row.id}`, type: 'notice', targetId: row.id, title: row.title, label: '공지사항', text: `${row.title} ${row.summary || ''} ${row.content || ''}` })),
  ].filter((row) => terms.every((term) => row.text.toLowerCase().includes(term)));
};
