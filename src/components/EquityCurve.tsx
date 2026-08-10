interface EquityCurveProps {
  points: { time: number; equity: number }[];
  startCapital: number;
}

export function EquityCurve({ points, startCapital }: EquityCurveProps) {
  if (points.length < 2) {
    return <div className="equity-empty">暂无足够成交绘制权益曲线</div>;
  }

  const width = 320;
  const height = 120;
  const pad = 8;
  const values = points.map((point) => point.equity);
  const min = Math.min(...values, startCapital);
  const max = Math.max(...values, startCapital);
  const span = Math.max(1e-6, max - min);

  const coords = points.map((point, index) => {
    const x = pad + (index / Math.max(1, points.length - 1)) * (width - pad * 2);
    const y = height - pad - ((point.equity - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  });

  const last = points.at(-1)!.equity;
  const up = last >= startCapital;

  return (
    <div className="equity-wrap">
      <div className="equity-head">
        <span>权益曲线</span>
        <strong className={up ? 'up' : 'down'}>{last.toFixed(2)}</strong>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="equity-svg" role="img" aria-label="权益曲线">
        <polyline
          fill="none"
          stroke={up ? '#2ecc71' : '#e74c3c'}
          strokeWidth="2"
          points={coords.join(' ')}
        />
      </svg>
    </div>
  );
}
