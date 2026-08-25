const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const RELEASE_DIR = __dirname;
const TARGET_MESSENGER = path.join(ROOT, 'src', 'page', 'Messenger.jsx');
const TARGET_COMPONENT = path.join(
  ROOT,
  'src',
  'components',
  'MessengerBroadcastDialog.jsx',
);
const SOURCE_COMPONENT = path.join(
  RELEASE_DIR,
  'src',
  'components',
  'MessengerBroadcastDialog.jsx',
);

// GitHub main / v52.14.9 기준 Messenger.jsx blob SHA.
// Windows CRLF checkout도 비교 가능하도록 LF 정규화 후 Git blob SHA를 계산한다.
const EXPECTED_MESSENGER_BLOB_SHA = 'f8e48044b3bf69adac2ee1d16b7bfc5ecf152fe3';

const gitBlobSha = (text) => {
  const normalized = text.replace(/\r\n/g, '\n');
  const buffer = Buffer.from(normalized, 'utf8');
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto
    .createHash('sha1')
    .update(Buffer.concat([header, buffer]))
    .digest('hex');
};

const replaceOnce = (source, before, after, label) => {
  const first = source.indexOf(before);
  if (first < 0) {
    throw new Error(`[${label}] 기준 코드를 찾지 못했습니다. 최신 v52.14.9 파일인지 확인해주세요.`);
  }
  const second = source.indexOf(before, first + before.length);
  if (second >= 0) {
    throw new Error(`[${label}] 기준 코드가 2개 이상 발견되어 안전을 위해 중단합니다.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
};

if (!fs.existsSync(TARGET_MESSENGER)) {
  throw new Error(`대상 파일이 없습니다: ${TARGET_MESSENGER}`);
}
if (!fs.existsSync(SOURCE_COMPONENT)) {
  throw new Error(`배포 구성 파일이 없습니다: ${SOURCE_COMPONENT}`);
}

const original = fs.readFileSync(TARGET_MESSENGER, 'utf8');
const eol = original.includes('\r\n') ? '\r\n' : '\n';
let source = original.replace(/\r\n/g, '\n');

if (source.includes("import MessengerBroadcastDialog from '../components/MessengerBroadcastDialog';")) {
  console.log('[v52.15] Messenger.jsx에는 이미 전체 메시지 기능이 적용되어 있습니다.');
} else {
  const actualBlobSha = gitBlobSha(original);
  if (actualBlobSha !== EXPECTED_MESSENGER_BLOB_SHA) {
    throw new Error(
      [
        '현재 src/page/Messenger.jsx가 제작 기준 v52.14.9 파일과 다릅니다.',
        `기대 Git blob SHA: ${EXPECTED_MESSENGER_BLOB_SHA}`,
        `현재 Git blob SHA: ${actualBlobSha}`,
        '기존 기능 보호를 위해 자동 적용을 중단했습니다.',
      ].join('\n'),
    );
  }

  source = replaceOnce(
    source,
    "import { supabase } from '../supabaseClient';\n",
    "import { supabase } from '../supabaseClient';\nimport MessengerBroadcastDialog from '../components/MessengerBroadcastDialog';\n",
    '컴포넌트 import',
  );

  source = replaceOnce(
    source,
    "  const [newChatCreating, setNewChatCreating] = useState(false);\n\n  const [manageOpen, setManageOpen] = useState(false);",
    "  const [newChatCreating, setNewChatCreating] = useState(false);\n  const [broadcastOpen, setBroadcastOpen] = useState(false);\n\n  const [manageOpen, setManageOpen] = useState(false);",
    '전체 메시지 창 상태',
  );

  source = replaceOnce(
    source,
    "  const handleOpenNewChat = () => {\n    resetNewChatDialog();\n    setNewChatOpen(true);\n    loadUsers();\n  };\n\n  const toggleNewChatUser = (userId) => {",
    "  const handleOpenNewChat = () => {\n    resetNewChatDialog();\n    setNewChatOpen(true);\n    loadUsers();\n  };\n\n  const handleOpenBroadcast = async () => {\n    await loadUsers();\n    setBroadcastOpen(true);\n  };\n\n  const handleBroadcastSent = async (sentCount) => {\n    await loadRooms();\n    notifyUnreadRefresh();\n    showToast(`${sentCount}명에게 전체 메시지를 전송했습니다.`, 'success');\n  };\n\n  const toggleNewChatUser = (userId) => {",
    '전체 메시지 열기/완료 처리',
  );

  const newChatButton = `        <Tooltip title="새 대화">\n          <IconButton\n            size="small"\n            onClick={handleOpenNewChat}\n            sx={{ color: '#0f6fae', bgcolor: '#e0f2fe' }}\n          >\n            <AddCommentRoundedIcon fontSize="small" />\n          </IconButton>\n        </Tooltip>`;

  const broadcastAndNewChatButtons = `        <Tooltip title="전체 메시지 전송">\n          <IconButton\n            size="small"\n            onClick={handleOpenBroadcast}\n            sx={{ color: '#b45309', bgcolor: '#fef3c7' }}\n          >\n            <CampaignRoundedIcon fontSize="small" />\n          </IconButton>\n        </Tooltip>\n${newChatButton}`;

  source = replaceOnce(
    source,
    newChatButton,
    broadcastAndNewChatButtons,
    '상단 전파 아이콘',
  );

  source = replaceOnce(
    source,
    "      <Dialog\n        open={newChatOpen}\n",
    "      <MessengerBroadcastDialog\n        open={broadcastOpen}\n        users={users}\n        usersLoading={usersLoading}\n        usersError={usersError}\n        onClose={() => setBroadcastOpen(false)}\n        onSent={handleBroadcastSent}\n      />\n\n      <Dialog\n        open={newChatOpen}\n",
    '전체 메시지 창 렌더링',
  );
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(ROOT, `backup_v52.15_${timestamp}`);
const backupMessenger = path.join(backupRoot, 'src', 'page', 'Messenger.jsx');
const backupComponent = path.join(
  backupRoot,
  'src',
  'components',
  'MessengerBroadcastDialog.jsx',
);

fs.mkdirSync(path.dirname(backupMessenger), { recursive: true });
fs.copyFileSync(TARGET_MESSENGER, backupMessenger);
if (fs.existsSync(TARGET_COMPONENT)) {
  fs.mkdirSync(path.dirname(backupComponent), { recursive: true });
  fs.copyFileSync(TARGET_COMPONENT, backupComponent);
}

fs.mkdirSync(path.dirname(TARGET_COMPONENT), { recursive: true });
fs.copyFileSync(SOURCE_COMPONENT, TARGET_COMPONENT);

const output = eol === '\r\n' ? source.replace(/\n/g, '\r\n') : source;
fs.writeFileSync(TARGET_MESSENGER, output, 'utf8');

console.log('');
console.log('[v52.15] 적용 완료');
console.log(`- 수정: ${path.relative(ROOT, TARGET_MESSENGER)}`);
console.log(`- 추가: ${path.relative(ROOT, TARGET_COMPONENT)}`);
console.log(`- 백업: ${path.relative(ROOT, backupRoot)}`);
console.log('');
console.log('다음 명령: npm run build');
