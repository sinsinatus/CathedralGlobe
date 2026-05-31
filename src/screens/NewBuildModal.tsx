import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';

const REPLICATE_API_KEY = 'YOUR_REPLICATE_API_KEY_HERE'; // ← paste here

export default function NewBuildModal() {
  const [prompt, setPrompt] = useState('');
  const navigation = useNavigation<any>();

  const createBuild = async (inputType: string) => {
    let mediaUri = '';
    if (inputType === 'photo') {
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (res.canceled) return;
      mediaUri = res.assets[0].uri;
    } else if (inputType === 'schematic') {
      const res = await DocumentPicker.getDocumentAsync({ type: 'image/*' });
      if (res.canceled) return;
      mediaUri = res.assets[0].uri;
    }

    // Create build
    const { data: build } = await supabase.from('builds').insert({ name: prompt || 'New Build', initial_prompt: prompt }).select().single();

    // Call Replicate for 3D generation (text-to-3D model – replace model ID if you prefer another)
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { 'Authorization': `Token ${REPLICATE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: "lucataco/flux-3d:YOUR_MODEL_VERSION_HERE", // replace with a real 3D model version from replicate.com
        input: { prompt: prompt || "3D model of a house/factory/car" }
      })
    });
    const prediction = await response.json();

    // In real flow you would poll for completion and get model_url – for MVP we simulate
    Alert.alert('3D generation started', 'AI is building your structure… (check Supabase soon)');
    navigation.goBack();
  };

  return (
    <View style={styles.modal}>
      <Text style={styles.title}>What are we building today?</Text>
      <TextInput style={styles.input} placeholder="House, car, factory, warehouse..." value={prompt} onChangeText={setPrompt} />
      <TouchableOpacity style={styles.btn} onPress={() => createBuild('text')}><Text style={styles.btnText}>Generate 3D from description</Text></TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={() => createBuild('photo')}><Text style={styles.btnText}>Take photo / video</Text></TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={() => createBuild('schematic')}><Text style={styles.btnText}>Upload schematic</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: '#1F1F1F', padding: 30, justifyContent: 'center' },
  title: { fontSize: 32, color: '#E8B923', textAlign: 'center', marginBottom: 40 },
  input: { backgroundColor: '#2C2C2C', color: '#F5F0E6', padding: 20, borderRadius: 12, fontSize: 18 },
  btn: { backgroundColor: '#00D4FF', padding: 18, borderRadius: 999, marginTop: 12, alignItems: 'center' },
  btnText: { color: '#1F1F1F', fontWeight: 'bold' },
});