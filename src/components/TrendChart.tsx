interface Point { x: number; y: number | null }
export interface Series { name: string; color?: string; points: Point[] }

interface Props {
  title: string;
  series: Series[];
  yFormat?: (v: number) => string;
  height?: number;
}

const PALETTE = ["var(--blue)", "var(--green)", "var(--red)", "var(--purple)", "var(--navy)"];
const W = 560;

function segments(points: Point[]): { x: number; y: number }[][] {
  const out: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p.y === null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else {
      cur.push({ x: p.x, y: p.y });
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

export default function TrendChart({ title, series, yFormat, height = 160 }: Props) {
  const pad = { l: 36, r: 12, t: 10, b: 20 };
  const innerW = W - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const allN = Math.max(1, ...series.map((s) => s.points.length));
  const allVals = series.flatMap((s) => s.points.map((p) => p.y)).filter((v): v is number => v !== null);
  if (allVals.length < 2) return null;

  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const spread = max - min || 1;
  const yMin = min - spread * 0.1;
  const yMax = max + spread * 0.1;

  const xAt = (i: number) => pad.l + (allN > 1 ? (i / (allN - 1)) * innerW : innerW / 2);
  const yAt = (v: number) => pad.t + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const fmt = yFormat ?? ((v: number) => String(Math.round(v * 10) / 10));

  return (
    <div className="trendChart">
      <div className="trendChartTitle">{title}</div>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height}>
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + innerH} className="trendAxis" />
        <line x1={pad.l} y1={pad.t + innerH} x2={pad.l + innerW} y2={pad.t + innerH} className="trendAxis" />
        <text x={2} y={pad.t + 4} className="trendTick">{fmt(yMax)}</text>
        <text x={2} y={pad.t + innerH} className="trendTick">{fmt(yMin)}</text>
        {series.map((s, si) => {
          const color = s.color ?? PALETTE[si % PALETTE.length];
          const segs = segments(s.points);
          return (
            <g key={s.name}>
              {segs.map((seg, gi) => (
                <polyline
                  key={gi}
                  points={seg.map((p) => `${xAt(p.x)},${yAt(p.y)}`).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                />
              ))}
              {s.points.map((p, i) =>
                p.y === null ? null : (
                  <circle key={i} cx={xAt(p.x)} cy={yAt(p.y)} r={3} fill={color}>
                    <title>{fmt(p.y)}</title>
                  </circle>
                )
              )}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <div className="trendLegend">
          {series.map((s, si) => (
            <span key={s.name} className="trendLegendItem">
              <i style={{ background: s.color ?? PALETTE[si % PALETTE.length] }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
