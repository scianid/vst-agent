import { motion, HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

interface GlassCardProps extends HTMLMotionProps<'div'> {
  hover?: boolean
  children: React.ReactNode
}

export function GlassCard({ 
  hover = true, 
  children, 
  className,
  ...props 
}: GlassCardProps) {
  return (
    <motion.div
      className={cn(
        hover ? 'card-interactive' : 'card',
        className
      )}
      whileHover={hover ? { y: -2 } : undefined}
      whileTap={hover ? { scale: 0.995 } : undefined}
      transition={{ type: 'tween', duration: 0.15 }}
      {...props}
    >
      {children}
    </motion.div>
  )
}
