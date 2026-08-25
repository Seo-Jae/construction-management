const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'page', 'AttendanceManagement.jsx');
const EXPECTED_GIT_BLOB_SHA = '28f573c7c53e90613d379dc0d3ad601bd5566905';

function fail(message) {
  console.error('\n[v52.22 적용 중단]');
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

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

let source = fs.readFileSync(TARGET, 'utf8');

const alreadyApplied =
  source.includes('selectedNoticeIds') &&
  source.includes('attendance_manager_reorder_notices_v52_22') &&
  source.includes('attendance_manager_delete_notices_v52_22') &&
  source.includes('공지 위로 이동') &&
  source.includes('공지 아래로 이동') &&
  !source.includes('label="표시 순번"');

if (alreadyApplied) {
  console.log('[v52.22] 이미 프로그램 파일이 적용된 상태입니다.');
  process.exit(0);
}

const actualSha = gitBlobSha(source);
if (actualSha !== EXPECTED_GIT_BLOB_SHA) {
  fail(
    '현재 AttendanceManagement.jsx가 확인한 v52.21 운영본과 다릅니다.\n' +
    `예상 Git blob SHA: ${EXPECTED_GIT_BLOB_SHA}\n` +
    `현재 Git blob SHA: ${actualSha}\n` +
    '기존 기능 보호를 위해 자동 적용하지 않았습니다.'
  );
}

/* ---------------------------------------------------------
   1. 노임관리와 동일한 툴바 아이콘 import
   --------------------------------------------------------- */

source = replaceOnce(
  source,
`import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';`,
`import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';`,
  '공지 순서 툴바 아이콘 import',
);

source = replaceOnce(
  source,
`import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';`,
`import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';`,
  '공지 삭제 아이콘 import',
);

/* ---------------------------------------------------------
   2. 선택/삭제 상태
   --------------------------------------------------------- */

source = replaceOnce(
  source,
`  const [notices, setNotices] = useState([]);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [noticeEditorOpen, setNoticeEditorOpen] = useState(false);`,
`  const [notices, setNotices] = useState([]);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [selectedNoticeIds, setSelectedNoticeIds] = useState(() => new Set());
  const [noticeDeleteOpen, setNoticeDeleteOpen] = useState(false);
  const [noticeEditorOpen, setNoticeEditorOpen] = useState(false);`,
  '공지 선택 상태 추가',
);

source = replaceOnce(
  source,
`    setNotices(Array.isArray(data) ? data : []);
    if (!silent) setNoticesLoading(false);`,
`    const nextNotices = Array.isArray(data) ? data : [];
    setNotices(nextNotices);
    setSelectedNoticeIds((previous) => {
      const validIds = new Set(nextNotices.map((notice) => notice.id));
      return new Set(
        [...previous].filter((noticeId) => validIds.has(noticeId)),
      );
    });
    if (!silent) setNoticesLoading(false);`,
  '공지 새로고침 시 선택상태 정리',
);

source = replaceOnce(
  source,
`  useEffect(() => {
    if (tab !== 'notices') return undefined;
    const timer = window.setTimeout(() => loadNotices(), 0);
    return () => window.clearTimeout(timer);
  }, [loadNotices, tab]);`,
`  useEffect(() => {
    if (tab !== 'notices') return undefined;
    const timer = window.setTimeout(() => loadNotices(), 0);
    return () => window.clearTimeout(timer);
  }, [loadNotices, tab]);

  useEffect(() => {
    setSelectedNoticeIds(new Set());
    setNoticeDeleteOpen(false);
  }, [projectName]);`,
  '현장 변경 시 공지 선택 초기화',
);

/* ---------------------------------------------------------
   3. 순번 입력방식 제거 / 신규는 자동 마지막
   --------------------------------------------------------- */

source = replaceOnce(
  source,
`    const sortOrder = Math.trunc(Number(noticeDraft.sortOrder));
    if (!Number.isFinite(sortOrder) || sortOrder < 1) {
      setMessage({ severity: 'warning', text: '표시 순번은 1 이상의 숫자로 입력해주세요.' });
      return;
    }

    if (!noticeDraft.startsOn || !noticeDraft.endsOn) {`,
`    const sortOrder = noticeDraft.id
      ? Math.max(1, Math.trunc(Number(noticeDraft.sortOrder)) || 1)
      : notices.length + 1;

    if (!noticeDraft.startsOn || !noticeDraft.endsOn) {`,
  '공지 순번 수동입력 검증 제거',
);

/* ---------------------------------------------------------
   4. 선택/순서변경/삭제 함수
   --------------------------------------------------------- */

source = replaceOnce(
  source,
`  const toggleNoticeActive = async (notice) => {`,
`  const noticeIds = notices
    .map((notice) => notice?.id)
    .filter(Boolean);
  const allNoticesSelected =
    noticeIds.length > 0 &&
    noticeIds.every((noticeId) =>
      selectedNoticeIds.has(noticeId),
    );
  const someNoticesSelected =
    selectedNoticeIds.size > 0 &&
    !allNoticesSelected;

  const toggleNoticeSelection = (noticeId) => {
    if (!noticeId) return;
    setSelectedNoticeIds((previous) => {
      const next = new Set(previous);
      if (next.has(noticeId)) next.delete(noticeId);
      else next.add(noticeId);
      return next;
    });
  };

  const toggleAllNotices = () => {
    setSelectedNoticeIds(
      allNoticesSelected
        ? new Set()
        : new Set(noticeIds),
    );
  };

  const handleMoveNotices = async (direction) => {
    if (
      !canManage ||
      noticeSaving ||
      noticesLoading ||
      selectedNoticeIds.size === 0
    ) {
      return;
    }

    const nextOrder = [...noticeIds];
    let changed = false;

    if (direction === 'up') {
      for (let index = 1; index < nextOrder.length; index += 1) {
        const currentSelected = selectedNoticeIds.has(
          nextOrder[index],
        );
        const previousSelected = selectedNoticeIds.has(
          nextOrder[index - 1],
        );

        if (currentSelected && !previousSelected) {
          [nextOrder[index - 1], nextOrder[index]] = [
            nextOrder[index],
            nextOrder[index - 1],
          ];
          changed = true;
        }
      }
    } else {
      for (
        let index = nextOrder.length - 2;
        index >= 0;
        index -= 1
      ) {
        const currentSelected = selectedNoticeIds.has(
          nextOrder[index],
        );
        const nextSelected = selectedNoticeIds.has(
          nextOrder[index + 1],
        );

        if (currentSelected && !nextSelected) {
          [nextOrder[index], nextOrder[index + 1]] = [
            nextOrder[index + 1],
            nextOrder[index],
          ];
          changed = true;
        }
      }
    }

    if (!changed) return;

    setNoticeSaving(true);
    const { error } = await supabase.rpc(
      'attendance_manager_reorder_notices_v52_22',
      {
        p_project_name: projectName,
        p_notice_ids: nextOrder,
      },
    );
    setNoticeSaving(false);

    if (error) {
      setMessage({
        severity: 'error',
        text:
          error.message ||
          '공지 순서를 변경하지 못했습니다.',
      });
      return;
    }

    setMessage({
      severity: 'success',
      text:
        direction === 'up'
          ? '선택 공지를 위로 이동했습니다.'
          : '선택 공지를 아래로 이동했습니다.',
    });
    await loadNotices(true);
  };

  const openDeleteSelectedNotices = () => {
    if (
      !canManage ||
      selectedNoticeIds.size === 0
    ) {
      return;
    }
    setNoticeDeleteOpen(true);
  };

  const handleDeleteSelectedNotices = async () => {
    if (
      !canManage ||
      noticeSaving ||
      selectedNoticeIds.size === 0
    ) {
      return;
    }

    setNoticeSaving(true);
    const { data, error } = await supabase.rpc(
      'attendance_manager_delete_notices_v52_22',
      {
        p_project_name: projectName,
        p_notice_ids: [...selectedNoticeIds],
      },
    );
    setNoticeSaving(false);

    if (error) {
      setMessage({
        severity: 'error',
        text:
          error.message ||
          '선택 공지를 삭제하지 못했습니다.',
      });
      return;
    }

    const deletedCount =
      Number(data?.deleted_count) ||
      selectedNoticeIds.size;

    setNoticeDeleteOpen(false);
    setSelectedNoticeIds(new Set());
    setMessage({
      severity: 'success',
      text: \`\${deletedCount}개 공지사항을 삭제했습니다.\`,
    });
    await loadNotices(true);
  };

  const toggleNoticeActive = async (notice) => {`,
  '공지 선택/이동/삭제 함수 추가',
);

/* ---------------------------------------------------------
   5. 공지 상단의 기존 텍스트 등록버튼 제거
   --------------------------------------------------------- */

source = replaceOnce(
  source,
`              <Stack direction="row" spacing={0.7}>
                <IconButton onClick={() => loadNotices()} aria-label="공지사항 새로고침">
                  <RefreshRoundedIcon />
                </IconButton>
                <Button variant="contained" disabled={!canManage} onClick={openNewNotice} sx={{ bgcolor: '#0f6fae', fontWeight: 900 }}>
                  공지 등록
                </Button>
              </Stack>`,
`              <IconButton
                onClick={() => loadNotices()}
                aria-label="공지사항 새로고침"
              >
                <RefreshRoundedIcon />
              </IconButton>`,
  '기존 공지 등록 버튼 제거',
);

/* ---------------------------------------------------------
   6. 노임관리형 + / - / ↑ / ↓ 툴바 추가
   --------------------------------------------------------- */

source = replaceOnce(
  source,
`            <Divider />
            {!canManage && (`,
`            <Divider />

            <Paper
              variant="outlined"
              sx={{
                m: 1.5,
                mb: 0,
                px: 1,
                py: 0.55,
                display: 'flex',
                alignItems: 'center',
                gap: 0.25,
                borderColor: '#cbd5e1',
                bgcolor: '#ffffff',
              }}
            >
              <Tooltip title="공지 등록" arrow>
                <span>
                  <IconButton
                    size="small"
                    aria-label="공지 등록"
                    onClick={openNewNotice}
                    disabled={!canManage || noticeSaving}
                  >
                    <AddCircleOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title="선택 공지 삭제" arrow>
                <span>
                  <IconButton
                    size="small"
                    aria-label="선택 공지 삭제"
                    onClick={openDeleteSelectedNotices}
                    disabled={
                      !canManage ||
                      noticeSaving ||
                      selectedNoticeIds.size === 0
                    }
                  >
                    <RemoveCircleOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>

              <Divider
                orientation="vertical"
                flexItem
                sx={{ mx: 0.35 }}
              />

              <Tooltip title="공지 위로 이동" arrow>
                <span>
                  <IconButton
                    size="small"
                    aria-label="공지 위로 이동"
                    onClick={() => handleMoveNotices('up')}
                    disabled={
                      !canManage ||
                      noticeSaving ||
                      noticesLoading ||
                      selectedNoticeIds.size === 0
                    }
                  >
                    <ArrowUpwardRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title="공지 아래로 이동" arrow>
                <span>
                  <IconButton
                    size="small"
                    aria-label="공지 아래로 이동"
                    onClick={() => handleMoveNotices('down')}
                    disabled={
                      !canManage ||
                      noticeSaving ||
                      noticesLoading ||
                      selectedNoticeIds.size === 0
                    }
                  >
                    <ArrowDownwardRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>

              <Divider
                orientation="vertical"
                flexItem
                sx={{ mx: 0.35 }}
              />

              <Typography
                sx={{
                  fontSize: '0.68rem',
                  color: '#64748b',
                  fontWeight: 700,
                }}
              >
                선택 {selectedNoticeIds.size.toLocaleString()}개
              </Typography>
            </Paper>

            {!canManage && (`,
  '공지 순서관리 툴바 추가',
);

/* ---------------------------------------------------------
   7. 표 체크박스
   --------------------------------------------------------- */

source = replaceOnce(
  source,
`                    <TableRow>
                      <TableCell align="center" sx={{ width: 72 }}>순번</TableCell>`,
`                    <TableRow>
                      <TableCell
                        padding="checkbox"
                        sx={{ width: 46 }}
                      >
                        <Checkbox
                          size="small"
                          checked={allNoticesSelected}
                          indeterminate={someNoticesSelected}
                          onChange={toggleAllNotices}
                          disabled={!canManage || notices.length === 0}
                          inputProps={{
                            'aria-label': '공지 전체 선택',
                          }}
                        />
                      </TableCell>
                      <TableCell align="center" sx={{ width: 72 }}>순번</TableCell>`,
  '공지 표 전체선택 체크박스',
);

source = replaceOnce(
  source,
`                      <TableRow key={row.id} hover>
                        <TableCell align="center" sx={{ fontWeight: 900 }}>`,
`                      <TableRow
                        key={row.id}
                        hover
                        selected={selectedNoticeIds.has(row.id)}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={selectedNoticeIds.has(row.id)}
                            onChange={() =>
                              toggleNoticeSelection(row.id)
                            }
                            disabled={!canManage}
                            inputProps={{
                              'aria-label': \`\${index + 1}번 공지 선택\`,
                            }}
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 900 }}>`,
  '공지 행 선택 체크박스',
);

source = replaceOnce(
  source,
`<TableRow><TableCell colSpan={8} align="center" sx={{ py: 8, color: '#94a3b8' }}>등록된 공지사항이 없습니다.</TableCell></TableRow>`,
`<TableRow><TableCell colSpan={9} align="center" sx={{ py: 8, color: '#94a3b8' }}>등록된 공지사항이 없습니다.</TableCell></TableRow>`,
  '공지 빈목록 colSpan',
);

/* ---------------------------------------------------------
   8. 등록/수정창의 표시순번 입력 제거
   --------------------------------------------------------- */

source = replaceOnce(
  source,
`            <TextField
              fullWidth
              type="number"
              label="표시 순번"
              value={noticeDraft.sortOrder}
              disabled={noticeSaving}
              inputProps={{ min: 1, step: 1 }}
              onChange={(event) =>
                setNoticeDraft((previous) => ({
                  ...previous,
                  sortOrder: event.target.value,
                }))
              }
              helperText="1번이 가장 먼저 표시됩니다. 저장하면 같은 현장의 공지 순서를 1, 2, 3…으로 자동 정리합니다."
            />
`,
``,
  '표시 순번 입력란 제거',
);

/* ---------------------------------------------------------
   9. 선택 삭제 확인창
   --------------------------------------------------------- */

source = replaceOnce(
  source,
`      <Dialog
        open={Boolean(correction)}`,
`      <Dialog
        open={noticeDeleteOpen}
        onClose={() =>
          !noticeSaving && setNoticeDeleteOpen(false)
        }
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 900 }}>
          선택 공지 삭제
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 1.2 }}>
            삭제 후에는 되돌릴 수 없습니다.
          </Alert>
          <Typography
            sx={{
              fontSize: '0.82rem',
              lineHeight: 1.65,
            }}
          >
            선택한{' '}
            <strong>
              {selectedNoticeIds.size.toLocaleString()}개 공지사항
            </strong>
            을 삭제하시겠습니까?
          </Typography>
          <Typography
            sx={{
              mt: 1,
              fontSize: '0.72rem',
              color: '#64748b',
              lineHeight: 1.6,
            }}
          >
            삭제 후 남은 공지는 자동으로 1, 2, 3… 순번으로
            다시 정리됩니다.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={noticeSaving}
            onClick={() => setNoticeDeleteOpen(false)}
          >
            취소
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={
              noticeSaving ||
              selectedNoticeIds.size === 0
            }
            onClick={handleDeleteSelectedNotices}
          >
            {noticeSaving ? '삭제 중...' : '선택 삭제'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(correction)}`,
  '공지 선택삭제 확인창 추가',
);

/* ---------------------------------------------------------
   10. 적용 검증
   --------------------------------------------------------- */

const requiredMarkers = [
  'selectedNoticeIds',
  'attendance_manager_reorder_notices_v52_22',
  'attendance_manager_delete_notices_v52_22',
  'AddCircleOutlineRoundedIcon',
  'RemoveCircleOutlineRoundedIcon',
  '공지 위로 이동',
  '공지 아래로 이동',
  '선택 {selectedNoticeIds.size.toLocaleString()}개',
  "'aria-label': '공지 전체 선택'",
  '선택 공지 삭제',
];

for (const marker of requiredMarkers) {
  if (!source.includes(marker)) {
    fail(`적용 후 검증 실패: ${marker}`);
  }
}

if (source.includes('label="표시 순번"')) {
  fail('등록/수정창에 표시 순번 입력란이 남아 있습니다.');
}

// 모든 검증 완료 후 실제 파일 백업/저장
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.22_${stamp}`);
const backupTarget = path.join(
  backupDir,
  'src',
  'page',
  'AttendanceManagement.jsx',
);

fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
fs.copyFileSync(TARGET, backupTarget);
fs.writeFileSync(TARGET, source, 'utf8');

console.log('\n[v52.22 적용 완료]');
console.log('- 공지 순번 입력칸 제거');
console.log('- 노임관리형 + / - / ↑ / ↓ 툴바 추가');
console.log('- 행별/전체 선택 체크박스 추가');
console.log('- 여러 공지 동시 위/아래 이동 지원');
console.log('- 선택 공지 삭제 및 삭제확인창 추가');
console.log('- 삭제 후 남은 공지 자동 재정렬');
console.log(`- 백업: ${backupDir}`);
console.log('\n주의: Supabase v52.22 SQL도 반드시 실행해야 합니다.');
console.log('다음 명령: npm run build');
