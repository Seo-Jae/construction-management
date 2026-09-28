import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { getProjectProcessOptions, buildProcessCatalog, changeProcessCatalog } from '../utils/projectProcesses.js';

export default function useProjectProcesses(projectName) {
  const [snapshot, setSnapshot] = useState({ project: '', rows: [], ready: false, error: '' });
  const [revision, setRevision] = useState(0);
  const mutationLock = useRef(false);
  const requestVersion = useRef(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    if (!projectName) return undefined;
    const load = async () => {
      const request = ++requestVersion.current;
      try {
        const rows = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from('project_processes')
            .select('id, process_type, is_enabled, is_archived, sort_order').eq('project_name', projectName).order('id').range(from, from + 999);
          if (error) throw error;
          rows.push(...(data || []));
          if ((data || []).length < 1000) break;
        }
        if (active && request === requestVersion.current) setSnapshot({ project: projectName, rows, ready: true, error: '' });
      } catch {
        if (active && request === requestVersion.current) setSnapshot((previous) => ({ project: projectName, rows: previous.project === projectName ? previous.rows : [], ready: false,
          error: '공종 설정을 불러오지 못했습니다. 설정 저장은 연결 확인 후 사용할 수 있습니다.' }));
      }
    };
    load();
    return () => { active = false; };
  }, [projectName, revision]);

  useEffect(() => {
    const onFocus = () => { if (!mutationLock.current) refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);
  const catalog = useMemo(() => buildProcessCatalog(getProjectProcessOptions(projectName), snapshot.project === projectName ? snapshot.rows : []), [projectName, snapshot]);
  const visible = useMemo(() => catalog.filter(row => !row.is_archived), [catalog]);
  const inputOptions = useMemo(() => visible.map(row => row.process_type), [visible]);
  const options = useMemo(() => visible.filter(row => row.is_enabled).map(row => row.process_type), [visible]);
  const ready = snapshot.project === projectName && snapshot.ready;
  const update = async (action) => {
    if (!ready) throw new Error('공종 설정 연결을 먼저 확인해주세요.');
    if (mutationLock.current) throw new Error('설정을 저장하고 있습니다.');
    const name = String(action.name || '').trim();
    if (!name || name.length > 60) throw new Error('공종명은 1~60자로 입력해주세요.');
    if (action.type === 'add' && visible.some(row => row.process_type === name)) throw new Error('이미 등록된 공종입니다.');
    const next = changeProcessCatalog(catalog, { ...action, name });
    mutationLock.current = true;
    requestVersion.current += 1;
    try {
      const { error } = await supabase.rpc('save_project_process_settings_v193', { p_project: projectName, p_settings: next });
      if (error) throw new Error(error.message);
      setSnapshot((previous) => previous.project === projectName ? { ...previous, rows: next } : previous);
    } finally { mutationLock.current = false; }
  };
  return { options, inputOptions, catalog: visible, update, ready, error: snapshot.project === projectName ? snapshot.error : '', refresh };
}
