exports.handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: "RESEND_API_KEY manquant sur le serveur" }) }; const esc = function (v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }; const nfQty = function (v) { return (Number(v) || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 }); }; const nfEur = function (v) { return (Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR"; }; const dfr = function (v) { if (!v) return "—"; const d = new Date(v); return isNaN(d.getTime()) ? esc(v) : d.toLocaleDateString("fr-FR"); }; const MAX_ROWS_MAIL = 500; const buildCommandesTable = function (commandes) { if (!Array.isArray(commandes) || !commandes.length) { return "<p style=\"color:#6b6860\">Aucune commande Inpulse trouvee sur la periode de l'engagement.</p>"; } const rows = commandes.slice(0, MAX_ROWS_MAIL); const tronque = commandes.length > rows.length; const thBase = "padding:6px 8px;border-bottom:1px solid #d4cfc5;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b6860;white-space:nowrap"; const th = thBase + ";text-align:left"; const thNum = thBase + ";text-align:right"; const tdBase = "padding:5px 8px;border-bottom:1px solid #f0ede6;font-size:12px;color:#1a1a18"; const td = tdBase + ";white-space:nowrap"; const tdNum = td + ";text-align:right"; const tdWrap = tdBase + ";white-space:normal"; const tf = "padding:6px 8px;border-top:2px solid #d4cfc5;font-size:12px;font-weight:700;color:#1a1a18"; const tfNum = tf + ";text-align:right"; let tQteCmd = 0, tQteRecue = 0, tMtCmd = 0, tMtRecu = 0; commandes.forEach(function (c) { tQteCmd += Number(c.qteCmd) || 0; tQteRecue += Number(c.qteRecue) || 0; tMtCmd += Number(c.montantCmd) || 0; tMtRecu += Number(c.montantRecu) || 0; }); const body = rows.map(function (c) { return "<tr>" + "<td style=\"" + td + "\">" + dfr(c.date) + "</td>" + "<td style=\"" + td + "\">" + esc(c.reference || "—") + "</td>" + "<td style=\"" + td + "\">" + esc(c.site || "—") + "</td>" + "<td style=\"" + td + "\">" + esc(c.fournisseur || "—") + "</td>" + "<td style=\"" + tdWrap + "\">" + esc(c.ref || "—") + "</td>" + "<td style=\"" + td + "\">" + esc(c.statut || "—") + "</td>" + "<td style=\"" + tdNum + "\">" + nfQty(c.qteCmd) + "</td>" + "<td style=\"" + tdNum + "\">" + nfQty(c.qteRecue) + "</td>" + "<td style=\"" + tdNum + "\">" + nfEur(c.montantCmd) + "</td>" + "<td style=\"" + tdNum + "\">" + nfEur(c.montantRecu) + "</td>" + "</tr>"; }).join(""); return "<table cellspacing=\"0\" cellpadding=\"0\" style=\"border-collapse:collapse;width:100%;font-family:Arial,sans-serif;border:1px solid #e4e0d8\">" + "<thead><tr style=\"background:#f2f0eb\">" + "<th style=\"" + th + "\">Date reception</th>" + "<th style=\"" + th + "\">N° commande</th>" + "<th style=\"" + th + "\">Site</th>" + "<th style=\"" + th + "\">Fournisseur</th>" + "<th style=\"" + th + "\">Reference</th>" + "<th style=\"" + th + "\">Statut</th>" + "<th style=\"" + thNum + "\">Qte commandee</th>" + "<th style=\"" + thNum + "\">Qte recue</th>" + "<th style=\"" + thNum + "\">Montant HT commande</th>" + "<th style=\"" + thNum + "\">Montant HT recu</th>" + "</tr></thead><tbody>" + body + "</tbody>" + "<tfoot><tr style=\"background:#faf6ee\">" + "<td style=\"" + tf + "\">TOTAL</td>" + "<td style=\"" + tf + "\" colspan=\"5\">" + commandes.length + " commande(s)</td>" + "<td style=\"" + tfNum + "\">" + nfQty(tQteCmd) + "</td>" + "<td style=\"" + tfNum + "\">" + nfQty(tQteRecue) + "</td>" + "<td style=\"" + tfNum + "\">" + nfEur(tMtCmd) + "</td>" + "<td style=\"" + tfNum + "\">" + nfEur(tMtRecu) + "</td>" + "</tr></tfoot></table>" + (tronque ? "<p style=\"color:#6b6860;font-size:12px\">Seules les " + rows.length + " premieres commandes sont listees (" + commandes.length + " au total).</p>" : ""); };

  try {
    const parsed = JSON.parse(event.body || "{}");
    const to = Array.isArray(parsed.to) ? parsed.to.filter(Boolean) : (parsed.to ? [parsed.to] : []);
    if (!to.length) return { statusCode: 400, headers, body: JSON.stringify({ error: "Aucun destinataire" }) };

    const e = parsed.engagement || {};
    const pct = Math.round((parsed.pct || 0) * 100);
    const isTest = !!parsed.test;
    const isComplete = !!parsed.complete; const nom = e.matiere || e.fournisseur || "Engagement"; const subject = (isTest ? "[TEST] " : "") + (isComplete ? ("Engagement solde a 100% - " + nom) : ("Alerte engagement " + pct + "% - " + nom)); const titre = isComplete ? "Engagement solde a 100%" : ("Seuil de " + pct + "% atteint"); const intro = isComplete ? "<p>La quantite livree atteint ou depasse la quantite engagee : le contrat est solde a " + pct + "%.</p>" : ""; const infos = "<p><b>Fournisseur :</b> " + esc(e.fournisseur || "—") + "</p>" + "<p><b>Matiere / reference :</b> " + esc(e.matiere || "—") + (e.reference ? " (" + esc(e.reference) + ")" : "") + "</p>" + "<p><b>N° contrat :</b> " + esc(e.numContrat || "—") + "</p>" + "<p><b>Periode :</b> " + esc(e.dateDebut || "—") + " au " + esc(e.dateFin || "—") + "</p>" + "<p><b>Quantite engagee :</b> " + nfQty(e.qteEngagee) + " kg</p>" + "<p><b>Quantite livree :</b> " + nfQty(e.qteLivree) + " kg (" + pct + "%)</p>"; const detail = isComplete ? "<h3 style=\"color:#a8893e;margin-top:22px\">Detail des commandes de la periode</h3>" + buildCommandesTable(parsed.commandes) : "";

    const html = "<div style=\"font-family:Arial,sans-serif;font-size:14px;color:#1a1a18\">" +
      "<h2 style=\"color:#a8893e\">" + titre + "</h2>" +
      (isTest ? "<p style=\"color:#d97706\">Ceci est un e-mail de test envoye manuellement depuis la page Engagements.</p>" : "") +
      intro + infos + detail +
      
      
      
      
      
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
