import './style.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import IFCViewerComponent from './components/IFCViewerComponent.tsx'

ReactDOM.createRoot(document.getElementById('app')!).render(
  React.createElement(IFCViewerComponent)
)
