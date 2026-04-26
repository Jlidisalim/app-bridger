// Performance optimized PaginatedList component with infinite scrolling
import React, { useCallback, useState } from 'react';
import { 
  FlatList, 
  View, 
  ActivityIndicator, 
  StyleSheet, 
  RefreshControl,
  ListRenderItem 
} from 'react-native';

interface PaginatedListProps<T> {
  data: T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  onLoadMore?: () => Promise<void>;
  onRefresh?: () => Promise<void>;
  hasMore: boolean;
  loading?: boolean;
  refreshing?: boolean;
  ListEmptyComponent?: React.ComponentType | React.ReactElement;
  ListFooterComponent?: React.ComponentType | React.ReactElement;
  initialNumToRender?: number;
  maxToRenderPerBatch?: number;
  windowSize?: number;
  removeClippedSubviews?: boolean;
}

export function PaginatedList<T>({
  data,
  renderItem,
  keyExtractor,
  onLoadMore,
  onRefresh,
  hasMore,
  loading = false,
  refreshing = false,
  ListEmptyComponent,
  ListFooterComponent,
  initialNumToRender = 10,
  maxToRenderPerBatch = 10,
  windowSize = 10,
  removeClippedSubviews = true,
}: PaginatedListProps<T>) {
  const [localLoading, setLocalLoading] = useState(false);

  const handleLoadMore = useCallback(async () => {
    if (localLoading || !hasMore || !onLoadMore) return;
    
    setLocalLoading(true);
    try {
      await onLoadMore();
    } finally {
      setLocalLoading(false);
    }
  }, [localLoading, hasMore, onLoadMore]);

  const renderFooter = useCallback(() => {
    if (!hasMore) return null;
    
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  }, [hasMore]);

  return (
    <FlatList
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.5}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#007AFF"
            colors={['#007AFF']}
          />
        ) : undefined
      }
      ListFooterComponent={ListFooterComponent || renderFooter}
      ListEmptyComponent={ListEmptyComponent}
      initialNumToRender={initialNumToRender}
      maxToRenderPerBatch={maxToRenderPerBatch}
      windowSize={windowSize}
      removeClippedSubviews={removeClippedSubviews}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={data.length === 0 ? styles.emptyContainer : undefined}
    />
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyContainer: {
    flexGrow: 1,
  },
});

export default PaginatedList;
