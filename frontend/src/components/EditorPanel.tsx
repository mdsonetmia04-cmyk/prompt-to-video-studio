import { useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";

interface Props {
  source: string; // currently applied source
  lastGenerated: string | null; // last AI/demo output, for restore
  onApply: (next: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export default function EditorPanel({ source, lastGenerated, onApply, onDirtyChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  // Create the editor once.
  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;
    const view = new EditorView({
      doc: sourceRef.current,
      extensions: [
        basicSetup,
        html(),
        oneDark,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            const d = u.state.doc.toString() !== sourceRef.current;
            setDirty(d);
            onDirtyChange?.(d);
          }
        }),
      ],
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When a new source is applied externally (generate / restore), replace doc.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== source) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: source },
      });
      setDirty(false);
      onDirtyChange?.(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const getDoc = () => viewRef.current?.state.doc.toString() ?? "";

  const apply = () => {
    onApply(getDoc());
    setDirty(false);
    onDirtyChange?.(false);
  };

  const restore = () => {
    if (lastGenerated == null) return;
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: lastGenerated },
    });
    onApply(lastGenerated);
    setDirty(false);
    onDirtyChange?.(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(getDoc());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const downloadHtml = () => {
    const blob = new Blob([getDoc()], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "animation-source.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const bytes = new Blob([getDoc()]).size;

  return (
    <>
      <div className="editor-head">
        <h2 className="section-title">Source code</h2>
        {dirty && <span className="badge warn">Edited — not applied</span>}
        <div className="spacer" />
        <span style={{ fontSize: 11.5, color: "var(--faint)", fontFamily: "var(--mono)" }}>
          {(bytes / 1024).toFixed(1)} KB
        </span>
      </div>

      <div className="cm-wrap" ref={hostRef} />

      <div className="editor-actions">
        <button className="btn primary small" onClick={apply} disabled={!dirty}>
          Apply changes
        </button>
        <button className="btn small" onClick={restore} disabled={lastGenerated == null}>
          Restore generated
        </button>
        <button className="btn small" onClick={copy}>{copied ? "Copied ✓" : "Copy source"}</button>
        <button className="btn small" onClick={downloadHtml}>Download .html</button>
      </div>

      <div className="notice">
        Applying changes rebuilds the preview and invalidates any previously rendered video
        that no longer matches the current source.
      </div>
    </>
  );
}
