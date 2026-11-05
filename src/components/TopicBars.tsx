export interface TopicBarRow {
  topic: string;
  acc: number | null;
  att: number;
  ok: number;
  n?: number;
  avgSec?: number | null;
}

interface Props {
  rows: TopicBarRow[];
  full?: boolean;
}

function barColor(acc: number | null): string {
  if (acc === null) return "var(--line-2)";
  if (acc >= 80) return "var(--green)";
  if (acc >= 40) return "#e8962a";
  return "var(--red)";
}

export default function TopicBars({ rows, full }: Props) {
  return (
    <>
      {rows.map((r) => (
        <div className={`topicBarRow ${r.acc === null ? "unattempted" : ""}`} key={r.topic}>
          {full ? (
            <div className="topicBarInfo">
              <span className="topicBarName">{r.topic}</span>
              <span className="muted small">
                {r.acc !== null
                  ? `${r.ok}/${r.att} right${r.avgSec != null ? ` · ${r.avgSec.toFixed(1)}s avg` : ""}`
                  : `0/${r.n ?? r.att} attempted`}
              </span>
            </div>
          ) : (
            <span className="topicBarName">{r.topic}</span>
          )}
          <div className="topicBarTrack">
            <div className="topicBarFill" style={{ width: `${r.acc ?? 2}%`, background: barColor(r.acc) }} />
          </div>
          <span className="topicBarPct">{r.acc !== null ? `${r.acc}%` : "not attempted"}</span>
        </div>
      ))}
    </>
  );
}
