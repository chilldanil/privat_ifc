# IFC Viewer Project

A modern web-based IFC (Industry Foundation Classes) viewer built with React and Three.js.

## Features

- 3D visualization of IFC models
- Property inspection of model elements
- Drag-and-drop file upload
- Modern landing page
- Responsive design

## Tech Stack

- React
- TypeScript
- Three.js
- @thatopen/components
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
│   │   │   └── IFCViewerComponent.tsx
│   │   ├── pages/
│   │   │   └── LandingPage.tsx
│   │   ├── styles/
│   │   │   ├── IFCViewerComponent.css
│   │   │   ├── LandingPage.css
│   │   │   └── style.css
│   │   ├── main.ts
│   │   └── ...
│   ├── public/
│   ├── package.json
│   └── ...
```

## Usage

1. Visit the landing page
2. Click "Launch Viewer" to open the IFC viewer
3. Upload an IFC file using the upload button or drag-and-drop
4. Navigate the 3D model using mouse controls
5. Click on elements to view their properties

## License

This project is licensed under the MIT License - see the LICENSE file for details.
