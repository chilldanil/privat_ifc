import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";
import { FragmentsGroup, FragmentIdMap } from "@thatopen/fragments";
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

  const highlighter = useRef<OBCF.Highlighter>();
  const outliner    = useRef<OBCF.Outliner>();

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
    if (f && f.name.toLowerCase().endsWith(".ifc")) loadIfc(f);
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
  }, [world, model, components]);

  /* ──────────────────── render ──────────────────── */
  return (
    <div className="ifc-viewer-container">
      {/* toolbar */}
      <div className="ifc-controls">
        <button className="back-button" onClick={() => nav("/")}>Back to Home</button>

        <label className="file-input-container">
          <span className="file-input-button">Upload IFC File</span>
          <input
            type="file"
            accept=".ifc"
            className="file-input"
            onChange={(e) => e.target.files?.[0] && loadIfc(e.target.files[0])}
          />
        </label>

        {model && (
          <button className="tree-button" onClick={() => setShowTree(!showTree)}>
            {showTree ? "Hide Tree" : "Show Tree"}
          </button>
        )}
      </div>

      {/* Left Sidebar - Model Structure */}
      <div className="left-sidebar">
        {model && showTree ? (
          <ModelTreePanel 
            components={components}
            model={model} 
            onSelect={selectFromTree}
          />
        ) : (
          <div className="sidebar-placeholder">
            <div className="sidebar-header">
              <h3>Model Structure</h3>
            </div>
            <div className="sidebar-content">
              <div className="tree-empty">
                {model ? "Tree hidden" : "No model loaded"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content - 3D Viewer */}
      <div className="main-content">
        <div
          className={`viewer-container ${drag ? "drag-over" : ""}`}
          onDragOver={dragOver} onDragLeave={dragLeave} onDrop={drop}
        >
          {loading && <div className="loading">Loading…</div>}
          {error && <div className="error">{error}</div>}

          <div ref={container} className="ifc-viewer"/>
        </div>
      </div>

      {/* Right Sidebar - Properties */}
      <div className="right-sidebar">
        {selectedProps ? (
          <div className="properties-panel">
            <div className="properties-header">
              <h3>Properties</h3>
              <button onClick={() => setProps(null)}>×</button>
            </div>
            <div className="properties-content">
              {Object.entries(selectedProps).map(([k,v]) => (
                <div key={k} className="property-item">
                  <span className="property-key">{k}:</span>
                  <span className="property-value">{JSON.stringify(v)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="sidebar-placeholder">
            <div className="sidebar-header">
              <h3>Properties</h3>
            </div>
            <div className="sidebar-content">
              <div className="tree-empty">
                No element selected
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IFCViewerComponent;