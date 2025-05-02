import React, { useEffect, useState } from 'react';
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import * as BUIC from "@thatopen/ui-obc";
import { FragmentsGroup } from "@thatopen/fragments";
import { Box, Paper, TextField, Typography, InputAdornment, CircularProgress } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

interface RelationsTreePanelProps {
  components: OBC.Components;
  model: FragmentsGroup | null;
  onSelect: (id: number) => void;
}

const RelationsTreePanel: React.FC<RelationsTreePanelProps> = ({ 
  components,
  model, 
  onSelect 
}) => {
  const [relationsTree, setRelationsTree] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Initialize BUI once on component mount
  useEffect(() => {
    try {
      // This should be called only once in your app
      BUI.Manager.init();
    } catch (e) {
      console.warn('BUI Manager initialization failed, might already be initialized');
    }
  }, []);

  // Create the relations tree when component mounts
  useEffect(() => {
    // Create the relations tree component
    const [tree] = BUIC.tables.relationsTree({
      components,
      models: model ? [model] : [],
    });

    tree.preserveStructureOnFilter = true;
    
    // When an item is selected in the tree
    tree.addEventListener('itemSelected', (e: any) => {
      const detail = e.detail;
      if (detail && detail.expressID) {
        onSelect(detail.expressID);
      }
    });

    setRelationsTree(tree);

    // Mount the tree to our container div
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(tree);
    }

    return () => {
      // Clean up
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [components]);

  // Update models in the tree when model changes
  useEffect(() => {
    if (!relationsTree) return;

    setIsLoading(true);
    
    const models = model ? [model] : [];
    relationsTree.models = models;

    // Make sure we have the relations indexed
    if (model) {
      const indexer = components.get(OBC.IfcRelationsIndexer);
      
      (async () => {
        if (model.hasProperties) {
          try {
            await indexer.process(model);
            console.log("Relations indexed successfully");
          } catch (error) {
            console.error("Error indexing relations:", error);
          } finally {
            setIsLoading(false);
          }
        } else {
          console.warn("Model has no properties to index");
          setIsLoading(false);
        }
      })();
    } else {
      setIsLoading(false);
    }
  }, [model, relationsTree, components]);

  // Handle search query changes
  useEffect(() => {
    if (!relationsTree) return;
    relationsTree.queryString = searchQuery;
  }, [searchQuery, relationsTree]);

  return (
    <Paper sx={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <Box sx={{ 
        p: 2, 
        borderBottom: '1px solid', 
        borderColor: 'divider' 
      }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Model Tree</Typography>
        
        <TextField
          fullWidth
          size="small"
          placeholder="Search model tree..."
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
        p: 1,
        position: 'relative'
      }}>
        {isLoading && (
          <Box sx={{ 
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.7)',
            zIndex: 1
          }}>
            <CircularProgress size={24} />
          </Box>
        )}
        
        <div 
          ref={containerRef} 
          style={{ 
            height: '100%', 
            overflow: 'auto' 
          }}
        />
      </Box>
    </Paper>
  );
};

export default RelationsTreePanel; 