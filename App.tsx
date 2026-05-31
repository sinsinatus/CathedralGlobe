import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, TextInput, Modal, ScrollView, ActivityIndicator, Alert, Image, Switch, Dimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import Globe from 'react-globe.gl';
import { supabase } from './src/lib/supabase';

interface Build {
  id: string;
  name: string;
  initial_prompt: string;
  center_lat: number | null;
  center_lng: number | null;
  model_detail_level: number;
  asset_type?: string;
  status?: string;
  hosted_wallet_address?: string;
  nft_metadata_uri?: string;
  model_status?: string;
  model_url?: string;
  model_provider?: string;
  model_task_id?: string;
  created_at?: string;
}

interface Media {
  id: string;
  build_id: string;
  url: string;
  type: string;
}

const ASSET_COLORS: Record<string, string> = {
  house: '#E8B923', car: '#00D4FF', factory: '#2EC4B6', warehouse: '#9B5DE5', default: '#FFFFFF',
};

const ASSET_LABELS: Record<string, string> = {
  house: 'House', car: 'Car', factory: 'Factory', warehouse: 'Warehouse',
};

export default function App() {
  const globeRef = useRef<any>(null);

  const [builds, setBuilds] = useState<Build[]>([]);
  const [selectedBuild, setSelectedBuild] = useState<Build | null>(null);
  const [mediaForSelected, setMediaForSelected] = useState<Media[]>([]);
  const [modalVisible, setModalVisible] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [selectedAssetType, setSelectedAssetType] = useState<'house' | 'car' | 'factory' | 'warehouse'>('house');
  const [selectedMedia, setSelectedMedia] = useState<{ uri: string; type: 'photo' | 'video' } | null>(null);
  const [createHostedWallet, setCreateHostedWallet] = useState(true);

  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [manualAddress, setManualAddress] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingBuilds, setIsLoadingBuilds] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const loadBuilds = async () => {
    setIsLoadingBuilds(true);
    const { data } = await supabase.from('builds').select('*')
      .not('center_lat', 'is', null).not('center_lng', 'is', null)
      .order('created_at', { ascending: false });
    setBuilds(data || []);
    setIsLoadingBuilds(false);
  };

  const loadMediaForBuild = async (buildId: string) => {
    const { data } = await supabase.from('media').select('*').eq('build_id', buildId);
    setMediaForSelected(data || []);
  };

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
    } catch (e) {
      Alert.alert('Location Error', 'Could not get current location.');
      return null;
    } finally {
      setLocationLoading(false);
    }
  };

  const geocodeAddress = async (address: string) => {
    if (!address.trim()) return null;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
      Alert.alert('Address Not Found', 'Please try a more specific address.');
      return null;
    } catch (e) {
      Alert.alert('Geocoding Failed', 'Could not find location.');
      return null;
    }
  };

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

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (selectedBuild && (selectedBuild.model_status === 'processing' || selectedBuild.model_status === 'pending')) {
      interval = setInterval(() => checkModelStatus(selectedBuild.id), 10000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [selectedBuild?.id, selectedBuild?.model_status]);

  useEffect(() => {
    loadBuilds();
  }, []);

  const createHostedWalletAndNFTMetadata = (buildName: string, assetType: string) => {
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(20)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const address = '0x' + randomHex;
    return {
      hosted_wallet_address: address,
      nft_metadata: {
        name: buildName,
        description: `Digital twin of a ${assetType}`,
        attributes: [
          { trait_type: "Asset Type", value: assetType },
          { trait_type: "Hosted Wallet", value: address },
        ],
      },
    };
  };

  const generateTwin = async () => {
    if (!prompt.trim()) {
      Alert.alert('Missing Description', 'Please describe something to build.');
      return;
    }

    setIsUploading(true);

    let finalLat: number;
    let finalLng: number;

    if (useCurrentLocation) {
      const loc = await getCurrentLocation();
      if (!loc) { setIsUploading(false); return; }
      finalLat = loc.lat; finalLng = loc.lng;
    } else {
      const loc = await geocodeAddress(manualAddress);
      if (!loc) { setIsUploading(false); return; }
      finalLat = loc.lat; finalLng = loc.lng;
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
        hosted_wallet_address: createHostedWallet ? createHostedWalletAndNFTMetadata(prompt, selectedAssetType).hosted_wallet_address : null,
        nft_metadata_uri: createHostedWallet ? JSON.stringify(createHostedWalletAndNFTMetadata(prompt, selectedAssetType).nft_metadata) : null,
        model_status: 'pending',
        model_provider: 'meshy',
      })
      .select()
      .single();

    if (buildError) {
      Alert.alert('Creation Failed', buildError.message);
      setIsUploading(false);
      return;
    }

    try {
      await supabase.functions.invoke('generate-3d-model', {
        body: { build_id: build.id, prompt: prompt, asset_type: selectedAssetType },
      });
    } catch (e) {}

    if (selectedMedia) {
      try {
        const fileExt = selectedMedia.type === 'video' ? 'mp4' : 'jpg';
        const fileName = `${build.id}_${Date.now()}.${fileExt}`;
        const contentType = selectedMedia.type === 'video' ? 'video/mp4' : 'image/jpeg';
        const blob = await (await fetch(selectedMedia.uri)).blob();
        const { error: uploadError } = await supabase.storage.from('media').upload(fileName, blob, { contentType });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
          await supabase.from('media').insert({ build_id: build.id, url: urlData.publicUrl, type: selectedMedia.type });
        }
      } catch (e) {}
    }

    setIsUploading(false);
    setModalVisible(false);
    setPrompt('');
    setSelectedMedia(null);
    setManualAddress('');
    await loadBuilds();

    Alert.alert('✅ Asset Created!', `Build ID: ${build.id}`);
  };

  const deleteBuild = async (build: Build) => {
    Alert.alert('Confirm Delete', `Delete "${build.name}" and all data?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await supabase.from('media').delete().eq('build_id', build.id);
          const { error } = await supabase.from('builds').delete().eq('id', build.id);
          if (error) throw error;
          setSelectedBuild(null);
          await loadBuilds();
          Alert.alert('Asset Deleted');
        } catch (e: any) {
          Alert.alert('Delete Failed', e.message);
        }
      }}
    ]);
  };

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const isVideo = asset.type === 'video' || asset.uri.includes('.mp4') || asset.uri.includes('.mov');
      setSelectedMedia({ uri: asset.uri, type: isVideo ? 'video' : 'photo' });
    }
  };

  const handlePointClick = async (point: any) => {
    setSelectedBuild(point);
    setAutoRotate(false);
    await loadMediaForBuild(point.id);
    if (globeRef.current) {
      globeRef.current.pointOfView({ lat: point.lat || point.center_lat, lng: point.lng || point.center_lng, altitude: 0.55 }, 700);
    }
  };

  const closePanel = () => {
    setSelectedBuild(null);
    setMediaForSelected([]);
    setAutoRotate(true);
  };

  const zoomToGlobe = () => {
    if (globeRef.current) globeRef.current.pointOfView({ altitude: 1.7 }, 600);
  };

  const open3DViewer = () => {
    if (selectedBuild?.model_url) {
      const viewerUrl = `https://gltf-viewer.donmccurdy.com/?url=${encodeURIComponent(selectedBuild.model_url)}`;
      window.open(viewerUrl, '_blank');
    } else {
      Alert.alert('Not Ready', '3D model is not available yet.');
    }
  };

  const downloadModel = () => {
    if (selectedBuild?.model_url) {
      const link = document.createElement('a');
      link.href = selectedBuild.model_url;
      link.download = `${selectedBuild.name || 'model'}.glb`;
      link.click();
    }
  };

  const stats = builds.reduce((acc: any, b: any) => {
    const t = b.asset_type || 'default';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const globePoints = builds.filter(b => b.center_lat && b.center_lng).map((b, i) => ({
    ...b,
    lat: b.center_lat!,
    lng: b.center_lng!,
    color: ASSET_COLORS[b.asset_type || 'default'],
    size: 0.08,
    altitude: 0.012 + (i % 3) * 0.004,
    label: `${b.name} • ${ASSET_LABELS[b.asset_type || 'default']}`,
  }));

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
            pointLat="lat" pointLng="lng" pointColor="color"
            pointAltitude="altitude" pointRadius="size" pointLabel="label"
            onPointClick={handlePointClick}
            autoRotate={autoRotate} autoRotateSpeed={0.18}
            pointOfView={{ lat: -33.87, lng: 151.21, altitude: 1.6 }}
          />
        )}
      </View>

      {builds.length > 0 && (
        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlBtn} onPress={() => setAutoRotate(!autoRotate)}>
            <Text style={styles.controlText}>{autoRotate ? 'Pause' : 'Resume'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={loadBuilds}><Text style={styles.controlText}>Refresh</Text></TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={zoomToGlobe}><Text style={styles.controlText}>Reset View</Text></TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+ New Asset</Text>
      </TouchableOpacity>

      {selectedBuild && (
        <View style={styles.infoPanel}>
          <ScrollView>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[styles.colorDot, { backgroundColor: ASSET_COLORS[selectedBuild.asset_type || 'default'] }]} />
              <Text style={styles.panelTitle}>{selectedBuild.name}</Text>
            </View>
            <Text style={styles.panelType}>{ASSET_LABELS[selectedBuild.asset_type || 'default']}</Text>

            {selectedBuild.hosted_wallet_address && (
              <View style={styles.walletBox}>
                <Text style={styles.walletLabel}>Hosted Wallet</Text>
                <Text style={styles.walletAddress}>{selectedBuild.hosted_wallet_address}</Text>
              </View>
            )}

            {selectedBuild.model_status && selectedBuild.model_status !== 'none' && (
              <View style={{ marginTop: 14, backgroundColor: '#1F1F1F', padding: 14, borderRadius: 12 }}>
                <Text style={{ color: '#A8A39A', marginBottom: 6, fontWeight: '600' }}>3D Digital Twin</Text>
                
                {selectedBuild.model_status === 'completed' && selectedBuild.model_url ? (
                  <View style={{ gap: 10 }}>
                    <TouchableOpacity 
                      style={{ backgroundColor: '#00D4FF', paddingVertical: 14, borderRadius: 10, alignItems: 'center' }}
                      onPress={open3DViewer}
                    >
                      <Text style={{ color: '#1F1F1F', fontWeight: 'bold', fontSize: 16 }}>🧊 View 3D Model</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={{ backgroundColor: '#444', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}
                      onPress={downloadModel}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600' }}>⬇️ Download .glb File</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={{ color: '#E8B923' }}>
                    {selectedBuild.model_status === 'pending' ? 'Queued for generation...' : 'Generating 3D model with Meshy AI...'}
                  </Text>
                )}

                <TouchableOpacity style={{ marginTop: 10 }} onPress={() => checkModelStatus(selectedBuild.id)} disabled={isCheckingStatus}>
                  <Text style={{ color: '#00D4FF' }}>{isCheckingStatus ? 'Checking...' : '⟳ Refresh 3D Status'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {mediaForSelected.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ color: '#A8A39A', marginBottom: 6 }}>Attached Media</Text>
                {mediaForSelected.map(m => (
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

            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FF3B30', marginTop: 20 }]} onPress={() => deleteBuild(selectedBuild)}>
              <Text style={styles.actionBtnText}>🗑️ Delete Asset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={closePanel}><Text style={styles.closeText}>Close</Text></TouchableOpacity>
          </ScrollView>
        </View>
      )}

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>What are we building today?</Text>

            <TextInput style={styles.input} placeholder="Describe your asset..." value={prompt} onChangeText={setPrompt} multiline placeholderTextColor="#888" />

            <TouchableOpacity style={styles.photoButton} onPress={pickMedia}>
              <Text style={styles.photoButtonText}>
                {selectedMedia ? `✓ ${selectedMedia.type} selected` : '+ Add Photo or Video (optional)'}
              </Text>
            </TouchableOpacity>

            <View style={{ marginTop: 16 }}>
              <Text style={styles.typeLabel}>Location</Text>
              <View style={{ flexDirection: 'row', backgroundColor: '#2C2C2C', borderRadius: 999, padding: 4 }}>
                <TouchableOpacity style={[styles.locationTab, useCurrentLocation && styles.locationTabActive]} onPress={() => setUseCurrentLocation(true)}>
                  <Text style={useCurrentLocation ? styles.typeTextActive : styles.typeText}>📍 Current Location</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.locationTab, !useCurrentLocation && styles.locationTabActive]} onPress={() => setUseCurrentLocation(false)}>
                  <Text style={!useCurrentLocation ? styles.typeTextActive : styles.typeText}>Enter Address</Text>
                </TouchableOpacity>
              </View>

              {useCurrentLocation ? (
                <Text style={{ color: '#00D4FF', marginTop: 8, textAlign: 'center' }}>Will use your current GPS location</Text>
              ) : (
                <TextInput style={[styles.input, { marginTop: 8 }]} placeholder="Enter address (e.g. 123 Example St, Sydney)" value={manualAddress} onChangeText={setManualAddress} />
              )}
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Create hosted wallet for this asset</Text>
              <Switch value={createHostedWallet} onValueChange={setCreateHostedWallet} trackColor={{ false: '#555', true: '#00D4FF' }} />
            </View>

            <Text style={styles.typeLabel}>Asset Type</Text>
            <View style={styles.typeRow}>
              {(['house', 'car', 'factory', 'warehouse'] as const).map(type => (
                <TouchableOpacity key={type} style={[styles.typeChip, selectedAssetType === type && styles.typeChipActive]} onPress={() => setSelectedAssetType(type)}>
                  <Text style={[styles.typeText, selectedAssetType === type && styles.typeTextActive]}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.generateButton} onPress={generateTwin} disabled={isUploading || locationLoading}>
              <Text style={styles.generateButtonText}>{isUploading || locationLoading ? 'Creating...' : 'Generate 3D Twin'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1f' },
  header: { paddingTop: 50, paddingHorizontal: 20, alignItems: 'center' },
  title: { fontSize: 28, color: '#E8B923', fontWeight: 'bold' },
  subtitle: { color: '#00D4FF', fontSize: 14 },
  statsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 10, gap: 8 },
  statItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F1F1F', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statText: { color: '#F5F0E6', fontSize: 12 },
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
  walletBox: { backgroundColor: '#1F1F1F', padding: 12, borderRadius: 10, marginTop: 8 },
  walletLabel: { color: '#00D4FF', fontSize: 13, fontWeight: '600' },
  walletAddress: { color: '#E8B923', fontSize: 13, marginTop: 4, fontFamily: 'monospace' },
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