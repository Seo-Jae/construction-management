import { useState } from 'react';
import { readFolderState, writeFolderState } from '../utils/sidebarMenuPreferences.js';

export default function useSidebarFolder(userId, folder) {
  const [open, setOpen] = useState(() => readFolderState(userId, folder));
  const update = (value) => {
    const next = typeof value === 'function' ? value(open) : value;
    writeFolderState(userId, folder, next);
    setOpen(next);
  };
  return [open, update];
}
