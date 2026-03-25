# CloudFront CDN 설정 가이드

> 작성일: 2026-03-26
> 기반 문서: `vercel-project-setup-guide.md`
> 프로젝트: AI Podcast Clipper Frontend (Next.js 15 / T3 Stack)

---

## 개요

본 문서는 S3에 저장된 클립 파일을 CloudFront CDN을 통해 배포하기 위한 설정 가이드이다. `vercel-project-setup-guide.md`의 Phase A~D 작업이 완료된 이후에 적용한다.

> 이 작업은 **선택 사항**이다. S3 presigned URL로도 서비스 운영이 가능하며, 사용자 규모가 커지면 CDN을 도입한다.

### 전제 조건

- Vercel 배포가 완료된 상태 (vercel-project-setup-guide.md Phase A~D-1 완료)
- 도메인(`podcastclipper.com`) 설정 완료
- AWS S3 버킷이 운영 중인 상태

---

## 1. CloudFront 배포 생성

1. AWS Console > **CloudFront** > **Create Distribution**
2. 설정:

| 항목 | 값 | 비고 |
|------|-----|------|
| Origin Domain | `{S3_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com` | S3 버킷 |
| Origin Access | **OAC (Origin Access Control)** 생성 | OAI 대신 최신 방식 사용 |
| Viewer Protocol Policy | Redirect HTTP to HTTPS | |
| Allowed HTTP Methods | GET, HEAD | 읽기 전용 |
| Cache Policy | CachingOptimized | 클립 파일은 불변이므로 장기 캐싱 |
| Price Class | PriceClass_200 | 아시아 포함 |
| Alternate Domain | `cdn.podcastclipper.com` | |

---

## 2. S3 버킷 정책 업데이트

CloudFront OAC 설정 후 S3 버킷 정책을 업데이트:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::YOUR_ACCOUNT_ID:distribution/YOUR_DISTRIBUTION_ID"
        }
      }
    }
  ]
}
```

---

## 3. CloudFront Key Pair 생성

Signed URL을 위한 키 페어를 생성한다:

1. AWS Console > **CloudFront** > **Public keys**
2. **"Create public key"** 클릭
3. 로컬에서 RSA 키 페어 생성:
   ```bash
   openssl genrsa -out private_key.pem 2048
   openssl rsa -pubout -in private_key.pem -out public_key.pem
   ```
4. `public_key.pem` 내용을 복사하여 AWS에 등록
5. **Key Groups** > **"Create key group"** > 방금 생성한 Public Key를 추가
6. CloudFront Distribution > **Behaviors** > Default > **Restrict viewer access**: Yes, Key Group 선택

---

## 4. 환경 변수 등록

Private Key를 base64 인코딩하여 환경 변수에 저장:

```bash
# PEM 키를 base64 인코딩
cat private_key.pem | base64 -w 0
# 출력된 값을 CLOUDFRONT_PRIVATE_KEY에 저장
```

Vercel **Production** 환경 변수에 추가:
- `CLOUDFRONT_DOMAIN` = `cdn.podcastclipper.com`
- `CLOUDFRONT_KEY_PAIR_ID` = AWS에서 생성한 Key Pair ID
- `CLOUDFRONT_PRIVATE_KEY` = base64 인코딩된 PEM 키

---

## 5. CDN 도메인 SSL 인증서

1. AWS Console > **ACM (Certificate Manager)** (반드시 **us-east-1** 리전)
2. **"Request certificate"** > Public certificate
3. Domain name: `cdn.podcastclipper.com`
4. DNS 검증 선택 > 안내된 CNAME 레코드를 도메인 등록업체에서 설정
5. 인증서 발급 완료 후 CloudFront Distribution에서 해당 인증서 선택

---

## 6. CDN 도메인 DNS 설정

도메인 등록업체에서:

| 타입 | 이름 | 값 |
|------|------|-----|
| CNAME | `cdn` | `{distribution-id}.cloudfront.net` |

---

## 7. 코드 변경

CloudFront 유틸리티 파일 생성과 기존 코드 수정이 필요하다.

### 7-1. `src/env.js` 환경 변수 스키마 추가

**파일**: `src/env.js` (기존 파일 수정)

**추가할 server 변수** (`server: {` 블록 내):

```typescript
// CloudFront CDN (선택)
CLOUDFRONT_DOMAIN: z.string().optional(),
CLOUDFRONT_KEY_PAIR_ID: z.string().optional(),
CLOUDFRONT_PRIVATE_KEY: z.string().optional(),
```

**추가할 runtimeEnv 매핑** (`runtimeEnv: {` 블록 내):

```typescript
CLOUDFRONT_DOMAIN: process.env.CLOUDFRONT_DOMAIN,
CLOUDFRONT_KEY_PAIR_ID: process.env.CLOUDFRONT_KEY_PAIR_ID,
CLOUDFRONT_PRIVATE_KEY: process.env.CLOUDFRONT_PRIVATE_KEY,
```

**주의**: 모든 변수는 `optional()`로 설정한다. CloudFront 미설정 시에도 빌드가 가능해야 한다.

### 7-2. `.env.example` 업데이트

**파일**: `.env.example` (기존 파일에 추가)

```bash
# CloudFront CDN (선택, PEM 키는 base64 인코딩)
CLOUDFRONT_DOMAIN=""
CLOUDFRONT_KEY_PAIR_ID=""
CLOUDFRONT_PRIVATE_KEY=""
```

### 7-3. `src/fsd/shared/lib/cloudfront.ts` 생성 (신규)

```typescript
import { env } from "~/env";

/**
 * CloudFront Signed URL을 생성한다.
 * 환경 변수가 설정되지 않은 경우 null을 반환하여 S3 fallback을 유도한다.
 */
export async function getCloudFrontSignedUrl(
  s3Key: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const domain = env.CLOUDFRONT_DOMAIN;
  const keyPairId = env.CLOUDFRONT_KEY_PAIR_ID;
  const privateKeyBase64 = env.CLOUDFRONT_PRIVATE_KEY;

  if (!domain || !keyPairId || !privateKeyBase64) {
    return null; // CloudFront 미설정 → S3 presigned URL로 fallback
  }

  // @aws-sdk/cloudfront-signer 사용
  const { getSignedUrl } = await import("@aws-sdk/cloudfront-signer");

  const privateKey = Buffer.from(privateKeyBase64, "base64").toString("utf-8");
  const url = `https://${domain}/${s3Key}`;
  const dateLessThan = new Date(
    Date.now() + expiresInSeconds * 1000,
  ).toISOString();

  return getSignedUrl({
    url,
    keyPairId,
    dateLessThan,
    privateKey,
  });
}
```

> **참고**: `@aws-sdk/cloudfront-signer` 패키지를 devDependencies에 추가해야 한다: `npm install @aws-sdk/cloudfront-signer`

### 7-4. `src/actions/generation.ts` 수정 (CloudFront 우선, S3 fallback 패턴)

클립 URL 생성 로직에서 CloudFront signed URL을 우선 시도하고, 실패 시 기존 S3 presigned URL로 fallback한다:

```typescript
import { getCloudFrontSignedUrl } from "~/fsd/shared/lib/cloudfront";

// 기존 getClipUrl 함수 내부에서:
const cloudFrontUrl = await getCloudFrontSignedUrl(clip.s3Key);
if (cloudFrontUrl) {
  return cloudFrontUrl;
}
// 기존 S3 presigned URL 로직 (fallback)
```

### 7-5. `next.config.js` CSP 업데이트

CSP에 CloudFront 도메인을 추가한다:

```
media-src 'self' https://*.amazonaws.com https://cdn.podcastclipper.com
img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.amazonaws.com https://cdn.podcastclipper.com
```

---

## 8. CloudFront 검증

- [ ] `https://cdn.podcastclipper.com` 접속 가능
- [ ] SSL 인증서 유효
- [ ] 클립 재생이 CloudFront URL을 통해 정상 동작
- [ ] S3 직접 접근이 차단되고 CloudFront를 통해서만 접근 가능

---

## 작업 체크리스트

- [ ] 1. CloudFront Distribution 생성 (OAC 방식)
- [ ] 2. S3 버킷 정책 업데이트
- [ ] 3. CloudFront Key Pair 생성 및 Key Group 설정
- [ ] 4. Vercel 환경 변수 등록 (CLOUDFRONT_DOMAIN, KEY_PAIR_ID, PRIVATE_KEY)
- [ ] 5. ACM SSL 인증서 발급 (us-east-1)
- [ ] 6. CDN 도메인 DNS CNAME 설정
- [ ] 7-1. `src/env.js`에 CloudFront 환경 변수 스키마 추가
- [ ] 7-2. `.env.example`에 CloudFront 변수 추가
- [ ] 7-3. `src/fsd/shared/lib/cloudfront.ts` 생성
- [ ] 7-4. `src/actions/generation.ts` CloudFront 우선 로직 적용
- [ ] 7-5. `next.config.js` CSP에 CloudFront 도메인 추가
- [ ] 8. 검증 완료

---

## 비용 참고

| 서비스 | 플랜 | 월 비용 | 비고 |
|--------|------|---------|------|
| CloudFront | Free Tier | $0 | 1TB/월 (12개월) |

Free Tier 종료 후에는 데이터 전송량에 따라 과금된다. 아시아 리전 기준 약 $0.12/GB.
