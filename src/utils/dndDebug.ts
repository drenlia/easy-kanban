import { feDebug } from './clientDebug';

/** Drag/reorder traces when FE_DEBUG_DND is enabled in tenant settings. */
export function dndLog(...args: unknown[]): void {
  if (feDebug('FE_DEBUG_DND')) {
    console.log(...args);
  }
}
