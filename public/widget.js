(function () {
  const script = document.currentScript;
  const apiBase = script?.getAttribute("data-api-base") || new URL(script.src).origin;
  const targetSelector = script?.getAttribute("data-target") || "#huislijn-duurzaamheid-widget";

  let host = document.querySelector(targetSelector);
  if (!host) {
    host = document.createElement("div");
    host.id = targetSelector.startsWith("#") ? targetSelector.slice(1) : "huislijn-duurzaamheid-widget";
    // Plaats hem “onderaan” als fallback; jullie kunnen dit vervangen door de juiste DOM-locatie.
    document.body.appendChild(host);
  }

  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
      .title { font-size: 18px; font-weight: 700; margin: 0 0 10px; }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
      .card { border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 12px; background: #fff; }
      .card h3 { margin: 0 0 6px; font-size: 14px; font-weight: 700; }
      .card p { margin: 0 0 8px; font-size: 13px; color: rgba(0,0,0,.7); }
      .card ul { margin: 0 0 10px; padding-left: 18px; font-size: 13px; }
      .meta { display:flex; gap:10px; flex-wrap: wrap; font-size: 12px; color: rgba(0,0,0,.65); margin-top: 8px; }
      .cta { display:inline-block; margin-top: 8px; font-size: 12px; font-weight: 700; text-decoration: none; }
      .bar { display:flex; justify-content: space-between; align-items:center; gap:12px; margin-bottom: 10px; }
      .pill { font-size: 12px; padding: 4px 8px; border-radius: 999px; background: rgba(0,0,0,.06); }
      .loading { font-size: 13px; color: rgba(0,0,0,.7); padding: 8px 0; }
      .error { font-size: 13px; color: #b00020; padding: 8px 0; }
      @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
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

  fetch(`${apiBase}/api/cards?url=${encodeURIComponent(window.location.href)}`)
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

              return `
                <div class="card">
                  <h3>${escapeHtml(c.title)}</h3>
                  <p>${escapeHtml(c.subtitle)}</p>
                  <ul>
                    ${c.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
                  </ul>
                  ${meta.length ? `<div class="meta">${meta.map((m) => `<span>${escapeHtml(m)}</span>`).join("")}</div>` : ""}
                  <a class="cta" href="#" onclick="return false;">${escapeHtml(c.cta)}</a>
                </div>
              `;
            })
            .join("")}
        </div>
        ${disclaimer ? `<div class="meta" style="margin-top:10px;">${escapeHtml(disclaimer)}</div>` : ""}
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
