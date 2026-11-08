# BÁO CÁO TỔNG KẾT SPRINT 1 — QLTH

Ngày cập nhật: 08/11/2026.
Dự án: Cổng quản lý thực tập và khóa luận tốt nghiệp.
Phạm vi: Card 1.1–1.4 theo checklist nghiệm thu; có quản lý tài khoản, nhập Excel và nhật ký hệ thống.

## 1. Kết luận và giới hạn nghiệm thu

Các chức năng nội bộ được triển khai bằng API và giao diện xanh–trắng. Git được khởi tạo tại thư mục gốc, quản lý chung Frontend/Backend. Cấu hình CI, đóng gói Docker và xuất image Staging đã được bổ sung.

SSO Google/Microsoft có mã nguồn và giao diện, nhưng cần Client ID/Secret thật và Microsoft Tenant ID của trường trước khi nghiệm thu đăng nhập thực tế. SMTP đã có chức năng gửi mã, cần cấu hình máy chủ email thật. Không ghi các mục này là đã nghiệm thu với dịch vụ thật.

CI/CD mới được chuẩn bị trong repository; chưa đẩy repository lên GitHub, chưa chạy GitHub Actions và chưa triển khai máy chủ Staging bên ngoài. Không có địa chỉ máy chủ hoặc thông tin dịch vụ trong yêu cầu.

## 2. Card 1.1 — Kiến trúc và cơ sở dữ liệu

- Kiến trúc: Node.js, Express, TypeScript, PostgreSQL; frontend HTML/CSS/JavaScript. Express phục vụ cả giao diện và API cùng origin.
- Git: repository chung ở gốc dự án. Bỏ qua node_modules, dist, .env, file upload, bản dump chứa dữ liệu cá nhân và bản sao lưu.
- Database: baseline backend/database/schema.sql chỉ chứa cấu trúc; backend/database/roles.sql chứa danh mục vai trò; migrations cập nhật phiên đăng nhập, scope, reset mật khẩu, chuyên ngành và hệ đào tạo.
- ERD toàn hệ thống: docs/ERD.md, biểu diễn bảng, cột, PK/FK và liên kết khóa ngoại bằng Mermaid. Schema SQL là nguồn chính xác cho nullable và quy tắc xóa/cập nhật.
- Giao diện: Layout, Sidebar, Header; ẩn trang quản trị với người không có quyền; kiểm tra API phía server là cơ chế bảo vệ chính.
- Lưu trữ: Local Storage cho Word/PDF tại backend/uploads/templates; không công khai qua static URL. Download phải có phiên và đúng phạm vi. Docker sử dụng volume để giữ file khi tạo lại container.
- Dev: chạy tại http://localhost:8000. Cổng kiểm thử ngẫu nhiên chỉ dùng cho kiểm thử.
- Staging: Dockerfile, compose.staging.yml và backend/.env.staging.example; cần DB riêng, HTTPS/reverse proxy và bộ biến môi trường riêng.
- CI: .github/workflows/ci.yml chạy build, unit test, integration test với PostgreSQL riêng và Docker build. CD cơ bản: workflow staging.yml chạy thủ công để build/push image lên GHCR; khởi chạy trên máy chủ theo hướng dẫn triển khai.

## 3. Card 1.2 — Xác thực và quản lý phiên

- Đăng nhập email/mật khẩu với bcrypt; kiểm tra tài khoản hoạt động và vai trò.
- JWT HS256 hết hạn sau 8 giờ, có mã phiên jti. Mỗi yêu cầu đối chiếu trạng thái tài khoản, phiên, vai trò và phạm vi với PostgreSQL.
- Đăng xuất thu hồi phiên hiện tại. Đổi/reset mật khẩu thu hồi toàn bộ phiên và mã khôi phục cũ.
- Mật khẩu mới tối thiểu 8 ký tự, tối đa 72 byte. Không ghi mật khẩu/token vào audit log.
- Quên mật khẩu: mã ngẫu nhiên 192 bit, hết hạn sau 15 phút, dùng một lần; chỉ lưu SHA256 trong DB. Gửi email bằng SMTP khi được cấu hình; nếu chưa cấu hình, Admin cấp mã sau khi xác minh danh tính.
- SSO: OpenID Connect Authorization Code, PKCE S256, state, nonce, kiểm chữ ký/issuer/audience/thời hạn ID token bằng openid-client. Chỉ Microsoft tenant cụ thể, không bật common/multi-tenant.
- Liên kết lần đầu: đăng nhập mật khẩu → Tài khoản → Liên kết tài khoản trường → xác nhận mật khẩu → Google/Microsoft. Không tự ghép theo email. Danh tính liên kết lưu bằng nhà cung cấp và subject; không tự cấp tài khoản/vai trò mới.
- Callback không đưa JWT lên query string: trả ticket một lần, thời hạn 60 giây, gắn cookie HttpOnly, rồi đổi ticket lấy phiên qua POST. Không lưu access token của nhà cung cấp.
- Giới hạn SSO: mỗi tài khoản liên kết một danh tính; trạng thái OAuth ở một tiến trình. Khi chạy nhiều instance cần kho trạng thái chung.

## 4. Card 1.3 — Phân quyền và chuyển vai trò

- Có đủ 6 nhóm yêu cầu, thể hiện bằng 7 mã: SYSTEM_ADMIN, TRAINING_DEPT, FACULTY_MANAGER, DEPT_HEAD, LECTURER, STUDENT, ENTERPRISE_MENTOR. Trưởng khoa/Bộ môn tách thành hai mã để phân quyền rõ.
- Một tài khoản có nhiều tổ hợp vai trò + phạm vi; bộ chọn vai trò nằm trên Header.
- Chuyển vai trò chỉ chấp nhận vai trò thuộc tài khoản; cập nhật phiên, phát JWT mới, không kéo dài hạn phiên; tải lại menu và dữ liệu.
- Data Scope: khoa, bộ môn, ngành, đợt. Phạm vi được xác định từ phiên/vai trò, không cho body/query nới quyền. Người chưa gán phạm vi không mặc định xem toàn bộ.
- Tạo/sửa/khóa/mở khóa tài khoản và gán nhiều vai trò dành cho SYSTEM_ADMIN. Chặn gỡ quản trị viên hoạt động cuối cùng.
- Nhập Excel: XLSX, tối đa 5 MB/200 dòng, kiểm tra định dạng và phạm vi; một dòng sai rollback toàn bộ file. Có file mẫu tải xuống.
- Audit: ghi người, thao tác, đối tượng, thời gian và thay đổi trong cùng transaction; chỉ Admin xem nhật ký.

## 5. Card 1.4 — Danh mục dùng chung

- CRUD Năm học, Học kỳ, Khoa, Bộ môn, Ngành, Chuyên ngành, Hệ đào tạo có API và giao diện.
- Với dữ liệu đã tạo, không đổi đơn vị cha của Bộ môn/Học kỳ/Ngành/Chuyên ngành để tránh thay đổi phạm vi và liên kết nghiệp vụ ngoài ý muốn.
- Xóa danh mục chỉ khi chưa được dùng; kiểm tra khóa ngoại kể cả quan hệ CASCADE/SET NULL để ngăn mất dữ liệu liên quan.
- Học kỳ hiện tại xử lý trong transaction và khóa bảng để tránh hai yêu cầu cùng đặt trạng thái.
- Hệ đào tạo có bảng riêng; lựa chọn khi tạo/sửa ngành. Dữ liệu hệ đào tạo cũ được đưa sang danh mục bằng migration.
- Kho biểu mẫu: upload/download PDF, DOC, DOCX tối đa 10 MB; kiểm tra chữ ký file, tên lưu UUID, checksum, quyền theo khoa. Đây là lưu trữ Local theo lựa chọn được card cho phép.
- Đợt: đã có tạo/đọc và phạm vi. Sửa/xóa đợt không thuộc checklist CRUD danh mục của Card 1.4 hiện tại.

## 6. API bổ sung

- GET/POST /api/v1/master-data/training-systems.
- PATCH/DELETE /api/v1/master-data/{faculties,departments,academic-years,semesters,training-systems}/:id.
- Ngành hỗ trợ thuộc tính training_system khi tạo/sửa.
- GET /api/v1/auth/sso/providers: nhà cung cấp đã được cấu hình.
- GET /api/v1/auth/sso/{google,microsoft}: bắt đầu đăng nhập.
- GET /api/v1/auth/sso/{google,microsoft}/callback: xử lý callback.
- POST /api/v1/auth/sso/link: cần phiên + mật khẩu hiện tại, khởi tạo liên kết.
- POST /api/v1/auth/sso/exchange: đổi ticket một lần lấy phiên nội bộ.

## 7. Hướng dẫn chạy và cấu hình

Tại thư mục gốc dự án:

1. npm.cmd ci
2. Tạo backend/.env theo backend/.env.example; điền DATABASE_URL và JWT_SECRET ngẫu nhiên ít nhất 32 byte.
3. DB mới: import schema.sql, roles.sql, sau đó npm.cmd run migrate --prefix backend. DB có dữ liệu: chỉ chạy migrations, không import lại baseline.
4. npm.cmd run dev
5. Mở http://localhost:8000. Frontend và Backend dùng chung server.

Email: điền SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASS; SMTP_SECURE=true cho TLS trực tiếp, thường cổng 465; false cho STARTTLS, thường cổng 587. Khởi động lại server và thử nhận mã ở hộp thư thật.

SSO: điền APP_URL, GOOGLE_CLIENT_ID/SECRET và GOOGLE_HOSTED_DOMAIN (domain Google Workspace của trường), hoặc MICROSOFT_CLIENT_ID/SECRET/TENANT_ID trong backend/.env. Google kiểm tra hd và email_verified trong ID token; Microsoft giới hạn tenant cụ thể. Đăng ký Web application ở dịch vụ tương ứng; callback chính xác:

- http://localhost:8000/api/v1/auth/sso/google/callback
- http://localhost:8000/api/v1/auth/sso/microsoft/callback
  Với Staging thay origin bằng HTTPS của trường. Không đưa Secret vào frontend hoặc Git.

Staging: sao chép backend/.env.staging.example thành backend/.env.staging và điền thông tin thật. Import schema/roles vào DB Staging mới. Chạy docker compose -f compose.staging.yml build; docker compose -f compose.staging.yml run --rm app node backend/scripts/migrate.cjs; docker compose -f compose.staging.yml up -d. Reverse proxy HTTPS tới 127.0.0.1:8001. Sao lưu DB và volume biểu mẫu độc lập. Chưa chạy triển khai trên máy chủ thật.

Git/GitHub: git status; kiểm tra không có .env, dump dữ liệu hoặc uploads; git add .; git commit; cấu hình remote của nhóm và push. Chưa tạo commit/remote hoặc đẩy mã thay người dùng khi chưa có repository đích.

## 8. Kiểm thử và bằng chứng

Lệnh kiểm thử: npm.cmd test; npm.cmd run test:integration; npm.cmd run test:sprint1.
Đã chạy đạt: TypeScript build; 6 unit test xác thực; 128 kiểm tra tích hợp trên PostgreSQL thật + HTTP; 52 kiểm tra phần bổ sung Sprint 1; kiểm tra cú pháp JavaScript giao diện. VS Code không báo lỗi tại thời điểm kiểm tra. Git status hoạt động; .env và init.sql được bỏ qua đúng. SSO được kiểm thử với discovery/token/JWKS mô phỏng; không thay thế nghiệm thu Google/Microsoft thực tế. SMTP được kiểm thử bằng SMTP fixture cục bộ; không thay thế gửi/nhận mail thật. Máy hiện chưa cài Docker nên chưa chạy Docker build/compose; GitHub Actions chưa chạy trên remote. Chưa kiểm tra lại giao diện bằng trình duyệt trong lượt bổ sung này và chưa mở bản Word bằng Microsoft Word.

Các ca chính: JWT giả/hết hạn/thu hồi; khóa tài khoản; quản trị cuối cùng; scope khoa/ngành/đợt; chuyển vai trò; đổi/reset mật khẩu; Excel rollback; upload/download; CRUD mới; chặn xóa danh mục đang dùng; SSO sai nonce/cookie, callback và ticket dùng lại, danh tính chưa liên kết.

## 9. Việc cần phía đơn vị triển khai

1. Cung cấp ứng dụng OAuth Google/Microsoft của trường và cấu hình callback/domain/tenant.
2. Cung cấp SMTP và xác nhận nhận mail thực tế.
3. Tạo GitHub remote, bật Actions và environment staging; chạy pipeline.
4. Cung cấp máy chủ/DB Staging, tên miền, HTTPS, chính sách backup; chạy triển khai và nghiệm thu.
5. Nghiệm thu toàn bộ checklist cùng người phụ trách; không đánh dấu hoàn tất phần dịch vụ ngoài chỉ vì đã có mã nguồn.

## 10. Tài liệu liên quan

- ERD: docs/ERD.md.
- Kiến trúc: docs/ARCHITECTURE.md.
- Hướng dẫn chung: README.md.
- Báo cáo Word: docs/SPRINT-1-TONG-KET.docx (cùng nội dung với bản Markdown này).
- Tài liệu chính thức SSO: https://github.com/panva/openid-client ; https://developers.google.com/identity/openid-connect/openid-connect ; https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference .
