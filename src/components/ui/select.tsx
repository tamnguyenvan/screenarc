import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    label?: string;
    error?: string;
    helperText?: string;
    variant?: 'default' | 'minimal';
  }
>(({ className, children, label, error, helperText, variant = 'default', ...props }, ref) => {
  const selectId = React.useId();

  if (variant === 'minimal') {
    return (
      <SelectPrimitive.Trigger
        id={selectId}
        ref={ref}
        className={cn(
          // Base styles - compact và clean hơn
          "flex h-9 w-full items-center justify-between rounded-lg",
          "border border-border/40 bg-background/40 backdrop-blur-sm",
          "px-2.5 text-sm font-medium text-foreground/90",

          // Focus states - subtle ring
          "focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50",

          // Hover states
          "hover:bg-background/60 hover:border-border/60",

          // Disabled state
          "disabled:cursor-not-allowed disabled:opacity-50",

          // Smooth transitions
          "transition-all duration-200",

          // Active/open state
          "data-[state=open]:border-primary/50 data-[state=open]:ring-1 data-[state=open]:ring-primary/30 data-[state=open]:bg-background/60",

          className
        )}
        {...props}
      >
        {children}
        <SelectPrimitive.Icon asChild>
          {/* ChevronDown nhỏ hơn và subtle hơn */}
          <ChevronDown className="h-3 w-3 opacity-40 shrink-0 transition-transform duration-200 data-[state=open]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
    );
  }

  // Default variant giữ nguyên như cũ
  return (
    <div className="space-y-2">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-foreground"
        >
          {label}
        </label>
      )}

      <SelectPrimitive.Trigger
        id={selectId}
        ref={ref}
        className={cn(
          "flex h-11 w-full items-center justify-between rounded-lg border border-border bg-input/50 px-3 py-2 text-sm font-medium text-foreground",
          "placeholder:text-muted-foreground/70",
          "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-all duration-200",
          "hover:border-border/80 hover:bg-input/70",
          "data-[state=open]:border-primary/50 data-[state=open]:ring-2 data-[state=open]:ring-primary/50",
          error && "border-destructive focus:border-destructive focus:ring-destructive/50",
          className
        )}
        {...props}
      >
        {children}
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 opacity-50 transition-transform duration-200 data-[state=open]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

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
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      'flex cursor-default items-center justify-center py-1',
      className
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      'flex cursor-default items-center justify-center py-1',
      className
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        // Base styling - softer shadows, more blur
        'relative z-50 max-h-96 min-w-[8rem] overflow-hidden',
        'rounded-xl border border-border/60 bg-card/98 backdrop-blur-xl',
        'text-card-foreground shadow-xl',

        // Animations - smoother
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-98 data-[state=open]:zoom-in-98',
        'data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1',
        'data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1',

        position === 'popper' &&
        'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          'p-1.5', // Padding nhỏ hơn
          position === 'popper' &&
          'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold text-muted-foreground', className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      // Base styling - tighter spacing
      'relative flex w-full cursor-default select-none items-center',
      'rounded-md py-1.5 pl-7 pr-2 text-sm outline-none',

      // Focus/hover states - subtle
      'focus:bg-accent/60 focus:text-accent-foreground',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',

      // Smooth transition
      'transition-colors duration-150',

      className
    )}
    {...props}
  >
    <span className="absolute left-1.5 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        {/* Check icon nhỏ hơn và màu primary */}
        <Check className="h-3.5 w-3.5 text-primary" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};