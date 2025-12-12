import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Folder, Clock, Search, Loader2, Pencil, Check } from 'lucide-react'

interface Project {
  name: string
  modified: string
  created: string
}

interface ProjectListModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectProject: (projectName: string) => void
}

export function ProjectListModal({ isOpen, onClose, onSelectProject }: ProjectListModalProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [editingProject, setEditingProject] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchProjects()
      setEditingProject(null)
    }
  }, [isOpen])

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        setProjects(data.projects)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleRename = async (currentName: string) => {
    if (!newName.trim() || newName === currentName) {
      setEditingProject(null)
      return
    }

    setRenaming(true)
    try {
      const res = await fetch(`/api/projects/${currentName}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: newName.trim() })
      })

      if (res.ok) {
        await fetchProjects()
        setEditingProject(null)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to rename project')
      }
    } catch (err) {
      console.error(err)
      alert('Failed to rename project')
    } finally {
      setRenaming(false)
    }
  }

  const startEditing = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingProject(project.name)
    setNewName(project.name)
  }

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl"
          >
            <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col text-white">
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white/90">Load Project</h2>
                <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/70 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4 border-b border-white/10">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input 
                    type="text"
                    placeholder="Search projects..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:border-accent/50 focus:bg-white/10 transition-all text-white placeholder:text-white/30"
                  />
                </div>
              </div>

              <div className="overflow-y-auto p-4 space-y-2 flex-1 custom-scrollbar">
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="text-center py-8 text-white/40">
                    No projects found
                  </div>
                ) : (
                  filteredProjects.map(project => (
                    <div
                      key={project.name}
                      className="w-full flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-xl transition-all text-left group relative"
                    >
                      <div 
                        className="flex-1 flex items-center gap-4 cursor-pointer"
                        onClick={() => !editingProject && onSelectProject(project.name)}
                      >
                        <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-colors shadow-lg shadow-accent/5">
                          <Folder className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          {editingProject === project.name ? (
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <input
                                type="text"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                className="bg-black/50 border border-accent/50 rounded px-2 py-1 text-sm text-white outline-none w-full"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleRename(project.name)
                                  if (e.key === 'Escape') setEditingProject(null)
                                }}
                              />
                              <button 
                                onClick={() => handleRename(project.name)}
                                disabled={renaming}
                                className="p-1 hover:bg-green-500/20 text-green-500 rounded"
                              >
                                {renaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              </button>
                              <button 
                                onClick={() => setEditingProject(null)}
                                disabled={renaming}
                                className="p-1 hover:bg-red-500/20 text-red-500 rounded"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <h3 className="font-medium text-white/90 group-hover:text-white transition-colors">{project.name}</h3>
                              <div className="flex items-center gap-4 mt-1 text-xs text-white/50 group-hover:text-white/70 transition-colors">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {new Date(project.modified).toLocaleDateString()} {new Date(project.modified).toLocaleTimeString()}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {!editingProject && (
                        <button
                          onClick={(e) => startEditing(project, e)}
                          className="p-2 text-white/30 hover:text-white hover:bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                          title="Rename project"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
