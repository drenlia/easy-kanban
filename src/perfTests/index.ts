/** True when the Performance Test Overlay should mount (setting on + admin). */
export function shouldShowPerfTests(
  settings: Record<string, string | undefined> | null | undefined,
  user: { roles?: string[] } | null | undefined
): boolean {
  if (!settings || settings.FE_PERF_TESTS !== 'true') return false;
  if (!user?.roles?.includes('admin')) return false;
  return true;
}

export { memberDisplayName } from './lorem';
