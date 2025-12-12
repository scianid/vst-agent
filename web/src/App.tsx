import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home, Create } from '@/pages'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Create />} />
        <Route path="/browse" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
