# Dữ liệu mẫu Sprint 1–2

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

## Nội dung và giới hạn

- Hồ sơ SV có GPA, tín chỉ, lớp, khóa, kỹ năng, quan tâm, Portfolio và CV PDF thực tế.
- Hồ sơ GV có chuyên môn, hướng nghiên cứu, học vị và quota.
- Mentor có công ty, lĩnh vực, vị trí và thông tin liên hệ mẫu.
- Ba đợt minh họa OPEN, DRAFT và CLOSED. Sinh viên mẫu đã có lịch sử đăng ký; nút đăng ký có thể hiển thị Đã đăng ký thay vì cho đăng ký lần nữa.
- Ba học kỳ mẫu không đặt is_current để tránh thay đổi học kỳ hiện tại của dự án.
- Các trường chưa phát sinh được giữ NULL đúng nghĩa: SSO, ảnh đại diện, lần đăng nhập đầu tiên, lý do không đủ điều kiện với sinh viên ELIGIBLE, read_at khi thông báo chưa đọc. Không điền giả chỉ để mọi ô đều khác NULL.
- Không tạo phiên đăng nhập, token reset hoặc thêm mã vai trò ngoài 7 role đã thiết kế. Không tạo điểm/đề tài/nhóm cho các module ngoài Sprint 1–2 trong bộ mẫu này.
- Mật khẩu lưu bcrypt; PDF lưu trong thư mục upload và có checksum. Database kiểm tra khóa ngoại trong transaction.
