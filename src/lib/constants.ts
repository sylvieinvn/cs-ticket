/** [value, label, pill class] */
export type Option = readonly [value: string, label: string, cls?: string];

export const STATUSES: Option[] = [
  ["new", "Mới", "s-new"],
  ["open", "Đang xử lý", "s-open"],
  ["wait_cus", "Chờ khách", "s-wait"],
  ["wait_sup", "Chờ supplier/carrier", "s-wait"],
  ["resolved", "Đã giải quyết", "s-done"],
  ["closed", "Đã đóng", "s-closed"],
];

export const TYPES: string[] = [
  "Chưa nhận hàng",
  "Giao chậm",
  "Tracking không cập nhật",
  "Hàng hỏng / lỗi",
  "Sai hàng / thiếu hàng",
  "Yêu cầu hoàn tiền",
  "Huỷ đơn",
  "Đổi địa chỉ",
  "Hỏi thông tin",
  "Khác",
];

export const SHIP: Option[] = [
  ["", "Chưa kiểm tra", "s-closed"],
  ["not_found", "Not found", "s-closed"],
  ["info", "Info received", "s-info"],
  ["transit", "In transit", "s-info"],
  ["pickup", "Pick up", "s-wait"],
  ["out", "Out for delivery", "s-info"],
  ["delivered", "Delivered", "s-done"],
  ["undelivered", "Undelivered", "s-bad"],
  ["alert", "Alert", "s-bad"],
  ["expired", "Expired", "s-bad"],
];

export const DISPUTE: Option[] = [
  ["none", "Không", "s-closed"],
  ["inquiry", "Inquiry", "s-wait"],
  ["open", "Đang tranh chấp", "s-bad"],
  ["won", "Thắng", "s-done"],
  ["lost", "Thua", "s-bad"],
];

export const RESOLUTIONS: string[] = [
  "",
  "Hướng dẫn / giải thích",
  "Gửi lại hàng (reship)",
  "Đổi hàng",
  "Hoàn tiền một phần",
  "Hoàn tiền toàn bộ",
  "Huỷ đơn",
  "Khách tự rút yêu cầu",
  "Không xử lý được",
];

export const PRIORITY: Option[] = [
  ["low", "Thấp"],
  ["normal", "Bình thường"],
  ["high", "Cao"],
  ["urgent", "Khẩn"],
];

/** Ticket tags (a ticket can have several). */
export const TAGS: Option[] = [
  ["attention", "Needs attention", "s-open"],
  ["urgent", "Urgent", "s-bad"],
  ["vip", "VIP", "s-wait"],
];

export const CHANNELS: Option[] = [
  ["email", "Email"],
  ["inbox", "Shopify Inbox"],
  ["other", "Khác"],
];

export const SENT: Option[] = [
  ["", "Chưa rõ", "s-closed"],
  ["positive", "Hài lòng", "s-done"],
  ["neutral", "Trung lập", "s-info"],
  ["frustrated", "Bực bội", "s-open"],
  ["angry", "Rất tức giận", "s-bad"],
  ["chargeback", "Doạ chargeback", "s-bad"],
];

export const WAITING: Option[] = [
  ["", "—"],
  ["customer", "Chờ khách"],
  ["cs", "Chờ CS"],
  ["supplier", "Chờ supplier/carrier"],
  ["none", "Không chờ ai"],
];

export const QA: Option[] = [
  ["q1", "Phản hồi đúng hạn"],
  ["q2", "Thông tin chính xác"],
  ["q3", "Giọng điệu chuyên nghiệp, đồng cảm"],
  ["q4", "Giải quyết triệt để vấn đề"],
  ["q5", "Ghi chú & cập nhật trạng thái đầy đủ"],
];

/** Look up an option by value; falls back to the first entry. */
export function lab(arr: readonly Option[], k: string | undefined | null): Option {
  return arr.find((x) => x[0] === (k ?? "")) ?? arr[0];
}

export const label = (arr: readonly Option[], k: string | undefined | null) => lab(arr, k)[1];
export const pillClass = (arr: readonly Option[], k: string | undefined | null) => lab(arr, k)[2] ?? "";
