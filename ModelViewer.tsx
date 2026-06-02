import React, { Suspense, useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ScrollView, Modal, TextInput, Alert } from 'react-native';
import { Canvas } from '@react-three/fiber/native';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei/native';
import { supabase } from './src/lib/supabase';

interface Props {
  modelUrl: string;
  buildId: string;
  onClose: () => void;
}

interface Item {
  id: string;
  name: string;
  type: string;
  metadata: any;
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  scene.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return <primitive object={scene} scale={1.4} />;
}

export default function ModelViewer({ modelUrl, buildId, onClose }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState('Room');

  const itemTypes = ['Room', 'Furniture', 'System', 'Feature', 'Appliance', 'Other'];

  useEffect(() => {
    const fetchItems = async () => {
      const { data } = await supabase.from('items').select('*').eq('build_id', buildId);
      setItems(data || []);
    };
    if (buildId) fetchItems();
  }, [buildId]);

  const handleAddPress = () => {
    console.log("🚀 Add New Item button clicked");
    setAddModalVisible(true);
  };

  const addNewItem = async () => {
    if (!newItemName.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }

    const { data, error } = await supabase
      .from('items')
      .insert({
        build_id: buildId,
        name: newItemName.trim(),
        type: newItemType,
        metadata: { addedAt: new Date().toISOString() }
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      Alert.alert('Insert Failed', error.message || JSON.stringify(error));
    } else {
      Alert.alert('✅ Item Added', `${newItemName} was added successfully`);
      setAddModalVisible(false);
      setNewItemName('');
      // Refresh list
      const { data: refreshed } = await supabase.from('items').select('*').eq('build_id', buildId);
      setItems(refreshed || []);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>3D Digital Twin Explorer</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>✕ Close</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.mainContent}>
        <View style={styles.canvasContainer}>
          <Canvas camera={{ position: [0, 8, 18], fov: 45 }} style={{ flex: 1, backgroundColor: '#0a0a1f' }} shadows>
            <Suspense fallback={null}>
              <Stage environment="city" intensity={1.1} shadows="soft">
                <Model url={modelUrl} />
              </Stage>
              <OrbitControls enablePan enableZoom enableRotate minDistance={3} maxDistance={120} />
              <ambientLight intensity={0.5} />
              <directionalLight position={[10, 20, 10]} intensity={1.4} castShadow />
            </Suspense>
          </Canvas>
        </View>

        <View style={styles.sidePanel}>
          <Text style={styles.panelTitle}>Asset Items ({items.length})</Text>
          <Text style={styles.buildIdText}>Build: {buildId.substring(0, 8)}...</Text>

          <ScrollView style={styles.itemList}>
            {items.length === 0 ? (
              <Text style={styles.emptyText}>No items yet.</Text>
            ) : (
              items.map(item => (
                <TouchableOpacity key={item.id} style={styles.itemRow} onPress={() => setSelectedItem(item)}>
                  <View style={styles.itemDot} />
                  <View style={styles.itemTextContainer}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemType}>{item.type}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          <TouchableOpacity style={styles.addItemButton} onPress={handleAddPress}>
            <Text style={styles.addItemText}>+ Add New Item</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={addModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New Item</Text>

            <TextInput
              style={styles.input}
              placeholder="Item name (e.g. Kitchen Island)"
              value={newItemName}
              onChangeText={setNewItemName}
            />

            <Text style={styles.label}>Type</Text>
            <ScrollView horizontal style={styles.typeRow} showsHorizontalScrollIndicator={false}>
              {itemTypes.map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeChip, newItemType === type && styles.typeChipActive]}
                  onPress={() => setNewItemType(type)}
                >
                  <Text style={[styles.typeText, newItemType === type && styles.typeTextActive]}>{type}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setAddModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addNewItem}>
                <Text style={styles.saveText}>Add Item</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.instructions}>
        <Text style={styles.instructionText}>Drag to rotate • Scroll / Pinch to zoom</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1f' },
  header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1F1F1F', zIndex: 10 },
  title: { color: '#E8B923', fontSize: 18, fontWeight: 'bold' },
  closeButton: { padding: 8 },
  closeText: { color: '#00D4FF', fontWeight: '600', fontSize: 16 },
  mainContent: { flex: 1, flexDirection: 'row' },
  canvasContainer: { flex: 1 },
  sidePanel: { width: 280, backgroundColor: '#1F1F1F', borderLeftWidth: 1, borderLeftColor: '#333', padding: 16 },
  panelTitle: { color: '#E8B923', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  buildIdText: { color: '#00D4FF', fontSize: 12, fontFamily: 'monospace', marginBottom: 12 },
  itemList: { flex: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
  itemDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00D4FF', marginRight: 10 },
  itemTextContainer: { flex: 1 },
  itemName: { color: '#F5F0E6', fontSize: 15, fontWeight: '500' },
  itemType: { color: '#A8A39A', fontSize: 13 },
  addItemButton: { backgroundColor: '#E8B923', padding: 16, borderRadius: 999, alignItems: 'center', marginTop: 20 },
  addItemText: { color: '#1F1F1F', fontWeight: 'bold' },
  emptyText: { color: '#A8A39A', textAlign: 'center', marginTop: 40, fontStyle: 'italic' },
  instructions: { position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  instructionText: { color: '#A8A39A', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1F1F1F', borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 22, color: '#E8B923', textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: '#2C2C2C', color: '#F5F0E6', padding: 14, borderRadius: 12, fontSize: 16, marginBottom: 16 },
  label: { color: '#A8A39A', marginBottom: 8 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  typeChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: '#2C2C2C' },
  typeChipActive: { backgroundColor: '#E8B923' },
  typeText: { color: '#ccc' },
  typeTextActive: { color: '#1F1F1F', fontWeight: '600' },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 999, backgroundColor: '#444', alignItems: 'center' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 999, backgroundColor: '#00D4FF', alignItems: 'center' },
  cancelText: { color: '#fff', fontWeight: '600' },
  saveText: { color: '#1F1F1F', fontWeight: '600' },
});