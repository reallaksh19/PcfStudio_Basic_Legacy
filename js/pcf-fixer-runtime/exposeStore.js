import { useStore } from '/js/pcf-fixer-runtime/store/useStore.js';

if (typeof window !== 'undefined') {
  window.useStore = useStore;
}
