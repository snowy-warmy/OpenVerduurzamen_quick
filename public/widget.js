(function () {
  const script = document.currentScript;
  const apiBase = script?.getAttribute("data-api-base") || new URL(script.src).origin;
  const targetSelector = script?.getAttribute("data-target") || "#huislijn-duurzaamheid-widget";

  // Demo/testing overrides
  const overrideUrl = script?.getAttribute("data-url");
  const debugMode = script?.getAttribute("data-debug") === "1";

  // Optional logo shown next to title
  const logoUrl = script?.getAttribute("data-logo") || "";

  let host = document.querySelector(targetSelector);
  if (!host) {
    host = document.createElement("div");
    host.id = targetSelector.startsWith("#") ? targetSelector.slice(1) : "huislijn-duurzaamheid-widget";
    document.body.appendChild(host);
  }

  // Best-effort match host typography/colors
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
        padding: 14px;
        box-sizing: border-box;
      }

      .header{
        display:flex;
        justify-content: space-between;
        align-items:flex-start;
        gap: 12px;
        margin-bottom: 12px;
      }

      .titleRow{
        display:flex;
        align-items:center;
        gap: 8px;
      }

      .logo{
        width: 30px;
        height: 30px;
        border-radius: 4px;
        object-fit: contain;
        display: inline-block;
      }

      .title{
        margin: 0;
        font-size: 16px;
        font-weight: 700; /* lichter */
        line-height: 1.2;
      }

      .subtitle{
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--hlw-muted);
        line-height: 1.3;
        font-weight: 500;
      }

      .pillRow{
        display:flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content:flex-end;
      }

      .pill{
        display:inline-flex;
        align-items:center;
        gap: 8px;
        padding: 7px 10px;
        border-radius: 999px;
        border: 1px solid rgba(0,0,0,.12);
        background: rgba(0,0,0,.03);
        font-size: 12px;
        font-weight: 600; /* lichter */
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
        gap: 12px;
      }

      .card{
        border: 1px solid rgba(0,0,0,.10);
        border-radius: var(--hlw-card-radius);
        background: #fff;
        padding: 12px;
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
        width: 34px;
        height: 34px;
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
        font-size: 14px;
        font-weight: 650; /* lichter */
        line-height: 1.2;
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
        font-weight: 600; /* lichter */
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
        font-size: 12px;
        line-height: 1.35;
        font-weight: 500;
      }
      .bullets li{ margin: 5px 0; }

      /* KPI column pinned bottom (STACKED label + value) */
      .kpis{
        margin-top: auto;
        display:flex;
        flex-direction: column;
        gap: 8px;
        padding-top: 10px;
        border-top: 1px solid rgba(0,0,0,.08);
      }

      .kpi{
        border: 1px solid rgba(0,0,0,.10);
        background: rgba(0,0,0,.02);
        border-radius: 12px;
        padding: 8px 10px;
      }

      .kpiHead{
        display:flex;
        align-items:center;
        gap: 8px;
        margin-bottom: 4px;
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
        font-weight: 700;
        color: rgba(0,0,0,.65);
        flex: 0 0 auto;
      }

      .kpiLabel{
        font-size: 12px;
        color: rgba(0,0,0,.60);
        font-weight: 600; /* lichter */
      }

      .kpiValue{
        font-size: 13px;
        font-weight: 600; /* NIET bold */
        font-variant-numeric: tabular-nums;
        line-height: 1.2;

        /* wrap alleen op dash */
        word-break: normal;
      }

      .footer{
        margin-top: 10px;
        font-size: 12px;
        color: rgba(0,0,0,.55);
        line-height: 1.35;
        font-weight: 500;
      }

      .footer a{
        color: var(--hlw-accent);
        text-decoration: none;
        font-weight: 600;
      }
      .footer a:hover{ text-decoration: underline; }

      .loadingRow{
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .skeleton{
        height: 200px;
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
        font-size: 12px;
        color: #b00020;
        padding: 6px 0;
        font-weight: 600;
      }

      @media (max-width: 900px){
        .grid{ grid-template-columns: 1fr; }
        .loadingRow{ grid-template-columns: 1fr; }
      }
    </style>

    <div class="container" lang="nl">
      <div class="header">
        <div>
          <div class="titleRow">
            ${logoUrl ? `<img id="hlw-logo" class="logo" alt="" decoding="async" loading="lazy" referrerpolicy="no-referrer" src="${escapeAttr(logoUrl)}" />` : ``}
            <h2 class="title">Verduurzamingsadvies</h2>
          </div>
          <div class="subtitle">3 maatregelen die het meeste opleveren voor comfort, kosten en waarde.</div>
        </div>

        <div class="pillRow">
          <div class="pill" id="hlw-pill-energy">
            <span class="dot" id="hlw-dot"></span>
            <span id="hlw-pill-text">Energielabel: …</span>
          </div>
          <div class="pill" id="hlw-pill-year" style="display:none;">
            <span style="font-weight:700;">🏗️</span>
            <span id="hlw-year-text">Bouwjaar: …</span>
          </div>
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

  // Logo fallback (if browser blocks first src for any reason)
  const logoEl = shadow.getElementById("hlw-logo");
  if (logoEl) {
    const fallbacks = [
      logoUrl,
      `${apiBase}/OpenVerduurzamenlogo.jpg`,
      `${apiBase}/public/OpenVerduurzamenlogo.jpg`
    ].filter(Boolean);

    let i = 0;
    logoEl.addEventListener("error", () => {
      i += 1;
      if (i < fallbacks.length) logoEl.src = fallbacks[i];
    });
  }

  const pillText = shadow.getElementById("hlw-pill-text");
  const dot = shadow.getElementById("hlw-dot");

  const yearPill = shadow.getElementById("hlw-pill-year");
  const yearText = shadow.getElementById("hlw-year-text");

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

      const bouwjaar = j?.energyLabel?.building?.bouwjaar ?? null;
      setYearPill(bouwjaar);

      const cards = j?.cards?.cards || [];
      const disclaimer = j?.cards?.disclaimer || "";

      body.innerHTML = `<div class="grid">${cards.map((c) => renderCard(c, label)).join("")}</div>`;

      footer.style.display = "block";
      footer.innerHTML =
        `${escapeHtml(disclaimer || "Indicaties zijn bandbreedtes en afhankelijk van woning en uitvoering.")}<br/>` +
        `Begeleiding en uitvoer via <a href="https://www.woonwijzerwinkel.nl" target="_blank" rel="noopener noreferrer">WoonWijzerWinkel</a>.`;
    })
    .catch((e) => {
      setEnergyLabelPill(null);
      setYearPill(null);
      body.innerHTML = `<div class="error">Kon verduurzamingsadvies niet laden. (${escapeHtml(String(e.message || e))})</div>`;
      footer.style.display = "block";
      footer.innerHTML =
        `Begeleiding en uitvoer via <a href="https://www.woonwijzerwinkel.nl" target="_blank" rel="noopener noreferrer">WoonWijzerWinkel</a>.`;
    });

  function setYearPill(year) {
    if (!year) {
      yearPill.style.display = "none";
      return;
    }
    yearPill.style.display = "inline-flex";
    yearText.textContent = `Bouwjaar: ${year}`;
  }

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
    const bulletsShort = bullets.map((b) => shortenWords(b, 5));

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
          ${renderKpi("€", "Investering", investment)}
          ${renderKpi("↘", "Besparing p/m", saving)}
          ${renderKpi("▲", "Waardestijging", uplift)}
        </div>
      </div>
    `;
  }

  function renderKpi(icon, label, value) {
    const v = (value || "—").toString().trim() || "—";
    return `
      <div class="kpi">
        <div class="kpiHead">
          <span class="kpiIcon">${escapeHtml(icon)}</span>
          <span class="kpiLabel">${escapeHtml(label)}</span>
        </div>
        <div class="kpiValue" title="${escapeHtml(v)}">${formatValue(v)}</div>
      </div>
    `;
  }

  function formatValue(text) {
    const safe = escapeHtml(String(text ?? "").trim() || "—");
    return safe.replaceAll("–", "–<wbr>").replaceAll("-", "-<wbr>");
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
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        xmlns="http://www.w3.org/2000/svg" style="color: rgba(0,0,0,.78);">
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

  function escapeAttr(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
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
