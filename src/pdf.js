import { drawSlideAsync } from "./renderer.js";
import { SLIDE_SIZE } from "./schema.js";
import { slug } from "./storage.js";

export async function exportDeckToPdf(deck) {
  const images = [];
  const canvas = document.createElement("canvas");
  canvas.width = SLIDE_SIZE.width;
  canvas.height = SLIDE_SIZE.height;
  const ctx = canvas.getContext("2d");

  for (const slide of deck.slides) {
    await drawSlideAsync(ctx, slide, deck, { footer: true });
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    images.push(dataUrlToBytes(dataUrl));
  }

  return {
    blob: buildPdf(images),
    filename: `${slug(deck.title)}.pdf`,
  };
}

function buildPdf(images) {
  const encoder = new TextEncoder();
  const objects = [];

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pageIds = images.map((_, index) => 3 + index * 3);
  addObject(`<< /Type /Pages /Count ${images.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);

  images.forEach((image, index) => {
    const pageId = 3 + index * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${SLIDE_SIZE.width} ${SLIDE_SIZE.height}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    const content = `q\n${SLIDE_SIZE.width} 0 0 ${SLIDE_SIZE.height} 0 0 cm\n/Im${index + 1} Do\nQ`;
    addStreamObject("<< /Length " + encoder.encode(content).length + " >>", encoder.encode(content));
    addStreamObject(
      `<< /Type /XObject /Subtype /Image /Width ${SLIDE_SIZE.width} /Height ${SLIDE_SIZE.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>`,
      image.bytes
    );
  });

  const parts = [encoder.encode("%PDF-1.4\n%HySlides\n")];
  const offsets = [0];
  let length = parts[0].length;

  objects.forEach((object, index) => {
    offsets.push(length);
    const header = encoder.encode(`${index + 1} 0 obj\n`);
    const footer = encoder.encode("\nendobj\n");
    parts.push(header, object, footer);
    length += header.length + object.length + footer.length;
  });

  const xrefOffset = length;
  const xrefRows = offsets
    .map((offset, index) =>
      index === 0 ? "0000000000 65535 f " : `${String(offset).padStart(10, "0")} 00000 n `
    )
    .join("\n");
  const trailer = encoder.encode(
    `xref\n0 ${objects.length + 1}\n${xrefRows}\ntrailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );
  parts.push(trailer);
  return new Blob(parts, { type: "application/pdf" });

  function addObject(body) {
    objects.push(encoder.encode(body));
    return objects.length;
  }

  function addStreamObject(dictionary, bytes) {
    const prefix = encoder.encode(`${dictionary}\nstream\n`);
    const suffix = encoder.encode("\nendstream");
    objects.push(concat([prefix, bytes, suffix]));
    return objects.length;
  }
}

function dataUrlToBytes(dataUrl) {
  const [, encoded] = dataUrl.split(",");
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return {
    bytes,
  };
}

function concat(chunks) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
