import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, TextInput, Modal, ScrollView, ActivityIndicator, Alert, Image, Switch, Dimensions, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import Globe from 'react-globe.gl';
import { supabase } from './src/lib/supabase';
import ModelViewer from './ModelViewer';

interface Build {
  id: string;
  name: string;
  initial_prompt: string;
  center_lat: number | null;
  center_lng: number | null;
  asset_type?: string;

  // Legacy columns (for backward compatibility)
  model_status?: string;
  model_url?: string;
  model_task_id?: string;

  // New separate exterior/interior models
  exterior_model_url?: string;
  exterior_model_status?: string;
  exterior_model_task_id?: string;

  interior_model_url?: string;
  interior_model_status?: string;
  interior_model_task_id?: string;

  created_at?: string;
}

interface Media {
  id: string;
  build_id: string;
  url: string;
  type: string;
}

const ASSET_COLORS: Record<string, string> = {
  house: '#E8B923',
  car: '#00D4FF',
  factory: '#2EC4B6',
  warehouse: '#9B5DE5',
  default: '#FFFFFF',
};

const ASSET_LABELS: Record<string, string> = {
  house: 'House',
  car: 'Car',
  factory: 'Factory',
  warehouse: 'Warehouse',
};

export default function App() {
  const globeRef = useRef<any>(null);

  const [builds, setBuilds] = useState<Build[]>([]);
  const [selectedBuild, setSelectedBuild] = useState<Build | null>(null);
  const [mediaForSelected, setMediaForSelected] = useState<Media[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [regenModalVisible, setRegenModalVisible] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [selectedAssetType, setSelectedAssetType] = useState<'house' | 'car' | 'factory' | 'warehouse'>('house');
  const [selectedMedias, setSelectedMedias] = useState<{ uri: string; type: 'photo' | 'video' }[]>([]);
  const [createHostedWallet, setCreateHostedWallet] = useState(true);

  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [manualAddress, setManualAddress] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingBuilds, setIsLoadingBuilds] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // ==================== DATA FETCHING ====================
  const loadBuilds = async () => {
    setIsLoadingBuilds(true);
    const { data } = await supabase
      .from('builds')
      .select('*')
      .not('center_lat', 'is', null)
      .not('center_lng', 'is', null)
      .order('created_at', { ascending: false });
    setBuilds(data || []);
    setIsLoadingBuilds(false);
  };

  const loadMediaForBuild = async (buildId: string) => {
    const { data } = await supabase.from('media').select('*').eq('build_id', buildId);
    setMediaForSelected(data || []);
  };

  // ==================== LOCATION ====================
  const getCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required.');
        return null;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch {
      Alert.alert('Location Error', 'Could not get current location.');
      return null;
    } finally {
      setLocationLoading(false);
    }
  };

  const geocodeAddress = async (address: string) => {
    if (!address.trim()) return null;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
      Alert.alert('Address Not Found', 'Please try a more specific address.');
      return null;
    } catch {
      Alert.alert('Geocoding Failed', 'Could not find location.');
      return null;
    }
  };
const pickMedia = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    quality: 0.8,
    allowsMultipleSelection: true,
  });

  if (!result.canceled && result.assets.length > 0) {
    const newMedias = result.assets.map((asset) => ({
      uri: asset.uri,
      type: (asset.type === 'video' || asset.uri.includes('.mp4') || asset.uri.includes('.mov')) 
        ? 'video' 
        : 'photo' as const,
    }));
    setSelectedMedias((prev) => [...prev, ...newMedias]);
  }
};
  // ==================== STATUS CHECKING ====================
  const checkModelStatus = async (buildId: string) => {
    setIsCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-meshy-status', {
        body: { build_id: buildId },
      });

      if (error) {
        const { data: dbData } = await supabase.from('builds').select('*').eq('id', buildId).single();
        if (dbData && selectedBuild?.id === buildId) setSelectedBuild(dbData);
      } else {
        if (selectedBuild?.id === buildId) {
          const { data: updated } = await supabase.from('builds').select('*').eq('id', buildId).single();
          if (updated) setSelectedBuild(updated);
        }
        await loadBuilds();
      }
    } catch (e) {
      console.log('Status check failed', e);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Auto-polling when models are generating
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const needsPolling =
      selectedBuild &&
      (selectedBuild.exterior_model_status === 'processing' ||
        selectedBuild.interior_model_status === 'processing');

    if (needsPolling) {
      interval = setInterval(() => checkModelStatus(selectedBuild.id), 10000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedBuild?.id, selectedBuild?.exterior_model_status, selectedBuild?.interior_model_status]);

  useEffect(() => {
    loadBuilds();
  }, []);

  // ==================== CREATE NEW ASSET ====================
  const generateTwin = async () => {
    if (!prompt.trim()) {
      Alert.alert('Missing Description', 'Please describe something to build.');
      return;
    }
    setIsUploading(true);

    let finalLat: number, finalLng: number;

    if (useCurrentLocation) {
      const loc = await getCurrentLocation();
      if (!loc) {
        setIsUploading(false);
        return;
      }
      finalLat = loc.lat;
      finalLng = loc.lng;
    } else {
      const loc = await geocodeAddress(manualAddress);
      if (!loc) {
        setIsUploading(false);
        return;
      }
      finalLat = loc.lat;
      finalLng = loc.lng;
    }

    const { data: build, error: buildError } = await supabase
      .from('builds')
      .insert({
        name: prompt.substring(0, 60),
        initial_prompt: prompt,
        center_lat: finalLat,
        center_lng: finalLng,
        model_detail_level: 3,
        asset_type: selectedAssetType,
        status: 'active',
      })
      .select()
      .single();

    if (buildError) {
      Alert.alert('Creation Failed', buildError.message);
      setIsUploading(false);
      return;
    }

    // Upload selected media
    for (const media of selectedMedias) {
      try {
        const fileExt = media.type === 'video' ? 'mp4' : 'jpg';
        const fileName = `${build.id}_${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
        const contentType = media.type === 'video' ? 'video/mp4' : 'image/jpeg';
        const blob = await (await fetch(media.uri)).blob();

        const { error: uploadError } = await supabase.storage.from('media').upload(fileName, blob, { contentType });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
          await supabase.from('media').insert({
            build_id: build.id,
            url: urlData.publicUrl,
            type: media.type,
          });
        }
      } catch (e) {
        console.error('Media upload failed', e);
      }
    }

    // Trigger exterior + interior generation
    try {
      await supabase.functions.invoke('generate-3d-model', {
        body: { build_id: build.id, prompt, asset_type: selectedAssetType, model_type: 'exterior' },
      });
      await supabase.functions.invoke('generate-3d-model', {
        body: { build_id: build.id, prompt, asset_type: selectedAssetType, model_type: 'interior' },
      });
    } catch (e) {
      console.log('Model generation trigger error', e);
    }

    setIsUploading(false);
    setModalVisible(false);
    setPrompt('');
    setSelectedMedias([]);
    setManualAddress('');
    await loadBuilds();
    Alert.alert('✅ Asset Created!', `Build ID: ${build.id}`);
  };

  // ==================== ADD MORE MEDIA ====================
  const addMoreMediaToBuild = async () => {
    if (!selectedBuild) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (result.canceled || !result.assets.length) return;

    setIsUploading(true);
    for (const asset of result.assets) {
      try {
        const isVideo = asset.type === 'video' || asset.uri.includes('.mp4') || asset.uri.includes('.mov');
        const fileExt = isVideo ? 'mp4' : 'jpg';
        const fileName = `${selectedBuild.id}_${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
        const contentType = isVideo ? 'video/mp4' : 'image/jpeg';
        const blob = await (await fetch(asset.uri)).blob();

        const { error: uploadError } = await supabase.storage.from('media').upload(fileName, blob, { contentType });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
          await supabase.from('media').insert({
            build_id: selectedBuild.id,
            url: urlData.publicUrl,
            type: isVideo ? 'video' : 'photo',
          });
        }
      } catch (e) {
        console.error('Media upload failed', e);
      }
    }
    setIsUploading(false);
    await loadMediaForBuild(selectedBuild.id);
    Alert.alert('✅ Media added', 'New files attached');
  };

  // ==================== DELETE BUILD ====================
  const deleteBuild = async (build: Build) => {
    Alert.alert('Confirm Delete', `Delete "${build.name}" and all data?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('media').delete().eq('build_id', build.id);
            await supabase.from('builds').delete().eq('id', build.id);
            setSelectedBuild(null);
            setMediaForSelected([]);
            await loadBuilds();
            Alert.alert('✅ Deleted');
          } catch (e: any) {
            Alert.alert('Delete Failed', e.message);
          }
        },
      },
    ]);
  };

  const handlePointClick = async (point: any) => {
    setSelectedBuild(point);
    setAutoRotate(false);
    await loadMediaForBuild(point.id);
    if (globeRef.current) {
      globeRef.current.pointOfView(
        { lat: point.center_lat, lng: point.center_lng, altitude: 0.55 },
        700
      );
    }
  };

  const closePanel = () => {
    setSelectedBuild(null);
    setMediaForSelected([]);
    setAutoRotate(true);
  };

  const zoomToGlobe = () => {
    if (globeRef.current) {
      globeRef.current.pointOfView({ altitude: 1.7 }, 600);
    }
  };

  // ==================== 3D VIEWER ====================
  const open3DViewer = () => {
    if (!selectedBuild) return;

    const hasModel =
      selectedBuild.exterior_model_url ||
      selectedBuild.interior_model_url ||
      selectedBuild.model_url;

    if (hasModel) {
      setViewerVisible(true);
    } else {
      Alert.alert('Not Ready', '3D model is not available yet.');
    }
  };

  // ==================== REGENERATION ====================
  const reGenerateModel = () => {
    if (!selectedBuild) return;
    setRegenModalVisible(true);
  };

  const triggerRegeneration = async (type: 'exterior' | 'interior' | 'both') => {
    if (!selectedBuild) return;
    setRegenModalVisible(false);

    try {
      const promises: Promise<any>[] = [];

      if (type === 'exterior' || type === 'both') {
        promises.push(
          supabase.functions.invoke('generate-3d-model', {
            body: {
              build_id: selectedBuild.id,
              prompt: selectedBuild.initial_prompt,
              asset_type: selectedBuild.asset_type,
              model_type: 'exterior',
            },
          })
        );
      }

      if (type === 'interior' || type === 'both') {
        promises.push(
          supabase.functions.invoke('generate-3d-model', {
            body: {
              build_id: selectedBuild.id,
              prompt: selectedBuild.initial_prompt,
              asset_type: selectedBuild.asset_type,
              model_type: 'interior',
            },
          })
        );
      }

      await Promise.all(promises);

      Alert.alert('✅ Generation Started', `Request sent for ${type}.`);

      setTimeout(() => {
        if (selectedBuild) checkModelStatus(selectedBuild.id);
      }, 2000);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start generation');
    }
  };

  // ==================== GLOBE DATA ====================
  const globePoints = builds
    .filter((b) => b.center_lat && b.center_lng)
    .map((b, i) => ({
      ...b,
      lat: b.center_lat!,
      lng: b.center_lng!,
      color: ASSET_COLORS[b.asset_type || 'default'],
      size: 0.08,
      altitude: 0.012 + (i % 3) * 0.004,
      label: `${b.name} • ${ASSET_LABELS[b.asset_type || 'default']}`,
    }));

  // ==================== RENDER ====================
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Orbital Empire</Text>
        <Text style={styles.subtitle}>{builds.length} assets • Powered by Meshy 3D</Text>
      </View>

      <View style={styles.globeContainer}>
        {isLoadingBuilds ? (
          <ActivityIndicator size="large" color="#E8B923" />
        ) : builds.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Your Empire is Empty</Text>
            <Text style={styles.emptySubtitle}>Create your first digital twin</Text>
          </View>
        ) : (
          <Globe
            ref={globeRef}
            globeImageUrl="https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
            backgroundColor="#0a0a1f"
            width={Math.min(920, Dimensions.get('window').width * 0.92)}
            height={Math.min(680, Dimensions.get('window').height * 0.68)}
            pointsData={globePoints}
            pointLat="lat"
            pointLng="lng"
            pointColor="color"
            pointAltitude="altitude"
            pointRadius="size"
            pointLabel="label"
            onPointClick={handlePointClick}
            autoRotate={autoRotate}
            autoRotateSpeed={0.18}
            pointOfView={{ lat: -33.87, lng: 151.21, altitude: 1.6 }}
          />
        )}
      </View>

      {builds.length > 0 && (
        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlBtn} onPress={() => setAutoRotate(!autoRotate)}>
            <Text style={styles.controlText}>{autoRotate ? 'Pause' : 'Resume'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={loadBuilds}>
            <Text style={styles.controlText}>Refresh</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={zoomToGlobe}>
            <Text style={styles.controlText}>Reset View</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+ New Asset</Text>
      </TouchableOpacity>

      {/* Selected Build Panel */}
      {selectedBuild && (
        <View style={styles.infoPanel}>
          <ScrollView>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.colorDot, { backgroundColor: ASSET_COLORS[selectedBuild.asset_type || 'default'] }]} />
              <Text style={styles.panelTitle}>{selectedBuild.name}</Text>
            </View>
            <Text style={styles.panelType}>{ASSET_LABELS[selectedBuild.asset_type || 'default']}</Text>

            {/* 3D Digital Twin Section */}
            <View style={{ marginTop: 14, backgroundColor: '#1F1F1F', padding: 16, borderRadius: 14 }}>
              <Text style={{ color: '#A8A39A', marginBottom: 12, fontWeight: '600', fontSize: 15 }}>
                3D Digital Twin
              </Text>

              {/* Exterior */}
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: '#E8B923', fontWeight: '600', marginBottom: 6 }}>Exterior Model</Text>
                {selectedBuild.exterior_model_url ? (
                  <TouchableOpacity
                    style={{ backgroundColor: '#00D4FF', paddingVertical: 13, borderRadius: 10, alignItems: 'center' }}
                    onPress={open3DViewer}
                  >
                    <Text style={{ color: '#1F1F1F', fontWeight: 'bold', fontSize: 15 }}>🧊 View Exterior</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ color: '#E8B923' }}>
                    {selectedBuild.exterior_model_status === 'processing' ? 'Generating with Meshy...' : 'Not generated yet'}
                  </Text>
                )}
              </View>

              {/* Interior */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: '#E8B923', fontWeight: '600', marginBottom: 6 }}>Interior Model</Text>
                {selectedBuild.interior_model_url ? (
                  <TouchableOpacity
                    style={{ backgroundColor: '#00D4FF', paddingVertical: 13, borderRadius: 10, alignItems: 'center' }}
                    onPress={open3DViewer}
                  >
                    <Text style={{ color: '#1F1F1F', fontWeight: 'bold', fontSize: 15 }}>🧊 View Interior</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ color: '#E8B923' }}>
                    {selectedBuild.interior_model_status === 'processing' ? 'Generating with Meshy...' : 'Not generated yet'}
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={{ backgroundColor: '#2EC4B6', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                onPress={reGenerateModel}
              >
                <Text style={{ color: '#1F1F1F', fontWeight: 'bold', fontSize: 16 }}>
                  🚀 Generate / Re-generate 3D Models
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ marginTop: 12, alignItems: 'center' }}
                onPress={() => checkModelStatus(selectedBuild.id)}
                disabled={isCheckingStatus}
              >
                <Text style={{ color: '#00D4FF' }}>
                  {isCheckingStatus ? 'Checking...' : '⟳ Refresh Status'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Media Section */}
            {mediaForSelected.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ color: '#A8A39A', marginBottom: 6 }}>Attached Media ({mediaForSelected.length})</Text>
                {mediaForSelected.map((m) => (
                  <View key={m.id} style={{ marginBottom: 8 }}>
                    {m.type === 'photo' ? (
                      <Image source={{ uri: m.url }} style={{ width: '100%', height: 160, borderRadius: 8 }} />
                    ) : (
                      <View style={{ backgroundColor: '#2C2C2C', padding: 16, borderRadius: 8 }}>
                        <Text style={{ color: '#00D4FF' }}>🎥 Video attached</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#00D4FF', marginTop: 12 }]}
              onPress={addMoreMediaToBuild}
            >
              <Text style={styles.actionBtnText}>+ Add more photos / videos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#FF3B30', marginTop: 20 }]}
              onPress={() => deleteBuild(selectedBuild)}
            >
              <Text style={styles.actionBtnText}>🗑️ Delete Asset</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={closePanel}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Create Asset Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>What are we building today?</Text>
            <TextInput
              style={styles.input}
              placeholder="Describe your asset..."
              value={prompt}
              onChangeText={setPrompt}
              multiline
              placeholderTextColor="#888"
            />
            <TouchableOpacity style={styles.photoButton} onPress={pickMedia}>
              <Text style={styles.photoButtonText}>
                {selectedMedias.length > 0
                  ? `✓ ${selectedMedias.length} file(s) selected`
                  : '+ Add Photos or Videos (multiple allowed)'}
              </Text>
            </TouchableOpacity>

            {/* Location Section */}
            <View style={{ marginTop: 16 }}>
              <Text style={styles.typeLabel}>Location</Text>
              <View style={{ flexDirection: 'row', backgroundColor: '#2C2C2C', borderRadius: 999, padding: 4 }}>
                <TouchableOpacity
                  style={[styles.locationTab, useCurrentLocation && styles.locationTabActive]}
                  onPress={() => setUseCurrentLocation(true)}
                >
                  <Text style={useCurrentLocation ? styles.typeTextActive : styles.typeText}>📍 Current Location</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.locationTab, !useCurrentLocation && styles.locationTabActive]}
                  onPress={() => setUseCurrentLocation(false)}
                >
                  <Text style={!useCurrentLocation ? styles.typeTextActive : styles.typeText}>Enter Address</Text>
                </TouchableOpacity>
              </View>
              {useCurrentLocation ? (
                <Text style={{ color: '#00D4FF', marginTop: 8, textAlign: 'center' }}>
                  Will use your current GPS location
                </Text>
              ) : (
                <TextInput
                  style={[styles.input, { marginTop: 8 }]}
                  placeholder="Enter address"
                  value={manualAddress}
                  onChangeText={setManualAddress}
                />
              )}
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Create hosted wallet for this asset</Text>
              <Switch
                value={createHostedWallet}
                onValueChange={setCreateHostedWallet}
                trackColor={{ false: '#555', true: '#00D4FF' }}
              />
            </View>

            <Text style={styles.typeLabel}>Asset Type</Text>
            <View style={styles.typeRow}>
              {(['house', 'car', 'factory', 'warehouse'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeChip, selectedAssetType === type && styles.typeChipActive]}
                  onPress={() => setSelectedAssetType(type)}
                >
                  <Text style={[styles.typeText, selectedAssetType === type && styles.typeTextActive]}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.generateButton}
              onPress={generateTwin}
              disabled={isUploading || locationLoading}
            >
              <Text style={styles.generateButtonText}>
                {isUploading || locationLoading ? 'Creating...' : 'Generate 3D Twin'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Regeneration Modal */}
      <Modal visible={regenModalVisible} transparent animationType="fade" onRequestClose={() => setRegenModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Re-generate 3D Model</Text>
            <TouchableOpacity style={[styles.generateButton, { marginBottom: 10 }]} onPress={() => triggerRegeneration('exterior')}>
              <Text style={styles.generateButtonText}>Exterior Only</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.generateButton, { marginBottom: 10 }]} onPress={() => triggerRegeneration('interior')}>
              <Text style={styles.generateButtonText}>Interior Only</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.generateButton, { marginBottom: 10 }]} onPress={() => triggerRegeneration('both')}>
              <Text style={styles.generateButtonText}>Both (Exterior + Interior)</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRegenModalVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3D Viewer Modal */}
      <Modal visible={viewerVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setViewerVisible(false)}>
        {selectedBuild && (
          <ModelViewer
            modelUrl={
              selectedBuild.exterior_model_url ||
              selectedBuild.interior_model_url ||
              selectedBuild.model_url ||
              ''
            }
            buildId={selectedBuild.id}
            onClose={() => setViewerVisible(false)}
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1f' },
  header: { paddingTop: 50, paddingHorizontal: 20, alignItems: 'center' },
  title: { fontSize: 28, color: '#E8B923', fontWeight: 'bold' },
  subtitle: { color: '#00D4FF', fontSize: 14 },
  globeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 22, color: '#E8B923', marginBottom: 8 },
  emptySubtitle: { color: '#A8A39A', textAlign: 'center' },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 8 },
  controlBtn: { backgroundColor: '#1F1F1F', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  controlText: { color: '#E8B923', fontSize: 13 },
  fab: { position: 'absolute', bottom: 55, alignSelf: 'center', backgroundColor: '#E8B923', paddingHorizontal: 26, paddingVertical: 13, borderRadius: 999 },
  fabText: { color: '#1F1F1F', fontWeight: 'bold', fontSize: 16 },
  infoPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(31,31,31,0.97)', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '58%' },
  colorDot: { width: 14, height: 14, borderRadius: 7, marginRight: 10 },
  panelTitle: { fontSize: 20, color: '#E8B923', fontWeight: 'bold' },
  panelType: { color: '#00D4FF', marginBottom: 8 },
  actionBtn: { backgroundColor: '#FFD700', padding: 14, borderRadius: 999, alignItems: 'center', marginTop: 10 },
  actionBtnText: { color: '#1F1F1F', fontWeight: 'bold' },
  closeBtn: { alignItems: 'center', marginTop: 12 },
  closeText: { color: '#A8A39A' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1F1F1F', borderRadius: 20, padding: 22 },
  modalTitle: { fontSize: 22, color: '#E8B923', textAlign: 'center', marginBottom: 14 },
  input: { backgroundColor: '#2C2C2C', color: '#F5F0E6', padding: 14, borderRadius: 12, fontSize: 16, minHeight: 85, textAlignVertical: 'top' },
  photoButton: { backgroundColor: '#2C2C2C', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  photoButtonText: { color: '#00D4FF', fontWeight: '600' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 4 },
  toggleLabel: { color: '#F5F0E6', fontSize: 15 },
  typeLabel: { color: '#A8A39A', marginTop: 8, marginBottom: 6 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  typeChip: { flex: 1, paddingVertical: 9, borderRadius: 999, backgroundColor: '#2C2C2C', alignItems: 'center' },
  typeChipActive: { backgroundColor: '#E8B923' },
  typeText: { color: '#ccc', fontWeight: '600' },
  typeTextActive: { color: '#1F1F1F' },
  generateButton: { backgroundColor: '#00D4FF', padding: 15, borderRadius: 999, alignItems: 'center', marginTop: 8 },
  generateButtonText: { color: '#1F1F1F', fontWeight: 'bold', fontSize: 16 },
  cancelText: { color: '#A8A39A', textAlign: 'center', marginTop: 12 },
  locationTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 999 },
  locationTabActive: { backgroundColor: '#E8B923' },
});