import React, { useState } from 'react';
import WeeklyReportEditor from './WeeklyReportEditor.jsx';
import ReportDocumentList from './ReportDocumentList.jsx';

export default function WeeklyReport({ userProfile, buildingConfigs = {} }) {
  const [writing, setWriting] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);

  if (writing) {
    return (
      <WeeklyReportEditor
        userProfile={userProfile}
        buildingConfigs={buildingConfigs}
        editingDocument={editingDocument}
        onBackToList={() => {
          setWriting(false);
          setEditingDocument(null);
        }}
      />
    );
  }

  return (
    <ReportDocumentList
      reportType="weekly"
      reportName="주간 업무 보고"
      projectName={userProfile?.project_name || ''}
      onCreate={() => {
        setEditingDocument(null);
        setWriting(true);
      }}
      onEdit={(document) => {
        setEditingDocument(document);
        setWriting(true);
      }}
    />
  );
}
