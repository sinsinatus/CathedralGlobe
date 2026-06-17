// InteriorViewer.tsx - MINIMAL STABLE VERSION (v3)
import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import * as THREE from 'three';

interface InteriorViewerProps {
  items?: any[];
  onItemClick?: (item: any) => void;
}

export default function InteriorViewer({ items = [], onItemClick }: InteriorViewerProps) {
  const [isActive, setIsActive] = useState(false);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [0, 1.7, 5], fov: 75 }}
        style={{ background: '#0a0a1f' }}
        onClick={() => setIsActive(true)}
      >
        <Scene isActive={isActive} />
      </Canvas>

      {!isActive && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          background: 'rgba(0,0,0,0.7)',
          padding: '12px 24px',
          borderRadius: 8,
          pointerEvents: 'none'
        }}>
          Click to activate movement (WASD + Shift)
        </div>
      )}
    </div>
  );
}

function Scene({ isActive }: { isActive: boolean }) {
  const { camera } = useThree();
  const keys = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((_, delta) => {
    if (!isActive) return;

    const sprint = keys.current['ShiftLeft'] || keys.current['ShiftRight'];
    const speed = sprint ? 14 : 6;
    const move = speed * delta;

    const forward = Number(keys.current['KeyW']) - Number(keys.current['KeyS']);
    const strafe = Number(keys.current['KeyD']) - Number(keys.current['KeyA']);

    if (forward !== 0 || strafe !== 0) {
      const dir = new THREE.Vector3(strafe, 0, forward).normalize();

      const forwardVec = new THREE.Vector3();
      camera.getWorldDirection(forwardVec);
      forwardVec.y = 0;
      forwardVec.normalize();

      const rightVec = new THREE.Vector3();
      rightVec.crossVectors(forwardVec, camera.up).normalize();

      camera.position.add(forwardVec.multiplyScalar(dir.z * move));
      camera.position.add(rightVec.multiplyScalar(dir.x * move));
    }

    camera.position.y = 1.7;
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[10, 20, 10]} intensity={1} />

      <mesh position={[0, 0, 0]} rotation={[-Math.PI * 0.5, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshLambertMaterial color="#333" />
      </mesh>
    </>
  );
}