import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Key, Eye, EyeOff, Check, Loader2, AlertCircle, ExternalLink } from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onConnectionChange?: (connected: boolean) => void
}

export function SettingsModal({ isOpen, onClose, onConnectionChange }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [savedKey, setSavedKey] = useState('')

  // Load saved key on mount
  useEffect(() => {
    const stored = localStorage.getItem('anthropic_api_key')
    if (stored) {
      setSavedKey(stored)
      setApiKey(stored)
      setIsConnected(true)
    }
  }, [isOpen])

  // Format validation - check if key looks like an Anthropic key
  const isValidFormat = (key: string) => {
    return key.startsWith('sk-ant-api03-') && key.length > 50
  }

  const formatKeyPreview = (key: string) => {
    if (!key) return ''
    if (key.length <= 20) return key
    return `${key.substring(0, 15)}...${key.substring(key.length - 4)}`
  }

  const handleValidate = async () => {
    const trimmedKey = apiKey.trim()
    
    if (!trimmedKey) {
      setValidationError('Please enter an API key')
      return
    }

    if (!isValidFormat(trimmedKey)) {
      setValidationError('Invalid format. Anthropic keys start with sk-ant-api03-')
      return
    }

    setIsValidating(true)
    setValidationError('')

    try {
      const response = await fetch('/api/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmedKey })
      })

      const data = await response.json()

      if (response.ok && data.valid) {
        // Save to localStorage
        localStorage.setItem('anthropic_api_key', trimmedKey)
        setSavedKey(trimmedKey)
        setIsConnected(true)
        onConnectionChange?.(true)
        setValidationError('')
      } else {
        setValidationError(data.error || 'Invalid API key')
        setIsConnected(false)
        onConnectionChange?.(false)
      }
    } catch (err) {
      setValidationError('Failed to validate key. Check your connection.')
    } finally {
      setIsValidating(false)
    }
  }

  const handleDisconnect = () => {
    localStorage.removeItem('anthropic_api_key')
    setApiKey('')
    setSavedKey('')
    setIsConnected(false)
    onConnectionChange?.(false)
    setValidationError('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isValidating) {
      handleValidate()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50"
          >
            <div className="bg-bg-secondary border border-border rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold">Settings</h2>
                <button
                  onClick={onClose}
                  className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {/* API Key Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-text-secondary" />
                    <h3 className="font-medium">Anthropic API Key</h3>
                    {isConnected && (
                      <span className="ml-auto flex items-center gap-1.5 text-xs text-green-500 font-medium">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        Connected
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-text-tertiary">
                    Your API key is stored locally in your browser and never sent to our servers.
                  </p>

                  {/* Connected State */}
                  {isConnected && savedKey ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 bg-bg-primary rounded-xl border border-border">
                        <div className="flex-1">
                          <div className="text-xs text-text-tertiary mb-1">Current key</div>
                          <div className="font-mono text-sm text-text-secondary">
                            {formatKeyPreview(savedKey)}
                          </div>
                        </div>
                        <Check className="w-5 h-5 text-green-500" />
                      </div>

                      <button
                        onClick={handleDisconnect}
                        className="w-full py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
                      >
                        Disconnect & Remove Key
                      </button>
                    </div>
                  ) : (
                    /* Input State */
                    <div className="space-y-3">
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={apiKey}
                          onChange={(e) => {
                            setApiKey(e.target.value)
                            setValidationError('')
                          }}
                          onKeyDown={handleKeyDown}
                          placeholder="sk-ant-api03-..."
                          className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 pr-12 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-text-tertiary hover:text-text-secondary transition-colors"
                        >
                          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      {/* Validation Error */}
                      {validationError && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-2 text-sm text-red-400"
                        >
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{validationError}</span>
                        </motion.div>
                      )}

                      {/* Format hint */}
                      {apiKey && !isValidFormat(apiKey) && !validationError && (
                        <p className="text-xs text-yellow-500">
                          Anthropic API keys start with "sk-ant-api03-"
                        </p>
                      )}

                      {/* Validate Button */}
                      <button
                        onClick={handleValidate}
                        disabled={isValidating || !apiKey.trim()}
                        className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                      >
                        {isValidating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Validating...
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            Connect
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Help Link */}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-accent transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Get an API key from Anthropic Console
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
