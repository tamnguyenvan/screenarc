import { cn } from '../../lib/utils';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  children?: React.ReactNode;
}

export function Icon({ 
  size = 16, 
  className, 
  children,
  ...props 
}: IconProps) {
  const sizePx = typeof size === 'number' ? `${size}px` : size;
  
  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('inline-block flex-shrink-0', className)}
      {...props}
    >
      {children}
    </svg>
  );
}

export const PaddingIcon = (props: IconProps) => (
  <Icon size={24} {...props}>
    <path d="M320-600q17 0 28.5-11.5T360-640q0-17-11.5-28.5T320-680q-17 0-28.5 11.5T280-640q0 17 11.5 28.5T320-600Zm160 0q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm160 0q17 0 28.5-11.5T680-640q0-17-11.5-28.5T640-680q-17 0-28.5 11.5T600-640q0 17 11.5 28.5T640-600ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z" />
  </Icon>
);

export const CornerRadiusIcon = (props: IconProps) => (
  <Icon size={24} {...props}>
    <path d="M120-120v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm0-160v-80h80v80h-80Zm160 640v-80h80v80h-80Zm0-640v-80h80v80h-80Zm160 640v-80h80v80h-80Zm160 0v-80h80v80h-80Zm160 0v-80h80v80h-80Zm0-160v-80h80v80h-80Zm80-160h-80v-200q0-50-35-85t-85-35H440v-80h200q83 0 141.5 58.5T840-640v200Z" />
  </Icon>
);

export const ShadowIcon = (props: IconProps) => (
  <Icon size={24} {...props}>
    <path d="M160-80q-33 0-56.5-23.5T80-160v-480q0-33 23.5-56.5T160-720h80v-80q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240h-80v80q0 33-23.5 56.5T640-80H160Zm160-240h480v-480H320v480Z" />
  </Icon>
);

export const BorderThicknessIcon = (props: IconProps) => (
  <Icon size={24} {...props}>
    <path d="M120-120v-720h720v720H120Zm640-80v-240H520v240h240Zm0-560H520v240h240v-240Zm-560 0v240h240v-240H200Zm0 560h240v-240H200v240Z" />
  </Icon>
);

export const OpacityIcon = (props: IconProps) => (
  <Icon size={24} {...props}>
    <path d="M480-120q-133 0-226.5-92T160-436q0-65 25-121.5T254-658l226-222 226 222q44 44 69 100.5T800-436q0 132-93.5 224T480-120ZM242-400h474q12-72-13.5-123T650-600L480-768 310-600q-27 26-53 77t-15 123Z" />
  </Icon>
);

export const SettingsIcon = (props: IconProps) => (
  <Icon size={24} {...props}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const InfoIcon = (props: IconProps) => (
  <Icon size={24} {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </Icon>
);

export const RewindIcon = (props: IconProps) => (
  <Icon size={24} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M21 5v14l-8 -7z" />
    <path d="M10 5v14l-8 -7z" />
  </Icon>
);

export const WebcamOffIcon = (props: IconProps) => (
  <Icon size={24} {...props}>
    <circle cx={12} cy={10} r={8} />
    <circle cx={12} cy={10} r={3} />
    <path d="M7 22h10" />
    <path d="M12 22v-4" />
    <line x1={2} y1={2} x2={22} y2={22} />
  </Icon>
);

export const StepBackIcon = (props: IconProps) => (
  <Icon size={24} {...props}>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M20 5v14l-12 -7z" />
    <path d="M4 5l0 14" />
  </Icon>
);

export const StepForwardIcon = (props: IconProps) => (
  <Icon size={24} {...props}>
    <path d="M0 0h24v24H0z" stroke="none" />
    <path d="M4 5v14l12-7zm16 0v14" />
  </Icon>
);