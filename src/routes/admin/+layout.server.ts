import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ cookies, url }) => {
  const isAuthenticated = cookies.get('admin_auth') === 'true';

  // Si non authentifié et pas sur la page login, rediriger vers login
  if (!isAuthenticated && !url.pathname.startsWith('/admin/login')) {
    throw redirect(302, '/admin/login');
  }

  // Si authentifié et sur la page login, rediriger vers games
  if (isAuthenticated && url.pathname === '/admin/login') {
    throw redirect(302, '/admin/games');
  }

  return {
    isAuthenticated,
  };
};
