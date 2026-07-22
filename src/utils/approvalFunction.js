import { supabase } from '../supabaseClient';

export const invokeApprovalFunction = async (body) => {
  if (body?.action === 'create') {
    const { data, error } = await supabase.rpc(
      'create_report_document_and_submit',
      {
        p_document_id: body.documentId || null,
        p_report_type: body.reportType,
        p_title: body.reportTitle,
        p_report_key: body.reportKey,
        p_project_name: body.projectName,
        p_payload: body.payload || {},
        p_approver_user_ids: body.approverIds || [],
      },
    );

    return {
      data: error ? null : { documentId: data, requestId: data },
      error,
    };
  }

  if (body?.action === 'act') {
    const { data, error } = await supabase.rpc(
      'act_report_document_approval',
      {
        p_document_id: body.requestId,
        p_decision: body.decision,
        p_comment: body.comment || '',
      },
    );

    return { data: error ? null : data, error };
  }

  return {
    data: null,
    error: new Error('지원하지 않는 결재 동작입니다.'),
  };
};
