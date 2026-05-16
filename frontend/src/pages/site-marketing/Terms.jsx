import { PageHero, Container, Prose, ProseH2 } from './components/Shared';
import { CONTACT_EMAIL } from '../../utils/siteConfig';

export default function Terms() {
  return (
    <>
      <PageHero
        label="CGU"
        title="Conditions générales d'utilisation"
        subtitle="Les règles qui encadrent l'utilisation de FlowIA."
      />
      <Container maxWidth={760}>
        <Prose>
          <p><em>{"Dernière mise à jour : 2 mai 2026."}</em></p>

          <ProseH2>1. Objet</ProseH2>
          <p>
            {"Les présentes CGU régissent l'utilisation de l'application FlowIA, éditée par FlowIA SAS, par les commerçants (\"Utilisateurs\")."}
          </p>

          <ProseH2>2. Acceptation</ProseH2>
          <p>
            {"En créant un compte, l'Utilisateur accepte sans réserve les présentes CGU. En cas de désaccord, l'Utilisateur ne doit pas utiliser le service."}
          </p>

          <ProseH2>3. Description du service</ProseH2>
          <p>
            {"FlowIA fournit un logiciel SaaS de gestion pour salons de beauté et bien-être : agenda, réservation en ligne, caisse, fidélité, marketing, gestion d'équipe et reporting."}
          </p>

          <ProseH2>4. Compte utilisateur</ProseH2>
          <p>
            {"L'Utilisateur est responsable de la confidentialité de ses identifiants. Toute action effectuée sur son compte est réputée effectuée par lui. Les sessions employés sont sécurisées par PIN paramétrable."}
          </p>

          <ProseH2>5. Tarification</ProseH2>
          <p>
            {"Le plan Découverte est gratuit dans les limites fixées. Les plans Essentiel et Équipe sont facturés mensuellement ou annuellement, sans engagement. Les SMS sont facturés à l'usage selon les tarifs en vigueur. Toute modification de tarif fait l'objet d'un préavis de 30 jours."}
          </p>

          <ProseH2>6. Obligations de l'Utilisateur</ProseH2>
          <p>
            {"L'Utilisateur s'engage à utiliser FlowIA conformément à la loi, à ne pas tenter de contourner la sécurité, à respecter les droits de ses clients (notamment RGPD), et à ne pas envoyer de communications marketing non sollicitées."}
          </p>

          <ProseH2>7. Disponibilité</ProseH2>
          <p>
            {"FlowIA s'efforce d'assurer une disponibilité de 99,5 % (99,9 % sur le plan Équipe). Les interruptions de maintenance sont annoncées à l'avance autant que possible. Aucun engagement contractuel n'est pris sur la disponibilité des services tiers utilisés en arrière-plan."}
          </p>

          <ProseH2>8. Propriété des données</ProseH2>
          <p>
            {"L'Utilisateur reste propriétaire de ses données et de celles saisies par ses clients. FlowIA n'utilise ces données que pour fournir le service. L'export complet est disponible à tout moment depuis l'application."}
          </p>

          <ProseH2>9. Résiliation</ProseH2>
          <p>
            {"L'Utilisateur peut résilier son abonnement à tout moment depuis son espace. Aucun remboursement n'est dû pour le mois en cours. FlowIA peut résilier en cas de manquement grave après mise en demeure restée sans effet sous 15 jours."}
          </p>

          <ProseH2>10. Limitation de responsabilité</ProseH2>
          <p>
            {"FlowIA est responsable des dommages directs uniquement, dans la limite de 12 mois d'abonnement payé par l'Utilisateur. FlowIA n'est pas responsable des pertes indirectes (chiffre d'affaires, image, etc.)."}
          </p>

          <ProseH2>11. Droit applicable</ProseH2>
          <p>
            {"Les présentes CGU sont soumises au droit français. Tout litige sera porté devant les tribunaux compétents de Paris, sauf disposition impérative contraire."}
          </p>

          <ProseH2>12. Contact</ProseH2>
          <p>
            {"Pour toute question relative aux CGU : "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </Prose>
      </Container>
    </>
  );
}
