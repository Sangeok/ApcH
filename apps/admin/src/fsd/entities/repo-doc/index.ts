// api segment(서버 쿼리)는 재수출하지 않는다 — 소비자는 `~/fsd/entities/repo-doc/api`로 임포트한다
// (agent-report/index.ts 패턴). doc-location은 임포트 없는 순수 파일로 유지한다.
export {
  locationFromSlug,
  isWhitelistedDocPath,
  planDocHref,
  reportDocHref,
  docLinksForItem,
  type DocKind,
  type DocLink,
  type DocLocation,
} from "./model/doc-location";
export { renderMarkdown, escapeHtml, renderInline } from "./model/markdown";
export { docContentUrl, plansDirUrl, docSourceUrl } from "./config/github";
