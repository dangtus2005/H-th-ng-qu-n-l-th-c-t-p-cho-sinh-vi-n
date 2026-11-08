import { icon, pageIcons, enhanceUI } from './ui.js';
import { sprint2Pages, renderSprint2, setupSprint2 } from './sprint2.js';
import { extraPages, renderExtra, recoveryHTML, setupExtras } from './sprint1.js';
const app = document.querySelector('#app');
const notice = document.querySelector('#notice');
const API = '/api/v1';
let token = sessionStorage.getItem('access_token');
let session = null;
let generation = 0;
let expiryTimer;
let busy = false;
let masterRows = [];
let editingMaster = null;
let ssoProviders = [];
const titles = {
  ...sprint2Pages,
  'training-systems': ['Hệ đào tạo', 'Quản lý các hệ đào tạo của trường.'],
  ...extraPages,
  faculties: ['Khoa', 'Quản lý đơn vị đào tạo trong phạm vi của bạn.'],
  departments: ['Bộ môn', 'Danh sách bộ môn và khoa trực thuộc.'],
  'academic-years': ['Năm học', 'Thiết lập khung năm học cho các học kỳ.'],
  semesters: ['Học kỳ', 'Theo dõi thời gian đào tạo và học kỳ hiện tại.'],
  'document-templates': ['Biểu mẫu', 'Kho tài liệu chuẩn dành cho thực tập và khóa luận.'],
  account: ['Tài khoản', 'Bảo vệ tài khoản và quản lý phiên đăng nhập.'],
};
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const managers = () => ['SYSTEM_ADMIN', 'TRAINING_DEPT'].includes(session?.active_role.role_code);
const uploaders = () => managers() || session?.active_role.role_code === 'FACULTY_MANAGER';
const page = () =>
  Object.hasOwn(titles, location.hash.slice(1)) ? location.hash.slice(1) : 'faculties';
const brand = /* HTML */ `<div class="brand">
  <span class="brand-mark">${icon('school')}</span
  ><span>QLTH<small>Cổng quản lý học thuật</small></span>
</div>`;

function navigation(currentPage) {
  const groups = [
    ['QUẢN TRỊ', ['users', 'bulk-import', 'audit']],
    [
      'DANH MỤC ĐÀO TẠO',
      ['faculties', 'departments', 'majors', 'specializations', 'training-systems'],
    ],
    ['KẾ HOẠCH & TÀI LIỆU', ['academic-years', 'semesters', 'campaigns', 'document-templates']],
    ['CÁ NHÂN', ['profile', 'account']],
  ];
  return groups
    .map(([label, keys]) => {
      const visible = keys.filter(
        (key) =>
          !['users', 'bulk-import', 'audit'].includes(key) ||
          session.active_role.role_code === 'SYSTEM_ADMIN',
      );
      return visible.length
        ? '<div class="nav-group"><p class="nav-caption">' +
            label +
            '</p>' +
            visible
              .map(
                (key) =>
                  /* HTML */ `<a href="#${key}" ${key === currentPage ? 'aria-current="page"' : ''}
                    >${icon(pageIcons[key])}<span>${titles[key][0]}</span>${key === currentPage ? '<span class="nav-active-dot" aria-hidden="true"></span>' : ''}</a
                  >`,
              )
              .join('') +
            '</div>'
        : '';
    })
    .join('');
}

function notify(message, error = false) {
  notice.classList.toggle('error', error);
  notice.replaceChildren(document.createTextNode(message));
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Đóng thông báo');
  close.onclick = () => {
    notice.hidden = true;
  };
  notice.append(close);
  notice.hidden = false;
}

function clearSession() {
  token = null;
  session = null;
  sessionStorage.removeItem('access_token');
  clearTimeout(expiryTimer);
  generation++;
}

function saveSession(data) {
  session = data;
  if (data.access_token) {
    token = data.access_token;
    sessionStorage.setItem('access_token', token);
  }
  clearTimeout(expiryTimer);
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    expiryTimer = setTimeout(
      () => {
        clearSession();
        showLogin();
        notify('Phiên đã hết hạn. Vui lòng đăng nhập lại.', true);
      },
      Math.max(0, exp * 1000 - Date.now()),
    );
  } catch {
    clearSession();
    throw new Error('Phiên đăng nhập không hợp lệ');
  }
}

async function request(endpoint, { method = 'GET', body, signal } = {}) {
  const currentToken = token;
  const headers = {};
  if (currentToken) {
    headers.Authorization = `Bearer ${currentToken}`;
  }
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && currentToken && currentToken === token) {
      clearSession();
      showLogin();
    }
    throw new Error(data.message || `Yêu cầu thất bại (${response.status})`);
  }
  return response;
}

const api = async (url, options) => (await request(url, options)).json();
const input = (name, label, type = 'text', extra = '') =>
  /* HTML */ `<label>${label}<input name="${name}" type="${type}" required ${extra} /></label>`;
const options = (rows, label = 'name') =>
  rows
    .map((row) => /* HTML */ `<option value="${esc(row.id)}">${esc(row[label])}</option>`)
    .join('');
const select = (name, label, rows, key = 'name', optional = false) =>
  /* HTML */ `<label
    >${label}<select name="${name}" ${optional ? '' : 'required'}>
      <option value="">
        ${optional ? 'Dùng chung toàn hệ thống' : 'Chọn ' + label.toLowerCase()}
      </option>
      ${options(rows, key)}
    </select></label
  >`;
const createForm = (type, title, fields) =>
  /* HTML */ `<section class="panel">
    <div class="panel-header"><h2>${title}</h2></div>
    <form class="panel-body" data-form="${type}">
      <div class="form-grid">${fields}</div>
      <p class="error-text" role="alert" hidden></p>
      <div class="form-actions">
        <button class="primary" type="submit">
          ${type === 'document-templates' ? 'Tải biểu mẫu lên' : 'Lưu thông tin'}
        </button>
      </div>
    </form>
  </section>`;

function showLogin() {
  generation++;
  if (['#forgot', '#reset'].includes(location.hash)) {
    app.innerHTML = recoveryHTML(location.hash.slice(1));
    enhanceUI(app);
    return;
  }
  app.innerHTML = /* HTML */ `<div class="login">
    <aside class="login-story">
      ${brand}
      <div>
        <div class="story-rule"></div>
        <div class="login-badge">${icon('shield')} Nền tảng quản lý đào tạo</div>
        <h1>Kết nối đào tạo.<br />Đồng hành phát triển.</h1>
        <p class="story-details">
          Một không gian làm việc thống nhất cho quản lý thực tập và khóa luận tốt nghiệp.
        </p>
        <div class="login-features">
          <div>${icon('users')}<span>Kết nối giảng viên & sinh viên</span></div>
          <div>${icon('layers')}<span>Quản lý học thuật tập trung</span></div>
          <div>${icon('shield')}<span>Phân quyền theo từng vai trò</span></div>
        </div>
      </div>
      <footer>QLTH · Hệ thống quản lý thực tập & khóa luận</footer>
    </aside>
    <main id="main" class="login-panel">
      <div class="login-box">
        <span class="login-symbol">${icon('school')}</span>
        <p class="eyebrow">CHÀO MỪNG TRỞ LẠI</p>
        <h1>Đăng nhập</h1>
        <p class="muted">Sử dụng tài khoản được cấp để vào hệ thống.</p>
        <form data-form="login">
          ${input('email', 'Địa chỉ email', 'email', 'autocomplete="username" maxlength="255"')}${input('password', 'Mật khẩu', 'password', 'autocomplete="current-password"')}
          <p class="error-text" role="alert" hidden></p>
          <button type="submit" class="primary">Đăng nhập</button>
        </form>
        <p class="small muted">
          Liên hệ quản trị viên nếu bạn chưa có tài khoản hoặc quên mật khẩu.
        </p>
      </div>
    </main>
  </div>`;
  if (ssoProviders.length) {
    app
      .querySelector('form')
      .insertAdjacentHTML(
        'afterend',
        '<div class="sso-actions">' +
          ssoProviders
            .map(
              (p) =>
                /* HTML */ `<a class="sso-link" href="/api/v1/auth/sso/${p}"
                  >Đăng nhập bằng ${p === 'google' ? 'Google' : 'Microsoft'} trường</a
                >`,
            )
            .join('') +
          '</div>',
      );
  }
  app
    .querySelector('form')
    .insertAdjacentHTML(
      'afterend',
      '<p class="recovery-links"><a href="#forgot">Quên mật khẩu?</a><a href="#reset">Tôi đã có mã khôi phục</a></p>',
    );
  enhanceUI(app);
}

async function render() {
  if (!session) {
    showLogin();
    return;
  }
  const version = ++generation;
  const currentPage = page();
  const role = session.active_role;
  const [title, description] = titles[currentPage];
  app.innerHTML = /* HTML */ `<div class="layout">
    <aside class="sidebar">
      ${brand}
      <div class="sidebar-navigation">
        <nav aria-label="Danh mục chính">${navigation(currentPage)}</nav>
      </div>
      <div class="sidebar-foot">
        ${icon('shield')}
        <div><strong>Không gian học thuật</strong><br />Thực tập & khóa luận tốt nghiệp</div>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div>
          <p class="eyebrow muted">CỔNG QUẢN LÝ HỌC THUẬT</p>
          <p class="small muted">Danh mục & tài khoản</p>
        </div>
        <div class="user-actions">
          <label
            >Vai trò đang sử dụng<select
              id="role-select"
              ${session.available_roles.length < 2 ? 'disabled' : ''}
            >
              ${session.available_roles.map((r) => /* HTML */ `<option value="${esc(r.user_role_id)}" ${r.user_role_id === role.user_role_id ? 'selected' : ''}>${esc([r.role_name, r.faculty_name, r.department_name, r.major_name, r.campaign_name].filter(Boolean).join(' · '))}</option>`).join('')}
            </select></label
          ><span class="user-avatar" aria-hidden="true"
            >${esc(
              session.user.full_name
                .trim()
                .split(/\s+/)
                .map((v) => v[0])
                .slice(-2)
                .join(''),
            )}</span
          >
          <div class="user-info">
            ${esc(session.user.full_name)}<span>${esc(session.user.email)}</span>
          </div>
          <button type="button" data-action="logout">Đăng xuất</button>
        </div>
      </header>
      <main id="main" class="content" tabindex="-1">
        <div class="breadcrumb">Không gian làm việc <span>/</span> ${title}</div>
        <div class="page-heading">
          <div>
            <h1>${title}</h1>
            <p class="muted">${description}</p>
          </div>
          <span class="tag">${esc(role.role_name)}</span>
        </div>
        <section class="context" aria-label="Vai trò và phạm vi">
          <span class="context-icon">${icon('shield')}</span>
          <div>
            <strong>${esc(role.role_name)}</strong>
            <p>
              ${esc(role.faculty_name || (role.department_name ? 'Phạm vi bộ môn' : managers() ? 'Toàn hệ thống' : 'Chưa gán phạm vi khoa'))}${role.department_name ? ' · ' + esc(role.department_name) : ''}
            </p>
            <p class="small">
              ${esc([role.major_name, role.campaign_name].filter(Boolean).join(' / '))}
            </p>
            <span class="scope-note">Dữ liệu và thao tác theo phạm vi được cấp</span>
          </div>
        </section>
        <div id="page-content" aria-busy="true">
          <div class="panel loading">Đang tải dữ liệu…</div>
        </div>
      </main>
    </div>
  </div>`;
  enhanceUI(app);
  const area = app.querySelector('#page-content');
  area.dataset.page = currentPage;
  try {
    if (Object.hasOwn(sprint2Pages, currentPage) || currentPage === 'campaigns') {
      await renderSprint2(currentPage, area);
      return;
    }
    if (Object.hasOwn(extraPages, currentPage)) {
      await renderExtra(currentPage, area);
      return;
    }
    if (currentPage === 'account') {
      area.innerHTML = /* HTML */ `<section class="panel account-card">
          <div class="panel-header"><h2>Thông tin tài khoản</h2></div>
          <div class="panel-body">
            <p>
              <strong>${esc(session.user.full_name)}</strong
              ><br />${esc(session.user.email)}<br /><span class="muted"
                >Mã tài khoản: ${esc(session.user.code)}</span
              >
            </p>
            <p class="small muted">
              Phiên đăng nhập có thời hạn 8 giờ. Đổi mật khẩu sẽ đăng xuất tất cả thiết bị.
            </p>
          </div>
        </section>
        <div class="account-card">
          ${createForm('change-password', 'Đổi mật khẩu', input('old_password', 'Mật khẩu hiện tại', 'password', 'autocomplete="current-password"') + input('new_password', 'Mật khẩu mới', 'password', 'autocomplete="new-password" minlength="8" aria-describedby="password-help"') + '<p id="password-help" class="small muted span-2">Ít nhất 8 ký tự, không quá 72 byte. Bạn sẽ cần đăng nhập lại sau khi đổi.</p>' + input('confirm_password', 'Nhập lại mật khẩu mới', 'password', 'autocomplete="new-password" minlength="8"'))}
        </div>`;
      if (ssoProviders.length) {
        area.insertAdjacentHTML(
          'beforeend',
          createForm(
            'sso-link',
            'Liên kết tài khoản trường',
            '<p class="small muted span-2">Xác nhận mật khẩu hiện tại, sau đó đăng nhập Google/Microsoft để liên kết. Mỗi tài khoản dùng một danh tính SSO.</p><label>Nhà cung cấp<select name="provider">' +
              ssoProviders
                .map(
                  (p) =>
                    /* HTML */ `<option value="${p}">
                      ${p === 'google' ? 'Google' : 'Microsoft'}
                    </option>`,
                )
                .join('') +
              '</select></label>' +
              input('password', 'Mật khẩu hiện tại', 'password', 'autocomplete="current-password"'),
          ),
        );
      }
      return;
    }
    const rows = await api(`/master-data/${currentPage}`);
    masterRows = rows;
    if (editingMaster?.page !== currentPage) {
      editingMaster = null;
    }
    let faculties = [];
    let years = [];
    if (currentPage === 'departments' || currentPage === 'document-templates') {
      faculties = await api('/master-data/faculties');
    }
    if (currentPage === 'semesters') {
      years = await api('/master-data/academic-years');
    }
    if (version !== generation) {
      return;
    }
    let headers;
    let rowHtml;
    let form = '';
    const codeName =
      input('code', 'Mã', 'text', 'maxlength="50"') +
      input('name', 'Tên', 'text', 'maxlength="255"');
    if (currentPage === 'faculties') {
      headers = ['Mã khoa', 'Tên khoa', 'Mô tả'];
      rowHtml = (r) =>
        /* HTML */ `<td class="code">${esc(r.code)}</td>
          <td>${esc(r.name)}</td>
          <td class="muted">${esc(r.description || '—')}</td>`;
      if (managers()) {
        form = createForm(
          currentPage,
          'Thêm khoa',
          codeName +
            '<label class="span-2">Mô tả<textarea name="description" maxlength="5000"></textarea></label>',
        );
      }
    } else if (currentPage === 'training-systems') {
      headers = ['Mã hệ', 'Tên hệ đào tạo'];
      rowHtml = (r) =>
        /* HTML */ `<td>${esc(r.code)}</td>
          <td>${esc(r.name)}</td>`;
      if (managers()) {
        form = createForm(currentPage, 'Thêm hệ đào tạo', codeName);
      }
    } else if (currentPage === 'departments') {
      headers = ['Mã bộ môn', 'Tên bộ môn', 'Khoa trực thuộc'];
      rowHtml = (r) =>
        /* HTML */ `<td class="code">${esc(r.code)}</td>
          <td>${esc(r.name)}</td>
          <td>${esc(r.faculty_name)}</td>`;
      if (managers()) {
        form = createForm(
          currentPage,
          'Thêm bộ môn',
          codeName + select('faculty_id', 'Khoa', faculties),
        );
      }
    } else if (currentPage === 'academic-years') {
      headers = ['Mã năm học', 'Năm bắt đầu', 'Năm kết thúc'];
      rowHtml = (r) =>
        /* HTML */ `<td class="code">${esc(r.code)}</td>
          <td>${esc(r.start_year)}</td>
          <td>${esc(r.end_year)}</td>`;
      if (managers()) {
        form = createForm(
          currentPage,
          'Thêm năm học',
          input('code', 'Mã năm học', 'text', 'maxlength="50" placeholder="2026-2027"') +
            input('start_year', 'Năm bắt đầu', 'number', 'min="1900" max="2199"') +
            input('end_year', 'Năm kết thúc', 'number', 'min="1901" max="2200"'),
        );
      }
    } else if (currentPage === 'semesters') {
      headers = ['Học kỳ', 'Năm học', 'Thời gian', 'Trạng thái'];
      rowHtml = (r) =>
        /* HTML */ `<td>${esc(r.name)}<br /><span class="small muted">${esc(r.code)}</span></td>
          <td>${esc(r.academic_year_code)}</td>
          <td>${esc(date(r.start_date))}<br />${esc(date(r.end_date))}</td>
          <td>${r.is_current ? '<span class="tag">Hiện tại</span>' : '—'}</td>`;
      if (managers()) {
        form = createForm(
          currentPage,
          'Thêm học kỳ',
          codeName +
            select('academic_year_id', 'Năm học', years, 'code') +
            input('start_date', 'Ngày bắt đầu', 'date') +
            input('end_date', 'Ngày kết thúc', 'date') +
            '<label class="checkbox span-2"><input type="checkbox" name="is_current">Đặt làm học kỳ hiện tại</label>',
        );
      }
    } else {
      headers = ['Biểu mẫu', 'Phạm vi', 'Tệp đính kèm', 'Thao tác'];
      rowHtml = (r) =>
        /* HTML */ `<td>${esc(r.name)}<br /><span class="small muted">${esc(r.code)}</span></td>
          <td>${esc(r.faculty_name || 'Toàn hệ thống')}</td>
          <td>
            ${esc(r.original_name)}<br /><span class="small muted"
              >${esc((Number(r.file_size) / 1024).toFixed(1))} KB</span
            >
          </td>
          <td>
            ${r.is_active ? /* HTML */ `<button type="button" data-download="${esc(r.id)}" data-filename="${esc(r.original_name)}">Tải xuống</button>` : 'Ngừng sử dụng'}
          </td>`;
      if (uploaders()) {
        form = createForm(
          currentPage,
          'Tải lên biểu mẫu',
          codeName +
            (managers()
              ? select('faculty_id', 'Phạm vi khoa', faculties, 'name', true)
              : /* HTML */ `<p class="small muted span-2">
                  Biểu mẫu được gắn với ${esc(role.faculty_name || 'khoa của bạn')}.
                </p>`) +
            '<label class="span-2">Tệp biểu mẫu<input type="file" name="file" accept=".pdf,.doc,.docx" required><small>PDF, DOC hoặc DOCX. Tối đa 10 MB.</small></label>',
        );
      }
    }
    const canEdit = managers() && currentPage !== 'document-templates';
    if (canEdit) {
      headers.push('Thao tác');
      const original = rowHtml;
      rowHtml = (r) =>
        original(r) +
        /* HTML */ `<td>
          <div class="row-actions">
            <button type="button" data-master-edit="${esc(r.id)}">Sửa</button
            ><button type="button" data-master-delete="${esc(r.id)}">Xóa</button>
          </div>
        </td>`;
    }
    area.innerHTML = /* HTML */ `<div class="${form ? 'two-column' : ''}">
      <section class="panel">
        <div class="panel-header">
          <h2>Danh sách <span class="small muted">(${rows.length})</span></h2>
          <input
            type="search"
            id="search"
            placeholder="Tìm mã hoặc tên…"
            aria-label="Tìm trong danh sách"
          />
        </div>
        ${
          currentPage === 'departments'
            ? /* HTML */ `<div class="filter-bar">
                <label
                  >Lọc theo khoa<select id="faculty-filter">
                    <option value="">Tất cả khoa trong phạm vi</option>
                    ${options(faculties)}
                  </select></label
                >
              </div>`
            : ''
        }
        <div class="table-wrap">
          <table>
            <caption class="small muted" hidden>
              Danh sách ${title}
            </caption>
            <thead>
              <tr>
                ${headers.map((h) => /* HTML */ `<th scope="col">${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (r) =>
                    /* HTML */ `<tr
                      data-search="${esc([r.code, r.name, r.faculty_name, r.original_name].filter(Boolean).join(' ').toLocaleLowerCase('vi'))}"
                      data-faculty="${esc(r.faculty_id)}"
                    >
                      ${rowHtml(r)}
                    </tr>`,
                )
                .join('')}
            </tbody>
          </table>
          <p id="empty" class="empty" ${rows.length ? 'hidden' : ''}>
            Chưa có dữ liệu trong phạm vi hiện tại.
          </p>
        </div>
      </section>
      ${form}
    </div>`;
    if (editingMaster && canEdit) {
      const formElement = area.querySelector('form[data-form]');
      formElement.querySelector('h2')?.remove();
      for (const element of formElement.elements) {
        const value = editingMaster.record[element.name];
        if (value === undefined || value === null) {
          continue;
        }
        if (element.type === 'checkbox') {
          element.checked = !!value;
        } else {
          element.value = element.type === 'date' ? String(value).slice(0, 10) : value;
        }
      }
      formElement.closest('.panel').querySelector('h2').textContent = 'Sửa thông tin';
      formElement
        .querySelector('.form-actions')
        .insertAdjacentHTML(
          'afterbegin',
          '<button type="button" data-master-cancel>Hủy sửa</button>',
        );
      formElement.scrollIntoView({ block: 'nearest' });
    }
  } catch (error) {
    if (version !== generation) {
      return;
    }
    area.innerHTML = /* HTML */ `<div class="screen-error" role="alert">
      ${esc(error.message)}<br /><button data-action="retry" type="button">Thử lại</button>
    </div>`;
  } finally {
    if (version === generation) {
      area.setAttribute('aria-busy', 'false');
      enhanceUI(app);
    }
  }
}

function date(value) {
  return new Date(value).toLocaleDateString('vi-VN');
}

function filterRows() {
  const query = (document.querySelector('#search')?.value || '').toLocaleLowerCase('vi').trim();
  const faculty = document.querySelector('#faculty-filter')?.value || '';
  let visible = 0;
  document.querySelectorAll('tr[data-search]').forEach((row) => {
    row.hidden =
      !row.dataset.search.includes(query) || !!(faculty && faculty !== row.dataset.faculty);
    if (!row.hidden) {
      visible++;
    }
  });
  const empty = document.querySelector('#empty');
  if (empty) {
    empty.hidden = visible > 0;
    empty.textContent = 'Không có dữ liệu phù hợp.';
  }
}

app.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) {
    return;
  }
  event.preventDefault();
  if (busy) {
    return;
  }
  const kind = form.dataset.form;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);
  const errorBox = form.querySelector('.error-text');
  errorBox.hidden = true;
  const button = form.querySelector('[type=submit]');
  const label = button.textContent;
  busy = true;
  button.disabled = true;
  button.textContent = 'Đang xử lý…';
  const roleSelect = document.querySelector('#role-select');
  if (roleSelect) {
    roleSelect.disabled = true;
  }
  try {
    if (kind === 'login') {
      saveSession(await api('/auth/login', { method: 'POST', body: data }));
      notice.hidden = true;
      await render();
    } else if (kind === 'sso-link') {
      const result = await api('/auth/sso/link', { method: 'POST', body: data });
      location.assign(result.url);
    } else if (kind === 'change-password') {
      if (data.new_password !== data.confirm_password) {
        throw new Error('Mật khẩu nhập lại chưa khớp');
      }
      if (new TextEncoder().encode(data.new_password).length > 72) {
        throw new Error('Mật khẩu mới không được quá 72 byte');
      }
      const result = await api('/auth/change-password', {
        method: 'POST',
        body: { old_password: data.old_password, new_password: data.new_password },
      });
      clearSession();
      showLogin();
      notify(result.message);
    } else {
      let body = data;
      if (kind === 'academic-years') {
        body.start_year = Number(data.start_year);
        body.end_year = Number(data.end_year);
      }
      if (kind === 'semesters') {
        body.is_current = formData.has('is_current');
      }
      if (kind === 'document-templates') {
        if (data.file.size > 10 * 1024 * 1024) {
          throw new Error('File tối đa 10 MB');
        }
        body = formData;
      }
      await api(
        `/master-data/${kind}${editingMaster ? '/' + encodeURIComponent(editingMaster.record.id) : ''}`,
        { method: editingMaster ? 'PATCH' : 'POST', body },
      );
      editingMaster = null;
      await render();
      notify('Đã lưu thông tin thành công.');
    }
  } catch (error) {
    if (errorBox.isConnected) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } else {
      notify(error.message, true);
    }
  } finally {
    busy = false;
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = label;
    }
    if (roleSelect?.isConnected) {
      roleSelect.disabled = session?.available_roles.length < 2;
    }
  }
});
app.addEventListener('change', async (event) => {
  if (event.target.id === 'faculty-filter') {
    filterRows();
    return;
  }
  if (event.target.id !== 'role-select') {
    return;
  }
  const select = event.target;
  if (busy) {
    select.value = session.active_role.user_role_id;
    return;
  }
  busy = true;
  select.disabled = true;
  document.querySelectorAll('form button').forEach((b) => {
    b.disabled = true;
  });
  try {
    saveSession(
      await api('/auth/switch-role', { method: 'POST', body: { user_role_id: select.value } }),
    );
    await render();
    notify('Đã chuyển vai trò và tải lại phạm vi dữ liệu.');
  } catch (error) {
    notify(error.message, true);
    if (session) {
      await render();
    }
  } finally {
    busy = false;
  }
});
app.addEventListener('input', (event) => {
  if (event.target.id === 'search') {
    filterRows();
  }
});
app.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) {
    return;
  }
  if (button.hasAttribute('data-master-cancel')) {
    editingMaster = null;
    await render();
    return;
  }
  if (button.dataset.masterEdit) {
    editingMaster = {
      page: page(),
      record: masterRows.find((r) => r.id === button.dataset.masterEdit),
    };
    await render();
    return;
  }
  if (button.dataset.masterDelete) {
    if (busy || !confirm('Xóa danh mục này? Chỉ xóa được khi chưa có dữ liệu liên quan.')) {
      return;
    }
    busy = true;
    button.disabled = true;
    try {
      await api(`/master-data/${page()}/${encodeURIComponent(button.dataset.masterDelete)}`, {
        method: 'DELETE',
      });
      editingMaster = null;
      await render();
      notify('Đã xóa danh mục.');
    } catch (error) {
      notify(error.message, true);
    } finally {
      busy = false;
      if (button.isConnected) {
        button.disabled = false;
      }
    }
    return;
  }
  if (button.dataset.action === 'retry') {
    await render();
    return;
  }
  if (button.dataset.action === 'logout') {
    if (busy) {
      return;
    }
    busy = true;
    button.disabled = true;
    try {
      await api('/auth/logout', { method: 'POST' });
      clearSession();
      showLogin();
      notify('Đã đăng xuất.');
    } catch (error) {
      notify(error.message, true);
    } finally {
      busy = false;
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  }
  if (button.dataset.download) {
    button.disabled = true;
    try {
      const response = await request(
        `/master-data/document-templates/${encodeURIComponent(button.dataset.download)}/download`,
      );
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = button.dataset.filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      notify(error.message, true);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  }
});
window.addEventListener('hashchange', () => render());
document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  const main = document.querySelector('#main');
  main.setAttribute('tabindex', '-1');
  main.focus();
});

async function start() {
  ssoProviders = await api('/auth/sso/providers').catch(() => []);
  if (location.hash.startsWith('#sso=')) {
    const ticket = location.hash.slice(5);
    history.replaceState(null, '', '#account');
    try {
      saveSession(await api('/auth/sso/exchange', { method: 'POST', body: { ticket } }));
      await render();
      return;
    } catch (error) {
      clearSession();
      showLogin();
      notify(error.message, true);
      return;
    }
  }
  if (location.hash === '#sso-error') {
    history.replaceState(null, '', '#login');
    notify(
      'Không thể đăng nhập SSO. Hãy liên kết tài khoản trong trang Tài khoản trước, hoặc kiểm tra cấu hình với quản trị viên.',
      true,
    );
  }
  if (location.hash === '#sso-linked') {
    history.replaceState(null, '', '#account');
    notify('Đã liên kết tài khoản trường.');
  }

  if (!token) {
    showLogin();
    return;
  }
  try {
    saveSession(await api('/auth/me'));
    await render();
  } catch (error) {
    if (token) {
      app.innerHTML = /* HTML */ `<main id="main" class="loading">
        <h1>Chưa thể mở phiên làm việc</h1>
        <p>${esc(error.message)}</p>
        <button id="restore">Thử kết nối lại</button>
      </main>`;
      document.querySelector('#restore').onclick = start;
    } else {
      showLogin();
      notify(error.message, true);
    }
  }
}

setupExtras({ api, request, render, notify, esc, session: () => session, clearSession });
setupSprint2({ api, request, render, notify, esc, session: () => session });
start();
