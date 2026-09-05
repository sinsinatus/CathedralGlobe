// ItemDetailModal.tsx — Full rich editing modal with document attachment support

import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, 
  StyleSheet, Alert, ActivityIndicator 
} from 'react-native';
import { supabase } from './src/lib/supabase';

interface Item {
  id: string;
  name: string;
  type: string;
  description?: string;
  parent_id?: string | null;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  metadata?: any;
}

interface Props {
  visible: boolean;
  item: Item | null;
  items: Item[];                    
  onClose: () => void;
  onSaved: () => void;              
  onAttachDocument?: (parentItemId: string) => void;   // ← NEW: for attaching docs to  this item
}

export default function ItemDetailModal({ 
  visible, 
  item, 
  items, 
  onClose, 
  onSaved,
  onAttachDocument 
}: Props) {
  const [form, setForm] = useState<Partial<Item>>({});
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (item) {
      setForm({
        name: item.name,
        type: item.type,
        description: item.description || '',
        manufacturer: item.manufacturer || '',
        model: item.model || '',
        serial_number: item.serial_number || '',
        parent_id: item.parent_id || null,
        metadata: item.metadata || {},
      });
    }
  }, [item]);

  const updateField = (key: keyof Item, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!item) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('items')
        .update({
          name: form.name,
          type: form.type,
          description: form.description,
          manufacturer: form.manufacturer,
          model: form.model,
          serial_number: form.serial_number,
          parent_id: form.parent_id,
          metadata: form.metadata,
        })
        .eq('id', item.id);

      if (error) throw error;

      Alert.alert('Saved!', 'Item updated successfully.');
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!item) return;

    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${item.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('items').delete().eq('id', item.id);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              onSaved();
              onClose();
            }
          },
        },
      ]
    );
  };

  // NEW: Handle attaching a document/receipt/warranty to this item
  const handleAttachDocument = () => {
    if (!item) return;

    if (onAttachDocument) {
      onAttachDocument(item.id);   // This will be wired in ModelViewer
      // Optionally close modal after starting upload
      // onClose();
    } else {
      Alert.alert(
        "Attach Document",
        "This will upload a receipt, warranty, manual, or schematic and link it directly to this item using parent_id."
      );
    }
  };

  if (!item) return null;

  const roomOptions = items.filter(i => i.type === 'Room');

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Edit Item</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* Basic Info */}
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(text) => updateField('name', text)}
            />

            <Text style={styles.label}>Type</Text>
            <TextInput
              style={styles.input}
              value={form.type}
              onChangeText={(text) => updateField('type', text)}
              placeholder="Room, Appliance, Furniture, Document, etc."
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={form.description}
              onChangeText={(text) => updateField('description', text)}
              multiline
            />

            {/* Rich Metadata */}
            <Text style={styles.sectionTitle}>Rich Metadata</Text>

            <Text style={styles.label}>Manufacturer</Text>
            <TextInput
              style={styles.input}
              value={form.manufacturer}
              onChangeText={(text) => updateField('manufacturer', text)}
            />

            <Text style={styles.label}>Model</Text>
            <TextInput
              style={styles.input}
              value={form.model}
              onChangeText={(text) => updateField('model', text)}
            />

            <Text style={styles.label}>Serial Number</Text>
            <TextInput
              style={styles.input}
              value={form.serial_number}
              onChangeText={(text) => updateField('serial_number', text)}
            />

            {/* Hierarchy */}
            <Text style={styles.label}>Parent Room</Text>
            <View style={styles.pickerContainer}>
              <TouchableOpacity 
                style={styles.picker}
                onPress={() => {
                  Alert.alert('Select Parent', 'Feature coming soon - for now use AI or edit parent_id manually');
                }}
              >
                <Text>
                  {form.parent_id 
                    ? roomOptions.find(r => r.id === form.parent_id)?.name || 'Unknown Room' 
                    : 'No Parent (Top Level)'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* NEW: Attach Documents Section */}
            <Text style={styles.sectionTitle}>Attached Documents & Receipts</Text>
            
            <TouchableOpacity 
              style={styles.attachButton} 
              onPress={handleAttachDocument}
            >
              <Text style={styles.attachButtonText}>+ Attach Document / Receipt / Warranty</Text>
            </TouchableOpacity>

            <Text style={styles.smallNote}>
              Documents will be linked to this item using parent_id and will appear as children in the sidebar.
            </Text>

            {/* Future improvements: List of already attached documents */}

          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Text style={styles.deleteText}>Delete Item</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.saveButton, isSaving && styles.disabled]} 
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#1F1F1F',
    borderRadius: 20,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    color: '#E8B923',
    fontSize: 22,
    fontWeight: '700',
  },
  close: {
    color: '#00D4FF',
    fontSize: 28,
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
  },
  label: {
    color: '#A8A39A',
    marginTop: 16,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#E8B923',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2C2C2C',
    color: '#F5F0E6',
    padding: 14,
    borderRadius: 12,
    fontSize: 16,
  },
  pickerContainer: {
    backgroundColor: '#2C2C2C',
    borderRadius: 12,
    padding: 14,
  },
  picker: {
    color: '#F5F0E6',
  },
  attachButton: {
    backgroundColor: '#2C2C2C',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#00D4FF',
  },
  attachButtonText: {
    color: '#00D4FF',
    fontWeight: '600',
    fontSize: 16,
  },
  smallNote: {
    color: '#A8A39A',
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 12,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#FF3B30',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  saveButton: {
    flex: 2,
    backgroundColor: '#00D4FF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveText: {
    color: '#1F1F1F',
    fontWeight: '700',
    fontSize: 16,
  },
  disabled: {
    opacity: 0.6,
  },
});
