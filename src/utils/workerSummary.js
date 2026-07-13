// src/utils/workerSummary.js

/**
 * 근로자 정보를 직종별로 집계하는 함수
 *
 * @param {Array} workers
 * @returns {
 *   total: number,
 *   jobs: Array<{job:string,count:number}>
 * }
 */

export function getWorkerSummary(workers = []) {

  const summary = {};

  let total = 0;

  workers.forEach(worker => {

    if (!worker.job) return;

    const count =
      Number(worker.day || 0) +
      Number(worker.night || 0);

    if (count === 0) return;

    total += count;

    summary[worker.job] =
      (summary[worker.job] || 0) + count;
  });

  return {
    total,

    jobs: Object.entries(summary)
      .map(([job, count]) => ({
        job,
        count
      }))
      .sort((a, b) => b.count - a.count)
  };
}