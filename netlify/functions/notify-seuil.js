exports.handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: "RESEND_API_KEY manquant sur le serveur" }) };

  try {
    const parsed = JSON.parse(event.body || "{}");
    const to = Array.isArray(parsed.to) ? parsed.to.filter(Boolean) : (parsed.to ? [parsed.to] : []);
    if (!to.length) return { statusCode: 400, headers, body: JSON.stringify({ error: "Aucun destinataire" }) };

    const e = parsed.engagement || {};
    const pct = Math.round((parsed.pct || 0) * 100);
    const isTest = !!parsed.test;
    const subject = (isTest ? "[TEST] " : "") + "Alerte engagement " + pct + "% - " + (e.matiere || e.fournisseur || "Engagement");

    const html = "<div style=\"font-family:Arial,sans-serif;font-size:14px;color:#1a1a18\">" +
      "<h2 style=\"color:#a8893e\">Seuil de " + pct + "% atteint</h2>" +
      (isTest ? "<p style=\"color:#d97706\">Ceci est un e-mail de test envoye manuellement depuis la page Engagements.</p>" : "") +
      "<p><b>Fournisseur :</b> " + (e.fournisseur || "—") + "</p>" +
      "<p><b>Matiere / reference :</b> " + (e.matiere || "—") + (e.reference ? " (" + e.reference + ")" : "") + "</p>" +
      "<p><b>N° contrat :</b> " + (e.numContrat || "—") + "</p>" +
      "<p><b>Periode :</b> " + (e.dateDebut || "—") + " au " + (e.dateFin || "—") + "</p>" +
      "<p><b>Quantite engagee :</b> " + (e.qteEngagee || 0) + " kg</p>" +
      "<p><b>Quantite livree :</b> " + (e.qteLivree || 0) + " kg (" + pct + "%)</p>" +
      "</div>";

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "TFB Achats <onboarding@resend.dev>", to: to, subject: subject, html: html })
    });
    const j = await r.json().catch(function () { return {}; });
    if (!r.ok) return { statusCode: r.status, headers, body: JSON.stringify({ error: (j && (j.message || j.error)) || "Echec envoi Resend" }) };
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: j.id || null }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String((err && err.message) || err) }) };
  }
};
