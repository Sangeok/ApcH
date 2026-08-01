// @prisma/nextjs-monorepo-workaround-plugin은 타입 선언을 제공하지 않는다.
// tsconfig의 checkJs가 next.config.js를 검사하므로 선언이 없으면 빌드가
// "Could not find a declaration file"로 실패한다.
//
// 이 플러그인이 필요한 이유는 next.config.js의 webpack 설정 주석에 있다.
declare module "@prisma/nextjs-monorepo-workaround-plugin" {
  import type { Compiler, WebpackPluginInstance } from "webpack";

  export class PrismaPlugin implements WebpackPluginInstance {
    apply(compiler: Compiler): void;
  }
}
