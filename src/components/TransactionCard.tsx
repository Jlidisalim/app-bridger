// Performance optimized TransactionCard component with React.memo
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Transaction } from '../types';
import { useUserCurrency } from '../utils/currency';

interface TransactionCardProps {
  transaction: Transaction;
}

// Custom comparison function for memo
const areEqual = (prevProps: { transaction: Transaction }, nextProps: { transaction: Transaction }) => {
  return (
    prevProps.transaction.id === nextProps.transaction.id &&
    prevProps.transaction.status === nextProps.transaction.status &&
    prevProps.transaction.amount === nextProps.transaction.amount
  );
};

const TransactionCardComponent: React.FC<TransactionCardProps> = ({ transaction }) => {
  const currency = useUserCurrency();
  const isCredit = transaction.type === 'credit';
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed': return '#34C759';
      case 'Processing': return '#FF9500';
      case 'Failed': return '#FF3B30';
      default: return '#8E8E93';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        <View style={[styles.iconContainer, { backgroundColor: isCredit ? '#E8F5E9' : '#FFEBEE' }]}>
          <Text style={[styles.icon, { color: isCredit ? '#34C759' : '#FF3B30' }]}>
            {isCredit ? '↑' : '↓'}
          </Text>
        </View>
        <View style={styles.details}>
          <Text style={styles.label} numberOfLines={1}>{transaction.label}</Text>
          <Text style={styles.description} numberOfLines={1}>{transaction.description}</Text>
          <Text style={[styles.status, { color: getStatusColor(transaction.status) }]}>
            {transaction.status}
          </Text>
        </View>
      </View>
      <View style={styles.rightSection}>
        <Text style={[styles.amount, { color: isCredit ? '#34C759' : '#FF3B30' }]}>
          {isCredit ? '+' : '-'}{currency.symbol}{transaction.amount.toFixed(2)}
        </Text>
        <Text style={styles.date}>{transaction.date}</Text>
      </View>
    </View>
  );
};

// Memoize with custom comparison
export const TransactionCard = memo(TransactionCardComponent, areEqual);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 20,
    fontWeight: '700',
  },
  details: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  description: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  status: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  rightSection: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
  },
  date: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 4,
  },
});

export default TransactionCard;
