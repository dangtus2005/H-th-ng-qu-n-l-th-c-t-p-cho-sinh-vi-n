const paths = {
  school: '<path d="m3 9 9-6 9 6-9 6-9-6Z"/><path d="M6 11v6l6 4 6-4v-6M21 9v7"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4V4ZM20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-3h3V4Z"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  building:
    '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M10 21v-5h4v5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2M8 18h2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8M8 17h5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  save: '<path d="m5 12 4 4L19 6"/>',
  logout: '<path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
};

export const icon = (name) =>
  /* HTML */ `<svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    ${paths[name] || paths.grid}
  </svg>`;

export const pageIcons = {
  profile: 'user',
  'bulk-import': 'upload',
  users: 'users',
  majors: 'book',
  specializations: 'layers',
  campaigns: 'calendar',
  audit: 'history',
  faculties: 'building',
  departments: 'grid',
  'academic-years': 'calendar',
  semesters: 'calendar',
  'training-systems': 'school',
  'document-templates': 'file',
  account: 'user',
};

export function enhanceUI(root) {
  root.querySelectorAll('.panel-header h2').forEach((heading) => {
    if (heading.querySelector('.icon')) {
      return;
    }
    const text = heading.textContent.toLocaleLowerCase('vi');
    const name = /thêm|tạo/.test(text)
      ? 'plus'
      : /sửa/.test(text)
        ? 'edit'
        : /mật khẩu|khôi phục/.test(text)
          ? 'lock'
          : /excel|tải lên/.test(text)
            ? 'upload'
            : /nhật ký/.test(text)
              ? 'history'
              : 'layers';
    heading.insertAdjacentHTML('afterbegin', icon(name));
  });
  root.querySelectorAll('button').forEach((button) => {
    if (button.querySelector('.icon') || button.closest('#notice')) {
      return;
    }
    const text = button.textContent.toLocaleLowerCase('vi');
    const name = /đăng xuất/.test(text)
      ? 'logout'
      : /xóa|bỏ vai trò/.test(text)
        ? 'trash'
        : /tải xuống|tải file/.test(text)
          ? 'download'
          : /tải.*lên|nhập tài khoản/.test(text)
            ? 'upload'
            : /sửa/.test(text)
              ? 'edit'
              : /thêm/.test(text)
                ? 'plus'
                : /lưu|xác nhận|đặt lại/.test(text)
                  ? 'save'
                  : /đăng nhập/.test(text)
                    ? 'arrow'
                    : /tìm/.test(text)
                      ? 'search'
                      : null;
    if (name) {
      button.insertAdjacentHTML('afterbegin', icon(name));
    }
    if (/^xóa|bỏ vai trò/.test(text)) {
      button.classList.add('danger');
    }
  });
}
