import { supabase } from '../supabaseClient';

const normalizeEmail = (value) =>
  String(value || '').trim().toLowerCase();

export const getCurrentApprovalIdentity = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  const email = normalizeEmail(user?.email);
  const userId = String(user?.id || '').trim();

  if (!userId || !email) {
    throw new Error(
      '로그인 계정 정보를 확인하지 못했습니다.',
    );
  }

  return {
    userId,
    email,
  };
};

export const getCurrentApprovalEmail = async () => {
  const identity = await getCurrentApprovalIdentity();
  return identity.email;
};

const REQUEST_SELECT = `
  id,
  report_type,
  report_title,
  report_key,
  project_name,
  requester_user_id,
  requester_name,
  requester_email,
  payload,
  status,
  current_step_order,
  current_approver_email,
  created_at,
  completed_at
`;

const fetchRequestsByIds = async (requestIds) => {
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('approval_requests')
    .select(REQUEST_SELECT)
    .in('id', requestIds);

  if (error) {
    throw error;
  }

  return data || [];
};

export const fetchPendingApprovalSummary = async () => {
  const { email } = await getCurrentApprovalIdentity();

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
  const { userId, email } =
    await getCurrentApprovalIdentity();

  const [
    { data: ownSteps, error: ownStepError },
    { data: ownRequests, error: ownRequestError },
  ] = await Promise.all([
    supabase
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
      .order('created_at', { ascending: false }),

    supabase
      .from('approval_requests')
      .select(REQUEST_SELECT)
      .eq('requester_user_id', userId)
      .order('created_at', { ascending: false }),
  ]);

  if (ownStepError) {
    throw ownStepError;
  }

  if (ownRequestError) {
    throw ownRequestError;
  }

  const requestIds = Array.from(
    new Set([
      ...(ownSteps || []).map((step) => step.request_id),
      ...(ownRequests || []).map((request) => request.id),
    ]),
  );

  if (requestIds.length === 0) {
    return {
      email,
      items: [],
      stepsByRequest: {},
    };
  }

  const additionalRequests = await fetchRequestsByIds(
    requestIds,
  );

  const requestMap = new Map();

  [...additionalRequests, ...(ownRequests || [])].forEach(
    (request) => {
      requestMap.set(request.id, request);
    },
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

  const approverItems = (ownSteps || [])
    .map((step) => ({
      ...step,
      item_kind: 'approver',
      approval_requests:
        requestMap.get(step.request_id) || null,
    }))
    .filter((item) => item.approval_requests);

  /*
    요청자가 자신의 진행중·승인·반려 결과를 같은 결재함에서
    확인하도록 요청자 전용 항목을 추가합니다.
  */
  const requesterItems = (ownRequests || []).map((request) => ({
    id: `requester-${request.id}`,
    request_id: request.id,
    item_kind: 'requester',
    step_order: 0,
    approver_name: '',
    approver_position: '',
    approver_email: email,
    status: request.status,
    acted_at: request.completed_at,
    comment: '',
    created_at: request.created_at,
    approval_requests: request,
  }));

  const items = [
    ...approverItems,
    ...requesterItems,
  ].sort((a, b) => {
    const aActionable =
      a.item_kind === 'approver' &&
      a.status === 'pending' &&
      a.approval_requests?.status === 'pending';

    const bActionable =
      b.item_kind === 'approver' &&
      b.status === 'pending' &&
      b.approval_requests?.status === 'pending';

    if (aActionable !== bActionable) {
      return aActionable ? -1 : 1;
    }

    const aRejected =
      a.item_kind === 'requester' &&
      a.approval_requests?.status === 'rejected';

    const bRejected =
      b.item_kind === 'requester' &&
      b.approval_requests?.status === 'rejected';

    if (aRejected !== bRejected) {
      return aRejected ? -1 : 1;
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
