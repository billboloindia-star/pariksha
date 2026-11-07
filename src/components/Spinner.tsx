interface SpinnerProps {
  size?: number;
  label?: string;
  inline?: boolean;
}

export default function Spinner({ size = 18, label, inline }: SpinnerProps) {
  return (
    <span className={`spinnerWrap ${inline ? "inline" : ""}`}>
      <svg className="spinner" width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
        <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {label && <span className="spinnerLabel">{label}</span>}
    </span>
  );
}
