# Kiến trúc Sprint 1

- Trình duyệt tải [giao diện](../frontend/index.html) từ Express, gọi API cùng nguồn. Không cần server frontend riêng.
- [Server](../backend/src/server.ts) đăng ký route, phân quyền, giới hạn upload và xử lý lỗi chung; chỉ listen khi chạy trực tiếp để test có thể mở cổng tạm.
- [Auth controller](../backend/src/controllers/auth.controller.ts) quản lý đăng nhập, đăng xuất, đổi mật khẩu và chuyển vai trò.
- [RBAC middleware](../backend/src/middlewares/rbac.middleware.ts) xác minh JWT HS256, bắt buộc thời hạn và mã phiên; đối chiếu với user, role, scope và phiên chưa hết hạn trong PostgreSQL.
- JWT chứa `sub`, `code`, `jti`, `active_role`, `scope`, `iat`, `exp`. Thời hạn 8 giờ tính từ đăng nhập; chuyển vai trò không gia hạn phiên.
- Bảng [auth_sessions](../backend/migrations/001_auth_sessions.sql) giữ vai trò đang sử dụng của từng phiên. Logout xóa một phiên; đổi mật khẩu xóa tất cả phiên của tài khoản trong cùng transaction cập nhật mật khẩu. Token từ phiên bản chưa có `jti` cần đăng nhập lại.
- Giao diện giữ token trong `sessionStorage`, xác minh lại bằng `/auth/me` khi tải trang. Nội dung database được escape trước khi hiển thị; CSP chặn script nội tuyến. API trả `Cache-Control: no-store`.
- [Master controller](../backend/src/controllers/master.controller.ts) lọc khoa/bộ môn theo quyền; người không có phạm vi không được mặc định xem toàn bộ dữ liệu. Năm học/học kỳ là danh mục chung. Biểu mẫu dùng chung toàn hệ thống hoặc thuộc khoa; file không được public qua static server.
- Cấu hình PostgreSQL và JWT được tải từ `backend/.env` trước khi khởi tạo. Khóa JWT không được có giá trị mặc định và phải có ít nhất 32 byte.
- [Accounts controller](../backend/src/controllers/accounts.controller.ts) tạo/sửa/khóa tài khoản và gán nhiều tổ hợp vai trò + phạm vi. Khoa/bộ môn/ngành/đợt phải khớp nhau. Thay đổi tài khoản xóa các phiên cũ; advisory lock ngăn hai yêu cầu đồng thời gỡ quản trị viên cuối cùng.
- [Migration 002](../backend/migrations/002_sprint1_accounts.sql) thêm `major_id`, `campaign_id` vào `user_roles`, index email không phân biệt hoa/thường, bảng `specializations` và `password_resets`. `scope` trong JWT chứa cả 4 phạm vi; middleware đối chiếu lại với DB.
- [Catalog controller](../backend/src/controllers/catalog.controller.ts) lọc ngành/chuyên ngành/đợt bằng quyền hiện tại; không lấy phạm vi từ query hoặc body để nới quyền đọc.
- [Import controller](../backend/src/controllers/import.controller.ts) đọc XLSX bằng ExcelJS, giới hạn 5 MB, 200 dòng, 20 MB dung lượng khai báo giải nén; cấm công thức và rollback toàn bộ file nếu một dòng không hợp lệ.
- [Recovery controller](../backend/src/controllers/recovery.controller.ts) dùng mã ngẫu nhiên 192 bit, DB lưu SHA256, hết hạn 15 phút và dùng một lần. Admin cấp mã sau khi xác minh danh tính; tùy chọn SMTP gửi mã đến email tài khoản. Reset và đổi mật khẩu thu hồi tất cả phiên và mã reset cũ.
- [Audit helper](../backend/src/utils/audit.ts) ghi cùng transaction với thay đổi; không ghi mật khẩu hoặc token vào audit. Trang nhật ký chỉ dành cho SYSTEM_ADMIN.

## Các API

`POST /api/v1/auth/login`, `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password` là API công khai; `/health` chỉ báo tiến trình đang chạy, không kiểm tra DB. Endpoint khôi phục giới hạn 20 yêu cầu/IP/15 phút trong một tiến trình.

Các API sau yêu cầu Bearer token:

| API                                                                                          | Quyền                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `GET /api/v1/auth/me`                                                                        | Phiên hợp lệ                                            |
| `POST /api/v1/auth/logout`                                                                   | Phiên hợp lệ                                            |
| `POST /api/v1/auth/change-password`                                                          | Phiên hợp lệ + mật khẩu hiện tại                        |
| `POST /api/v1/auth/switch-role`                                                              | Vai trò phải thuộc tài khoản                            |
| `GET /api/v1/master-data/faculties`                                                          | Lọc phạm vi                                             |
| `GET /api/v1/master-data/departments`                                                        | Lọc phạm vi + `faculty_id` tùy chọn                     |
| `GET /api/v1/master-data/academic-years`                                                     | Phiên hợp lệ                                            |
| `GET /api/v1/master-data/semesters`                                                          | Phiên hợp lệ                                            |
| `POST /api/v1/master-data/{faculties,departments,academic-years,semesters}`                  | SYSTEM_ADMIN, TRAINING_DEPT                             |
| `GET /api/v1/master-data/document-templates`                                                 | Biểu mẫu chung + phạm vi khoa                           |
| `POST /api/v1/master-data/document-templates`                                                | SYSTEM_ADMIN, TRAINING_DEPT, FACULTY_MANAGER trong khoa |
| `GET /api/v1/master-data/document-templates/:id/download`                                    | Biểu mẫu chung + phạm vi khoa                           |
| `GET /api/v1/admin/options`, `GET/POST /api/v1/admin/users`, `PATCH /api/v1/admin/users/:id` | SYSTEM_ADMIN                                            |
| `POST /api/v1/admin/users/:id/recovery`                                                      | SYSTEM_ADMIN, cấp mã khôi phục một lần                  |
| `GET /api/v1/admin/users-import-template`, `POST /api/v1/admin/users-import`                 | SYSTEM_ADMIN, file mẫu và nhập XLSX                     |
| `GET /api/v1/admin/audit`                                                                    | SYSTEM_ADMIN                                            |
| `GET /api/v1/master-data/{majors,specializations,campaigns}`                                 | Lọc theo khoa/bộ môn/ngành/đợt                          |
| `POST /api/v1/master-data/{majors,specializations,campaigns}`                                | SYSTEM_ADMIN, TRAINING_DEPT                             |
| `PATCH/DELETE /api/v1/master-data/{majors,specializations}/:id`                              | SYSTEM_ADMIN, TRAINING_DEPT                             |

Database nghiệp vụ có sẵn không được dựng lại bởi migration phiên. Integration test cần các role SYSTEM_ADMIN, FACULTY_MANAGER, DEPT_HEAD, LECTURER có sẵn.
