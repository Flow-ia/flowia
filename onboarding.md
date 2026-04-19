BookingPage.jsx est trop grand et ralentit tes modifications.
Découpe-le en fichiers séparés dans un dossier frontend/src/pages/booking/
comme tu as fait pour Settings.jsx.
Chaque section dans son propre fichier :
navigation, carte latérale, services, équipe, agenda,
confirmation, compte client, parrainage.
Ne modifier aucune logique ni fonctionnalité.
Uniquement déplacer le code.
Vérifier le build après chaque fichier extrait.
git add commit push à la fin.