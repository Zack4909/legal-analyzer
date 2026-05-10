import { useState, useRef, useCallback } from "react";

// ── helpers ──────────────────────────────────────────────────────────────────
function readFileAsText(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = (e) => res(e.target.result);
    reader.onerror = () => rej(new Error("File read failed"));
    if (file.type === "application/pdf") {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  });
}

async function extractPdfText(arrayBuffer) {
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(pdf.numPages, 40); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return text.trim();
}

const SYSTEM_PROMPT = `You are an expert legal contract analyst. Given contract text, you must respond ONLY with a valid JSON object — no markdown, no explanation, no preamble.

The JSON must have exactly this structure:
{
  "summary": "A clear 3-5 sentence plain-English summary of what this contract is about, who the parties are, and its primary purpose.",
  "risks": [
    {
      "severity": "high" | "medium" | "low",
      "clause": "Short name of the clause (e.g. Indemnification)",
      "quote": "The exact or paraphrased problematic text (max 60 words)",
      "explanation": "Why this is a risk in plain English (1-2 sentences)"
    }
  ],
  "obligations": [
    {
      "party": "Which party has this obligation",
      "obligation": "What they must do (plain English, max 20 words)",
      "deadline": "Deadline or timing if mentioned, otherwise null"
    }
  ]
}

Identify 3-7 risks and 4-10 obligations. Severity: high = significant financial/legal exposure, medium = notable concern, low = minor issue. Be specific and concrete.`;

async function analyzeContract(text, apiKey) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analyze this contract:\n\n${text.slice(0, 12000)}`,
        },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }
  const data = await response.json();
  const raw = data.content.map((b) => b.text || "").join("");
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── sub-components ────────────────────────────────────────────────────────────
const SEVERITY_CONFIG = {
  high:   { color: "#ef4444", bg: "#1f0808", border: "#ef444430", label: "HIGH RISK" },
  medium: { color: "#f59e0b", bg: "#1a1200", border: "#f59e0b30", label: "MEDIUM" },
  low:    { color: "#6b7280", bg: "#0f0f11", border: "#6b728030", label: "LOW" },
};

function RiskCard({ risk, idx }) {
  const [open, setOpen] = useState(false);
  const cfg = SEVERITY_CONFIG[risk.severity] || SEVERITY_CONFIG.low;
  return (
    <div
      onClick={() => setOpen(!open)}
      style={{
        background: open ? cfg.bg : "#0c0c10",
        border: `1px solid ${open ? cfg.border : "#1c1c24"}`,
        borderLeft: `3px solid ${cfg.color}`,
        borderRadius: "4px",
        padding: "14px 18px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        animationDelay: `${idx * 0.07}s`,
        animationFillMode: "both",
      }}
      className="fade-up"
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: "9px",
            letterSpacing: "0.15em", color: cfg.color,
            padding: "3px 7px", border: `1px solid ${cfg.color}40`,
            borderRadius: "2px",
          }}>{cfg.label}</span>
          <span style={{ fontSize: "15px", color: "#d4d0dc" }}>{risk.clause}</span>
        </div>
        <span style={{ color: "#3a3a50", fontSize: "13px", fontFamily: "'DM Mono', monospace" }}>
          {open ? "−" : "+"}
        </span>
      </div>
      {open && (
        <div style={{ marginTop: "14px", borderTop: "1px solid #1c1c28", paddingTop: "14px" }}>
          <p style={{
            fontFamily: "'DM Mono', monospace", fontSize: "12px",
            color: "#7a7090", lineHeight: "1.6", marginBottom: "10px",
            fontStyle: "italic",
          }}>"{risk.quote}"</p>
          <p style={{
            fontFamily: "'DM Mono', monospace", fontSize: "12px",
            color: "#a09ab8", lineHeight: "1.6",
          }}>{risk.explanation}</p>
        </div>
      )}
    </div>
  );
}

function ObligationRow({ ob, idx }) {
  return (
    <div
      className="fade-up"
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr auto",
        gap: "12px",
        alignItems: "start",
        padding: "12px 0",
        borderBottom: "1px solid #14141c",
        animationDelay: `${idx * 0.06}s`,
        animationFillMode: "both",
      }}
    >
      <span style={{
        fontFamily: "'DM Mono', monospace", fontSize: "10px",
        color: "#5a9a8a", letterSpacing: "0.08em",
        background: "#0a1a18", padding: "4px 8px",
        borderRadius: "2px", display: "inline-block",
        textAlign: "center", lineHeight: "1.4",
      }}>{ob.party}</span>
      <span style={{
        fontFamily: "'DM Mono', monospace", fontSize: "12px",
        color: "#b0aac8", lineHeight: "1.5",
      }}>{ob.obligation}</span>
      <span style={{
        fontFamily: "'DM Mono', monospace", fontSize: "10px",
        color: ob.deadline ? "#f59e0b" : "#2a2a38",
        whiteSpace: "nowrap",
      }}>{ob.deadline || "—"}</span>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function LegalAnalyzer() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("lexai_key") || "");
  const [showKeyInput, setShowKeyInput] = useState(!localStorage.getItem("lexai_key"));
  const [tab, setTab] = useState("upload");
  const [pastedText, setPastedText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [fileText, setFileText] = useState(null);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState("summary");
  const fileRef = useRef();

  const saveKey = () => {
    if (!apiKey.trim()) return;
    localStorage.setItem("lexai_key", apiKey.trim());
    setShowKeyInput(false);
  };

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setFileName(file.name);
    setStatus("extracting");
    setError(null);
    try {
      let text;
      if (file.type === "application/pdf") {
        const buf = await readFileAsText(file);
        text = await extractPdfText(buf);
      } else {
        text = await readFileAsText(file);
      }
      if (!text || text.length < 100) throw new Error("Could not extract enough text from this file.");
      setFileText(text);
      setStatus("idle");
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleAnalyze = async () => {
    const text = tab === "upload" ? fileText : pastedText;
    if (!text || text.trim().length < 80) {
      setError("Please provide more contract text (at least a few paragraphs).");
      return;
    }
    if (!apiKey.trim()) {
      setShowKeyInput(true);
      setError("Please enter your Anthropic API key first.");
      return;
    }
    setStatus("analyzing");
    setError(null);
    setResult(null);
    try {
      const data = await analyzeContract(text, apiKey.trim());
      setResult(data);
      setStatus("done");
      setActiveSection("summary");
    } catch (e) {
      setError("Analysis failed: " + e.message);
      setStatus("error");
    }
  };

  const reset = () => {
    setResult(null);
    setStatus("idle");
    setFileText(null);
    setFileName(null);
    setPastedText("");
    setError(null);
  };

  const canAnalyze = status !== "analyzing" && status !== "extracting" &&
    (tab === "upload" ? !!fileText : pastedText.trim().length > 80);

  const riskCounts = result ? {
    high: result.risks.filter(r => r.severity === "high").length,
    medium: result.risks.filter(r => r.severity === "medium").length,
    low: result.risks.filter(r => r.severity === "low").length,
  } : null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#08080e",
      color: "#e0dcea",
      fontFamily: "'DM Serif Display', Georgia, serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .fade-up { animation: fadeUp 0.4s ease both; }
        textarea:focus { outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0c0c14; }
        ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 2px; }
        input:focus { outline: none; }
      `}</style>

      {/* Header */}
      <div style={{
        borderBottom: "1px solid #14141e",
        padding: "20px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{
            width: "32px", height: "32px",
            background: "linear-gradient(135deg, #1a1a2e, #2a1a3e)",
            border: "1px solid #3a2a5e", borderRadius: "6px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "16px",
          }}>⚖</div>
          <div>
            <div style={{ fontSize: "17px", letterSpacing: "-0.01em", color: "#e8e4f8" }}>LexAI Analyzer</div>
            <div style={{
              fontFamily: "'DM Mono', monospace", fontSize: "10px",
              color: "#3a3a58", letterSpacing: "0.12em", textTransform: "uppercase",
            }}>Contract Intelligence</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            style={{
              fontFamily: "'DM Mono', monospace", fontSize: "11px",
              letterSpacing: "0.08em", color: "#5a5a78",
              background: "transparent", border: "1px solid #1e1e2e",
              padding: "7px 14px", borderRadius: "3px", cursor: "pointer",
            }}
          >{apiKey ? "🔑 API Key ✓" : "🔑 Set API Key"}</button>
          {status === "done" && (
            <button onClick={reset} style={{
              fontFamily: "'DM Mono', monospace", fontSize: "11px",
              letterSpacing: "0.1em", color: "#5a5a78",
              background: "transparent", border: "1px solid #1e1e2e",
              padding: "7px 16px", borderRadius: "3px", cursor: "pointer",
            }}>New Analysis</button>
          )}
        </div>
      </div>

      {/* API Key panel */}
      {showKeyInput && (
        <div style={{
          background: "#0d0d1a", borderBottom: "1px solid #1e1e30",
          padding: "16px 32px", display: "flex", gap: "12px", alignItems: "center",
        }}>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveKey()}
            placeholder="sk-ant-..."
            style={{
              flex: 1, maxWidth: "400px",
              background: "#08080e", border: "1px solid #2a2a40",
              borderRadius: "4px", padding: "10px 14px",
              fontFamily: "'DM Mono', monospace", fontSize: "12px",
              color: "#b0a8c8", letterSpacing: "0.05em",
            }}
          />
          <button onClick={saveKey} style={{
            fontFamily: "'DM Mono', monospace", fontSize: "11px",
            letterSpacing: "0.12em", textTransform: "uppercase",
            padding: "10px 20px",
            background: "linear-gradient(135deg, #4c1d95, #3730a3)",
            border: "1px solid #7c3aed",
            color: "#e8e4f8", borderRadius: "3px", cursor: "pointer",
          }}>Save</button>
          <span style={{
            fontFamily: "'DM Mono', monospace", fontSize: "10px",
            color: "#3a3a58", lineHeight: "1.5",
          }}>
            Get yours at console.anthropic.com · Stored in localStorage only
          </span>
        </div>
      )}

      <div style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* ── INPUT PANEL ── */}
        {status !== "done" && (
          <div className="fade-up">
            <h1 style={{
              fontSize: "clamp(28px, 5vw, 44px)", fontWeight: "400",
              letterSpacing: "-0.02em", marginBottom: "8px", color: "#f0ecfc", lineHeight: 1.1,
            }}>Analyze your contract</h1>
            <p style={{
              fontFamily: "'DM Mono', monospace", fontSize: "13px",
              color: "#5a5a78", marginBottom: "36px", lineHeight: 1.6,
            }}>Upload a PDF or paste text — get a plain-English summary, flagged risks, and key obligations.</p>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #1a1a26", marginBottom: "28px" }}>
              {["upload", "paste"].map(t => (
                <button key={t} onClick={() => { setTab(t); setError(null); }} style={{
                  fontFamily: "'DM Mono', monospace", fontSize: "11px",
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  padding: "10px 20px", background: "transparent", border: "none",
                  borderBottom: tab === t ? "2px solid #a78bfa" : "2px solid transparent",
                  color: tab === t ? "#a78bfa" : "#3a3a58",
                  cursor: "pointer", transition: "all 0.2s",
                }}>{t === "upload" ? "↑ Upload File" : "⌨ Paste Text"}</button>
              ))}
            </div>

            {/* Upload zone */}
            {tab === "upload" && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "#a78bfa" : fileText ? "#5a9a6a" : "#1e1e30"}`,
                  borderRadius: "8px", padding: "52px 24px",
                  textAlign: "center", cursor: "pointer",
                  background: dragOver ? "#130d20" : fileText ? "#0a140c" : "#0c0c14",
                  transition: "all 0.2s ease", marginBottom: "20px",
                }}
              >
                <input ref={fileRef} type="file" accept=".pdf,.txt" style={{ display: "none" }}
                  onChange={e => handleFile(e.target.files[0])} />
                {status === "extracting" ? (
                  <div>
                    <div style={{
                      width: "24px", height: "24px", border: "2px solid #a78bfa",
                      borderTopColor: "transparent", borderRadius: "50%",
                      animation: "spin 0.8s linear infinite", margin: "0 auto 12px",
                    }} />
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "12px", color: "#7a7090" }}>Extracting text…</p>
                  </div>
                ) : fileText ? (
                  <div>
                    <div style={{ fontSize: "28px", marginBottom: "10px" }}>✓</div>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px", color: "#5a9a6a" }}>{fileName}</p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#3a5a3a", marginTop: "4px" }}>
                      {fileText.length.toLocaleString()} characters extracted
                    </p>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.4 }}>⬆</div>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: "13px", color: "#4a4a68" }}>
                      Drop a PDF or .txt file here, or click to browse
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Paste zone */}
            {tab === "paste" && (
              <textarea
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
                placeholder="Paste your contract text here…"
                style={{
                  width: "100%", height: "220px",
                  background: "#0c0c14", border: "1px solid #1e1e2e",
                  borderRadius: "6px", padding: "18px",
                  fontFamily: "'DM Mono', monospace", fontSize: "12px",
                  color: "#b0a8c8", lineHeight: "1.7",
                  resize: "vertical", marginBottom: "20px", caretColor: "#a78bfa",
                }}
              />
            )}

            {error && (
              <div style={{
                padding: "12px 16px", background: "#1a0808",
                border: "1px solid #ef444430", borderRadius: "4px",
                fontFamily: "'DM Mono', monospace", fontSize: "12px",
                color: "#ef4444", marginBottom: "20px",
              }}>{error}</div>
            )}

            <button onClick={handleAnalyze} disabled={!canAnalyze} style={{
              width: "100%", padding: "16px",
              background: canAnalyze ? "linear-gradient(135deg, #4c1d95, #3730a3)" : "#12121c",
              border: `1px solid ${canAnalyze ? "#7c3aed" : "#1e1e2e"}`,
              color: canAnalyze ? "#e8e4f8" : "#2a2a40",
              fontFamily: "'DM Mono', monospace", fontSize: "12px",
              letterSpacing: "0.15em", textTransform: "uppercase",
              borderRadius: "4px", cursor: canAnalyze ? "pointer" : "not-allowed",
              transition: "all 0.2s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
            }}>
              {status === "analyzing" ? (
                <>
                  <div style={{
                    width: "14px", height: "14px", border: "2px solid #a78bfa",
                    borderTopColor: "transparent", borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }} />
                  Analyzing with Claude…
                </>
              ) : "Analyze Contract →"}
            </button>
          </div>
        )}

        {/* ── RESULTS PANEL ── */}
        {status === "done" && result && (
          <div className="fade-up">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "32px" }}>
              {[
                { label: "High Risk", count: riskCounts.high, color: "#ef4444", bg: "#1a0808" },
                { label: "Medium Risk", count: riskCounts.medium, color: "#f59e0b", bg: "#1a1200" },
                { label: "Low Risk", count: riskCounts.low, color: "#6b7280", bg: "#101014" },
              ].map(item => (
                <div key={item.label} style={{
                  padding: "16px", background: item.bg,
                  border: `1px solid ${item.color}25`, borderRadius: "4px", textAlign: "center",
                }}>
                  <div style={{ fontSize: "28px", fontWeight: "400", color: item.color, lineHeight: 1, marginBottom: "4px" }}>{item.count}</div>
                  <div style={{
                    fontFamily: "'DM Mono', monospace", fontSize: "10px",
                    color: item.color + "99", letterSpacing: "0.1em", textTransform: "uppercase",
                  }}>{item.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", borderBottom: "1px solid #1a1a26", marginBottom: "28px" }}>
              {[
                { id: "summary", label: "Summary" },
                { id: "risks", label: `Risks (${result.risks.length})` },
                { id: "obligations", label: `Obligations (${result.obligations.length})` },
              ].map(s => (
                <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
                  fontFamily: "'DM Mono', monospace", fontSize: "11px",
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  padding: "10px 18px", background: "transparent", border: "none",
                  borderBottom: activeSection === s.id ? "2px solid #a78bfa" : "2px solid transparent",
                  color: activeSection === s.id ? "#a78bfa" : "#3a3a58",
                  cursor: "pointer", transition: "all 0.15s",
                }}>{s.label}</button>
              ))}
            </div>

            {activeSection === "summary" && (
              <div className="fade-up">
                <div style={{
                  background: "#0d0d18", border: "1px solid #1e1e30",
                  borderLeft: "3px solid #a78bfa", borderRadius: "4px", padding: "28px",
                }}>
                  <div style={{
                    fontFamily: "'DM Mono', monospace", fontSize: "10px",
                    letterSpacing: "0.15em", color: "#a78bfa",
                    textTransform: "uppercase", marginBottom: "14px",
                  }}>Plain-English Summary</div>
                  <p style={{ fontSize: "16px", lineHeight: "1.7", color: "#c8c0e0" }}>{result.summary}</p>
                </div>
              </div>
            )}

            {activeSection === "risks" && (
              <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{
                  fontFamily: "'DM Mono', monospace", fontSize: "10px",
                  letterSpacing: "0.15em", color: "#3a3a58",
                  textTransform: "uppercase", marginBottom: "4px",
                }}>Click a clause to expand details</div>
                {result.risks.map((r, i) => <RiskCard key={i} risk={r} idx={i} />)}
              </div>
            )}

            {activeSection === "obligations" && (
              <div className="fade-up">
                <div style={{
                  display: "grid", gridTemplateColumns: "140px 1fr auto",
                  gap: "12px", padding: "8px 0 10px", borderBottom: "1px solid #1e1e2e",
                }}>
                  {["Party", "Obligation", "Deadline"].map(h => (
                    <span key={h} style={{
                      fontFamily: "'DM Mono', monospace", fontSize: "9px",
                      letterSpacing: "0.15em", color: "#2a2a40", textTransform: "uppercase",
                    }}>{h}</span>
                  ))}
                </div>
                {result.obligations.map((ob, i) => <ObligationRow key={i} ob={ob} idx={i} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
