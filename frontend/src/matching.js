const algorithmNames = {
  GALE_SHAPLEY_GROUP: 'Gale–Shapley · nhóm đề xuất',
  GALE_SHAPLEY_TOPIC: 'Gale–Shapley · đề tài đề xuất',
  SERIAL: 'Serial Dictatorship · theo GPA',
  OPTIMAL: 'Tối ưu tổng độ hài lòng',
};
const criteriaNames = {
  LECTURER_RANK: 'Xếp hạng của giảng viên',
  GPA: 'GPA trung bình nhóm',
  SKILLS: 'Mức phù hợp kỹ năng',
  REGISTERED_AT: 'Thời điểm đăng ký',
  CODE: 'Mã trưởng nhóm',
};
const offerNames = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  DECLINED: 'Từ chối',
  EXPIRED: 'Hết hạn',
};

export async function renderMatching(area, { api, esc, notify, role }) {
  if (!['SYSTEM_ADMIN', 'TRAINING_DEPT', 'FACULTY_MANAGER'].includes(role)) {
    area.innerHTML = '<p class="screen-error">Trang này dành cho quản lý đợt.</p>';
    return;
  }
  const campaigns = (await api('/master-data/campaigns')).filter((c) => c.type !== 'INTERNSHIP');
  if (!area.isConnected) return;
  if (!campaigns.length) {
    area.innerHTML = '<p class="empty">Chưa có đợt đồ án trong phạm vi của bạn.</p>';
    return;
  }
  const option = (value, label, current = '') =>
    `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
  const panel = (title, body) =>
    `<section class="panel"><div class="panel-header"><h2>${title}</h2></div>${body}</section>`;
  const form = (kind, body, button) => `<form data-match-form="${kind}" class="panel-body">
    <div class="form-grid">${body}</div><div class="form-actions"><button type="submit" class="primary">${button}</button></div></form>`;
  const table = (
    headers,
    rows,
  ) => `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody></table></div>`;
  const button = (action, label, id) =>
    `<button type="button" data-match-action="${action}" data-id="${esc(id)}">${label}</button>`;
  const date = (t) => esc(new Date(t).toLocaleString('vi-VN'));
  area.innerHTML =
    panel(
      'Đợt ghép cặp',
      `<div class="panel-body"><label>Đợt đang xem
    <select data-match-campaign>${campaigns.map((c) => option(c.id, c.name)).join('')}</select></label></div>`,
    ) + '<div data-match-content aria-live="polite"></div>';
  const campaign = area.querySelector('[data-match-campaign]');
  const output = area.querySelector('[data-match-content]');
  let generation = 0;
  let busy = false;
  let active;
  let selectedRun;
  const endpoint = () => `/campaigns/${campaign.value}`;
  const runPath = (id) => endpoint() + '/matching-runs/' + id;

  async function load(runId = '') {
    const id = ++generation;
    output.innerHTML = '<p class="loading">Đang tải…</p>';
    try {
      const data = await api(endpoint() + '/matching-runs');
      selectedRun = runId ? await api(runPath(runId)) : data.active;
      if (!output.isConnected || id !== generation) return;
      active = data.active;
      show(data, selectedRun);
    } catch (error) {
      if (output.isConnected && id === generation)
        output.innerHTML = `<p class="screen-error">${esc(error.message)}</p>`;
    }
  }

  function show(data, run) {
    const waiting = data.offers.some((o) => o.status === 'PENDING');
    const editable = data.gate.allowed && !waiting;
    const current = editable && run && run.id === active?.id && !run.published_at;
    const chosen = active?.config?.criteria ?? [
      'LECTURER_RANK',
      'GPA',
      'SKILLS',
      'REGISTERED_AT',
      'CODE',
    ];
    const labels = Object.entries(criteriaNames);
    const eligibility =
      data.gate.allowed && waiting
        ? 'Đang chờ trưởng nhóm xác nhận. Có thể chốt các kết quả quá hạn.'
        : data.gate.reason;
    const previews = editable
      ? form(
          'preview',
          `<label>Thuật toán<select name="algorithm">
      ${Object.entries(algorithmNames)
        .map(([v, label]) => option(v, label, active?.config?.algorithm))
        .join('')}</select></label>
      ${labels
        .map(
          (_, i) => `<label>Tiêu chí ${i + 1}<select name="criterion">
        ${option('', 'Bỏ qua', chosen[i] ?? '')}${labels.map(([v, label]) => option(v, label, chosen[i])).join('')}
      </select></label>`,
        )
        .join('')}`,
          'Chạy thử',
        )
      : '';
    output.innerHTML =
      panel(
        'Thiết lập lần chạy',
        `<p class="panel-body muted">${esc(eligibility)}</p>${previews}`,
      ) +
      (run ? showRun(run, current) : '') +
      panel(
        'Lịch sử và so sánh',
        data.history.length
          ? table(
              [
                'Lần chạy',
                'Thuật toán',
                'Đã ghép / tổng nhóm',
                'Nguyện vọng 1 / 2 / 3',
                'Cặp bất ổn',
                'Trạng thái',
              ],
              data.history.map(
                (h) => `<tr><td>${button('history', date(h.created_at), h.id)}</td>
            <td>${esc(algorithmNames[h.config.algorithm])}</td>
            <td>${esc(h.stats.matched)}/${esc(h.stats.matched + h.stats.unmatched.length)}</td>
            <td>${esc(h.stats.by_priority.slice(0, 3).join(' / '))}</td><td>${esc(h.stats.blocking_pairs ?? '—')}</td>
            <td>Vòng ${esc(h.round)} · ${h.published_at ? 'Đã công bố' : 'Bản nháp'}</td></tr>`,
              ),
            )
          : '<p class="empty">Chưa có lần chạy.</p>',
      ) +
      (data.offers.length
        ? panel(
            'Xác nhận theo vòng',
            (waiting
              ? `<div class="panel-body">${button('expire', 'Chốt các kết quả quá hạn', '')}</div>`
              : '') +
              table(
                ['Vòng', 'Nhóm', 'Đề tài', 'Hạn xác nhận', 'Trạng thái'],
                data.offers.map(
                  (o) => `<tr>
          <td>${esc(o.round)}</td><td>${esc(o.group_name || o.group_id)}</td><td>${esc(o.title)}</td>
          <td>${date(o.confirm_until)}</td><td>${esc(offerNames[o.status])}</td></tr>`,
                ),
              ),
          )
        : '');
  }

  function showRun(run, editable) {
    const groups = new Map(run.input.groups.map((g) => [g.id, g]));
    const topics = new Map(run.input.topics.map((t) => [t.id, t]));
    const stats = run.result.stats;
    const groupName = (id) => groups.get(id)?.name ?? id;
    const topicName = (id) => topics.get(id)?.title ?? id;
    const pairs = run.result.pairs;
    const counts = stats.by_priority
      .map(
        (n, i) =>
          `Ưu tiên ${i + 1}: ${n} (${groups.size ? Math.round((n / groups.size) * 100) : 0}%)`,
      )
      .join(' · ');
    return panel(
      `Vòng ${esc(run.round)} · ${run.published_at ? 'Đã công bố' : 'Kết quả nháp'}`,
      `
      <div class="panel-body">
        <p>${esc(algorithmNames[run.config.algorithm])} · ${date(run.created_at)}</p>
        <p>Thứ tự xét: ${esc(run.config.criteria.map((c) => criteriaNames[c]).join(' → '))}</p>
        <p>${esc(counts)}</p>
        <p>Đã ghép ${esc(stats.matched)}/${esc(groups.size)} nhóm · Ngoài nguyện vọng: ${esc(stats.outside_wishes)}
          ${stats.blocking_pairs === null ? '' : ` · Cặp bất ổn: ${esc(stats.blocking_pairs)}`}</p>
      </div>
      ${
        pairs.length
          ? table(
              ['Nhóm', 'Đề tài', 'Giảng viên', 'Nguồn', 'Khóa', 'Thao tác'],
              pairs.map(
                (pair) => `<tr>
        <td>${esc(groupName(pair.group_id))}</td><td>${esc(topicName(pair.topic_id))}</td>
        <td>${esc(topics.get(pair.topic_id)?.supervisor ?? '—')}</td><td>${pair.manual ? 'Chỉnh tay' : 'Thuật toán'}</td>
        <td>${pair.locked ? 'Đã khóa' : 'Chưa khóa'}</td><td><div class="row-actions">
        ${
          editable
            ? button(
                pair.locked ? 'unlock' : 'lock',
                pair.locked ? 'Bỏ khóa' : 'Khóa',
                pair.group_id,
              ) + (pair.locked ? '' : button('remove', 'Bỏ cặp', pair.group_id))
            : ''
        }</div></td></tr>`,
              ),
            )
          : '<p class="empty">Chưa có cặp.</p>'
      }
      ${
        stats.unmatched.length
          ? `<details class="panel-body"><summary>Nhóm chưa ghép (${esc(stats.unmatched.length)})</summary>
        <ul>${stats.unmatched.map((g) => `<li>${esc(groupName(g.group_id))} · ${esc(g.reason)}</li>`).join('')}</ul></details>`
          : ''
      }
      ${
        editable
          ? form(
              'manual',
              `<label>Nhóm<select name="group_id" required>${option('', 'Chọn nhóm')}
        ${run.input.groups
          .filter((g) => g.eligible)
          .map((g) => option(g.id, g.name))
          .join('')}</select></label>
        <label>Đề tài<select name="topic_id" required>${option('', 'Chọn đề tài')}
        ${run.input.topics.map((t) => option(t.id, t.title)).join('')}</select></label>`,
              'Lưu cặp thủ công',
            )
          : ''
      }
      ${
        editable && pairs.length
          ? form(
              'publish',
              '<label>Hạn xác nhận<input type="datetime-local" name="confirm_until" required></label>',
              'Công bố kết quả',
            )
          : ''
      }`,
    );
  }

  async function change(path, body, control, message) {
    if (busy) return;
    busy = true;
    control.disabled = true;
    const id = generation;
    try {
      const result = await api(path, { method: 'POST', body });
      if (output.isConnected && id === generation) {
        notify(message || result.message || `Đã chốt ${result.expired ?? 0} kết quả quá hạn.`);
        await load();
      }
    } catch (error) {
      if (output.isConnected && generation === id) notify(error.message, true);
    } finally {
      busy = false;
      control.disabled = false;
    }
  }
  output.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-match-form]');
    if (!form) return;
    event.preventDefault();
    const fd = new FormData(form);
    const submitter = event.submitter ?? form.querySelector('button');
    if (form.dataset.matchForm === 'preview') {
      void change(
        endpoint() + '/matching-runs',
        { algorithm: fd.get('algorithm'), criteria: fd.getAll('criterion').filter(Boolean) },
        submitter,
        'Đã lưu bản chạy thử.',
      );
    } else if (form.dataset.matchForm === 'manual') {
      void change(
        runPath(active.id) + '/adjust',
        { action: 'assign', ...Object.fromEntries(fd) },
        submitter,
        'Đã lưu cặp thủ công.',
      );
    } else if (window.confirm('Công bố kết quả cho các nhóm trong đợt?')) {
      void change(
        runPath(active.id) + '/publish',
        { confirm_until: new Date(fd.get('confirm_until')).toISOString() },
        submitter,
      );
    }
  });
  output.addEventListener('click', (event) => {
    const control = event.target.closest('[data-match-action]');
    if (!control) return;
    const action = control.dataset.matchAction;
    if (action === 'history') void load(control.dataset.id);
    else if (action === 'expire') void change(endpoint() + '/matching-offers/expire', {}, control);
    else
      void change(
        runPath(active.id) + '/adjust',
        { action, group_id: control.dataset.id },
        control,
        'Đã cập nhật bản nháp.',
      );
  });
  campaign.addEventListener('change', () => void load());
  await load();
}
