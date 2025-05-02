import { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { 
  AppBar, 
  Box, 
  Toolbar, 
  Typography, 
  Container, 
  Button,
  Link,
  CssBaseline
} from '@mui/material'

interface LayoutProps {
  children: ReactNode
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <CssBaseline />
      <AppBar position="static">
        <Toolbar>
          <Typography 
            variant="h6" 
            component="div" 
            sx={{ flexGrow: 1, fontWeight: 'bold' }}
          >
            IFC Viewer
          </Typography>
          <Button 
            color="inherit" 
            component={RouterLink} 
            to="/"
          >
            Home
          </Button>
          <Button 
            color="inherit" 
            component={RouterLink} 
            to="/viewer"
          >
            Viewer
          </Button>
        </Toolbar>
      </AppBar>
      
      <Box component="main" sx={{ flexGrow: 1 }}>
        {children}
      </Box>
      
      <Box 
        component="footer" 
        sx={{ 
          py: 3, 
          mt: 'auto',
          backgroundColor: (theme) => theme.palette.grey[100]
        }}
      >
        <Container maxWidth="lg">
          <Typography variant="body2" color="text.secondary" align="center">
            © {new Date().getFullYear()} IFC Viewer. All rights reserved.
          </Typography>
        </Container>
      </Box>
    </Box>
  )
}

export default Layout 