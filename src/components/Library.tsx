import { useEffect, useRef, useState } from "react";
import type { LibraryFileLink, LibraryItem, Paper } from "../types";
import { parsePaper } from "../paper";
import { aiConversionPrompt } from "../aiPrompt";
import * as api from "../api";

interface Props {
  onLoaded: (p: Paper) => void;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => resolve(String(rd.result).split(",")[1] ?? "");
    rd.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    rd.readAsDataURL(file);
  });
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(fileType: string): boolean {
  return fileType.startsWith("image/");
}

function FileTypeIcon({ fileType }: { fileType: string }) {
  if (isImageType(fileType)) {
    return (
      <span className="fileTypeIcon img">
        <svg width="20" height="20" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="9" cy="10" r="1.6" fill="currentColor" /><path d="M4 17l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    );
  }
  return (
    <span className="fileTypeIcon pdf">
      <svg width="20" height="20" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
    </span>
  );
}

export default function Library({ onLoaded }: Props) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [fileLinks, setFileLinks] = useState<LibraryFileLink[] | null>(null);
  const [linksError, setLinksError] = useState("");
  const [pasted, setPasted] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.fetchLibrary().then(setItems).catch(() => setItems([]));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setFileLinks(null);
    setLinksError("");
    setPasted("");
    setSaveError("");
    setShowPrompt(false);
    api.getLibraryFileLinks(selected.itemId).then(setFileLinks).catch((e) => setLinksError(e.message));
  }, [selected?.itemId]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setUploadError("");
    try {
      const encoded = await Promise.all(
        files.map(async (f) => ({
          fileName: f.name,
          fileType: f.type || "application/octet-stream",
          fileBase64: await readAsBase64(f),
        }))
      );
      const item = await api.uploadLibraryFiles(encoded);
      setItems((prev) => [item, ...(prev ?? [])]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not upload those files.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(aiConversionPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowPrompt(true);
    }
  }

  async function saveAsPaper() {
    if (!selected) return;
    const res = parsePaper(pasted);
    if (res.error || !res.paper) {
      setSaveError(res.error ?? "Could not read that paper.");
      return;
    }
    setSaveError("");
    setSaving(true);
    try {
      const updated = await api.saveLibraryPaper(selected.itemId, res.paper);
      setSelected(updated);
      setItems((prev) => (prev ?? []).map((it) => (it.itemId === updated.itemId ? updated : it)));
      setPasted("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save that paper.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(itemId: string) {
    await api.deleteLibraryItem(itemId);
    setItems((prev) => (prev ?? []).filter((it) => it.itemId !== itemId));
    setSelected(null);
  }

  if (selected) {
    const totalSize = selected.files.reduce((s, f) => s + f.fileSize, 0);
    const ready = !!selected.paper;
    return (
      <div className="home">
        <header className="homeHead">
          <div className="brand">
            <span className={`detailIcon ${ready ? "ready" : ""}`}><FileTypeIcon fileType={selected.files[0]?.fileType ?? ""} /></span>
            <div>
              <h1>{selected.title}</h1>
              <p>{selected.files.length} file{selected.files.length === 1 ? "" : "s"} &middot; {fmtSize(totalSize)} &middot; uploaded {new Date(selected.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          <button className="btn" onClick={() => setSelected(null)}>&larr; All papers</button>
        </header>

        <div className="homeGrid">
          <section className="card stepCard">
            <div className="stepHead">
              <span className="stepNum">1</span>
              <h2>Your files</h2>
            </div>
            {linksError && <p className="muted small">Could not load download links: {linksError}</p>}
            {fileLinks === null && !linksError && <p className="muted small">Loading&hellip;</p>}
            {fileLinks && (
              <div className="libFileList">
                {fileLinks.map((f) => {
                  const meta = selected.files.find((sf) => sf.fileName === f.fileName);
                  return (
                    <div className="libFileRow2" key={f.fileName}>
                      <FileTypeIcon fileType={meta?.fileType ?? ""} />
                      <span className="fn">{f.fileName}</span>
                      {meta && <span className="fs">{fmtSize(meta.fileSize)}</span>}
                      <a className="dlBtn" href={f.url} target="_blank" rel="noreferrer" aria-label={`Download ${f.fileName}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 4v11M12 15l-4-4M12 15l4-4M5 19h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </a>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rowBtns">
              <button className="btn primary" onClick={copyPrompt}>
                <svg width="14" height="14" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M4 16V5a1 1 0 0 1 1-1h11" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
                {copied ? "Copied!" : "Copy prompt"}
              </button>
              <button className="btn" onClick={() => setShowPrompt((v) => !v)}>{showPrompt ? "Hide" : "Show"} the prompt</button>
            </div>
            {showPrompt && <pre className="promptPreview">{aiConversionPrompt}</pre>}
            <p className="muted small">
              Paste the prompt into ChatGPT, Gemini, or Claude along with the file(s) above, then
              paste what it hands back on the right.
            </p>
          </section>

          <section className="card stepCard alt">
            {ready ? (
              <>
                <div className="stepHead">
                  <span className="stepNum">2</span>
                  <h2>Saved paper</h2>
                </div>
                <div className="readyBanner">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M4 12l5 5 11-11" /></svg>
                  <div>
                    <b>Converted and saved</b>
                    <span>{selected.paper!.questions.length} questions &middot; {selected.paper!.sections.length} section{selected.paper!.sections.length === 1 ? "" : "s"} &middot; ready whenever you are</span>
                  </div>
                </div>
                <button className="startBtn" onClick={() => onLoaded(selected.paper!)}>
                  Start test
                  <svg width="15" height="15" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <p className="muted small" style={{ marginTop: 14 }}>Want to replace it with a fresh conversion instead? Paste new YAML below.</p>
                <textarea
                  className="pasteBox"
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  spellCheck={false}
                  placeholder="paste the YAML or JSON the AI handed back..."
                />
                {saveError && <pre className="error">{saveError}</pre>}
                {pasted.trim() && (
                  <div className="rowBtns">
                    <button className="btn primary" onClick={saveAsPaper} disabled={saving}>
                      {saving ? "Saving…" : "Replace saved paper"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="stepHead">
                  <span className="stepNum">2</span>
                  <h2>Paste the converted YAML</h2>
                </div>
                <textarea
                  className="pasteBox"
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  spellCheck={false}
                  placeholder="paste the YAML or JSON the AI handed back..."
                />
                {saveError && <pre className="error">{saveError}</pre>}
                <div className="rowBtns">
                  <button className="btn primary" onClick={saveAsPaper} disabled={!pasted.trim() || saving}>
                    {saving ? "Saving…" : "Save as test paper"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>

        <button className="deleteLink" onClick={() => { if (confirm("Delete this from your vault? This can't be undone.")) deleteItem(selected.itemId); }}>
          Delete from vault
        </button>
      </div>
    );
  }

  const readyCount = (items ?? []).filter((it) => it.paper).length;

  return (
    <div className="home">
      <div className="vaultHero">
        <span className="vaultHeroIcon">
          <svg width="24" height="24" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2" fill="none" stroke="#fff" strokeWidth="2" /><path d="M8 8h8M8 12h8M8 16h5" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>
        </span>
        <div className="vaultHeroText">
          <h1>Keep every paper you convert</h1>
          <p>Upload the files once, run them through the AI-conversion prompt, paste back the result &mdash; it&rsquo;s saved here for good. No file-hunting, no re-converting.</p>
        </div>
        {items !== null && items.length > 0 && (
          <>
            <div className="vaultStat"><b>{items.length}</b><span>Papers</span></div>
            <div className="vaultStat"><b>{readyCount}</b><span>Ready</span></div>
          </>
        )}
      </div>

      <div className="dropCard">
        <input
          ref={fileRef}
          className="dropZoneInput"
          type="file"
          accept=".pdf,image/*"
          multiple
          onChange={onUpload}
          aria-label="Upload files to your vault"
          disabled={uploading}
        />
        <span className="dropIcon">
          <svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 15V4M12 4l-4 4M12 4l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </span>
        <div className="dropText">
          <b>{uploading ? "Uploading…" : "Drag files here, or click to browse"}</b>
          <span>PDF or image, one or several pages per paper &middot; up to 6MB each</span>
        </div>
        <span className="dropBtn">Choose files</span>
      </div>
      {uploadError && <pre className="error">{uploadError}</pre>}

      {items === null && <p className="muted">Loading&hellip;</p>}
      {items !== null && items.length === 0 && <p className="muted">Nothing in your vault yet &mdash; upload a paper above.</p>}

      {items !== null && items.length > 0 && (
        <div className="vaultGrid">
          {items.map((it) => (
            <button className="vaultCard" key={it.itemId} onClick={() => setSelected(it)}>
              <FileTypeIcon fileType={it.files[0]?.fileType ?? ""} />
              <div className="vaultCardMain">
                <div className="vaultCardTitle">{it.title}</div>
                <div className="vaultCardMeta">
                  {it.files.length} file{it.files.length === 1 ? "" : "s"} &middot; {fmtSize(it.files.reduce((s, f) => s + f.fileSize, 0))} &middot; {new Date(it.createdAt).toLocaleDateString()}
                </div>
              </div>
              {it.paper ? (
                <span className="statusPill ready">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 12l5 5 11-11" /></svg>
                  Ready to test
                </span>
              ) : (
                <span className="statusPill pending">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                  Needs conversion
                </span>
              )}
              <svg className="cardArrow" width="18" height="18" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
