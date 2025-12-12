import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Sparkles, Key, Eye, EyeOff, Check, Loader2, Download, Hammer, Terminal, X } from 'lucide-react'
import { Link } from 'react-router-dom'

type BuildStatus = 'idle' | 'generating' | 'generated' | 'compiling' | 'compiled' | 'error'

export function Create() {
  const [prompt, setPrompt] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [keySaved, setKeySaved] = useState(false)
  const [status, setStatus] = useState<BuildStatus>('idle')
  const [projectName, setProjectName] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('anthropic_api_key')
    if (savedKey) {
      setApiKey(savedKey)
      setKeySaved(true)
    }
  }, [])

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleSaveKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('anthropic_api_key', apiKey.trim())
      setKeySaved(true)
      setTimeout(() => setKeySaved(false), 2000)
    }
  }

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return
    if (!apiKey.trim()) {
      alert('Please enter your Anthropic API key first')
      return
    }

    // Reset state
    setStatus('generating')
    setError('')
    setLogs([])
    setDownloadUrl('')

    // Generate project name from prompt
    const name = prompt.split(' ').slice(0, 2).join('').replace(/[^a-zA-Z0-9]/g, '') || 'MyPlugin'
    setProjectName(name)

    addLog(`Starting plugin generation: "${prompt}"`)
    addLog(`Project name: ${name}`)

    try {
      // Call backend to generate plugin
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          apiKey: apiKey.trim(),
          projectName: name
        })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Generation failed')
      }

      const data = await response.json()
      addLog('Plugin code generated successfully!')
      addLog(`Files created: ${data.files?.length || 0}`)
      setStatus('generated')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      addLog(`Error: ${message}`)
      setStatus('error')
    }
  }

  const handleCompile = async () => {
    if (!projectName) return

    setStatus('compiling')
    addLog('Starting compilation...')

    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Compilation failed')
      }

      const data = await response.json()
      addLog('Compilation successful!')
      addLog(`Output: ${data.output}`)
      setDownloadUrl(data.downloadUrl || `/api/download/${projectName}`)
      setStatus('compiled')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      addLog(`Compilation error: ${message}`)
      setStatus('error')
    }
  }

  const handleReset = () => {
    setStatus('idle')
    setProjectName('')
    setLogs([])
    setError('')
    setDownloadUrl('')
    setPrompt('')
  }

  const isWorking = status === 'generating' || status === 'compiling'
  const canCompile = status === 'generated'
  const canDownload = status === 'compiled' && downloadUrl

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col relative">
      {/* Background image - fixed at bottom, full width */}
      <img 
        src="/image.jpg"
        alt=""
        className="absolute bottom-0 left-0 w-full h-auto pointer-events-none"
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-transparent via-bg-primary/50 to-bg-primary pointer-events-none" />
      {/* Minimal Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
          <span className="font-semibold text-base">VibeVST</span>
        </Link>
        <Link 
          to="/browse" 
          className="text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Browse Prompts
        </Link>
      </nav>

      {/* Main Content - Centered */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-32">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-bg-secondary border border-border text-sm text-text-secondary">
            <Sparkles className="w-4 h-4" />
            AI-Powered VST Development
          </div>
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-center mb-4"
        >
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            What will you <span className="italic text-accent mr-2">build</span> today?
          </h1>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="text-text-secondary text-lg mb-10 text-center"
        >
          Create VST plugins by describing what you want.
        </motion.p>

        {/* API Key Input */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="w-full max-w-2xl mb-4"
        >
          <div className="bg-bg-secondary border border-border rounded-xl p-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-text-secondary">
                <Key className="w-4 h-4" />
                <span className="text-sm font-medium">Anthropic API Key</span>
              </div>
              <div className="flex-1 relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 pr-20 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="p-1.5 text-text-tertiary hover:text-text-secondary transition-colors"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveKey}
                    disabled={!apiKey.trim()}
                    className="p-1.5 text-text-tertiary hover:text-accent disabled:opacity-40 transition-colors"
                  >
                    {keySaved ? <Check className="w-4 h-4 text-green-500" /> : <span className="text-xs font-medium">Save</span>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Input Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="w-full max-w-2xl"
        >
          <form onSubmit={handleSubmit}>
            <div className="bg-black border border-border rounded-2xl p-4 shadow-2xl shadow-black/50">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your plugin... e.g., A warm tape delay with adjustable wow and flutter, tempo sync, and a vintage-style GUI"
                rows={3}
                disabled={isWorking || status !== 'idle'}
                className="w-full bg-transparent text-text-primary placeholder:text-text-tertiary text-base resize-none outline-none disabled:opacity-50"
              />
              
              {/* Bottom bar */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-2 text-text-tertiary text-xs">
                  {apiKey ? (
                    <span className="flex items-center gap-1 text-green-500">
                      <Check className="w-3 h-3" /> API key set
                    </span>
                  ) : (
                    <span>Enter API key above</span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Reset button - show when not idle */}
                  {status !== 'idle' && (
                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={isWorking}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-text-secondary hover:text-text-primary disabled:opacity-40 text-sm transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Reset
                    </button>
                  )}

                  {/* Build button - initial state */}
                  {status === 'idle' && (
                    <button
                      type="submit"
                      disabled={!prompt.trim() || !apiKey.trim()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-full transition-colors"
                    >
                      Build now
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}

                  {/* Generating spinner */}
                  {status === 'generating' && (
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent/50 text-white text-sm font-medium rounded-full">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </div>
                  )}

                  {/* Compile button */}
                  {canCompile && (
                    <button
                      type="button"
                      onClick={handleCompile}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-full transition-colors"
                    >
                      <Hammer className="w-4 h-4" />
                      Compile
                    </button>
                  )}

                  {/* Compiling spinner */}
                  {status === 'compiling' && (
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500/50 text-white text-sm font-medium rounded-full">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Compiling...
                    </div>
                  )}

                  {/* Download button - only shows when compiled */}
                  {canDownload && (
                    <a
                      href={downloadUrl}
                      download
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-full transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download VST3
                    </a>
                  )}
                </div>
              </div>
            </div>
          </form>
        </motion.div>

        {/* Build Log Panel */}
        <AnimatePresence>
          {logs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-2xl mt-4"
            >
              <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
                  <Terminal className="w-4 h-4 text-text-tertiary" />
                  <span className="text-sm font-medium text-text-secondary">Build Log</span>
                  {projectName && (
                    <span className="text-xs text-text-tertiary">— {projectName}</span>
                  )}
                </div>
                <div className="p-4 max-h-48 overflow-y-auto font-mono text-xs">
                  {logs.map((log, i) => (
                    <div 
                      key={i} 
                      className={`${log.includes('Error') ? 'text-red-400' : log.includes('successful') ? 'text-green-400' : 'text-text-tertiary'}`}
                    >
                      {log}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Example prompts - only show when idle */}
        {status === 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-2"
          >
            <span className="text-text-tertiary text-sm">Try:</span>
            {['Chorus effect', 'Spectral analyzer', 'Lo-fi plugin'].map((example) => (
              <button
                key={example}
                onClick={() => setPrompt(example)}
                className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary bg-bg-secondary hover:bg-bg-tertiary border border-border rounded-full transition-colors"
              >
                {example}
              </button>
            ))}
          </motion.div>
        )}
      </main>

      {/* Subtle glow effect at bottom - removed since we have bg image */}
    </div>
  )
}
