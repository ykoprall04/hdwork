import {
  useCallback,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { initialState, reducePreview, type Action } from "./model";
import { PreviewContext } from "./context";
import { loadPreview, savePreview } from "./persistence";
import { createClaimService, type ClaimRequest } from "./claim-service";
export function PreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => {
    try {
      return loadPreview(window.localStorage);
    } catch {
      return initialState();
    }
  });
  const current = useRef(state);
  const [storageError, setStorageError] = useState<string | null>(null);
  const dispatch = useCallback((action: Action) => {
    const next = reducePreview(current.current, action);
    if (next === current.current) return;
    current.current = next;
    setState(next);
    try {
      setStorageError(savePreview(window.localStorage, next));
    } catch {
      setStorageError(
        "Penyimpanan demo diblokir browser; data hanya bertahan pada sesi ini.",
      );
    }
  }, []);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const service = useRef<ReturnType<typeof createClaimService> | null>(null);
  useEffect(() => {
    service.current = createClaimService(() => current.current, dispatch);
  }, [dispatch]);
  const claimOrder = useCallback(async (request: ClaimRequest) => {
    const result = await (service.current?.(request) ??
      Promise.resolve({ ok: false, message: "Service PICK belum siap." }));
    setToast(result.message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
    return result;
  }, []);
  return (
    <PreviewContext.Provider
      value={{ state, dispatch, claimOrder, storageError }}
    >
      {children}
      {toast && (
        <div
          role="status"
          aria-label="Hasil PICK"
          className="fixed right-4 bottom-4 z-[80] max-w-sm rounded-xl border border-primary/20 bg-background p-4 text-sm text-primary shadow-lg"
        >
          {toast}
        </div>
      )}
    </PreviewContext.Provider>
  );
}
