import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import IFCViewerComponent from './components/viewer/IFCViewerComponent'
import Layout from './components/Layout'
import './App.css'

const App = () => {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/viewer" element={<IFCViewerComponent />} />
      </Routes>
    </Layout>
  )
}

export default App 