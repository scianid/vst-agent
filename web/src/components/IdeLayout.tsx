import React, { useState, useEffect, useRef } from 'react'
import { 
  FolderTree, File, ChevronRight, ChevronDown, 
  Play, Download, ArrowLeft, 
  MessageSquare, Terminal, Send, Loader2,
  Copy, Check, Sparkles, Monitor, Cpu
} from 'lucide-react'
import Editor from '@monaco-editor/react'
import { motion, AnimatePresence } from 'framer-motion'

// Types
export interface FileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
  size?: number
}

export interface LogEntry {
  type: 'log' | 'info' | 'success' | 'error' | 'file' | 'user_prompt' | 'claude' | 'claude_error' | 'complete'
  message: string
  timestamp: string
  path?: string
  size?: string
  lines?: number
}

export interface DownloadLinks {
  vst3: string | null
  standalone: string | null
}

interface IdeLayoutProps {
  projectName: string
  fileTree: FileNode[]
  selectedFile: string | null
  fileContent: string
  logs: LogEntry[]
  status: 'idle' | 'generating' | 'generated' | 'compiling' | 'compiled' | 'error'
  downloads: { linux: DownloadLinks, windows: DownloadLinks, mac: DownloadLinks }
  isWorking: boolean
  platform: 'linux' | 'windows' | 'mac'
  onPlatformChange: (platform: 'linux' | 'windows' | 'mac') => void
  onCompile: (platform?: 'linux' | 'windows' | 'mac') => void
  onSelectFile: (path: string) => void
  onSendPrompt: (prompt: string) => void
  onBack: () => void
  onRefreshFiles: () => void
}

const ChatBubble = ({ msg, onFixError }: { msg: LogEntry, onFixError: () => void }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const message = msg.message || ''
  const isLong = message.length > 500 || message.split('\n').length > 10
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col ${msg.type === 'user_prompt' ? 'items-end' : 'items-start'}`}
    >
      <div 
        className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm break-words whitespace-pre-wrap shadow-sm ${
          msg.type === 'user_prompt' 
            ? 'bg-accent text-white rounded-br-none' 
            : msg.type === 'error' 
              ? 'bg-red-500/10 text-red-400 border border-red-500/20 rounded-bl-none'
              : msg.type === 'success'
                ? 'bg-green-500/10 text-green-400 border border-green-500/20 rounded-bl-none'
                : 'bg-white/10 text-text-primary border border-white/5 rounded-bl-none'
        }`}
      >
        <div className={!isExpanded && isLong ? "max-h-60 overflow-hidden relative" : ""}>
           {message}
           {!isExpanded && isLong && (
             <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-black/20 to-transparent" />
           )}
        </div>
        
        {isLong && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs opacity-70 hover:opacity-100 mt-2 font-medium underline decoration-dotted"
          >
            {isExpanded ? "Show less" : "Show more"}
          </button>
        )}

        {msg.type === 'error' && (
          <button
            onClick={onFixError}
            className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-xs font-medium text-red-200 transition-colors w-fit"
          >
            <Sparkles className="w-3 h-3" />
            Fix It
          </button>
        )}
      </div>
      <span className="text-[10px] text-text-tertiary mt-1.5 px-1">
        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </motion.div>
  )
}

export function IdeLayout({
  projectName,
  fileTree,
  selectedFile,
  fileContent,
  logs,
  status,
  downloads,
  isWorking,
  platform,
  onPlatformChange,
  onCompile,
  onSelectFile,
  onSendPrompt,
  onBack,
  onRefreshFiles
}: IdeLayoutProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'console'>('chat')
  const [prompt, setPrompt] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['Source', 'Source/DSP', 'Source/GUI']))
  const [copied, setCopied] = useState(false)
  const [showDownloadMenu, setShowDownloadMenu] = useState(false)
  const [showCompileMenu, setShowCompileMenu] = useState(false)
  
  const chatEndRef = useRef<HTMLDivElement>(null)
  const consoleEndRef = useRef<HTMLDivElement>(null)
  const downloadMenuRef = useRef<HTMLDivElement>(null)
  const compileMenuRef = useRef<HTMLDivElement>(null)
  const miniLogRef = useRef<HTMLDivElement>(null)

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
        setShowDownloadMenu(false)
      }
      if (compileMenuRef.current && !compileMenuRef.current.contains(event.target as Node)) {
        setShowCompileMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    } else {
      consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    
    // Auto-scroll mini log window
    if (miniLogRef.current) {
      miniLogRef.current.scrollTop = miniLogRef.current.scrollHeight
    }
  }, [logs, activeTab, isWorking])

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || isWorking) return
    onSendPrompt(prompt)
    setPrompt('')
  }

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(fileContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

  const handleFixError = () => {
    const recentLogs = logs
      .slice(-100)
      .map(l => l.message)
      .join('\n')
      .slice(-50000) // Limit to last 50k chars to avoid payload too large
    
    onSendPrompt(`The compilation failed. Please analyze the logs and fix the issue.\n\nLogs:\n${recentLogs}`)
  }

  // Filter logs for chat view
  const chatMessages = logs.filter(log => 
    log.type === 'user_prompt' || 
    (log.type === 'claude' && !log.message.startsWith('🔧')) || // Hide tool use in chat
    log.type === 'complete' ||
    log.type === 'error' ||
    log.type === 'success'
  )

  // File Tree Component
  const FileTreeNode = ({ node, depth = 0 }: { node: FileNode; depth?: number }) => {
    const isExpanded = expandedFolders.has(node.path)
    const isSelected = selectedFile === node.path

    if (node.type === 'folder') {
      return (
        <div>
          <button
            onClick={() => toggleFolder(node.path)}
            className="w-full flex items-center gap-1 py-1.5 px-2 hover:bg-white/5 rounded-lg text-left text-sm text-text-secondary transition-colors"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <FolderTree className="w-4 h-4 text-yellow-500/80" />
            <span className="truncate font-medium">{node.name}</span>
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
        onClick={() => onSelectFile(node.path)}
        className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left text-sm transition-all ${
          isSelected 
            ? 'bg-accent/20 text-accent shadow-sm shadow-accent/10' 
            : 'hover:bg-white/5 text-text-tertiary hover:text-text-secondary'
        }`}
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
      >
        <File className="w-4 h-4 opacity-70" />
        <span className="truncate">{node.name}</span>
      </button>
    )
  }

  return (
    <div className="h-screen flex flex-col relative overflow-hidden bg-bg-primary text-text-primary">
      {/* Background - Shared with Create page */}
      <div className="absolute inset-0 z-0">
        <img 
          src="/image.jpg"
          alt=""
          className="w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/95 to-bg-primary/90" />
      </div>

      {/* Top Bar */}
      <header className="relative z-20 h-16 border-b border-white/5 flex items-center justify-between px-6 bg-black/20 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack} 
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-text-secondary hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base tracking-tight">{projectName}</h1>
              <span className={`flex h-2 w-2 rounded-full ${isWorking ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
            </div>
            <div className="text-xs text-text-tertiary flex items-center gap-1">
              <span className="opacity-50">Status:</span>
              <span className={status === 'error' ? 'text-red-400' : 'text-text-secondary'}>
                {status === 'idle' ? 'Ready' : status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative" ref={compileMenuRef}>
            <button
              onClick={() => setShowCompileMenu(!showCompileMenu)}
              disabled={isWorking}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-full transition-all shadow-lg shadow-accent/20 hover:shadow-accent/40"
            >
              {status === 'compiling' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
              Compile
              <ChevronDown className={`w-3 h-3 transition-transform ${showCompileMenu ? 'rotate-180' : ''}`} />
            </button>
            
            <AnimatePresence>
              {showCompileMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.1 }}
                  className="absolute right-0 top-full mt-2 w-56 bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
                >
                  <div className="p-1">
                    <button
                      onClick={() => {
                        onCompile('windows')
                        setShowCompileMenu(false)
                      }}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl text-sm text-text-primary transition-colors w-full text-left group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                        <Monitor className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium">Windows</div>
                        <div className="text-[10px] text-text-tertiary">Default Target</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        onCompile('linux')
                        setShowCompileMenu(false)
                      }}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl text-sm text-text-primary transition-colors w-full text-left group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center text-yellow-400 group-hover:scale-110 transition-transform">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium">Linux</div>
                        <div className="text-[10px] text-text-tertiary">Native Build</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        onCompile('mac')
                        setShowCompileMenu(false)
                      }}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl text-sm text-text-primary transition-colors w-full text-left group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                        <Monitor className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-medium">macOS</div>
                        <div className="text-[10px] text-text-tertiary">Cross-Compile</div>
                      </div>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {(status === 'compiled' || downloads.linux.vst3 || downloads.linux.standalone || downloads.windows.vst3 || downloads.windows.standalone || downloads.mac.vst3 || downloads.mac.standalone) && (
            <div className="relative" ref={downloadMenuRef}>
              <button
                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-full text-sm font-medium transition-all shadow-lg shadow-green-600/20 hover:shadow-green-600/40"
              >
                <Download className="w-4 h-4" />
                Download
                <ChevronDown className={`w-3 h-3 transition-transform ${showDownloadMenu ? 'rotate-180' : ''}`} />
              </button>
              
              <AnimatePresence>
                {showDownloadMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.1 }}
                    className="absolute right-0 top-full mt-2 w-72 bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-[80vh] overflow-y-auto"
                  >
                    <div className="p-1">
                      {/* Empty State */}
                      {!(downloads.linux.vst3 || downloads.linux.standalone || downloads.windows.vst3 || downloads.windows.standalone || downloads.mac.vst3 || downloads.mac.standalone) && (
                        <div className="px-4 py-3 text-sm text-text-tertiary text-center">
                          <div className="mb-1">No downloads found</div>
                          <div className="text-xs opacity-50">Try compiling again</div>
                        </div>
                      )}

                      {/* Linux Downloads */}
                      {(downloads.linux.vst3 || downloads.linux.standalone) && (
                        <div className="px-4 py-2 text-xs font-bold text-text-tertiary uppercase tracking-wider">Linux</div>
                      )}
                      
                      {downloads.linux.vst3 && (
                        <a
                          href={downloads.linux.vst3}
                          download
                          className="flex items-center gap-3 px-4 py-2 hover:bg-white/10 rounded-xl text-sm text-text-primary transition-colors w-full text-left group"
                          onClick={() => setShowDownloadMenu(false)}
                        >
                          <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400 group-hover:scale-110 transition-transform">
                            <Download className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium">VST3 Plugin</div>
                            <div className="text-[10px] text-text-tertiary">Linux VST3 Bundle</div>
                          </div>
                        </a>
                      )}

                      {downloads.linux.standalone && (
                        <a
                          href={downloads.linux.standalone}
                          download
                          className="flex items-center gap-3 px-4 py-2 hover:bg-white/10 rounded-xl text-sm text-text-primary transition-colors w-full text-left group"
                          onClick={() => setShowDownloadMenu(false)}
                        >
                          <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400 group-hover:scale-110 transition-transform">
                            <Monitor className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium">Standalone App</div>
                            <div className="text-[10px] text-text-tertiary">Linux Executable</div>
                          </div>
                        </a>
                      )}
                      
                      {/* Windows Downloads */}
                      {(downloads.windows.vst3 || downloads.windows.standalone) && (
                        <div className="px-4 py-2 text-xs font-bold text-text-tertiary uppercase tracking-wider mt-2">Windows</div>
                      )}

                      {downloads.windows.vst3 && (
                        <a
                          href={downloads.windows.vst3}
                          download
                          className="flex items-center gap-3 px-4 py-2 hover:bg-white/10 rounded-xl text-sm text-text-primary transition-colors w-full text-left group"
                          onClick={() => setShowDownloadMenu(false)}
                        >
                          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                            <Download className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium">VST3 Plugin</div>
                            <div className="text-[10px] text-text-tertiary">Windows VST3 Bundle</div>
                          </div>
                        </a>
                      )}

                      {downloads.windows.standalone && (
                        <a
                          href={downloads.windows.standalone}
                          download
                          className="flex items-center gap-3 px-4 py-2 hover:bg-white/10 rounded-xl text-sm text-text-primary transition-colors w-full text-left group"
                          onClick={() => setShowDownloadMenu(false)}
                        >
                          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                            <Monitor className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium">Standalone App</div>
                            <div className="text-[10px] text-text-tertiary">Windows Executable (.exe)</div>
                          </div>
                        </a>
                      )}

                      {/* macOS Downloads */}
                      {(downloads.mac.vst3 || downloads.mac.standalone) && (
                        <div className="px-4 py-2 text-xs font-bold text-text-tertiary uppercase tracking-wider mt-2">macOS</div>
                      )}

                      {downloads.mac.vst3 && (
                        <a
                          href={downloads.mac.vst3}
                          download
                          className="flex items-center gap-3 px-4 py-2 hover:bg-white/10 rounded-xl text-sm text-text-primary transition-colors w-full text-left group"
                          onClick={() => setShowDownloadMenu(false)}
                        >
                          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                            <Download className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium">VST3 Plugin</div>
                            <div className="text-[10px] text-text-tertiary">macOS VST3 Bundle</div>
                          </div>
                        </a>
                      )}

                      {downloads.mac.standalone && (
                        <a
                          href={downloads.mac.standalone}
                          download
                          className="flex items-center gap-3 px-4 py-2 hover:bg-white/10 rounded-xl text-sm text-text-primary transition-colors w-full text-left group"
                          onClick={() => setShowDownloadMenu(false)}
                        >
                          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                            <Monitor className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-medium">Standalone App</div>
                            <div className="text-[10px] text-text-tertiary">macOS App Bundle</div>
                          </div>
                        </a>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex overflow-hidden p-4 gap-4">
        {/* Left Panel: Chat & Logs */}
        <div 
          className="flex flex-col w-[400px] rounded-2xl overflow-hidden border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl"
        >
          {/* Tabs */}
          <div className="flex border-b border-white/5 bg-black/20">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'chat' 
                  ? 'border-accent text-accent bg-white/5' 
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Chat
              </div>
            </button>
            <button
              onClick={() => setActiveTab('console')}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'console' 
                  ? 'border-accent text-accent bg-white/5' 
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Terminal className="w-4 h-4" />
                Console
              </div>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden relative">
            {activeTab === 'chat' ? (
              <div className="absolute inset-0 flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  {chatMessages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6">
                      <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-4">
                        <Sparkles className="w-6 h-6 text-accent" />
                      </div>
                      <h3 className="text-lg font-medium text-text-primary mb-2">Start Building</h3>
                      <p className="text-sm text-text-secondary">Describe changes or new features you want to add to your plugin.</p>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <ChatBubble key={i} msg={msg} onFixError={handleFixError} />
                  ))}
                  {isWorking && (
                    <div className="ml-2 self-start max-w-[90%] space-y-2">
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-3 text-text-tertiary text-xs bg-white/5 px-4 py-2 rounded-full w-fit"
                      >
                        <Loader2 className="w-3 h-3 animate-spin text-accent" />
                        <span>{status === 'compiling' ? 'Compiling...' : 'Claude is thinking...'}</span>
                      </motion.div>
                      
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-black/40 rounded-lg border border-white/10 overflow-hidden"
                      >
                        <div 
                          className="p-3 font-mono text-[10px] text-text-tertiary space-y-1"
                        >
                          {logs.slice(-4).map((log, i) => (
                            <div key={i} className="truncate flex items-center">
                              <span className="opacity-50 mr-2 shrink-0">
                                {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                              <span className={`truncate ${
                                log.type === 'error' ? 'text-red-400' :
                                log.type === 'success' ? 'text-green-400' :
                                log.type === 'file' ? 'text-blue-400' :
                                'opacity-80'
                              }`}>
                                {log.message}
                              </span>
                            </div>
                          ))}
                          {logs.length === 0 && <span className="opacity-30 italic">Waiting for logs...</span>}
                          
                          <button 
                            onClick={() => setActiveTab('console')}
                            className="w-full text-left mt-2 pt-2 border-t border-white/5 text-[10px] text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
                          >
                            <Terminal className="w-3 h-3" />
                            View all logs
                          </button>
                        </div>
                      </motion.div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                
                {/* Input */}
                <div className="p-4 border-t border-white/5 bg-black/20 backdrop-blur-md">
                  <form onSubmit={handleSend} className="relative">
                    <div className="relative bg-black/40 border border-white/10 rounded-2xl shadow-inner focus-within:border-accent/50 focus-within:bg-black/60 transition-all">
                      <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Ask Claude to make changes..."
                        disabled={isWorking}
                        className="w-full bg-transparent border-none rounded-2xl pl-4 pr-12 py-3.5 text-sm text-text-primary placeholder:text-text-tertiary focus:ring-0 disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={!prompt.trim() || isWorking}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-accent hover:bg-accent/10 rounded-xl transition-colors disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col bg-black/40">
                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1.5">
                  {logs.map((log, i) => (
                    <div 
                      key={i} 
                      className={`flex gap-2 ${
                        log.type === 'error' || log.type === 'claude_error' ? 'text-red-400' :
                        log.type === 'success' || log.type === 'complete' ? 'text-green-400' :
                        log.type === 'file' ? 'text-blue-400' :
                        log.type === 'claude' ? 'text-purple-400' :
                        'text-text-tertiary'
                      }`}
                    >
                      <span className="opacity-30 shrink-0">[{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  ))}
                  <div ref={consoleEndRef} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Editor */}
        <div className="flex-1 flex flex-col min-w-0 rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#1e1e1e]">
          {selectedFile ? (
            <>
              <div className="h-10 border-b border-white/5 flex items-center justify-between px-4 bg-[#252526]">
                <div className="flex items-center gap-2">
                  <File className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs text-text-secondary font-mono">{selectedFile}</span>
                </div>
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/5 text-xs text-text-tertiary hover:text-text-primary transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <Editor
                  height="100%"
                  language={getLanguageFromPath(selectedFile)}
                  value={fileContent}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    padding: { top: 16 },
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    scrollBeyondLastLine: false,
                    smoothScrolling: true
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-text-tertiary bg-[#1e1e1e]">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <File className="w-8 h-8 opacity-20" />
              </div>
              <p className="text-sm">Select a file to view code</p>
            </div>
          )}
        </div>

        {/* Right Sidebar: Files */}
        <div 
          className="flex flex-col w-72 rounded-2xl overflow-hidden border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl"
        >
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Explorer</span>
            <button onClick={onRefreshFiles} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
              <Loader2 className="w-3.5 h-3.5 text-text-tertiary" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {fileTree.map(node => <FileTreeNode key={node.path} node={node} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

