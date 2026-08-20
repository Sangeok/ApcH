// 순수 상수. pipeline/config/github.ts와 owner/repo/branch가 같아야 한다(같은 저장소·브랜치).
const GITHUB_OWNER = "Sangeok";
const GITHUB_REPO = "ApcH";
const DOC_BRANCH = "dev";

/** raw CDN: 파일 내용은 준다. 디렉터리는 404(agent-report와 같은 실측). 토큰 불필요(public). */
export function docContentUrl(path: string): string {
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${DOC_BRANCH}/${path}`;
}
/** 계획서 실재 판별용 목록. contents API(디렉터리는 raw로 불가). */
export function plansDirUrl(): string {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/docs/plans?ref=${DOC_BRANCH}`;
}
/** 렌더 한계의 탈출구(백로그 요구 5). blob 뷰. */
export function docSourceUrl(path: string): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${DOC_BRANCH}/${path}`;
}
