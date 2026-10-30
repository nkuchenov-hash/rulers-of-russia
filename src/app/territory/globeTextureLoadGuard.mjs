// TextureLoader callbacks can finish after a globe unmount. Never mutate
// a disposed renderer/material; release the late texture instead.
export function createGlobeTextureLoadGuard() {
  let active = true;
  return {
    isActive: () => active,
    accept(texture, apply) {
      if (!active) {
        texture.dispose();
        return false;
      }
      apply();
      return true;
    },
    stop() {
      active = false;
    }
  };
}
