import { campaignLabel } from './ui.js';

const labels = {
  OUTLINE_SUBMISSION: 'Đề cương',
  MIDTERM_REPORT_1: 'Báo cáo giữa kỳ 1',
  MIDTERM_REPORT_2: 'Báo cáo giữa kỳ 2',
  FINAL_SUBMISSION: 'Báo cáo cuối kỳ',
  INTERNSHIP_LECTURER: 'Giảng viên thực tập',
  INTERNSHIP_MENTOR: 'Mentor doanh nghiệp',
};
const appealLabels = {
  PENDING: 'Chờ xử lý',
  APPROVED_FINAL: 'Đã điều chỉnh',
  REJECTED: 'Đã từ chối',
};
const actions = {
  SET_RESULT_WEIGHTS: 'Lưu trọng số',
  PUBLISH_FINAL_GRADES: 'Công bố điểm',
  LOCK_CAMPAIGN_RESULTS: 'Chốt đợt',
  SAVE_MATCH_PREVIEW: 'Lưu bản ghép thử',
  PUBLISH_MATCH_RESULTS: 'Công bố ghép',
  RESPOND_MATCH_RESULT: 'Phản hồi ghép',
  CONFIRM_THESIS_ASSIGNMENT: 'Ghi phân công',
  GRADE_THESIS_REPORT: 'Chấm đồ án',
  GRADE_INTERNSHIP: 'Chấm thực tập',
  SUBMIT_GRADE_APPEAL: 'Gửi phúc khảo',
  RESOLVE_GRADE_APPEAL: 'Xử lý phúc khảo',
};

export async function renderResults(page, area, { api, request, esc, notify }) {
  const panel = (title, body) =>
    `<section class="panel"><div class="panel-header"><h2>${title}</h2></div>${body}</section>`;
  const table = (headers, rows) => `<div class="table-wrap"><table class="data-table"><thead><tr>
    ${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const empty = (message) => `<p class="empty">${message}</p>`;
  const date = (value) => esc(new Date(value).toLocaleString('vi-VN'));
  const number = (value) => (value == null ? '—' : Number(value).toFixed(2));
  const btn = (action, label, id = '') =>
    `<button type="button" data-result-action="${action}" data-id="${esc(id)}">${label}</button>`;
  let generation = 0;
  let busy = false;
  let campaign;
  let output = area;
  if (page !== 'notifications') {
    const campaigns = await api('/master-data/campaigns');
    if (!area.isConnected) return;
    if (!campaigns.length) {
      area.innerHTML = empty('Chưa có đợt trong phạm vi của bạn.');
      return;
    }
    area.innerHTML =
      panel(
        'Đợt đang xem',
        `<div class="panel-body"><label>Đợt<select data-result-campaign>
      ${campaigns.map((c) => `<option value="${esc(c.id)}">${esc(campaignLabel(c))}</option>`).join('')}</select></label></div>`,
      ) + '<div data-result-content aria-live="polite"></div>';
    campaign = area.querySelector('[data-result-campaign]');
    output = area.querySelector('[data-result-content]');
  }
  const path = () => (campaign ? `/campaigns/${campaign.value}/results` : '/notifications');

  function dashboard(s) {
    return panel(
      'Tiến độ đợt',
      `<div class="panel-body">
      <p>Nhóm đã có phân công: <strong>${esc(s.matched)}/${esc(s.groups)}</strong> · Chưa phân công: ${esc(s.unmatched)} · Chờ xác nhận ghép: ${esc(s.awaiting_confirmation)}</p>
      <p>Hồ sơ thực tập đã duyệt: <strong>${esc(s.placements)}</strong> · Chờ duyệt: ${esc(s.waiting_placements)}</p>
      ${btn('progress', 'Tải tiến độ CSV')}</div>
      ${
        s.reports.length
          ? table(
              ['Mốc', 'Đồ án đã nộp', 'Đồ án trễ', 'Thực tập đã nộp', 'Thực tập trễ'],
              s.reports.map(
                (
                  r,
                ) => `<tr><td>${esc(r.title)}</td><td>${esc(r.thesis_submitted)}/${esc(s.matched)}</td>
          <td>${esc(r.thesis_late)}</td><td>${esc(r.internship_submitted)}/${esc(s.placements)}</td><td>${esc(r.internship_late)}</td></tr>`,
              ),
            )
          : empty('Chưa có mốc báo cáo.')
      }`,
    );
  }

  function gradeCard(g, manager, locked) {
    const appeals = g.appeals ?? [];
    const components = g.components ?? [];
    const adjustment = appeals.find((a) => a.status === 'APPROVED_FINAL');
    const heading = manager ? `${g.code} · ${g.full_name}` : 'Điểm của bạn';
    return `<details ${manager ? '' : 'open'}><summary>${esc(heading)} · ${g.final_numeric_score == null ? 'Thiếu điểm' : esc(number(g.final_numeric_score)) + '/10'}</summary>
      ${
        components.length
          ? table(
              ['Thành phần', 'Điểm /10', 'Trọng số', 'Nguồn'],
              components.map(
                (c) => `<tr><td>${esc(labels[c.slot] || c.slot)}</td>
          <td>${c.score == null ? 'Chưa chấm' : esc(number(c.score))}</td><td>${esc(c.weight)}%</td>
          <td>${esc(c.rubric || '—')}${c.version ? ' · Bản ' + esc(c.version) : ''}</td></tr>`,
              ),
            )
          : empty('Chưa có điểm thành phần.')
      }
      ${adjustment ? `<p>Điểm sau phúc khảo: ${esc(number(adjustment.new_score))}/10 · ${esc(adjustment.resolution_note)}</p>` : ''}
      ${appeals
        .map(
          (a) => `<div class="panel-body">
        <p><strong>${esc(appealLabels[a.status] || a.status)}</strong> · ${esc(a.reason)}</p>
        ${a.resolution_note ? `<p>${esc(a.resolution_note)}${a.new_score == null ? '' : ' · ' + esc(number(a.new_score)) + '/10'}</p>` : ''}
        ${
          manager && !locked && a.status === 'PENDING'
            ? `<form data-result-form="resolve" data-id="${esc(a.id)}">
          <div class="form-grid"><label>Điểm điều chỉnh<input name="score" type="number" min="0" max="10" step="0.01"></label>
            <label>Lý do xử lý<textarea name="note" maxlength="2000" required></textarea></label></div>
          <div class="row-actions"><button type="submit" value="approve">Chấp nhận</button>
            <button type="submit" value="reject">Từ chối</button></div></form>`
            : ''
        }
      </div>`,
        )
        .join('')}
      ${
        !manager && !locked && !g.is_final_locked && !appeals.some((a) => a.status === 'PENDING')
          ? `<form class="panel-body" data-result-form="appeal">
        <label>Lý do phúc khảo<textarea name="reason" maxlength="2000" required></textarea></label>
        <div class="form-actions"><button type="submit" class="primary">Gửi phúc khảo</button></div></form>`
          : ''
      }
    </details>`;
  }

  function show(data) {
    if (page === 'notifications') {
      output.innerHTML = panel(
        'Thông báo của tôi',
        data.length
          ? `<div class="panel-body">${data
              .map(
                (n) => `<article>
        <p><strong>${esc(n.title)}</strong> · ${date(n.created_at)}</p><p>${esc(n.content)}</p>
        <div class="row-actions">${
          n.type === 'MATCH_RESULT'
            ? '<a href="#wishes">Xem kết quả ghép</a>'
            : ['FINAL_GRADE', 'GRADE_APPEAL'].includes(n.type)
              ? '<a href="#results">Xem điểm</a>'
              : ''
        }
          ${n.is_read ? '' : btn('read', 'Đánh dấu đã đọc', n.id)}</div></article>`,
              )
              .join('')}</div>`
          : empty('Chưa có thông báo.'),
      );
      return;
    }
    const manager = data.manager;
    const published = Boolean(data.state?.published_at);
    const locked = manager ? Boolean(data.state?.locked_at) : data.locked;
    output.innerHTML =
      (manager ? dashboard(data.summary) : '') +
      (manager
        ? panel(
            'Công bố và chốt điểm',
            `<div class="panel-body"><p>${locked ? 'Đã chốt đợt và khóa điểm.' : published ? 'Đã công bố · đang xử lý phúc khảo.' : 'Chưa công bố.'}</p>
          <div class="row-actions">${btn('export', 'Tải bảng điểm CSV')}
            ${!published && Object.keys(data.weights).length ? btn('publish', 'Công bố điểm') : ''}
            ${published && !locked ? btn('lock', 'Chốt đợt và khóa điểm') : ''}
          </div></div>` +
              (!published
                ? `<form class="panel-body" data-result-form="weights">
          <p>Nhập trọng số cho các thành phần cần tính. Bỏ trống hoặc nhập 0 nếu không tính. Tổng phải bằng 100%.</p>
          <div class="form-grid">${data.slots
            .map(
              (key) => `<label>${esc(labels[key])}
            <input type="number" min="0" max="100" name="${esc(key)}" value="${esc(data.weights[key] ?? '')}"></label>`,
            )
            .join('')}</div>
          <div class="form-actions"><button type="submit" class="primary">Lưu trọng số</button></div></form>`
                : ''),
          )
        : '') +
      panel(
        manager ? 'Bảng điểm' : 'Kết quả đã công bố',
        data.grades.length
          ? `<div class="panel-body">
        ${data.grades.map((g) => gradeCard(g, manager, locked)).join('')}</div>`
          : empty(manager ? 'Chưa có sinh viên trong danh sách.' : 'Chưa có điểm đã công bố.'),
      ) +
      (manager
        ? panel(
            'Lịch sử thao tác',
            `<div class="panel-body">${btn('activity', 'Xem lịch sử')}</div><div data-result-history></div>`,
          )
        : '');
  }

  async function load() {
    const id = ++generation;
    output.innerHTML = '<p class="loading">Đang tải…</p>';
    try {
      const data = await api(path());
      if (output.isConnected && id === generation) show(data);
    } catch (error) {
      if (output.isConnected && id === generation)
        output.innerHTML = `<p class="screen-error">${esc(error.message)}</p>`;
    }
  }
  async function change(url, method, body, button) {
    if (busy) return;
    busy = true;
    button.disabled = true;
    const id = generation;
    try {
      const response = await api(url, { method, body });
      if (output.isConnected && id === generation) {
        notify(response.message);
        await load();
      }
    } catch (error) {
      if (button.isConnected) notify(error.message, true);
    } finally {
      button.disabled = false;
      busy = false;
    }
  }
  output.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-result-form]');
    if (!form) return;
    event.preventDefault();
    const button = event.submitter;
    if (!button) return;
    const values = Object.fromEntries(new FormData(form));
    if (form.dataset.resultForm === 'weights') {
      void change(
        path() + '/weights',
        'PUT',
        {
          weights: Object.fromEntries(
            Object.entries(values)
              .filter(([, v]) => Number(v) !== 0)
              .map(([k, v]) => [k, Number(v)]),
          ),
        },
        button,
      );
    } else if (form.dataset.resultForm === 'appeal') {
      void change(path() + '/appeals', 'POST', values, button);
    } else {
      if (button.value === 'approve' && values.score === '') {
        notify('Nhập điểm điều chỉnh.', true);
        return;
      }
      void change(
        path() + '/appeals/' + form.dataset.id,
        'PATCH',
        { decision: button.value, note: values.note, score: Number(values.score) },
        button,
      );
    }
  });
  output.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-result-action]');
    if (!button) return;
    const action = button.dataset.resultAction;
    const url = path();
    if (action === 'read') {
      void change(url + '/' + button.dataset.id, 'PATCH', {}, button);
      return;
    }
    if (action === 'publish' || action === 'lock') {
      const prompt =
        action === 'publish'
          ? 'Công bố điểm cho sinh viên? Sau đó thay đổi điểm qua phúc khảo.'
          : 'Chốt đợt và khóa tất cả điểm đã công bố?';
      if (window.confirm(prompt)) void change(url + '/' + action, 'POST', {}, button);
      return;
    }
    try {
      if (action === 'activity') {
        const log = await api(url + '/activity');
        if (!button.isConnected) return;
        output.querySelector('[data-result-history]').innerHTML = log.length
          ? table(
              ['Thời gian', 'Người thực hiện', 'Thao tác'],
              log.map(
                (r) => `<tr><td>${date(r.created_at)}</td><td>${esc(r.actor ?? '—')}</td>
          <td>${esc(actions[r.action] || r.action)}</td></tr>`,
              ),
            )
          : empty('Chưa có thao tác.');
      } else {
        const response = await request(
          url + '/export' + (action === 'progress' ? '?report=progress' : ''),
        );
        const blob = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = blob;
        link.download = action === 'progress' ? 'tien-do.csv' : 'bang-diem.csv';
        link.click();
        setTimeout(() => URL.revokeObjectURL(blob), 1000);
      }
    } catch (error) {
      if (button.isConnected) notify(error.message, true);
    }
  });
  campaign?.addEventListener('change', () => void load());
  await load();
}
