import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Sparkles, Check, Loader2, Download, Hammer, Terminal, X, FolderTree, File, ChevronRight, ChevronDown, Code, Copy, Settings, AlertCircle, FolderOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { SettingsModal } from '@/components/ui/SettingsModal'
import { ProjectListModal } from '@/components/ui/ProjectListModal'

type BuildStatus = 'idle' | 'generating' | 'generated' | 'compiling' | 'compiled' | 'error'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
  size?: number
}

export function Create() {
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState<BuildStatus>('idle')
  const [projectName, setProjectName] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [showFileViewer, setShowFileViewer] = useState(false)
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string>('')
  const [loadingFile, setLoadingFile] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['Source']))
  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showProjects, setShowProjects] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Check for API key on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('anthropic_api_key')
    setIsConnected(!!savedKey)
  }, [])

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleConnectionChange = (connected: boolean) => {
    setIsConnected(connected)
  }

  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'file' = 'info') => {
    const prefix = type === 'file' ? '📄' : type === 'success' ? '✓' : type === 'error' ? '✗' : '→'
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${prefix} ${message}`])
  }

  // Fetch file tree
  const fetchFileTree = async () => {
    if (!projectName) return
    try {
      const response = await fetch(`/api/files/${projectName}`)
      if (response.ok) {
        const data = await response.json()
        setFileTree(data.tree || [])
        // Auto-expand Source folder
        setExpandedFolders(new Set(['Source', 'Source/DSP', 'Source/GUI']))
      }
    } catch (err) {
      console.error('Failed to fetch file tree:', err)
    }
  }

  // Fetch file content
  const fetchFileContent = async (filePath: string) => {
    if (!projectName) return
    setLoadingFile(true)
    setSelectedFile(filePath)
    try {
      const response = await fetch(`/api/files/${projectName}/content?path=${encodeURIComponent(filePath)}`)
      if (response.ok) {
        const data = await response.json()
        setFileContent(data.content)
      }
    } catch (err) {
      setFileContent('// Failed to load file')
    } finally {
      setLoadingFile(false)
    }
  }

  // Copy file content
  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(fileContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Toggle folder expansion
  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const getLanguageFromPath = (path: string) => {
    if (path.endsWith('.cpp') || path.endsWith('.h') || path.endsWith('.hpp')) return 'cpp'
    if (path.endsWith('.js')) return 'javascript'
    if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript'
    if (path.endsWith('.json')) return 'json'
    if (path.endsWith('.md')) return 'markdown'
    if (path.endsWith('.cmake') || path.endsWith('CMakeLists.txt')) return 'cmake'
    return 'plaintext'
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

    addLog(`Starting plugin generation: "${prompt}"`)
    addLog(`Project name: ${name}`)

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
                  addLog(data.message)
                  break
                case 'claude':
                  addLog(`🤖 ${data.message}`, 'info')
                  break
                case 'claude_error':
                  addLog(`⚠️ ${data.message}`, 'error')
                  break
                case 'file':
                  addLog(`📄 ${data.path} (${data.size}, ${data.lines} lines)`, 'file')
                  break
                case 'complete':
                  addLog('✅ Plugin code generated successfully!', 'success')
                  if (data.summary) {
                    addLog(`📊 Summary: ${data.summary.totalFiles} files, ${data.summary.totalSize}, ${data.summary.totalLines} lines`, 'success')
                  }
                  setTimeout(fetchFileTree, 500)
                  setStatus('generated')
                  break
                case 'error':
                  setError(data.message)
                  addLog(`❌ Error: ${data.message}`, 'error')
                  setStatus('error')
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
      addLog(`❌ Error: ${message}`, 'error')
      setStatus('error')
    }
  }

  const handleCompile = async () => {
    if (!projectName) return

    setStatus('compiling')
    addLog('Starting compilation...')
    addLog('Running CMake configure...')

    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName })
      })

      // Try to parse response as text first
      const text = await response.text()
      let data
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(text || 'Server returned invalid response')
      }

      if (!response.ok) {
        throw new Error(data.error || 'Compilation failed')
      }

      addLog('Compilation successful!', 'success')
      addLog(`Output: ${data.output}`)
      setDownloadUrl(data.downloadUrl || `/api/download/${projectName}`)
      setStatus('compiled')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      addLog(`Compilation error: ${message}`, 'error')
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
    setShowFileViewer(false)
    setFileTree([])
    setSelectedFile(null)
    setFileContent('')
  }

  const handleLoadProject = async (name: string) => {
    handleReset()
    setProjectName(name)
    setStatus('generated')
    setShowProjects(false)
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
          // Replay logs
          const newLogs: string[] = []
          data.logs.forEach((log: any) => {
            // Format log based on type
            let prefix = '→'
            let type = 'info'
            
            switch (log.type) {
              case 'log':
                prefix = '→'
                break
              case 'claude':
                prefix = '🤖'
                type = 'info'
                break
              case 'claude_error':
                prefix = '⚠️'
                type = 'error'
                break
              case 'file':
                prefix = '📄'
                type = 'file'
                break
              case 'complete':
                prefix = '✓'
                type = 'success'
                break
              case 'error':
                prefix = '✗'
                type = 'error'
                break
            }
            
            // Format message
            let message = log.message
            if (log.type === 'file') {
              message = `${log.path} (${log.size}, ${log.lines} lines)`
            }
            
            // Use timestamp from log if available, otherwise current time
            const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()
            newLogs.push(`[${time}] ${prefix} ${message}`)
          })
          setLogs(prev => [...prev, ...newLogs])
        }
      }
    } catch (err) {
      console.error('Failed to load logs:', err)
    }

    // Trigger file tree fetch after state update
    setTimeout(() => {
      fetchFileTree()
      setShowFileViewer(true)
    }, 100)
  }

  // Recursive file tree component
  const FileTreeNode = ({ node, depth = 0 }: { node: FileNode; depth?: number }) => {
    const isExpanded = expandedFolders.has(node.path)
    const isSelected = selectedFile === node.path

    if (node.type === 'folder') {
      return (
        <div>
          <button
            onClick={() => toggleFolder(node.path)}
            className="w-full flex items-center gap-1 py-1 px-2 hover:bg-bg-tertiary rounded text-left text-sm"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <FolderTree className="w-4 h-4 text-yellow-500" />
            <span className="text-text-secondary">{node.name}</span>
          </button>
          {isExpanded && node.children && (
            <div>
              {node.children.map((child) => (
                <FileTreeNode key={child.path} node={child} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      )
    }

    return (
      <button
        onClick={() => fetchFileContent(node.path)}
        className={`w-full flex items-center gap-2 py-1 px-2 rounded text-left text-sm ${
          isSelected ? 'bg-accent/20 text-accent' : 'hover:bg-bg-tertiary text-text-tertiary'
        }`}
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
      >
        <File className="w-4 h-4" />
        <span>{node.name}</span>
        {node.size && <span className="text-xs opacity-50 ml-auto">{(node.size / 1024).toFixed(1)}KB</span>}
      </button>
    )
  }

  const isWorking = status === 'generating' || status === 'compiling'
  const canCompile = status === 'generated'
  const canDownload = status === 'compiled' && downloadUrl
  const hasFiles = status === 'generated' || status === 'compiled' || (status === 'error' && projectName)

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
            onClick={() => setShowProjects(true)}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2"
          >
            <FolderOpen className="w-4 h-4" />
            Load Project
          </button>
          <Link 
            to="/browse" 
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Browse Prompts
          </Link>
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

                  {/* View Code button - show when files exist */}
                  {hasFiles && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowFileViewer(!showFileViewer)
                        if (fileTree.length === 0) fetchFileTree()
                      }}
                      className={`inline-flex items-center gap-2 px-4 py-2.5 border text-sm font-medium rounded-full transition-colors ${
                        showFileViewer 
                          ? 'bg-accent/20 border-accent text-accent' 
                          : 'border-border text-text-secondary hover:text-text-primary hover:border-text-tertiary'
                      }`}
                    >
                      <Code className="w-4 h-4" />
                      View Code
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
                  <span className="ml-auto text-xs text-text-tertiary">{logs.length} lines</span>
                </div>
                <div className="p-4 max-h-80 overflow-y-auto font-mono text-xs scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                  {logs.map((log, i) => (
                    <div 
                      key={i} 
                      className={`${
                        log.includes('✗') || log.includes('Error') || log.includes('⚠️') || log.includes('❌')
                          ? 'text-red-400' 
                          : log.includes('✓') || log.includes('successful') || log.includes('✅')
                            ? 'text-green-400' 
                            : log.includes('📄') 
                              ? 'text-blue-400'
                              : log.includes('🤖')
                                ? 'text-purple-400'
                                : 'text-text-tertiary'
                      }`}
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

        {/* File Viewer Panel */}
        <AnimatePresence>
          {showFileViewer && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-4xl mt-4"
            >
              <div className="bg-bg-secondary border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-text-tertiary" />
                    <span className="text-sm font-medium text-text-secondary">Project Files</span>
                    {projectName && (
                      <span className="text-xs text-text-tertiary">— {projectName}/</span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowFileViewer(false)}
                    className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="flex h-96">
                  {/* File Tree Sidebar */}
                  <div className="w-64 border-r border-border overflow-y-auto p-2">
                    {fileTree.length > 0 ? (
                      fileTree.map((node) => (
                        <FileTreeNode key={node.path} node={node} />
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-text-tertiary text-sm gap-2">
                        {status === 'generating' ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Generating files...</span>
                          </>
                        ) : (
                          <>
                            <FolderTree className="w-8 h-8 opacity-20" />
                            <span>No files found</span>
                            <button 
                              onClick={fetchFileTree}
                              className="text-xs text-accent hover:underline mt-1"
                            >
                              Refresh
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Code Viewer */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {selectedFile ? (
                      <>
                        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-primary">
                          <span className="text-xs text-text-tertiary font-mono">{selectedFile}</span>
                          <button
                            onClick={copyToClipboard}
                            className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary transition-colors"
                          >
                            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                            {copied ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <div className="flex-1 overflow-hidden bg-[#1e1e1e]">
                          {loadingFile ? (
                            <div className="flex items-center justify-center h-full text-text-tertiary">
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              Loading file...
                            </div>
                          ) : (
                            <Editor
                              height="100%"
                              language={getLanguageFromPath(selectedFile)}
                              value={fileContent}
                              theme="vs-dark"
                              options={{
                                readOnly: true,
                                minimap: { enabled: false },
                                fontSize: 12,
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                padding: { top: 16, bottom: 16 }
                              }}
                            />
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
                        Select a file to view its contents
                      </div>
                    )}
                  </div>
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
            {[
              { label: '3 band EQ', prompt: 'make me a simple 3 band eq plugin' },
              { label: 'Chorus effect', prompt: 'Chorus effect' },
              { label: 'Spectral analyzer', prompt: 'Spectral analyzer' },
              { label: 'Lo-fi plugin', prompt: 'Lo-fi plugin' }
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
