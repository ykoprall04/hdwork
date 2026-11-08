export type OrderStatus = 'WAITING' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'DUPLICATE';
export type WorkflowOrder = { id: string; command?: string | null; module: 'TIAL' | 'LOGIC_PSB' | 'LOGIC_MO'; date: string; status: OrderStatus; scIn: string | null; inetMasked: string | null; sto: null; duplicateOf: string | null; receivedAt: string | null; startedAt: string | null; finishedAt: string | null };
export type ReadMetadata = { source: 'HDWORK2'; readOnly: true; dateBasis: 'telegram_business_day_jakarta'; actions: Record<'PICK' | 'CEK' | 'RECEK' | 'DONE' | 'GAGAL', false> };
export type OrderResult = ReadMetadata & { data: WorkflowOrder[]; page: number; pageSize: number; hasMore: boolean; stoFilterAvailable: false };
export type OrderDetail = ReadMetadata & { data: WorkflowOrder; previous?: {id:string;status:OrderStatus;hd:string} | null; duplicateDecisions?: {continueCheck:false;rejectDuplicate:false} };
export type StatusHistory = ReadMetadata & { data: { id: string; action: string; fromStatus: OrderStatus | null; toStatus: OrderStatus | null; at: string }[]; page: number; pageSize: number; hasMore: boolean };
export const statusLabels: Record<OrderStatus,string> = {WAITING:'MENUNGGU',IN_PROGRESS:'PROSES CEK',DONE:'DONE',FAILED:'GAGAL',DUPLICATE:'DUPLICATE'};
export function reconcileOrders(previous: OrderResult | null, next: OrderResult): OrderResult {
  if (!previous) return next;
  const old = new Map(previous.data.map(row=>[row.id,row]));
  const data = next.data.map(row=>{const before=old.get(row.id);return before && JSON.stringify(before)===JSON.stringify(row) ? before : row;});
  const unchanged = data.length===previous.data.length && data.every((row,index)=>row===previous.data[index]);
  return unchanged && JSON.stringify({...previous,data:[]})===JSON.stringify({...next,data:[]}) ? previous : {...next,data};
}
