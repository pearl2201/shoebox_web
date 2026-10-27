interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 20, className }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  switch (name) {
    case 'pack':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="5" rx="2" />
          <rect x="13" y="10" width="8" height="11" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
        </svg>
      );
    case 'slice':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M9 3v18M15 3v18M3 9h18M3 15h18" strokeDasharray="2 3" />
        </svg>
      );
    case 'list':
      return (
        <svg {...common}>
          <path d="M8 6h13M8 12h13M8 18h13" />
          <circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'font':
      return (
        <svg {...common}>
          <path d="M5.5 19L12 5l6.5 14" />
          <path d="M8 14.5h8" />
          <path d="M3 21h18" strokeDasharray="2 3" />
        </svg>
      );
    case 'animation':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18M7 6v12M17 6v12" />
          <path d="M11 9.5l3.5 2.5-3.5 2.5z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'tiles':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" strokeDasharray="2 2" />
        </svg>
      );
    case 'hull':
      return (
        <svg {...common}>
          <path d="M12 3l7 5 2 8-6 5-7-2-4-6 3-7z" />
          <circle cx="12" cy="3" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="19" cy="8" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="21" cy="16" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="15" cy="21" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="8" cy="19" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="4" cy="13" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="7" cy="6" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'drop':
      return (
        <svg {...common}>
          <path d="M12 3v10" />
          <path d="M8 9l4 4 4-4" />
          <path d="M4 15v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common}>
          <path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'download':
      return (
        <svg {...common}>
          <path d="M12 3v11" />
          <path d="M7.5 9.5L12 14l4.5-4.5" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...common}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a3 3 0 0 0-3 3v6.5A2.5 2.5 0 0 0 5.5 15" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...common}>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      );
    case 'image':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.5" />
          <path d="M4 17l5-5 4 4 3-3 4 4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
        </svg>
      );
  }
}
