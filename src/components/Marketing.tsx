interface Props {
  onLogin: () => void;
}

export default function Marketing({ onLogin }: Props) {
  return (
    <div className="marketing">
      <header className="mktNav">
        <div className="brand">
          <span className="brandMark">P</span>
          <div>
            <h1>Pariksha</h1>
            <p>Timed mock exams — any subject, any exam.</p>
          </div>
        </div>
        <button className="btn primary" onClick={onLogin}>Log in / Sign up</button>
      </header>

      <section className="mktHero">
        <div className="mktHeroText">
          <span className="chip mktEyebrow">JEE &middot; NEET &middot; CAT &middot; IBPS &middot; GATE &middot; CA &amp; more</span>
          <h2>Practice like it&rsquo;s exam day.</h2>
          <p className="mktSub">
            Timed sections, real negative marking, and a full question-by-question breakdown after
            you submit.
          </p>
          <button className="btn primary mktCta" onClick={onLogin}>Log in / Sign up</button>
          <p className="muted small">Free account — your history follows you, not your browser.</p>
        </div>

        <div className="mktPreview" aria-hidden="true">
          <div className="mktPreviewBar">
            <span>JEE Mock 04 — Physics</span>
            <span className="mktPreviewClock">18:42</span>
          </div>
          <div className="mktPreviewBody">
            <div className="mktSkeletonLine" style={{ width: "88%" }} />
            <div className="mktSkeletonLine" style={{ width: "70%" }} />
            <div className="mktPreviewRow">
              <div className="mktPreviewOptions">
                <div className="mktPreviewOpt sel">A &nbsp; 10 m/s</div>
                <div className="mktPreviewOpt">B &nbsp; 15 m/s</div>
              </div>
              <div className="mktPreviewPalette">
                <i className="answered" /><i className="answered" /><i className="notAnswered" /><i className="notVisited" />
                <i className="marked" /><i className="notVisited" /><i className="answered" /><i className="notVisited" />
              </div>
            </div>
            <div className="mktPreviewChart">
              <svg viewBox="0 0 280 40" preserveAspectRatio="none">
                <polyline points="4,32 40,24 76,28 112,16 148,20 184,6 220,10" fill="none" stroke="var(--blue)" strokeWidth="2.5" />
              </svg>
              <div>
                <span className="muted small">Net score</span>
                <b>trending up</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mktFeatures">
        <div className="mktFeature">
          <span className="mktFeatureIcon blue">
            <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M12 9v4l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M9 2h6M12 2v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </span>
          <h3>Sectional clocks, when you need them</h3>
          <p className="muted">Bank-style papers lock each section at zero; others just run one clock, like the real thing.</p>
        </div>
        <div className="mktFeature">
          <span className="mktFeatureIcon green">
            <svg viewBox="0 0 24 24" width="20" height="20"><polyline points="3,17 10,10 14,14 21,6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="15,6 21,6 21,12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <h3>Progress you can see</h3>
          <p className="muted">Net score, accuracy and topic trends across every attempt.</p>
        </div>
        <div className="mktFeature">
          <span className="mktFeatureIcon purple">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 12l5 5 11-11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
          <h3>Any exam you bring</h3>
          <p className="muted">Convert your own paper with any AI chat — no library to browse.</p>
        </div>
      </section>

      <section className="mktHow">
        <span className="mktHowEyebrow">HOW IT WORKS</span>
        <h2 className="mktHowTitle">From any paper to a full mock, in minutes</h2>
        <div className="mktHowGrid">
          <div className="mktHowCard">
            <span className="mktHowNum">1</span>
            <h3>Get your paper ready</h3>
            <p className="muted">Copy our prompt, paste it into any AI chat along with your PDF or photo of a paper. It hands back a ready-to-upload file.</p>
            <span className="mktHowLink">Works for any exam &rarr;</span>
          </div>
          <div className="mktHowCard">
            <span className="mktHowNum">2</span>
            <h3>Log in &amp; upload it</h3>
            <p className="muted">One free account keeps every attempt tied to you, not just this browser, so it travels with you across devices.</p>
            <span className="mktHowLink">Takes under a minute &rarr;</span>
          </div>
          <div className="mktHowCard">
            <span className="mktHowNum">3</span>
            <h3>Write it, like exam day</h3>
            <p className="muted">Live clock, question palette, negative marking — then a full breakdown and a trend line across every attempt.</p>
            <span className="mktHowLink">See exactly where you stand &rarr;</span>
          </div>
        </div>
      </section>

      <section className="mktCtaBand">
        <h2>Ready to write your first mock?</h2>
        <p>Free account. Any exam. Your data stays yours.</p>
        <button className="btn mktCtaBandBtn" onClick={onLogin}>Log in / Sign up</button>
      </section>

      <footer className="mktFooter">Practise &middot; Perform &middot; Pass</footer>
    </div>
  );
}
