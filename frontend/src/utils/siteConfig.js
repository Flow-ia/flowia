// siteConfig.js — valeurs deploiement-dependantes centralisees.
//
// Avant : `https://commercant.flowiapro.com`, `contact@flowiapro.com` et le
// Google Client ID etaient ecrits en dur et DUPLIQUES dans ~12 fichiers du
// site (booking + marketing). Toute bascule de domaine/email imposait un
// chercher-remplacer fragile.
//
// Desormais : surchargeable par variables d'environnement Vite
// (VITE_COMMERCANT_URL, VITE_CONTACT_EMAIL, VITE_GOOGLE_CLIENT_ID). Le
// littéral reste comme valeur de repli pour ne jamais casser la prod si une
// variable n'est pas definie sur l'environnement cible.

const env = import.meta.env || {};

export const COMMERCANT_URL =
  env.VITE_COMMERCANT_URL || 'https://commercant.flowiapro.com';

export const CONTACT_EMAIL =
  env.VITE_CONTACT_EMAIL || 'contact@flowiapro.com';

export const GOOGLE_CLIENT_ID =
  env.VITE_GOOGLE_CLIENT_ID ||
  '376153951158-jm80phb46sl1fisbgeq587v83ho7ft5e.apps.googleusercontent.com';
