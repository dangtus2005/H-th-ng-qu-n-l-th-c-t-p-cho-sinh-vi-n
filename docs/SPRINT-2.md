# Sprint 2 — Người dùng, hồ sơ và cấu hình đợt

## Card 2.1 — Bulk Import Excel

- Menu **Nhập dữ liệu Excel** dành cho Admin, tách ba mẫu Sinh viên, Giảng viên, Doanh nghiệp/Mentor.
- Tối đa 5 MB, một sheet, 200 dòng; kiểm tra cột mẫu, công thức, email, mã trùng và đơn vị ngành/bộ môn.
- Mỗi dòng có transaction savepoint: dòng hợp lệ tạo tài khoản, vai trò, hồ sơ và thông báo; dòng lỗi không làm mất dòng hợp lệ. Bảng kết quả trả số dòng, mã, lỗi và trạng thái email. Nhập lại chỉ dòng lỗi.
- Mật khẩu có thể bỏ trống: server sinh mật khẩu ngẫu nhiên, người dùng thiết lập bằng chức năng khôi phục. Email thông báo không chứa mật khẩu.
- Có SMTP: gửi email sau khi commit; ghi nhận gửi thành công/thất bại từng dòng. Chưa có SMTP: ghi rõ chưa cấu hình, vẫn lưu tài khoản và thông báo trong DB. Chưa có hàng đợi gửi lại tự động; Admin có thể cấp mã khôi phục theo quy trình Sprint 1.
- Chức năng Excel cũ của Sprint 1 vẫn giữ nguyên hành vi rollback toàn file.

## Card 2.2 — Profiles & Quota

- Menu **Hồ sơ cá nhân** theo vai trò đang sử dụng. Admin/Đào tạo/Khoa cần chuyển sang vai trò cá nhân tương ứng nếu có.
- Sinh viên: GPA 0–4, kỹ năng dạng tags, lĩnh vực quan tâm, Portfolio URL HTTP/HTTPS; tải CV PDF tối đa 5 MB, xem trong hộp thoại hoặc tải file. CV không public và chỉ chủ tài khoản truy cập ở API hiện tại.
- Giảng viên: học vị, chuyên môn, hướng nghiên cứu; cấu hình số sinh viên/số đề tài tối đa cho từng đợt trong phạm vi. Không hạ số SV tối đa xuống dưới số đã được phân công.
- Mentor: công ty, lĩnh vực, địa chỉ, email/điện thoại liên hệ, vị trí công tác và chuyên môn hướng dẫn.
- Không cho tự đổi khoa/ngành/bộ môn qua cập nhật hồ sơ. Với tài khoản cũ chưa có hồ sơ hoặc phạm vi, Admin phải gán ngành/bộ môn phù hợp; không tự đoán ngành của người dùng.
- GPA là dữ liệu người dùng tự khai theo card. Không dùng GPA tự khai làm căn cứ tự động cấp điều kiện; danh sách do Khoa/Đào tạo xác minh quyết định quyền đăng ký.
- CV cũ và bản thông tin công ty trước khi sửa được giữ để tránh xóa dữ liệu lịch sử có liên kết. Cần chính sách lưu giữ/dọn file khi vận hành lâu dài.

## Card 2.3 — Campaign & Eligibility

- Tạo đợt theo học kỳ, khoa/ngành, hệ đào tạo; sửa quy tắc, loại và trạng thái; đọc theo data scope; xóa đợt nháp chưa có dữ liệu liên quan.
- Admin/Đào tạo có quyền toàn hệ thống. Khoa quản lý đợt trong phạm vi được cấp. Khoa/ngành/học kỳ của đợt đã tạo được giữ cố định để bảo toàn phạm vi dữ liệu liên quan.
- Quy tắc: 1–50 SV/đề tài, 1–5 nguyện vọng, bật/tắt sinh viên tự đề xuất. Hệ đào tạo trống nghĩa là không giới hạn.
- Import điều kiện Excel: student_code, status, reason. Trạng thái: ELIGIBLE, INELIGIBLE, DROPPED_OUT, DEFERRED. Có kết quả từng dòng, kiểm tra đúng sinh viên/khoa/ngành/hệ đào tạo.
- Sinh viên đủ điều kiện đăng ký tham gia đợt qua API và nút trên giao diện; đăng ký lặp không tạo dữ liệu trùng. Thu hồi điều kiện khóa tương tác mới, không tự xóa lịch sử đăng ký.
- API Sprint 2 là **đăng ký tham gia đợt**. Đăng ký đề tài/nguyện vọng cụ thể, phân công hướng dẫn, ghép nhóm thuộc module tiếp theo; phải dùng lại gateState và kiểm tra hạn mức/quy tắc trong transaction phân công. Sprint 2 chưa tạo những nghiệp vụ đó.

## Card 2.4 — Timeline Gatekeeper

- Cấu hình 11 giai đoạn có sẵn trong DB, mỗi giai đoạn một mốc/đợt; thời điểm bắt đầu/kết thúc, tiêu đề và khóa thủ công.
- API kiểm tra đồng hồ server mỗi yêu cầu, cho phép tại start_at, chặn tại end_at. Không phụ thuộc cron hoặc đồng hồ máy sinh viên.
- Giao diện cập nhật điều kiện nút mỗi 15 giây; API chặn ngay tại hạn, kể cả nút trên trang cũ chưa cập nhật.
- Admin/Đào tạo/Khoa đúng phạm vi cấp gia hạn riêng sau hạn chung, bắt buộc lý do; có danh sách và nút thu hồi. Giảng viên/sinh viên không tự cấp ngoại lệ.
- Ngoại lệ không vượt qua khóa thủ công, đóng/nháp đợt, chưa tới giờ bắt đầu hoặc điều kiện tham gia không hợp lệ.
- Đợt phải ở OPEN/IN_PROGRESS/DEFENSE mới cho thao tác phù hợp; đợt nháp không mở chỉ vì đã cấu hình ngày.

## API chính

- GET /api/v1/admin/bulk/{students,lecturers,mentors}/template
- POST /api/v1/admin/bulk/{students,lecturers,mentors} (multipart field file)
- GET/PUT /api/v1/profiles/me
- GET/POST /api/v1/profiles/me/cv
- GET /api/v1/profiles/me/quotas
- PUT /api/v1/profiles/me/quotas/:campaignId
- GET/POST /api/v1/master-data/campaigns
- PATCH/DELETE /api/v1/master-data/campaigns/:id
- GET /api/v1/campaigns/eligibility-template
- GET/POST /api/v1/campaigns/:id/eligibility
- GET/PUT /api/v1/campaigns/:id/timeline
- POST /api/v1/campaigns/:id/overrides
- DELETE /api/v1/campaigns/:id/overrides/:overrideId
- GET /api/v1/campaigns/:id/gate?phase=WISH_REGISTRATION
- POST /api/v1/campaigns/:id/enroll

## Quy trình dùng

1. Chạy npm.cmd run migrate --prefix backend, sau đó npm.cmd run dev ở gốc dự án.
2. Admin vào Nhập dữ liệu Excel, tải mẫu đúng loại, điền và import. Danh mục ngành/bộ môn cần có trước.
3. Sinh viên/Giảng viên/Mentor đăng nhập, vào Hồ sơ cá nhân để bổ sung thông tin.
4. Admin/Đào tạo/Khoa vào Đợt, thêm đợt và sửa cấu hình; import danh sách đủ điều kiện.
5. Thiết lập mốc Đăng ký tham gia / nguyện vọng; chuyển đợt sang Mở đăng ký.
6. Giảng viên vào Hồ sơ cá nhân lưu hạn mức của đợt. Sinh viên kiểm tra Đợt và đăng ký khi được phép.
7. Khoa cấp/thu hồi gia hạn riêng khi cần, có lý do và audit log.

## Kiểm thử và giới hạn

- TypeScript build và cú pháp JavaScript đạt; VS Code không báo lỗi tại lần kiểm tra.
- 6 unit test xác thực, 128 kiểm tra tích hợp Sprint 1, 52 kiểm tra bổ sung Sprint 1: đạt.
- npm.cmd run test:sprint2: 93 kiểm tra PostgreSQL + HTTP đạt; nhập từng loại hồ sơ, lỗi từng dòng, SMTP giả lập, CV, quota, scope, thu hồi điều kiện, trước/sau hạn, khóa thủ công, gia hạn và đăng ký lặp.
- UI nhập Excel và quản lý đợt không tràn ngang ở 390px/1440px; hồ sơ sinh viên hiển thị dữ liệu, hộp thoại CV mở bằng blob URL. Chưa nghiệm thu render CV thật trên tất cả trình duyệt; có nút tải PDF dự phòng. Tab kiểm thử tích hợp từng bị crash khi xem fixture PDF tối giản.
- SMTP chỉ kiểm tra bằng máy chủ cục bộ mô phỏng; chưa nghiệm thu email thật. Chưa triển khai Staging/Docker.

## Thay đổi DB

Migration 004_sprint2.sql: training_system cho campaigns, unique index giai đoạn/đợt, bảng campaign_enrollments và index tra điều kiện. Tận dụng student_profiles, lecturer_profiles, mentor_profiles, companies, lecturer_quotas, campaign_milestones, campaign_eligible_students và timeline_overrides có sẵn.
