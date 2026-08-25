# 발표용 PC 작업자 페이지

작업자 페이지는 별도의 모바일 전용 서버가 아니라
현재 운영 사이트의 동일한 Worker route를 사용합니다.

코드 기준 route:
```text
/?view=attendance-worker
```

즉 현재 운영 도메인이:
```text
https://wooklim-construction-management.vercel.app
```
인 경우 발표용 전체 주소는:
```text
https://wooklim-construction-management.vercel.app/?view=attendance-worker
```

PC Chrome에서도:
- 로그인
- 처음 이용 → 가입 신청
- 테스트계정 가입
- 승인 후 로그인
- 공지 확인
- 출결현황 확인
- QR 촬영 버튼
을 동일하게 시연할 수 있습니다.

주의:
운영 도메인이 별도 Custom Domain으로 변경된 경우에는
그 도메인 뒤에 `/?view=attendance-worker`만 붙이면 됩니다.
