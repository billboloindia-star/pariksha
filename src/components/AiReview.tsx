import type { AiReview as AiReviewData } from "../types";

interface Props {
  review: AiReviewData;
  paperTitle: string;
  onBack: () => void;
}

export default function AiReview({ review, paperTitle, onBack }: Props) {
  return (
    <div className="aiPage">
      <header className="aiHeader">
        <button className="aiBack" onClick={onBack}>&larr; Back to report</button>
        <h1>Your AI study plan</h1>
        <p className="muted small">generated from your {paperTitle} attempt</p>
      </header>

      <div className="aiBody">
        <div className="aiHero">
          <span className="aiHeroIcon">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="#ffffff" />
            </svg>
          </span>
          <div>
            <span className="aiHeroLabel">GEMINI &middot; BASED ON THIS ATTEMPT</span>
            <p>{review.summary}</p>
          </div>
        </div>

        <div className="aiCols">
          <section className="aiCol aiCol-good">
            <h2>Where you're strong</h2>
            {review.strengths.map((s, i) => (
              <div className="aiPoint" key={i}>
                <i className="aiDot good" />
                <div>
                  <b>{s.title}</b>
                  <p>{s.detail}</p>
                </div>
              </div>
            ))}
          </section>

          <section className="aiCol aiCol-bad">
            <h2>Where you need work</h2>
            {review.weaknesses.map((w, i) => (
              <div className="aiPoint" key={i}>
                <i className="aiDot bad" />
                <div>
                  <b>{w.title}</b>
                  <p>{w.detail}</p>
                </div>
              </div>
            ))}
          </section>
        </div>

        <h2 className="aiPlanTitle">Your study plan before the next attempt</h2>
        <div className="aiPlan">
          {review.plan.map((d, i) => {
            const isLast = i === review.plan.length - 1;
            return (
              <div className={`aiPlanRow ${isLast ? "last" : ""}`} key={i}>
                <span className="aiPlanDay">{d.day}</span>
                <div className="aiPlanBody">
                  <b>{d.title}</b>
                  <p>{d.detail}</p>
                  <span className="muted small">&asymp; {d.minutes} min</span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="muted small aiDisclaimer">
          AI-generated from this attempt's data &mdash; a study aid, not official exam guidance.
        </p>
        <button className="btn primary wide" onClick={onBack}>&larr; Back to report</button>
      </div>
    </div>
  );
}
