/** The one corner of jsdom the tests use; avoids a `@types/jsdom` dependency. */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html: string);
    readonly window: { readonly document: Document };
  }
}
