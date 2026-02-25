import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  // Rediriger vers la page des jeux par défaut
  throw redirect(302, '/admin/games');
};
