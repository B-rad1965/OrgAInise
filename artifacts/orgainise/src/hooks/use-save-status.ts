import { useState, useEffect, useRef } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveStatusState {
  status: SaveStatus;
  lastSaved: Date | null;
  errorMsg: string | null;
}

export function useSaveStatus(): SaveStatusState {
  const [status, setStatus]     = useState<SaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { phase, timestamp, message } = (e as CustomEvent<{
        phase: 'start' | 'success' | 'error';
        timestamp?: number;
        message?: string;
      }>).detail ?? {};

      if (phase === 'start') {
        if (timer.current) clearTimeout(timer.current);
        setStatus('saving');
      } else if (phase === 'success') {
        setStatus('saved');
        setLastSaved(timestamp ? new Date(timestamp) : new Date());
        setErrorMsg(null);
        timer.current = setTimeout(() => setStatus('idle'), 2500);
      } else if (phase === 'error') {
        setStatus('error');
        setErrorMsg(message ?? 'Storage write failed');
        if (timer.current) clearTimeout(timer.current);
      }
    };

    window.addEventListener('orgainise:write', handler);
    return () => {
      window.removeEventListener('orgainise:write', handler);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { status, lastSaved, errorMsg };
}
