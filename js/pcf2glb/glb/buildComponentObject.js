import * as THREE from 'three';
import { buildPipeMesh } from './buildPipeMesh.js';

function baseProxyMesh(comp, color, geom) {
  const mat = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = comp.id;
  mesh.userData = {
    pcfType: comp.type,
    pcfId: comp.id,
    refNo: comp.refNo || '',
    bore: comp.bore || null,
  };
  return mesh;
}

export function buildReducerMesh(comp) {
  const p1 = new THREE.Vector3(comp.ep1.x, comp.ep1.y, comp.ep1.z);
  const p2 = new THREE.Vector3(comp.ep2.x, comp.ep2.y, comp.ep2.z);
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const length = dir.length();

  // Use parsed branch bore or default to 0.7 * primary bore
  const r1 = Math.max((comp.bore || 10) / 2, 0.5);
  const r2 = Math.max((comp.branchBore || comp.bore || 10) / 2, 0.5) * 0.7;

  const geom = new THREE.CylinderGeometry(r1, r2, length, 16);
  const mesh = baseProxyMesh(comp, 0xaaaaaa, geom);

  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  mesh.position.copy(mid);
  if (dir.lengthSq() > 0) {
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  }

  return mesh;
}

export function buildBendMesh(comp, log) {
  // A simplistic bend proxy: A sphere at the center point (if cp exists) or midway
  const r = Math.max((comp.bore || 10) / 2, 0.5) * 1.5;
  const geom = new THREE.SphereGeometry(r, 16, 16);
  const mesh = baseProxyMesh(comp, 0x44aaff, geom);

  let cp = comp.cp;
  if (!cp && comp.ep1 && comp.ep2) {
    cp = new THREE.Vector3().addVectors(comp.ep1, comp.ep2).multiplyScalar(0.5);
  }
  if (cp) {
    mesh.position.set(cp.x, cp.y, cp.z);
  }
  return mesh;
}

export function buildTeeGroup(comp, log) {
  // Tee proxy: Just a sphere at the center point
  const r = Math.max((comp.bore || 10) / 2, 0.5) * 1.2;
  const geom = new THREE.SphereGeometry(r, 16, 16);
  const mesh = baseProxyMesh(comp, 0x44ffaa, geom);
  if (comp.cp) {
    mesh.position.set(comp.cp.x, comp.cp.y, comp.cp.z);
  } else if (comp.ep1 && comp.ep2) {
    const mid = new THREE.Vector3().addVectors(comp.ep1, comp.ep2).multiplyScalar(0.5);
    mesh.position.copy(mid);
  }
  return mesh;
}

export function buildValveProxy(comp) {
  // Valve proxy: A small box at the center point
  const s = Math.max((comp.bore || 10), 1.0) * 1.5;
  const geom = new THREE.BoxGeometry(s, s, s);
  const mesh = baseProxyMesh(comp, 0xff44aa, geom);
  if (comp.ep1 && comp.ep2) {
    const mid = new THREE.Vector3().addVectors(comp.ep1, comp.ep2).multiplyScalar(0.5);
    mesh.position.copy(mid);
    const dir = new THREE.Vector3().subVectors(comp.ep2, comp.ep1);
    if (dir.lengthSq() > 0) {
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    }
  }
  return mesh;
}

export function buildFlangeProxy(comp) {
  // Flange proxy: A short, thick cylinder
  const radius = Math.max((comp.bore || 10) / 2, 0.5) * 1.5;
  const length = 10; // 10mm thick
  const geom = new THREE.CylinderGeometry(radius, radius, length, 16);
  const mesh = baseProxyMesh(comp, 0xffff44, geom);

  if (comp.ep1 && comp.ep2) {
    const mid = new THREE.Vector3().addVectors(comp.ep1, comp.ep2).multiplyScalar(0.5);
    mesh.position.copy(mid);
    const dir = new THREE.Vector3().subVectors(comp.ep2, comp.ep1);
    if (dir.lengthSq() > 0) {
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    }
  } else if (comp.ep1) {
    mesh.position.set(comp.ep1.x, comp.ep1.y, comp.ep1.z);
  }

  return mesh;
}

export function buildSupportProxy(comp) {
  // Support proxy: wireframe box or simply a box
  const s = Math.max((comp.bore || 10), 1.0) * 2;
  const geom = new THREE.BoxGeometry(s, s, s);
  const mesh = baseProxyMesh(comp, 0xffaa44, geom);
  // Supports typically have a CO-ORDS instead of END-POINT, but our normalize model falls back to ep1/cp.
  const loc = comp.cp || comp.ep1;
  if (loc) {
    mesh.position.set(loc.x, loc.y, loc.z);
  }
  return mesh;
}

export function buildComponentObject(comp, log) {
  switch (comp.type) {
    case 'PIPE': return buildPipeMesh(comp);
    case 'REDUCER': return buildReducerMesh(comp);
    case 'BEND': return buildBendMesh(comp, log);
    case 'TEE': return buildTeeGroup(comp, log);
    case 'VALVE': return buildValveProxy(comp);
    case 'FLANGE': return buildFlangeProxy(comp);
    case 'SUPPORT': return buildSupportProxy(comp);
    default:
      log.warn('UNSUPPORTED_COMPONENT_TYPE', {
        id: comp.id,
        type: comp.type,
      });
      // Fallback
      return buildSupportProxy(comp);
  }
}
