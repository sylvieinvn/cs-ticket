/* Lookup tables: statuses, types, shipping, disputes… */
/* ---------- constants ---------- */
const STATUSES=[["new","Mới","s-new"],["open","Đang xử lý","s-open"],["wait_cus","Chờ khách","s-wait"],["wait_sup","Chờ supplier/carrier","s-wait"],["resolved","Đã giải quyết","s-done"],["closed","Đã đóng","s-closed"]];
const TYPES=["Chưa nhận hàng","Giao chậm","Tracking không cập nhật","Hàng hỏng / lỗi","Sai hàng / thiếu hàng","Yêu cầu hoàn tiền","Huỷ đơn","Đổi địa chỉ","Hỏi thông tin","Khác"];
const SHIP=[["","Chưa kiểm tra","s-closed"],["not_found","Not found","s-closed"],["info","Info received","s-info"],["transit","In transit","s-info"],["pickup","Pick up","s-wait"],["out","Out for delivery","s-info"],["delivered","Delivered","s-done"],["undelivered","Undelivered","s-bad"],["alert","Alert","s-bad"],["expired","Expired","s-bad"]];
const DISPUTE=[["none","Không","s-closed"],["inquiry","Inquiry","s-wait"],["open","Đang tranh chấp","s-bad"],["won","Thắng","s-done"],["lost","Thua","s-bad"]];
const RESOLUTIONS=["","Hướng dẫn / giải thích","Gửi lại hàng (reship)","Đổi hàng","Hoàn tiền một phần","Hoàn tiền toàn bộ","Huỷ đơn","Khách tự rút yêu cầu","Không xử lý được"];
const PRIORITY=[["low","Thấp"],["normal","Bình thường"],["high","Cao"],["urgent","Khẩn"]];
const CHANNELS=[["email","Email"],["inbox","Shopify Inbox"],["other","Khác"]];
const SENT=[["","Chưa rõ","s-closed"],["positive","Hài lòng","s-done"],["neutral","Trung lập","s-info"],["frustrated","Bực bội","s-open"],["angry","Rất tức giận","s-bad"],["chargeback","Doạ chargeback","s-bad"]];
const WAITING=[["","—"],["customer","Chờ khách"],["cs","Chờ CS"],["supplier","Chờ supplier/carrier"],["none","Không chờ ai"]];
const QA=[["q1","Phản hồi đúng hạn"],["q2","Thông tin chính xác"],["q3","Giọng điệu chuyên nghiệp, đồng cảm"],["q4","Giải quyết triệt để vấn đề"],["q5","Ghi chú & cập nhật trạng thái đầy đủ"]];
const lab=(arr,k)=>(arr.find(x=>x[0]===k)||arr[0]);
