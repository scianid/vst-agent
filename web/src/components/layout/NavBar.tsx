import { Link, useLocation } from 'react-router-dom'
import { Search, Settings } from 'lucide-react'
import { motion } from 'framer-motion'
import { Input, Button } from '@/components/ui'
import { useState, useEffect } from 'react'
import { SettingsModal } from '@/components/ui/SettingsModal'

interface NavBarProps {
  onSearch?: (query: string) => void
}

export function NavBar({ onSearch }: NavBarProps) {
  const location = useLocation()
  const [searchQuery, setSearchQuery] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const isBrowsePage = location.pathname === '/browse'

  // Check for existing API key on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('anthropic_api_key')
    setIsConnected(!!savedKey)
  }, [])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
    onSearch?.(e.target.value)
  }

  const handleConnectionChange = (connected: boolean) => {
    setIsConnected(connected)
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
            {/* Settings button with connection indicator */}
            <button
              onClick={() => setShowSettings(true)}
              className="relative p-2 text-text-secondary hover:text-text-primary hover:bg-bg-secondary rounded-lg transition-colors"
              title={isConnected ? 'Connected to Anthropic' : 'Configure API Key'}
            >
              <Settings className="w-5 h-5" />
              {/* Connection indicator dot */}
              <span 
                className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-yellow-500'
                }`} 
              />
            </button>

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

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)}
        onConnectionChange={handleConnectionChange}
      />
    </motion.nav>
  )
}
