import { icon, enhanceUI } from './ui.js';
let c;
let selected = '';
let editing = false;
let working = false;
let report = null;
let cvURL = null;
let polling = false;
let reportContext = '';
const esc = (v) => c.esc(v);
const manage = () =>
  ['SYSTEM_ADMIN', 'TRAINING_DEPT', 'FACULTY_MANAGER'].includes(c.session()?.active_role.role_code);
const admin = () => c.session()?.active_role.role_code === 'SYSTEM_ADMIN';

export const sprint2Pages = {
  profile: ['Hồ sơ cá nhân', 'Thông tin chuyên môn, năng lực và hồ sơ của bạn.'],
  'bulk-import': ['Nhập dữ liệu Excel', 'Nhập tài khoản và hồ sơ theo từng nhóm người dùng.'],
};

const phaseNames = {
  TOPIC_SUBMISSION: 'Đề xuất đề tài',
  TOPIC_APPROVAL: 'Duyệt đề tài',
  WISH_REGISTRATION: 'Đăng ký tham gia / nguyện vọng',
  OUTLINE_SUBMISSION: 'Nộp đề cương',
  MIDTERM_REPORT_1: 'Báo cáo giữa kỳ 1',
  MIDTERM_REPORT_2: 'Báo cáo giữa kỳ 2',
  FINAL_SUBMISSION: 'Nộp báo cáo cuối kỳ',
  GRADING_REVIEW: 'Chấm phản biện',
  DEFENSE_COUNCIL: 'Hội đồng bảo vệ',
  POST_DEFENSE_ARCHIVE: 'Lưu trữ sau bảo vệ',
  CAMPAIGN_CLOSURE: 'Đóng đợt',
};
const statuses = {
  DRAFT: 'Bản nháp',
  OPEN: 'Mở đăng ký',
  IN_PROGRESS: 'Đang thực hiện',
  DEFENSE: 'Bảo vệ',
  CLOSED: 'Đã đóng',
  ARCHIVED: 'Lưu trữ',
};
const input = (name, label, value = '', type = 'text', extra = '') =>
  /* HTML */ `<label
    >${label}<input name="${name}" value="${esc(value)}" type="${type}" ${extra}
  /></label>`;
const textarea = (name, label, value = '') =>
  /* HTML */ `<label class="span-2"
    >${label}<textarea name="${name}" maxlength="5000">${esc(value)}</textarea>
  </label>`;
const select = (name, label, rows, value = '', optional = false) =>
  /* HTML */ `<label
    >${label}<select name="${name}" ${optional ? '' : 'required'}>
      ${optional ? '<option value="">Tất cả / không giới hạn</option>' : ''}${rows.map((r) => /* HTML */ `<option value="${esc(r.id)}" ${String(r.id) === String(value) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
    </select></label
  >`;
const form = (kind, title, fields, button = 'Lưu thông tin') =>
  /* HTML */ `<section class="panel">
    <div class="panel-header"><h2>${title}</h2></div>
    <form class="panel-body" data-s2-form="${kind}">
      <div class="form-grid">${fields}</div>
      <p class="error-text" role="alert" hidden></p>
      <div class="form-actions"><button type="submit" class="primary">${button}</button></div>
    </form>
  </section>`;
const table = (heads, rows) =>
  /* HTML */ `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          ${heads.map((h) => /* HTML */ `<th>${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.join('')}
      </tbody>
    </table>
    ${rows.length ? '' : '<p class="empty">Chưa có dữ liệu.</p>'}
  </div>`;
const date = (v) => (v ? new Date(v).toLocaleString('vi-VN') : '—');
const localDate = (v) => {
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function resultsHTML(result) {
  return /* HTML */ `<section class="panel import-report">
    <div class="panel-header">
      <h2>Kết quả nhập dữ liệu</h2>
      <span class="tag">${esc(result.created ?? result.saved ?? 0)} dòng thành công</span>
    </div>
    ${table(
      ['Dòng', 'Mã', 'Kết quả', 'Chi tiết', 'Email'],
      result.results.map(
        (r) =>
          /* HTML */ `<tr class="${r.status === 'error' ? 'import-error' : ''}">
            <td>${esc(r.row)}</td>
            <td>${esc(r.code)}</td>
            <td>${r.status === 'error' ? 'Lỗi' : 'Đã lưu'}</td>
            <td>${esc(r.message)}</td>
            <td>
              ${esc({ sent: 'Đã gửi', failed: 'Gửi thất bại', not_configured: 'Chưa cấu hình SMTP' }[r.email_status] || '—')}
            </td>
          </tr>`,
      ),
    )}
    <p class="panel-body small muted">
      Các dòng thành công đã được lưu. Chỉ sửa và nhập lại những dòng lỗi; không nhập lại toàn bộ
      danh sách thành công.
    </p>
  </section>`;
}

async function download(endpoint, name) {
  const response = await c.request(endpoint);
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function releaseCV() {
  if (cvURL) {
    URL.revokeObjectURL(cvURL);
    cvURL = null;
  }
  document.querySelector('#cv-dialog')?.remove();
}

export async function renderSprint2(page, area) {
  const context = page + '|' + c.session().active_role.user_role_id;
  if (reportContext !== context) {
    report = null;
    editing = false;
    reportContext = context;
  }
  if (page === 'bulk-import') {
    if (!admin()) {
      area.innerHTML =
        '<p class="screen-error">Chỉ quản trị viên được nhập tài khoản hàng loạt.</p>';
      return;
    }
    area.innerHTML = /* HTML */ `<div class="s2-info">
        ${icon('file')}
        <div>
          <strong>Nhập dữ liệu theo mẫu</strong>
          <p>
            Tải mẫu đúng nhóm, điền thông tin và tải lên. Hệ thống lưu dòng hợp lệ và chỉ rõ lỗi
            từng dòng.
          </p>
        </div>
      </div>
      ${form(
        'bulk',
        'Nhập tài khoản và hồ sơ',
        select('kind', 'Nhóm người dùng', [
          { id: 'students', name: 'Sinh viên' },
          { id: 'lecturers', name: 'Giảng viên' },
          { id: 'mentors', name: 'Doanh nghiệp / Mentor' },
        ]) +
          '<div class="template-action"><button type="button" data-s2-action="bulk-template">Tải mẫu Excel</button></div><label class="span-2">File dữ liệu<input type="file" name="file" accept=".xlsx" required><small>Tối đa 5 MB, 200 dòng. Mã ngành/bộ môn phải có sẵn. Mật khẩu có thể để trống để người dùng thiết lập qua email khôi phục.</small></label><p class="span-2 small muted">Thông báo tài khoản mới gửi qua email khi đã cấu hình SMTP. Trạng thái gửi hiển thị tại từng dòng.</p>',
        'Kiểm tra và nhập dữ liệu',
      )}
      <div id="s2-report">${report ? resultsHTML(report) : ''}</div>`;
    return;
  }
  if (page === 'profile') {
    const role = c.session().active_role.role_code;
    if (!['STUDENT', 'LECTURER', 'ENTERPRISE_MENTOR'].includes(role)) {
      area.innerHTML = /* HTML */ `<section class="panel">
        <div class="panel-body">
          <h2>Hồ sơ theo vai trò</h2>
          <p class="muted">
            Chọn vai trò Sinh viên, Giảng viên hoặc Doanh nghiệp trên Header để cập nhật hồ sơ tương
            ứng.
          </p>
          <a href="#account">Quản lý tài khoản và mật khẩu</a>
        </div>
      </section>`;
      return;
    }
    const result = await c.api('/profiles/me');
    if (!area.isConnected) {
      return;
    }
    const p = result.profile || {};
    const company = result.company || {};
    const roleLabel = {
      STUDENT: 'Sinh viên',
      LECTURER: 'Giảng viên',
      ENTERPRISE_MENTOR: 'Doanh nghiệp / Mentor',
    }[role];
    let fields = '';
    if (role === 'STUDENT') {
      fields =
        input(
          'gpa',
          'GPA (thang 4)',
          p.gpa ?? '',
          'number',
          'required min="0" max="4" step="0.01"',
        ) +
        input(
          'skills',
          'Kỹ năng',
          p.skills?.join(', ') || '',
          'text',
          'placeholder="JavaScript, SQL, Figma" maxlength="3000"',
        ) +
        textarea('interests', 'Lĩnh vực quan tâm', p.interests || '') +
        input(
          'portfolio_url',
          'Đường dẫn Portfolio',
          p.portfolio_url || '',
          'url',
          'maxlength="1000"',
        );
    }
    if (role === 'LECTURER') {
      fields =
        input('academic_degree', 'Học vị', p.academic_degree || '', 'text', 'maxlength="50"') +
        textarea('specialization', 'Chuyên môn', p.specialization || '') +
        textarea(
          'research_directions',
          'Hướng nghiên cứu (phân cách bằng dấu phẩy)',
          p.research_directions?.join(', ') || '',
        );
    }
    if (role === 'ENTERPRISE_MENTOR') {
      fields =
        input(
          'company_name',
          'Tên công ty',
          company.name || '',
          'text',
          'required maxlength="255"',
        ) +
        input('position', 'Vị trí công tác', p.position || '', 'text', 'maxlength="100"') +
        input(
          'contact_email',
          'Email liên hệ',
          company.contact_email || c.session().user.email,
          'email',
          'maxlength="255"',
        ) +
        input(
          'contact_phone',
          'Số điện thoại',
          company.contact_phone || '',
          'tel',
          'maxlength="20"',
        ) +
        input('industry', 'Lĩnh vực công ty', company.industry || '', 'text', 'maxlength="150"') +
        input(
          'expertise_area',
          'Chuyên môn hướng dẫn',
          p.expertise_area || '',
          'text',
          'maxlength="255"',
        ) +
        textarea('address', 'Địa chỉ công ty', company.address || '');
    }
    area.innerHTML = /* HTML */ `<div class="s2-profile-heading">
        ${icon('user')}
        <div>
          <strong>${esc(c.session().user.full_name)}</strong>
          <p>${esc(roleLabel)} · ${esc(c.session().user.email)}</p>
        </div>
      </div>
      <div class="s2-grid">
        ${form('profile', 'Thông tin hồ sơ', fields)}
        <div id="profile-extra"></div>
      </div>`;
    const extra = area.querySelector('#profile-extra');
    if (role === 'STUDENT') {
      const skills = area.querySelector('[name=skills]');
      const preview = document.createElement('div');
      preview.className = 'profile-tags span-2';
      preview.setAttribute('aria-label', 'Các kỹ năng đã chọn');
      skills.closest('label').after(preview);
      const update = () => {
        preview.replaceChildren(
          ...[
            ...new Set(
              skills.value
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean),
            ),
          ]
            .slice(0, 30)
            .map((value) => {
              const tag = document.createElement('span');
              tag.className = 'tag';
              tag.textContent = value;
              return tag;
            }),
        );
      };
      skills.addEventListener('input', update);
      update();
    }
    if (role === 'STUDENT') {
      extra.innerHTML =
        form(
          'cv',
          'CV cá nhân (PDF)',
          '<label>Chọn CV<input name="file" type="file" accept=".pdf" required><small>PDF tối đa 5 MB. CV chỉ được truy cập qua phiên đăng nhập của bạn.</small></label>',
          'Tải CV lên',
        ) +
        (p.cv_file_id
          ? '<section class="panel"><div class="panel-body"><p>CV của bạn đã được lưu.</p><button type="button" data-s2-action="view-cv">Xem CV trực tiếp</button></div></section>'
          : '<div class="s2-info">' +
            icon('file') +
            '<p>Lưu hồ sơ trước, sau đó tải CV để hoàn thiện thông tin cá nhân.</p></div>');
    }
    if (role === 'LECTURER') {
      const [campaigns, quotas] = await Promise.all([
        c.api('/master-data/campaigns'),
        c.api('/profiles/me/quotas'),
      ]);
      if (!area.isConnected) {
        return;
      }
      extra.innerHTML =
        form(
          'quota',
          'Hạn mức hướng dẫn theo đợt',
          select('campaign_id', 'Đợt', campaigns) +
            input('max_students', 'Số SV tối đa', 10, 'number', 'required min="0" max="1000"') +
            input('max_topics', 'Số đề tài tối đa', 5, 'number', 'required min="0" max="1000"'),
        ) +
        /* HTML */ `<section class="panel">
          <div class="panel-header"><h2>Hạn mức đã cấu hình</h2></div>
          ${table(
            ['Đợt', 'Sinh viên', 'Đề tài'],
            quotas.map(
              (q) =>
                /* HTML */ `<tr>
                  <td>${esc(q.campaign_name)}</td>
                  <td>${esc(q.current_assigned_students)} / ${esc(q.max_students)}</td>
                  <td>${esc(q.max_topics)}</td>
                </tr>`,
            ),
          )}
        </section>`;
      const quotaForm = extra.querySelector('[data-s2-form=quota]');
      const fillQuota = () => {
        const saved = quotas.find((q) => q.campaign_id === quotaForm.elements.campaign_id.value);
        quotaForm.elements.max_students.value = saved?.max_students ?? 10;
        quotaForm.elements.max_topics.value = saved?.max_topics ?? 5;
      };
      quotaForm.elements.campaign_id.addEventListener('change', fillQuota);
      fillQuota();
    }
    return;
  }
  if (page === 'campaigns') {
    await renderCampaigns(area);
  }
}

let campaignsCache = [];
let timelineCache = { milestones: [] };
let eligibilityCache = [];

async function renderCampaigns(area) {
  const [campaigns, faculties, majors, semesters, systems] = await Promise.all([
    c.api('/master-data/campaigns'),
    c.api('/master-data/faculties'),
    c.api('/master-data/majors'),
    c.api('/master-data/semesters'),
    c.api('/master-data/training-systems'),
  ]);
  if (!area.isConnected) {
    return;
  }
  campaignsCache = campaigns;
  if (!campaigns.some((v) => v.id === selected)) {
    selected = campaigns[0]?.id || '';
  }
  const campaign = campaigns.find((v) => v.id === selected);
  area.innerHTML = /* HTML */ `<section class="panel">
      <div class="panel-header">
        <h2>Đợt thực tập & đồ án</h2>
        ${manage() ? '<button type="button" data-s2-action="new-campaign">Thêm đợt</button>' : ''}
      </div>
      <div class="panel-body">${select('s2-campaign', 'Đợt đang xem', campaigns, selected)}</div>
    </section>
    <div id="campaign-details"></div>`;
  const details = area.querySelector('#campaign-details');
  if (manage() && editing) {
    const p = editing === 'new' ? {} : campaign || {};
    const types = [
      { id: 'THESIS', name: 'Đồ án / Khóa luận' },
      { id: 'INTERNSHIP', name: 'Thực tập' },
      { id: 'COMBINED', name: 'Kết hợp' },
    ];
    details.innerHTML = form(
      'campaign',
      editing === 'new' ? 'Tạo đợt mới' : 'Cấu hình đợt',
      input('code', 'Mã đợt', p.code || '', 'text', 'required maxlength="50"') +
        input('name', 'Tên đợt', p.name || '', 'text', 'required maxlength="255"') +
        (editing === 'new'
          ? select('faculty_id', 'Khoa', faculties) +
            select('major_id', 'Ngành', majors, '', true) +
            select('semester_id', 'Học kỳ', semesters)
          : '<p class="small muted span-2">Khoa/ngành/học kỳ được giữ cố định để bảo toàn liên kết dữ liệu.</p>') +
        select('type', 'Loại đợt', types, p.type || 'THESIS') +
        select(
          'training_system',
          'Hệ đào tạo',
          systems.map((s) => ({ id: s.code, name: s.name })),
          p.training_system || '',
          true,
        ) +
        (editing === 'new'
          ? ''
          : select(
              'status',
              'Trạng thái',
              Object.entries(statuses).map(([id, name]) => ({ id, name })),
              p.status,
            )) +
        input(
          'max_students_per_topic',
          'Số SV tối đa / đề tài',
          p.max_students_per_topic ?? 2,
          'number',
          'required min="1" max="50"',
        ) +
        input(
          'max_wish_choices',
          'Số nguyện vọng tối đa',
          p.max_wish_choices ?? 3,
          'number',
          'required min="1" max="5"',
        ) +
        /* HTML */ `<label class="checkbox span-2"
            ><input
              type="checkbox"
              name="allow_student_propose_topic"
              ${p.allow_student_propose_topic !== false ? 'checked' : ''}
            />Cho phép sinh viên tự đề xuất đề tài</label
          >
          <div><button type="button" data-s2-action="cancel-campaign">Hủy</button></div>`,
    );
    return;
  }
  if (!campaign) {
    details.innerHTML = '<p class="empty">Chưa có đợt trong phạm vi của bạn.</p>';
    return;
  }
  details.innerHTML = /* HTML */ `<section class="panel">
      <div class="panel-header">
        <h2>${esc(campaign.name)}</h2>
        <span class="tag">${esc(statuses[campaign.status])}</span>
      </div>
      <div class="panel-body">
        <div class="s2-metrics">
          <div>
            <span>Sinh viên / đề tài</span><strong>${esc(campaign.max_students_per_topic)}</strong>
          </div>
          <div>
            <span>Nguyện vọng tối đa</span><strong>${esc(campaign.max_wish_choices)}</strong>
          </div>
          <div>
            <span>Tự đề xuất đề tài</span
            ><strong>${campaign.allow_student_propose_topic ? 'Cho phép' : 'Tắt'}</strong>
          </div>
          <div>
            <span>Hệ đào tạo</span
            ><strong
              >${esc(systems.find((s) => s.code === campaign.training_system)?.name || 'Tất cả')}</strong
            >
          </div>
        </div>
        ${manage() ? '<div class="row-actions"><button data-s2-action="edit-campaign">Sửa cấu hình</button><button class="danger" data-s2-action="delete-campaign">Xóa đợt nháp</button></div>' : '<p id="gate-message" role="status">Đang kiểm tra điều kiện đăng ký…</p><button class="primary" data-s2-action="enroll" disabled>Đăng ký tham gia đợt</button>'}
      </div>
    </section>
    <div id="timeline-area"></div>
    <div id="eligibility-area"></div>`;
  const data = await c.api(`/campaigns/${selected}/timeline`);
  if (!area.isConnected) {
    return;
  }
  timelineCache = data;
  const timelineArea = details.querySelector('#timeline-area');
  timelineArea.innerHTML = /* HTML */ `<section class="panel">
    <div class="panel-header">
      <h2>Mốc thời gian của đợt</h2>
      <span class="small muted">Giờ hiển thị theo máy của bạn</span>
    </div>
    ${table(
      ['Giai đoạn', 'Bắt đầu', 'Kết thúc', 'Trạng thái'],
      data.milestones.map(
        (m) =>
          /* HTML */ `<tr>
            <td>
              ${esc(m.title)}<br /><span class="small muted">${esc(phaseNames[m.phase])}</span>
            </td>
            <td>${esc(date(m.start_at))}</td>
            <td>${esc(date(m.end_at))}</td>
            <td>
              ${m.is_locked_override === true ? 'Khóa thủ công' : new Date(data.server_time) < new Date(m.start_at) ? 'Chưa mở' : new Date(data.server_time) >= new Date(m.end_at) ? 'Đã hết hạn' : 'Đang mở'}
            </td>
          </tr>`,
      ),
    )}
  </section>`;
  if (!manage()) {
    await refreshGate();
    return;
  }
  const eligibility = await c.api(`/campaigns/${selected}/eligibility`);
  if (!area.isConnected) {
    return;
  }
  eligibilityCache = eligibility;
  timelineArea.insertAdjacentHTML(
    'beforeend',
    /* HTML */ `<div class="s2-grid">
        ${form(
          'milestone',
          'Thiết lập mốc thời gian',
          select(
            'phase',
            'Giai đoạn',
            Object.entries(phaseNames).map(([id, name]) => ({ id, name })),
          ) +
            input('title', 'Tên mốc', '', 'text', 'required maxlength="255"') +
            input('start_at', 'Bắt đầu', '', 'datetime-local', 'required') +
            input('end_at', 'Kết thúc', '', 'datetime-local', 'required') +
            '<label class="checkbox span-2"><input type="checkbox" name="is_locked">Khóa thủ công giai đoạn này</label>',
        )}
        <section class="panel">
          <div class="panel-header"><h2>Ngoại lệ cho cá nhân</h2></div>
          <div class="panel-body">
            <p class="small muted">
              Gia hạn riêng sau hạn chung. Ngoại lệ không vượt qua trạng thái đóng đợt, khóa thủ
              công hoặc điều kiện tham gia.
            </p>
          </div>
          ${table(
            ['Sinh viên', 'Gia hạn đến', 'Lý do', 'Thao tác'],
            data.overrides.map(
              (o) =>
                /* HTML */ `<tr>
                  <td>${esc(o.code)}</td>
                  <td>${esc(date(o.extended_until))}</td>
                  <td>${esc(o.reason)}</td>
                  <td>
                    <button data-s2-action="revoke-override" data-id="${esc(o.id)}">Thu hồi</button>
                  </td>
                </tr>`,
            ),
          )}
        </section>
      </div>
      ${form(
        'override',
        'Cấp gia hạn riêng',
        select('milestone_id', 'Giai đoạn', data.milestones) +
          select(
            'student_id',
            'Sinh viên',
            eligibility
              .filter((e) => e.status === 'ELIGIBLE')
              .map((e) => ({ id: e.student_id, name: e.code + ' · ' + e.full_name })),
          ) +
          input('extended_until', 'Gia hạn đến', '', 'datetime-local', 'required') +
          textarea('reason', 'Lý do'),
      )}`,
  );
  // Milestone records use title rather than name.
  const milestoneSelect = timelineArea.querySelector('[name=milestone_id]');
  if (milestoneSelect) {
    milestoneSelect.innerHTML = data.milestones
      .map((m) => /* HTML */ `<option value="${esc(m.id)}">${esc(m.title)}</option>`)
      .join('');
  }
  details.querySelector('#eligibility-area').innerHTML = /* HTML */ `<section class="panel">
      <div class="panel-header">
        <h2>Danh sách điều kiện tham gia</h2>
        <button data-s2-action="eligibility-template">Tải mẫu Excel</button>
      </div>
      ${table(
        ['Mã SV', 'Họ tên', 'Điều kiện', 'Lý do'],
        eligibility.map(
          (e) =>
            /* HTML */ `<tr>
              <td>${esc(e.code)}</td>
              <td>${esc(e.full_name)}</td>
              <td>${esc(e.status)}</td>
              <td>${esc(e.ineligible_reason || '—')}</td>
            </tr>`,
        ),
      )}
    </section>
    ${form('eligibility', 'Nhập danh sách đủ điều kiện', '<label class="span-2">File XLSX<input type="file" name="file" accept=".xlsx" required><small>Trạng thái: ELIGIBLE, INELIGIBLE, DROPPED_OUT hoặc DEFERRED. Sinh viên phải có hồ sơ đúng ngành/khoa/hệ đào tạo của đợt.</small></label>', 'Nhập danh sách')}
    <div id="s2-report">${report ? resultsHTML(report) : ''}</div>`;
}

async function refreshGate() {
  const button = document.querySelector('[data-s2-action=enroll]');
  const message = document.querySelector('#gate-message');
  if (!button || !selected || polling) {
    return;
  }
  polling = true;
  try {
    const id = selected;
    const data = await c.api(`/campaigns/${id}/gate`);
    if (!button.isConnected || id !== selected) {
      return;
    }
    button.disabled = !data.allowed || data.registered;
    button.textContent = data.registered ? 'Đã đăng ký tham gia' : 'Đăng ký tham gia đợt';
    message.textContent =
      data.reason + (data.effective_end ? ' · Hạn của bạn: ' + date(data.effective_end) : '');
  } catch (e) {
    if (message?.isConnected) {
      message.textContent = e.message;
    }
    if (button.isConnected) {
      button.disabled = true;
    }
  } finally {
    polling = false;
  }
}

export function setupSprint2(context) {
  c = context;
  const app = document.querySelector('#app');
  setInterval(() => {
    if (location.hash === '#campaigns' && c.session()) {
      void refreshGate();
    }
  }, 15000);
  window.addEventListener('hashchange', releaseCV);
  app.addEventListener('change', async (event) => {
    if (event.target.name === 's2-campaign') {
      selected = event.target.value;
      editing = false;
      report = null;
      await c.render();
    }
    if (event.target.name === 'phase' && event.target.closest('[data-s2-form=milestone]')) {
      const m = timelineCache.milestones.find((m) => m.phase === event.target.value);
      const f = event.target.form;
      if (m) {
        f.elements.title.value = m.title;
        f.elements.start_at.value = localDate(m.start_at);
        f.elements.end_at.value = localDate(m.end_at);
        f.elements.is_locked.checked = m.is_locked_override === true;
      } else {
        f.elements.title.value = phaseNames[event.target.value];
        f.elements.start_at.value = '';
        f.elements.end_at.value = '';
        f.elements.is_locked.checked = false;
      }
    }
  });
  app.addEventListener('submit', async (event) => {
    const f = event.target.closest('[data-s2-form]');
    if (!f) {
      return;
    }
    event.preventDefault();
    if (working) {
      return;
    }
    working = true;
    const button = f.querySelector('[type=submit]');
    button.disabled = true;
    const error = f.querySelector('.error-text');
    error.hidden = true;
    const formData = new FormData(f);
    const v = Object.fromEntries(formData);
    const kind = f.dataset.s2Form;
    try {
      if (kind === 'bulk' || kind === 'eligibility') {
        const body = new FormData();
        body.set('file', v.file);
        if (v.file.size > 5 * 1024 * 1024) {
          throw Error('File tối đa 5 MB');
        }
        report = await c.api(
          kind === 'bulk' ? `/admin/bulk/${v.kind}` : `/campaigns/${selected}/eligibility`,
          { method: 'POST', body },
        );
        await c.render();
        return;
      }
      if (kind === 'profile') {
        if (c.session().active_role.role_code === 'STUDENT') {
          v.gpa = Number(v.gpa);
          v.skills = v.skills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }
        if (c.session().active_role.role_code === 'LECTURER') {
          v.research_directions = v.research_directions
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }
        await c.api('/profiles/me', { method: 'PUT', body: v });
      }
      if (kind === 'cv') {
        if (v.file.size > 5 * 1024 * 1024) {
          throw Error('CV tối đa 5 MB');
        }
        await c.api('/profiles/me/cv', { method: 'POST', body: formData });
      }
      if (kind === 'quota') {
        await c.api(`/profiles/me/quotas/${v.campaign_id}`, {
          method: 'PUT',
          body: { max_students: Number(v.max_students), max_topics: Number(v.max_topics) },
        });
      }
      if (kind === 'campaign') {
        v.max_students_per_topic = Number(v.max_students_per_topic);
        v.max_wish_choices = Number(v.max_wish_choices);
        v.allow_student_propose_topic = formData.has('allow_student_propose_topic');
        const result = await c.api(
          '/master-data/campaigns' + (editing === 'new' ? '' : '/' + selected),
          { method: editing === 'new' ? 'POST' : 'PATCH', body: v },
        );
        selected = result.id;
        editing = false;
      }
      if (kind === 'milestone') {
        await c.api(`/campaigns/${selected}/timeline`, {
          method: 'PUT',
          body: {
            ...v,
            start_at: new Date(v.start_at).toISOString(),
            end_at: new Date(v.end_at).toISOString(),
            is_locked: formData.has('is_locked'),
          },
        });
      }
      if (kind === 'override') {
        await c.api(`/campaigns/${selected}/overrides`, {
          method: 'POST',
          body: { ...v, extended_until: new Date(v.extended_until).toISOString() },
        });
      }
      await c.render();
      c.notify('Đã lưu thông tin.');
    } catch (e) {
      if (error.isConnected) {
        error.textContent = e.message;
        error.hidden = false;
      } else {
        c.notify(e.message, true);
      }
    } finally {
      working = false;
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  });
  app.addEventListener('click', async (event) => {
    const b = event.target.closest('[data-s2-action]');
    if (!b || working) {
      return;
    }
    const action = b.dataset.s2Action;
    working = true;
    b.disabled = true;
    try {
      if (action === 'bulk-template') {
        await download(
          `/admin/bulk/${document.querySelector('[name=kind]').value}/template`,
          'mau-' + document.querySelector('[name=kind]').value + '.xlsx',
        );
      }
      if (action === 'eligibility-template') {
        await download('/campaigns/eligibility-template', 'mau-dieu-kien.xlsx');
      }
      if (action === 'new-campaign' || action === 'edit-campaign') {
        editing = action === 'new-campaign' ? 'new' : 'edit';
        await c.render();
      }
      if (action === 'cancel-campaign') {
        editing = false;
        await c.render();
      }
      if (
        action === 'delete-campaign' &&
        confirm('Xóa đợt nháp? Đợt có dữ liệu liên quan sẽ không được xóa.')
      ) {
        await c.api(`/master-data/campaigns/${selected}`, { method: 'DELETE' });
        selected = '';
        await c.render();
      }
      if (action === 'revoke-override' && confirm('Thu hồi gia hạn riêng này?')) {
        await c.api(`/campaigns/${selected}/overrides/${b.dataset.id}`, { method: 'DELETE' });
        await c.render();
      }
      if (action === 'enroll') {
        const result = await c.api(`/campaigns/${selected}/enroll`, { method: 'POST', body: {} });
        c.notify(result.message);
        await refreshGate();
      }
      if (action === 'view-cv') {
        releaseCV();
        const response = await c.request('/profiles/me/cv');
        cvURL = URL.createObjectURL(await response.blob());
        const dialog = document.createElement('dialog');
        dialog.id = 'cv-dialog';
        dialog.setAttribute('aria-label', 'Xem CV PDF');
        dialog.innerHTML = /* HTML */ `<div class="cv-toolbar">
            <strong>CV cá nhân</strong><a href="${cvURL}" download="CV.pdf">Tải PDF</a
            ><button type="button" data-s2-action="close-cv">Đóng</button>
          </div>
          <iframe title="Nội dung CV PDF" src="${cvURL}"></iframe>
          <p class="small muted">Nếu trình duyệt không hỗ trợ xem PDF, chọn Tải PDF.</p>`;
        document.body.append(dialog);
        dialog.addEventListener('close', releaseCV, { once: true });
        dialog.showModal();
      }
    } catch (e) {
      c.notify(e.message, true);
    } finally {
      working = false;
      if (b.isConnected) {
        b.disabled = false;
      }
      enhanceUI(app);
    }
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-s2-action=close-cv]')) {
      document.querySelector('#cv-dialog')?.close();
    }
  });
}
