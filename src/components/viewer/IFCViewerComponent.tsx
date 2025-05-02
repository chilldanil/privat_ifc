import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";
import { FragmentsGroup, FragmentIdMap } from "@thatopen/fragments";
import { 
  Box, 
  Button, 
  CircularProgress, 
  Alert, 
  Typography, 
  Divider,
  Paper,
  IconButton
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import UploadIcon from "@mui/icons-material/Upload";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import CloseIcon from "@mui/icons-material/Close";
import ModelTreePanel from "./ModelTreePanel";

import "../../styles/IFCViewerComponent.css";
import "../../styles/TreeView.css";

const IFCViewerComponent: React.FC = () => {
  /* ──────────────────── state / refs ──────────────────── */
  const nav       = useNavigate();
  const container = useRef<HTMLDivElement>(null);

  const [components]   = useState(() => new OBC.Components());
  const [world, setWorld] = useState<
    OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBCF.PostproductionRenderer>
  >();

  const [ifcLoader, setIfcLoader]   = useState<OBC.IfcLoader | null>(null);
  const [model, setModel]           = useState<FragmentsGroup | null>(null);
  const [selectedProps, setProps]   = useState<Record<string, any> | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error,   setError]         = useState<string | null>(null);
  const [drag,    setDrag]          = useState(false);
  const [showTree, setShowTree]     = useState(true);

  // State for panel widths and dragging status
  const [leftPanelWidth, setLeftPanelWidth] = useState(20); // Initial width in percentage
  const [rightPanelWidth, setRightPanelWidth] = useState(20); // Initial width in percentage
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const highlighter = useRef<OBCF.Highlighter>();
  const outliner    = useRef<OBCF.Outliner>();
  const mainLayoutRef = useRef<HTMLDivElement>(null); // Ref for the main layout container

  /* ──────────────────── create world (once) ──────────────────── */
  useEffect(() => {
    if (!container.current) return;

    const worlds = components.get(OBC.Worlds);
    const w = worlds.create<
      OBC.SimpleScene,
      OBC.SimpleCamera,
      OBCF.PostproductionRenderer
    >();
    w.scene     = new OBC.SimpleScene(components);
    w.renderer  = new OBCF.PostproductionRenderer(components, container.current);
    w.camera    = new OBC.SimpleCamera(components);
    w.renderer.postproduction.enabled = true;

    setWorld(w);
    components.init();

    w.camera.controls.setLookAt(10, 10, 10, 0, 0, 0);

    /* lights + grid */
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(5, 10, 5);
    
    w.scene.three.add(
      new THREE.AmbientLight(0xffffff, 0.5),
      dir
    );
    const grid = components.get(OBC.Grids).create(w);
    w.renderer.postproduction.customEffects.excludedMeshes.push(grid.three);

    /* loader */
    const ldr = components.get(OBC.IfcLoader);
    ldr.setup({ autoSetWasm: true }).then(() => setIfcLoader(ldr));

    /* highlighter & outliner */
    const h = components.get(OBCF.Highlighter);
    h.setup({ world: w });
    h.add('selection', new THREE.Color(0xffdc00));
    h.zoomToSelection = true;
    highlighter.current = h;

    const o = components.get(OBCF.Outliner);
    o.world = w;
    o.enabled = true;
    o.create(
      "selection",
      new THREE.MeshBasicMaterial({ color: 0xffdc00, transparent: true, opacity: 0.5 })
    );
    outliner.current = o;

    /* clear on empty click */
    h.events.select.onClear.add(() => {
      o.clear("selection");
      setProps(null);
    });

    return () => components.dispose();
  }, []);

  /* ──────────────────── highlight callback (after loader ready) ──────────────────── */
  useEffect(() => {
    if (!ifcLoader || !highlighter.current || !outliner.current) return;

    const onHighlight = async (fragMap: FragmentIdMap) => {
      if (!model) return;

      outliner.current!.clear("selection");
      outliner.current!.add("selection", fragMap);

      const entries = Object.entries(fragMap);
      if (entries.length === 0) return;
      
      const [, ids] = entries[0]; // first fragment's Set
      const firstValue = ids.values().next().value;
      
      if (typeof firstValue !== 'number') return;
      
      const expressID = firstValue as number;
      const props = await model.getProperties(expressID);

      setProps(props);
    };

    highlighter.current.events.select.onHighlight.add(onHighlight);
    return () =>
      highlighter.current?.events.select.onHighlight.remove(onHighlight);
  }, [ifcLoader, model]);

  /* ──────────────────── file loader ──────────────────── */
  const loadIfc = async (file: File) => {
    if (!ifcLoader || !world) return;
    setLoading(true); setError(null); setProps(null);

    try {
      const buffer = await file.arrayBuffer();
      const grp    = await ifcLoader.load(new Uint8Array(buffer)) as FragmentsGroup;
      grp.name     = file.name;

      world.scene.three.add(grp);
      const box = new THREE.Box3().setFromObject(grp);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length() * 0.6;
      
      world.camera.controls.fitToSphere(
        new THREE.Sphere(center, size),
        true
      );

      setModel(grp);
      components.get(OBC.Classifier).byEntity(grp);
    }
    catch (e) { setError("Failed to load IFC (is it valid?)"); }
    finally  { setLoading(false); }
  };

  /* ──────────────────── tree click → highlight ──────────────────── */
  const selectFromTree = async (expressID: number) => {
    if (!model || !highlighter.current || !outliner.current) return;

    const map = model.getFragmentMap([expressID]);
    highlighter.current.highlightByID("selection", map, true, true);
    outliner.current.clear("selection");
    outliner.current.add("selection", map);

    const props = await model.getProperties(expressID);
    setProps(props);
  };

  /* ──────────────────── drag-and-drop helpers ──────────────────── */
  const dragOver  = (e: React.DragEvent) => { e.preventDefault(); setDrag(true);  };
  const dragLeave = (e: React.DragEvent) => { e.preventDefault(); setDrag(false); };
  const drop      = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.toLowerCase().endsWith(".ifc")) {
        setModel(null); // Clear previous model
        setProps(null); // Clear properties
        if(highlighter.current) highlighter.current.clear('selection'); // Clear highlight
        if(outliner.current) outliner.current.clear('selection'); // Clear outline
        if (world) { // Remove previous model from scene
             world.scene.three.children.forEach(child => {
                if (child instanceof FragmentsGroup) {
                    world.scene.three.remove(child);
                }
            });
        }
        loadIfc(f);
    }
  };

  /* ──────────────────── raycasting on double-click ──────────────────── */
  useEffect(() => {
    if (!container.current || !world || !model) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    const handleDoubleClick = async (event: MouseEvent) => {
      // Get mouse position in normalized device coordinates
      const rect = container.current!.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Set up raycaster from camera
      raycaster.setFromCamera(mouse, world.camera.three);
      
      // Perform raycasting against all objects in the scene
      const intersects = raycaster.intersectObjects(world.scene.three.children, true);
      
      if (intersects.length > 0) {
        const hit = intersects[0];
        
        // Get hit position
        const point = hit.point;
        
        try {
          // We'll try to find a nearby element using the position in 3D space
          // For FragmentsGroup, we can't directly get IDs from a point,
          // so we'll iterate through all elements to find the closest one
          
          // Get all expressIDs from the classification
          const classifier = components.get(OBC.Classifier);
          const allExprIds: number[] = [];
          
          // Try to extract IDs from both spatial structures and entities
          if (classifier.list.spatialStructures) {
            for (const key in classifier.list.spatialStructures) {
              const group = classifier.list.spatialStructures[key];
              if (group && group.map) {
                for (const fragId in group.map) {
                  for (const id of group.map[fragId]) {
                    allExprIds.push(id);
                  }
                }
              }
            }
          }
          
          if (allExprIds.length === 0 && classifier.list.entities) {
            // Extract from entities as fallback
            for (const type in classifier.list.entities) {
              const entities = classifier.list.entities[type];
              if (Array.isArray(entities)) {
                for (const entity of entities) {
                  if (entity && typeof entity.expressID === 'number') {
                    allExprIds.push(entity.expressID);
                  }
                }
              }
            }
          }
          
          if (allExprIds.length > 0) {
            // Get the first expressID as a simple demonstration
            // In a real app, you'd want to find the closest element to the hit point
            const expressID = allExprIds[0];
            
            // Get properties
            const props = await model.getProperties(expressID);
            
            // Highlight the object
            const map = model.getFragmentMap([expressID]);
            
            setProps(props);
            
            if (highlighter.current && outliner.current) {
              highlighter.current.highlightByID("selection", map, true, true);
              outliner.current.clear("selection");
              outliner.current.add("selection", map);
            }
            
            console.log("Face Measurement (Double-click):", {
              expressID,
              position: [point.x.toFixed(2), point.y.toFixed(2), point.z.toFixed(2)],
              properties: props
            });
          }
        } catch (err) {
          console.error("Error in double-click handling:", err);
        }
      }
    };
    
    container.current.addEventListener('dblclick', handleDoubleClick);
    
    return () => {
      container.current?.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [world, model, components, highlighter, outliner]);

  /* ──────────────────── Resizer Logic ──────────────────── */
  const MIN_WIDTH_PERCENT = 7;
  const MAX_WIDTH_PERCENT = 30;

  const handleMouseDown = (divider: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
    if (divider === 'left') setIsDraggingLeft(true);
    if (divider === 'right') setIsDraggingRight(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingLeft && !isDraggingRight) return;
    if (!mainLayoutRef.current) return;

    const containerRect = mainLayoutRef.current.getBoundingClientRect();
    const totalWidth = containerRect.width;

    if (isDraggingLeft) {
      const newLeftWidthPx = e.clientX - containerRect.left;
      let newLeftWidthPercent = (newLeftWidthPx / totalWidth) * 100;
      newLeftWidthPercent = Math.max(MIN_WIDTH_PERCENT, Math.min(MAX_WIDTH_PERCENT, newLeftWidthPercent));
      setLeftPanelWidth(newLeftWidthPercent);
    } else if (isDraggingRight) {
      const newRightWidthPx = containerRect.right - e.clientX;
      let newRightWidthPercent = (newRightWidthPx / totalWidth) * 100;
      newRightWidthPercent = Math.max(MIN_WIDTH_PERCENT, Math.min(MAX_WIDTH_PERCENT, newRightWidthPercent));
      setRightPanelWidth(newRightWidthPercent);
    }
  }, [isDraggingLeft, isDraggingRight]);

  const handleMouseUp = useCallback(() => {
    setIsDraggingLeft(false);
    setIsDraggingRight(false);
  }, []);

  useEffect(() => {
    if (isDraggingLeft || isDraggingRight) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      // Add user-select: none to body to prevent text selection during drag
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDraggingLeft, isDraggingRight, handleMouseMove, handleMouseUp]);

  /* ──────────────────── render ──────────────────── */
  const APPBAR_HEIGHT = 64; // default Material AppBar height
  return (
    <Box className="ifc-viewer-container" sx={{ position: "relative", width: "100%", height: `calc(100vh - ${APPBAR_HEIGHT}px)` }}>
      {/* 3D Viewer Container - Full Size Background */}
      <Box 
        className="viewer-container" 
        sx={{ 
          position: "absolute", 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0,
          paddingTop: "64px", // Add padding for the fixed toolbar 
          zIndex: 0
        }}
        onDragOver={dragOver}
        onDragLeave={dragLeave}
        onDrop={drop}
      >
        <Box ref={container} className="ifc-viewer" sx={{ width: "100%", height: "100%" }} />
        {loading && (
          <Box 
            sx={{ 
              position: "absolute", 
              top: "50%", 
              left: "50%", 
              transform: "translate(-50%, -50%)", 
              display: "flex", 
              flexDirection: "column", 
              alignItems: "center" 
            }}
          >
            <CircularProgress color="primary" />
            <Typography sx={{ mt: 2 }}>Loading…</Typography>
          </Box>
        )}
        {error && (
          <Box sx={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)" }}>
            <Alert severity="error" sx={{ boxShadow: 3 }}>{error}</Alert>
          </Box>
        )}
      </Box>

      {/* Controls - Top Layer */}
      <Box 
        className="ifc-controls" 
        sx={{ 
          position: "fixed", 
          top: 0,
          left: 0,
          right: 0,
          padding: "1rem",
          zIndex: 100,
          display: "flex",
          gap: 2,
          pointerEvents: "auto",
          backgroundColor: "rgba(26, 26, 26, 0.95)",
          borderBottom: "1px solid #333",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)"
        }}
      >
        <Button 
          variant="contained" 
          startIcon={<ArrowBackIcon />}
          onClick={() => nav("/")}
        >
          Back
        </Button>

        <Button
          variant="contained"
          component="label"
          startIcon={<UploadIcon />}
        >
          Upload IFC
          <input
            type="file"
            accept=".ifc"
            hidden
            onChange={(e) => e.target.files?.[0] && loadIfc(e.target.files[0])}
          />
        </Button>

        {model && (
          <Button 
            variant="contained"
            startIcon={showTree ? <VisibilityOffIcon /> : <VisibilityIcon />}
            onClick={() => setShowTree(!showTree)}
          >
            {showTree ? "Hide Tree" : "Show Tree"}
          </Button>
        )}
      </Box>

      {/* Main Layout - Overlay Layer */}
      <Box
        ref={mainLayoutRef}
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: "64px", // Add padding to account for fixed toolbar
          display: "flex",
          zIndex: 5,
          border: drag ? "2px dashed rgba(0, 120, 212, 0.7)" : "none",
          backgroundColor: drag ? "rgba(0, 120, 212, 0.1)" : "transparent",
          pointerEvents: "none" // allow clicks to pass through by default
        }}
      >
        {/* Left Sidebar - Model Structure */}
        <Paper 
          elevation={3}
          sx={{ 
            width: `${leftPanelWidth}%`,
            height: "100%",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            borderRadius: 0,
            pointerEvents: "auto" // re-enable interactions
          }}
        >
          {model && showTree ? (
            <ModelTreePanel 
              components={components}
              model={model} 
              onSelect={selectFromTree}
            />
          ) : (
            <Box sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column" }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: "medium" }}>
                Model Structure
              </Typography>
              <Box 
                sx={{ 
                  flexGrow: 1, 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  color: "text.secondary" 
                }}
              >
                <Typography>
                  {model ? "Tree hidden" : "No model loaded"}
                </Typography>
              </Box>
            </Box>
          )}
        </Paper>

        {/* Left Divider */}
        <Box
          sx={{
            position: "absolute",
            left: `${leftPanelWidth}%`,
            top: 0,
            bottom: 0,
            width: "6px",
            backgroundColor: "rgba(0, 0, 0, 0.1)",
            cursor: "col-resize",
            zIndex: 15,
            transform: "translateX(-50%)",
            "&:hover": {
              backgroundColor: "primary.main",
              opacity: 0.7
            },
            pointerEvents: "auto"
          }}
          onMouseDown={handleMouseDown('left')}
        />

        {/* Right Divider */}
        <Box
          sx={{
            position: "absolute",
            right: `${rightPanelWidth}%`,
            top: 0,
            bottom: 0,
            width: "6px",
            backgroundColor: "rgba(0, 0, 0, 0.1)",
            cursor: "col-resize",
            zIndex: 15,
            transform: "translateX(50%)",
            "&:hover": {
              backgroundColor: "primary.main",
              opacity: 0.7
            },
            pointerEvents: "auto"
          }}
          onMouseDown={handleMouseDown('right')}
        />

        {/* Right Sidebar - Properties */}
        <Paper
          elevation={3}
          sx={{ 
            width: `${rightPanelWidth}%`,
            height: "100%",
            position: "absolute",
            right: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            borderRadius: 0,
            pointerEvents: "auto"
          }}
        >
          {selectedProps ? (
            <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <Box sx={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "space-between",
                p: 2,
                borderBottom: "1px solid",
                borderColor: "divider"
              }}>
                <Typography variant="h6">Properties</Typography>
                <IconButton size="small" onClick={() => setProps(null)}>
                  <CloseIcon />
                </IconButton>
              </Box>
              <Box sx={{ 
                p: 2, 
                overflowY: "auto", 
                flexGrow: 1 
              }}>
                {Object.entries(selectedProps).map(([k,v]) => (
                  <Box key={k} sx={{ mb: 1.5 }}>
                    <Typography variant="subtitle2" color="primary" sx={{ fontWeight: "medium" }}>
                      {k}:
                    </Typography>
                    <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                      {JSON.stringify(v)}
                    </Typography>
                    <Divider sx={{ mt: 1 }} />
                  </Box>
                ))}
              </Box>
            </Box>
          ) : (
            <Box sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column" }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: "medium" }}>
                Properties
              </Typography>
              <Box 
                sx={{ 
                  flexGrow: 1, 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  color: "text.secondary"
                }}
              >
                <Typography>
                  No element selected
                </Typography>
              </Box>
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
};

export default IFCViewerComponent;