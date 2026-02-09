import { open } from "node:fs/promises";

const QCOW2_MAGIC = 0x514649fb;

export async function isQcow2Image(path: string): Promise<boolean> {
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(4);
    const { bytesRead } = await fh.read(buf, 0, 4, 0);
    return bytesRead === 4 && buf.readUInt32BE(0) === QCOW2_MAGIC;
  } finally {
    await fh.close();
  }
}
