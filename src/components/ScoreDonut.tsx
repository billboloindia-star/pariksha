interface Props {
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
  net: number;
}

const R = 85;
const CIRCUMFERENCE = 2 * Math.PI * R;

export default function ScoreDonut({ correct, wrong, skipped, total, net }: Props) {
  const correctLen = total ? (CIRCUMFERENCE * correct) / total : 0;
  const wrongLen = total ? (CIRCUMFERENCE * wrong) / total : 0;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className="ovDonutRow">
      <svg viewBox="0 0 220 220" width="150" height="150">
        <circle cx="110" cy="110" r={R} fill="none" stroke="#e7ebef" strokeWidth="30" />
        <circle cx="110" cy="110" r={R} fill="none" stroke="var(--green)" strokeWidth="30"
          strokeDasharray={`${correctLen} ${CIRCUMFERENCE - correctLen}`} transform="rotate(-90 110 110)" />
        <circle cx="110" cy="110" r={R} fill="none" stroke="var(--red)" strokeWidth="30"
          strokeDasharray={`${wrongLen} ${CIRCUMFERENCE - wrongLen}`} strokeDashoffset={-correctLen}
          transform="rotate(-90 110 110)" />
        <text x="110" y="104" fontSize="28" fontWeight="800" fill="var(--ink)" textAnchor="middle">{net.toFixed(2)}</text>
        <text x="110" y="126" fontSize="12.5" fill="var(--dim)" textAnchor="middle">net / {total}</text>
      </svg>
      <div className="ovLegend">
        <div><i className="sw correct" />{correct} Correct<span>{pct(correct)}%</span></div>
        <div><i className="sw wrong" />{wrong} Wrong<span>{pct(wrong)}%</span></div>
        <div><i className="sw skipped" />{skipped} Skipped<span>{pct(skipped)}%</span></div>
      </div>
    </div>
  );
}
