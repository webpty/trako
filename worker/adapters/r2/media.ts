import type { MediaStore } from "../../ports";

export class R2Media implements MediaStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, body: ArrayBuffer, contentType: string): Promise<void> {
    await this.bucket.put(key, body, { httpMetadata: { contentType } });
  }

  async get(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;
    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}
