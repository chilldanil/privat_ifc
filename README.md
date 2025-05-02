# IFC Viewer Project

A modern web-based IFC (Industry Foundation Classes) viewer built with React and Three.js.

## Features

- 3D visualization of IFC models
- Property inspection of model elements
- Model structure tree view with selectable elements
- Drag-and-drop file upload
- Fixed toolbar for easy navigation
- Resizable panels for model structure and properties
- Modern landing page
- Responsive design

## Tech Stack

- React
- TypeScript
- Three.js
- @thatopen/components (BIM components)
- Material-UI
- Vite

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://gitlab.lrz.de/00000000014BE5A0/ifc-viewer-project.git
cd ifc-viewer-project
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Project Structure

```
ifc-viewer-project/
├── src/
│   ├── components/
│   │   ├── viewer/
│   │   │   ├── IFCViewerComponent.tsx
│   │   │   ├── ModelTreePanel.tsx
│   │   │   └── TreeView.tsx
│   │   ├── Layout.tsx
│   │   ├── pages/
│   │   │   └── LandingPage.tsx
│   │   ├── styles/
│   │   │   ├── IFCViewerComponent.css
│   │   │   ├── TreeView.css
│   │   │   └── globalStyles.ts
│   │   ├── theme.ts
│   │   ├── main.tsx
│   │   └── App.tsx
│   ├── public/
│   ├── package.json
│   └── ...
```

## Usage

1. Visit the landing page
2. Click "Launch Viewer" to open the IFC viewer
3. Upload an IFC file using the upload button or drag-and-drop
4. Navigate the 3D model using mouse controls:
   - Left-click to select elements
   - Right-click and drag to rotate
   - Middle-click/scroll to zoom
   - Left+right click or middle-click to pan
5. Click on elements to view their properties in the right panel
6. Use the Model Structure panel to navigate the building hierarchy

## Recent Updates

- Fixed toolbar positioning - now properly fixed to the top of the viewer
- Added padding to main content to prevent overlap with the fixed toolbar
- Improved UI consistency and interaction experience
- Enhanced resizable panels for better workflow

## License

This project is licensed under the MIT License - see the LICENSE file for details.
