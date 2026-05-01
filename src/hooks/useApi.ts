// API Hook with Retry Logic
import { useState, useCallback } from 'react';

interface UseApiOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
  retries?: number;
}

interface UseApiReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: () => Promise<T | null>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

export function useApi<T>(
  apiFunction: () => Promise<{ success: boolean; data?: T; error?: string }>,
  options?: UseApiOptions<T>
): UseApiReturn<T> {
  const { onSuccess, onError, retries = 2 } = options || {};
  
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await apiFunction();
        
        if (response.success && response.data) {
          setData(response.data);
          setLoading(false);
          onSuccess?.(response.data);
          return response.data;
        } else {
          const errorMsg = response.error || 'Request failed';
          
          // If this is the last attempt, set error
          if (attempt === retries) {
            setError(errorMsg);
            setLoading(false);
            onError?.(errorMsg);
            return null;
          }
          
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      } catch (err: any) {
        const errorMsg = err.response?.data?.error || err.message || 'Request failed';
        
        if (attempt === retries) {
          setError(errorMsg);
          setLoading(false);
          onError?.(errorMsg);
          return null;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
    
    return null;
  }, [apiFunction, retries, onSuccess, onError]);

  return { data, loading, error, execute, setData };
}

// Helper hook for paginated data
export function usePaginatedApi<T>(
  apiFunction: (page: number) => Promise<{ success: boolean; data?: { items: T[]; hasMore: boolean }; error?: string }>,
  options?: UseApiOptions<T[]>
) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    
    setLoading(true);
    try {
      const response = await apiFunction(page);
      
      if (response.success && response.data) {
        setItems(prev => page === 1 ? response.data!.items : [...prev, ...response.data!.items]);
        setHasMore(response.data.hasMore);
        setPage(prev => prev + 1);
      } else {
        setError(response.error || 'Failed to load');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [apiFunction, page, loading, hasMore]);

  const refresh = useCallback(() => {
    setPage(1);
    setItems([]);
    setHasMore(true);
    setError(null);
  }, []);

  return { items, loading, error, hasMore, loadMore, refresh, setItems };
}
