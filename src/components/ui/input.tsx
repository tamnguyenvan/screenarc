import * as React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  suffix?: string;
  prefix?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, helperText, suffix, prefix, ...props }, ref) => {
    const inputId = React.useId();

    return (
      <div className="space-y-2">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {prefix && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
              {prefix}
            </div>
          )}

          <input
            id={inputId}
            type={type}
            className={cn(
              "flex h-11 w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm font-medium text-foreground",
              "placeholder:text-muted-foreground/70",
              "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "transition-all duration-200",
              "hover:border-border/80 hover:bg-background/70",
              prefix && "pl-8",
              suffix && "pr-8",
              error && "border-destructive focus:border-destructive focus:ring-destructive/50",
              className
            )}
            ref={ref}
            {...props}
          />

          {suffix && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
              {suffix}
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive font-medium">
            {error}
          </p>
        )}

        {helperText && !error && (
          <p className="text-sm text-muted-foreground">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };