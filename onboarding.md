Voici la version corrigée et professionnelle :

---

J’ai rencontré cette erreur côté Render lorsque je change la photo d’un employé :

```
==> ///////////////////////////////////////////////////////////
[POST employee/image] error: new row for relation "media" violates check constraint "media_type_check"
    at /opt/render/project/src/backend/node_modules/pg-pool/index.js:45:11
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async /opt/render/project/src/backend/src/routes/media.js:383:22 {
  length: 430,
  severity: 'ERROR',
  code: '23514',
  detail: 'Failing row contains (8d264ee5-ff49-409c-b161-7f3f004e096c, e0c677b0-5270-4cd0-8542-940fb0eabf83, employee, d481636a-88c7-41c6-b5f7-b86c6592e632, flowia/commercant_e0c677b0-5270-4cd0-8542-940fb0eabf83/employees..., cloudinary, 0, 2026-04-18 12:18:30.7504+00).',
  hint: undefined,
  position: undefined,
  internalPosition: undefined,
  internalQuery: undefined,
  where: undefined,
  schema: 'public',
  table: 'media',
  column: undefined,
  dataType: undefined,
  constraint: 'media_type_check',
  file: 'execMain.c',
  line: '2033',
  routine: 'ExecConstraints'
}
```

👉 Cette erreur indique que le type de média inséré ne respecte pas la contrainte définie dans la base de données (PostgreSQL), ce qui bloque l’enregistrement de l’image de l’employé.

---

Par ailleurs, il faut corriger le comportement global des images des employés :

* Dans les modules **caisse**, **saisie rapide**, **validation de code PIN**, etc., il ne faut jamais tenter de récupérer les images des employés depuis Cloudinary.
* Les images des employés doivent être utilisées uniquement sur le **site de réservation** et dans la page d’administration **(/settings/equipe)**.
* En dehors de ces contextes, aucune requête d’image ne doit être effectuée pour les employés, afin d’éviter des appels inutiles et des erreurs de chargement.

---

👉 Objectif :

* corriger la contrainte `media_type_check` en base
* éviter les erreurs lors de l’upload des images employés
* optimiser les performances en ne chargeant les images que là où elles sont réellement nécessaires
* garantir une séparation claire entre usage admin, caisse et site de réservation

---

⚠️ Assure-toi que cette logique est bien respectée partout pour éviter les requêtes inutiles et les bugs liés aux images.
