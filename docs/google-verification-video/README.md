# Vidéo de vérification Google OAuth — Assets

Ce dossier contient tous les assets nécessaires pour produire la vidéo de
soumission à Google Trust & Safety.

## Fichiers

- **`SCRIPT-DETAILLE.md`** — Script complet clic-par-clic, minute par minute
  avec actions, voix off et sous-titres synchronisés
- **`VOIX-OFF-EN.txt`** — Texte de la voix off uniquement (anglais), à copier
  dans ElevenLabs / Murf / TTSMaker pour générer une voix IA
- **`SOUS-TITRES.srt`** — Sous-titres anglais au format SRT, à importer dans
  CapCut / Premiere / DaVinci Resolve
- **`final.mp4`** *(à créer après tournage)* — La vidéo finale exportée

## Workflow recommandé (3 méthodes)

### Méthode 1 — Loom (le plus simple, ~30 min total)
1. Installe Loom (gratuit) : https://www.loom.com/download
2. Lance Loom Recorder, sélectionne "Screen + Camera off"
3. Lis le script `SCRIPT-DETAILLE.md` étape par étape pendant que tu enregistres
4. Récite la voix off de `VOIX-OFF-EN.txt` en parallèle (en anglais)
5. Stop → Loom génère un lien Unlisted automatiquement
6. Tu peux directement copier ce lien dans le formulaire Google ✅

### Méthode 2 — OBS + voix IA (qualité top, ~1h)
1. Installe OBS Studio + CapCut Desktop (gratuits)
2. Avec OBS : enregistre l'écran SANS son selon `SCRIPT-DETAILLE.md`
3. Avec ElevenLabs (ou alternative) : génère un MP3 à partir de `VOIX-OFF-EN.txt`
4. Dans CapCut :
   - Importe la vidéo + le MP3 voix off
   - Aligne les segments avec le timing du script
   - Importe `SOUS-TITRES.srt` pour les sous-titres burned-in
   - Export 1080p MP4 → save as `final.mp4`
5. Upload sur YouTube en **Unlisted** : https://studio.youtube.com

### Méthode 3 — Freelance Fiverr (~30-60€, 24h)
1. Va sur Fiverr ou Malt
2. Cherche "screencast software demo with voiceover"
3. Brief : envoie-leur ce dossier complet (zip)
4. Ils te livrent un MP4 prêt à upload

## Conseils techniques

- **Résolution** : 1920x1080 minimum (1440p OK aussi)
- **Format** : MP4 H.264, audio AAC 128kbps
- **Durée** : 1:30 à 2:00 strict — Google reviewers ne regardent pas plus
- **Curseur** : taille augmentée + clic visible (Loom le fait nativement, OBS via plugin "Cursor Highlight")
- **Voix** : anglais clair (accent OK, mais articulation propre)
- **Pas de musique** ou très discrète en arrière-plan

## Compte de test recommandé pour le tournage

Crée un compte Google **dédié** pour cette vidéo :
- Pas ton compte personnel (la vidéo sera revue par des humains chez Google)
- Email type : `flowia.verification.demo@gmail.com`
- Sera utilisé uniquement pour la démo
- Tu peux le supprimer après la vérification approuvée

## Upload YouTube

1. Connecte-toi sur https://studio.youtube.com (compte Google FlowIA officiel,
   ou compte ops dédié — pas le compte de test utilisé dans la vidéo)
2. **CRÉER → Importer une vidéo**
3. Drop `final.mp4`
4. Pendant l'upload, remplis :
   - **Titre** : `FlowIA — Google Calendar Integration Demo (OAuth Verification)`
   - **Description** : (copier-coller depuis `../GOOGLE-VERIFICATION-KIT.md` la
     version courte EN de la justification)
   - **Public** : Non (cette vidéo n'est pas pour les enfants)
   - **Visibilité** : **Non répertoriée** (Unlisted) — important !
5. Publier
6. Récupère l'URL `https://youtu.be/XXXXXXX` → tu la colleras dans le
   formulaire Google Trust & Safety

## Avant de soumettre — Checklist

- [ ] La vidéo est bien en **Unlisted** (vérifie en ouvrant l'URL en navigation privée)
- [ ] La vidéo joue bien sans login YouTube
- [ ] Le scope `calendar.events` est visible à l'écran au moment du consent OAuth
- [ ] La mention "Synced from FlowIA" est lisible dans Google Calendar
- [ ] Le flux disconnect est montré
- [ ] Durée < 2 minutes
- [ ] Audio audible et compréhensible
