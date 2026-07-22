import { supabase } from '../supabaseClient';

export const REPORT_STATUS_META = {
  draft: { label: '작성중', color: '#475569', bgcolor: '#e2e8f0' },
  pending: { label: '결재 진행중', color: '#0369a1', bgcolor: '#e0f2fe' },
  approved: { label: '결재 완료', color: '#15803d', bgcolor: '#dcfce7' },
  rejected: { label: '반려', color: '#b91c1c', bgcolor: '#fee2e2' },
  cancelled: { label: '취소', color: '#64748b', bgcolor: '#e2e8f0' },
};

export const DOCUMENT_SELECT = `
  id, report_type, title, report_key, project_name,
  author_user_id, author_name, author_position, payload,
  status, current_round, created_at, submitted_at,
  completed_at, updated_at
`;

export const STEP_SELECT = `
  id, document_id, approval_round, step_order,
  approver_user_id, approver_name, approver_position,
  status, acted_at, comment, created_at
`;

export const toApprovalRequest = (document, approvalSteps = []) => ({
  id: document?.id,
  report_type: document?.report_type,
  report_title: document?.title,
  report_key: document?.report_key,
  project_name: document?.project_name,
  requester_user_id: document?.author_user_id,
  requester_name: document?.author_name,
  requester_position: document?.author_position,
  requester_email: '',
  payload: document?.payload || {},
  status: document?.status,
  current_step_order:
    approvalSteps.find((step) => step.status === 'pending')?.step_order || null,
  current_approver_email: '',
  created_at: document?.submitted_at || document?.created_at,
  written_at: document?.created_at,
  submitted_at: document?.submitted_at,
  completed_at: document?.completed_at,
  approval_steps: approvalSteps,
});

export const fetchDocumentSteps = async (documents) => {
  const rows = Array.isArray(documents) ? documents : [];
  const ids = rows.map((row) => row.id).filter(Boolean);

  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from('report_document_approval_steps')
    .select(STEP_SELECT)
    .in('document_id', ids)
    .order('approval_round', { ascending: false })
    .order('step_order', { ascending: true });

  if (error) throw error;

  const documentMap = new Map(rows.map((row) => [row.id, row]));
  const result = {};

  (data || []).forEach((step) => {
    const document = documentMap.get(step.document_id);

    if (
      !document ||
      Number(step.approval_round) !== Number(document.current_round)
    ) {
      return;
    }

    if (!result[step.document_id]) result[step.document_id] = [];
    result[step.document_id].push(step);
  });

  return result;
};

export const fetchReportDocuments = async ({ reportType, projectName }) => {
  if (!reportType || !projectName) return [];

  const { data, error } = await supabase
    .from('report_documents')
    .select(DOCUMENT_SELECT)
    .eq('report_type', reportType)
    .eq('project_name', projectName)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const documents = data || [];
  const stepsByDocument = await fetchDocumentSteps(documents);

  return documents.map((document) => ({
    ...document,
    approval_steps: stepsByDocument[document.id] || [],
  }));
};

export const listApprovalCandidates = async () => {
  const { data, error } = await supabase.rpc(
    'list_report_approval_candidates',
  );

  if (error) throw error;

  return (data || []).map((row) => ({
    userId: row.user_id,
    fullName: row.full_name || '성명 미등록',
    position: row.position_name || '직급 미등록',
  }));
};

export const saveReportDocumentDraft = async ({
  documentId = null,
  reportType,
  title,
  reportKey,
  projectName,
  payload,
}) => {
  const { data, error } = await supabase.rpc(
    'save_report_document_draft',
    {
      p_document_id: documentId,
      p_report_type: reportType,
      p_title: title,
      p_report_key: reportKey,
      p_project_name: projectName,
      p_payload: payload || {},
    },
  );

  if (error) throw error;

  window.dispatchEvent(new Event('report-documents-changed'));
  return data;
};
