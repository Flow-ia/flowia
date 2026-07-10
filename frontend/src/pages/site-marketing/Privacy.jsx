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
            {"FlowIA SAS, responsable du traitement des données des commerçants utilisateurs. Pour les données des clients finaux saisies par les commerçants, FlowIA agit comme sous-traitant au sens du RGPD."}
          </p>

          <ProseH2>2. Données collectées</ProseH2>
          <ul>
            <li><strong>Commerçant :</strong> nom, email, téléphone, nom commercial, adresse.</li>
            <li><strong>Client final :</strong> nom, prénom, email, téléphone, rendez-vous, fidélité, consentement marketing.</li>
            <li><strong>Connexion :</strong> adresse IP et données de connexion.</li>
          </ul>
          <p>
            {"Aucune donnée bancaire n'est conservée par FlowIA."}
          </p>

          <ProseH2>3. Finalités et bases légales</ProseH2>
          <ul>
            <li>{"Fourniture du service, gestion du compte et facturation — exécution du contrat."}</li>
            <li>{"Communications marketing — consentement."}</li>
            <li>{"Sécurité du service — intérêt légitime."}</li>
            <li>{"Conservation comptable — obligation légale."}</li>
          </ul>

          <ProseH2>4. Durée de conservation</ProseH2>
          <p>
            {"Compte actif : durée d'utilisation. Compte inactif : 24 mois. Données de connexion : 12 mois. Documents comptables : 10 ans."}
          </p>

          <ProseH2>5. Destinataires</ProseH2>
          <p>
            {"Des sous-traitants encadrés par contrat conforme au RGPD interviennent pour l'hébergement, l'envoi d'emails et de notifications, le paiement en ligne, la connexion et la synchronisation d'agenda Google, et l'hébergement des images."}
          </p>
          <p>
            {"Aucune donnée n'est vendue ni transmise à des tiers à des fins commerciales ou publicitaires. Liste nominative communiquée sur demande à "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <ProseH2>6. Localisation des données</ProseH2>
          <p>
            {"Les données sont hébergées dans l'Union européenne. Aucun transfert hors Espace économique européen sans garanties appropriées au sens du RGPD."}
          </p>

          <ProseH2>7. Sécurité</ProseH2>
          <p>
            {"FlowIA met en œuvre les mesures techniques et organisationnelles appropriées, conformément à l'article 32 du RGPD."}
          </p>

          <ProseH2>8. Données Google</ProseH2>
          <p>
            {"La connexion via un compte Google et la synchronisation vers Google Agenda sont optionnelles. FlowIA accède alors à votre identifiant de compte, votre email, votre nom et votre photo de profil. Si la synchronisation est activée, FlowIA gère dans votre agenda "}
            <strong>{"les seuls rendez-vous qu'elle y a créés"}</strong>
            {", et ne consulte pas votre agenda existant."}
          </p>
          <p>
            {"Ces données servent uniquement à créer votre compte, vous authentifier, afficher votre profil et synchroniser vos rendez-vous. Elles ne sont partagées avec aucun tiers. L'utilisation et le transfert par FlowIA des informations reçues des API Google respectent la "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">
              {"Google API Services User Data Policy"}
            </a>
            {", y compris les exigences Limited Use : ni revente, ni publicité, ni entraînement de modèles d'intelligence artificielle généralistes."}
          </p>
          <p>
            {"Vous pouvez désactiver la synchronisation depuis vos réglages ou retirer l'autorisation sur "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
              {"myaccount.google.com/permissions"}
            </a>
            {". Les données Google associées sont alors supprimées."}
          </p>

          <ProseH2>9. Cookies</ProseH2>
          <p>
            {"Seuls des cookies nécessaires au fonctionnement du service sont déposés. Aucun cookie publicitaire ni de mesure d'audience tierce."}
          </p>

          <ProseH2>10. Vos droits</ProseH2>
          <p>
            {"Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, de portabilité et d'opposition. Pour les exercer : "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
          <p>
            {"Votre compte est supprimable depuis l'application (Réglages → Compte → Supprimer le compte). L'effacement devient définitif après 30 jours, délai pendant lequel la suppression reste annulable. Les écritures comptables sont conservées 10 ans."}
          </p>

          <ProseH2>11. Réclamation</ProseH2>
          <p>
            {"Vous pouvez introduire une réclamation auprès de la CNIL (cnil.fr)."}
          </p>
        </Prose>
      </Container>
    </>
  );
}
