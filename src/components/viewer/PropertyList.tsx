import React from 'react';
import { Box, Typography, Divider } from '@mui/material';

interface PropertyListProps {
  properties: Record<string, any>;
}

// Helper function to format property values nicely
const formatValue = (value: any): string => {
  if (value === null || value === undefined) return '-';
  
  if (typeof value === 'object') {
    // If it's a property with value/type structure (common in IFC)
    if (value.value !== undefined) {
      return value.value?.toString() || '-';
    }
    
    // Otherwise stringify the object
    try {
      return JSON.stringify(value);
    } catch (e) {
      return '[Complex Object]';
    }
  }
  
  return value.toString();
};

const PropertyList: React.FC<PropertyListProps> = ({ properties }) => {
  return (
    <div>
      {Object.entries(properties).map(([key, value]) => (
        <Box key={key} sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" color="primary" sx={{ fontWeight: "medium" }}>
            {key}:
          </Typography>
          <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
            {formatValue(value)}
          </Typography>
          <Divider sx={{ mt: 1 }} />
        </Box>
      ))}
    </div>
  );
};

export default PropertyList; 