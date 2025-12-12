import { cn } from '@/lib/utils'

interface TagPillProps {
  children: React.ReactNode
  className?: string
  active?: boolean
  onClick?: () => void
}

export function TagPill({ children, className, active, onClick }: TagPillProps) {
  return (
    <span 
      className={cn(
        'tag',
        active && 'tag-active',
        onClick && 'cursor-pointer hover:bg-surface-hover',
        className
      )}
      onClick={onClick}
    >
      {children}
    </span>
  )
}
