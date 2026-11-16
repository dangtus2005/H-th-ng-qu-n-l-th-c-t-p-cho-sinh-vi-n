import { campaignLabel } from './ui.js';

const reviewerRoles = new Set(['DEPT_HEAD', 'FACULTY_MANAGER', 'TRAINING_DEPT', 'SYSTEM_ADMIN']);
const workflowRoles = new Set(['STUDENT', 'LECTURER', ...reviewerRoles]);

export async function renderTopicWorkflow(area, { api, esc, notify, role }) {
  const panel = (title, content) =>
    `<section class="panel"><div class="panel-header"><h2>${title}</h2></div>${content}</section>`;
  if (!workflowRoles.has(role)) {
    area.innerHTML = '<p class="empty">Trang này không dành cho vai trò hiện tại.</p>';
    return;
  }
  const campaigns = (await api('/master-data/campaigns')).filter(
    (campaign) =>
      ['THESIS', 'COMBINED'].includes(campaign.type) &&
      ['OPEN', 'IN_PROGRESS'].includes(campaign.status),
  );
  if (!area.isConnected) return;
  if (!campaigns.length) {
    area.innerHTML = panel(
      'Quy trình đề tài Sprint 3',
      '<p class="empty">Không có đợt khóa luận hoặc đợt kết hợp đang mở trong phạm vi của bạn.</p>',
    );
    return;
  }

  const options = campaigns
    .map(
      (campaign) =>
        `<option value="${esc(campaign.id)}">${esc(campaignLabel(campaign))} · ${campaign.status === 'OPEN' ? 'Đang mở' : 'Đang thực hiện'}</option>`,
    )
    .join('');
  area.innerHTML =
    panel(
      'Chọn đợt',
      `<div class="panel-body">
        <label>Đợt khóa luận
          <select data-workflow-campaign>${options}</select>
        </label>
        <p class="small muted">Thao tác và danh sách đề tài được giới hạn trong đợt đã chọn.</p>
      </div>`,
    ) + '<div data-workflow-content aria-live="polite"></div>';

  const campaignSelect = area.querySelector('[data-workflow-campaign]');
  const output = area.querySelector('[data-workflow-content]');
  let loadId = 0;
  let working = false;

  const listText = (values) => (values?.length ? values.map(esc).join(', ') : '—');
  const errorPanel = (message) =>
    panel(
      'Không thể tải dữ liệu',
      `<p class="panel-body screen-error" role="alert">${esc(message)}</p>`,
    );
  const campaignPath = () =>
    `/topic-workflow/campaigns/${encodeURIComponent(campaignSelect.value)}/topics`;

  function lecturerView(campaign) {
    const maxStudents = Math.min(50, Math.max(1, Number(campaign.max_students_per_topic) || 2));
    return panel(
      'Gửi đề tài',
      `<p class="panel-body muted">Đề tài được gửi sẽ ở trạng thái chờ duyệt. Bạn có thể theo dõi các nghiệp vụ đề tài khác tại mục <a href="#thesis-topics">Đề tài đồ án</a>.</p>
      <form class="panel-body" data-workflow="submit">
        <div class="form-grid">
          <label>Tên đề tài<input name="title_vi" maxlength="500" required></label>
          <label>Tên tiếng Anh<input name="title_en" maxlength="500"></label>
          <label class="span-2">Mô tả<textarea name="description" maxlength="20000" required></textarea></label>
          <label class="span-2">Mục tiêu<textarea name="objectives" maxlength="10000"></textarea></label>
          <label>Lĩnh vực nghiên cứu<input name="research_field" maxlength="255"></label>
          <label>Số sinh viên tối đa<input type="number" name="max_students" min="1" max="${maxStudents}" value="${maxStudents}" required></label>
          <label class="span-2">Kỹ năng yêu cầu <span class="small muted">(phân cách bằng dấu phẩy)</span>
            <input name="required_skills" maxlength="4096" placeholder="Ví dụ: SQL, phân tích dữ liệu">
          </label>
          <label class="span-2">Công nghệ <span class="small muted">(phân cách bằng dấu phẩy)</span>
            <input name="technologies" maxlength="4096" placeholder="Ví dụ: PostgreSQL, Node.js">
          </label>
        </div>
        <p class="small muted">Mỗi danh sách tối đa 40 mục; mỗi mục tối đa 100 ký tự. Sức chứa không vượt quá giới hạn của đợt (${maxStudents} sinh viên).</p>
        <p class="screen-error" data-workflow-error role="alert" hidden></p>
        <p class="small" data-workflow-success role="status" aria-live="polite" hidden></p>
        <div class="form-actions"><button type="submit" class="primary">Gửi đề tài chờ duyệt</button></div>
      </form>`,
    );
  }

  function reviewerView(rows) {
    const items = rows
      .map(
        (topic) => `<section class="panel">
          <div class="panel-header">
            <div>
              <h2>${esc(topic.title_vi)}</h2>
              <p class="small muted">Người gửi: ${esc(topic.proposer_name)} (${esc(topic.proposer_code)}) · Bộ môn: ${esc(topic.department_name)}</p>
            </div>
            <span class="tag">Chờ duyệt</span>
          </div>
          <div class="panel-body">
            ${topic.title_en ? `<p><strong>Tên tiếng Anh:</strong> ${esc(topic.title_en)}</p>` : ''}
            <p><strong>Mô tả:</strong> ${esc(topic.description)}</p>
            ${topic.objectives ? `<p><strong>Mục tiêu:</strong> ${esc(topic.objectives)}</p>` : ''}
            <p><strong>Lĩnh vực:</strong> ${esc(topic.research_field || '—')} · <strong>Sức chứa:</strong> ${esc(topic.max_students)} sinh viên</p>
            <p><strong>Kỹ năng:</strong> ${listText(topic.required_skills)}</p>
            <p><strong>Công nghệ:</strong> ${listText(topic.technologies)}</p>
            <form class="panel-body" data-workflow="review" data-topic-id="${esc(topic.id)}">
              <label>Nhận xét<textarea name="feedback_comment" maxlength="4000" placeholder="Không bắt buộc"></textarea></label>
              <p class="screen-error" data-workflow-error role="alert" hidden></p>
              <div class="row-actions">
                <button type="submit" class="primary" value="APPROVED">Duyệt đề tài</button>
                <button type="submit" class="danger" value="REJECTED">Từ chối</button>
              </div>
            </form>
          </div>
        </section>`,
      )
      .join('');
    return panel(
      `Hàng chờ duyệt (${rows.length})`,
      rows.length
        ? `<div class="panel-body">${items}</div>`
        : '<p class="empty">Không có đề tài đang chờ duyệt.</p>',
    );
  }

  function studentView(rows) {
    const items = rows
      .map(
        (topic) => `<section class="panel">
          <div class="panel-header">
            <div>
              <h2>${esc(topic.title_vi)}</h2>
              ${topic.title_en ? `<p class="small muted">${esc(topic.title_en)}</p>` : ''}
            </div>
            <span class="tag">Đã duyệt</span>
          </div>
          <div class="panel-body">
            <p><strong>Giảng viên hướng dẫn:</strong> ${esc(topic.supervisor_name)}</p>
            <p><strong>Lĩnh vực:</strong> ${esc(topic.research_field || '—')} · <strong>Số sinh viên tối đa:</strong> ${esc(topic.max_students)}</p>
            <p>${esc(topic.description)}</p>
            ${topic.objectives ? `<p><strong>Mục tiêu:</strong> ${esc(topic.objectives)}</p>` : ''}
            <p><strong>Kỹ năng:</strong> ${listText(topic.required_skills)}</p>
            <p><strong>Công nghệ:</strong> ${listText(topic.technologies)}</p>
          </div>
        </section>`,
      )
      .join('');
    return panel(
      `Đề tài đã duyệt (${rows.length})`,
      rows.length
        ? `<div class="panel-body">${items}</div>`
        : '<p class="empty">Chưa có đề tài nào được duyệt trong đợt này.</p>',
    );
  }

  async function load() {
    const requestId = ++loadId;
    if (role === 'LECTURER') {
      output.innerHTML = lecturerView(campaigns.find((c) => c.id === campaignSelect.value));
      return;
    }

    output.innerHTML = '<p class="panel loading">Đang tải đề tài…</p>';
    try {
      const path = campaignPath();
      const rows = role === 'STUDENT' ? await api(path) : await api(`${path}/pending`);
      if (!output.isConnected || requestId !== loadId) return;
      output.innerHTML = role === 'STUDENT' ? studentView(rows) : reviewerView(rows);
    } catch (error) {
      if (output.isConnected && requestId === loadId) {
        output.innerHTML = errorPanel(error.message);
      }
    }
  }

  output.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-workflow]') || working) return;
    event.preventDefault();
    const kind = form.dataset.workflow;
    const errorBox = form.querySelector('[data-workflow-error]');
    errorBox.hidden = true;
    errorBox.textContent = '';
    let path = campaignPath();
    let body;
    let method = 'POST';

    if (kind === 'submit') {
      const fields = new FormData(form);
      const splitList = (value) =>
        value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      const requiredSkills = splitList(fields.get('required_skills'));
      const technologies = splitList(fields.get('technologies'));
      const invalidItem = [...requiredSkills, ...technologies].some((item) => item.length > 100);
      if (requiredSkills.length > 40 || technologies.length > 40 || invalidItem) {
        errorBox.textContent = 'Mỗi danh sách tối đa 40 mục và mỗi mục tối đa 100 ký tự.';
        errorBox.hidden = false;
        return;
      }
      body = Object.fromEntries(fields);
      body.required_skills = requiredSkills;
      body.technologies = technologies;
      body.max_students = Number(body.max_students);
    } else {
      path += `/${encodeURIComponent(form.dataset.topicId)}/decision`;
      method = 'PATCH';
      body = {
        decision: event.submitter?.value,
        feedback_comment: new FormData(form).get('feedback_comment'),
      };
    }

    const submitter = event.submitter;
    const wasDisabled = submitter?.disabled;
    working = true;
    if (submitter) submitter.disabled = true;
    try {
      const result = await api(path, { method, body });
      if (kind === 'submit' && form.isConnected) {
        form.reset();
        const capacity =
          Number(campaigns.find((c) => c.id === campaignSelect.value).max_students_per_topic) || 2;
        form.elements.namedItem('max_students').value = String(Math.min(50, Math.max(1, capacity)));
        const success = form.querySelector('[data-workflow-success]');
        success.textContent = `Đã gửi “${result.title_vi}”. Trạng thái hiện tại: chờ duyệt.`;
        success.hidden = false;
        notify('Đề tài đã được gửi và đang chờ duyệt.');
      } else if (form.isConnected) {
        notify(body.decision === 'APPROVED' ? 'Đã duyệt đề tài.' : 'Đã từ chối đề tài.');
        await load();
      }
    } catch (error) {
      if (form.isConnected) {
        errorBox.textContent = error.message;
        errorBox.hidden = false;
      }
    } finally {
      working = false;
      if (submitter) submitter.disabled = wasDisabled;
    }
  });

  campaignSelect.addEventListener('change', () => void load());
  await load();
}
