import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  Image,
  Alert,
  ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../theme/theme';
import { Typography } from '../components/Typography';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Camera, User } from 'lucide-react-native';
import { userApi } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import * as ImagePicker from 'expo-image-picker';

export const EditProfileScreen: React.FC = () => {
  const navigation = useNavigation();
  const currentUser = useAppStore((s) => s.currentUser);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);

  const [name, setName] = useState(currentUser?.name || '');
  const [saving, setSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [avatarUri, setAvatarUri] = useState(currentUser?.profilePhoto || currentUser?.avatar || '');

  // Auto-save photo immediately when selected — so it persists even if user backs out
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setAvatarUri(uri);
      setPhotoSaving(true);
      try {
        // Upload the file to the server — saves to uploads/avatar/
        const formData = new FormData();
        formData.append('avatar', { uri, type: 'image/jpeg', name: 'avatar.jpg' } as any);
        const { apiClient } = await import('../services/api/client');
        const response = await apiClient.upload<{ avatar: string; profilePhoto: string }>('/users/me/avatar', formData);
        if (response.success && response.data) {
          const serverUrl = response.data.profilePhoto || response.data.avatar || uri;
          setAvatarUri(serverUrl);
          setCurrentUser({ ...currentUser!, profilePhoto: serverUrl, avatar: serverUrl });
        } else {
          setCurrentUser({ ...currentUser!, profilePhoto: uri, avatar: uri });
        }
      } catch {
        // Still update locally so the photo shows immediately
        setCurrentUser({ ...currentUser!, profilePhoto: uri, avatar: uri });
      } finally {
        setPhotoSaving(false);
      }
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setSaving(true);
    try {
      const response = await userApi.updateProfile({ name: name.trim() } as any);
      if (response.success && response.data) {
        // Preserve the photo that was already saved via pickImage
        const photo = response.data.profilePhoto || response.data.avatar || avatarUri;
        setCurrentUser({ ...response.data, profilePhoto: photo, avatar: photo });
      } else {
        setCurrentUser({ ...currentUser!, name: name.trim() });
      }
      Alert.alert('Success', 'Profile updated');
      navigation.goBack();
    } catch {
      setCurrentUser({ ...currentUser!, name: name.trim() });
      Alert.alert('Success', 'Profile updated');
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft color={COLORS.background.slate[900]} size={24} />
        </TouchableOpacity>
        <Typography size="lg" weight="bold">Edit Profile</Typography>
        <TouchableOpacity onPress={handleSave} disabled={saving || photoSaving}>
          {saving ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Typography size="md" weight="bold" color={COLORS.primary}>Save</Typography>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickImage} style={styles.avatarContainer} disabled={photoSaving}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <User size={48} color="#999" />
              </View>
            )}
            <View style={styles.cameraIcon}>
              {photoSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Camera size={16} color="#fff" />
              )}
            </View>
          </TouchableOpacity>
          <Typography size="sm" color="#666" style={{ marginTop: 8 }}>
            {photoSaving ? 'Saving photo…' : 'Tap to change photo'}
          </Typography>
        </View>

        {/* Form Section */}
        <View style={styles.formSection}>
          <Typography size="sm" weight="bold" color="#666" style={styles.label}>
            NAME
          </Typography>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter your name"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.formSection}>
          <Typography size="sm" weight="bold" color="#666" style={styles.label}>
            PHONE
          </Typography>
          <View style={styles.input}>
            <Typography size="md" color="#666">
              {currentUser?.phone || 'Not set'}
            </Typography>
          </View>
          <Typography size="xs" color="#999" style={{ marginTop: 4 }}>
            Phone number cannot be changed
          </Typography>
        </View>

        <View style={styles.formSection}>
          <Typography size="sm" weight="bold" color="#666" style={styles.label}>
            EMAIL
          </Typography>
          <View style={styles.input}>
            <Typography size="md" color="#666">
              {currentUser?.email || 'Not set'}
            </Typography>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 4,
  },
  content: {
    padding: SPACING.md,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formSection: {
    marginBottom: SPACING.lg,
  },
  label: {
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: SPACING.md,
    fontSize: 16,
    color: '#333',
  },
});

export default EditProfileScreen;
