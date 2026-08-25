const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.4';
const ROOT = process.cwd();
const PORTAL_FILE = path.resolve(ROOT, 'src/page/AttendanceWorkerPortal.jsx');
const SQL_FILE = path.resolve(ROOT, 'supabase/v52.48.5.44.4_project_registry_linkage.sql');
const VERSION_MARKER = '// v52.48.5.44.4 현장마스터 회원가입·근태회원가입 연동';

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function replaceOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first === -1) {
    fail(`적용 기준을 찾지 못했습니다: ${label}`);
  }

  const second = source.indexOf(anchor, first + anchor.length);
  if (second !== -1) {
    fail(`적용 기준이 2개 이상 발견되었습니다: ${label}`);
  }

  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

function backupFile(filePath, backupRoot) {
  if (!fs.existsSync(filePath)) return;

  const relative = path.relative(ROOT, filePath);
  const target = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(filePath, target);
}

if (!fs.existsSync(PORTAL_FILE)) {
  fail(`파일을 찾을 수 없습니다: ${PORTAL_FILE}`);
}

let source = fs.readFileSync(PORTAL_FILE, 'utf8');

if (source.includes(VERSION_MARKER)) {
  console.log(`[${VERSION}] AttendanceWorkerPortal은 이미 적용되어 있습니다.`);
} else {
  const requiredAnchors = [
    'ATTENDANCE_PROJECTS,',
    'return ATTENDANCE_PROJECTS.includes(requested) ? requested : \'\';',
    'if (!ATTENDANCE_PROJECTS.includes(signup.projectName)) {',
    '{ATTENDANCE_PROJECTS.map((project) => <MenuItem key={project} value={project}>{project}</MenuItem>)}',
  ];

  requiredAnchors.forEach((anchor) => {
    if (!source.includes(anchor)) {
      fail(`현재 AttendanceWorkerPortal.jsx가 예상 기준과 다릅니다: ${anchor}`);
    }
  });

  const backupRoot = path.resolve(
    ROOT,
    `backup_v52.48.5.44.4_${new Date().toISOString().replace(/[:.]/g, '-')}`,
  );

  backupFile(PORTAL_FILE, backupRoot);

  source = `${VERSION_MARKER}\n${source}`;

  source = replaceOnce(
    source,
`  ATTENDANCE_PROJECTS,
  ATTENDANCE_SESSION_STORAGE_KEY,`,
`  ATTENDANCE_SESSION_STORAGE_KEY,`,
    '근태 하드코딩 현장목록 import 제거',
  );

  source = replaceOnce(
    source,
`const readInitialProject = () => {
  const requested = new URLSearchParams(window.location.search).get('project');
  return ATTENDANCE_PROJECTS.includes(requested) ? requested : '';
};`,
`const readInitialProject = () => {
  const requested = new URLSearchParams(window.location.search).get('project');
  return String(requested || '').trim();
};`,
    'QR/URL 초기 현장값',
  );

  source = replaceOnce(
    source,
`  const [login, setLogin] = useState(initialLogin);`,
`  const [projectOptions, setProjectOptions] = useState([]);
  const [projectOptionsLoading, setProjectOptionsLoading] = useState(true);
  const [projectOptionsError, setProjectOptionsError] = useState('');
  const [login, setLogin] = useState(initialLogin);`,
    '근태 현장목록 state',
  );

  source = replaceOnce(
    source,
`  const locale = getAttendanceLocale(language);`,
`  const locale = getAttendanceLocale(language);

  const loadProjectOptions = useCallback(async () => {
    setProjectOptionsLoading(true);
    setProjectOptionsError('');

    const { data, error } = await supabase.rpc(
      'list_registration_projects',
    );

    if (error) {
      console.error('근태 회원가입 현장목록 조회 오류:', error);
      setProjectOptions([]);
      setProjectOptionsError(
        '현장목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
      setProjectOptionsLoading(false);
      return;
    }

    const nextOptions = [...new Set(
      (Array.isArray(data) ? data : [])
        .map((row) => String(row?.project_name || row || '').trim())
        .filter(
          (projectName) =>
            projectName &&
            projectName !== '본사' &&
            projectName !== '전체현장',
        ),
    )].sort((first, second) =>
      first.localeCompare(second, 'ko', { numeric: true }),
    );

    setProjectOptions(nextOptions);
    setProjectOptionsLoading(false);

    setSignup((previous) => {
      const currentProject = String(previous.projectName || '').trim();

      if (!currentProject || nextOptions.includes(currentProject)) {
        return previous;
      }

      return {
        ...previous,
        projectName: '',
      };
    });
  }, []);

  useEffect(() => {
    loadProjectOptions();

    const handleFocus = () => {
      loadProjectOptions();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('project-registry-changed', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('project-registry-changed', handleFocus);
    };
  }, [loadProjectOptions]);`,
    '근태 동적 현장목록 로드',
  );

  source = replaceOnce(
    source,
`    if (!ATTENDANCE_PROJECTS.includes(signup.projectName)) {`,
`    if (!projectOptions.includes(signup.projectName)) {`,
    '근태 회원가입 현장 검증',
  );

  source = replaceOnce(
    source,
`            <FormControl fullWidth>
              <InputLabel>{t('workSite')}</InputLabel>
              <Select label={t('workSite')} value={signup.projectName} onChange={(event) => setSignup((prev) => ({ ...prev, projectName: event.target.value }))}>
                {ATTENDANCE_PROJECTS.map((project) => <MenuItem key={project} value={project}>{project}</MenuItem>)}
              </Select>
            </FormControl>`,
`            <FormControl fullWidth error={Boolean(projectOptionsError)}>
              <InputLabel>{t('workSite')}</InputLabel>
              <Select
                label={t('workSite')}
                value={signup.projectName}
                disabled={projectOptionsLoading}
                onChange={(event) => setSignup((prev) => ({
                  ...prev,
                  projectName: event.target.value,
                }))}
              >
                {projectOptionsLoading && (
                  <MenuItem disabled value="">
                    현장목록 불러오는 중...
                  </MenuItem>
                )}
                {!projectOptionsLoading && projectOptions.length === 0 && (
                  <MenuItem disabled value="">
                    선택 가능한 현장이 없습니다.
                  </MenuItem>
                )}
                {projectOptions.map((project) => (
                  <MenuItem key={project} value={project}>
                    {project}
                  </MenuItem>
                ))}
              </Select>
              {projectOptionsError && (
                <Typography
                  sx={{
                    mt: 0.45,
                    ml: 1.75,
                    color: '#d32f2f',
                    fontSize: appMode ? '0.86rem' : '0.65rem',
                    lineHeight: 1.35,
                  }}
                >
                  {projectOptionsError}
                </Typography>
              )}
            </FormControl>`,
    '근태 회원가입 현장 Select',
  );

  fs.writeFileSync(PORTAL_FILE, source, 'utf8');

  console.log(`[${VERSION}] AttendanceWorkerPortal 적용 완료`);
  console.log(`- 백업: ${path.relative(ROOT, backupRoot)}`);
}

const sql = `-- v52.48.5.44.4
-- 현장마스터(building_settings)를 회원가입/회원관리/근태 회원가입의 단일 현장목록으로 사용합니다.
--
-- 사용처
-- 1) 일반 계정 회원가입 Login.jsx
-- 2) 회원관리 UserManagement.jsx
-- 3) 근태 근로자 회원가입 AttendanceWorkerPortal.jsx
--
-- 새 현장을 현장관리에서 저장하면 building_settings에 등록되므로
-- 별도 코드/상수 수정 없이 위 3곳에 자동 반영됩니다.

create or replace function public.list_registration_projects()
returns table (
  project_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct btrim(bs.project_name)::text as project_name
    from public.building_settings bs
   where bs.project_name is not null
     and btrim(bs.project_name) <> ''
     and btrim(bs.project_name) not in ('본사', '전체현장')
   order by 1;
$$;

revoke all on function public.list_registration_projects() from public;
grant execute on function public.list_registration_projects() to anon;
grant execute on function public.list_registration_projects() to authenticated;

notify pgrst, 'reload schema';
`;

fs.mkdirSync(path.dirname(SQL_FILE), { recursive: true });
fs.writeFileSync(SQL_FILE, sql, 'utf8');

console.log(`[${VERSION}] SQL 생성 완료`);
console.log('- 생성: supabase/v52.48.5.44.4_project_registry_linkage.sql');
console.log('');
console.log('적용 효과');
console.log('- 일반 회원가입 현장선택: building_settings 자동 연동');
console.log('- 회원관리 현장배정: building_settings 자동 연동');
console.log('- 근태 근로자 회원가입: building_settings 자동 연동');
console.log('- QR URL로 새 현장을 열어도 동적 현장목록 확인 후 정상 선택');
