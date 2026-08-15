interface DifficultyStarsProps {
  value: number;
  editable?: boolean;
  onChange?: (value: number) => void;
  compact?: boolean;
}

function formatDifficulty(value: number): string {
  if (value === 0) return "0 星";
  return `${Number.isInteger(value) ? value : value.toFixed(1)} 星`;
}

export function DifficultyStars({
  value,
  editable = false,
  onChange,
  compact = false,
}: DifficultyStarsProps) {
  const normalized = Math.max(0, Math.min(5, Math.round(value * 2) / 2));
  return <div className={`difficulty-control${compact ? " compact" : ""}`}>
    <div className="difficulty-stars" aria-label={`难度 ${formatDifficulty(normalized)}`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fraction = Math.max(0, Math.min(1, normalized - (star - 1)));
        return <span className="difficulty-star" key={star} aria-hidden="true">
          <span className="difficulty-star-empty">★</span>
          <span className="difficulty-star-fill" style={{ width: `${fraction * 100}%` }}>★</span>
        </span>;
      })}
    </div>
    {/* <span className="difficulty-value">{formatDifficulty(normalized)}</span> */}
    {editable && <div className="difficulty-stepper" aria-label="调整难度星级">
      <button
        type="button"
        aria-label="降低难度 0.5 星"
        disabled={normalized <= 0}
        onClick={() => onChange?.(Math.max(0, normalized - 0.5))}
      >−</button>
      <button
        type="button"
        aria-label="提高难度 0.5 星"
        disabled={normalized >= 5}
        onClick={() => onChange?.(Math.min(5, normalized + 0.5))}
      >＋</button>
    </div>}
  </div>;
}
