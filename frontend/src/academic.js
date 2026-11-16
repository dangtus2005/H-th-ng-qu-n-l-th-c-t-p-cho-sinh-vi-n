import { campaignLabel } from './ui.js';

const targetLabels = {
  THESIS_SUPERVISOR: 'Giảng viên hướng dẫn đồ án',
  INTERNSHIP_LECTURER: 'Giảng viên thực tập',
  INTERNSHIP_MENTOR: 'Mentor doanh nghiệp',
};
const slotLabels = {
  OUTLINE_SUBMISSION: 'Đề cương',
  MIDTERM_REPORT_1: 'Báo cáo giữa kỳ 1',
  MIDTERM_REPORT_2: 'Báo cáo giữa kỳ 2',
  FINAL_SUBMISSION: 'Báo cáo cuối kỳ',
  ...targetLabels,
};
const placementLabels = {
  PENDING_VERIFICATION: 'Chờ xác minh',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  IN_PROGRESS: 'Đang thực tập',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
};

export async function renderAcademic(page, area, { api, request, esc, notify, role }) {
  const student = role === 'STUDENT';
  const teacher = role === 'LECTURER';
  const mentor = role === 'ENTERPRISE_MENTOR';
  const panel = (title, body) =>
    `<section class="panel"><div class="panel-header"><h2>${title}</h2></div>${body}</section>`;
  const opt = (value, label, selected = '') =>
    `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
  const input = (name, label, value = '', type = 'text', attrs = '') =>
    `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
  const note = (name, label, max = 2000, value = '', required = false) =>
    `<label class="span-2">${label}<textarea name="${name}" maxlength="${max}" ${required ? 'required' : ''}>${esc(value)}</textarea></label>`;
  const form = (
    kind,
    fields,
    label,
    id = '',
    extra = '',
  ) => `<form class="panel-body" data-academic-form="${kind}" data-id="${esc(id)}" ${extra}>
    <div class="form-grid">${fields}</div><div class="form-actions"><button type="submit" class="primary">${label}</button></div></form>`;
  const select = (
    name,
    label,
    choices,
    selected = '',
    placeholder = 'Chọn',
  ) => `<label>${label}<select name="${name}" required>
    ${opt('', placeholder)}${choices.map((c) => opt(c.id, c.label, selected)).join('')}</select></label>`;
  const action = (kind, label, id = '', name = '') =>
    `<button type="button" data-academic-action="${kind}" data-id="${esc(id)}" data-name="${esc(name)}">${label}</button>`;
  const empty = (message) => `<p class="empty">${message}</p>`;
  const date = (value) => esc(new Date(value).toLocaleString('vi-VN'));
  const fileInput = (required) =>
    `<label>Tệp PDF (tối đa 5 MB)<input name="document" type="file" accept=".pdf,application/pdf" ${required ? 'required' : ''}></label>`;
  const reportForm = (kind, milestones) =>
    milestones.length
      ? form(
          kind,
          select(
            'milestone_id',
            'Mốc nộp',
            milestones.map((m) => ({ id: m.id, label: m.title })),
          ) +
            fileInput(true) +
            note('description', 'Ghi chú'),
          'Nộp báo cáo',
        )
      : empty('Đợt chưa có mốc nộp báo cáo.');
  const companyFields = (c = {}) =>
    input('name', 'Tên doanh nghiệp', c.name, 'text', 'maxlength="255" required') +
    input('industry', 'Lĩnh vực', c.industry, 'text', 'maxlength="150"') +
    input('address', 'Địa chỉ', c.address, 'text', 'maxlength="500"') +
    input('contact_email', 'Email liên hệ', c.contact_email, 'email', 'maxlength="255"') +
    input('contact_phone', 'Điện thoại', c.contact_phone, 'tel', 'maxlength="20"');
  const milestoneList = (milestones) =>
    milestones.length
      ? `<details class="panel-body"><summary>Mốc nộp và hạn</summary><ul>
    ${milestones
      .map(
        (m) => `<li>${esc(m.title)} · ${date(m.start_at)} đến ${date(m.end_at)}
      ${m.hard_deadline_at && !m.is_locked_override ? ' · Nhận bài trễ đến ' + date(m.hard_deadline_at) : ''}
      ${m.is_locked_override ? ' · Đã khóa' : ''}</li>`,
      )
      .join('')}</ul></details>`
      : '';
  const campaignRows = await api(
    mentor && page === 'internships' ? '/mentor-campaigns' : '/master-data/campaigns',
  );
  const campaigns = campaignRows.filter(
    (c) =>
      page === 'rubrics' ||
      (page === 'thesis-reports' ? c.type !== 'INTERNSHIP' : c.type !== 'THESIS'),
  );
  if (!area.isConnected) return;
  if (!campaigns.length) {
    area.innerHTML = empty(
      mentor ? 'Chưa có hồ sơ thực tập được phân công.' : 'Chưa có đợt phù hợp.',
    );
    return;
  }
  area.innerHTML =
    panel(
      'Đợt đang xem',
      `<div class="panel-body"><label>Đợt<select data-academic-campaign>
    ${campaigns.map((c) => opt(c.id, campaignLabel(c))).join('')}</select></label></div>`,
    ) + '<div data-academic-content aria-live="polite"></div>';
  const campaign = area.querySelector('[data-academic-campaign]');
  const output = area.querySelector('[data-academic-content]');
  let generation = 0;
  let working = false;
  let selectedId = '';
  let data;
  const endpoint = () => `/campaigns/${campaign.value}/${page}`;

  function renderRubrics() {
    const criterion =
      () => `<fieldset data-criterion><legend>Tiêu chí</legend><div class="form-grid">
      ${input('title', 'Tên tiêu chí', '', 'text', 'maxlength="150" required')}
      ${input('max', 'Điểm tối đa', 10, 'number', 'min="1" max="100" required')}
      ${input('weight', 'Trọng số (%)', 100, 'number', 'min="1" max="100" required')}
      ${note('guide', 'Hướng dẫn chấm', 800)}
      ${action('remove-criterion', 'Bỏ tiêu chí')}</div></fieldset>`;
    output.innerHTML =
      panel(
        'Tạo rubric',
        form(
          'create-rubric',
          input('name', 'Tên rubric', '', 'text', 'maxlength="150" required') +
            select(
              'target',
              'Vai trò chấm',
              Object.entries(targetLabels).map(([id, label]) => ({ id, label })),
            ) +
            `<div class="span-2" data-criteria>${criterion()}</div>${action('add-criterion', 'Thêm tiêu chí')}`,
          'Lưu rubric',
        ),
      ) +
      panel(
        'Gắn rubric vào đợt',
        data.slots
          .map((slot) => {
            const target = slot.startsWith('INTERNSHIP') ? slot : 'THESIS_SUPERVISOR';
            const templates = data.templates.filter((t) => t.target === target);
            const binding = data.bindings.find((b) => b.slot === slot);
            return templates.length
              ? form(
                  'bind-rubric',
                  select(
                    'template_id',
                    slotLabels[slot],
                    templates.map((t) => ({ id: t.id, label: t.name })),
                    binding?.template_id,
                  ),
                  'Gắn rubric',
                  slot,
                )
              : `<p class="panel-body muted">${esc(slotLabels[slot])} · Chưa có mẫu phù hợp.</p>`;
          })
          .join(''),
      ) +
      panel(
        'Thư viện của khoa',
        `<div class="panel-body">${
          data.templates
            .map(
              (t) => `<details><summary>${esc(t.name)} · ${esc(targetLabels[t.target])}</summary>
        <ul>${t.criteria.map((c) => `<li>${esc(c.title)} · tối đa ${esc(c.max)} · ${esc(c.weight)}%${c.guide ? ' · ' + esc(c.guide) : ''}</li>`).join('')}</ul></details>`,
            )
            .join('') || empty('Chưa có rubric.')
        }</div>`,
      );
    output.querySelector('[data-academic-action=add-criterion]').addEventListener('click', () => {
      const list = output.querySelector('[data-criteria]');
      if (list.children.length < 12) list.insertAdjacentHTML('beforeend', criterion());
    });
  }

  function gradeForm(kind, template, prior, id, studentId = '') {
    const criteria = template.criteria;
    return form(
      kind,
      `<p class="span-2">${esc(template.name || template.rubric_name)} · Điểm quy về thang 10</p>
      <input type="hidden" name="template_id" value="${esc(template.template_id || template.id)}">
      ${criteria
        .map(
          (
            c,
            i,
          ) => `<div>${input('score', c.title, prior?.scores?.[i] ?? '', 'number', `min="0" max="${esc(c.max)}" step="0.01" required`)}
        <p class="small muted">Tối đa ${esc(c.max)} · ${esc(c.weight)}%${c.guide ? ' · ' + esc(c.guide) : ''}</p></div>`,
        )
        .join('')}${note('comment', 'Nhận xét', 2000, prior?.comment)}`,
      'Lưu đánh giá',
      id,
      `data-student="${esc(studentId)}"`,
    );
  }

  function renderThesis(detail) {
    const selected = data.assignments.find((a) => a.id === selectedId);
    output.innerHTML =
      panel(
        'Phân công đồ án',
        data.assignments.length
          ? `<div class="panel-body">${select(
              'record',
              'Nhóm / đề tài',
              data.assignments.map((a) => ({
                id: a.id,
                label: `${a.name || 'Nhóm'} · ${a.title_vi}`,
              })),
              selectedId,
            )}</div>`
          : empty('Chưa có phân công đồ án.'),
      ) +
      (selected
        ? `<p class="panel-body muted">Giảng viên hướng dẫn: ${esc(selected.supervisor)}</p>`
        : '') +
      (detail
        ? panel(
            'Các phiên bản báo cáo',
            milestoneList(data.milestones) +
              (student && selected.is_leader && detail.editable
                ? reportForm('thesis-submit', data.milestones)
                : '') +
              (detail.reports.length
                ? `<div class="panel-body">${detail.reports
                    .map(
                      (r) => `<details><summary>${esc(r.title)} · Bản ${esc(r.version_number)}
          ${r.is_late ? ' · Trễ ' + esc(r.late_minutes) + ' phút' : ''}</summary>
          <p>${date(r.submitted_at)}${r.description ? ' · ' + esc(r.description) : ''}</p>
          ${r.original_name ? action('thesis-file', 'Tải báo cáo', r.id, r.original_name) : ''}
          ${r.feedback.map((f) => `<p>${f.approved === true ? 'Đạt · ' : f.approved === false ? 'Cần sửa · ' : ''}${esc(f.content)} · ${date(f.created_at)}</p>`).join('')}
          ${
            teacher && detail.editable
              ? form(
                  'thesis-feedback',
                  note('content', 'Phản hồi', 4000, '', true) +
                    '<label>Kết luận<select name="approved"><option value="">Nhận xét</option><option value="true">Đạt</option><option value="false">Cần sửa</option></select></label>',
                  'Gửi phản hồi',
                  r.id,
                )
              : ''
          }
          ${
            teacher && detail.editable
              ? detail.members
                  .map((m) => {
                    const grade = r.grades.find((g) => g.student_id === m.student_id);
                    const template = grade ?? detail.rubrics.find((t) => t.slot === r.phase);
                    return `<details><summary>Chấm ${esc(m.full_name)} (${esc(m.code)})${grade ? ' · ' + esc(grade.total_score) + '/10' : ''}</summary>
              ${template ? gradeForm('thesis-grade', template, grade, r.id, m.student_id) : empty('Chưa gắn rubric cho mốc này.')}</details>`;
                  })
                  .join('')
              : r.grades
                  .map(
                    (g) =>
                      `<p>Điểm rubric: ${esc(g.total_score)}/10${g.comment ? ' · ' + esc(g.comment) : ''}</p>`,
                  )
                  .join('')
          }
          </details>`,
                    )
                    .join('')}</div>`
                : empty('Chưa có báo cáo.')),
          )
        : '');
  }

  function renderInternships(detail) {
    const p = detail?.placement;
    const choices = (rows) => rows.map((r) => ({ id: r.id, label: `${r.full_name} (${r.code})` }));
    const editableCompany = data.manager
      ? panel(
          'Doanh nghiệp của khoa',
          form('company', companyFields(), 'Thêm doanh nghiệp') +
            `<div class="panel-body">${data.companies
              .map(
                (
                  c,
                ) => `<details><summary>${esc(c.name)} · ${c.is_verified ? 'Đã xác minh' : 'Chờ xác minh'}</summary>
        ${form('company', companyFields(c), 'Lưu và xác minh', c.id)}
        ${c.is_verified ? form('link-mentor', input('code', 'Mã tài khoản mentor', '', 'text', 'maxlength="50" required'), 'Liên kết mentor', c.id) : ''}
        ${data.mentors
          .filter((m) => m.company_id === c.id)
          .map((m) => `<p>${esc(m.full_name)} (${esc(m.code)})</p>`)
          .join('')}
        </details>`,
              )
              .join('')}</div>`,
        )
      : '';
    const existing = data.placements[0];
    const mayApply = student && (!existing || existing.status === 'REJECTED');
    output.innerHTML =
      editableCompany +
      (mayApply
        ? panel(
            'Gửi hồ sơ thực tập',
            data.gate?.allowed
              ? data.companies.some((c) => c.is_verified) || data.allow_self_find_company
                ? form(
                    'apply',
                    `<label>Doanh nghiệp<select name="company_id">
          ${opt('', data.allow_self_find_company ? 'Tự tìm doanh nghiệp' : 'Chọn doanh nghiệp')}
          ${data.companies
            .filter((c) => c.is_verified)
            .map((c) => opt(c.id, c.name))
            .join('')}</select></label>
          ${input('job_title', 'Vị trí thực tập', '', 'text', 'maxlength="255" required')}
          ${input('start_date', 'Ngày bắt đầu', '', 'date', 'required')}${input('end_date', 'Ngày kết thúc', '', 'date', 'required')}
          ${data.allow_self_find_company ? `<fieldset class="span-2" data-self-company><legend>Thông tin nơi tự tìm</legend><div class="form-grid">${companyFields()}</div></fieldset>` : ''}
          <p class="span-2 muted">Có thể đính kèm giấy tiếp nhận.</p>${fileInput(false)}`,
                    'Gửi hồ sơ',
                  )
                : empty('Khoa chưa có doanh nghiệp đã xác minh.')
              : empty(esc(data.gate?.reason || 'Chưa mở hồ sơ.')),
          )
        : '') +
      panel(
        'Hồ sơ thực tập',
        data.placements.length
          ? `<div class="panel-body">${select(
              'record',
              'Sinh viên / doanh nghiệp',
              data.placements.map((x) => ({
                id: x.id,
                label: `${x.student_name} · ${x.company_name}`,
              })),
              selectedId,
            )}</div>`
          : empty('Chưa có hồ sơ.'),
      ) +
      (p
        ? panel(
            esc(p.company_name),
            `<div class="panel-body">
        <p>${esc(p.student_name)} · ${esc(p.job_title)} · ${esc(placementLabels[p.status] || p.status)}</p>
        <p>${esc(p.start_date || '—')} đến ${esc(p.end_date || '—')}</p>
        <p>Giảng viên: ${esc(p.lecturer_name || 'Chưa phân công')} · Mentor: ${esc(p.mentor_name || 'Chưa phân công')}</p>
        ${p.reject_reason ? `<p>Lý do: ${esc(p.reject_reason)}</p>` : ''}
        ${p.has_evidence && (student || data.manager) ? action('evidence', 'Tải minh chứng', p.id, 'minh-chung.pdf') : ''}
      </div>${
        data.manager && data.open && p.status === 'PENDING_VERIFICATION'
          ? form(
              'approve',
              select('lecturer_id', 'Giảng viên theo dõi', choices(data.lecturers)) +
                select(
                  'mentor_id',
                  'Mentor doanh nghiệp',
                  choices(data.mentors.filter((m) => m.company_id === p.company_id)),
                ),
              'Duyệt và phân công',
            ) + form('reject', note('reason', 'Lý do từ chối', 2000, '', true), 'Từ chối hồ sơ')
          : ''
      }`,
          )
        : '') +
      (p && ['APPROVED', 'IN_PROGRESS', 'COMPLETED'].includes(p.status)
        ? panel(
            'Nhật ký thực tập',
            (student && detail.writable
              ? form(
                  'log',
                  input('week', 'Tuần', 1, 'number', 'min="1" max="24" required') +
                    input('start_date', 'Ngày bắt đầu tuần', p.start_date, 'date', 'required') +
                    input('end_date', 'Ngày kết thúc tuần', p.start_date, 'date', 'required') +
                    note('tasks_performed', 'Công việc thực hiện', 4000, '', true) +
                    note('results_achieved', 'Kết quả', 4000),
                  'Lưu nhật ký',
                )
              : '') +
              `<div class="panel-body">${
                detail.logs
                  .map(
                    (
                      l,
                    ) => `<details><summary>Tuần ${esc(l.week_number)} · ${l.is_confirmed_by_mentor ? 'Đã xác nhận' : 'Chờ mentor'}</summary>
          <p>${esc(l.start_date)} đến ${esc(l.end_date)}</p><p>${esc(l.tasks_performed)}</p>
          <p>Kết quả: ${esc(l.results_achieved || '—')}</p>
          ${l.mentor_feedback ? `<p>Mentor: ${esc(l.mentor_feedback)}</p>` : ''}${l.lecturer_feedback ? `<p>Giảng viên: ${esc(l.lecturer_feedback)}</p>` : ''}
          ${student && detail.writable && !l.is_confirmed_by_mentor ? action('edit-log', 'Sửa nhật ký', l.week_number) : ''}
          ${
            (mentor || teacher) && detail.writable
              ? form(
                  'review-log',
                  note(
                    'feedback',
                    'Nhận xét',
                    4000,
                    mentor ? l.mentor_feedback : l.lecturer_feedback,
                    true,
                  ) +
                    (mentor && !l.is_confirmed_by_mentor
                      ? '<label class="checkbox"><input type="checkbox" name="confirm">Xác nhận nhật ký</label>'
                      : ''),
                  'Lưu phản hồi',
                  l.week_number,
                )
              : ''
          }</details>`,
                  )
                  .join('') || empty('Chưa có nhật ký.')
              }</div>`,
          ) +
          panel(
            'Báo cáo thực tập',
            milestoneList(data.milestones) +
              (student && detail.writable ? reportForm('intern-report', data.milestones) : '') +
              `<div class="panel-body">${
                detail.reports
                  .map(
                    (r) => `<p>${esc(r.title)} · Bản ${esc(r.version_number)}
            ${r.late_minutes ? ' · Trễ ' + esc(r.late_minutes) + ' phút' : ''} · ${date(r.submitted_at)}
            ${r.description ? ' · ' + esc(r.description) : ''} ${action('intern-file', 'Tải báo cáo', r.id, r.original_name)}</p>`,
                  )
                  .join('') || empty('Chưa có báo cáo.')
              }</div>`,
          ) +
          panel(
            'Đánh giá thực tập',
            `<div class="panel-body">${
              detail.grades
                .map(
                  (g) => `<p>${esc(targetLabels[g.evaluator_role])} ·
          ${esc(g.total_score)}/10${g.comment ? ' · ' + esc(g.comment) : ''}</p>`,
                )
                .join('') || empty('Chưa có điểm đánh giá.')
            }</div>` +
              (detail.evaluator && detail.writable
                ? detail.rubric
                  ? gradeForm('intern-grade', detail.rubric, detail.grades[0], '')
                  : empty('Chưa gắn rubric cho vai trò này.')
                : ''),
          )
        : '');
    const application = output.querySelector('[data-academic-form=apply]');
    const update = () => {
      const company = application.elements.company_id;
      const fields = application.querySelector('[data-self-company]');
      company.required = !fields;
      if (fields) fields.disabled = fields.hidden = Boolean(company.value);
    };
    if (application) {
      application.elements.company_id.addEventListener('change', update);
      update();
    }
    output.querySelectorAll('[data-academic-action=edit-log]').forEach((b) =>
      b.addEventListener('click', () => {
        const log = detail.logs.find((l) => String(l.week_number) === b.dataset.id);
        const logForm = output.querySelector('[data-academic-form=log]');
        for (const [name, value] of Object.entries({ ...log, week: log.week_number })) {
          if (logForm.elements[name]) logForm.elements[name].value = value ?? '';
        }
        logForm.elements.week.focus();
      }),
    );
  }

  async function load() {
    const id = ++generation;
    const path = endpoint();
    output.innerHTML = '<p class="loading">Đang tải…</p>';
    try {
      const result = await api(path);
      if (!output.isConnected || id !== generation) return;
      data = result;
      if (page === 'rubrics') {
        renderRubrics();
        return;
      }
      const rows = page === 'thesis-reports' ? data.assignments : data.placements;
      if (!rows.some((r) => r.id === selectedId)) selectedId = rows[0]?.id || '';
      const detail = selectedId
        ? await api(path + (page === 'thesis-reports' ? '/assignments/' : '/') + selectedId)
        : null;
      if (!output.isConnected || id !== generation) return;
      if (page === 'thesis-reports') renderThesis(detail);
      else renderInternships(detail);
      output.querySelector('[name=record]')?.addEventListener('change', (e) => {
        if (e.target.value) {
          selectedId = e.target.value;
          void load();
        } else e.target.value = selectedId;
      });
    } catch (error) {
      if (output.isConnected && id === generation)
        output.innerHTML = `<p role="alert" class="screen-error">${esc(error.message)}</p>`;
    }
  }

  output.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-academic-form]');
    if (!form) return;
    event.preventDefault();
    if (working) return;
    const fd = new FormData(form);
    const fields = Object.fromEntries(fd);
    const { academicForm: kind, id, student } = form.dataset;
    const root = endpoint();
    const placement = root + '/' + selectedId;
    let url = root;
    let method = 'POST';
    let body = fields;
    if (kind === 'create-rubric') {
      body.criteria = [...form.querySelectorAll('[data-criterion]')].map((c) => ({
        title: c.querySelector('[name=title]').value,
        max: Number(c.querySelector('[name=max]').value),
        weight: Number(c.querySelector('[name=weight]').value),
        guide: c.querySelector('[name=guide]').value,
      }));
      body = { name: fields.name, target: fields.target, criteria: body.criteria };
    } else if (kind === 'bind-rubric') {
      url += '/' + id;
      method = 'PUT';
    } else if (kind === 'thesis-submit') {
      url += '/assignments/' + selectedId;
      body = fd;
    } else if (kind === 'thesis-feedback') {
      url += '/' + id + '/feedback';
      body.approved = fields.approved === '' ? null : fields.approved === 'true';
    } else if (kind === 'thesis-grade' || kind === 'intern-grade') {
      url = kind === 'thesis-grade' ? root + '/' + id + '/grades/' + student : placement + '/grade';
      method = 'PUT';
      body = {
        template_id: fields.template_id,
        scores: fd.getAll('score').map(Number),
        comment: fields.comment,
      };
    } else if (kind === 'company') {
      url += '/companies' + (id ? '/' + id : '');
      if (id) method = 'PATCH';
    } else if (kind === 'link-mentor') url += '/companies/' + id + '/mentors';
    else if (kind === 'apply') {
      if (!fd.get('document')?.size) fd.delete('document');
      body = fd;
    } else if (kind === 'approve' || kind === 'reject') {
      url = placement;
      method = 'PATCH';
      body.decision = kind;
    } else if (kind === 'log') {
      url = placement + '/logs/' + fields.week;
      method = 'PUT';
    } else if (kind === 'review-log') {
      url = placement + '/logs/' + id;
      method = 'PATCH';
      body.confirm = fd.has('confirm');
    } else if (kind === 'intern-report') {
      url = placement + '/reports';
      body = fd;
    }
    const version = generation;
    const button = event.submitter ?? form.querySelector('button[type=submit]');
    working = true;
    button.disabled = true;
    try {
      await api(url, { method, body });
      if (output.isConnected && generation === version) {
        notify('Đã lưu.');
        await load();
      }
    } catch (error) {
      if (form.isConnected) notify(error.message, true);
    } finally {
      button.disabled = false;
      working = false;
    }
  });

  output.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-academic-action]');
    if (!button) return;
    const { academicAction: kind, id, name } = button.dataset;
    if (kind === 'remove-criterion') {
      const item = button.closest('[data-criterion]');
      if (item.parentElement.children.length > 1) item.remove();
      return;
    }
    const root = endpoint();
    const paths = {
      'thesis-file': root + '/' + id + '/file',
      'intern-file': root + '/' + selectedId + '/reports/' + id + '/file',
      evidence: root + '/' + id + '/evidence',
    };
    if (!paths[kind]) return;
    try {
      const response = await request(paths[kind]);
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name || 'bao-cao.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (button.isConnected) notify(error.message, true);
    }
  });
  campaign.addEventListener('change', () => {
    selectedId = '';
    void load();
  });
  await load();
}
