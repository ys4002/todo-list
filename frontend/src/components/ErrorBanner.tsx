export default function ErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null
  return (
    <div role="alert" className="banner banner-error">
      <svg className="banner-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="8" />
        <path d="M10 6v5M10 14h.01" />
      </svg>
      <span className="banner-message">{message}</span>
    </div>
  )
}
