import { Menu } from '@base-ui/react/menu';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { workspaces } from './workspaces';
export default function WorkspacePicker({ category, select }: { category?: string; select: (value: string) => void }) {
  return <Menu.Root><Menu.Trigger render={<Button variant="outline" className="h-10 min-w-40 justify-between bg-card text-xs" />} aria-label="Pilih kategori pekerjaan">{category ? `HD ${category}` : 'Pilih Pekerjaan'}<ChevronDown className="size-4" /></Menu.Trigger><Menu.Portal><Menu.Positioner sideOffset={8} className="z-[90]"><Menu.Popup className="min-w-56 rounded-xl border bg-popover p-2 text-popover-foreground shadow-xl">{workspaces.map(value => <Menu.Item key={value} onClick={() => select(`/work/${value}`)} className="cursor-pointer rounded-lg px-3 py-3 text-sm data-[highlighted]:bg-muted">HD {value}</Menu.Item>)}<Menu.Item onClick={() => select('/jobs')} className="cursor-pointer border-t px-3 py-3 text-sm">Lihat Semua Pekerjaan</Menu.Item></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>;
}
