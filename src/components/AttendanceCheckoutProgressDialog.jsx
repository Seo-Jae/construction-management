import {
  Alert,
  Box,
  Button,
  Chip,
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

const makeScopeKey = (building, floor) =>
  `${String(building || '').trim()}\u001f${Number(floor) || 0}`;

const summarizeScopes = (scopes, t) => {
  const grouped = new Map();
  scopes.forEach((scope) => {
    const building = String(scope?.building || '').trim();
    const floor = Number(scope?.floor);
    if (!building || !floor) return;
    if (!grouped.has(building)) grouped.set(building, new Set());
    grouped.get(building).add(floor);
  });

  return Array.from(grouped.entries()).map(([building, floorSet]) => {
    const floors = Array.from(floorSet).sort((a, b) => a - b);
    const ranges = [];
    let start = floors[0];
    let end = floors[0];

    floors.slice(1).forEach((floor) => {
      if (floor === end + 1) {
        end = floor;
        return;
      }
      ranges.push({ start, end });
      start = floor;
      end = floor;
    });
    if (start) ranges.push({ start, end });

    return {
      building,
      label: `${normalizeBuildingValue(building)}${t('buildingSuffix')} ${ranges
        .map((range) => range.start === range.end
          ? t('floorNumber', { floor: range.start })
          : t('floorRangeShort', { start: range.start, end: range.end }))
        .join(', ')}`,
    };
  });
};

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
  onSelectFloorUnits,
  onClearFloorUnits,
  onAddScopeRange,
  onRemoveScope,
  onCancel,
  onSubmit,
}) {
  const processOptions = Array.isArray(context?.progress_process_options)
    ? context.progress_process_options
    : [];
  const baseScopes = Array.isArray(context?.work_scopes)
    ? context.work_scopes
    : [];
  const additionalScopes = Array.isArray(draft.additionalScopes)
    ? draft.additionalScopes
    : [];
  const mergedScopeMap = new Map();
  [...baseScopes, ...additionalScopes].forEach((scope) => {
    const building = String(scope?.building || '').trim();
    const floor = Number(scope?.floor);
    if (!building || !floor) return;
    const key = makeScopeKey(building, floor);
    if (!mergedScopeMap.has(key)) {
      mergedScopeMap.set(key, {
        ...scope,
        building,
        floor,
        scope_source: scope.scope_source || 'check_in',
      });
    }
  });
  const scopes = Array.from(mergedScopeMap.values()).sort((left, right) =>
    String(left.building).localeCompare(String(right.building), 'ko') ||
    Number(left.floor) - Number(right.floor));
  const selectedUnitKeys = draft.selectedUnitKeys instanceof Set
    ? draft.selectedUnitKeys
    : new Set();
  const completedRows = Array.isArray(context?.completed_units)
    ? context.completed_units
    : [];
  const plannedRows = Array.isArray(context?.planned_units)
    ? context.planned_units
    : [];
  const canSubmitProgress = Boolean(context?.can_submit_progress);
  const buildingOptions = Array.isArray(context?.buildings)
    ? context.buildings
    : [];
  const addBuilding = buildingOptions.find(
    (item) => item.building_name === draft.addBuilding,
  );
  const addFloorCount = Math.max(0, Number(addBuilding?.floors || 0));
  const addFloors = Array.from(
    { length: addFloorCount },
    (_unused, index) => index + 1,
  );
  const summaryScopes = summarizeScopes(baseScopes, t);
  const locationLabel = context?.work_location_mode === 'standard'
    ? summaryScopes.map((item) => item.label).join(' · ')
    : context?.work_location_text || t('otherWorkLocation');
  const largeSelectSx = appMode ? {
    '& .MuiInputBase-root': { minHeight: 82, fontSize: '1.4rem', borderRadius: 2.5 },
    '& .MuiInputLabel-root': { fontSize: '1.15rem' },
  } : undefined;

  return (
    <Dialog
      open={open}
      data-attendance-checkout-progress="v52.48.5.10"
      fullScreen={appMode}
      fullWidth
      maxWidth="md"
      disableEscapeKeyDown={submitting}
      onClose={(_event, reason) => {
        if (submitting || reason === 'backdropClick') return;
        onCancel();
      }}
      PaperProps={{ sx: { borderRadius: appMode ? 0 : 3, bgcolor: '#ffffff' } }}
    >
      <DialogTitle
        sx={{
          width: appMode ? '90%' : 'auto',
          mx: appMode ? 'auto' : 0,
          px: appMode ? 0 : 3,
          pt: appMode ? 'calc(90px + env(safe-area-inset-top))' : 3,
          pb: appMode ? 3 : 1.5,
        }}
      >
        <Typography sx={{ fontSize: appMode ? '3rem' : '1.35rem', lineHeight: 1.1, fontWeight: 950, letterSpacing: appMode ? '-0.04em' : undefined }}>
          {t('checkoutProgressTitle')}
        </Typography>
        <Typography sx={{ mt: appMode ? 1.6 : 0.7, color: '#64748b', fontSize: appMode ? '1.3rem' : '0.84rem', lineHeight: 1.65 }}>
          {t('checkoutProgressSubtitleMulti')}
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
        <Stack spacing={appMode ? 3.2 : 2}>
          <Paper variant="outlined" sx={{ p: appMode ? 2.7 : 1.7, borderRadius: 2.5, bgcolor: '#f8fafc' }}>
            <Typography sx={{ color: '#64748b', fontSize: appMode ? '1.05rem' : '0.72rem', fontWeight: 800 }}>
              {t('todayWorkSummary')}
            </Typography>
            <Typography sx={{ mt: 0.8, fontSize: appMode ? '1.5rem' : '0.92rem', fontWeight: 950, lineHeight: 1.55 }}>
              {locationLabel || t('progressUnavailableBuilding')}
            </Typography>
            <Typography sx={{ mt: 0.45, color: '#475569', fontSize: appMode ? '1.2rem' : '0.8rem', fontWeight: 800 }}>
              {getAttendanceTradeLabel(language, context?.work_trade_name)}
            </Typography>
          </Paper>

          {canSubmitProgress ? (
            <>
              <Box>
                <Typography sx={{ fontSize: appMode ? '1.5rem' : '0.96rem', fontWeight: 950 }}>
                  {t('completedUnitsQuestion')}
                </Typography>
                <Stack direction="row" spacing={appMode ? 1.5 : 1} sx={{ mt: appMode ? 1.6 : 1 }}>
                  <Button
                    fullWidth
                    variant={draft.completionState === 'submitted' ? 'contained' : 'outlined'}
                    onClick={() => onChange({ completionState: 'submitted' })}
                    sx={{
                      minHeight: appMode ? 78 : 52,
                      borderRadius: 2.5,
                      bgcolor: draft.completionState === 'submitted' ? '#03c75a' : undefined,
                      borderColor: '#03c75a',
                      color: draft.completionState === 'submitted' ? '#ffffff' : '#047857',
                      fontSize: appMode ? '1.28rem' : '0.86rem',
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
                      selectedUnitKeys: new Set(),
                      additionalScopes: [],
                    })}
                    sx={{
                      minHeight: appMode ? 78 : 52,
                      borderRadius: 2.5,
                      bgcolor: draft.completionState === 'none' ? '#334155' : undefined,
                      color: draft.completionState === 'none' ? '#ffffff' : '#334155',
                      fontSize: appMode ? '1.28rem' : '0.86rem',
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
                    <FormControl fullWidth sx={largeSelectSx}>
                      <InputLabel>{t('progressProcess')}</InputLabel>
                      <Select
                        label={t('progressProcess')}
                        value={draft.progressProcessType}
                        onChange={(event) => onChange({
                          progressProcessType: event.target.value,
                          selectedUnitKeys: new Set(),
                        })}
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
                      <Typography sx={{ mt: 0.5, fontSize: appMode ? '1.45rem' : '0.9rem', fontWeight: 950 }}>
                        {getAttendanceProgressProcessLabel(language, draft.progressProcessType)}
                      </Typography>
                    </Paper>
                  )}

                  {draft.progressProcessType && scopes.map((scope) => {
                    const localSelectedUnits = new Set(
                      Array.from(selectedUnitKeys)
                        .filter((key) => key.startsWith(`${scope.building}\u001f`))
                        .map((key) => key.slice(key.indexOf('\u001f') + 1))
                        .filter((unit) => Number(String(unit).slice(0, -2)) === scope.floor),
                    );
                    const localCompletedUnits = new Set(
                      completedRows
                        .filter((item) =>
                          item?.process_type === draft.progressProcessType &&
                          item?.building === scope.building &&
                          Number(item?.floor) === scope.floor)
                        .map((item) => String(item.unit)),
                    );
                    const localPlannedUnits = new Set(
                      plannedRows
                        .filter((item) =>
                          item?.building === scope.building &&
                          Number(item?.floor) === scope.floor)
                        .map((item) => String(item.unit)),
                    );
                    const added = scope.scope_source === 'checkout_added';

                    return (
                      <Paper key={makeScopeKey(scope.building, scope.floor)} variant="outlined" sx={{ p: appMode ? 2.4 : 1.6, borderRadius: 3, borderColor: added ? '#f59e0b' : '#cbd5e1' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                          <Chip
                            size={appMode ? 'medium' : 'small'}
                            color={added ? 'warning' : 'primary'}
                            variant={added ? 'filled' : 'outlined'}
                            label={added ? t('checkoutAddedScope') : t('checkoutBaseScope')}
                            sx={{ fontWeight: 900, fontSize: appMode ? '1rem' : undefined }}
                          />
                          {added && (
                            <Button color="error" size="small" onClick={() => onRemoveScope(scope)} sx={{ fontWeight: 900 }}>
                              {t('removeWorkFloor')}
                            </Button>
                          )}
                        </Stack>
                        <AttendanceProgressFloorGrid
                          building={normalizeBuildingValue(scope.building)}
                          floor={scope.floor}
                          config={scope.config_json || {}}
                          selectedUnits={localSelectedUnits}
                          completedUnits={localCompletedUnits}
                          plannedUnits={localPlannedUnits}
                          appMode={appMode}
                          t={t}
                          onToggle={(unit) => onToggleUnit(scope, unit)}
                          onSelectAll={(units) => onSelectFloorUnits(scope, units)}
                          onClear={(units) => onClearFloorUnits(scope, units)}
                        />
                      </Paper>
                    );
                  })}

                  {draft.progressProcessType && (
                    <Paper variant="outlined" sx={{ p: appMode ? 2.5 : 1.7, borderRadius: 3, borderStyle: 'dashed', borderColor: '#f59e0b', bgcolor: '#fffbeb' }}>
                      <Typography sx={{ fontSize: appMode ? '1.4rem' : '0.95rem', fontWeight: 950 }}>
                        {t('addOtherBuildingWork')}
                      </Typography>
                      <Typography sx={{ mt: 0.5, color: '#64748b', fontSize: appMode ? '1.05rem' : '0.75rem', lineHeight: 1.6 }}>
                        {t('addOtherBuildingWorkGuide')}
                      </Typography>
                      <Stack spacing={appMode ? 2 : 1.2} sx={{ mt: appMode ? 2 : 1.3 }}>
                        <FormControl fullWidth sx={largeSelectSx}>
                          <InputLabel>{t('building')}</InputLabel>
                          <Select
                            label={t('building')}
                            value={draft.addBuilding}
                            onChange={(event) => onChange({ addBuilding: event.target.value, addFloorStart: '', addFloorEnd: '' })}
                          >
                            {buildingOptions.map((item) => (
                              <MenuItem key={item.building_name} value={item.building_name}>
                                {normalizeBuildingValue(item.building_name)}{t('buildingSuffix')}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Stack direction="row" spacing={1.2}>
                          <FormControl fullWidth disabled={!draft.addBuilding} sx={largeSelectSx}>
                            <InputLabel>{t('workFloorStart')}</InputLabel>
                            <Select
                              label={t('workFloorStart')}
                              value={draft.addFloorStart}
                              onChange={(event) => {
                                const start = Number(event.target.value);
                                onChange({
                                  addFloorStart: start,
                                  addFloorEnd: Math.max(start, Number(draft.addFloorEnd) || start),
                                });
                              }}
                            >
                              {addFloors.map((floor) => <MenuItem key={floor} value={floor}>{t('floorNumber', { floor })}</MenuItem>)}
                            </Select>
                          </FormControl>
                          <FormControl fullWidth disabled={!draft.addFloorStart} sx={largeSelectSx}>
                            <InputLabel>{t('workFloorEnd')}</InputLabel>
                            <Select
                              label={t('workFloorEnd')}
                              value={draft.addFloorEnd}
                              onChange={(event) => onChange({ addFloorEnd: Number(event.target.value) })}
                            >
                              {addFloors
                                .filter((floor) => floor >= Number(draft.addFloorStart || 0))
                                .map((floor) => <MenuItem key={floor} value={floor}>{t('floorNumber', { floor })}</MenuItem>)}
                            </Select>
                          </FormControl>
                        </Stack>
                        <Button
                          variant="contained"
                          color="warning"
                          disabled={!draft.addBuilding || !draft.addFloorStart || !draft.addFloorEnd}
                          onClick={onAddScopeRange}
                          sx={{ minHeight: appMode ? 70 : 48, fontSize: appMode ? '1.2rem' : undefined, fontWeight: 950, boxShadow: 'none' }}
                        >
                          {t('addWorkRange')}
                        </Button>
                      </Stack>
                    </Paper>
                  )}
                </>
              )}
            </>
          ) : (
            <Alert severity="info" sx={{ fontSize: appMode ? '1.18rem' : '0.8rem', lineHeight: 1.7 }}>
              {t(unavailableTranslationKey(context?.progress_unavailable_reason))}
            </Alert>
          )}

          <Alert severity="warning" sx={{ fontSize: appMode ? '1.08rem' : '0.76rem', lineHeight: 1.7 }}>
            {t('progressApprovalGuide')}
          </Alert>
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          width: appMode ? '90%' : 'auto',
          mx: appMode ? 'auto' : 0,
          px: appMode ? 0 : 3,
          pb: appMode ? 'calc(34px + env(safe-area-inset-bottom))' : 3,
          pt: appMode ? 2.2 : 1.5,
          gap: appMode ? 2 : 1,
        }}
      >
        <Button
          variant="outlined"
          color="inherit"
          disabled={submitting}
          onClick={onCancel}
          sx={{ minHeight: appMode ? 92 : 54, minWidth: appMode ? 155 : 96, borderRadius: 2.5, fontSize: appMode ? '1.35rem' : undefined, fontWeight: 900 }}
        >
          {t('cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={submitting || (canSubmitProgress && !draft.completionState)}
          onClick={onSubmit}
          sx={{
            flex: 1,
            minHeight: appMode ? 92 : 54,
            borderRadius: 2.5,
            bgcolor: '#03c75a',
            fontSize: appMode ? '1.5rem' : undefined,
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
