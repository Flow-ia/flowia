import { PageHero, Container, Prose, ProseH2 } from './components/Shared';
import { CONTACT_EMAIL } from '../../utils/siteConfig';
import Seo from './components/Seo';

export default function LegalNotice() {
  return (
    <>
      <Seo
        path="/mentions-legales"
        title="Mentions légales | Salon DZ"
        description="Mentions légales du site et du service Salon DZ."
      />
      <PageHero
        label="Mentions légales"
        title="Mentions légales"
        subtitle="Informations sur l'éditeur du site et l'hébergement."
      />
      <Container maxWidth={760}>
        <Prose>
          <ProseH2>Éditeur du site</ProseH2>
          <p>
            {"Le site flowiapro.com et l'application Salon DZ sont édités par Salon DZ, immatriculée au registre du commerce (RC)."}
          </p>
          <p>
            <strong>Adresse :</strong> Alger, Algérie<br/>
            <strong>Email :</strong> {CONTACT_EMAIL}<br/>
            <strong>Directeur de la publication :</strong> Représentant légal de Salon DZ
          </p>

          <ProseH2>Hébergement</ProseH2>
          <p>
            {"Le site et l'application sont hébergés chez des prestataires cloud de référence, sur un hébergement cloud sécurisé, dans le respect de la loi 18-07. Les coordonnées des hébergeurs sont communiquées sur simple demande à "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <ProseH2>Propriété intellectuelle</ProseH2>
          <p>
            {"L'ensemble des contenus présents sur le site (textes, illustrations, logos, code source) est la propriété exclusive de Salon DZ ou de ses partenaires. Toute reproduction, représentation, modification ou exploitation, totale ou partielle, sans autorisation écrite préalable est interdite."}
          </p>

          <ProseH2>Contact</ProseH2>
          <p>
            {"Pour toute question relative au site ou à l'application, contactez-nous à "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </Prose>
      </Container>
    </>
  );
}
