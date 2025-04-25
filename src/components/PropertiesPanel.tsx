import { useEffect, useRef, useState } from 'react';
import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import PropertiesPanel, { IfcProperties } from './PropertiesPanel';
import './IFCViewerComponent.css';

/* ---------- helper types ---------- */
interface ExtendedIfcLoader extends OBC.IfcLoader {
  ifcManager: {
    getExpressId: (geom: THREE.BufferGeometry, faceIndex: number) => number;
    createSubset: (opts: {
      scene: THREE.Scene;
      modelID: number;
      ids: number[];
      removePrevious: boolean;
      material: THREE.Material;
    }) => THREE.Mesh;
    removeSubset: (modelID: number, mat?: THREE.Material, subset?: THREE.Mesh) => void;
    getItemProperties: (
      modelID: number,
      expressID: number,
      recursive: boolean
    ) => Promise<Record<string, unknown>>;
  };
}

type SubsetMesh = THREE.Mesh & { modelID: number };

/* ---------- component ---------- */
const IFCViewerComponent = () => {
  /* refs & state -------------------------------------------------------- */
  const containerRef = useRef<HTMLDivElement>(null);
  const [components] = useState(() => new OBC.Components());

  const [world, setWorld] =
    useState<OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer> | null>(null);
  const [ifcLoader, setIfcLoader] = useState<ExtendedIfcLoader | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [selectedProps, setSelectedProps] = useState<IfcProperties | null>(null);
  const [selectedSubset, setSelectedSubset] = useState<SubsetMesh | null>(null);

  /* IFC loading --------------------------------------------------------- */
  const handleFileUpload = async (file: File) => {
    if (!file || !ifcLoader || !world) return;

    // clear previous selection
    clearSelection();

    setLoading(true);
    setError(null);

    try {
      const buffer = await file.arrayBuffer();
      const model = await ifcLoader.load(new Uint8Array(buffer));
      model.name = file.name;
      world.scene.three.add(model);

      // fit camera
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const radius = box.getSize(new THREE.Vector3()).length() * 0.6;
      world.camera.controls.fitToSphere(new THREE.Sphere(center, radius), true);
    } catch (e) {
      console.error(e);
      setError('Failed to load IFC file.');
    } finally {
      setLoading(false);
    }
  };

  /* selection / highlighting ------------------------------------------- */
  const clearSelection = () => {
    setSelectedProps(null);
    if (selectedSubset && ifcLoader) {
      ifcLoader.ifcManager.removeSubset(selectedSubset.modelID, undefined, selectedSubset);
    }
    setSelectedSubset(null);
  };

  useEffect(() => {
    if (!ifcLoader || !world || !containerRef.current) return;

    const viewer = containerRef.current;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = async (e: MouseEvent) => {
      if (!world) return;

      /* normalised device coords */
      const rect = viewer.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, world.camera.three);
      const hits = raycaster.intersectObjects(world.scene.three.children, true);

      /* find first hit that belongs to an IFC model */
      let target: THREE.Intersection | null = null;
      let modelID: number | undefined;

      for (const h of hits) {
        const obj = h.object as THREE.Mesh & { modelID?: number };
        modelID = obj.modelID ?? (obj.parent as any)?.modelID;
        if (modelID !== undefined) {
          target = h;
          break;
        }
      }

      if (!target || modelID === undefined) {
        clearSelection();
        return;
      }

      /* express ID of clicked face */
      const expressID = ifcLoader.ifcManager.getExpressId(
        target.object.geometry as THREE.BufferGeometry,
        target.faceIndex ?? 0
      );

      /* highlight */
      clearSelection();
      const subset = ifcLoader.ifcManager.createSubset({
        scene: world.scene.three,
        modelID,
        ids: [expressID],
        removePrevious: false,
        material: new THREE.MeshLambertMaterial({
          color: 0xff0000,
          transparent: true,
          opacity: 0.6
        })
      }) as SubsetMesh;
      subset.modelID = modelID;
      setSelectedSubset(subset);

      /* fetch & show properties */
      const props = await ifcLoader.ifcManager.getItemProperties(modelID, expressID, true);
      setSelectedProps(props);
    };

    viewer.addEventListener('click', onClick as unknown as EventListener);
    return () => viewer.removeEventListener('click', onClick as unknown as EventListener);
  }, [ifcLoader, world, selectedSubset]);

  /* world & loader initialisation -------------------------------------- */
  useEffect(() => {
    if (!containerRef.current) return;

    const worlds = components.get(OBC.Worlds);
    const w = worlds.create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>();

    w.scene = new OBC.SimpleScene(components);
    w.renderer = new OBC.SimpleRenderer(components, containerRef.current);
    w.camera = new OBC.SimpleCamera(components);

    /* basic lighting & grid */
    w.scene.three.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(5, 10, 5);
    w.scene.three.add(dir);
    components.get(OBC.Grids).create(w);

    /* default view */
    w.camera.controls.setLookAt(10, 10, 10, 0, 0, 0);

    setWorld(w);
    components.init();

    /* IfcLoader */
    const loader = components.get(OBC.IfcLoader) as ExtendedIfcLoader;
    loader
      .setup({ autoSetWasm: true })
      .then(() => setIfcLoader(loader))
      .catch((e) => {
        console.error(e);
        setError('Could not initialise the IFC loader (WASM missing?)');
      });

    return () => components.dispose();
  }, [components]);

  /* drag‑and‑drop helpers ---------------------------------------------- */
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
    if (file && file.name.toLowerCase().endsWith('.ifc')) handleFileUpload(file);
  };

  /* render -------------------------------------------------------------- */
  return (
    <div className="ifc-viewer-container">
      {/* toolbar */}
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

      {/* viewer & overlays */}
      <div
        className={`viewer-container ${isDragging ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {loading && <div className="loading">Loading IFC…</div>}
        {error && <div className="error">{error}</div>}

        <div ref={containerRef} className="ifc-viewer" />

        {selectedProps && (
          <PropertiesPanel properties={selectedProps} onClose={() => setSelectedProps(null)} />
        )}
      </div>
    </div>
  );
};

export default IFCViewerComponent;
