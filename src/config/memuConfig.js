// src/config/menuConfig.js
export const menuConfig = [
  {
    id: "daily", // Dashboard가 'daily'로 인식하도록 수정
    title: "공사일보 관리",
    subMenus: [
      { id: "daily", name: "공사일보 작성", path: "/daily" } 
    ]
  },
  {
    id: "progress", // Dashboard가 'progress'로 인식하도록 수정
    title: "공정진척관리",
    subMenus: [
      { id: "progress", name: "공종별 현황 입력", path: "/progress/input" },
      { id: "multi", name: "다중 공종 진척 현황", path: "/progress/multi" },
      { id: "monthly", name: "월별 완료 집계", path: "/progress/monthly" },
      { id: "weekly", name: "주별 완료 집계", path: "/progress/weekly" },
    ]
  },
  // 나중에 여기에 새로운 대분류를 추가하면 됩니다.
  // {
  //   id: "work-report",
  //   title: "공사일보관리",
  //   subMenus: [...]
  // }
];