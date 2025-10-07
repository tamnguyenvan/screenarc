// src/components/ui/collapse.tsx
import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { ChevronDownIcon } from "lucide-react"

interface CollapseProps {
  title: string
  description?: string
  icon?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}

export function Collapse({
  title,
  description,
  icon,
  defaultOpen = true,
  children,
  className = "",
}: CollapseProps) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <CollapsiblePrimitive.Root
      open={open}
      onOpenChange={setOpen}
      className={`collapse-root ${className}`}
    >
      <CollapsiblePrimitive.Trigger className="collapse-trigger group">
        <div className="flex items-center gap-3 flex-1">
          {icon && (
            <div className="w-5 h-5 flex items-center justify-center text-primary flex-shrink-0">
              {icon}
            </div>
          )}
          <div className="flex-1 text-left">
            <div className="text-sm font-medium text-sidebar-foreground">
              {title}
            </div>
            {description && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {description}
              </div>
            )}
          </div>
        </div>
        <ChevronDownIcon className="collapse-chevron" />
      </CollapsiblePrimitive.Trigger>

      <CollapsiblePrimitive.Content className="collapse-content">
        <div className="collapse-content-inner">{children}</div>
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  )
}