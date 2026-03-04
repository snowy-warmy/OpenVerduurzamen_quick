(function () {
  const script = document.currentScript;
  const apiBase = script?.getAttribute("data-api-base") || new URL(script.src).origin;
  const targetSelector = script?.getAttribute("data-target") || "#huislijn-duurzaamheid-widget";

  // Host element
  let host = document.querySelector(targetSelector);
  if (!host) {
    host = document.createElement("div");
    host.id = targetSelector.startsWith("#") ? targetSelector.slice(1) : "huislijn-duurzaamheid-widget";
    document.body.appendChild(host);
  }

  // Match host page typography/colors (best effort)
  try {
    const bodyStyle = getComputedStyle(document.body);
    const headingEl = document.querySelector("h1,h2,h3");
    const headingColor = headingEl ? getComputedStyle(headingEl).color : bodyStyle.color;
    const linkEl = document.querySelector("a");
    const linkColor = linkEl ? getComputedStyle(linkEl).color : "#0b5fff";

    host.style.setProperty("--hlw-font", bodyStyle.fontFamily || "system-ui, -apple-system, Segoe UI, Roboto, Arial");
    host.style.setProperty("--hlw-text", bodyStyle.color || "#111");
    host.style.setProperty("--hlw-heading", headingColor || "#0b4b53");
    host.style.setProperty("--hlw-accent", linkColor || "#0b5fff");
  } catch {
    // ignore
  }

  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host{
        --hlw-font: system-ui, -apple-system, Segoe UI, Roboto, Arial;
        --hlw-text: #111;
        --hlw-heading: #0b4b53;
        --hlw-accent: #0b5fff;

        --hlw-bg: #fff;
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
        background: var(--hlw-bg);
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
        line-height: 1.2;
        color: var(--hlw-heading);
      }

      .subtitle{
        margin: 6px 0 0;
        font-size: 13px;
        color: var(--hlw-muted);
        line-height: 1.35;
      }

      .pill{
        display:inline-flex;
        align-items:center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 999px;
        border: 1px solid var(--hlw-border);
        background: var(--hlw-soft);
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
        border: 1px solid var(--hlw-border);
        border-radius: var(--hlw-card-radius);
        background: linear-gradient(180deg, rgba(0,0,0,.015), rgba(0,0,0,0));
        padding: 14px;
        box-sizing: border-box;
        min-width: 0;
      }

      .cardTop{
        display:flex;
        align-items:center;
        gap: 10px;
        margin-bottom: 10px;
      }

      .iconWrap{
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: rgba(0,0,0,.04);
        border: 1px solid rgba(0,0,0,.06);
        display:flex;
        align-items:center;
        justify-content:center;
        flex: 0 0 auto;
      }

      .card h3{
        margin: 0;
        font-size: 14px;
        font-weight: 900;
        line-height: 1.25;
      }

      .bullets{
        margin: 0 0 12px;
        padding-left: 18px;
        color: var(--hlw-muted);
        font-size: 13px;
        line-height: 1.35;
      }

      .kpis{
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 8px;
      }

      .kpi{
        border: 1px solid rgba(0,0,0,.08);
        background: rgba(255,255,255,.85);
        border-radius: 12px;
        padding: 10px;
        min-width: 0;
      }

      .kpiLabel{
        font-size: 11px;
        color: var(--hlw-muted);
        font-weight: 800;
        margin-bottom: 4px;
        display:flex;
        align-items:center;
        gap: 6px;
      }

      .kpiValue{
        font-size: 14px;
        font-weight: 950;
        line-height: 1.1;
        color: var(--hlw-text);
        word-break: break-word;
      }

      .footer{
        margin-top: 12px;
        font-size: 12px;
        color: var(--hlw-muted);
        line-height: 1.35;
      }

      .loadingRow{
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .skeleton{
        height: 186px;
        border-radius: var(--hlw-card-radius);
        border: 1px solid var(--hlw-border);
        background: linear-gradient(90deg, rgba(0,0,0,.03), rgba(0,0,0,.06), rgba(0,0,0,.03));
        background-size: 220% 100%;
        animation: shimmer 1.2s ease-in-out infinite;
      }

      @keyframes shimmer{
        0%{ background-position: 0% 0%; }
        100%{ background-position: 220% 0%; }
      }

      .error{
        font-size: 13px;
        color: #b00020;
        padding: 6px 0;
      }

      /* Responsive */
      @media (max-width: 900px){
        .container{ padding: 14px; }
        .grid{ grid-template-columns: 1fr; }
        .loadingRow{ grid-template-columns: 1fr; }
      }
      @media (max-width: 520px){
        .kpis{ grid-template-columns: 1fr 1fr; }
      }
      @media (max-width: 380px){
        .kpis{ grid-template-columns: 1fr; }
      }
    </style>

    <div class="container">
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

  fetch(`${apiBase}/api/cards?url=${encodeURIComponent(window.location.href)}`)
    .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
    .then(({ ok, j }) => {
      if (!ok) throw new Error(j?.error || "API error");

      const label = (j?.energyLabel?.label || "").toUpperCase() || null;
      setEnergyLabelPill(label);

      const cards = j?.cards?.cards || [];
      const disclaimer = j?.cards?.disclaimer || "";

      body.innerHTML = `
        <div class="grid">
          ${cards.map((c) => renderCard(c)).join("")}
        </div>
      `;

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
    // Simple A–G scale
    const map = {
      A: "#1aa058",
      B: "#53b83a",
      C: "#b7c900",
      D: "#f1b600",
      E: "#f08a00",
      F: "#e85b3a",
      G: "#d93025"
    };
    return map[label] || "#9aa0a6";
  }

  function renderCard(c) {
    const title = escapeHtml(c.title || "Maatregel");
    const bullets = Array.isArray(c.bullets) ? c.bullets.slice(0, 3) : [];
    const investment = formatMoneyLine(c.indicative_cost, "€—");
    const savingMonthly = normalizeMonthlySaving(c.indicative_saving);
    const uplift = formatMoneyLine(c.indicative_value_uplift, "");

    const icon = iconSvgForTitle(c.title || "");

    return `
      <div class="card">
        <div class="cardTop">
          <div class="iconWrap" aria-hidden="true">${icon}</div>
          <h3>${title}</h3>
        </div>

        <ul class="bullets">
          ${bullets.map((b) => `<li>${escapeHtml(shorten(b, 90))}</li>`).join("")}
        </ul>

        <div class="kpis">
          <div class="kpi">
            <div class="kpiLabel">${miniIcon("€")} Investering</div>
            <div class="kpiValue">${escapeHtml(investment)}</div>
          </div>
          <div class="kpi">
            <div class="kpiLabel">${miniIcon("↘")} Besparing p/m</div>
            <div class="kpiValue">${escapeHtml(savingMonthly || "—")}</div>
          </div>
          <div class="kpi">
            <div class="kpiLabel">${miniIcon("▲")} Waardestijging</div>
            <div class="kpiValue">${escapeHtml(uplift || "—")}</div>
          </div>
        </div>
      </div>
    `;
  }

  function miniIcon(ch) {
    return `<span style="display:inline-flex; width:16px; height:16px; align-items:center; justify-content:center; border-radius:6px; background:rgba(0,0,0,.05); border:1px solid rgba(0,0,0,.06); font-size:11px; font-weight:900;">${escapeHtml(ch)}</span>`;
  }

  function formatMoneyLine(s, fallback) {
    const v = String(s ?? "").trim();
    if (!v) return fallback;
    return v;
  }

  // If model still returns /jaar, convert best-effort to /mnd
  function normalizeMonthlySaving(s) {
    const v = String(s ?? "").trim();
    if (!v) return "";

    const lower = v.toLowerCase();
    if (lower.includes("/m") || lower.includes("p/m") || lower.includes("per maand") || lower.includes("maand")) {
      return v;
    }

    // Try: "€200–€600/jaar" or "€200 - €600 per jaar"
    if (lower.includes("jaar")) {
      const nums = extractEuroNumbers(v);
      if (nums.length === 2) {
        const a = Math.round(nums[0] / 12);
        const b = Math.round(nums[1] / 12);
        return `€${a}–€${b}`;
      }
      if (nums.length === 1) {
        const a = Math.round(nums[0] / 12);
        return `€${a}`;
      }
    }

    return v;
  }

  function extractEuroNumbers(text) {
    // find things like 1.200 or 1200 or 1,200
    const matches = [...String(text).matchAll(/(\d[\d\.\,]*)/g)].map((m) => m[1]);
    const nums = matches
      .map((raw) => Number(raw.replace(/\./g, "").replace(/,/g, ".")))
      .filter((n) => Number.isFinite(n) && n > 0);
    // Keep first 2 meaningful
    return nums.slice(0, 2);
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
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        xmlns="http://www.w3.org/2000/svg" style="color: var(--hlw-heading);">
        <path d="${pathD}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  function svgLeaf() {
    return svgBase("M20 4c-6 1-10 5-11 11 6-1 10-5 11-11ZM9 15c-2 0-5 1-6 5 4-1 6-3 6-5Z");
  }
  function svgSolar() {
    return svgBase("M4 6h16M7 10h10M6 14h12M8 18h8M6 6l3 12M18 6l-3 12");
  }
  function svgHeatPump() {
    return svgBase("M6 7h12v10H6V7Zm3 2v6m6-6v6M9 12h6");
  }
  function svgWindow() {
    return svgBase("M6 4h12v16H6V4Zm6 0v16M6 12h12");
  }
  function svgSeal() {
    return svgBase("M4 12h8m0 0 4-6m-4 6 4 6m4-6h-2");
  }
  function svgInsulation() {
    return svgBase("M4 12l4-4 4 4 4-4 4 4-4 4-4-4-4 4-4-4Z");
  }

  function shorten(s, max) {
    const str = String(s ?? "").trim();
    if (str.length <= max) return str;
    return str.slice(0, max - 1).trim() + "…";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
