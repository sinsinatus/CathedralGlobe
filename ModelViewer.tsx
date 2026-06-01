import React, { useState, Suspense, useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform, Alert } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { OrbitControls, Environment, useGLTF, Stage } from '@react-three/drei/native';
import * as THREE from 'three';

interface Props {
  modelUrl: string;
  onClose: () => void;
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  console.log("✅ Model loaded successfully:", url);

  scene.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return <primitive object={scene} scale={1.4} />;
}

export default function ModelViewer({ modelUrl, onClose }: Props) {
  const controlsRef = useRef<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  console.log("📦 ModelViewer opened with URL:", modelUrl);

  const zoomIn = () => {
    if (controlsRef.current) {
      controlsRef.current.zoomIn(1.5);   // Adjust number for stronger zoom
    }
  };

  const zoomOut = () => {
    if (controlsRef.current) {
      controlsRef.current.zoomOut(1.5);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>3D Digital Twin Explorer</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕ Close</Text>
        </TouchableOpacity>
      </View>

      <Canvas
        camera={{ position: [0, 5, 12], fov: 50 }}
        style={{ flex: 1, backgroundColor: '#0a0a1f' }}
        shadows
      >
        <Suspense fallback={null}>
          <Stage environment="city" intensity={1} shadows="soft">
            <Model url={modelUrl} />
          </Stage>

          <OrbitControls
            ref={controlsRef}
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={2}
            maxDistance={100}
            zoomSpeed={1.8}           // Increased for better scroll wheel response
            dampingFactor={0.12}
            rotateSpeed={0.6}
          />

          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 15, 10]} intensity={1.5} castShadow />
        </Suspense>
      </Canvas>

      {/* On-screen Zoom Buttons (reliable on web + mobile) */}
      <View style={styles.zoomControls}>
        <TouchableOpacity style={styles.zoomButton} onPress={zoomIn}>
          <Text style={styles.zoomText}>＋</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomButton} onPress={zoomOut}>
          <Text style={styles.zoomText}>－</Text>
        </TouchableOpacity>
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionText}>
          Drag to rotate • Scroll / Pinch to zoom • {Platform.OS === 'web' ? 'Use buttons too' : 'Two fingers to pan'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1f' },
  header: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1F1F1F',
    zIndex: 10,
  },
  title: { color: '#E8B923', fontSize: 18, fontWeight: 'bold' },
  closeButton: { padding: 8 },
  closeText: { color: '#00D4FF', fontWeight: '600', fontSize: 16 },
  zoomControls: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    gap: 12,
    zIndex: 20,
  },
  zoomButton: {
    backgroundColor: 'rgba(0, 212, 255, 0.9)',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  zoomText: {
    color: '#1F1F1F',
    fontSize: 28,
    fontWeight: 'bold',
  },
  instructions: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  instructionText: {
    color: '#A8A39A',
    fontSize: 13,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 999,
  },
});