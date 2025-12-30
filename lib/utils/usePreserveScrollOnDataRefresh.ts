import { useRef, useCallback } from 'react';
import { ScrollView, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

interface ScrollPosition {
  offset: number;
  timestamp: number;
}

export function usePreserveScrollOnDataRefresh(isModalOpen: boolean = false) {
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef<ScrollPosition>({ offset: 0, timestamp: 0 });
  const isRestoringRef = useRef(false);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!isRestoringRef.current) {
      scrollPositionRef.current = {
        offset: event.nativeEvent.contentOffset.y,
        timestamp: Date.now(),
      };
    }
  }, []);

  const restoreScrollPosition = useCallback(() => {
    if (scrollViewRef.current && !isModalOpen) {
      const { offset, timestamp } = scrollPositionRef.current;
      const age = Date.now() - timestamp;
      
      if (age < 2000 && offset > 0) {
        isRestoringRef.current = true;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollViewRef.current?.scrollTo({
              y: offset,
              animated: false,
            });
            setTimeout(() => {
              isRestoringRef.current = false;
            }, 100);
          });
        });
      }
    }
  }, [isModalOpen]);

  const wrapDataLoader = useCallback(
    async <T,>(dataLoader: () => Promise<T>): Promise<T> => {
      if (isModalOpen) {
        return dataLoader();
      }

      const result = await dataLoader();
      restoreScrollPosition();
      return result;
    },
    [restoreScrollPosition, isModalOpen]
  );

  return {
    scrollViewRef,
    handleScroll,
    wrapDataLoader,
  };
}
