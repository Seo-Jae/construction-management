const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.36';
const ROOT = process.cwd();
const PAGE = path.join(ROOT, 'src', 'page', 'UnitPriceAnalysis.jsx');
const UTIL_DST = path.join(ROOT, 'src', 'utils', 'technicalImageSheetEditor.js');
const UTIL_SRC = path.join(__dirname, 'files', 'src', 'utils', 'technicalImageSheetEditor.js');
const SQL_DST = path.join(ROOT, 'supabase', 'v52.48.5.36_unit_price_annotation_accessories.sql');
const SQL_SRC = path.join(__dirname, 'files', 'supabase', 'v52.48.5.36_unit_price_annotation_accessories.sql');
const ACCESSORY_BLOCK = Buffer.from('ICAvLyB2NTIuNDguNS4zNiDsg4HshLgg67aA7IaN7J6Q7J6s64qUIOqzte2GtSDrnbzsnbTruIzrn6zrpqzsl5Ag7ZWcIOuyiOunjCDsoIDsnqXtlZjqs6AKICAvLyDqsIEg7KeA7Iuc7ISgL+2VmOuLqCDrqoXsua0oYW5ub3RhdGlvbl9pZCnrs4TroZwg7Jew6rKw7ZWp64uI64ukLgogIGNvbnN0IGxvYWRUZWNobmljYWxBY2Nlc3NvcmllcyA9IHVzZUNhbGxiYWNrKGFzeW5jIChpbWFnZUtleSkgPT4gewogICAgY29uc3Qgbm9ybWFsaXplZEtleSA9IFN0cmluZyhpbWFnZUtleSB8fCAnJykudHJpbSgpOwogICAgaWYgKCFub3JtYWxpemVkS2V5KSB7CiAgICAgIHNldFRlY2huaWNhbEFjY2Vzc29yaWVzKFtdKTsKICAgICAgc2V0VGVjaG5pY2FsQW5ub3RhdGlvbkFjY2Vzc29yeUxpbmtzKFtdKTsKICAgICAgcmV0dXJuIFtdOwogICAgfQoKICAgIHRyeSB7CiAgICAgIGNvbnN0IFtsaWJyYXJ5UmVzdWx0LCBsaW5rc1Jlc3VsdF0gPSBhd2FpdCBQcm9taXNlLmFsbChbCiAgICAgICAgc3VwYWJhc2UKICAgICAgICAgIC5mcm9tKCd1bml0X3ByaWNlX3RlY2huaWNhbF9hY2Nlc3NvcnlfbGlicmFyeScpCiAgICAgICAgICAuc2VsZWN0KCdpZCwgbmFtZSwgaW1hZ2VfdXJsLCBzdG9yYWdlX3BhdGgsIGNyZWF0ZWRfYXQsIHVwZGF0ZWRfYXQnKQogICAgICAgICAgLmVxKCdpc19hY3RpdmUnLCB0cnVlKQogICAgICAgICAgLm9yZGVyKCduYW1lJyksCiAgICAgICAgc3VwYWJhc2UKICAgICAgICAgIC5mcm9tKCd1bml0X3ByaWNlX3RlY2huaWNhbF9hbm5vdGF0aW9uX2FjY2Vzc29yaWVzJykKICAgICAgICAgIC5zZWxlY3QoJ2Fubm90YXRpb25faWQsIGFjY2Vzc29yeV9pZCwgc29ydF9vcmRlcicpCiAgICAgICAgICAuZXEoJ2ltYWdlX2tleScsIG5vcm1hbGl6ZWRLZXkpCiAgICAgICAgICAub3JkZXIoJ2Fubm90YXRpb25faWQnKQogICAgICAgICAgLm9yZGVyKCdzb3J0X29yZGVyJyksCiAgICAgIF0pOwoKICAgICAgaWYgKGxpYnJhcnlSZXN1bHQuZXJyb3IpIHRocm93IGxpYnJhcnlSZXN1bHQuZXJyb3I7CiAgICAgIGlmIChsaW5rc1Jlc3VsdC5lcnJvcikgdGhyb3cgbGlua3NSZXN1bHQuZXJyb3I7CgogICAgICBjb25zdCBsaWJyYXJ5ID0gbGlicmFyeVJlc3VsdC5kYXRhIHx8IFtdOwogICAgICBjb25zdCBsaW5rcyA9IGxpbmtzUmVzdWx0LmRhdGEgfHwgW107CgogICAgICBzZXRUZWNobmljYWxBY2Nlc3NvcmllcyhsaWJyYXJ5KTsKICAgICAgc2V0VGVjaG5pY2FsQW5ub3RhdGlvbkFjY2Vzc29yeUxpbmtzKGxpbmtzKTsKICAgICAgcmV0dXJuIGxpYnJhcnk7CiAgICB9IGNhdGNoIChlcnJvcikgewogICAgICBjb25zdCBtZXNzYWdlID0gU3RyaW5nKGVycm9yPy5tZXNzYWdlIHx8ICcnKTsKICAgICAgaWYgKAogICAgICAgIGVycm9yPy5jb2RlID09PSAnNDJQMDEnCiAgICAgICAgfHwgL3VuaXRfcHJpY2VfdGVjaG5pY2FsXyhhY2Nlc3Nvcnl8YW5ub3RhdGlvbl9hY2Nlc3NvcmllcykvaS50ZXN0KG1lc3NhZ2UpCiAgICAgICkgewogICAgICAgIGNvbnNvbGUud2Fybign7IOB7IS4IOu2gOyGjeyekOyerCBEQuqwgCDslYTsp4Eg7KSA67mE65CY7KeAIOyViuyVmOyKteuLiOuLpDonLCBlcnJvcik7CiAgICAgICAgc2V0VGVjaG5pY2FsQWNjZXNzb3JpZXMoW10pOwogICAgICAgIHNldFRlY2huaWNhbEFubm90YXRpb25BY2Nlc3NvcnlMaW5rcyhbXSk7CiAgICAgICAgcmV0dXJuIFtdOwogICAgICB9CgogICAgICBjb25zb2xlLmVycm9yKCfsg4HshLgg67aA7IaN7J6Q7J6sIOyhsO2ajCDsi6TtjKg6JywgZXJyb3IpOwogICAgICBzZXRUZWNobmljYWxBY2Nlc3NvcmllcyhbXSk7CiAgICAgIHNldFRlY2huaWNhbEFubm90YXRpb25BY2Nlc3NvcnlMaW5rcyhbXSk7CiAgICAgIHJldHVybiBbXTsKICAgIH0KICB9LCBbXSk7CgogIHVzZUVmZmVjdCgoKSA9PiB7CiAgICBjb25zdCBpbWFnZUtleSA9IFN0cmluZyhzZWxlY3RlZFNwZWM/LmltYWdlX2tleSB8fCAnJykudHJpbSgpOwogICAgaWYgKCFpbWFnZUtleSkgewogICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgcmVhY3QtaG9va3Mvc2V0LXN0YXRlLWluLWVmZmVjdAogICAgICBzZXRUZWNobmljYWxBY2Nlc3NvcmllcyhbXSk7CiAgICAgIHNldFRlY2huaWNhbEFubm90YXRpb25BY2Nlc3NvcnlMaW5rcyhbXSk7CiAgICAgIHJldHVybjsKICAgIH0KICAgIGxvYWRUZWNobmljYWxBY2Nlc3NvcmllcyhpbWFnZUtleSk7CiAgfSwgW2xvYWRUZWNobmljYWxBY2Nlc3Nvcmllcywgc2VsZWN0ZWRTcGVjPy5pbWFnZV9rZXldKTsKCiAgY29uc3Qgdmlld2VyVGVjaG5pY2FsQWNjZXNzb3JpZXMgPSB1c2VNZW1vKCgpID0+IHsKICAgIGNvbnN0IGJ5SWQgPSBuZXcgTWFwKAogICAgICB0ZWNobmljYWxBY2Nlc3Nvcmllcy5tYXAoKGl0ZW0pID0+IFtpdGVtLmlkLCBpdGVtXSksCiAgICApOwoKICAgIHJldHVybiB0ZWNobmljYWxBbm5vdGF0aW9uQWNjZXNzb3J5TGlua3MKICAgICAgLm1hcCgobGluaywgaW5kZXgpID0+IHsKICAgICAgICBjb25zdCBhY2Nlc3NvcnkgPSBieUlkLmdldChsaW5rLmFjY2Vzc29yeV9pZCk7CiAgICAgICAgaWYgKCFhY2Nlc3NvcnkpIHJldHVybiBudWxsOwoKICAgICAgICByZXR1cm4gewogICAgICAgICAgLi4uYWNjZXNzb3J5LAogICAgICAgICAgYW5ub3RhdGlvbl9pZDogbGluay5hbm5vdGF0aW9uX2lkLAogICAgICAgICAgc29ydF9vcmRlcjogbGluay5zb3J0X29yZGVyID8/IGluZGV4LAogICAgICAgIH07CiAgICAgIH0pCiAgICAgIC5maWx0ZXIoQm9vbGVhbik7CiAgfSwgW3RlY2huaWNhbEFjY2Vzc29yaWVzLCB0ZWNobmljYWxBbm5vdGF0aW9uQWNjZXNzb3J5TGlua3NdKTsKCiAgY29uc3QgdXBzZXJ0VGVjaG5pY2FsQWNjZXNzb3J5RnJvbUVkaXRvciA9IHVzZUNhbGxiYWNrKGFzeW5jICh7CiAgICBmaWxlLAogICAgbmFtZSwKICAgIGFjY2Vzc29yeSwKICB9KSA9PiB7CiAgICBpZiAoIWNhbk1hbmFnZVRlY2huaWNhbEltYWdlcykgewogICAgICB0aHJvdyBuZXcgRXJyb3IoJ+q4sOyIoOyekOujjCDsnbTrr7jsp4Drpbwg7Y647KeR7ZWgIOq2jO2VnOydtCDsl4bsirXri4jri6QuJyk7CiAgICB9CgogICAgY29uc3Qgbm9ybWFsaXplZE5hbWUgPSBTdHJpbmcobmFtZSB8fCBhY2Nlc3Nvcnk/Lm5hbWUgfHwgJycpLnRyaW0oKTsKICAgIGlmICghbm9ybWFsaXplZE5hbWUpIHsKICAgICAgdGhyb3cgbmV3IEVycm9yKCfrtoDsho3snpDsnqzrqoXsnYQg7J6F66Cl7ZW07KO87IS47JqULicpOwogICAgfQogICAgaWYgKCFmaWxlKSB7CiAgICAgIHRocm93IG5ldyBFcnJvcign7JeF66Gc65Oc7ZWgIOu2gOyGjeyekOyerCDsnbTrr7jsp4Drpbwg7ISg7YOd7ZW07KO87IS47JqULicpOwogICAgfQogICAgaWYgKCFVTklUX1BSSUNFX1RFQ0hOSUNBTF9JTUFHRV9UWVBFUy5oYXMoZmlsZS50eXBlKSkgewogICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BORywgSlBHKEpQRUcpLCBXRUJQIOydtOuvuOyngOunjCDsl4XroZzrk5ztlaAg7IiYIOyeiOyKteuLiOuLpC4nKTsKICAgIH0KICAgIGlmIChmaWxlLnNpemUgPiBVTklUX1BSSUNFX1RFQ0hOSUNBTF9JTUFHRV9NQVhfQllURVMpIHsKICAgICAgdGhyb3cgbmV3IEVycm9yKCfrtoDsho3snpDsnqwg7J2066+47KeA64qUIDEwTUIg7J207ZWY66eMIOyXheuhnOuTnO2VoCDsiJgg7J6I7Iq164uI64ukLicpOwogICAgfQoKICAgIGNvbnN0IGFjY2Vzc29yeUlkID0gU3RyaW5nKGFjY2Vzc29yeT8uaWQgfHwgJycpLnRyaW0oKQogICAgICB8fCBjcmVhdGVUZWNobmljYWxBY2Nlc3NvcnlJZCgpOwogICAgY29uc3Qgc3RvcmFnZVBhdGggPSBTdHJpbmcoCiAgICAgIGFjY2Vzc29yeT8uc3RvcmFnZVBhdGgKICAgICAgfHwgYWNjZXNzb3J5Py5zdG9yYWdlX3BhdGgKICAgICAgfHwgJycsCiAgICApLnRyaW0oKSB8fCBnZXRUZWNobmljYWxBY2Nlc3NvcnlTdG9yYWdlUGF0aChhY2Nlc3NvcnlJZCk7CgogICAgc2V0VGVjaG5pY2FsQWNjZXNzb3J5QnVzeSh0cnVlKTsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZXJyb3I6IHVwbG9hZEVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZS5zdG9yYWdlCiAgICAgICAgLmZyb20oVU5JVF9QUklDRV9URUNITklDQUxfSU1BR0VfQlVDS0VUKQogICAgICAgIC51cGxvYWQoc3RvcmFnZVBhdGgsIGZpbGUsIHsKICAgICAgICAgIHVwc2VydDogdHJ1ZSwKICAgICAgICAgIGNvbnRlbnRUeXBlOiBmaWxlLnR5cGUsCiAgICAgICAgICBjYWNoZUNvbnRyb2w6ICczNjAwJywKICAgICAgICB9KTsKICAgICAgaWYgKHVwbG9hZEVycm9yKSB0aHJvdyB1cGxvYWRFcnJvcjsKCiAgICAgIGNvbnN0IHsgZGF0YTogcHVibGljVXJsRGF0YSB9ID0gc3VwYWJhc2Uuc3RvcmFnZQogICAgICAgIC5mcm9tKFVOSVRfUFJJQ0VfVEVDSE5JQ0FMX0lNQUdFX0JVQ0tFVCkKICAgICAgICAuZ2V0UHVibGljVXJsKHN0b3JhZ2VQYXRoKTsKICAgICAgY29uc3QgcHVibGljVXJsID0gU3RyaW5nKHB1YmxpY1VybERhdGE/LnB1YmxpY1VybCB8fCAnJykudHJpbSgpOwogICAgICBpZiAoIXB1YmxpY1VybCkgewogICAgICAgIHRocm93IG5ldyBFcnJvcign7JeF66Gc65Oc65CcIOu2gOyGjeyekOyerCDsnbTrr7jsp4AgVVJM7J2EIOunjOuTpOyngCDrqrvtlojsirXri4jri6QuJyk7CiAgICAgIH0KCiAgICAgIGNvbnN0IHZlcnNpb25lZFVybCA9IGAke3B1YmxpY1VybH0/dj0ke0RhdGUubm93KCl9YDsKICAgICAgY29uc3QgeyBlcnJvcjogc2F2ZUVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZS5ycGMoCiAgICAgICAgJ3NhdmVfdW5pdF9wcmljZV90ZWNobmljYWxfYWNjZXNzb3J5JywKICAgICAgICB7CiAgICAgICAgICBwX2FjY2Vzc29yeV9pZDogYWNjZXNzb3J5SWQsCiAgICAgICAgICBwX25hbWU6IG5vcm1hbGl6ZWROYW1lLAogICAgICAgICAgcF9pbWFnZV91cmw6IHZlcnNpb25lZFVybCwKICAgICAgICAgIHBfc3RvcmFnZV9wYXRoOiBzdG9yYWdlUGF0aCwKICAgICAgICB9LAogICAgICApOwogICAgICBpZiAoc2F2ZUVycm9yKSB0aHJvdyBzYXZlRXJyb3I7CgogICAgICBjb25zdCBzYXZlZEFjY2Vzc29yeSA9IHsKICAgICAgICBpZDogYWNjZXNzb3J5SWQsCiAgICAgICAgbmFtZTogbm9ybWFsaXplZE5hbWUsCiAgICAgICAgaW1hZ2VfdXJsOiB2ZXJzaW9uZWRVcmwsCiAgICAgICAgc3RvcmFnZV9wYXRoOiBzdG9yYWdlUGF0aCwKICAgICAgfTsKCiAgICAgIHNldFRlY2huaWNhbEFjY2Vzc29yaWVzKChwcmV2aW91cykgPT4gewogICAgICAgIGNvbnN0IHdpdGhvdXRDdXJyZW50ID0gcHJldmlvdXMuZmlsdGVyKAogICAgICAgICAgKGl0ZW0pID0+IGl0ZW0uaWQgIT09IGFjY2Vzc29yeUlkLAogICAgICAgICk7CiAgICAgICAgcmV0dXJuIFsuLi53aXRob3V0Q3VycmVudCwgc2F2ZWRBY2Nlc3NvcnldLnNvcnQoCiAgICAgICAgICAoZmlyc3QsIHNlY29uZCkgPT4gU3RyaW5nKGZpcnN0Lm5hbWUgfHwgJycpLmxvY2FsZUNvbXBhcmUoCiAgICAgICAgICAgIFN0cmluZyhzZWNvbmQubmFtZSB8fCAnJyksCiAgICAgICAgICAgICdrbycsCiAgICAgICAgICApLAogICAgICAgICk7CiAgICAgIH0pOwoKICAgICAgcmV0dXJuIHNhdmVkQWNjZXNzb3J5OwogICAgfSBmaW5hbGx5IHsKICAgICAgc2V0VGVjaG5pY2FsQWNjZXNzb3J5QnVzeShmYWxzZSk7CiAgICB9CiAgfSwgW2Nhbk1hbmFnZVRlY2huaWNhbEltYWdlc10pOwoKICBjb25zdCBkZWxldGVUZWNobmljYWxBY2Nlc3NvcnlGcm9tRWRpdG9yID0gdXNlQ2FsbGJhY2soYXN5bmMgKGFjY2Vzc29yeSkgPT4gewogICAgaWYgKCFjYW5NYW5hZ2VUZWNobmljYWxJbWFnZXMpIHsKICAgICAgdGhyb3cgbmV3IEVycm9yKCfquLDsiKDsnpDro4wg7J2066+47KeA66W8IO2OuOynke2VoCDqtoztlZzsnbQg7JeG7Iq164uI64ukLicpOwogICAgfQoKICAgIGNvbnN0IGFjY2Vzc29yeUlkID0gU3RyaW5nKGFjY2Vzc29yeT8uaWQgfHwgJycpLnRyaW0oKTsKICAgIGlmICghYWNjZXNzb3J5SWQpIHsKICAgICAgdGhyb3cgbmV3IEVycm9yKCfsgq3soJztlaAg67aA7IaN7J6Q7J6sIOygleuztOqwgCDsl4bsirXri4jri6QuJyk7CiAgICB9CgogICAgc2V0VGVjaG5pY2FsQWNjZXNzb3J5QnVzeSh0cnVlKTsKICAgIHRyeSB7CiAgICAgIGNvbnN0IHsgZGF0YTogc3RvcmFnZVBhdGgsIGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZS5ycGMoCiAgICAgICAgJ2RlbGV0ZV91bml0X3ByaWNlX3RlY2huaWNhbF9hY2Nlc3NvcnknLAogICAgICAgIHsgcF9hY2Nlc3NvcnlfaWQ6IGFjY2Vzc29yeUlkIH0sCiAgICAgICk7CiAgICAgIGlmIChlcnJvcikgdGhyb3cgZXJyb3I7CgogICAgICBpZiAoc3RvcmFnZVBhdGgpIHsKICAgICAgICBjb25zdCB7IGVycm9yOiBzdG9yYWdlRXJyb3IgfSA9IGF3YWl0IHN1cGFiYXNlLnN0b3JhZ2UKICAgICAgICAgIC5mcm9tKFVOSVRfUFJJQ0VfVEVDSE5JQ0FMX0lNQUdFX0JVQ0tFVCkKICAgICAgICAgIC5yZW1vdmUoW3N0b3JhZ2VQYXRoXSk7CiAgICAgICAgaWYgKHN0b3JhZ2VFcnJvcikgewogICAgICAgICAgY29uc29sZS53YXJuKCfrtoDsho3snpDsnqwgU3RvcmFnZSDtjIzsnbwg7IKt7KCcIOqyveqzoDonLCBzdG9yYWdlRXJyb3IpOwogICAgICAgIH0KICAgICAgfQoKICAgICAgc2V0VGVjaG5pY2FsQWNjZXNzb3JpZXMoKHByZXZpb3VzKSA9PiBwcmV2aW91cy5maWx0ZXIoCiAgICAgICAgKGl0ZW0pID0+IGl0ZW0uaWQgIT09IGFjY2Vzc29yeUlkLAogICAgICApKTsKICAgICAgc2V0VGVjaG5pY2FsQW5ub3RhdGlvbkFjY2Vzc29yeUxpbmtzKChwcmV2aW91cykgPT4gcHJldmlvdXMuZmlsdGVyKAogICAgICAgIChsaW5rKSA9PiBsaW5rLmFjY2Vzc29yeV9pZCAhPT0gYWNjZXNzb3J5SWQsCiAgICAgICkpOwogICAgfSBmaW5hbGx5IHsKICAgICAgc2V0VGVjaG5pY2FsQWNjZXNzb3J5QnVzeShmYWxzZSk7CiAgICB9CiAgfSwgW2Nhbk1hbmFnZVRlY2huaWNhbEltYWdlc10pOwoK', 'base64').toString('utf8');

function stop(message) {
  console.error(`[적용 중단] ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(PAGE) || !fs.existsSync(UTIL_DST)) {
  stop('현재 프로젝트의 UnitPriceAnalysis.jsx 또는 technicalImageSheetEditor.js를 찾지 못했습니다.');
  return;
}
if (!fs.existsSync(UTIL_SRC) || !fs.existsSync(SQL_SRC)) {
  stop('교체 패키지 내부 파일을 찾지 못했습니다. ZIP을 다시 풀어주세요.');
  return;
}

let source = fs.readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');
const currentUtil = fs.readFileSync(UTIL_DST, 'utf8');

if (source.includes('v52.48.5.36 상세 부속자재')) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  return;
}
if (!source.includes('v52.48.5.35 상세 부속자재는 공통 라이브러리에 1회 업로드 후')) {
  stop('UnitPriceAnalysis.jsx가 v52.48.5.35 기준과 다릅니다. 기존 변경 보호를 위해 적용하지 않았습니다.');
  return;
}
if (!currentUtil.includes('상세 부속자재') || !currentUtil.includes('accessory-panel')) {
  stop('technicalImageSheetEditor.js가 v52.48.5.35 기준과 다릅니다. 기존 변경 보호를 위해 적용하지 않았습니다.');
  return;
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(ROOT, `backup_${VERSION}_${stamp}`);
fs.mkdirSync(path.join(backupRoot, 'src', 'page'), { recursive: true });
fs.mkdirSync(path.join(backupRoot, 'src', 'utils'), { recursive: true });
fs.copyFileSync(PAGE, path.join(backupRoot, 'src', 'page', 'UnitPriceAnalysis.jsx'));
fs.copyFileSync(UTIL_DST, path.join(backupRoot, 'src', 'utils', 'technicalImageSheetEditor.js'));

function replaceOnce(find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) throw new Error(`${label} 기준 코드를 찾지 못했습니다.`);
  if (source.indexOf(find, index + find.length) >= 0) {
    throw new Error(`${label} 기준 코드가 2개 이상 발견되었습니다.`);
  }
  source = source.slice(0, index) + replacement + source.slice(index + find.length);
}

try {
  // 1) v35 state를 v36 명칭별 연결 state로 교체
  const stateStart = source.indexOf('  const technicalAccessoryImageInputRef = useRef(null);');
  const stateEnd = source.indexOf('\n\n\n  const showToast', stateStart);
  if (stateStart < 0 || stateEnd < 0) {
    throw new Error('상세 부속자재 state 기준 코드를 찾지 못했습니다.');
  }

  source = source.slice(0, stateStart)
    + `  const [technicalAccessories, setTechnicalAccessories] = useState([]);\n`
    + `  const [technicalAnnotationAccessoryLinks, setTechnicalAnnotationAccessoryLinks] = useState([]);\n`
    + `  const [technicalAccessoryBusy, setTechnicalAccessoryBusy] = useState(false);`
    + source.slice(stateEnd);

  // 2) v35 image_key 전체 연결 로직을 v36 annotation별 연결 로직으로 교체
  const accessoryBlockStart = source.indexOf(
    '  // v52.48.5.35 상세 부속자재는 공통 라이브러리에 1회 업로드 후',
  );
  const accessoryBlockEnd = source.indexOf(
    '  // v52.48.5.29 기술자료 이미지는 기존 image_key 그룹 단위로 관리합니다.',
    accessoryBlockStart,
  );
  if (accessoryBlockStart < 0 || accessoryBlockEnd < 0) {
    throw new Error('v35 상세 부속자재 로직 기준 코드를 찾지 못했습니다.');
  }

  source = source.slice(0, accessoryBlockStart)
    + ACCESSORY_BLOCK
    + source.slice(accessoryBlockEnd);

  // 3) VIEW에는 명칭별 연결된 상세 부속자재 데이터를 전달
  replaceOnce(
`      annotations: technicalAnnotations,
      layout: technicalSheetLayout,
      accessories: linkedTechnicalAccessories,
    });`,
`      annotations: technicalAnnotations,
      layout: technicalSheetLayout,
      accessories: viewerTechnicalAccessories,
    });`,
    'VIEW 부속자재 전달',
  );

  replaceOnce(
`    technicalAnnotations,
    technicalSheetLayout,
    linkedTechnicalAccessories,
  ]);`,
`    technicalAnnotations,
    technicalSheetLayout,
    viewerTechnicalAccessories,
  ]);`,
    'VIEW dependency',
  );

  // 4) 지시선 편집기 안으로 공통 라이브러리/명칭별 연결 관리 기능 통합
  replaceOnce(
`    const result = await openTechnicalSheetEditorWindow({
      imageUrl,
      title: imageTitle,
      annotations: technicalAnnotations,
      layout: technicalSheetLayout,
    });`,
`    const result = await openTechnicalSheetEditorWindow({
      imageUrl,
      title: imageTitle,
      annotations: technicalAnnotations,
      layout: technicalSheetLayout,
      accessories: technicalAccessories,
      accessoryLinks: technicalAnnotationAccessoryLinks,
      onAccessoryUpload: upsertTechnicalAccessoryFromEditor,
      onAccessoryDelete: deleteTechnicalAccessoryFromEditor,
    });`,
    '지시선 편집기 부속자재 관리 전달',
  );

  replaceOnce(
`    const nextAnnotations = normalizeTechnicalAnnotations(result.annotations);
    const nextLayout = normalizeTechnicalSheetLayout(result.layout);
    setTechnicalAnnotationBusy(true);
    try {
      const { error } = await supabase.rpc('save_unit_price_technical_sheet', {
        p_image_key: imageKey,
        p_annotations: nextAnnotations,
        p_layout_settings: nextLayout,
      });
      if (error) throw error;
      setTechnicalAnnotations(nextAnnotations);
      setTechnicalSheetLayout(nextLayout);`,
`    const nextAnnotations = normalizeTechnicalAnnotations(result.annotations);
    const nextLayout = normalizeTechnicalSheetLayout(result.layout);
    const nextAccessoryLinks = (result.accessoryLinks || []).map((link, index) => ({
      annotation_id: String(link.annotationId || link.annotation_id || '').trim(),
      accessory_id: String(link.accessoryId || link.accessory_id || '').trim(),
      sort_order: Number.isFinite(Number(link.sortOrder ?? link.sort_order))
        ? Number(link.sortOrder ?? link.sort_order)
        : index,
    })).filter((link) => link.annotation_id && link.accessory_id);

    setTechnicalAnnotationBusy(true);
    try {
      const { error } = await supabase.rpc('save_unit_price_technical_sheet_v36', {
        p_image_key: imageKey,
        p_annotations: nextAnnotations,
        p_layout_settings: nextLayout,
        p_accessory_links: nextAccessoryLinks,
      });
      if (error) throw error;
      setTechnicalAnnotations(nextAnnotations);
      setTechnicalSheetLayout(nextLayout);
      setTechnicalAnnotationAccessoryLinks(nextAccessoryLinks);`,
    '기술자료 v36 저장',
  );

  source = source.replace(
    "message.includes('save_unit_price_technical_sheet')",
    "message.includes('save_unit_price_technical_sheet_v36')",
  );
  source = source.replace(
    "'v52.48.5.34 Supabase SQL을 먼저 실행해주세요.'",
    "'v52.48.5.36 Supabase SQL을 먼저 실행해주세요.'",
  );

  replaceOnce(
`    showToast,
    technicalAnnotations,
    technicalSheetLayout,
  ]);`,
`    showToast,
    technicalAnnotations,
    technicalSheetLayout,
    technicalAccessories,
    technicalAnnotationAccessoryLinks,
    upsertTechnicalAccessoryFromEditor,
    deleteTechnicalAccessoryFromEditor,
  ]);`,
    '지시선 편집기 dependency',
  );

  // 5) 일위대가 본 화면의 "부속" Chip + "부속자재 관리" 버튼 제거
  const chipBlock = `                      {linkedTechnicalAccessories.length > 0 && (
                        <Chip
                          size="small"
                          label={\`부속 \${linkedTechnicalAccessories.length}\`}
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.58rem', bgcolor: '#ffffff' }}
                        />
                      )}
`;
  if (!source.includes(chipBlock)) {
    throw new Error('본 화면 부속 Chip 기준 코드를 찾지 못했습니다.');
  }
  source = source.replace(chipBlock, '');

  const buttonBlock = `                      {canManageTechnicalImages && selectedSpec?.image_key && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<ImageOutlinedIcon />}
                          disabled={technicalAccessoryBusy}
                          onClick={() => setTechnicalAccessoryDialogOpen(true)}
                          sx={{ minHeight: 24, py: 0.1, px: 0.75, fontSize: '0.6rem' }}
                        >
                          부속자재 관리
                        </Button>
                      )}
`;
  if (!source.includes(buttonBlock)) {
    throw new Error('본 화면 부속자재 관리 버튼 기준 코드를 찾지 못했습니다.');
  }
  source = source.replace(buttonBlock, '');

  // 6) 본 화면의 별도 부속자재 Dialog 제거
  const dialogStart = source.indexOf(
    `      <Dialog\n        open={technicalAccessoryDialogOpen}`,
  );
  const snackbarStart = source.indexOf(
    `      <Snackbar open={toast.open}`,
    dialogStart,
  );
  if (dialogStart < 0 || snackbarStart < 0) {
    throw new Error('본 화면 부속자재 관리 Dialog 기준 코드를 찾지 못했습니다.');
  }
  source = source.slice(0, dialogStart) + source.slice(snackbarStart);

  fs.writeFileSync(PAGE, source, 'utf8');
  fs.copyFileSync(UTIL_SRC, UTIL_DST);
  fs.mkdirSync(path.dirname(SQL_DST), { recursive: true });
  fs.copyFileSync(SQL_SRC, SQL_DST);

  console.log(`[${VERSION}] 적용 완료`);
  console.log('- 본 화면의 부속자재 관리 버튼/부속 Chip 제거');
  console.log('- 지시선 편집기 내부에 공통 부속자재 업로드/교체/삭제/명칭별 연결 통합');
  console.log('- VIEW: 명칭 클릭 시 해당 부속자재만 우측 표시');
  console.log('- VIEW: 상세 부속자재 옆 전체보기 버튼 추가');
  console.log('- VIEW 우측 이미지는 썸네일이 아니라 업로드 원본 전체 비율로 표시');
  console.log('- VIEW 기본 새창 크기: 약 1125 x 1021 (화면 크기에 따라 자동 축소)');
  console.log('- 등록 항목 목록은 남는 높이를 계속 사용하고 부족할 때만 스크롤');
  console.log(`- SQL 생성: ${path.relative(ROOT, SQL_DST)}`);
  console.log(`- 백업: ${path.relative(ROOT, backupRoot)}`);
} catch (error) {
  console.error(`[적용 중단] ${error.message}`);
  console.error('기존 변경 보호를 위해 예상 코드가 다르면 더 이상 진행하지 않습니다.');
  process.exitCode = 1;
}
