import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { PageContainer } from '@/components/layout'
import { PromptGrid, FilterBar } from '@/components/prompts'
import { PromptCategory } from '@/types'
import { mockPrompts } from '@/data/mockPrompts'

export function Home() {
  const [selectedCategory, setSelectedCategory] = useState<PromptCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredPrompts = useMemo(() => {
    return mockPrompts.filter((prompt) => {
      // Filter by category
      if (selectedCategory !== 'all' && prompt.category !== selectedCategory) {
        return false
      }
      
      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          prompt.title.toLowerCase().includes(query) ||
          prompt.description.toLowerCase().includes(query) ||
          prompt.tags.some(tag => tag.toLowerCase().includes(query))
        )
      }
      
      return true
    })
  }, [selectedCategory, searchQuery])

  return (
    <PageContainer onSearch={setSearchQuery}>
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-10 pt-4"
      >
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          Discover Prompts
        </h1>
        <p className="text-text-secondary text-base">
          Browse community prompts for VST plugins
        </p>
      </motion.div>

      {/* Filter Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <FilterBar selected={selectedCategory} onChange={setSelectedCategory} />
      </motion.div>

      {/* Results count */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="mb-5"
      >
        <p className="text-text-tertiary text-sm">
          {filteredPrompts.length} prompt{filteredPrompts.length !== 1 ? 's' : ''}
        </p>
      </motion.div>

      {/* Prompt Grid */}
      <PromptGrid prompts={filteredPrompts} />
    </PageContainer>
  )
}
