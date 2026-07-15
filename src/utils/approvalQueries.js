import { supabase } from '../supabaseClient';

const normalizeEmail = (value) =>
  String(value || '').trim().toLowerCase();

export const getCurrentApprovalEmail = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  const email = normalizeEmail(user?.email);

  if (!email) {
    throw new Error(
      '로그인 계정의 이메일을 확인하지 못했습니다.',
    );
  }

  return email;
};

const fetchRequestsByIds = async (requestIds) => {
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('approval_requests')
    .select(
      `
      id,
      report_type,
      report_title,
      report_key,
      project_name,
      requester_name,
      requester_email,
      payload,
      status,
      current_step_order,
      current_approver_email,
      created_at,
      completed_at
    `,
    )
    .in('id', requestIds);

  if (error) {
    throw error;
  }

  return data || [];
};

export const fetchPendingApprovalSummary = async () => {
  const email = await getCurrentApprovalEmail();

  /*
    결재요청 테이블과 관계 조회를 한 번에 묶지 않고,
    현재 이메일의 pending 단계부터 직접 조회합니다.

    이렇게 하면 현장 선택 여부와 관계없이 결재 건수를
    정확히 불러올 수 있고, 다음 결재자로 넘어간 순간에도
    해당 이메일의 pending 단계가 바로 집계됩니다.
  */
  const { data: steps, error: stepError } = await supabase
    .from('approval_steps')
    .select('id, request_id, status')
    .eq('approver_email', email)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (stepError) {
    throw stepError;
  }

  const requestIds = Array.from(
    new Set((steps || []).map((step) => step.request_id)),
  );

  const requests = await fetchRequestsByIds(requestIds);
  const requestMap = new Map(
    requests.map((request) => [request.id, request]),
  );

  const counts = {
    total: 0,
    weekly: 0,
    proposal: 0,
    other: 0,
  };

  (steps || []).forEach((step) => {
    const request = requestMap.get(step.request_id);

    if (!request || request.status !== 'pending') {
      return;
    }

    counts.total += 1;

    if (request.report_type === 'weekly') {
      counts.weekly += 1;
    } else if (request.report_type === 'proposal') {
      counts.proposal += 1;
    } else {
      counts.other += 1;
    }
  });

  return {
    email,
    counts,
  };
};

export const fetchApprovalInboxData = async () => {
  const email = await getCurrentApprovalEmail();

  const { data: ownSteps, error: ownStepError } =
    await supabase
      .from('approval_steps')
      .select(
        `
        id,
        request_id,
        step_order,
        approver_name,
        approver_position,
        approver_email,
        status,
        acted_at,
        comment,
        created_at
      `,
      )
      .eq('approver_email', email)
      .order('created_at', { ascending: false });

  if (ownStepError) {
    throw ownStepError;
  }

  const requestIds = Array.from(
    new Set(
      (ownSteps || []).map((step) => step.request_id),
    ),
  );

  if (requestIds.length === 0) {
    return {
      email,
      items: [],
      stepsByRequest: {},
    };
  }

  const requests = await fetchRequestsByIds(requestIds);
  const requestMap = new Map(
    requests.map((request) => [request.id, request]),
  );

  const { data: allSteps, error: allStepError } =
    await supabase
      .from('approval_steps')
      .select(
        `
        id,
        request_id,
        step_order,
        approver_name,
        approver_position,
        approver_email,
        status,
        acted_at,
        comment,
        created_at
      `,
      )
      .in('request_id', requestIds)
      .order('step_order', { ascending: true });

  if (allStepError) {
    throw allStepError;
  }

  const stepsByRequest = {};

  (allSteps || []).forEach((step) => {
    if (!stepsByRequest[step.request_id]) {
      stepsByRequest[step.request_id] = [];
    }

    stepsByRequest[step.request_id].push(step);
  });

  const items = (ownSteps || [])
    .map((step) => ({
      ...step,
      approval_requests:
        requestMap.get(step.request_id) || null,
    }))
    .filter((item) => item.approval_requests)
    .sort((a, b) => {
      const aPending =
        a.status === 'pending' &&
        a.approval_requests?.status === 'pending';
      const bPending =
        b.status === 'pending' &&
        b.approval_requests?.status === 'pending';

      if (aPending !== bPending) {
        return aPending ? -1 : 1;
      }

      return String(
        b.approval_requests?.created_at || b.created_at,
      ).localeCompare(
        String(
          a.approval_requests?.created_at || a.created_at,
        ),
      );
    });

  return {
    email,
    items,
    stepsByRequest,
  };
};
