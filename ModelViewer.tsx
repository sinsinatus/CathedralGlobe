import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, ActivityIndicator, Alert } from 'react-native';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Gltf, Environment } from '@react-three/drei';

interface Props {
  modelUrl: string;
  onClose: () => void;
}

export default function ModelViewer({ modelUrl, onClose }: Props) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  console.log("ModelViewer opened with URL:", modelUrl);

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a1f' }}>
      <View style={{ 
        padding: 16, 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        backgroundColor: '#1F1F1F' 
      }}>
        <Text style={{ color: '#E8B923', fontSize: 18, fontWeight: 'bold' }}>
          3D Model Viewer
        </Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: '#00D4FF', fontSize: 16, fontWeight: '600' }}>Close</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        <Canvas
          camera={{ position: [0, 2, 6], fov: 45 }}
          style={{ backgroundColor: '#0a0a1f' }}
          onCreated={() => setIsLoading(false)}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 10, 5]} intensity={1.2} />
          <directionalLight position={[-10, -10, -5]} intensity={0.6} />

          <React.Suspense fallback={null}>
            <Gltf 
              src={modelUrl} 
              onError={(err) => {
                console.error("Gltf load error:", err);
                setLoadError(err?.message || "Failed to load model");
              }}
            />
          </React.Suspense>

          <Environment preset="city" />
          <OrbitControls 
            enablePan={true} 
            enableZoom={true} 
            enableRotate={true}
            minDistance={1}
            maxDistance={30}
          />
        </Canvas>

        {isLoading && (
          <View style={{ position: 'absolute', top: '45%', left: 0, right: 0, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#E8B923" />
            <Text style={{ color: '#A8A39A', marginTop: 12 }}>Loading 3D model...</Text>
          </View>
        )}

        {loadError && (
          <View style={{
            position: 'absolute',
            top: '35%',
            left: 20,
            right: 20,
            backgroundColor: '#FF3B30',
            padding: 20,
            borderRadius: 12
          }}>
            <Text style={{ color: 'white', textAlign: 'center', fontWeight: '600' }}>
              Failed to load 3D model
            </Text>
            <Text style={{ color: '#ffdddd', textAlign: 'center', marginTop: 8 }}>
              {loadError}
            </Text>
          </View>
        )}
      </View>

      <View style={{ padding: 14, backgroundColor: '#1F1F1F', alignItems: 'center' }}>
        <Text style={{ color: '#888', fontSize: 12 }}>
          Drag to rotate • Scroll / pinch to zoom
        </Text>
      </View>
    </View>
  );
}