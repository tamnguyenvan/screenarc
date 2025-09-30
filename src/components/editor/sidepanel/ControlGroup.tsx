import React from 'react';

export const ControlGroup = ({
  label,
  children,
  icon,
  description
}: {
  label: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  description?: string;
}) => (
  <div className="space-y-4">
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-bold text-sidebar-foreground uppercase tracking-wide">
          {label}
        </h3>
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
    <div className="pl-0">
      {children}
    </div>
  </div>
);