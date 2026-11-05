import { useEffect, useRef } from "react";

/** A custom cursor that eases toward the real pointer with a lag, for practicing
 * precise clicks on a sluggish exam-center mouse. The real cursor is hidden via
 * the `laggyCursorActive` class; clicks still land at the real (unlagged)
 * position, since this is a purely visual overlay. */
export default function LaggyCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const target = useRef({ x: pos.current.x, y: pos.current.y });

  useEffect(() => {
    function onMove(e: MouseEvent) {
      target.current = { x: e.clientX, y: e.clientY };
    }
    window.addEventListener("mousemove", onMove);

    let raf = 0;
    function tick() {
      const ease = 0.14;
      pos.current.x += (target.current.x - pos.current.x) * ease;
      pos.current.y += (target.current.y - pos.current.y) * ease;
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={dotRef} className="laggyCursorDot" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path d="M5 3l14 8-6 1.5L11 19z" fill="#1a73c7" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
