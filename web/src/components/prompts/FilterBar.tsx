import { cn } from '@/lib/utils'
import { PromptCategory } from '@/types'

interface FilterBarProps {
  selected: PromptCategory | 'all'
  onChange: (category: PromptCategory | 'all') => void
}

const filters: Array<{ key: PromptCategory | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'synth', label: 'Synths' },
  { key: 'effect', label: 'Effects' },
  { key: 'analyzer', label: 'Analyzers' },
  { key: 'utility', label: 'Utilities' },
]

export function FilterBar({ selected, onChange }: FilterBarProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {filters.map((filter) => (
        <button
          key={filter.key}
          onClick={() => onChange(filter.key)}
          className={cn(
            'px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-150',
            selected === filter.key
              ? 'bg-accent text-white'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface'
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  )
}
