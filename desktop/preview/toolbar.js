const form = document.getElementById('settings');
const printer = document.getElementById('printer');
let ready = false;
const updateButtons = () => {
  document.querySelector('[data-action="save"]').disabled = !ready;
  document.querySelector('[data-action="print"]').disabled = !ready || !printer.value;
};
const run = command => {
  if (command === 'close') return window.printPreview.action(command);
  if (!ready || (command === 'print' && !form.reportValidity())) return;
  const settings = { deviceName: printer.value, copies: Number(document.getElementById('copies').value),
    pages: document.getElementById('pages').value, color: document.getElementById('color').value === 'color',
    duplexMode: document.getElementById('duplex').value };
  ready = false;
  updateButtons();
  window.printPreview.action(command, settings);
};
form.addEventListener('submit', event => { event.preventDefault(); run('print'); });
printer.addEventListener('change', updateButtons);
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => run(button.dataset.action)));
window.printPreview.onCommand(run);
window.printPreview.subscribe(({ state, title, printers, pageCount, landscape, message }) => {
  if (title) document.getElementById('status').textContent = title;
  if (printers) {
    printer.replaceChildren();
    for (const item of printers) printer.add(new Option(item.displayName || item.name, item.name, false, item.isDefault));
    if (!printers.length) printer.add(new Option('설치된 프린터가 없습니다', ''));
    printer.disabled = !printers.length;
  }
  if (pageCount) document.getElementById('page-count').textContent = `총 ${pageCount}페이지 · ${landscape ? '가로' : '세로'} 양식`;
  if (message !== undefined) document.getElementById('feedback').textContent = message;
  ready = state === 'ready';
  updateButtons();
});
