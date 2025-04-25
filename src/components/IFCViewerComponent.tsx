import { useEffect, useRef, useState, Suspense } from "react";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";
import "./IFCViewerComponent.css";

// --------------------------------------------------
// 🔌  Extended types for convenience
// --------------------------------------------------
interface ExtendedIfcLoader extends OBC.IfcLoader {
  ifcManager: {
    getItemProperties: (
      modelID: number,
      expressID: number,
      recursive: boolean
    ) => Promise<Record<string, any>>;
  };
}

interface ExtendedFragmentsGroup extends OBC.FragmentsGroup {
  /** IFC model identifier */
  modelID: number;
}

// --------------------------------------------------
// 🧾  Simple key/value property panel
// --------------------------------------------------
interface PropertiesPanelProps {
  properties: Record<string, any> | null;
  onClose: () => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ properties, onClose }) => {
  if (!properties) return null;

  return (
    <div className="properties-panel">
      <div className="properties-header">
        <h3>Properties</h3>
        <button onClick={onClose}>×</button>
      </div>
      <div className="properties-content">
        {Object.entries(properties).map(([key, value]) => (
          <div key={key} className="property-item">
            <span className="property-key">{key}:</span>
            <span className="property-value">{JSON.stringify(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// --------------------------------------------------
// 🎬  Main React component
// --------------------------------------------------
const IFCViewerComponent: React.FC = () => {
  // ---------- refs & state ----------
  const containerRef = useRef<HTMLDivElement>(null);

  const [components] = useState(() => new OBC.Components());
  const [world, setWorld] = useState<
    OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBCF.PostproductionRenderer>
  >(null);
  const [ifcLoader, setIfcLoader] = useState<ExtendedIfcLoader | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedProps, setSelectedProps] = useState<Record<string, any> | null>(null);

  // Keep refs to highlighter / outliner so we can dispose later if needed
  const highlighterRef = useRef<OBCF.Highlighter>();
  const outlinerRef = useRef<OBCF.Outliner>();

  // --------------------------------------------------
  // 🌍  World + renderer + helper setup (runs once)
  // --------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    // 1️⃣  Create a world with post‑production renderer so outlines work
    const worlds = components.get(OBC.Worlds);
    const w = worlds.create<
      OBC.SimpleScene,
      OBC.SimpleCamera,
      OBCF.PostproductionRenderer
    >();

    w.scene = new OBC.SimpleScene(components);
    w.renderer = new OBCF.PostproductionRenderer(components, containerRef.current);
    w.camera = new OBC.SimpleCamera(components);

    // Enable post‑processing (needed for outlines)
    w.renderer.postproduction.enabled = true;

    setWorld(w);
    components.init();

    // 2️⃣  Basic lighting & grid
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(5, 10, 5);
    w.scene.three.add(ambient, dir);

    const grid = components.get(OBC.Grids).create(w);
    // Prevent the outline effect from drawing around the grid
    w.renderer.postproduction.customEffects.excludedMeshes.push(grid.three);

    // 3️⃣  Camera start position
    w.camera.controls.setLookAt(10, 10, 10, 0, 0, 0);

    // 4️⃣  IFC loader
    const loader = components.get(OBC.IfcLoader) as ExtendedIfcLoader;
    loader
      .setup({ autoSetWasm: true })
      .then(() => setIfcLoader(loader))
      .catch((err) => {
        console.error(err);
        setError("Failed to initialise IFC loader (WASM missing?)");
      });

    // 5️⃣  Highlighter + outliner for hover & selection feedback
    const highlighter = components.get(OBCF.Highlighter);
    highlighter.setup({ world: w });
    highlighter.zoomToSelection = true;
    highlighterRef.current = highlighter;

    const outliner = components.get(OBCF.Outliner);
    outliner.world = w;
    outliner.enabled = true;
    outlinerRef.current = outliner;

    // Create a simple yellow outline style (opacity controls width)
    outliner.create(
      "selection",
      new THREE.MeshBasicMaterial({
        color: 0xffdc00,
        transparent: true,
        opacity: 0.5,
      })
    );

    // When an element is selected -> outline + load properties
    highlighter.events.select.onHighlight.add(async (selection) => {
      outliner.clear("selection");
      outliner.add("selection", selection);

      try {
        const modelID = (selection.model as ExtendedFragmentsGroup).modelID;
        const firstID = selection.ids[0];
        const props = await loader.ifcManager.getItemProperties(modelID, firstID, true);
        setSelectedProps(props);
      } catch (err) {
        console.warn("Could not fetch IFC properties", err);
      }
    });

    // Clear outline + panel when selection cleared (click on empty space)
    highlighter.events.select.onClear.add(() => {
      outliner.clear("selection");
      setSelectedProps(null);
    });

    // Clean‑up on unmount
    return () => {
      components.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------------------------------
  // 📂  IFC file loading helper
  // --------------------------------------------------
  const handleFileUpload = async (file: File) => {
    if (!file || !ifcLoader || !world) return;

    // Clear UI / selection
    setSelectedProps(null);
    highlighterRef.current?.clear();

    setLoading(true);
    setError(null);

    try {
      const buffer = await file.arrayBuffer();
      const model = await ifcLoader.load(new Uint8Array(buffer));
      model.name = file.name;

      // Center model in view
      world.scene.three.add(model);
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      world.camera.controls.fitToSphere(new THREE.Sphere(center, size * 0.6), true);
    } catch (err) {
      console.error("IFC load error:", err);
      setError("Failed to load IFC file. Is it valid?");
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------
  // 🖱️  Drag‑and‑drop helpers
  // --------------------------------------------------
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith(".ifc")) {
      handleFileUpload(file);
    }
  };

  // --------------------------------------------------
  // 🖥️  Render
  // --------------------------------------------------
  return (
    <div className="ifc-viewer-container">
      {/* Toolbar */}
      <div className="ifc-controls">
        <div className="file-input-container">
          <button className="file-input-button">Upload IFC File</button>
          <input
            type="file"
            accept=".ifc"
            className="file-input"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          />
        </div>
      </div>

      {/* Viewer canvas & DnD overlay */}
      <div
        className={`viewer-container ${isDragging ? "drag-over" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {loading && <div className="loading">Loading IFC file…</div>}
        {error && <div className="error">{error}</div>}
        <div ref={containerRef} className="ifc-viewer" />
        {selectedProps && <PropertiesPanel properties={selectedProps} onClose={() => setSelectedProps(null)} />}
      </div>
    </div>
  );
};

export default IFCViewerComponent;
