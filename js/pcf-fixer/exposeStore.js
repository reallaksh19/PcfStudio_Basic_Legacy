import { useStore } from './store/useStore';

if (typeof window !== 'undefined') {
  window.useStore = useStore;
}
