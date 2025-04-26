import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/LandingPage.css';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="landing-container">
      <div className="landing-content">
        <h1>IFC Viewer</h1>
        <p>Explore and interact with your IFC models in 3D</p>
        <button 
          className="viewer-button"
          onClick={() => navigate('/viewer')}
        >
          Launch Viewer
        </button>
      </div>
    </div>
  );
};

export default LandingPage; 