interface ProgressRingProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  showPercent?: boolean;
}

function ProgressRing({
  percent,
  size = 200,
  strokeWidth = 3,
  label,
  showPercent = true,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(Math.max(percent, 0), 100) / 100);

  const gradientId = `ms-progress-gradient-${size}`;

  return (
    <svg
      className="ms-progress-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      role="progressbar"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-hover)" />
        </linearGradient>
      </defs>

      {/* Track (background circle) */}
      <circle
        className="ms-progress-ring-track"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
      />

      {/* Progress arc */}
      <circle
        className="ms-progress-ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        stroke={`url(#${gradientId})`}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />

      {/* Center text */}
      {(showPercent || label) && (
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          style={{
            fill: 'var(--text)',
            fontSize: size * 0.14,
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            transform: 'rotate(90deg)',
            transformOrigin: 'center',
          }}
        >
          {label ?? `${Math.round(percent)}%`}
        </text>
      )}
    </svg>
  );
}

export default ProgressRing;
