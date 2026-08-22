import Link from 'next/link';

export function LabStudioSwitch({ mode }: { mode: 'lab' | 'studio' }) {
  const href = mode === 'studio' ? '/lab/' : '/studio/';
  const label = mode === 'studio' ? 'Lab →' : '← Studio';

  return (
    <Link
      className="lab-studio-switch"
      href={href}
      aria-label={mode === 'studio' ? 'Открыть Lab' : 'Вернуться в Studio'}
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 14,
        transform: 'translateX(-50%)',
        zIndex: 200,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 40,
        padding: '6px 12px',
        border: '1px solid rgba(255,255,255,.22)',
        borderRadius: 999,
        background: 'rgba(24,24,24,.88)',
        color: '#f5f5f5',
        boxShadow: '0 8px 24px rgba(0,0,0,.18)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        fontSize: '16pt',
        lineHeight: 1,
        textDecoration: 'none'
      }}
    >
      {label}
    </Link>
  );
}
