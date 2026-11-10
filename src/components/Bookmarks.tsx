import { useEffect, useMemo, useState } from "react";
import * as api from "../../shared/api";
import type { Attachment, Bookmark, Paper } from "../../shared/types";

interface Props {
  onLoaded: (p: Paper) => void;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

export default function Bookmarks({ onLoaded }: Props) {
  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [attachDraft, setAttachDraft] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [practicing, setPracticing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const MAX_ATTACHMENTS = 3;

  async function addAttachments(files: FileList) {
    const room = MAX_ATTACHMENTS - attachDraft.length;
    if (room <= 0) { setError(`Max ${MAX_ATTACHMENTS} attachments per note.`); return; }
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const f of Array.from(files).slice(0, room)) uploaded.push(await api.uploadAttachment(f));
      setAttachDraft((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't attach that file.");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    api.fetchBookmarks().then(setBookmarks).catch(() => setBookmarks([]));
  }, []);

  const sections = useMemo(() => {
    const set = new Set<string>();
    (bookmarks ?? []).forEach((b) => set.add(b.section));
    return Array.from(set).sort();
  }, [bookmarks]);

  const filtered = useMemo(() => {
    if (!bookmarks) return [];
    if (filter === "all") return bookmarks;
    if (filter === "notes") return bookmarks.filter((b) => b.note && b.note.trim());
    return bookmarks.filter((b) => b.section === filter);
  }, [bookmarks, filter]);

  const chapters = useMemo(() => {
    const map = new Map<string, { section: string; topic: string; items: Bookmark[] }>();
    for (const b of filtered) {
      const key = `${b.section}::${b.topic}`;
      if (!map.has(key)) map.set(key, { section: b.section, topic: b.topic, items: [] });
      map.get(key)!.items.push(b);
    }
    return Array.from(map.values()).sort((a, b) => a.section.localeCompare(b.section) || a.topic.localeCompare(b.topic));
  }, [filtered]);

  async function saveNote(b: Bookmark) {
    try {
      const updated = await api.updateBookmarkNote(b.bookmarkId, noteDraft, attachDraft);
      setBookmarks((prev) => prev?.map((x) => (x.bookmarkId === b.bookmarkId ? updated : x)) ?? null);
    } catch {
      setError("Couldn't save that note — try again.");
    }
    setEditingNote(null);
    setAttachDraft([]);
  }

  async function removeAttachment(b: Bookmark, i: number) {
    const next = (b.attachments ?? []).filter((_, idx) => idx !== i);
    try {
      const updated = await api.updateBookmarkNote(b.bookmarkId, b.note ?? "", next);
      setBookmarks((prev) => prev?.map((x) => (x.bookmarkId === b.bookmarkId ? updated : x)) ?? null);
    } catch {
      setError("Couldn't remove that attachment — try again.");
    }
  }

  async function remove(b: Bookmark) {
    setBookmarks((prev) => prev?.filter((x) => x.bookmarkId !== b.bookmarkId) ?? null);
    try {
      await api.removeBookmark(b.bookmarkId);
    } catch {
      setError("Couldn't remove that bookmark — refresh and try again.");
    }
  }

  async function practiceOne(b: Bookmark) {
    setPracticing(b.bookmarkId);
    try {
      const paper = await api.practiceBookmarks([b.bookmarkId]);
      onLoaded(paper);
    } catch {
      setError("Couldn't start that practice session — try again.");
      setPracticing(null);
    }
  }

  async function practiceChapter(items: Bookmark[]) {
    const key = items.map((i) => i.bookmarkId).join(",");
    setPracticing(key);
    try {
      const paper = await api.practiceBookmarks(items.map((i) => i.bookmarkId));
      onLoaded(paper);
    } catch {
      setError("Couldn't start that practice session — try again.");
      setPracticing(null);
    }
  }

  if (bookmarks === null) {
    return <div className="bkmPage"><p className="muted">Loading your bookmarks…</p></div>;
  }

  return (
    <div className="bkmPage">
      <div className="bkmHead">
        <h1>Bookmarks</h1>
        <p>Every question you've starred, from any mock or practice session — organized by chapter so you can revisit exactly what you flagged.</p>
      </div>

      {error && <div className="bkmError">{error}</div>}

      {bookmarks.length === 0 ? (
        <p className="muted">No bookmarks yet — tap the star on any question while taking a mock, or in its review, to save it here.</p>
      ) : (
        <>
          <div className="bkmFilterRow">
            <button className={`bkmFilterChip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All ({bookmarks.length})</button>
            {sections.map((s) => (
              <button key={s} className={`bkmFilterChip ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
                {s} ({bookmarks.filter((b) => b.section === s).length})
              </button>
            ))}
            <button className={`bkmFilterChip ${filter === "notes" ? "active" : ""}`} onClick={() => setFilter("notes")}>
              Has notes ({bookmarks.filter((b) => b.note && b.note.trim()).length})
            </button>
          </div>

          {chapters.map((ch) => {
            const key = ch.items.map((i) => i.bookmarkId).join(",");
            return (
              <div className="bkmChapterCard" key={`${ch.section}::${ch.topic}`}>
                <div className="bkmChapterHead">
                  <div>
                    <div className="bkmChapterSection">{ch.section}</div>
                    <div className="bkmChapterName">{ch.topic}</div>
                    <div className="bkmChapterMeta">
                      {ch.items.length} bookmarked · {ch.items.filter((i) => i.note?.trim()).length} with notes
                    </div>
                  </div>
                  <button className="bkmPracticeAllBtn" disabled={practicing === key} onClick={() => practiceChapter(ch.items)}>
                    {practicing === key ? "Starting…" : "Practice these →"}
                  </button>
                </div>
                <div className="bkmRowList">
                  {ch.items.map((b) => (
                    <div className="bkmRow" key={b.bookmarkId}>
                      <span className="bkmRowStar">
                        <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="1.8"><path d="M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.7l7.1-.6Z" strokeLinejoin="round" /></svg>
                      </span>
                      <div className="bkmRowBody">
                        <div className="bkmRowText">{b.text}</div>
                        <div className="bkmRowMeta">
                          {b.wasCorrect === true && <span className="bkmRowTag right">Got it right</span>}
                          {b.wasCorrect === false && <span className="bkmRowTag wrong">Got it wrong</span>}
                          <span className="bkmRowDate">From {b.sourceLabel} · {timeAgo(b.createdAt)}</span>
                        </div>
                        {editingNote === b.bookmarkId ? (
                          <div className="bkmNoteEdit">
                            <textarea
                              rows={2}
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder="e.g. remember this formula, or silly mistake with signs…"
                              autoFocus
                            />
                            <div className="noteAttachRow">
                              <label className="attachBtn">
                                {uploading ? "Uploading…" : "📎 Attach image or PDF"}
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  multiple
                                  hidden
                                  disabled={uploading}
                                  onChange={(e) => { if (e.target.files?.length) addAttachments(e.target.files); e.target.value = ""; }}
                                />
                              </label>
                              {attachDraft.length > 0 && <span className="muted small">{attachDraft.length}/{MAX_ATTACHMENTS} attached</span>}
                            </div>
                            {attachDraft.length > 0 && (
                              <div className="attachGrid">
                                {attachDraft.map((a, i) => (
                                  <div className="attachCard" key={a.url}>
                                    {a.fileType.startsWith("image/") ? (
                                      <img className="attachThumb" src={a.url} alt={a.fileName} />
                                    ) : (
                                      <span className="attachPdf">📄<span>PDF</span></span>
                                    )}
                                    <span className="attachName">{a.fileName}</span>
                                    <button className="attachRemove" onClick={() => setAttachDraft((prev) => prev.filter((_, idx) => idx !== i))} title="Remove">✕</button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="bkmNoteEditActions">
                              <button className="bkmRowAction" onClick={() => saveNote(b)}>Save</button>
                              <button className="bkmRowAction danger" onClick={() => { setEditingNote(null); setAttachDraft([]); }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {b.note && b.note.trim() && (
                              <div className="bkmRowNote"><b>Note:</b> {b.note}</div>
                            )}
                            {b.attachments && b.attachments.length > 0 && (
                              <div className="attachGrid">
                                {b.attachments.map((a, i) => (
                                  <div className="attachCard" key={a.url}>
                                    {a.fileType.startsWith("image/") ? (
                                      <a href={a.url} target="_blank" rel="noreferrer"><img className="attachThumb" src={a.url} alt={a.fileName} /></a>
                                    ) : (
                                      <a href={a.url} target="_blank" rel="noreferrer" className="attachPdf">📄<span>PDF</span></a>
                                    )}
                                    <span className="attachName">{a.fileName}</span>
                                    <button className="attachRemove" onClick={() => removeAttachment(b, i)} title="Remove">✕</button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="bkmRowActions">
                              <button className="bkmRowAction" onClick={() => { setEditingNote(b.bookmarkId); setNoteDraft(b.note ?? ""); setAttachDraft(b.attachments ?? []); }}>
                                {b.note?.trim() ? "Edit note" : "Add note"}
                              </button>
                              <button className="bkmRowAction" disabled={practicing === b.bookmarkId} onClick={() => practiceOne(b)}>
                                {practicing === b.bookmarkId ? "Starting…" : "Practice this"}
                              </button>
                              <button className="bkmRowAction danger" onClick={() => remove(b)}>Remove</button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
