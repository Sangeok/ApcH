/**
 * 업로드가 서버에 확정되기 전, 대시보드가 화면에 먼저 그리는 행의 id 규약.
 *
 * 접두사는 생산자 한 곳과 소비자 두 곳이 공유하는 계약인데 `UploadedFileSummary.id`가
 * 그냥 `string`이라 타입이 잡아주지 않는다. 리터럴을 세 파일에 흩어두면 접두사를 바꿨을 때
 * 낙관적 행이 실제 큐로 새고 "View details" 링크가 존재하지 않는 id로 활성화된다.
 */
const OPTIMISTIC_UPLOAD_ID_PREFIX = "optimistic-";

export function createOptimisticUploadId(): string {
  return `${OPTIMISTIC_UPLOAD_ID_PREFIX}${Date.now()}`;
}

export function isOptimisticUploadId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_UPLOAD_ID_PREFIX);
}
