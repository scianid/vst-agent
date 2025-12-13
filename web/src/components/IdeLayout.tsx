import React, { useState, useEffect, useRef } from 'react'
import { 
  FolderTree, File, ChevronRight, ChevronDown, 
  Play, Download, ArrowLeft, 
  MessageSquare, Terminal, Send, Loader2,
  Copy, Check
} from 'lucide-react'
import Editor from '@monaco-editor/react'

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

interface IdeLayoutProps {
  projectName: string
  fileTree: FileNode[]
  selectedFile: string | null
  fileContent: string
  logs: LogEntry[]
  status: 'idle' | 'generating' | 'generated' | 'compiling' | 'compiled' | 'error'
  downloads: { linux: string | null, windows: string | null }
  isWorking: boolean
  platform: 'linux' | 'windows'
  onPlatformChange: (platform: 'linux' | 'windows') => void
  onCompile: () => void
  onSelectFile: (path: string) => void
  onSendPrompt: (prompt: string) => void
  onBack: () => void
  onRefreshFiles: () => void
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
  
  const chatEndRef = useRef<HTMLDivElement>(null)
  const consoleEndRef = useRef<HTMLDivElement>(null)
  const downloadMenuRef = useRef<HTMLDivElement>(null)

  // Close download menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
        setShowDownloadMenu(false)
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
  }, [logs, activeTab])

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

  // Filter logs for chat view
  const chatMessages = logs.filter(log => 
    log.type === 'user_prompt' || 
    (log.type === 'claude' && !log.message.startsWith('🔧')) || // Hide tool use in chat
    log.type === 'complete' ||
    log.type === 'error'
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
            className="w-full flex items-center gap-1 py-1 px-2 hover:bg-bg-tertiary rounded text-left text-sm text-text-secondary"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <FolderTree className="w-4 h-4 text-yellow-500" />
            <span className="truncate">{node.name}</span>
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
        className={`w-full flex items-center gap-2 py-1 px-2 rounded text-left text-sm ${
          isSelected ? 'bg-accent/20 text-accent' : 'hover:bg-bg-tertiary text-text-tertiary'
        }`}
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
      >
        <File className="w-4 h-4" />
        <span className="truncate">{node.name}</span>
      </button>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-bg-primary text-text-primary overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-bg-secondary shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-bg-tertiary rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-text-secondary" />
          </button>
          <div>
            <h1 className="font-semibold text-sm">{projectName}</h1>
            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <span className={`w-2 h-2 rounded-full ${isWorking ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
              {status === 'idle' ? 'Ready' : status}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={platform}
            onChange={(e) => onPlatformChange(e.target.value as 'linux' | 'windows')}
            className="bg-bg-tertiary border border-border rounded-md text-sm px-2 py-2 text-text-secondary focus:outline-none focus:border-accent"
            disabled={isWorking}
          >
            <option value="linux">Linux</option>
            <option value="windows">Windows</option>
          </select>

          <button
            onClick={onCompile}
            disabled={isWorking}
            className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary hover:bg-bg-primary border border-border rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            {status === 'compiling' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Compile
          </button>
          
          {(downloads.linux || downloads.windows) && (
            <div className="relative" ref={downloadMenuRef}>
              <button
                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
                <ChevronDown className={`w-3 h-3 transition-transform ${showDownloadMenu ? 'rotate-180' : ''}`} />
              </button>
              
              {showDownloadMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-bg-secondary border border-border rounded-lg shadow-xl overflow-hidden z-50">
                  {downloads.linux ? (
                    <a
                      href={downloads.linux}
                      download
                      className="flex items-center gap-2 px-4 py-3 hover:bg-bg-tertiary text-sm text-text-primary transition-colors w-full text-left"
                      onClick={() => setShowDownloadMenu(false)}
                    >
                      <Download className="w-4 h-4" />
                      Linux VST3
                    </a>
                  ) : (
                    <div className="px-4 py-3 text-sm text-text-tertiary italic border-b border-border/50">
                      Linux not compiled
                    </div>
                  )}
                  
                  {downloads.windows ? (
                    <a
                      href={downloads.windows}
                      download
                      className="flex items-center gap-2 px-4 py-3 hover:bg-bg-tertiary text-sm text-text-primary transition-colors w-full text-left border-t border-border/50"
                      onClick={() => setShowDownloadMenu(false)}
                    >
                      <Download className="w-4 h-4" />
                      Windows VST3
                    </a>
                  ) : (
                    <div className="px-4 py-3 text-sm text-text-tertiary italic border-t border-border/50">
                      Windows not compiled
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Chat & Logs */}
        <div 
          className="border-r border-border flex flex-col bg-bg-secondary w-96"
        >
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'chat' 
                  ? 'border-accent text-accent' 
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Chat
              </div>
            </button>
            <button
              onClick={() => setActiveTab('console')}
              className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'console' 
                  ? 'border-accent text-accent' 
                  : 'border-transparent text-text-secondary hover:text-text-primary'
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
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatMessages.length === 0 && (
                    <div className="text-center text-text-tertiary text-sm mt-10">
                      <p>Start a conversation with Claude to modify your plugin.</p>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.type === 'user_prompt' ? 'items-end' : 'items-start'}`}>
                      <div 
                        className={`max-w-[90%] rounded-lg p-3 text-sm break-words whitespace-pre-wrap ${
                          msg.type === 'user_prompt' 
                            ? 'bg-accent text-white' 
                            : msg.type === 'error' 
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : 'bg-bg-tertiary text-text-primary'
                        }`}
                      >
                        {msg.message}
                      </div>
                      <span className="text-[10px] text-text-tertiary mt-1">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                  {isWorking && (
                    <div className="flex items-center gap-2 text-text-tertiary text-xs ml-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>{status === 'compiling' ? 'Working...' : 'Claude is thinking...'}</span>
                      <button 
                        onClick={() => setActiveTab('console')}
                        className="ml-2 underline hover:text-text-primary"
                      >
                        View Logs
                      </button>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                
                {/* Input */}
                <div className="p-4 border-t border-border bg-bg-secondary">
                  <form onSubmit={handleSend} className="relative">
                    <input
                      type="text"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Ask Claude to make changes..."
                      disabled={isWorking}
                      className="w-full bg-bg-primary border border-border rounded-lg pl-4 pr-10 py-3 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={!prompt.trim() || isWorking}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-accent hover:bg-accent/10 rounded-md transition-colors disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1">
                  {logs.map((log, i) => (
                    <div 
                      key={i} 
                      className={`${
                        log.type === 'error' || log.type === 'claude_error' ? 'text-red-400' :
                        log.type === 'success' || log.type === 'complete' ? 'text-green-400' :
                        log.type === 'file' ? 'text-blue-400' :
                        log.type === 'claude' ? 'text-purple-400' :
                        'text-text-tertiary'
                      }`}
                    >
                      <span className="opacity-50 mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      {log.message}
                    </div>
                  ))}
                  <div ref={consoleEndRef} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Editor */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
          {selectedFile ? (
            <>
              <div className="h-9 border-b border-border flex items-center justify-between px-4 bg-bg-primary">
                <span className="text-xs text-text-tertiary font-mono">{selectedFile}</span>
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary transition-colors"
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
                    padding: { top: 16 }
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-tertiary">
              <div className="text-center">
                <File className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p>Select a file to view</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Files */}
        <div 
          className="border-l border-border flex flex-col bg-bg-secondary w-64"
        >
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Explorer</span>
            <button onClick={onRefreshFiles} className="p-1 hover:bg-bg-tertiary rounded">
              <Loader2 className="w-3 h-3 text-text-tertiary" />
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

