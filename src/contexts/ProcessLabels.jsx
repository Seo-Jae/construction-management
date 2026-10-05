import { createContext, useContext, useCallback } from 'react';

export const ProcessLabelsContext = createContext({});
export function useProcessLabel() {
  const labels = useContext(ProcessLabelsContext);
  return useCallback(name => Object.hasOwn(labels, name) ? labels[name] : name, [labels]);
}
