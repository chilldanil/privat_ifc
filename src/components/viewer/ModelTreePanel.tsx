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

// Convert singular type names to plural for group labels
function getTypePluralName(typeName: string): string {
  if (typeName.endsWith('y')) {
    return typeName.slice(0, -1) + 'ies';
  }
  return typeName + 's';
}

// Update the TreeNode interface to allow our _elementIds property
interface EnhancedTreeNode extends TreeNode {
  _elementIds?: Set<number>;
}

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
        
        /* 3️⃣ Also classify by entity type for grouping */
        await classifier.byEntity(model);
        
        /* 4️⃣ Collect all unique expressIDs */
        const allIds = new Set<number>();
        
        // Add IDs from spatial structures
        if (classifier.list.spatialStructures) {
          Object.values(classifier.list.spatialStructures).forEach(group => {
            Object.values(group.map).forEach(idSet => {
              idSet.forEach(id => allIds.add(id));
            });
          });
        }
        
        /* 5️⃣ Fetch properties for all IDs */
        console.log(`Fetching properties for ${allIds.size} elements...`);
        const nameMap: Record<number, string> = {};
        
        // Use Promise.all for parallel fetching, but limit batch size to avoid overwhelming
        const batchSize = 100;
        const idsArray = Array.from(allIds);
        
        for (let i = 0; i < idsArray.length; i += batchSize) {
          const batch = idsArray.slice(i, i + batchSize);
          await Promise.all(batch.map(async id => {
            try {
              const props = await model.getProperties(id);
              nameMap[id] = props?.Name?.value || `Element ${id}`;
            } catch (err) {
              console.warn(`Could not get properties for element ${id}:`, err);
              nameMap[id] = `Element ${id}`;
            }
          }));
        }
        
        /* 6️⃣ Build the tree with our enhanced data */
        const tree = convertClassifierToTree(classifier, nameMap);
        setTreeData(tree);
        setFilteredTreeData(tree);
      } 
      catch (error) {
        console.error('Error building spatial structure:', error);
        
        // Fallback to entity classification if spatial structure fails
        try {
          await classifier.byEntity(model);
          const nameMap: Record<number, string> = {};
          const tree = convertClassifierToTree(classifier, nameMap);
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
function convertClassifierToTree(
  classifier: OBC.Classifier,
  nameMap: Record<number, string>
): TreeNode[] {
  const systems = classifier.list.spatialStructures;
  if (!systems) return [];

  // Debug output
  console.log("Building tree with spatial structures...");

  // Get entity classifications first so we can find the project info
  const entityClassification = classifier.list.entities;

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
        children: [],
        _elementIds: new Set<number>() // Track all elements under this spatial node
      } as EnhancedTreeNode);
    }
  }

  // ---- Step 2: Collect elements for each spatial structure -------------
  for (const groupName in systems) {
    const group = systems[groupName];
    const parentID = group.id;
    
    if (parentID === undefined || parentID === null) continue;
    
    // Get the parent node (create it if it doesn't exist)
    let parentNode = spatialNodes.get(parentID) as EnhancedTreeNode | undefined;
    if (!parentNode) {
      parentNode = {
        id: parentID,
        expressID: parentID,
        name: groupName || `Group ${parentID}`,
        type: getTypeName(groupName),
        children: [],
        _elementIds: new Set<number>()
      } as EnhancedTreeNode;
      spatialNodes.set(parentID, parentNode);
    }
    
    // Create element nodes for each expressID in this group
    for (const fragID in group.map) {
      for (const eid of group.map[fragID]) {
        // Skip if this is a spatial structure node (already handled)
        if (spatialNodes.has(eid)) continue;
        
        // Add this element ID to the parent's tracking set
        (parentNode as any)._elementIds.add(eid);
        
        // Create element node if it doesn't exist
        if (!elementNodes.has(eid)) {
          const elementNode: TreeNode = {
            id: eid,
            expressID: eid,
            name: nameMap[eid] || `Element ${eid}`,
            type: 'Element',
            children: []
          };
          elementNodes.set(eid, elementNode);
        }
      }
    }
  }

  // ---- Step 3: Group elements by type under each spatial structure -------------
  // Process each spatial node
  spatialNodes.forEach(spatialNode => {
    const typeGroups: Record<string, TreeNode> = {};
    const elementIds = (spatialNode as EnhancedTreeNode)._elementIds as Set<number>;
    const spatialId = typeof spatialNode.id === 'number' ? spatialNode.id : 0;
    
    // Process each entity type
    let typeCounter = 0;
    for (const entityType in entityClassification) {
      const entities = entityClassification[entityType];
      if (!Array.isArray(entities)) continue;
      
      // Find elements of this type that belong to this spatial node
      const typeElements: TreeNode[] = [];
      
      entities.forEach(entity => {
        const eid = entity.expressID;
        if (elementIds.has(eid)) {
          // Get the node we created earlier or create a new one
          const elementNode = elementNodes.get(eid) || {
            id: eid,
            expressID: eid,
            name: nameMap[eid] || `${getTypeName(entityType)} ${eid}`,
            type: getTypeName(entityType),
            children: []
          };
          
          // Update type if we have better info from entity classification
          elementNode.type = getTypeName(entityType);
          typeElements.push(elementNode);
        }
      });
      
      // If we found elements of this type, create a type group
      if (typeElements.length > 0) {
        const friendlyTypeName = getTypeName(entityType);
        typeCounter += 1;
        const typeGroupNumericId = -(spatialId * 1000 + typeCounter);
        
        // Create a group node for this type
        typeGroups[entityType] = {
          id: typeGroupNumericId,
          name: `${getTypePluralName(friendlyTypeName)} (${typeElements.length})`,
          type: `${friendlyTypeName}Group`,
          children: typeElements,
          expressID: typeGroupNumericId  // Same as id to avoid selection issues
        };
      }
    }
    
    // Sort type elements by name
    Object.values(typeGroups).forEach(group => {
      group.children.sort((a, b) => a.name.localeCompare(b.name));
    });
    
    // Replace the spatial node's children with the type groups
    spatialNode.children = Object.values(typeGroups).sort((a, b) => 
      a.name.localeCompare(b.name)
    );
    
    // Remove the tracking set
    delete (spatialNode as any)._elementIds;
  });

  // ---- Step 4: Build a hierarchy of spatial structure nodes -------------
  // Sort roots by type priority (Project -> Site -> Building -> Storey, etc.)
  const roots: TreeNode[] = Array.from(spatialNodes.values());
  const typePriority: Record<string, number> = {
    'Project': 1,
    'Site': 2,
    'Building': 3,
    'Storey': 4,
    'Space': 5
  };
  
  // ---- Step 5: LINK SPATIAL NODES TO THEIR PARENTS ------------------
  // A spatial node A is a child of another spatial node B
  // IFF B's _elementIds set contains A.id.
  spatialNodes.forEach(childNode => {
    const childId = childNode.id;
    spatialNodes.forEach(parentNode => {
      if (parentNode === childNode) return;
      const ids = (parentNode as EnhancedTreeNode)._elementIds as Set<number>;
      if (ids?.has(childId)) {
        // Remove the ID from parent's element set (so it doesn't become a leaf)
        ids.delete(childId);
        // Attach child under parent if not already there
        if (!parentNode.children.includes(childNode)) {
          parentNode.children.push(childNode);
        }
      }
    });
  });
  
  roots.sort((a, b) => {
    const priorityA = typePriority[a.type || ''] || 100;
    const priorityB = typePriority[b.type || ''] || 100;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return a.name.localeCompare(b.name);
  });
  
  // Find the Project ID and Name
  let projectId: number | undefined;
  if (entityClassification && entityClassification.IFCPROJECT && 
      Array.isArray(entityClassification.IFCPROJECT) && 
      entityClassification.IFCPROJECT.length > 0) {
    projectId = entityClassification.IFCPROJECT[0].expressID;
  }
  
  const projectName = projectId
    ? nameMap[projectId] || `Project ${projectId}`
    : 'Project';
  
  // Build a Project node
  const projectNode: TreeNode = {
    id: projectId ?? -1,
    expressID: projectId ?? -1,
    name: projectName,
    type: 'Project',
    children: roots
  };
  
  return [projectNode];
}

// Get a friendly type name from IFC type
function getTypeName(ifcType: string): string {
  if (!ifcType) return 'Unknown';
  const typeWithoutIFC = ifcType.toUpperCase();
  return IFC_TYPES[typeWithoutIFC] || typeWithoutIFC;
}

export default ModelTreePanel; 