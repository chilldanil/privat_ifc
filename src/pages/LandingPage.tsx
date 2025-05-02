import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Container } from '@mui/material';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        height: 'calc(100vh - 64px)', // Height minus AppBar
        background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
        color: 'common.white'
      }}
    >
      <Container maxWidth="sm" sx={{ textAlign: 'center' }}>
        <Typography 
          variant="h2" 
          component="h1" 
          gutterBottom
          sx={{ fontWeight: 'bold' }}
        >
          IFC Viewer
        </Typography>
        <Typography 
          variant="h5" 
          color="inherit" 
          paragraph
        >
          Explore and interact with your IFC models in immersive 3D.
        </Typography>
        <Button 
          variant="contained" 
          size="large" 
          color="secondary"
          onClick={() => navigate('/viewer')}
          sx={{ mt: 3, fontWeight: 'bold' }}
        >
          Launch Viewer
        </Button>
      </Container>
    </Box>
  );
};

export default LandingPage; 