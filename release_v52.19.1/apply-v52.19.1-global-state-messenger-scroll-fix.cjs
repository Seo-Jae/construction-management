const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const APP = path.join(ROOT, 'src', 'App.jsx');
const DASHBOARD = path.join(ROOT, 'src', 'Dashboard.jsx');
const MESSENGER = path.join(ROOT, 'src', 'page', 'Messenger.jsx');

const EXPECTED = {
  [APP]: 'bccbd78d3ca01aed24f7534aa32be13b4347e937',
  [DASHBOARD]: '5807e46b3235fc68ada16b453e8676c40d9af9e7',
  [MESSENGER]: '0347db26ae9d77a9c5f0354aa08553653703bd07',
};

function fail(message) {
  console.error('\n[v52.19.1 적용 중단]');
  console.error(message);
  process.exit(1);
}

function gitBlobSha(content) {
  const body = Buffer.from(content, 'utf8');
  const header = Buffer.from(`blob ${body.length}\0`, 'utf8');
  return crypto
    .createHash('sha1')
    .update(Buffer.concat([header, body]))
    .digest('hex');
}

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    fail(`${label}: 기준 문자열이 ${count}개 발견되었습니다. 예상값은 정확히 1개입니다.`);
  }
  return source.replace(before, after);
}

for (const file of [APP, DASHBOARD, MESSENGER]) {
  if (!fs.existsSync(file)) {
    fail(`대상 파일을 찾을 수 없습니다: ${file}`);
  }
}

let app = fs.readFileSync(APP, 'utf8');
let dashboard = fs.readFileSync(DASHBOARD, 'utf8');
let messenger = fs.readFileSync(MESSENGER, 'utf8');

const alreadyApplied =
  app.includes('userProfileRef.current') &&
  app.includes("authEvent === 'TOKEN_REFRESHED'") &&
  dashboard.includes("readDashboardSessionValue('selectedProcess')") &&
  messenger.includes('bottomPinRoomRef') &&
  messenger.includes('getMessengerImageLayout');

if (alreadyApplied) {
  console.log('[v52.19.1] 이미 적용된 상태입니다. 추가 변경 없이 종료합니다.');
  process.exit(0);
}

for (const [file, expectedSha] of Object.entries(EXPECTED)) {
  const source =
    file === APP ? app :
    file === DASHBOARD ? dashboard :
    messenger;
  const actualSha = gitBlobSha(source);

  if (actualSha !== expectedSha) {
    fail(
      `기존 기능 보호를 위해 자동 적용하지 않았습니다.\n` +
      `${path.relative(ROOT, file)}\n` +
      `예상 Git blob SHA: ${expectedSha}\n` +
      `현재 Git blob SHA: ${actualSha}\n` +
      `최신 운영 파일을 다시 확인한 뒤 적용해야 합니다.`
    );
  }
}

/* =========================================================
   1. App.jsx
   인증/포커스 갱신 때문에 Dashboard 전체가 unmount 되는 구조 제거
   ========================================================= */

app = replaceOnce(
  app,
`  const logoutInProgressRef = useRef(false);
  const accessSessionIdRef = useRef('');`,
`  const logoutInProgressRef = useRef(false);
  const accessSessionIdRef = useRef('');
  // v52.19: 이미 정상 로딩된 프로필이 있으면 인증 토큰 갱신이나
  // 포커스 복귀 중 프로필 재조회가 업무화면 전체를 내리지 않도록 보존합니다.
  const userProfileRef = useRef(null);`,
  'App 프로필 보존 ref 추가',
);

app = replaceOnce(
  app,
`  const fetchProfile = useCallback(async (user, options = {}) => {
    const silent = options.silent === true;

    if (!user?.email) {
      setUserProfile(null);
      setProfileError('');
      setProfileLoading(false);
      return;
    }

    if (!silent) setProfileLoading(true);
    setProfileError('');

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .ilike('email', user.email)
      .maybeSingle();

    if (error) {
      console.error('사용자 프로필 조회 오류:', error);
      setUserProfile(null);
      setProfileError(
        '계정 정보를 확인하지 못했습니다. SQL 적용 여부를 확인해주세요.',
      );
      setProfileLoading(false);
      return;
    }

    if (!data) {
      setUserProfile(null);
      setProfileError(
        '가입 정보가 생성되지 않았습니다. 최고관리자에게 문의해주세요.',
      );
      setProfileLoading(false);
      return;
    }

    setUserProfile(data);
    setProfileLoading(false);
  }, []);`,
`  const fetchProfile = useCallback(async (user, options = {}) => {
    const hasExistingProfile = Boolean(userProfileRef.current);
    const silent = options.silent === true || hasExistingProfile;

    if (!user?.email) {
      userProfileRef.current = null;
      setUserProfile(null);
      setProfileError('');
      setProfileLoading(false);
      return;
    }

    /*
      최초 로그인/새로고침으로 아직 프로필이 없을 때만 전체 로딩 화면을 사용합니다.
      이미 정상 업무화면이 열린 뒤의 30초 갱신, 창 focus, TOKEN_REFRESHED 등은
      화면을 유지한 채 백그라운드에서 프로필만 교체합니다.
    */
    if (!silent) {
      setProfileLoading(true);
      setProfileError('');
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .ilike('email', user.email)
      .maybeSingle();

    if (error) {
      console.error('사용자 프로필 조회 오류:', error);

      // 일시적인 네트워크/포커스 복귀 오류 때문에 현재 업무화면을
      // 로그인/상태화면으로 바꾸지 않습니다. 기존 정상 프로필을 유지합니다.
      if (silent && userProfileRef.current) {
        return;
      }

      userProfileRef.current = null;
      setUserProfile(null);
      setProfileError(
        '계정 정보를 확인하지 못했습니다. SQL 적용 여부를 확인해주세요.',
      );
      setProfileLoading(false);
      return;
    }

    if (!data) {
      userProfileRef.current = null;
      setUserProfile(null);
      setProfileError(
        '가입 정보가 생성되지 않았습니다. 최고관리자에게 문의해주세요.',
      );
      setProfileLoading(false);
      return;
    }

    userProfileRef.current = data;
    setUserProfile(data);
    setProfileError('');
    setProfileLoading(false);
  }, []);`,
  'App 프로필 백그라운드 갱신 안정화',
);

app = replaceOnce(
  app,
`    accessSessionIdRef.current = '';
    setSession(null);
    setUserProfile(null);`,
`    accessSessionIdRef.current = '';
    userProfileRef.current = null;
    setSession(null);
    setUserProfile(null);`,
  '로그아웃 시 프로필 ref 초기화',
);

app = replaceOnce(
  app,
`    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);

      if (nextSession) {
        window.setTimeout(() => fetchProfile(nextSession.user), 0);
      } else {
        setUserProfile(null);
        setProfileError('');
        setProfileLoading(false);
      }
    });`,
`    } = supabase.auth.onAuthStateChange((authEvent, nextSession) => {
      if (!active) return;
      setSession(nextSession);

      if (nextSession) {
        const hasExistingProfile = Boolean(userProfileRef.current);

        /*
          Supabase는 토큰 자동갱신이나 탭/창 복귀 시 인증 이벤트를 다시 발생시킬 수 있습니다.
          기존 코드가 이때마다 profileLoading=true로 만들면서 Dashboard를 통째로
          LoadingScreen으로 교체했고, 그 결과 모든 하위 업무 state가 초기화됐습니다.

          TOKEN_REFRESHED는 권한 프로필과 무관하므로 기존 프로필이 있으면 재조회조차 하지 않고,
          다른 인증 이벤트도 기존 프로필이 있으면 silent 조회만 수행합니다.
        */
        if (authEvent === 'TOKEN_REFRESHED' && hasExistingProfile) {
          return;
        }

        window.setTimeout(
          () =>
            fetchProfile(nextSession.user, {
              silent: hasExistingProfile,
            }),
          0,
        );
      } else {
        userProfileRef.current = null;
        setUserProfile(null);
        setProfileError('');
        setProfileLoading(false);
      }
    });`,
  'Auth 이벤트로 인한 전체 화면 초기화 방지',
);

app = replaceOnce(
  app,
`  if (profileLoading) {
    return <LoadingScreen />;
  }`,
`  /*
    이미 정상 프로필이 있는 상태에서는 향후 어떤 백그라운드 갱신 코드가
    profileLoading을 잠시 true로 만들더라도 Dashboard를 unmount하지 않습니다.
    전체 LoadingScreen은 "아직 최초 프로필이 없는 경우"에만 사용합니다.
  */
  if (profileLoading && !userProfile) {
    return <LoadingScreen />;
  }`,
  'App 전체 LoadingScreen 보호조건 강화',
);

/* =========================================================
   2. Dashboard.jsx
   공정 선택을 sessionStorage에도 보존 (실제 hard refresh 대비 2차 보호)
   ========================================================= */

dashboard = replaceOnce(
  dashboard,
`  const [selectedProcess, setSelectedProcess] = useState(processOptions[0]);`,
`  const [selectedProcess, setSelectedProcess] = useState(() =>
    readDashboardSessionValue('selectedProcess') || processOptions[0],
  );`,
  '선택 공정 복원',
);

dashboard = replaceOnce(
  dashboard,
  [
    '      window.sessionStorage.setItem(',
    '        `${dashboardStorageBase}:managementArea`,',
    '        managementArea,',
    '      );',
  ].join('\n'),
  [
    '      window.sessionStorage.setItem(',
    '        `${dashboardStorageBase}:managementArea`,',
    '        managementArea,',
    '      );',
    '      window.sessionStorage.setItem(',
    '        `${dashboardStorageBase}:selectedProcess`,',
    '        selectedProcess || processOptions[0],',
    '      );',
  ].join('\n'),
  '선택 공정 저장',
);

dashboard = replaceOnce(
  dashboard,
`    managementArea,
    selectedProjectName,
  ]);`,
`    managementArea,
    selectedProcess,
    selectedProjectName,
  ]);`,
  '선택 공정 저장 effect dependency',
);

/* =========================================================
   3. Messenger.jsx
   이미지 레이아웃 선점 + 초기 최신메시지 bottom pin
   ========================================================= */

messenger = replaceOnce(
  messenger,
`const createAttachmentMap = (rows = [], signedUrlMap = {}) => {
  const map = {};
  rows.forEach((row) => {
    map[row.message_id] = {
      ...row,
      signedUrl: signedUrlMap[row.storage_path] || '',
    };
  });
  return map;
};`,
`const createAttachmentMap = (rows = [], signedUrlMap = {}) => {
  const map = {};
  rows.forEach((row) => {
    map[row.message_id] = {
      ...row,
      signedUrl: signedUrlMap[row.storage_path] || '',
    };
  });
  return map;
};

const getMessengerImageLayout = (attachment) => {
  const sourceWidth = Number(attachment?.image_width || 0);
  const sourceHeight = Number(attachment?.image_height || 0);

  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    return {
      width: 320,
      height: 240,
      hasMetadata: false,
    };
  }

  const scale = Math.min(
    1,
    320 / sourceWidth,
    360 / sourceHeight,
  );

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    hasMetadata: true,
  };
};`,
  '메신저 이미지 표시 크기 계산 추가',
);

messenger = replaceOnce(
  messenger,
`  const messageScrollRef = useRef(null);
  const fileInputRef = useRef(null);`,
`  const messageScrollRef = useRef(null);
  const bottomPinRoomRef = useRef('');
  const bottomPinUntilRef = useRef(0);
  const fileInputRef = useRef(null);`,
  '메신저 bottom pin ref 추가',
);

messenger = replaceOnce(
  messenger,
`  const scrollToBottom = useCallback((behavior = 'auto') => {
    window.requestAnimationFrame(() => {
      const element = messageScrollRef.current;
      if (!element) return;
      element.scrollTo({
        top: element.scrollHeight,
        behavior,
      });
    });
  }, []);

  const loadUsers = useCallback(async () => {`,
`  const scrollToBottom = useCallback((behavior = 'auto') => {
    window.requestAnimationFrame(() => {
      const element = messageScrollRef.current;
      if (!element) return;
      element.scrollTo({
        top: element.scrollHeight,
        behavior,
      });
    });
  }, []);

  const releaseBottomPin = useCallback(() => {
    bottomPinRoomRef.current = '';
    bottomPinUntilRef.current = 0;
  }, []);

  const pinBottomForMedia = useCallback(
    (roomId, behavior = 'auto') => {
      if (!roomId) return;

      bottomPinRoomRef.current = roomId;
      bottomPinUntilRef.current = Date.now() + 10 * 1000;

      /*
        React 렌더 직후뿐 아니라 이미지 decode/레이아웃이 끝나는 구간까지
        몇 차례 마지막 메시지 위치를 재확인합니다.
        사용자가 wheel/touch로 직접 위로 움직이면 즉시 pin을 해제합니다.
      */
      [0, 100, 400, 1200, 3000].forEach((delay, index) => {
        window.setTimeout(() => {
          if (
            bottomPinRoomRef.current !== roomId ||
            Date.now() > bottomPinUntilRef.current
          ) {
            return;
          }

          scrollToBottom(index === 0 ? behavior : 'auto');
        }, delay);
      });
    },
    [scrollToBottom],
  );

  const handleMessageImageLoad = useCallback(
    (roomId) => {
      if (
        bottomPinRoomRef.current === roomId &&
        Date.now() <= bottomPinUntilRef.current
      ) {
        scrollToBottom('auto');
      }
    },
    [scrollToBottom],
  );

  const loadUsers = useCallback(async () => {`,
  '메신저 안정적 bottom pin 로직 추가',
);

messenger = replaceOnce(
  messenger,
`    async ({ roomId, before = '', prepend = false, silent = false }) => {
      if (!roomId) return;

      if (prepend) setOlderLoading(true);
      else if (!silent) setMessagesLoading(true);`,
`    async ({ roomId, before = '', prepend = false, silent = false }) => {
      if (!roomId) return;

      const scrollElement = messageScrollRef.current;
      const distanceFromBottom = scrollElement
        ? scrollElement.scrollHeight -
          scrollElement.scrollTop -
          scrollElement.clientHeight
        : 0;
      const wasNearBottom =
        !scrollElement || distanceFromBottom <= 140;
      const shouldPinAfterLoad =
        !prepend && (!silent || wasNearBottom);

      if (prepend) setOlderLoading(true);
      else if (!silent) setMessagesLoading(true);`,
  '메시지 로드 전 bottom 상태 판정',
);

messenger = replaceOnce(
  messenger,
`          setMessages(pageRows);
          setAttachmentsByMessage(pageAttachmentMap);
          scrollToBottom('auto');
        }`,
`          setMessages(pageRows);
          setAttachmentsByMessage(pageAttachmentMap);

          if (shouldPinAfterLoad) {
            pinBottomForMedia(roomId, 'auto');
          }
        }`,
  '메시지 로드 후 bottom pin 적용',
);

messenger = replaceOnce(
  messenger,
`    [createSignedUrlMap, scrollToBottom, showToast],`,
`    [createSignedUrlMap, pinBottomForMedia, showToast],`,
  'fetchMessagePage dependency 수정',
);

messenger = replaceOnce(
  messenger,
`  const handleLoadOlder = async () => {
    if (!selectedRoomId || olderLoading || !hasOlderMessages || messages.length === 0) {
      return;
    }

    const scrollElement = messageScrollRef.current;`,
`  const handleLoadOlder = async () => {
    if (!selectedRoomId || olderLoading || !hasOlderMessages || messages.length === 0) {
      return;
    }

    releaseBottomPin();

    const scrollElement = messageScrollRef.current;`,
  '이전 메시지 조회 시 bottom pin 해제',
);

messenger = replaceOnce(
  messenger,
`          <Box
            ref={messageScrollRef}
            sx={{
              flexGrow: 1,
              minHeight: 0,
              overflowY: 'auto',`,
`          <Box
            ref={messageScrollRef}
            onWheel={releaseBottomPin}
            onTouchStart={releaseBottomPin}
            sx={{
              flexGrow: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowAnchor: 'none',`,
  '메시지 스크롤 앵커 및 사용자 스크롤 처리',
);

messenger = replaceOnce(
  messenger,
`                  const attachment = attachmentsByMessage[message.id];
                  const deleted = Boolean(message.deleted_at);`,
`                  const attachment = attachmentsByMessage[message.id];
                  const imageLayout = attachment
                    ? getMessengerImageLayout(attachment)
                    : null;
                  const deleted = Boolean(message.deleted_at);`,
  '메시지 이미지 레이아웃 계산 연결',
);

messenger = replaceOnce(
  messenger,
`                                  {attachment.signedUrl ? (
                                    <Box
                                      component="img"
                                      src={attachment.signedUrl}
                                      alt={attachment.file_name || '메신저 이미지'}
                                      onClick={() => handlePreviewImage(attachment)}
                                      sx={{
                                        display: 'block',
                                        maxWidth: 'min(320px, 62vw)',
                                        maxHeight: 360,
                                        objectFit: 'contain',
                                        borderRadius: 1,
                                        cursor: 'zoom-in',
                                        bgcolor: '#ffffff',
                                      }}
                                    />
                                  ) : (`,
`                                  {attachment.signedUrl ? (
                                    <Box
                                      onClick={() => handlePreviewImage(attachment)}
                                      sx={{
                                        width: \`min(\${imageLayout?.width || 320}px, 62vw)\`,
                                        aspectRatio: \`\${imageLayout?.width || 320} / \${imageLayout?.height || 240}\`,
                                        maxWidth: '100%',
                                        maxHeight: 360,
                                        display: 'grid',
                                        placeItems: 'center',
                                        overflow: 'hidden',
                                        borderRadius: 1,
                                        cursor: 'zoom-in',
                                        bgcolor: '#ffffff',
                                      }}
                                    >
                                      <Box
                                        component="img"
                                        src={attachment.signedUrl}
                                        alt={attachment.file_name || '메신저 이미지'}
                                        onLoad={() =>
                                          handleMessageImageLoad(message.room_id)
                                        }
                                        sx={{
                                          width: '100%',
                                          height: '100%',
                                          display: 'block',
                                          objectFit: 'contain',
                                        }}
                                      />
                                    </Box>
                                  ) : (`,
  '메신저 이미지 높이 선점 및 onLoad bottom 보정',
);

// 최종 검증 마커
const appMarkers = [
  'const userProfileRef = useRef(null);',
  "authEvent === 'TOKEN_REFRESHED'",
  'if (profileLoading && !userProfile)',
  '기존 정상 프로필을 유지합니다.',
];

const dashboardMarkers = [
  "readDashboardSessionValue('selectedProcess') || processOptions[0]",
  '`${dashboardStorageBase}:selectedProcess`',
];

const messengerMarkers = [
  'const bottomPinRoomRef = useRef',
  'const getMessengerImageLayout',
  "overflowAnchor: 'none'",
  'handleMessageImageLoad(message.room_id)',
  'pinBottomForMedia(roomId',
];

for (const marker of appMarkers) {
  if (!app.includes(marker)) fail(`App 적용 후 검증 실패: ${marker}`);
}
for (const marker of dashboardMarkers) {
  if (!dashboard.includes(marker)) fail(`Dashboard 적용 후 검증 실패: ${marker}`);
}
for (const marker of messengerMarkers) {
  if (!messenger.includes(marker)) fail(`Messenger 적용 후 검증 실패: ${marker}`);
}

// 백업
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.19.1_${stamp}`);

for (const [target, content] of [
  [APP, fs.readFileSync(APP, 'utf8')],
  [DASHBOARD, fs.readFileSync(DASHBOARD, 'utf8')],
  [MESSENGER, fs.readFileSync(MESSENGER, 'utf8')],
]) {
  const backupTarget = path.join(
    backupDir,
    path.relative(ROOT, target),
  );
  fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
  fs.writeFileSync(backupTarget, content, 'utf8');
}

fs.writeFileSync(APP, app, 'utf8');
fs.writeFileSync(DASHBOARD, dashboard, 'utf8');
fs.writeFileSync(MESSENGER, messenger, 'utf8');

console.log('\n[v52.19.1 적용 완료]');
console.log('- Supabase 인증/토큰 갱신 시 Dashboard 전체 unmount 방지');
console.log('- 다른 탭/프로그램/작업표시줄 복귀 시 현재 메뉴 및 메모리 작업상태 유지');
console.log('- 백그라운드 프로필 조회 실패 시 기존 정상 업무화면 유지');
console.log('- 선택 공정을 sessionStorage에 보존해 실제 새로고침에도 복원');
console.log('- 메신저 이미지 영역을 이미지 로드 전에 미리 확보');
console.log('- 대화방 최초 진입 시 최신 메시지 위치를 이미지 로딩 동안 안정적으로 유지');
console.log('- 사용자가 직접 위로 스크롤하면 자동 bottom pin 즉시 해제');
console.log(`- 백업: ${backupDir}`);
console.log('\n다음 명령: npm run build');
