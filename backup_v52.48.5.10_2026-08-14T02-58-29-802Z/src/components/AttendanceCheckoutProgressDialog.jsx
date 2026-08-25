import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import AttendanceProgressFloorGrid from './AttendanceProgressFloorGrid.jsx';
import {
  getAttendanceProgressProcessLabel,
  getAttendanceTradeLabel,
} from '../utils/attendanceI18n';

const unavailableTranslationKey = (reason) => ({
  other_location: 'progressUnavailableOtherLocation',
  unsupported_trade: 'progressUnavailableTrade',
  no_building_data: 'progressUnavailableBuilding',
}[reason] || 'progressUnavailableGeneral');

const normalizeBuildingValue = (value) =>
  String(value || '').trim().replace(/동$/, '');

export default function AttendanceCheckoutProgressDialog({
  open,
  appMode,
  language,
  context,
  draft,
  submitting,
  t,
  onChange,
  onToggleUnit,
  onCancel,
  onSubmit,
}) {
  const processOptions = Array.isArray(context?.progress_process_options)
    ? context.progress_process_options
    : [];
  const completedUnits = new Set(
    (Array.isArray(context?.completed_units) ? context.completed_units : [])
      .filter((item) => item?.process_type === draft.progressProcessType)
      .map((item) => String(item.unit)),
  );
  const selectedUnits = draft.selectedUnits instanceof Set
    ? draft.selectedUnits
    : new Set();
  const canSubmitProgress = Boolean(context?.can_submit_progress);
  const buildingValue = normalizeBuildingValue(context?.work_building);
  const locationLabel = context?.work_location_mode === 'standard'
    ? t('standardWorkLocationLabel', {
        building: buildingValue,
        floor: context?.work_floor || '',
      })
    : context?.work_location_text || t('otherWorkLocation');

  return (
    <Dialog
      open={open}
      fullScreen={appMode}
      fullWidth
      maxWidth="md"
      disableEscapeKeyDown={submitting}
      onClose={(_event, reason) => {
        if (submitting || reason === 'backdropClick') return;
        onCancel();
      }}
      PaperProps={{
        sx: {
          borderRadius: appMode ? 0 : 3,
          bgcolor: '#ffffff',
        },
      }}
    >
      <DialogTitle
        sx={{
          width: appMode ? '90%' : 'auto',
          mx: appMode ? 'auto' : 0,
          px: appMode ? 0 : 3,
          pt: appMode ? 'calc(110px + env(safe-area-inset-top))' : 3,
          pb: appMode ? 3.5 : 1.5,
        }}
      >
        <Typography sx={{ fontSize: appMode ? '3.1rem' : '1.35rem', lineHeight: 1.1, fontWeight: 950, letterSpacing: appMode ? '-0.04em' : undefined }}>
          {t('checkoutProgressTitle')}
        </Typography>
        <Typography sx={{ mt: appMode ? 1.8 : 0.7, color: '#64748b', fontSize: appMode ? '1.35rem' : '0.84rem', lineHeight: 1.65 }}>
          {t('checkoutProgressSubtitle')}
        </Typography>
      </DialogTitle>

      <DialogContent
        sx={{
          width: appMode ? '90%' : 'auto',
          mx: appMode ? 'auto' : 0,
          px: appMode ? '0 !important' : 3,
          pt: appMode ? '18px !important' : '12px !important',
          pb: appMode ? 3 : 2,
        }}
      >
        <Stack spacing={appMode ? 3.5 : 2}>
          <Paper variant="outlined" sx={{ p: appMode ? 2.7 : 1.7, borderRadius: 2.5, bgcolor: '#f8fafc' }}>
            <Typography sx={{ color: '#64748b', fontSize: appMode ? '1.05rem' : '0.72rem', fontWeight: 800 }}>
              {t('todayWorkSummary')}
            </Typography>
            <Typography sx={{ mt: 0.8, fontSize: appMode ? '1.55rem' : '0.92rem', fontWeight: 950 }}>
              {locationLabel}
            </Typography>
            <Typography sx={{ mt: 0.45, color: '#475569', fontSize: appMode ? '1.25rem' : '0.8rem', fontWeight: 800 }}>
              {getAttendanceTradeLabel(language, context?.work_trade_name)}
            </Typography>
          </Paper>

          {canSubmitProgress ? (
            <>
              <Box>
                <Typography sx={{ fontSize: appMode ? '1.55rem' : '0.96rem', fontWeight: 950 }}>
                  {t('completedUnitsQuestion')}
                </Typography>
                <Stack direction="row" spacing={appMode ? 1.5 : 1} sx={{ mt: appMode ? 1.8 : 1 }}>
                  <Button
                    fullWidth
                    variant={draft.completionState === 'submitted' ? 'contained' : 'outlined'}
                    onClick={() => onChange({ completionState: 'submitted' })}
                    sx={{
                      minHeight: appMode ? 84 : 52,
                      borderRadius: 2.5,
                      bgcolor: draft.completionState === 'submitted' ? '#03c75a' : undefined,
                      borderColor: '#03c75a',
                      color: draft.completionState === 'submitted' ? '#ffffff' : '#047857',
                      fontSize: appMode ? '1.35rem' : '0.86rem',
                      fontWeight: 950,
                      '&:hover': { bgcolor: draft.completionState === 'submitted' ? '#02b853' : '#ecfdf5' },
                    }}
                  >
                    {t('hasCompletedUnits')}
                  </Button>
                  <Button
                    fullWidth
                    variant={draft.completionState === 'none' ? 'contained' : 'outlined'}
                    color="inherit"
                    onClick={() => onChange({
                      completionState: 'none',
                      selectedUnits: new Set(),
                    })}
                    sx={{
                      minHeight: appMode ? 84 : 52,
                      borderRadius: 2.5,
                      bgcolor: draft.completionState === 'none' ? '#334155' : undefined,
                      color: draft.completionState === 'none' ? '#ffffff' : '#334155',
                      fontSize: appMode ? '1.35rem' : '0.86rem',
                      fontWeight: 950,
                      '&:hover': { bgcolor: draft.completionState === 'none' ? '#1e293b' : '#f8fafc' },
                    }}
                  >
                    {t('noCompletedUnits')}
                  </Button>
                </Stack>
              </Box>

              {draft.completionState === 'submitted' && (
                <>
                  {processOptions.length > 1 ? (
                    <FormControl
                      fullWidth
                      sx={appMode ? {
                        '& .MuiInputBase-root': { minHeight: 88, fontSize: '1.55rem', borderRadius: 2.5 },
                        '& .MuiInputLabel-root': { fontSize: '1.25rem' },
                      } : undefined}
                    >
                      <InputLabel>{t('progressProcess')}</InputLabel>
                      <Select
                        label={t('progressProcess')}
                        value={draft.progressProcessType}
                        onChange={(event) => onChange({
                          progressProcessType: event.target.value,
                          selectedUnits: new Set(),
                        })}
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              '& .MuiMenuItem-root': {
                                minHeight: appMode ? 64 : 44,
                                fontSize: appMode ? '1.4rem' : '0.9rem',
                              },
                            },
                          },
                        }}
                      >
                        {processOptions.map((processName) => (
                          <MenuItem key={processName} value={processName}>
                            {getAttendanceProgressProcessLabel(language, processName)}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <Paper variant="outlined" sx={{ p: appMode ? 2.4 : 1.5, borderRadius: 2.5 }}>
                      <Typography sx={{ color: '#64748b', fontSize: appMode ? '1rem' : '0.7rem', fontWeight: 800 }}>
                        {t('progressProcess')}
                      </Typography>
                      <Typography sx={{ mt: 0.5, fontSize: appMode ? '1.5rem' : '0.9rem', fontWeight: 950 }}>
                        {getAttendanceProgressProcessLabel(language, draft.progressProcessType)}
                      </Typography>
                    </Paper>
                  )}

                  {draft.progressProcessType && (
                    <AttendanceProgressFloorGrid
                      building={buildingValue}
                      floor={context?.work_floor || 0}
                      config={context?.building_config || {}}
                      selectedUnits={selectedUnits}
                      completedUnits={completedUnits}
                      appMode={appMode}
                      t={t}
                      onToggle={onToggleUnit}
                    />
                  )}
                </>
              )}
            </>
          ) : (
            <Alert severity="info" sx={{ fontSize: appMode ? '1.18rem' : '0.8rem', lineHeight: 1.7 }}>
              {t(unavailableTranslationKey(context?.progress_unavailable_reason))}
            </Alert>
          )}

          <Alert severity="warning" sx={{ fontSize: appMode ? '1.12rem' : '0.76rem', lineHeight: 1.7 }}>
            {t('progressApprovalGuide')}
          </Alert>
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          width: appMode ? '90%' : 'auto',
          mx: appMode ? 'auto' : 0,
          px: appMode ? 0 : 3,
          pb: appMode ? 'calc(38px + env(safe-area-inset-bottom))' : 3,
          pt: appMode ? 2.5 : 1.5,
          gap: appMode ? 2 : 1,
        }}
      >
        <Button
          variant="outlined"
          color="inherit"
          disabled={submitting}
          onClick={onCancel}
          sx={{ minHeight: appMode ? 100 : 54, minWidth: appMode ? 165 : 96, borderRadius: 2.5, fontSize: appMode ? '1.45rem' : undefined, fontWeight: 900 }}
        >
          {t('cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={
            submitting ||
            (canSubmitProgress && !draft.completionState)
          }
          onClick={onSubmit}
          sx={{
            flex: 1,
            minHeight: appMode ? 100 : 54,
            borderRadius: 2.5,
            bgcolor: '#03c75a',
            fontSize: appMode ? '1.6rem' : undefined,
            fontWeight: 950,
            boxShadow: 'none',
            '&:hover': { bgcolor: '#03b351', boxShadow: 'none' },
          }}
        >
          {submitting ? t('processing') : t('completeCheckOut')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
