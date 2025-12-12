import { Link, useLocation } from 'react-router-dom'
import { Search } from 'lucide-react'
import { motion } from 'framer-motion'
import { Input, Button } from '@/components/ui'
import { useState } from 'react'

interface NavBarProps {
  onSearch?: (query: string) => void
}

export function NavBar({ onSearch }: NavBarProps) {
  const location = useLocation()
  const [searchQuery, setSearchQuery] = useState('')
  const isBrowsePage = location.pathname === '/browse'

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
    onSearch?.(e.target.value)
  }

  return (
    <motion.nav 
      className="sticky top-0 z-50 border-b border-border bg-bg-primary/80 backdrop-blur-xl"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between h-14 gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <span className="font-semibold text-base tracking-tight">
              VibeVST
            </span>
          </Link>

          {/* Search - only on browse page */}
          {isBrowsePage && (
            <div className="flex-1 max-w-sm hidden sm:block">
              <Input
                type="text"
                placeholder="Search prompts..."
                value={searchQuery}
                onChange={handleSearchChange}
                icon={<Search className="w-4 h-4" />}
                className="h-9 text-sm"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Browse link */}
            <Link to="/browse">
              <Button variant={isBrowsePage ? 'ghost' : 'secondary'} size="sm">
                Browse
              </Button>
            </Link>
            
            {/* Create link - only show when not on home/create */}
            {isBrowsePage && (
              <Link to="/">
                <Button variant="primary" size="sm">
                  Create
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.nav>
  )
}
