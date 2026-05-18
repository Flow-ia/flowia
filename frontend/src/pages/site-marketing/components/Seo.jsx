// components/Seo.jsx — Meta SEO par page du site marketing.
//
// Centralise title / description / canonical / Open Graph / Twitter Card et
// donnees structurees JSON-LD. Chaque page marketing rend <Seo .../> en
// premier enfant. react-helmet-async deduplique : la derniere page montee
// gagne, et au demontage les valeurs par defaut de index.html reviennent.
//
// `path` est le chemin de la route (ex: "/tarifs") — sert a construire
// l'URL canonique absolue sur le domaine marketing.

import { Helmet } from 'react-helmet-async';
import { MARKETING_HOST } from '../../../utils/marketingUrl';

const DEFAULT_IMAGE = MARKETING_HOST + '/images/logo-app.png';

export default function Seo({
  title,
  description,
  path = '/',
  image = DEFAULT_IMAGE,
  jsonLd = null,
  noindex = false,
}) {
  const url = MARKETING_HOST + path;

  return (
    <Helmet prioritizeSeoTags>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta
        name="robots"
        content={noindex ? 'noindex, follow' : 'index, follow'}
      />

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="FlowIA" />
      <meta property="og:locale" content="fr_FR" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
}
