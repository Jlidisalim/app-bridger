// Performance optimized DealCard component with React.memo
import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Deal } from '../types';
import { useUserCurrency } from '../utils/currency';

interface DealCardProps {
  deal: Deal;
  onPress?: (deal: Deal) => void;
}

// Custom comparison function for memo
const areEqual = (prevProps: DealCardProps, nextProps: DealCardProps) => {
  return (
    prevProps.deal.id === nextProps.deal.id &&
    prevProps.deal.status === nextProps.deal.status &&
    prevProps.deal.pricing?.amount === nextProps.deal.pricing?.amount
  );
};

const DealCardComponent: React.FC<DealCardProps> = ({ deal, onPress }) => {
  const currency = useUserCurrency();
  const handlePress = () => {
    onPress?.(deal);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return '#34C759';
      case 'accepted': return '#007AFF';
      case 'in_transit': return '#FF9500';
      case 'arrived': return '#5856D6';
      case 'completed': return '#34C759';
      case 'cancelled': return '#FF3B30';
      case 'disputed': return '#FF3B30';
      default: return '#8E8E93';
    }
  };

  const routeFrom = deal.route?.from || deal.routeString?.split(' → ')?.[0] || '';
  const routeTo = deal.route?.to || deal.routeString?.split(' → ')?.[1] || '';
  const packageWeight = deal.package?.weight ? `${deal.package.weight}kg` : '';
  const packageCategory = deal.package?.category || '';

  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.routeContainer}>
          <Text style={styles.fromCity}>{routeFrom}</Text>
          <Text style={styles.arrow}>→</Text>
          <Text style={styles.toCity}>{routeTo}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(deal.status) }]}>
          <Text style={styles.statusText}>{deal.status}</Text>
        </View>
      </View>

      <Text style={styles.title} numberOfLines={1}>{deal.package?.description || deal.name || 'Package Delivery'}</Text>
      
      {deal.package?.description && (
        <Text style={styles.description} numberOfLines={2}>{deal.package.description}</Text>
      )}

      <View style={styles.footer}>
        <View style={styles.packageInfo}>
          <Text style={styles.packageSize}>{packageCategory}</Text>
          {packageWeight && <Text style={styles.weight}>{packageWeight}</Text>}
        </View>
        <View style={styles.priceContainer}>
          <Text style={styles.price}>{currency.symbol}{deal.pricing?.amount || deal.price || 0}</Text>
          <Text style={styles.currency}>{currency.code}</Text>
        </View>
      </View>

      {deal.package?.image && (
        <Image
          source={{ uri: deal.package.image }}
          style={styles.image}
          resizeMode="cover"
        />
      )}
    </TouchableOpacity>
  );
};

// Memoize with custom comparison
export const DealCard = memo(DealCardComponent, areEqual);

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fromCity: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  arrow: {
    fontSize: 14,
    color: '#8E8E93',
    marginHorizontal: 6,
  },
  toCity: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  packageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  packageSize: {
    fontSize: 12,
    color: '#8E8E93',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  weight: {
    fontSize: 12,
    color: '#8E8E93',
    marginLeft: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 18,
    fontWeight: '700',
    color: '#34C759',
  },
  currency: {
    fontSize: 12,
    color: '#8E8E93',
    marginLeft: 4,
  },
  image: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginTop: 12,
  },
});

export default DealCard;
