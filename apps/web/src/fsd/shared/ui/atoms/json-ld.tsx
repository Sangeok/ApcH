/**
 * JSON-LD 구조화 데이터를 `<script>`로 심는다.
 *
 * `JSON.stringify`는 `<`를 이스케이프하지 않으므로, 직렬화되는 값에
 * `</script>`가 들어가면 태그가 그 자리에서 닫히고 나머지가 마크업으로 파싱된다.
 * 지금 실려 나가는 값은 전부 1st-party 정적 설정이라 활성 XSS는 아니지만,
 * 가이드 본문처럼 자유 텍스트가 직렬화되는 라우트가 있어 방어를 한 곳에 둔다.
 * 이전에는 16개 라우트가 각자 같은 인라인 스크립트를 손으로 썼다.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\u003c"),
      }}
    />
  );
}
