import { useReducer, type ReactNode } from "react";
import { initialState, reducePreview } from "./model";
import { PreviewContext } from "./context";
export function PreviewProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducePreview, undefined, initialState);
  return (
    <PreviewContext.Provider value={{ state, dispatch }}>
      {children}
    </PreviewContext.Provider>
  );
}
