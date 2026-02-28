import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const baseUrl = url.origin;

  const robots = `# Robots.txt pour Reglomatic

# Autoriser tous les robots pour les pages publiques
User-agent: *
Allow: /
Allow: /import

# Bloquer l'accès à l'administration
Disallow: /admin/
Disallow: /admin

# Bloquer l'accès aux fichiers uploadés (contenu sensible)
Disallow: /files/

# Sitemap
Sitemap: ${baseUrl}/sitemap.xml
`;

  return new Response(robots, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'max-age=86400, public',
    },
  });
};
