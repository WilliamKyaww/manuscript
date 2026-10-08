import { strToU8, type Zippable, zipSync } from 'fflate';

/**
 * Builds small, licence-clean source files in code for tests (PDF, PPTX, DOCX), so no binary
 * fixtures are committed and every test states exactly what its file contains.
 */

// ---------------------------------------------------------------------------------------------
// PDF: a minimal but valid PDF 1.4 with Helvetica text (one line per string).

const pdfString = (text: string) => `(${text.replace(/[\\()]/g, (char) => `\\${char}`)})`;

export interface PdfOptions {
  title?: string;
}

/** Each page is a list of lines; an empty list makes a page without any text layer. */
export function makePdf(
  pages: readonly (readonly string[])[],
  options: PdfOptions = {},
): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add('');
  const pagesObject = add('');
  const font = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const info = options.title
    ? add(`<< /Title ${pdfString(options.title)} /Producer (Manuscript tests) >>`)
    : null;
  const pageIds: number[] = [];
  for (const lines of pages) {
    const stream =
      lines.length === 0
        ? '0.9 g 72 600 200 100 re f'
        : `BT /F1 12 Tf 16 TL 72 720 Td ${lines.map((line) => `${pdfString(line)} Tj T*`).join(' ')} ET`;
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObject} 0 R >>`;
  objects[pagesObject - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let output = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R${info ? ` /Info ${info} 0 R` : ''} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(output, 'latin1'));
}

// ---------------------------------------------------------------------------------------------
// Office files.

const xmlEscape = (text: string) =>
  text.replace(
    /[<>&"]/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[char] ?? char,
  );

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function coreProperties(title?: string): string {
  return `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">${title ? `<dc:title>${xmlEscape(title)}</dc:title>` : ''}</cp:coreProperties>`;
}

function relationshipsXml(rels: { id: string; type: string; target: string }[]): string {
  return `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels
    .map((rel) => `<Relationship Id="${rel.id}" Type="${REL}/${rel.type}" Target="${rel.target}"/>`)
    .join('')}</Relationships>`;
}

export interface SlideSpec {
  title?: string;
  /** Body paragraphs; a leading `>` per indentation level, e.g. `>Detail`. */
  body?: string[];
  notes?: string;
  table?: string[][];
  hidden?: boolean;
}

export interface PptxOptions {
  title?: string;
  /** Store slides in files numbered in reverse, so order must come from presentation.xml. */
  reverseFiles?: boolean;
}

const run = (text: string) =>
  `<a:r><a:rPr lang="en-GB"/><a:t xml:space="preserve">${xmlEscape(text)}</a:t></a:r>`;

function shape(id: number, placeholder: string | null, paragraphs: string[]): string {
  const ph = placeholder ? `<p:nvPr><p:ph type="${placeholder}"/></p:nvPr>` : '<p:nvPr/>';
  const body = paragraphs
    .map((paragraph) => {
      const level = /^>+/.exec(paragraph)?.[0].length ?? 0;
      const text = paragraph.slice(level);
      return `<a:p>${level ? `<a:pPr lvl="${level}"/>` : ''}${run(text)}</a:p>`;
    })
    .join('\n      ');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/>${ph}</p:nvSpPr><p:spPr/>
    <p:txBody><a:bodyPr/><a:lstStyle/>
      ${body}
    </p:txBody></p:sp>`;
}

function tableFrame(rows: string[][]): string {
  const cells = rows
    .map(
      (row) =>
        `<a:tr h="100">${row.map((cell) => `<a:tc><a:txBody><a:bodyPr/><a:p>${run(cell)}</a:p></a:txBody></a:tc>`).join('')}</a:tr>`,
    )
    .join('');
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>${cells}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

export function makePptx(slides: readonly SlideSpec[], options: PptxOptions = {}): Uint8Array {
  const files: Zippable = {
    '[Content_Types].xml': strToU8(
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    ),
    'docProps/core.xml': strToU8(coreProperties(options.title)),
  };
  const presentationRels: { id: string; type: string; target: string }[] = [];
  const ids: string[] = [];
  slides.forEach((slide, index) => {
    const fileNumber = options.reverseFiles ? slides.length - index : index + 1;
    const rId = `rId${index + 10}`;
    presentationRels.push({ id: rId, type: 'slide', target: `slides/slide${fileNumber}.xml` });
    ids.push(`<p:sldId id="${256 + index}" r:id="${rId}"/>`);
    const shapes = [
      slide.title ? shape(2, 'title', [slide.title]) : '',
      slide.body ? shape(3, 'body', slide.body) : '',
      shape(4, 'sldNum', [String(index + 1)]),
      slide.table ? tableFrame(slide.table) : '',
    ].join('\n');
    files[`ppt/slides/slide${fileNumber}.xml`] = strToU8(
      `${XML}<p:sld xmlns:a="${NS_A}" xmlns:p="${NS_P}" xmlns:r="${NS_R}"${slide.hidden ? ' show="0"' : ''}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>\n${shapes}\n</p:spTree></p:cSld></p:sld>`,
    );
    const slideRels = [
      { id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' },
    ];
    if (slide.notes !== undefined) {
      slideRels.push({
        id: 'rId2',
        type: 'notesSlide',
        target: `../notesSlides/notesSlide${fileNumber}.xml`,
      });
      files[`ppt/notesSlides/notesSlide${fileNumber}.xml`] = strToU8(
        `${XML}<p:notes xmlns:a="${NS_A}" xmlns:p="${NS_P}"><p:cSld><p:spTree>${shape(2, 'sldImg', [])}${shape(3, 'body', slide.notes.split('\n'))}${shape(4, 'sldNum', [String(index + 1)])}</p:spTree></p:cSld></p:notes>`,
      );
    }
    files[`ppt/slides/_rels/slide${fileNumber}.xml.rels`] = strToU8(relationshipsXml(slideRels));
  });
  files['ppt/presentation.xml'] = strToU8(
    `${XML}<p:presentation xmlns:a="${NS_A}" xmlns:p="${NS_P}" xmlns:r="${NS_R}"><p:sldIdLst>${ids.join('')}</p:sldIdLst></p:presentation>`,
  );
  files['ppt/_rels/presentation.xml.rels'] = strToU8(relationshipsXml(presentationRels));
  return zipSync(files);
}

export type DocxBlock =
  | { heading: number; text: string }
  | { title: string }
  | { p: string }
  | { list: string; level?: number }
  | { table: string[][] }
  /** A paragraph with a tracked deletion between two kept parts. */
  | { tracked: [string, string, string] };

export interface DocxOptions {
  title?: string;
  /** Use translated heading style ids (as Word does in German), resolved through styles.xml. */
  translatedStyles?: boolean;
}

const wRun = (text: string) => `<w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;

export function makeDocx(blocks: readonly DocxBlock[], options: DocxOptions = {}): Uint8Array {
  const headingId = (level: number) =>
    options.translatedStyles ? `berschrift${level}` : `Heading${level}`;
  const paragraph = (style: string | null, inner: string, extra = '') =>
    `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>${inner}</w:p>`;
  const body = blocks
    .map((block) => {
      if ('heading' in block) return paragraph(headingId(block.heading), wRun(block.text));
      if ('title' in block) return paragraph('Title', wRun(block.title));
      if ('p' in block) return paragraph(null, wRun(block.p));
      if ('list' in block)
        return paragraph(
          'ListParagraph',
          wRun(block.list),
          `<w:numPr><w:ilvl w:val="${block.level ?? 0}"/><w:numId w:val="1"/></w:numPr>`,
        );
      if ('tracked' in block) {
        const [before, deleted, after] = block.tracked;
        return paragraph(
          null,
          `${wRun(before)}<w:del w:id="1" w:author="Tester"><w:r><w:delText>${xmlEscape(deleted)}</w:delText></w:r></w:del><w:ins w:id="2" w:author="Tester">${wRun(after)}</w:ins>`,
        );
      }
      const rows = block.table
        .map(
          (row) =>
            `<w:tr>${row.map((cell) => `<w:tc>${paragraph(null, wRun(cell))}</w:tc>`).join('')}</w:tr>`,
        )
        .join('');
      return `<w:tbl>${rows}</w:tbl>`;
    })
    .join('\n');
  const styles = [1, 2, 3]
    .map(
      (level) =>
        `<w:style w:type="paragraph" w:styleId="${headingId(level)}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/></w:style>`,
    )
    .join('');
  return zipSync({
    '[Content_Types].xml': strToU8(
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    ),
    'docProps/core.xml': strToU8(coreProperties(options.title)),
    'word/document.xml': strToU8(
      `${XML}<w:document xmlns:w="${NS_W}"><w:body>\n${body}\n<w:sectPr/></w:body></w:document>`,
    ),
    'word/styles.xml': strToU8(
      `${XML}<w:styles xmlns:w="${NS_W}"><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>${styles}</w:styles>`,
    ),
  });
}

/** A ZIP whose single XML part inflates to `bytes` of zeros (a zip bomb in miniature). */
export function makeZipBomb(name: string, bytes: number): Uint8Array {
  return zipSync({ [name]: new Uint8Array(bytes) }, { level: 9 });
}
