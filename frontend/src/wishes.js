import { campaignLabel } from './ui.js';

const statuses = {
  PENDING_LECTURER: 'Chờ giảng viên',
  APPROVED_BY_LECTURER: 'Đã ghép cặp',
  REJECTED_BY_LECTURER: 'Từ chối',
  AUTO_ASSIGNED: 'Được phân công',
  CANCELLED: 'Đã hủy',
};

export async function renderWishes(area, { api, esc, notify, role }) {
  const student = role === 'STUDENT';
  if (!student && role !== 'LECTURER') {
    area.innerHTML = '<p class="empty">Trang này dành cho sinh viên và giảng viên.</p>';
    return;
  }
  const campaigns = (await api('/master-data/campaigns')).filter((c) => c.type !== 'INTERNSHIP');
  if (!area.isConnected) return;
  if (!campaigns.length) {
    area.innerHTML = '<p class="empty">Chưa có đợt trong phạm vi của bạn.</p>';
    return;
  }
  const option = (id, label) => `<option value="${esc(id)}">${esc(label)}</option>`;
  area.innerHTML = `<section class="panel"><div class="panel-body form-grid">
    <label>Đợt<select name="wish-campaign">${campaigns.map((c) => option(c.id, campaignLabel(c))).join('')}</select></label>
    ${student ? '<label>Nhóm<select name="wish-group" disabled></select></label>' : ''}
  </div></section><div class="${student ? 's2-grid' : 'lecturer-wishes'}" data-wish-results aria-live="polite"></div>`;
  const campaign = area.querySelector('[name=wish-campaign]');
  const group = area.querySelector('[name=wish-group]');
  const results = area.querySelector('[data-wish-results]');
  let loadId = 0;

  async function load(resetGroup) {
    const id = ++loadId;
    const endpoint = `/campaigns/${campaign.value}`;
    const current = () => area.isConnected && loadId === id;
    results.innerHTML = '<p class="loading">Đang tải…</p>';
    try {
      if (!student) {
        const [wishes, gate] = await Promise.all([
          api(endpoint + '/lecturer-wishes'),
          api(endpoint + '/gate?phase=MATCHING'),
        ]);
        if (current()) showLecturer(wishes, endpoint, gate);
        return;
      }
      if (resetGroup) {
        group.disabled = true;
        group.replaceChildren();
        const groups = await api(endpoint + '/wish-groups');
        if (!current()) return;
        group.innerHTML = groups.map((g) => option(g.id, g.name || 'Nhóm sinh viên')).join('');
        group.disabled = !groups.length;
      }
      if (!group.value) {
        results.innerHTML =
          '<p class="empty">Bạn chưa có nhóm trong đợt này. <a href="#thesis-groups">Lập nhóm hoặc xem lời mời</a>.</p>';
        return;
      }
      const groupEndpoint = `${endpoint}/wish-groups/${group.value}`;
      const data = await api(groupEndpoint);
      if (current()) showStudent(data, groupEndpoint);
    } catch (error) {
      if (current()) results.innerHTML = `<p class="screen-error">${esc(error.message)}</p>`;
    }
  }

  function showStudent(data, endpoint) {
    const wishes = data.registrations;
    const canEdit =
      data.group.is_leader &&
      !data.assignment &&
      data.gate.allowed &&
      wishes.length > 0 &&
      wishes.every((r) => r.status === 'PENDING_LECTURER');
    const used = new Set(wishes.map((r) => r.topic_id));
    const topics = data.topics.filter((t) => !used.has(t.id));
    const ranks = Array.from({ length: data.max_wish_choices }, (_, i) => i + 1).filter(
      (rank) => !wishes.some((r) => r.priority_order === rank),
    );
    const assignment = data.assignment;
    const offers = data.offers ?? [];
    const offerStatus = {
      PENDING: 'Chờ xác nhận',
      CONFIRMED: 'Đã xác nhận',
      DECLINED: 'Đã từ chối',
      EXPIRED: 'Hết hạn',
    };
    let reason = '';
    if (!data.group.is_leader) reason = 'Chỉ trưởng nhóm được gửi nguyện vọng.';
    else if (assignment) reason = 'Nhóm đã có đề tài được phân công.';
    else if (!data.gate.allowed) reason = data.gate.reason;
    else if (!ranks.length) reason = 'Nhóm đã dùng hết số nguyện vọng.';
    else if (!topics.length) reason = 'Chưa có đề tài đã duyệt còn có thể đăng ký.';

    results.innerHTML = `<section class="panel">
      <div class="panel-header"><h2>Đăng ký đề tài</h2></div>
      ${
        reason
          ? `<p class="panel-body muted">${esc(reason)}</p>`
          : `
        <form class="panel-body" data-wish-register>
          <div class="form-grid">
            <label>Đề tài<select name="topic_id">${topics.map((t) => option(t.id, t.title_vi)).join('')}</select></label>
            <label>Thứ tự ưu tiên<select name="priority_order">${ranks.map((n) => option(n, n)).join('')}</select></label>
            <p class="span-2 small muted" data-topic-details></p>
            <label class="span-2">Ghi chú<textarea name="student_note" maxlength="2000"></textarea></label>
          </div>
          <div class="form-actions"><button type="submit" class="primary">Gửi nguyện vọng</button></div>
        </form>`
      }
    </section>
    <section class="panel"><div class="panel-header"><h2>Kết quả của nhóm</h2></div>
      <div class="panel-body">
        ${
          assignment
            ? `<p><strong>${esc(assignment.title_vi)}</strong><br>Giảng viên hướng dẫn: ${esc(assignment.supervisor)}</p>`
            : '<p class="muted">Chưa có đề tài được phân công.</p>'
        }
        ${offers
          .map(
            (o) => `<article>
          <h3>Vòng ${esc(o.round)} · ${esc(offerStatus[o.status])}</h3>
          <p>${esc(o.title_vi)} · Hướng dẫn: ${esc(o.supervisor)}</p>
          ${
            o.status === 'PENDING'
              ? `<p>Hạn xác nhận: ${esc(new Date(o.confirm_until).toLocaleString('vi-VN'))}</p>
            ${
              data.group.is_leader && Date.now() < Date.parse(o.confirm_until)
                ? `<form data-match-offer="${esc(o.id)}" class="row-actions">
              <button type="submit" value="CONFIRMED" class="primary">Xác nhận đề tài</button>
              <button type="submit" value="DECLINED">Từ chối kết quả</button></form>`
                : ''
            }`
              : ''
          }
        </article>`,
          )
          .join('')}
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Ưu tiên</th><th>Đề tài</th><th>Trạng thái</th><th>Phản hồi</th></tr></thead>
        <tbody>${wishes
          .map(
            (r) => `<tr><td>${esc(r.priority_order)}</td><td>${esc(r.title_vi)}</td>
          <td>${esc(statuses[r.status] || r.status)}</td><td>${esc(r.lecturer_response_note || '—')}</td></tr>`,
          )
          .join('')}</tbody>
      </table></div>
      ${wishes.length ? '' : '<p class="empty">Nhóm chưa gửi nguyện vọng.</p>'}
      ${
        canEdit
          ? `<form class="panel-body" data-wish-edit><h3>Sửa danh sách nguyện vọng</h3>
        ${wishes
          .map(
            (
              r,
            ) => `<fieldset data-edit-topic="${esc(r.topic_id)}"><legend>${esc(r.title_vi)}</legend>
          <div class="form-grid">
            <label>Thứ tự ưu tiên<input name="priority" type="number" min="1" max="${esc(data.max_wish_choices)}" value="${esc(r.priority_order)}" required></label>
            <label>Ghi chú<input name="note" maxlength="2000" value="${esc(r.student_note || '')}"></label>
            <label class="checkbox"><input name="remove" type="checkbox">Bỏ nguyện vọng này</label>
          </div></fieldset>`,
          )
          .join('')}
        <div class="form-actions"><button class="primary" type="submit">Lưu nguyện vọng</button></div></form>`
          : ''
      }
    </section>`;
    results.querySelectorAll('[data-match-offer]').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const decision = event.submitter?.value;
        if (decision)
          void submit(
            form,
            `/campaigns/${campaign.value}/matching-offers/${form.dataset.matchOffer}`,
            'PATCH',
            { decision },
            'Đã lưu phản hồi kết quả.',
          );
      });
    });
    const editForm = results.querySelector('[data-wish-edit]');
    editForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const registrations = [...editForm.querySelectorAll('[data-edit-topic]')]
        .filter((row) => !row.querySelector('[name=remove]').checked)
        .map((row) => ({
          topic_id: row.dataset.editTopic,
          priority_order: Number(row.querySelector('[name=priority]').value),
          student_note: row.querySelector('[name=note]').value,
        }));
      const expected = wishes.map((r) => [r.id, r.priority_order, r.student_note, r.status]);
      void submit(
        editForm,
        endpoint + '/registrations',
        'PUT',
        { registrations, expected },
        'Đã lưu danh sách nguyện vọng.',
      );
    });
    editForm?.addEventListener('change', (event) => {
      if (event.target.name !== 'remove') return;
      const row = event.target.closest('[data-edit-topic]');
      row.querySelector('[name=priority]').disabled = event.target.checked;
      row.querySelector('[name=note]').disabled = event.target.checked;
    });
    const form = results.querySelector('[data-wish-register]');
    if (!form) return;
    const selectedTopic = form.elements.topic_id;
    const showTopic = () => {
      const topic = topics.find((t) => t.id === selectedTopic.value);
      form.querySelector('[data-topic-details]').textContent =
        `${topic.supervisor} · Tối đa ${topic.max_students} sinh viên. ${topic.description}`;
    };
    selectedTopic.addEventListener('change', showTopic);
    showTopic();
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(form));
      body.priority_order = Number(body.priority_order);
      void submit(form, endpoint + '/registrations', 'POST', body, 'Đã gửi nguyện vọng.');
    });
  }

  function showLecturer(wishes, endpoint, gate) {
    results.innerHTML = `<section class="panel"><div class="panel-header"><h2>Nguyện vọng gửi đến</h2></div>
      <p class="panel-body small muted">${esc(gate.reason)}</p>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Đề tài</th><th>Nhóm</th><th>Ưu tiên của nhóm</th><th>Xếp hạng giảng viên</th><th>Kết quả</th></tr></thead>
        <tbody>${wishes
          .map(
            (r) => `<tr>
          <td>${esc(r.title_vi)}</td><td>${esc(r.group_name || r.leader_name)}
            ${r.student_note ? `<p class="small muted">${esc(r.student_note)}</p>` : ''}</td>
          <td>${esc(r.priority_order)}</td>
          <td>${
            r.status === 'PENDING_LECTURER' && gate.allowed
              ? `<form data-wish-rank="${esc(r.id)}">
            <label>Hạng<input aria-label="Hạng (1 là cao nhất)" type="number" name="rank" min="1" max="10000" value="${esc(r.lecturer_rank ?? '')}"></label>
            <button type="submit">Lưu hạng</button></form>`
              : esc(r.lecturer_rank ?? '—')
          }</td>
          <td>${esc(statuses[r.status] || r.status)}${esc(r.lecturer_response_note ? ' · ' + r.lecturer_response_note : '')}</td>
        </tr>`,
          )
          .join('')}</tbody>
      </table></div>
      ${wishes.length ? '' : '<p class="empty">Chưa có nguyện vọng cho đề tài bạn hướng dẫn.</p>'}
    </section>`;
    results.querySelectorAll('[data-wish-rank]').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const value = form.elements.rank.value;
        void submit(
          form,
          `${endpoint}/lecturer-wishes/${form.dataset.wishRank}/rank`,
          'PUT',
          { rank: value === '' ? null : Number(value) },
          'Đã lưu thứ hạng.',
        );
      });
    });
  }

  async function submit(form, endpoint, method, body, message) {
    const buttons = [...form.querySelectorAll('button')];
    if (buttons.some((button) => button.disabled)) return;
    buttons.forEach((button) => {
      button.disabled = true;
    });
    try {
      await api(endpoint, { method, body });
      if (form.isConnected) {
        notify(message);
        await load(false);
      }
    } catch (error) {
      if (form.isConnected) notify(error.message, true);
    } finally {
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }
  }

  campaign.addEventListener('change', () => void load(true));
  group?.addEventListener('change', () => void load(false));
  await load(true);
}
