import { Badge } from '@/components/ui/badge';
import { CircleCheck, CircleDashed, CircleX, Copy, LoaderCircle } from 'lucide-react';
import { labels } from './model';

export default function WorkStatusBadge({ status, decision }: { status: string; decision?: string | null }) {
  const rejected = status === 'DUPLICATE' && decision === 'REJECT_DUPLICATE';
  const Icon = status === 'DONE' ? CircleCheck : status === 'FAILED' || rejected ? CircleX : status === 'IN_PROGRESS' ? LoaderCircle : status === 'DUPLICATE' ? Copy : CircleDashed;
  return <Badge className="op-work-status gap-1.5" data-status={rejected ? 'FAILED' : status}><Icon className="size-3.5" aria-hidden="true" />{labels[status] || status}{rejected ? ' DITOLAK' : ''}</Badge>;
}
