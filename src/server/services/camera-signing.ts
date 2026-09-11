import { createHmac, timingSafeEqual } from "node:crypto";

export class CameraUrlSigner {
  public constructor(
    private readonly publicBaseUrl: string,
    private readonly secret: string,
    private readonly ttlSeconds: number,
  ) {}

  public sign(bayId: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
    const expires = nowSeconds + this.ttlSeconds;
    const signature = this.signature(bayId, expires);
    return `${this.publicBaseUrl}/api/cameras/${encodeURIComponent(bayId)}?exp=${expires}&sig=${encodeURIComponent(signature)}`;
  }

  public verify(
    bayId: string,
    expiresValue: string | undefined,
    signatureValue: string | undefined,
    nowSeconds = Math.floor(Date.now() / 1000),
  ): boolean {
    if (!expiresValue || !signatureValue) return false;
    const expires = Number.parseInt(expiresValue, 10);
    if (!Number.isFinite(expires) || expires < nowSeconds) return false;

    const expected = Buffer.from(this.signature(bayId, expires));
    const actual = Buffer.from(signatureValue);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private signature(bayId: string, expires: number): string {
    return createHmac("sha256", this.secret)
      .update(`${bayId}.${expires}`)
      .digest("base64url");
  }
}
