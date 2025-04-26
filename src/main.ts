import './styles/style.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import IFCViewerComponent from './components/viewer/IFCViewerComponent'
import LandingPage from './pages/LandingPage'

ReactDOM.createRoot(document.getElementById('app')!).render(
  React.createElement(
    BrowserRouter,
    null,
    React.createElement(
      Routes,
      null,
      React.createElement(Route, { path: "/", element: React.createElement(LandingPage) }),
      React.createElement(Route, { path: "/viewer", element: React.createElement(IFCViewerComponent) })
    )
  )
)
