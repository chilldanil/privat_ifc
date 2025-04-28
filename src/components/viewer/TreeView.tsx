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
}

// Individual tree item component (recursive)
const TreeItem: React.FC<{
  node: TreeNode;
  onSelectItem: (id: number) => void;
  level: number;
}> = ({ node, onSelectItem, level }) => {
  const [isOpen, setIsOpen] = useState(level < 1); // Auto-expand first level
  
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
          className="tree-item-label"
          onClick={() => onSelectItem(node.expressID || node.id)}
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
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Main TreeView component
const TreeView: React.FC<TreeViewProps> = ({ data, onSelectItem }) => {
  return (
    <div className="tree-view">
      <div className="tree-container">
        {data.map(node => (
          <TreeItem 
            key={`${node.id}-${node.name}`} 
            node={node} 
            onSelectItem={onSelectItem} 
            level={0} 
          />
        ))}
      </div>
    </div>
  );
};

export default TreeView; 