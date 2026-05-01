import { Link } from 'react-router-dom';
import { useTheme } from '../../../hooks/useTheme';

export function PageHero({ label, title, subtitle }) {
  const { theme: t } = useTheme();
  return (
    <section style={{
      padding: '88px 24px 56px',
      background: t.canvas,
      borderBottom: `0.5px solid ${t.border}`,
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {label && (
          <p style={{
            fontSize: 12, fontWeight: 500, color: t.muted,
            textTransform: 'uppercase', letterSpacing: 0.8,
            margin: 0, marginBottom: 14,
          }}>{label}</p>
        )}
        <h1 style={{
          fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 500,
          color: t.text, lineHeight: 1.1, letterSpacing: -0.8,
          margin: 0, marginBottom: 18,
        }}>{title}</h1>
        {subtitle && (
          <p style={{
            fontSize: 18, color: t.textSub, lineHeight: 1.55,
            margin: 0,
          }}>{subtitle}</p>
        )}
      </div>
    </section>
  );
}

export function Container({ children, maxWidth = 1100, paddingY = 72 }) {
  return (
    <section style={{ padding: `${paddingY}px 24px` }}>
      <div style={{ maxWidth, margin: '0 auto' }}>{children}</div>
    </section>
  );
}

function btnStyle(t, primary, fullWidth) {
  return {
    fontSize: 15, fontWeight: 500,
    color: primary ? t.bg : t.text,
    background: primary ? t.text : 'transparent',
    border: primary ? 'none' : `0.5px solid ${t.borderStrong}`,
    padding: '13px 22px', borderRadius: 10,
    textDecoration: 'none', cursor: 'pointer',
    display: 'inline-block', fontFamily: 'inherit',
    width: fullWidth ? '100%' : undefined,
    boxSizing: 'border-box', textAlign: 'center',
  };
}

export function PrimaryBtn({ children, href, to, onClick, fullWidth }) {
  const { theme: t } = useTheme();
  const style = btnStyle(t, true, fullWidth);
  if (href) return <a href={href} style={style}>{children}</a>;
  if (to) return <Link to={to} style={style}>{children}</Link>;
  return <button onClick={onClick} style={style}>{children}</button>;
}

export function SecondaryBtn({ children, href, to, onClick, fullWidth }) {
  const { theme: t } = useTheme();
  const style = btnStyle(t, false, fullWidth);
  if (href) return <a href={href} style={style}>{children}</a>;
  if (to) return <Link to={to} style={style}>{children}</Link>;
  return <button onClick={onClick} style={style}>{children}</button>;
}

export function Prose({ children }) {
  const { theme: t } = useTheme();
  return (
    <div style={{
      maxWidth: 760, margin: '0 auto',
      fontSize: 16, color: t.textSub, lineHeight: 1.7,
    }}>{children}</div>
  );
}

export function ProseH2({ children }) {
  const { theme: t } = useTheme();
  return (
    <h2 style={{
      fontSize: 22, fontWeight: 500, color: t.text,
      letterSpacing: -0.3, lineHeight: 1.3,
      margin: '40px 0 14px',
    }}>{children}</h2>
  );
}
