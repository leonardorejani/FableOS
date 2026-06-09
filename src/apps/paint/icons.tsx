interface IconProps {
  className?: string
}

function svgProps(className?: string) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: className ?? 'h-4 w-4',
    'aria-hidden': true,
  }
}

export function BrushIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2.5 1.52.7 1.62 2.07 2.52 3.5 2.52a4.5 4.5 0 0 0 4.5-4.5c0-1.26-1.13-2.56-2.5-2.56Z" />
    </svg>
  )
}

export function EraserIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M21 21H8a2 2 0 0 1-1.42-.59l-4-4a2 2 0 0 1 0-2.82l10-10a2 2 0 0 1 2.83 0l6 6a2 2 0 0 1 0 2.82L12.83 21" />
      <path d="m5.08 11.09 8.83 8.83" />
    </svg>
  )
}

export function LineIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M5 19 19 5" />
      <circle cx="5" cy="19" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function RectIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </svg>
  )
}

export function EllipseIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <ellipse cx="12" cy="12" rx="8" ry="5.5" />
    </svg>
  )
}

export function BucketIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z" />
      <path d="m5 2 5 5" />
      <path d="M2 13h15" />
      <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z" />
    </svg>
  )
}

export function PickerIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="m2 22 1-1h3l9-9" />
      <path d="M3 21v-3l9-9" />
      <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
    </svg>
  )
}

export function UndoIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  )
}

export function RedoIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  )
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  )
}

export function SaveIcon({ className }: IconProps) {
  return (
    <svg {...svgProps(className)}>
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
      <path d="M7 3v4a1 1 0 0 0 1 1h7" />
    </svg>
  )
}
