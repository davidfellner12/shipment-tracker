// Workspace (operator vs. customer), theme and polling helpers.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const SessionContext = createContext(null);

const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } };

export function SessionProvider({ children }) {
  // workspace: 'operator' or a customerId. In production this comes from the
  // signed-in user's Cognito claims; here it is a demo switch.
  const [workspace, setWorkspaceState] = useState(() => read('tracelane.workspace', 'operator'));
  const [dark, setDarkState] = useState(() => document.documentElement.classList.contains('dark'));

  const setWorkspace = useCallback((w) => { setWorkspaceState(w); write('tracelane.workspace', w); }, []);
  const setDark = useCallback((d) => {
    setDarkState(d);
    document.documentElement.classList.toggle('dark', d);
    write('tracelane.theme', d ? 'dark' : 'light');
  }, []);

  const isOperator = workspace === 'operator';
  const customerId = isOperator ? null : workspace;
  return (
    <SessionContext.Provider value={{ workspace, setWorkspace, isOperator, customerId, dark, setDark }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);

/** Poll an async loader; re-runs immediately when deps change. */
export function usePoll(loader, deps, intervalMs = 2000) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const saved = useRef(loader);
  saved.current = loader;

  useEffect(() => {
    let alive = true, timer;
    setState((s) => ({ ...s, loading: true }));
    const run = async () => {
      try {
        const data = await saved.current();
        if (alive) setState({ data, error: null, loading: false });
      } catch (err) {
        if (alive) setState((s) => ({ ...s, error: err.message, loading: false }));
      }
      if (alive && intervalMs) timer = setTimeout(run, intervalMs);
    };
    run();
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
