import { useEffect, useMemo, useState } from "react";
import type { Attachment, AttemptQuestionRecord } from "../../shared/types";
import * as api from "../../shared/api";

interface Props {
  /** The attempt's saved question records - works for a freshly-finished
   * exam (Report.tsx) and for a reopened past attempt (Progress.tsx) alike,
   * since both load the same AttemptRecord.questions shape from the backend. */
  questions: AttemptQuestionRecord[];
  /** The attempt's `when` timestamp, needed to persist notes/attachments.
   * null while a fresh attempt hasn't finished saving yet - the note box
   * stays disabled until then. */
  when: number | null;
  onExportCsv?: () => void;
}

function secs(ms: number) {
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}
function answerText(q: AttemptQuestionRecord) {
  return q.type === "mc" ? q.options?.[q.ans] ?? "" : String(q.ans);
}
function givenText(q: AttemptQuestionRecord, given: number | null) {
  if (given === null) return "—";
  return q.type === "mc" ? q.options?.[given] ?? String(given) : String(given);
}
function status(q: AttemptQuestionRecord): "correct" | "wrong" | "skipped" {
  if (q.given === null) return "skipped";
  return q.given === q.ans ? "correct" : "wrong";
}

const MAX_ATTACHMENTS_PER_Q = 3;

export default function ReviewAnswers({ questions, when, onExportCsv }: Props) {
  const total = questions.length;
  const counts = useMemo(() => {
    let correct = 0, wrong = 0, skipped = 0;
    questions.forEach((q) => {
      const s = status(q);
      if (s === "correct") correct++;
      else if (s === "wrong") wrong++;
      else skipped++;
    });
    return { correct, wrong, skipped };
  }, [questions]);

  const [filter, setFilter] = useState<"all" | "correct" | "wrong" | "skipped">("all");
  const filteredIndices = useMemo(() => {
    const all = questions.map((_, i) => i);
    if (filter === "all") return all;
    return all.filter((i) => status(questions[i]) === filter);
  }, [questions, filter]);

  const [selectedQ, setSelectedQ] = useState<number | null>(null);
  useEffect(() => {
    const firstWrong = questions.findIndex((q) => status(q) === "wrong");
    const firstAttempted = questions.findIndex((q) => q.given !== null);
    setSelectedQ(firstWrong >= 0 ? firstWrong : firstAttempted >= 0 ? firstAttempted : total ? 0 : null);
    setFilter("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  function stepReview(dir: 1 | -1) {
    if (selectedQ === null) return;
    const pos = filteredIndices.indexOf(selectedQ);
    const next = filteredIndices[pos + dir];
    if (next !== undefined) setSelectedQ(next);
  }

  const [notes, setNotes] = useState<Record<number, string>>({});
  const [attachments, setAttachments] = useState<Record<number, Attachment[]>>({});
  useEffect(() => {
    const n: Record<number, string> = {};
    const a: Record<number, Attachment[]> = {};
    questions.forEach((q, i) => {
      if (q.note) n[i] = q.note;
      if (q.attachments) a[i] = q.attachments;
    });
    setNotes(n);
    setAttachments(a);
  }, [questions]);

  const [noteSaving, setNoteSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [attachError, setAttachError] = useState<string | null>(null);
  const [uploadingQ, setUploadingQ] = useState<number | null>(null);

  function saveNote(qIndex: number, text: string) {
    setNotes((prev) => ({ ...prev, [qIndex]: text }));
  }

  async function commitNote(qIndex: number, attachmentsOverride?: Attachment[]) {
    if (when === null) return;
    setNoteSaving("saving");
    try {
      await api.updateQuestionNote(when, qIndex, notes[qIndex] ?? "", attachmentsOverride ?? attachments[qIndex] ?? []);
      setNoteSaving("saved");
      setTimeout(() => setNoteSaving("idle"), 1200);
    } catch {
      setNoteSaving("idle");
    }
  }

  async function addAttachments(qIndex: number, files: FileList | File[]) {
    setAttachError(null);
    const existing = attachments[qIndex] ?? [];
    const room = MAX_ATTACHMENTS_PER_Q - existing.length;
    if (room <= 0) { setAttachError(`Max ${MAX_ATTACHMENTS_PER_Q} attachments per question.`); return; }
    const toUpload = Array.from(files).slice(0, room);
    setUploadingQ(qIndex);
    try {
      const uploaded: Attachment[] = [];
      for (const f of toUpload) uploaded.push(await api.uploadAttachment(f));
      const next = [...existing, ...uploaded];
      setAttachments((prev) => ({ ...prev, [qIndex]: next }));
      await commitNote(qIndex, next);
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : "Couldn't attach that file.");
    } finally {
      setUploadingQ(null);
    }
  }

  function removeAttachment(qIndex: number, i: number) {
    const next = (attachments[qIndex] ?? []).filter((_, idx) => idx !== i);
    setAttachments((prev) => ({ ...prev, [qIndex]: next }));
    commitNote(qIndex, next);
  }

  const selected = selectedQ !== null ? questions[selectedQ] : null;
  const selectedRes = selectedQ !== null ? status(questions[selectedQ]) : null;
  const selectedPos = selectedQ !== null ? filteredIndices.indexOf(selectedQ) : -1;

  if (total === 0) return <p className="muted small">No per-question detail was saved for this attempt.</p>;

  return (
    <div className="repSection">
      <div className="repHead">
        <h3>Review answers</h3>
        {onExportCsv && <button className="btn smallBtn" onClick={onExportCsv}>Export CSV</button>}
      </div>

      <div className="reviewFilters">
        <button className={`reviewFilterChip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All {total}</button>
        <button className={`reviewFilterChip ${filter === "correct" ? "active" : ""}`} onClick={() => setFilter("correct")}>Correct {counts.correct}</button>
        <button className={`reviewFilterChip ${filter === "wrong" ? "active" : ""}`} onClick={() => setFilter("wrong")}>Wrong {counts.wrong}</button>
        <button className={`reviewFilterChip ${filter === "skipped" ? "active" : ""}`} onClick={() => setFilter("skipped")}>Skipped {counts.skipped}</button>
      </div>

      <div className="reviewLayout">
        <div className="miniPalette">
          {filteredIndices.map((i) => (
            <button
              key={i}
              className={`miniCell ${status(questions[i])} ${i === selectedQ ? "current" : ""}`}
              onClick={() => setSelectedQ(i)}
            >
              {i + 1}
            </button>
          ))}
          {filteredIndices.length === 0 && <p className="muted small">No questions in this filter.</p>}
        </div>

        {selected && selectedRes && (
          <div className="reviewDetail">
            <div className="reviewDetailTop">
              <span className="qTag">Q{selectedQ! + 1}</span>
              <span className="chip">{selected.topic}</span>
              <span className={`resTag ${selectedRes}`}>{selectedRes}</span>
              <span className="muted small timeTag">{selected.given === null ? "—" : secs(selected.timeMs)}</span>
            </div>
            <div className="reviewText">{selected.text}</div>

            {selected.table && (
              <table className="diTable">
                <thead>
                  <tr>{selected.table.head.map((h, i) => <th key={i}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {selected.table.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => <td key={j} className={j === 0 ? "" : "num"}>{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {selected.image && (
              <img className="qImage" src={selected.image} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}

            <div className="reviewVals">
              {selected.given !== null && (
                <>
                  <span className="muted">your answer</span>
                  <b className={selectedRes === "correct" ? "good" : "bad"}>{givenText(selected, selected.given)}</b>
                  <span className="arrow">→</span>
                </>
              )}
              <span className="muted">correct</span>
              <b className="good">{answerText(selected)}</b>
            </div>
            {selected.solution && <div className="solution">{selected.solution}</div>}

            {api.backendEnabled() && api.getSession() && (
              <div className="qNoteBox">
                <label htmlFor="qnote">Your note on this question</label>
                <textarea
                  id="qnote"
                  placeholder="e.g. remember: this formula, or silly mistake with signs&hellip;"
                  value={notes[selectedQ!] ?? ""}
                  onChange={(e) => saveNote(selectedQ!, e.target.value)}
                  onBlur={() => commitNote(selectedQ!)}
                  disabled={when === null}
                  rows={2}
                />
                <span className="muted small qNoteStatus">
                  {when === null ? "saving to your account…" : noteSaving === "saving" ? "saving…" : noteSaving === "saved" ? "saved" : " "}
                </span>

                <div className="noteAttachRow">
                  <label className="attachBtn">
                    {uploadingQ === selectedQ ? "Uploading…" : "📎 Attach image or PDF"}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      multiple
                      hidden
                      disabled={when === null || uploadingQ === selectedQ}
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length) addAttachments(selectedQ!, e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {(attachments[selectedQ!] ?? []).length > 0 && (
                    <span className="muted small">{(attachments[selectedQ!] ?? []).length}/{MAX_ATTACHMENTS_PER_Q} attached</span>
                  )}
                </div>
                {attachError && <p className="muted small bad">{attachError}</p>}
                {(attachments[selectedQ!] ?? []).length > 0 && (
                  <div className="attachGrid">
                    {(attachments[selectedQ!] ?? []).map((a, i) => (
                      <div className="attachCard" key={a.url}>
                        {a.fileType.startsWith("image/") ? (
                          <a href={a.url} target="_blank" rel="noreferrer"><img className="attachThumb" src={a.url} alt={a.fileName} /></a>
                        ) : (
                          <a href={a.url} target="_blank" rel="noreferrer" className="attachPdf">📄<span>PDF</span></a>
                        )}
                        <span className="attachName">{a.fileName}</span>
                        <button className="attachRemove" onClick={() => removeAttachment(selectedQ!, i)} title="Remove">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="rowBtns">
              <button className="btn" onClick={() => stepReview(-1)} disabled={selectedPos <= 0}>&larr; Prev</button>
              <button className="btn primary" onClick={() => stepReview(1)} disabled={selectedPos < 0 || selectedPos >= filteredIndices.length - 1}>Next &rarr;</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
