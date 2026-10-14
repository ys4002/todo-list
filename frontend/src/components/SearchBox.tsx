import Spinner from './Spinner'

interface Props {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  /** The list this box filters is updating (debounce pending or a request in flight). */
  busy?: boolean
  busyLabel?: string
}

export default function SearchBox({ value, onChange, label, placeholder, busy = false, busyLabel }: Props) {
  return (
    <div className="search-box">
      <div className="search-field">
        <input
          type="search"
          aria-label={label}
          placeholder={placeholder ?? label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {busy && (
          <span className="search-spinner">
            <Spinner label={busyLabel} />
          </span>
        )}
      </div>
      {value !== '' && (
        <button type="button" className="ghost" onClick={() => onChange('')}>
          Clear
        </button>
      )}
    </div>
  )
}
