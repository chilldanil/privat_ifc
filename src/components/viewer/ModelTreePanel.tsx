import { useState, useEffect } from 'react';
import * as OBC from "@thatopen/components";
import { FragmentsGroup } from "@thatopen/fragments";
import { 
  Box, 
  Typography, 
  TextField, 
  InputAdornment,
  CircularProgress
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
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
  const [expanded, setExpanded] = useState<number[]>([]);

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
        
        // Collect all node IDs for auto-expansion
        const allNodeIds: number[] = [];
        const collectNodeIds = (nodes: TreeNode[]) => {
          nodes.forEach(node => {
            allNodeIds.push(node.id);
            if (node.children.length > 0) {
              collectNodeIds(node.children);
            }
          });
        };
        collectNodeIds(tree);
        setExpanded(allNodeIds);
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
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      overflow: 'hidden' 
    }}>
      <Box sx={{ 
        p: 2, 
        borderBottom: '1px solid', 
        borderColor: 'divider' 
      }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Parts</Typography>
        
        <TextField
          fullWidth
          size="small"
          placeholder="Search parts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Box>
      
      <Box sx={{ 
        flexGrow: 1, 
        overflow: 'auto', 
        p: 1 
      }}>
        {isLoading ? (
          <Box 
            sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              height: '100%',
              flexDirection: 'column',
              gap: 2
            }}
          >
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary">
              Loading structure...
            </Typography>
          </Box>
        ) : filteredTreeData.length > 0 ? (
          <TreeView 
            data={filteredTreeData} 
            onSelectItem={handleSelectItem}
            defaultExpanded={expanded}
          />
        ) : (
          <Box 
            sx={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              height: '100%' 
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {searchQuery ? 'No results found' : 'No structure available'}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
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

  // ---- NEW Step 3: LINK SPATIAL NODES TO THEIR PARENTS ------------------
  // A spatial node A is a child of another spatial node B
  // IFF B's _elementIds set contains A.id.
  spatialNodes.forEach(parent => {
    const ids = (parent as EnhancedTreeNode)._elementIds;
    if (!ids) return;
    
    ids.forEach(id => {
      const maybeChild = spatialNodes.get(id);
      if (maybeChild) {
        parent.children.push(maybeChild);   // nest the child
        ids.delete(id);                    // keep only element IDs
      }
    });
  });

  // ---- Step 4: Group elements by type under each spatial structure -------------
  // Process each spatial node
  spatialNodes.forEach(spatialNode => {
    const typeGroups: Record<string, TreeNode> = {};
    const elementIds = (spatialNode as EnhancedTreeNode)._elementIds as Set<number>;
    const spatialId = typeof spatialNode.id === 'number' ? spatialNode.id : 0;
    
    // Process each entity type
    let typeCounter = 0;
    for (const entityType in entityClassification) {
      const entityGroup: any = entityClassification[entityType];
      if (!entityGroup?.map) continue;

      const typeElements: TreeNode[] = [];

      // Walk through fragment IDs -> expressID sets
      for (const fragID in entityGroup.map) {
        for (const eid of entityGroup.map[fragID] as Set<number>) {
          if (!elementIds.has(eid)) continue; // belongs to another spatial node

          const node =
            elementNodes.get(eid) ?? {
              id: eid,
              expressID: eid,
              name: nameMap[eid] ?? `${getTypeName(entityType)} ${eid}`,
              type: getTypeName(entityType),
              children: []
            };

          elementNodes.set(eid, node);
          typeElements.push(node);
        }
      }

      if (typeElements.length) {
        typeCounter += 1;
        const friendlyTypeName = getTypeName(entityType);
        const groupId = -(spatialId * 1000 + typeCounter);

        typeGroups[entityType] = {
          id: groupId,
          expressID: groupId,
          name: `${getTypePluralName(friendlyTypeName)} (${typeElements.length})`,
          type: `${friendlyTypeName}Group`,
          children: typeElements.sort((a, b) => a.name.localeCompare(b.name))
        };
      }
    }
    
    // Sort type elements by name
    Object.values(typeGroups).forEach(group => {
      group.children.sort((a, b) => a.name.localeCompare(b.name));
    });
    
    // Replace the spatial node's children with the type groups
    // We need to add the type groups to the existing children (which now contain nested spatial nodes)
    spatialNode.children = [...spatialNode.children, ...Object.values(typeGroups).sort((a, b) => 
      a.name.localeCompare(b.name)
    )];
    
    // Now it's safe to remove the tracking set
    delete (spatialNode as any)._elementIds;
  });

  // ---- Step 5: Sort spatial structure nodes -------------
  // Sort roots by type priority (Project -> Site -> Building -> Storey, etc.)
  const roots: TreeNode[] = Array.from(spatialNodes.values()).filter(node => {
    // Find nodes that aren't children of any other node
    for (const potentialParent of spatialNodes.values()) {
      if (potentialParent !== node && potentialParent.children.includes(node)) {
        return false; // This node is a child of another spatial node
      }
    }
    return true; // This node isn't a child of any other node, so it's a root
  });
  
  const typePriority: Record<string, number> = {
    'Project': 1,
    'Site': 2,
    'Building': 3,
    'Storey': 4,
    'Space': 5
  };
  
  // Sort roots by priority
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