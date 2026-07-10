import { PageHero, Container, Prose, ProseH2 } from './components/Shared';
import { CONTACT_EMAIL } from '../../utils/siteConfig';
import Seo from './components/Seo';

export default function Privacy() {
  return (
    <>
      <Seo
        path="/confidentialite"
        title="Politique de confidentialité | FlowIA"
        description="Comment FlowIA collecte, utilise et protège vos données personnelles (RGPD)."
      />
      <PageHero
        label="Confidentialité"
        title="Politique de confidentialité"
        subtitle="Comment FlowIA collecte, utilise et protège vos données — et celles de vos clients."
      />
      <Container maxWidth={760}>
        <Prose>
          <p>
            <em>{"Dernière mise à jour : 10 juillet 2026."}</em>
          </p>

          <ProseH2>1. Responsable du traitement</ProseH2>
          <p>
            {"FlowIA SAS est responsable du traitement des données personnelles des commerçants utilisateurs de l'application. Pour les données des clients finaux saisies par les commerçants, FlowIA agit comme sous-traitant au sens du RGPD."}
          </p>

          <ProseH2>2. Données collectées</ProseH2>
          <p>
            <strong>Côté commerçant :</strong> nom, email, téléphone, nom commercial, adresse. Les données de paiement sont gérées par notre prestataire de paiement agréé ; FlowIA ne conserve aucune donnée bancaire.
          </p>
          <p>
            <strong>Côté client final (saisies par le commerçant) :</strong> nom, prénom, email, téléphone, historique des rendez-vous, points de fidélité, consentement marketing.
          </p>
          <p>
            <strong>Données de connexion :</strong> adresse IP et informations de connexion, conservées à des fins de sécurité.
          </p>

          <ProseH2>3. Finalités et bases légales</ProseH2>
          <p>
            {"Vos données sont traitées pour fournir le service, vous identifier, vous envoyer les notifications liées à vos rendez-vous, vous facturer et répondre à nos obligations légales."}
          </p>
          <p>
            {"Ces traitements reposent sur l'exécution du contrat (CGU acceptées à l'inscription), sur votre consentement (communications marketing) et sur nos obligations légales (conservation comptable)."}
          </p>

          <ProseH2>4. Durée de conservation</ProseH2>
          <p>
            {"Comptes actifs : pendant toute la durée d'utilisation du service. Comptes inactifs : suppression après 24 mois sans connexion. Documents comptables : 10 ans, conformément au Code de commerce. Données de connexion : 12 mois."}
          </p>

          <ProseH2>5. Destinataires</ProseH2>
          <p>
            {"FlowIA fait appel à des sous-traitants pour fournir le service, chacun encadré par un contrat conforme au RGPD. Leurs catégories sont les suivantes :"}
          </p>
          <ul>
            <li>{"Hébergement de l'application"}</li>
            <li>{"Envoi d'emails et de notifications"}</li>
            <li>{"Paiement en ligne"}</li>
            <li>{"Connexion et synchronisation d'agenda via Google (voir section 8)"}</li>
            <li>{"Hébergement des images"}</li>
          </ul>
          <p>
            {"Vos données ne sont ni vendues ni transmises à des tiers à des fins commerciales ou publicitaires. La liste nominative et à jour des sous-traitants est communiquée sur simple demande à "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
          <p>
            {"FlowIA peut être tenu de communiquer certaines données sur réquisition d'une autorité judiciaire compétente."}
          </p>

          <ProseH2>6. Localisation des données</ProseH2>
          <p>
            {"Vos données sont hébergées au sein de l'Union européenne. Aucun transfert hors de l'Espace économique européen n'est effectué sans garanties appropriées au sens du RGPD."}
          </p>

          <ProseH2>7. Sécurité</ProseH2>
          <p>
            {"FlowIA met en œuvre les mesures techniques et organisationnelles appropriées pour protéger vos données : chiffrement des données en transit et au repos, contrôle et journalisation des accès, sauvegardes régulières."}
          </p>

          <ProseH2>8. Données Google</ProseH2>
          <p>
            {"FlowIA propose la connexion via un compte Google, ainsi qu'une synchronisation optionnelle des rendez-vous vers Google Agenda, désactivée par défaut."}
          </p>
          <p>
            {"Lorsque vous utilisez ces fonctionnalités, FlowIA accède uniquement à votre identifiant de compte Google, à votre adresse email, à votre nom et à votre photo de profil. Si vous activez la synchronisation d'agenda, FlowIA peut créer, modifier et supprimer dans votre agenda "}
            <strong>{"les seuls rendez-vous qu'elle y a elle-même créés"}</strong>
            {". FlowIA ne consulte pas le contenu de votre agenda existant."}
          </p>
          <p>
            {"Ces données servent exclusivement à créer votre compte, vous authentifier, afficher votre profil et synchroniser vos rendez-vous. Elles ne sont partagées avec aucun tiers. L'utilisation et le transfert par FlowIA des informations reçues des API Google respectent la "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              {"Google API Services User Data Policy"}
            </a>
            {", y compris les exigences Limited Use : elles ne sont ni vendues, ni utilisées à des fins publicitaires, ni utilisées pour entraîner des modèles d'intelligence artificielle généralistes."}
          </p>
          <p>
            {"Vous pouvez désactiver la synchronisation à tout moment depuis vos réglages, ou retirer l'autorisation accordée à FlowIA depuis "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
              {"myaccount.google.com/permissions"}
            </a>
            {". Les données Google associées sont alors supprimées. Les rendez-vous déjà inscrits dans votre agenda vous appartiennent et n'en sont pas effacés."}
          </p>

          <ProseH2>9. Cookies</ProseH2>
          <p>
            {"FlowIA utilise uniquement des cookies nécessaires au fonctionnement du service (session, authentification). Aucun cookie publicitaire ni de mesure d'audience tierce n'est déposé."}
          </p>

          <ProseH2>10. Vos droits</ProseH2>
          <p>
            {"Conformément au RGPD, vous disposez des droits d'accès, de rectification, d'effacement, de limitation, de portabilité et d'opposition. Pour les exercer, écrivez-nous à "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            {"."}
          </p>
          <p>
            {"Vous pouvez également supprimer votre compte directement depuis l'application (Réglages → Compte → Supprimer le compte). L'accès est immédiatement bloqué et les données Google associées sont supprimées. Vos données sont ensuite effacées définitivement à l'issue d'un délai de 30 jours, pendant lequel vous pouvez annuler la suppression en nous écrivant à "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            {". Les écritures comptables sont conservées 10 ans au titre de nos obligations légales."}
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
