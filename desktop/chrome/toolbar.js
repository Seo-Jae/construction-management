document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => window.desktopChrome.action(button.dataset.action));
});
window.desktopChrome.onState(state => {
  document.body.dataset.state = state;
  document.getElementById('connection-label').textContent = { loading: '불러오는 중', ready: '연결됨', offline: '연결 확인' }[state];
});
window.desktopChrome.onUpdate(state => {
  const button = document.getElementById('update-status');
  const webAvailable = state.web?.phase === 'available';
  button.hidden = false;
  button.disabled = false;
  button.textContent = state.web?.phase === 'current' ? '최신 버전' : '업데이트 확인';
  button.title = state.web?.phase === 'current'
    ? '현재 최신 화면입니다. 클릭하여 새 버전을 확인하세요.'
    : '화면 버전을 확인하지 못했습니다. 클릭하여 다시 확인하세요.';
  if (webAvailable) {
    button.textContent = '업데이트 필요';
    button.title = '새 화면이 배포되었습니다. 작업을 저장한 뒤 클릭하여 적용해주세요.';
  }
  button.dataset.pending = String(webAvailable);
});
