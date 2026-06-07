import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Switch, Pressable } from 'react-native';
import { supabase } from './src/lib/supabase';

interface Props {
  buildId: string;
  onClose: () => void;
}

export default function AssetAIAssistant({ buildId, onClose }: Props) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [autoTriggers, setAutoTriggers] = useState<Record<string, boolean>>({
    scan_utilities: false,
    maintenance_check: false,
    media_summary: true,
  });
  const [showTriggers, setShowTriggers] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Load current auto-triggers
  useEffect(() => {
    const loadTriggers = async () => {
      const { data } = await supabase.from('builds').select('auto_triggers').eq('id', buildId).single();
      if (data?.auto_triggers) setAutoTriggers(data.auto_triggers);
    };
    loadTriggers();
  }, [buildId]);

  const sendMessage = async (customMessage?: string) => {
    const text = customMessage || input.trim();
    if (!text || isLoading) return;

    // Add user message immediately for better UX
    const userMessage = { role: 'user' as const, content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('asset-ai-agent', {
        body: { build_id: buildId, message: text },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || 'Failed to get response');
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Something went wrong');
      // Remove the user message if the call completely failed
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  };

  const toggleTrigger = async (key: string) => {
    const newValue = !autoTriggers[key];
    const updated = { ...autoTriggers, [key]: newValue };
    setAutoTriggers(updated);
    await supabase.from('builds').update({ auto_triggers: updated }).eq('id', buildId);
  };

  const runAllEnabledTriggers = async () => {
    // ... (same as before - optional)
    Alert.alert('Monthly Triggers', 'This feature is coming soon.');
  };

  const suggestedActions = [
    { label: "📸 Analyse all images", prompt: "Analyse every photo and video attached to this asset. Describe what you see in detail." },
    { label: "📋 Summarise this asset", prompt: "Give me a concise summary of this entire asset including items and media." },
    { label: "🔍 Check for issues", prompt: "Are there any potential maintenance issues or red flags?" },
    { label: "💰 Scan for savings", prompt: "Look for any opportunities to save money on this asset." },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🧠 Grok AI Agent</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <Pressable onPress={() => setShowTriggers(!showTriggers)} style={styles.triggersHeader}>
        <Text style={styles.sectionTitle}>Auto Triggers (Monthly) ▼</Text>
      </Pressable>

      {showTriggers && (
        <View style={styles.triggersSection}>
          {Object.entries(autoTriggers).map(([key, enabled]) => (
            <View key={key} style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{key.replace('_', ' ').toUpperCase()}</Text>
              <Switch value={enabled} onValueChange={() => toggleTrigger(key)} />
            </View>
          ))}
        </View>
      )}

      <ScrollView ref={scrollViewRef} style={styles.chat} contentContainerStyle={{ padding: 12 }}>
        {messages.map((msg, i) => (
          <View key={i} style={[styles.message, msg.role === 'user' ? styles.userMessage : styles.assistantMessage]}>
            <Text style={msg.role === 'user' ? styles.userText : styles.assistantText}>{msg.content}</Text>
          </View>
        ))}
        {isLoading && <Text style={styles.loading}>Grok is thinking...</Text>}
      </ScrollView>

      <ScrollView horizontal style={styles.suggestions} showsHorizontalScrollIndicator={false}>
        {suggestedActions.map((action, i) => (
          <TouchableOpacity 
            key={i} 
            style={styles.suggestionChip} 
            onPress={() => sendMessage(action.prompt)}
          >
            <Text style={styles.suggestionText}>{action.label}</Text>
          </TouchableOpacity>
        ))}
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
        <TouchableOpacity style={styles.sendButton} onPress={() => sendMessage()} disabled={isLoading}>
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
  triggersHeader: { backgroundColor: '#1F1F1F', padding: 12, borderBottomWidth: 1, borderBottomColor: '#333' },
  sectionTitle: { color: '#A8A39A', fontSize: 14, fontWeight: '600' },
  triggersSection: { backgroundColor: '#1F1F1F', padding: 12, gap: 12 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { color: '#F5F0E6', fontSize: 15 },
  chat: { flex: 1 },
  message: { maxWidth: '85%', padding: 12, borderRadius: 12, marginBottom: 8 },
  userMessage: { alignSelf: 'flex-end', backgroundColor: '#00D4FF' },
  assistantMessage: { alignSelf: 'flex-start', backgroundColor: '#2C2C2C' },
  userText: { color: '#1F1F1F' },
  assistantText: { color: '#F5F0E6' },
  loading: { color: '#A8A39A', fontStyle: 'italic', textAlign: 'center', marginVertical: 8 },
  suggestions: { maxHeight: 60, paddingVertical: 8, backgroundColor: '#1F1F1F' },
  suggestionChip: { backgroundColor: '#2C2C2C', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, marginRight: 8 },
  suggestionText: { color: '#F5F0E6', fontSize: 14 },
  inputArea: { flexDirection: 'row', padding: 12, backgroundColor: '#1F1F1F', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#2C2C2C', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, color: '#F5F0E6', marginRight: 8 },
  sendButton: { backgroundColor: '#E8B923', width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#1F1F1F', fontSize: 24, fontWeight: 'bold' },
});