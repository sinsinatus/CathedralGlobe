import React, { Suspense, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ScrollView } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei/native';

interface Props {
  modelUrl: string;
  onClose: () => void;
}

interface Item {
  id: string;
  name: string;
  type: string;
  metadata: string;
}

const SAMPLE_ITEMS: Item[] = [
  { id: '1', name: 'Living Room', type: 'Room', metadata: 'Open plan, 4.2m ceiling, large windows' },
  { id: '2', name: 'Kitchen', type: 'Room', metadata: 'Modern, island bench, stainless steel appliances' },
  { id: '3', name: 'Master Bedroom', type: 'Room', metadata: 'Ensuite + walk-in wardrobe' },
  { id: '4', name: 'HVAC System', type: 'System', metadata: 'Ducted air conditioning, 2025 model' },
  { id: '5', name: 'Solar Panels', type: 'Feature', metadata: '12kW system, 28 panels' },
];

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  scene.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return <primitive object={scene} scale={1.3} />;
}

export default function ModelViewer({ modelUrl, onClose }: Props) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

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

      <View style={styles.mainContent}>
        {/* 3D Canvas */}
        <View style={styles.canvasContainer}>
          <Canvas
            camera={{ position: [0, 8, 18], fov: 45 }}
            style={{ flex: 1, backgroundColor: '#0a0a1f' }}
            shadows
          >
            <Suspense fallback={null}>
              <Stage environment="city" intensity={1.1} shadows="soft">
                <Model url={modelUrl} />
              </Stage>

              <OrbitControls
                enablePan={true}
                enableZoom={true}
                enableRotate={true}
                minDistance={3}
                maxDistance={120}
                zoomSpeed={1.5}
                dampingFactor={0.15}
              />

              <ambientLight intensity={0.5} />
              <directionalLight position={[10, 20, 10]} intensity={1.4} castShadow />
            </Suspense>
          </Canvas>
        </View>

        {/* Side Panel */}
        <View style={styles.sidePanel}>
          <Text style={styles.panelTitle}>Asset Items</Text>
          <ScrollView style={styles.itemList}>
            {SAMPLE_ITEMS.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.itemRow}
                onPress={() => setSelectedItem(item)}
              >
                <View style={styles.itemDot} />
                <View style={styles.itemTextContainer}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemType}>{item.type}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Metadata Tooltip */}
          {selectedItem && (
            <View style={styles.metadataPanel}>
              <Text style={styles.metadataTitle}>{selectedItem.name}</Text>
              <Text style={styles.metadataText}>{selectedItem.metadata}</Text>
              
              <TouchableOpacity style={styles.addDocButton}>
                <Text style={styles.addDocText}>📎 Add Document</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.addItemButton}>
            <Text style={styles.addItemText}>+ Add New Item</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Instructions */}
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

  mainContent: { flex: 1, flexDirection: 'row' },
  canvasContainer: { flex: 1 },

  sidePanel: {
    width: 280,
    backgroundColor: '#1F1F1F',
    borderLeftWidth: 1,
    borderLeftColor: '#333',
    padding: 16,
  },
  panelTitle: {
    color: '#E8B923',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  itemList: { flex: 1 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  itemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00D4FF',
    marginRight: 10,
  },
  itemTextContainer: { flex: 1 },
  itemName: { color: '#F5F0E6', fontSize: 15, fontWeight: '500' },
  itemType: { color: '#A8A39A', fontSize: 13 },

  metadataPanel: {
    backgroundColor: '#2C2C2C',
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
    marginBottom: 12,
  },
  metadataTitle: { color: '#E8B923', fontWeight: '600', marginBottom: 6 },
  metadataText: { color: '#F5F0E6', fontSize: 14, lineHeight: 20 },

  addDocButton: {
    backgroundColor: '#00D4FF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  addDocText: { color: '#1F1F1F', fontWeight: '600' },

  addItemButton: {
    backgroundColor: '#E8B923',
    padding: 14,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 'auto',
  },
  addItemText: { color: '#1F1F1F', fontWeight: 'bold' },

  instructions: {
    position: 'absolute',
    bottom: 20,
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
