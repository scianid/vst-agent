export type PromptCategory = 'synth' | 'effect' | 'analyzer' | 'utility'

export interface Prompt {
  id: string
  title: string
  description: string
  category: PromptCategory
  tags: string[]
  author: {
    id: string
    username: string
    avatar?: string
  }
  stats: {
    likes: number
    comments: number
    views: number
    copies: number
  }
  createdAt: Date
  updatedAt: Date
}

export interface Comment {
  id: string
  promptId: string
  author: {
    id: string
    username: string
    avatar?: string
  }
  content: string
  createdAt: Date
}

// Clean category labels - no emojis
export const categoryInfo: Record<PromptCategory, { label: string }> = {
  synth: { label: 'Synthesizer' },
  effect: { label: 'Effect' },
  analyzer: { label: 'Analyzer' },
  utility: { label: 'Utility' },
}
