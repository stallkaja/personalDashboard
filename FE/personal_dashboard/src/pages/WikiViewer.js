import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useThemeMode } from "../context/ThemeContext";
import theme, { colors } from "../styles/theme";
import { API_URL } from "../config";
import { findWiki } from "../wikis/registry";

// Shows one wiki (a self-contained page under public/wiki-apps/) full-height
// inside the dashboard. The page reaches the backend through wiki-apps/bridge.js,
// which reads the API address from window.DASHBOARD_API_URL set here.
export default function WikiViewer() {
  const { wikiId } = useParams();
  const wiki = findWiki(wikiId);
  const { themeName } = useThemeMode();
  const frameRef = useRef(null);
  const boxRef = useRef(null);
  const [height, setHeight] = useState(600);

  window.DASHBOARD_API_URL = API_URL;

  // Open the wiki at the page named in our own URL hash (bookmarks / shared links).
  const src = useMemo(() => {
    if (!wiki) return null;
    const hash = window.location.hash && window.location.hash.length > 1 ? window.location.hash : "";
    return wiki.app + hash;
    // Only on first mount for this wiki; later navigation happens inside the frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wikiId]);

  // Fill the space below the header.
  const resize = useCallback(() => {
    if (!boxRef.current) return;
    const top = boxRef.current.getBoundingClientRect().top;
    setHeight(Math.max(420, window.innerHeight - top));
  }, []);
  useLayoutEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // Keep the dashboard URL in step with the page shown inside the wiki.
  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== window.location.origin || !e.data || e.data.type !== "wiki-route" || e.data.wiki !== wikiId) return;
      const hash = typeof e.data.hash === "string" ? e.data.hash : "";
      window.history.replaceState(window.history.state, "", window.location.pathname + hash);
    };
    // And the other way: Back/Forward or a pasted link that only changes our hash.
    const onHashChange = () => {
      try {
        const frameWin = frameRef.current && frameRef.current.contentWindow;
        if (frameWin && frameWin.location.hash !== window.location.hash) frameWin.location.hash = window.location.hash;
      } catch {
        /* frame not ready */
      }
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [wikiId]);

  // Follow the dashboard's light/dark toggle.
  const applyTheme = useCallback(() => {
    try {
      const doc = frameRef.current && frameRef.current.contentDocument;
      if (doc && doc.documentElement) doc.documentElement.setAttribute("data-theme", themeName);
    } catch {
      /* frame not ready */
    }
  }, [themeName]);
  useEffect(applyTheme, [applyTheme]);

  if (!wiki) {
    return (
      <div style={theme.page}>
        <p>There's no wiki called "{wikiId}". <Link to="/wikis" style={{ color: colors.primary }}>Back to Wikis</Link></p>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ height, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <iframe
        ref={frameRef}
        key={wiki.id}
        src={src}
        title={`${wiki.name} wiki`}
        onLoad={() => { applyTheme(); resize(); }}
        style={{ flex: 1, width: "100%", border: 0, display: "block", background: colors.background }}
      />
    </div>
  );
}
