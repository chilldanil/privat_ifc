// Global styles that will be used with createTheme's components section
const globalStyles = {
  '*': {
    boxSizing: 'border-box',
    margin: 0,
    padding: 0
  },
  html: {
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
    height: '100%',
    width: '100%'
  },
  body: {
    height: '100%',
    width: '100%'
  },
  '#app': {
    height: '100%',
    width: '100%',
    overflow: 'hidden'
  },
  '.ifc-viewer': {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  a: {
    textDecoration: 'none',
    color: 'inherit'
  }
};

export default globalStyles; 