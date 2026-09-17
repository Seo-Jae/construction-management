import { supabase } from '../supabaseClient';
import { buildDashboardReportTasks, getDashboardReportPeriod } from './dashboardReportTasks.js';

export const groupDashboardWork = ({ documents, steps, userId, projectName, reportTypes, canApprove }) => {
  const rows = documents.filter((row) => row.project_name === projectName);
  const own = rows.filter((row) => row.author_user_id === userId);
  const pendingIds = new Set(steps.filter((step) => step.approver_user_id === userId && step.status === 'pending'
    && rows.some((row) => row.id === step.document_id && row.status === 'pending' && Number(row.current_round) === Number(step.approval_round)))
    .map((step) => step.document_id));
  return {
    reports: own.filter((row) => reportTypes.includes(row.report_type) && ['draft', 'rejected', 'cancelled'].includes(row.status)),
    approvals: canApprove ? rows.filter((row) => pendingIds.has(row.id)) : [],
    received: canApprove ? own.filter((row) => ['approved', 'rejected'].includes(row.status)) : [],
  };
};

const readAll = async (query) => {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query().range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
};

export const fetchDashboardReportTasks = async ({ projectName, canDaily, canWeekly, canContract }) => {
  const period = getDashboardReportPeriod();
  const [dailyReports, weeklyReports, contracts, contractDailyReports] = await Promise.all([
    canDaily ? readAll(() => supabase.from('daily_reports')
      .select('project_name, date, workers, tasks, today_task, tomorrow_task')
      .eq('project_name', projectName).in('date', [period.today, period.today.replaceAll('-', '.'), period.today.slice(2).replaceAll('-', '.')]).order('date')) : [],
    canWeekly && period.weeklyDue ? readAll(() => supabase.from('weekly_reports')
      .select('id, project_name, week_start, status').eq('project_name', projectName)
      .eq('week_start', period.weekStart).eq('status', 'completed').order('id')) : [],
    canContract || canDaily ? readAll(() => supabase.rpc('labor_get_contract_month', {
      p_project_name: projectName, p_contract_month: period.month,
    }).order('requirement_id')) : [],
    canContract || canDaily ? readAll(() => supabase.from('daily_reports').select('project_name, date, workers')
      .eq('project_name', projectName)
      .or(`date.like.${period.month}-%,date.like.${period.month.replace('-', '.')}.%,date.like.${period.month.slice(2).replace('-', '.')}.%`)
      .order('date')) : [],
  ]);
  return buildDashboardReportTasks({ projectName, period, canDaily, canWeekly, canContract,
    dailyReports, weeklyReports, contracts, contractDailyReports });
};

export const fetchDashboardWork = async (options) => {
  const { userId, projectName, canApprove } = options;
  const fields = 'id, title, report_type, project_name, author_user_id, status, current_round, updated_at';
  const [own, steps] = await Promise.all([
    readAll(() => supabase.from('report_documents').select(fields).eq('author_user_id', userId).eq('project_name', projectName).order('id')),
    canApprove ? readAll(() => supabase.from('report_document_approval_steps').select('id, document_id, approver_user_id, status, approval_round')
      .eq('approver_user_id', userId).eq('status', 'pending').order('id')) : [],
  ]);
  const ids = [...new Set(steps.map((step) => step.document_id))];
  const documents = new Map(own.map((row) => [row.id, row]));
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('report_documents').select(fields)
      .in('id', ids.slice(i, i + 200)).eq('project_name', projectName);
    if (error) throw error;
    (data || []).forEach((row) => documents.set(row.id, row));
  }
  return groupDashboardWork({ ...options, documents: [...documents.values()].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))), steps });
};
