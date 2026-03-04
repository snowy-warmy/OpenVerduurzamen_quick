(function () {
  const script = document.currentScript;
  const apiBase = script?.getAttribute("data-api-base") || new URL(script.src).origin;
  const targetSelector = script?.getAttribute("data-target") || "#huislijn-duurzaamheid-widget";

  // Demo/testing overrides
  const overrideUrl = script?.getAttribute("data-url");
  const debugMode = script?.getAttribute("data-debug") === "1";

  let host = document.querySelector(targetSelector);
  if (!host) {
    host = document.createElement("div");
    host.id = targetSelector.startsWith("#") ? targetSelector.slice(1) : "huislijn-duurzaamheid-widget";
    document.body.appendChild(host);
  }

  // Best-effort match Huislijn typography/colors
  try {
    const bodyStyle = getComputedStyle(document.body);
    const linkEl = document.querySelector("a");
    const linkColor = linkEl ? getComputedStyle(linkEl).color : "#0b5fff";

    host.style.setProperty("--hlw-font", bodyStyle.fontFamily || "system-ui, -apple-system, Segoe UI, Roboto, Arial");
    host.style.setProperty("--hlw-text", bodyStyle.color || "#111");
    host.style.setProperty("--hlw-accent", linkColor || "#0b5fff");
  } catch {}

  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host{
        --hlw-font: system-ui, -apple-system, Segoe UI, Roboto, Arial;
        --hlw-text: #111;
        --hlw-accent: #0b5fff;

        --hlw-border: rgba(0,0,0,.10);
        --hlw-muted: rgba(0,0,0,.62);
        --hlw-soft: rgba(0,0,0,.04);
        --hlw-shadow: 0 1px 2px rgba(0,0,0,.05), 0 8px 24px rgba(0,0,0,.06);

        --hlw-radius: 16px;
        --hlw-card-radius: 14px;

        font-family: var(--hlw-font);
        color: var(--hlw-text);
        display:block;
      }

      .container{
        max-width: 730px;
        width: 100%;
        background: #fff;
        border: 1px solid var(--hlw-border);
        border-radius: var(--hlw-radius);
        box-shadow: var(--hlw-shadow);
        padding: 16px;
        box-sizing: border-box;
      }

      .header{
        display:flex;
        justify-content: space-between;
        align-items:flex-start;
        gap: 12px;
        margin-bottom: 14px;
      }

      .title{
        margin: 0;
        font-size: 20px;
        font-weight: 900;
        line-height: 1.15;
        letter-spacing: -0.01em;
      }

      .subtitle{
        margin: 6px 0 0;
        font-size: 13px;
        color: var(--hlw-muted);
        line-height: 1.3;
        font-weight: 600;
      }

      .pill{
        display:inline-flex;
        align-items:center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 999px;
        border: 1px solid rgba(0,0,0,.12);
        background: rgba(0,0,0,.03);
        font-size: 12px;
        font-weight: 800;
        white-space: nowrap;
      }

      .pill .dot{
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #9aa0a6;
        box-shadow: inset 0 0 0 2px rgba(255,255,255,.65);
      }

      .grid{
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .card{
        border: 1px solid rgba(0,0,0,.10);
        border-radius: var(--hlw-card-radius);
        background: #fff;
        padding: 14px;
        box-sizing: border-box;
        min-width: 0;

        display:flex;
        flex-direction: column;
        height: 100%;
      }

      .cardTop{
        display:flex;
        align-items:flex-start;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }

      .leftHead{
        display:flex;
        align-items:flex-start;
        gap: 10px;
        min-width: 0;
      }

      .iconWrap{
        width: 38px;
        height: 38px;
        border-radius: 12px;
        background: rgba(0,0,0,.03);
        border: 1px solid rgba(0,0,0,.08);
        display:flex;
        align-items:center;
        justify-content:center;
        flex: 0 0 auto;
      }

      .cardTitle{
        margin: 0;
        font-size: 16px;
        font-weight: 900;
        line-height: 1.15;
        letter-spacing: -0.01em;

        /* Fix ugly letter-by-letter breaks */
        word-break: normal;
        overflow-wrap: break-word;
        hyphens: auto;
      }

      .jumpPill{
        flex: 0 0 auto;
        display:inline-flex;
        align-items:center;
        gap: 6px;
        padding: 6px 8px;
        border-radius: 999px;
        border: 1px solid rgba(0,0,0,.10);
        background: rgba(0,0,0,.03);
        font-size: 11px;
        font-weight: 900;
        color: rgba(0,0,0,.70);
        white-space: nowrap;
      }

      .jumpDot{
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: #9aa0a6;
      }

      .bullets{
        margin: 0 0 12px;
        padding-left: 18px;
        color: var(--hlw-muted);
        font-size: 13px;
        line-height: 1.35;
        font-weight: 600;
      }
      .bullets li{ margin: 6px 0; }

      /* KPI row pinned bottom, no overlap */
      .kpis{
        margin-top: auto;
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        padding-top: 12px;
        border-top: 1px solid rgba(0,0,0,.08);
      }

      .kpi{
        border: 1px solid rgba(0,0,0,.10);
        background: rgba(0,0,0,.02);
        border-radius: 12px;
        padding: 10px;
        min-width: 0;
      }

      .kpiLabel{
        font-size: 11px;
        color: rgba(0,0,0,.58);
        font-weight: 800;
        margin: 0 0 6px;
        display:flex;
        align-items:center;
        gap: 6px;
        white-space: nowrap;
      }

      .kpiIcon{
        width: 18px;
        height: 18px;
        border-radius: 7px;
        background: rgba(0,0,0,.05);
        border: 1px solid rgba(0,0,0,.06);
        display:flex;
        align-items:center;
        justify-content:center;
        font-size: 11px;
        font-weight: 900;
        color: rgba(0,0,0,.70);
        flex: 0 0 auto;
      }

      .kpiValue{
        font-size: 15px;
        font-weight: 950;
        line-height: 1.15;
        letter-spacing: -0.01em;
        font-variant-numeric: tabular-nums;

        /* prevent ugly wraps; allow wrap only at <wbr> */
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .footer{
        margin-top: 12px;
        font-size: 12px;
        color: rgba(0,0,0,.55);
        line-height: 1.35;
        font-weight: 600;
      }

      .loadingRow{
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }
      .skeleton{
        height: 210px;
        border-radius: var(--hlw-card-radius);
        border: 1px solid rgba(0,0,0,.10);
        background: linear-gradient(90deg, rgba(0,0,0,.03), rgba(0,0,0,.06), rgba(0,0,0,.03));
        background-size: 220% 100%;
        animation: shimmer 1.1s ease-in-out infinite;
      }
      @keyframes shimmer{
        0%{ background-position: 0% 0%; }
        100%{ background-position: 220% 0%; }
      }

      .error{
        font-size: 13px;
        color: #b00020;
        padding: 6px 0;
        font-weight: 700;
      }

      @media (max-width: 900px){
        .grid{ grid-template-columns: 1fr; }
        .loadingRow{ grid-template-columns: 1fr; }
        .kpiValue{
          white-space: normal;   /* allow wrap on small */
          overflow: visible;
          text-overflow: clip;
        }
      }
      @media (max-width: 520px){
        .kpis{ grid-template-columns: 1fr; }
      }
    </style>

    <div class="container" lang="nl">
      <div class="header">
        <div>
          <h2 class="title">Verduurzamingsadvies</h2>
          <div class="subtitle">3 maatregelen die het meeste opleveren voor comfort, kosten en waarde.</div>
        </div>
        <div class="pill" id="hlw-pill">
          <span class="dot" id="hlw-dot"></span>
          <span id="hlw-pill-text">Energielabel: …</span>
        </div>
      </div>

      <div id="hlw-body">
        <div class="loadingRow">
          <div class="skeleton"></div>
          <div class="skeleton"></div>
          <div class="skeleton"></div>
        </div>
      </div>

      <div class="footer" id="hlw-footer" style="display:none;"></div>
    </div>
  `;

  const pillText = shadow.getElementById("hlw-pill-text");
  const dot = shadow.getElementById("hlw-dot");
  const body = shadow.getElementById("hlw-body");
  const footer = shadow.getElementById("hlw-footer");

  const pageUrl = overrideUrl || window.location.href;

  const qs = new URLSearchParams({ url: pageUrl });
  if (debugMode) {
    qs.set("debug", "1");
    qs.set("nocache", "1");
    qs.set("ts", String(Date.now()));
  }

  fetch(`${apiBase}/api/cards?${qs.toString()}`)
    .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
    .then(({ ok, j }) => {
      if (!ok) {
        const detail = debugMode ? (j?.detail || j?.error || "API error") : (j?.error || "API error");
        throw new Error(detail);
      }

      const label = (j?.energyLabel?.label || "").toUpperCase() || null;
      setEnergyLabelPill(label);

      const cards = j?.cards?.cards || [];
      const disclaimer = j?.cards?.disclaimer || "";

      body.innerHTML = `<div class="grid">${cards.map((c) => renderCard(c, label)).join("")}</div>`;

      if (disclaimer) {
        footer.style.display = "block";
        footer.textContent = disclaimer;
      }
    })
    .catch((e) => {
      setEnergyLabelPill(null);
      body.innerHTML = `<div class="error">Kon verduurzamingsadvies niet laden. (${escapeHtml(String(e.message || e))})</div>`;
    });

  function setEnergyLabelPill(label) {
    if (!label) {
      pillText.textContent = "Energielabel: onbekend";
      dot.style.background = "#9aa0a6";
      return;
    }
    pillText.textContent = `Energielabel: ${label}`;
    dot.style.background = labelColor(label);
  }

  function labelColor(label) {
    const map = { A: "#1aa058", B: "#53b83a", C: "#b7c900", D: "#f1b600", E: "#f08a00", F: "#e85b3a", G: "#d93025" };
    return map[label] || "#9aa0a6";
  }

  function parseJump(jump, currentLabel) {
    const s = String(jump || "").replace(/\s+/g, "");
    if (!s) return null;
    const m = s.match(/^([A-G])(?:→|->)([A-G])$/i);
    if (!m) return { after: currentLabel || null, text: s.toUpperCase() };
    return { after: m[2].toUpperCase(), text: `${m[1].toUpperCase()}→${m[2].toUpperCase()}` };
  }

  function renderCard(c, currentLabel) {
    const title = escapeHtml(c.title || "Maatregel");
    const bullets = Array.isArray(c.bullets) ? c.bullets.slice(0, 3) : [];
    const bulletsShort = bullets.map((b) => shortenWords(b, 5)); // enforce 5 words

    const investment = (c.indicative_cost || "€—").toString().trim();
    const saving = (c.indicative_saving || "—").toString().trim();
    const uplift = (c.indicative_value_uplift || "—").toString().trim();

    const icon = iconSvgForTitle(c.title || "");

    const jump = parseJump(c.label_jump, currentLabel);
    const jumpText = jump?.text || "—";
    const jumpColor = jump?.after ? labelColor(jump.after) : (currentLabel ? labelColor(currentLabel) : "#9aa0a6");

    return `
      <div class="card">
        <div class="cardTop">
          <div class="leftHead">
            <div class="iconWrap" aria-hidden="true">${icon}</div>
            <h3 class="cardTitle">${title}</h3>
          </div>
          <div class="jumpPill" title="Indicatieve labelsprong">
            <span class="jumpDot" style="background:${escapeHtml(jumpColor)}"></span>
            <span>${escapeHtml(jumpText)}</span>
          </div>
        </div>

        <ul class="bullets">
          ${bulletsShort.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
        </ul>

        <div class="kpis">
          <div class="kpi">
            <div class="kpiLabel"><span class="kpiIcon">€</span>Investering</div>
            <div class="kpiValue" title="${escapeHtml(investment)}">${formatValue(investment)}</div>
          </div>
          <div class="kpi">
            <div class="kpiLabel"><span class="kpiIcon">↘</span>Besparing p/m</div>
            <div class="kpiValue" title="${escapeHtml(saving)}">${formatValue(saving)}</div>
          </div>
          <div class="kpi">
            <div class="kpiLabel"><span class="kpiIcon">▲</span>Waardestijging</div>
            <div class="kpiValue" title="${escapeHtml(uplift)}">${formatValue(uplift)}</div>
          </div>
        </div>
      </div>
    `;
  }

  // Allow wrap only at dashes; prevents ugly digit wrapping
  function formatValue(text) {
    const safe = escapeHtml(String(text ?? "").trim() || "—");
    return safe
      .replaceAll("–", "–<wbr>")
      .replaceAll("-", "-<wbr>")
      .replaceAll("—", "—");
  }

  function shortenWords(text, maxWords) {
    const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return words.join(" ");
    return words.slice(0, maxWords).join(" ");
  }

  function iconSvgForTitle(title) {
    const t = String(title || "").toLowerCase();
    if (t.includes("warmtepomp")) return svgHeatPump();
    if (t.includes("hr++") || t.includes("glas")) return svgWindow();
    if (t.includes("zonne")) return svgSolar();
    if (t.includes("kier") || t.includes("tocht")) return svgSeal();
    if (t.includes("dak") || t.includes("vloer") || t.includes("spouw") || t.includes("isol")) return svgInsulation();
    return svgLeaf();
  }

  function svgBase(pathD) {
    return `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        xmlns="http://www.w3.org/2000/svg" style="color: rgba(0,0,0,.80);">
        <path d="${pathD}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }
  function svgLeaf() { return svgBase("M20 4c-6 1-10 5-11 11 6-1 10-5 11-11ZM9 15c-2 0-5 1-6 5 4-1 6-3 6-5Z"); }
  function svgSolar() { return svgBase("M4 6h16M7 10h10M6 14h12M8 18h8M6 6l3 12M18 6l-3 12"); }
  function svgHeatPump() { return svgBase("M6 7h12v10H6V7Zm3 2v6m6-6v6M9 12h6"); }
  function svgWindow() { return svgBase("M6 4h12v16H6V4Zm6 0v16M6 12h12"); }
  function svgSeal() { return svgBase("M4 12h8m0 0 4-6m-4 6 4 6m4-6h-2"); }
  function svgInsulation() { return svgBase("M4 12l4-4 4 4 4-4 4 4-4 4-4-4-4 4-4-4Z"); }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
