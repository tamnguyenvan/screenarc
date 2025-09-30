import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const switchVariants = cva(
  'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-input hover:bg-accent',
        primary: 'bg-primary/20 hover:bg-primary/30',
        destructive: 'bg-destructive/20 hover:bg-destructive/30',
      },
      isChecked: {
        true: '',
      },
    },
    compoundVariants: [
      {
        variant: 'default',
        isChecked: true,
        className: 'bg-primary hover:bg-primary/90',
      },
      {
        variant: 'primary',
        isChecked: true,
        className: 'bg-primary hover:bg-primary/90',
      },
      {
        variant: 'destructive',
        isChecked: true,
        className: 'bg-destructive hover:bg-destructive/90',
      },
    ],
    defaultVariants: {
      variant: 'default',
    },
  },
);

const thumbVariants = cva(
  'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform',
  {
    variants: {
      isChecked: {
        true: 'translate-x-5',
        false: 'translate-x-0',
      },
    },
  },
);

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>,
    VariantProps<typeof switchVariants> {}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, variant, checked, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      switchVariants({ variant, isChecked: checked }),
      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
      className,
    )}
    checked={checked}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        thumbVariants({ isChecked: checked }),
        'block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform',
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = 'Switch';

export { Switch };