import { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center justify-between">
            <div className="text-xl font-bold text-gray-800">IFC Viewer</div>
            <div className="space-x-4">
              <a href="/" className="text-gray-600 hover:text-gray-900">Home</a>
              <a href="/viewer" className="text-gray-600 hover:text-gray-900">Viewer</a>
            </div>
          </nav>
        </div>
      </header>
      <main className="flex-grow">
        {children}
      </main>
      <footer className="bg-gray-50 py-8">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>© {new Date().getFullYear()} IFC Viewer. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default Layout 