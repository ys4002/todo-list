import type { ReactNode } from 'react'

/** Split layout for the public auth pages: decorative brand panel (no text, hidden from assistive tech) and the form. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <div className="auth-aside" aria-hidden="true">
        <span className="auth-orb auth-orb-1" />
        <span className="auth-orb auth-orb-2" />
        <svg className="auth-illustration" viewBox="0 0 160 160" fill="none" focusable="false" aria-hidden="true">
          <rect x="24" y="20" width="112" height="120" rx="14" fill="currentColor" opacity="0.14" />
          <rect x="24" y="20" width="112" height="120" rx="14" stroke="currentColor" strokeWidth="2" opacity="0.6" />
          <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M42 54l7 7 12-14" />
            <path d="M42 84l7 7 12-14" opacity="0.7" />
            <circle cx="49" cy="114" r="8" strokeWidth="3" opacity="0.5" />
          </g>
          <g stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.55">
            <path d="M76 54h46" />
            <path d="M76 84h38" />
            <path d="M76 114h30" />
          </g>
        </svg>
      </div>
      <div className="auth-main">
        <p className="auth-brand">Todo</p>
        {children}
      </div>
    </main>
  )
}
