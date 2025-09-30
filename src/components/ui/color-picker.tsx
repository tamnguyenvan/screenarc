import * as React from 'react';
import { useState, useEffect, useId } from 'react';
import { cn } from '../../lib/utils';

export interface ColorPickerProps {
  /** The current color value in a format accepted by CSS (e.g., #RRGGBB). */
  value: string;
  /** Callback function when the color changes. */
  onChange: (value: string) => void;
  /** Optional label to display above the color picker. */
  label?: string;
  /** Optional additional class names. */
  className?: string;
}

/**
 * A macOS-style color picker component with a color swatch and a text input.
 * The swatch and input are synchronized. It uses pre-defined styles from index.css
 * for consistent theming.
 */
export const ColorPicker = ({ value, onChange, label, className }: ColorPickerProps) => {
  // Internal state for the text input to avoid updating the parent on every keystroke.
  const [localValue, setLocalValue] = useState(value);
  const colorInputId = useId();

  /**
   * Synchronizes the internal text input state when the `value` prop changes from the parent.
   * This is crucial for keeping the component in sync if the color is changed from elsewhere.
   */
  useEffect(() => {
    // Check prevents an unnecessary update if the values are already in sync,
    // which can happen after the blur event handler fires.
    if (value.toLowerCase() !== localValue.toLowerCase()) {
      setLocalValue(value);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]); // Note: We don't include localValue here to prevent loops.

  /**
   * Handles changes from the native color picker input (the swatch).
   * This updates the parent state directly.
   */
  const handleSwatchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    // The useEffect hook will then synchronize localValue.
  };

  /**
   * Handles typing in the text field, updating only the local state.
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  /**
   * When the text input loses focus, propagate the change to the parent.
   */
  const handleInputBlur = () => {
    if (localValue.toLowerCase() !== value.toLowerCase()) {
      onChange(localValue);
    }
  };
  
  /**
   * Allows submitting the color by pressing Enter for better UX.
   */
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleInputBlur();
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className={cn('space-y-1 w-full', className)}>
      {label && (
        <label htmlFor={colorInputId} className="text-sm text-muted-foreground">
          {label}
        </label>
      )}
      <div className="color-picker-container">
        {/* Color Swatch (visual + input type="color") */}
        <div className="color-picker-swatch">
          <input
            id={colorInputId}
            type="color"
            value={value} // The native picker should always reflect the true parent state
            onChange={handleSwatchChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-label="Color Picker Swatch"
          />
          {/* The visible color block inside the swatch border */}
          <div
            className="w-full h-full rounded-[5px]"
            style={{ backgroundColor: value }}
          />
        </div>

        {/* Text Input */}
        <input
          type="text"
          value={localValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          className="color-picker-input w-full"
          placeholder="#RRGGBB"
          aria-label="Color Hex Value"
        />
      </div>
    </div>
  );
};

ColorPicker.displayName = "ColorPicker";

// This component is simpler and already existed. I'm including it for completeness
// as it shares a similar style but has different functionality (no text input).
export const ColorPickerRoundedRect = ({
  label,
  color,
  name,
  onChange,
  size = 'sm'
}: {
  label: string;
  color: string;
  name: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  size?: 'sm' | 'md' | 'lg';
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12'
  };

  return (
    <div className="flex items-center gap-3">
      <label className={cn("relative cursor-pointer group flex-shrink-0", sizeClasses[size])}>
        <input
          type="color"
          name={name}
          value={color}
          onChange={onChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div
          className={cn(
            "w-full aspect-square rounded-lg border-2 transition-all duration-300",
            "border-sidebar-border hover:border-primary/60"
          )}
          style={{ backgroundColor: color }}
        />
      </label>
      <span className="text-sm text-foreground font-medium">{label}</span>
    </div>
  );
};