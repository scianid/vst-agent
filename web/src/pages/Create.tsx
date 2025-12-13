import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles, Check, Loader2, X, Settings, AlertCircle, FolderOpen, Clock, Folder } from 'lucide-react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { SettingsModal } from '@/components/ui/SettingsModal'
import { ProjectListModal } from '@/components/ui/ProjectListModal'
import { IdeLayout, LogEntry } from '@/components/IdeLayout'

type BuildStatus = 'idle' | 'generating' | 'generated' | 'compiling' | 'compiled' | 'error'

interface Project {
  name: string
  modified: string
  created: string
}

interface FileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
  size?: number
}

export function Create() {
  const { projectName: urlProjectName } = useParams()
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState<BuildStatus>('idle')
  const [projectName, setProjectName] = useState('')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [, setError] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [downloads, setDownloads] = useState<{ linux: string | null, windows: string | null }>({ linux: null, windows: null })
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [showSettings, setShowSettings] = useState(false)
  const [showProjects, setShowProjects] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [recentProjects, setRecentProjects] = useState<Project[]>([])
  const [platform, setPlatform] = useState<'linux' | 'windows'>('windows')
  const logsEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Check for API key on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('anthropic_api_key')
    setIsConnected(!!savedKey)
    fetchProjects()
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`
    }
  }, [prompt])

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        if (data.projects && Array.isArray(data.projects)) {
          setRecentProjects(data.projects)
        }
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err)
    }
  }

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Load project from URL
  useEffect(() => {
    if (urlProjectName && urlProjectName !== projectName) {
      loadProjectData(urlProjectName)
    } else if (!urlProjectName && projectName) {
      handleResetState()
    }
  }, [urlProjectName])

  const loadProjectData = async (name: string) => {
    // Reset state for new project
    setStatus('generated')
    setProjectName(name)
    setLogs([])
    setError('')
    setDownloadUrl('')
    setPrompt('')
    setFileTree([])
    setSelectedFile(null)
    setFileContent('')
    
    addLog(`Loaded project: ${name}`, 'success')
    
    // Fetch prompt
    try {
      const res = await fetch(`/api/projects/${name}/prompt`)
      if (res.ok) {
        const data = await res.json()
        if (data.prompt) {
          setPrompt(data.prompt)
        }
      }
    } catch (err) {
      console.error('Failed to load prompt:', err)
    }
    
    // Fetch logs
    try {
      const res = await fetch(`/api/projects/${name}/logs`)
      if (res.ok) {
        const data = await res.json()
        if (data.logs && Array.isArray(data.logs)) {
          setLogs(data.logs)
        }
      }
    } catch (err) {
      console.error('Failed to load logs:', err)
    }

    // Trigger file tree fetch
    fetchFileTree(name)
    // Check if already compiled for current platform
    checkBuildStatus(name)
  }

  const checkBuildStatus = async (name: string) => {
    try {
      // Check Linux
      const resLinux = await fetch(`/api/projects/${name}/build-status?platform=linux`)
      const dataLinux = await resLinux.json()
      
      // Check Windows
      const resWin = await fetch(`/api/projects/${name}/build-status?platform=windows`)
      const dataWin = await resWin.json()

      setDownloads({
        linux: dataLinux.compiled ? dataLinux.downloadUrl : null,
        windows: dataWin.compiled ? dataWin.downloadUrl : null
      })
      
      // Update status if currently selected platform is compiled
      if ((platform === 'linux' && dataLinux.compiled) || (platform === 'windows' && dataWin.compiled)) {
         setStatus('compiled')
      } else {
         // If we are just checking status on load/switch, and it's not compiled, 
         // we should probably keep it as 'generated' (since code exists) or 'idle' if no code?
         // But loadProjectData sets it to 'generated'.
         // If we switch platform and it's not compiled, it should be 'generated' (ready to compile).
         if (status === 'compiled') setStatus('generated') 
      }
    } catch (err) {
      console.error('Failed to check build status:', err)
    }
  }

  const handleResetState = () => {
    setStatus('idle')
    setProjectName('')
    setLogs([])
    setError('')
    setDownloadUrl('')
    setDownloads({ linux: null, windows: null })
    setPrompt('')
    setFileTree([])
    setSelectedFile(null)
    setFileContent('')
  }

  const handleConnectionChange = (connected: boolean) => {
    setIsConnected(connected)
  }

  const addLog = (message: string, type: LogEntry['type'] = 'info', extra: Partial<LogEntry> = {}) => {
    setLogs(prev => [...prev, {
      type,
      message,
      timestamp: new Date().toISOString(),
      ...extra
    }])
  }

  // Fetch file tree
  const fetchFileTree = async (nameOverride?: string) => {
    const targetName = typeof nameOverride === 'string' ? nameOverride : projectName
    if (!targetName) return
    try {
      const response = await fetch(`/api/files/${targetName}`)
      if (response.ok) {
        const data = await response.json()
        setFileTree(data.tree || [])
      }
    } catch (err) {
      console.error('Failed to fetch file tree:', err)
    }
  }

  // Fetch file content
  const fetchFileContent = async (filePath: string) => {
    if (!projectName) return
    setSelectedFile(filePath)
    try {
      const response = await fetch(`/api/files/${projectName}/content?path=${encodeURIComponent(filePath)}`)
      if (response.ok) {
        const data = await response.json()
        setFileContent(data.content)
      }
    } catch (err) {
      setFileContent('// Failed to load file')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return
    
    const apiKey = localStorage.getItem('anthropic_api_key')
    if (!apiKey) {
      setShowSettings(true)
      return
    }

    // Reset state
    setStatus('generating')
    setError('')
    setLogs([])
    setDownloadUrl('')

    // Generate project name from prompt with unique suffix
    const baseName = prompt.split(' ').slice(0, 2).join('').replace(/[^a-zA-Z0-9]/g, '') || 'MyPlugin'
    const uniqueId = Date.now().toString(36).slice(-4) // Short 4-char unique ID
    const name = `${baseName}_${uniqueId}`
    setProjectName(name)

    addLog(`Starting plugin generation: "${prompt}"`, 'info')
    addLog(`Project name: ${name}`, 'info')

    try {
      // Use streaming endpoint for real-time Claude Code logs
      const response = await fetch('/api/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          apiKey: apiKey,
          projectName: name
        })
      })

      if (!response.ok) {
        throw new Error('Failed to start generation')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response stream')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              switch (data.type) {
                case 'log':
                  addLog(data.message, 'log')
                  break
                case 'claude':
                  addLog(data.message, 'claude')
                  break
                case 'claude_error':
                  addLog(data.message, 'claude_error')
                  break
                case 'file':
                  addLog(data.path, 'file', { size: data.size, lines: data.lines })
                  break
                case 'complete':
                  addLog('Plugin code generated successfully!', 'success')
                  if (data.summary) {
                    addLog(`Summary: ${data.summary.totalFiles} files, ${data.summary.totalSize}, ${data.summary.totalLines} lines`, 'success')
                  }
                  setTimeout(() => fetchFileTree(name), 500)
                  setStatus('generated')
                  break
                case 'error':
                  setError(data.message)
                  addLog(`Error: ${data.message}`, 'error')
                  setStatus('error')
                  break
                case 'user_prompt':
                  addLog(data.message, 'user_prompt')
                  break
              }
            } catch (err) {
              // Ignore parse errors for incomplete JSON
            }
          }
        }
      }
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      addLog(`Error: ${message}`, 'error')
      setStatus('error')
    }
  }

  const handleSendPrompt = async (newPrompt: string) => {
    if (!projectName) return
    
    const apiKey = localStorage.getItem('anthropic_api_key')
    if (!apiKey) {
      setShowSettings(true)
      return
    }

    setStatus('generating')
    
    try {
      const response = await fetch('/api/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: newPrompt.trim(),
          apiKey: apiKey,
          projectName: projectName
        })
      })

      if (!response.ok) {
        throw new Error('Failed to start generation')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response stream')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              switch (data.type) {
                case 'log':
                  addLog(data.message, 'log')
                  break
                case 'claude':
                  addLog(data.message, 'claude')
                  break
                case 'claude_error':
                  addLog(data.message, 'claude_error')
                  break
                case 'file':
                  addLog(data.path, 'file', { size: data.size, lines: data.lines })
                  break
                case 'complete':
                  addLog('Changes applied successfully!', 'success')
                  setTimeout(() => fetchFileTree(projectName), 500)
                  setStatus('generated')
                  break
                case 'error':
                  setError(data.message)
                  addLog(`Error: ${data.message}`, 'error')
                  setStatus('error')
                  break
                case 'user_prompt':
                  addLog(data.message, 'user_prompt')
                  break
              }
            } catch (err) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      addLog(`Error: ${message}`, 'error')
      setStatus('error')
    }
  }

  const handlePlatformChange = (newPlatform: 'linux' | 'windows') => {
    setPlatform(newPlatform)
    // Check if compiled for new platform
    if (projectName) {
      // We already have the downloads state, just update status
      if (downloads[newPlatform]) {
        setStatus('compiled')
      } else {
        setStatus('generated')
      }
    }
  }

  const handleCompile = async (platformOverride?: 'linux' | 'windows') => {
    if (!projectName) return

    const targetPlatform = platformOverride || platform
    if (platformOverride && platformOverride !== platform) {
      setPlatform(platformOverride)
    }

    setStatus('compiling')
    addLog(`Starting compilation for ${targetPlatform}...`, 'info')
    
    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, platform: targetPlatform })
      })

      if (!response.ok) {
        throw new Error('Failed to start compilation')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response stream')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              switch (data.type) {
                case 'log':
                  addLog(data.message, 'log')
                  break
                case 'complete':
                  addLog(data.message, 'success')
                  setDownloadUrl(data.downloadUrl)
                  setDownloads(prev => ({
                    ...prev,
                    [targetPlatform]: data.downloadUrl
                  }))
                  setStatus('compiled')
                  break
                case 'error':
                  setError(data.message)
                  addLog(`Compilation error: ${data.message}`, 'error')
                  setStatus('error')
                  break
              }
            } catch (err) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      addLog(`Compilation error: ${message}`, 'error')
      setStatus('error')
    }
  }

  const handleReset = () => {
    navigate('/')
  }

  const handleLoadProject = (name: string) => {
    setShowProjects(false)
    navigate(`/projects/${name}`)
  }

  const isWorking = status === 'generating' || status === 'compiling'

  if (projectName) {
    return (
      <>
        <IdeLayout
          projectName={projectName}
          fileTree={fileTree}
          selectedFile={selectedFile}
          fileContent={fileContent}
          logs={logs}
          status={status}
          downloads={downloads}
          isWorking={isWorking}
          platform={platform}
          onPlatformChange={handlePlatformChange}
          onCompile={handleCompile}
          onSelectFile={fetchFileContent}
          onSendPrompt={handleSendPrompt}
          onBack={handleReset}
          onRefreshFiles={() => fetchFileTree(projectName)}
        />
        <SettingsModal 
          isOpen={showSettings} 
          onClose={() => setShowSettings(false)}
          onConnectionChange={handleConnectionChange}
        />
      </>
    )
  }

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
          <span className="font-semibold text-base">VibeVST</span>
        </Link>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowSettings(true)}
            className="relative p-2 text-text-secondary hover:text-text-primary hover:bg-bg-secondary/50 rounded-lg transition-colors"
            title={isConnected ? 'Connected to Anthropic' : 'Configure API Key'}
          >
            <Settings className="w-5 h-5" />
            <span 
              className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-yellow-500'
              }`} 
            />
          </button>
          <button 
            onClick={() => setShowProjects(true)}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2"
          >
            <FolderOpen className="w-4 h-4" />
            Load Project
          </button>
        </div>
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
            Let's <span className="italic text-accent mr-2">create</span> something amazing!
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

        {/* API Key Status Banner - only show if not connected */}
        {!isConnected && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="w-full max-w-2xl mb-4"
          >
            <button
              onClick={() => setShowSettings(true)}
              className="w-full bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center gap-3 hover:bg-yellow-500/20 transition-colors text-left"
            >
              <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-500">API Key Required</p>
                <p className="text-xs text-text-tertiary">Click to configure your Anthropic API key</p>
              </div>
              <Settings className="w-4 h-4 text-text-tertiary" />
            </button>
          </motion.div>
        )}

        {/* Input Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: isConnected ? 0.2 : 0.25 }}
          className="w-full max-w-2xl"
        >
          <form onSubmit={handleSubmit}>
            <div className="bg-black border border-border rounded-2xl p-4 shadow-2xl shadow-black/50">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your plugin... e.g., A warm tape delay with adjustable wow and flutter, tempo sync, and a vintage-style GUI"
                rows={1}
                disabled={isWorking || status !== 'idle'}
                className="w-full bg-transparent text-text-primary placeholder:text-text-tertiary text-base resize-none outline-none disabled:opacity-50 overflow-y-auto"
                style={{ minHeight: '80px' }}
              />
              
              {/* Bottom bar */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-2 text-text-tertiary text-xs">
                  {isConnected ? (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-green-500">
                        <Check className="w-3 h-3" /> Ready to build
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.removeItem('anthropic_api_key')
                          setIsConnected(false)
                        }}
                        className="text-text-tertiary hover:text-red-400 transition-colors"
                        title="Clear API key"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      type="button"
                      onClick={() => setShowSettings(true)}
                      className="flex items-center gap-1 text-yellow-500 hover:text-yellow-400 transition-colors"
                    >
                      <Settings className="w-3 h-3" /> Configure API key
                    </button>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Build button - initial state */}
                  {status === 'idle' && (
                    <button
                      type="submit"
                      disabled={!prompt.trim() || !isConnected}
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
                </div>
              </div>
            </div>
          </form>
        </motion.div>

        {/* Example prompts - only show when idle */}
        {status === 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-2"
          >
            <span className="text-text-tertiary text-sm">Try:</span>
            {[
              { label: '3 band EQ', prompt: 'Create a VST 3-band EQ plugin with a simple rectangular interface. Include three main bands—Low, Mid, and High—each with controls for Gain, Frequency, and Q, arranged in evenly spaced rows or columns with clear labels beneath each control. Add a small toggle or menu for selecting EQ curves or filter types (e.g., bell, shelf, high-pass, low-pass). Include a compact visual display showing the overall EQ curve in real-time. Use a minimal, organized layout focused on clarity: evenly spaced elements, uniform knob sizes, readable text, and no unnecessary decoration. The EQ should provide precise, smooth adjustments, work well on all audio sources, and remain CPU-efficient.' },
              { label: 'Chorus effect', prompt: 'Create a VST chorus plugin with a simple rectangular interface. Place round knobs for rate, depth, mix, stereo width, delay offset, and warmth in one or two evenly spaced rows, with clear labels under each control. Include a small switch or dropdown for selecting Soft, Wide, or Deep mode, and add a compact display area showing current values or modulation activity. Style the interface with a minimal, consistent look focused on clarity and usability: evenly spaced elements, uniform knob sizes, readable text, subtle separation between sections, no clutter, and a balanced, symmetrical layout. The effect should sound smooth and wide, work well on synths, guitars, and vocals.' },
              { label: 'Spectral analyzer', prompt: 'Create a VST spectral analyzer plugin with a simple rectangular interface. The main area should display a real-time frequency spectrum with adjustable resolution and smoothing. Include controls for scale (linear/log), speed, smoothing amount, peak hold, and range. Add a small settings panel or dropdown for FFT size, window type, and refresh rate. Style the interface with a minimal, consistent layout focused on clarity and readability: evenly spaced controls, clear labels beneath each control, uniform sizes, and an unobstructed visualization area. Keep the design clean, organized, and easy to interpret, with no unnecessary decoration. The analyzer should update smoothly, and accurately display frequencies across the full audio range.' },
              { label: 'Lo-fi plugin', prompt: 'Create a VST lo-fi effect plugin with a simple rectangular interface. Include round knobs for bit depth, sample rate reduction, noise amount, wobble intensity, wobble rate, saturation, and mix, arranged in one or two evenly spaced rows with clear labels beneath each control. Add a small toggle or menu for selecting different lo-fi modes such as Tape, Vinyl, and Digital. Include a compact display area that shows activity or current parameter values. Use a minimal, organized layout focused on clarity, even spacing, uniform control sizes, readable text, and no unnecessary decoration. The effect should deliver warm, degraded textures with controllable character while remaining stable and CPU-efficient.' }
            ].map((example) => (
              <button
                key={example.label}
                onClick={() => setPrompt(example.prompt)}
                className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary bg-bg-secondary hover:bg-bg-tertiary border border-border rounded-full transition-colors"
              >
                {example.label}
              </button>
            ))}
          </motion.div>
        )}

        {/* Recent Projects */}
        {status === 'idle' && recentProjects.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="mt-12 w-full max-w-4xl"
          >
            <div className="flex items-center gap-2 mb-4 text-text-secondary">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-medium">Recent Projects</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {recentProjects.map((project) => (
                <button
                  key={project.name}
                  onClick={() => handleLoadProject(project.name)}
                  className="group flex flex-col items-start p-4 bg-bg-secondary/50 hover:bg-bg-secondary border border-border hover:border-accent/50 rounded-xl transition-all text-left"
                >
                  <div className="flex items-center gap-2 mb-2 text-text-primary group-hover:text-accent transition-colors">
                    <Folder className="w-4 h-4" />
                    <span className="font-medium truncate w-full">{project.name}</span>
                  </div>
                  <div className="text-xs text-text-tertiary">
                    Last modified: {new Date(project.modified).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </main>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)}
        onConnectionChange={handleConnectionChange}
      />
      {/* Project List Modal */}
      <ProjectListModal
        isOpen={showProjects}
        onClose={() => setShowProjects(false)}
        onSelectProject={handleLoadProject}
      />
    </div>
  )
}

