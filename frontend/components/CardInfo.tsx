import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface CardInfoProps {
  cardData: any;
  isScanning: boolean;
}

export default function CardInfo({ cardData, isScanning }: CardInfoProps) {
  if (isScanning) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Analyzing card with AI...</Text>
        </View>
      </View>
    );
  }

  if (!cardData) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContainer}>
          <Text style={styles.emoji}>🃏</Text>
          <Text style={styles.noCardTitle}>No Card Scanned</Text>
          <Text style={styles.noCardText}>
            Scan a TCG card to see its details and pricing
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Card Details</Text>
      
      <View style={styles.cardDetails}>
        <Text style={styles.cardName}>{cardData.name}</Text>
        <Text style={styles.cardSet}>{cardData.set}</Text>
        
        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Condition</Text>
            <Text style={styles.detailValue}>{cardData.condition || 'Near Mint'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Rarity</Text>
            <Text style={styles.detailValue}>{cardData.rarity || 'Unknown'}</Text>
          </View>
        </View>
      </View>
      
      <View style={styles.priceContainer}>
        <Text style={styles.priceLabel}>Current Price (GBP)</Text>
        <Text style={styles.priceValue}>
          £{cardData.price ? cardData.price.toFixed(2) : '0.00'}
        </Text>
        {cardData.priceChange !== undefined && (
          <Text style={[
            styles.priceChange,
            cardData.priceChange >= 0 ? styles.priceChangeUp : styles.priceChangeDown
          ]}>
            {cardData.priceChange >= 0 ? '↑' : '↓'} {Math.abs(cardData.priceChange).toFixed(2)}% 
            {cardData.priceChange >= 0 ? ' increase' : ' decrease'}
          </Text>
        )}
      </View>
      
      {cardData.marketPrices && cardData.marketPrices.length > 0 && (
        <View style={styles.marketContainer}>
          <Text style={styles.marketTitle}>Market Prices</Text>
          {cardData.marketPrices.map((market: any, index: number) => (
            <View key={index} style={styles.marketRow}>
              <Text style={styles.marketName}>{market.market}</Text>
              <Text style={styles.marketPrice}>£{market.price.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    color: '#6C757D',
    fontSize: 16,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  noCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 8,
  },
  noCardText: {
    fontSize: 14,
    color: '#6C757D',
    textAlign: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
  },
  cardDetails: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  cardName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212529',
    marginBottom: 4,
  },
  cardSet: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 16,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#6C757D',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#343A40',
  },
  priceContainer: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  priceLabel: {
    fontSize: 12,
    color: '#DBEAFE',
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  priceChange: {
    fontSize: 14,
    marginTop: 8,
  },
  priceChangeUp: {
    color: '#86EFAC',
  },
  priceChangeDown: {
    color: '#FCA5A5',
  },
  marketContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
  },
  marketTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 12,
  },
  marketRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  marketName: {
    fontSize: 14,
    color: '#6C757D',
  },
  marketPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
  },
});
