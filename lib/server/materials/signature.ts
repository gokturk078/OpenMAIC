import { DOCUMENT_MIME_TYPES as mime } from '@/lib/document/mime';

/** Validate the original bytes before a declared format enters its extractor. */
export function matchesMaterialType(data: Buffer, type: string): boolean {
  const tag = (signature: string, offset = 0) =>
    data.subarray(offset, offset + signature.length).toString('latin1') === signature;
  if (type === mime.pdf) return data.subarray(0, 1024).includes(Buffer.from('%PDF-'));
  if (type === mime.png) return tag('\x89PNG\r\n\x1a\n');
  if (type === mime.jpeg) return tag('\xff\xd8\xff');
  if (type === mime.webp) return tag('RIFF') && tag('WEBP', 8);
  if (type === mime.wav) return tag('RIFF') && tag('WAVE', 8);
  if (type === mime.mp3) return tag('ID3') || (data[0] === 255 && (data[1] & 224) === 224);
  if (type === mime.aac) return data[0] === 255 && (data[1] & 246) === 240;
  if (type === mime.webm || type === 'audio/webm') return tag('\x1a\x45\xdf\xa3');
  if (type === mime.mp4 || type === mime.m4a || type === mime.mov) {
    return (
      tag('ftyp', 4) || (type === mime.mov && (tag('moov', 4) || tag('mdat', 4) || tag('wide', 4)))
    );
  }
  const officePart =
    type === mime.docx
      ? 'word/document.xml'
      : type === mime.pptx
        ? 'ppt/presentation.xml'
        : type === mime.xlsx
          ? 'xl/workbook.xml'
          : null;
  if (officePart)
    return (
      tag('PK\x03\x04') &&
      data.includes(Buffer.from('[Content_Types].xml')) &&
      data.includes(Buffer.from(officePart))
    );
  if (type === mime.txt || type === mime.markdown || type === mime.csv) {
    if (data.includes(0)) return false;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(data);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
