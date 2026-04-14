import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

const Pro2D_3DThumbnail = ({ entities, nodes }) => {
  const [collapsed, setCollapsed] = useState(false);

  const lines = Object.values(entities || {})
    .filter((e: any) => e.type === 'PIPE' || e.type === 'SEGMENT')
    .map((ent: any) => {
      const nIds = ent.geometry?.nodeIds || [];
      const n1 = nodes[nIds[0]]?.pt;
      const n2 = nodes[nIds[nIds.length - 1]]?.pt;
      if (!n1 || !n2) return null;
      return [
        new THREE.Vector3(n1.x, -n1.y, n1.z || 0), // Y is flipped in 2D
        new THREE.Vector3(n2.x, -n2.y, n2.z || 0)
      ];
    })
    .filter(Boolean);

  return (
    <div className={`absolute bottom-4 left-24 bg-slate-900 border border-slate-700 rounded-lg shadow-lg overflow-hidden transition-all \${collapsed ? 'w-10 h-10' : 'w-64 h-48'}`} style={{ zIndex: 100 }}>
      <div 
        className="bg-slate-800 text-slate-300 text-[10px] p-1 flex justify-between items-center cursor-pointer uppercase tracking-wider"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span>{collapsed ? '3D' : '3D Preview (Orbit)'}</span>
        <span>{collapsed ? '▲' : '▼'}</span>
      </div>
      {!collapsed && (
        <div className="w-full h-[calc(100%-20px)]">
          <Canvas camera={{ position: [400, 400, 400], fov: 50 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
            {lines.map((pts, i) => (
              <line key={i}>
                <bufferGeometry attach="geometry">
                  <bufferAttribute
                    attach="attributes-position"
                    count={2}
                    array={new Float32Array([pts[0].x, pts[0].y, pts[0].z, pts[1].x, pts[1].y, pts[1].z])}
                    itemSize={3}
                  />
                </bufferGeometry>
                <lineBasicMaterial attach="material" color="#38bdf8" linewidth={2} />
              </line>
            ))}
            <OrbitControls makeDefault />
          </Canvas>
        </div>
      )}
    </div>
  );
};

export default Pro2D_3DThumbnail;
