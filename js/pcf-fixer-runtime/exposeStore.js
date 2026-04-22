import { useStore } from './store/useStore.js';

if (typeof window !== 'undefined') {
  window.useStore = useStore;
}
