# QLTH — Sprint 1

Cổng quản lý thực tập và khóa luận. Backend Express/TypeScript, PostgreSQL và giao diện HTML/CSS/JavaScript cùng nguồn tại `http://localhost:8000`.

## Chạy dự án

1. Chạy `npm install` tại thư mục gốc (các dependency được quản lý ở đây).
2. Cấu hình `backend/.env` theo `backend/.env.example`. Dùng database đã có các bảng nghiệp vụ của dự án.
3. Chạy `npm run migrate --prefix backend` để thêm bảng phiên, mã khôi phục, chuyên ngành và phạm vi ngành/đợt. Migration có thể chạy lại và không xóa tài khoản hiện có.
4. Chạy `npm run dev`, rồi mở `http://localhost:8000`.

Trên PowerShell nếu `npm.ps1` bị chặn, dùng `npm.cmd` thay `npm`. Sau khi sửa TypeScript, dừng server bằng Ctrl+C rồi chạy lại lệnh dev để build lại.

Không cần cài đặt hay chạy frontend riêng. Các file React/Vite rỗng còn lại là khung cũ và không được sử dụng; giao diện thực tế ở `frontend/index.html`, `frontend/src/app.js`, `frontend/src/sprint1.js`, `frontend/src/index.css`.

Nếu terminal đang ở thư mục `frontend`, cũng có thể chạy `npm run dev`: lệnh này khởi động cùng ứng dụng backend + giao diện trên cổng 8000. Chỉ chạy một trong hai cách. Nếu `/health` trả OK nhưng trang chủ báo `Cannot GET /`, dừng tiến trình cũ bằng Ctrl+C rồi chạy lại để nạp mã mới. Mở `http://localhost:8000/`, không thêm `/frontend`.

## Xuất và khôi phục database

Xuất DB từ `backend/.env`:

```text
npm run db:backup --prefix backend
```

Lệnh dùng `pg_dump` PostgreSQL 18 trên Windows, xuất SQL Plain UTF-8 vào `backend/database/init.sql`, giữ bản cũ dạng `init.before-backup-<timestamp>.sql`. Có thể đặt biến `PG_DUMP_PATH` nếu PostgreSQL được cài ở vị trí khác. Giữ cấu trúc các bảng phiên và khôi phục, bỏ qua dữ liệu phiên đăng nhập và mã khôi phục.

Khôi phục vào **database trống** bằng PostgreSQL 18:

```text
psql -U postgres -d ten_database -v ON_ERROR_STOP=1 -1 -f backend/database/init.sql
```

File chứa dữ liệu tài khoản và hash mật khẩu. Không bao gồm file biểu mẫu trên ổ đĩa; cần sao chép `backend/uploads` và điều chỉnh đường dẫn file nếu chuyển máy.

## Chức năng đã triển khai

- Đăng nhập; khôi phục phiên khi tải lại trang; tự trở về đăng nhập khi phiên hết hạn; đăng xuất thu hồi phiên hiện tại.
- Đổi mật khẩu trong transaction và thu hồi mọi phiên của tài khoản, kể cả thiết bị khác.
- Chuyển vai trò chỉ trong danh sách được gán; tải lại dữ liệu theo phạm vi. Token cũ của vai trò trước không dùng được khi phiên đang ở vai trò khác.
- Mỗi request kiểm tra phiên, trạng thái tài khoản và vai trò hiện tại trong PostgreSQL.
- Quản trị hệ thống có trang quản lý tài khoản: tạo, sửa, khóa/mở khóa, gán nhiều vai trò và phạm vi khoa/bộ môn/ngành/đợt. Thay đổi tài khoản thu hồi các phiên cũ; không được khóa hoặc gỡ quản trị viên hoạt động cuối cùng.
- Ngành/chuyên ngành: xem, tạo, sửa tên/mã và xóa danh mục chưa được sử dụng. Không đổi đơn vị cha của ngành/chuyên ngành đã tạo để tránh thay đổi phạm vi quyền đã cấp.
- Đợt: xem theo phạm vi, Admin/Đào tạo tạo đợt thuộc khoa/ngành/học kỳ. Ngành và đợt được đối chiếu với phạm vi đã cấp ngay trong câu truy vấn DB.
- Nhật ký quản trị có phân trang, ghi người thực hiện, thời gian và đối tượng; các thao tác tài khoản, danh mục, biểu mẫu, đổi/khôi phục mật khẩu ghi cùng transaction với thay đổi dữ liệu. Không ghi mật khẩu hoặc mã khôi phục vào nhật ký.
- Xem/tìm kiếm khoa, bộ môn, năm học, học kỳ, biểu mẫu; bộ môn có lọc khoa.
- Admin/Đào tạo tạo khoa, bộ môn, năm học, học kỳ. Tạo khoa ghi audit log; tạo học kỳ hiện tại có khóa ngăn hai request ghi đồng thời.
- Admin/Đào tạo và Ban Chủ nhiệm Khoa tải biểu mẫu lên. Quyền theo khoa được kiểm tra tại backend.
- Upload PDF/DOC/DOCX tối đa 10 MB, kiểm tra phần mở rộng và dấu hiệu nội dung; lưu SHA256; download có xác thực và kiểm tra phạm vi.

Tài khoản sử dụng phải có `password_hash` bcrypt, `is_active = true` và ít nhất một bản ghi `user_roles`. Không có đăng ký công khai. Chỉ `SYSTEM_ADMIN` tạo tài khoản, nhập Excel và cấp vai trò; `TRAINING_DEPT` quản lý danh mục nhưng không được tự cấp quyền quản trị.

## Nhập tài khoản từ Excel

Đăng nhập Admin → **Quản lý tài khoản** → **Tải file Excel mẫu**. Điền sheet `Users` với đúng 9 cột:

```text
code,email,full_name,password,role_code,faculty_code,department_code,major_code,campaign_code
```

- Dùng file `.xlsx`, tối đa 5 MB và 200 dòng tài khoản (không tính dòng tiêu đề). Không dùng công thức trong ô.
- Mã tài khoản, email, họ tên, mật khẩu và vai trò bắt buộc. Mật khẩu mới có ít nhất 8 ký tự, tối đa 72 byte UTF-8. File mẫu định dạng ô dạng chữ để giữ số 0 ở đầu.
- Vai trò: `SYSTEM_ADMIN`, `TRAINING_DEPT`, `FACULTY_MANAGER`, `DEPT_HEAD`, `LECTURER`, `STUDENT`, `ENTERPRISE_MENTOR`. Nhiều vai trò cùng phạm vi phân cách bằng `|`; các phạm vi khác nhau được chỉnh trong màn hình sửa tài khoản.
- Các mã khoa/bộ môn/ngành/đợt phải tồn tại và khớp nhau. Chọn ngành hoặc đợt sẽ suy ra đơn vị cha. Admin/Đào tạo phải để trống mọi cột phạm vi. Người không có phạm vi không được mặc định xem toàn bộ dữ liệu.
- Email không phân biệt chữ hoa/thường; tài khoản trùng email hoặc mã sẽ bị từ chối. Một dòng sai sẽ trả số dòng và rollback toàn bộ file; tài khoản cũ không bị ghi đè.

## Khôi phục mật khẩu

Màn hình đăng nhập có **Quên mật khẩu?** và **Tôi đã có mã khôi phục**.

Khi chưa có SMTP: người dùng liên hệ quản trị viên. Sau khi xác minh danh tính, Admin mở **Quản lý tài khoản → Cấp mã khôi phục** cho đúng người dùng. Chủ tài khoản nhập email, mã và mật khẩu mới tại màn hình đặt lại mật khẩu. Mã hết hạn sau 15 phút, chỉ dùng một lần; đặt lại thành công thu hồi tất cả phiên đăng nhập. Mã chỉ được lưu dưới dạng SHA256 trong DB.

Muốn gửi email tự động, điền `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` và thông tin xác thực trong `backend/.env` theo `.env.example`, rồi khởi động lại server. `SMTP_SECURE=true` dành cho kết nối TLS trực tiếp (thường cổng 465); cổng 587 dùng STARTTLS. Không đưa thông tin SMTP lên Git. Khi cấu hình SMTP trống, giao diện hướng dẫn nhận mã qua Admin; không giả lập việc đã gửi email.

## Kiểm tra

```text
npm test
npm run typecheck --prefix backend
npm run test:integration --prefix backend
```

Unit test dùng database giả lập. Integration test chạy HTTP với PostgreSQL từ `backend/.env`, tạo tài khoản và dữ liệu có mã `it_<ngẫu nhiên>`, rồi dọn trong khối finally. Chạy trên database phát triển; nếu tiến trình bị cưỡng bức dừng, fixture có thể cần được dọn thủ công. Test không thay đổi tài khoản nghiệp vụ có sẵn hoặc học kỳ hiện tại.

## Giới hạn nghiệm thu

Sprint 1 có API/giao diện cho tài khoản, phạm vi ngành/đợt, khôi phục, Excel, CRUD danh mục và Hệ đào tạo. SSO Google/Microsoft đã có mã nguồn; cần Client ID/Secret, domain Google Workspace hoặc Microsoft Tenant ID thật để bật. SMTP cần cấu hình thực tế để nghiệm thu gửi/nhận email. Xem [tổng kết Sprint 1](docs/SPRINT-1-TONG-KET.md), [bản Word](docs/SPRINT-1-TONG-KET.docx) và [ERD](docs/ERD.md). Nghiệp vụ ghép nhóm, chấm điểm và audit tương ứng thuộc các module chưa triển khai.

Sprint 2 bổ sung **Nhập dữ liệu Excel**, **Hồ sơ cá nhân**, hạn mức giảng viên, cấu hình đợt, danh sách đủ điều kiện và mốc thời gian/ngoại lệ. Sau khi cập nhật, chạy `npm run migrate --prefix backend` và khởi động lại ứng dụng. Xem [hướng dẫn Sprint 2](docs/SPRINT-2.md); kiểm thử bằng `npm run test:sprint2`. API đăng ký trong sprint này là tham gia đợt, chưa phải đăng ký đề tài/nguyện vọng cụ thể.

File Office chỉ được kiểm tra định dạng cơ bản, không có quét virus hay xác minh chữ ký số. SHA256 phục vụ kiểm tra tính toàn vẹn, không chứng minh tác giả. Khi triển khai mạng công cộng, dùng HTTPS và cấu hình giới hạn đăng nhập ở reverse proxy.

`npm audit --omit=dev` hiện còn cảnh báo mức moderate trong các dependency gián tiếp của ExcelJS (`uuid`, `glob`/`minimatch` và chuỗi archiver). Không có high/critical trong lần kiểm tra. Chức năng Excel chỉ mở cho Admin và có giới hạn kích thước nén/giải nén; cần kiểm tra lại dependency trước khi triển khai công cộng.
