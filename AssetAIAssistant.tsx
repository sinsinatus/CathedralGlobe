import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { supabase } from './src/lib/supabase';

interface Props {
  buildId: string;
  onClose: () => void;
}

export default function AssetAIAssistant({ buildId, onClose }: Props) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMessage = { role: 'user' as const, content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('asset-ai-agent', {
        body: { build_id: buildId, message: input },
      });

      if (error || !data.success) throw new Error(data?.error || 'Failed to get response');

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsLoading(false);
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🧠 Grok AI Agent</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollViewRef} style={styles.chat} contentContainerStyle={{ padding: 12 }}>
        {messages.map((msg, i) => (
          <View key={i} style={[styles.message, msg.role === 'user' ? styles.userMessage : styles.assistantMessage]}>
            <Text style={msg.role === 'user' ? styles.userText : styles.assistantText}>{msg.content}</Text>
          </View>
        ))}
        {isLoading && <Text style={styles.loading}>Grok is thinking...</Text>}
      </ScrollView>

      <View style={styles.inputArea}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask Grok anything about this asset..."
          placeholderTextColor="#888"
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage} disabled={isLoading}>
          <Text style={styles.sendText}>↑</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1f' },
  header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1F1F1F' },
  title: { color: '#E8B923', fontSize: 18, fontWeight: 'bold' },
  closeText: { color: '#00D4FF', fontSize: 20 },
  chat: { flex: 1 },
  message: { maxWidth: '85%', padding: 12, borderRadius: 12, marginBottom: 8 },
  userMessage: { alignSelf: 'flex-end', backgroundColor: '#00D4FF' },
  assistantMessage: { alignSelf: 'flex-start', backgroundColor: '#2C2C2C' },
  userText: { color: '#1F1F1F' },
  assistantText: { color: '#F5F0E6' },
  loading: { color: '#A8A39A', fontStyle: 'italic', textAlign: 'center', marginVertical: 8 },
  inputArea: { flexDirection: 'row', padding: 12, backgroundColor: '#1F1F1F', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#2C2C2C', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, color: '#F5F0E6', marginRight: 8 },
  sendButton: { backgroundColor: '#E8B923', width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#1F1F1F', fontSize: 24, fontWeight: 'bold' },
});