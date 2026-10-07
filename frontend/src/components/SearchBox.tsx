interface Props {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
}

export default function SearchBox({ value, onChange, label, placeholder }: Props) {
  return (
    <div className="search-box">
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder ?? label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value !== '' && (
        <button type="button" onClick={() => onChange('')}>
          Clear
        </button>
      )}
    </div>
  )
}
