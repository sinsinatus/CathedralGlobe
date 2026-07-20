// ExteriorViewer.tsx
import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber/native';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei/native';
import * as THREE from 'three';

interface Props {
  modelUrl: string;
  selectedItem?: any;
}

export default function ExteriorViewer({ modelUrl, selectedItem }: Props) {
  const { camera, gl } = useThree();
  const { scene, error } = useGLTF(modelUrl);

  useEffect(() => {
    if (scene) {
      scene.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }
  }, [scene]);

  // Basic wheel zoom fix
  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      camera.position.multiplyScalar(factor);
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [gl, camera]);

  if (error) {
    return (
      <mesh>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="red" />
      </mesh>
    );
  }

  return (
    <>
      <Stage environment="city" intensity={1.2} shadows="soft">
        <primitive object={scene} scale={1.2} />
      </Stage>
      <ambientLight intensity={0.5} />
      <directionalLight position={[20, 30, 15]} intensity={1.4} castShadow />

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={2}
        maxDistance={200}
        makeDefault
      />
    </>
  );
}