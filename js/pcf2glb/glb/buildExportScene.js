import * as THREE from 'three';
import { buildComponentObject } from './buildComponentObject.js';

export function buildExportScene(model, log) {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'PCF_EXPORT_ROOT';
  scene.add(root);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(100, 1000, 100);
  scene.add(ambientLight);
  scene.add(dirLight);

  for (const comp of model.components) {
    try {
      const mesh = buildComponentObject(comp, log);
      if (mesh) root.add(mesh);
    } catch (err) {
      log.error('COMPONENT_BUILD_FAILED', {
        id: comp.id,
        message: String(err?.message || err),
      });
    }
  }

  log.info('SCENE_BUILT', { nodes: root.children.length });
  return scene;
}
