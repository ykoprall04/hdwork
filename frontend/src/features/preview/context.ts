import { createContext, useContext, type Dispatch } from "react";
import type { State, Action } from "./model";
export const PreviewContext = createContext<{
  state: State;
  dispatch: Dispatch<Action>;
} | null>(null);
export function usePreview() {
  const context = useContext(PreviewContext);
  if (!context) throw new Error("PreviewProvider diperlukan");
  return context;
}
