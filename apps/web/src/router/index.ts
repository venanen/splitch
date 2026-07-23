import { createRouter, createWebHistory } from 'vue-router';
import { getLastTripSlug, getSessionToken } from '@/api/client';
import HomeView from '../views/HomeView.vue';
import TripView from '../views/TripView.vue';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/t/:slug', name: 'trip', component: TripView, props: (r) => ({ slug: r.params.slug as string }) },
  ],
});

/**
 * Установленное PWA всегда стартует с start_url=/ .
 * Если есть сессия и slug последней комнаты — сразу возвращаем туда.
 */
router.beforeEach((to) => {
  if (to.name !== 'home') return true;
  const token = getSessionToken();
  const slug = getLastTripSlug();
  if (token && slug) {
    return { name: 'trip', params: { slug } };
  }
  return true;
});
