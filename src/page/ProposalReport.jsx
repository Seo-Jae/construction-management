import React, { useState } from 'react';
import ProposalReportEditor from './ProposalReportEditor.jsx';
import ReportDocumentList from './ReportDocumentList.jsx';

export default function ProposalReport({ userProfile }) {
  const [writing, setWriting] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);

  if (writing) {
    return (
      <ProposalReportEditor
        userProfile={userProfile}
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
      reportType="proposal"
      reportName="품의 보고"
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
