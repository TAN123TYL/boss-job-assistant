interface ScoreRingProps {
  value: number;
  label: string;
}

export function ScoreRing({ value, label }: ScoreRingProps) {
  const color = value >= 75 ? 'var(--success)' : value >= 55 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div
      className="score-ring"
      style={{
        background: `conic-gradient(${color} ${value * 3.6}deg, var(--border-soft) 0deg)`,
      }}
      aria-label={`${label} ${value}`}
    >
      <span>{value}</span>
    </div>
  );
}
