import type React from "react"

export const ControlGroup = ({
  label,
  children,
  icon,
  description,
}: {
  label: string
  children: React.ReactNode
  icon?: React.ReactNode
  description?: string
}) => (
  <div className="space-y-3">
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {icon && <div className="text-primary">{icon}</div>}
        <h3 className="text-sm font-semibold text-sidebar-foreground tracking-tight">{label}</h3>
      </div>
      {description && <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>}
    </div>
    <div className="pl-0">{children}</div>
  </div>
)
