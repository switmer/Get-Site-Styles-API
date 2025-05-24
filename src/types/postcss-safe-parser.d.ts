declare module 'postcss-safe-parser' {
  import { Root } from 'postcss';
  const safeParser: (css: string) => Root;
  export default safeParser;
} 