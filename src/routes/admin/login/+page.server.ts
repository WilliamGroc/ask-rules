import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';

const ADMIN_PASSWORD = process.env['ADMIN_PASSWORD'] || 'admin';

export const load: PageServerLoad = async () => {
  return {};
};

export const actions = {
  login: async ({ request, cookies }) => {
    const formData = await request.formData();
    const password = formData.get('password') as string;

    if (!password) {
      return fail(400, { error: 'Mot de passe requis' });
    }

    if (password !== ADMIN_PASSWORD) {
      return fail(401, { error: 'Mot de passe incorrect' });
    }

    // Définir le cookie de session (expire dans 24h)
    cookies.set('admin_auth', 'true', {
      path: '/',
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 heures
    });

    throw redirect(302, '/admin/games');
  },

  logout: async ({ cookies }) => {
    cookies.delete('admin_auth', { path: '/' });
    throw redirect(302, '/admin/login');
  },
} satisfies Actions;
