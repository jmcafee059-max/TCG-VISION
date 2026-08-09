import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface CameraFeedProps {
  onCardIdentified: (data: any) => void;
  isScanning: boolean;
  setIsScanning: (scanning: boolean) => void;
}

export default function CameraFeed({ onCardIdentified, isScanning, setIsScanning }: CameraFeedProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your camera permission to scan cards</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const captureAndScan = async () => {
    if (!cameraRef.current) return;

    setIsScanning(true);
    
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });

      if (photo && photo.base64) {
        const response = await fetch('http://localhost:3000/api/scan-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: `data:image/jpeg;base64,${photo.base64}` }),
        });
        
        const data = await response.json();
        if (data.success) {
          onCardIdentified(data.cardData);
        } else {
          Alert.alert('Error', 'Failed to identify card. Please try again.');
          setIsScanning(false);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Error scanning card. Please try again.');
      setIsScanning(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Camera Feed</Text>
      
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        {isScanning && (
          <View style={styles.scanningOverlay}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.scanningText}>Scanning card...</Text>
          </View>
        )}
      </View>
      
      <TouchableOpacity
        style={[styles.button, isScanning && styles.buttonDisabled]}
        onPress={captureAndScan}
        disabled={isScanning}
      >
        <Text style={styles.buttonText}>
          {isScanning ? 'Scanning...' : 'Scan Card'}
        </Text>
      </TouchableOpacity>
      
      <Text style={styles.helperText}>
        Position your TCG card in the frame and tap scan
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
  },
  message: {
    textAlign: 'center',
    color: '#6C757D',
    marginBottom: 16,
  },
  cameraContainer: {
    height: 240,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#212529',
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  scanningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanningText: {
    color: '#FFFFFF',
    fontWeight: '600',
    marginTop: 8,
  },
  button: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  helperText: {
    fontSize: 12,
    color: '#6C757D',
    textAlign: 'center',
  },
});
