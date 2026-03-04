const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderCards(payload) {
  const cardsWrap = $("cards");
  const cards = payload?.cards?.cards || [];
  const disclaimer = payload?.cards?.disclaimer || "";
  const label = payload?.energyLabel?.label;

  let html = "";
  html += `<div style="margin-bottom:10px;">Energielabel: <span class="pill">${escapeHtml(label || "onbekend")}</span></div>`;

  if (!cards.length) {
    html += `<div class="bad">Geen kaartjes ontvangen.</div>`;
  } else {
    html += `<div style="display:grid; gap:12px;">`;
    html += cards.map((c) => {
      const meta = [];
      if (c.indicative_cost) meta.push(`Kosten: ${c.indicative_cost}`);
      if (c.indicative_saving) meta.push(`Besparing: ${c.indicative_saving}`);

      return `
        <div style="border:1px solid rgba(0,0,0,.12); border-radius:12px; padding:12px;">
          <div style="font-weight:800;">${escapeHtml(c.title)}</div>
          <div style="color:rgba(0,0,0,.7); margin:6px 0 8px;">${escapeHtml(c.subtitle)}</div>
          <ul style="margin:0 0 10px; padding-left:18px;">
            ${(c.bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("")}
          </ul>
          ${meta.length ? `<div style="color:rgba(0,0,0,.65); font-size:12px;">${meta.map(escapeHtml).join(" • ")}</div>` : ""}
          <div style="margin-top:8px; font-weight:800; font-size:12px;">${escapeHtml(c.cta || "")}</div>
        </div>
      `;
    }).join("");
    html += `</div>`;
  }

  if (disclaimer) {
    html += `<div style="margin-top:10px; color:rgba(0,0,0,.65); font-size:12px;">${escapeHtml(disclaimer)}</div>`;
  }

  cardsWrap.innerHTML = html;
}

async function run() {
  const url = $("url").value.trim();
  $("status").textContent = "Laden…";
  $("status").className = "";

  try {
    const r = await fetch(`/api/cards?url=${encodeURIComponent(url)}`);
    const j = await r.json();

    $("raw").textContent = JSON.stringify(j, null, 2);

    if (!r.ok) {
      $("status").textContent = `Fout: ${j?.error || r.statusText}`;
      $("status").className = "bad";
      $("cards").innerHTML = "";
      return;
    }

    $("status").textContent = "OK";
    $("status").className = "ok";

    renderCards(j);
  } catch (e) {
    $("status").textContent = `Fout: ${String(e.message || e)}`;
    $("status").className = "bad";
  }
}

$("run").addEventListener("click", run);
$("example").addEventListener("click", () => {
  $("url").value = "https://www.huislijn.nl/koopwoning/nederland/noord-holland/4350417/vogelzand-4202b-julianadorp";
});
