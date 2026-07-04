import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import SystemView from './pages/SystemView'
import ClassifyPage from './pages/ClassifyPage'
import AboutPage from './pages/AboutPage'
import NavBar from './components/NavBar'

/**
 * Root application component.
 * Sets up routing between the four main views:
 *   /           — Landing page with search interface
 *   /system/:id — 3D orbital simulator + synced light curve
 *   /classify   — Upload/classify a light curve
 *   /about      — Project info, methodology, and impact
 */
function App() {
  return (
    <div className="bg-[#06060F] min-h-screen flex flex-col">
      <NavBar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/system/:id" element={<SystemView />} />
          <Route path="/classify" element={<ClassifyPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
