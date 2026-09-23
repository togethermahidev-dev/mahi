/**
 * The version line: `v{runtime} {build}.{ota}`, e.g. `v0.1.0 10.09`.
 * The `v` number is the runtime (which OTAs can reach this phone), the build is the installed
 * binary, the OTA counter proves which update is running. Pure, so it is unit-tested.
 */
export function formatVersionLine(
  runtime: string,
  build: string | number | null,
  ota: number
): string {
  return `v${runtime} ${build ?? '?'}.${String(ota).padStart(2, '0')}`;
}
