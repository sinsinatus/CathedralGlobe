import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { useRoute } from '@react-navigation/native';

export default function ViewerScreen() {
  const route = useRoute<any>();
  const buildId = route.params.buildId;
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    supabase.from('items').select('*').eq('build_id', buildId).then(({ data }) => setItems(data || []));
  }, [buildId]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Inside your 3D Twin</Text>
      <Text style={styles.subtitle}>Photorealistic model + all items spatially placed</Text>
      <FlatList
        data={items}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text>{item.title || item.name}</Text>
            <Text>Stock: {item.stock_qty} | Serial: {item.serial}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1F1F1F', padding: 20 },
  title: { fontSize: 28, color: '#E8B923' },
  subtitle: { color: '#00D4FF' },
  item: { backgroundColor: '#2C2C2C', padding: 16, marginBottom: 10, borderRadius: 8 },
});