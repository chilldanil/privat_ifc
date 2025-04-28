import { useState, useEffect } from 'react';
import * as OBC from "@thatopen/components";
import { FragmentsGroup } from "@thatopen/fragments";
import TreeView, { TreeNode } from './TreeView';
import '../../styles/TreeView.css';

interface ModelTreePanelProps {
  components: OBC.Components;
  model: FragmentsGroup;
  onSelect: (id: number) => void;
}

// IFC types map to show friendly names
const IFC_TYPES: Record<string, string> = {
  'IFCPROJECT': 'Project',
  'IFCSITE': 'Site',
  'IFCBUILDING': 'Building',
  'IFCBUILDINGSTOREY': 'Storey',
  'IFCSPACE': 'Space',
  'IFCWALL': 'Wall',
  'IFCWINDOW': 'Window',
  'IFCDOOR': 'Door',
  'IFCCOLUMN': 'Column',
  'IFCSLAB': 'Slab',
  'IFCBEAM': 'Beam',
  'IFCFURNITUREELEMENT': 'Furniture',
  'IFCSTAIR': 'Stair',
  'IFCRAILING': 'Railing',
  'IFCROOF': 'Roof',
  'IFCMEMBER': 'Member',
  'IFCPLATE': 'Plate',
};

const ModelTreePanel: React.FC<ModelTreePanelProps> = ({ 
  components,
  model, 
  onSelect 
}) => {
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredTreeData, setFilteredTreeData] = useState<TreeNode[]>([]);

  // Load spatial structure when model changes
  useEffect(() => {
    if (!model) return;
    setIsLoading(true);
    
    const classifier = components.get(OBC.Classifier);
    const indexer = components.get(OBC.IfcRelationsIndexer);
    
    (async () => {
      try {
        /* 1️⃣ Build relations – mandatory for spatialStructure */
        await indexer.process(model);
        
        /* 2️⃣ Now classifier can group by spatialStructure */
        await classifier.bySpatialStructure(model);
        const tree = convertClassifierToTree(classifier);
        setTreeData(tree);
        setFilteredTreeData(tree);
      } 
      catch (error) {
        console.error('Error building spatial structure:', error);
        
        // Fallback to entity classification if spatial structure fails
        try {
          await classifier.byEntity(model);
          const tree = convertClassifierToTree(classifier);
          setTreeData(tree);
          setFilteredTreeData(tree);
        } 
        catch (err: any) {
          console.error('Error classifying by entity:', err);
          const errorTree = [{
            id: 0,
            name: 'Error loading structure',
            children: []
          }];
          setTreeData(errorTree);
          setFilteredTreeData(errorTree);
        }
      }
      finally {
        setIsLoading(false);
      }
    })();
  }, [model, components]);

  // Filter tree when search query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredTreeData(treeData);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const filterTree = (nodes: TreeNode[]): TreeNode[] => {
      return nodes
        .map(node => {
          // Check if this node matches
          const nodeMatches = node.name.toLowerCase().includes(query) || 
                             (node.type && node.type.toLowerCase().includes(query));
          
          // Filter children
          const filteredChildren = filterTree(node.children);
          
          // Include this node if it matches or has matching children
          if (nodeMatches || filteredChildren.length > 0) {
            return {
              ...node,
              children: filteredChildren
            };
          }
          
          return null;
        })
        .filter((node): node is TreeNode => node !== null);
    };
    
    setFilteredTreeData(filterTree(treeData));
  }, [searchQuery, treeData]);

  const handleSelectItem = (expressID: number) => {
    if (onSelect) {
      onSelect(expressID);
    }
  };

  return (
    <div className="model-tree-panel">
      <div className="model-tree-header">
        <h3>Model Structure</h3>
      </div>
      
      <div className="model-tree-search">
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      
      <div className="model-tree-content">
        {isLoading ? (
          <div className="tree-loading">Loading structure...</div>
        ) : filteredTreeData.length > 0 ? (
          <TreeView 
            data={filteredTreeData} 
            onSelectItem={handleSelectItem}
          />
        ) : (
          <div className="tree-empty">
            {searchQuery ? 'No results found' : 'No structure available'}
          </div>
        )}
      </div>
    </div>
  );
};

// helper just above convertClassifierToTree
const safeNumber = (value: string): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

// Function to convert classifier data to TreeNode structure
function convertClassifierToTree(classifier: OBC.Classifier): TreeNode[] {
  const systems = classifier.list.spatialStructures;
  if (!systems) return [];

  // ---- First pass: create one node per expressID -------------
  const nodes = new Map<number, TreeNode>();

  for (const groupName in systems) {
    const group = systems[groupName];            // { id, name, map }
    const parentID = group.id ?? -1;

    // every Set in `map` contains the expressIDs that belong to this level
    for (const fragID in group.map) {
      for (const eid of group.map[fragID]) {
        if (!nodes.has(eid)) {
          nodes.set(eid, {
            id: eid,
            expressID: eid,
            name: groupName || `Item ${eid}`,
            type: getTypeName(groupName),
            children: []
          });
        }
        // store child→parent relation (second pass will link them)
        (nodes.get(eid)! as any)._parent = parentID >= 0 ? parentID : null;
      }
    }
  }

  // ---- Second pass: build the hierarchy ----------------------
  const roots: TreeNode[] = [];
  nodes.forEach((node) => {
    const parentID = (node as any)._parent;
    delete (node as any)._parent;

    if (parentID != null && nodes.has(parentID)) {
      nodes.get(parentID)!.children.push(node);
    } else {
      roots.push(node);           // top-level (Project / Site / etc.)
    }
  });

  return roots;
}

// Get a friendly type name from IFC type
function getTypeName(ifcType: string): string {
  if (!ifcType) return 'Unknown';
  const typeWithoutIFC = ifcType.toUpperCase();
  return IFC_TYPES[typeWithoutIFC] || typeWithoutIFC;
}

export default ModelTreePanel; 