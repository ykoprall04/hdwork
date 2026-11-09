import {workDuration,type Work,type Feedback} from './model';
export function WorkTimer({order,now}:{order:Work;now:number}){return <>{workDuration(order,now)}</>;}
export function FeedbackStatus({feedback}:{feedback?:Feedback|null}){return <p className="mt-1 text-[10px] text-muted-foreground" title={feedback?.errorCode||undefined}>Feedback Telegram terakhir: {feedback?feedback.status==='TIDAK_PASTI'?'TIDAK PASTI - perlu tinjauan':feedback.status:'Belum ada pengiriman tercatat'}</p>;}
