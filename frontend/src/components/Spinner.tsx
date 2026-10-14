interface Props {
  /** Announced politely to screen readers. Omit when the surrounding control already says what is happening. */
  label?: string
  /** `sm` is 1em, so it scales with the button text. */
  size?: 'sm' | 'md'
}

/** Small CSS spinner. Decorative unless a label is given. Motion is replaced by a static ring for reduced motion. */
export default function Spinner({ label, size = 'sm' }: Props) {
  return (
    <>
      <span className={`spinner spinner-${size}`} aria-hidden="true" />
      {label && (
        <span role="status" className="visually-hidden">
          {label}
        </span>
      )}
    </>
  )
}
