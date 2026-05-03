import { Link } from 'react-router-dom';
import { S, primaryBtnStyle, ghostBtnStyle, primaryHover, ghostHover } from './shadcn';

export function PageHero({ label, title, subtitle }) {
  return (
    <section style={{
      padding: 'clamp(64px, 8vw, 96px) 24px 48px',
      background: S.bg,
      borderBottom: `1px solid ${S.border}`,
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {label && (
          <p style={{
            fontSize: 12, fontWeight: 500, color: S.fgSubtle,
            textTransform: 'uppercase', letterSpacing: 1,
            margin: 0, marginBottom: 14,
          }}>{label}</p>
        )}
        <h1 style={{
          fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 500,
          color: S.fg, lineHeight: 1.1, letterSpacing: '-0.03em',
          margin: 0, marginBottom: 14,
        }}>{title}</h1>
        {subtitle && (
          <p style={{
            fontSize: 17, color: S.fgMuted, lineHeight: 1.55,
            margin: 0, maxWidth: 600, marginLeft: 'auto', marginRight: 'auto',
          }}>{subtitle}</p>
        )}
      </div>
    </section>
  );
}

export function Container({ children, maxWidth = 1100, paddingY = 64 }) {
  return (
    <section style={{ padding: `${paddingY}px 24px` }}>
      <div style={{ maxWidth, margin: '0 auto' }}>{children}</div>
    </section>
  );
}

function fullWidthStyle(base, fullWidth) {
  return fullWidth
    ? { ...base, width: '100%', textAlign: 'center', display: 'block' }
    : base;
}

export function PrimaryBtn({ children, href, to, onClick, fullWidth }) {
  const style = fullWidthStyle(primaryBtnStyle(), fullWidth);
  if (href) return <a href={href} style={style} {...primaryHover}>{children}</a>;
  if (to)   return <Link to={to} style={style} {...primaryHover}>{children}</Link>;
  return <button onClick={onClick} style={style} {...primaryHover}>{children}</button>;
}

export function SecondaryBtn({ children, href, to, onClick, fullWidth }) {
  const style = fullWidthStyle(ghostBtnStyle(), fullWidth);
  if (href) return <a href={href} style={style} {...ghostHover}>{children}</a>;
  if (to)   return <Link to={to} style={style} {...ghostHover}>{children}</Link>;
  return <button onClick={onClick} style={style} {...ghostHover}>{children}</button>;
}

export function Prose({ children }) {
  return (
    <div style={{
      maxWidth: 760, margin: '0 auto',
      fontSize: 16, color: S.fg2, lineHeight: 1.75,
    }}>{children}</div>
  );
}

export function ProseH2({ children }) {
  return (
    <h2 style={{
      fontSize: 22, fontWeight: 500, color: S.fg,
      letterSpacing: '-0.02em', lineHeight: 1.3,
      margin: '40px 0 14px',
    }}>{children}</h2>
  );
}
