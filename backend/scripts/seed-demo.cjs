const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const root = path.resolve(__dirname, '..');
const id = (table, n) => {
  const h = createHash('sha256').update(`qlth-sample-v1:${table}:${n}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const report = {};
const now = new Date();
const day = 24 * 60 * 60 * 1000;
const at = (offset) => new Date(now.getTime() + offset * day).toISOString();
const labels = ['Công nghệ thông tin', 'Kinh tế & Quản trị', 'Điện – Điện tử'];
const years = [now.getFullYear(), now.getFullYear() + 1, now.getFullYear() - 1];
const systems = ['DEMO_CQ', 'DEMO_CLC', 'DEMO_VLVH'];
const quote = (s) => '"' + s.replace(/"/g, '""') + '"';
const createdFiles = [];

function pdf(title) {
  const content = `BT /F1 20 Tf 60 760 Td (${title.replace(/[()\\]/g, '')}) Tj 0 -35 Td /F1 12 Tf (QLTH - Synthetic sample. Not a real document.) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let value = '%PDF-1.4\n';
  let offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(value));
    value += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(value);
  value +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((o) => String(o).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(value);
}

async function insert(client, table, row, key = 'id') {
  const columns = Object.keys(row);
  const values = Object.values(row).map((v) =>
    v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) ? JSON.stringify(v) : v,
  );
  const result = await client.query(
    `INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${values.map((_, i) => '$' + (i + 1)).join(',')}) ON CONFLICT (${quote(key)}) DO NOTHING`,
    values,
  );
  report[table] = (report[table] || 0) + result.rowCount;
  const actual = (
    await client.query(`SELECT ${quote(key)} FROM ${quote(table)} WHERE ${quote(key)}=$1`, [
      row[key],
    ])
  ).rows[0];
  assert.ok(actual, `${table} row missing`);
}

async function file(client, n, type, userId) {
  const folder = path.join(root, 'uploads', type === 'cv' ? 'cv' : 'templates');
  await fs.mkdir(folder, { recursive: true });
  const filePath = path.join(folder, id('system_files', n) + '.pdf');
  const buffer = pdf(type === 'cv' ? `Sample CV ${n}` : `Sample form ${n}`);
  try {
    await fs.writeFile(filePath, buffer, { flag: 'wx' });
    createdFiles.push(filePath);
  } catch (e) {
    if (e.code !== 'EEXIST') {
      throw e;
    }
    assert.equal((await fs.readFile(filePath)).equals(buffer), true, 'Existing sample PDF differs');
  }
  await insert(client, 'system_files', {
    id: id('system_files', n),
    uploaded_by: userId,
    original_name: `DEMO-${type}-${n}.pdf`,
    file_path: filePath,
    file_size: buffer.length,
    mime_type: 'application/pdf',
    checksum: createHash('sha256').update(buffer).digest('hex'),
    created_at: at(-7),
  });
  return id('system_files', n);
}

async function run() {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('qlth-sample-v1'))");
    const roles = Object.fromEntries(
      (await client.query('SELECT code,id FROM roles')).rows.map((r) => [r.code, r.id]),
    );
    for (const role of ['STUDENT', 'LECTURER', 'ENTERPRISE_MENTOR', 'FACULTY_MANAGER'])
      assert.ok(roles[role], `Missing role ${role}`);
    const hash = await bcrypt.hash('Demo@123456', 12);
    for (let n = 1; n <= 3; n++) {
      await insert(client, 'training_systems', {
        id: id('training_systems', n),
        code: systems[n - 1],
        name: ['Chính quy (mẫu)', 'Chất lượng cao (mẫu)', 'Vừa làm vừa học (mẫu)'][n - 1],
      });
      await insert(client, 'faculties', {
        id: id('faculties', n),
        code: `DEMO_KHOA_${n}`,
        name: `Khoa ${labels[n - 1]} (mẫu)`,
        description: `Đơn vị đào tạo mẫu số ${n}, phục vụ trình diễn hệ thống.`,
        created_at: at(-120),
        updated_at: at(-7),
      });
      await insert(client, 'departments', {
        id: id('departments', n),
        faculty_id: id('faculties', n),
        code: `DEMO_BM_${n}`,
        name: [
          'Bộ môn Phát triển phần mềm (mẫu)',
          'Bộ môn Quản trị kinh doanh (mẫu)',
          'Bộ môn Tự động hóa (mẫu)',
        ][n - 1],
        created_at: at(-120),
        updated_at: at(-7),
      });
      await insert(client, 'majors', {
        id: id('majors', n),
        department_id: id('departments', n),
        code: `DEMO_NGANH_${n}`,
        name: ['Kỹ thuật phần mềm (mẫu)', 'Quản trị kinh doanh (mẫu)', 'Kỹ thuật điều khiển (mẫu)'][
          n - 1
        ],
        training_system: systems[n - 1],
        created_at: at(-120),
      });
      await insert(client, 'specializations', {
        id: id('specializations', n),
        major_id: id('majors', n),
        code: `DEMO_CN_${n}`,
        name: [
          'Phát triển ứng dụng Web (mẫu)',
          'Quản trị doanh nghiệp số (mẫu)',
          'Robot và hệ thống nhúng (mẫu)',
        ][n - 1],
        created_at: at(-100),
      });
      await insert(client, 'academic_years', {
        id: id('academic_years', n),
        code: `DEMO_NH_${n}`,
        start_year: years[n - 1],
        end_year: years[n - 1] + 1,
      });
      await insert(client, 'semesters', {
        id: id('semesters', n),
        academic_year_id: id('academic_years', n),
        code: `DEMO_HK_${n}`,
        name: `Học kỳ 1 năm ${years[n - 1]}–${years[n - 1] + 1} (mẫu)`,
        start_date: `${years[n - 1]}-09-01`,
        end_date: `${years[n - 1] + 1}-01-31`,
        is_current: false,
      });
      await insert(client, 'companies', {
        id: id('companies', n),
        tax_code: `DEMO-TAX-${n}`,
        name: [
          'Công ty Công nghệ Ánh Dương (mẫu)',
          'Công ty Giải pháp Kinh doanh Việt (mẫu)',
          'Công ty Tự động hóa Tương Lai (mẫu)',
        ][n - 1],
        industry: labels[n - 1],
        address: `Số ${n} đường Dữ Liệu Mẫu, TP. Hồ Chí Minh`,
        website: `https://company-${n}.example.invalid`,
        contact_email: `company${n}@example.invalid`,
        contact_phone: `090000000${n}`,
        is_verified: false,
        created_at: at(-100),
        updated_at: at(-7),
      });
      const kinds = [
        ['sv', 'STUDENT', ['Nguyễn Minh An', 'Trần Ngọc Bảo', 'Lê Hoàng Chi']],
        ['gv', 'LECTURER', ['TS. Phạm Thanh Dũng', 'ThS. Võ Thị Hạnh', 'TS. Đặng Quốc Huy']],
        ['mentor', 'ENTERPRISE_MENTOR', ['Nguyễn Thành Long', 'Trần Thị Mai', 'Lê Anh Nam']],
        [
          'khoa',
          'FACULTY_MANAGER',
          ['PGS. Trần Minh Đức', 'TS. Nguyễn Thị Lan', 'PGS. Lê Văn Thành'],
        ],
      ];
      for (const [kind, role, names] of kinds) {
        const userId = id('users_' + kind, n);
        await insert(client, 'users', {
          id: userId,
          code: `DEMO_${kind.toUpperCase()}_${n}`,
          email: `demo.${kind}${n}@example.invalid`,
          password_hash: hash,
          full_name: names[n - 1] + ' (mẫu)',
          phone: `09100000${String(n).padStart(2, '0')}`,
          avatar_file_id: null,
          sso_provider: null,
          sso_id: null,
          is_active: true,
          last_login_at: null,
          created_at: at(-30),
          updated_at: at(-7),
        });
      }
      const campaign = id('campaigns', n);
      const sv = id('users_sv', n);
      const gv = id('users_gv', n);
      const mentor = id('users_mentor', n);
      const manager = id('users_khoa', n);
      await insert(client, 'campaigns', {
        id: campaign,
        semester_id: id('semesters', n),
        faculty_id: id('faculties', n),
        major_id: id('majors', n),
        code: `DEMO_DOT_${n}`,
        name: [
          'Đợt đồ án đang mở (mẫu)',
          'Đợt thực tập chuẩn bị (mẫu)',
          'Đợt tổng hợp đã đóng (mẫu)',
        ][n - 1],
        type: ['THESIS', 'INTERNSHIP', 'COMBINED'][n - 1],
        status: ['OPEN', 'DRAFT', 'CLOSED'][n - 1],
        min_credits_required: 100,
        min_gpa_required: 2,
        max_students_per_topic: 2,
        max_wish_choices: 3,
        allow_student_propose_topic: true,
        allow_self_find_company: true,
        created_by: manager,
        created_at: at(-20),
        updated_at: at(-7),
        training_system: systems[n - 1],
      });
      for (const [kind, role] of [
        ['sv', 'STUDENT'],
        ['gv', 'LECTURER'],
        ['mentor', 'ENTERPRISE_MENTOR'],
        ['khoa', 'FACULTY_MANAGER'],
      ])
        await insert(client, 'user_roles', {
          id: id('user_roles_' + kind, n),
          user_id: id('users_' + kind, n),
          role_id: roles[role],
          faculty_id: id('faculties', n),
          department_id: kind === 'khoa' ? null : id('departments', n),
          major_id: kind === 'khoa' ? null : id('majors', n),
          campaign_id: null,
          is_default: true,
          assigned_at: at(-20),
        });
      const cv = await file(client, n, 'cv', sv);
      const formFile = await file(client, n + 3, 'template', manager);
      await insert(
        client,
        'student_profiles',
        {
          user_id: sv,
          major_id: id('majors', n),
          cohort: '2023',
          class_name: `DEMO-${n}A`,
          gpa: [3.4, 3.1, 3.7][n - 1],
          accumulated_credits: 110 + n * 5,
          skills: [
            ['JavaScript', 'SQL', 'Git'],
            ['Excel', 'Phân tích dữ liệu', 'Giao tiếp'],
            ['C++', 'IoT', 'Thiết kế mạch'],
          ][n - 1],
          interests: [
            'Ứng dụng Web và trí tuệ nhân tạo',
            'Chuyển đổi số trong quản trị',
            'Robot và tự động hóa',
          ][n - 1],
          cv_file_id: cv,
          portfolio_url: `https://student-${n}.example.invalid`,
          updated_at: at(-7),
        },
        'user_id',
      );
      await insert(
        client,
        'lecturer_profiles',
        {
          user_id: gv,
          department_id: id('departments', n),
          academic_degree: n === 2 ? 'Thạc sĩ' : 'Tiến sĩ',
          specialization: labels[n - 1],
          research_directions: [
            ['Ứng dụng Web', 'Trí tuệ nhân tạo'],
            ['Quản trị số', 'Phân tích kinh doanh'],
            ['IoT', 'Điều khiển thông minh'],
          ][n - 1],
          default_thesis_quota: 10,
          default_internship_quota: 15,
          is_accepting_students: true,
          updated_at: at(-7),
        },
        'user_id',
      );
      await insert(
        client,
        'mentor_profiles',
        {
          user_id: mentor,
          company_id: id('companies', n),
          position: ['Trưởng nhóm phát triển', 'Chuyên viên quản trị', 'Kỹ sư trưởng'][n - 1],
          expertise_area: labels[n - 1],
          updated_at: at(-7),
        },
        'user_id',
      );
      await insert(client, 'lecturer_quotas', {
        id: id('lecturer_quotas', n),
        campaign_id: campaign,
        lecturer_id: gv,
        max_students: 10 + n,
        max_topics: 5,
        current_assigned_students: 0,
      });
      await insert(client, 'campaign_eligible_students', {
        id: id('campaign_eligible_students', n),
        campaign_id: campaign,
        student_id: sv,
        status: 'ELIGIBLE',
        ineligible_reason: null,
        verified_by: manager,
        created_at: at(-10),
      });
      await insert(client, 'campaign_enrollments', {
        id: id('campaign_enrollments', n),
        campaign_id: campaign,
        student_id: sv,
        registered_at: at(-5),
      });
      await insert(client, 'campaign_milestones', {
        id: id('campaign_milestones', n),
        campaign_id: campaign,
        phase: 'WISH_REGISTRATION',
        title: `Đăng ký tham gia đợt mẫu ${n}`,
        description: 'Mốc thời gian minh họa; trạng thái đợt vẫn quyết định quyền đăng ký.',
        start_at: at(-15),
        end_at: at(15),
        hard_deadline_at: at(20),
        is_mandatory: true,
        is_locked_override: null,
        sequence_order: 2,
      });
      await insert(client, 'timeline_overrides', {
        id: id('timeline_overrides', n),
        milestone_id: id('campaign_milestones', n),
        target_user_id: sv,
        extended_until: at(18),
        reason: 'Gia hạn mẫu để kiểm tra chức năng ngoại lệ cá nhân.',
        granted_by: manager,
        created_at: at(-1),
      });
      await insert(client, 'document_templates', {
        id: id('document_templates', n),
        faculty_id: id('faculties', n),
        code: `DEMO_BM_FILE_${n}`,
        name:
          ['Mẫu đề cương đồ án', 'Mẫu báo cáo thực tập', 'Mẫu đánh giá kết quả'][n - 1] +
          ' (PDF mẫu)',
        file_id: formFile,
        is_active: true,
        created_at: at(-15),
      });
      await insert(client, 'notifications', {
        id: id('notifications', n),
        recipient_id: sv,
        title: `Thông báo đợt mẫu ${n}`,
        content: 'Dữ liệu trình diễn: kiểm tra hồ sơ và mốc thời gian tại trang Đợt.',
        type: 'DEMO',
        reference_type: 'campaigns',
        reference_id: campaign,
        action_url: '#campaigns',
        is_read: false,
        is_email_sent: false,
        read_at: null,
        created_at: at(-1),
      });
    }
    await client.query('COMMIT');
    committed = true;
    const summary = [];
    for (const [table, added] of Object.entries(report)) {
      const total = Number(
        (await client.query(`SELECT count(*) FROM ${quote(table)}`)).rows[0].count,
      );
      summary.push({ table, added, total });
    }
    console.table(summary);
    console.log(
      'Sample accounts: demo.sv1..3@example.invalid, demo.gv1..3@example.invalid, demo.mentor1..3@example.invalid, demo.khoa1..3@example.invalid. Password: Demo@123456',
    );
    console.log(
      'No existing data changed. No email sent. Sessions, reset tokens and SSO identities were not fabricated.',
    );
  } catch (error) {
    if (!committed) {
      await client.query('ROLLBACK');
      for (const f of createdFiles) await fs.rm(f, { force: true });
    }
    throw error;
  } finally {
    client.release();
  }
}

run()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
