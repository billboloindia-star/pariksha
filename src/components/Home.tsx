import { useRef, useState } from "react";
import { parsePaper } from "../paper";
import type { Paper } from "../types";
import demoPaper from "../../demo_paper.yml?raw";

interface Props {
  onLoaded: (p: Paper) => void;
}

export default function Home({ onLoaded }: Props) {
  const [error, setError] = useState<string>("");
  const [pasted, setPasted] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function load(text: string) {
    const res = parsePaper(text);
    if (res.error || !res.paper) {
      setError(res.error ?? "Could not read that paper.");
      return;
    }
    setError("");
    onLoaded(res.paper);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const rd = new FileReader();
    rd.onload = () => load(String(rd.result));
    rd.onerror = () => setError("Could not read that file.");
    rd.readAsText(f);
  }

  function loadDemo() {
    setPasted(demoPaper);
    load(demoPaper);
  }

  return (
    <div className="home">
      <header className="homeHead">
        <div className="brand">
          <span className="brandMark">RRB</span>
          <div>
            <h1>Exam runner</h1>
            <p>Load a paper, write it in exam conditions, then read the analysis.</p>
          </div>
        </div>
      </header>

      <div className="homeGrid">
        <section className="card">
          <h2>1 · Choose the paper file</h2>
          <p className="muted">A <code>.json</code> or <code>.yml</code> paper, built to the format in <code>paper_format.md</code>.</p>
          <input ref={fileRef} type="file" accept=".json,.yml,.yaml,.txt" onChange={onFile} />
          {fileName && <p className="muted small">selected: {fileName}</p>}
        </section>

        <section className="card">
          <h2>2 · Or paste the paper</h2>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            spellCheck={false}
            placeholder="paste JSON or YAML here..."
          />
          <div className="rowBtns">
            <button className="btn primary" onClick={() => load(pasted)} disabled={!pasted.trim()}>
              Read pasted paper
            </button>
            <button className="btn" onClick={loadDemo}>Load the demo paper</button>
          </div>
        </section>
      </div>

      {error && <pre className="error">{error}</pre>}

      <footer className="homeFoot">
        <span>runs offline · nothing leaves this computer</span>
        <span>json or yaml</span>
      </footer>
    </div>
  );
}
