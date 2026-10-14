import type { ReactNode } from 'react'

type Variant = 'tasks' | 'users' | 'search'

const illustrations: Record<Variant, ReactNode> = {
  tasks: (
    <>
      <rect x="14" y="10" width="52" height="60" rx="9" />
      <path d="M26 30l5 5 9-10" />
      <path d="M26 52h28" />
    </>
  ),
  users: (
    <>
      <circle cx="40" cy="28" r="12" />
      <path d="M16 64c2-14 12-20 24-20s22 6 24 20" />
    </>
  ),
  search: (
    <>
      <circle cx="35" cy="34" r="18" />
      <path d="M48 47l16 16" />
      <path d="M28 34h14" />
    </>
  ),
}

export default function EmptyState({ message, variant }: { message: string; variant: Variant }) {
  return (
    <div className="empty-state">
      <svg viewBox="0 0 80 80" className="empty-illustration" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {illustrations[variant]}
      </svg>
      <p>{message}</p>
    </div>
  )
}
