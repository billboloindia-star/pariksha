import { useState } from "react";
import type { Paper } from "../types";

interface Props {
  paper: Paper;
  onStart: () => void;
  onBack: () => void;
}

export default function Instructions({ paper, onStart, onBack }: Props) {
  const [agreed, setAgreed] = useState(false);
  const mc = paper.questions.filter((q) => q.type === "mc").length;
  const totalMarks = paper.questions.length;

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
                document.documentElement.requestFullscreen?.().catch(() => {});
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
