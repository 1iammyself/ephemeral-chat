import { registerPlugin } from '@capacitor/core';

// Phase 3 — native plugin implemented in KeystorePlugin.java
export const KeystorePlugin = registerPlugin('Keystore');
// Phase 4 — native plugin implemented in IntegrityPlugin.java
export const IntegrityPlugin = registerPlugin('Integrity');
// Phase 2 — native plugin implemented in BiometricPlugin.java (active)
export const BiometricPlugin = registerPlugin('Biometric');
