// 이 슬라이스는 클라이언트 안전 공개 표면이 없다 (model·lib·ui 세그먼트 없음).
// 서버 전용 DB 접근은 `./server`. `./api`(server-only)를 여기에 재수출하면
// 이 barrel을 임포트하는 클라이언트 모듈의 빌드가 깨진다.
export {};
