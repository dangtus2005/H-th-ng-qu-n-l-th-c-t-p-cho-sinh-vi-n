# Dữ liệu mẫu Sprint 1–3 và báo cáo đồ án

Chạy ở thư mục gốc: `node backend/scripts/seed-demo.cjs`.

Script thêm dữ liệu có mã DEMO_, giữ nguyên dữ liệu đang có, không gửi email. Chạy lại không nhân đôi hoặc ghi đè bản ghi mẫu đã chỉnh sửa. Nếu có mã/email bị trùng với bản ghi khác, transaction rollback.

Mỗi bảng sau có 3 bản ghi mẫu mới: training_systems, faculties, departments, majors, specializations, academic_years, semesters, companies, campaigns, student_profiles, lecturer_profiles, mentor_profiles, lecturer_quotas, campaign_eligible_students, campaign_enrollments, campaign_milestones, timeline_overrides, document_templates và notifications.

users và user_roles có 12 bản ghi (3 Sinh viên + 3 Giảng viên + 3 Mentor + 3 quản lý Khoa); system_files có 6 bản ghi (3 CV + 3 biểu mẫu). Các liên kết khoa/ngành/đợt/hồ sơ tương ứng theo số 1–3.

## Đăng nhập

Mật khẩu chung của các tài khoản mẫu: `Demo@123456`.

| Nhóm         | Email                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------- |
| Sinh viên    | demo.sv1@example.invalid, demo.sv2@example.invalid, demo.sv3@example.invalid             |
| Giảng viên   | demo.gv1@example.invalid, demo.gv2@example.invalid, demo.gv3@example.invalid             |
| Mentor       | demo.mentor1@example.invalid, demo.mentor2@example.invalid, demo.mentor3@example.invalid |
| Quản lý Khoa | demo.khoa1@example.invalid, demo.khoa2@example.invalid, demo.khoa3@example.invalid       |

Email dùng miền example.invalid để tránh nhầm với người thật. Đây là dữ liệu trình diễn, không dùng tài khoản mẫu trên hệ thống công khai.

## Nhóm, đề tài và báo cáo cho tài khoản sinh viên hiện có

Chạy từ thư mục gốc: `node backend/scripts/seed-student-thesis.cjs`.

Script dùng các tài khoản đã có, không tạo tài khoản mới hay đổi mật khẩu/quyền. Cần có đợt `DEMO_S3_KTPM` đang mở và các tài khoản `SV001`, `SV_DEMO01`, `GV001`, `GV_DEMO01`, `ADMIN01` thuộc đúng phạm vi. Dữ liệu được ghi trong một transaction; chạy lại không nhân đôi hoặc đặt lại báo cáo, phản hồi, kết quả duyệt hay hạn mức đã cập nhật.

| Tài khoản sinh viên                         | Nhóm                       | Đề tài                                          | Giảng viên                     |
| ------------------------------------------- | -------------------------- | ----------------------------------------------- | ------------------------------ |
| `225101001@sv.uni.edu.vn` (`SV001`)         | Nhóm đồ án SV001 (mẫu)     | Hệ thống quản lý học tập và tiến độ đồ án (mẫu) | `GV001` — TS. Nguyễn Văn Trung |
| `sinhvien.demo@sv.uni.edu.vn` (`SV_DEMO01`) | Nhóm đồ án SV_DEMO01 (mẫu) | Ứng dụng quản lý thư viện trực tuyến (mẫu)      | `GV_DEMO01` — Giảng viên Demo  |

Mỗi sinh viên là trưởng nhóm riêng và đã được xác nhận thành viên. Mỗi nhóm có phân công đang thực hiện và ba báo cáo PDF tải được:

- Đề cương bản 1: phản hồi mẫu yêu cầu bổ sung sơ đồ dữ liệu và kế hoạch kiểm thử.
- Đề cương bản 2: phản hồi mẫu đã đạt yêu cầu.
- Báo cáo giữa kỳ lần 1, bản 1: nhận xét mẫu để tiếp tục hoàn thiện sản phẩm.

Đăng nhập bằng mật khẩu hiện tại, chọn đợt có nhãn **Học kỳ 1 (2026–2027) · Sprint 3 – Duyệt đề tài KTPM (mẫu)**:

1. **Nhóm đồ án** (`/#thesis-groups`): xem nhóm, thành viên, trưởng nhóm và hướng đề tài.
2. **Đề tài đồ án** (`/#thesis-topics`): xem đề tài ở trạng thái đã phân công.
3. **Báo cáo đồ án** (`/#thesis-reports`): chọn nhóm/đề tài, mở các phiên bản để xem nhận xét hoặc tải PDF; có thể nộp thêm phiên bản mới.

Script thêm các mốc đề cương, giữa kỳ 1/2 và cuối kỳ mở 30 ngày từ lần tạo nếu chưa có mốc tương ứng; không ghi đè mốc đã cấu hình. Mốc chọn hướng cũng được thêm nếu thiếu. Các nhóm đã phân công sẽ khóa thay đổi thành viên/hướng và không đăng ký nguyện vọng mới trong cùng đợt. Không tạo điểm giả hoặc công bố kết quả. Các phản hồi mẫu đều có tiền tố “Dữ liệu mẫu”.

## Nội dung và giới hạn

- Hồ sơ SV có GPA, tín chỉ, lớp, khóa, kỹ năng, quan tâm, Portfolio và CV PDF thực tế.
- Hồ sơ GV có chuyên môn, hướng nghiên cứu, học vị và quota.
- Mentor có công ty, lĩnh vực, vị trí và thông tin liên hệ mẫu.
- Ba đợt minh họa OPEN, DRAFT và CLOSED. Sinh viên mẫu đã có lịch sử đăng ký; nút đăng ký có thể hiển thị Đã đăng ký thay vì cho đăng ký lần nữa.
- Ba học kỳ mẫu không đặt is_current để tránh thay đổi học kỳ hiện tại của dự án.
- Các trường chưa phát sinh được giữ NULL đúng nghĩa: SSO, ảnh đại diện, lần đăng nhập đầu tiên, lý do không đủ điều kiện với sinh viên ELIGIBLE, read_at khi thông báo chưa đọc. Không điền giả chỉ để mọi ô đều khác NULL.
- Đợt đồ án đang mở có một nhóm và hai đề tài đã duyệt để chạy [kịch bản Sprint 3-03](SPRINT-3-03.md). Script không tạo sẵn nguyện vọng hoặc kết quả ghép cặp.
- Không tạo phiên đăng nhập, token reset, điểm hoặc thêm mã vai trò ngoài 7 role đã thiết kế.
- Mật khẩu lưu bcrypt; PDF lưu trong thư mục upload và có checksum. Database kiểm tra khóa ngoại trong transaction.
