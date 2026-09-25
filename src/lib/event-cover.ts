import { MAX_COVER_BYTES, secureImageUrl } from "./event-draft";

export function coverBytes(value: string): Buffer | null {
  const prefix = "data:image/jpeg;base64,";
  if (
    !value.startsWith(prefix) ||
    value.length > prefix.length + Math.ceil(MAX_COVER_BYTES / 3) * 4
  )
    return null;
  const encoded = value.slice(prefix.length);
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded,
    )
  )
    return null;
  const bytes = Buffer.from(encoded, "base64");
  if (
    bytes.length < 5 ||
    bytes.length > MAX_COVER_BYTES ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  )
    return null;
  return bytes;
}

export function validCover(value: string): boolean {
  return value === "" || secureImageUrl(value) || coverBytes(value) !== null;
}
