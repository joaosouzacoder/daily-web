'use client';

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}

export function SearchInput({ value, onChange, label, placeholder }: Props) {
  return (
    <input
      type="search"
      className="field filter-search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      placeholder={placeholder ?? 'buscar'}
    />
  );
}
