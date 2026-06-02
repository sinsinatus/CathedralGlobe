import React, { Suspense } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { OrbitControls, Environment, useGLTF, Stage } from '@react-three/drei/native';

interface Props {
  modelUrl: string;
  onClose: () => void;
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  console.log("✅ Model loaded successfully from:", url);

  scene.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return <primitive object={scene} scale={1.3} />;
}

export default function ModelViewer({ modelUrl, onClose }: Props) {
  console.log("📦 ModelViewer opened with URL:", modelUrl);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>3D Digital Twin Explorer</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕ Close</Text>
        </TouchableOpacity>
      </View>

      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 6, 15], fov: 50 }}
        style={{ flex: 1, backgroundColor: '#0a0a1f' }}
        shadows
      >
        <Suspense fallback={null}>
          <Stage environment="city" intensity={1.2} shadows="soft">
            <Model url={modelUrl} />
          </Stage>

          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={2}
            maxDistance={100}
            zoomSpeed={1.8}
            dampingFactor={0.12}
            enableDamping={true}
          />

          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 15, 10]} intensity={1.5} castShadow />
        </Suspense>
      </Canvas>

      {/* Zoom Buttons - Outside Canvas (Correct placement) */}
      <View style={styles.zoomContainer}>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => {}}>
          <Text style={styles.zoomText}>＋</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => {}}>
          <Text style={styles.zoomText}>－</Text>
        </TouchableOpacity>
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionText}>
          Drag to rotate • Scroll / Pinch to zoom
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
  zoomContainer: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    gap: 12,
    zIndex: 20,
  },
  zoomBtn: {
    backgroundColor: '#00D4FF',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  zoomText: {
    color: '#1F1F1F',
    fontSize: 32,
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