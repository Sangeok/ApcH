// 순수 상수. 토큰만 비밀이고 좌표는 비밀이 아니다(저장소 public).
export const GITHUB_OWNER = "Sangeok";
export const GITHUB_REPO = "ApcH";
export const BOARD_BRANCH = "dev"; // 작업 상태의 진실은 dev 브랜치 보드다
export const PIPELINE_ISSUE_NUMBER = 87;

export const BOARD_RAW_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${BOARD_BRANCH}/PROJECT_BOARD.md`;
export const ISSUE_COMMENTS_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${PIPELINE_ISSUE_NUMBER}/comments`;
