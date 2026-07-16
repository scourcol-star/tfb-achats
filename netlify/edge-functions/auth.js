export default async (request, context) => {
  const USER = Netlify.env.get("BASIC_AUTH_USER") || "";
  const PASS = Netlify.env.get("BASIC_AUTH_PASSWORD") || "";
  if (!USER || !PASS) {
    return new Response("Authentification non configuree", { status: 503 });
  }
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/tfb_session=([a-f0-9]+)/);
  const expected = await sign(USER + ":" + PASS);
  if (match && match[1] === expected) {
    return context.next();
  }
  const header = request.headers.get("authorization") || "";
  const parts = header.split(" ");
  const scheme = parts[0];
  const encoded = parts[1];
  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try { decoded = atob(encoded); } catch (e) { decoded = ""; }
    const sep = decoded.indexOf(":");
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (user === USER && pass === PASS) {
      const response = await context.next();
      const newHeaders = new Headers(response.headers);
      newHeaders.append("Set-Cookie", "tfb_session=" + expected + "; Max-Age=86400; Path=/; HttpOnly; Secure; SameSite=Lax");
      return new Response(response.body, { status: response.status, headers: newHeaders });
    }
  }
  return new Response("Authentification requise", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="TFB Achats", charset="UTF-8"' }
  });
};

async function sign(str) {
  const enc = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export const config = { path: "/*" };
