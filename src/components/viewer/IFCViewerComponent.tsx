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
  IconButton,
  ToggleButton,
  ToggleButtonGroup
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import UploadIcon from "@mui/icons-material/Upload";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import CloseIcon from "@mui/icons-material/Close";
import ListIcon from "@mui/icons-material/List";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import ModelTreePanel from "./ModelTreePanel";
import RelationsTreePanel from "./RelationsTreePanel";
import PropertyList from "./PropertyList";

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
  const [treeViewType, setTreeViewType] = useState<'classic' | 'relations'>('classic');

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

      // First set the model in state
      setModel(grp);
      
      // Then run classification and indexing
      const classifier = components.get(OBC.Classifier);
      const indexer = components.get(OBC.IfcRelationsIndexer);
      
      try {
        // Process relations for the Relations Tree
        if (grp.hasProperties) {
          await indexer.process(grp);
          console.log("Relations indexed successfully");
        }
        
        // Classify by entity (for the classic tree view)
        await classifier.byEntity(grp);
        
        // Also try to classify by spatial structure
        try {
          await classifier.bySpatialStructure(grp);
        } catch (error) {
          console.warn("Couldn't classify by spatial structure:", error);
        }
      } catch (e) {
        console.error("Error during model processing:", e);
      }
    }
    catch (e) { 
      console.error("Failed to load IFC:", e);
      setError("Failed to load IFC (is it valid?)"); 
    }
    finally { 
      setLoading(false); 
    }
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
    <Box 
      ref={mainLayoutRef}
      sx={{ 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Header bar */}
      <Box sx={{ 
        height: '3rem', 
        display: 'flex', 
        alignItems: 'center', 
        px: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        zIndex: 10
      }}>
        <IconButton 
          onClick={() => nav('/')}
          aria-label="back to home"
          sx={{ mr: 2 }}
        >
          <ArrowBackIcon />
        </IconButton>
        
        <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
          IFC Viewer
        </Typography>
        
        {model ? (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <ToggleButtonGroup
              value={treeViewType}
              exclusive
              onChange={(e, newValue) => {
                if (newValue) setTreeViewType(newValue);
              }}
              size="small"
              aria-label="tree view type"
            >
              <ToggleButton value="classic" aria-label="classic tree">
                <ListIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="relations" aria-label="relations tree">
                <AccountTreeIcon fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>

            <Button 
              onClick={() => setShowTree(!showTree)}
              startIcon={showTree ? <VisibilityOffIcon /> : <VisibilityIcon />}
              variant="outlined"
              size="small"
            >
              {showTree ? 'Hide' : 'Show'} Tree
            </Button>
          </Box>
        ) : (
          <Button
            onClick={() => document.getElementById('ifc-file-input')?.click()}
            startIcon={<UploadIcon />}
            variant="contained"
          >
            Load IFC
          </Button>
        )}
      </Box>
      
      {/* Main content */}
      <Box 
        sx={{ 
          flexGrow: 1, 
          display: 'flex', 
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Left panel (tree view) */}
        {showTree && model && (
          <>
            <Box 
              id="left-panel"
              sx={{ 
                height: '100%', 
                width: `${leftPanelWidth}%`,
                minWidth: '200px',
                maxWidth: '500px',
                position: 'relative',
                borderRight: '1px solid',
                borderColor: 'divider'
              }}
            >
              {treeViewType === 'classic' ? (
                <ModelTreePanel
                  components={components}
                  model={model}
                  onSelect={selectFromTree}
                />
              ) : (
                <RelationsTreePanel
                  components={components}
                  model={model}
                  onSelect={selectFromTree}
                />
              )}
              
              {/* Resize handle */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  right: -4,
                  width: 8,
                  height: '100%',
                  cursor: 'col-resize',
                  zIndex: 100,
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                  }
                }}
                onMouseDown={handleMouseDown('left')}
              />
            </Box>
          </>
        )}
        
        {/* 3D Viewer */}
        <Box 
          sx={{ 
            flexGrow: 1, 
            position: 'relative',
            height: '100%'
          }}
        >
          <Box 
            ref={container}
            sx={{ 
              width: '100%', 
              height: '100%',
              position: 'relative'
            }}
            onDragOver={dragOver}
            onDragLeave={dragLeave}
            onDrop={drop}
          >
            {/* Drag overlay */}
            {drag && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 50
                }}
              >
                <Paper 
                  elevation={3}
                  sx={{ p: 3, textAlign: 'center' }}
                >
                  <UploadIcon sx={{ fontSize: 48, mb: 2, color: 'primary.main' }} />
                  <Typography variant="h6">Drop IFC file to load</Typography>
                </Paper>
              </Box>
            )}
            
            {/* Loading overlay */}
            {loading && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 50
                }}
              >
                <Paper 
                  elevation={3}
                  sx={{ p: 3, textAlign: 'center' }}
                >
                  <CircularProgress sx={{ mb: 2 }} />
                  <Typography>Loading IFC model...</Typography>
                </Paper>
              </Box>
            )}
            
            {/* Error message */}
            {error && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 16,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 50
                }}
              >
                <Alert 
                  severity="error"
                  onClose={() => setError(null)}
                >
                  {error}
                </Alert>
              </Box>
            )}
          </Box>
        </Box>
        
        {/* Right panel (properties) */}
        {selectedProps && (
          <>
            <Box 
              id="right-panel"
              sx={{ 
                height: '100%', 
                width: `${rightPanelWidth}%`,
                minWidth: '200px',
                maxWidth: '500px',
                position: 'relative',
                borderLeft: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              <Box sx={{ 
                p: 2, 
                borderBottom: '1px solid', 
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center'
              }}>
                <Typography variant="h6" sx={{ flexGrow: 1 }}>Properties</Typography>
                <IconButton onClick={() => {
                  if (highlighter.current) highlighter.current.clear('selection');
                  if (outliner.current) outliner.current.clear('selection');
                  setProps(null);
                }}>
                  <CloseIcon />
                </IconButton>
              </Box>
              
              <Box sx={{ 
                p: 2, 
                overflow: 'auto',
                flexGrow: 1
              }}>
                <PropertyList properties={selectedProps} />
              </Box>
              
              {/* Resize handle */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: -4,
                  width: 8,
                  height: '100%',
                  cursor: 'col-resize',
                  zIndex: 100,
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                  }
                }}
                onMouseDown={handleMouseDown('right')}
              />
            </Box>
          </>
        )}
      </Box>
      
      {/* Hidden file input for IFC loading */}
      <input
        id="ifc-file-input"
        type="file"
        accept=".ifc"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
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
            loadIfc(file);
          }
          e.target.value = '';
        }}
        style={{ display: 'none' }}
      />
    </Box>
  );
};

export default IFCViewerComponent;