import { useState } from 'react';
import { 
  Box, 
  Typography,
  Collapse,
  IconButton
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

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
  const isSelectable = (node.expressID ?? node.id) > 0;
  
  return (
    <Box>
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          pl: level * 2, 
          py: 0.5,
          '&:hover': {
            bgcolor: 'action.hover'
          }
        }}
      >
        <IconButton 
          size="small" 
          onClick={() => setIsOpen(!isOpen)}
          disabled={!hasChildren}
          sx={{ 
            visibility: hasChildren ? 'visible' : 'hidden',
            p: 0.5,
            mr: 0.5
          }}
        >
          {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>
        
        {hasChildren ? (
          isOpen ? <FolderOpenIcon fontSize="small" color="primary" sx={{ mr: 1 }} /> 
                 : <FolderIcon fontSize="small" color="primary" sx={{ mr: 1 }} />
        ) : (
          <InsertDriveFileIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
        )}
        
        <Box
          onClick={() => {
            if (isSelectable) {
              const eid = node.expressID ?? node.id;
              onSelectItem(eid);
            }
          }}
          sx={{ 
            cursor: isSelectable ? 'pointer' : 'default',
            flexGrow: 1,
            display: 'flex',
            alignItems: 'center',
            borderRadius: 1,
            '&:hover': {
              bgcolor: isSelectable ? 'action.selected' : undefined
            }
          }}
        >
          <Typography 
            variant="body2" 
            noWrap
            title={node.type ? `${node.name} (${node.type})` : node.name}
            sx={{ 
              fontWeight: level === 0 ? 500 : 400
            }}
          >
            {node.name}
          </Typography>
          
          {node.type && (
            <Typography 
              variant="caption" 
              sx={{ 
                ml: 1, 
                color: 'text.secondary',
                bgcolor: 'action.selected', 
                px: 0.5, 
                borderRadius: 0.5
              }}
            >
              {node.type}
            </Typography>
          )}
        </Box>
      </Box>
      
      {hasChildren && (
        <Collapse in={isOpen}>
          <Box>
            {node.children.map(child => (
              <TreeItem 
                key={`${child.id}-${child.name}`} 
                node={child} 
                onSelectItem={onSelectItem} 
                level={level + 1} 
                defaultExpanded={defaultExpanded}
              />
            ))}
          </Box>
        </Collapse>
      )}
    </Box>
  );
};

// Main TreeView component
const TreeView: React.FC<TreeViewProps> = ({ data, onSelectItem, defaultExpanded }) => {
  return (
    <Box sx={{ overflow: 'auto', height: '100%' }}>
      {data.map(node => (
        <TreeItem 
          key={`${node.id}-${node.name}`} 
          node={node} 
          onSelectItem={onSelectItem} 
          level={0} 
          defaultExpanded={defaultExpanded}
        />
      ))}
    </Box>
  );
};

export default TreeView; 