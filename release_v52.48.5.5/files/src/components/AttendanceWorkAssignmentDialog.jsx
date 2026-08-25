import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ATTENDANCE_TRADE_OPTIONS } from '../utils/attendance';
import { getAttendanceTradeLabel } from '../utils/attendanceI18n';

const normalizeBuildingLabel = (buildingName, suffix) => {
  const value = String(buildingName || '').trim();
  if (!value) return '';
  if (value.endsWith('동')) {
    return `${value.slice(0, -1)}${suffix}`;
  }
  return `${value}${suffix}`;
};

export default function AttendanceWorkAssignmentDialog({
  open,
  appMode,
  language,
  buildings,
  draft,
  submitting,
  t,
  onChange,
  onCancel,
  onSubmit,
}) {
  const selectedBuilding = buildings.find(
    (item) => item.building_name === draft.building,
  );
  const floorCount = Math.max(
    0,
    Number(selectedBuilding?.floors || 0),
  );
  const floors = Array.from(
    { length: floorCount },
    (_unused, index) => index + 1,
  );

  return (
    <Dialog
      open={open}
      fullScreen={appMode}
      fullWidth
      maxWidth="sm"
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
      <DialogTitle sx={{ pt: appMode ? 'calc(28px + env(safe-area-inset-top))' : 3, pb: 1.25 }}>
        <Typography sx={{ fontSize: appMode ? '1.55rem' : '1.2rem', fontWeight: 950 }}>
          {t('workAssignmentTitle')}
        </Typography>
        <Typography sx={{ mt: 0.7, color: '#64748b', fontSize: appMode ? '0.96rem' : '0.82rem', lineHeight: 1.6 }}>
          {t('workAssignmentSubtitle')}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: '12px !important', pb: 2 }}>
        <Stack spacing={2.1}>
          <Alert severity="info" sx={{ lineHeight: 1.6 }}>
            {t('checkInAfterWorkAssignment')}
          </Alert>

          <FormControlLabel
            control={(
              <Checkbox
                checked={draft.locationMode === 'other'}
                onChange={(event) => {
                  onChange({
                    locationMode: event.target.checked ? 'other' : 'standard',
                    building: '',
                    floor: '',
                    locationText: '',
                  });
                }}
              />
            )}
            label={t('otherWorkLocation')}
          />

          {draft.locationMode === 'other' ? (
            <TextField
              autoFocus
              fullWidth
              label={t('workLocation')}
              placeholder={t('workLocationExample')}
              value={draft.locationText}
              onChange={(event) => onChange({ locationText: event.target.value.slice(0, 100) })}
              inputProps={{ maxLength: 100 }}
              helperText={t('workLocationHelp')}
            />
          ) : (
            <>
              {buildings.length === 0 && (
                <Alert severity="warning">
                  {t('noBuildingDataUseOther')}
                </Alert>
              )}

              <FormControl fullWidth disabled={buildings.length === 0}>
                <InputLabel>{t('building')}</InputLabel>
                <Select
                  label={t('building')}
                  value={draft.building}
                  onChange={(event) => onChange({ building: event.target.value, floor: '' })}
                >
                  {buildings.map((item) => (
                    <MenuItem key={item.building_name} value={item.building_name}>
                      {normalizeBuildingLabel(item.building_name, t('buildingSuffix'))}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth disabled={!draft.building}>
                <InputLabel>{t('floor')}</InputLabel>
                <Select
                  label={t('floor')}
                  value={draft.floor}
                  onChange={(event) => onChange({ floor: event.target.value })}
                >
                  {floors.map((floor) => (
                    <MenuItem key={floor} value={floor}>
                      {t('floorNumber', { floor })}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}

          <FormControl fullWidth>
            <InputLabel>{t('workProcess')}</InputLabel>
            <Select
              label={t('workProcess')}
              value={draft.tradeName}
              onChange={(event) => onChange({ tradeName: event.target.value })}
            >
              {ATTENDANCE_TRADE_OPTIONS.map((trade) => (
                <MenuItem key={trade} value={trade}>
                  {getAttendanceTradeLabel(language, trade)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ px: 0.25 }}>
            <Typography sx={{ color: '#64748b', fontSize: '0.78rem', lineHeight: 1.55 }}>
              {t('defaultProcessGuide')}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          pb: appMode ? 'calc(28px + env(safe-area-inset-bottom))' : 3,
          pt: 1.5,
          gap: 1,
        }}
      >
        <Button
          variant="outlined"
          color="inherit"
          disabled={submitting}
          onClick={onCancel}
          sx={{ minHeight: 54, minWidth: 96, fontWeight: 900 }}
        >
          {t('cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={submitting}
          onClick={onSubmit}
          sx={{
            flex: 1,
            minHeight: 54,
            bgcolor: '#03c75a',
            fontWeight: 950,
            '&:hover': { bgcolor: '#03b351' },
          }}
        >
          {submitting ? t('processing') : t('completeCheckIn')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
