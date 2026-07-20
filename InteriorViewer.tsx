// InteriorViewer.tsx
import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber/native';
import { OrbitControls, useGLTF } from '@react-three/drei/native';
import * as THREE from 'three';

interface Props {
  modelUrl: string;
  selectedItem?: any;
}

export default function InteriorViewer({ modelUrl, selectedItem }: Props) {
  const { camera } = useThree();
  const { scene, error } = useGLTF(modelUrl);

  useEffect(() => {
    if (scene) {
      scene.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      // Rough centering for interiors
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      camera.position.set(center.x, 2.5, center.z + 8);
      camera.lookAt(center);
    }
  }, [scene, camera]);

  if (error) {
    return (
      <mesh>
        <boxGeometry args={[3, 3, 3]} />
        <meshStandardMaterial color="#ff4444" />
      </mesh>
    );
  }

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 25, 10]} intensity={1.2} castShadow />

      <primitive object={scene} />

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={1}
        maxDistance={80}
        makeDefault
      />
    </>
  );
}