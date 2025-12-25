import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { LogOut, User, Camera, Trash2 } from 'lucide-react-native';
import { useTheme } from '@/lib/contexts/theme.context';
import { useAuth } from '@/lib/contexts/auth.context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { UserRepository } from '@/lib/repositories/user.repository';

export default function InventoryProfileScreen() {
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();

  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const loadProfileImage = useCallback(async () => {
    if (!user?.id) return;
    try {
      const userRepo = new UserRepository();
      const userData = await userRepo.findById(user.id);
      if (userData && (userData as any).profile_image_uri) {
        setProfileImageUri((userData as any).profile_image_uri);
      }
    } catch (error) {
      console.error('[Profile] Load image error:', error);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadProfileImage();
    }, [loadProfileImage])
  );

  const requestPermissions = async (type: 'camera' | 'library'): Promise<boolean> => {
    if (Platform.OS === 'web') {
      return true;
    }

    try {
      if (type === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Camera permission is required to take photos');
          return false;
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Required', 'Photo library permission is required to select photos');
          return false;
        }
      }
      return true;
    } catch (error) {
      console.error('[Profile] Permission error:', error);
      return false;
    }
  };

  const handleImagePicked = async (result: ImagePicker.ImagePickerResult) => {
    if (!user?.id) return;
    if (result.canceled) return;

    try {
      setIsLoading(true);
      const asset = result.assets[0];
      let finalUri: string;

      if (Platform.OS === 'web') {
        console.log('[Profile] Web platform: using picked URI directly');
        finalUri = asset.uri;
      } else {
        const FS = FileSystem as typeof FileSystem & {
          documentDirectory: string | null;
          cacheDirectory: string | null;
        };
        const baseDir = FS.documentDirectory ?? FS.cacheDirectory;
        if (!baseDir) {
          console.error('[Profile] Storage not available');
          Alert.alert('Error', 'Storage not available. Please try again.');
          return;
        }
        
        console.log('[Profile] Base directory:', baseDir);
        
        const dir = `${baseDir}profile_pics/`;
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        console.log('[Profile] Directory ensured');

        console.log('[Profile] Normalizing image with ImageManipulator...');
        const normalized = await ImageManipulator.manipulateAsync(
          asset.uri,
          [],
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );
        console.log('[Profile] Image normalized:', normalized.uri);

        const destUri = `${dir}${user.id}.jpg`;
        console.log('[Profile] Destination path:', destUri);

        try {
          await FileSystem.deleteAsync(destUri, { idempotent: true });
          console.log('[Profile] Deleted old file if existed');
        } catch {
          console.log('[Profile] No old file to delete (expected)');
        }

        await FileSystem.copyAsync({ from: normalized.uri, to: destUri });
        console.log('[Profile] File copied successfully');

        const fileInfo = await FileSystem.getInfoAsync(destUri);
        if (!fileInfo.exists) {
          throw new Error('File was not saved properly');
        }
        console.log('[Profile] File verified, size:', (fileInfo as any).size);
        finalUri = destUri;
      }

      const userRepo = new UserRepository();
      await userRepo.updateProfileImage(user.id, finalUri, user.id);
      setProfileImageUri(finalUri);
      Alert.alert('Success', 'Profile picture updated');
    } catch (error: any) {
      console.error('[Profile] Image save error:', error);
      Alert.alert('Error', error.message || 'Failed to save profile picture. Report to Developer.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTakePhoto = async () => {
    const hasPermission = await requestPermissions('camera');
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      await handleImagePicked(result);
    } catch (error) {
      console.error('[Profile] Camera error:', error);
    }
  };

  const handlePickFromLibrary = async () => {
    const hasPermission = await requestPermissions('library');
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      await handleImagePicked(result);
    } catch (error) {
      console.error('[Profile] Library error:', error);
    }
  };

  const handleDeleteProfilePicture = () => {
    Alert.alert(
      'Delete Profile Picture',
      'Are you sure you want to delete your profile picture?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            try {
              setIsLoading(true);
              
              if (profileImageUri && Platform.OS !== 'web') {
                try {
                  const fileInfo = await FileSystem.getInfoAsync(profileImageUri);
                  if (fileInfo.exists) {
                    await FileSystem.deleteAsync(profileImageUri);
                  }
                } catch (err) {
                  console.warn('[Profile] Could not delete file:', err);
                }
              }

              const userRepo = new UserRepository();
              await userRepo.updateProfileImage(user.id, null, user.id);
              setProfileImageUri(null);
              Alert.alert('Success', 'Profile picture deleted');
            } catch (error: any) {
              console.error('[Profile] Delete error:', error);
              Alert.alert('Error', error.message || 'Failed to delete profile picture');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const showImageOptions = () => {
    Alert.alert(
      'Profile Picture',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: handleTakePhoto,
        },
        {
          text: 'Choose from Library',
          onPress: handlePickFromLibrary,
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/');
        },
      },
    ]);
  };

  if (!user) {
    return null;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <View style={styles.iconContainer}>
          <TouchableOpacity onPress={showImageOptions} disabled={isLoading}>
            {profileImageUri ? (
              <Image
                source={{ uri: profileImageUri }}
                style={styles.profileImage}
              />
            ) : (
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: theme.primary + '20' },
                ]}
              >
                <User size={32} color={theme.primary} />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.imageActions}>
            <TouchableOpacity
              style={[styles.imageActionButton, { backgroundColor: theme.primary }]}
              onPress={showImageOptions}
              disabled={isLoading}
            >
              <Camera size={16} color="#fff" />
            </TouchableOpacity>
            {profileImageUri && (
              <TouchableOpacity
                style={[styles.imageActionButton, { backgroundColor: theme.error }]}
                onPress={handleDeleteProfilePicture}
                disabled={isLoading}
              >
                <Trash2 size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <Text style={[styles.name, { color: theme.text }]}>{user.name}</Text>
        <Text style={[styles.role, { color: theme.textSecondary }]}>
          {user.role === 'inventory_clerk' ? 'Inventory Clerk' : user.role}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Account
        </Text>
        <TouchableOpacity
          style={[styles.menuItem, { borderBottomColor: theme.border }]}
          onPress={handleLogout}
        >
          <View style={styles.menuItemLeft}>
            <LogOut size={20} color={theme.error} />
            <Text style={[styles.menuItemText, { color: theme.error }]}>
              Logout
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  imageActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  imageActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 24,
    fontWeight: '700' as const,
    textAlign: 'center',
    marginBottom: 4,
  },
  role: {
    fontSize: 16,
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
});
