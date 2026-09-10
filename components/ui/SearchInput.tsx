'use client';

import { Search } from 'lucide-react';
import { Input } from './input';

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}

export function SearchInput({ value, onChange, label, placeholder }: Props) {
  return (
    <div className="relative min-w-[180px] flex-1 basis-[180px] sm:max-w-80">
      {/* z-10 because the input carries a backdrop-filter, which creates a
          stacking context that would otherwise paint over this icon. */}
      <Search className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-ink-dim" />
      <Input
        type="search"
        className="h-8 pl-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder ?? 'buscar'}
      />
    </div>
  );
}
