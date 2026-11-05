import { useState } from "react";
import type { ExamSettings, Paper } from "../types";
import * as api from "../api";

interface Props {
  paper: Paper;
  onStart: () => void;
  onBack: () => void;
  settings: ExamSettings;
}

function candidateDisplayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export default function Instructions({ paper, onStart, onBack, settings }: Props) {
  const [agreed, setAgreed] = useState(false);
  const mc = paper.questions.filter((q) => q.type === "mc").length;
  const totalMarks = paper.questions.length;

  if (settings.examCenterSkin) {
    return (
      <IbpsInstructions
        paper={paper}
        onStart={() => {
          if (settings.monitorTabSwitches) document.documentElement.requestFullscreen?.().catch(() => {});
          onStart();
        }}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="instr">
      <header className="examBar">
        <div className="examBarLeft">
          <span className="examTitle">{paper.title}</span>
          <span className="examSub">
            General instructions
            {paper.exam !== "General" && <span className="chip examChip">{paper.exam}</span>}
          </span>
        </div>
        <div className="examBarRight">
          <div className="clockBox">
            <span className="clockLabel">Time</span>
            <span className="clockValue">{String(paper.durationMinutes).padStart(2, "0")}:00</span>
          </div>
        </div>
      </header>

      <div className="instrBody">
        <div className="card">
          <h2>Read before you begin</h2>
          <ol className="instrList">
            <li>This paper has <b>{paper.questions.length} questions</b> carrying <b>{totalMarks} marks</b> in total
              {paper.sections.length > 1 && <> across <b>{paper.sections.length} sections</b></>}.</li>
            <li>You have <b>{paper.durationMinutes} minutes</b>. The clock runs continuously and the paper submits itself at zero.</li>
            <li>Every wrong answer costs <b>{paper.negativeMarking} marks</b>. Unattempted questions cost nothing.</li>
            <li>{paper.questions.length - mc} questions need a typed number; {mc} are multiple choice.</li>
            <li>Use <b>Save &amp; Next</b> to record an answer, <b>Mark for Review</b> to flag one, and the palette on the right to jump anywhere.</li>
            <li>The analysis after submission shows your net score, average time per question and a topic-wise breakdown.</li>
          </ol>

          <div className="legendInline">
            <span><i className="sw notVisited" /> Not visited</span>
            <span><i className="sw notAnswered" /> Visited, no answer</span>
            <span><i className="sw answered" /> Answered</span>
            <span><i className="sw marked" /> Marked for review</span>
            <span><i className="sw answeredMarked" /> Answered &amp; marked</span>
          </div>

          <label className="agree">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I have read the instructions and I am ready to begin.</span>
          </label>

          <div className="rowBtns">
            <button className="btn" onClick={onBack}>Choose another paper</button>
            <button
              className="btn primary"
              disabled={!agreed}
              onClick={() => {
                if (settings.monitorTabSwitches) document.documentElement.requestFullscreen?.().catch(() => {});
                onStart();
              }}
            >
              Start the exam
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IbpsInstructions({ paper, onStart, onBack }: { paper: Paper; onStart: () => void; onBack: () => void }) {
  const [page, setPage] = useState<1 | 2>(1);
  const [lang, setLang] = useState("English");
  const [agreed, setAgreed] = useState(false);
  const session = api.getSession();
  const candidateName = session ? candidateDisplayName(session.email) : "Guest Candidate";
  const candidateInitials = candidateName.slice(0, 2).toUpperCase();
  const negMarking = paper.negativeMarking > 0;

  const CandidatePanel = (
    <div className="ibpsInstrSide">
      <div className="ibpsCandAvatar">{candidateInitials}</div>
      <div className="ibpsCandName">{candidateName}</div>
    </div>
  );

  return (
    <div className="ibpsSkin">
      <div className="ibpsTopBrand">
        <div className="ibpsBrandMark"><span className="ibpsLogoDot">P</span> Pariksha</div>
        <h2>{paper.title}</h2>
      </div>

      {page === 1 ? (
        <>
          <div className="ibpsInstrBar">Instructions</div>
          <div className="ibpsInstrBody">
            <div className="ibpsInstrMain">
              <h3>General Instructions</h3>
              <ol>
                <li>Total duration of examination is <b>{paper.durationMinutes} minutes</b>.</li>
                <li>The clock will be set at the server. The countdown timer will display the remaining time. When the timer reaches zero, the examination will end by itself &mdash; you will not be required to submit manually.</li>
                <li>The Question Palette on the right shows the status of each question using one of the following symbols:</li>
              </ol>

              <div className="ibpsLegendRow"><span className="ibpsLegendIcon notVisited">1</span> You have not visited the question yet.</div>
              <div className="ibpsLegendRow"><span className="ibpsLegendIcon notAnswered">2</span> You have not answered the question.</div>
              <div className="ibpsLegendRow"><span className="ibpsLegendIcon answered">3</span> You have answered the question.</div>
              <div className="ibpsLegendRow"><span className="ibpsLegendIcon marked">4</span> You have NOT answered the question, but marked it for review.</div>
              <div className="ibpsLegendRow"><span className="ibpsLegendIcon markedAnswered">5</span> Answered and marked for review &mdash; <span className="ibpsNote">will be considered in evaluation.</span></div>

              <h3>Navigating to a Question</h3>
              <ol start={7}>
                <li>To answer a question:
                  <ol>
                    <li>Click a question number in the palette to go there directly &mdash; <b>this does NOT save your current answer.</b></li>
                    <li>Click <b>Save &amp; Next</b> to save your answer and move to the next question.</li>
                    <li>Click <b>Mark for Review &amp; Next</b> to save, flag for review, and move on.</li>
                  </ol>
                </li>
              </ol>
            </div>
            {CandidatePanel}
          </div>
          <div className="ibpsInstrBtns">
            <button className="btn" onClick={onBack}>Choose another paper</button>
            <button className="btn primary" onClick={() => setPage(2)}>Next &rsaquo;</button>
          </div>
        </>
      ) : (
        <>
          <div className="ibpsInstrBar">Other Important Instructions</div>
          <div className="ibpsInstrBody">
            <div className="ibpsInstrMain">
              <table className="ibpsPaperTable">
                <thead>
                  <tr><th>Sr.No.</th><th>Section</th><th>Questions</th><th>Max Marks</th><th>Duration</th></tr>
                </thead>
                <tbody>
                  {paper.sections.map((s, i) => (
                    <tr key={s.name}>
                      <td>{i + 1}</td>
                      <td>{s.name}</td>
                      <td>{s.to - s.from + 1}</td>
                      <td>{s.to - s.from + 1}</td>
                      <td>{s.minutes ? `${s.minutes} min` : "—"}</td>
                    </tr>
                  ))}
                  <tr>
                    <td><b>Total</b></td>
                    <td></td>
                    <td><b>{paper.questions.length}</b></td>
                    <td><b>{paper.questions.length}</b></td>
                    <td><b>{paper.durationMinutes} min</b></td>
                  </tr>
                </tbody>
              </table>
              <ol start={4}>
                {negMarking ? (
                  <li>There is a <b>negative marking of {paper.negativeMarking}</b> for each wrong answer. Candidates are advised to avoid guessing.</li>
                ) : (
                  <li>There is <b>no penalty</b> for wrong answers. Candidates are advised to avoid answering by guessing.</li>
                )}
                <li>Candidates will not be permitted to submit the examination until the entire test duration is exhausted.</li>
                <li>After expiry of the duration, candidates will not be able to attempt or check answers &mdash; responses are saved automatically even without clicking Submit.</li>
              </ol>
              <div className="ibpsLockWarning">&#9888; Under no circumstances click any keyboard key once the exam starts &mdash; this will lock the exam.</div>
            </div>
            {CandidatePanel}
          </div>
          <div className="ibpsInstrFoot">
            <div className="ibpsLangRow">
              Choose your default language:
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                <option>English</option>
                <option>Hindi</option>
              </select>
            </div>
            <label className="ibpsDeclareRow">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>
                I have read and understood the instructions. All computer hardware allotted to me is in proper
                working condition. I am not in possession of any prohibited gadget, and I agree to be liable for
                disciplinary action if found otherwise.
              </span>
            </label>
          </div>
          <div className="ibpsInstrBtns ibpsInstrBtnsSpread">
            <button className="btn" onClick={() => setPage(1)}>&lsaquo; Previous</button>
            <button className="btn primary" disabled={!agreed} onClick={onStart}>I am ready to begin</button>
          </div>
        </>
      )}
    </div>
  );
}
