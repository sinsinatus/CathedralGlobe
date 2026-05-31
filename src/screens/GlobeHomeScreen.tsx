import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';

type Build = { id: string; name: string; center_lat: number; center_lng: number; model_detail_level: number };

export default function GlobeHomeScreen() {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [region, setRegion] = useState<any>(null);
  const mapRef = useRef<MapView>(null);
  const navigation = useNavigation<any>();

  const loadBuilds = async () => {
    const { data } = await supabase.from('builds').select('*').not('center_lat', 'is', null);
    if (data) {
      setBuilds(data);
      if (data.length === 1) {
        setRegion({ latitude: data[0].center_lat, longitude: data[0].center_lng, latitudeDelta: 0.02, longitudeDelta: 0.02 });
      } else if (data.length > 1) {
        mapRef.current?.fitToCoordinates(data.map(b => ({ latitude: b.center_lat, longitude: b.center_lng })), { edgePadding: { top: 80, right: 80, bottom: 80, left: 80 } });
      }
    }
  };

  useEffect(() => { loadBuilds(); }, []);

  const getPinColor = (level: number) => level >= 8 ? '#00FFAA' : level >= 5 ? '#FFD700' : '#00D4FF';

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        mapType="satellite"
        initialRegion={region || { latitude: 20, longitude: 0, latitudeDelta: 120, longitudeDelta: 120 }}
        showsUserLocation
      >
        {builds.map(b => (
          <Marker
            key={b.id}
            coordinate={{ latitude: b.center_lat, longitude: b.center_lng }}
            title={b.name}
            description={`Detail: ${b.model_detail_level}/10`}
            pinColor={getPinColor(b.model_detail_level)}
            onPress={() => navigation.navigate('Viewer', { buildId: b.id })}
          />
        ))}
      </MapView>

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('NewBuildModal')}>
        <Text style={styles.fabText}>What are we building today?</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  fab: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: '#E8B923', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999, elevation: 10 },
  fabText: { color: '#1F1F1F', fontWeight: 'bold', fontSize: 18 },
});