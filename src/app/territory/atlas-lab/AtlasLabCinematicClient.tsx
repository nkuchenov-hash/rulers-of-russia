'use client';

import './atlasCinematicPatch.js';
import { AtlasLabClient } from './AtlasLabClient';
import styles from './atlas-cinematic.module.css';

export function AtlasLabCinematicClient() {
  return (
    <div className={styles.scope}>
      <AtlasLabClient />
    </div>
  );
}
