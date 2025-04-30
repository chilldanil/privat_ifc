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

  // Debug output
  console.log("Spatial structures:", JSON.stringify(classifier.list.spatialStructures, null, 2));

  // ---- Step 1: Create spatial structure nodes (by group ID) -------------
  const spatialNodes = new Map<number, TreeNode>();
  const elementNodes = new Map<number, TreeNode>();
  
  // First pass: create spatial structure nodes
  for (const groupName in systems) {
    const group = systems[groupName];
    const groupID = group.id;
    
    if (groupID !== undefined && groupID !== null && !spatialNodes.has(groupID)) {
      spatialNodes.set(groupID, {
        id: groupID,
        expressID: groupID,
        name: groupName || `Group ${groupID}`,
        type: getTypeName(groupName),
        children: []
      });
    }
  }

  // ---- Step 2: Create and assign element nodes to their spatial parents -------------
  for (const groupName in systems) {
    const group = systems[groupName];
    const parentID = group.id;
    
    if (parentID === undefined || parentID === null) continue;
    
    // Get the parent node (create it if it doesn't exist)
    let parentNode = spatialNodes.get(parentID);
    if (!parentNode) {
      parentNode = {
        id: parentID,
        expressID: parentID,
        name: groupName || `Group ${parentID}`,
        type: getTypeName(groupName),
        children: []
      };
      spatialNodes.set(parentID, parentNode);
    }
    
    // Create element nodes for each expressID in this group
    for (const fragID in group.map) {
      for (const eid of group.map[fragID]) {
        // Skip if this is a spatial structure node (already handled)
        if (spatialNodes.has(eid)) continue;
        
        // Create element node if it doesn't exist
        if (!elementNodes.has(eid)) {
          // Try to get element type from the entity list
          let elementType = 'Element';
          let elementName = `Element ${eid}`;
          
          // Look up this element in the entity list to get its type
          try {
            const entityList = classifier.list.entities;
            if (entityList) {
              // Search all entity types
              for (const entityType in entityList) {
                const entities = entityList[entityType];
                if (Array.isArray(entities)) {
                  // Find this express ID in the entities
                  const entity = entities.find(e => e.expressID === eid);
                  if (entity) {
                    elementType = getTypeName(entityType);
                    
                    // Try to get a better name from entity properties
                    if (entity.Name) {
                      elementName = entity.Name;
                    } else if (entity.GlobalId) {
                      elementName = `${elementType} [${entity.GlobalId}]`;
                    } else {
                      elementName = `${elementType} ${eid}`;
                    }
                    break;
                  }
                }
              }
            }
          } catch (error) {
            console.warn(`Error getting entity type for ${eid}:`, error);
          }
          
          const elementNode: TreeNode = {
            id: eid,
            expressID: eid,
            name: elementName,
            type: elementType,
            children: []
          };
          elementNodes.set(eid, elementNode);
          
          // Add element as child to its spatial parent
          parentNode.children.push(elementNode);
        }
      }
    }
  }

  // Sort elements inside each spatial node by type
  spatialNodes.forEach(node => {
    node.children.sort((a, b) => {
      const typeA = a.type || '';
      const typeB = b.type || '';
      if (typeA !== typeB) {
        return typeA.localeCompare(typeB);
      }
      return a.name.localeCompare(b.name);
    });
  });

  // ---- Step 3: Build a hierarchy of spatial structure nodes -------------
  // This would require property metadata about each node to know Project > Site > Building, etc.
  // For now, we'll just return all spatial nodes as root nodes
  const roots: TreeNode[] = Array.from(spatialNodes.values());
  
  // Sort roots by type priority (Project -> Site -> Building -> Storey, etc.)
  const typePriority: Record<string, number> = {
    'Project': 1,
    'Site': 2,
    'Building': 3,
    'Storey': 4,
    'Space': 5
  };
  
  roots.sort((a, b) => {
    const priorityA = typePriority[a.type || ''] || 100;
    const priorityB = typePriority[b.type || ''] || 100;
    return priorityA - priorityB;
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