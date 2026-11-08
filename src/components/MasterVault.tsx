import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../shared/api";
import type { BankSectionSummary, BankSubConceptSummary, Difficulty, Paper } from "../../shared/types";
import DrillBrowse from "./DrillBrowse";

interface Props {
  onLoaded: (p: Paper) => void;
  /** Pre-selects a section + chapter(s), e.g. from the "Practice now" button
   * on the Progress dashboard. Applied once, the first time it's non-null.
   * `noMatchTopic` carries the topic name through when no chapter matched it
   * at all (section is "" in that case) - shown as an honest banner instead
   * of silently landing on the default section and implying a real match. */
  seed?: { section: string; chapters: string[]; noMatchTopic?: string } | null;
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <rect x="3" y="3" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 9v4l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 2h6M12 2v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function VaultIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M20 6L9 17l-5-5" /></svg>
  );
}

const DIFFICULTIES: { value: Difficulty | ""; label: string }[] = [
  { value: "", label: "Any" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const NEGATIVE_OPTIONS = [0, 0.25, 0.33, 0.5];
const CHAPTER_DOT_COLORS = ["#6366f1", "#e8305a", "#0ea5a5", "#b5650a", "#2563eb", "#16a34a"];

const CATEGORY_RULES: { label: string; test: (chapter: string) => boolean }[] = [
  { label: "Data Interpretation", test: (c) => c.startsWith("Data Interpretation") },
  {
    label: "Arithmetic",
    test: (c) =>
      ["Ages", "Average", "Mixture", "Partnership", "Percentage", "Profit & Loss", "Ratio & Proportion",
        "Simple & Compound Interest", "Time & Work", "Time, Speed"].some((k) => c.includes(k)),
  },
  {
    label: "Algebra & Numbers",
    test: (c) =>
      ["Approximation", "Number Series", "Quadratic", "Simplification", "Mensuration", "Permutation",
        "Probability", "Data Sufficiency"].some((k) => c.includes(k)),
  },
  { label: "Puzzles & Arrangement", test: (c) => /puzzle|arrangement|seating|box|floor|circle|row|shape/i.test(c) },
  { label: "Syllogism & Inequality", test: (c) => /syllogism|inequality/i.test(c) },
  {
    label: "Verbal & Logic",
    test: (c) => /blood relation|direction sense|coding|critical reasoning|cause and effect|argument|assumption|course of action/i.test(c),
  },
  { label: "Series & Coding", test: (c) => /series|alphanumeric|word & letter|machine input/i.test(c) },
];

function subConceptKey(s: { chapter: string; subConcept: string }): string {
  return `${s.chapter}|${s.subConcept}`;
}

function groupChapters(chapters: BankSectionSummary[]): { label: string; items: BankSectionSummary[] }[] {
  const buckets = new Map<string, BankSectionSummary[]>();
  for (const rule of CATEGORY_RULES) buckets.set(rule.label, []);
  buckets.set("Other", []);
  for (const c of chapters) {
    const rule = CATEGORY_RULES.find((r) => r.test(c.chapter));
    buckets.get(rule?.label ?? "Other")!.push(c);
  }
  return Array.from(buckets.entries())
    .map(([label, items]) => ({ label, items: items.sort((a, b) => b.count - a.count) }))
    .filter((g) => g.items.length > 0);
}

function paceLabel(secPerQ: number): { text: string; tight: boolean } {
  if (secPerQ >= 75) return { text: "relaxed pace", tight: false };
  if (secPerQ >= 45) return { text: "standard exam pace", tight: false };
  return { text: "tight pace", tight: true };
}

export default function MasterVault({ onLoaded, seed }: Props) {
  const [mode, setMode] = useState<"scored" | "drill">("scored");
  const [sections, setSections] = useState<BankSectionSummary[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [subConceptOptions, setSubConceptOptions] = useState<BankSubConceptSummary[]>([]);
  const [selectedSubConcepts, setSelectedSubConcepts] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [count, setCount] = useState(20);
  const [duration, setDuration] = useState(20);
  const [negativeMarking, setNegativeMarking] = useState(0.25);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const builderRef = useRef<HTMLDivElement>(null);
  const seedApplied = useRef(false);

  useEffect(() => {
    api.fetchBankSections().then(setSections).catch((e) => setLoadError(e.message));
  }, []);

  const sectionNames = useMemo(() => Array.from(new Set((sections ?? []).map((s) => s.section))), [sections]);

  const totalQuestions = useMemo(() => (sections ?? []).reduce((n, s) => n + s.count, 0), [sections]);
  const totalChapters = sections?.length ?? 0;

  function scrollToBuilder() {
    builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (!sectionNames.length) return;
    if (!seedApplied.current && seed && sectionNames.includes(seed.section)) {
      seedApplied.current = true;
      setActiveSection(seed.section);
      setSelectedChapters(seed.chapters);
      // Scrolling right here would run against the DOM as it looked
      // *before* this state update paints (still the old/empty section's
      // shorter chip grid), landing on the wrong spot once the real
      // content pops in a frame later. Defer two rAFs so the browser has
      // actually committed and painted the new layout first.
      requestAnimationFrame(() => requestAnimationFrame(scrollToBuilder));
      return;
    }
    if (!activeSection) setActiveSection(sectionNames[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionNames, activeSection, seed]);

  const chaptersForSection = useMemo(
    () => (sections ?? []).filter((s) => s.section === activeSection),
    [sections, activeSection]
  );

  const groupedChapters = useMemo(() => groupChapters(chaptersForSection), [chaptersForSection]);

  const availableForSelection = useMemo(() => {
    if (selectedSubConcepts.length) {
      // Sub-concept counts aren't split by difficulty server-side - this is
      // an approximation when a difficulty filter is also active, but still
      // far closer than ignoring the sub-concept narrowing entirely.
      return subConceptOptions
        .filter((s) => selectedSubConcepts.includes(subConceptKey(s)))
        .reduce((n, s) => n + s.count, 0);
    }
    if (!difficulty) {
      return chaptersForSection
        .filter((c) => selectedChapters.includes(c.chapter))
        .reduce((n, c) => n + c.count, 0);
    }
    return chaptersForSection
      .filter((c) => selectedChapters.includes(c.chapter))
      .reduce((n, c) => n + (c.byDifficulty[difficulty] ?? 0), 0);
  }, [chaptersForSection, selectedChapters, difficulty, selectedSubConcepts, subConceptOptions]);

  function changeSection(name: string) {
    setActiveSection(name);
    setSelectedChapters([]);
    setSubConceptOptions([]);
    setSelectedSubConcepts([]);
  }

  function toggleChapter(chapter: string) {
    const removing = selectedChapters.includes(chapter);
    setSelectedChapters((prev) => (removing ? prev.filter((c) => c !== chapter) : [...prev, chapter]));
    if (removing) {
      // Drop only this chapter's sub-concept picks, keep the rest.
      setSelectedSubConcepts((prev) => prev.filter((k) => !k.startsWith(`${chapter}|`)));
    }
  }

  function toggleSubConcept(key: string) {
    setSelectedSubConcepts((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function selectAllInChapter(chapter: string, items: BankSubConceptSummary[]) {
    const keys = items.map(subConceptKey);
    setSelectedSubConcepts((prev) => [...prev.filter((k) => !k.startsWith(`${chapter}|`)), ...keys]);
  }

  function clearChapterSubConcepts(chapter: string) {
    setSelectedSubConcepts((prev) => prev.filter((k) => !k.startsWith(`${chapter}|`)));
  }

  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());

  function toggleChapterOpen(chapter: string) {
    setOpenChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapter)) next.delete(chapter);
      else next.add(chapter);
      return next;
    });
  }

  useEffect(() => {
    if (!activeSection || selectedChapters.length === 0) {
      setSubConceptOptions([]);
      return;
    }
    api.fetchBankSubConcepts(activeSection, selectedChapters).then((rows) => {
      setSubConceptOptions(rows);
      // Default to the first chapter expanded, the rest collapsed, each
      // time the selection changes - keeps 3+ chapters from turning into
      // an endless scroll of chips.
      const firstChapter = rows[0]?.chapter;
      setOpenChapters(firstChapter ? new Set([firstChapter]) : new Set());
    }).catch(() => setSubConceptOptions([]));
  }, [activeSection, selectedChapters]);

  const subConceptsByChapter = useMemo(() => {
    const groups = new Map<string, BankSubConceptSummary[]>();
    for (const s of subConceptOptions) {
      if (!groups.has(s.chapter)) groups.set(s.chapter, []);
      groups.get(s.chapter)!.push(s);
    }
    return Array.from(groups.entries());
  }, [subConceptOptions]);

  const maxCount = Math.min(count > 0 ? Math.max(count, availableForSelection || 1) : 337, Math.max(availableForSelection, 5));
  const secPerQ = count > 0 ? (duration * 60) / count : 0;
  const pace = paceLabel(secPerQ);

  async function generate() {
    if (!activeSection || selectedChapters.length === 0) {
      setGenError("Pick at least one chapter to practice.");
      return;
    }
    setGenError("");
    setGenerating(true);
    try {
      const paper = await api.generatePracticePaper({
        section: activeSection,
        chapters: selectedChapters,
        subConcepts: selectedSubConcepts.length ? selectedSubConcepts : undefined,
        difficulty: difficulty || undefined,
        count: Math.max(1, count || 20),
        durationMinutes: Math.max(1, duration || 20),
        negativeMarking,
      });
      onLoaded(paper);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Could not build that practice session.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="home">
      <section className="hm-hero mvHero">
        <div className="hm-heroBlob1 mvBlob1" />
        <div className="hm-heroBlob2 mvBlob2" />
        <div className="hm-heroGrid">
          <div>
            <div className="hm-eyebrow"><i />Premium feature</div>
            <h1 className="hm-h1">Your personal<br /><span className="hm-g1 mvG1">Master Vault</span></h1>
            <p className="hm-lead">
              Every chapter you've fed it, tagged and ready. Pick a topic, set the difficulty and
              timer, and drop straight into a practice session built just for today.
            </p>

            <div className="hm-ctas">
              <button className="hm-ctaPrimary mvCtaPrimary" onClick={scrollToBuilder}>Build a session &rarr;</button>
            </div>

            {sections !== null && sections.length > 0 && (
              <div className="hm-statsRow">
                <div className="hm-statGlass"><b>{totalQuestions.toLocaleString()}</b><span>Questions</span></div>
                <div className="hm-statGlass"><b>{totalChapters}</b><span>Chapters</span></div>
                <div className="hm-statGlass up"><b>{sectionNames.length}</b><span>Section{sectionNames.length === 1 ? "" : "s"}</span></div>
              </div>
            )}
          </div>

          <div className="hm-heroVisual">
            <div className="hm-floatBadge mvFloatBadge">
              <span className="hm-floatBadgeIcon hm-purple"><VaultIcon /></span>
              <div><b>Fully configurable</b><span>topic · difficulty · timer</span></div>
            </div>
          </div>
        </div>
      </section>

      <div className="mvModeTabs">
        <button type="button" className={`mvModeTab ${mode === "scored" ? "active" : ""}`} onClick={() => setMode("scored")}>
          Scored practice
        </button>
        <button type="button" className={`mvModeTab ${mode === "drill" ? "active" : ""}`} onClick={() => setMode("drill")}>
          Browse drill <span className="mvModeTabHint">no answers — self-check</span>
        </button>
      </div>

      {mode === "drill" && <DrillBrowse section="Reasoning" />}

      {mode === "scored" && <>

      {seed?.noMatchTopic && (
        <div className="mvNoMatchBanner">
          <span className="mvNoMatchIcon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" strokeLinecap="round" /></svg>
          </span>
          <span>
            Couldn&rsquo;t find an exact chapter match for &ldquo;{seed.noMatchTopic}&rdquo; in your bank &mdash; here&rsquo;s everything,
            pick a chapter below.
          </span>
        </div>
      )}

      {loadError && <pre className="error">{loadError}</pre>}

      {sections !== null && sections.length === 0 && !loadError && (
        <div className="card">
          <p className="muted">
            Nothing in your Master Vault yet — this fills up as study material gets ingested chapter by chapter.
            Come back once the first batch is in.
          </p>
        </div>
      )}

      {sections !== null && sections.length > 0 && (
        <>
          <section className="card" style={{ marginBottom: 20 }}>
            <div className="cardIconRow">
              <span className="cardIcon blue"><GridIcon /></span>
              <h2>Browse your bank</h2>
            </div>

            <div className="mvSectionTabs">
              {sectionNames.map((name) => {
                const sectionCount = sections.filter((s) => s.section === name).reduce((n, s) => n + s.count, 0);
                return (
                  <button
                    key={name}
                    type="button"
                    className={`mvSectionTab ${activeSection === name ? "active" : ""}`}
                    onClick={() => changeSection(name)}
                  >
                    {name} <small>{sectionCount.toLocaleString()}</small>
                  </button>
                );
              })}
            </div>

            {groupedChapters.map((group) => {
              const groupMax = Math.max(...group.items.map((c) => c.count));
              const groupTotal = group.items.reduce((n, c) => n + c.count, 0);
              return (
                <div className="mvCat" key={group.label}>
                  <div className="mvCatHead">
                    <h4>{group.label}</h4>
                    <span>{groupTotal.toLocaleString()} questions</span>
                  </div>
                  <div className="mvChapterGrid">
                    {group.items.map((c) => {
                      const selected = selectedChapters.includes(c.chapter);
                      return (
                        <button
                          key={c.chapter}
                          type="button"
                          className={`mvChapterChip ${selected ? "selected" : ""}`}
                          onClick={() => toggleChapter(c.chapter)}
                        >
                          <span className="mvDot">{selected && <CheckIcon />}</span>
                          <span className="mvNm">{c.chapter}</span>
                          <span className="mvBar"><i style={{ width: `${Math.max(4, (c.count / groupMax) * 100)}%` }} /></span>
                          <b>{c.count}</b>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>

          <section className="card" ref={builderRef}>
            <div className="cardIconRow">
              <span className="cardIcon purple"><TimerIcon /></span>
              <h2>Build a practice session</h2>
            </div>

            <div className="mvBuilderGrid">
              <div>
                <p className="muted small" style={{ margin: "18px 0 4px" }}>
                  {selectedChapters.length === 0
                    ? "Select one or more chapters above to start."
                    : <><b>{availableForSelection.toLocaleString()} questions</b> available from {selectedChapters.length} selected chapter{selectedChapters.length === 1 ? "" : "s"}</>}
                </p>

                {subConceptsByChapter.length > 0 && (
                  <div className="mvFieldRow mvFieldRowBlock">
                    <div className="fieldLabel" style={{ margin: 0 }}>
                      Sub-concept<span className="fieldHint">optional — narrow to specific question types</span>
                    </div>
                    <div>
                      {subConceptsByChapter.map(([chapter, items], i) => {
                        const open = openChapters.has(chapter);
                        const pickedInChapter = selectedSubConcepts.filter((k) => k.startsWith(`${chapter}|`)).length;
                        return (
                          <div key={chapter} className={`mvScBlock ${open ? "open" : ""}`}>
                            <button type="button" className="mvScHead" onClick={() => toggleChapterOpen(chapter)}>
                              <span className="mvScHeadLeft">
                                <span className="mvScDot" style={{ background: CHAPTER_DOT_COLORS[i % CHAPTER_DOT_COLORS.length] }} />
                                <span className="mvScName">{chapter}</span>
                                <span className="mvScMeta">{items.length} sub-concept{items.length === 1 ? "" : "s"}</span>
                              </span>
                              <span className="mvScHeadRight">
                                {pickedInChapter > 0 && <span className="mvScPill">{pickedInChapter} selected</span>}
                                <span className="mvScChevron">▾</span>
                              </span>
                            </button>
                            {open && (
                              <div className="mvScBody">
                                <div className="mvScAllNoneRow">
                                  <button type="button" onClick={() => selectAllInChapter(chapter, items)}>Select all</button>
                                  <button type="button" onClick={() => clearChapterSubConcepts(chapter)}>Clear</button>
                                </div>
                                <div className="mvSubConceptRow">
                                  {items.map((s) => {
                                    const key = subConceptKey(s);
                                    return (
                                      <button
                                        key={key}
                                        type="button"
                                        className={`mvSubConceptChip ${selectedSubConcepts.includes(key) ? "active" : ""}`}
                                        onClick={() => toggleSubConcept(key)}
                                      >
                                        {s.subConcept} <small>{s.count}</small>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {selectedSubConcepts.length > 0 && (
                        <div className="mvScClearAllRow">
                          <span className="muted small">
                            <b>{selectedSubConcepts.length}</b> sub-concept{selectedSubConcepts.length === 1 ? "" : "s"} selected
                          </span>
                          <button type="button" className="mvScClearAllBtn" onClick={() => setSelectedSubConcepts([])}>Clear all sub-concepts</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="mvFieldRow">
                  <div className="fieldLabel" style={{ margin: 0 }}>Difficulty</div>
                  <div className="mvDiffRow">
                    {DIFFICULTIES.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        className={`mvDiffChip ${difficulty === d.value ? "active" : ""}`}
                        onClick={() => setDifficulty(d.value)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mvSliderField">
                  <div className="mvSliderHead">
                    <span className="lb">Questions</span>
                    <span className="val">{count} <span>/ {Math.max(availableForSelection, count).toLocaleString()} available</span></span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={Math.max(maxCount, 5)}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                  <div className="mvRangeHint"><span>5</span><span>{Math.max(maxCount, 5)}</span></div>
                </div>

                <div className="mvSliderField" style={{ borderBottom: "none" }}>
                  <div className="mvSliderHead">
                    <span className="lb">Duration</span>
                    <span className="val">{duration} <span>min</span></span>
                  </div>
                  <input type="range" min={5} max={90} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
                  <div className="mvRangeHint"><span>5 min</span><span>90 min</span></div>
                </div>

                <div className={`mvPaceStrip ${pace.tight ? "tight" : ""}`}>
                  <span className="pdot" />
                  <b>{Math.round(secPerQ)} sec / question</b>
                  <span>&mdash; {pace.text}</span>
                </div>

                <div className="mvFieldRow" style={{ borderBottom: "none" }}>
                  <div className="fieldLabel" style={{ margin: 0 }}>Negative marking<span className="fieldHint">per wrong answer</span></div>
                  <div className="mvNegRow">
                    {NEGATIVE_OPTIONS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`mvNegChip ${negativeMarking === n ? "active" : ""}`}
                        onClick={() => setNegativeMarking(n)}
                      >
                        {n === 0 ? "None" : n}
                      </button>
                    ))}
                  </div>
                </div>

                {genError && <pre className="error">{genError}</pre>}
              </div>

              <div className="mvSummary">
                <h3>Ready to start</h3>
                <div className="mvSumChapters">
                  <b>{selectedChapters.length} chapter{selectedChapters.length === 1 ? "" : "s"}</b>
                  {selectedChapters.length ? selectedChapters.join(", ") : "None selected yet"}
                </div>
                {selectedSubConcepts.length > 0 && (
                  <div className="mvSumChapters">
                    <b>{selectedSubConcepts.length} sub-concept{selectedSubConcepts.length === 1 ? "" : "s"}</b>
                    {selectedSubConcepts.map((k) => k.split("|")[1]).join(", ")}
                  </div>
                )}
                <div className="mvSumStat">{count} <span>questions</span></div>
                <div className="mvSumMeta"><b>{duration} min</b> &middot; {difficulty ? DIFFICULTIES.find((d) => d.value === difficulty)?.label : "any"} difficulty</div>
                <button className="mvStartBtn" onClick={generate} disabled={generating || selectedChapters.length === 0}>
                  {generating ? "Building…" : "Start practice session"}
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      </>}
    </div>
  );
}
