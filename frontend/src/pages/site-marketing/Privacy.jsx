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
            <em>{"Dernière mise à jour : 2 mai 2026."}</em>
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
            {"FlowIA fait appel à des sous-traitants RGPD-compliant pour fournir le service (hébergement européen, envoi d'emails, paiement en ligne, authentification, stockage d'images). La liste détaillée et à jour est disponible sur simple demande à "}
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

          <ProseH2>10. Réclamation</ProseH2>
          <p>
            {"Vous avez le droit d'introduire une réclamation auprès de la CNIL (cnil.fr) si vous estimez que vos droits ne sont pas respectés."}
          </p>
        </Prose>
      </Container>
    </>
  );
}
