import { supabase } from '../supabaseClient';
import {
  DOCUMENT_SELECT,
  STEP_SELECT,
  fetchDocumentSteps,
  toApprovalRequest,
} from './reportDocuments.js';

const normalizeEmail = (value) =>
  String(value || '').trim().toLowerCase();

export const getCurrentApprovalIdentity = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;

  const userId = String(user?.id || '').trim();
  const email = normalizeEmail(user?.email);

  if (!userId) {
    throw new Error('로그인 계정 정보를 확인하지 못했습니다.');
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('manager_name, position_title')
    .eq('auth_user_id', userId)
    .maybeSingle();

  return {
    userId,
    email,
    displayName: profile?.manager_name || email || '사용자',
    position: profile?.position_title || '',
  };
};

export const getCurrentApprovalEmail = async () => {
  const identity = await getCurrentApprovalIdentity();
  return identity.email;
};

export const fetchPendingApprovalSummary = async () => {
  const { userId } = await getCurrentApprovalIdentity();

  const { data: steps, error: stepError } = await supabase
    .from('report_document_approval_steps')
    .select('id, document_id, status')
    .eq('approver_user_id', userId)
    .eq('status', 'pending');

  if (stepError) throw stepError;

  const documentIds = (steps || []).map((step) => step.document_id);

  if (documentIds.length === 0) {
    return {
      counts: {
        total: 0,
        actionable: 0,
        waiting: 0,
        weekly: 0,
        proposal: 0,
        other: 0,
      },
    };
  }

  const { data: documents, error: documentError } = await supabase
    .from('report_documents')
    .select('id, report_type, status')
    .in('id', documentIds)
    .eq('status', 'pending');

  if (documentError) throw documentError;

  const counts = {
    total: 0,
    actionable: 0,
    waiting: 0,
    weekly: 0,
    proposal: 0,
    other: 0,
  };

  (documents || []).forEach((document) => {
    counts.total += 1;
    counts.actionable += 1;

    if (document.report_type === 'weekly') counts.weekly += 1;
    else if (document.report_type === 'proposal') counts.proposal += 1;
    else counts.other += 1;
  });

  return { counts };
};

export const fetchReportApprovalStatus = async ({
  reportType,
  reportKey,
  projectName = '',
}) => {
  if (!reportType || !reportKey) return null;

  const { userId } = await getCurrentApprovalIdentity();
  let query = supabase
    .from('report_documents')
    .select(DOCUMENT_SELECT)
    .eq('author_user_id', userId)
    .eq('report_type', reportType)
    .eq('report_key', reportKey)
    .order('created_at', { ascending: false })
    .limit(1);

  if (projectName) query = query.eq('project_name', projectName);

  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] || null;
};

const fetchDocumentsByIds = async (documentIds) => {
  if (!documentIds.length) return [];

  const { data, error } = await supabase
    .from('report_documents')
    .select(DOCUMENT_SELECT)
    .in('id', documentIds);

  if (error) throw error;
  return data || [];
};

export const fetchApprovalInboxData = async () => {
  const { userId, email, displayName } = await getCurrentApprovalIdentity();

  const [
    { data: ownSteps, error: ownStepError },
    { data: ownDocuments, error: ownDocumentError },
  ] = await Promise.all([
    supabase
      .from('report_document_approval_steps')
      .select(STEP_SELECT)
      .eq('approver_user_id', userId)
      .neq('status', 'waiting')
      .order('created_at', { ascending: false }),
    supabase
      .from('report_documents')
      .select(DOCUMENT_SELECT)
      .eq('author_user_id', userId)
      .neq('status', 'draft')
      .order('created_at', { ascending: false }),
  ]);

  if (ownStepError) throw ownStepError;
  if (ownDocumentError) throw ownDocumentError;

  const documentIds = Array.from(
    new Set([
      ...(ownSteps || []).map((step) => step.document_id),
      ...(ownDocuments || []).map((document) => document.id),
    ]),
  );

  if (documentIds.length === 0) {
    return { email, displayName, items: [], stepsByRequest: {} };
  }

  const documents = await fetchDocumentsByIds(documentIds);
  const documentMap = new Map(documents.map((document) => [document.id, document]));
  const stepsByRequest = await fetchDocumentSteps(documents);
  const requestMap = new Map(
    documents.map((document) => [
      document.id,
      toApprovalRequest(document, stepsByRequest[document.id] || []),
    ]),
  );

  const approverItems = (ownSteps || [])
    .filter((step) => {
      const document = documentMap.get(step.document_id);
      return (
        document &&
        Number(step.approval_round) === Number(document.current_round)
      );
    })
    .map((step) => ({
      ...step,
      request_id: step.document_id,
      item_kind: 'approver',
      approval_requests: requestMap.get(step.document_id) || null,
    }))
    .filter((item) => item.approval_requests);

  const requesterItems = (ownDocuments || []).map((document) => ({
    id: `requester-${document.id}`,
    request_id: document.id,
    item_kind: 'requester',
    step_order: 0,
    approver_name: '',
    approver_position: '',
    approver_email: '',
    status: document.status,
    acted_at: document.completed_at,
    comment: '',
    created_at: document.submitted_at || document.created_at,
    approval_requests: requestMap.get(document.id) || null,
  }));

  const items = [...approverItems, ...requesterItems].sort((first, second) => {
    const firstActionable =
      first.item_kind === 'approver' &&
      first.status === 'pending' &&
      first.approval_requests?.status === 'pending';
    const secondActionable =
      second.item_kind === 'approver' &&
      second.status === 'pending' &&
      second.approval_requests?.status === 'pending';

    if (firstActionable !== secondActionable) return firstActionable ? -1 : 1;

    return String(
      second.approval_requests?.created_at || second.created_at,
    ).localeCompare(
      String(first.approval_requests?.created_at || first.created_at),
    );
  });

  return { email, displayName, items, stepsByRequest };
};

