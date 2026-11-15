const statusNames = {
  DRAFT: 'Bản nháp',
  PENDING_APPROVAL: 'Chờ duyệt',
  REVISION_REQUIRED: 'Cần chỉnh sửa',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  ASSIGNED: 'Đã phân công',
  CANCELLED: 'Đã hủy',
  PENDING: 'Đang chờ',
  CONFIRMED: 'Đã xác nhận',
  DECLINED: 'Đã từ chối',
};

export async function renderThesisPrep(page, area, { api, request, esc, notify, role }) {
  const panel = (title, content) =>
    `<section class="panel"><div class="panel-header"><h2>${title}</h2></div>${content}</section>`;
  const option = (value, label, selected = '') =>
    `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
  const buttons = (label) =>
    `<div class="form-actions"><button type="submit" class="primary">${label}</button></div>`;
  const field = (label, name, value, max, required = false) =>
    `<label>${label}<input name="${name}" maxlength="${max}" value="${esc(value)}"${required ? ' required' : ''}></label>`;
  const status = (value) => esc(statusNames[value] || value);
  const errorBox = (error) => `<p class="screen-error" role="alert">${esc(error.message)}</p>`;
  const ownsForm = (form) => form instanceof HTMLFormElement && form.hasAttribute('data-prep');
  const findTopic = (id) => topics.find((t) => t.id === id);
  let topics = [];
  let currentPath = '';
  let loadId = 0;
  let working = false;

  async function archive(form, output) {
    const id = ++loadId;
    const params = new URLSearchParams(new FormData(form));
    try {
      const rows = await api('/topic-archive?' + params);
      if (!output.isConnected || loadId !== id) return;
      output.innerHTML = rows.length
        ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Đề tài</th><th>Năm học</th><th>Hướng</th><th>Giảng viên</th></tr></thead>
           <tbody>${rows
             .map(
               (
                 t,
               ) => `<tr><td><details><summary>${esc(t.title_vi)}</summary><p>${esc(t.description)}</p></details></td>
             <td>${esc(t.start_year)}–${esc(t.end_year)}</td><td>${esc(t.research_field || '—')}</td>
             <td>${esc(t.supervisor_name || 'Chờ phân công')}</td></tr>`,
             )
             .join('')}</tbody></table></div>`
        : '<p class="empty">Không tìm thấy đề tài phù hợp.</p>';
    } catch (error) {
      if (output.isConnected && loadId === id) output.innerHTML = errorBox(error);
    }
  }

  if (page === 'topic-archive') {
    area.innerHTML = panel(
      'Tra cứu đề tài đã duyệt',
      `<form class="panel-body" data-prep="archive"><div class="form-grid">
      ${field('Tên đề tài', 'q', '', 255)}
      <label>Năm bắt đầu<input type="number" name="year" min="1900" max="3000"></label>
      ${field('Hướng', 'direction', '', 255)}${field('Giảng viên hướng dẫn', 'lecturer', '', 255)}
      </div>${buttons('Tìm đề tài')}</form><div data-archive-results aria-live="polite"></div>`,
    );
    const form = area.querySelector('form');
    const output = area.querySelector('[data-archive-results]');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void archive(form, output);
    });
    await archive(form, output);
    return;
  }
  if (page === 'thesis-groups' && role !== 'STUDENT') {
    area.innerHTML = '<p class="empty">Trang này dành cho sinh viên.</p>';
    return;
  }
  const campaigns = (await api('/master-data/campaigns')).filter((c) => c.type !== 'INTERNSHIP');
  if (!area.isConnected) return;
  if (!campaigns.length) {
    area.innerHTML = '<p class="empty">Không có đợt đồ án trong phạm vi của bạn.</p>';
    return;
  }
  area.innerHTML =
    panel(
      'Đợt đồ án',
      `<div class="panel-body"><label>Đợt đang xem
    <select data-prep-campaign>${campaigns.map((c) => option(c.id, c.name)).join('')}</select>
    </label></div>`,
    ) + '<div data-prep-content aria-live="polite"></div>';
  const campaign = area.querySelector('[data-prep-campaign]');
  const output = area.querySelector('[data-prep-content]');
  const formMarkup = (type, body, label, id = '') =>
    `<form class="panel-body" data-prep="${type}" data-id="${esc(id)}"><div class="form-grid">${body}</div>${buttons(label)}</form>`;

  function renderGroups(data) {
    const active = data.groups.some((g) => g.confirmation_status === 'CONFIRMED');
    output.innerHTML =
      panel(
        'Nhóm và hướng đề tài',
        `<p class="panel-body muted">${esc(data.gate.reason)}</p>
      ${
        !active && data.gate.allowed
          ? formMarkup(
              'create-group',
              field('Tên nhóm', 'name', '', 150, true) +
                field('Hướng đề tài', 'research_direction', '', 255, true),
              'Lập nhóm',
            )
          : ''
      }
      ${data.groups.length ? '' : '<p class="empty">Bạn chưa có nhóm hoặc lời mời trong đợt này.</p>'}`,
      ) +
      data.groups
        .map((g) => {
          const editable = g.is_leader && !g.locked && data.gate.allowed;
          const invite = g.confirmation_status === 'PENDING';
          return panel(
            esc(g.name || 'Nhóm đồ án'),
            `<div class="panel-body">
          <p>Trưởng nhóm: ${esc(g.leader_name)} · ${status(g.confirmation_status)}</p>
          <p>Hướng: ${esc(g.research_direction || 'Chưa chọn')}</p>
          ${g.members?.length ? `<ul>${g.members.map((m) => `<li>${esc(m.full_name)} (${esc(m.code)}) · ${status(m.status)}</li>`).join('')}</ul>` : ''}
          ${g.locked && !invite ? '<p class="muted">Nhóm đang khóa thành viên do đã gửi nguyện vọng hoặc đã được phân công.</p>' : ''}
        </div>
        ${
          editable
            ? formMarkup(
                'edit-direction',
                field('Hướng đề tài', 'research_direction', g.research_direction, 255, true),
                'Lưu hướng',
                g.id,
              ) +
              formMarkup(
                'invite',
                field('Mã sinh viên', 'student_code', '', 50, true),
                'Mời thành viên',
                g.id,
              )
            : ''
        }
        ${
          invite
            ? `<form class="panel-body row-actions" data-prep="respond" data-id="${esc(g.id)}">
          <button type="submit" class="primary" value="CONFIRMED" ${data.gate.allowed && !g.locked && !active ? '' : 'disabled'}>Xác nhận vào nhóm</button>
          <button type="submit" value="DECLINED">Từ chối lời mời</button></form>`
            : ''
        }`,
          );
        })
        .join('');
  }

  function renderTopics(data, editId) {
    topics = data.topics;
    const selected = data.topics.find((t) => t.id === editId && t.can_edit);
    const remark = (label, name, value, max, required = false) =>
      `<label class="span-2">${label}<textarea name="${name}" maxlength="${max}" ${required ? 'required' : ''}>${esc(value)}</textarea></label>`;
    const t = selected || {};
    const fields =
      field('Tên đề tài', 'title_vi', t.title_vi, 500, true) +
      field('Hướng đề tài', 'research_field', t.research_field, 255, true) +
      remark('Mô tả', 'description', t.description, 8000, true) +
      remark('Mục tiêu', 'objectives', t.objectives, 4000) +
      field(
        'Yêu cầu kiến thức (phân cách bằng dấu phẩy)',
        'required_skills',
        t.required_skills?.join(', '),
        1500,
      ) +
      field(
        'Công nghệ (phân cách bằng dấu phẩy)',
        'technologies',
        t.technologies?.join(', '),
        1500,
      ) +
      `<label>Số sinh viên tối đa<input type="number" name="max_students" min="1" max="${esc(data.max_students)}" value="${esc(t.max_students ?? data.max_students)}" required></label>` +
      '<label>Tài liệu PDF (tối đa 5 MB)<input type="file" name="document" accept=".pdf,application/pdf"></label>';
    output.innerHTML =
      (role === 'LECTURER' && data.can_submit
        ? panel(
            selected ? 'Chỉnh sửa đề tài' : 'Đề xuất đề tài',
            formMarkup('topic', fields, 'Lưu đề tài', t.id),
          )
        : role === 'LECTURER'
          ? '<p class="panel-body muted">Chưa thể gửi đề tài. Kiểm tra mốc gửi đề tài tại mục Đợt.</p>'
          : '') +
      panel(
        'Danh sách đề tài',
        `<div class="panel-body">${
          data.topics.length
            ? data.topics
                .map(
                  (row) =>
                    `<details><summary>${esc(row.title_vi)} · ${status(row.status)}</summary>
          <p>Tác giả: ${esc(row.author_name)} · Hướng dẫn: ${esc(row.supervisor_name || 'Chờ phân công')}</p>
          <p>Hướng: ${esc(row.research_field || '—')} · Tối đa ${esc(row.max_students)} sinh viên</p>
          <p>${esc(row.description)}</p>
          ${row.objectives ? `<p>Mục tiêu: ${esc(row.objectives)}</p>` : ''}
          ${row.required_skills?.length ? `<p>Kiến thức: ${esc(row.required_skills.join(', '))}</p>` : ''}
          ${row.technologies?.length ? `<p>Công nghệ: ${esc(row.technologies.join(', '))}</p>` : ''}
          ${row.feedback ? `<p>Nhận xét: ${esc(row.feedback)}</p>` : ''}
          <div class="row-actions">
            ${row.has_document ? `<button type="button" data-prep-action="download" data-id="${esc(row.id)}">Tải PDF</button>` : ''}
            ${row.can_edit ? `<button type="button" data-prep-action="edit" data-id="${esc(row.id)}">Chỉnh sửa</button>` : ''}
            ${row.can_review ? `<button type="button" data-prep-action="similar" data-id="${esc(row.id)}">Kiểm tra trùng</button>` : ''}
          </div><div data-duplicates aria-live="polite"></div>
          ${
            row.assign_advisers?.length
              ? `<form class="panel-body" data-prep="assign-adviser" data-id="${esc(row.id)}">
            <label>Giảng viên hướng dẫn<select name="supervisor_id" required>
            ${option('', 'Chọn giảng viên')}${row.assign_advisers.map((a) => option(a.id, a.full_name)).join('')}
            </select></label>${buttons('Phân công hướng dẫn')}</form>`
              : row.assign_advisers
                ? '<p>Chưa có giảng viên phù hợp với bộ môn và đợt.</p>'
                : ''
          }
          ${
            row.can_review || row.can_adviser_review
              ? `<form class="panel-body" data-prep="review" data-id="${esc(row.id)}">
            ${remark('Nhận xét', 'feedback', '', 2000)}
            <div class="row-actions">
              ${row.can_review ? '<button type="submit" value="approve" class="primary">Duyệt</button>' : ''}
              ${row.can_endorse ? '<button type="submit" value="endorse" class="primary">Xác nhận hướng dẫn</button>' : ''}
              <button type="submit" value="revise">Yêu cầu sửa</button><button type="submit" value="reject">Từ chối</button>
            </div></form>`
              : ''
          }
        </details>`,
                )
                .join('')
            : '<p class="empty">Chưa có đề tài để hiển thị.</p>'
        }</div>`,
      );
  }

  async function load(editId = '') {
    const id = ++loadId;
    const section = page === 'thesis-groups' ? 'groups' : 'topics';
    currentPath = `/campaigns/${campaign.value}/${section}`;
    output.innerHTML = '<p class="loading">Đang tải…</p>';
    try {
      const data = await api(currentPath);
      if (!output.isConnected || loadId !== id) return;
      if (section === 'groups') renderGroups(data);
      else {
        renderTopics(data, editId);
        if (editId) output.querySelector('form[data-prep=topic] input')?.focus();
      }
    } catch (error) {
      if (output.isConnected && loadId === id) output.innerHTML = errorBox(error);
    }
  }

  output.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!ownsForm(form)) return;
    event.preventDefault();
    if (working) return;
    const kind = form.dataset.prep;
    const id = form.dataset.id;
    const fields = new FormData(form);
    let path = currentPath + (id ? '/' + id : '');
    let method = 'POST';
    let body = Object.fromEntries(fields);
    if (kind === 'edit-direction') method = 'PATCH';
    if (kind === 'invite') path += '/invitations';
    if (kind === 'respond') {
      path += '/invitations/me';
      method = 'PATCH';
      body = { decision: event.submitter?.value };
    }
    if (kind === 'review') {
      path += '/review';
      body.decision = event.submitter?.value;
    }
    if (kind === 'assign-adviser') {
      path += '/adviser';
      method = 'PUT';
    }
    if (kind === 'topic') {
      if (id) method = 'PATCH';
      if (!fields.get('document')?.size) fields.delete('document');
      body = fields;
    }
    const generation = loadId;
    const submitter = event.submitter;
    const initiallyDisabled = submitter?.disabled;
    working = true;
    if (submitter) submitter.disabled = true;
    try {
      await api(path, { method, body });
      if (generation === loadId && form.isConnected) {
        notify('Đã lưu thay đổi.');
        await load();
      }
    } catch (error) {
      if (form.isConnected) notify(error.message, true);
    } finally {
      working = false;
      if (submitter) submitter.disabled = initiallyDisabled;
    }
  });

  output.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-prep-action]');
    if (!btn) return;
    const { id, prepAction } = btn.dataset;
    if (prepAction === 'edit') {
      await load(id);
      return;
    }
    const path = currentPath + '/' + id;
    try {
      if (prepAction === 'similar') {
        const matches = await api(path + '/similar');
        if (!btn.isConnected) return;
        btn.closest('details').querySelector('[data-duplicates]').innerHTML = matches.length
          ? `<ul>${matches.map((t) => `<li>${esc(t.title_vi)} · ${esc(t.score)}% tương đồng tên</li>`).join('')}</ul>`
          : '<p>Chưa tìm thấy tiêu đề tương tự trong bộ môn.</p>';
      } else {
        const topic = findTopic(id);
        const response = await request(path + '/document');
        const url = URL.createObjectURL(await response.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = (topic?.title_vi || 'de-tai') + '.pdf';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      if (btn.isConnected) notify(error.message, true);
    }
  });
  campaign.addEventListener('change', () => void load());
  await load();
}
