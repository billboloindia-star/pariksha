import { useEffect, useMemo, useState } from "react";
import * as api from "../../shared/api";
import type { NoteClip } from "../../shared/types";

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

export default function NoteClips() {
  const [clips, setClips] = useState<NoteClip[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<NoteClip | null>(null);

  useEffect(() => {
    api.fetchNoteClips().then(setClips).catch(() => setClips([]));
  }, []);

  const chapters = useMemo(() => {
    const set = new Set<string>();
    (clips ?? []).forEach((c) => set.add(c.chapter));
    return Array.from(set).sort();
  }, [clips]);

  const filtered = useMemo(() => {
    if (!clips) return [];
    if (filter === "all") return clips;
    return clips.filter((c) => c.chapter === filter);
  }, [clips, filter]);

  async function saveNote(c: NoteClip) {
    try {
      const updated = await api.updateNoteClipNote(c.clipId, noteDraft);
      setClips((prev) => prev?.map((x) => (x.clipId === c.clipId ? updated : x)) ?? null);
    } catch {
      setError("Couldn't save that note — try again.");
    }
    setEditingNote(null);
  }

  async function remove(c: NoteClip) {
    setClips((prev) => prev?.filter((x) => x.clipId !== c.clipId) ?? null);
    try {
      await api.removeNoteClip(c.clipId);
    } catch {
      setError("Couldn't remove that clip — refresh and try again.");
    }
  }

  if (clips === null) {
    return <div className="clpPage"><p className="muted">Loading your clips…</p></div>;
  }

  return (
    <div className="clpPage">
      <div className="clpHead">
        <h1>My Clips</h1>
        <p>Regions you've cropped out of the teacher's handwritten notes while studying, each tagged with where it came from.</p>
      </div>

      {error && <div className="bkmError">{error}</div>}

      {clips.length === 0 ? (
        <p className="muted">No clips yet — open any handwritten-notes page in Study Vault, tap ✂️, and drag to select a part worth saving.</p>
      ) : (
        <>
          <div className="bkmFilterRow">
            <button className={`bkmFilterChip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All ({clips.length})</button>
            {chapters.map((c) => (
              <button key={c} className={`bkmFilterChip ${filter === c ? "active" : ""}`} onClick={() => setFilter(c)}>
                {c} ({clips.filter((x) => x.chapter === c).length})
              </button>
            ))}
          </div>

          <div className="clpGrid">
            {filtered.map((c) => (
              <div className="clpCard" key={c.clipId}>
                <button className="clpImgBtn" onClick={() => setZoomed(c)}>
                  <img src={c.imageUrl} alt={`Clip from ${c.chapter}`} loading="lazy" />
                </button>
                <div className="clpCardBody">
                  <div className="clpTags">
                    <span className="clpTag section">{c.section}</span>
                    <span className="clpTag">{c.chapter}</span>
                    {c.subConcept && <span className="clpTag sub">{c.subConcept}</span>}
                  </div>
                  {editingNote === c.clipId ? (
                    <div className="bkmNoteEdit">
                      <textarea
                        rows={2}
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Add a note…"
                        autoFocus
                      />
                      <div className="bkmNoteEditActions">
                        <button className="bkmRowAction" onClick={() => saveNote(c)}>Save</button>
                        <button className="bkmRowAction danger" onClick={() => setEditingNote(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {c.note && c.note.trim() && <div className="bkmRowNote"><b>Note:</b> {c.note}</div>}
                      <div className="clpCardFoot">
                        <span className="bkmRowDate">{timeAgo(c.createdAt)}</span>
                        <div className="bkmRowActions">
                          <button className="bkmRowAction" onClick={() => { setEditingNote(c.clipId); setNoteDraft(c.note ?? ""); }}>
                            {c.note?.trim() ? "Edit note" : "Add note"}
                          </button>
                          <button className="bkmRowAction danger" onClick={() => remove(c)}>Remove</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {zoomed && (
        <div className="svLightbox" onClick={() => setZoomed(null)}>
          <div className="svLightboxInner" onClick={(e) => e.stopPropagation()}>
            <div className="svLightboxHead">
              <span>{zoomed.chapter}{zoomed.subConcept ? ` — ${zoomed.subConcept}` : ""}</span>
              <button className="svLightboxClose" onClick={() => setZoomed(null)}>✕</button>
            </div>
            <img src={zoomed.imageUrl} alt="Clip" />
          </div>
        </div>
      )}
    </div>
  );
}
