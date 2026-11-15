# Sprint 3-03 · Đăng ký nguyện vọng và ghép cặp

## Tạo đầu vào từ giao diện

Sau migration 007, có thể thực hiện luồng mà không cần tạo sẵn nhóm hoặc đề tài. Quản lý Khoa cấu hình một đợt đồ án, nhập danh sách sinh viên đủ điều kiện, mở đợt và thiết lập các mốc chọn hướng, đề xuất, duyệt và đăng ký nguyện vọng. Cần có hai sinh viên đã được xác minh ở cùng đợt để thử mời thành viên.

1. Sinh viên vào **Nhóm đồ án**, nhập tên và hướng. Trưởng nhóm mời bằng mã sinh viên. Người được mời vào cùng đợt và xác nhận. Hướng và số thành viên được chốt khi nhóm có nguyện vọng hoặc phân công.
2. Giảng viên vào **Đề tài đồ án**, nhập đề tài và có thể tải PDF tối đa 5 MB. Sinh viên tự đề xuất nếu đợt cho phép. Nếu chưa chọn giảng viên, lưu nháp. Khi chọn giảng viên, đề xuất chờ giảng viên xác nhận trước khi Bộ môn hoặc Khoa duyệt.
3. Bộ môn hoặc Khoa mở đề tài chờ duyệt. **Kiểm tra trùng** hiển thị tối đa năm tên tương tự trong bộ môn. Điểm so khớp từ trong tiêu đề có bỏ dấu tiếng Việt, dùng để rà soát. Bộ môn/Khoa có thể duyệt, yêu cầu sửa hoặc từ chối. Đề tài đã duyệt có thể tìm tại **Kho đề tài** theo năm bắt đầu, hướng và giảng viên.
4. Trưởng nhóm vào **Nguyện vọng đề tài**, gửi đề tài đã duyệt có giảng viên hướng dẫn. Ở phần **Sửa danh sách nguyện vọng**, đổi vị trí, sửa ghi chú hoặc bỏ nguyện vọng rồi lưu. Hết hạn thì hệ thống khóa sửa, kể cả yêu cầu từ tab đang mở trước đó.
5. Khi bước sang mốc ghép cặp và đã hết thời hạn đăng ký, giảng viên vào **Nguyện vọng đề tài** và lưu thứ hạng ứng viên. Hạng 1 cao nhất và mỗi hạng chỉ dùng một lần trong cùng đề tài. Bỏ trống rồi lưu để xóa hạng.

Nguồn dữ liệu gồm `student_groups` và `group_members` cho nhóm, `topics` cho đề tài đã duyệt, `campaign_milestones` và `timeline_overrides` cho thời gian đăng ký. Đề tài và nhóm được tạo từ các luồng phụ trách tương ứng. Bộ dữ liệu mẫu cung cấp đầu vào để trình diễn độc lập.

Backend xác minh tài khoản đang ở vai trò Sinh viên, là trưởng nhóm, nhóm và đề tài cùng đợt, đề tài ở trạng thái `APPROVED`, thành viên đủ điều kiện và số thành viên trong giới hạn. Hàm `gateState` của Sprint 2 kiểm tra mốc `WISH_REGISTRATION` theo giờ server và gia hạn của trưởng nhóm. Thành viên được đọc nguyện vọng và kết quả của nhóm mình.

Trưởng nhóm chọn thứ tự trong giới hạn `max_wish_choices` của đợt. Mỗi đề tài và mỗi thứ tự chỉ xuất hiện một lần trong nhóm. Gửi lại cùng đề tài, thứ tự và ghi chú trả về bản ghi cũ. Hai yêu cầu ghi đồng thời được tuần tự hóa bằng khóa đợt trong transaction và các ràng buộc duy nhất của database.

## Điều phối ghép cặp

Quản trị, Phòng Đào tạo và quản lý Khoa có quyền toàn bộ đợt vào **Điều phối ghép cặp**. Giảng viên xếp hạng ứng viên cho đề tài mình phụ trách. Hệ thống chỉ nhận lượt ghép sau khi hết mốc nguyện vọng và mọi gia hạn, đồng thời mốc ghép đang mở.

- **Chạy thử:** Chọn Gale–Shapley với nhóm hoặc đề tài đề xuất, Serial Dictatorship theo GPA, hoặc tối ưu chính xác tổng độ hài lòng. Tùy chỉnh thứ tự xét xếp hạng giảng viên, GPA trung bình nhóm, kỹ năng, thời điểm đăng ký và mã trưởng nhóm. Mã/ID cuối cùng phá đồng hạng. GPA dùng dữ liệu hồ sơ hiện có, có thể do sinh viên tự khai. Đợt cần số liệu chính thức phải xác minh GPA hoặc bỏ tiêu chí GPA khi dùng Gale–Shapley.
- **Ràng buộc:** Mỗi đề tài nhận một nhóm, số thành viên xác nhận vừa sức chứa của đề tài và đợt. Giảng viên cần có hạn mức sinh viên và đề tài. Thuật toán chỉ dùng nguyện vọng hợp lệ. Quản lý có thể ghép tay ngoài nguyện vọng khi đáp ứng ràng buộc. Cặp khóa được giữ lại khi chạy lại.
- **So sánh:** Mỗi bản nháp lưu cấu hình, đầu vào, số nhóm chưa ghép và lý do, số/tỷ lệ trúng từng ưu tiên. Chỉ số cặp bất ổn ở Gale–Shapley đếm những cặp có thể đổi trực tiếp trong giới hạn còn lại, giữ nguyên cặp khóa. Với hạn mức giảng viên dùng chung giữa nhiều đề tài, đây là chỉ số chẩn đoán thực tế, không phải chứng nhận ổn định theo mô hình Gale–Shapley cổ điển. Tối ưu chính xác cộng độ hài lòng hai phía theo ưu tiên của nhóm và thứ hạng đề tài; hỗ trợ tối đa 25 nhóm và giới hạn số nhánh tìm kiếm.
- **Công bố và xác nhận:** Quản lý công bố bản nháp mới nhất và đặt hạn xác nhận. Thành viên thấy kết quả sau công bố. Chỉ trưởng nhóm xác nhận hoặc từ chối. Khi xác nhận, hệ thống tạo phân công chính thức và cập nhật hạn mức trong cùng giao dịch.
- **Vòng bổ sung:** Sau khi vòng trước đã được phản hồi hoặc quản lý chốt kết quả quá hạn, chạy thử tiếp để mở vòng mới cho nhóm và đề tài còn lại. Cặp đã xác nhận được giữ nguyên. Các cặp nhóm–đề tài đã bị từ chối hoặc hết hạn không được lặp lại.
- **Đề tài tự đề xuất:** Nếu sinh viên đã lưu nháp mà chưa chọn giảng viên, quản lý Bộ môn/Khoa có thể phân công từ màn hình **Đề tài đồ án** trong mốc duyệt. Đề tài tiếp tục qua bước giảng viên xác nhận và Bộ môn/Khoa duyệt.

| Phương thức | Đường dẫn dưới `/api/v1/campaigns/:id` | Nội dung                                                                                                             |
| ----------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| GET         | `/wish-groups`                         | Nhóm của sinh viên trong đợt                                                                                         |
| GET         | `/wish-groups/:groupId`                | Đề tài đã duyệt, trạng thái đăng ký, nguyện vọng và phân công của nhóm                                               |
| POST        | `/wish-groups/:groupId/registrations`  | `topic_id`, `priority_order` (số nguyên), `student_note` (tùy chọn). HTTP 201 khi tạo, 200 khi gửi lại đúng nội dung |
| GET         | `/lecturer-wishes`                     | Nguyện vọng vào các đề tài của giảng viên                                                                            |
| PUT         | `/lecturer-wishes/:registrationId/rank`| Xếp hạng ứng viên cho đề tài giảng viên hướng dẫn |
| GET, POST   | `/matching-runs`                      | Lịch sử, bản nháp mới nhất và chạy thử |
| GET         | `/matching-runs/:runId`               | Đầu vào, cấu hình và kết quả của lần chạy |
| POST        | `/matching-runs/:runId/adjust`        | Chỉnh tay, bỏ cặp, khóa, bỏ khóa |
| POST        | `/matching-runs/:runId/publish`       | Công bố và đặt hạn xác nhận |
| PATCH       | `/matching-offers/:offerId`           | Trưởng nhóm xác nhận hoặc từ chối |
| POST        | `/matching-offers/expire`             | Chốt các lời mời quá hạn |
| PUT         | `/topics/:topicId/adviser`             | Phân công hướng dẫn cho đề tài tự đề xuất chưa có giảng viên |

## Demo trên máy cá nhân

1. Tại thư mục gốc, chạy `npm.cmd run migrate --prefix backend`, `node backend/scripts/seed-demo.cjs` rồi `npm.cmd run dev`. Chạy lại script nếu đã tạo dữ liệu mẫu để bổ sung mốc ghép cặp. Sao lưu CSDL trước khi chạy migration trên dữ liệu đang sử dụng.
2. Đăng nhập `demo.sv1@example.invalid` với mật khẩu mẫu `Demo@123456`. Vào **Nguyện vọng đề tài**, chọn **Đợt đồ án đang mở (mẫu)**, chọn đề tài và gửi ưu tiên 1. Gửi đề tài thứ hai ở ưu tiên 2 để thấy cách hệ thống xử lý nguyện vọng còn lại.
3. Đăng nhập `demo.khoa1@example.invalid` với cùng mật khẩu mẫu. Trong **Đợt**, kết thúc mốc **Đăng ký nguyện vọng**, thu hồi gia hạn đang hiệu lực và đặt mốc **Ghép cặp đề tài** bao gồm thời điểm hiện tại. Vào **Điều phối ghép cặp**, chọn đợt mẫu và **Chạy thử**. Có thể khóa cặp rồi chọn thuật toán khác để so sánh.
4. Chọn hạn xác nhận và **Công bố kết quả**. Tải lại màn hình sinh viên. Tại **Kết quả của nhóm**, trưởng nhóm bấm **Xác nhận đề tài**. Kiểm tra phân công chính thức gồm đề tài và giảng viên hướng dẫn.

Nếu đợt mẫu đã hết thời gian do được tạo từ trước, vào **Đợt** và cập nhật mốc **Đăng ký nguyện vọng** trước bước 2. Giữ đợt ở trạng thái **Mở đăng ký** khi trình diễn.

## Quy tắc dữ liệu và điều kiện tham gia

- Mỗi sinh viên chỉ được xác nhận vào một nhóm trong một đợt. Lời mời mới ở trạng thái chờ. Trưởng nhóm luôn là thành viên đã xác nhận. Migration giữ các thành viên hiện có ở trạng thái đã xác nhận và báo lỗi nếu dữ liệu cũ có sinh viên thuộc nhiều nhóm trong cùng đợt.
- Một đề tài nhận một nhóm. Số thành viên đã xác nhận không vượt giới hạn nhỏ hơn giữa cấu hình đợt và đề tài. Đề tài sinh viên tự đề xuất có thể chờ người hướng dẫn. Nguyện vọng gửi được khi đề tài đã duyệt và có người hướng dẫn.
- Mốc **Đăng ký tham gia đợt**, **Chọn hướng đề tài**, **Đăng ký nguyện vọng** và **Ghép cặp đề tài** có cấu hình riêng. Đợt cũ chưa khai báo mốc tham gia tiếp tục dùng mốc nguyện vọng cho đăng ký tham gia. Ghép cặp chỉ mở khi hết hạn nguyện vọng, kể cả gia hạn đang lưu, và đang trong mốc ghép.
- Trong **Đợt → Sửa cấu hình**, Khoa có thể bật ngưỡng tín chỉ bằng cách điền số tín chỉ tối thiểu và mô tả điều kiện tiên quyết. Khi nhập danh sách, Khoa điền `verified_credits` từ số liệu chính thức và `prerequisite_met=YES` sau khi xác minh đạt yêu cầu. Hồ sơ cũ vẫn được giữ. Nếu áp dụng tiêu chí mới, danh sách đánh dấu dòng cần xác minh lại và hệ thống chặn đăng ký cho tới khi có dữ liệu phù hợp.
