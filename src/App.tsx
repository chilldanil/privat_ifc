import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import IFCViewerComponent from './components/IFCViewerComponent'
import Layout from './components/Layout'
import './App.css'

const App = () => {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/viewer" element={<IFCViewerComponent />} />
        </Routes>
      </Layout>
    </Router>
  )
}

export default App 