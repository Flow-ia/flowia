import { PageHero, Container, Prose, ProseH2 } from './components/Shared';

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
            <em>{"Dernière mise à jour : 5 mai 2026."}</em>
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
            <a href="mailto:contact@flowiapro.com">contact@flowiapro.com</a>
            {". Vous pouvez aussi supprimer votre compte directement depuis l'application (suppression effective sous 30 jours)."}
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
            <a href="mailto:contact@flowiapro.com">contact@flowiapro.com</a>.
          </p>

          <ProseH2>8. Sécurité</ProseH2>
          <p>
            {"Vos données sont chiffrées en transit et au repos. Les actions sensibles sont protégées par PIN administrateur. Les sessions employés se font via PIN court avec rotation. Les sauvegardes sont automatiques et chiffrées."}
          </p>

          <ProseH2>9. Cookies</ProseH2>
          <p>
            {"FlowIA utilise uniquement des cookies essentiels au fonctionnement (session, authentification). Aucun cookie publicitaire ni de pistage marketing tiers."}
          </p>

          <ProseH2>10. Intégrations Google (Calendar, Login)</ProseH2>
          <p>
            <strong>{"Connexion via Google (login) :"}</strong>
            {" Lorsqu'un commerçant ou un client final choisit de se connecter à FlowIA via son compte Google, nous récupérons uniquement son adresse email, son nom et sa photo de profil publique pour créer ou identifier son compte. Aucune autre donnée n'est lue."}
          </p>
          <p>
            <strong>{"Synchronisation Google Agenda (commerçants) :"}</strong>
            {" Si un commerçant choisit de connecter son compte Google Agenda dans les Réglages de FlowIA, nous demandons l'autorisation OAuth correspondant au scope "}
            <code>https://www.googleapis.com/auth/calendar.events</code>
            {". Ce scope nous permet uniquement de "}
            <strong>{"créer, modifier ou supprimer des événements"}</strong>
            {" dans l'agenda Google du commerçant. FlowIA "}
            <strong>{"ne lit jamais"}</strong>
            {" le contenu de l'agenda existant : nous ne voyons ni les événements personnels, ni les événements professionnels créés en dehors de FlowIA."}
          </p>
          <p>
            <strong>{"Utilisation et limites :"}</strong>
            {" Les événements créés par FlowIA dans l'agenda Google reflètent uniquement les rendez-vous enregistrés dans FlowIA (créés par le commerçant, par un employé, ou par un client via la page de réservation publique). Toute modification ou annulation d'un rendez-vous dans FlowIA est répercutée sur l'événement Google correspondant. La synchronisation est unidirectionnelle (FlowIA → Google) ; nous ne synchronisons jamais l'inverse."}
          </p>
          <p>
            <strong>{"Stockage des jetons :"}</strong>
            {" Les jetons OAuth Google (access_token, refresh_token) sont stockés chiffrés (AES-256-GCM) dans notre base de données. Ils ne sont accessibles que par le système FlowIA pour effectuer la synchronisation, jamais consultés par des humains, et jamais transmis à des tiers."}
          </p>
          <p>
            <strong>{"Pas de revente, pas de profilage, pas de modèles d'IA :"}</strong>
            {" Conformément à la "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              {"Google API Services User Data Policy"}
            </a>
            {", FlowIA n'utilise les données obtenues via les API Google que pour les fonctionnalités explicitement décrites ci-dessus. Nous ne vendons ces données à aucun tiers, nous ne les utilisons pas pour du profilage publicitaire ni pour entraîner des modèles d'IA, et nous ne les transférons pas en dehors de l'Espace économique européen sans votre consentement."}
          </p>
          <p>
            <strong>{"Révocation à tout moment :"}</strong>
            {" Le commerçant peut déconnecter son compte Google à tout moment depuis "}
            <em>{"Réglages → Réservations → Synchronisation"}</em>
            {" dans FlowIA — l'opération révoque les jetons côté Google et supprime nos copies chiffrées. Vous pouvez aussi révoquer l'accès directement depuis votre compte Google : "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
              {"myaccount.google.com/permissions"}
            </a>.
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
