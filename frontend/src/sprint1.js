let c;
let meta;
let users = [];
let records = [];
let userPage = 1;
let userSearch = '';
let auditPage = 1;
let editingUser = null;
let editingCatalog = null;
let working = false;

export const extraPages = {
  users: ['Quản lý tài khoản', 'Tạo, cập nhật, khóa tài khoản và gán vai trò theo phạm vi.'],
  majors: ['Ngành', 'Danh mục ngành theo bộ môn và khoa.'],
  specializations: ['Chuyên ngành', 'Quản lý các chuyên ngành thuộc ngành đào tạo.'],
  campaigns: ['Đợt', 'Danh sách đợt thực tập, khóa luận theo phạm vi được cấp.'],
  audit: ['Nhật ký hệ thống', 'Theo dõi người thực hiện và thời điểm thay đổi dữ liệu.'],
};

const admin = () => c.session()?.active_role.role_code === 'SYSTEM_ADMIN';
const manager = () =>
  ['SYSTEM_ADMIN', 'TRAINING_DEPT'].includes(c.session()?.active_role.role_code);
const esc = (value) => c.esc(value);
const field = (name, label, value = '', type = 'text', extra = '') =>
  /* HTML */ `<label
    >${label}<input name="${name}" type="${type}" value="${esc(value)}" required ${extra}
  /></label>`;

function choose(name, label, rows, value = '', key = 'name', optional = true) {
  return /* HTML */ `<label
    >${label}<select name="${name}" ${optional ? '' : 'required'}>
      <option value="">
        ${optional ? 'Không giới hạn / tự suy ra' : 'Chọn ' + label.toLowerCase()}
      </option>
      ${rows.map((r) => /* HTML */ `<option value="${esc(r.id)}" ${r.id === value ? 'selected' : ''}>${esc([r.code, r[key]].filter(Boolean).join(' · '))}</option>`).join('')}
    </select></label
  >`;
}

const form = (kind, title, fields, button = 'Lưu thông tin') =>
  /* HTML */ `<section class="panel">
    <div class="panel-header"><h2>${title}</h2></div>
    <form class="panel-body" data-extra-form="${kind}">
      <div class="form-grid">${fields}</div>
      <p class="error-text" role="alert" hidden></p>
      <div class="form-actions"><button type="submit" class="primary">${button}</button></div>
    </form>
  </section>`;
const table = (headers, rows) =>
  /* HTML */ `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          ${headers.map((h) => /* HTML */ `<th scope="col">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.join('')}
      </tbody>
    </table>
    ${rows.length ? '' : '<p class="empty">Chưa có dữ liệu.</p>'}
  </div>`;

function roleRow(value = { role_code: 'STUDENT' }) {
  return /* HTML */ `<fieldset class="role-row">
    <legend>Vai trò và phạm vi</legend>
    <div class="form-grid">
      <label
        >Vai trò<select name="role_code" required>
          ${meta.roles.map((r) => /* HTML */ `<option value="${esc(r.code)}" ${value.role_code === r.code ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
        </select></label
      >${choose('faculty_id', 'Khoa', meta.faculties, value.faculty_id)}${choose('department_id', 'Bộ môn', meta.departments, value.department_id)}${choose('major_id', 'Ngành', meta.majors, value.major_id)}${choose('campaign_id', 'Đợt', meta.campaigns, value.campaign_id)}
    </div>
    <button type="button" data-extra-action="remove-role">Bỏ vai trò này</button>
  </fieldset>`;
}

function userForm() {
  const u = editingUser;
  return form(
    'user',
    u ? 'Sửa tài khoản' : 'Tạo tài khoản',
    `${field('code', 'Mã tài khoản', u?.code || '', 'text', 'maxlength="50"')}${field('full_name', 'Họ và tên', u?.full_name || '', 'text', 'maxlength="150"')}${field('email', 'Email', u?.email || '', 'email', 'maxlength="255"')}${u ? /* HTML */ `<label class="checkbox"><input type="checkbox" name="is_active" ${u.is_active ? 'checked' : ''} />Tài khoản hoạt động</label>` : field('password', 'Mật khẩu ban đầu', '', 'password', 'minlength="8" autocomplete="new-password"')}<p class="small muted span-2">Vai trò đầu tiên là mặc định. Chọn ngành/đợt sẽ tự suy ra đơn vị cha; không chọn các phạm vi mâu thuẫn. Admin/Đào tạo dùng phạm vi toàn hệ thống.</p><div class="span-2" id="role-rows">${(u?.roles || [{ role_code: 'STUDENT' }]).map(roleRow).join('')}</div><div class="span-2"><button type="button" data-extra-action="add-role">Thêm vai trò</button> ${u ? '<button type="button" data-extra-action="cancel-user">Hủy sửa</button>' : ''}</div>`,
  );
}

export async function renderExtra(page, area) {
  if (['users', 'audit'].includes(page) && !admin()) {
    area.innerHTML = '<p class="screen-error">Bạn không có quyền truy cập trang quản trị.</p>';
    return;
  }
  if (page === 'users') {
    const [result, options] = await Promise.all([
      c.api(`/admin/users?page=${userPage}&search=${encodeURIComponent(userSearch)}`),
      c.api('/admin/options'),
    ]);
    if (!area.isConnected) {
      return;
    }
    meta = options;
    users = result.items;
    area.innerHTML = /* HTML */ `<section class="panel">
        <div class="panel-header">
          <h2>Tài khoản (${result.total})</h2>
          <form data-extra-form="user-search" class="inline-form">
            <input
              name="search"
              type="search"
              value="${esc(userSearch)}"
              aria-label="Tìm tài khoản"
              placeholder="Mã, tên hoặc email"
            /><button type="submit">Tìm</button>
          </form>
        </div>
        ${table(
          ['Người dùng', 'Vai trò', 'Trạng thái', 'Thao tác'],
          users.map(
            (u) =>
              /* HTML */ `<tr>
                <td>
                  ${esc(u.full_name)}<br /><span class="small muted"
                    >${esc(u.email)} · ${esc(u.code)}</span
                  >
                </td>
                <td>${u.roles.map((r) => esc(r.role_name)).join('<br>')}</td>
                <td>${u.is_active ? 'Hoạt động' : 'Đã khóa'}</td>
                <td>
                  <div class="row-actions">
                    <button type="button" data-extra-action="edit-user" data-id="${esc(u.id)}">
                      Sửa / phân quyền</button
                    ><button type="button" data-extra-action="recover-user" data-id="${esc(u.id)}">
                      Cấp mã khôi phục
                    </button>
                  </div>
                </td>
              </tr>`,
          ),
        )}
        <div class="panel-body pagination">
          <button
            type="button"
            data-extra-action="users-prev"
            ${result.page <= 1 ? 'disabled' : ''}
          >
            Trang trước</button
          ><span>${result.page} / ${result.pages}</span
          ><button
            type="button"
            data-extra-action="users-next"
            ${result.page >= result.pages ? 'disabled' : ''}
          >
            Trang sau
          </button>
        </div>
      </section>
      <div id="recovery-result" role="status"></div>
      <div id="user-editor">${userForm()}</div>
      ${form('import', 'Nhập tài khoản từ Excel', '<label class="span-2">File Excel .xlsx<input name="file" type="file" accept=".xlsx" required><small>Tối đa 5 MB, 200 tài khoản. Một dòng sai thì toàn bộ file chưa được lưu.</small></label><p class="small muted span-2">Các cột mã phạm vi dùng mã danh mục, không dùng tên. Nhiều vai trò phân cách bằng dấu |. Để trống phạm vi nếu không giới hạn; người chưa có phạm vi chỉ thấy danh mục dùng chung.</p><div class="span-2"><button type="button" data-extra-action="download-template">Tải file Excel mẫu</button></div>', 'Nhập tài khoản')}`;
    return;
  }
  if (page === 'audit') {
    const rows = await c.api(`/admin/audit?page=${auditPage}`);
    if (!area.isConnected) {
      return;
    }
    area.innerHTML = /* HTML */ `<section class="panel">
      <div class="panel-header"><h2>Nhật ký thay đổi</h2></div>
      ${table(
        ['Thời điểm', 'Người thực hiện', 'Thao tác', 'Đối tượng'],
        rows.map(
          (r) =>
            /* HTML */ `<tr>
              <td>${esc(new Date(r.created_at).toLocaleString('vi-VN'))}</td>
              <td>
                ${esc(r.actor_name || 'Khôi phục tài khoản / hệ thống')}<br /><span
                  class="small muted"
                  >${esc(r.actor_role)}</span
                >
              </td>
              <td>${esc(r.action)}</td>
              <td>${esc(r.entity_table)}<br /><span class="code">${esc(r.entity_id)}</span></td>
            </tr>`,
        ),
      )}
      <div class="panel-body pagination">
        <button data-extra-action="audit-prev" ${auditPage === 1 ? 'disabled' : ''}>
          Trang trước</button
        ><span>Trang ${auditPage}</span
        ><button data-extra-action="audit-next" ${rows.length < 50 ? 'disabled' : ''}>
          Trang sau
        </button>
      </div>
    </section>`;
    return;
  }
  const [rows, departments, majors, faculties, semesters, systems] = await Promise.all([
    c.api(`/master-data/${page}`),
    c.api('/master-data/departments'),
    c.api('/master-data/majors'),
    c.api('/master-data/faculties'),
    c.api('/master-data/semesters'),
    c.api('/master-data/training-systems'),
  ]);
  if (!area.isConnected) {
    return;
  }
  records = rows;
  let fields = '';
  let headers = [];
  let html = [];
  const edit = editingCatalog?.page === page ? editingCatalog.record : null;
  if (page === 'majors' || page === 'specializations') {
    const parent = page === 'majors' ? 'department_id' : 'major_id';
    const parents = page === 'majors' ? departments : majors;
    headers = [
      'Mã',
      'Tên',
      page === 'majors' ? 'Bộ môn / Khoa' : 'Ngành',
      ...(manager() ? ['Thao tác'] : []),
    ];
    html = rows.map(
      (r) =>
        /* HTML */ `<tr>
          <td class="code">${esc(r.code)}</td>
          <td>${esc(r.name)}</td>
          <td>
            ${esc(r.department_name || r.major_name)}${r.faculty_name ? '<br>' + esc(r.faculty_name) : ''}
          </td>
          ${
            manager()
              ? /* HTML */ `<td>
                  <div class="row-actions">
                    <button data-extra-action="edit-catalog" data-id="${esc(r.id)}">Sửa</button
                    ><button data-extra-action="delete-catalog" data-id="${esc(r.id)}">Xóa</button>
                  </div>
                </td>`
              : ''
          }
        </tr>`,
    );
    fields =
      field('code', 'Mã', edit?.code || '', 'text', 'maxlength="50"') +
      field('name', 'Tên', edit?.name || '', 'text', 'maxlength="255"') +
      choose(
        parent,
        page === 'majors' ? 'Bộ môn' : 'Ngành',
        parents,
        edit?.[parent],
        'name',
        false,
      ) +
      (edit
        ? '<p class="small muted span-2">Không đổi đơn vị cha của danh mục đã tạo.</p><div><button type="button" data-extra-action="cancel-catalog">Hủy sửa</button></div>'
        : '');
  } else {
    headers = ['Đợt', 'Khoa / Ngành', 'Học kỳ', 'Loại / Trạng thái'];
    html = rows.map(
      (r) =>
        /* HTML */ `<tr>
          <td>${esc(r.name)}<br /><span class="small muted">${esc(r.code)}</span></td>
          <td>${esc(r.faculty_name)}<br />${esc(r.major_name || 'Tất cả ngành trong khoa')}</td>
          <td>${esc(r.semester_name)}</td>
          <td>${esc(r.type)}<br />${esc(r.status)}</td>
        </tr>`,
    );
    fields =
      field('code', 'Mã đợt', '', 'text', 'maxlength="50"') +
      field('name', 'Tên đợt') +
      choose('faculty_id', 'Khoa', faculties, '', 'name', false) +
      choose('major_id', 'Ngành', majors) +
      choose('semester_id', 'Học kỳ', semesters, '', 'name', false) +
      '<label>Loại đợt<select name="type"><option value="THESIS">Khóa luận</option><option value="INTERNSHIP">Thực tập</option><option value="COMBINED">Kết hợp</option></select></label>';
  }
  if (page === 'majors') {
    fields += /* HTML */ `<label
      >Hệ đào tạo<select name="training_system" required>
        ${systems.map((s) => /* HTML */ `<option value="${esc(s.code)}" ${(edit?.training_system || 'CHINH_QUY') === s.code ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select></label
    >`;
  }
  area.innerHTML = /* HTML */ `<section class="panel">
      <div class="panel-header"><h2>Danh sách (${rows.length})</h2></div>
      ${table(headers, html)}
    </section>
    ${manager() ? form('catalog', edit ? 'Sửa thông tin' : 'Thêm ' + extraPages[page][0].toLowerCase(), fields) : ''}`;
}

export function recoveryHTML(mode) {
  return /* HTML */ `<main id="main" class="login-panel recovery-page">
    <div class="login-box">
      <p class="eyebrow">QLTH · TÀI KHOẢN</p>
      <h1>${mode === 'forgot' ? 'Quên mật khẩu' : 'Đặt lại mật khẩu'}</h1>
      <p class="muted">
        ${mode === 'forgot' ? 'Nhận mã qua email nếu hệ thống đã bật gửi mail, hoặc liên hệ quản trị viên để xác minh danh tính và được cấp mã.' : 'Nhập mã một lần từ email hoặc quản trị viên. Mã hết hạn sau 15 phút.'}
      </p>
      ${form(mode, mode === 'forgot' ? 'Yêu cầu khôi phục' : 'Xác nhận khôi phục', field('email', 'Email tài khoản', '', 'email', 'autocomplete="username"') + (mode === 'reset' ? field('recovery_code', 'Mã khôi phục', '', 'text', 'maxlength="48" pattern="[a-f0-9]{48}" autocomplete="off"') + field('new_password', 'Mật khẩu mới', '', 'password', 'minlength="8" autocomplete="new-password"') + field('confirm_password', 'Nhập lại mật khẩu', '', 'password', 'minlength="8" autocomplete="new-password"') : ''), mode === 'forgot' ? 'Gửi yêu cầu' : 'Đặt lại mật khẩu')}
      <p>
        <a href="#${mode === 'forgot' ? 'reset' : 'forgot'}"
          >${mode === 'forgot' ? 'Tôi đã có mã khôi phục' : 'Yêu cầu mã khôi phục'}</a
        >
      </p>
      <a href="#login">Quay lại đăng nhập</a>
    </div>
  </main>`;
}

async function download(url, filename) {
  const response = await c.request(url);
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function setupExtras(context) {
  c = context;
  const app = document.querySelector('#app');
  app.addEventListener('submit', async (event) => {
    const element = event.target.closest('form[data-extra-form]');
    if (!element) {
      return;
    }
    event.preventDefault();
    if (working) {
      return;
    }
    working = true;
    const button = element.querySelector('[type=submit]');
    button.disabled = true;
    const error = element.querySelector('.error-text');
    if (error) {
      error.hidden = true;
    }
    const values = Object.fromEntries(new FormData(element));
    const kind = element.dataset.extraForm;
    try {
      if (kind === 'user-search') {
        userPage = 1;
        userSearch = values.search;
        await c.render();
        return;
      }
      if (kind === 'user') {
        values.roles = [...element.querySelectorAll('.role-row')].map((row) =>
          Object.fromEntries(
            [...row.querySelectorAll('select')].map((s) => [s.name, s.value || null]),
          ),
        );
        if (editingUser) {
          values.is_active = element.elements.is_active.checked;
        }
        const self = editingUser?.id === c.session()?.user.id;
        await c.api('/admin/users' + (editingUser ? '/' + editingUser.id : ''), {
          method: editingUser ? 'PATCH' : 'POST',
          body: values,
        });
        editingUser = null;
        if (self) {
          c.clearSession();
        }
        await c.render();
        c.notify(self ? 'Đã cập nhật tài khoản. Vui lòng đăng nhập lại.' : 'Đã lưu tài khoản.');
      } else if (kind === 'import') {
        if (values.file.size > 5 * 1024 * 1024) {
          throw Error('File Excel tối đa 5 MB');
        }
        const result = await c.api('/admin/users-import', {
          method: 'POST',
          body: new FormData(element),
        });
        await c.render();
        c.notify(result.message);
      } else if (kind === 'catalog') {
        const page = location.hash.slice(1);
        const edit = editingCatalog?.page === page ? editingCatalog.record : null;
        await c.api(`/master-data/${page}${edit ? '/' + edit.id : ''}`, {
          method: edit ? 'PATCH' : 'POST',
          body: values,
        });
        editingCatalog = null;
        await c.render();
        c.notify('Đã lưu danh mục.');
      } else if (kind === 'forgot') {
        const result = await c.api('/auth/forgot-password', {
          method: 'POST',
          body: { email: values.email },
        });
        c.notify(result.message);
      } else if (kind === 'reset') {
        if (values.new_password !== values.confirm_password) {
          throw Error('Mật khẩu nhập lại chưa khớp');
        }
        const result = await c.api('/auth/reset-password', { method: 'POST', body: values });
        c.clearSession();
        location.hash = 'login';
        await c.render();
        c.notify(result.message);
      }
    } catch (e) {
      if (error?.isConnected) {
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
    const b = event.target.closest('[data-extra-action]');
    if (!b || working) {
      return;
    }
    const action = b.dataset.extraAction;
    if (action === 'add-role') {
      document.querySelector('#role-rows').insertAdjacentHTML('beforeend', roleRow());
      return;
    }
    if (action === 'remove-role') {
      if (document.querySelectorAll('.role-row').length > 1) {
        b.closest('.role-row').remove();
      } else {
        c.notify('Cần giữ ít nhất một vai trò.', true);
      }
      return;
    }
    if (action === 'edit-user') {
      editingUser = users.find((u) => u.id === b.dataset.id);
      document.querySelector('#user-editor').innerHTML = userForm();
      document.querySelector('#user-editor input').focus();
      return;
    }
    if (action === 'cancel-user') {
      editingUser = null;
      document.querySelector('#user-editor').innerHTML = userForm();
      return;
    }
    if (action === 'edit-catalog') {
      editingCatalog = {
        page: location.hash.slice(1),
        record: records.find((r) => r.id === b.dataset.id),
      };
      await c.render();
      return;
    }
    if (action === 'cancel-catalog') {
      editingCatalog = null;
      await c.render();
      return;
    }
    working = true;
    b.disabled = true;
    try {
      if (action === 'users-prev' || action === 'users-next') {
        userPage += action === 'users-prev' ? -1 : 1;
        await c.render();
      } else if (action === 'audit-prev' || action === 'audit-next') {
        auditPage += action === 'audit-prev' ? -1 : 1;
        await c.render();
      } else if (action === 'download-template') {
        await download('/admin/users-import-template', 'users-template.xlsx');
      } else if (action === 'delete-catalog') {
        if (!confirm('Xóa danh mục này? Danh mục đang được sử dụng sẽ không thể xóa.')) {
          return;
        }
        await c.api(`/master-data/${location.hash.slice(1)}/${b.dataset.id}`, { method: 'DELETE' });
        editingCatalog = null;
        await c.render();
        c.notify('Đã xóa danh mục.');
      } else if (action === 'recover-user') {
        const result = await c.api(`/admin/users/${b.dataset.id}/recovery`, {
          method: 'POST',
          body: {},
        });
        document.querySelector('#recovery-result').innerHTML = /* HTML */ `<section class="panel">
          <div class="panel-body">
            <h2>Mã khôi phục · ${esc(users.find((u) => u.id === b.dataset.id)?.email)}</h2>
            <p>${esc(result.message)} Hết hạn sau ${result.expires_in_minutes} phút.</p>
            <label>Mã khôi phục<textarea readonly>${esc(result.recovery_code)}</textarea></label
            ><button data-extra-action="hide-code">Ẩn mã</button>
          </div>
        </section>`;
      } else if (action === 'hide-code') {
        document.querySelector('#recovery-result').replaceChildren();
      }
    } catch (e) {
      c.notify(e.message, true);
    } finally {
      working = false;
      if (b.isConnected) {
        b.disabled = false;
      }
    }
  });
}
