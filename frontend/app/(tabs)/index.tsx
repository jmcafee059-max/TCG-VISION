import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import CameraFeed from '@/components/CameraFeed';
import CardInfo from '@/components/CardInfo';

export default function HomeScreen() {
  const [cardData, setCardData] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);

  const handleCardIdentified = (data: any) => {
    setCardData(data);
    setIsScanning(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>TCG Vision</Text>
          <Text style={styles.subtitle}>Live card scanner with real-time pricing</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.cardContainer}>
            <CameraFeed 
              onCardIdentified={handleCardIdentified}
              isScanning={isScanning}
              setIsScanning={setIsScanning}
            />
          </View>

          <View style={styles.cardContainer}>
            <CardInfo cardData={cardData} isScanning={isScanning} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E9ECEF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6C757D',
  },
  content: {
    gap: 24,
  },
  cardContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#DEE2E6',
  },
});
