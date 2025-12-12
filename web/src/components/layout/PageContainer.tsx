import { NavBar } from './NavBar'

interface PageContainerProps {
  children: React.ReactNode
  onSearch?: (query: string) => void
}

export function PageContainer({ children, onSearch }: PageContainerProps) {
  return (
    <div className="min-h-screen bg-bg-primary">
      <NavBar onSearch={onSearch} />
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
