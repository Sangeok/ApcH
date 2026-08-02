export { db } from "./client";

// 모델 타입(Clip, ClipDraft, UploadedFile 등)을 전부 내보낸다.
//
// ⚠️ `export type *`는 타입만 내보낸다. 나중에 스키마에 enum을 추가하고
// 그 값을 런타임에 쓰면 여기서 재수출되지 않아 undefined가 된다.
// 그런 사용은 `import type`으로 깨끗해 tsc가 잡지 못하므로,
// enum을 도입하는 시점에 `export { SomeEnum } from "../generated/prisma"`를
// 명시적으로 추가해야 한다.
export type * from "../generated/prisma";

// Prisma 네임스페이스는 값으로도 쓰인다
// (Prisma.PrismaClientKnownRequestError 등 2곳).
export { Prisma } from "../generated/prisma";

export * from "./analytics-contract";
