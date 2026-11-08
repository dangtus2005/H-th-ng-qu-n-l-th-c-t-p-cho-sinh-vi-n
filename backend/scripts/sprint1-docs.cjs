const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.join(root, 'backend/.env'), quiet: true });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const dump = await fs.readFile(path.join(root, 'backend/database/init.sql'), 'utf8');
  const schema = dump
    .replace(/^COPY [^\r\n]+ FROM stdin;\r?\n[\s\S]*?^\\\.\r?\n/gm, '')
    .replace(/^SELECT pg_catalog\.setval\([^\r\n]+\r?\n/gm, '');
  if (/^COPY /m.test(schema)) {
    throw Error('Schema still contains data');
  }
  await fs.writeFile(path.join(root, 'backend/database/schema.sql'), schema);
  const tables = (
    await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`,
    )
  ).rows;
  const columns = (
    await pool.query(
      `SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`,
    )
  ).rows;
  const keys = (
    await pool.query(
      `SELECT tc.table_name,kcu.column_name,tc.constraint_type FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu USING (constraint_catalog,constraint_schema,constraint_name) WHERE tc.table_schema='public' AND tc.constraint_type IN ('PRIMARY KEY','FOREIGN KEY')`,
    )
  ).rows;
  const edges = (
    await pool.query(
      `SELECT tc.table_name AS child,kcu.column_name,ccu.table_name AS parent FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu USING (constraint_catalog,constraint_schema,constraint_name) JOIN information_schema.constraint_column_usage ccu USING (constraint_catalog,constraint_schema,constraint_name) WHERE tc.table_schema='public' AND tc.constraint_type='FOREIGN KEY' ORDER BY tc.table_name,kcu.column_name`,
    )
  ).rows;
  let erd =
    '# ERD toàn bộ hệ thống QLTH\n\nSinh từ cấu trúc PostgreSQL đang dùng. Các đường nối mô tả khóa ngoại; tính bắt buộc/nullable xem schema SQL.\n\n```mermaid\nerDiagram\n';
  for (const table of tables) {
    erd += `  ${table.table_name} {\n`;
    for (const column of columns.filter((c) => c.table_name === table.table_name)) {
      const flags = keys
        .filter((k) => k.table_name === table.table_name && k.column_name === column.column_name)
        .map((k) => (k.constraint_type === 'PRIMARY KEY' ? 'PK' : 'FK'));
      erd += `    ${column.data_type.replace(/[^a-zA-Z0-9]/g, '_')} ${column.column_name}${flags.length ? ' ' + [...new Set(flags)].join(',') : ''}\n`;
    }
    erd += '  }\n';
  }
  for (const edge of edges)
    erd += `  ${edge.parent} ||..o{ ${edge.child} : "${edge.column_name}"\n`;
  erd +=
    '```\n\nBaseline: [schema.sql](../backend/database/schema.sql); bổ sung qua [migrations](../backend/migrations/).\n';
  await fs.writeFile(path.join(root, 'docs/ERD.md'), erd);
  const report = await fs.readFile(path.join(root, 'docs/SPRINT-1-TONG-KET.md'), 'utf8');
  const archiver = require('archiver');
  const stream = require('node:fs').createWriteStream(
    path.join(root, 'docs/SPRINT-1-TONG-KET.docx'),
  );
  const archive = archiver('zip');
  archive.pipe(stream);
  const xml = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paragraphs = report
    .split(/\r?\n/)
    .map(
      (line) =>
        `<w:p>${line.startsWith('#') ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : ''}<w:r><w:t xml:space="preserve">${xml(line.replace(/^#+ /, ''))}</w:t></w:r></w:p>`,
    )
    .join('');
  archive.append(
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    { name: '[Content_Types].xml' },
  );
  archive.append(
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    { name: '_rels/.rels' },
  );
  archive.append(
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    { name: 'word/_rels/document.xml.rels' },
  );
  archive.append(
    '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:color w:val="1765CC"/><w:sz w:val="28"/></w:rPr></w:style></w:styles>',
    { name: 'word/styles.xml' },
  );
  archive.append(
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`,
    { name: 'word/document.xml' },
  );
  await archive.finalize();
  await new Promise((resolve, reject) => {
    stream.on('close', resolve);
    stream.on('error', reject);
  });
  console.log(
    `Generated schema (no data), ERD (${tables.length} tables, ${edges.length} foreign keys), Word report`,
  );
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
