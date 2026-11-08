import { useEffect, useRef, useState } from "react";
import type { LibraryFileLink, LibraryItem, Paper } from "../../shared/types";
import { parsePaper } from "../../shared/paper";
import { aiConversionPrompt, aiConversionPromptWithLinks } from "../../shared/aiPrompt";
import * as api from "../../shared/api";
import Spinner from "./Spinner";

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

function estMinutes(questionCount: number): number {
  return Math.max(1, Math.round((questionCount * 50) / 60));
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
  // Each loaded page is cached by index so "Previous" is instant (no
  // refetch) - DynamoDB's cursor only moves forward, so nextCursors[i] is
  // the cursor that was returned right after page i was fetched, i.e. what
  // "Next" needs once the user is sitting on page i.
  const [pages, setPages] = useState<LibraryItem[][] | null>(null);
  const [nextCursors, setNextCursors] = useState<(string | null)[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [fileLinks, setFileLinks] = useState<LibraryFileLink[] | null>(null);
  const [linksError, setLinksError] = useState("");
  const [previewing, setPreviewing] = useState<LibraryFileLink | null>(null);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const yamlFileRef = useRef<HTMLInputElement>(null);

  // The active search term pages are fetched for - separate from `query`
  // (the live input value) so typing doesn't refetch on every keystroke;
  // see the debounce effect below. Empty string = browsing the whole vault.
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setPages(null);
    api.fetchLibrary(undefined, searchTerm || undefined).then((res) => {
      setPages([res.items]);
      setNextCursors([res.nextCursor]);
      setPageIndex(0);
    }).catch(() => setPages([[]]));
  }, [searchTerm]);

  const items = pages ? pages[pageIndex] ?? null : null;
  const hasPrevPage = pageIndex > 0;
  const hasNextPage = !!pages && (pageIndex + 1 < pages.length || !!nextCursors[pageIndex]);

  async function goToNextPage() {
    if (!pages || pageLoading) return;
    if (pageIndex + 1 < pages.length) {
      setPageIndex(pageIndex + 1);
      return;
    }
    const cursor = nextCursors[pageIndex];
    if (!cursor) return;
    setPageLoading(true);
    setPageError("");
    try {
      const res = await api.fetchLibrary(cursor, searchTerm || undefined);
      setPages((prev) => [...(prev ?? []), res.items]);
      setNextCursors((prev) => [...prev, res.nextCursor]);
      setPageIndex(pageIndex + 1);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Could not load that page.");
    } finally {
      setPageLoading(false);
    }
  }

  function goToPrevPage() {
    if (pageIndex > 0) setPageIndex(pageIndex - 1);
  }

  function updateItemInPages(updated: LibraryItem) {
    setPages((prev) => (prev ?? []).map((pg) => pg.map((it) => (it.itemId === updated.itemId ? updated : it))));
  }

  async function openItem(it: LibraryItem) {
    setOpenError("");
    setOpeningId(it.itemId);
    try {
      const full = await api.fetchLibraryItem(it.itemId);
      setSelected(full);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Could not open that item.");
    } finally {
      setOpeningId(null);
    }
  }

  useEffect(() => {
    if (!selected) return;
    setFileLinks(null);
    setLinksError("");
    setPasted("");
    setSaveError("");
    setShowPrompt(false);
    setPreviewing(null);
    setFullscreenPreview(false);
    setConsoleOpen(!selected.paper);
    api.getLibraryFileLinks(selected.itemId).then((links) => {
      setFileLinks(links);
      const firstPdf = links.find((l) => /\.pdf$/i.test(l.fileName));
      if (firstPdf) setPreviewing(firstPdf);
    }).catch((e) => setLinksError(e.message));
  }, [selected?.itemId]);

  useEffect(() => {
    if (!fullscreenPreview) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreenPreview(false);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreenPreview]);

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
      setPages((prev) => {
        if (!prev || prev.length === 0) return [[item]];
        return [[item, ...prev[0]], ...prev.slice(1)];
      });
      setPageIndex(0);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not upload those files.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function copyPrompt() {
    try {
      const text = fileLinks ? aiConversionPromptWithLinks(fileLinks) : aiConversionPrompt;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowPrompt(true);
    }
  }

  function openConsole() {
    setConsoleOpen(true);
    setTimeout(() => consoleRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 10);
  }

  async function loadYamlFile(file: File | undefined) {
    if (!file) return;
    setSaveError("");
    try {
      setPasted(await file.text());
    } catch {
      setSaveError("Could not read that file.");
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
      updateItemInPages(updated);
      setPasted("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save that paper.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(itemId: string) {
    setDeleting(true);
    try {
      await api.deleteLibraryItem(itemId);
      setPages((prev) => (prev ?? []).map((pg) => pg.filter((it) => it.itemId !== itemId)));
      setSelected(null);
    } finally {
      setDeleting(false);
    }
  }

  if (selected) {
    const totalSize = selected.files.reduce((s, f) => s + f.fileSize, 0);
    const ready = !!selected.paper;
    const questionCount = selected.paper?.questions.length ?? 0;
    const sectionCount = selected.paper?.sections.length ?? 0;
    const activePreview = previewing ?? fileLinks?.[0] ?? null;
    const activeIsPdf = activePreview ? /\.pdf$/i.test(activePreview.fileName) : false;
    const activeIsImage = activePreview ? isImageType(selected.files.find((f) => f.fileName === activePreview.fileName)?.fileType ?? "") : false;

    return (
      <div className="lpdPage">
        <div className="lpdShell">
          <div className="lpdLeft">
            <button className="lpdBack" onClick={() => setSelected(null)}>&larr; All papers</button>

            <div className="lpdTicketWrap">
              <div className="lpdTicket">
                <div className="lpdStubMain">
                  <div className={`lpdEyebrow ${ready ? "" : "pending"}`}>
                    <span className="live" />{ready ? "CONVERTED & SAVED" : "AWAITING CONVERSION"}
                  </div>
                  <h1 className="lpdTitle">{selected.title}</h1>

                  {ready ? (
                    <div className="lpdRouteRow">
                      <div className="lpdRouteVal"><b>{questionCount}</b><span>Questions</span></div>
                      <div className="lpdRouteDots"><i /><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg><i /></div>
                      <div className="lpdRouteVal"><b>{sectionCount}</b><span>Section{sectionCount === 1 ? "" : "s"}</span></div>
                      <div className="lpdRouteDots"><i /><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg><i /></div>
                      <div className="lpdRouteVal"><b>~{estMinutes(questionCount)}m</b><span>Est. time</span></div>
                    </div>
                  ) : (
                    <div className="lpdRouteRow">
                      <div className="lpdRouteVal"><b>{selected.files.length}</b><span>File{selected.files.length === 1 ? "" : "s"}</span></div>
                      <div className="lpdRouteDots"><i /><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg><i /></div>
                      <div className="lpdRouteVal"><b>{fmtSize(totalSize)}</b><span>Size</span></div>
                    </div>
                  )}

                  <div className="lpdBarcode">
                    {Array.from({ length: 20 }, (_, i) => (
                      <i key={i} style={{ width: `${1 + (i % 3)}px`, height: `${40 + ((i * 37) % 60)}%` }} />
                    ))}
                  </div>
                </div>

                <div className="lpdNotch top" />
                <div className="lpdNotch bottom" />
                <div className="lpdDashSeam" />

                <div className={`lpdStubAction ${ready ? "" : "pending"}`}>
                  <div className="lpdReadyIcon">
                    {ready ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                    )}
                  </div>
                  <div className="lpdReadyLabel">{ready ? "Ready" : "Pending"}</div>
                  {ready ? (
                    <button className="lpdStartBtn" onClick={() => onLoaded(selected.paper!)}>
                      Start test<small>tap to begin</small>
                    </button>
                  ) : (
                    <button className="lpdStartBtn pending" onClick={openConsole}>
                      Convert now<small>copy the prompt</small>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="lpdTimeline">
              <div className="lpdTStep">
                <div className="lpdTDot">&#10003;</div>
                <div className="lpdTText">
                  <span className="lpdTLabel">Uploaded</span>
                  <span className="lpdTSub">{new Date(selected.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className={`lpdTLine ${ready ? "" : "pending"}`} />
              <div className={`lpdTStep ${ready ? "" : "pending"}`}>
                <div className="lpdTDot">{ready ? "✓" : "2"}</div>
                <div className="lpdTText">
                  <span className="lpdTLabel">Converted</span>
                  <span className="lpdTSub">{ready ? `${questionCount} questions` : "not yet"}</span>
                </div>
              </div>
              <div className={`lpdTLine ${ready ? "" : "pending"}`} />
              <div className={`lpdTStep ${ready ? "" : "pending"}`}>
                <div className="lpdTDot">{ready ? "✓" : "3"}</div>
                <div className="lpdTText">
                  <span className="lpdTLabel">Ready</span>
                  <span className="lpdTSub">{ready ? "whenever you are" : "—"}</span>
                </div>
              </div>
            </div>

            <div className="lpdToggleRow">
              <button className={`lpdToggle ${consoleOpen ? "open" : ""}`} onClick={() => setConsoleOpen((v) => !v)}>
                <span className="lpdDot3"><i /><i /><i /></span>
                View source files &amp; re-convert
                <svg className="lpdChev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>

            <div className={`lpdConsoleWrap ${consoleOpen ? "open" : ""}`} ref={consoleRef}>
              <div className="lpdConsole">
                <div className="lpdConsoleHead">
                  <div className="lpdConsoleDots"><i /><i /><i /></div>
                  <span className="lpdConsoleHeadText">re-convert.sh &mdash; manual AI hand-off</span>
                </div>

                <div className="lpdStepFlow">
                  <div className="lpdStepCol">
                    <div className="lpdStepNum"><i>1</i>COPY THE PROMPT</div>

                    {linksError && <p className="lpdSrcHint">Could not load download links: {linksError}</p>}
                    {fileLinks === null && !linksError && <div className="loadingBlock"><Spinner size={14} label="Loading files…" /></div>}
                    {fileLinks && fileLinks.map((f) => {
                      const meta = selected.files.find((sf) => sf.fileName === f.fileName);
                      const isActive = activePreview?.fileName === f.fileName;
                      return (
                        <div className="lpdFileChip" key={f.fileName}>
                          <FileTypeIcon fileType={meta?.fileType ?? ""} />
                          <span className="fname">{f.fileName}</span>
                          {meta && <span className="fsize">{fmtSize(meta.fileSize)}</span>}
                          <button
                            className={`lpdViewBtn ${isActive ? "active" : ""}`}
                            onClick={() => setPreviewing(f)}
                          >
                            {isActive ? "Viewing" : "View"}
                          </button>
                          <a className="lpdDlBtn" href={f.url} target="_blank" rel="noreferrer" aria-label={`Download ${f.fileName}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 4v11M12 15l-4-4M12 15l4-4M5 19h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </a>
                        </div>
                      );
                    })}

                    <div className="lpdBtnRow">
                      <button className="lpdBtnSm lpdBtnSmPrimary" onClick={copyPrompt}>
                        {copied ? "Copied!" : "Copy prompt"}
                      </button>
                      <button className="lpdBtnSm lpdBtnSmGhost" onClick={() => setShowPrompt((v) => !v)}>{showPrompt ? "Hide" : "Show"} prompt</button>
                    </div>
                    {showPrompt && (
                      <pre className="promptPreview">{fileLinks ? aiConversionPromptWithLinks(fileLinks) : aiConversionPrompt}</pre>
                    )}
                    <p className="lpdSrcHint">
                      {fileLinks
                        ? "Paste it into a web-enabled ChatGPT, Gemini, or Claude — it carries a direct link to this file, so nothing to attach by hand."
                        : "Paste the prompt into ChatGPT, Gemini, or Claude along with the file(s) above."}
                    </p>
                  </div>

                  <div className="lpdFlowArrow">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </div>

                  <div className="lpdStepCol">
                    <div className="lpdStepNumRow">
                      <div className="lpdStepNum"><i>2</i>PASTE OR UPLOAD</div>
                      <label className="lpdUploadChip">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        Upload .yml / .json
                        <input
                          ref={yamlFileRef}
                          type="file"
                          accept=".yml,.yaml,.json,application/json,text/yaml"
                          hidden
                          onChange={(e) => { loadYamlFile(e.target.files?.[0]); e.target.value = ""; }}
                        />
                      </label>
                    </div>
                    <div className="lpdSrcPaste">
                      <div
                        className={`lpdCodeBox ${dragging ? "dragging" : ""}`}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => { e.preventDefault(); setDragging(false); loadYamlFile(e.dataTransfer.files?.[0]); }}
                      >
                        <div className="lpdCodeGutter">
                          {Array.from({ length: Math.max(5, Math.min(30, pasted.split("\n").length)) }, (_, i) => (
                            <span key={i}>{i + 1}</span>
                          ))}
                        </div>
                        <textarea
                          value={pasted}
                          onChange={(e) => setPasted(e.target.value)}
                          spellCheck={false}
                          placeholder={"# paste the YAML or JSON the AI handed back\n# — or drop a .yml / .json file here"}
                        />
                        <div className="lpdDropOverlay">Drop file to load it</div>
                      </div>
                      {saveError && <pre className="error">{saveError}</pre>}
                      {pasted.trim() && (
                        <div className="lpdSaveRow">
                          <button className="lpdBtnSm lpdBtnSmPrimary" onClick={saveAsPaper} disabled={saving}>
                            {saving ? "Saving…" : ready ? "Replace saved paper" : "Save as test paper"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lpdDeleteZone">
              <div className="dzText">
                <b>Remove this paper</b>
                <span>Deletes the file(s), the converted questions, and this entry &mdash; can&rsquo;t be undone.</span>
              </div>
              <button
                className="deleteBtn"
                disabled={deleting}
                onClick={() => { if (confirm("Delete this from your vault? This can't be undone.")) deleteItem(selected.itemId); }}
              >
                {deleting ? (
                  <Spinner size={14} inline />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                )}
                {deleting ? "Deleting…" : "Delete from vault"}
              </button>
            </div>
          </div>

          <div className={`lpdRight ${fullscreenPreview ? "fullscreen" : ""}`}>
            {activePreview ? (
              <>
                <div className="lpdPreviewHead">
                  <div className="ptitle">
                    <FileTypeIcon fileType={selected.files.find((f) => f.fileName === activePreview.fileName)?.fileType ?? ""} />
                    <span className="fname">{activePreview.fileName}</span>
                  </div>
                  {fileLinks && fileLinks.length > 1 && (
                    <div className="lpdFileTabs">
                      {fileLinks.map((f) => (
                        <button
                          key={f.fileName}
                          className={`lpdFileTab ${activePreview.fileName === f.fileName ? "active" : ""}`}
                          onClick={() => setPreviewing(f)}
                        >
                          {f.fileName}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="lpdPvBtns">
                    <button className="lpdPvBtn" onClick={() => setFullscreenPreview((v) => !v)} title={fullscreenPreview ? "Exit full screen" : "Full screen"}>
                      {fullscreenPreview ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2"><path d="M9 3v4a1 1 0 0 1-1 1H4M20 9h-4a1 1 0 0 1-1-1V4M15 21v-4a1 1 0 0 1 1-1h4M4 15h4a1 1 0 0 1 1 1v4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      )}
                    </button>
                    <a className="lpdPvBtn" href={activePreview.url} target="_blank" rel="noreferrer" title="Download">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </a>
                  </div>
                </div>
                <div className="lpdPreviewBody">
                  {activeIsPdf ? (
                    <iframe className="lpdFrame" src={`${activePreview.url}#toolbar=0&navpanes=0`} title={activePreview.fileName} />
                  ) : activeIsImage ? (
                    <div className="lpdImgFrame"><img src={activePreview.url} alt={activePreview.fileName} /></div>
                  ) : (
                    <div className="lpdPreviewEmpty">No inline preview for this file — use download instead.</div>
                  )}
                </div>
              </>
            ) : (
              <div className="lpdPreviewEmpty">
                {linksError ? `Could not load this file: ${linksError}` : <Spinner size={18} label="Loading preview…" />}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

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
          <span>PDF or image, one or several pages per paper &middot; up to 7MB each</span>
        </div>
        <span className="dropBtn">Choose files</span>
      </div>
      {uploadError && <pre className="error">{uploadError}</pre>}

      {items === null && <div className="loadingBlock"><Spinner size={18} label={searchTerm ? "Searching your vault…" : "Loading your vault…"} /></div>}
      {openError && <pre className="error">{openError}</pre>}
      {pageError && <pre className="error">{pageError}</pre>}

      {items !== null && (query.trim() || items.length > 0) && (
        <div className="vaultSearch">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
          <input placeholder="Search your whole vault…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      {items !== null && items.length === 0 && (
        <p className="muted">
          {searchTerm ? <>No papers match &ldquo;{searchTerm}&rdquo; anywhere in your vault.</> : <>Nothing in your vault yet &mdash; upload a paper above.</>}
        </p>
      )}

      {items !== null && items.length > 0 && (
        <>
          <div className="vaultGrid">
            {items.map((it) => {
              const fileCount = it.files.length;
              const isImage = isImageType(it.files[0]?.fileType ?? "");
              return (
                <button
                  className="vaultCard"
                  key={it.itemId}
                  onClick={() => openItem(it)}
                  disabled={openingId === it.itemId}
                >
                  <div className="vcThumb">
                    {fileCount > 1 && <div className="vcStack" />}
                    {it.thumbnailUrl ? (
                      <img className="vcThumbImg" src={it.thumbnailUrl} alt="" loading="lazy" />
                    ) : (
                      <div className="vcPage">
                        <div className="bar title" />
                        <div className="bar w1" />
                        <div className="bar w2" />
                        <div className="bar w3" />
                        <div className="vcOpts"><i /><i /><i /><i /></div>
                      </div>
                    )}
                    {openingId === it.itemId ? (
                      <span className="statusPill pending onThumb">Opening&hellip;</span>
                    ) : it.hasPaper ? (
                      <span className="statusPill ready onThumb">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 12l5 5 11-11" /></svg>
                        Ready
                      </span>
                    ) : (
                      <span className="statusPill pending onThumb">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                        Not converted yet
                      </span>
                    )}
                    <span className="vcFileBadge">{isImage ? "IMG" : "PDF"}{fileCount > 1 ? ` +${fileCount - 1}` : ""}</span>
                  </div>
                  <div className="vcBody">
                    <div className="vaultCardTitle">{it.title}</div>
                    <div className="vaultCardMeta">
                      {fmtSize(it.files.reduce((s, f) => s + f.fileSize, 0))} &middot; {new Date(it.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {items !== null && items.length > 0 && (hasPrevPage || hasNextPage) && (
        <div className="vaultPager">
          <button className="vaultPagerBtn" onClick={goToPrevPage} disabled={!hasPrevPage || pageLoading} aria-label="Previous page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span className="vaultPagerLabel">Page <b>{pageIndex + 1}</b></span>
          <button className="vaultPagerBtn" onClick={goToNextPage} disabled={!hasNextPage || pageLoading} aria-label="Next page">
            {pageLoading ? <Spinner size={14} inline /> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </button>
        </div>
      )}
    </div>
  );
}
