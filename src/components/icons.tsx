type IconProps = {
  size?: number
  className?: string
  title?: string
  "data-icon"?: string
  ariaHidden?: boolean
}

// Small, dependency-free inline SVG icon set
export const Icon = {
  Link: ({ size = 16, className, title = 'Link', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <path d="M10 14a5 5 0 007.07 0l1.17-1.17a5 5 0 000-7.07 5 5 0 00-7.07 0L10 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 10a5 5 0 00-7.07 0L5.76 11.17a5 5 0 000 7.07 5 5 0 007.07 0L14 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Chart: ({ size = 16, className, title = 'Chart', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <path d="M4 19V5M10 19V9M16 19V13M22 19H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Clipboard: ({ size = 16, className, title = 'Clipboard', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <rect x="6" y="4" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M9 4h6v3H9z" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  Gear: ({ size = 16, className, title = 'Settings', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.11a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.11a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.11a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c0 .66.39 1.26 1 1.51H21a2 2 0 110 4h-.11a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  Plug: ({ size = 16, className, title = 'No devices', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <path d="M9 7v6M15 7v6M7 13h10M12 19v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M8 5h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Radio: ({ size = 14, className, title = 'Collecting', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <circle cx="12" cy="12" r="2" fill="currentColor"/>
      <path d="M5 12a7 7 0 017-7M19 12a7 7 0 00-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M3 12a9 9 0 019-9M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Pause: ({ size = 14, className, title = 'Idle', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <rect x="7" y="5" width="4" height="14" fill="currentColor"/>
      <rect x="13" y="5" width="4" height="14" fill="currentColor"/>
    </svg>
  ),
  Warning: ({ size = 16, className, title = 'Warning', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <path d="M12 2l10 18H2L12 2z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M12 8v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="17" r="1" fill="currentColor"/>
    </svg>
  ),
  Info: ({ size = 16, className, title = 'Info', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
      <path d="M12 16v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="8" r="1" fill="currentColor"/>
    </svg>
  ),
  Success: ({ size = 16, className, title = 'Success', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
      <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Error: ({ size = 16, className, title = 'Error', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
      <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Search: ({ size = 16, className, title = 'Search', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Heart: ({ size = 16, className, title = 'Heart', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
  ),
  HeartOff: ({ size = 16, className, title = 'No Data', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <path d="M2 2l20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67 9.88 3.55M4.22 4.22a5.5 5.5 0 000 7.78L12 21.23l4.55-4.55" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
  ),
  Clock: ({ size = 16, className, title = 'Timeout', ...rest }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label={title} className={className} {...rest}>
      <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2"/>
      <path d="M12 13V8M9 3h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
}

export type IconName = keyof typeof Icon
