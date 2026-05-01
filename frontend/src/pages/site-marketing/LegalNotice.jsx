import { PageHero, Container, Prose, ProseH2 } from './components/Shared';

export default function LegalNotice() {
  return (
    <>
      <PageHero
        label="Mentions légales"
        title="Mentions légales"
        subtitle="Informations sur l'éditeur du site et l'hébergement, conformément à la loi pour la confiance dans l'économie numérique."
      />
      <Container maxWidth={760}>
        <Prose>
          <ProseH2>Éditeur du site</ProseH2>
          <p>
            {"Le site flowiapro.com et l'application FlowIA sont édités par FlowIA SAS, société par actions simplifiée au capital social de 1 000 €, immatriculée au registre du commerce et des sociétés."}
          </p>
          <p>
            <strong>Adresse :</strong> France<br/>
            <strong>Email :</strong> contact@flowiapro.com<br/>
            <strong>Directeur de la publication :</strong> Représentant légal de FlowIA SAS
          </p>

          <ProseH2>Hébergement</ProseH2>
          <p>
            {"Le site et l'application sont hébergés chez des prestataires cloud de référence, en région européenne, conformes RGPD. Les coordonnées des hébergeurs sont communiquées sur simple demande à "}
            <a href="mailto:contact@flowiapro.com">contact@flowiapro.com</a>.
          </p>

          <ProseH2>Propriété intellectuelle</ProseH2>
          <p>
            {"L'ensemble des contenus présents sur le site (textes, illustrations, logos, code source) est la propriété exclusive de FlowIA SAS ou de ses partenaires. Toute reproduction, représentation, modification ou exploitation, totale ou partielle, sans autorisation écrite préalable est interdite."}
          </p>

          <ProseH2>Contact</ProseH2>
          <p>
            {"Pour toute question relative au site ou à l'application, contactez-nous à "}
            <a href="mailto:contact@flowiapro.com">contact@flowiapro.com</a>.
          </p>
        </Prose>
      </Container>
    </>
  );
}
