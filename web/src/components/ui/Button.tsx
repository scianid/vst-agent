import { motion, HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

export function Button({ 
  variant = 'primary', 
  size = 'md',
  children, 
  className,
  ...props 
}: ButtonProps) {
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  }

  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
  }

  return (
    <motion.button
      className={cn(
        'font-medium transition-all duration-150',
        'focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 focus:ring-offset-bg-primary',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        sizes[size],
        variants[variant],
        className
      )}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'tween', duration: 0.1 }}
      {...props}
    >
      {children}
    </motion.button>
  )
}
