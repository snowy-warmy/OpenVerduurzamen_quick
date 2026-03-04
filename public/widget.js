(function () {
  const script = document.currentScript;
  const apiBase = script?.getAttribute("data-api-base") || new URL(script.src).origin;
  const targetSelector = script?.getAttribute("data-target") || "#huislijn-duurzaamheid-widget";

  // 1) Host element
  let host = document.querySelector(targetSelector);
  if (!host) {
    host = document.createElement("div");
    host.id = targetSelector.startsWith("#") ? targetSelector.slice(1) : "huislijn-duurzaamheid-widget";
    document.body.appendChild(host);
  }

  // 2) Read Huislijn page styling (font/colors) so widget matches the site
  try {
    const bodyStyle = getComputedStyle(document.body);
    const linkEl = document.querySelector("a");
    const linkColor = linkEl ? getComputedStyle(linkEl).color : "#0b5fff";

    host.style.setProperty("--hlw-font", bodyStyle.fontFamily || "system-ui, -apple-system, Segoe UI, Roboto, Arial");
    host.style.setProperty("--hlw-text", bodyStyle.color || "#111");
    host.style.setProperty("--hlw-bg", bodyStyle.backgroundColor || "#fff");
    host.style.setProperty("--hlw-accent", linkColor);
  } catch {
    // fallback values already in CSS below
  }

  // 3) Shadow DOM for isolation, but uses host tokens
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host {
        --hlw-font: system-ui, -apple-system, Segoe UI, Roboto, Arial;
        --hlw-text: #111;
        --hlw-bg: #fff;
        --hlw-accent: #0b5fff;

        --hlw-border: rgba(0,0,0,.10);
        --hlw-muted: rgba(0,0,0,.65);
        --hlw-soft: rgba(0,0,0,.04);
        --hlw-radius: 12px;

        display: block;
        color: var(--hlw-text);
        font-family: var(--hlw-font);
      }

      .wrap {
        background: transparent;
      }

      .bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }

      .title {
        margin: 0;
        font-size: 18px;
        font-weight: 800;
        line-height: 1.2;
      }

      .pill {
        font-size: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        background: var(--hlw-soft);
        color: var(--hlw-muted);
        border: 1px solid var(--hlw-border);
        white-space: nowrap;
      }

      /* 3 cards left -> right */
      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .card {
        background: #fff;
        border: 1px solid var(--hlw-border);
        border-radius: var(--hlw-radius);
        padding: 14px;
        box-shadow: 0 1px 2px rgba(0,0,0,.05);
        min-width: 0;
      }

      .card h3 {
        margin: 0 0 6px;
        font-size: 14px;
        font-weight: 800;
        line-height: 1.25;
      }

      .card p {
        margin: 0 0 10px;
        font-size: 13px;
        color: var(--hlw-muted);
        line-height: 1.35;
      }

      .card ul {
        margin: 0 0 10px;
        padding-left: 18px;
        font-size: 13px;
        line-height: 1.35;
      }

      .meta {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        font-size: 12px;
        color: var(--hlw-muted);
        margin-top: 8px;
      }

      .cta {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
        font-size: 12px;
        font-weight: 800;
        text-decoration: none;
        color: var(--hlw-accent);
        cursor: pointer;
      }

      .cta:hover {
        text-decoration: underline;
      }

      .loading {
        font-size: 13px;
        color: var(--hlw-muted);
        padding: 6px 0;
      }

      .error {
        font-size: 13px;
        color: #b00020;
        padding: 6px 0;
      }

      /* Mobile: stack (desktop blijft altijd 3 naast elkaar) */
      @media (max-width: 900px) {
        .grid { grid-template-columns: 1fr; }
      }
    </style>

    <div class="wrap">
      <div class="bar">
        <h2 class="title">Verduurzaming</h2>
        <span class="pill" id="hlw-pill">Bezig met laden…</span>
      </div>
      <div id="hlw-body" class="loading">Tips worden opgehaald…</div>
    </div>
  `;

  const pill = shadow.getElementById("hlw-pill");
  const body = shadow.getElementById("hlw-body");

  const pageUrl = script?.getAttribute("data-url") || window.location.href;
  fetch(`${apiBase}/api/cards?url=${encodeURIComponent(pageUrl)}`)
    .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
    .then(({ ok, j }) => {
      if (!ok) throw new Error(j?.error || "API error");

      const label = j?.energyLabel?.label;
      pill.textContent = label ? `Energielabel: ${label}` : "Energielabel: onbekend";

      const cards = j?.cards?.cards || [];
      const disclaimer = j?.cards?.disclaimer || "";

      body.className = "";
      body.innerHTML = `
        <div class="grid">
          ${cards
            .map((c) => {
              const meta = [];
              if (c.indicative_cost) meta.push(`Kosten: ${c.indicative_cost}`);
              if (c.indicative_saving) meta.push(`Besparing: ${c.indicative_saving}`);
              if (c.indicative_value_uplift) meta.push(`Waarde: ${c.indicative_value_uplift}`);

              return `
                <div class="card">
                  <h3>${escapeHtml(c.title)}</h3>
                  <p>${escapeHtml(c.subtitle)}</p>
                  <ul>
                    ${(c.bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
                  </ul>
                  ${meta.length ? `<div class="meta">${meta.map((m) => `<span>${escapeHtml(m)}</span>`).join("")}</div>` : ""}
                  <a class="cta" href="#" onclick="return false;">${escapeHtml(c.cta || "Bekijk opties")}</a>
                </div>
              `;
            })
            .join("")}
        </div>
        ${disclaimer ? `<div class="meta" style="margin-top:12px;">${escapeHtml(disclaimer)}</div>` : ""}
      `;
    })
    .catch((e) => {
      pill.textContent = "Niet beschikbaar";
      body.className = "error";
      body.textContent = `Kon verduurzamingstips niet laden. (${String(e.message || e)})`;
    });

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
