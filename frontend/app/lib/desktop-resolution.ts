/** An optional fixed guest size, aligned for QEMU VNC and H.264. */
export function parseDesktopResolution(
  value: string | undefined,
): [number, number] | undefined {
  if (!value?.trim()) return undefined;
  const match = /^(\d+)x(\d+)$/.exec(value.trim());
  const width = Number(match?.[1]);
  const height = Number(match?.[2]);
  if (
    !match ||
    width < 640 ||
    width > 3840 ||
    width % 16 !== 0 ||
    height < 480 ||
    height > 2160 ||
    height % 2 !== 0
  ) {
    throw new Error(
      "VITE_GLISS_RESOLUTION must be WIDTHxHEIGHT: width 640–3840 in multiples of 16, height 480–2160 in multiples of 2",
    );
  }
  return [width, height];
}
