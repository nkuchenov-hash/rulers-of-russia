'use client';

import * as THREE from 'three';

const PATCH_FLAG = Symbol.for('rulers-of-russia.country-label-grounding-v1');
const proto = THREE.Object3D.prototype;

if (!proto[PATCH_FLAG]) {
  const originalAdd = proto.add;
  proto.add = function groundedCountryLabelAdd(...objects) {
    for (const object of objects) {
      if (object?.userData?.kind !== 'country') continue;
      if (object.position?.length?.() > 0) object.position.setLength(1.0007);
      if (object.element) {
        object.element.style.textShadow = '0 1px 1px rgba(2,7,9,.92), 0 0 2px rgba(2,7,9,.55)';
      }
    }
    return originalAdd.apply(this, objects);
  };
  proto[PATCH_FLAG] = true;
}
