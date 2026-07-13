// src/store/projectStore.js

import projectInfo from "../data/project";

/**
 * 프로젝트 기본정보
 */
export { projectInfo };

/**
 * 직종 목록
 * (나중에 관리자에서 추가/삭제 가능)
 */
export const JOBS = [
  "직영",
  "먹매김",
  "경량",
  "단열",
  "합지",
  "목공",
  "전기",
  "설비",
  "기타",
];

/**
 * 근로자 기본 행
 */
export const createWorkerRow = () => ({
  id: crypto.randomUUID(),

  job: "",

  name: "",

  day: 0,

  night: 0,

  note: "",
});

/**
 * 작업 기본 행
 */
export const createTaskRow = () => ({
  id: crypto.randomUUID(),

  process: "",

  location: "",

  content: "",

  note: "",
});

/**
 * 하루 데이터 기본값
 */
export const createDayData = () => ({

  workers: [],

  todayTasks: [],

  tomorrowTasks: [],

  isClosed: false,

  updatedAt: null,

});