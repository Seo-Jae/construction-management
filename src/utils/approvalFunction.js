import { supabase } from '../supabaseClient';

const getValidSession = async () => {
  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(
      `로그인 세션 확인 실패: ${sessionError.message}`,
    );
  }

  let session = sessionData?.session || null;

  /*
    getSession()이 세션을 찾지 못했거나 access token이 없는 경우,
    브라우저에 저장된 refresh token으로 한 번 더 갱신을 시도합니다.
  */
  if (!session?.access_token) {
    const {
      data: refreshData,
      error: refreshError,
    } = await supabase.auth.refreshSession();

    if (refreshError) {
      throw new Error(
        `로그인 세션 갱신 실패: ${refreshError.message}`,
      );
    }

    session = refreshData?.session || null;
  }

  if (!session?.access_token) {
    throw new Error(
      '로그인 세션이 없습니다. 로그아웃 후 다시 로그인해주세요.',
    );
  }

  return session;
};

export const invokeApprovalFunction = async (body) => {
  const session = await getValidSession();

  /*
    새 Publishable Key를 사용하는 환경에서는 사용자 JWT가 아닌
    프로젝트 키가 Authorization 헤더에 들어가는 경우가 있어,
    로그인 사용자의 access token을 명시적으로 전달합니다.

    apikey 헤더는 기존 Supabase FunctionsClient가 자동으로 처리합니다.
  */
  return supabase.functions.invoke('approval-workflow', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body,
  });
};
