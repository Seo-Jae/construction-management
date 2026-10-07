import { useState } from 'react';
import { Autocomplete, Box, Button, Checkbox, FormControlLabel, TextField, Typography } from '@mui/material';

const fields = [['process', '공정'], ['location', '위치'], ['workContent', '작업내용']];

export default function WorkerBulkEditor({ count, processOptions, onApply, onClose }) {
  const [enabled, setEnabled] = useState({ process: true, location: false, workContent: false });
  const [values, setValues] = useState({ process: '', location: '', workContent: '' });
  return <Box sx={{ p: 1.25, mb: 1, border: '1px solid #7dd3fc', borderRadius: 1, bgcolor: '#f0f9ff', flexShrink: 0, maxHeight: '30vh', overflowY: 'auto' }}>
    <Typography sx={{ fontWeight: 800, fontSize: 13, mb: 0.75 }}>선택한 {count}명 일괄 수정</Typography>
    <Box sx={{ display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', gap: 1 }}>
      {fields.map(([field, label]) => <Box key={field} sx={{ flex: field === 'workContent' ? '2 1 240px' : '1 1 160px', minWidth: 0 }}>
        <FormControlLabel sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12 } }}
          control={<Checkbox size="small" sx={{ p: 0.4 }} checked={enabled[field]}
            onChange={(_, checked) => setEnabled(previous => ({ ...previous, [field]: checked }))} />}
          label={`${label} 변경`} />
        {field === 'process' ? <Autocomplete freeSolo options={processOptions} disabled={!enabled[field]}
          inputValue={values[field]} onInputChange={(_, value) => setValues(previous => ({ ...previous, [field]: value }))}
          renderInput={params => <TextField {...params} size="small" label={label} sx={{ bgcolor: '#fff' }} />} />
          : <TextField fullWidth size="small" disabled={!enabled[field]} label={label} value={values[field]}
            onChange={event => setValues(previous => ({ ...previous, [field]: event.target.value }))} sx={{ bgcolor: '#fff' }} />}
      </Box>)}
      <Button variant="contained" size="small" disabled={!count || !Object.values(enabled).some(Boolean)}
        onClick={() => onApply(Object.fromEntries(fields.filter(([field]) => enabled[field]).map(([field]) => [field, values[field]])))}>선택 행에 적용</Button>
      <Button size="small" onClick={onClose}>취소</Button>
    </Box>
    <Typography sx={{ mt: 0.75, fontSize: 11, color: '#475569' }}>체크한 항목만 바뀝니다. 빈 값으로 적용하면 해당 내용을 지웁니다. 변경 후 하단의 저장을 눌러주세요.</Typography>
  </Box>;
}
