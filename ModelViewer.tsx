import React, { Suspense, useState, useEffect, useRef } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ScrollView, Modal, TextInput, Alert, Platform, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Canvas, useThree, useFrame } from '@react-three/fiber/native';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei/native';
import * as THREE from 'three';
import { supabase } from './src/lib/supabase';
import AssetAIAssistant from './AssetAIAssistant';   // ← NEW IMPORT

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

function ViewerScene({ modelUrl, selectedItem }: { modelUrl: string; selectedItem: Item | null }) {
  const controlsRef = useRef<any>(null);
  const { camera, gl } = useThree();
  const [flyTarget, setFlyTarget] = useState<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  const { scene } = useGLTF(modelUrl);
  scene.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Manual wheel zoom fix for Expo Web
  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const factor = e.deltaY > 0 ? 1.15 : 0.85;
      camera.position.multiplyScalar(factor);
      if (controlsRef.current) controlsRef.current.update();
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [gl, camera]);

  useEffect(() => {
    if (selectedItem && controlsRef.current) {
      const interiorPos = new THREE.Vector3(0, 5, 9);
      const interiorTarget = new THREE.Vector3(0, 1.5, 0);
      setFlyTarget({ position: interiorPos, target: interiorTarget });
    }
  }, [selectedItem]);

  useFrame(() => {
    if (flyTarget && controlsRef.current) {
      camera.position.lerp(flyTarget.position, 0.15);
      controlsRef.current.target.lerp(flyTarget.target, 0.15);
      controlsRef.current.update();
      if (camera.position.distanceTo(flyTarget.position) < 1) setFlyTarget(null);
    }
  });

  return (
    <>
      <Stage environment="city" intensity={1.1} shadows="soft">
        <primitive object={scene} scale={1.4} />
      </Stage>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={1.4} castShadow />

      <OrbitControls
        ref={controlsRef}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={0.5}
        maxDistance={120}
        zoomSpeed={4}
        rotateSpeed={0.8}
        panSpeed={1.5}
        enableDamping={true}
        dampingFactor={0.12}
        dollyToCursor={true}
        minPolarAngle={Math.PI / 12}
        maxPolarAngle={Math.PI * 0.98}
        makeDefault
      />
    </>
  );
}

export default function ModelViewer({ modelUrl, buildId, onClose }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [docModalVisible, setDocModalVisible] = useState(false);
  const [aiModalVisible, setAiModalVisible] = useState(false);        // ← NEW
  const [isUploading, setIsUploading] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState('Room');
  const [mode, setMode] = useState<'orbit' | 'explore'>('orbit');

  const itemTypes = ['Room', 'Furniture', 'System', 'Feature', 'Appliance', 'Other'];

  useEffect(() => {
    const fetchItems = async () => {
      const { data } = await supabase.from('items').select('*').eq('build_id', buildId);
      setItems(data || []);
    };
    if (buildId) fetchItems();
  }, [buildId]);

  const handleAddPress = () => setAddModalVisible(true);

  const addNewItem = async () => {
    if (!newItemName.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }
    const { data, error } = await supabase
      .from('items')
      .insert({ build_id: buildId, name: newItemName.trim(), type: newItemType, metadata: { addedAt: new Date().toISOString() } })
      .select()
      .single();

    if (error) {
      Alert.alert('Insert Failed', error.message || JSON.stringify(error));
    } else {
      Alert.alert('✅ Item Added', `${newItemName} was added successfully`);
      setAddModalVisible(false);
      setNewItemName('');
      const { data: refreshed } = await supabase.from('items').select('*').eq('build_id', buildId);
      setItems(refreshed || []);
    }
  };

  // Document upload functions (unchanged)
  const uploadAndCreateDocumentItem = async (uri: string, originalName: string, mimeType: string) => {
    console.log('📤 STARTING UPLOAD →', originalName);
    setIsUploading(true);
    try {
      const fileExt = originalName.split('.').pop()?.toLowerCase() || 'bin';
      const storageName = `${buildId}_doc_${Date.now()}.${fileExt}`;

      const blob = await (await fetch(uri)).blob();

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(storageName, blob, { contentType: mimeType });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('media').getPublicUrl(storageName);

      const { error: insertError } = await supabase
        .from('items')
        .insert({
          build_id: buildId,
          name: originalName,
          type: 'Document',
          metadata: {
            documentUrl: urlData.publicUrl,
            originalName,
            mimeType,
            uploadedAt: new Date().toISOString(),
          }
        });

      if (insertError) throw insertError;

      Alert.alert('✅ Document Added', `${originalName} is now attached`);
      const { data: refreshed } = await supabase.from('items').select('*').eq('build_id', buildId);
      setItems(refreshed || []);
    } catch (e: any) {
      console.error('❌ Upload failed:', e);
      Alert.alert('Upload Failed', e.message || 'Could not save document');
    } finally {
      setIsUploading(false);
    }
  };

  const pickAndUploadDocument = async (source: 'camera' | 'library' | 'files') => {
    setDocModalVisible(false);
    try {
      let uri: string;
      let name: string;
      let mimeType = 'application/octet-stream';

      if (source === 'camera' || source === 'library') {
        const result = source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.8 });
        if (result.canceled || !result.assets?.length) return;
        const asset = result.assets[0];
        uri = asset.uri;
        name = asset.fileName || `Media_${Date.now()}`;
        mimeType = asset.mimeType || 'image/jpeg';
      } else {
        const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
        if (result.canceled) return;
        if ('assets' in result && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          uri = asset.uri;
          name = asset.name || `Document_${Date.now()}`;
          mimeType = asset.mimeType || 'application/octet-stream';
        } else if ('uri' in result && result.uri) {
          uri = result.uri;
          name = (result as any).name || `Document_${Date.now()}`;
          mimeType = (result as any).mimeType || 'application/octet-stream';
        } else return;
      }
      await uploadAndCreateDocumentItem(uri, name, mimeType);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Something went wrong');
    }
  };

  const handleDeleteItem = (item: Item) => {
    console.log('🗑️ Delete button pressed for item:', item.id, item.name);
    Alert.alert(
      'Delete Item',
      `Delete "${item.name}"?\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('items').delete().eq('id', item.id);
            if (error) {
              Alert.alert('Delete Failed', error.message);
            } else {
              setItems(prev => prev.filter(i => i.id !== item.id));
              if (selectedItem?.id === item.id) setSelectedItem(null);
              Alert.alert('✅ Item Deleted');
            }
          },
        },
      ]
    );
  };

  const handleOpenDocument = (item: Item) => {
    if (item.type === 'Document' && item.metadata?.documentUrl) {
      if (Platform.OS === 'web') {
        window.open(item.metadata.documentUrl, '_blank');
      } else {
        Alert.alert('Open Document', 'Document preview coming soon on mobile');
      }
    }
  };

  const handleItemPress = (item: Item) => {
    if (item.type === 'Document') {
      handleOpenDocument(item);
    } else {
      setSelectedItem(item);
    }
  };

  const getInstructions = () => {
    if (mode === 'explore') {
      return Platform.OS === 'web'
        ? 'Drag to look • Scroll / mouse wheel to move closer • Click items to fly inside'
        : 'Swipe to explore • Pinch to zoom';
    }
    return Platform.OS === 'web'
      ? 'Drag to rotate • Scroll / mouse wheel to zoom • Right-click + drag to pan'
      : 'One-finger drag to rotate • Two-finger pinch to zoom';
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
              <ViewerScene modelUrl={modelUrl} selectedItem={selectedItem} />
            </Suspense>
          </Canvas>
        </View>

        <View style={styles.sidePanel}>
          <Text style={styles.panelTitle}>Asset Items ({items.length})</Text>
          <Text style={styles.buildIdText}>Build: {buildId.substring(0, 8)}...</Text>

          <View style={styles.modeToggle}>
            <TouchableOpacity style={[styles.modeBtn, mode === 'orbit' && styles.modeBtnActive]} onPress={() => setMode('orbit')}>
              <Text style={[styles.modeText, mode === 'orbit' && styles.modeTextActive]}>🌍 Orbit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modeBtn, mode === 'explore' && styles.modeBtnActive]} onPress={() => setMode('explore')}>
              <Text style={[styles.modeText, mode === 'explore' && styles.modeTextActive]}>🚶 Explore Interior</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.itemList}>
            {items.length === 0 ? (
              <Text style={styles.emptyText}>No items yet. Add items or documents to start exploring inside!</Text>
            ) : (
              items.map(item => (
                <View key={item.id} style={styles.itemRowContainer}>
                  <TouchableOpacity style={[styles.itemRow, selectedItem?.id === item.id && styles.itemRowSelected]} onPress={() => handleItemPress(item)}>
                    {item.type === 'Document' ? <Text style={styles.documentIcon}>📄</Text> : <View style={styles.itemDot} />}
                    <View style={styles.itemTextContainer}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemType}>{item.type}</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.itemActions}>
                    {item.type === 'Document' && (
                      <TouchableOpacity style={styles.actionBtn} onPress={() => handleOpenDocument(item)}>
                        <Text style={{ fontSize: 18 }}>🔗</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeleteItem(item)}>
                      <Text style={{ fontSize: 20, color: '#FF3B30' }}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* === GROK AI AGENT BUTTON === */}
          <TouchableOpacity 
            style={[styles.addItemButton, { backgroundColor: '#00D4FF', marginBottom: 8 }]} 
            onPress={() => setAiModalVisible(true)}
          >
            <Text style={styles.addItemText}>🧠 Grok AI Agent</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[styles.addItemButton, { flex: 1 }]} onPress={handleAddPress}>
              <Text style={styles.addItemText}>+ Add New Item</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addItemButton, { flex: 1, backgroundColor: '#00D4FF' }]} onPress={() => setDocModalVisible(true)} disabled={isUploading}>
              <Text style={styles.addItemText}>{isUploading ? 'Uploading...' : '+ Add Document'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.instructions}>
        <Text style={styles.instructionText}>{getInstructions()}</Text>
      </View>

      {/* Add New Item Modal */}
      <Modal visible={addModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add New Item</Text>
            <TextInput style={styles.input} placeholder="Item name (e.g. Kitchen Island)" value={newItemName} onChangeText={setNewItemName} />
            <Text style={styles.label}>Type</Text>
            <ScrollView horizontal style={styles.typeRow} showsHorizontalScrollIndicator={false}>
              {itemTypes.map(type => (
                <TouchableOpacity key={type} style={[styles.typeChip, newItemType === type && styles.typeChipActive]} onPress={() => setNewItemType(type)}>
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

      {/* Add Document Modal */}
      <Modal visible={docModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Document</Text>
            <Text style={styles.modalSubtitle}>Images, PDFs, floorplans, manuals, invoices — anything</Text>

            {isUploading && (
              <View style={{ alignItems: 'center', marginVertical: 20 }}>
                <ActivityIndicator size="large" color="#00D4FF" />
                <Text style={{ color: '#00D4FF', marginTop: 8 }}>Uploading to Supabase...</Text>
              </View>
            )}

            {!isUploading && (
              <View style={{ gap: 12, marginTop: 24 }}>
                <TouchableOpacity style={styles.docOption} onPress={() => pickAndUploadDocument('camera')}>
                  <Text style={styles.docOptionText}>📸 Take Photo with Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.docOption} onPress={() => pickAndUploadDocument('library')}>
                  <Text style={styles.docOptionText}>🖼️ Choose from Photo Library</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.docOption} onPress={() => pickAndUploadDocument('files')}>
                  <Text style={styles.docOptionText}>📁 Browse Files (PDF, DOC, TXT, etc.)</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setDocModalVisible(false)} disabled={isUploading}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* === GROK AI AGENT MODAL === */}
      <Modal 
        visible={aiModalVisible} 
        animationType="slide" 
        presentationStyle="pageSheet" 
        onRequestClose={() => setAiModalVisible(false)}
      >
        <AssetAIAssistant buildId={buildId} onClose={() => setAiModalVisible(false)} />
      </Modal>
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
  modeToggle: { flexDirection: 'row', backgroundColor: '#2C2C2C', borderRadius: 999, padding: 4, marginBottom: 16 },
  modeBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 999 },
  modeBtnActive: { backgroundColor: '#E8B923' },
  modeText: { color: '#ccc', fontWeight: '600' },
  modeTextActive: { color: '#1F1F1F' },
  itemList: { flex: 1 },
  itemRowContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  itemRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#2C2C2C', borderRadius: 8 },
  itemRowSelected: { backgroundColor: '#3A2C1F' },
  itemDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00D4FF', marginRight: 10 },
  documentIcon: { fontSize: 18, marginRight: 10 },
  itemTextContainer: { flex: 1 },
  itemName: { color: '#F5F0E6', fontSize: 15, fontWeight: '500' },
  itemType: { color: '#A8A39A', fontSize: 13 },
  itemActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 8, justifyContent: 'center', alignItems: 'center' },
  addItemButton: { backgroundColor: '#E8B923', padding: 16, borderRadius: 999, alignItems: 'center' },
  addItemText: { color: '#1F1F1F', fontWeight: 'bold' },
  emptyText: { color: '#A8A39A', textAlign: 'center', marginTop: 40, fontStyle: 'italic' },
  instructions: { position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  instructionText: { color: '#A8A39A', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1F1F1F', borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 22, color: '#E8B923', textAlign: 'center', marginBottom: 8 },
  modalSubtitle: { color: '#A8A39A', textAlign: 'center', fontSize: 14, marginBottom: 20 },
  input: { backgroundColor: '#2C2C2C', color: '#F5F0E6', padding: 14, borderRadius: 12, fontSize: 16, marginBottom: 16 },
  label: { color: '#A8A39A', marginBottom: 8 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  typeChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: '#2C2C2C' },
  typeChipActive: { backgroundColor: '#E8B923' },
  typeText: { color: '#ccc' },
  typeTextActive: { color: '#1F1F1F', fontWeight: '600' },
  cancelBtn: { padding: 14, borderRadius: 999, backgroundColor: '#444', alignItems: 'center', marginTop: 20 },
  saveBtn: { padding: 14, borderRadius: 999, backgroundColor: '#00D4FF', alignItems: 'center' },
  cancelText: { color: '#fff', fontWeight: '600' },
  saveText: { color: '#1F1F1F', fontWeight: '600' },
  docOption: { backgroundColor: '#2C2C2C', padding: 16, borderRadius: 12, alignItems: 'center' },
  docOptionText: { color: '#F5F0E6', fontSize: 16, fontWeight: '600' },
});