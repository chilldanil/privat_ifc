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

// Function to convert classifier data to TreeNode structure
function convertClassifierToTree(classifier: OBC.Classifier): TreeNode[] {
  const result: TreeNode[] = [];
  
  // Try to get spatial structure first
  if (classifier.list.spatialStructures && typeof classifier.list.spatialStructures === 'object') {
    try {
      // Convert spatial structure to tree
      const spatialData = classifier.list.spatialStructures;
      
      if (spatialData && Object.keys(spatialData).length > 0) {
        const firstKey = Object.keys(spatialData)[0];
        const structure = spatialData[firstKey];
        
        const buildNode = (level: any, expressID: number): TreeNode => {
          const type = level.type || 'Unknown';
          const name = level.name || `${getTypeName(type)} ${expressID}`;
          
          const node: TreeNode = {
            id: expressID,
            expressID: expressID,
            name: name,
            type: getTypeName(type),
            children: []
          };
          
          // Add children if available
          if (level.children) {
            for (const [childID, childLevel] of Object.entries(level.children)) {
              node.children.push(buildNode(childLevel, parseInt(childID)));
            }
          }
          
          return node;
        };
        
        // Start with the root level (usually project)
        for (const [expressID, level] of Object.entries(structure)) {
          result.push(buildNode(level, parseInt(expressID)));
        }
      }
    } catch (error) {
      console.warn('Error parsing spatial structure:', error);
    }
  } 
  // If no spatial structure, try entities
  else if (classifier.list.entities && typeof classifier.list.entities === 'object') {
    try {
      // Group by entity type
      const entitiesData = classifier.list.entities;
      const typeMap = new Map<string, number[]>();
      
      // Create a map of types to expressIDs
      Object.entries(entitiesData).forEach(([type, items]) => {
        const ids: number[] = [];
        
        if (Array.isArray(items)) {
          items.forEach((item: any) => {
            if (item && typeof item.expressID === 'number') {
              ids.push(item.expressID);
            }
          });
        }
        
        if (ids.length > 0) {
          typeMap.set(type, ids);
        }
      });
      
      // Create type categories
      typeMap.forEach((ids, type) => {
        const typeName = getTypeName(type);
        const node: TreeNode = {
          id: -1, // Use negative ID for categories
          name: `${typeName}s`, // Pluralize
          type: type,
          children: []
        };
        
        // Add individual items
        ids.forEach((expressID, index) => {
          node.children.push({
            id: expressID,
            expressID: expressID,
            name: `${typeName} ${index + 1}`,
            type: type,
            children: []
          });
        });
        
        result.push(node);
      });
    } catch (error) {
      console.warn('Error parsing entities:', error);
    }
  }
  
  return result;
}

// Get a friendly type name from IFC type
function getTypeName(ifcType: string): string {
  if (!ifcType) return 'Unknown';
  const typeWithoutIFC = ifcType.toUpperCase();
  return IFC_TYPES[typeWithoutIFC] || typeWithoutIFC;
}

export default ModelTreePanel; 