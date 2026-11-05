import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { categories } from "../operations/demo-data";
import type { WorkspaceCategory } from "./workspace-navigation";
export default function WorkspacePicker({
  category,
  onSelect,
  onAll,
}: {
  category: WorkspaceCategory | null;
  onSelect: (category: WorkspaceCategory) => void;
  onAll: () => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Pilih kategori pekerjaan"
        render={
          <Button
            variant="outline"
            className="h-10 min-w-40 justify-between gap-3 bg-card text-xs"
          />
        }
      >
        <span>{category ? `HD ${category}` : "Pilih Pekerjaan"}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          sideOffset={8}
          align="start"
          collisionPadding={12}
          className="z-[90]"
        >
          <Menu.Popup
            aria-label="Kategori pekerjaan"
            className="min-w-56 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl outline-none"
          >
            <Menu.RadioGroup value={category ?? ""}>
              {categories.map((value) => (
                <Menu.RadioItem
                  key={value}
                  value={value}
                  closeOnClick
                  onClick={() => onSelect(value)}
                  className="flex cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-3 text-sm outline-none data-[highlighted]:bg-muted"
                >
                  <span>HD {value}</span>
                  <Menu.RadioItemIndicator>
                    <Check className="size-4 text-primary" />
                  </Menu.RadioItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
            <Menu.Separator className="my-1 border-t" />
            <Menu.Item
              onClick={onAll}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-3 text-xs text-muted-foreground outline-none data-[highlighted]:bg-muted"
            >
              <LayoutGrid className="size-4" />
              Lihat Semua Pekerjaan
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
