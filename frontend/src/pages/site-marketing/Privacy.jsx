import { PageHero, Container, Prose, ProseH2 } from './components/Shared';
import { CONTACT_EMAIL } from '../../utils/siteConfig';

export default function Privacy() {
  return (
    <>
      <PageHero
        label="Confidentialité"
        title="Politique de confidentialité"
        subtitle="Comment FlowIA collecte, utilise et protège vos données — et celles de vos clients."
      />
      <Container maxWidth={760}>
        <Prose>
          <p>
            <em>{"Dernière mise à jour : 6 mai 2026."}</em>
          </p>

          <ProseH2>1. Responsable du traitement</ProseH2>
          <p>
            {"FlowIA SAS est responsable du traitement des données personnelles des commerçants utilisateurs de l'application. Pour les données des clients finaux saisies par les commerçants, FlowIA agit comme sous-traitant au sens du RGPD."}
          </p>

          <ProseH2>2. Données collectées</ProseH2>
          <p>
            <strong>Côté commerçant :</strong> nom, email, téléphone, nom commercial, adresse. Les données de paiement sont gérées par notre partenaire de paiement agréé ; FlowIA ne stocke aucune donnée bancaire.
          </p>
          <p>
            <strong>Côté client final (saisies par le commerçant) :</strong> nom, prénom, email, téléphone, historique des rendez-vous, points de fidélité, opt-in marketing.
          </p>
          <p>
            <strong>Données techniques :</strong> logs de connexion, adresse IP, type de navigateur, dans une optique de sécurité et de débogage.
          </p>

          <ProseH2>3. Finalités</ProseH2>
          <p>
            {"Vos données sont traitées pour : fournir le service, vous identifier, vous envoyer des notifications transactionnelles, vous facturer, améliorer le produit, et répondre à nos obligations légales (comptabilité, fiscalité)."}
          </p>

          <ProseH2>4. Base légale</ProseH2>
          <p>
            {"Le traitement repose sur l'exécution du contrat (CGU acceptées à l'inscription), votre consentement (opt-in marketing, cookies non essentiels) et nos obligations légales (conservation comptable)."}
          </p>

          <ProseH2>5. Durée de conservation</ProseH2>
          <p>
            {"Comptes actifs : durée d'utilisation. Comptes inactifs : suppression après 24 mois sans connexion. Données comptables : 10 ans (obligation légale). Logs de sécurité : 12 mois."}
          </p>

          <ProseH2>6. Vos droits</ProseH2>
          <p>
            {"Conformément au RGPD, vous disposez des droits d'accès, de rectification, d'effacement, de limitation, de portabilité et d'opposition. Pour les exercer, écrivez-nous à "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            {". Vous pouvez aussi supprimer votre compte directement depuis l'application (Réglages → Compte → Supprimer le compte). Cette action déclenche immédiatement la suppression des données Google associées et bloque l'accès au compte. L'ensemble des données métier est ensuite purgé définitivement après une période de grâce de 30 jours, durant laquelle vous pouvez nous écrire à "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            {" pour annuler la suppression."}
          </p>

          <ProseH2>7. Sous-traitants</ProseH2>
          <p>
            {"FlowIA fait appel à des sous-traitants RGPD-compliant pour fournir le service. Catégories principales :"}
          </p>
          <ul>
            <li>{"Hébergement / base de données (infrastructure cloud européenne)"}</li>
            <li>{"Envoi d'emails transactionnels et marketing"}</li>
            <li>{"Paiement en ligne (Stripe — sous-traitant agréé pour le traitement des paiements bancaires)"}</li>
            <li>{"Authentification optionnelle via Google (login OAuth) et synchronisation Google Agenda (cf. section 10)"}</li>
            <li>{"Stockage et délivrance des images / médias"}</li>
            <li>{"Notifications push web (envoi de notifications navigateur)"}</li>
          </ul>
          <p>
            {"La liste nominative et à jour des sous-traitants est disponible sur simple demande à "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <ProseH2>8. Sécurité</ProseH2>
          <p>
            {"Vos données sont chiffrées en transit et au repos. Les actions sensibles sont protégées par PIN administrateur. Les sessions employés se font via PIN court avec rotation. Les sauvegardes sont automatiques et chiffrées."}
          </p>

          <ProseH2>9. Cookies</ProseH2>
          <p>
            {"FlowIA utilise uniquement des cookies essentiels au fonctionnement (session, authentification). Aucun cookie publicitaire ni de pistage marketing tiers."}
          </p>

          <ProseH2>10. Données utilisateur Google (Google API Services)</ProseH2>
          <p>
            {"Cette section décrit en détail comment FlowIA accède, utilise, stocke et supprime les données obtenues via les API Google, conformément à la "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              {"Google API Services User Data Policy"}
            </a>
            {", y compris les exigences relatives aux scopes restreints (Limited Use)."}
          </p>

          <p><strong>{"FlowIA utilise les fonctionnalités Google suivantes :"}</strong></p>
          <ul>
            <li>{"« Se connecter avec Google » côté commerçant (création / connexion de compte sur "}<code>commercant.flowiapro.com</code>{")"}</li>
            <li>{"« Se connecter avec Google » côté client final (création / connexion de compte sur la page de réservation publique du salon)"}</li>
            <li>{"Synchronisation des rendez-vous vers Google Agenda (option commerçant uniquement, désactivée par défaut)"}</li>
          </ul>

          <ProseH2>10.1 Données Google consultées (Data Accessed)</ProseH2>
          <p>
            {"FlowIA demande exactement les scopes suivants. Aucun autre scope Google n'est demandé ni utilisé."}
          </p>
          <ul>
            <li>
              <code>openid</code>
              {" — identifiant de compte Google permettant la création / mise en correspondance d'un compte FlowIA."}
            </li>
            <li>
              <code>https://www.googleapis.com/auth/userinfo.email</code>
              {" (alias "}<code>email</code>
              {") — adresse email principale du compte Google. Utilisée comme identifiant unique du compte FlowIA."}
            </li>
            <li>
              <code>https://www.googleapis.com/auth/userinfo.profile</code>
              {" (alias "}<code>profile</code>
              {") — prénom, nom et photo de profil publique. Utilisés pour pré-remplir le profil FlowIA et afficher l'avatar."}
            </li>
            <li>
              <code>https://www.googleapis.com/auth/calendar.events</code>
              {" — uniquement pour les commerçants ayant explicitement activé la synchronisation Google Agenda dans "}
              <em>{"Réglages → Réservations → Synchronisation"}</em>
              {". Permet à FlowIA de "}<strong>{"créer, modifier et supprimer uniquement les événements créés par FlowIA"}</strong>
              {" dans l'agenda du commerçant. FlowIA "}<strong>{"ne lit pas"}</strong>
              {" le contenu de l'agenda existant : nous ne voyons ni les événements personnels du commerçant, ni les événements professionnels créés en dehors de FlowIA. La synchronisation est unidirectionnelle (FlowIA → Google)."}
            </li>
          </ul>

          <ProseH2>10.2 Utilisation des données (Data Usage)</ProseH2>
          <p>
            {"Les données Google ci-dessus sont utilisées exclusivement pour les finalités suivantes, et "}
            <strong>{"jamais pour d'autres usages"}</strong>
            {" :"}
          </p>
          <ul>
            <li>{"Authentification : création de compte FlowIA et connexion (vérification de l'identifiant Google et association à un compte FlowIA existant si l'email correspond)."}</li>
            <li>{"Pré-remplissage du profil FlowIA : nom et photo affichés dans l'application uniquement."}</li>
            <li>{"Synchronisation Google Agenda : reflet des rendez-vous FlowIA vers l'agenda Google du commerçant (création, modification, annulation)."}</li>
          </ul>
          <p>
            <strong>{"Limited Use — engagements explicites :"}</strong>
            {" FlowIA "}<strong>{"n'utilise PAS"}</strong>
            {" les données Google pour : (a) afficher des publicités, (b) faire du profilage publicitaire, (c) entraîner ou améliorer des modèles d'intelligence artificielle généralistes, (d) revendre ou transférer les données à des tiers à des fins publicitaires ou commerciales, (e) tout traitement non explicitement décrit dans la présente politique."}
          </p>

          <ProseH2>10.3 Partage des données (Data Sharing)</ProseH2>
          <p>
            <strong>{"FlowIA ne partage aucune donnée Google avec des tiers"}</strong>
            {", à l'exception stricte des cas suivants :"}
          </p>
          <ul>
            <li>
              <strong>{"Hébergeur de notre base de données : "}</strong>
              {"les données chiffrées en transit et au repos sont stockées chez notre prestataire d'hébergement cloud, qui agit comme sous-traitant RGPD et n'a aucun droit d'usage sur les données."}
            </li>
            <li>
              <strong>{"Aucun autre partenaire : "}</strong>
              {"aucune donnée Google n'est partagée avec un service de marketing, d'analytics, de publicité ou un fournisseur d'IA."}
            </li>
            <li>
              <strong>{"Réquisition légale : "}</strong>
              {"FlowIA peut être contraint de divulguer certaines données sur réquisition d'une autorité judiciaire compétente, conformément à la loi française et au RGPD."}
            </li>
          </ul>
          <p>
            {"Les événements écrits par FlowIA dans l'agenda Google d'un commerçant sont, par nature, visibles dans l'agenda Google de ce commerçant — qui en est le propriétaire. Aucune donnée n'est exposée à un autre utilisateur."}
          </p>

          <ProseH2>10.4 Stockage et protection (Data Storage &amp; Protection)</ProseH2>
          <ul>
            <li>
              <strong>{"Localisation : "}</strong>
              {"les données sont stockées sur des serveurs situés dans l'Union européenne (Espace économique européen)."}
            </li>
            <li>
              <strong>{"Chiffrement en transit : "}</strong>
              {"toutes les communications entre FlowIA et les API Google, et entre les utilisateurs et FlowIA, utilisent TLS 1.2+."}
            </li>
            <li>
              <strong>{"Chiffrement au repos : "}</strong>
              {"les jetons OAuth Google ("}<code>access_token</code>
              {", "}<code>refresh_token</code>
              {") sont chiffrés au repos par AES-256-GCM avec une clé maître stockée hors base de données. Aucun token n'est jamais loggué ni consulté manuellement."}
            </li>
            <li>
              <strong>{"Contrôle d'accès : "}</strong>
              {"l'accès à l'infrastructure FlowIA est restreint aux opérateurs autorisés, protégé par authentification multifacteur, et journalisé."}
            </li>
            <li>
              <strong>{"Données minimales : "}</strong>
              {"FlowIA ne stocke que les éléments nécessaires au service — email, nom, photo (URL), jetons chiffrés, et identifiants Google des événements créés par FlowIA pour pouvoir les modifier ou les supprimer."}
            </li>
          </ul>

          <ProseH2>10.5 Conservation et suppression (Data Retention &amp; Deletion)</ProseH2>
          <ul>
            <li>
              <strong>{"Pendant que votre compte FlowIA est actif : "}</strong>
              {"les données Google nécessaires (email, nom, photo, jetons chiffrés) sont conservées tant que vous utilisez la fonctionnalité concernée."}
            </li>
            <li>
              <strong>{"Déconnexion de Google Agenda : "}</strong>
              {"depuis "}
              <em>{"Réglages → Réservations → Synchronisation → Déconnecter"}</em>
              {", FlowIA appelle l'endpoint de révocation Google ("}<code>oauth2.googleapis.com/revoke</code>
              {") puis supprime immédiatement sa copie chiffrée des jetons "}
              (<code>access_token</code>, <code>refresh_token</code>)
              {" de la table "}<code>merchant_calendar_integrations</code>
              {". Les événements déjà créés dans l'agenda Google restent la propriété du commerçant et ne sont pas effacés."}
            </li>
            <li>
              <strong>{"Suppression du compte FlowIA : "}</strong>
              {"vous pouvez supprimer votre compte directement depuis l'application (Réglages → Compte → Supprimer le compte). Le traitement se fait en deux temps :"}
              <ul>
                <li>
                  <strong>{"Immédiatement : "}</strong>
                  {"révocation des jetons OAuth Google ("}<code>oauth2.googleapis.com/revoke</code>
                  {"), suppression de la table "}<code>merchant_calendar_integrations</code>
                  {", effacement de l'identifiant Google ("}<code>google_id</code>
                  {") et de la photo de profil ("}<code>avatar_url</code>
                  {") sur votre compte. Les RDV et transactions sont anonymisés (les écritures comptables restent conservées 10 ans au titre de nos obligations légales). Toutes les sessions actives sont immédiatement bloquées."}
                </li>
                <li>
                  <strong>{"Après 30 jours : "}</strong>
                  {"purge définitive de l'ensemble des données métier (employés, services, historiques, configuration de réservation, etc.) par un cron quotidien — la ligne utilisateur disparaît alors entièrement de notre base de production."}
                </li>
              </ul>
              {"Pendant cette période de 30 jours, vous pouvez "}
              <strong>{"annuler la suppression"}</strong>
              {" en nous écrivant à "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              {". Au-delà, la suppression est irréversible."}
            </li>
            <li>
              <strong>{"Sauvegardes : "}</strong>
              {"les sauvegardes chiffrées de notre prestataire d'hébergement appliquent une politique de rétention conforme aux pratiques sectorielles et sont automatiquement purgées dans les délais standard de l'industrie. Ces sauvegardes ne sont jamais utilisées pour ré-exposer des données effacées en production."}
            </li>
            <li>
              <strong>{"Révocation directe côté Google : "}</strong>
              {"vous pouvez retirer l'autorisation accordée à FlowIA à tout moment sur "}
              <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
                {"myaccount.google.com/permissions"}
              </a>
              {". Cela invalide immédiatement nos jetons côté Google. Au prochain essai d'usage du jeton, FlowIA détecte automatiquement l'erreur "}
              <code>invalid_grant</code>
              {" / 401 et "}
              <strong>{"supprime la copie chiffrée résiduelle"}</strong>
              {" en base ("}<code>DELETE FROM merchant_calendar_integrations</code>
              {"). Aucun cron ni intervention manuelle n'est nécessaire."}
            </li>
            <li>
              <strong>{"Demande explicite de suppression : "}</strong>
              {"écrivez à "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              {" — nous traitons les demandes de suppression de données Google sous 30 jours conformément au RGPD."}
            </li>
          </ul>

          <ProseH2>10.6 Conformité Limited Use (résumé)</ProseH2>
          <p>
            {"L'utilisation et le transfert vers toute autre application des informations reçues des API Google par FlowIA respectent la "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes" target="_blank" rel="noopener noreferrer">
              {"Google API Services User Data Policy"}
            </a>
            {", y compris les exigences Limited Use. Nous ne vendons pas ces données, ne les utilisons pas pour des publicités personnalisées, et ne les utilisons pas pour entraîner des modèles d'IA généralistes."}
          </p>

          <ProseH2>11. Réclamation</ProseH2>
          <p>
            {"Vous avez le droit d'introduire une réclamation auprès de la CNIL (cnil.fr) si vous estimez que vos droits ne sont pas respectés."}
          </p>
        </Prose>
      </Container>
    </>
  );
}
