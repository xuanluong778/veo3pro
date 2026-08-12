# Luật chung khi code bằng AI/Cursor

1. Chỉ sửa đúng phần được yêu cầu, không tự ý sửa lan sang phần khác.
2. Trước khi sửa, hãy đọc code liên quan và xác định chính xác file cần chỉnh.
3. Không refactor toàn bộ app nếu không có yêu cầu rõ ràng.
4. Không đổi cấu trúc thư mục, tên biến, tên API hoặc database nếu không cần thiết.
5. Không làm thay đổi giao diện tổng thể, theme, màu sắc và layout hiện tại.
6. Khi sửa UI, phải giữ responsive tốt trên desktop, tablet và mobile.
7. Không xóa code cũ đang hoạt động nếu chưa chắc chắn không còn dùng.
8. Không thay đổi logic backend/API cũ làm hỏng frontend hiện tại.
9. Không sửa database, migration, schema nếu chưa được yêu cầu rõ ràng.
10. Tuyệt đối không xóa bảng, xóa dữ liệu, reset database hoặc chạy lệnh nguy hiểm.
11. Không hard-code API key, token, mật khẩu hoặc thông tin bí mật vào code.
12. Không log hoặc hiển thị API key, token, cookie, mật khẩu thật trên UI/console.
13. Nếu thêm tính năng mới, phải giữ nguyên các tính năng cũ đang chạy tốt.
14. Sau khi sửa, phải kiểm tra lỗi console, lỗi build, lỗi API và layout.
15. Nếu sửa backend, phải đảm bảo auth, phân quyền và dữ liệu theo từng user vẫn đúng.
16. Nếu có rủi ro ảnh hưởng UI, API, database hoặc credit, phải báo trước khi sửa.
17. Mọi thay đổi phải nhỏ gọn, dễ rollback, không làm phức tạp hệ thống.
18. Sau khi hoàn thành, báo rõ đã sửa file nào, sửa gì và cách kiểm tra.
19. Không tự deploy, restart server hoặc chạy lệnh production nếu chưa được yêu cầu.
20. **Nguyên tắc cuối cùng:** sửa đúng việc, giữ hệ thống ổn định, không phá phần đang chạy.
