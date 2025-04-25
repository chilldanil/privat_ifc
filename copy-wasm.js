import { copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Create public directory if it doesn't exist
mkdirSync('public', { recursive: true });

// Possible WASM file locations
const wasmPaths = [
  join('node_modules', 'web-ifc', 'web-ifc.wasm'),
  join('node_modules', 'web-ifc-viewer', 'node_modules', 'web-ifc', 'web-ifc.wasm'),
  join('node_modules', 'web-ifc-three', 'node_modules', 'web-ifc', 'web-ifc.wasm')
];

// Try to copy from each possible location
let copied = false;
for (const sourcePath of wasmPaths) {
  try {
    copyFileSync(sourcePath, join('public', 'web-ifc.wasm'));
    console.log(`Successfully copied web-ifc.wasm from ${sourcePath}`);
    copied = true;
    break;
  } catch (error) {
    console.log(`Could not copy from ${sourcePath}`);
  }
}

if (!copied) {
  console.error('Failed to copy web-ifc.wasm from any location');
  process.exit(1);
} 