import { createDeck, createElement, createSlide, SLIDE_SIZE } from "./schema.js";

const EMU_WIDTH = 9144000;
const EMU_HEIGHT = 5143500;
const PX_PER_EMU_X = SLIDE_SIZE.width / EMU_WIDTH;
const PX_PER_EMU_Y = SLIDE_SIZE.height / EMU_HEIGHT;
const EMU_PER_PX_X = EMU_WIDTH / SLIDE_SIZE.width;
const EMU_PER_PX_Y = EMU_HEIGHT / SLIDE_SIZE.height;

export async function importPptx(file) {
  const entries = await unzip(await file.arrayBuffer());
  const presentationXml = decodeText(entries.get("ppt/presentation.xml"));
  const slideSize = parseSlideSize(presentationXml);
  const slideNames = [...entries.keys()]
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));

  const deck = createDeck({
    title: file.name.replace(/\.pptx$/i, "") || "Imported deck",
    unsupportedFeatures: [],
    slides: [],
  });
  const layoutCache = new Map();

  for (const slideName of slideNames) {
    const slideXml = decodeText(entries.get(slideName));
    const relName = slideName.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
    const rels = parseRelationships(decodeText(entries.get(relName) || new Uint8Array()));
    const inheritedPlaceholders = placeholderMapForSlide(entries, slideName, rels, slideSize, layoutCache);
    deck.slides.push(parseSlide(slideXml, rels, entries, slideName, deck, slideSize, inheritedPlaceholders));
  }

  if (!deck.slides.length) {
    deck.slides.push(createSlide({ title: "Imported blank slide" }));
  }

  deck.unsupportedFeatures = unique(deck.unsupportedFeatures);
  return deck;
}

export function pptxCapabilities() {
  return [
    "Imports basic text boxes, text formatting and spacing, layout placeholders, shapes, images, simple chart references, and slide order.",
    "Unsupported PowerPoint features are listed in the deck inspector after import.",
    "Animations, transitions, SmartArt, advanced charts, embedded media, comments, and complex masters are reserved for later phases.",
  ];
}

function parseSlide(slideXml, rels, entries, slideName, deck, slideSize, inheritedPlaceholders = new Map()) {
  const doc = parseXml(slideXml);
  const title = firstText(doc) || slideName.match(/slide(\d+)/)?.[0] || "Imported slide";
  const slide = createSlide({
    title,
    elements: [],
    background: parseBackground(doc) || "#ffffff",
  });

  let fallbackTextIndex = 0;
  for (const shape of byLocal(doc, "sp")) {
    const text = textFromNode(shape);
    const placeholder = parsePlaceholder(shape);
    const transform = parseTransform(
      shape,
      slideSize,
      lookupPlaceholderTransform(placeholder, inheritedPlaceholders),
      text.trim() ? fallbackTextTransform(fallbackTextIndex) : null
    );
    const fill = parseFill(shape);
    const preset = attr(firstByLocal(shape, "prstGeom"), "prst") || "rect";
    if (text.trim()) {
      slide.elements.push(
        createElement("text", {
          ...transform,
          text,
          fontSize: parseFontSize(shape) || 28,
          fontWeight: parseBold(shape) ? 800 : 500,
          italic: parseItalic(shape),
          underline: parseUnderline(shape),
          bulletList: parseBulletList(shape),
          lineHeight: parseLineHeight(shape) || 1.18,
          color: parseTextColor(shape) || deck.theme.colors.ink,
          fill: fill || "transparent",
          name: "Imported text",
        })
      );
      fallbackTextIndex += 1;
    } else if (!placeholder && transform.w > 4 && transform.h > 4) {
      slide.elements.push(
        createElement("shape", {
          ...transform,
          shape: shapeFromPreset(preset),
          fill: fill || "#eef2f7",
          stroke: parseStroke(shape) || "#94a3b8",
          name: "Imported shape",
        })
      );
    }
  }

  for (const picture of byLocal(doc, "pic")) {
    const transform = parseTransform(picture, slideSize);
    const embed = attr(firstByLocal(picture, "blip"), "embed");
    const rel = rels.get(embed);
    const target = resolveSlideTarget(slideName, rel?.target);
    const bytes = target ? entries.get(target) : null;
    if (bytes) {
      slide.elements.push(
        createElement("image", {
          ...transform,
          src: dataUriForBytes(target, bytes),
          alt: rel?.target || "Imported image",
          name: "Imported image",
        })
      );
    } else {
      deck.unsupportedFeatures.push("Image relationship could not be resolved on import.");
    }
  }

  for (const frame of byLocal(doc, "graphicFrame")) {
    const uri = attr(firstByLocal(frame, "graphicData"), "uri") || "";
    if (uri.includes("chart")) {
      const transform = parseTransform(frame, slideSize);
      slide.elements.push(
        createElement("chart", {
          ...transform,
          title: "Imported chart",
          labels: ["A", "B", "C", "D"],
          values: [4, 7, 5, 8],
          name: "Imported chart preview",
        })
      );
      deck.unsupportedFeatures.push(
        "Imported charts are converted to editable chart previews; original workbook data is not preserved yet."
      );
    } else if (uri.includes("diagram")) {
      deck.unsupportedFeatures.push("SmartArt diagrams are not editable yet.");
    }
  }

  const unsupportedTags = [
    ["videoFile", "Embedded videos are not imported yet."],
    ["audioFile", "Embedded audio is not imported yet."],
    ["transition", "Slide transitions are tracked in the schema but not imported yet."],
    ["timing", "PowerPoint animation timing is not imported yet."],
  ];
  for (const [tag, message] of unsupportedTags) {
    if (byLocal(doc, tag).length) {
      deck.unsupportedFeatures.push(message);
    }
  }

  return slide;
}

async function slideXmlForDeck(slide, deck, slideIndex, media, unsupported) {
  let shapeId = 2;
  const body = [];

  for (const element of slide.elements) {
    if (element.type === "image") {
      const mediaItem = await mediaForElement(element, slideIndex, media.length + 1);
      if (mediaItem) {
        media.push(mediaItem);
        body.push(picXml(element, shapeId, mediaItem.rId));
      } else {
        unsupported.add("Some images could not be embedded in PPTX export.");
      }
      shapeId += 1;
      continue;
    }

    if (element.type === "text") {
      body.push(textShapeXml(element, shapeId));
    } else if (element.type === "shape" || element.type === "divider" || element.type === "icon") {
      body.push(shapeXml(element, shapeId, element.type === "icon" ? "ellipse" : element.shape || "rect"));
    } else if (element.type === "chart") {
      unsupported.add("Charts export as editable preview text until native chart export is added.");
      body.push(chartPreviewXml(element, shapeId));
    } else if (element.type === "table") {
      unsupported.add("Tables export as editable text blocks until native table export is added.");
      body.push(tablePreviewXml(element, shapeId));
    } else if (element.type === "engagement") {
      unsupported.add("Engagement elements export as editable preview text; live audience behavior stays in HySlides.");
      body.push(engagementPreviewXml(element, shapeId));
    }
    shapeId += 1;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex(slide.background || deck.theme.colors.background)}"/></a:solidFill></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${body.join("\n")}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function textShapeXml(element, id) {
  return `<p:sp>
  <p:nvSpPr><p:cNvPr id="${id}" name="${xml(element.name || "Text")}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
  <p:spPr>${xfrmXml(element)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml(element.fill)}</p:spPr>
  <p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paragraphXml(element)}</p:txBody>
</p:sp>`;
}

function shapeXml(element, id, preset = "rect") {
  return `<p:sp>
  <p:nvSpPr><p:cNvPr id="${id}" name="${xml(element.name || "Shape")}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr>${xfrmXml(element)}<a:prstGeom prst="${pptPreset(preset)}"><a:avLst/></a:prstGeom>${fillXml(element.fill)}${lineXml(element.stroke, element.strokeWidth)}</p:spPr>
  <p:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="3"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="2"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></p:style>
</p:sp>`;
}

function picXml(element, id, rId) {
  return `<p:pic>
  <p:nvPicPr><p:cNvPr id="${id}" name="${xml(element.name || "Image")}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
  <p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
  <p:spPr>${xfrmXml(element)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
</p:pic>`;
}

function chartPreviewXml(element, id) {
  const lines = [element.title || "Chart", ...element.labels.map((label, i) => `${label}: ${element.values[i] ?? 0}`)];
  return textShapeXml(
    {
      ...element,
      type: "text",
      text: lines.join("\n"),
      fontSize: 18,
      fontWeight: 700,
      color: "#1d232a",
      fill: "#f8fafc",
      name: "Chart preview",
    },
    id
  );
}

function tablePreviewXml(element, id) {
  return textShapeXml(
    {
      ...element,
      type: "text",
      text: element.cells.map((row) => row.join("    ")).join("\n"),
      fontSize: 18,
      fontWeight: 600,
      color: "#1d232a",
      fill: "#ffffff",
      name: "Table preview",
    },
    id
  );
}

function engagementPreviewXml(element, id) {
  return textShapeXml(
    {
      ...element,
      type: "text",
      text: [
        `Engagement: ${engagementModeLabel(element.mode)}`,
        element.prompt || "Audience question",
        ...(element.options || []).map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`),
      ].join("\n"),
      fontSize: 20,
      fontWeight: 700,
      color: "#1d232a",
      fill: "#f8fafc",
      name: "Engagement preview",
    },
    id
  );
}

function paragraphXml(element) {
  const lines = String(element.text || "").split(/\n/);
  const paragraphAttrs = element.bulletList
    ? ` algn="${pptAlign(element.align)}" marL="342900" indent="-171450"`
    : ` algn="${pptAlign(element.align)}"`;
  const bulletXml = element.bulletList ? '<a:buChar char="&#8226;"/>' : "";
  const lineSpacingXml = lineSpacingXmlForElement(element);
  const runAttrs = [
    `lang="en-US"`,
    `sz="${Math.round((element.fontSize || 24) * 75)}"`,
    `b="${(element.fontWeight || 400) >= 700 ? 1 : 0}"`,
    element.italic ? `i="1"` : "",
    element.underline ? `u="sng"` : "",
  ].filter(Boolean).join(" ");
  return lines
    .map(
      (line) =>
        `<a:p><a:pPr${paragraphAttrs}>${bulletXml}${lineSpacingXml}</a:pPr><a:r><a:rPr ${runAttrs}><a:solidFill><a:srgbClr val="${hex(element.color || "#1d232a")}"/></a:solidFill></a:rPr><a:t>${xml(line)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>`
    )
    .join("");
}

function lineSpacingXmlForElement(element) {
  const lineHeight = Number(element.lineHeight);
  if (!Number.isFinite(lineHeight)) {
    return "";
  }
  return `<a:lnSpc><a:spcPct val="${Math.round(lineHeight * 100000)}"/></a:lnSpc>`;
}

function xfrmXml(element) {
  return `<a:xfrm><a:off x="${pxToEmuX(element.x)}" y="${pxToEmuY(element.y)}"/><a:ext cx="${pxToEmuX(element.w)}" cy="${pxToEmuY(element.h)}"/></a:xfrm>`;
}

function fillXml(value) {
  if (!value || value === "transparent") {
    return "<a:noFill/>";
  }
  return `<a:solidFill><a:srgbClr val="${hex(value)}"/></a:solidFill>`;
}

function lineXml(color = "#94a3b8", width = 1) {
  if (!color || color === "transparent" || width === 0) {
    return '<a:ln><a:noFill/></a:ln>';
  }
  return `<a:ln w="${Math.round(width * 12700)}"><a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill></a:ln>`;
}

async function mediaForElement(element, slideIndex, mediaIndex) {
  if (!element.src) {
    return null;
  }
  const data = element.src.startsWith("data:image/svg")
    ? await rasterizeDataImage(element.src, Math.round(element.w), Math.round(element.h))
    : dataUriToBytes(element.src);
  if (!data) {
    return null;
  }
  const extension = data.mime.includes("jpeg") || data.mime.includes("jpg") ? "jpg" : "png";
  return {
    rId: `rId${mediaIndex + 1}`,
    path: `ppt/media/image-${slideIndex}-${mediaIndex}.${extension}`,
    target: `../media/image-${slideIndex}-${mediaIndex}.${extension}`,
    bytes: data.bytes,
    contentType: extension === "jpg" ? "image/jpeg" : "image/png",
  };
}

async function rasterizeDataImage(src, width, height) {
  const image = new Image();
  const loaded = new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
  });
  image.src = src;
  await loaded;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return {
    mime: "image/png",
    bytes: new Uint8Array(await blob.arrayBuffer()),
  };
}

function slideRelsXml(media) {
  const rels = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>',
    ...media.map(
      (item) =>
        `<Relationship Id="${item.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${item.target}"/>`
    ),
  ];
  return relsXml(rels);
}

function contentTypesXml(deck) {
  const slideOverrides = deck.slides
    .map(
      (_, index) =>
        `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  ${slideOverrides}
</Types>`;
}

function rootRelsXml() {
  return relsXml([
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>',
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>',
  ]);
}

function presentationRelsXml(deck) {
  const rels = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>',
    '<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>',
    ...deck.slides.map(
      (_, index) =>
        `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`
    ),
  ];
  return relsXml(rels);
}

function presentationXml(deck) {
  const slideIds = deck.slides
    .map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideIds}</p:sldIdLst>
  <p:sldSz cx="${EMU_WIDTH}" cy="${EMU_HEIGHT}" type="wide"/>
  <p:notesSz cx="6858000" cy="9144000"/>
  <p:defaultTextStyle/>
</p:presentation>`;
}

function corePropsXml(deck) {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xml(deck.title)}</dc:title>
  <dc:creator>HySlides</dc:creator>
  <cp:lastModifiedBy>HySlides</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function appPropsXml(deck) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>HySlides</Application>
  <PresentationFormat>Widescreen</PresentationFormat>
  <Slides>${deck.slides.length}</Slides>
</Properties>`;
}

function themeXml(deck) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${xml(deck.theme.name)}">
  <a:themeElements>
    <a:clrScheme name="HySlides">
      <a:dk1><a:srgbClr val="${hex(deck.theme.colors.ink)}"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1D232A"/></a:dk2>
      <a:lt2><a:srgbClr val="F6F8FB"/></a:lt2>
      <a:accent1><a:srgbClr val="${hex(deck.theme.colors.primary)}"/></a:accent1>
      <a:accent2><a:srgbClr val="${hex(deck.theme.colors.accent)}"/></a:accent2>
      <a:accent3><a:srgbClr val="${hex(deck.theme.colors.coral)}"/></a:accent3>
      <a:accent4><a:srgbClr val="${hex(deck.theme.colors.warning)}"/></a:accent4>
      <a:accent5><a:srgbClr val="637083"/></a:accent5>
      <a:accent6><a:srgbClr val="CBD5E1"/></a:accent6>
      <a:hlink><a:srgbClr val="${hex(deck.theme.colors.primary)}"/></a:hlink>
      <a:folHlink><a:srgbClr val="${hex(deck.theme.colors.coral)}"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="HySlides"><a:majorFont><a:latin typeface="${xml(deck.theme.fonts.heading)}"/></a:majorFont><a:minorFont><a:latin typeface="${xml(deck.theme.fonts.body)}"/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="HySlides"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme>
  </a:themeElements>
</a:theme>`;
}

function slideMasterXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`;
}

function slideMasterRelsXml() {
  return relsXml([
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>',
  ]);
}

function slideLayoutXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`;
}

function slideLayoutRelsXml() {
  return relsXml([
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>',
  ]);
}

function relsXml(items) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.join("")}</Relationships>`;
}

async function unzip(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error("This file is not a readable .pptx archive.");
  }

  const count = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const entries = new Map();
  let offset = centralOffset;

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("PowerPoint archive central directory is invalid.");
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decodeText(bytes.slice(offset + 46, offset + 46 + nameLength));

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    entries.set(name, await inflateZipEntry(compressed, method));

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateZipEntry(bytes, method) {
  if (method === 0) {
    return bytes;
  }
  if (method !== 8) {
    throw new Error(`Unsupported ZIP compression method ${method}.`);
  }
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser cannot decompress PPTX files. Try a current Chromium, Edge, or Chrome build.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function zip(files) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [name, value] of files) {
    const nameBytes = encoder.encode(name);
    const data = typeof value === "string" ? encoder.encode(value) : value;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }

  const centralOffset = offset;
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.size, true);
  endView.setUint16(10, files.size, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  return new Blob([...locals, ...centrals, end], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

function parseRelationships(xmlText) {
  const rels = new Map();
  if (!xmlText.trim()) {
    return rels;
  }
  const doc = parseXml(xmlText);
  for (const rel of byLocal(doc, "Relationship")) {
    rels.set(attr(rel, "Id"), {
      type: attr(rel, "Type"),
      target: attr(rel, "Target"),
    });
  }
  return rels;
}

function parseSlideSize(xmlText) {
  if (!xmlText.trim()) {
    return { cx: EMU_WIDTH, cy: EMU_HEIGHT };
  }
  const doc = parseXml(xmlText);
  const sldSz = firstByLocal(doc, "sldSz");
  return {
    cx: Number(attr(sldSz, "cx")) || EMU_WIDTH,
    cy: Number(attr(sldSz, "cy")) || EMU_HEIGHT,
  };
}

function placeholderMapForSlide(entries, slideName, slideRels, slideSize, cache) {
  const layoutRel = [...slideRels.values()].find((rel) => rel.type?.includes("/slideLayout"));
  const layoutName = resolveSlideTarget(slideName, layoutRel?.target);
  if (!layoutName || !entries.has(layoutName)) {
    return new Map();
  }
  if (cache.has(layoutName)) {
    return cache.get(layoutName);
  }

  const placeholders = new Map();
  const layoutXml = decodeText(entries.get(layoutName));
  const layoutRels = parseRelationships(decodeText(entries.get(relsPathForPart(layoutName)) || new Uint8Array()));
  const masterRel = [...layoutRels.values()].find((rel) => rel.type?.includes("/slideMaster"));
  const masterName = resolveSlideTarget(layoutName, masterRel?.target);
  if (masterName && entries.has(masterName)) {
    addPlaceholderTransforms(placeholders, decodeText(entries.get(masterName)), slideSize);
  }
  addPlaceholderTransforms(placeholders, layoutXml, slideSize);
  cache.set(layoutName, placeholders);
  return placeholders;
}

function addPlaceholderTransforms(placeholders, xmlText, slideSize) {
  if (!xmlText.trim()) {
    return;
  }
  const doc = parseXml(xmlText);
  for (const shape of byLocal(doc, "sp")) {
    const placeholder = parsePlaceholder(shape);
    const transform = parseOwnTransform(shape, slideSize);
    if (!placeholder || !transform) {
      continue;
    }
    for (const key of placeholderKeys(placeholder)) {
      placeholders.set(key, transform);
    }
  }
}

function parseTransform(node, slideSize, inheritedTransform = null, fallbackTransform = null) {
  return (
    parseOwnTransform(node, slideSize) ||
    cloneTransform(inheritedTransform) ||
    cloneTransform(fallbackTransform) || {
      x: 0,
      y: 0,
      w: 16,
      h: 12,
    }
  );
}

function parseOwnTransform(node, slideSize) {
  const xfrm = firstByLocal(node, "xfrm");
  const off = firstByLocal(xfrm, "off");
  const ext = firstByLocal(xfrm, "ext");
  const rawWidth = Number(attr(ext, "cx"));
  const rawHeight = Number(attr(ext, "cy"));
  if (!xfrm || !Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth <= 0 || rawHeight <= 0) {
    return null;
  }
  return {
    x: Math.round((Number(attr(off, "x")) || 0) * (SLIDE_SIZE.width / slideSize.cx)),
    y: Math.round((Number(attr(off, "y")) || 0) * (SLIDE_SIZE.height / slideSize.cy)),
    w: Math.max(16, Math.round(rawWidth * (SLIDE_SIZE.width / slideSize.cx))),
    h: Math.max(12, Math.round(rawHeight * (SLIDE_SIZE.height / slideSize.cy))),
  };
}

function parsePlaceholder(node) {
  const ph = firstByLocal(firstByLocal(node, "nvPr"), "ph") || firstByLocal(node, "ph");
  if (!ph) {
    return null;
  }
  return {
    type: attr(ph, "type") || "",
    idx: attr(ph, "idx") || "",
  };
}

function lookupPlaceholderTransform(placeholder, placeholders) {
  if (!placeholder) {
    return null;
  }
  for (const key of placeholderKeys(placeholder)) {
    if (placeholders.has(key)) {
      return placeholders.get(key);
    }
  }
  return null;
}

function placeholderKeys(placeholder) {
  const keys = [];
  const types = placeholderTypeAliases(placeholder.type);
  for (const type of types) {
    if (type && placeholder.idx) {
      keys.push(`type:${type}|idx:${placeholder.idx}`);
    }
  }
  if (placeholder.idx) {
    keys.push(`idx:${placeholder.idx}`);
  }
  for (const type of types) {
    if (type) {
      keys.push(`type:${type}`);
    }
  }
  return keys;
}

function placeholderTypeAliases(type) {
  if (!type) {
    return [];
  }
  if (type === "ctrTitle") {
    return ["ctrTitle", "title"];
  }
  if (type === "title") {
    return ["title", "ctrTitle"];
  }
  if (type === "obj") {
    return ["obj", "body"];
  }
  if (type === "body") {
    return ["body", "obj"];
  }
  return [type];
}

function fallbackTextTransform(index) {
  const gutter = 72;
  const top = 68 + Math.min(index, 6) * 78;
  return {
    x: gutter,
    y: top,
    w: SLIDE_SIZE.width - gutter * 2,
    h: index === 0 ? 88 : 70,
  };
}

function cloneTransform(transform) {
  return transform ? { ...transform } : null;
}

function relsPathForPart(partName) {
  const parts = partName.split("/");
  const fileName = parts.pop();
  return `${parts.join("/")}/_rels/${fileName}.rels`;
}

function parseBackground(doc) {
  const bg = firstByLocal(doc, "bgPr");
  return parseColor(bg);
}

function parseFill(node) {
  return parseColor(firstByLocal(node, "spPr"));
}

function parseStroke(node) {
  return parseColor(firstByLocal(node, "ln"));
}

function parseTextColor(node) {
  const rPr = firstByLocal(node, "rPr");
  return parseColor(rPr);
}

function parseColor(node) {
  const srgb = firstByLocal(node, "srgbClr");
  const val = attr(srgb, "val");
  return val ? `#${val}` : null;
}

function parseFontSize(node) {
  const rPr = firstByLocal(node, "rPr");
  const size = Number(attr(rPr, "sz"));
  return size ? Math.round((size / 100) * 1.333) : null;
}

function parseBold(node) {
  return attr(firstByLocal(node, "rPr"), "b") === "1";
}

function parseItalic(node) {
  return attr(firstByLocal(node, "rPr"), "i") === "1";
}

function parseUnderline(node) {
  const underline = attr(firstByLocal(node, "rPr"), "u");
  return Boolean(underline && underline !== "none");
}

function parseBulletList(node) {
  return byLocal(node, "p").some((paragraph) => {
    const pPr = firstByLocal(paragraph, "pPr");
    return Boolean(firstByLocal(pPr, "buChar") || firstByLocal(pPr, "buAutoNum"));
  });
}

function parseLineHeight(node) {
  const paragraph = firstByLocal(node, "p");
  const pPr = firstByLocal(paragraph, "pPr");
  const spcPct = firstByLocal(firstByLocal(pPr, "lnSpc"), "spcPct");
  const value = Number(attr(spcPct, "val"));
  return value ? Math.round((value / 100000) * 100) / 100 : null;
}

function shapeFromPreset(preset) {
  if (preset === "ellipse") {
    return "ellipse";
  }
  if (preset === "triangle") {
    return "triangle";
  }
  return "roundedRect";
}

function pptPreset(shape) {
  if (shape === "ellipse") {
    return "ellipse";
  }
  if (shape === "triangle") {
    return "triangle";
  }
  return "rect";
}

function pptAlign(value) {
  if (value === "center") {
    return "ctr";
  }
  if (value === "right") {
    return "r";
  }
  return "l";
}

function engagementModeLabel(mode) {
  const labels = {
    poll: "Live poll",
    multipleChoice: "Multiple choice",
    wordCloud: "Word cloud",
    qna: "Q&A",
    quiz: "Quiz",
    reactions: "Reactions",
  };
  return labels[mode] || "Engagement";
}

function textFromNode(node) {
  return byLocal(node, "p")
    .map(paragraphText)
    .filter((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function paragraphText(paragraph) {
  const parts = [];
  for (const child of paragraph.childNodes) {
    if (child.nodeType !== 1) {
      continue;
    }
    if (child.localName === "br") {
      parts.push("\n");
    } else if (child.localName === "r" || child.localName === "fld") {
      parts.push(byLocal(child, "t").map((item) => item.textContent || "").join(""));
    }
  }
  return parts.join("");
}

function firstText(doc) {
  return byLocal(doc, "t")
    .map((item) => item.textContent?.trim())
    .filter(Boolean)[0];
}

function resolveSlideTarget(slideName, target) {
  if (!target) {
    return null;
  }
  if (target.startsWith("/")) {
    return target.slice(1);
  }
  const base = slideName.split("/").slice(0, -1).join("/");
  const parts = `${base}/${target}`.split("/");
  const stack = [];
  for (const part of parts) {
    if (part === "..") {
      stack.pop();
    } else if (part !== ".") {
      stack.push(part);
    }
  }
  return stack.join("/");
}

function parseXml(text) {
  return new DOMParser().parseFromString(text, "application/xml");
}

function byLocal(node, localName) {
  if (!node) {
    return [];
  }
  return [...node.getElementsByTagName("*")].filter((item) => item.localName === localName);
}

function firstByLocal(node, localName) {
  return byLocal(node, localName)[0] || null;
}

function attr(node, name) {
  if (!node) {
    return "";
  }
  return node.getAttribute(name) || node.getAttribute(`r:${name}`) || "";
}

function decodeText(bytes) {
  return new TextDecoder().decode(bytes || new Uint8Array());
}

function dataUriForBytes(path, bytes) {
  const ext = path.split(".").pop()?.toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : "image/png";
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

function dataUriToBytes(uri) {
  const match = uri.match(/^data:([^;,]+);base64,(.*)$/);
  if (!match) {
    return null;
  }
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return {
    mime: match[1],
    bytes,
  };
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunk));
  }
  return btoa(binary);
}

function pxToEmuX(value) {
  return Math.round(value * EMU_PER_PX_X);
}

function pxToEmuY(value) {
  return Math.round(value * EMU_PER_PX_Y);
}

function xml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hex(value) {
  return String(value || "#000000").replace("#", "").slice(0, 6).padEnd(6, "0").toUpperCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
