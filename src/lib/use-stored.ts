"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * localStorage tabanlı prototip verisini React'e hidrasyon-güvenli bağlar.
 *
 * Sunucu tarafında null döner (SSR HTML boş durumla üretilir); istemcide ilk
 * okumada loader çalışır ve sonuç önbelleğe alınır, refresh() yeniden okutur.
 * "useEffect içinde senkron setState" kalıbının (react-hooks/set-state-in-effect)
 * yerine geçer. Kalıcılık Postgres'e taşındığında bu hook'un çağrı noktaları
 * sunucu veri yüklemeye dönüşecek — arayüz sözleşmesi bilerek dar tutuldu.
 */
export function useStored<T>(load: () => T): [T | null, () => void] {
  const cache = useRef<{
    ready: boolean;
    value: T | null;
    listeners: Set<() => void>;
  }>({ ready: false, value: null, listeners: new Set() });

  const subscribe = useCallback((cb: () => void) => {
    cache.current.listeners.add(cb);
    return () => {
      cache.current.listeners.delete(cb);
    };
  }, []);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const getSnapshot = useCallback(() => {
    if (!cache.current.ready) {
      cache.current.value = loadRef.current();
      cache.current.ready = true;
    }
    return cache.current.value;
  }, []);

  const refresh = useCallback(() => {
    cache.current.ready = false;
    for (const cb of cache.current.listeners) cb();
  }, []);

  const value = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return [value, refresh];
}
