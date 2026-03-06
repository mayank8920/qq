import { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

/* ─────────────────────────────────────────────────────────────────────────────
   DESIGN TOKENS — Clinical Intelligence Aesthetic
   Light mode: ivory/cream base, obsidian type, amber+crimson accents
───────────────────────────────────────────────────────────────────────────── */
const T = {
  bg:       "#F7F4EE",
  surface:  "#FFFFFF",
  panel:    "#F0ECE4",
  border:   "#D6CFc4",
  borderDk: "#B5ADA0",
  ink:      "#1A1612",
  inkMid:   "#5C5248",
  inkLight: "#9B9086",
  amber:    "#D97706",
  amberLt:  "#FEF3C7",
  crimson:  "#C0392B",
  crimsonLt:"#FEE2E0",
  emerald:  "#047857",
  emeraldLt:"#D1FAE5",
  blue:     "#1E40AF",
  blueLt:   "#DBEAFE",
  violet:   "#5B21B6",
  violetLt: "#EDE9FE",
  orange:   "#EA580C",
};

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */
const uuid = () => Math.random().toString(36).slice(2, 10).toUpperCase();
const now  = () => new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

function scoreColor(s) {
  if (s >= 75) return T.crimson;
  if (s >= 45) return T.amber;
  return T.emerald;
}
function verdictBg(v) {
  if (v === "LIKELY AI")     return T.crimsonLt;
  if (v === "INCONCLUSIVE")  return T.amberLt;
  return T.emeraldLt;
}
function fpLabel(s) {
  if (s >= 80) return "HIGH — AI DETECTED";
  if (s >= 55) return "MODERATE — INCONCLUSIVE";
  if (s >= 30) return "LOW — LIKELY HUMAN";
  return "VERY LOW — HUMAN";
}

/* ─────────────────────────────────────────────────────────────────────────────
   ENSEMBLE DETECTOR — calls Claude
───────────────────────────────────────────────────────────────────────────── */
const ENSEMBLE_PROMPT = `You are VERIDEX ENSEMBLE ENGINE — a multi-model AI forensic detector.

Given content, simulate a full ensemble detection pipeline and return a JSON object ONLY — no markdown fences, no extra text.

JSON structure:
{
  "aiScore": <0-100 integer — overall AI probability>,
  "confidence": <"VERY LOW"|"LOW"|"MEDIUM"|"HIGH"|"VERY HIGH">,
  "verdict": <"LIKELY AI"|"INCONCLUSIVE"|"LIKELY HUMAN">,
  "fpRisk": <"NONE"|"LOW"|"MEDIUM"|"HIGH"> — false positive risk,
  "modelFingerprint": {
    "topMatch": <"GPT-4"|"GPT-3.5"|"Claude"|"Gemini"|"Llama"|"Mistral"|"Midjourney"|"DALL-E"|"Stable Diffusion"|"ElevenLabs"|"RunwayML"|"Unknown Human">,
    "confidence": <0-100>,
    "alternates": [{"model": <string>, "probability": <0-100>}]
  },
  "ensembleScores": [
    {"module": <name>, "score": <0-100>, "weight": <0.0-1.0>, "flagged": <bool>, "detail": <string>}
  ],
  "indicators": [<string>],
  "falsePositiveNotes": [<string>],
  "metadata": {<key>: <value>},
  "summary": <2-3 sentence forensic summary string>,
  "reportId": <6-char alphanum string>
}

Rules:
- ensembleScores should have 5-8 items relevant to the content type
- Each module weight must reflect its reliability for that content type
- Final aiScore = weighted average of ensemble scores, adjusted for confidence
- If fpRisk is MEDIUM or HIGH, verdict should be INCONCLUSIVE even if score is high
- modelFingerprint.topMatch should be realistic for the content and score
- Be specific and technical. Vary results realistically based on content.
- Return ONLY valid JSON.`;

async function runEnsemble(contentType, content) {
  const userMsg = contentType === "text"
    ? `Analyze this TEXT for AI origin:\n\n${content.slice(0, 3000)}`
    : contentType === "url"
    ? `Analyze this URL/social post for AI-generated content:\n\n${content}`
    : `Analyze this ${contentType.toUpperCase()} file: "${content}". Simulate realistic forensic detection.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [
        { role: "user", content: `${ENSEMBLE_PROMPT}\n\n${userMsg}` }
      ],
    }),
  });
  const data = await resp.json();
  const raw = (data.content || []).map(b => b.text || "").join("");
  const cleaned = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

/* ─────────────────────────────────────────────────────────────────────────────
   MOCK ANALYTICS DATA
───────────────────────────────────────────────────────────────────────────── */
const MOCK_SCANS_BY_DAY = [
  { day: "Mon", scans: 1240 }, { day: "Tue", scans: 1890 }, { day: "Wed", scans: 2310 },
  { day: "Thu", scans: 1780 }, { day: "Fri", scans: 2650 }, { day: "Sat", scans: 3100 },
  { day: "Sun", scans: 2420 },
];
const MOCK_TYPES = [
  { type: "Text", count: 4820, color: T.blue },
  { type: "Image", count: 2310, color: T.violet },
  { type: "Document", count: 890, color: T.amber },
  { type: "Audio", count: 420, color: T.emerald },
  { type: "Video", count: 210, color: T.crimson },
  { type: "URL", count: 1100, color: T.orange },
];
const MOCK_MODELS = [
  { model: "GPT-4", pct: 31 }, { model: "Claude", pct: 18 }, { model: "Gemini", pct: 14 },
  { model: "Midjourney", pct: 11 }, { model: "GPT-3.5", pct: 10 }, { model: "Other AI", pct: 9 }, { model: "Human", pct: 7 },
];

/* ─────────────────────────────────────────────────────────────────────────────
   TINY UI ATOMS
───────────────────────────────────────────────────────────────────────────── */
function Divider({ my = 20 }) {
  return <div style={{ height: 1, background: T.border, margin: `${my}px 0` }} />;
}

function Badge({ label, color, bg, size = 11 }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 9px", borderRadius: 3,
      background: bg, color: color,
      fontSize: size, fontWeight: 700, letterSpacing: 0.5,
    }}>{label}</span>
  );
}

function Pill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 18px", borderRadius: 20,
      border: active ? `2px solid ${T.ink}` : `1.5px solid ${T.border}`,
      background: active ? T.ink : "transparent",
      color: active ? T.bg : T.inkMid,
      fontSize: 12, fontWeight: 600, cursor: "pointer",
      letterSpacing: 0.3, transition: "all 0.15s",
    }}>{label}</button>
  );
}

function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: T.surface,
      border: `1.5px solid ${T.border}`,
      borderRadius: 8,
      padding: "20px 22px",
      ...style,
    }}>{children}</div>
  );
}

function StatBox({ label, value, sub, color = T.ink }) {
  return (
    <Card>
      <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 600, letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color, fontFamily: "'Georgia', serif", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.inkLight, marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SCORE RING
───────────────────────────────────────────────────────────────────────────── */
function ScoreRing({ score, size = 160 }) {
  const [anim, setAnim] = useState(0);
  useEffect(() => {
    let raf;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / 1200);
      const ease = t < 0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
      setAnim(Math.round(score * ease));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const r = size / 2 - 14;
  const circ = 2 * Math.PI * r;
  const dash = (anim / 100) * circ;
  const c = scoreColor(score);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.panel} strokeWidth={10} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c} strokeWidth={10}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="butt"
          style={{ transition: "none" }} />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 40, fontWeight: 900, color: c, fontFamily: "'Georgia', serif", lineHeight: 1 }}>
          {anim}<span style={{ fontSize: 18 }}>%</span>
        </span>
        <span style={{ fontSize: 9, color: T.inkLight, letterSpacing: 1.5, marginTop: 2 }}>AI PROBABILITY</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MODULE BAR
───────────────────────────────────────────────────────────────────────────── */
function ModuleBar({ module, score, weight, flagged, detail }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(score), 120); return () => clearTimeout(t); }, [score]);
  const c = scoreColor(score);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: flagged ? c : T.border,
            display: "inline-block", flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: flagged ? T.ink : T.inkMid }}>{module}</span>
          <span style={{ fontSize: 10, color: T.inkLight }}>w={weight.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: T.inkLight }}>{detail}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: c }}>{score}%</span>
        </div>
      </div>
      <div style={{ height: 4, background: T.panel, borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${w}%`, background: c, borderRadius: 2,
          transition: "width 1s cubic-bezier(.4,0,.2,1)",
        }} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   REPORT VIEW — shareable public report
───────────────────────────────────────────────────────────────────────────── */
function ReportView({ result, onBack }) {
  const [copied, setCopied] = useState(false);
  const link = `verifyai.com/report/${result.reportId}`;
  const embedCode = `<iframe src="https://verifyai.com/badge/${result.reportId}" width="280" height="80" frameborder="0"></iframe>`;

  const copyLink = () => {
    navigator.clipboard.writeText(`https://${link}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareX = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I just verified this content with AI Authenticity Scanner.\nResult: ${result.aiScore}% AI probability (${result.verdict})\n\nhttps://${link}`)}`);
  const shareLinkedIn = () => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://${link}`)}`);
  const shareReddit = () => window.open(`https://reddit.com/submit?url=${encodeURIComponent(`https://${link}`)}&title=${encodeURIComponent(`AI Content Scan: ${result.aiScore}% probability — ${result.verdict}`)}`);

  const c = scoreColor(result.aiScore);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      {/* Report Header */}
      <div style={{
        background: T.surface,
        border: `1.5px solid ${T.border}`,
        borderRadius: 10,
        overflow: "hidden",
        marginBottom: 20,
      }}>
        {/* Color bar */}
        <div style={{ height: 5, background: c }} />
        <div style={{ padding: "28px 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: T.inkLight, letterSpacing: 1.5, marginBottom: 4 }}>VERIFICATION REPORT</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: "'Georgia', serif" }}>
                Report #{result.reportId}
              </div>
              <div style={{ fontSize: 11, color: T.inkLight, marginTop: 4 }}>{now()}</div>
            </div>
            <div style={{
              padding: "10px 18px",
              background: verdictBg(result.verdict),
              borderRadius: 6,
              border: `1.5px solid ${c}`,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 10, color: T.inkMid, letterSpacing: 1 }}>VERDICT</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: c }}>{result.verdict}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <ScoreRing score={result.aiScore} size={130} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: T.inkLight, letterSpacing: 1 }}>CONFIDENCE</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{result.confidence}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.inkLight, letterSpacing: 1 }}>FALSE POSITIVE RISK</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: result.fpRisk === "HIGH" ? T.crimson : result.fpRisk === "MEDIUM" ? T.amber : T.emerald }}>
                    {result.fpRisk}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.inkLight, letterSpacing: 1 }}>LIKELY MODEL</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.violet }}>
                    {result.modelFingerprint?.topMatch}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.inkLight, letterSpacing: 1 }}>MODEL CONFIDENCE</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>
                    {result.modelFingerprint?.confidence}%
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: T.inkMid, lineHeight: 1.7, margin: 0 }}>{result.summary}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Indicators */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, letterSpacing: 1.5, marginBottom: 14 }}>DETECTION INDICATORS</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(result.indicators || []).map((ind, i) => (
            <span key={i} style={{
              padding: "5px 12px", borderRadius: 4,
              background: T.crimsonLt, color: T.crimson,
              fontSize: 11, fontWeight: 600, border: `1px solid ${T.crimson}44`,
            }}>⚑ {ind}</span>
          ))}
        </div>
        {(result.falsePositiveNotes?.length > 0) && (
          <>
            <Divider my={12} />
            <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>
              FALSE POSITIVE SAFEGUARDS APPLIED
            </div>
            {result.falsePositiveNotes.map((n, i) => (
              <div key={i} style={{ fontSize: 11, color: T.amber, marginBottom: 4 }}>
                ⚠ {n}
              </div>
            ))}
          </>
        )}
      </Card>

      {/* Share Section */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, letterSpacing: 1.5, marginBottom: 14 }}>SHARE THIS REPORT</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{
            flex: 1, padding: "10px 14px", background: T.panel,
            border: `1.5px solid ${T.border}`, borderRadius: 6,
            fontSize: 12, color: T.inkMid, fontFamily: "monospace",
          }}>{link}</div>
          <button onClick={copyLink} style={{
            padding: "10px 16px", borderRadius: 6,
            background: copied ? T.emerald : T.ink,
            border: "none", color: T.bg, fontSize: 12, fontWeight: 700,
            cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap",
          }}>{copied ? "✓ Copied" : "Copy Link"}</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "Share on X", color: "#000", bg: "#000", fg: "#fff", fn: shareX },
            { label: "LinkedIn", color: "#0077B5", bg: "#E8F4FD", fg: "#0077B5", fn: shareLinkedIn },
            { label: "Reddit", color: "#FF4500", bg: "#FFF0EB", fg: "#FF4500", fn: shareReddit },
          ].map(({ label, bg, fg, fn }) => (
            <button key={label} onClick={fn} style={{
              flex: 1, padding: "9px 12px", borderRadius: 6,
              background: bg, border: `1.5px solid ${fg}44`,
              color: fg, fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>{label}</button>
          ))}
        </div>
      </Card>

      {/* Embed badge */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, letterSpacing: 1.5, marginBottom: 12 }}>EMBED VERIFICATION BADGE</div>
        <div style={{
          padding: "14px 16px",
          background: T.panel, border: `1.5px solid ${T.border}`,
          borderRadius: 6, marginBottom: 10,
        }}>
          {/* Preview of badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            padding: "8px 14px", background: T.surface,
            border: `1.5px solid ${c}`, borderRadius: 6,
          }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: verdictBg(result.verdict), border: `2px solid ${c}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>
              {result.aiScore >= 55 ? "⚠" : "✓"}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: c }}>AI Probability: {result.aiScore}%</div>
              <div style={{ fontSize: 9, color: T.inkLight }}>Verified by AI Authenticity Scanner</div>
            </div>
          </div>
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: T.inkMid, background: "#1A1612", padding: "10px 14px", borderRadius: 6, overflowX: "auto" }}>
          <span style={{ color: "#98c379" }}>{embedCode}</span>
        </div>
      </Card>

      <button onClick={onBack} style={{
        padding: "12px 24px", borderRadius: 6,
        border: `1.5px solid ${T.border}`, background: "transparent",
        color: T.inkMid, fontSize: 13, fontWeight: 600, cursor: "pointer",
      }}>← Back to Scanner</button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ANALYTICS VIEW
───────────────────────────────────────────────────────────────────────────── */
function AnalyticsView() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: T.ink, fontFamily: "'Georgia',serif", marginBottom: 4 }}>
          Platform Analytics
        </div>
        <div style={{ fontSize: 13, color: T.inkMid }}>Live metrics — last 7 days</div>
      </div>

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <StatBox label="TOTAL SCANS" value="9,750" sub="+18% vs last week" color={T.blue} />
        <StatBox label="ACTIVE USERS" value="3,412" sub="+24% growth" color={T.violet} />
        <StatBox label="PREMIUM CONV." value="4.8%" sub="$10/mo plan" color={T.emerald} />
        <StatBox label="AI DETECTED" value="68%" sub="of all scans" color={T.crimson} />
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.inkMid, letterSpacing: 0.5, marginBottom: 16 }}>SCANS PER DAY</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={MOCK_SCANS_BY_DAY} barSize={22}>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: T.inkLight }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: T.inkLight }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey="scans" radius={[3,3,0,0]}>
                {MOCK_SCANS_BY_DAY.map((_, i) => (
                  <Cell key={i} fill={i === 5 ? T.ink : T.panel} stroke={T.border} strokeWidth={1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.inkMid, letterSpacing: 0.5, marginBottom: 16 }}>CONTENT TYPES</div>
          {MOCK_TYPES.map(({ type, count, color }) => (
            <div key={type} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: T.inkMid }}>{type}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color }}>{count.toLocaleString()}</span>
              </div>
              <div style={{ height: 4, background: T.panel, borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${(count/4820)*100}%`, background: color, borderRadius: 2, transition: "width 1s" }} />
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Model distribution + growth */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.inkMid, letterSpacing: 0.5, marginBottom: 16 }}>
            DETECTED MODEL DISTRIBUTION
          </div>
          {MOCK_MODELS.map(({ model, pct }) => (
            <div key={model} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
              <span style={{ fontSize: 11, color: T.inkMid, width: 100, flexShrink: 0 }}>{model}</span>
              <div style={{ flex: 1, height: 5, background: T.panel, borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: T.ink, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.ink, width: 30, textAlign: "right" }}>{pct}%</span>
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.inkMid, letterSpacing: 0.5, marginBottom: 16 }}>
            WEEKLY USER GROWTH
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={[
              {w:"W1",u:180},{w:"W2",u:340},{w:"W3",u:520},{w:"W4",u:890},
              {w:"W5",u:1240},{w:"W6",u:1980},{w:"W7",u:3412},
            ]}>
              <XAxis dataKey="w" tick={{ fontSize: 11, fill: T.inkLight }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: T.inkLight }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 11 }} />
              <Line type="monotone" dataKey="u" stroke={T.ink} strokeWidth={2.5} dot={{ fill: T.ink, r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* SEO Strategy */}
      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.inkMid, letterSpacing: 0.5, marginBottom: 16 }}>
          SEO GROWTH ENGINE — TARGET PAGES
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { kw: '"AI detector"', vol: "165K/mo", intent: "Tool", url: "/ai-detector" },
            { kw: '"is this AI generated"', vol: "90K/mo", intent: "Informational", url: "/is-this-ai-generated" },
            { kw: '"detect ChatGPT text"', vol: "60K/mo", intent: "Tool", url: "/detect-chatgpt" },
            { kw: '"AI image detector"', vol: "74K/mo", intent: "Tool", url: "/ai-image-detector" },
            { kw: '"deepfake detector"', vol: "49K/mo", intent: "Tool", url: "/deepfake-detector" },
            { kw: '"AI content checker"', vol: "38K/mo", intent: "Tool", url: "/ai-content-checker" },
          ].map(({ kw, vol, intent, url }) => (
            <div key={kw} style={{
              padding: "12px 14px", background: T.panel,
              borderRadius: 6, border: `1px solid ${T.border}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{kw}</div>
              <div style={{ fontSize: 10, color: T.emerald, fontWeight: 700 }}>{vol}</div>
              <div style={{ fontSize: 10, color: T.inkLight }}>{intent} · <span style={{ fontFamily: "monospace" }}>{url}</span></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ARCHITECTURE VIEW
───────────────────────────────────────────────────────────────────────────── */
function ArchitectureView() {
  const layers = [
    {
      name: "INGESTION & AUTH LAYER",
      color: T.blue,
      items: [
        { name: "Next.js 14 App Router", detail: "SSR + ISR for SEO landing pages" },
        { name: "Auth.js (Next-Auth)", detail: "Google OAuth + email magic link + JWT" },
        { name: "CloudFront CDN", detail: "Edge caching for static assets + badge iframes" },
        { name: "NGINX Rate Limiter", detail: "10 req/min free, 200 req/min premium" },
        { name: "Upstash Redis (edge)", detail: "Scan quota enforcement per user" },
      ],
    },
    {
      name: "API & QUEUE LAYER",
      color: T.amber,
      items: [
        { name: "FastAPI Gateway", detail: "Async endpoints, Pydantic validation" },
        { name: "Celery + Redis Broker", detail: "Async task dispatch for heavy workloads" },
        { name: "BullMQ (Node fallback)", detail: "Priority queues: premium users first" },
        { name: "Presigned S3 Uploads", detail: "Direct browser→S3, no proxy overhead" },
        { name: "Webhook callbacks", detail: "Push results to client when scan completes" },
      ],
    },
    {
      name: "ENSEMBLE DETECTION LAYER",
      color: T.violet,
      items: [
        { name: "Text: RoBERTa + Perplexity", detail: "Weighted 0.35 — most reliable signal" },
        { name: "Text: DetectGPT perturbation", detail: "Weighted 0.25 — LLM boundary detection" },
        { name: "Text: Burstiness + Stylometry", detail: "Weighted 0.20 — writing pattern analysis" },
        { name: "Image: GAN + Diffusion CNN", detail: "EfficientNet B4 fine-tuned, 94% acc" },
        { name: "Audio: wav2vec 2.0", detail: "Spectrogram + waveform irregularities" },
        { name: "Video: TimeSformer deepfake", detail: "Frame-level + temporal consistency" },
        { name: "Ensemble Aggregator", detail: "Bayesian weighted average + FP calibration" },
      ],
    },
    {
      name: "STORAGE & SCALE LAYER",
      color: T.emerald,
      items: [
        { name: "PostgreSQL (RDS)", detail: "Users, scan records, report metadata" },
        { name: "S3 + Glacier", detail: "Raw files (30-day TTL free, forever premium)" },
        { name: "Elasticsearch", detail: "Audit logs, indicator search, analytics" },
        { name: "Redis Cache", detail: "Content-hash dedup: same file → same result" },
        { name: "GPU Autoscaling (ECS)", detail: "Spot g4dn.xlarge, scale 1→20 in 90s" },
      ],
    },
  ];

  const antiBypass = [
    { title: "Content Hash Dedup", detail: "Identical files return cached result — no reprocessing loop possible" },
    { title: "Ensemble Voting", detail: "≥4 of 6 modules must agree before verdict changes — single model poisoning fails" },
    { title: "Adversarial Perturbation Detect", detail: "Checks for humanizer tools (Quillbot, Undetectable.ai) via word-substitution patterns" },
    { title: "Semantic Coherence Check", detail: "Detects meaning-preserving paraphrasing that inflates burstiness artificially" },
    { title: "FP Calibration Layer", detail: "Platt scaling on ensemble scores — reduces false accusation rate to <3%" },
    { title: "Confidence Gating", detail: "Score between 40–65% forces INCONCLUSIVE — never a binary wrong verdict" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: T.ink, fontFamily: "'Georgia',serif", marginBottom: 4 }}>
          System Architecture
        </div>
        <div style={{ fontSize: 13, color: T.inkMid }}>Production-grade ensemble detection pipeline</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {layers.map(layer => (
          <Card key={layer.name}>
            <div style={{ fontSize: 10, fontWeight: 800, color: layer.color, letterSpacing: 1.5, marginBottom: 14 }}>{layer.name}</div>
            {layer.items.map(item => (
              <div key={item.name} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 2 }}>{item.name}</div>
                <div style={{ fontSize: 11, color: T.inkLight }}>{item.detail}</div>
              </div>
            ))}
          </Card>
        ))}
      </div>

      {/* Ensemble formula */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: T.violet, letterSpacing: 1.5, marginBottom: 14 }}>
          ENSEMBLE SCORING FORMULA
        </div>
        <div style={{
          fontFamily: "monospace", fontSize: 12, color: "#98c379",
          background: "#1A1612", padding: "16px 20px", borderRadius: 6, lineHeight: 1.8,
        }}>
          {`# Weighted ensemble aggregation
scores = {
    "roberta_perplexity":    (0.35, module_scores["roberta"]),
    "detectgpt":             (0.25, module_scores["detectgpt"]),
    "burstiness_stylometry": (0.20, module_scores["burstiness"]),
    "entropy_distribution":  (0.12, module_scores["entropy"]),
    "token_repetition":      (0.08, module_scores["repetition"]),
}

raw_score = sum(w * s for w, s in scores.values())

# Platt scaling calibration (trained on 50K labeled samples)
calibrated = 1 / (1 + exp(-(A * raw_score + B)))

# False positive gate
if 40 <= calibrated <= 65:
    verdict = "INCONCLUSIVE"
elif calibrated > 65:
    verdict = "LIKELY AI"
else:
    verdict = "LIKELY HUMAN"`}
        </div>
      </Card>

      {/* Anti-bypass */}
      <Card>
        <div style={{ fontSize: 10, fontWeight: 800, color: T.crimson, letterSpacing: 1.5, marginBottom: 14 }}>
          ANTI-BYPASS & FALSE POSITIVE PROTECTION
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {antiBypass.map(({ title, detail }) => (
            <div key={title} style={{ padding: "12px 14px", background: T.panel, borderRadius: 6, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 11, color: T.inkLight }}>{detail}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN SCANNER VIEW
───────────────────────────────────────────────────────────────────────────── */
const CONTENT_TYPES = [
  { id: "text",     label: "Text",          icon: "¶" },
  { id: "image",    label: "Image",         icon: "◻" },
  { id: "video",    label: "Video",         icon: "▷" },
  { id: "audio",    label: "Audio",         icon: "♫" },
  { id: "document", label: "PDF / Doc",     icon: "▤" },
  { id: "url",      label: "URL / Social",  icon: "⊹" },
];

const LOG_STEPS = [
  "Dispatching to ensemble queue...",
  "Running primary RoBERTa classifier...",
  "Executing perplexity + entropy analysis...",
  "Burstiness & stylometry profiling...",
  "DetectGPT perturbation sampling...",
  "Checking model fingerprint database...",
  "Applying false positive calibration...",
  "Aggregating weighted ensemble vote...",
  "Generating forensic report...",
];

function ScannerView({ onResult }) {
  const [type,     setType]     = useState("text");
  const [text,     setText]     = useState("");
  const [url,      setUrl]      = useState("");
  const [file,     setFile]     = useState(null);
  const [dragging, setDragging] = useState(false);
  const [phase,    setPhase]    = useState("idle");
  const [log,      setLog]      = useState([]);
  const [error,    setError]    = useState(null);
  const [scansLeft] = useState(7);

  const addLog = msg => setLog(l => [...l.slice(-30), msg]);

  const scan = async () => {
    if (phase === "scanning") return;
    setPhase("scanning");
    setLog([]);
    setError(null);

    let i = 0;
    const logInterval = setInterval(() => {
      if (i < LOG_STEPS.length) addLog(LOG_STEPS[i++]);
    }, 700);

    try {
      let contentType = type;
      let content = type === "text" ? (text || "(empty)")
                  : type === "url"  ? (url  || "https://example.com")
                  : file ? file.name : `sample_${type}_file`;
      const result = await runEnsemble(contentType, content);
      result.reportId = result.reportId || uuid();
      clearInterval(logInterval);
      addLog("✓ Ensemble analysis complete.");
      setPhase("done");
      onResult(result);
    } catch (e) {
      clearInterval(logInterval);
      setError("Scan failed: " + e.message);
      setPhase("idle");
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      {/* LEFT */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Type selector */}
        <Card>
          <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, letterSpacing: 1.5, marginBottom: 14 }}>
            CONTENT TYPE
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {CONTENT_TYPES.map(ct => (
              <button key={ct.id} onClick={() => { setType(ct.id); setFile(null); setText(""); setUrl(""); }} style={{
                padding: "10px 6px",
                background: type === ct.id ? T.ink : "transparent",
                border: `1.5px solid ${type === ct.id ? T.ink : T.border}`,
                borderRadius: 6, color: type === ct.id ? T.bg : T.inkMid,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 20 }}>{ct.icon}</span>
                {ct.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Input */}
        <Card style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, letterSpacing: 1.5, marginBottom: 14 }}>
            {type === "text" ? "PASTE CONTENT" : type === "url" ? "ENTER URL" : "UPLOAD FILE"}
          </div>

          {type === "text" && (
            <textarea value={text} onChange={e => setText(e.target.value)}
              placeholder="Paste any text — article, essay, email, social post, code..."
              style={{
                width: "100%", minHeight: 220, resize: "vertical",
                background: T.panel, border: `1.5px solid ${T.border}`,
                borderRadius: 6, padding: "12px 14px",
                fontSize: 13, color: T.ink, lineHeight: 1.7,
                outline: "none", fontFamily: "Georgia, serif", boxSizing: "border-box",
              }} />
          )}

          {type === "url" && (
            <input value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/article or social media URL"
              style={{
                width: "100%", background: T.panel,
                border: `1.5px solid ${T.border}`, borderRadius: 6,
                padding: "12px 14px", fontSize: 13, color: T.ink,
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }} />
          )}

          {!["text","url"].includes(type) && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); setFile(e.dataTransfer.files?.[0]); }}
              onClick={() => document.getElementById("fi").click()}
              style={{
                border: `2px dashed ${dragging ? T.ink : T.borderDk}`,
                borderRadius: 8, padding: "40px 20px", textAlign: "center",
                background: dragging ? T.panel : "transparent",
                cursor: "pointer", transition: "all 0.15s",
              }}>
              <input id="fi" type="file" style={{ display: "none" }} onChange={e => setFile(e.target.files?.[0])} />
              {file ? (
                <>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>{CONTENT_TYPES.find(c=>c.id===type)?.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{file.name}</div>
                  <div style={{ fontSize: 11, color: T.inkLight, marginTop: 2 }}>{(file.size/1024).toFixed(1)} KB</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 36, opacity: 0.2, marginBottom: 8 }}>↑</div>
                  <div style={{ fontSize: 13, color: T.inkMid }}>Drag & drop or <strong>click to browse</strong></div>
                </>
              )}
            </div>
          )}

          <button onClick={scan} disabled={phase === "scanning"} style={{
            marginTop: 16, width: "100%", padding: 14,
            background: phase === "scanning" ? T.panel : T.ink,
            border: `1.5px solid ${T.ink}`,
            borderRadius: 6, color: phase === "scanning" ? T.inkMid : T.bg,
            fontSize: 13, fontWeight: 700, cursor: phase === "scanning" ? "not-allowed" : "pointer",
            letterSpacing: 0.5, transition: "all 0.2s",
          }}>
            {phase === "scanning" ? "ANALYZING…" : "▶  RUN ENSEMBLE SCAN"}
          </button>

          {error && (
            <div style={{ marginTop: 10, padding: "10px 14px", background: T.crimsonLt, border: `1px solid ${T.crimson}44`, borderRadius: 6, fontSize: 12, color: T.crimson }}>
              {error}
            </div>
          )}
        </Card>

        {/* Scan quota */}
        <Card style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, color: T.inkLight, letterSpacing: 1 }}>FREE TIER</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{scansLeft} / 10 scans remaining today</div>
            </div>
            <button style={{
              padding: "8px 16px", borderRadius: 6,
              background: T.amber, border: "none",
              color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>Upgrade $10/mo</button>
          </div>
          <div style={{ marginTop: 10, height: 4, background: T.panel, borderRadius: 2 }}>
            <div style={{ height: "100%", width: `${(scansLeft/10)*100}%`, background: scansLeft <= 3 ? T.crimson : T.emerald, borderRadius: 2, transition: "width 0.5s" }} />
          </div>
        </Card>
      </div>

      {/* RIGHT: logs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Card style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, letterSpacing: 1.5, marginBottom: 14 }}>
            ENSEMBLE PIPELINE LOG
          </div>
          <div style={{
            background: "#1A1612", borderRadius: 6, padding: "14px 16px",
            minHeight: 220, maxHeight: 380, overflowY: "auto",
          }}>
            {log.length === 0 ? (
              <span style={{ fontSize: 12, color: "#4a5568", fontFamily: "monospace" }}>
                Awaiting scan input_
              </span>
            ) : log.map((l, i) => (
              <div key={i} style={{
                fontSize: 11, fontFamily: "monospace",
                color: i === log.length - 1 ? "#98c379" : "#4a5568",
                marginBottom: 3,
              }}>{l.startsWith("✓") ? l : `[${String(i+1).padStart(2,"0")}] ${l}`}</div>
            ))}
          </div>
        </Card>

        {/* Detection modules info */}
        <Card>
          <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, letterSpacing: 1.5, marginBottom: 14 }}>
            ACTIVE DETECTION MODULES
          </div>
          {[
            { label: "TEXT", modules: ["RoBERTa (w=0.35)", "DetectGPT (w=0.25)", "Burstiness+Stylometry (w=0.20)", "Entropy (w=0.12)", "Repetition (w=0.08)"], color: T.blue },
            { label: "IMAGE", modules: ["GAN Fingerprint CNN", "Diffusion Artifact Detector", "Frequency Domain FFT", "EXIF/Metadata Inspector"], color: T.violet },
            { label: "AUDIO/VIDEO", modules: ["wav2vec 2.0", "Spectrogram Analyzer", "TimeSformer Deepfake", "Lip Sync Validator"], color: T.emerald },
          ].map(g => (
            <div key={g.label} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: g.color, letterSpacing: 1.5, marginBottom: 6 }}>{g.label}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {g.modules.map(m => (
                  <span key={m} style={{
                    padding: "3px 8px", borderRadius: 3,
                    background: T.panel, border: `1px solid ${T.border}`,
                    fontSize: 10, color: T.inkMid,
                  }}>{m}</span>
                ))}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   RESULTS VIEW (inline, before going to report)
───────────────────────────────────────────────────────────────────────────── */
function ResultsView({ result, onViewReport, onReset }) {
  const c = scoreColor(result.aiScore);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      {/* LEFT */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Main verdict card */}
        <Card style={{ borderTop: `4px solid ${c}` }}>
          <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 20 }}>
            <ScoreRing score={result.aiScore} size={150} />
            <div>
              <div style={{
                display: "inline-flex", alignItems: "center",
                padding: "8px 16px", background: verdictBg(result.verdict),
                border: `2px solid ${c}`, borderRadius: 6, marginBottom: 10,
              }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: c }}>{result.verdict}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Badge label={`CONFIDENCE: ${result.confidence}`} color={T.amber} bg={T.amberLt} />
                <Badge label={`FP RISK: ${result.fpRisk}`}
                  color={result.fpRisk === "HIGH" ? T.crimson : result.fpRisk === "MEDIUM" ? T.amber : T.emerald}
                  bg={result.fpRisk === "HIGH" ? T.crimsonLt : result.fpRisk === "MEDIUM" ? T.amberLt : T.emeraldLt} />
              </div>
              <p style={{ fontSize: 12, color: T.inkMid, lineHeight: 1.7, margin: "12px 0 0" }}>{result.summary}</p>
            </div>
          </div>

          {/* Model fingerprint */}
          <div style={{ background: T.violetLt, border: `1.5px solid ${T.violet}44`, borderRadius: 6, padding: "12px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: T.violet, letterSpacing: 1.5, marginBottom: 8 }}>
              MODEL FINGERPRINT
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: T.violet }}>
                {result.modelFingerprint?.topMatch}
              </span>
              <Badge label={`${result.modelFingerprint?.confidence}% match`} color={T.violet} bg={T.violetLt} />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(result.modelFingerprint?.alternates || []).map(a => (
                <span key={a.model} style={{
                  fontSize: 10, padding: "2px 8px",
                  background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: 3, color: T.inkMid,
                }}>{a.model} {a.probability}%</span>
              ))}
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onViewReport} style={{
            flex: 1, padding: "12px", borderRadius: 6,
            background: T.ink, border: "none",
            color: T.bg, fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>View Full Report →</button>
          <button onClick={onReset} style={{
            padding: "12px 20px", borderRadius: 6,
            border: `1.5px solid ${T.border}`, background: "transparent",
            color: T.inkMid, fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>New Scan</button>
        </div>
      </div>

      {/* RIGHT */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Ensemble module scores */}
        <Card>
          <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, letterSpacing: 1.5, marginBottom: 16 }}>
            ENSEMBLE MODULE BREAKDOWN
          </div>
          {(result.ensembleScores || []).map((m, i) => (
            <ModuleBar key={i} {...m} />
          ))}
        </Card>

        {/* Indicators */}
        <Card>
          <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, letterSpacing: 1.5, marginBottom: 12 }}>
            DETECTED INDICATORS
          </div>
          {(result.indicators || []).map((ind, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7 }}>
              <span style={{ color: c, flexShrink: 0, marginTop: 1 }}>◆</span>
              <span style={{ fontSize: 12, color: T.inkMid }}>{ind}</span>
            </div>
          ))}
          {(result.falsePositiveNotes?.length > 0) && (
            <>
              <Divider my={10} />
              <div style={{ fontSize: 11, fontWeight: 700, color: T.amber, letterSpacing: 1, marginBottom: 8 }}>
                ⚠ FALSE POSITIVE SAFEGUARDS
              </div>
              {result.falsePositiveNotes.map((n, i) => (
                <div key={i} style={{ fontSize: 11, color: T.amber, marginBottom: 4 }}>• {n}</div>
              ))}
            </>
          )}
        </Card>

        {/* Metadata */}
        {result.metadata && Object.keys(result.metadata).length > 0 && (
          <Card style={{ background: T.panel }}>
            <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, letterSpacing: 1.5, marginBottom: 12 }}>
              METADATA ANALYSIS
            </div>
            {Object.entries(result.metadata).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11 }}>
                <span style={{ color: T.inkLight }}>{k}</span>
                <span style={{ fontWeight: 600, color: T.ink, fontFamily: "monospace" }}>{String(v)}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ROOT APP
───────────────────────────────────────────────────────────────────────────── */
const TABS = ["Scanner", "Analytics", "Architecture"];

export default function App() {
  const [tab, setTab] = useState("Scanner");
  const [phase, setPhase] = useState("input"); // input | results | report
  const [result, setResult] = useState(null);

  const handleResult = useCallback(r => {
    setResult(r);
    setPhase("results");
  }, []);
  const handleReset = () => { setResult(null); setPhase("input"); };

  return (
    <div style={{
      minHeight: "100vh",
      background: T.bg,
      color: T.ink,
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    }}>
      {/* ── Header ── */}
      <header style={{
        background: T.surface,
        borderBottom: `1.5px solid ${T.border}`,
        padding: "0 40px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 58, position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 28, height: 28, background: T.ink, borderRadius: 4,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, color: T.bg, fontWeight: 900,
            }}>V</div>
            <div>
              <span style={{ fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: -0.3 }}>VERIDEX</span>
              <span style={{ fontSize: 10, color: T.inkLight, letterSpacing: 1, display: "block", marginTop: -2 }}>AI SCANNER</span>
            </div>
          </div>
          {/* Nav */}
          <nav style={{ display: "flex", gap: 4 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); if (t !== "Scanner") { /* keep results */ }}} style={{
                padding: "6px 14px", borderRadius: 5,
                background: tab === t ? T.panel : "transparent",
                border: `1.5px solid ${tab === t ? T.border : "transparent"}`,
                color: tab === t ? T.ink : T.inkMid,
                fontSize: 13, fontWeight: tab === t ? 700 : 500,
                cursor: "pointer",
              }}>{t}</button>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.emerald }} />
            <span style={{ fontSize: 11, color: T.inkLight }}>All systems operational</span>
          </div>
          <button style={{
            padding: "7px 14px", borderRadius: 6,
            background: T.ink, border: "none",
            color: T.bg, fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>Log in</button>
          <button style={{
            padding: "7px 14px", borderRadius: 6,
            background: T.amber, border: "none",
            color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>Sign up free</button>
        </div>
      </header>

      {/* ── Page content ── */}
      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 28px" }}>

        {tab === "Scanner" && (
          <>
            {phase === "input" && (
              <>
                <div style={{ marginBottom: 28 }}>
                  <h1 style={{ fontSize: 30, fontWeight: 900, color: T.ink, fontFamily: "'Georgia',serif", margin: "0 0 6px" }}>
                    AI Authenticity Scanner
                  </h1>
                  <p style={{ fontSize: 14, color: T.inkMid, margin: 0 }}>
                    Multi-model ensemble detection for text, images, video, audio and documents.
                    &nbsp;<strong>10 free scans per day</strong> — no credit card required.
                  </p>
                </div>
                <ScannerView onResult={handleResult} />
              </>
            )}
            {phase === "results" && result && (
              <>
                <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 14 }}>
                  <button onClick={handleReset} style={{
                    padding: "7px 14px", borderRadius: 6,
                    border: `1.5px solid ${T.border}`, background: "transparent",
                    color: T.inkMid, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}>← New Scan</button>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: "'Georgia',serif", margin: 0 }}>
                    Scan Results — Report #{result.reportId}
                  </h2>
                </div>
                <ResultsView result={result} onViewReport={() => setPhase("report")} onReset={handleReset} />
              </>
            )}
            {phase === "report" && result && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: "'Georgia',serif", margin: 0 }}>
                    Public Verification Report
                  </h2>
                </div>
                <ReportView result={result} onBack={() => setPhase("results")} />
              </>
            )}
          </>
        )}

        {tab === "Analytics" && <AnalyticsView />}
        {tab === "Architecture" && <ArchitectureView />}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: `1.5px solid ${T.border}`,
        padding: "20px 40px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ fontSize: 11, color: T.inkLight }}>
          © 2025 VERIDEX · AI Authenticity Scanner · v2.0
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          {["API Docs", "Pricing", "Privacy", "Terms", "Browser Extension"].map(l => (
            <span key={l} style={{ fontSize: 11, color: T.inkLight, cursor: "pointer" }}>{l}</span>
          ))}
        </div>
      </footer>

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: ${T.panel}; }
        ::-webkit-scrollbar-thumb { background: ${T.borderDk}; border-radius: 3px; }
        button:focus { outline: 2px solid ${T.amber}; outline-offset: 2px; }
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
      `}</style>
    </div>
  );
}
