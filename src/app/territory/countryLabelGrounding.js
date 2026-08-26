'use client';

import * as THREE from 'three';
import {CSS2DRenderer} from 'three/examples/jsm/renderers/CSS2DRenderer.js';

const PATCH_FLAG = Symbol.for('rulers-of-russia.country-label-grounding-v2');
const RENDER_PATCH_FLAG = Symbol.for('rulers-of-russia.country-label-visibility-v2');
const SURFACE_RADIUS = 1.0014;

function tuneCountryLabel(object) {
  if (object?.userData?.kind !== 'country') return;
  if (object.position?.length?.() > 0) object.position.setLength(SURFACE_RADIUS);
  if (object.element) {
    object.element.dataset.countryLabel = 'true';
    object.element.style.textShadow = '0 1px 1px rgba(2,7,9,.88), 0 0 1px rgba(2,7,9,.42)';
  }
}

function applyCountryVisibility(scene, camera) {
  const distance = Math.max(camera.position.length(), 1.001);
  const countryMin = distance > 2.2 ? 0.018 : distance > 1.72 ? 0.006 : distance > 1.38 ? 0.0018 : 0.0002;
  const cx = camera.position.x;
  const cy = camera.position.y;
  const cz = camera.position.z;
  const horizon = Math.min(0.995, 1 / distance + 0.0015);

  scene.traverse((object) => {
    if (object?.userData?.kind !== 'country') return;
    tuneCountryLabel(object);
    const px = object.position.x;
    const py = object.position.y;
    const pz = object.position.z;
    const pLength = Math.max(0.0001, Math.hypot(px, py, pz));
    const facing = (px * cx + py * cy + pz * cz) / (pLength * distance);
    object.visible = Number(object.userData.area || 0) >= countryMin && facing > horizon;
  });
}

const objectProto = THREE.Object3D.prototype;
if (!objectProto[PATCH_FLAG]) {
  const originalAdd = objectProto.add;
  objectProto.add = function groundedCountryLabelAdd(...objects) {
    for (const object of objects) tuneCountryLabel(object);
    return originalAdd.apply(this, objects);
  };
  objectProto[PATCH_FLAG] = true;
}

const css2dProto = CSS2DRenderer.prototype;
if (!css2dProto[RENDER_PATCH_FLAG]) {
  const previousDescriptor = Object.getOwnPropertyDescriptor(css2dProto, 'render');
  if (previousDescriptor?.set) {
    Object.defineProperty(css2dProto, 'render', {
      configurable: true,
      get: previousDescriptor.get,
      set(originalRender) {
        const countryAwareRender = function countryAwareRender(scene, camera) {
          applyCountryVisibility(scene, camera);
          return originalRender.call(this, scene, camera);
        };
        return previousDescriptor.set.call(this, countryAwareRender);
      },
    });
  }
  css2dProto[RENDER_PATCH_FLAG] = true;
}
