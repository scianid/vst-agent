import { Link } from 'react-router-dom'
import { Heart, MessageCircle, Copy } from 'lucide-react'
import { motion } from 'framer-motion'
import { GlassCard, TagPill } from '@/components/ui'
import { Prompt, categoryInfo } from '@/types'

interface PromptCardProps {
  prompt: Prompt
  index?: number
}

export function PromptCard({ prompt, index = 0 }: PromptCardProps) {
  const category = categoryInfo[prompt.category]

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(prompt.description)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
    >
      <Link to={`/prompt/${prompt.id}`}>
        <GlassCard className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-[15px] text-text-primary leading-tight mb-1">
                {prompt.title}
              </h3>
              <p className="text-xs text-text-tertiary">
                {prompt.author.username} · {category.label}
              </p>
            </div>
          </div>

          {/* Description */}
          <p className="text-text-secondary text-sm leading-relaxed mb-4 line-clamp-3 flex-1">
            {prompt.description}
          </p>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {prompt.tags.slice(0, 3).map((tag) => (
              <TagPill key={tag}>{tag}</TagPill>
            ))}
            {prompt.tags.length > 3 && (
              <TagPill className="opacity-50">+{prompt.tags.length - 3}</TagPill>
            )}
          </div>

          {/* Footer Stats */}
          <div className="flex items-center gap-5 pt-3 border-t border-border text-text-tertiary text-xs">
            <span className="flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5" />
              {prompt.stats.likes}
            </span>
            <span className="flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" />
              {prompt.stats.comments}
            </span>
            <button 
              onClick={handleCopy}
              className="flex items-center gap-1.5 ml-auto hover:text-accent transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </GlassCard>
      </Link>
    </motion.div>
  )
}
