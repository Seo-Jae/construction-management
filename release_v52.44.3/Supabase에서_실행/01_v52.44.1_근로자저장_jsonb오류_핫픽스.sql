begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- =========================================================
-- v52.44.1 HOTFIX
--
-- 증상:
--   function jsonb_object_length(jsonb) does not exist
--
-- 발생 위치:
--   labor_worker_master_secure_upsert_v52_41
--
-- 대응:
--   현재 DB에 설치된 함수 정의를 pg_get_functiondef()로 읽고,
--   jsonb_object_length(v_payload) 의존성을 제거한다.
--
-- 기존 암호화/권한/필수정보/국적 표준화 로직은 그대로 유지한다.
-- =========================================================

do $$
declare
  v_proc regprocedure;
  v_def text;
  v_next text;
begin
  v_proc :=
    to_regprocedure(
      'public.labor_worker_master_secure_upsert_v52_41(uuid,text,date,text,text,text,boolean,text,text,text,text,text,text,text)'
    );

  if v_proc is null then
    raise exception
      'labor_worker_master_secure_upsert_v52_41 함수가 없습니다. v52.41 SQL 적용 여부를 확인해주세요.';
  end if;

  v_def :=
    pg_get_functiondef(v_proc);

  if position(
       'jsonb_object_length'
       in v_def
     ) = 0 then
    raise notice
      'jsonb_object_length 호출이 이미 제거되어 있습니다.';
    return;
  end if;

  v_next :=
    regexp_replace(
      v_def,
      'jsonb_object_length[[:space:]]*\([[:space:]]*v_payload[[:space:]]*\)',
      '(case when v_payload = ''{}''::jsonb then 0 else 1 end)',
      'g'
    );

  if v_next = v_def then
    raise exception
      '저장 함수 안에서 jsonb_object_length(v_payload) 패턴을 찾지 못했습니다. 자동수정을 중단합니다.';
  end if;

  execute v_next;
end;
$$;

-- 실제 교체 여부 검증
do $$
declare
  v_proc regprocedure;
  v_def text;
begin
  v_proc :=
    to_regprocedure(
      'public.labor_worker_master_secure_upsert_v52_41(uuid,text,date,text,text,text,boolean,text,text,text,text,text,text,text)'
    );

  if v_proc is null then
    raise exception
      '검증 대상 함수가 없습니다.';
  end if;

  v_def :=
    pg_get_functiondef(v_proc);

  if position(
       'jsonb_object_length'
       in v_def
     ) > 0 then
    raise exception
      'jsonb_object_length 호출이 아직 남아 있습니다.';
  end if;

  if position(
       'v_payload = ''{}''::jsonb'
       in v_def
     ) = 0 then
    raise exception
      '대체 표현식이 저장 함수에 반영되지 않았습니다.';
  end if;
end;
$$;

commit;
