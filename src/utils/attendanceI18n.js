export const ATTENDANCE_LANGUAGE_STORAGE_KEY =
  'wooklim-attendance-language';

export const ATTENDANCE_LANGUAGES = [
  { code: 'ko', label: '한국어', locale: 'ko-KR' },
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'zh', label: '中文', locale: 'zh-CN' },
  { code: 'vi', label: 'Tiếng Việt', locale: 'vi-VN' },
  { code: 'ru', label: 'Русский', locale: 'ru-RU' },
  { code: 'mn', label: 'Монгол', locale: 'mn-MN' },
];

const ko = {
  appTitle: '욱림건설 근태시스템',
  notice: '공지',
  noticeAria: '공지사항 {content}',
  loginTitle: '로그인',
  phone: '휴대폰번호',
  password: '비밀번호',
  login: '로그인',
  signupPrompt: '처음 이용하시나요? 가입 신청',
  adminMode: '관리자 모드',
  signupTitle: '근로자 가입 신청',
  signupSubtitle: '별도의 사내 ERP 계정 없이 이용합니다.',
  workSite: '근무 현장',
  koreanName: '이름(한글)',
  foreignWorker: '외국인 근로자입니다',
  englishName: '영문명',
  englishNameHelp: '여권 또는 외국인등록증의 영문명',
  testAccount: '테스트계정입니다',
  testPasswordToast: '테스트계정의 로그인 비밀번호는 자동으로 1로 설정됩니다.',
  testPasswordInfo: '테스트계정 비밀번호는 1입니다. 담당자 승인 후 휴대폰번호와 비밀번호 1로 로그인하세요.',
  trade: '직종·공종',
  tradePlaceholder: '예: 경량, 합지, 몰딩',
  passwordHelp: '영문과 숫자를 포함해 8자 이상',
  passwordConfirm: '비밀번호 확인',
  privacyAgreement: '[필수] 가입 승인과 근태처리를 위한 이름·휴대폰·직종·등록기기 정보 수집에 동의합니다. 위치정보는 수집하지 않습니다.',
  signup: '가입 신청',
  installAttendanceApp: '근태앱 설치',
  selectProject: '근무할 현장을 선택해주세요.',
  invalidKoreanName: '이름은 한글 2~10자로 입력해주세요.',
  invalidEnglishName: '외국인 근로자는 영문명을 입력해주세요.',
  invalidPhone: '휴대폰번호를 정확히 입력해주세요.',
  invalidTrade: '직종·공종을 입력해주세요.',
  invalidPassword: '비밀번호는 영문과 숫자를 포함해 8자 이상 입력해주세요.',
  passwordMismatch: '비밀번호 확인이 일치하지 않습니다.',
  privacyRequired: '필수 개인정보 수집에 동의해주세요.',
  signupFailed: '가입 신청에 실패했습니다.',
  testSignupSuccess: '테스트계정 가입 신청이 완료되었습니다. 로그인 비밀번호는 1입니다.',
  signupSuccess: '가입 신청이 완료되었습니다. 현장담당자의 승인을 기다려주세요.',
  loginRequiredFields: '휴대폰번호와 비밀번호를 입력해주세요.',
  loginFailed: '로그인에 실패했습니다.',
  deviceChangeRequested: '기기 변경 승인을 요청했습니다.',
  checkingAccount: '근태 계정을 확인하고 있습니다.',
  logout: '로그아웃',
  pending: '승인 대기',
  pendingDescription: '현장담당자가 가입정보와 휴대폰을 확인하고 있습니다.',
  active: '사용 가능',
  activeDescription: '출·퇴근 QR을 촬영할 수 있습니다.',
  rejected: '승인 반려',
  rejectedDescription: '현장담당자에게 가입정보를 확인해주세요.',
  disabled: '사용 중지',
  disabledDescription: '현장담당자에게 계정 상태를 확인해주세요.',
  sessionInvalid: '로그인 정보가 유효하지 않습니다. 다시 로그인해주세요.',
  connectionUnstable: '서버 연결이 잠시 불안정합니다. 로그인 상태는 유지되며 자동으로 다시 연결합니다.',
  monthlyAttendance: '금월 출결현황',
  yearMonth: '{year}년 {month}월',
  weekdays: ['일', '월', '화', '수', '목', '금', '토'],
  dateAttendanceAria: '{month}월 {day}일 출결 확인',
  checkInShort: '출',
  checkOutShort: '퇴',
  dayAttendance: '{month}월 {day}일 출결',
  checkIn: '출근',
  checkOut: '퇴근',
  unprocessed: '미처리',
  riskTitle: '중점위험요인 전파',
  itemCount: '{count}건',
  noneRegistered: '등록 없음',
  noRisk: '등록된 중점위험요인이 없습니다.',
  common: '공통',
  assigned: '담당',
  author: '작성자',
  todayAttendance: '오늘 출·퇴근',
  attendanceComplete: '오늘 근태 처리 완료',
  processing: '처리 중',
  cameraPreparing: '카메라 준비 중',
  scanAttendanceQr: '출·퇴근 QR 촬영',
  recheckApproval: '승인상태 다시 확인',
  installAsApp: '앱으로 설치',
  cameraPermissionNeeded: '카메라 권한 필요',
  cameraBlocked: '카메라 권한이 현재 차단되어 있습니다. 차단된 권한은 앱에서 시스템 허용창을 강제로 다시 띄울 수 없습니다.',
  androidCameraSettings: 'Android Chrome에서는 Chrome 설정 → 사이트 설정 → 카메라에서 현재 욱림건설 근태시스템 사이트를 찾아 허용으로 변경해주세요.',
  androidAppPermission: 'Android 자체에서 Chrome의 카메라 권한이 꺼져 있다면 휴대폰 설정 → 앱 → Chrome → 권한 → 카메라도 허용해야 합니다.',
  rearCameraNeeded: '출·퇴근 QR 촬영을 위해 후면 카메라 권한이 필요합니다.',
  cameraPromptGuide: '아래 카메라 사용 허용을 누르면 Chrome/Safari의 카메라 권한창이 표시됩니다. 권한창에서 허용을 선택해주세요.',
  cancel: '취소',
  checkingPermission: '권한 확인 중',
  recheckCameraPermission: '카메라 권한 다시 확인',
  allowCamera: '카메라 사용 허용',
  dynamicQrScan: '동적 QR 촬영',
  qrFrameGuide: '화면의 QR을 네모 안에 맞춰주세요. 인식 즉시 서버에서 처리합니다.',
  preparingRearCamera: '후면 카메라를 준비하고 있습니다.',
  iosInstallGuide: '아이폰은 Safari 하단의 공유 버튼을 누른 뒤 홈 화면에 추가를 선택하세요.',
  androidInstallGuide: '안드로이드는 Chrome 메뉴의 앱 설치를 선택하세요. 홈 화면에 추가 방식은 사용하지 않는 것을 권장합니다.',
  legacyInstallGuide: '기존에 홈 화면 바로가기 방식으로 설치한 경우 Chrome이 “이 앱의 URL 복사하기” 시스템 알림을 표시할 수 있습니다. 기존 아이콘을 제거한 뒤 Chrome의 “앱 설치” 방식으로 다시 설치해주세요.',
  cameraHttpsError: '카메라는 보안 연결(HTTPS)에서만 사용할 수 있습니다. 운영 주소로 다시 접속해주세요.',
  cameraDeniedError: '카메라 권한이 차단되어 있습니다. 브라우저 또는 휴대폰 설정에서 카메라를 허용한 뒤 다시 눌러주세요.',
  cameraNotFoundError: '사용할 수 있는 카메라를 찾지 못했습니다. 휴대폰 카메라 상태를 확인해주세요.',
  cameraBusyError: '다른 앱이 카메라를 사용 중이거나 카메라를 시작하지 못했습니다. 다른 카메라 앱을 닫고 다시 시도해주세요.',
  cameraConstraintError: '휴대폰 카메라 설정을 적용하지 못했습니다. 다시 촬영을 눌러주세요.',
  cameraTimeoutError: '카메라 권한은 확인됐지만 영상이 재생되지 않았습니다. 브라우저를 완전히 닫았다가 다시 열고 촬영해주세요.',
  cameraStartError: '카메라를 시작하지 못했습니다. 브라우저의 카메라 권한을 허용한 뒤 다시 시도해주세요.',
  qrCheckFailed: 'QR 확인에 실패했습니다.',
  attendanceFailed: '출·퇴근 처리에 실패했습니다.',
  attendanceSuccess: '{type} 처리가 완료되었습니다. {time}',
  adminTitle: '관리자 모드',
  adminSubtitle: '통합관리시스템에 등록된 관리자 계정으로 인증합니다.',
  adminInfo: '현장에서 근로자에게 보여줄 출·퇴근 QR만 실행합니다. QR 표시 세션 발급 후 관리자 로그인 세션은 현재 탭에서 자동 종료됩니다.',
  adminEmail: '통합관리시스템 아이디(이메일)',
  adminProject: 'QR 표시 현장',
  adminAuthenticating: '관리자 인증 중',
  startAttendanceQr: '출·퇴근 QR 실행',
  backToWorkerLogin: '근로자 로그인으로 돌아가기',
  adminMissingCredentials: '통합관리시스템 아이디와 비밀번호를 입력해주세요.',
  adminSelectProject: 'QR을 표시할 현장을 선택해주세요.',
  adminInvalidCredentials: '통합관리시스템 아이디 또는 비밀번호를 확인해주세요.',
  adminInactiveAccount: '사용 가능한 통합관리시스템 계정인지 확인해주세요.',
  adminNoPermission: '해당 현장의 QR 표시 권한을 확인해주세요.',
  adminSessionFailed: 'QR 표시 세션을 발급하지 못했습니다.',
  adminQrIssueFailed: '출·퇴근 QR을 발급하지 못했습니다.',
  adminQrImageFailed: 'QR 이미지를 만들지 못했습니다.',
  adminQrTitle: '관리자 출·퇴근 QR',
  exitAdmin: '관리자 모드 종료',
  adminQrGuide: '근로자가 자신의 휴대폰으로 아래 QR을 촬영하면 기존과 동일하게 출·퇴근 처리가 진행됩니다.',
  adminQrAlt: '관리자 휴대폰 출퇴근 QR',
  qrRefresh: '{seconds}초 후 자동 변경 · 서버 유효시간 7초',
  currentTime: '현재시각',
  recentlyIssued: '최근 발급 {time}',
  qrSessionExpires: 'QR 표시 세션 만료 {time}',
};

const dictionaries = {
  ko,
  en: {
    ...ko,
    appTitle: 'Wooklim Construction Attendance', notice: 'Notice', noticeAria: 'Notices {content}', loginTitle: 'Login', phone: 'Mobile number', password: 'Password', login: 'Login', signupPrompt: 'First time here? Apply to join', adminMode: 'Admin mode', signupTitle: 'Worker registration', signupSubtitle: 'No separate company ERP account is required.', workSite: 'Work site', koreanName: 'Name in Korean', foreignWorker: 'I am a foreign worker', englishName: 'Name in English', englishNameHelp: 'English name shown on your passport or residence card', testAccount: 'This is a test account', testPasswordToast: 'The test account password is automatically set to 1.', testPasswordInfo: 'The test account password is 1. After approval, log in with your mobile number and password 1.', trade: 'Trade / work type', tradePlaceholder: 'e.g. framing, boards, molding', passwordHelp: 'At least 8 characters with letters and numbers', passwordConfirm: 'Confirm password', privacyAgreement: '[Required] I agree to the collection of my name, mobile number, trade and registered device for approval and attendance. Location data is not collected.', signup: 'Apply', installAttendanceApp: 'Install attendance app', selectProject: 'Select your work site.', invalidKoreanName: 'Enter a Korean name using 2–10 Korean characters.', invalidEnglishName: 'Foreign workers must enter an English name.', invalidPhone: 'Enter a valid mobile number.', invalidTrade: 'Enter your trade or work type.', invalidPassword: 'Enter at least 8 characters including letters and numbers.', passwordMismatch: 'The password confirmation does not match.', privacyRequired: 'Agree to the required personal data collection.', signupFailed: 'Registration failed.', testSignupSuccess: 'Test account registration completed. The login password is 1.', signupSuccess: 'Registration completed. Please wait for site manager approval.', loginRequiredFields: 'Enter your mobile number and password.', loginFailed: 'Login failed.', deviceChangeRequested: 'Device change approval has been requested.', checkingAccount: 'Checking your attendance account.', logout: 'Log out', pending: 'Pending approval', pendingDescription: 'The site manager is checking your registration and phone.', active: 'Available', activeDescription: 'You can scan the check-in/out QR.', rejected: 'Rejected', rejectedDescription: 'Ask the site manager to check your registration.', disabled: 'Disabled', disabledDescription: 'Ask the site manager to check your account status.', sessionInvalid: 'Your login is no longer valid. Please log in again.', connectionUnstable: 'The server connection is temporarily unstable. You will stay logged in and reconnection will be automatic.', monthlyAttendance: 'This month', yearMonth: '{month}/{year}', weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], dateAttendanceAria: 'View attendance for {month}/{day}', checkInShort: 'IN', checkOutShort: 'OUT', dayAttendance: 'Attendance for {month}/{day}', checkIn: 'Check-in', checkOut: 'Check-out', unprocessed: 'Not recorded', riskTitle: 'Priority risk notice', itemCount: '{count}', noneRegistered: 'None', noRisk: 'No priority risk notices.', common: 'All', assigned: 'Site', author: 'Author', todayAttendance: "Today's attendance", attendanceComplete: 'Attendance completed today', processing: 'Processing', cameraPreparing: 'Preparing camera', scanAttendanceQr: 'Scan attendance QR', recheckApproval: 'Check approval again', installAsApp: 'Install app', cameraPermissionNeeded: 'Camera permission required', cameraBlocked: 'Camera permission is blocked. The app cannot reopen a blocked system permission prompt.', androidCameraSettings: 'In Android Chrome, open Chrome Settings → Site settings → Camera, find the Wooklim attendance site and select Allow.', androidAppPermission: 'If Android has blocked Chrome camera access, also open Phone Settings → Apps → Chrome → Permissions → Camera and allow it.', rearCameraNeeded: 'Rear camera permission is required to scan the attendance QR.', cameraPromptGuide: 'Tap Allow camera below, then choose Allow in the Chrome/Safari permission prompt.', cancel: 'Cancel', checkingPermission: 'Checking permission', recheckCameraPermission: 'Check camera permission again', allowCamera: 'Allow camera', dynamicQrScan: 'Scan dynamic QR', qrFrameGuide: 'Fit the QR inside the square. It will be processed immediately.', preparingRearCamera: 'Preparing the rear camera.', iosInstallGuide: 'On iPhone, tap Share in Safari and choose Add to Home Screen.', androidInstallGuide: 'On Android, choose Install app from the Chrome menu. Installing through Add to Home Screen is not recommended.', legacyInstallGuide: 'If you previously installed a home-screen shortcut, Chrome may show a “Copy this app URL” system notice. Remove the old icon and reinstall using Chrome’s Install app option.', cameraHttpsError: 'The camera works only over a secure HTTPS connection. Open the production address again.', cameraDeniedError: 'Camera permission is blocked. Allow the camera in your browser or phone settings and try again.', cameraNotFoundError: 'No usable camera was found. Check your phone camera.', cameraBusyError: 'Another app may be using the camera. Close other camera apps and try again.', cameraConstraintError: 'The phone camera settings could not be applied. Try scanning again.', cameraTimeoutError: 'Camera permission was granted, but video did not start. Fully close the browser, reopen it and try again.', cameraStartError: 'The camera could not start. Allow camera access in the browser and try again.', qrCheckFailed: 'QR verification failed.', attendanceFailed: 'Attendance processing failed.', attendanceSuccess: '{type} completed. {time}', adminTitle: 'Admin mode', adminSubtitle: 'Sign in with a registered management system admin account.', adminInfo: 'This opens only the attendance QR shown to workers. The admin login session in this tab ends automatically after the QR display session is issued.', adminEmail: 'Management system ID (email)', adminProject: 'QR display site', adminAuthenticating: 'Authenticating admin', startAttendanceQr: 'Start attendance QR', backToWorkerLogin: 'Back to worker login', adminMissingCredentials: 'Enter the management system ID and password.', adminSelectProject: 'Select the site for the QR display.', adminInvalidCredentials: 'Check the management system ID or password.', adminInactiveAccount: 'Check that this management system account is active.', adminNoPermission: 'Check QR display permission for this site.', adminSessionFailed: 'Could not issue a QR display session.', adminQrIssueFailed: 'Could not issue the attendance QR.', adminQrImageFailed: 'Could not create the QR image.', adminQrTitle: 'Admin attendance QR', exitAdmin: 'Exit admin mode', adminQrGuide: 'Workers can scan the QR below with their phones to check in or out.', adminQrAlt: 'Admin phone attendance QR', qrRefresh: 'Changes automatically in {seconds}s · Server validity 7s', currentTime: 'Current time', recentlyIssued: 'Last issued {time}', qrSessionExpires: 'QR display session expires {time}',
  },
  zh: {
    ...ko,
    appTitle: '旭林建设考勤系统', notice: '通知', noticeAria: '通知 {content}', loginTitle: '登录', phone: '手机号码', password: '密码', login: '登录', signupPrompt: '首次使用？申请注册', adminMode: '管理员模式', signupTitle: '工人注册申请', signupSubtitle: '无需单独的公司ERP账号。', workSite: '工作现场', koreanName: '姓名（韩文）', foreignWorker: '我是外籍工人', englishName: '英文姓名', englishNameHelp: '护照或外国人登记证上的英文姓名', testAccount: '这是测试账号', testPasswordToast: '测试账号的登录密码自动设置为1。', testPasswordInfo: '测试账号密码为1。批准后请使用手机号码和密码1登录。', trade: '工种·专业', tradePlaceholder: '例如：轻钢、石膏板、装饰线', passwordHelp: '至少8位，须包含英文字母和数字', passwordConfirm: '确认密码', privacyAgreement: '[必选] 我同意为注册批准和考勤处理收集姓名、手机号码、工种及注册设备信息。不收集位置信息。', signup: '申请注册', installAttendanceApp: '安装考勤应用', selectProject: '请选择工作现场。', invalidKoreanName: '请输入2至10个韩文字的姓名。', invalidEnglishName: '外籍工人请输入英文姓名。', invalidPhone: '请输入正确的手机号码。', invalidTrade: '请输入工种或专业。', invalidPassword: '密码至少8位，并须包含英文字母和数字。', passwordMismatch: '两次输入的密码不一致。', privacyRequired: '请同意必选的个人信息收集。', signupFailed: '注册申请失败。', testSignupSuccess: '测试账号申请完成。登录密码为1。', signupSuccess: '注册申请完成。请等待现场负责人批准。', loginRequiredFields: '请输入手机号码和密码。', loginFailed: '登录失败。', deviceChangeRequested: '已申请设备变更批准。', checkingAccount: '正在确认考勤账号。', logout: '退出登录', pending: '等待批准', pendingDescription: '现场负责人正在确认注册信息和手机。', active: '可使用', activeDescription: '可以扫描上下班二维码。', rejected: '已拒绝', rejectedDescription: '请联系现场负责人确认注册信息。', disabled: '已停用', disabledDescription: '请联系现场负责人确认账号状态。', sessionInvalid: '登录信息已失效，请重新登录。', connectionUnstable: '服务器连接暂时不稳定。登录状态将保留并自动重连。', monthlyAttendance: '本月考勤', yearMonth: '{year}年{month}月', weekdays: ['日', '一', '二', '三', '四', '五', '六'], dateAttendanceAria: '查看{month}月{day}日考勤', checkInShort: '上', checkOutShort: '下', dayAttendance: '{month}月{day}日考勤', checkIn: '上班', checkOut: '下班', unprocessed: '未处理', riskTitle: '重点风险因素通知', itemCount: '{count}条', noneRegistered: '无登记', noRisk: '暂无重点风险因素。', common: '全体', assigned: '现场', author: '发布者', todayAttendance: '今日考勤', attendanceComplete: '今日考勤已完成', processing: '处理中', cameraPreparing: '正在准备相机', scanAttendanceQr: '扫描上下班二维码', recheckApproval: '重新确认批准状态', installAsApp: '安装应用', cameraPermissionNeeded: '需要相机权限', cameraBlocked: '相机权限已被阻止。应用无法强制重新打开系统权限窗口。', androidCameraSettings: '在Android Chrome中打开Chrome设置 → 网站设置 → 相机，找到旭林建设考勤系统并设为允许。', androidAppPermission: '如果Android系统也关闭了Chrome的相机权限，请在手机设置 → 应用 → Chrome → 权限 → 相机中允许。', rearCameraNeeded: '扫描上下班二维码需要后置相机权限。', cameraPromptGuide: '点击下方“允许使用相机”，然后在Chrome/Safari权限窗口中选择允许。', cancel: '取消', checkingPermission: '正在确认权限', recheckCameraPermission: '重新确认相机权限', allowCamera: '允许使用相机', dynamicQrScan: '扫描动态二维码', qrFrameGuide: '请将二维码对准方框，识别后会立即处理。', preparingRearCamera: '正在准备后置相机。', iosInstallGuide: '在iPhone Safari底部点击分享，然后选择“添加到主屏幕”。', androidInstallGuide: '在Android Chrome菜单中选择“安装应用”。不建议使用“添加到主屏幕”。', legacyInstallGuide: '如果之前以主屏幕快捷方式安装，Chrome可能显示“复制此应用的网址”系统通知。请删除旧图标后通过Chrome的“安装应用”重新安装。', cameraHttpsError: '相机只能在安全的HTTPS连接中使用。请重新打开正式地址。', cameraDeniedError: '相机权限已被阻止。请在浏览器或手机设置中允许后重试。', cameraNotFoundError: '未找到可用相机，请确认手机相机状态。', cameraBusyError: '其他应用可能正在使用相机。请关闭其他相机应用后重试。', cameraConstraintError: '无法应用手机相机设置，请重新扫描。', cameraTimeoutError: '相机权限已确认，但视频未播放。请完全关闭浏览器后重新打开。', cameraStartError: '无法启动相机。请允许浏览器使用相机后重试。', qrCheckFailed: '二维码确认失败。', attendanceFailed: '上下班处理失败。', attendanceSuccess: '{type}处理完成。{time}', adminTitle: '管理员模式', adminSubtitle: '使用管理系统中已登记的管理员账号认证。', adminInfo: '仅运行展示给工人的上下班二维码。二维码显示会话签发后，本标签页中的管理员登录会话将自动结束。', adminEmail: '管理系统账号（邮箱）', adminProject: '二维码显示现场', adminAuthenticating: '正在认证管理员', startAttendanceQr: '运行上下班二维码', backToWorkerLogin: '返回工人登录', adminMissingCredentials: '请输入管理系统账号和密码。', adminSelectProject: '请选择显示二维码的现场。', adminInvalidCredentials: '请确认管理系统账号或密码。', adminInactiveAccount: '请确认该管理系统账号可用。', adminNoPermission: '请确认该现场的二维码显示权限。', adminSessionFailed: '无法签发二维码显示会话。', adminQrIssueFailed: '无法签发上下班二维码。', adminQrImageFailed: '无法生成二维码图像。', adminQrTitle: '管理员上下班二维码', exitAdmin: '退出管理员模式', adminQrGuide: '工人使用自己的手机扫描下方二维码即可进行上下班处理。', adminQrAlt: '管理员手机考勤二维码', qrRefresh: '{seconds}秒后自动更换 · 服务器有效期7秒', currentTime: '当前时间', recentlyIssued: '最近签发 {time}', qrSessionExpires: '二维码显示会话到期 {time}',
  },
  vi: {
    ...ko,
    appTitle: 'Hệ thống chấm công Wooklim', notice: 'Thông báo', noticeAria: 'Thông báo {content}', loginTitle: 'Đăng nhập', phone: 'Số điện thoại', password: 'Mật khẩu', login: 'Đăng nhập', signupPrompt: 'Lần đầu sử dụng? Đăng ký', adminMode: 'Chế độ quản trị', signupTitle: 'Đăng ký công nhân', signupSubtitle: 'Không cần tài khoản ERP nội bộ riêng.', workSite: 'Công trường', koreanName: 'Họ tên bằng tiếng Hàn', foreignWorker: 'Tôi là lao động nước ngoài', englishName: 'Họ tên tiếng Anh', englishNameHelp: 'Họ tên tiếng Anh trên hộ chiếu hoặc thẻ cư trú', testAccount: 'Đây là tài khoản thử nghiệm', testPasswordToast: 'Mật khẩu tài khoản thử nghiệm được tự động đặt là 1.', testPasswordInfo: 'Mật khẩu tài khoản thử nghiệm là 1. Sau khi được duyệt, đăng nhập bằng số điện thoại và mật khẩu 1.', trade: 'Nghề / hạng mục', tradePlaceholder: 'Ví dụ: khung nhẹ, tấm, phào', passwordHelp: 'Ít nhất 8 ký tự gồm chữ và số', passwordConfirm: 'Xác nhận mật khẩu', privacyAgreement: '[Bắt buộc] Tôi đồng ý thu thập họ tên, số điện thoại, nghề và thiết bị đăng ký để phê duyệt và chấm công. Không thu thập vị trí.', signup: 'Đăng ký', installAttendanceApp: 'Cài ứng dụng chấm công', selectProject: 'Vui lòng chọn công trường.', invalidKoreanName: 'Vui lòng nhập tên tiếng Hàn từ 2–10 ký tự.', invalidEnglishName: 'Lao động nước ngoài phải nhập họ tên tiếng Anh.', invalidPhone: 'Vui lòng nhập đúng số điện thoại.', invalidTrade: 'Vui lòng nhập nghề hoặc hạng mục.', invalidPassword: 'Mật khẩu phải có ít nhất 8 ký tự gồm chữ và số.', passwordMismatch: 'Mật khẩu xác nhận không khớp.', privacyRequired: 'Vui lòng đồng ý thu thập thông tin cá nhân bắt buộc.', signupFailed: 'Đăng ký thất bại.', testSignupSuccess: 'Đăng ký tài khoản thử nghiệm hoàn tất. Mật khẩu đăng nhập là 1.', signupSuccess: 'Đăng ký hoàn tất. Vui lòng chờ người phụ trách công trường phê duyệt.', loginRequiredFields: 'Vui lòng nhập số điện thoại và mật khẩu.', loginFailed: 'Đăng nhập thất bại.', deviceChangeRequested: 'Đã yêu cầu phê duyệt thay đổi thiết bị.', checkingAccount: 'Đang kiểm tra tài khoản chấm công.', logout: 'Đăng xuất', pending: 'Chờ duyệt', pendingDescription: 'Người phụ trách đang kiểm tra thông tin đăng ký và điện thoại.', active: 'Có thể sử dụng', activeDescription: 'Bạn có thể quét QR vào/ra.', rejected: 'Bị từ chối', rejectedDescription: 'Vui lòng liên hệ người phụ trách để kiểm tra đăng ký.', disabled: 'Đã dừng', disabledDescription: 'Vui lòng liên hệ người phụ trách để kiểm tra trạng thái tài khoản.', sessionInvalid: 'Thông tin đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.', connectionUnstable: 'Kết nối máy chủ tạm thời không ổn định. Trạng thái đăng nhập được giữ và sẽ tự kết nối lại.', monthlyAttendance: 'Chấm công tháng này', yearMonth: 'Tháng {month}/{year}', weekdays: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'], dateAttendanceAria: 'Xem chấm công ngày {day}/{month}', checkInShort: 'VÀO', checkOutShort: 'RA', dayAttendance: 'Chấm công ngày {day}/{month}', checkIn: 'Vào ca', checkOut: 'Ra ca', unprocessed: 'Chưa ghi nhận', riskTitle: 'Thông báo rủi ro trọng điểm', itemCount: '{count}', noneRegistered: 'Không có', noRisk: 'Không có thông báo rủi ro trọng điểm.', common: 'Chung', assigned: 'Công trường', author: 'Người đăng', todayAttendance: 'Chấm công hôm nay', attendanceComplete: 'Đã hoàn tất chấm công hôm nay', processing: 'Đang xử lý', cameraPreparing: 'Đang chuẩn bị camera', scanAttendanceQr: 'Quét QR chấm công', recheckApproval: 'Kiểm tra lại trạng thái duyệt', installAsApp: 'Cài ứng dụng', cameraPermissionNeeded: 'Cần quyền camera', cameraBlocked: 'Quyền camera đang bị chặn. Ứng dụng không thể tự mở lại cửa sổ quyền hệ thống.', androidCameraSettings: 'Trên Android Chrome, vào Cài đặt Chrome → Cài đặt trang web → Camera, tìm hệ thống chấm công Wooklim và chọn Cho phép.', androidAppPermission: 'Nếu Android cũng chặn camera của Chrome, vào Cài đặt điện thoại → Ứng dụng → Chrome → Quyền → Camera và cho phép.', rearCameraNeeded: 'Cần quyền camera sau để quét QR chấm công.', cameraPromptGuide: 'Nhấn Cho phép camera bên dưới rồi chọn Cho phép trong cửa sổ quyền của Chrome/Safari.', cancel: 'Hủy', checkingPermission: 'Đang kiểm tra quyền', recheckCameraPermission: 'Kiểm tra lại quyền camera', allowCamera: 'Cho phép camera', dynamicQrScan: 'Quét QR động', qrFrameGuide: 'Đặt mã QR vào trong khung. Hệ thống sẽ xử lý ngay khi nhận diện.', preparingRearCamera: 'Đang chuẩn bị camera sau.', iosInstallGuide: 'Trên iPhone, nhấn Chia sẻ ở dưới Safari rồi chọn Thêm vào Màn hình chính.', androidInstallGuide: 'Trên Android, chọn Cài đặt ứng dụng trong menu Chrome. Không khuyến nghị dùng Thêm vào Màn hình chính.', legacyInstallGuide: 'Nếu trước đây đã cài bằng lối tắt màn hình chính, Chrome có thể hiển thị thông báo “Sao chép URL của ứng dụng này”. Hãy xóa biểu tượng cũ và cài lại bằng Cài đặt ứng dụng của Chrome.', cameraHttpsError: 'Camera chỉ hoạt động qua kết nối HTTPS an toàn. Vui lòng mở lại địa chỉ chính thức.', cameraDeniedError: 'Quyền camera bị chặn. Hãy cho phép trong trình duyệt hoặc cài đặt điện thoại rồi thử lại.', cameraNotFoundError: 'Không tìm thấy camera có thể sử dụng. Vui lòng kiểm tra camera điện thoại.', cameraBusyError: 'Ứng dụng khác có thể đang dùng camera. Hãy đóng ứng dụng camera khác rồi thử lại.', cameraConstraintError: 'Không thể áp dụng cài đặt camera điện thoại. Vui lòng quét lại.', cameraTimeoutError: 'Đã có quyền camera nhưng video không chạy. Hãy đóng hoàn toàn trình duyệt, mở lại và thử lại.', cameraStartError: 'Không thể khởi động camera. Hãy cho phép camera trong trình duyệt rồi thử lại.', qrCheckFailed: 'Xác minh QR thất bại.', attendanceFailed: 'Xử lý chấm công thất bại.', attendanceSuccess: 'Đã hoàn tất {type}. {time}', adminTitle: 'Chế độ quản trị', adminSubtitle: 'Xác thực bằng tài khoản quản trị đã đăng ký trong hệ thống quản lý.', adminInfo: 'Chỉ chạy QR chấm công để hiển thị cho công nhân. Phiên đăng nhập quản trị trong thẻ này sẽ tự kết thúc sau khi cấp phiên hiển thị QR.', adminEmail: 'ID hệ thống quản lý (email)', adminProject: 'Công trường hiển thị QR', adminAuthenticating: 'Đang xác thực quản trị', startAttendanceQr: 'Chạy QR chấm công', backToWorkerLogin: 'Quay lại đăng nhập công nhân', adminMissingCredentials: 'Vui lòng nhập ID và mật khẩu hệ thống quản lý.', adminSelectProject: 'Vui lòng chọn công trường hiển thị QR.', adminInvalidCredentials: 'Vui lòng kiểm tra ID hoặc mật khẩu hệ thống quản lý.', adminInactiveAccount: 'Vui lòng kiểm tra tài khoản hệ thống quản lý có đang hoạt động.', adminNoPermission: 'Vui lòng kiểm tra quyền hiển thị QR của công trường này.', adminSessionFailed: 'Không thể cấp phiên hiển thị QR.', adminQrIssueFailed: 'Không thể cấp QR chấm công.', adminQrImageFailed: 'Không thể tạo hình ảnh QR.', adminQrTitle: 'QR chấm công quản trị', exitAdmin: 'Thoát chế độ quản trị', adminQrGuide: 'Công nhân quét QR bên dưới bằng điện thoại để vào hoặc ra ca.', adminQrAlt: 'QR chấm công trên điện thoại quản trị', qrRefresh: 'Tự đổi sau {seconds} giây · Hiệu lực máy chủ 7 giây', currentTime: 'Giờ hiện tại', recentlyIssued: 'Cấp gần nhất {time}', qrSessionExpires: 'Phiên hiển thị QR hết hạn {time}',
  },
  ru: {
    ...ko,
    appTitle: 'Система учёта Wooklim', notice: 'Объявление', noticeAria: 'Объявления {content}', loginTitle: 'Вход', phone: 'Номер телефона', password: 'Пароль', login: 'Войти', signupPrompt: 'Впервые здесь? Регистрация', adminMode: 'Режим администратора', signupTitle: 'Регистрация работника', signupSubtitle: 'Отдельная учётная запись ERP не требуется.', workSite: 'Объект', koreanName: 'Имя на корейском', foreignWorker: 'Я иностранный работник', englishName: 'Имя на английском', englishNameHelp: 'Имя на английском как в паспорте или карте резидента', testAccount: 'Это тестовая учётная запись', testPasswordToast: 'Пароль тестовой учётной записи автоматически установлен на 1.', testPasswordInfo: 'Пароль тестовой учётной записи — 1. После одобрения войдите по номеру телефона с паролем 1.', trade: 'Профессия / вид работ', tradePlaceholder: 'Например: каркас, листы, молдинг', passwordHelp: 'Не менее 8 символов, включая буквы и цифры', passwordConfirm: 'Подтвердите пароль', privacyAgreement: '[Обязательно] Я согласен на сбор имени, телефона, профессии и данных зарегистрированного устройства для одобрения и учёта. Геолокация не собирается.', signup: 'Зарегистрироваться', installAttendanceApp: 'Установить приложение учёта', selectProject: 'Выберите рабочий объект.', invalidKoreanName: 'Введите имя на корейском из 2–10 символов.', invalidEnglishName: 'Иностранному работнику необходимо ввести имя на английском.', invalidPhone: 'Введите правильный номер телефона.', invalidTrade: 'Введите профессию или вид работ.', invalidPassword: 'Пароль должен содержать не менее 8 символов, включая буквы и цифры.', passwordMismatch: 'Подтверждение пароля не совпадает.', privacyRequired: 'Примите обязательное согласие на сбор персональных данных.', signupFailed: 'Не удалось зарегистрироваться.', testSignupSuccess: 'Тестовая учётная запись зарегистрирована. Пароль для входа — 1.', signupSuccess: 'Регистрация завершена. Ожидайте одобрения ответственного на объекте.', loginRequiredFields: 'Введите номер телефона и пароль.', loginFailed: 'Не удалось войти.', deviceChangeRequested: 'Запрошено одобрение смены устройства.', checkingAccount: 'Проверка учётной записи.', logout: 'Выйти', pending: 'Ожидает одобрения', pendingDescription: 'Ответственный проверяет регистрацию и телефон.', active: 'Доступно', activeDescription: 'Можно сканировать QR для входа/выхода.', rejected: 'Отклонено', rejectedDescription: 'Обратитесь к ответственному для проверки регистрации.', disabled: 'Отключено', disabledDescription: 'Обратитесь к ответственному для проверки статуса учётной записи.', sessionInvalid: 'Данные входа недействительны. Войдите снова.', connectionUnstable: 'Соединение с сервером временно нестабильно. Вход сохранён, подключение восстановится автоматически.', monthlyAttendance: 'Учёт за месяц', yearMonth: '{month}.{year}', weekdays: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'], dateAttendanceAria: 'Показать учёт за {day}.{month}', checkInShort: 'ВХ', checkOutShort: 'ВЫХ', dayAttendance: 'Учёт за {day}.{month}', checkIn: 'Приход', checkOut: 'Уход', unprocessed: 'Нет записи', riskTitle: 'Важные факторы риска', itemCount: '{count}', noneRegistered: 'Нет', noRisk: 'Нет важных сообщений о рисках.', common: 'Общее', assigned: 'Объект', author: 'Автор', todayAttendance: 'Учёт сегодня', attendanceComplete: 'Учёт за сегодня завершён', processing: 'Обработка', cameraPreparing: 'Подготовка камеры', scanAttendanceQr: 'Сканировать QR учёта', recheckApproval: 'Проверить одобрение снова', installAsApp: 'Установить приложение', cameraPermissionNeeded: 'Требуется доступ к камере', cameraBlocked: 'Доступ к камере заблокирован. Приложение не может повторно открыть системный запрос разрешения.', androidCameraSettings: 'В Android Chrome откройте Настройки Chrome → Настройки сайтов → Камера, найдите систему учёта Wooklim и выберите Разрешить.', androidAppPermission: 'Если Android также блокирует камеру Chrome, откройте Настройки телефона → Приложения → Chrome → Разрешения → Камера и разрешите доступ.', rearCameraNeeded: 'Для сканирования QR требуется доступ к задней камере.', cameraPromptGuide: 'Нажмите «Разрешить камеру» ниже и выберите «Разрешить» в окне Chrome/Safari.', cancel: 'Отмена', checkingPermission: 'Проверка разрешения', recheckCameraPermission: 'Проверить доступ к камере снова', allowCamera: 'Разрешить камеру', dynamicQrScan: 'Сканирование динамического QR', qrFrameGuide: 'Поместите QR в квадрат. После распознавания он будет обработан сразу.', preparingRearCamera: 'Подготовка задней камеры.', iosInstallGuide: 'На iPhone нажмите «Поделиться» в Safari и выберите «На экран Домой».', androidInstallGuide: 'На Android выберите «Установить приложение» в меню Chrome. Добавление ярлыка на главный экран не рекомендуется.', legacyInstallGuide: 'Если ранее был установлен ярлык, Chrome может показать уведомление «Скопировать URL приложения». Удалите старый значок и установите приложение через меню Chrome.', cameraHttpsError: 'Камера работает только через защищённое соединение HTTPS. Снова откройте рабочий адрес.', cameraDeniedError: 'Доступ к камере заблокирован. Разрешите его в браузере или настройках телефона и повторите попытку.', cameraNotFoundError: 'Доступная камера не найдена. Проверьте камеру телефона.', cameraBusyError: 'Камера может использоваться другим приложением. Закройте другие приложения камеры и повторите попытку.', cameraConstraintError: 'Не удалось применить настройки камеры. Повторите сканирование.', cameraTimeoutError: 'Доступ к камере получен, но видео не запустилось. Полностью закройте браузер, откройте снова и повторите попытку.', cameraStartError: 'Не удалось запустить камеру. Разрешите доступ в браузере и повторите попытку.', qrCheckFailed: 'Не удалось проверить QR.', attendanceFailed: 'Не удалось обработать учёт.', attendanceSuccess: '{type} отмечен. {time}', adminTitle: 'Режим администратора', adminSubtitle: 'Войдите с зарегистрированной учётной записью администратора системы управления.', adminInfo: 'Запускается только QR учёта для работников. После выдачи сеанса QR вход администратора в этой вкладке автоматически завершается.', adminEmail: 'ID системы управления (email)', adminProject: 'Объект для QR', adminAuthenticating: 'Проверка администратора', startAttendanceQr: 'Запустить QR учёта', backToWorkerLogin: 'Вернуться ко входу работника', adminMissingCredentials: 'Введите ID и пароль системы управления.', adminSelectProject: 'Выберите объект для показа QR.', adminInvalidCredentials: 'Проверьте ID или пароль системы управления.', adminInactiveAccount: 'Убедитесь, что учётная запись системы управления активна.', adminNoPermission: 'Проверьте право показа QR для этого объекта.', adminSessionFailed: 'Не удалось создать сеанс показа QR.', adminQrIssueFailed: 'Не удалось создать QR учёта.', adminQrImageFailed: 'Не удалось создать изображение QR.', adminQrTitle: 'QR учёта администратора', exitAdmin: 'Выйти из режима администратора', adminQrGuide: 'Работники сканируют QR ниже своими телефонами для отметки прихода или ухода.', adminQrAlt: 'QR учёта на телефоне администратора', qrRefresh: 'Автосмена через {seconds} с · Срок сервера 7 с', currentTime: 'Текущее время', recentlyIssued: 'Последняя выдача {time}', qrSessionExpires: 'Сеанс показа QR истекает {time}',
  },
  mn: {
    ...ko,
    appTitle: 'Wooklim ирцийн систем', notice: 'Мэдэгдэл', noticeAria: 'Мэдэгдэл {content}', loginTitle: 'Нэвтрэх', phone: 'Гар утасны дугаар', password: 'Нууц үг', login: 'Нэвтрэх', signupPrompt: 'Анх удаа ашиглаж байна уу? Бүртгүүлэх', adminMode: 'Админ горим', signupTitle: 'Ажилтны бүртгэл', signupSubtitle: 'Тусдаа компанийн ERP бүртгэл шаардлагагүй.', workSite: 'Ажлын талбай', koreanName: 'Солонгос нэр', foreignWorker: 'Би гадаад ажилтан', englishName: 'Англи нэр', englishNameHelp: 'Паспорт эсвэл оршин суух үнэмлэх дээрх англи нэр', testAccount: 'Энэ бол туршилтын бүртгэл', testPasswordToast: 'Туршилтын бүртгэлийн нууц үг автоматаар 1 болно.', testPasswordInfo: 'Туршилтын бүртгэлийн нууц үг 1. Зөвшөөрсний дараа утасны дугаар болон 1 нууц үгээр нэвтэрнэ үү.', trade: 'Мэргэжил / ажлын төрөл', tradePlaceholder: 'Жишээ: каркас, хавтан, хүрээ', passwordHelp: 'Үсэг, тоо орсон 8-аас доошгүй тэмдэгт', passwordConfirm: 'Нууц үг батлах', privacyAgreement: '[Заавал] Бүртгэл батлах болон ирц бүртгэх зорилгоор нэр, утас, мэргэжил, бүртгэлтэй төхөөрөмжийн мэдээлэл цуглуулахыг зөвшөөрч байна. Байршлын мэдээлэл цуглуулахгүй.', signup: 'Бүртгүүлэх', installAttendanceApp: 'Ирцийн апп суулгах', selectProject: 'Ажлын талбайгаа сонгоно уу.', invalidKoreanName: 'Солонгос нэрийг 2–10 солонгос тэмдэгтээр оруулна уу.', invalidEnglishName: 'Гадаад ажилтан англи нэрээ оруулна уу.', invalidPhone: 'Зөв гар утасны дугаар оруулна уу.', invalidTrade: 'Мэргэжил эсвэл ажлын төрлөө оруулна уу.', invalidPassword: 'Нууц үг үсэг, тоо орсон 8-аас доошгүй тэмдэгттэй байна.', passwordMismatch: 'Нууц үг баталгаажуулалт таарахгүй байна.', privacyRequired: 'Хувийн мэдээлэл цуглуулах заавал зөвшөөрлийг өгнө үү.', signupFailed: 'Бүртгэл амжилтгүй боллоо.', testSignupSuccess: 'Туршилтын бүртгэл амжилттай. Нэвтрэх нууц үг 1.', signupSuccess: 'Бүртгэл амжилттай. Талбайн хариуцагчийн зөвшөөрлийг хүлээнэ үү.', loginRequiredFields: 'Утасны дугаар болон нууц үгээ оруулна уу.', loginFailed: 'Нэвтрэх амжилтгүй.', deviceChangeRequested: 'Төхөөрөмж солих зөвшөөрөл хүссэн.', checkingAccount: 'Ирцийн бүртгэлийг шалгаж байна.', logout: 'Гарах', pending: 'Зөвшөөрөл хүлээж байна', pendingDescription: 'Талбайн хариуцагч бүртгэл болон утсыг шалгаж байна.', active: 'Ашиглах боломжтой', activeDescription: 'Ирэх/явах QR кодыг уншуулж болно.', rejected: 'Татгалзсан', rejectedDescription: 'Талбайн хариуцагчаас бүртгэлээ шалгуулна уу.', disabled: 'Идэвхгүй', disabledDescription: 'Талбайн хариуцагчаас бүртгэлийн төлөвөө шалгуулна уу.', sessionInvalid: 'Нэвтрэх мэдээлэл хүчингүй. Дахин нэвтэрнэ үү.', connectionUnstable: 'Серверийн холболт түр тогтворгүй байна. Нэвтрэлт хадгалагдаж автоматаар дахин холбогдоно.', monthlyAttendance: 'Энэ сарын ирц', yearMonth: '{year} оны {month} сар', weekdays: ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'], dateAttendanceAria: '{month}/{day}-ны ирцийг харах', checkInShort: 'ИР', checkOutShort: 'ЯВ', dayAttendance: '{month}/{day}-ны ирц', checkIn: 'Ирсэн', checkOut: 'Явсан', unprocessed: 'Бүртгэгдээгүй', riskTitle: 'Чухал эрсдэлийн мэдэгдэл', itemCount: '{count}', noneRegistered: 'Байхгүй', noRisk: 'Чухал эрсдэлийн мэдэгдэл алга.', common: 'Нийт', assigned: 'Талбай', author: 'Нийтэлсэн', todayAttendance: 'Өнөөдрийн ирц', attendanceComplete: 'Өнөөдрийн ирц бүрэн', processing: 'Боловсруулж байна', cameraPreparing: 'Камер бэлтгэж байна', scanAttendanceQr: 'Ирцийн QR уншуулах', recheckApproval: 'Зөвшөөрлийг дахин шалгах', installAsApp: 'Апп суулгах', cameraPermissionNeeded: 'Камерын зөвшөөрөл шаардлагатай', cameraBlocked: 'Камерын зөвшөөрөл хаалттай байна. Апп системийн зөвшөөрлийн цонхыг хүчээр дахин нээх боломжгүй.', androidCameraSettings: 'Android Chrome-д Chrome тохиргоо → Сайтын тохиргоо → Камер руу орж Wooklim ирцийн сайтыг сонгоод Зөвшөөрөх болгоно уу.', androidAppPermission: 'Android систем Chrome-ийн камерыг хаасан бол Утасны тохиргоо → Апп → Chrome → Зөвшөөрөл → Камер хэсэгт мөн зөвшөөрнө үү.', rearCameraNeeded: 'Ирцийн QR уншуулахад арын камерын зөвшөөрөл шаардлагатай.', cameraPromptGuide: 'Доорх Камер зөвшөөрөх товчийг дараад Chrome/Safari-ийн зөвшөөрлийн цонхонд Зөвшөөрөхийг сонгоно уу.', cancel: 'Цуцлах', checkingPermission: 'Зөвшөөрөл шалгаж байна', recheckCameraPermission: 'Камерын зөвшөөрлийг дахин шалгах', allowCamera: 'Камер зөвшөөрөх', dynamicQrScan: 'Динамик QR уншуулах', qrFrameGuide: 'QR кодыг дөрвөлжин дотор тааруулна уу. Танигдмагц боловсруулна.', preparingRearCamera: 'Арын камерыг бэлтгэж байна.', iosInstallGuide: 'iPhone дээр Safari-ийн доод хэсгийн Хуваалцах товчийг дараад Үндсэн дэлгэцэд нэмэхийг сонгоно уу.', androidInstallGuide: 'Android дээр Chrome цэсээс Апп суулгахыг сонгоно уу. Үндсэн дэлгэцэд нэмэх аргыг зөвлөхгүй.', legacyInstallGuide: 'Өмнө нь үндсэн дэлгэцийн товчлолоор суулгасан бол Chrome “Энэ аппын URL-г хуулах” мэдэгдэл харуулж болно. Хуучин дүрсийг устгаад Chrome-ийн Апп суулгах аргаар дахин суулгана уу.', cameraHttpsError: 'Камер зөвхөн HTTPS хамгаалалттай холболтоор ажиллана. Үйлчилгээний хаягийг дахин нээнэ үү.', cameraDeniedError: 'Камерын зөвшөөрөл хаалттай. Хөтөч эсвэл утасны тохиргоонд зөвшөөрөөд дахин оролдоно уу.', cameraNotFoundError: 'Ашиглах камер олдсонгүй. Утасны камераа шалгана уу.', cameraBusyError: 'Өөр апп камер ашиглаж байж магадгүй. Камер ашиглаж буй бусад аппыг хаагаад дахин оролдоно уу.', cameraConstraintError: 'Утасны камерын тохиргоог ашиглаж чадсангүй. Дахин уншуулна уу.', cameraTimeoutError: 'Камерын зөвшөөрөл өгсөн боловч видео эхэлсэнгүй. Хөтчийг бүрэн хааж дахин нээгээд оролдоно уу.', cameraStartError: 'Камер эхлүүлж чадсангүй. Хөтөчид камер зөвшөөрөөд дахин оролдоно уу.', qrCheckFailed: 'QR шалгалт амжилтгүй.', attendanceFailed: 'Ирц боловсруулах амжилтгүй.', attendanceSuccess: '{type} бүртгэл амжилттай. {time}', adminTitle: 'Админ горим', adminSubtitle: 'Удирдлагын системд бүртгэлтэй админ бүртгэлээр баталгаажуулна.', adminInfo: 'Ажилтанд харуулах ирцийн QR-г л ажиллуулна. QR харуулах сесс олгосны дараа энэ табын админ нэвтрэлт автоматаар дуусна.', adminEmail: 'Удирдлагын системийн ID (имэйл)', adminProject: 'QR харуулах талбай', adminAuthenticating: 'Админыг баталгаажуулж байна', startAttendanceQr: 'Ирцийн QR ажиллуулах', backToWorkerLogin: 'Ажилтны нэвтрэх рүү буцах', adminMissingCredentials: 'Удирдлагын системийн ID болон нууц үгээ оруулна уу.', adminSelectProject: 'QR харуулах талбайг сонгоно уу.', adminInvalidCredentials: 'Удирдлагын системийн ID эсвэл нууц үгээ шалгана уу.', adminInactiveAccount: 'Удирдлагын системийн бүртгэл идэвхтэй эсэхийг шалгана уу.', adminNoPermission: 'Энэ талбайн QR харуулах эрхийг шалгана уу.', adminSessionFailed: 'QR харуулах сесс олгож чадсангүй.', adminQrIssueFailed: 'Ирцийн QR олгож чадсангүй.', adminQrImageFailed: 'QR зураг үүсгэж чадсангүй.', adminQrTitle: 'Админы ирцийн QR', exitAdmin: 'Админ горимоос гарах', adminQrGuide: 'Ажилтан утсаараа доорх QR-г уншуулж ирэх эсвэл явах бүртгэл хийнэ.', adminQrAlt: 'Админ утасны ирцийн QR', qrRefresh: '{seconds} секундын дараа автоматаар солигдоно · Серверт 7 секунд хүчинтэй', currentTime: 'Одоогийн цаг', recentlyIssued: 'Сүүлд олгосон {time}', qrSessionExpires: 'QR харуулах сесс дуусах {time}',
  },
};

const supportedCodes = new Set(
  ATTENDANCE_LANGUAGES.map((item) => item.code),
);

export const normalizeAttendanceLanguage = (value) =>
  supportedCodes.has(String(value || ''))
    ? String(value)
    : 'ko';

export const readAttendanceLanguage = () => {
  try {
    return normalizeAttendanceLanguage(
      window.localStorage.getItem(
        ATTENDANCE_LANGUAGE_STORAGE_KEY,
      ),
    );
  } catch {
    return 'ko';
  }
};

export const saveAttendanceLanguage = (language) => {
  const normalized = normalizeAttendanceLanguage(language);
  try {
    window.localStorage.setItem(
      ATTENDANCE_LANGUAGE_STORAGE_KEY,
      normalized,
    );
  } catch {
    // 저장소를 사용할 수 없는 환경에서는 현재 실행 중 상태만 유지합니다.
  }
  return normalized;
};

export const getAttendanceLocale = (language) =>
  ATTENDANCE_LANGUAGES.find(
    (item) => item.code === normalizeAttendanceLanguage(language),
  )?.locale || 'ko-KR';

export const createAttendanceTranslator = (language) => {
  const normalized = normalizeAttendanceLanguage(language);
  const dictionary = dictionaries[normalized] || ko;

  return (key, variables = {}) => {
    const raw = dictionary[key] ?? ko[key] ?? key;
    if (Array.isArray(raw)) return raw;

    return String(raw).replace(
      /\{([a-zA-Z0-9_]+)\}/g,
      (_match, variableName) =>
        String(variables[variableName] ?? ''),
    );
  };
};
