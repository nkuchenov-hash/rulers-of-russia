'use client';

import * as THREE from 'three';

const PATCH_KEY = Symbol.for('rulers-of-russia.atlas-cinematic-patch.v1');
const SUN_DIRECTION = new THREE.Vector3(-4.8, 2.8, 3.5).normalize();

function isAtlasLab() {
  return typeof window !== 'undefined' && window.location.pathname.includes('/territory/atlas-lab');
}

function makeAtmosphereMaterial({ intensity, power, warmBoost }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uSunDirection: { value: SUN_DIRECTION.clone() },
      uIntensity: { value: intensity },
      uPower: { value: power },
      uWarmBoost: { value: warmBoost },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform float uIntensity;
      uniform float uPower;
      uniform float uWarmBoost;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 n = normalize(vWorldNormal);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float facing = max(dot(n, viewDirection), 0.0);
        float fresnel = pow(1.0 - facing, uPower);

        float sunDot = dot(n, normalize(uSunDirection));
        float daylight = smoothstep(-0.18, 0.58, sunDot);
        float sunset = pow(smoothstep(-0.08, 0.68, sunDot), 1.55);

        vec3 cold = vec3(0.24, 0.57, 0.72);
        vec3 pearl = vec3(0.72, 0.87, 0.89);
        vec3 warm = vec3(1.0, 0.61, 0.27);
        vec3 colour = mix(cold, pearl, daylight * 0.42);
        colour = mix(colour, warm, sunset * uWarmBoost);

        float alpha = fresnel * uIntensity * (0.34 + daylight * 0.66);
        alpha += fresnel * fresnel * sunset * uIntensity * 0.30;
        gl_FragColor = vec4(colour, alpha);
      }
    `,
  });
}

function addAtmosphere(scene) {
  if (scene.userData.__atlasAtmosphere) return;

  const coreGeometry = new THREE.SphereGeometry(1.017, 160, 104);
  const coreMaterial = makeAtmosphereMaterial({ intensity: 0.82, power: 3.9, warmBoost: 0.82 });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.renderOrder = 2;
  core.frustumCulled = false;
  core.userData.kind = 'atlas-atmosphere-core';

  const haloGeometry = new THREE.SphereGeometry(1.052, 128, 88);
  const haloMaterial = makeAtmosphereMaterial({ intensity: 0.30, power: 2.15, warmBoost: 0.72 });
  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  halo.renderOrder = 1;
  halo.frustumCulled = false;
  halo.userData.kind = 'atlas-atmosphere-halo';

  scene.userData.__atlasAtmosphere = { core, halo };
  patchState.originalSceneAdd.call(scene, halo, core);
}

function tuneAddedObject(scene, object) {
  if (!object) return;

  if (object.isHemisphereLight) {
    object.color.setHex(0xb9cbc8);
    object.groundColor.setHex(0x06100f);
    object.intensity = 0.28;
    return;
  }

  if (object.isAmbientLight) {
    object.color.setHex(0x697773);
    object.intensity = 0.055;
    return;
  }

  if (object.isDirectionalLight) {
    if (object.intensity > 1) {
      object.color.setHex(0xffd4a0);
      object.intensity = 3.25;
      object.position.set(-4.8, 2.8, 3.5);
    } else {
      object.color.setHex(0x7c9fa4);
      object.intensity = 0.16;
    }
    return;
  }

  const radius = object.geometry?.parameters?.radius;
  if (!Number.isFinite(radius)) return;

  if (object.isMesh && object.material?.isMeshStandardMaterial && Math.abs(radius - 1) < 0.002) {
    object.material.roughness = 0.88;
    object.material.metalness = 0;
    object.material.emissive.setHex(0x050908);
    object.material.emissiveIntensity = 0.055;
    object.material.needsUpdate = true;
    addAtmosphere(scene);
    return;
  }

  if (object.isMesh && object.material?.isMeshBasicMaterial && Math.abs(radius - 1.0003) < 0.002) {
    object.material.opacity = Math.min(object.material.opacity, 0.36);
  }
}

const existing = globalThis[PATCH_KEY];
const patchState = existing || {
  originalSceneAdd: THREE.Scene.prototype.add,
};

if (!existing) {
  const originalSceneAdd = patchState.originalSceneAdd;
  THREE.Scene.prototype.add = function atlasCinematicSceneAdd(...objects) {
    const result = originalSceneAdd.apply(this, objects);
    if (!isAtlasLab()) return result;
    for (const object of objects) tuneAddedObject(this, object);
    return result;
  };
  globalThis[PATCH_KEY] = patchState;
}
