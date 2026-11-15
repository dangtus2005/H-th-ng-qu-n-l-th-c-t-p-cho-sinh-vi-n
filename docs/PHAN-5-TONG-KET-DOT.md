# Tổng kết đợt và nghiệm thu

Sau migration 010, Khoa mở **Tổng kết đợt** để xem số nhóm đã/chưa có phân công, kết quả ghép đang chờ xác nhận, số hồ sơ thực tập đã duyệt và tiến độ nộp báo cáo. Thống kê đếm **bản mới nhất theo nhóm hoặc hồ sơ và mốc**, nên nộp lại không làm tăng số nhóm đã nộp.

1. Chọn đợt và nhập trọng số cho các thành phần cần tính. Tổng trọng số là 100%. Bỏ trống hoặc dùng 0 cho phần không tính. Ví dụ đợt thực tập có 40% mentor và 60% giảng viên.
2. Kiểm tra điểm dự kiến cùng nguồn điểm. Đồ án dùng điểm của sinh viên trên **bản nộp mới nhất** của mỗi mốc được chọn. Thực tập dùng điểm phiếu của từng vai trò. Đợt kết hợp tính một điểm chung với các thành phần được chọn. Điểm thiếu được đánh dấu và chặn công bố. Sinh viên bảo lưu, thôi hoặc không đủ điều kiện không được đưa vào chỉ vì có lịch sử tham gia. Nếu đã có phân công hoặc hồ sơ đã duyệt, người đó vẫn được kiểm tra để tránh bỏ sót hồ sơ đang xử lý.
3. Bấm **Công bố điểm**. Hệ thống lưu bản đối chiếu gồm điểm từng phần, trọng số và phiên bản nếu có. Sinh viên nhận thông báo trong web và chỉ xem điểm của mình. Công bố cũng khóa việc chấm và sửa đầu vào bằng các luồng thông thường.
4. Sinh viên gửi phúc khảo khi đợt đang mở. Khoa có thể từ chối hoặc nhập điểm cuối đã điều chỉnh, kèm lý do. Điểm thành phần ban đầu và lịch sử điều chỉnh được giữ để đối chiếu.
5. Giải quyết hết phúc khảo rồi **Chốt đợt và khóa điểm**. Sinh viên vẫn xem được kết quả và lịch sử. Khoa tải bảng điểm hoặc tiến độ CSV bằng nút tương ứng, mở được trong Excel.

**Lịch sử thao tác** trong trang tổng kết hiển thị thao tác ghép, chấm và kết quả theo đợt. **Thông báo** lưu sự kiện công bố ghép, công bố điểm và xử lý phúc khảo.

## Sao lưu và phục hồi

- Dùng `npm.cmd run db:backup --prefix backend` để sao lưu PostgreSQL. Bản sao chứa dữ liệu người dùng. Giữ ở nơi riêng và tránh đưa vào Git.
- Các PDF báo cáo và minh chứng mới lưu trong PostgreSQL. CV và biểu mẫu cũ có thể nằm trong `backend/uploads`. Sao lưu thư mục này cùng database để khôi phục đủ file cũ.
- Thử phục hồi trên database trống trước. Xem mục **Xuất và khôi phục database** trong README. Sau khi phục hồi, kiểm tra số bản ghi, tải một báo cáo và kiểm tra quyền xem bằng tài khoản phù hợp.
