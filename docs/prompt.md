tôi đang muốn làm 1 desktop app bằng electron (chủ yếu cho linux, sẽ mở rộng cho windows, macos sau) tên là ScreenArc -  một screen recorder + edit studio như là Screen Studio. các tính năng:
- ghi màn hình chất lượng cao (up to 2k): cho phép select custom area, window hoặc full screen
- tự động theo dấu con trỏ chuột và auto zoom (phóng to con trỏ chuột và vùng click)
- khả năng edit mạnh mẽ: có thể chia làm các nhóm edit như sau:
  - a) frame của video gốc được đặt trong 1 frame cha. có thể điều chỉnh frame cha này để: thay đổi aspect ratio (16:9, 9:16, 4:3, 3:4, 1:1), thay đổi hình nền (của frame cha), thay đổi padding (space giữa frame video gốc và frame cha), thay đổi bán kính bo góc/đổ bóng/kiểu border của frame video gốc, khả năng tùy chỉnh 
  - b) chỉnh sửa video gồm có: tùy chỉnh auto zoom, cắt đoạn video (sẽ nói chi tiết hơn ở sau)
- xuất video: output type (mp4, gif), fps, resolution (hd, 1080p, 2k), quality

các tính năng nâng cao (sẽ phát triển sau, ưu tiên phát triển core features trước):
- ghi hình webcam và hiển thị ở góc (tùy chọn góc)
- ghi âm và hiển thị transcript
- video annotation (chú thích, làm mờ, etc)
- tích hợp AI?

mô tả sơ lược user flow theo như ý kiến của tôi (tiếp thu từ ScreenStudio)
- người dùng mở app
- hiển thị 1 thanh bar với dãy các nút chia thành các group: group 1 gồm các icon button: select area, window, full screen. group 2 gồm nút record và 2 nút để toggle ghi âm, ghi hình
- người dùng chọn chế độ, setting rồi bấm record
- thanh bar ẩn đi, hiện icon trên tray rồi hiển thị màn hình đếm ngược
- bắt đầu record, theo dõi vị trí con trỏ chuột và vị trí click
- người dùng bấm vào icon ở tray và dừng ghi
- mở edit studio lên
- người dùng có thể chỉnh sửa video tùy ý (background image/color/uploaded image/gradient, padding, border radius hoặc cut đoạn video/thêm sửa xóa zoom)
- bấm xuất video
- xuất video và kết thúc

sơ lược về giao diện edit:
- title bar: từ trái sang gồm có traffic lights -> ScreenArc -> Nút export
- vùng chính gồm bên trái là một vùng lớn hiển thị preview và bên dưới là tool bar, bên phải là side panel (background, padding, roundeness, etc). toolbar gồm có 1 thanh bar điều khiển (dropdown chọn aspect ratio, 3 nút prev, play/pause, next, nút thêm cut track, nút thêm zoom track, slider để phóng to/thu nhỏ tracks)
- vùng chỉnh sửa video, tracks gồm có timeline, original video track, và track thứ hai để hiển thị các đoạn (rounded rectangle) cho zoom và cut

**TÍNH NĂNG MOUSE TRACKING + AUTO ZOOM (tính năng cốt lõi, cực kỳ quan trọng)**:
khi người dùng click vào một vị trí (giả sử click 1 button) thì cần tự động zoom vào vị trí đó. giả sử gọi thời điểm click là x, độ zoom là Z, ta có thể chia làm 3 giai đoạn: 1) bắt đầu zoom từ thời điểm x - T tới x (zoom từ 1x tới Zx), 2) giai đoạn tracking mouse, frame vẫn được zoom và di chuyển theo chuyển động của chuột 3) zoom out ngược lại với bước 1.
lưu ý:
- cần có easing (cho phép user tùy chọn) để có hiệu ứng mượt mà
- các hành động này áp dụng với frame cha (sau khi đã áp dụng các dán frame video gốc lên kèm hình nền, bo góc, padding, aspect ratio, etc)

**TÍNH NĂNG CHỈNH SỬA ZOOM và cut**
- mỗi auto zoom sẽ tạo 1 dải rounded rectangle (với duration mặc định) ở track thứ hai (dưới original video track)
- người dùng có thể thêm, sửa, xóa zoom thủ công. khi bấm nút thêm zoom thì thêm 1 zoom vào vị trí hiện tại của time marker với các setting mặc định, đồng thời thay side panel thành screen hiển thị settings của zoom.
- người dùng cũng có thể thêm, sửa, xóa các đoạn cut (để đánh dấu sẽ cut các đoạn đó) tương tự
- các đoạn zoom và cut này hỗ trợ kéo trượt theo trục ngang của track, có thể kéo 2 đầu để thay đổi duration
- lưu ý nếu bấm nút phóng to/thu nhỏ track trên toolbar thì cần phóng to thu nhỏ timeline, và 2 track cho phù hợp.

ok. giúp tôi viết các tài liệu sau bằng tiếng Anh:
- high-level-goals.md: mô tả yêu cầu ở mức tổng quan
- tech-stacks.md: electron + typescript + tailwindcss + vite + zustand + WebRTC + MediaRecorder API để ghi màn hình + fluent-ffmpeg (thư viện để xử lý video? hoặc nếu không cần thiết thì bạn có thể khuyên tôi), pynput (thư viện python để theo dõi vị trí con trỏ chuột, tôi không thấy thư viện cho nodejs nào đáng tin cậy và còn được maintain), etc
- plan.md: kế hoạch phát triển từng giai đoạn
- user-flow.md: chi tiết các luồng hoạt động của người dùng (user action, ui phản ứng như nào, state thay đổi như nào, background chạy task gì, etc)