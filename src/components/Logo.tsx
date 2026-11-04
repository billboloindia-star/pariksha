interface Props {
  size?: number;
  className?: string;
}

export default function Logo({ size = 52, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 360 360"
      role="img"
      aria-label="Pariksha"
    >
      <defs>
        <linearGradient id="pariksha-tile-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b3a6b" />
          <stop offset="1" stopColor="#0a1b36" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="360" height="360" rx="80" fill="url(#pariksha-tile-grad)" />
      <circle cx="180" cy="180" r="100" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.18" />
      <rect x="142" y="110" width="26" height="150" rx="6" fill="#ffffff" />
      <path d="M168,110 h26 a36,36 0 0 1 0,72 h-26" fill="none" stroke="#ffffff" strokeWidth="26" strokeLinecap="round" />
      <circle cx="178" cy="146" r="9" fill="#e8962a" />
      <rect x="142" y="272" width="80" height="6" rx="3" fill="#e8962a" />
    </svg>
  );
}
