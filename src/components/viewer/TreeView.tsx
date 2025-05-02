import { useState } from 'react';

// Node structure for tree items
export interface TreeNode {
  id: number;
  name: string;
  children: TreeNode[];
  type?: string;
  expressID?: number;
}

interface TreeViewProps {
  data: TreeNode[];
  onSelectItem: (id: number) => void;
  defaultExpanded?: number[];
}

// Individual tree item component (recursive)
const TreeItem: React.FC<{
  node: TreeNode;
  onSelectItem: (id: number) => void;
  level: number;
  defaultExpanded?: number[];
}> = ({ node, onSelectItem, level, defaultExpanded }) => {
  const [isOpen, setIsOpen] = useState(
    level < 1 || (defaultExpanded?.includes(node.id) ?? false)
  ); // Auto-expand first level or if in defaultExpanded
  
  const hasChildren = node.children && node.children.length > 0;
  const indent = level * 16; // Indentation per level
  
  return (
    <div className="tree-item">
      <div 
        className="tree-item-header" 
        style={{ paddingLeft: `${indent}px` }}
      >
        {hasChildren && (
          <button 
            className={`tree-toggle ${isOpen ? 'open' : 'closed'}`}
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? '▼' : '►'}
          </button>
        )}
        
        {!hasChildren && <span className="tree-toggle-placeholder"></span>}
        
        <span 
          className={`tree-item-label ${hasChildren ? 'folder' : 'leaf'}`}
          onClick={() => {
            const eid = node.expressID ?? node.id;
            // Highlight if it corresponds to a *real* IFC object
            if (eid > 0) {
              onSelectItem(eid);
            }
          }}
          data-selectable={(node.expressID ?? node.id) > 0 ? "true" : "false"}
          title={node.type ? `${node.name} (${node.type})` : node.name}
        >
          {node.name}
          {node.type && <span className="tree-item-type">{node.type}</span>}
        </span>
      </div>
      
      {isOpen && hasChildren && (
        <div className="tree-item-children">
          {node.children.map(child => (
            <TreeItem 
              key={`${child.id}-${child.name}`} 
              node={child} 
              onSelectItem={onSelectItem} 
              level={level + 1} 
              defaultExpanded={defaultExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Main TreeView component
const TreeView: React.FC<TreeViewProps> = ({ data, onSelectItem, defaultExpanded }) => {
  return (
    <div className="tree-view">
      <div className="tree-container">
        {data.map(node => (
          <TreeItem 
            key={`${node.id}-${node.name}`} 
            node={node} 
            onSelectItem={onSelectItem} 
            level={0} 
            defaultExpanded={defaultExpanded}
          />
        ))}
      </div>
    </div>
  );
};

export default TreeView; 