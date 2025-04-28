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

      {/* viewer + overlays */}
      <div
        className={`viewer-container ${drag ? "drag-over" : ""}`}
        onDragOver={dragOver} onDragLeave={dragLeave} onDrop={drop}
      >
        {loading && <div className="loading">Loading…</div>}
        {error   && <div className="error">{error}</div>}

        <div ref={container} className="ifc-viewer"/>

        {showTree && model && (
          <ModelTreePanel 
            components={components}
            model={model} 
            onSelect={selectFromTree}
          />
        )}

        {selectedProps && (
          <div className="properties-panel">
            <div className="properties-header">
              <h3>Properties</h3><button onClick={() => setProps(null)}>×</button>
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
        )}
      </div>
    </div>
  );
};

export default IFCViewerComponent;