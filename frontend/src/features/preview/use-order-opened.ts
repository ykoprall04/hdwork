import { useEffect } from "react";
import { usePreview } from "./context";
export function useOrderOpened(orderId: string | undefined) {
  const { state, dispatch } = usePreview();
  const order = state.orders.find((o) => o.monitoringId === orderId);
  const user = state.sessionId;
  const unopened =
    !!user && order?.handlerAlias === user && order.unopenedBy.includes(user);
  useEffect(() => {
    const mark = () => {
      if (unopened && orderId && document.visibilityState === "visible")
        dispatch({ type: "order-opened", id: orderId });
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [unopened, orderId, dispatch]);
}
