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
      <DialogTitle
        sx={{
          width: appMode ? '90%' : 'auto',
          mx: appMode ? 'auto' : 0,
          px: appMode ? 0 : 3,
          pt: appMode ? 'calc(86px + env(safe-area-inset-top))' : 3,
          pb: appMode ? 3 : 1.25,
        }}
      >
        <Typography sx={{ fontSize: appMode ? '2.65rem' : '1.2rem', lineHeight: 1.15, fontWeight: 950 }}>
          {t('workAssignmentTitle')}
        </Typography>
        <Typography sx={{ mt: appMode ? 1.5 : 0.7, color: '#64748b', fontSize: appMode ? '1.22rem' : '0.82rem', lineHeight: 1.65 }}>
          {t('workAssignmentSubtitle')}
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
        <Stack
          spacing={appMode ? 3.2 : 2.1}
          sx={appMode ? {
            '& .MuiInputBase-root': {
              minHeight: 82,
              fontSize: '1.35rem',
              borderRadius: 2.5,
            },
            '& .MuiInputLabel-root': {
              fontSize: '1.18rem',
            },
            '& .MuiFormHelperText-root': {
              mx: 0.5,
              fontSize: '1rem',
              lineHeight: 1.5,
            },
            '& .MuiFormControlLabel-label': {
              fontSize: '1.22rem',
            },
            '& .MuiCheckbox-root .MuiSvgIcon-root': {
              fontSize: '2.2rem',
            },
          } : undefined}
        >
          <Alert severity="info" sx={{ fontSize: appMode ? '1.08rem' : undefined, lineHeight: 1.65 }}>
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
                <Alert severity="warning" sx={{ fontSize: appMode ? '1.08rem' : undefined, lineHeight: 1.65 }}>
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
            <Typography sx={{ color: '#64748b', fontSize: appMode ? '1rem' : '0.78rem', lineHeight: 1.65 }}>
              {t('defaultProcessGuide')}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          width: appMode ? '90%' : 'auto',
          mx: appMode ? 'auto' : 0,
          px: appMode ? 0 : 3,
          pb: appMode ? 'calc(38px + env(safe-area-inset-bottom))' : 3,
          pt: appMode ? 2.5 : 1.5,
          gap: appMode ? 1.5 : 1,
        }}
      >
        <Button
          variant="outlined"
          color="inherit"
          disabled={submitting}
          onClick={onCancel}
          sx={{
            minHeight: appMode ? 88 : 54,
            minWidth: appMode ? 150 : 96,
            borderRadius: appMode ? 2.5 : undefined,
            fontSize: appMode ? '1.25rem' : undefined,
            fontWeight: 900,
          }}
        >
          {t('cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={submitting}
          onClick={onSubmit}
          sx={{
            flex: 1,
            minHeight: appMode ? 88 : 54,
            borderRadius: appMode ? 2.5 : undefined,
            bgcolor: '#03c75a',
            fontSize: appMode ? '1.35rem' : undefined,
            fontWeight: 950,
            boxShadow: 'none',
            '&:hover': { bgcolor: '#03b351' },
          }}
        >
          {submitting ? t('processing') : t('completeCheckIn')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
