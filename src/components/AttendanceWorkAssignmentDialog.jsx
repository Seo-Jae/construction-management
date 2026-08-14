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
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ATTENDANCE_TRADE_OPTIONS } from '../utils/attendance';
import { getAttendanceTradeLabel } from '../utils/attendanceI18n';
import AttendanceProgressFloorGrid from './AttendanceProgressFloorGrid.jsx';

const normalizeBuildingLabel = (buildingName, suffix) => {
  const value = String(buildingName || '').trim();
  if (!value) return '';
  if (value.endsWith('동')) {
    return `${value.slice(0, -1)}${suffix}`;
  }
  return `${value}${suffix}`;
};

const buildFloorRange = (startValue, endValue) => {
  const start = Number(startValue);
  const end = Number(endValue);
  if (!start || !end || end < start) return [];
  return Array.from({ length: end - start + 1 }, (_unused, index) => start + index);
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
  onToggleUnit,
  onSelectFloorUnits,
  onClearFloorUnits,
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
  const largeSelectMenuProps = appMode
    ? {
        PaperProps: {
          sx: {
            '& .MuiMenuItem-root': {
              minHeight: 66,
              fontSize: '1.45rem',
            },
          },
        },
      }
    : undefined;

  return (
    <Dialog
      open={open}
      data-attendance-work-assignment-scale="v52.48.5.10"
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
          pt: appMode ? 'calc(150px + env(safe-area-inset-top))' : 3,
          pb: appMode ? 4.5 : 1.25,
        }}
      >
        <Typography sx={{ fontSize: appMode ? '3.25rem' : '1.2rem', lineHeight: 1.1, fontWeight: 950, letterSpacing: appMode ? '-0.04em' : undefined }}>
          {t('workAssignmentTitle')}
        </Typography>
        <Typography sx={{ mt: appMode ? 2 : 0.7, color: '#64748b', fontSize: appMode ? '1.42rem' : '0.82rem', lineHeight: 1.65 }}>
          {t('workAssignmentSubtitle')}
        </Typography>
      </DialogTitle>

      <DialogContent
        sx={{
          width: appMode ? '90%' : 'auto',
          mx: appMode ? 'auto' : 0,
          px: appMode ? '0 !important' : 3,
          pt: appMode ? '22px !important' : '12px !important',
          pb: appMode ? 3 : 2,
        }}
      >
        <Stack
          spacing={appMode ? 4.5 : 2.1}
          sx={appMode ? {
            '& .MuiInputBase-root': {
              minHeight: 94,
              fontSize: '1.85rem',
              borderRadius: 2.5,
            },
            '& .MuiInputLabel-root': {
              fontSize: '1.35rem',
            },
            '& .MuiFormHelperText-root': {
              mx: 0.5,
              fontSize: '1.15rem',
              lineHeight: 1.5,
            },
            '& .MuiFormControlLabel-label': {
              fontSize: '1.48rem',
              fontWeight: 700,
            },
            '& .MuiCheckbox-root .MuiSvgIcon-root': {
              fontSize: '2.65rem',
            },
          } : undefined}
        >
          <Alert
            severity="info"
            sx={{
              minHeight: appMode ? 76 : undefined,
              alignItems: 'center',
              fontSize: appMode ? '1.25rem' : undefined,
              lineHeight: 1.65,
              '& .MuiAlert-icon': {
                fontSize: appMode ? '2rem' : undefined,
              },
            }}
          >
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
                    floorStart: '',
                    floorEnd: '',
                    floors: [],
                    scopeMode: 'whole_floor',
                    plannedUnitKeys: new Set(),
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
                <Alert severity="warning" sx={{ fontSize: appMode ? '1.25rem' : undefined, lineHeight: 1.65 }}>
                  {t('noBuildingDataUseOther')}
                </Alert>
              )}

              <FormControl fullWidth disabled={buildings.length === 0}>
                <InputLabel>{t('building')}</InputLabel>
                <Select
                  label={t('building')}
                  value={draft.building}
                  MenuProps={largeSelectMenuProps}
                  onChange={(event) => onChange({
                    building: event.target.value,
                    floorStart: '',
                    floorEnd: '',
                    floors: [],
                    scopeMode: 'whole_floor',
                    plannedUnitKeys: new Set(),
                  })}
                >
                  {buildings.map((item) => (
                    <MenuItem key={item.building_name} value={item.building_name}>
                      {normalizeBuildingLabel(item.building_name, t('buildingSuffix'))}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Stack direction="row" spacing={appMode ? 2 : 1.2}>
                <FormControl fullWidth disabled={!draft.building}>
                  <InputLabel>{t('workFloorStart')}</InputLabel>
                  <Select
                    label={t('workFloorStart')}
                    value={draft.floorStart}
                    MenuProps={largeSelectMenuProps}
                    onChange={(event) => {
                      const floorStart = Number(event.target.value);
                      const floorEnd = Math.max(floorStart, Number(draft.floorEnd) || floorStart);
                      onChange({
                        floorStart,
                        floorEnd,
                        floors: buildFloorRange(floorStart, floorEnd),
                        plannedUnitKeys: new Set(),
                      });
                    }}
                  >
                    {floors.map((floor) => (
                      <MenuItem key={floor} value={floor}>
                        {t('floorNumber', { floor })}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth disabled={!draft.building || !draft.floorStart}>
                  <InputLabel>{t('workFloorEnd')}</InputLabel>
                  <Select
                    label={t('workFloorEnd')}
                    value={draft.floorEnd}
                    MenuProps={largeSelectMenuProps}
                    onChange={(event) => {
                      const floorEnd = Number(event.target.value);
                      onChange({
                        floorEnd,
                        floors: buildFloorRange(draft.floorStart, floorEnd),
                        plannedUnitKeys: new Set(),
                      });
                    }}
                  >
                    {floors
                      .filter((floor) => floor >= Number(draft.floorStart || 0))
                      .map((floor) => (
                        <MenuItem key={floor} value={floor}>
                          {t('floorNumber', { floor })}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Stack>

              {draft.floors.length > 0 && (
                <Alert severity="success" sx={{ fontSize: appMode ? '1.2rem' : undefined, fontWeight: 800 }}>
                  {t('selectedFloorRange', {
                    start: draft.floors[0],
                    end: draft.floors[draft.floors.length - 1],
                    count: draft.floors.length,
                  })}
                </Alert>
              )}

              {draft.floors.length > 0 && (
                <Box>
                  <Typography sx={{ mb: appMode ? 1.5 : 1, fontSize: appMode ? '1.35rem' : '0.9rem', fontWeight: 950 }}>
                    {t('plannedUnitScope')}
                  </Typography>
                  <Stack direction="row" spacing={appMode ? 1.5 : 1}>
                    <Button
                      fullWidth
                      variant={draft.scopeMode === 'whole_floor' ? 'contained' : 'outlined'}
                      color="success"
                      onClick={() => onChange({ scopeMode: 'whole_floor', plannedUnitKeys: new Set() })}
                      sx={{ minHeight: appMode ? 74 : 48, fontSize: appMode ? '1.18rem' : undefined, fontWeight: 950 }}
                    >
                      {t('wholeSelectedFloors')}
                    </Button>
                    <Button
                      fullWidth
                      variant={draft.scopeMode === 'selected_units' ? 'contained' : 'outlined'}
                      color="inherit"
                      onClick={() => onChange({ scopeMode: 'selected_units', plannedUnitKeys: new Set() })}
                      sx={{ minHeight: appMode ? 74 : 48, fontSize: appMode ? '1.18rem' : undefined, fontWeight: 950 }}
                    >
                      {t('selectedUnitsOnly')}
                    </Button>
                  </Stack>
                </Box>
              )}

              {draft.scopeMode === 'selected_units' && draft.floors.map((floor) => {
                const selectedUnits = new Set(
                  Array.from(draft.plannedUnitKeys || [])
                    .filter((key) => key.startsWith(`${draft.building}\u001f`))
                    .map((key) => key.slice(key.indexOf('\u001f') + 1))
                    .filter((unit) => Number(String(unit).slice(0, -2)) === Number(floor)),
                );

                return (
                  <Paper key={`${draft.building}-${floor}`} variant="outlined" sx={{ p: appMode ? 2.2 : 1.5, borderRadius: 3 }}>
                    <AttendanceProgressFloorGrid
                      building={normalizeBuildingLabel(draft.building, '')}
                      floor={floor}
                      config={selectedBuilding?.config_json || {}}
                      selectedUnits={selectedUnits}
                      completedUnits={[]}
                      plannedUnits={[]}
                      appMode={appMode}
                      selectedLabelKey="plannedSelection"
                      t={t}
                      onToggle={(unit) => onToggleUnit(floor, unit)}
                      onSelectAll={(units) => onSelectFloorUnits(floor, units)}
                      onClear={(units) => onClearFloorUnits(floor, units)}
                    />
                  </Paper>
                );
              })}
            </>
          )}

          <FormControl fullWidth>
            <InputLabel>{t('workProcess')}</InputLabel>
            <Select
              label={t('workProcess')}
              value={draft.tradeName}
              MenuProps={largeSelectMenuProps}
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
            <Typography sx={{ color: '#64748b', fontSize: appMode ? '1.18rem' : '0.78rem', lineHeight: 1.65 }}>
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
          pt: appMode ? 3 : 1.5,
          gap: appMode ? 2 : 1,
        }}
      >
        <Button
          variant="outlined"
          color="inherit"
          disabled={submitting}
          onClick={onCancel}
          sx={{
            minHeight: appMode ? 108 : 54,
            minWidth: appMode ? 170 : 96,
            borderRadius: appMode ? 2.5 : undefined,
            fontSize: appMode ? '1.55rem' : undefined,
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
            minHeight: appMode ? 108 : 54,
            borderRadius: appMode ? 2.5 : undefined,
            bgcolor: '#03c75a',
            fontSize: appMode ? '1.7rem' : undefined,
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
