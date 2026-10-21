document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => window.desktopChrome.action(button.dataset.action));
});
window.desktopChrome.onState(state => {
  document.body.dataset.state = state;
  document.getElementById('connection-label').textContent = { loading: '불러오는 중', ready: '연결됨', offline: '연결 확인' }[state];
});
window.desktopChrome.onUpdate(state => {
  const button = document.getElementById('update-status');
  const webAvailable = state.web?.phase === 'available' && !['ready', 'installing'].includes(state.phase);
  button.hidden = state.phase === 'idle' && !webAvailable;
  button.disabled = !webAvailable && ['checking', 'downloading', 'installing'].includes(state.phase);
  button.textContent = ({ checking: '업데이트 확인 중', downloading: `업데이트 다운로드 ${state.percent || 0}%`,
    ready: '재시작하여 업데이트', current: '최신 버전', error: '업데이트 재시도',
    development: '설치된 앱에서 업데이트 가능', installing: '업데이트 적용 중' })[state.phase] || '업데이트 확인';
  button.title = state.version ? `버전 ${state.version}` : button.textContent;
  if (webAvailable) {
    button.textContent = '업데이트 필요';
    button.title = '새 화면이 배포되었습니다. 작업을 저장한 뒤 클릭하여 적용해주세요.';
  } else if (state.phase === 'current' && state.web?.phase !== 'current') {
    button.textContent = '업데이트 확인';
    button.title = '화면 버전을 확인하지 못했습니다. 클릭하여 다시 확인하세요.';
  }
  button.dataset.pending = String(webAvailable || state.phase === 'ready');
});
