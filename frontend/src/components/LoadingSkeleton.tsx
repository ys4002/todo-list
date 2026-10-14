interface Props {
  label: string
  rows?: number
  variant?: 'list' | 'table'
}

/** Screen-reader status text plus a decorative shimmer placeholder (plain divs: no list or table semantics). */
export default function LoadingSkeleton({ label, rows = 3, variant = 'list' }: Props) {
  return (
    <>
      <p role="status" className="visually-hidden">
        {label}
      </p>
      <div className={`skeleton skeleton-${variant}`} aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="skeleton-row">
            <span className="skeleton-block skeleton-box" />
            <span className="skeleton-block skeleton-line" />
            <span className="skeleton-block skeleton-line skeleton-short" />
          </div>
        ))}
      </div>
    </>
  )
}
