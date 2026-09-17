import { Box, Typography } from '@mui/material';

const extractWeeklyLines = (payload) => {
  const form = payload?.form || {};
  const labels = [
    ['공무사항', 'publicCurrent'],
    ['공정사항', 'progressCurrent'],
    ['회의내용', 'meetingCurrent'],
    ['지시사항', 'directiveCurrent'],
    ['자재 반입계획', 'materialCurrent'],
    ['특이사항', 'specialCurrent'],
  ];

  return labels
    .map(([label, key]) => ({
      label,
      values: Array.isArray(form[key])
        ? form[key].filter((value) =>
            String(value || '').trim(),
          )
        : [],
    }))
    .filter((section) => section.values.length > 0);
};

export default function ReportSnapshot({ request }) {
  const payload = request?.payload || {};

  if (request?.report_type === 'weekly') {
    const sections = extractWeeklyLines(payload);

    return (
      <Box
        sx={{
          mt: 1,
          p: 1.1,
          borderRadius: 1.2,
          border: '1px solid #e2e8f0',
          bgcolor: '#f8fafc',
        }}
      >
        <Typography
          sx={{
            color: '#334155',
            fontSize: '0.7rem',
            fontWeight: 900,
          }}
        >
          보고기간
        </Typography>
        <Typography
          sx={{
            mt: 0.2,
            color: '#475569',
            fontSize: '0.7rem',
          }}
        >
          {payload?.period?.display || request?.report_key || '-'}
        </Typography>

        {sections.length === 0 ? (
          <Typography
            sx={{
              mt: 0.8,
              color: '#94a3b8',
              fontSize: '0.68rem',
            }}
          >
            직접 입력된 보고내용이 없습니다.
          </Typography>
        ) : (
          sections.map((section) => (
            <Box key={section.label} sx={{ mt: 0.8 }}>
              <Typography
                sx={{
                  color: '#334155',
                  fontSize: '0.68rem',
                  fontWeight: 900,
                }}
              >
                {section.label}
              </Typography>
              {section.values.map((value, index) => (
                <Typography
                  key={`${section.label}-${index}`}
                  sx={{
                    mt: 0.15,
                    pl: 0.7,
                    color: '#64748b',
                    fontSize: '0.67rem',
                  }}
                >
                  • {value}
                </Typography>
              ))}
            </Box>
          ))
        )}
      </Box>
    );
  }

  if (request?.report_type === 'proposal') {
    const lines = Array.isArray(payload?.reportLines)
      ? payload.reportLines.filter((line) =>
          String(line || '').trim(),
        )
      : [];

    return (
      <Box
        sx={{
          mt: 1,
          p: 1.1,
          borderRadius: 1.2,
          border: '1px solid #e2e8f0',
          bgcolor: '#f8fafc',
        }}
      >
        <Typography
          sx={{
            color: '#334155',
            fontSize: '0.7rem',
            fontWeight: 900,
          }}
        >
          제목
        </Typography>
        <Typography
          sx={{
            mt: 0.2,
            color: '#475569',
            fontSize: '0.7rem',
          }}
        >
          {payload?.title || '-'}
        </Typography>

        <Typography
          sx={{
            mt: 0.8,
            color: '#334155',
            fontSize: '0.7rem',
            fontWeight: 900,
          }}
        >
          보고내용
        </Typography>
        {lines.length > 0 ? (
          lines.map((line, index) => (
            <Typography
              key={`proposal-${index}`}
              sx={{
                mt: 0.15,
                pl: 0.7,
                color: '#64748b',
                fontSize: '0.67rem',
              }}
            >
              • {line}
            </Typography>
          ))
        ) : (
          <Typography
            sx={{
              mt: 0.2,
              color: '#94a3b8',
              fontSize: '0.68rem',
            }}
          >
            입력된 보고내용이 없습니다.
          </Typography>
        )}

        {(payload?.itemName || payload?.amount) && (
          <Typography
            sx={{
              mt: 0.8,
              color: '#475569',
              fontSize: '0.68rem',
            }}
          >
            품목: {payload?.itemName || '-'} / 금액:{' '}
            {payload?.amount
              ? Number(payload.amount).toLocaleString()
              : '-'}
            원
          </Typography>
        )}
      </Box>
    );
  }

  return null;
}
