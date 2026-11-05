import { createContext, useContext, type Dispatch } from "react";
import type { createClaimService } from "./claim-service";
import type { State, Action } from "./model";
export const PreviewContext = createContext<{
  state: State;
  dispatch: Dispatch<Action>;
  claimOrder: ReturnType<typeof createClaimService>;
  storageError: string | null;
} | null>(null);
export function usePreview() {
  const context = useContext(PreviewContext);
  if (!context) throw new Error("PreviewProvider diperlukan");
  return context;
}
