import { useState } from "react";
import { AI_PRESETS, loadAiSettings, saveAiSettings, clearAiSettings, presetById, type AiBrowserSettings } from "../lib/aiKeys";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (s: AiBrowserSettings | null) => void;
}

export default function AiSettingsModal({ open, onClose, onSaved }: Props) {
  const [presetId, setPresetId] = useState(() => loadAiSettings()?.presetId ?? "groq");
  const [apiKey, setApiKey] = useState(() => loadAiSettings()?.apiKey ?? "");
  const [apiUrl, setApiUrl] = useState(() => loadAiSettings()?.apiUrl ?? presetById("groq")!.apiUrl);
  const [model, setModel] = useState(() => loadAiSettings()?.model ?? presetById("groq")!.model);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const pickPreset = (id: string) => {
    setPresetId(id);
    const p = presetById(id);
    if (p && id !== "custom") {
      setApiUrl(p.apiUrl);
      setModel(p.model);
    }
  };

  const save = () => {
    if (!apiKey.trim()) {
      setError("Paste your API key first.");
      return;
    }
    if (!/^https:\/\//.test(apiUrl.trim())) {
      setError("API URL must start with https://");
      return;
    }
    const s = { presetId, apiKey: apiKey.trim(), apiUrl: apiUrl.trim(), model: model.trim() };
    saveAiSettings(s);
    onSaved(s);
    onClose();
  };

  const clear = () => {
    clearAiSettings();
    setApiKey("");
    onSaved(null);
    onClose();
  };

  const preset = presetById(presetId);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>AI Settings — use your own free key</h3>
          <button className="btn ghost" onClick={onClose}>✕</button>
        </div>
        <p className="muted">
          The AI only writes the animation's HTML/CSS/JS code — rendering to MP4 happens on the
          backend. Your key is stored <b>only in this browser</b> and sent with each Generate
          request over HTTPS. It is never saved on the server.
        </p>

        <label className="field-label">Provider preset</label>
        <div className="preset-grid">
          {AI_PRESETS.map((p) => (
            <button
              key={p.id}
              className={`btn preset ${presetId === p.id ? "active" : ""}`}
              onClick={() => pickPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <label className="field-label">API key {preset?.keyHint && <span className="muted">({preset.keyHint})</span>}</label>
        <input
          type="password"
          className="text-input"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your API key"
          autoComplete="off"
        />
        {preset?.keyUrl && (
          <div className="muted small">
            Get a free key:{" "}
            <a href={preset.keyUrl} target="_blank" rel="noreferrer">{preset.keyUrl.replace("https://", "")}</a>
          </div>
        )}

        <label className="field-label">API base URL (OpenAI-compatible)</label>
        <input
          type="text"
          className="text-input"
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          placeholder="https://…"
          spellCheck={false}
        />

        <label className="field-label">Model</label>
        <input
          type="text"
          className="text-input"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="model name"
          spellCheck={false}
        />

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button className="btn danger-ghost" onClick={clear}>Remove key</button>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save key</button>
        </div>
      </div>
    </div>
  );
}
