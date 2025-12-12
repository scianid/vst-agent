import { PromptCard } from './PromptCard'
import { Prompt } from '@/types'

interface PromptGridProps {
  prompts: Prompt[]
}

export function PromptGrid({ prompts }: PromptGridProps) {
  if (prompts.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-text-secondary text-base">No prompts found</p>
        <p className="text-text-tertiary text-sm mt-1">Try adjusting your filters</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {prompts.map((prompt, index) => (
        <PromptCard key={prompt.id} prompt={prompt} index={index} />
      ))}
    </div>
  )
}
