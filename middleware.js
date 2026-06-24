// middleware.js — à placer à la RACINE du repo (même niveau que /api et les .html)
// Protège toutes les routes (pages HTML ET /api/proxy) par un Basic Auth.
// Le mot de passe n'est PAS dans le code : il vient des variables d'environnement Vercel.

export const config = {
  // ':path*' = toutes les routes du site, y compris /api/proxy
  matcher: '/:path*',
};

export default function middleware(request) {
  const USER = process.env.BASIC_AUTH_USER || '';
  const PASS = process.env.BASIC_AUTH_PASSWORD || '';

  // Si les variables ne sont pas configurées, on bloque par sécurité.
  if (!USER || !PASS) {
    return new Response('Authentification non configurée', { status: 503 });
  }

  const header = request.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');

  if (scheme === 'Basic' && encoded) {
    let decoded = '';
    try {
      decoded = atob(encoded);
    } catch (e) {
      decoded = '';
    }
    const sep = decoded.indexOf(':');
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);

    if (user === USER && pass === PASS) {
      return; // identifiants corrects → la requête continue normalement
    }
  }

  // Pas d'identifiants ou identifiants faux → on demande l'authentification.
  return new Response('Authentification requise', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="TFB Achats", charset="UTF-8"',
    },
  });
}
