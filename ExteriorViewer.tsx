// ExteriorViewer.tsx - CLEAN (No  Html)
import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber/native';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei/native';
import * as THREE from 'three';

interface Props {
  modelUrl: string;
  selectedItem?: any;
}

export default function ExteriorViewer({ modelUrl, selectedItem }: Props) {
  const controlsRef = useRef<any>(null);
  const { camera, gl } = useThree();

  const { scene } = useGLTF(modelUrl);

  React.useEffect(() => {
    if (scene) {
      scene.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }
  }, [scene]);

  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.15 : 0.85;
      camera.position.multiplyScalar(factor);
      controlsRef.current?.update();
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [gl, camera]);

  return (
    <>
      <Stage environment="city" intensity={1} shadows="soft">
        <primitive object={scene} scale={1.3} />
      </Stage>
      <ambientLight intensity={0.4} />
      <directionalLight position={[15, 25, 10]} intensity={1.3} castShadow />

      <OrbitControls
        ref={controlsRef}
        enablePan
        enableZoom
        enableRotate
        minDistance={1}
        maxDistance={150}
        makeDefault
      />
    </>
  );
}
