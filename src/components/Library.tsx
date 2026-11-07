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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.fetchLibrary().then((res) => {
      setPages([res.items]);
      setNextCursors([res.nextCursor]);
    }).catch(() => setPages([[]]));
  }, []);

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
      const res = await api.fetchLibrary(cursor);
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
            {fileLinks === null && !linksError && <div className="loadingBlock"><Spinner size={16} label="Loading files…" /></div>}
            {fileLinks && (
              <div className="libFileList">
                {fileLinks.map((f) => {
                  const meta = selected.files.find((sf) => sf.fileName === f.fileName);
                  const isPdf = /\.pdf$/i.test(f.fileName);
                  return (
                    <div className="libFileRow2" key={f.fileName}>
                      <FileTypeIcon fileType={meta?.fileType ?? ""} />
                      <span className="fn">{f.fileName}</span>
                      {meta && <span className="fs">{fmtSize(meta.fileSize)}</span>}
                      {isPdf && (
                        <button
                          className="previewBtn"
                          onClick={() => setPreviewing(previewing?.fileName === f.fileName ? null : f)}
                          aria-label={`Preview ${f.fileName}`}
                        >
                          {previewing?.fileName === f.fileName ? "Hide preview" : "Preview"}
                        </button>
                      )}
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
            {showPrompt && (
              <pre className="promptPreview">{fileLinks ? aiConversionPromptWithLinks(fileLinks) : aiConversionPrompt}</pre>
            )}
            <p className="muted small">
              {fileLinks
                ? "This prompt now includes a direct link to your file(s) — paste it into a web-enabled ChatGPT, Gemini, or Claude and it'll fetch the file itself, no manual attaching needed. Then paste what it hands back on the right."
                : "Paste the prompt into ChatGPT, Gemini, or Claude along with the file(s) above, then paste what it hands back on the right."}
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

        {previewing && (
          <section className={`card pdfPreviewCard ${fullscreenPreview ? "fullscreen" : ""}`}>
            <div className="pdfPreviewHead">
              <div className="cardIconRow" style={{ marginBottom: 0 }}>
                <span className="cardIcon blue">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
                </span>
                <h2>{previewing.fileName}</h2>
              </div>
              <button className="zoomBtn" onClick={() => setFullscreenPreview((v) => !v)}>
                {fullscreenPreview ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3v4a1 1 0 0 1-1 1H4M20 9h-4a1 1 0 0 1-1-1V4M15 21v-4a1 1 0 0 1 1-1h4M4 15h4a1 1 0 0 1 1 1v4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Exit full screen
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    View full screen
                  </>
                )}
              </button>
            </div>
            <iframe className="pdfFrame" src={previewing.url} title={previewing.fileName} />
          </section>
        )}

        <div className="deleteZone">
          <div className="dzText">
            <b>Remove this paper</b>
            <span>Deletes the file(s), the converted questions, and this entry from your vault &mdash; can&rsquo;t be undone.</span>
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
    );
  }

  const shown = (items ?? []).filter((it) => it.title.toLowerCase().includes(query.trim().toLowerCase()));

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
          <span>PDF or image, one or several pages per paper &middot; up to 6MB each</span>
        </div>
        <span className="dropBtn">Choose files</span>
      </div>
      {uploadError && <pre className="error">{uploadError}</pre>}

      {items === null && <div className="loadingBlock"><Spinner size={18} label="Loading your vault…" /></div>}
      {items !== null && items.length === 0 && <p className="muted">Nothing in your vault yet &mdash; upload a paper above.</p>}
      {openError && <pre className="error">{openError}</pre>}
      {pageError && <pre className="error">{pageError}</pre>}

      {items !== null && items.length > 0 && (
        <>
          <div className="vaultSearch">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" strokeLinecap="round" /></svg>
            <input placeholder="Search this page by title…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {(hasNextPage || hasPrevPage) && (
              <p className="vaultSearchHint">Only searches the papers currently loaded &mdash; use Next/Previous below to look through more.</p>
            )}
          </div>

          {shown.length === 0 && <p className="muted">No papers on this page match &ldquo;{query}&rdquo;.</p>}

          <div className="vaultGrid">
            {shown.map((it) => {
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
                        Converting
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
